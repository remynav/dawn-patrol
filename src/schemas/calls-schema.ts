import type { CollectionSchema } from 'deepspace/schema'

// One verdict per spot per date. Written only by the server (cron and
// owner-only server actions, which bypass these role checks), so every
// role is read-only here.
export const callsSchema: CollectionSchema = {
  name: 'calls',
  columns: [
    { name: 'spotId', storage: 'text', interpretation: 'plain', required: true },
    // The surf date in the spot's own timezone, as YYYY-MM-DD.
    { name: 'date', storage: 'text', interpretation: 'plain', required: true },
    { name: 'verdict', storage: 'text', interpretation: { kind: 'select', options: ['on', 'maybe', 'no-go'] } },
    // Dawn-window numbers behind the verdict, in feet, seconds, degrees and mph.
    { name: 'swellFt', storage: 'number', interpretation: 'plain' },
    { name: 'periodS', storage: 'number', interpretation: 'plain' },
    { name: 'swellDeg', storage: 'number', interpretation: 'plain' },
    { name: 'tideBand', storage: 'text', interpretation: 'plain' },
    { name: 'tideRising', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'windMph', storage: 'number', interpretation: 'plain' },
    { name: 'windDeg', storage: 'number', interpretation: 'plain' },
    // JSON array of reason strings, one per factor.
    { name: 'reasons', storage: 'text', interpretation: { kind: 'json' } },
    // Optional two-sentence AI summary. Empty when the AI call failed.
    { name: 'summary', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['spotId', 'date'],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: false },
  },
}
