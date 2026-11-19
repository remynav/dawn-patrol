/**
 * Home page, served at /home: tomorrow's call for every spot.
 *
 * It only READS records. The calls are written on the server by the nightly
 * cron task or by the captain's "Refresh now" button, and this page updates
 * live when they change.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuthToken, useAuth, useQuery, useUser } from 'deepspace'
import { Button, useToast } from '@/components/ui'

type Spot = { name: string }

type Call = {
  spotId: string
  date: string // YYYY-MM-DD at the spot
  verdict: 'on' | 'maybe' | 'no-go'
  reasons: string[]
  summary?: string
}

const VERDICTS: Record<Call['verdict'], { label: string; className: string }> = {
  on: { label: "IT'S ON", className: 'bg-success text-success-foreground' },
  maybe: { label: 'MAYBE', className: 'bg-warning text-warning-foreground' },
  'no-go': { label: 'NO-GO', className: 'bg-destructive text-destructive-foreground' },
}

export default function HomePage() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const isCaptain = user?.role === 'admin'
  const { records: spots, status: spotsStatus } = useQuery<Spot>('spots', { orderBy: 'createdAt' })
  const { records: calls, status: callsStatus } = useQuery<Call>('calls')

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center text-foreground">
        <h1 className="text-3xl font-bold tracking-tight">Dawn Patrol</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in (top right) to see tomorrow&apos;s call for the crew&apos;s spots.
        </p>
      </div>
    )
  }

  const loading = spotsStatus === 'loading' || callsStatus === 'loading'

  // The newest call for a spot. Dates are YYYY-MM-DD, so comparing text works.
  const latestCall = (spotId: string) =>
    calls
      .filter((call) => call.data.spotId === spotId)
      .sort((a, b) => b.data.date.localeCompare(a.data.date))[0]

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-foreground">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Dawn call</h1>
        {isCaptain && spots.length > 0 && <RefreshButton />}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && spots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No spots yet.{' '}
          {isCaptain ? (
            <Link to="/spots" className="underline">
              Add the first one.
            </Link>
          ) : (
            'The captain has not added any.'
          )}
        </p>
      )}

      <ul className="space-y-4">
        {spots.map((spot) => {
          const call = latestCall(spot.recordId)
          return (
            <li
              key={spot.recordId}
              data-testid="call-card"
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">{spot.data.name}</h2>
                {call && (
                  <span
                    data-testid="verdict"
                    className={`rounded-full px-3 py-1 text-sm font-bold ${VERDICTS[call.data.verdict].className}`}
                  >
                    {VERDICTS[call.data.verdict].label}
                  </span>
                )}
              </div>

              {call ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dawn of {call.data.date} · updated {new Date(call.updatedAt).toLocaleString()}
                  </p>
                  {call.data.summary && <p className="mt-3 text-sm">{call.data.summary}</p>}
                  <ul className="mt-3 space-y-1 text-sm">
                    {(call.data.reasons ?? []).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No forecast yet. It runs every evening at 6 PM Pacific.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <footer className="mt-10 text-xs text-muted-foreground">
        Swell data by{' '}
        <a href="https://open-meteo.com/" className="underline" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        . Model accuracy is limited close to the coast, and tides are modelled, so treat the call
        as a guide.
      </footer>
    </div>
  )
}

/** Captain only. Runs the forecast job now through the owner-only server action. */
function RefreshButton() {
  const toast = useToast()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      const token = await getAuthToken()
      const response = await fetch('/api/actions/refreshNow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      })
      const result = (await response.json()) as
        | { success: true; data: { written: number; failed: string[] } }
        | { success?: false; error?: string }
      if (!result.success) {
        toast.warning('Not refreshed', result.error ?? `HTTP ${response.status}`)
      } else if (result.data.failed.length > 0) {
        toast.warning('Partly refreshed', `No forecast for: ${result.data.failed.join(', ')}`)
      } else {
        toast.success('Forecast refreshed', `${result.data.written} spots updated`)
      }
    } catch (e) {
      toast.error('Refresh failed', String(e))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Button variant="secondary" onClick={refresh} loading={refreshing}>
      Refresh now
    </Button>
  )
}
