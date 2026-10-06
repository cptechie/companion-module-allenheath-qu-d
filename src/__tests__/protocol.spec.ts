import { describe, expect, it } from 'vitest'
import { dbToValue, formatDb, formatPan, panToValue, valueToDb, valueToPan } from '../levels.js'
import {
	MidiParser,
	mscMessage,
	NrpnDecoder,
	nrpnDecrement,
	nrpnGet,
	nrpnIncrement,
	nrpnSet,
	parseHexBytes,
	sceneRecall,
	toHex,
	type MidiMessage,
} from '../midi.js'
import { getMuteParam, getOutputLevelParam, getParamInfo, getSendParam, nrpn, PARAM_INDEX } from '../params.js'

const hex = (bytes: number[]) => toHex(bytes)

describe('scene recall', () => {
	it.each([
		[7, 0, 'B0 00 00 C0 06'],
		[120, 0, 'B0 00 00 C0 77'],
		[156, 0, 'B0 00 01 C0 1B'],
		[156, 2, 'B2 00 01 C2 1B'],
		[96, 0, 'B0 00 00 C0 5F'],
		[264, 0, 'B0 00 02 C0 07'],
	])('scene %i on channel %i', (scene, ch, expected) => {
		expect(hex(sceneRecall(ch, scene))).toBe(expected)
	})
})

describe('mutes', () => {
	it('matches the document examples', () => {
		expect(hex(nrpnSet(0, getMuteParam('ip1')!, 1))).toBe('B0 63 00 B0 62 00 B0 06 00 B0 26 01')
		expect(hex(nrpnSet(0, getMuteParam('lr')!, 0))).toBe('B0 63 00 B0 62 44 B0 06 00 B0 26 00')
		expect(hex(nrpnSet(6, getMuteParam('mgrp4')!, 1))).toBe('B6 63 04 B6 62 03 B6 06 00 B6 26 01')
		expect(hex(nrpnIncrement(0, getMuteParam('ip1')!))).toBe('B0 63 00 B0 62 00 B0 60 00')
	})

	it('has the right parameter numbers', () => {
		expect(getMuteParam('st2')).toBe(nrpn(0x00, 0x22))
		expect(getMuteParam('usb')).toBe(nrpn(0x00, 0x24))
		expect(getMuteParam('fxr6')).toBe(nrpn(0x00, 0x41))
		expect(getMuteParam('mix12')).toBe(nrpn(0x00, 0x50))
		expect(getMuteParam('fxs4')).toBe(nrpn(0x00, 0x54))
		expect(getMuteParam('mtx4')).toBe(nrpn(0x00, 0x58))
		expect(getMuteParam('dca8')).toBe(nrpn(0x02, 0x07))
		expect(getMuteParam('mgrp1')).toBe(nrpn(0x04, 0x00))
	})
})

describe('levels', () => {
	it('matches the audio taper examples', () => {
		const law = 'audio'
		const set = (ch: number, src: string, dst: string, db: number) =>
			hex(nrpnSet(ch, getSendParam('level', src, dst)!, dbToValue(db, law)))
		expect(set(0, 'ip1', 'lr', 0)).toBe('B0 63 40 B0 62 00 B0 06 62 B0 26 00')
		expect(set(0, 'ip1', 'lr', -20)).toBe('B0 63 40 B0 62 00 B0 06 2E B0 26 40')
		expect(set(0, 'usb', 'mix5', -20)).toBe('B0 63 43 B0 62 78 B0 06 2E B0 26 40')
		expect(set(3, 'usb', 'mix5', -12)).toBe('B3 63 43 B3 62 78 B3 06 3B B3 26 00')
		expect(set(3, 'grp4', 'mix8', -24)).toBe('B3 63 45 B3 62 2F B3 06 28 B3 26 40')
		expect(set(13, 'ip30', 'fxs3', -12)).toBe('BD 63 4D BD 62 0A BD 06 3B BD 26 00')
	})

	it('matches the linear taper table', () => {
		const table: [number, number, number][] = [
			[0, 0x76, 0x5c],
			[10, 0x7f, 0x7f],
			[-10, 0x6d, 0x39],
			[-12, 0x6b, 0x4b],
			[-24, 0x60, 0x3b],
			[-40, 0x51, 0x4f],
			[-60, 0x3f, 0x09],
			[-89, 0x24, 0x16],
		]
		for (const [db, vc, vf] of table) {
			expect(dbToValue(db, 'linear')).toBe((vc << 7) | vf)
			expect(valueToDb((vc << 7) | vf, 'linear')).toBeCloseTo(db, 1)
		}
	})

	it('round trips audio taper table points', () => {
		for (const db of [-89, -50, -30, -10, -5, 0, 5, 10]) {
			expect(valueToDb(dbToValue(db, 'audio'), 'audio')).toBeCloseTo(db, 1)
		}
	})

	it('reads a fader at 0 dB sent by a mixer in audio taper', () => {
		// The mixer sends 62 40 with its fader at 0 dB. Reading it with the wrong law gives -21.8 dB.
		const value = (0x62 << 7) | 0x40
		expect(valueToDb(value, 'audio')).toBeCloseTo(0.1, 1)
		expect(valueToDb(value, 'linear')).toBeCloseTo(-21.8, 1)
	})

	it('handles -inf', () => {
		expect(dbToValue(-Infinity, 'linear')).toBe(0)
		expect(dbToValue(-90, 'audio')).toBe(0)
		expect(valueToDb(0, 'audio')).toBe(-Infinity)
		expect(formatDb(-Infinity)).toBe('-inf')
		expect(formatDb(3)).toBe('+3.0')
	})

	it('builds relative messages', () => {
		expect(hex(nrpnIncrement(0, getSendParam('level', 'ip1', 'lr')!))).toBe('B0 63 40 B0 62 00 B0 60 00')
		expect(hex(nrpnDecrement(4, getSendParam('level', 'grp5', 'lr')!))).toBe('B4 63 40 B4 62 34 B4 61 00')
		expect(hex(nrpnIncrement(11, getSendParam('level', 'fxr2', 'mix3')!))).toBe('BB 63 46 BB 62 22 BB 60 00')
	})

	it('has output level parameters', () => {
		expect(getOutputLevelParam('lr')).toBe(nrpn(0x4f, 0x00))
		expect(getOutputLevelParam('fxs1')).toBe(nrpn(0x4f, 0x0d))
		expect(getOutputLevelParam('mtx4')).toBe(nrpn(0x4f, 0x14))
		expect(getOutputLevelParam('dca1')).toBe(nrpn(0x4f, 0x20))
	})

	it('rejects a group sent to its own mix', () => {
		expect(getSendParam('level', 'grp3', 'mix3')).toBeUndefined()
		expect(getSendParam('level', 'grp3', 'mix4')).toBe(nrpn(0x45, 0x1f))
	})

	it('maps mixes to matrices', () => {
		expect(getSendParam('level', 'lr', 'mtx1')).toBe(nrpn(0x4e, 0x24))
		expect(getSendParam('level', 'mix12', 'mtx3')).toBe(nrpn(0x4e, 0x4a))
		expect(getSendParam('level', 'mix12', 'mtx4')).toBe(nrpn(0x4e, 0x4a))
		expect(getSendParam('level', 'ip1', 'mtx1')).toBeUndefined()
	})
})

describe('panning', () => {
	it('matches the document examples', () => {
		const set = (ch: number, src: string, dst: string, pct: number) =>
			hex(nrpnSet(ch, getSendParam('pan', src, dst)!, panToValue(pct)))
		expect(set(0, 'ip1', 'lr', -100)).toBe('B0 63 50 B0 62 00 B0 06 00 B0 26 00')
		expect(set(0, 'ip1', 'lr', 0)).toBe('B0 63 50 B0 62 00 B0 06 3F B0 26 7F')
		expect(set(0, 'ip24', 'lr', 20)).toBe('B0 63 50 B0 62 17 B0 06 4C B0 26 65')
		expect(set(0, 'ip24', 'mix5', 20)).toBe('B0 63 52 B0 62 5C B0 06 4C B0 26 65')
		expect(set(3, 'ip24', 'mix5', -50)).toBe('B3 63 52 B3 62 5C B3 06 1F B3 26 7F')
		expect(set(3, 'grp3', 'mix7', -50)).toBe('B3 63 55 B3 62 22 B3 06 1F B3 26 7F')
		expect(set(10, 'lr', 'mtx3', 100)).toBe('BA 63 5E BA 62 26 BA 06 7F BA 26 7F')
		expect(hex(nrpnIncrement(0, getSendParam('pan', 'st2', 'mix8')!))).toBe('B0 63 53 B0 62 63 B0 60 00')
		expect(hex(nrpnIncrement(2, getSendParam('pan', 'mix5', 'mtx1')!))).toBe('B2 63 5E B2 62 33 B2 60 00')
	})

	it('has no pan towards FX sends or Matrix 2', () => {
		expect(getSendParam('pan', 'ip1', 'fxs1')).toBeUndefined()
		expect(getSendParam('pan', 'lr', 'mtx2')).toBeUndefined()
	})

	it('converts values', () => {
		expect(valueToPan(0x1fff)).toBe(0)
		expect(valueToPan(0)).toBe(-100)
		expect(valueToPan(0x3fff)).toBe(100)
		expect(formatPan(-20)).toBe('L20')
		expect(formatPan(0)).toBe('C')
	})
})

describe('assignments', () => {
	it('matches the document examples', () => {
		expect(hex(nrpnSet(0, getSendParam('assign', 'ip1', 'lr')!, 1))).toBe('B0 63 60 B0 62 00 B0 06 00 B0 26 01')
		expect(hex(nrpnSet(0, getSendParam('assign', 'fxr1', 'mix7')!, 1))).toBe('B0 63 66 B0 62 1A B0 06 00 B0 26 01')
		expect(hex(nrpnIncrement(3, getSendParam('assign', 'mix2', 'mtx1')!))).toBe('B3 63 6E B3 62 2A B3 60 00')
	})

	it('assigns FX returns to groups only', () => {
		expect(getSendParam('assign', 'fxr2', 'grp1')).toBe(nrpn(0x6b, 0x40))
		expect(getSendParam('assign', 'ip1', 'grp1')).toBeUndefined()
		expect(getSendParam('level', 'fxr2', 'grp1')).toBeUndefined()
	})
})

describe('get', () => {
	it('matches the document examples', () => {
		expect(hex(nrpnGet(0, getMuteParam('ip1')!))).toBe('B0 63 00 B0 62 00 B0 60 7F')
		expect(hex(nrpnGet(0, getSendParam('level', 'ip1', 'lr')!))).toBe('B0 63 40 B0 62 00 B0 60 7F')
		expect(hex(nrpnGet(0, getSendParam('pan', 'ip30', 'mix5')!))).toBe('B0 63 53 B0 62 24 B0 60 7F')
		expect(hex(nrpnGet(4, getSendParam('pan', 'mix7', 'mtx1')!))).toBe('B4 63 5E B4 62 39 B4 60 7F')
		expect(hex(nrpnGet(11, getSendParam('assign', 'fxr2', 'fxs3')!))).toBe('BB 63 6E BB 62 0A BB 60 7F')
	})
})

describe('parameter index', () => {
	it('has no clashes between parameter kinds', () => {
		expect(getParamInfo(nrpn(0x00, 0x44))).toEqual({ kind: 'mute', src: 'lr' })
		expect(getParamInfo(nrpn(0x4f, 0x00))).toEqual({ kind: 'level', src: 'lr' })
		expect(getParamInfo(nrpn(0x60, 0x00))).toEqual({ kind: 'assign', src: 'ip1', dst: 'lr' })
		expect(getParamInfo(nrpn(0x6e, 0x26))).toEqual({ kind: 'assign', src: 'lr', dst: 'mtx3' })
		expect(PARAM_INDEX.size).toBeGreaterThan(2500)
	})
})

describe('MIDI parser', () => {
	const parse = (input: string) => {
		const out: MidiMessage[] = []
		new MidiParser((m) => out.push(m)).push(parseHexBytes(input)!)
		return out
	}

	it('handles running status NRPN', () => {
		const msgs = parse('B0 63 40 62 00 06 62 26 00')
		expect(msgs).toHaveLength(4)
		const dec = new NrpnDecoder()
		const events = msgs.map((m) => (m.type === 'cc' ? dec.handle(m.channel, m.controller, m.value) : undefined))
		expect(events[3]).toEqual({ channel: 0, param: nrpn(0x40, 0x00), value: (0x62 << 7) | 0x00 })
	})

	it('decodes notes, note on with zero velocity and program changes', () => {
		expect(parse('91 30 7F 30 00 C2 05')).toEqual([
			{ type: 'noteon', channel: 1, note: 0x30, velocity: 0x7f },
			{ type: 'noteoff', channel: 1, note: 0x30, velocity: 0 },
			{ type: 'program', channel: 2, program: 5 },
		])
	})

	it('decodes sysex split across chunks and ignores realtime bytes', () => {
		const out: MidiMessage[] = []
		const p = new MidiParser((m) => out.push(m))
		p.push([0xf0, 0x7f, 0x7f])
		p.push([0xf8, 0x06, 0x02, 0xf7])
		expect(out).toEqual([{ type: 'sysex', data: [0xf0, 0x7f, 0x7f, 0x06, 0x02, 0xf7] }])
	})
})

describe('MIDI Show Control', () => {
	it('builds GO with a cue number', () => {
		expect(hex(mscMessage(0x7f, 0x7f, 'go', '1.5'))).toBe('F0 7F 7F 02 7F 01 31 2E 35 F7')
	})
	it('builds GO without a cue number', () => {
		expect(hex(mscMessage(1, 0x10, 'go'))).toBe('F0 7F 01 02 10 01 F7')
	})
})
