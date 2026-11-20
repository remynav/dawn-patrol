/**
 * confirmSession — the captain locks in the spot and meet time, and the crew
 * who are "in" get one email.
 *
 * Owner only. The email costs credits (about 1.3 per send), so:
 *   - it is sent at most once per session (`emailedAt` records the send),
 *   - it is never retried automatically,
 *   - the crew go on bcc, so nobody sees anyone else's address.
 *
 * The email carries an "Add to Google Calendar" link. The email service takes
 * no attachments, so a link stands in for an invite file.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { googleCalendarLink } from '../lib/calendar-link'

// Test accounts use this fake domain. A bad address fails the whole send, so skip them.
const TEST_EMAIL_SUFFIX = '@deepspace.test'
const MEET_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/ // 24-hour HH:MM

export const confirmSession: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  // Server actions bypass role checks, so check the caller ourselves.
  if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) {
    return { success: false, error: 'Only the captain can confirm a session.' }
  }

  const sessionId = String(params.sessionId ?? '')
  const spotId = String(params.spotId ?? '')
  const meetTime = String(params.meetTime ?? '')
  if (!MEET_TIME_PATTERN.test(meetTime)) {
    return { success: false, error: 'Meet time must look like 06:15.' }
  }

  const session = await tools.get('sessions', sessionId)
  if (!session.success) return { success: false, error: 'Session not found.' }
  if (session.data.record.data.emailedAt) {
    return { success: false, error: 'This session was already confirmed and emailed.' }
  }

  const spot = await tools.get('spots', spotId)
  if (!spot.success) return { success: false, error: 'Spot not found.' }
  const spotName = String(spot.data.record.data.name)
  const date = String(session.data.record.data.date)
  const calendarLink = googleCalendarLink({
    title: `Dawn Patrol: ${spotName}`,
    date,
    meetTime,
    lat: Number(spot.data.record.data.lat),
    lon: Number(spot.data.record.data.lon),
  })

  // The captain's own address is the visible recipient and the reply-to.
  const captainEmail = await emailOf(userId)
  if (!captainEmail) return { success: false, error: 'Your account has no email address.' }

  const saved = await tools.update('sessions', sessionId, { spotId, meetTime, status: 'confirmed' })
  if (!saved.success) return { success: false, error: `Could not save the session: ${saved.error}` }

  // Everyone who is in, except the captain (already the "to") and test accounts.
  const rsvps = await tools.query('rsvps', { where: { sessionId, status: 'in' }, limit: 100 })
  const bcc: string[] = []
  for (const rsvp of rsvps.success ? rsvps.data.records : []) {
    const crewId = String(rsvp.data.userId)
    if (crewId === userId) continue
    const email = await emailOf(crewId)
    if (email && !email.endsWith(TEST_EMAIL_SUFFIX) && !bcc.includes(email)) bcc.push(email)
  }

  // One send, no retry.
  const sent = await tools.integration('email/send', {
    to: captainEmail,
    ...(bcc.length > 0 ? { bcc } : {}),
    reply_to: captainEmail,
    subject: `Dawn Patrol is on: ${spotName}, ${date} at ${meetTime}`,
    text:
      `Dawn Patrol is confirmed.\n\n` +
      `Spot: ${spotName}\nDate: ${date}\nMeet: ${meetTime}\n\n` +
      `Add to Google Calendar: ${calendarLink}\n\n` +
      `You are getting this because you are the captain or you tapped "I'm in". ` +
      `Reply to reach the captain.`,
  })
  if (!sent.success) {
    return {
      success: false,
      error: `The session is confirmed, but the email failed: ${sent.error}. Press confirm again to resend.`,
    }
  }

  await tools.update('sessions', sessionId, { emailedAt: new Date().toISOString() })
  return { success: true, data: { emailed: bcc.length + 1 } }

  /** A user's email from the users collection (record id = user id), or '' if unknown. */
  async function emailOf(id: string): Promise<string> {
    const user = await tools.get('users', id)
    return user.success ? String(user.data.record.data.email ?? '') : ''
  }
}
