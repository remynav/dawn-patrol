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
