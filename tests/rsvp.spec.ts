/**
 * Two-user RSVP test: an RSVP made in one browser shows up in the other
 * without a reload, and both see each other as "here now".
 *
 * Needs, on this machine:
 *   1. Two test accounts (see tests/collab.spec.ts for how to create them).
 *   2. A session in the local data. Test accounts are crew and cannot create
 *      one, so sign in as the owner on the local dev server and click
 *      "Refresh now" once. That uses the free Open-Meteo API only.
 *
 * It spends no credits: RSVPs are plain record writes.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. See tests/collab.spec.ts.`,
)

/** The number of names in one of the session card's lists. */
const count = async (page: Page, testId: string) =>
  Number(await page.getByTestId(testId).getAttribute('data-count'))

test('an RSVP in one browser appears in the other without a reload', async ({ users }) => {
  const [a, b] = await users(2)
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  const hasSession = await a.page
    .getByTestId('session-card')
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasSession, 'No session in local data. As the owner, click "Refresh now" once.')
  await expect(b.page.getByTestId('session-card')).toBeVisible({ timeout: 15_000 })

  // Start from a known state: A is out.
  await a.page.getByRole('button', { name: "I'm out" }).click()
  await expect(a.page.getByTestId('rsvp-out-list')).toContainText('You')
  const inBefore = await count(a.page, 'rsvp-in-list')
  const outBefore = await count(a.page, 'rsvp-out-list')
  // B converges on the same lists.
  await expect(b.page.getByTestId('rsvp-in-list')).toHaveAttribute('data-count', String(inBefore))
  await expect(b.page.getByTestId('rsvp-out-list')).toHaveAttribute('data-count', String(outBefore))

  // A taps in. B sees one more person in and one fewer out, with no reload.
  await a.page.getByRole('button', { name: "I'm in" }).click()
  await expect(a.page.getByTestId('rsvp-in-list')).toContainText('You')
  await expect(b.page.getByTestId('rsvp-in-list')).toHaveAttribute('data-count', String(inBefore + 1))
  await expect(b.page.getByTestId('rsvp-out-list')).toHaveAttribute('data-count', String(outBefore - 1))
  // On B's screen the new name is A's, not "You".
  await expect(b.page.getByTestId('rsvp-in-list')).not.toContainText('You')

  // A changes their mind. Still one RSVP per person: the row moves back.
  await a.page.getByRole('button', { name: "I'm out" }).click()
  await expect(b.page.getByTestId('rsvp-in-list')).toHaveAttribute('data-count', String(inBefore))
  await expect(b.page.getByTestId('rsvp-out-list')).toHaveAttribute('data-count', String(outBefore))
})

test('both users see each other as here now', async ({ users }) => {
  const [a, b] = await users(2)
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  const hasSession = await a.page
    .getByTestId('session-card')
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!hasSession, 'No session in local data. As the owner, click "Refresh now" once.')

  // "You" plus at least the other browser.
  for (const user of [a, b]) {
    await expect.poll(() => count(user.page, 'here-now-list'), { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
  }
})
