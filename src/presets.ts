import {
	combineRgb,
	type CompanionButtonStyleProps,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
	type CompanionSimplePresetDefinition,
} from '@companion-module/base'
import type QuInstance from './main.js'
import type { ModuleSchema } from './main.js'
import type { MscCommand } from './midi.js'
import {
	DCAS,
	FX_RETURNS,
	FX_SENDS,
	INPUTS,
	LR,
	MATRICES,
	MIXES,
	MUTE_GROUPS,
	OUTPUT_CHANNELS,
	SEND_SOURCES,
	type ChannelDef,
} from './params.js'
import { STRIP_COUNT, STRIP_KEYS } from './variables.js'

type Preset = CompanionSimplePresetDefinition<ModuleSchema>

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 150, 0)
const DARK_GREY = combineRgb(40, 40, 40)
const BLUE = combineRgb(0, 60, 140)

const SCENE_PRESET_COUNT = 50

function style(text: string, overrides: Partial<CompanionButtonStyleProps> = {}): CompanionButtonStyleProps {
	return { text, size: 'auto', color: WHITE, bgcolor: BLACK, show_topbar: false, ...overrides }
}

export function UpdatePresets(self: QuInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const v = (id: string) => `$(${self.label}:${id})`

	const add = (id: string, preset: Preset): string => {
		presets[id] = preset
		return id
	}

	// Mutes
	const mutePreset = (ch: ChannelDef) =>
		add(`mute_${ch.id}`, {
			type: 'simple',
			name: `Mute ${ch.label}`,
			style: style(`${ch.label}\\nMUTE`),
			steps: [{ down: [{ actionId: 'mute', options: { channel: ch.id, action: 'toggle' } }], up: [] }],
			feedbacks: [{ feedbackId: 'mute', options: { channel: ch.id }, style: { bgcolor: RED, color: WHITE } }],
		})

	// Master levels
	const levelPresets = (ch: ChannelDef) => [
		add(`level_up_${ch.id}`, {
			type: 'simple',
			name: `${ch.label} level +1 dB`,
			style: style(`${ch.label}\\n▲ +1dB\\n${v(`level_${ch.id}`)}`, { bgcolor: DARK_GREY }),
			steps: [
				{
					down: [{ actionId: 'output_level', options: { channel: ch.id, mode: 'inc', level: 0 } }],
					up: [],
					rotate_left: [{ actionId: 'output_level', options: { channel: ch.id, mode: 'dec', level: 0 } }],
					rotate_right: [{ actionId: 'output_level', options: { channel: ch.id, mode: 'inc', level: 0 } }],
				},
			],
			feedbacks: [],
		}),
		add(`level_down_${ch.id}`, {
			type: 'simple',
			name: `${ch.label} level -1 dB`,
			style: style(`${ch.label}\\n▼ -1dB\\n${v(`level_${ch.id}`)}`, { bgcolor: DARK_GREY }),
			steps: [
				{
					down: [{ actionId: 'output_level', options: { channel: ch.id, mode: 'dec', level: 0 } }],
					up: [],
				},
			],
			feedbacks: [],
		}),
		add(`level_0db_${ch.id}`, {
			type: 'simple',
			name: `${ch.label} level to 0 dB`,
			style: style(`${ch.label}\\n0 dB`, { bgcolor: DARK_GREY }),
			steps: [
				{
					down: [{ actionId: 'output_level', options: { channel: ch.id, mode: 'set', level: 0 } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'output_level',
					options: { channel: ch.id, comparison: 'eq', level: 0 },
					style: { bgcolor: GREEN, color: WHITE },
				},
			],
		}),
	]

	// Sends to LR
	const sendPresets = (src: ChannelDef) => [
		add(`send_up_${src.id}_lr`, {
			type: 'simple',
			name: `${src.label} to LR +1 dB`,
			style: style(`${src.label}\\n▲ LR\\n${v(`send_${src.id}_lr`)}`, { bgcolor: DARK_GREY }),
			steps: [
				{
					down: [{ actionId: 'send_level', options: { source: src.id, destination: 'lr', mode: 'inc', level: 0 } }],
					up: [],
					rotate_left: [
						{ actionId: 'send_level', options: { source: src.id, destination: 'lr', mode: 'dec', level: 0 } },
					],
					rotate_right: [
						{ actionId: 'send_level', options: { source: src.id, destination: 'lr', mode: 'inc', level: 0 } },
					],
				},
			],
			feedbacks: [],
		}),
		add(`send_down_${src.id}_lr`, {
			type: 'simple',
			name: `${src.label} to LR -1 dB`,
			style: style(`${src.label}\\n▼ LR\\n${v(`send_${src.id}_lr`)}`, { bgcolor: DARK_GREY }),
			steps: [
				{
					down: [{ actionId: 'send_level', options: { source: src.id, destination: 'lr', mode: 'dec', level: 0 } }],
					up: [],
				},
			],
			feedbacks: [],
		}),
		add(`assign_${src.id}_lr`, {
			type: 'simple',
			name: `Assign ${src.label} to LR`,
			style: style(`${src.label}\\nto LR`),
			steps: [
				{
					down: [{ actionId: 'assign', options: { source: src.id, destination: 'lr', action: 'toggle' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'assign',
					options: { source: src.id, destination: 'lr' },
					style: { bgcolor: GREEN, color: WHITE },
				},
			],
		}),
	]

	// Scenes
	const scenePresets: string[] = []
	for (let scene = 1; scene <= SCENE_PRESET_COUNT; scene++) {
		scenePresets.push(
			add(`scene_${scene}`, {
				type: 'simple',
				name: `Recall scene ${scene}`,
				style: style(`Scene\\n${scene}`, { bgcolor: BLUE }),
				steps: [{ down: [{ actionId: 'scene_recall', options: { scene } }], up: [] }],
				feedbacks: [{ feedbackId: 'scene', options: { scene }, style: { bgcolor: GREEN, color: WHITE } }],
			}),
		)
	}

	// Soft keys (held while the button is held)
	const softkeyPresets: string[] = []
	for (let key = 1; key <= 16; key++) {
		softkeyPresets.push(
			add(`softkey_${key}`, {
				type: 'simple',
				name: `Soft key ${key}`,
				style: style(`Soft key\\n${key}`, { bgcolor: DARK_GREY }),
				steps: [
					{
						down: [{ actionId: 'softkey', options: { key, mode: 'press' } }],
						up: [{ actionId: 'softkey', options: { key, mode: 'release' } }],
					},
				],
				feedbacks: [],
			}),
		)
	}

	// MIDI Show Control
	const mscPreset = (command: MscCommand, text: string) =>
		add(`msc_${command}`, {
			type: 'simple',
			name: `Cue list ${text}`,
			style: style(text, { bgcolor: command === 'go' ? GREEN : DARK_GREY }),
			steps: [{ down: [{ actionId: 'msc', options: { command, cue: '', list: '', path: '' } }], up: [] }],
			feedbacks: [],
		})
	const mscPresets = [
		mscPreset('go', 'GO'),
		mscPreset('standby_prev', 'PREV'),
		mscPreset('standby_next', 'NEXT'),
		mscPreset('stop', 'STOP'),
	]

	// MIDI strips
	const stripPresets: string[] = []
	for (let strip = 1; strip <= STRIP_COUNT; strip++) {
		for (const key of STRIP_KEYS) {
			stripPresets.push(
				add(`strip_${strip}_${key}`, {
					type: 'simple',
					name: `MIDI strip ${strip} ${key.toUpperCase()}`,
					style: style(`Strip ${strip}\\n${key.toUpperCase()}`, { bgcolor: DARK_GREY }),
					steps: [{ down: [{ actionId: 'strip_key', options: { strip, key, mode: 'tap' } }], up: [] }],
					feedbacks: [
						{
							feedbackId: 'strip_key',
							options: { strip, key },
							style: { bgcolor: key === 'mute' ? RED : GREEN, color: WHITE },
						},
					],
				}),
			)
		}
	}

	// Status
	const statusPresets = [
		add('status_connected', {
			type: 'simple',
			name: 'Connection status',
			style: style('Qu\\nOFFLINE', { bgcolor: RED }),
			steps: [{ down: [{ actionId: 'refresh', options: {} }], up: [] }],
			feedbacks: [
				{ feedbackId: 'connected', options: {}, style: { bgcolor: GREEN, color: WHITE, text: 'Qu\\nONLINE' } },
			],
		}),
		add('status_scene', {
			type: 'simple',
			name: 'Current scene',
			style: style(`Scene\\n${v('scene')}`, { bgcolor: BLUE }),
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		}),
	]

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'mutes',
			name: 'Mutes',
			definitions: [
				{ id: 'mute_inputs', type: 'simple', name: 'Inputs', presets: INPUTS.map(mutePreset) },
				{ id: 'mute_fx_returns', type: 'simple', name: 'FX Returns', presets: FX_RETURNS.map(mutePreset) },
				{ id: 'mute_mixes', type: 'simple', name: 'LR and Mixes', presets: [LR, ...MIXES].map(mutePreset) },
				{ id: 'mute_fx_sends', type: 'simple', name: 'FX Sends', presets: FX_SENDS.map(mutePreset) },
				{ id: 'mute_matrices', type: 'simple', name: 'Matrices', presets: MATRICES.map(mutePreset) },
				{ id: 'mute_dcas', type: 'simple', name: 'DCAs', presets: DCAS.map(mutePreset) },
				{ id: 'mute_groups', type: 'simple', name: 'Mute Groups', presets: MUTE_GROUPS.map(mutePreset) },
			],
		},
		{
			id: 'master_levels',
			name: 'Master levels',
			description: 'Step master faders in 1 dB increments (the up button also responds to encoder rotation)',
			definitions: OUTPUT_CHANNELS.flatMap(levelPresets),
		},
		{
			id: 'lr_sends',
			name: 'Sends to LR',
			description: 'Channel levels and assignments to LR',
			definitions: SEND_SOURCES.flatMap(sendPresets),
		},
		{ id: 'scenes', name: 'Scenes', definitions: scenePresets },
		{ id: 'cue_list', name: 'Cue list (MIDI Show Control)', definitions: mscPresets },
		{ id: 'softkeys', name: 'Soft keys', definitions: softkeyPresets },
		{ id: 'midi_strips', name: 'MIDI strips', definitions: stripPresets },
		{ id: 'status', name: 'Status', definitions: statusPresets },
	]

	self.setPresetDefinitions(structure, presets)
}
