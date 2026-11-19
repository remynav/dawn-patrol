import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { refreshNow } from './refresh-now'

describe('refreshNow', () => {
  it('refuses anyone who is not the owner before touching anything', async () => {
    // env has no record room or network bindings, so reaching them would throw.
    const env = { OWNER_USER_ID: 'owner-1' } as Env
    const result = await refreshNow({
      userId: 'someone-else', params: {}, tools: {} as ActionTools, env, callerJwt: 'test',
    })
    expect(result).toEqual({ success: false, error: 'Only the captain can refresh the forecast.' })
  })
})
