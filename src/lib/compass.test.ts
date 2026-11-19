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
