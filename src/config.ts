import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import type { FaderLaw } from './levels.js'

export const DEFAULT_PORT = 51325

export type ModuleConfig = {
	host: string
	port: number
	midiChannel: number
	faderLaw: FaderLaw
	syncOnConnect: boolean
	mscDeviceId: number
	mscCommandFormat: number
}

export const MSC_COMMAND_FORMATS = [
	{ id: 0x7f, label: 'All types (7F)' },
	{ id: 0x10, label: 'Sound - General (10)' },
	{ id: 0x11, label: 'Sound - Music (11)' },
	{ id: 0x01, label: 'Lighting - General (01)' },
	{ id: 0x30, label: 'Video - General (30)' },
	{ id: 0x40, label: 'Projection - General (40)' },
	{ id: 0x60, label: 'Pyro - General (60)' },
]

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'Connects to the Qu-5/6/7 (and Qu-5D/6D/7D) using MIDI over TCP/IP. Set the MIDI channel and NRPN Fader Law to match UTILITY > General > MIDI on the mixer.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Mixer IP address',
			width: 8,
			regex: Regex.IP,
			default: '192.168.1.70',
		},
		{
			type: 'number',
			id: 'port',
			label: 'MIDI TCP port',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
		},
		{
			type: 'number',
			id: 'midiChannel',
			label: 'Mixer MIDI channel',
			description: 'MIDI DAW control (MIDI strips) automatically uses this channel + 1',
			width: 4,
			min: 1,
			max: 16,
			default: 1,
		},
		{
			type: 'dropdown',
			id: 'faderLaw',
			label: 'NRPN Fader Law',
			description: 'Must match the NRPN Fader Law setting on the mixer',
			width: 4,
			choices: [
				{ id: 'audio', label: 'Audio Taper' },
				{ id: 'linear', label: 'Linear Taper' },
			],
			default: 'audio',
		},
		{
			type: 'checkbox',
			id: 'syncOnConnect',
			label: 'Request mixer state on connect',
			description: 'Reads mutes, master levels and LR sends/pans/assignments when connecting',
			width: 4,
			default: true,
		},
		{
			type: 'number',
			id: 'mscDeviceId',
			label: 'MIDI Show Control device ID',
			description: '127 (7F) is the "all call" ID',
			width: 6,
			min: 0,
			max: 127,
			default: 127,
		},
		{
			type: 'dropdown',
			id: 'mscCommandFormat',
			label: 'MIDI Show Control command format',
			width: 6,
			choices: MSC_COMMAND_FORMATS,
			default: 0x7f,
		},
	]
}

/** Fill in any missing values and coerce types */
export function normaliseConfig(config: Partial<ModuleConfig> | undefined): ModuleConfig {
	const num = (v: unknown, def: number, min: number, max: number) => {
		const n = Number(v)
		if (!Number.isFinite(n)) return def
		return Math.min(max, Math.max(min, Math.round(n)))
	}
	return {
		host: String(config?.host ?? '').trim(),
		port: num(config?.port, DEFAULT_PORT, 1, 65535),
		midiChannel: num(config?.midiChannel, 1, 1, 16),
		faderLaw: config?.faderLaw === 'linear' ? 'linear' : 'audio',
		syncOnConnect: config?.syncOnConnect ?? true,
		mscDeviceId: num(config?.mscDeviceId, 127, 0, 127),
		mscCommandFormat: num(config?.mscCommandFormat, 0x7f, 0, 127),
	}
}
