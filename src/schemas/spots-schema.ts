import type { CollectionSchema } from 'deepspace/schema'

// A surf spot and the captain's rules for it.
// Crew (member) can read. Only the captain (admin, the app owner) can write.
export const spotsSchema: CollectionSchema = {
  name: 'spots',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 80 },
    { name: 'lat', storage: 'number', interpretation: 'plain', required: true },
    { name: 'lon', storage: 'number', interpretation: 'plain', required: true },
    // Swell size in feet. maxSwellFt is optional (no upper limit when empty).
    { name: 'minSwellFt', storage: 'number', interpretation: 'plain' },
    { name: 'maxSwellFt', storage: 'number', interpretation: 'plain' },
    // Open-Meteo MEAN swell period in seconds (lower than the peak period surf sites quote).
    { name: 'minPeriodS', storage: 'number', interpretation: 'plain' },
    // JSON array of compass points the swell may come FROM, e.g. ["SW","W"].
    // Points are the eight in src/lib/compass.ts.
    { name: 'swellDirs', storage: 'text', interpretation: { kind: 'json' } },
    // JSON array of allowed tide bands, e.g. ["low","mid"].
    { name: 'tideBands', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'maxWindMph', storage: 'number', interpretation: 'plain' },
    // JSON array of compass points the wind comes FROM when it is offshore here.
    { name: 'offshoreDirs', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
