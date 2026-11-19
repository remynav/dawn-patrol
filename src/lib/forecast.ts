/**
 * Forecast fetch — tomorrow's swell, tide and wind for one spot.
 *
 * Both sources are free Open-Meteo APIs that need no key, so this is a plain
 * fetch and costs no credits. Open-Meteo answers in metres and km/h; we
 * convert once here, and everything after this file is in feet and mph.
 *
 * With timezone=auto the hourly times come back as LOCAL time at the spot,
 * with no offset, like "2026-11-19T07:00".
 */

import type { DayForecast, HourForecast } from './score'

const FEET_PER_METRE = 3.28084
const MPH_PER_KMH = 0.621371

/** The parts of an Open-Meteo response that we read. */
export interface OpenMeteoResponse {
  utc_offset_seconds: number
  hourly: { time: string[] } & Record<string, Array<number | string | null>>
}

/**
 * Tomorrow's date (YYYY-MM-DD) at the spot. The server runs in UTC, so we
 * shift "now" by the spot's UTC offset before reading the date.
 */
export function tomorrowAt(utcOffsetSeconds: number, now: Date): string {
  const DAY_MS = 24 * 60 * 60 * 1000
  const localTomorrow = new Date(now.getTime() + utcOffsetSeconds * 1000 + DAY_MS)
  return localTomorrow.toISOString().slice(0, 10)
}

/** Pick one date's 24 hours out of the two responses and convert the units. */
export function buildDay(marine: OpenMeteoResponse, wind: OpenMeteoResponse, date: string): DayForecast {
  const hours: HourForecast[] = []
  for (let hour = 0; hour < 24; hour++) {
    const time = `${date}T${String(hour).padStart(2, '0')}:00`
    const m = marine.hourly.time.indexOf(time)
    const w = wind.hourly.time.indexOf(time)
    const swellM = valueAt(marine, 'swell_wave_height', m)
    const windKmh = valueAt(wind, 'wind_speed_10m', w)
    hours.push({
      hour,
      swellFt: swellM === null ? null : swellM * FEET_PER_METRE,
      periodS: valueAt(marine, 'swell_wave_period', m),
      swellDeg: valueAt(marine, 'swell_wave_direction', m),
      seaLevelM: valueAt(marine, 'sea_level_height_msl', m),
      windMph: windKmh === null ? null : windKmh * MPH_PER_KMH,
      windDeg: valueAt(wind, 'wind_direction_10m', w),
    })
  }
  return { date, hours }
}

/** One hourly value, or null when the hour or the number is missing. */
function valueAt(response: OpenMeteoResponse, field: string, index: number): number | null {
  if (index < 0) return null
  const value = response.hourly[field]?.[index]
  return typeof value === 'number' ? value : null
}

/**
 * Fetch tomorrow at a spot. Two requests, no retry. Throws if either fails.
 * `fetchFn` is a parameter so tests can pass a fake and never hit the network.
 */
export async function fetchTomorrow(
  lat: number,
  lon: number,
  now: Date,
  fetchFn: typeof fetch = fetch,
): Promise<DayForecast> {
  // Three days, so "tomorrow at the spot" is always inside the response.
  const common = `latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=3`
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?${common}` +
    '&hourly=swell_wave_height,swell_wave_period,swell_wave_direction,sea_level_height_msl'
  const windUrl =
    `https://api.open-meteo.com/v1/forecast?${common}` +
    '&hourly=wind_speed_10m,wind_direction_10m'

  const [marine, wind] = await Promise.all([getJson(marineUrl, fetchFn), getJson(windUrl, fetchFn)])
  return buildDay(marine, wind, tomorrowAt(marine.utc_offset_seconds, now))
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<OpenMeteoResponse> {
  const response = await fetchFn(url)
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`)
  return (await response.json()) as OpenMeteoResponse
}
