import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import type QuInstance from './main.js'
import {
	getMuteParam,
	getOutputLevelParam,
	getSendParam,
	MUTE_CHANNELS,
	OUTPUT_CHANNELS,
	SEND_SOURCES,
} from './params.js'

export type VariablesSchema = CompanionVariableValues

export const STRIP_COUNT = 32
export const STRIP_KEYS = ['mute', 'sel', 'pafl'] as const
export type StripKey = (typeof STRIP_KEYS)[number]

export interface ParamVariable {
	id: string
	format: 'bool' | 'db' | 'pan'
}

/** Map of parameter number to the variable that shows it */
export function buildParamVariables(): Map<number, ParamVariable> {
	const map = new Map<number, ParamVariable>()
	for (const ch of MUTE_CHANNELS) {
		const p = getMuteParam(ch.id)
		if (p !== undefined) map.set(p, { id: `mute_${ch.id}`, format: 'bool' })
	}
	for (const ch of OUTPUT_CHANNELS) {
		const p = getOutputLevelParam(ch.id)
		if (p !== undefined) map.set(p, { id: `level_${ch.id}`, format: 'db' })
	}
	for (const src of SEND_SOURCES) {
		const level = getSendParam('level', src.id, 'lr')
		if (level !== undefined) map.set(level, { id: `send_${src.id}_lr`, format: 'db' })
		const pan = getSendParam('pan', src.id, 'lr')
		if (pan !== undefined) map.set(pan, { id: `pan_${src.id}_lr`, format: 'pan' })
		const assign = getSendParam('assign', src.id, 'lr')
		if (assign !== undefined) map.set(assign, { id: `assign_${src.id}_lr`, format: 'bool' })
	}
	return map
}

export function UpdateVariableDefinitions(self: QuInstance): void {
	const defs: CompanionVariableDefinitions<VariablesSchema> = {
		scene: { name: 'Current scene number (last recalled)' },
		last_program: { name: 'Last received program change (1-128)' },
		last_program_channel: { name: 'MIDI channel of the last received program change' },
		last_note: { name: 'Last received MIDI note number' },
		last_note_channel: { name: 'MIDI channel of the last received note' },
		last_note_velocity: { name: 'Velocity of the last received note (0 = off)' },
		last_cc: { name: 'Last received CC number (non NRPN)' },
		last_cc_channel: { name: 'MIDI channel of the last received CC' },
		last_cc_value: { name: 'Value of the last received CC' },
		last_mmc: { name: 'Last received MIDI Machine Control command' },
	}

	for (const ch of MUTE_CHANNELS) defs[`mute_${ch.id}`] = { name: `Mute: ${ch.label}` }
	for (const ch of OUTPUT_CHANNELS) defs[`level_${ch.id}`] = { name: `Master level (dB): ${ch.label}` }
	for (const src of SEND_SOURCES) {
		defs[`send_${src.id}_lr`] = { name: `Send level to LR (dB): ${src.label}` }
		defs[`pan_${src.id}_lr`] = { name: `Pan/balance to LR: ${src.label}` }
		defs[`assign_${src.id}_lr`] = { name: `Assigned to LR: ${src.label}` }
	}
	for (let i = 1; i <= STRIP_COUNT; i++) {
		defs[`strip${i}_fader`] = { name: `MIDI strip ${i}: fader (0-127)` }
		defs[`strip${i}_mute`] = { name: `MIDI strip ${i}: Mute key` }
		defs[`strip${i}_sel`] = { name: `MIDI strip ${i}: Sel key` }
		defs[`strip${i}_pafl`] = { name: `MIDI strip ${i}: PAFL key` }
	}

	self.setVariableDefinitions(defs)
}
