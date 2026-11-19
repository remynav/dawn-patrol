/**
 * searchTown — captain-only town search for the add-spot form.
 *
 * Calls the paid openweathermap/geocoding integration (about 0.2 credits per
 * search), so it is gated to the app owner. It finds towns, not beaches: the
 * captain picks the nearest town and then adjusts lat/lon by hand.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

export interface Town {
  name: string
  state: string
  country: string
  lat: number
  lon: number
}

export const searchTown: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  // Server actions bypass role checks, so check the caller ourselves.
  if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) {
    return { success: false, error: 'Only the captain can search for towns.' }
  }

  const query = typeof params.query === 'string' ? params.query.trim() : ''
  if (query.length < 2 || query.length > 80) {
    return { success: false, error: 'Type a town name (2 to 80 characters).' }
  }

  // One call, no retry: every call costs credits.
  const result = await tools.integration<unknown>('openweathermap/geocoding', { query, limit: 5 })
  if (!result.success) {
    return { success: false, error: `Town search failed: ${result.error}` }
  }

  // The integration returns an array (empty when nothing matches).
  const rows = Array.isArray(result.data) ? result.data : []
  const towns: Town[] = []
  for (const row of rows as Array<Record<string, unknown>>) {
    if (typeof row.lat !== 'number' || typeof row.lon !== 'number') continue
    towns.push({
      name: String(row.name ?? ''),
      state: String(row.state ?? ''),
      country: String(row.country ?? ''),
      lat: row.lat,
      lon: row.lon,
    })
  }
  return { success: true, data: towns }
}
