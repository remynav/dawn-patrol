import type { CollectionSchema } from 'deepspace/schema'

// Who is in or out for a session. Everyone signed in can read the list;
// each person can only write their own row, captain included.
export const rsvpsSchema: CollectionSchema = {
  name: 'rsvps',
  columns: [
    { name: 'sessionId', storage: 'text', interpretation: 'plain', required: true },
    // userBound: the server stamps the caller's id, so nobody can RSVP as someone else.
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['in', 'out'] } },
  ],
  // 'own' below is checked against this column.
  ownerField: 'userId',
  // One RSVP per user per session.
  uniqueOn: ['sessionId', 'userId'],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: 'own', delete: 'own' },
  },
}
