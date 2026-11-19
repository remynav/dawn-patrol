/**
 * scoreSpot — the rules that make the call. Pure: no network, no clock, no AI.
 *
 * It takes tomorrow's hourly forecast for one spot and the captain's rules,
 * checks five factors over the dawn window, and returns a verdict with one
 * reason per factor.
 *
 *   all five pass                    -> 'on'     (IT'S ON)
 *   four pass and one is a near miss -> 'maybe'
 *   anything else                    -> 'no-go'
 */

import { angleBetween, averageDirection, compassPoint, degreesOf } from './compass'

/** One hour of forecast at the spot, already converted to feet and mph. */
export interface HourForecast {
  hour: number // 0 to 23, local time at the spot
  swellFt: number | null
  periodS: number | null
  swellDeg: number | null
  seaLevelM: number | null
  windMph: number | null
  windDeg: number | null
}

/** Tomorrow at the spot: 24 hours, in order. */
export interface DayForecast {
  date: string // YYYY-MM-DD at the spot
  hours: HourForecast[]
}

/** The captain's rules for a spot (the rule columns of the `spots` collection). */
export interface SpotRules {
  minSwellFt: number
  maxSwellFt?: number
  minPeriodS: number
  swellDirs: string[]
  tideBands: string[]
  maxWindMph: number
  offshoreDirs: string[]
}

export type Verdict = 'on' | 'maybe' | 'no-go'
type Outcome = 'pass' | 'near' | 'fail'

export interface SpotScore {
  verdict: Verdict
  reasons: string[]
  // The numbers behind the verdict. null when the forecast had no data.
  swellFt: number | null
  periodS: number | null
  swellDeg: number | null
  tideBand: string | null
  tideRising: boolean | null
  windMph: number | null
  windDeg: number | null
}

// Dawn window: the hours 05:00 to 09:00 inclusive.
const DAWN_START = 5
const DAWN_END = 9
// The tide rule reads this hour.
const TIDE_HOUR = 7
// A number within 20% of its limit is a near miss.
const NEAR_FRACTION = 0.2
// Each compass point owns 22.5° either side of its centre.
const SLICE_HALF_WIDTH = 22.5
// A direction up to 15° outside a ticked slice is a near miss.
const NEAR_DEGREES = 15
// A tide within 10% of the day's range of a ticked band is a near miss.
const TIDE_NEAR_FRACTION = 0.1
// Decimal maths is slightly inexact (6 * 1.2 is 7.199999...), so limits get this much slack.
const SLACK = 1e-9

export function scoreSpot(day: DayForecast, rules: SpotRules): SpotScore {
  const dawn = day.hours.filter((h) => h.hour >= DAWN_START && h.hour <= DAWN_END)

  // Round first, then judge, so the number shown is exactly the number scored.
  const swellFt = round(average(dawn.map((h) => h.swellFt)), 1)
  const periodS = round(average(dawn.map((h) => h.periodS)), 1)
  const windMph = round(average(dawn.map((h) => h.windMph)), 0)
  const swellDeg = averageOfDirections(dawn.map((h) => h.swellDeg))
  const windDeg = averageOfDirections(dawn.map((h) => h.windDeg))
  const tide = readTide(day)

  const factors = [
    scoreSwellSize(swellFt, rules),
    scorePeriod(periodS, rules),
    scoreSwellDirection(swellDeg, rules),
    scoreTide(tide, rules),
    scoreWind(windMph, windDeg, rules),
  ]

  const passes = factors.filter((f) => f.outcome === 'pass').length
  const nears = factors.filter((f) => f.outcome === 'near').length
  let verdict: Verdict = 'no-go'
  if (passes === 5) verdict = 'on'
  else if (passes === 4 && nears === 1) verdict = 'maybe'

  return {
    verdict,
    reasons: factors.map((f) => f.reason),
    swellFt,
    periodS,
    swellDeg,
    tideBand: tide?.band ?? null,
    tideRising: tide?.rising ?? null,
    windMph,
    windDeg,
  }
}

// ── The five factors ────────────────────────────────────────────────────────

interface Factor {
  outcome: Outcome
  reason: string
}

const LABEL: Record<Outcome, string> = { pass: 'pass', near: 'near miss', fail: 'fail' }

function factor(outcome: Outcome, text: string, note?: string): Factor {
  return { outcome, reason: `${text}: ${LABEL[outcome]}${note ? ` (${note})` : ''}` }
}

function scoreSwellSize(swellFt: number | null, rules: SpotRules): Factor {
  if (swellFt === null) return factor('fail', 'Swell size', 'no data')
  const text = `Swell ${swellFt.toFixed(1)} ft`
  const { minSwellFt: min, maxSwellFt: max } = rules

  if (swellFt < min) {
    const near = swellFt >= min * (1 - NEAR_FRACTION) - SLACK
    return factor(near ? 'near' : 'fail', text, `needs ${min} ft`)
  }
  if (max != null && swellFt > max) {
    const near = swellFt <= max * (1 + NEAR_FRACTION) + SLACK
    return factor(near ? 'near' : 'fail', text, `limit ${max} ft`)
  }
  return factor('pass', text)
}

function scorePeriod(periodS: number | null, rules: SpotRules): Factor {
  if (periodS === null) return factor('fail', 'Swell period', 'no data')
  const text = `Period ${periodS.toFixed(1)} s`
  const min = rules.minPeriodS

  if (periodS >= min) return factor('pass', text)
  const near = periodS >= min * (1 - NEAR_FRACTION) - SLACK
  return factor(near ? 'near' : 'fail', text, `needs ${min} s`)
}

function scoreSwellDirection(swellDeg: number | null, rules: SpotRules): Factor {
  if (swellDeg === null) return factor('fail', 'Swell direction', 'no data')
  const text = `Swell from ${compassPoint(swellDeg)} (${swellDeg}°)`
  const wanted = `wants ${rules.swellDirs.join(', ') || 'nothing ticked'}`

  const off = degreesOutside(swellDeg, rules.swellDirs)
  if (off === 0) return factor('pass', text)
  return factor(off <= NEAR_DEGREES ? 'near' : 'fail', text, wanted)
}

function scoreTide(tide: Tide | null, rules: SpotRules): Factor {
  if (tide === null) return factor('fail', 'Tide', 'no data')
  const text = `Tide ${tide.band} and ${tide.rising ? 'rising' : 'falling'} at 07:00`
  if (rules.tideBands.includes(tide.band)) return factor('pass', text)

  // Not in a ticked band. Is it close to the edge of one?
  // `position` is where the 07:00 level sits in the day's range: 0 = lowest, 1 = highest.
  const near = rules.tideBands.some((band) => {
    const [low, high] = BAND_EDGES[band] ?? [NaN, NaN]
    const distance = tide.position < low ? low - tide.position : tide.position - high
    return distance <= TIDE_NEAR_FRACTION + SLACK
  })
  return factor(near ? 'near' : 'fail', text, `wants ${rules.tideBands.join(', ') || 'nothing ticked'}`)
}

function scoreWind(windMph: number | null, windDeg: number | null, rules: SpotRules): Factor {
  if (windMph === null || windDeg === null) return factor('fail', 'Wind', 'no data')
  const text = `Wind ${windMph.toFixed(0)} mph from ${compassPoint(windDeg)}`
  const max = rules.maxWindMph

  if (windMph <= max) return factor('pass', text)
  // Too strong for the limit, but offshore wind is fine at any speed.
  if (degreesOutside(windDeg, rules.offshoreDirs) === 0) return factor('pass', text, 'offshore')
  const near = windMph <= max * (1 + NEAR_FRACTION) + SLACK
  return factor(near ? 'near' : 'fail', text, `limit ${max} mph unless offshore`)
}

// ── Tide ────────────────────────────────────────────────────────────────────

// Each band is a third of the day's range, as a fraction from lowest (0) to highest (1).
const BAND_EDGES: Record<string, [number, number]> = {
  low: [0, 1 / 3],
  mid: [1 / 3, 2 / 3],
  high: [2 / 3, 1],
}

interface Tide {
  band: 'low' | 'mid' | 'high'
  rising: boolean
  position: number // 0 = the day's lowest level, 1 = its highest
}

function readTide(day: DayForecast): Tide | null {
  const levelAt = (hour: number) => day.hours.find((h) => h.hour === hour)?.seaLevelM ?? null
  const levels = day.hours.map((h) => h.seaLevelM).filter((v): v is number => v !== null)
  const now = levelAt(TIDE_HOUR)
  const before = levelAt(TIDE_HOUR - 1)
  const after = levelAt(TIDE_HOUR + 1)
  if (now === null || before === null || after === null || levels.length === 0) return null

  const lowest = Math.min(...levels)
  const range = Math.max(...levels) - lowest
  // A flat day has no range to split, so call it mid.
  const position = range === 0 ? 0.5 : (now - lowest) / range

  let band: Tide['band'] = 'high'
  if (position < 1 / 3) band = 'low'
  else if (position < 2 / 3) band = 'mid'

  return { band, rising: after > before, position }
}

// ── Small helpers ───────────────────────────────────────────────────────────

/** Plain average, skipping missing values. null when nothing is left. */
function average(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return present.reduce((sum, v) => sum + v, 0) / present.length
}

function averageOfDirections(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null)
  return present.length === 0 ? null : averageDirection(present)
}

/**
 * How many degrees a direction lies outside the nearest ticked compass slice.
 * 0 means it is inside one. Infinity when nothing is ticked.
 */
function degreesOutside(degrees: number, points: string[]): number {
  let best = Infinity
  for (const point of points) {
    const outside = Math.max(0, angleBetween(degrees, degreesOf(point)) - SLICE_HALF_WIDTH)
    best = Math.min(best, outside)
  }
  return best
}

function round(value: number | null, decimals: number): number | null {
  if (value === null) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
