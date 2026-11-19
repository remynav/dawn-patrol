import type { CollectionSchema } from 'deepspace/schema'

// A surf spot and the captain's rules for it.
// Crew (member) can read. Only the captain (admin, the app owner) can write.
export const spotsSchema: CollectionSchema = {
  name: 'spots',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 80 },
    { name: 'lat', storage: 'number', interpretation: 'plain', required: true },
    { name: 'lon', storage: 'number', interpretation: 'plain', required: true },
    // Swell size in metres. maxSwellM is optional (no upper limit when empty).
    { name: 'minSwellM', storage: 'number', interpretation: 'plain' },
    { name: 'maxSwellM', storage: 'number', interpretation: 'plain' },
    // Open-Meteo MEAN swell period in seconds (lower than the peak period surf sites quote).
    { name: 'minPeriodS', storage: 'number', interpretation: 'plain' },
    // Ideal swell direction (degrees the swell comes FROM) and tolerance either side.
    { name: 'swellDeg', storage: 'number', interpretation: 'plain' },
    { name: 'swellTolDeg', storage: 'number', interpretation: 'plain' },
    // JSON array of allowed tide bands, e.g. ["low","mid"].
    { name: 'tideBands', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'maxWindKph', storage: 'number', interpretation: 'plain' },
    // Direction the wind comes FROM when it is offshore at this spot.
    { name: 'offshoreDeg', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
