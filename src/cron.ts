/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket.
 *
 * Each task declares EITHER `intervalMinutes` (run every N minutes) OR
 * `schedule` + `timezone` (5-field cron expression). CronRoom validates
 * the config at construction time and throws on ambiguous declarations.
 *
 * Example:
 *
 *   import type { CronTask } from 'deepspace/worker'
 *   import { buildCronContext } from 'deepspace/worker'
 *
 *   export const tasks: CronTask[] = [
 *     { name: 'heartbeat', intervalMinutes: 1 },
 *     { name: 'daily-report', schedule: '0 9 * * *', timezone: 'America/New_York' },
 *   ]
 *
 *   export async function runTask(name: string, env: Env): Promise<void> {
 *     const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
 *     if (name === 'heartbeat') {
 *       // …
 *     }
 *   }
 */

import { buildCronContext, type CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { refreshCalls } from './server/refresh-calls'

// Once a day, in the evening, on a schedule with a timezone. Never an interval:
// from Sunday each run also makes one paid AI call.
export const tasks: CronTask[] = [
  { name: 'nightly-forecast', schedule: '0 18 * * *', timezone: 'America/Los_Angeles' },
]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== 'nightly-forecast') return

  const { records } = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  const summary = await refreshCalls(records, new Date())
  console.info(`[forecast] wrote ${summary.written} calls, ${summary.failed.length} failed`)
  // Throw when nothing worked, so the run shows as failed in the cron history.
  if (summary.written === 0 && summary.failed.length > 0) {
    throw new Error(`Forecast failed for every spot: ${summary.failed.join(', ')}`)
  }
}
