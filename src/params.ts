/**
 * Channel definitions and NRPN parameter numbers for the Allen & Heath Qu-5/6/7 (and -D variants).
 *
 * All parameter numbers are expressed as a single 14-bit number: (MSB << 7) | LSB.
 * The layout follows the "Reference Tables" section of the Qu-5/6/7 MIDI Protocol document.
 */

export interface ChannelDef {
	id: string
	label: string
}

export type ParamKind = 'mute' | 'level' | 'pan' | 'assign'

/** Build a 14-bit parameter number from MSB/LSB bytes */
export function nrpn(msb: number, lsb: number): number {
	return ((msb & 0x7f) << 7) | (lsb & 0x7f)
}

export function splitNrpn(param: number): [msb: number, lsb: number] {
	return [(param >> 7) & 0x7f, param & 0x7f]
}

function range(count: number): number[] {
	return Array.from({ length: count }, (_, i) => i)
}

// ---------------------------------------------------------------------------
// Channel lists
// ---------------------------------------------------------------------------

/** Mono inputs 1-32, stereo inputs ST1/ST2 and the USB stereo return */
export const INPUTS: ChannelDef[] = [
	...range(32).map((i) => ({ id: `ip${i + 1}`, label: `Input ${i + 1}` })),
	{ id: 'st1', label: 'ST1' },
	{ id: 'st2', label: 'ST2' },
	{ id: 'usb', label: 'USB' },
]

/** Index of each input within the source grid used by the protocol */
const INPUT_INDEX: Record<string, number> = {
	...Object.fromEntries(range(32).map((i) => [`ip${i + 1}`, i])),
	st1: 0x20,
	st2: 0x22,
	usb: 0x24,
}

/** Mixes 1-12 used as groups (as a source) */
export const GROUPS: ChannelDef[] = range(12).map((i) => ({ id: `grp${i + 1}`, label: `Group ${i + 1}` }))

export const FX_RETURNS: ChannelDef[] = range(6).map((i) => ({ id: `fxr${i + 1}`, label: `FX${i + 1} Return` }))

export const FX_SENDS: ChannelDef[] = range(4).map((i) => ({ id: `fxs${i + 1}`, label: `FX${i + 1} Send` }))

export const LR: ChannelDef = { id: 'lr', label: 'LR' }

export const MIXES: ChannelDef[] = range(12).map((i) => ({ id: `mix${i + 1}`, label: `Mix ${i + 1}` }))

export const MATRICES: ChannelDef[] = range(4).map((i) => ({ id: `mtx${i + 1}`, label: `Matrix ${i + 1}` }))

export const DCAS: ChannelDef[] = range(8).map((i) => ({ id: `dca${i + 1}`, label: `DCA ${i + 1}` }))

export const MUTE_GROUPS: ChannelDef[] = range(8).map((i) => ({ id: `mgrp${i + 1}`, label: `Mute Group ${i + 1}` }))

/** Sources for sends to LR / Mixes / FX sends */
export const SEND_SOURCES: ChannelDef[] = [...INPUTS, ...GROUPS, ...FX_RETURNS]

/** Destinations for levels and assignments from inputs, groups and FX returns */
export const SEND_DESTINATIONS: ChannelDef[] = [LR, ...MIXES, ...FX_SENDS]

/** Destinations for panning/balance from inputs, groups and FX returns (stereo mixes only) */
export const PAN_DESTINATIONS: ChannelDef[] = [LR, ...MIXES]

/** Destinations for assignments (FX returns can also be assigned to groups) */
export const ASSIGN_DESTINATIONS: ChannelDef[] = [LR, ...MIXES, ...FX_SENDS, ...GROUPS]

/** Sources that feed the matrices */
export const MATRIX_SOURCES: ChannelDef[] = [LR, ...MIXES]

/**
 * Matrix destinations for level and assignment.
 * The protocol has three slots per mix: Matrix 1, Matrix 2 and Matrix 3/4 (Matrix 3 and 4 share the same parameter).
 */
export const MATRIX_SEND_DESTINATIONS: ChannelDef[] = [
	{ id: 'mtx1', label: 'Matrix 1' },
	{ id: 'mtx2', label: 'Matrix 2' },
	{ id: 'mtx3', label: 'Matrix 3/4' },
]

/** Matrix destinations for panning/balance (stereo matrix pairs) */
export const MATRIX_PAN_DESTINATIONS: ChannelDef[] = [
	{ id: 'mtx1', label: 'Matrix 1&2' },
	{ id: 'mtx3', label: 'Matrix 3&4' },
]

/** Channels that can be muted */
export const MUTE_CHANNELS: ChannelDef[] = [
	...INPUTS,
	...FX_RETURNS,
	LR,
	...MIXES,
	...FX_SENDS,
	...MATRICES,
	...DCAS,
	...MUTE_GROUPS,
]

/** Channels with a master/output fader */
export const OUTPUT_CHANNELS: ChannelDef[] = [LR, ...MIXES, ...FX_SENDS, ...MATRICES, ...DCAS]

// ---------------------------------------------------------------------------
// Parameter number calculation
// ---------------------------------------------------------------------------

const MUTE_PARAMS: Record<string, number> = {
	...Object.fromEntries(INPUTS.map((c) => [c.id, nrpn(0x00, INPUT_INDEX[c.id])])),
	...Object.fromEntries(FX_RETURNS.map((c, i) => [c.id, nrpn(0x00, 0x3c + i)])),
	lr: nrpn(0x00, 0x44),
	...Object.fromEntries(MIXES.map((c, i) => [c.id, nrpn(0x00, 0x45 + i)])),
	...Object.fromEntries(FX_SENDS.map((c, i) => [c.id, nrpn(0x00, 0x51 + i)])),
	...Object.fromEntries(MATRICES.map((c, i) => [c.id, nrpn(0x00, 0x55 + i)])),
	...Object.fromEntries(DCAS.map((c, i) => [c.id, nrpn(0x02, 0x00 + i)])),
	...Object.fromEntries(MUTE_GROUPS.map((c, i) => [c.id, nrpn(0x04, 0x00 + i)])),
}

const OUTPUT_LEVEL_PARAMS: Record<string, number> = {
	lr: nrpn(0x4f, 0x00),
	...Object.fromEntries(MIXES.map((c, i) => [c.id, nrpn(0x4f, 0x01 + i)])),
	...Object.fromEntries(FX_SENDS.map((c, i) => [c.id, nrpn(0x4f, 0x0d + i)])),
	...Object.fromEntries(MATRICES.map((c, i) => [c.id, nrpn(0x4f, 0x11 + i)])),
	...Object.fromEntries(DCAS.map((c, i) => [c.id, nrpn(0x4f, 0x20 + i)])),
}

/** Offsets added to a send level parameter to get the matching pan or assignment parameter */
const KIND_OFFSET: Record<'level' | 'pan' | 'assign', number> = {
	level: 0,
	pan: nrpn(0x10, 0x00),
	assign: nrpn(0x20, 0x00),
}

type SourceType = 'input' | 'group' | 'fxr' | 'mix'

interface ParsedChannel {
	type: SourceType | 'lr' | 'fxs' | 'mtx'
	/** zero based index within its type (inputs use their grid index) */
	index: number
}

function parseChannel(id: string): ParsedChannel | undefined {
	if (id === 'lr') return { type: 'lr', index: 0 }
	if (id in INPUT_INDEX) return { type: 'input', index: INPUT_INDEX[id] }
	const m = /^(grp|fxr|mix|fxs|mtx)(\d+)$/.exec(id)
	if (!m) return undefined
	const n = Number(m[2]) - 1
	const limits: Record<string, number> = { grp: 12, fxr: 6, mix: 12, fxs: 4, mtx: 4 }
	if (n < 0 || n >= limits[m[1]]) return undefined
	const typeMap: Record<string, ParsedChannel['type']> = {
		grp: 'group',
		fxr: 'fxr',
		mix: 'mix',
		fxs: 'fxs',
		mtx: 'mtx',
	}
	return { type: typeMap[m[1]], index: n }
}

/** Base level parameter for a source/destination pair, before kind offsets. Undefined when not a valid route. */
function sendLevelBase(src: ParsedChannel, dst: ParsedChannel): number | undefined {
	switch (dst.type) {
		case 'lr':
			if (src.type === 'input') return nrpn(0x40, 0x00) + src.index
			if (src.type === 'group') return nrpn(0x40, 0x30) + src.index
			if (src.type === 'fxr') return nrpn(0x40, 0x3c) + src.index
			return undefined
		case 'mix':
			if (src.type === 'input') return nrpn(0x40, 0x44) + src.index * 12 + dst.index
			if (src.type === 'group') {
				// A mix can't be sent to itself
				if (src.index === dst.index) return undefined
				return nrpn(0x45, 0x04) + src.index * 12 + dst.index
			}
			if (src.type === 'fxr') return nrpn(0x46, 0x14) + src.index * 12 + dst.index
			return undefined
		case 'fxs':
			if (src.type === 'input') return nrpn(0x4c, 0x14) + src.index * 4 + dst.index
			if (src.type === 'group') return nrpn(0x4d, 0x54) + src.index * 4 + dst.index
			if (src.type === 'fxr') return nrpn(0x4e, 0x04) + src.index * 4 + dst.index
			return undefined
		case 'mtx': {
			let mixIndex: number
			if (src.type === 'lr') mixIndex = 0
			else if (src.type === 'mix') mixIndex = src.index + 1
			else return undefined
			// Three parameter slots per mix: Mtx1, Mtx2 and Mtx3/4
			const slot = Math.min(dst.index, 2)
			return nrpn(0x4e, 0x24) + mixIndex * 3 + slot
		}
		default:
			return undefined
	}
}

/**
 * Get the parameter number for a level, pan/balance or assignment between a source and destination.
 * Returns undefined when the combination does not exist in the protocol.
 */
export function getSendParam(kind: 'level' | 'pan' | 'assign', srcId: string, dstId: string): number | undefined {
	const src = parseChannel(srcId)
	const dst = parseChannel(dstId)
	if (!src || !dst) return undefined

	// FX returns can be assigned directly to groups
	if (dst.type === 'group') {
		if (kind !== 'assign' || src.type !== 'fxr') return undefined
		return nrpn(0x6b, 0x34) + src.index * 12 + dst.index
	}

	if (src.type === 'lr' && dst.type !== 'mtx') return undefined

	if (kind === 'pan') {
		// Panning only exists towards stereo mixes, not FX sends
		if (dst.type === 'fxs') return undefined
		// Matrix balance exists for the Mtx1&2 and Mtx3&4 pairs
		if (dst.type === 'mtx' && dst.index !== 0 && dst.index !== 2) return undefined
	}

	const base = sendLevelBase(src, dst)
	if (base === undefined) return undefined
	return base + KIND_OFFSET[kind]
}

export function getMuteParam(id: string): number | undefined {
	return MUTE_PARAMS[id]
}

export function getOutputLevelParam(id: string): number | undefined {
	return OUTPUT_LEVEL_PARAMS[id]
}

// ---------------------------------------------------------------------------
// Reverse lookup
// ---------------------------------------------------------------------------

export interface ParamInfo {
	kind: ParamKind
	/** For mutes and output levels: the channel. For sends: the source */
	src: string
	/** For sends: the destination */
	dst?: string
}

const ALL_LABELS: Record<string, string> = Object.fromEntries(
	[...MUTE_CHANNELS, ...GROUPS, ...MATRIX_SEND_DESTINATIONS].map((c) => [c.id, c.label]),
)

export function channelLabel(id: string): string {
	return ALL_LABELS[id] ?? id
}

function buildReverseIndex(): Map<number, ParamInfo> {
	const map = new Map<number, ParamInfo>()
	for (const [id, param] of Object.entries(MUTE_PARAMS)) map.set(param, { kind: 'mute', src: id })
	for (const [id, param] of Object.entries(OUTPUT_LEVEL_PARAMS)) map.set(param, { kind: 'level', src: id })

	for (const kind of ['level', 'pan', 'assign'] as const) {
		for (const src of SEND_SOURCES) {
			for (const dst of ASSIGN_DESTINATIONS) {
				const param = getSendParam(kind, src.id, dst.id)
				if (param !== undefined && !map.has(param)) map.set(param, { kind, src: src.id, dst: dst.id })
			}
		}
		for (const src of MATRIX_SOURCES) {
			for (const dst of MATRIX_SEND_DESTINATIONS) {
				const param = getSendParam(kind, src.id, dst.id)
				if (param !== undefined && !map.has(param)) map.set(param, { kind, src: src.id, dst: dst.id })
			}
		}
	}
	return map
}

/** Map of every known parameter number to its meaning */
export const PARAM_INDEX: ReadonlyMap<number, ParamInfo> = buildReverseIndex()

export function getParamInfo(param: number): ParamInfo | undefined {
	return PARAM_INDEX.get(param)
}

/** Convert channel lists into dropdown choices */
export function toChoices(list: ChannelDef[]): { id: string; label: string }[] {
	return list.map((c) => ({ id: c.id, label: c.label }))
}
