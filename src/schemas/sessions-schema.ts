import type { CollectionSchema } from 'deepspace/schema'

// One dawn session per date. Written only by the server (cron and
// owner-only server actions), so every role is read-only here.
export const sessionsSchema: CollectionSchema = {
  name: 'sessions',
  columns: [
    { name: 'date', storage: 'text', interpretation: 'plain', required: true },
    { name: 'spotId', storage: 'text', interpretation: 'plain' },
    // Local meet time at the spot, e.g. "06:15".
    { name: 'meetTime', storage: 'text', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['open', 'confirmed'] } },
    // ISO timestamp of the confirmation email, so it is sent only once.
    { name: 'emailedAt', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['date'],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: false },
  },
}
