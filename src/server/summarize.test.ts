import { describe, expect, it, vi } from 'vitest'
import { summarizeCalls } from './summarize'

// The paid AI call is always a mock here. These tests spend nothing.
const LINES = ["Calm Cove: IT'S ON. Swell 3.7 ft: pass"]

describe('summarizeCalls', () => {
  it('always sends the small model and a small max_tokens, once', async () => {
    const call = vi.fn(async () => ({ content: [{ type: 'text', text: ' Calm Cove is on. ' }] }))
    const text = await summarizeCalls(call, LINES)

    expect(text).toBe('Calm Cove is on.')
    expect(call).toHaveBeenCalledTimes(1)
    const [endpoint, params] = call.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(endpoint).toBe('anthropic/chat-completion')
    expect(params.model).toBe('claude-haiku-5-5')
    expect(params.max_tokens).toBe(150)
    expect(params.messages).toEqual([{ role: 'user', content: LINES[0] }])
  })

  it('returns an empty string when the call throws, and does not retry', async () => {
    const call = vi.fn(async () => {
      throw new Error('502')
    })
    expect(await summarizeCalls(call, LINES)).toBe('')
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('returns an empty string for an unexpected response shape', async () => {
    expect(await summarizeCalls(async () => ({ nope: true }), LINES)).toBe('')
  })

  it('makes no call when there is nothing to summarize', async () => {
    const call = vi.fn()
    expect(await summarizeCalls(call, [])).toBe('')
    expect(call).not.toHaveBeenCalled()
  })

  it('caps a long reply', async () => {
    const call = async () => ({ content: [{ text: 'x'.repeat(1000) }] })
    expect(await summarizeCalls(call, LINES)).toHaveLength(400)
  })
})
