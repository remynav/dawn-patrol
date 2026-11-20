import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { confirmSession } from './confirm-session'

// The paid email call is always a mock here. No email is ever sent by these tests.
const env = { OWNER_USER_ID: 'captain' } as Env

type Tables = Record<string, Record<string, Record<string, unknown>>>

function setup(emailResult: unknown = { success: true, data: {} }) {
  const tables: Tables = {
    sessions: { s1: { date: '2026-11-22', spotId: 'old', meetTime: '06:00', status: 'open', emailedAt: '' } },
    spots: { malibu: { name: 'Surfrider', lat: 34.03, lon: -118.68 } },
    users: {
      captain: { email: 'captain@example.com' },
      ana: { email: 'ana@example.com' },
      ben: { email: 'ben@example.com' },
      bot: { email: 'crew-a@deepspace.test' },
    },
  }
  const rsvps = [
    { data: { sessionId: 's1', userId: 'captain', status: 'in' } },
    { data: { sessionId: 's1', userId: 'ana', status: 'in' } },
    { data: { sessionId: 's1', userId: 'bot', status: 'in' } },
    { data: { sessionId: 's1', userId: 'ben', status: 'out' } },
  ]
  const integration = vi.fn(async () => emailResult)
  const tools = {
    async get(collection: string, id: string) {
      const data = tables[collection]?.[id]
      return data ? { success: true, data: { record: { recordId: id, data } } } : { success: false, error: 'not found' }
    },
    async update(collection: string, id: string, data: Record<string, unknown>) {
      Object.assign(tables[collection][id], data)
      return { success: true, data: { recordId: id } }
    },
    async query(_collection: string, opts: { where: Record<string, unknown> }) {
      const records = rsvps.filter((r) =>
        Object.entries(opts.where).every(([k, v]) => (r.data as Record<string, unknown>)[k] === v),
      )
      return { success: true, data: { records, count: records.length } }
    },
    integration,
  } as unknown as ActionTools
  const run = (userId: string, params: Record<string, unknown>) =>
    confirmSession({ userId, params, tools, env, callerJwt: 'test' })
  return { tables, integration, run }
}

const PARAMS = { sessionId: 's1', spotId: 'malibu', meetTime: '06:15' }

describe('confirmSession', () => {
  it('refuses anyone who is not the owner and sends nothing', async () => {
    const { run, integration, tables } = setup()
    const result = await run('ana', PARAMS)
    expect(result.success).toBe(false)
    expect(integration).not.toHaveBeenCalled()
    expect(tables.sessions.s1.status).toBe('open')
  })

  it('refuses a badly formed meet time', async () => {
    const { run, integration } = setup()
    expect((await run('captain', { ...PARAMS, meetTime: '6am' })).success).toBe(false)
    expect(integration).not.toHaveBeenCalled()
  })

  it('confirms the session and sends one email, crew who are in on bcc', async () => {
    const { run, integration, tables } = setup()
    const result = await run('captain', PARAMS)

    expect(result).toEqual({ success: true, data: { emailed: 2 } })
    expect(tables.sessions.s1).toMatchObject({ spotId: 'malibu', meetTime: '06:15', status: 'confirmed' })
    expect(tables.sessions.s1.emailedAt).not.toBe('')

    expect(integration).toHaveBeenCalledTimes(1)
    const [endpoint, body] = integration.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(endpoint).toBe('email/send')
    expect(body.to).toBe('captain@example.com')
    expect(body.reply_to).toBe('captain@example.com')
    // Only Ana: the captain is the "to", Ben is out, and the test account is skipped.
    expect(body.bcc).toEqual(['ana@example.com'])
    expect(body.subject).toBe('Dawn Patrol is on: Surfrider, 2026-11-22 at 06:15')
    expect(body.from).toBeUndefined()
    // One body goes to everyone, so it must be true for the captain too.
    expect(body.text).toContain('Add to Google Calendar: https://calendar.google.com/calendar/render?')
    expect(body.text).toContain('dates=20261122T061500%2F20261122T081500')
    expect(body.text).toContain('you are the captain or you tapped "I\'m in"')
  })

  it('will not email the same session twice', async () => {
    const { run, integration } = setup()
    await run('captain', PARAMS)
    const again = await run('captain', PARAMS)
    expect(again.success).toBe(false)
    expect(integration).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed send, and leaves the session resendable', async () => {
    const { run, integration, tables } = setup({ success: false, error: 'validation failed' })
    const result = await run('captain', PARAMS)
    expect(result.success).toBe(false)
    expect(integration).toHaveBeenCalledTimes(1)
    expect(tables.sessions.s1.status).toBe('confirmed')
    expect(tables.sessions.s1.emailedAt).toBe('')
  })
})
