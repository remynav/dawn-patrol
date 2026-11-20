/**
 * The AI summary: two sentences explaining tonight's calls.
 *
 * The rules in src/lib/score.ts have already decided every verdict. The model
 * only puts them into words and can change nothing. If the call fails for any
 * reason the summary is empty and the page shows the reasons on their own.
 *
 * Cost: one small paid call per forecast run. The model and max_tokens are
 * always set, because the endpoint's defaults are the largest model and 4096
 * tokens. There is no retry.
 *
 * max_tokens has to cover the model's reasoning as well as the two sentences.
 * With 150 the reasoning used the whole budget and the call failed every time.
 */

/** Calls a platform integration and returns its response body (ctx.integrations.call). */
export type CallIntegration = (endpoint: string, params: Record<string, unknown>) => Promise<unknown>

const MODEL = 'claude-haiku-5-5'
const MAX_TOKENS = 1000
const MAX_SUMMARY_LENGTH = 400

const SYSTEM_PROMPT =
  "You write the evening surf call for a small crew. In exactly two short sentences, say which " +
  "spot looks best for tomorrow's dawn session and why, using only the facts given. The verdicts " +
  'are final: never change or question them. Plain text only.'

/** `lines` is one line per spot: its name, verdict and reasons. Returns '' on any failure. */
export async function summarizeCalls(callIntegration: CallIntegration, lines: string[]): Promise<string> {
  if (lines.length === 0) return ''
  try {
    const response = (await callIntegration('anthropic/chat-completion', {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: lines.join('\n') }],
    })) as { content?: Array<{ text?: unknown }> }

    // The reply is a list of blocks. A reasoning block can come first, so take
    // the first block that carries text.
    const blocks = Array.isArray(response?.content) ? response.content : []
    const text = blocks.find((block) => typeof block?.text === 'string')?.text
    if (typeof text !== 'string') {
      console.error('[forecast] summary reply had no text')
      return ''
    }
    return text.trim().slice(0, MAX_SUMMARY_LENGTH)
  } catch (error) {
    console.error(`[forecast] summary failed: ${String(error)}`)
    return ''
  }
}
