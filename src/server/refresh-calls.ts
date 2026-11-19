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
import { scoreSpot, type SpotRules, type Verdict } from '../lib/score'

type Records = CronContext['records']

/** How a stored record comes back from records.query. */
interface Stored {
  recordId: string
  data: Record<string, unknown>
}

export const MAX_SPOTS = 6
export const COOLDOWN_MINUTES = 10
export const DEFAULT_MEET_TIME = '06:00'
// Best verdict first, for picking the proposed spot.
const VERDICT_RANK: Record<Verdict, number> = { on: 0, maybe: 1, 'no-go': 2 }
// The `settings` collection (admin-only key/value rows) holds the last manual refresh time.
const LAST_REFRESH_KEY = 'lastRefreshAt'

/** Turns one line per spot into a short text. Returns '' when it cannot. */
export type Summarize = (lines: string[]) => Promise<string>

const VERDICT_LABEL: Record<Verdict, string> = { on: "IT'S ON", maybe: 'MAYBE', 'no-go': 'NO-GO' }

export interface RefreshSummary {
  written: number // calls saved
  failed: string[] // names of spots whose forecast could not be fetched or scored
}

export async function refreshCalls(
  records: Records,
  now: Date,
  fetchFn: typeof fetch = fetch,
  summarize?: Summarize,
): Promise<RefreshSummary> {
  const spots = (await records.query('spots', { limit: MAX_SPOTS })) as Stored[]
  const summary: RefreshSummary = { written: 0, failed: [] }
  // The best-scoring spot so far, to propose for tomorrow's session.
  let best: { spotId: string; date: string; verdict: Verdict } | null = null
  // One line per scored spot, for the AI summary.
  const lines: string[] = []

  // One spot at a time. A failure on one spot must not stop the others.
  for (const spot of spots) {
    const name = String(spot.data.name ?? spot.recordId)
    try {
      const day = await fetchTomorrow(Number(spot.data.lat), Number(spot.data.lon), now, fetchFn)
      const score = scoreSpot(day, rulesOf(spot.data))
      await saveCall(records, { spotId: spot.recordId, date: day.date, ...score, summary: '' })
      summary.written++
      lines.push(`${name}: ${VERDICT_LABEL[score.verdict]}. ${score.reasons.join('; ')}`)
      // Strictly better only, so on a tie the spot added first wins.
      if (!best || VERDICT_RANK[score.verdict] < VERDICT_RANK[best.verdict]) {
        best = { spotId: spot.recordId, date: day.date, verdict: score.verdict }
      }
    } catch (error) {
      console.error(`[forecast] ${name} failed: ${String(error)}`)
      summary.failed.push(name)
    }
  }

  if (best) {
    await saveSession(records, best.date, best.spotId)
    // The summary is optional: an empty result just leaves the reasons on their own.
    const text = summarize ? await summarize(lines) : ''
    if (text) await saveCall(records, { spotId: best.spotId, date: best.date, summary: text })
  }
  return summary
}

/**
 * One session per date, for the crew to RSVP to. Create it open with the
 * proposed spot, or update the proposal while it is still open. A session the
 * captain has confirmed is never changed here.
 */
async function saveSession(records: Records, date: string, spotId: string): Promise<void> {
  const existing = (await records.query('sessions', { where: { date }, limit: 1 })) as Stored[]
  if (existing.length === 0) {
    await records.create('sessions', {
      date, spotId, meetTime: DEFAULT_MEET_TIME, status: 'open', emailedAt: '',
    })
  } else if (existing[0].data.status === 'open') {
    await records.update('sessions', existing[0].recordId, { spotId })
  }
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
  summarize?: Summarize,
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

  return { ok: true, summary: await refreshCalls(records, now, fetchFn, summarize) }
}
