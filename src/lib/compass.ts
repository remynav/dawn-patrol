/**
 * Eight-point compass, shared by the spots form and (from Friday) scoring.
 * A direction always means where the swell or wind comes FROM.
 */

export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type CompassPoint = (typeof COMPASS_POINTS)[number]

/**
 * The compass point for a direction in degrees. Each point owns a 45° slice
 * centred on it: N is 337.5° to 22.5°, NE is 22.5° to 67.5°, and so on.
 */
export function compassPoint(degrees: number): CompassPoint {
  const normalized = ((degrees % 360) + 360) % 360
  return COMPASS_POINTS[Math.round(normalized / 45) % 8]
}

/** The centre of a compass point in degrees: N is 0, NE is 45, E is 90, and so on. */
export function degreesOf(point: string): number {
  return COMPASS_POINTS.indexOf(point as CompassPoint) * 45
}

/** The smallest angle between two directions, from 0 to 180 degrees. */
export function angleBetween(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * Average of several directions. Directions wrap around, so a plain average
 * is wrong (350° and 10° would give 180°). Instead, treat each direction as an
 * arrow, add the arrows, and read the direction of the total.
 */
export function averageDirection(degrees: number[]): number {
  let x = 0
  let y = 0
  for (const d of degrees) {
    x += Math.cos((d * Math.PI) / 180)
    y += Math.sin((d * Math.PI) / 180)
  }
  const average = (Math.atan2(y, x) * 180) / Math.PI
  return (Math.round(average) + 360) % 360
}
