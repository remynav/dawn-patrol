/**
 * refreshNow — the captain's "Refresh now" button.
 *
 * Owner only, and limited by a server-side cooldown. It runs the same job as
 * the nightly cron task (src/server/refresh-calls.ts).
 */

import { buildCronContext, type ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { refreshCallsWithCooldown } from '../server/refresh-calls'

export const refreshNow: ActionHandler<Env> = async ({ userId, env }) => {
  // Server actions bypass role checks, so check the caller ourselves.
  if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) {
    return { success: false, error: 'Only the captain can refresh the forecast.' }
  }

  const { records } = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  const result = await refreshCallsWithCooldown(records, new Date())
  if (!result.ok) {
    return { success: false, error: `Refreshed recently. Try again in ${result.minutesLeft} min.` }
  }
  return { success: true, data: result.summary }
}
