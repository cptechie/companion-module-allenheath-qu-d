import {
	InstanceBase,
	InstanceStatus,
	TCPHelper,
	type CompanionVariableValues,
	type SomeCompanionConfigField,
} from '@companion-module/base'
import { GetConfigFields, normaliseConfig, type ModuleConfig } from './config.js'
import {
	buildParamVariables,
	STRIP_COUNT,
	UpdateVariableDefinitions,
	type ParamVariable,
	type StripKey,
	type VariablesSchema,
} from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbackId, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { formatDb, formatPan, valueToDb, valueToPan } from './levels.js'
import { MidiParser, MMC_COMMANDS, NrpnDecoder, nrpnGet, toHex, type MidiMessage, type NrpnEvent } from './midi.js'
import {
	getMuteParam,
	getOutputLevelParam,
	getParamInfo,
	getSendParam,
	MUTE_CHANNELS,
	OUTPUT_CHANNELS,
	SEND_SOURCES,
	type ParamInfo,
} from './params.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

/** How many get requests to send per tick when syncing */
const GET_BATCH_SIZE = 10
const GET_TICK_MS = 10
/** Don't re-request a parameter more often than this */
const GET_RETRY_MS = 3000
/** Delay used to coalesce feedback/variable updates */
const UPDATE_DEBOUNCE_MS = 20
/** Delay before reading back a value after a relative change */
const CONFIRM_DELAY_MS = 150

const STRIP_KEY_BASE: Record<StripKey, number> = { mute: 0x00, sel: 0x20, pafl: 0x40 }

export default class QuInstance extends InstanceBase<ModuleSchema> {
	config: ModuleConfig = normaliseConfig(undefined)

	#tcp: TCPHelper | undefined
	readonly #parser = new MidiParser((msg) => this.#handleMidi(msg))
	readonly #nrpn = new NrpnDecoder()

	/** Last known value of every parameter, keyed by 14-bit parameter number */
	readonly values = new Map<number, number>()
	/** Last recalled scene (1-300) */
	scene: number | undefined
	/** Pending bank select received on the mixer channel, per MIDI channel */
	readonly #bank: number[] = new Array<number>(16).fill(0)
	/** MIDI strip fader values (0-127) */
	readonly stripFaders: (number | undefined)[] = new Array<number | undefined>(STRIP_COUNT).fill(undefined)
	/** MIDI strip key states */
	readonly stripKeys: Record<StripKey, boolean[]> = {
		mute: new Array<boolean>(STRIP_COUNT).fill(false),
		sel: new Array<boolean>(STRIP_COUNT).fill(false),
		pafl: new Array<boolean>(STRIP_COUNT).fill(false),
	}
	/** Notes currently held, keyed by `${channel}:${note}` (zero based channel) */
	readonly heldNotes = new Map<string, number>()
	/** Last program change received on each channel (zero based channel and program) */
	readonly lastProgram = new Map<number, number>()

	readonly #paramVariables: Map<number, ParamVariable> = buildParamVariables()
	readonly #requested = new Map<number, number>()
	#getQueue: number[] = []
	#getTimer: NodeJS.Timeout | undefined

	#dirtyFeedbacks = new Set<FeedbackId>()
	#dirtyVariables: CompanionVariableValues = {}
	#updateTimer: NodeJS.Timeout | undefined

	#isRecording = false
	readonly #timers = new Set<NodeJS.Timeout>()

	constructor(internal: unknown) {
		super(internal)
	}

	/** Zero based MIDI channel of the mixer */
	get mixerChannel(): number {
		return this.config.midiChannel - 1
	}

	/** Zero based MIDI channel used for MIDI strips / DAW control (mixer channel + 1) */
	get dawChannel(): number {
		return this.config.midiChannel % 16
	}

	get isConnected(): boolean {
		return this.#tcp?.isConnected ?? false
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = normaliseConfig(config)

		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.updatePresets()
		this.#resetVariables()

		this.#connect()
	}

	async destroy(): Promise<void> {
		this.#disconnect()
		if (this.#updateTimer) clearTimeout(this.#updateTimer)
		this.#updateTimer = undefined
		for (const t of this.#timers) clearTimeout(t)
		this.#timers.clear()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		const old = this.config
		this.config = normaliseConfig(config)

		// Labels may have changed, so presets referencing variables need regenerating
		this.updatePresets()

		if (old.host !== this.config.host || old.port !== this.config.port || old.midiChannel !== this.config.midiChannel) {
			this.#clearState()
			this.#resetVariables()
			this.#connect()
		} else {
			if (old.faderLaw !== this.config.faderLaw) this.#refreshAllParamVariables()
			if (!old.syncOnConnect && this.config.syncOnConnect && this.isConnected) this.syncState()
			this.checkAllFeedbacks()
		}
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	handleStartStopRecordActions(isRecording: boolean): void {
		this.#isRecording = isRecording
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	// -------------------------------------------------------------------------
	// Connection
	// -------------------------------------------------------------------------

	#connect(): void {
		this.#disconnect()

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No IP address configured')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		const tcp = new TCPHelper(this.config.host, this.config.port)
		this.#tcp = tcp

		tcp.on('status_change', (status, message) => {
			this.updateStatus(status, message)
		})
		tcp.on('error', (err) => {
			this.log('error', `Network error: ${err.message}`)
			this.#onConnectionLost()
		})
		tcp.on('connect', () => {
			this.log('info', `Connected to ${this.config.host}:${this.config.port}`)
			this.#parser.reset()
			this.#nrpn.reset()
			this.#requested.clear()
			this.checkFeedbacks('connected')
			// Read back everything already known (it may have changed while offline) and the initial state
			this.refreshAll()
			this.checkAllFeedbacks()
		})
		tcp.on('end', () => {
			this.log('warn', 'Connection closed by mixer')
			this.#onConnectionLost()
		})
		tcp.on('data', (data) => {
			this.#parser.push(data)
		})
	}

	#disconnect(): void {
		if (this.#getTimer) clearInterval(this.#getTimer)
		this.#getTimer = undefined
		this.#getQueue = []
		if (this.#tcp) {
			this.#tcp.removeAllListeners()
			this.#tcp.destroy()
			this.#tcp = undefined
		}
	}

	#onConnectionLost(): void {
		if (this.#getTimer) clearInterval(this.#getTimer)
		this.#getTimer = undefined
		this.#getQueue = []
		this.#requested.clear()
		this.checkFeedbacks('connected')
	}

	#clearState(): void {
		this.values.clear()
		this.#requested.clear()
		this.scene = undefined
		this.stripFaders.fill(undefined)
		for (const key of Object.values(this.stripKeys)) key.fill(false)
		this.heldNotes.clear()
		this.lastProgram.clear()
	}

	/** Send raw MIDI bytes to the mixer. Returns false when not connected. */
	sendMidi(bytes: number[]): boolean {
		if (!bytes.length) return false
		if (!this.#tcp || !this.#tcp.isConnected) {
			this.log('debug', `Not connected, dropping: ${toHex(bytes)}`)
			return false
		}
		this.log('debug', `Send: ${toHex(bytes)}`)
		return this.#tcp.send(Buffer.from(bytes))
	}

	/** Send a note on, followed by a note off after a delay */
	sendTap(on: number[], off: number[], delayMs = 100): void {
		this.sendMidi(on)
		const timer = setTimeout(() => {
			this.#timers.delete(timer)
			this.sendMidi(off)
		}, delayMs)
		this.#timers.add(timer)
	}

	// -------------------------------------------------------------------------
	// Parameter values
	// -------------------------------------------------------------------------

	/** Get the cached value of a parameter, requesting it from the mixer when unknown */
	getValue(param: number): number | undefined {
		const value = this.values.get(param)
		if (value === undefined) this.requestValue(param)
		return value
	}

	/** Get a level parameter in dB (-Infinity for off) */
	getDb(param: number): number | undefined {
		const value = this.getValue(param)
		return value === undefined ? undefined : valueToDb(value, this.config.faderLaw)
	}

	/** Get a pan parameter as -100 (left) to +100 (right) */
	getPan(param: number): number | undefined {
		const value = this.getValue(param)
		return value === undefined ? undefined : valueToPan(value)
	}

	/** Get an on/off parameter (mute or assignment) */
	getBool(param: number): boolean | undefined {
		const value = this.getValue(param)
		return value === undefined ? undefined : (value & 0x7f) !== 0
	}

	/** Wait for a value to arrive from the mixer, requesting it if necessary */
	async fetchValue(param: number, timeoutMs = 1500, signal?: AbortSignal): Promise<number | undefined> {
		const cached = this.values.get(param)
		if (cached !== undefined) return cached
		if (!this.isConnected) return undefined
		this.#requested.delete(param)
		this.requestValue(param)
		const start = Date.now()
		while (Date.now() - start < timeoutMs) {
			if (signal?.aborted) return undefined
			await new Promise((r) => setTimeout(r, 25))
			const v = this.values.get(param)
			if (v !== undefined) return v
		}
		return undefined
	}

	/** Queue a 'get' request for a parameter */
	requestValue(param: number): void {
		if (!this.isConnected) return
		const now = Date.now()
		const last = this.#requested.get(param)
		if (last !== undefined && now - last < GET_RETRY_MS) return
		this.#requested.set(param, now)
		this.#getQueue.push(param)
		this.#startGetQueue()
	}

	#startGetQueue(): void {
		if (this.#getTimer) return
		this.#getTimer = setInterval(() => {
			const batch = this.#getQueue.splice(0, GET_BATCH_SIZE)
			if (batch.length === 0 || !this.isConnected) {
				clearInterval(this.#getTimer)
				this.#getTimer = undefined
				return
			}
			const bytes: number[] = []
			for (const param of batch) bytes.push(...nrpnGet(this.mixerChannel, param))
			this.sendMidi(bytes)
		}, GET_TICK_MS)
	}

	/** Request the state shown by the module's variables */
	syncState(): void {
		this.#requested.clear()
		for (const ch of MUTE_CHANNELS) {
			const p = getMuteParam(ch.id)
			if (p !== undefined) this.requestValue(p)
		}
		for (const ch of OUTPUT_CHANNELS) {
			const p = getOutputLevelParam(ch.id)
			if (p !== undefined) this.requestValue(p)
		}
		for (const src of SEND_SOURCES) {
			for (const kind of ['level', 'pan', 'assign'] as const) {
				const p = getSendParam(kind, src.id, 'lr')
				if (p !== undefined) this.requestValue(p)
			}
		}
	}

	/** Re-request every value that has been seen or requested */
	refreshAll(): void {
		const params = new Set([...this.values.keys(), ...this.#requested.keys()])
		this.#requested.clear()
		if (this.config.syncOnConnect) this.syncState()
		for (const p of params) this.requestValue(p)
	}

	/**
	 * Store a value that has been sent to the mixer, so feedbacks update without waiting for the mixer.
	 */
	setLocalValue(param: number, value: number): void {
		this.#applyValue(param, value, false)
	}

	/** Read a parameter back from the mixer shortly after a relative change */
	confirmValue(param: number): void {
		const timer = setTimeout(() => {
			this.#timers.delete(timer)
			this.#requested.delete(param)
			this.requestValue(param)
		}, CONFIRM_DELAY_MS)
		this.#timers.add(timer)
	}

	/** Track a scene recalled from Companion */
	setScene(scene: number): void {
		this.scene = scene
		this.#queueVariable('scene', scene)
		this.#queueFeedbacks('scene')
	}

	// -------------------------------------------------------------------------
	// Incoming MIDI
	// -------------------------------------------------------------------------

	#handleMidi(msg: MidiMessage): void {
		switch (msg.type) {
			case 'cc':
				this.#handleCc(msg.channel, msg.controller, msg.value)
				break
			case 'program':
				this.#handleProgram(msg.channel, msg.program)
				break
			case 'noteon':
			case 'noteoff':
				this.#handleNote(msg.channel, msg.note, msg.type === 'noteon' ? msg.velocity : 0)
				break
			case 'sysex':
				this.#handleSysex(msg.data)
				break
			default:
				break
		}
	}

	#handleCc(channel: number, controller: number, value: number): void {
		if (channel === this.mixerChannel) {
			if (NrpnDecoder.isNrpnController(controller)) {
				const ev = this.#nrpn.handle(channel, controller, value)
				if (ev) this.#handleNrpn(ev)
				return
			}
			if (controller === 0x00) {
				this.#bank[channel] = value
				return
			}
		}

		if (channel === this.dawChannel && controller < STRIP_COUNT) {
			this.stripFaders[controller] = value
			this.#queueVariable(`strip${controller + 1}_fader`, value)
			this.#queueFeedbacks('strip_fader', 'strip_fader_value')
		}

		this.#queueVariable('last_cc', controller)
		this.#queueVariable('last_cc_channel', channel + 1)
		this.#queueVariable('last_cc_value', value)
	}

	#handleProgram(channel: number, program: number): void {
		this.#queueVariable('last_program', program + 1)
		this.#queueVariable('last_program_channel', channel + 1)
		this.#queueFeedbacks('program_received')

		if (channel === this.mixerChannel) {
			const scene = this.#bank[channel] * 128 + program + 1
			if (scene >= 1 && scene <= 300) {
				this.scene = scene
				this.#queueVariable('scene', scene)
				this.#queueFeedbacks('scene')
				if (this.#isRecording) {
					this.recordAction({ actionId: 'scene_recall', options: { scene } }, 'scene')
				}
			}
		}
		this.lastProgram.set(channel, program)
	}

	#handleNote(channel: number, note: number, velocity: number): void {
		const key = `${channel}:${note}`
		if (velocity > 0) this.heldNotes.set(key, velocity)
		else this.heldNotes.delete(key)

		this.#queueVariable('last_note', note)
		this.#queueVariable('last_note_channel', channel + 1)
		this.#queueVariable('last_note_velocity', velocity)
		this.#queueFeedbacks('midi_note')

		if (channel === this.dawChannel) {
			for (const [name, base] of Object.entries(STRIP_KEY_BASE) as [StripKey, number][]) {
				if (note >= base && note < base + STRIP_COUNT) {
					const strip = note - base
					this.stripKeys[name][strip] = velocity > 0
					this.#queueVariable(`strip${strip + 1}_${name}`, velocity > 0)
					this.#queueFeedbacks('strip_key')
				}
			}
		}
	}

	#handleSysex(data: number[]): void {
		// MMC: F0 7F <device> 06 <command> ... F7
		if (data.length >= 6 && data[1] === 0x7f && data[3] === 0x06) {
			const command = data[4]
			const name = MMC_COMMANDS[command] ?? `0x${command.toString(16).toUpperCase().padStart(2, '0')}`
			this.#queueVariable('last_mmc', name)
			this.log('debug', `MMC received: ${name}`)
			return
		}
		this.log('debug', `Sysex received: ${toHex(data)}`)
	}

	#handleNrpn(ev: NrpnEvent): void {
		if (ev.value === undefined) return
		this.#applyValue(ev.param, ev.value, true)
	}

	#applyValue(param: number, value: number, fromMixer: boolean): void {
		const old = this.values.get(param)
		this.values.set(param, value)
		this.#requested.delete(param)
		if (old === value) return

		const info = getParamInfo(param)
		if (!info) {
			if (fromMixer) this.log('debug', `Value for unknown parameter ${param.toString(16)}: ${value}`)
			return
		}

		this.#updateParamVariable(param, value)
		this.#queueFeedbacksForKind(info)

		if (fromMixer && this.#isRecording) this.#recordChange(param, info, value)
	}

	#queueFeedbacksForKind(info: ParamInfo): void {
		switch (info.kind) {
			case 'mute':
				this.#queueFeedbacks('mute')
				break
			case 'level':
				if (info.dst === undefined) this.#queueFeedbacks('output_level', 'output_level_value')
				else if (info.dst.startsWith('mtx')) this.#queueFeedbacks('matrix_send_level', 'matrix_send_level_value')
				else this.#queueFeedbacks('send_level', 'send_level_value')
				break
			case 'pan':
				if (info.dst?.startsWith('mtx')) this.#queueFeedbacks('matrix_pan', 'matrix_pan_value')
				else this.#queueFeedbacks('pan', 'pan_value')
				break
			case 'assign':
				if (info.dst?.startsWith('mtx')) this.#queueFeedbacks('matrix_assign')
				else this.#queueFeedbacks('assign')
				break
		}
	}

	#recordChange(param: number, info: ParamInfo, value: number): void {
		const uniq = `param_${param}`
		const isMatrix = info.dst?.startsWith('mtx') ?? false
		switch (info.kind) {
			case 'mute':
				this.recordAction(
					{ actionId: 'mute', options: { channel: info.src, action: value & 0x7f ? 'on' : 'off' } },
					uniq,
				)
				break
			case 'assign':
				this.recordAction(
					{
						actionId: isMatrix ? 'matrix_assign' : 'assign',
						options: { source: info.src, destination: info.dst, action: value & 0x7f ? 'on' : 'off' },
					},
					uniq,
				)
				break
			case 'level': {
				const db = valueToDb(value, this.config.faderLaw)
				const level = Number.isFinite(db) ? db : -90
				if (info.dst === undefined) {
					this.recordAction({ actionId: 'output_level', options: { channel: info.src, mode: 'set', level } }, uniq)
				} else {
					this.recordAction(
						{
							actionId: isMatrix ? 'matrix_send_level' : 'send_level',
							options: { source: info.src, destination: info.dst, mode: 'set', level },
						},
						uniq,
					)
				}
				break
			}
			case 'pan':
				this.recordAction(
					{
						actionId: isMatrix ? 'matrix_pan' : 'pan',
						options: { source: info.src, destination: info.dst, mode: 'set', position: valueToPan(value) },
					},
					uniq,
				)
				break
		}
	}

	// -------------------------------------------------------------------------
	// Variables and feedback updates
	// -------------------------------------------------------------------------

	#formatParamVariable(v: ParamVariable, value: number): string | boolean {
		switch (v.format) {
			case 'bool':
				return (value & 0x7f) !== 0
			case 'db':
				return formatDb(valueToDb(value, this.config.faderLaw))
			case 'pan':
				return formatPan(valueToPan(value))
		}
	}

	#updateParamVariable(param: number, value: number): void {
		const v = this.#paramVariables.get(param)
		if (!v) return
		this.#queueVariable(v.id, this.#formatParamVariable(v, value))
	}

	#refreshAllParamVariables(): void {
		for (const [param, v] of this.#paramVariables) {
			const value = this.values.get(param)
			if (value !== undefined) this.#queueVariable(v.id, this.#formatParamVariable(v, value))
		}
		this.checkAllFeedbacks()
	}

	#resetVariables(): void {
		const values: CompanionVariableValues = {
			scene: undefined,
			last_program: undefined,
			last_program_channel: undefined,
			last_note: undefined,
			last_note_channel: undefined,
			last_note_velocity: undefined,
			last_cc: undefined,
			last_cc_channel: undefined,
			last_cc_value: undefined,
			last_mmc: undefined,
		}
		for (const v of this.#paramVariables.values()) values[v.id] = undefined
		for (let i = 1; i <= STRIP_COUNT; i++) {
			values[`strip${i}_fader`] = undefined
			values[`strip${i}_mute`] = false
			values[`strip${i}_sel`] = false
			values[`strip${i}_pafl`] = false
		}
		this.setVariableValues(values)
	}

	#queueVariable(id: string, value: CompanionVariableValues[string]): void {
		this.#dirtyVariables[id] = value
		this.#scheduleUpdate()
	}

	#queueFeedbacks(...ids: FeedbackId[]): void {
		for (const id of ids) this.#dirtyFeedbacks.add(id)
		this.#scheduleUpdate()
	}

	#scheduleUpdate(): void {
		if (this.#updateTimer) return
		this.#updateTimer = setTimeout(() => {
			this.#updateTimer = undefined
			const vars = this.#dirtyVariables
			this.#dirtyVariables = {}
			if (Object.keys(vars).length) this.setVariableValues(vars)

			const fbs = [...this.#dirtyFeedbacks]
			this.#dirtyFeedbacks.clear()
			if (fbs.length) this.checkFeedbacks(fbs[0], ...fbs.slice(1))
		}, UPDATE_DEBOUNCE_MS)
	}
}
