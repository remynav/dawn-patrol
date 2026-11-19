import { describe, expect, it, vi } from 'vitest'
import marine from '../../tests/fixtures/marine-malibu.json'
import wind from '../../tests/fixtures/wind-malibu.json'
import { buildDay, fetchTomorrow, tomorrowAt, type OpenMeteoResponse } from './forecast'

const MARINE = marine as unknown as OpenMeteoResponse
const WIND = wind as unknown as OpenMeteoResponse
const PACIFIC = -8 * 3600 // the fixture's utc_offset_seconds

describe('tomorrowAt', () => {
  it("uses the spot's date, not the server's", () => {
    // 04:00 UTC on Nov 19 is still 20:00 on Nov 18 in Malibu, so tomorrow there is Nov 19.
    expect(tomorrowAt(PACIFIC, new Date('2026-11-19T04:00:00Z'))).toBe('2026-11-19')
    // 09:00 UTC on Nov 19 is 01:00 on Nov 19 in Malibu, so tomorrow is Nov 20.
    expect(tomorrowAt(PACIFIC, new Date('2026-11-19T09:00:00Z'))).toBe('2026-11-20')
  })
})

describe('buildDay', () => {
  it('picks the 24 hours of one date and converts to feet and mph', () => {
    const day = buildDay(MARINE, WIND, '2026-11-19')
    expect(day.hours).toHaveLength(24)
    const five = day.hours[5]
    // Fixture at 2026-11-19T05:00: swell 1.0 m, wind 42.6 km/h from 216°.
    expect(five.swellFt).toBeCloseTo(3.28, 2)
    expect(five.windMph).toBeCloseTo(26.47, 2)
    expect(five.windDeg).toBe(216)
    expect(five.seaLevelM).toBe(1.03)
  })

  it('gives nulls for a date that is not in the response', () => {
    const day = buildDay(MARINE, WIND, '2030-01-01')
    expect(day.hours.every((h) => h.swellFt === null && h.windMph === null)).toBe(true)
  })
})

describe('fetchTomorrow', () => {
  const fakeFetch = (ok = true) =>
    vi.fn(async (url: string | URL | Request) => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => (String(url).includes('marine-api') ? MARINE : WIND),
    })) as unknown as typeof fetch

  it('makes exactly two requests and returns tomorrow at the spot', async () => {
    const fetchFn = fakeFetch()
    const day = await fetchTomorrow(34.03, -118.68, new Date('2026-11-19T04:00:00Z'), fetchFn)
    expect(day.date).toBe('2026-11-19')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const urls = vi.mocked(fetchFn).mock.calls.map((call) => String(call[0]))
    expect(urls.every((url) => url.includes('timezone=auto') && url.includes('forecast_days=3'))).toBe(true)
  })

  it('throws when Open-Meteo answers with an error', async () => {
    await expect(fetchTomorrow(34, -118, new Date(), fakeFetch(false))).rejects.toThrow('Open-Meteo')
  })
})
