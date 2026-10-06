import {
	combineRgb,
	type CompanionFeedbackDefinitions,
	type CompanionInputFieldDropdown,
	type CompanionInputFieldNumber,
	type DropdownChoice,
} from '@companion-module/base'
import type QuInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { LEVEL_MIN } from './actions.js'
import { formatDb, formatPan, MAX_DB } from './levels.js'
import {
	ASSIGN_DESTINATIONS,
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

export type Comparison = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'
export type ValueFormat = 'number' | 'text'

type LevelCompareOptions = { comparison: Comparison; level: number }
type PanCompareOptions = { comparison: Comparison; position: number }

export type FeedbacksSchema = {
	connected: { type: 'boolean'; options: Record<string, never> }
	mute: { type: 'boolean'; options: { channel: string } }
	assign: { type: 'boolean'; options: { source: string; destination: string } }
	matrix_assign: { type: 'boolean'; options: { source: string; destination: string } }
	output_level: { type: 'boolean'; options: { channel: string } & LevelCompareOptions }
	output_level_value: { type: 'value'; options: { channel: string; format: ValueFormat } }
	send_level: { type: 'boolean'; options: { source: string; destination: string } & LevelCompareOptions }
	send_level_value: { type: 'value'; options: { source: string; destination: string; format: ValueFormat } }
	matrix_send_level: { type: 'boolean'; options: { source: string; destination: string } & LevelCompareOptions }
	matrix_send_level_value: { type: 'value'; options: { source: string; destination: string; format: ValueFormat } }
	pan: { type: 'boolean'; options: { source: string; destination: string } & PanCompareOptions }
	pan_value: { type: 'value'; options: { source: string; destination: string; format: ValueFormat } }
	matrix_pan: { type: 'boolean'; options: { source: string; destination: string } & PanCompareOptions }
	matrix_pan_value: { type: 'value'; options: { source: string; destination: string; format: ValueFormat } }
	scene: { type: 'boolean'; options: { scene: number } }
	strip_key: { type: 'boolean'; options: { strip: number; key: StripKey } }
	strip_fader: { type: 'boolean'; options: { strip: number; comparison: Comparison; value: number } }
	strip_fader_value: { type: 'value'; options: { strip: number } }
	midi_note: { type: 'boolean'; options: { channel: number; note: number } }
	program_received: { type: 'boolean'; options: { channel: number; program: number } }
}

export type FeedbackId = keyof FeedbacksSchema

const COMPARISON_CHOICES: DropdownChoice<Comparison>[] = [
	{ id: 'eq', label: '=' },
	{ id: 'ne', label: '≠' },
	{ id: 'gt', label: '>' },
	{ id: 'ge', label: '≥' },
	{ id: 'lt', label: '<' },
	{ id: 'le', label: '≤' },
]

function comparisonField(): CompanionInputFieldDropdown<'comparison', Comparison> {
	return { type: 'dropdown', id: 'comparison', label: 'Comparison', choices: COMPARISON_CHOICES, default: 'ge' }
}

function formatField(): CompanionInputFieldDropdown<'format', ValueFormat> {
	return {
		type: 'dropdown',
		id: 'format',
		label: 'Format',
		choices: [
			{ id: 'number', label: 'Number' },
			{ id: 'text', label: 'Text' },
		],
		default: 'number',
	}
}

function levelCompareField(): CompanionInputFieldNumber<'level'> {
	return {
		type: 'number',
		id: 'level',
		label: 'Level (dB)',
		description: `${LEVEL_MIN} = -inf`,
		default: 0,
		min: LEVEL_MIN,
		max: MAX_DB,
		step: 0.5,
		showMinAsNegativeInfinity: true,
		clampValues: true,
	}
}

function positionCompareField(): CompanionInputFieldNumber<'position'> {
	return {
		type: 'number',
		id: 'position',
		label: 'Position (-100 = left, 0 = centre, 100 = right)',
		default: 0,
		min: -100,
		max: 100,
		step: 1,
		clampValues: true,
	}
}

function compare(a: number, comparison: Comparison, b: number, epsilon = 0.05): boolean {
	switch (comparison) {
		case 'eq':
			return Math.abs(a - b) < epsilon
		case 'ne':
			return Math.abs(a - b) >= epsilon
		case 'gt':
			return a > b
		case 'ge':
			return a > b || Math.abs(a - b) < epsilon
		case 'lt':
			return a < b
		case 'le':
			return a < b || Math.abs(a - b) < epsilon
		default:
			return false
	}
}

function levelCompare(self: QuInstance, param: number | undefined, comparison: Comparison, level: unknown): boolean {
	if (param === undefined) return false
	const db = self.getDb(param)
	if (db === undefined) return false
	const actual = Number.isFinite(db) ? db : LEVEL_MIN
	const target = Math.max(LEVEL_MIN, Number(level))
	return compare(actual, comparison, Number.isFinite(target) ? target : LEVEL_MIN)
}

function levelValue(self: QuInstance, param: number | undefined, format: ValueFormat): number | string | null {
	if (param === undefined) return null
	const db = self.getDb(param)
	if (db === undefined) return null
	if (format === 'text') return formatDb(db)
	return Number.isFinite(db) ? db : LEVEL_MIN
}

function panCompare(self: QuInstance, param: number | undefined, comparison: Comparison, position: unknown): boolean {
	if (param === undefined) return false
	const pan = self.getPan(param)
	if (pan === undefined) return false
	return compare(pan, comparison, Number(position), 0.5)
}

function panValue(self: QuInstance, param: number | undefined, format: ValueFormat): number | string | null {
	if (param === undefined) return null
	const pan = self.getPan(param)
	if (pan === undefined) return null
	return format === 'text' ? formatPan(pan) : pan
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

const RED = combineRgb(255, 0, 0)
const GREEN = combineRgb(0, 160, 0)
const YELLOW = combineRgb(230, 180, 0)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

export function UpdateFeedbacks(self: QuInstance): void {
	const sendSources = toChoices(SEND_SOURCES)
	const matrixSources = toChoices(MATRIX_SOURCES)

	const feedbacks: CompanionFeedbackDefinitions<ModuleSchema['feedbacks']> = {
		connected: {
			type: 'boolean',
			name: 'Connected to mixer',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [],
			callback: () => self.isConnected,
		},

		mute: {
			type: 'boolean',
			name: 'Mute state',
			description: 'True when the channel is muted',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{ type: 'dropdown', id: 'channel', label: 'Channel', choices: toChoices(MUTE_CHANNELS), default: 'ip1' },
			],
			callback: ({ options }) => {
				const param = getMuteParam(options.channel)
				return param !== undefined && self.getBool(param) === true
			},
		},

		assign: {
			type: 'boolean',
			name: 'Mix assignment state',
			description: 'True when the source is assigned to the destination',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Destination',
					choices: toChoices(ASSIGN_DESTINATIONS),
					default: 'lr',
				},
			],
			callback: ({ options }) => {
				const param = getSendParam('assign', options.source, options.destination)
				return param !== undefined && self.getBool(param) === true
			},
		},

		matrix_assign: {
			type: 'boolean',
			name: 'Matrix assignment state',
			description: 'True when LR or the mix is assigned to the matrix',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_SEND_DESTINATIONS),
					default: 'mtx1',
				},
			],
			callback: ({ options }) => {
				const param = getSendParam('assign', options.source, options.destination)
				return param !== undefined && self.getBool(param) === true
			},
		},

		output_level: {
			type: 'boolean',
			name: 'Master fader level',
			description: 'Compare the master level of LR, a mix, FX send, matrix or DCA',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [
				{ type: 'dropdown', id: 'channel', label: 'Channel', choices: toChoices(OUTPUT_CHANNELS), default: 'lr' },
				comparisonField(),
				levelCompareField(),
			],
			callback: ({ options }) =>
				levelCompare(self, getOutputLevelParam(options.channel), options.comparison, options.level),
		},

		output_level_value: {
			type: 'value',
			name: 'Master fader level (value)',
			description: 'The master level in dB',
			options: [
				{ type: 'dropdown', id: 'channel', label: 'Channel', choices: toChoices(OUTPUT_CHANNELS), default: 'lr' },
				formatField(),
			],
			callback: ({ options }) => levelValue(self, getOutputLevelParam(options.channel), options.format),
		},

		send_level: {
			type: 'boolean',
			name: 'Send level',
			description: 'Compare the level of an input, group or FX return sent to LR, a mix or an FX send',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Destination',
					choices: toChoices(SEND_DESTINATIONS),
					default: 'lr',
				},
				comparisonField(),
				levelCompareField(),
			],
			callback: ({ options }) =>
				levelCompare(
					self,
					getSendParam('level', options.source, options.destination),
					options.comparison,
					options.level,
				),
		},

		send_level_value: {
			type: 'value',
			name: 'Send level (value)',
			description: 'The send level in dB',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Destination',
					choices: toChoices(SEND_DESTINATIONS),
					default: 'lr',
				},
				formatField(),
			],
			callback: ({ options }) =>
				levelValue(self, getSendParam('level', options.source, options.destination), options.format),
		},

		matrix_send_level: {
			type: 'boolean',
			name: 'Matrix send level',
			description: 'Compare the level of LR or a mix sent to a matrix',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_SEND_DESTINATIONS),
					default: 'mtx1',
				},
				comparisonField(),
				levelCompareField(),
			],
			callback: ({ options }) =>
				levelCompare(
					self,
					getSendParam('level', options.source, options.destination),
					options.comparison,
					options.level,
				),
		},

		matrix_send_level_value: {
			type: 'value',
			name: 'Matrix send level (value)',
			description: 'The matrix send level in dB',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_SEND_DESTINATIONS),
					default: 'mtx1',
				},
				formatField(),
			],
			callback: ({ options }) =>
				levelValue(self, getSendParam('level', options.source, options.destination), options.format),
		},

		pan: {
			type: 'boolean',
			name: 'Pan / balance position',
			description: 'Compare the pan/balance of an input, group or FX return in LR or a stereo mix',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Destination',
					choices: toChoices(PAN_DESTINATIONS),
					default: 'lr',
				},
				{ ...comparisonField(), default: 'eq' },
				positionCompareField(),
			],
			callback: ({ options }) =>
				panCompare(
					self,
					getSendParam('pan', options.source, options.destination),
					options.comparison,
					options.position,
				),
		},

		pan_value: {
			type: 'value',
			name: 'Pan / balance position (value)',
			description: 'Number from -100 (left) to 100 (right), or text such as L20 / C / R20',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: sendSources, default: 'ip1' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Destination',
					choices: toChoices(PAN_DESTINATIONS),
					default: 'lr',
				},
				formatField(),
			],
			callback: ({ options }) =>
				panValue(self, getSendParam('pan', options.source, options.destination), options.format),
		},

		matrix_pan: {
			type: 'boolean',
			name: 'Matrix balance position',
			description: 'Compare the balance of LR or a mix in a stereo matrix pair',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_PAN_DESTINATIONS),
					default: 'mtx1',
				},
				{ ...comparisonField(), default: 'eq' },
				positionCompareField(),
			],
			callback: ({ options }) =>
				panCompare(
					self,
					getSendParam('pan', options.source, options.destination),
					options.comparison,
					options.position,
				),
		},

		matrix_pan_value: {
			type: 'value',
			name: 'Matrix balance position (value)',
			description: 'Number from -100 (left) to 100 (right), or text such as L20 / C / R20',
			options: [
				{ type: 'dropdown', id: 'source', label: 'Source', choices: matrixSources, default: 'lr' },
				{
					type: 'dropdown',
					id: 'destination',
					label: 'Matrix',
					choices: toChoices(MATRIX_PAN_DESTINATIONS),
					default: 'mtx1',
				},
				formatField(),
			],
			callback: ({ options }) =>
				panValue(self, getSendParam('pan', options.source, options.destination), options.format),
		},

		scene: {
			type: 'boolean',
			name: 'Current scene',
			description: 'True when the scene was the last one recalled (from Companion or the mixer)',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [intField('scene', 'Scene', 1, 300, 1)],
			callback: ({ options }) => self.scene !== undefined && self.scene === Number(options.scene),
		},

		strip_key: {
			type: 'boolean',
			name: 'MIDI strip key state',
			description: 'True while the key note received from the mixer is on',
			defaultStyle: { bgcolor: RED, color: WHITE },
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
			],
			callback: ({ options }) => {
				const strip = Math.round(Number(options.strip)) - 1
				const key = options.key in self.stripKeys ? options.key : 'mute'
				return self.stripKeys[key][strip] === true
			},
		},

		strip_fader: {
			type: 'boolean',
			name: 'MIDI strip fader',
			description: 'Compare the fader value (0-127) received from a MIDI strip',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [
				intField('strip', 'MIDI strip', 1, STRIP_COUNT, 1),
				comparisonField(),
				intField('value', 'Value', 0, 127, 64),
			],
			callback: ({ options }) => {
				const v = self.stripFaders[Math.round(Number(options.strip)) - 1]
				return v !== undefined && compare(v, options.comparison, Number(options.value), 0.5)
			},
		},

		strip_fader_value: {
			type: 'value',
			name: 'MIDI strip fader (value)',
			description: 'The fader value (0-127) received from a MIDI strip',
			options: [intField('strip', 'MIDI strip', 1, STRIP_COUNT, 1)],
			callback: ({ options }) => self.stripFaders[Math.round(Number(options.strip)) - 1] ?? null,
		},

		midi_note: {
			type: 'boolean',
			name: 'MIDI note received',
			description: 'True while a note is held on (eg a soft key or footswitch assigned to a MIDI note on the mixer)',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [intField('channel', 'MIDI channel', 1, 16, 1), intField('note', 'Note (0-127)', 0, 127, 0x30)],
			callback: ({ options }) =>
				self.heldNotes.has(`${Math.round(Number(options.channel)) - 1}:${Math.round(Number(options.note))}`),
		},

		program_received: {
			type: 'boolean',
			name: 'MIDI program change received',
			description: 'True when the last program change received on the channel matches',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [intField('channel', 'MIDI channel', 1, 16, 1), intField('program', 'Program (1-128)', 1, 128, 1)],
			callback: ({ options }) => {
				const last = self.lastProgram.get(Math.round(Number(options.channel)) - 1)
				return last !== undefined && last === Math.round(Number(options.program)) - 1
			},
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
