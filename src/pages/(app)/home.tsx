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
import { Badge, Button, useToast } from '@/components/ui'
import { SessionCard } from '../../components/SessionCard'

type Spot = { name: string }

type Call = {
  spotId: string
  date: string // YYYY-MM-DD at the spot
  verdict: 'on' | 'maybe' | 'no-go'
  reasons: string[]
  summary?: string
}

const VERDICTS: Record<Call['verdict'], { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  on: { label: "IT'S ON", variant: 'success' },
  maybe: { label: 'MAYBE', variant: 'warning' },
  'no-go': { label: 'NO-GO', variant: 'destructive' },
}

// The mark shown in front of each check.
const MARKS = {
  pass: { symbol: '✓', className: 'text-success' },
  near: { symbol: '~', className: 'text-warning' },
  fail: { symbol: '✕', className: 'text-destructive' },
}

/**
 * A reason is stored as one line, such as
 * "Wind 13 mph from W: fail (limit 10 mph unless offshore)".
 * Split it into the fact, the outcome and the note so they can be laid out.
 */
function parseReason(reason: string) {
  const cut = reason.lastIndexOf(': ')
  const fact = cut === -1 ? reason : reason.slice(0, cut)
  const result = cut === -1 ? '' : reason.slice(cut + 2)
  const outcome = result.startsWith('pass') ? 'pass' : result.startsWith('near') ? 'near' : 'fail'
  const note = result.match(/\((.*)\)$/)?.[1] ?? ''
  return { fact, outcome, note } as const
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
  const failed = spotsStatus === 'error' || callsStatus === 'error'
  // Today's date as YYYY-MM-DD in this browser's timezone, to flag an old forecast.
  const today = new Date().toLocaleDateString('en-CA')

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
      {failed && (
        <p className="mb-4 text-sm text-destructive">
          Could not load the forecast. Check your connection and reload the page.
        </p>
      )}

      <SessionCard spotNames={new Map(spots.map((spot) => [spot.recordId, spot.data.name]))} />

      {spots.length > 0 && (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Spot by spot
        </h2>
      )}

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
                <h3 className="text-lg font-semibold">{spot.data.name}</h3>
                {call && (
                  <Badge
                    data-testid="verdict"
                    size="lg"
                    variant={VERDICTS[call.data.verdict].variant}
                    className="font-bold"
                  >
                    {VERDICTS[call.data.verdict].label}
                  </Badge>
                )}
              </div>

              {call ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dawn of {call.data.date} · updated {new Date(call.updatedAt).toLocaleString()}
                  </p>
                  {call.data.date < today && (
                    <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                      This forecast is for a day that has passed. A new one runs each evening.
                    </p>
                  )}
                  {call.data.summary && (
                    <div data-testid="summary" className="mt-4 rounded-md bg-muted px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tonight&apos;s summary
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">{call.data.summary}</p>
                    </div>
                  )}
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    The five checks
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {(call.data.reasons ?? []).map((reason) => {
                      const { fact, outcome, note } = parseReason(reason)
                      return (
                        <li key={reason} className="flex gap-2">
                          <span aria-hidden className={`w-4 shrink-0 font-bold ${MARKS[outcome].className}`}>
                            {MARKS[outcome].symbol}
                          </span>
                          <span>
                            {fact}
                            <span className="text-muted-foreground">
                              {outcome === 'near' ? ' · near miss' : ''}
                              {note ? ` · ${note}` : ''}
                            </span>
                          </span>
                        </li>
                      )
                    })}
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
