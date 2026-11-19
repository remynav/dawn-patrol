/**
 * The forecast job. For every spot it fetches tomorrow's forecast (free
 * Open-Meteo calls), scores it with the captain's rules, and saves one
 * `calls` record per spot per date.
 *
 * Two things run it: the nightly cron task (src/cron.ts) and the captain's
 * "Refresh now" button (src/actions/refresh-now.ts). Both pass in the same
 * `records` object from buildCronContext, so there is one code path.
 */

import type { CronContext } from 'deepspace/worker'
import { fetchTomorrow } from '../lib/forecast'
import { scoreSpot, type SpotRules } from '../lib/score'

type Records = CronContext['records']

/** How a stored record comes back from records.query. */
interface Stored {
  recordId: string
  data: Record<string, unknown>
}

export const MAX_SPOTS = 6
export const COOLDOWN_MINUTES = 10
// The `settings` collection (admin-only key/value rows) holds the last manual refresh time.
const LAST_REFRESH_KEY = 'lastRefreshAt'

export interface RefreshSummary {
  written: number // calls saved
  failed: string[] // names of spots whose forecast could not be fetched or scored
}

export async function refreshCalls(
  records: Records,
  now: Date,
  fetchFn: typeof fetch = fetch,
): Promise<RefreshSummary> {
  const spots = (await records.query('spots', { limit: MAX_SPOTS })) as Stored[]
  const summary: RefreshSummary = { written: 0, failed: [] }

  // One spot at a time. A failure on one spot must not stop the others.
  for (const spot of spots) {
    const name = String(spot.data.name ?? spot.recordId)
    try {
      const day = await fetchTomorrow(Number(spot.data.lat), Number(spot.data.lon), now, fetchFn)
      const score = scoreSpot(day, rulesOf(spot.data))
      await saveCall(records, { spotId: spot.recordId, date: day.date, ...score, summary: '' })
      summary.written++
    } catch (error) {
      console.error(`[forecast] ${name} failed: ${String(error)}`)
      summary.failed.push(name)
    }
  }
  return summary
}

/** Read the rule columns off a spot record, with safe values for anything missing. */
function rulesOf(data: Record<string, unknown>): SpotRules {
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : [])
  return {
    minSwellFt: Number(data.minSwellFt ?? 0),
    maxSwellFt: data.maxSwellFt == null ? undefined : Number(data.maxSwellFt),
    minPeriodS: Number(data.minPeriodS ?? 0),
    swellDirs: list(data.swellDirs),
    tideBands: list(data.tideBands),
    maxWindMph: Number(data.maxWindMph ?? 0),
    offshoreDirs: list(data.offshoreDirs),
  }
}

/** One call per spot per date: update it if it exists, create it if not. */
async function saveCall(records: Records, call: Record<string, unknown>): Promise<void> {
  const existing = (await records.query('calls', {
    where: { spotId: call.spotId, date: call.date },
    limit: 1,
  })) as Stored[]
  if (existing.length > 0) {
    await records.update('calls', existing[0].recordId, call)
  } else {
    await records.create('calls', call)
  }
}

export type ManualRefreshResult =
  | { ok: true; summary: RefreshSummary }
  | { ok: false; minutesLeft: number }

/**
 * The captain's "Refresh now": the same job, but at most once per cooldown.
 * The cooldown is checked here on the server, so it cannot be skipped from
 * the browser.
 */
export async function refreshCallsWithCooldown(
  records: Records,
  now: Date,
  fetchFn: typeof fetch = fetch,
): Promise<ManualRefreshResult> {
  const rows = (await records.query('settings', { where: { key: LAST_REFRESH_KEY }, limit: 1 })) as Stored[]
  const last = rows[0]

  if (last) {
    const elapsedMs = now.getTime() - Date.parse(String(last.data.value))
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000
    if (elapsedMs < cooldownMs) {
      return { ok: false, minutesLeft: Math.ceil((cooldownMs - elapsedMs) / 60000) }
    }
  }

  // Save the time BEFORE running, so a second click during the run is refused.
  const stamp = { key: LAST_REFRESH_KEY, value: now.toISOString() }
  if (last) await records.update('settings', last.recordId, stamp)
  else await records.create('settings', stamp)

  return { ok: true, summary: await refreshCalls(records, now, fetchFn) }
}
