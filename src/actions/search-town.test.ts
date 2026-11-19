import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { searchTown } from './search-town'

// The paid integration is always mocked here. These tests spend nothing.
const env = { OWNER_USER_ID: 'owner-1' } as Env

function run(userId: string, query: unknown, integration = vi.fn()) {
  const tools = { integration } as unknown as ActionTools
  return searchTown({ userId, params: { query }, tools, env, callerJwt: 'test' })
}

describe('searchTown', () => {
  it('refuses anyone who is not the owner, without calling the integration', async () => {
    const integration = vi.fn()
    const result = await run('someone-else', 'Malibu', integration)
    expect(result.success).toBe(false)
    expect(integration).not.toHaveBeenCalled()
  })

  it('refuses an empty query without calling the integration', async () => {
    const integration = vi.fn()
    const result = await run('owner-1', '  ', integration)
    expect(result.success).toBe(false)
    expect(integration).not.toHaveBeenCalled()
  })

  it('calls geocoding once with limit 5 and returns the towns', async () => {
    const integration = vi.fn().mockResolvedValue({
      success: true,
      data: [{ name: 'Malibu', lat: 34.03, lon: -118.68, country: 'US', state: 'California' }],
    })
    const result = await run('owner-1', ' Malibu ', integration)
    expect(integration).toHaveBeenCalledTimes(1)
    expect(integration).toHaveBeenCalledWith('openweathermap/geocoding', { query: 'Malibu', limit: 5 })
    expect(result).toEqual({
      success: true,
      data: [{ name: 'Malibu', state: 'California', country: 'US', lat: 34.03, lon: -118.68 }],
    })
  })

  it('returns an empty list when nothing matches (for example a beach name)', async () => {
    const integration = vi.fn().mockResolvedValue({ success: true, data: [] })
    const result = await run('owner-1', 'Zuma Beach', integration)
    expect(result).toEqual({ success: true, data: [] })
  })

  it('reports an integration failure and does not retry', async () => {
    const integration = vi.fn().mockResolvedValue({ success: false, error: 'boom' })
    const result = await run('owner-1', 'Malibu', integration)
    expect(result.success).toBe(false)
    expect(integration).toHaveBeenCalledTimes(1)
  })
})
