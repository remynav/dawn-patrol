See [AGENTS.md](./AGENTS.md).

# Dawn Patrol project rules

## How to work with me
- Start each stage by proposing a short plan and the files you will touch. Wait for my OK before editing.
- Make targeted edits that keep the scaffold's structure. Do not rewrite or reorganize files you do not need to change.
- Use DeepSpace primitives (records, permissions, server actions, cron, presence) instead of hand-rolled versions.
- After each step, tell me what you changed, how you checked it, and what I should verify myself.
- Commit after each working step with a clear message. Do not deploy; I run `npx deepspace deploy` myself.
- If something is blocked or an assumption in SPEC.md turns out to be wrong, stop and tell me. Do not silently swap in a workaround.
- I will explain and modify this code in a live session, so prefer simple, readable code over clever code.

## Money and safety rules (I have under 500 credits, about $5)
- Never call a paid integration in a loop, a test or a retry. Ask before any `npx deepspace integrations invoke`.
- Tests mock the paid integrations and the Open-Meteo fetches, using the JSON in tests/fixtures/.
- Every Claude call sets model "claude-haiku-5-5" and a small max_tokens. The endpoint defaults to claude-opus-5-5 and 4096 tokens.
- Cron runs once a day on a schedule with a timezone. Never use a short interval. Trigger tasks by hand to test them.
- Every paid call runs server-side, in cron or an owner-only server action. No integration calls from the browser.
- Never commit .dev.vars or anything from ~/.deepspace. Do not change the google or composio lines in src/integrations.ts.
- Git: `space` is the DeepSpace source remote and `origin` is GitHub. Never run `git push --mirror`.
