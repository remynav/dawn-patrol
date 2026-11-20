import { describe, expect, it } from 'vitest'
import { googleCalendarLink } from './calendar-link'

describe('googleCalendarLink', () => {
  it('builds a two-hour event with the title and the spot coordinates', () => {
    const link = new URL(
      googleCalendarLink({ title: 'Dawn Patrol: Surfrider', date: '2026-11-22', meetTime: '06:15', lat: 34.03, lon: -118.68 }),
    )
    expect(link.origin + link.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(link.searchParams.get('action')).toBe('TEMPLATE')
    expect(link.searchParams.get('text')).toBe('Dawn Patrol: Surfrider')
    expect(link.searchParams.get('dates')).toBe('20261122T061500/20261122T081500')
    expect(link.searchParams.get('location')).toBe('34.03,-118.68')
  })

  it('rolls over midnight and the end of the month', () => {
    const link = new URL(googleCalendarLink({ title: 'Late', date: '2026-11-30', meetTime: '23:30' }))
    expect(link.searchParams.get('dates')).toBe('20261130T233000/20261201T013000')
    expect(link.searchParams.has('location')).toBe(false)
  })
})
