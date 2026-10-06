/**
 * MIDI message builders and a streaming parser for MIDI over TCP.
 */

import { splitNrpn } from './params.js'

/** Zero based MIDI channel (0-15) */
export type MidiChannel = number

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function cc(ch: MidiChannel, controller: number, value: number): number[] {
	return [0xb0 | (ch & 0x0f), controller & 0x7f, value & 0x7f]
}

function nrpnHeader(ch: MidiChannel, param: number): number[] {
	const [msb, lsb] = splitNrpn(param)
	return [...cc(ch, 0x63, msb), ...cc(ch, 0x62, lsb)]
}

/** Set an NRPN parameter to an absolute 14-bit value */
export function nrpnSet(ch: MidiChannel, param: number, value: number): number[] {
	const v = Math.max(0, Math.min(0x3fff, Math.round(value)))
	return [...nrpnHeader(ch, param), ...cc(ch, 0x06, v >> 7), ...cc(ch, 0x26, v & 0x7f)]
}

/** Data increment (toggle for mutes/assigns, +1dB for levels, right for pan) */
export function nrpnIncrement(ch: MidiChannel, param: number): number[] {
	return [...nrpnHeader(ch, param), ...cc(ch, 0x60, 0x00)]
}

/** Data decrement (toggle for mutes/assigns, -1dB for levels, left for pan) */
export function nrpnDecrement(ch: MidiChannel, param: number): number[] {
	return [...nrpnHeader(ch, param), ...cc(ch, 0x61, 0x00)]
}

/** Request the current value of a parameter */
export function nrpnGet(ch: MidiChannel, param: number): number[] {
	return [...nrpnHeader(ch, param), ...cc(ch, 0x60, 0x7f)]
}

/** Recall a scene (1-300) using bank + program change */
export function sceneRecall(ch: MidiChannel, scene: number): number[] {
	const index = Math.max(0, Math.min(299, Math.round(scene) - 1))
	const bank = Math.floor(index / 128)
	const program = index % 128
	return [...cc(ch, 0x00, bank), 0xc0 | (ch & 0x0f), program]
}

export function noteOn(ch: MidiChannel, note: number, velocity = 0x7f): number[] {
	return [0x90 | (ch & 0x0f), note & 0x7f, velocity & 0x7f]
}

export function noteOff(ch: MidiChannel, note: number, velocity = 0x00): number[] {
	return [0x80 | (ch & 0x0f), note & 0x7f, velocity & 0x7f]
}

export function controlChange(ch: MidiChannel, controller: number, value: number): number[] {
	return cc(ch, controller, value)
}

export function programChange(ch: MidiChannel, program: number): number[] {
	return [0xc0 | (ch & 0x0f), program & 0x7f]
}

/** MIDI Show Control commands */
export const MSC_COMMANDS = {
	go: { id: 0x01, label: 'GO', cue: 'optional' },
	stop: { id: 0x02, label: 'STOP', cue: 'optional' },
	resume: { id: 0x03, label: 'RESUME', cue: 'optional' },
	load: { id: 0x05, label: 'LOAD', cue: 'required' },
	all_off: { id: 0x08, label: 'ALL OFF', cue: 'none' },
	restore: { id: 0x09, label: 'RESTORE', cue: 'none' },
	reset: { id: 0x0a, label: 'RESET', cue: 'none' },
	go_off: { id: 0x0b, label: 'GO OFF', cue: 'optional' },
	standby_next: { id: 0x11, label: 'STANDBY + (Next)', cue: 'optional' },
	standby_prev: { id: 0x12, label: 'STANDBY - (Previous)', cue: 'optional' },
	sequence_next: { id: 0x13, label: 'SEQUENCE +', cue: 'optional' },
	sequence_prev: { id: 0x14, label: 'SEQUENCE -', cue: 'optional' },
} as const

export type MscCommand = keyof typeof MSC_COMMANDS

/** Validate an MSC cue number string such as "1", "12.5" or "3.1.2" */
export function isValidCue(cue: string): boolean {
	return /^\d+(\.\d+)*$/.test(cue)
}

/**
 * Build a MIDI Show Control message
 * F0 7F <device> 02 <format> <command> [cue 00 list 00 path] F7
 */
export function mscMessage(
	deviceId: number,
	commandFormat: number,
	command: MscCommand,
	cue?: string,
	list?: string,
	path?: string,
): number[] {
	const data: number[] = []
	const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0x7f)
	if (cue) {
		data.push(...ascii(cue))
		if (list) {
			data.push(0x00, ...ascii(list))
			if (path) data.push(0x00, ...ascii(path))
		}
	}
	return [0xf0, 0x7f, deviceId & 0x7f, 0x02, commandFormat & 0x7f, MSC_COMMANDS[command].id, ...data, 0xf7]
}

/** MIDI Machine Control commands */
export const MMC_COMMANDS: Record<number, string> = {
	0x01: 'Stop',
	0x02: 'Play',
	0x03: 'Deferred Play',
	0x04: 'Fast Forward',
	0x05: 'Rewind',
	0x06: 'Record Strobe',
	0x07: 'Record Exit',
	0x08: 'Record Pause',
	0x09: 'Pause',
	0x0a: 'Eject',
	0x0b: 'Chase',
	0x0d: 'MMC Reset',
	0x40: 'Write',
	0x44: 'Locate',
	0x47: 'Shuttle',
}

/** Build an MMC message (sent to all devices) */
export function mmcMessage(command: number, deviceId = 0x7f): number[] {
	return [0xf0, 0x7f, deviceId & 0x7f, 0x06, command & 0x7f, 0xf7]
}

/** Parse a string of hex bytes such as "B0 63 00" or "b06300" */
export function parseHexBytes(input: string): number[] | undefined {
	const clean = input.replace(/0x/gi, '').replace(/[\s,]+/g, '')
	if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) return undefined
	const out: number[] = []
	for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16))
	return out
}

export function toHex(bytes: ArrayLike<number>): string {
	return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export type MidiMessage =
	| { type: 'noteon'; channel: number; note: number; velocity: number }
	| { type: 'noteoff'; channel: number; note: number; velocity: number }
	| { type: 'cc'; channel: number; controller: number; value: number }
	| { type: 'program'; channel: number; program: number }
	| { type: 'pitchbend'; channel: number; value: number }
	| { type: 'aftertouch'; channel: number; value: number }
	| { type: 'polyaftertouch'; channel: number; note: number; value: number }
	| { type: 'sysex'; data: number[] }

/** Number of data bytes for each channel message type (by high nibble) */
const CHANNEL_DATA_LENGTH: Record<number, number> = {
	0x80: 2,
	0x90: 2,
	0xa0: 2,
	0xb0: 2,
	0xc0: 1,
	0xd0: 1,
	0xe0: 2,
}

/** Number of data bytes for system common messages */
const SYSTEM_COMMON_LENGTH: Record<number, number> = {
	0xf1: 1,
	0xf2: 2,
	0xf3: 1,
	0xf6: 0,
}

const MAX_SYSEX_LENGTH = 4096

/**
 * Incremental MIDI byte stream parser with running status support.
 */
export class MidiParser {
	#status = 0
	#data: number[] = []
	#expected = 0
	#sysex: number[] | null = null
	readonly #onMessage: (msg: MidiMessage) => void

	constructor(onMessage: (msg: MidiMessage) => void) {
		this.#onMessage = onMessage
	}

	reset(): void {
		this.#status = 0
		this.#data = []
		this.#expected = 0
		this.#sysex = null
	}

	push(chunk: ArrayLike<number>): void {
		for (let i = 0; i < chunk.length; i++) this.#byte(chunk[i])
	}

	#byte(b: number): void {
		// System realtime messages can appear anywhere and don't affect running status
		if (b >= 0xf8) return

		if (b === 0xf0) {
			this.#sysex = [b]
			this.#status = 0
			return
		}
		if (b === 0xf7) {
			if (this.#sysex) {
				this.#sysex.push(b)
				this.#onMessage({ type: 'sysex', data: this.#sysex })
				this.#sysex = null
			}
			return
		}

		if (b & 0x80) {
			// Any other status byte terminates a sysex
			this.#sysex = null
			if (b >= 0xf0) {
				// System common clears running status
				this.#status = b
				this.#expected = SYSTEM_COMMON_LENGTH[b] ?? 0
				this.#data = []
				if (this.#expected === 0) this.#status = 0
				return
			}
			this.#status = b
			this.#expected = CHANNEL_DATA_LENGTH[b & 0xf0]
			this.#data = []
			return
		}

		// Data byte
		if (this.#sysex) {
			if (this.#sysex.length < MAX_SYSEX_LENGTH) this.#sysex.push(b)
			return
		}
		if (!this.#status) return

		this.#data.push(b)
		if (this.#data.length < this.#expected) return

		const status = this.#status
		const data = this.#data
		this.#data = []
		if (status >= 0xf0) {
			// System common message complete, no running status
			this.#status = 0
			return
		}
		this.#dispatch(status, data)
	}

	#dispatch(status: number, data: number[]): void {
		const channel = status & 0x0f
		switch (status & 0xf0) {
			case 0x80:
				this.#onMessage({ type: 'noteoff', channel, note: data[0], velocity: data[1] })
				break
			case 0x90:
				if (data[1] === 0) this.#onMessage({ type: 'noteoff', channel, note: data[0], velocity: 0 })
				else this.#onMessage({ type: 'noteon', channel, note: data[0], velocity: data[1] })
				break
			case 0xa0:
				this.#onMessage({ type: 'polyaftertouch', channel, note: data[0], value: data[1] })
				break
			case 0xb0:
				this.#onMessage({ type: 'cc', channel, controller: data[0], value: data[1] })
				break
			case 0xc0:
				this.#onMessage({ type: 'program', channel, program: data[0] })
				break
			case 0xd0:
				this.#onMessage({ type: 'aftertouch', channel, value: data[0] })
				break
			case 0xe0:
				this.#onMessage({ type: 'pitchbend', channel, value: (data[1] << 7) | data[0] })
				break
		}
	}
}

export interface NrpnEvent {
	channel: number
	param: number
	/** 14-bit value for absolute messages */
	value?: number
	/** For increment/decrement messages */
	increment?: 'inc' | 'dec'
	/** The data byte of an increment/decrement message */
	incValue?: number
}

/**
 * Collects NRPN sequences (CC 99/98/6/38/96/97) per channel and reports complete parameter updates.
 */
export class NrpnDecoder {
	#state: { msb: number; lsb: number; coarse: number }[] = Array.from({ length: 16 }, () => ({
		msb: -1,
		lsb: -1,
		coarse: -1,
	}))

	/**
	 * Handle a CC message. Returns an event when a parameter update completes.
	 * Returns undefined for CCs that are part of an incomplete sequence or are not NRPN related.
	 */
	handle(channel: number, controller: number, value: number): NrpnEvent | undefined {
		const s = this.#state[channel & 0x0f]
		switch (controller) {
			case 0x63:
				s.msb = value
				s.lsb = -1
				s.coarse = -1
				return undefined
			case 0x62:
				s.lsb = value
				s.coarse = -1
				return undefined
			case 0x06:
				s.coarse = value
				return undefined
			case 0x26:
				if (s.msb < 0 || s.lsb < 0) return undefined
				return {
					channel,
					param: (s.msb << 7) | s.lsb,
					value: ((s.coarse < 0 ? 0 : s.coarse) << 7) | value,
				}
			case 0x60:
			case 0x61:
				if (s.msb < 0 || s.lsb < 0) return undefined
				return {
					channel,
					param: (s.msb << 7) | s.lsb,
					increment: controller === 0x60 ? 'inc' : 'dec',
					incValue: value,
				}
			default:
				return undefined
		}
	}

	/** Whether the controller number is part of the NRPN protocol */
	static isNrpnController(controller: number): boolean {
		return (
			controller === 0x63 ||
			controller === 0x62 ||
			controller === 0x06 ||
			controller === 0x26 ||
			controller === 0x60 ||
			controller === 0x61
		)
	}

	reset(): void {
		for (const s of this.#state) {
			s.msb = -1
			s.lsb = -1
			s.coarse = -1
		}
	}
}
