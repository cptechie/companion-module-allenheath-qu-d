/**
 * Conversions between dB / pan percentages and the 14-bit NRPN values used by the Qu.
 */

export type FaderLaw = 'linear' | 'audio'

export const MAX_DB = 10
/** Lowest level above -inf the Qu reports */
export const MIN_DB = -89
export const NEG_INF = Number.NEGATIVE_INFINITY

const MAX_VALUE = 0x3fff

/**
 * Audio taper reference points (dB, VC, VF) from the "Approximate Audio Taper Level Values" table.
 */
const AUDIO_TAPER_TABLE: [db: number, vc: number, vf: number][] = [
	[-89, 0x01, 0x40],
	[-85, 0x02, 0x00],
	[-80, 0x02, 0x40],
	[-75, 0x03, 0x40],
	[-70, 0x04, 0x00],
	[-65, 0x05, 0x00],
	[-60, 0x06, 0x00],
	[-55, 0x07, 0x00],
	[-50, 0x08, 0x00],
	[-45, 0x0c, 0x00],
	[-40, 0x0f, 0x40],
	[-38, 0x12, 0x40],
	[-36, 0x15, 0x40],
	[-35, 0x17, 0x00],
	[-34, 0x19, 0x00],
	[-33, 0x1a, 0x40],
	[-32, 0x1c, 0x00],
	[-31, 0x1d, 0x40],
	[-30, 0x1f, 0x00],
	[-29, 0x20, 0x40],
	[-28, 0x22, 0x00],
	[-27, 0x23, 0x40],
	[-26, 0x25, 0x00],
	[-25, 0x26, 0x40],
	[-24, 0x28, 0x40],
	[-23, 0x2a, 0x00],
	[-22, 0x2b, 0x40],
	[-21, 0x2d, 0x00],
	[-20, 0x2e, 0x40],
	[-19, 0x30, 0x00],
	[-18, 0x31, 0x40],
	[-17, 0x33, 0x00],
	[-16, 0x34, 0x40],
	[-15, 0x36, 0x00],
	[-14, 0x38, 0x00],
	[-13, 0x39, 0x40],
	[-12, 0x3b, 0x00],
	[-11, 0x3c, 0x40],
	[-10, 0x3e, 0x00],
	[-9, 0x41, 0x40],
	[-8, 0x44, 0x40],
	[-7, 0x48, 0x00],
	[-6, 0x4b, 0x00],
	[-5, 0x4e, 0x40],
	[-4, 0x52, 0x40],
	[-3, 0x56, 0x40],
	[-2, 0x5a, 0x00],
	[-1, 0x5e, 0x00],
	[0, 0x62, 0x00],
	[1, 0x65, 0x40],
	[2, 0x69, 0x00],
	[3, 0x6c, 0x40],
	[4, 0x70, 0x00],
	[5, 0x73, 0x40],
	[6, 0x75, 0x40],
	[7, 0x78, 0x00],
	[8, 0x7a, 0x40],
	[9, 0x7d, 0x00],
	[10, 0x7f, 0x40],
]

const AUDIO_POINTS: [db: number, value: number][] = AUDIO_TAPER_TABLE.map(([db, vc, vf]) => [db, (vc << 7) | vf])

/** Linear taper: the full 14-bit range spans -128dB to +10dB */
const LINEAR_SPAN_DB = 138
const LINEAR_OFFSET_DB = 128

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v))
}

/** Convert a level in dB to a 14-bit NRPN value */
export function dbToValue(db: number, law: FaderLaw): number {
	if (!Number.isFinite(db) || db < MIN_DB - 0.5) return 0
	db = clamp(db, MIN_DB, MAX_DB)

	if (law === 'linear') {
		return clamp(Math.round(((db + LINEAR_OFFSET_DB) * MAX_VALUE) / LINEAR_SPAN_DB), 0, MAX_VALUE)
	}

	for (let i = 1; i < AUDIO_POINTS.length; i++) {
		const [db1, v1] = AUDIO_POINTS[i]
		if (db <= db1) {
			const [db0, v0] = AUDIO_POINTS[i - 1]
			const value = v0 + ((db - db0) * (v1 - v0)) / (db1 - db0)
			return clamp(Math.round(value), 0, MAX_VALUE)
		}
	}
	return AUDIO_POINTS[AUDIO_POINTS.length - 1][1]
}

/** Convert a 14-bit NRPN value to a level in dB (-Infinity for off) */
export function valueToDb(value: number, law: FaderLaw): number {
	if (value <= 0) return NEG_INF

	if (law === 'linear') {
		const db = (value * LINEAR_SPAN_DB) / MAX_VALUE - LINEAR_OFFSET_DB
		if (db < MIN_DB - 0.5) return NEG_INF
		return Math.min(MAX_DB, Math.round(db * 10) / 10)
	}

	const first = AUDIO_POINTS[0]
	if (value < first[1]) return NEG_INF
	for (let i = 1; i < AUDIO_POINTS.length; i++) {
		const [db1, v1] = AUDIO_POINTS[i]
		if (value <= v1) {
			const [db0, v0] = AUDIO_POINTS[i - 1]
			const db = db0 + ((value - v0) * (db1 - db0)) / (v1 - v0)
			return Math.round(db * 10) / 10
		}
	}
	return MAX_DB
}

/** Format a dB value for display */
export function formatDb(db: number | undefined): string {
	if (db === undefined || Number.isNaN(db)) return ''
	if (!Number.isFinite(db)) return '-inf'
	const fixed = db.toFixed(1)
	return db > 0 ? `+${fixed}` : fixed
}

/**
 * Convert a pan position to a 14-bit value.
 * @param percent -100 (full left) to +100 (full right), 0 is centre
 */
export function panToValue(percent: number): number {
	const p = clamp(percent, -100, 100)
	return clamp(Math.floor(((p + 100) * MAX_VALUE) / 200), 0, MAX_VALUE)
}

/** Convert a 14-bit value to a pan position from -100 (left) to +100 (right) */
export function valueToPan(value: number): number {
	const p = (clamp(value, 0, MAX_VALUE) * 200) / MAX_VALUE - 100
	// "|| 0" avoids returning -0 for centre
	return clamp(Math.round(p), -100, 100) || 0
}

/** Format a pan position as L50 / C / R50 */
export function formatPan(percent: number | undefined): string {
	if (percent === undefined || Number.isNaN(percent)) return ''
	if (percent === 0) return 'C'
	return percent < 0 ? `L${-percent}` : `R${percent}`
}
