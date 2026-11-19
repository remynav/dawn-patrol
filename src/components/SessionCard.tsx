/**
 * SessionCard — the next dawn session and who is in.
 *
 * The session itself is written by the server (the forecast job creates it).
 * The crew's RSVPs are written straight from the browser: the `rsvps`
 * permissions let each person write only their own row, and the schema allows
 * one RSVP per user per session. Lists update live for everyone.
 */

import { useAuth, useMutations, usePresenceRoom, useQuery, useUserLookup } from 'deepspace'
import { Button, useToast } from '@/components/ui'
import { SCOPE_ID } from '../constants'

type Session = {
  date: string // YYYY-MM-DD at the spot
  spotId: string
  meetTime: string
  status: 'open' | 'confirmed'
}

type Rsvp = {
  sessionId: string
  userId: string
  status: 'in' | 'out'
}

/** `spotNames` maps a spot's record id to its name. */
export function SessionCard({ spotNames }: { spotNames: Map<string, string> }) {
  const { userId } = useAuth()
  const toast = useToast()
  const { getName } = useUserLookup()
  const { records: sessions } = useQuery<Session>('sessions')
  const { records: allRsvps } = useQuery<Rsvp>('rsvps')
  const { createConfirmed, putConfirmed, ready } = useMutations<Rsvp>('rsvps')
  // Everyone else who has the app open right now (the SDK leaves you out).
  const { peers } = usePresenceRoom(SCOPE_ID)

  // The newest session. Dates are YYYY-MM-DD, so comparing text works.
  const session = [...sessions].sort((a, b) => b.data.date.localeCompare(a.data.date))[0]
  if (!session || !userId) return null

  const rsvps = allRsvps.filter((rsvp) => rsvp.data.sessionId === session.recordId)
  const mine = rsvps.find((rsvp) => rsvp.data.userId === userId)
  const namesWith = (status: Rsvp['status']) =>
    rsvps
      .filter((rsvp) => rsvp.data.status === status)
      .map((rsvp) => (rsvp.data.userId === userId ? 'You' : getName(rsvp.data.userId) || 'Crew member'))

  const setStatus = async (status: Rsvp['status']) => {
    try {
      if (mine) {
        await putConfirmed(mine.recordId, { status })
      } else {
        // The server stamps userId itself (the column is userBound), so
        // nobody can RSVP as someone else whatever is sent here.
        await createConfirmed({ sessionId: session.recordId, userId, status })
      }
    } catch (e) {
      toast.error('Could not save your RSVP', String(e))
    }
  }

  const spotName = spotNames.get(session.data.spotId) ?? 'spot to be decided'
  const confirmed = session.data.status === 'confirmed'
  const hereNow = ['You', ...peers.map((peer) => peer.userName || 'Crew member')]

  return (
    <section data-testid="session-card" className="mb-8 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Dawn session, {session.data.date}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {confirmed ? 'Confirmed' : 'Proposed'}: {spotName}, meet at {session.data.meetTime}
      </p>

      <div className="mt-4 flex gap-2">
        <Button
          variant={mine?.data.status === 'in' ? 'default' : 'outline'}
          disabled={!ready}
          onClick={() => setStatus('in')}
        >
          I&apos;m in
        </Button>
        <Button
          variant={mine?.data.status === 'out' ? 'default' : 'outline'}
          disabled={!ready}
          onClick={() => setStatus('out')}
        >
          I&apos;m out
        </Button>
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        <NameRow label="In" testId="rsvp-in-list" names={namesWith('in')} />
        <NameRow label="Out" testId="rsvp-out-list" names={namesWith('out')} />
        <NameRow label="Here now" testId="here-now-list" names={hereNow} />
      </dl>
    </section>
  )
}

function NameRow({ label, testId, names }: { label: string; testId: string; names: string[] }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">
        {label} ({names.length})
      </dt>
      {/* data-count lets the two-user test read the size of the list. */}
      <dd data-testid={testId} data-count={names.length}>
        {names.join(', ') || '—'}
      </dd>
    </div>
  )
}
