import type { CompanionActionDefinitions, CompanionInputFieldNumber, DropdownChoice } from '@companion-module/base'
import type QuInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { dbToValue, MAX_DB, panToValue } from './levels.js'
import {
	controlChange,
	isValidCue,
	MMC_COMMANDS,
	mmcMessage,
	MSC_COMMANDS,
	mscMessage,
	noteOff,
	noteOn,
	nrpnDecrement,
	nrpnIncrement,
	nrpnSet,
	parseHexBytes,
	programChange,
	sceneRecall,
	type MscCommand,
} from './midi.js'
import {
	ASSIGN_DESTINATIONS,
	channelLabel,
	getMuteParam,
	getOutputLevelParam,
	getSendParam,
	MATRIX_PAN_DESTINATIONS,
	MATRIX_SEND_DESTINATIONS,
	MATRIX_SOURCES,
	MUTE_CHANNELS,
	OUTPUT_CHANNELS,
	PAN_DESTINATIONS,
	SEND_DESTINATIONS,
	SEND_SOURCES,
	toChoices,
} from './params.js'
import { STRIP_COUNT, type StripKey } from './variables.js'

export type OnOffToggle = 'on' | 'off' | 'toggle'
export type LevelMode = 'set' | 'inc' | 'dec'
export type PanMode = 'set' | 'left' | 'right'
export type NoteMode = 'on' | 'off' | 'tap'
export type SoftKeyMode = 'press' | 'release' | 'tap'

export type ActionsSchema = {
	mute: { options: { channel: string; action: OnOffToggle } }
	output_level: { options: { channel: string; mode: LevelMode; level: number } }
	send_level: { options: { source: string; destination: string; mode: LevelMode; level: number } }
	matrix_send_level: { options: { source: string; destination: string; mode: LevelMode; level: number } }
	pan: { options: { source: string; destination: string; mode: PanMode; position: number } }
	matrix_pan: { options: { source: string; destination: string; mode: PanMode; position: number } }
	assign: { options: { source: string; destination: string; action: OnOffToggle } }
	matrix_assign: { options: { source: string; destination: string; action: OnOffToggle } }
	scene_recall: { options: { scene: number } }
	softkey: { options: { key: number; mode: SoftKeyMode } }
	msc: { options: { command: MscCommand; cue: string; list: string; path: string } }
	strip_fader: { options: { strip: number; value: number } }
	strip_key: { options: { strip: number; key: StripKey; mode: NoteMode } }
	midi_note: { options: { channel: number; note: number; velocity: number; mode: NoteMode } }
	midi_program: { options: { channel: number; program: number } }
	midi_cc: { options: { channel: number; controller: number; value: number } }
	mmc: { options: { command: number } }
	raw_midi: { options: { hex: string } }
	refresh: { options: Record<string, never> }
}

export const ON_OFF_TOGGLE_CHOICES: DropdownChoice<OnOffToggle>[] = [
	{ id: 'toggle', label: 'Toggle' },
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
]

const LEVEL_MODE_CHOICES: DropdownChoice<LevelMode>[] = [
	{ id: 'set', label: 'Set level' },
	{ id: 'inc', label: 'Increase 1 dB' },
	{ id: 'dec', label: 'Decrease 1 dB' },
]

const PAN_MODE_CHOICES: DropdownChoice<PanMode>[] = [
	{ id: 'set', label: 'Set position' },
	{ id: 'left', label: 'Move left one step' },
	{ id: 'right', label: 'Move right one step' },
]

const NOTE_MODE_CHOICES: DropdownChoice<NoteMode>[] = [
	{ id: 'tap', label: 'Press and release (note on, then off)' },
	{ id: 'on', label: 'Note on' },
	{ id: 'off', label: 'Note off' },
]

export const LEVEL_MIN = -90

export function levelField(): CompanionInputFieldNumber<'level'> {
	return {
		type: 'number',
		id: 'level',
		label: 'Level (dB)',
		description: `${LEVEL_MIN} = -inf`,
		default: 0,
		min: LEVEL_MIN,
		max: MAX_DB,
		step: 0.5,
		range: true,
		showMinAsNegativeInfinity: true,
		clampValues: true,
		isVisibleExpression: `$(options:mode) == 'set'`,
	}
}

function positionField(): CompanionInputFieldNumber<'position'> {
	return {
		type: 'number',
		id: 'position',
		label: 'Position (-100 = full left, 0 = centre, 100 = full right)',
		default: 0,
		min: -100,
		max: 100,
		step: 1,
		range: true,
		clampValues: true,
		isVisibleExpression: `$(options:mode) == 'set'`,
	}
}

function intField<TKey extends string>(
	id: TKey,
	label: string,
	min: number,
	max: number,
	def: number,
): CompanionInputFieldNumber<TKey> {
	return { type: 'number', id, label, min, max, default: def, step: 1, asInteger: true, clampValues: true }
}

const MIDI_CHANNEL_DESCRIPTION = 'Any MIDI channel (1-16)'

function toInt(v: unknown, def: number, min: number, max: number): number {
	const n = Math.round(Number(v))
	if (!Number.isFinite(n)) return def
	return Math.min(max, Math.max(min, n))
}

function levelToValue(self: QuInstance, level: unknown): number {
	const db = Number(level)
	return dbToValue(!Number.isFinite(db) || db <= LEVEL_MIN ? -Infinity : db, self.config.faderLaw)
}

/** Shared logic for absolute/relative level changes */
function applyLevel(self: QuInstance, param: number | undefined, mode: LevelMode, level: unknown, what: string): void {
	if (param === undefined) {
		self.log('warn', `${what} is not a valid level parameter`)
		return
	}
	const ch = self.mixerChannel
	if (mode === 'inc' || mode === 'dec') {
		self.sendMidi(mode === 'inc' ? nrpnIncrement(ch, param) : nrpnDecrement(ch, param))
		self.confirmValue(param)
		return
	}
	const value = levelToValue(self, level)
	if (self.sendMidi(nrpnSet(ch, param, value))) self.setLocalValue(param, value)
}

function applyPan(self: QuInstance, param: number | undefined, mode: PanMode, position: unknown, what: string): void {
	if (param === undefined) {
		self.log('warn', `${what} does not have a pan/balance parameter`)
		return
	}
	const ch = self.mixerChannel
	if (mode === 'left' || mode === 'right') {
		self.sendMidi(mode === 'right' ? nrpnIncrement(ch, param) : nrpnDecrement(ch, param))
		self.confirmValue(param)
		return
	}
	const value = panToValue(toInt(position, 0, -100, 100))
	if (self.sendMidi(nrpnSet(ch, param, value))) self.setLocalValue(param, value)
}

/** Shared logic for on/off/toggle parameters (mutes and assignments) */
function applyOnOff(self: QuInstance, param: number | undefined, action: OnOffToggle, what: string): void {
	if (param === undefined) {
		self.log('warn', `${what} is not a valid parameter`)
		return
	}
	const ch = self.mixerChannel
	if (action === 'toggle') {
		// The Qu toggles the state when it receives an increment
		if (self.sendMidi(nrpnIncrement(ch, param))) {
			const current = self.values.get(param)
			if (current !== undefined) self.setLocalValue(param, current & 0x7f ? 0 : 1)
			self.confirmValue(param)
		}
		return
	}
	const value = action === 'on' ? 1 : 0
	if (self.sendMidi(nrpnSet(ch, param, value))) self.setLocalValue(param, value)
}

async function learnDb(self: QuInstance, param: number | undefined, signal: AbortSignal) {
	if (param === undefined) return undefined
	const value = await self.fetchValue(param, 1500, signal)
	if (value === undefined) return undefined
	const db = self.getDb(param)
	if (db === undefined) return undefined
	return { mode: 'set' as const, level: Number.isFinite(db) ? db : LEVEL_MIN }
}

async function learnPan(self: QuInstance, param: number | undefined, signal: AbortSignal) {
	if (param === undefined) return undefined
	const value = await self.fetchValue(param, 1500, signal)
	if (value === undefined) return undefined
	return { mode: 'set' as const, position: self.getPan(param) ?? 0 }
}

export function UpdateActions(self: QuInstance): void {
	const sendSources = toChoices(SEND_SOURCES)
	const sendDestinations = toChoices(SEND_DESTINATIONS)
	const matrixSources = toChoices(MATRIX_SOURCES)

	const actions: CompanionActionDefinitions<ModuleSchema['actions']> = {
		mute: {
			name: 'Mute',
			description: 'Mute, unmute or toggle an input, FX return, mix, FX send, matrix, DCA or mute group',
			options: [
				{
					type: 'dropdown',
					id: 'channel',
					label: 'Channel',
					choices: toChoices(MUTE_CHANNELS),
					default: 'ip1',
				},
				{ type: 'dropdown', id: 'action', label: 'Action', choices: ON_OFF_TOGGLE_CHOICES, default: 'toggle' },
			],
			callback: ({ options }) => {
				applyOnOff(self, getMuteParam(options.channel), options.action, `Mute of ${options.channel}`)
			},
		},

		output_level: {
			name: 'Master fader level',
			description: 'Set or step the master level of LR, a mix, FX send, matrix or DCA',
			options: [
				{
					type: 'dropdown',
					id: 'channel',
					label: 'Channel',
					choices: toChoices(OUTPUT_CHANNELS),
					default: 'lr',
				},
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					choices: LEVEL_MODE_CHOICES,
					default: 'set',
					disableAutoExpression: true,
				},
				levelField(),
			],
			callback: ({ options }) => {
				applyLevel(self, getOutputLevelParam(options.channel), options.mode, options.level, options.channel)
			},
			learn: async ({ options }, { signal }) => learnDb(self, getOutputLevelParam(options.channel), signal),
		},

		send_level: {
			name: 'Send level (to LR, mix or FX send)',
			description: 'Level of an input, group or FX return sent to LR, a mix or an FX send',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{ type: 'dropdown', id: 'destination', label: 'Destination', choices: sendDestinations, default: 'lr' },
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					choices: LEVEL_MODE_CHOICES,
					default: 'set',
					disableAutoExpression: true,
				},
				levelField(),
			],
			callback: ({ options }) => {
				applyLevel(
					self,
					getSendParam('level', options.source, options.destination),
					options.mode,
					options.level,
					`${channelLabel(options.source)} to ${channelLabel(options.destination)}`,
				)
			},
			learn: async ({ options }, { signal }) =>
				learnDb(self, getSendParam('level', options.source, options.destination), signal),
		},

		matrix_send_level: {
			name: 'Matrix send level',
			description: 'Level of LR or a mix sent to a matrix',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_SEND_DESTINATIONS),
					default: 'mtx1',
				},
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					choices: LEVEL_MODE_CHOICES,
					default: 'set',
					disableAutoExpression: true,
				},
				levelField(),
			],
			callback: ({ options }) => {
				applyLevel(
					self,
					getSendParam('level', options.source, options.destination),
					options.mode,
					options.level,
					`${channelLabel(options.source)} to ${channelLabel(options.destination)}`,
				)
			},
			learn: async ({ options }, { signal }) =>
				learnDb(self, getSendParam('level', options.source, options.destination), signal),
		},

		pan: {
			name: 'Pan / balance (to LR or mix)',
			description: 'Pan or balance of an input, group or FX return in LR or a stereo mix (use the odd mix of a pair)',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Destination',
					choices: toChoices(PAN_DESTINATIONS),
					default: 'lr',
				},
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					choices: PAN_MODE_CHOICES,
					default: 'set',
					disableAutoExpression: true,
				},
				positionField(),
			],
			callback: ({ options }) => {
				applyPan(
					self,
					getSendParam('pan', options.source, options.destination),
					options.mode,
					options.position,
					`${channelLabel(options.source)} to ${channelLabel(options.destination)}`,
				)
			},
			learn: async ({ options }, { signal }) =>
				learnPan(self, getSendParam('pan', options.source, options.destination), signal),
		},

		matrix_pan: {
			name: 'Matrix balance',
			description: 'Balance of LR or a mix sent to a stereo matrix pair',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_PAN_DESTINATIONS),
					default: 'mtx1',
				},
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					choices: PAN_MODE_CHOICES,
					default: 'set',
					disableAutoExpression: true,
				},
				positionField(),
			],
			callback: ({ options }) => {
				applyPan(
					self,
					getSendParam('pan', options.source, options.destination),
					options.mode,
					options.position,
					`${channelLabel(options.source)} to ${channelLabel(options.destination)}`,
				)
			},
			learn: async ({ options }, { signal }) =>
				learnPan(self, getSendParam('pan', options.source, options.destination), signal),
		},

		assign: {
			name: 'Mix assignment',
			description:
				'Assign an input, group or FX return to LR, a mix or an FX send (FX returns can also be assigned to groups)',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Destination',
					choices: toChoices(ASSIGN_DESTINATIONS),
					default: 'lr',
				},
				{ type: 'dropdown', id: 'action', label: 'Action', choices: ON_OFF_TOGGLE_CHOICES, default: 'toggle' },
			],
			callback: ({ options }) => {
				applyOnOff(
					self,
					getSendParam('assign', options.source, options.destination),
					options.action,
					`Assignment of ${channelLabel(options.source)} to ${channelLabel(options.destination)}`,
				)
			},
		},

		matrix_assign: {
			name: 'Matrix assignment',
			description: 'Assign LR or a mix to a matrix',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_SEND_DESTINATIONS),
					default: 'mtx1',
				},
				{ type: 'dropdown', id: 'action', label: 'Action', choices: ON_OFF_TOGGLE_CHOICES, default: 'toggle' },
			],
			callback: ({ options }) => {
				applyOnOff(
					self,
					getSendParam('assign', options.source, options.destination),
					options.action,
					`Assignment of ${channelLabel(options.source)} to ${channelLabel(options.destination)}`,
				)
			},
		},

		scene_recall: {
			name: 'Recall scene',
			description: 'Recall a scene (1-300). The scene must exist on the mixer.',
			options: [intField('scene', 'Scene', 1, 300, 1)],
			callback: ({ options }) => {
				const scene = toInt(options.scene, 1, 1, 300)
				if (self.sendMidi(sceneRecall(self.mixerChannel, scene))) self.setScene(scene)
			},
		},

		softkey: {
			name: 'Soft key',
			description: 'Trigger a Qu soft key (1-8 on the surface, 9-16 assigned via Qu-MixPad)',
			options: [
				intField('key', 'Soft key', 1, 16, 1),
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Action',
					choices: [
						{ id: 'tap', label: 'Press and release' },
						{ id: 'press', label: 'Press (hold)' },
						{ id: 'release', label: 'Release' },
					],
					default: 'tap',
				},
			],
			callback: ({ options }) => {
				const note = 0x30 + toInt(options.key, 1, 1, 16) - 1
				const ch = self.mixerChannel
				if (options.mode === 'press') self.sendMidi(noteOn(ch, note, 0x7f))
				else if (options.mode === 'release') self.sendMidi(noteOff(ch, note))
				else self.sendTap(noteOn(ch, note, 0x7f), noteOff(ch, note))
			},
		},

		msc: {
			name: 'MIDI Show Control (cue list)',
			description: 'Control the Cue List when the Scene Manager is in Cue List mode',
			options: [
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					choices: Object.entries(MSC_COMMANDS).map(([id, c]) => ({ id: id as MscCommand, label: c.label })),
					default: 'go',
				},
				{
					type: 'textinput',
					id: 'cue',
					label: 'Cue number (eg 1 or 2.5, leave blank for the next cue)',
					default: '',
				},
				{ type: 'textinput', id: 'list', label: 'Cue list (optional)', default: '' },
				{ type: 'textinput', id: 'path', label: 'Cue path (optional)', default: '' },
			],
			callback: ({ options }) => {
				const command = options.command in MSC_COMMANDS ? options.command : 'go'
				const def = MSC_COMMANDS[command]
				const cue = String(options.cue ?? '').trim()
				const list = String(options.list ?? '').trim()
				const path = String(options.path ?? '').trim()
				for (const [name, v] of [
					['cue', cue],
					['cue list', list],
					['cue path', path],
				] as const) {
					if (v && !isValidCue(v)) {
						self.log('warn', `Invalid MSC ${name} "${v}"`)
						return
					}
				}
				if (def.cue === 'required' && !cue) {
					self.log('warn', `MSC ${def.label} requires a cue number`)
					return
				}
				const useCue = def.cue === 'none' ? undefined : cue || undefined
				self.sendMidi(mscMessage(self.config.mscDeviceId, self.config.mscCommandFormat, command, useCue, list, path))
			},
		},

		strip_fader: {
			name: 'MIDI strip: fader',
			description: 'Send a fader value to a Qu MIDI strip (on the DAW control channel)',
			options: [intField('strip', 'MIDI strip', 1, STRIP_COUNT, 1), intField('value', 'Value', 0, 127, 0)],
			callback: ({ options }) => {
				const strip = toInt(options.strip, 1, 1, STRIP_COUNT) - 1
				self.sendMidi(controlChange(self.dawChannel, strip, toInt(options.value, 0, 0, 127)))
			},
		},

		strip_key: {
			name: 'MIDI strip: key',
			description: 'Send a Mute, Sel or PAFL key note to a Qu MIDI strip (on the DAW control channel)',
			options: [
				intField('strip', 'MIDI strip', 1, STRIP_COUNT, 1),
				{
					type: 'dropdown',
					id: 'key',
					label: 'Key',
					choices: [
						{ id: 'mute', label: 'Mute' },
						{ id: 'sel', label: 'Sel' },
						{ id: 'pafl', label: 'PAFL' },
					],
					default: 'mute',
				},
				{ type: 'dropdown', id: 'mode', label: 'Action', choices: NOTE_MODE_CHOICES, default: 'tap' },
			],
			callback: ({ options }) => {
				const strip = toInt(options.strip, 1, 1, STRIP_COUNT) - 1
				const base = options.key === 'sel' ? 0x20 : options.key === 'pafl' ? 0x40 : 0x00
				const note = base + strip
				const ch = self.dawChannel
				if (options.mode === 'on') self.sendMidi(noteOn(ch, note, 0x7f))
				else if (options.mode === 'off') self.sendMidi(noteOff(ch, note))
				else self.sendTap(noteOn(ch, note, 0x7f), noteOff(ch, note))
			},
		},

		midi_note: {
			name: 'MIDI: send note',
			description: 'Send a note on/off on any MIDI channel',
			options: [
				{ ...intField('channel', 'MIDI channel', 1, 16, 1), description: MIDI_CHANNEL_DESCRIPTION },
				intField('note', 'Note (0-127)', 0, 127, 0x30),
				intField('velocity', 'Velocity', 1, 127, 127),
				{ type: 'dropdown', id: 'mode', label: 'Action', choices: NOTE_MODE_CHOICES, default: 'tap' },
			],
			callback: ({ options }) => {
				const ch = toInt(options.channel, 1, 1, 16) - 1
				const note = toInt(options.note, 0, 0, 127)
				const velocity = toInt(options.velocity, 127, 1, 127)
				if (options.mode === 'on') self.sendMidi(noteOn(ch, note, velocity))
				else if (options.mode === 'off') self.sendMidi(noteOff(ch, note))
				else self.sendTap(noteOn(ch, note, velocity), noteOff(ch, note))
			},
		},

		midi_program: {
			name: 'MIDI: send program change',
			description: 'Send a program change on any MIDI channel',
			options: [
				{ ...intField('channel', 'MIDI channel', 1, 16, 1), description: MIDI_CHANNEL_DESCRIPTION },
				intField('program', 'Program (1-128)', 1, 128, 1),
			],
			callback: ({ options }) => {
				self.sendMidi(programChange(toInt(options.channel, 1, 1, 16) - 1, toInt(options.program, 1, 1, 128) - 1))
			},
		},

		midi_cc: {
			name: 'MIDI: send control change',
			description: 'Send a CC message on any MIDI channel',
			options: [
				{ ...intField('channel', 'MIDI channel', 1, 16, 1), description: MIDI_CHANNEL_DESCRIPTION },
				intField('controller', 'Controller (0-127)', 0, 127, 0),
				intField('value', 'Value (0-127)', 0, 127, 0),
			],
			callback: ({ options }) => {
				self.sendMidi(
					controlChange(
						toInt(options.channel, 1, 1, 16) - 1,
						toInt(options.controller, 0, 0, 127),
						toInt(options.value, 0, 0, 127),
					),
				)
			},
		},

		mmc: {
			name: 'MIDI: send MMC transport command',
			description: 'Send a MIDI Machine Control message',
			options: [
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					choices: Object.entries(MMC_COMMANDS).map(([id, label]) => ({ id: Number(id), label })),
					default: 0x02,
				},
			],
			callback: ({ options }) => {
				self.sendMidi(mmcMessage(toInt(options.command, 0x02, 0, 127)))
			},
		},

		raw_midi: {
			name: 'MIDI: send raw bytes',
			description: 'Send any MIDI message, written as hex bytes (eg "B0 63 00 B0 62 00 B0 60 00")',
			options: [{ type: 'textinput', id: 'hex', label: 'Hex bytes', default: '', useVariables: true }],
			callback: ({ options }) => {
				const bytes = parseHexBytes(String(options.hex ?? ''))
				if (!bytes) {
					self.log('warn', `Invalid hex string "${options.hex}"`)
					return
				}
				self.sendMidi(bytes)
			},
		},

		refresh: {
			name: 'Refresh mixer state',
			description: 'Request all values shown by variables and feedbacks from the mixer again',
			options: [],
			callback: () => {
				self.refreshAll()
			},
		},
	}

	self.setActionDefinitions(actions)
}
