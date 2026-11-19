import { describe, expect, it } from 'vitest'
import marine from '../../tests/fixtures/marine-malibu.json'
import wind from '../../tests/fixtures/wind-malibu.json'
import { buildDay, type OpenMeteoResponse } from './forecast'
import { scoreSpot, type DayForecast, type HourForecast, type SpotRules } from './score'

// Rules that the Malibu fixture passes on every factor except wind.
const RULES: SpotRules = {
  minSwellFt: 2.5,
  minPeriodS: 7,
  swellDirs: ['W', 'SW'],
  tideBands: ['low', 'mid', 'high'],
  maxWindMph: 10,
  offshoreDirs: ['N', 'NE'],
}

/** A made-up day where every hour is the same, with the tide rising steadily all day. */
function flatDay(hour: Partial<HourForecast> = {}): DayForecast {
  const hours: HourForecast[] = []
  for (let h = 0; h < 24; h++) {
    hours.push({
      hour: h, swellFt: 4, periodS: 10, swellDeg: 270, seaLevelM: h / 23, windMph: 5, windDeg: 0,
      ...hour,
    })
  }
  return { date: '2026-01-01', hours }
}

describe('scoreSpot on the real Malibu fixture (Nov 19, 2026)', () => {
  const day = buildDay(
    marine as unknown as OpenMeteoResponse,
    wind as unknown as OpenMeteoResponse,
    '2026-11-19',
  )

  it('averages the dawn window (05:00 to 09:00) and reads the 07:00 tide', () => {
    const score = scoreSpot(day, RULES)
    // Checked by hand from the fixture: swell 1.0 to 1.24 m, period 6.15 to 7.95 s.
    expect(score.swellFt).toBe(3.7)
    expect(score.periodS).toBe(7.3)
    expect(score.swellDeg).toBe(271)
    expect(score.windMph).toBe(13)
    expect(score.tideBand).toBe('high')
    expect(score.tideRising).toBe(false)
  })

  it('is NO-GO when the wind is well over the limit, and says why', () => {
    const score = scoreSpot(day, RULES)
    expect(score.verdict).toBe('no-go')
    expect(score.reasons).toEqual([
      'Swell 3.7 ft: pass',
      'Period 7.3 s: pass',
      'Swell from W (271°): pass',
      'Tide high and falling at 07:00: pass',
      'Wind 13 mph from W: fail (limit 10 mph unless offshore)',
    ])
  })

  it('is MAYBE when the wind is within 20% of the limit', () => {
    // 13 mph against a limit of 11: 20% over 11 is 13.2, so this is a near miss.
    expect(scoreSpot(day, { ...RULES, maxWindMph: 11 }).verdict).toBe('maybe')
  })

  it("is IT'S ON when every factor passes", () => {
    expect(scoreSpot(day, { ...RULES, maxWindMph: 15 }).verdict).toBe('on')
  })

  it('lets strong wind pass when it is offshore', () => {
    const score = scoreSpot(day, { ...RULES, offshoreDirs: ['W'] })
    expect(score.verdict).toBe('on')
    expect(score.reasons[4]).toBe('Wind 13 mph from W: pass (offshore)')
  })

  it('fails the tide when 07:00 is not in a ticked band and not near one', () => {
    const score = scoreSpot(day, { ...RULES, maxWindMph: 15, tideBands: ['low'] })
    expect(score.verdict).toBe('no-go')
    expect(score.reasons[3]).toBe('Tide high and falling at 07:00: fail (wants low)')
  })
})

describe('scoreSpot near misses', () => {
  const verdict = (day: DayForecast, rules: Partial<SpotRules> = {}) =>
    scoreSpot(day, { ...RULES, ...rules }).verdict

  it('passes the made-up day outright', () => {
    expect(verdict(flatDay())).toBe('on')
  })

  it('swell size: within 20% under the minimum is a near miss, further is a fail', () => {
    expect(verdict(flatDay({ swellFt: 2.0 }))).toBe('maybe')
    expect(verdict(flatDay({ swellFt: 1.9 }))).toBe('no-go')
  })

  it('swell size: within 20% over the maximum is a near miss, further is a fail', () => {
    expect(verdict(flatDay({ swellFt: 6 }), { maxSwellFt: 6 })).toBe('on')
    expect(verdict(flatDay({ swellFt: 7.2 }), { maxSwellFt: 6 })).toBe('maybe')
    expect(verdict(flatDay({ swellFt: 7.3 }), { maxSwellFt: 6 })).toBe('no-go')
  })

  it('period: within 20% under the minimum is a near miss', () => {
    expect(verdict(flatDay({ periodS: 5.6 }))).toBe('maybe')
    expect(verdict(flatDay({ periodS: 5.5 }))).toBe('no-go')
  })

  it('swell direction: up to 15° outside a ticked slice is a near miss', () => {
    // W covers 247.5° to 292.5°.
    expect(verdict(flatDay({ swellDeg: 292 }), { swellDirs: ['W'] })).toBe('on')
    expect(verdict(flatDay({ swellDeg: 305 }), { swellDirs: ['W'] })).toBe('maybe')
    expect(verdict(flatDay({ swellDeg: 310 }), { swellDirs: ['W'] })).toBe('no-go')
  })

  it('tide: just outside a ticked band is a near miss', () => {
    // On the made-up day 07:00 sits 30% up the range: "low", 3% below the mid band.
    expect(verdict(flatDay(), { tideBands: ['low'] })).toBe('on')
    expect(verdict(flatDay(), { tideBands: ['mid'] })).toBe('maybe')
    expect(verdict(flatDay(), { tideBands: ['high'] })).toBe('no-go')
  })

  it('two near misses are a NO-GO', () => {
    expect(verdict(flatDay({ swellFt: 2.0, periodS: 5.6 }))).toBe('no-go')
  })
})

describe('scoreSpot edge cases', () => {
  it('averages directions around north correctly', () => {
    const day = flatDay()
    // Alternate 350° and 10°: the true average is north, not south.
    day.hours.forEach((h, i) => (h.swellDeg = i % 2 === 0 ? 350 : 10))
    const score = scoreSpot(day, { ...RULES, swellDirs: ['N'] })
    expect(score.reasons[2]).toMatch(/^Swell from N .*: pass$/)
  })

  it('is NO-GO with "no data" reasons when the forecast is empty', () => {
    const empty = flatDay({
      swellFt: null, periodS: null, swellDeg: null, seaLevelM: null, windMph: null, windDeg: null,
    })
    const score = scoreSpot(empty, RULES)
    expect(score.verdict).toBe('no-go')
    expect(score.reasons.every((reason) => reason.includes('no data'))).toBe(true)
    expect(score.swellFt).toBeNull()
  })
})
