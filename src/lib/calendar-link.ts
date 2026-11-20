/**
 * An "Add to Google Calendar" link for a session.
 *
 * It is only a URL: no Google integration, no sign-in and no cost. The times
 * carry no timezone, so Google uses the timezone of whoever opens the link.
 * That is right for a crew that lives near the spot.
 */

// How long the calendar event lasts.
const SESSION_HOURS = 2

export interface CalendarEvent {
  title: string
  date: string // YYYY-MM-DD
  meetTime: string // 24-hour HH:MM
  lat?: number
  lon?: number
}

export function googleCalendarLink(event: CalendarEvent): string {
  const [year, month, day] = event.date.split('-').map(Number)
  const [hour, minute] = event.meetTime.split(':').map(Number)

  // Do the clock maths in UTC so a late session rolls over midnight correctly.
  // The result is still treated as local wall-clock time (no "Z" on the end).
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const end = new Date(start.getTime() + SESSION_HOURS * 60 * 60 * 1000)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(start)}/${stamp(end)}`,
  })
  if (typeof event.lat === 'number' && typeof event.lon === 'number') {
    params.set('location', `${event.lat},${event.lon}`)
  }
  return `https://calendar.google.com/calendar/render?${params}`
}

/** 2026-11-22T06:15:00.000Z becomes 20261122T061500. */
function stamp(time: Date): string {
  return time.toISOString().slice(0, 19).replace(/[-:]/g, '')
}
