import { describe, expect, it } from 'vitest'
import { compassPoint } from './compass'

describe('compassPoint', () => {
  it('maps the centre of each slice to its point', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassPoint)).toEqual(
      ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    )
  })

  it('wraps around north', () => {
    expect(compassPoint(350)).toBe('N')
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(-10)).toBe('N')
  })

  it('switches point at the slice edge', () => {
    expect(compassPoint(22)).toBe('N')
    expect(compassPoint(23)).toBe('NE')
    expect(compassPoint(250)).toBe('W')
    expect(compassPoint(240)).toBe('SW')
  })
})

describe('angleBetween and averageDirection', () => {
  it('measures the short way round', async () => {
    const { angleBetween } = await import('./compass')
    expect(angleBetween(350, 10)).toBe(20)
    expect(angleBetween(90, 270)).toBe(180)
  })

  it('averages across north', async () => {
    const { averageDirection } = await import('./compass')
    expect(averageDirection([350, 10])).toBe(0)
    expect(averageDirection([260, 280])).toBe(270)
  })
})
