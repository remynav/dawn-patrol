/**
 * Spots page, served at /spots (sign-in required by (protected)/_layout.tsx).
 *
 * Everyone signed in sees the list of spots and their rules.
 * Only the captain (role "admin", the app owner) sees the add form and the
 * delete button. Hiding the controls is for tidiness only: the real
 * enforcement is the permissions in src/schemas/spots-schema.ts and the owner
 * check in src/actions/search-town.ts.
 */

import { useState } from 'react'
import { getAuthToken, useMutations, useQuery, useUser } from 'deepspace'
import { Button, Input, Label, useToast } from '@/components/ui'
import type { Town } from '../../../actions/search-town'

const MAX_SPOTS = 6
const TIDE_BANDS = ['low', 'mid', 'high'] as const

type Spot = {
  name: string
  lat: number
  lon: number
  minSwellM: number
  maxSwellM?: number
  minPeriodS: number
  swellDeg: number
  swellTolDeg: number
  tideBands: string[]
  maxWindKph: number
  offshoreDeg: number
}

// The form keeps every field as text so inputs can be empty while typing.
// Rule defaults are the placeholders from the spec; the captain should tune them.
const EMPTY_FORM = {
  name: '',
  lat: '',
  lon: '',
  minSwellM: '0.8',
  maxSwellM: '',
  minPeriodS: '7',
  swellDeg: '',
  swellTolDeg: '30',
  maxWindKph: '15',
  offshoreDeg: '',
}
type FormState = typeof EMPTY_FORM

export default function SpotsPage() {
  const { user } = useUser()
  const isCaptain = user?.role === 'admin'
  const { records: spots, status } = useQuery<Spot>('spots', { orderBy: 'createdAt' })
  const { removeConfirmed } = useMutations<Spot>('spots')
  const toast = useToast()

  const deleteSpot = async (recordId: string, name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return
    try {
      await removeConfirmed(recordId)
    } catch (e) {
      toast.error('Could not delete the spot', String(e))
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-foreground">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Spots</h1>

      {status === 'loading' && <p className="text-sm text-muted-foreground">Loading spots…</p>}
      {status === 'error' && <p className="text-sm text-destructive">Could not load spots.</p>}
      {status === 'ready' && spots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No spots yet. {isCaptain ? 'Add the first one below.' : 'The captain has not added any.'}
        </p>
      )}

      <ul className="space-y-3">
        {spots.map((spot) => (
          <li
            key={spot.recordId}
            data-testid="spot-row"
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{spot.data.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {spot.data.lat}, {spot.data.lon}
                </p>
              </div>
              {isCaptain && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => deleteSpot(spot.recordId, spot.data.name)}
                >
                  Delete
                </Button>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{describeRules(spot.data)}</p>
          </li>
        ))}
      </ul>

      {isCaptain &&
        (spots.length >= MAX_SPOTS ? (
          <p className="mt-8 text-sm text-muted-foreground">
            Limit reached: {MAX_SPOTS} spots. Delete one to add another.
          </p>
        ) : (
          <AddSpotForm />
        ))}
    </div>
  )
}

/** One-line summary of a spot's rules, shown to everyone. */
function describeRules(spot: Spot): string {
  const swell =
    spot.maxSwellM != null
      ? `${spot.minSwellM} to ${spot.maxSwellM} m`
      : `at least ${spot.minSwellM} m`
  const tide = (spot.tideBands ?? []).join(', ') || 'none'
  return (
    `Swell ${swell}, period at least ${spot.minPeriodS} s, ` +
    `from ${spot.swellDeg}° (±${spot.swellTolDeg}°). ` +
    `Tide: ${tide}. ` +
    `Wind up to ${spot.maxWindKph} km/h, or offshore from ${spot.offshoreDeg}°.`
  )
}

/** Captain only: search a town, adjust the coordinates, set the rules, save. */
function AddSpotForm() {
  const { createConfirmed } = useMutations<Spot>('spots')
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  // null = no search run yet; [] = searched and found nothing.
  const [towns, setTowns] = useState<Town[] | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [tideBands, setTideBands] = useState<string[]>([...TIDE_BANDS])
  const [saving, setSaving] = useState(false)

  const setField = (field: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  // One paid call per click (about 0.2 credits). Runs through the owner-only
  // server action, never straight from the browser to the integration.
  const searchTowns = async () => {
    if (query.trim().length < 2 || searching) return
    setSearching(true)
    setTowns(null)
    try {
      const token = await getAuthToken()
      const response = await fetch('/api/actions/searchTown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query }),
      })
      const result = (await response.json()) as
        | { success: true; data: Town[] }
        | { success?: false; error?: string }
      if (result.success) {
        setTowns(result.data)
      } else {
        toast.error('Town search failed', result.error ?? `HTTP ${response.status}`)
      }
    } catch (e) {
      toast.error('Town search failed', String(e))
    } finally {
      setSearching(false)
    }
  }

  // Picking a town only fills in starting coordinates. They stay editable,
  // because geocoding finds towns, not the beach itself.
  const pickTown = (town: Town) => {
    setForm((current) => ({
      ...current,
      name: current.name || town.name,
      lat: String(town.lat),
      lon: String(town.lon),
    }))
  }

  const toggleTideBand = (band: string) =>
    setTideBands((current) =>
      current.includes(band) ? current.filter((b) => b !== band) : [...current, band],
    )

  const save = async () => {
    const spot = buildSpot(form, tideBands)
    if (typeof spot === 'string') {
      toast.warning('Check the form', spot)
      return
    }
    setSaving(true)
    try {
      // Confirmed write: waits for the server, so a permission refusal shows up here.
      await createConfirmed(spot)
      toast.success('Spot added', spot.name)
      setForm(EMPTY_FORM)
      setTideBands([...TIDE_BANDS])
      setTowns(null)
      setQuery('')
    } catch (e) {
      toast.error('Could not save the spot', String(e))
    } finally {
      setSaving(false)
    }
  }

  const numberField = (field: keyof FormState, label: string, hint?: string) => (
    <div>
      <Label htmlFor={field}>{label}</Label>
      <Input
        id={field}
        inputMode="decimal"
        value={form[field]}
        placeholder={hint}
        onChange={(e) => setField(field, e.target.value)}
      />
    </div>
  )

  return (
    <section className="mt-10 rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Add a spot</h2>

      <Label htmlFor="town">1. Find the nearest town</Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="town"
          value={query}
          placeholder="e.g. Malibu"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchTowns()}
        />
        <Button variant="secondary" onClick={searchTowns} loading={searching}>
          Search
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Search finds towns, not beaches. You can also skip it and type coordinates below.
      </p>

      {towns && towns.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No town found. Try the nearest town name, or enter the coordinates by hand.
        </p>
      )}
      {towns && towns.length > 0 && (
        <ul className="mt-3 space-y-1">
          {towns.map((town) => (
            <li key={`${town.lat},${town.lon}`}>
              <button
                type="button"
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => pickTown(town)}
              >
                {[town.name, town.state, town.country].filter(Boolean).join(', ')}
                <span className="ml-2 text-muted-foreground">
                  {town.lat.toFixed(3)}, {town.lon.toFixed(3)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mb-2 mt-6 text-sm font-medium">2. Name and exact coordinates</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="name">Spot name</Label>
          <Input id="name" value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        {numberField('lat', 'Latitude')}
        {numberField('lon', 'Longitude')}
      </div>

      <p className="mb-2 mt-6 text-sm font-medium">3. Rules for this spot</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {numberField('minSwellM', 'Min swell (m)')}
        {numberField('maxSwellM', 'Max swell (m)', 'optional')}
        {numberField('minPeriodS', 'Min period (s)')}
        {numberField('swellDeg', 'Swell from (°)', '0 to 360')}
        {numberField('swellTolDeg', 'Swell tolerance (±°)')}
        {numberField('maxWindKph', 'Max wind (km/h)')}
        {numberField('offshoreDeg', 'Offshore wind from (°)', '0 to 360')}
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Tides that work</legend>
        <div className="mt-1 flex gap-4">
          {TIDE_BANDS.map((band) => (
            <label key={band} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tideBands.includes(band)}
                onChange={() => toggleTideBand(band)}
              />
              {band}
            </label>
          ))}
        </div>
      </fieldset>

      <Button className="mt-6" onClick={save} loading={saving}>
        Add spot
      </Button>
    </section>
  )
}

/**
 * Turn the text form into a Spot. Returns a message string when a field is
 * invalid, so the caller can show it instead of saving.
 */
function buildSpot(form: FormState, tideBands: string[]): Spot | string {
  // Number('') is 0, so treat blank as "not a number" explicitly.
  const num = (text: string) => (text.trim() === '' ? NaN : Number(text))
  const inRange = (value: number, min: number, max: number) => value >= min && value <= max

  const name = form.name.trim()
  if (!name) return 'Give the spot a name.'

  const lat = num(form.lat)
  const lon = num(form.lon)
  if (!inRange(lat, -90, 90)) return 'Latitude must be between -90 and 90.'
  if (!inRange(lon, -180, 180)) return 'Longitude must be between -180 and 180.'

  const minSwellM = num(form.minSwellM)
  if (!(minSwellM >= 0)) return 'Min swell must be 0 or more.'
  const maxSwellM = form.maxSwellM.trim() === '' ? undefined : num(form.maxSwellM)
  if (maxSwellM !== undefined && !(maxSwellM > minSwellM)) {
    return 'Max swell must be bigger than min swell, or left empty.'
  }

  const minPeriodS = num(form.minPeriodS)
  if (!(minPeriodS >= 0)) return 'Min period must be 0 or more.'

  const swellDeg = num(form.swellDeg)
  const offshoreDeg = num(form.offshoreDeg)
  if (!inRange(swellDeg, 0, 360)) return 'Swell direction must be between 0 and 360.'
  if (!inRange(offshoreDeg, 0, 360)) return 'Offshore wind direction must be between 0 and 360.'

  const swellTolDeg = num(form.swellTolDeg)
  if (!inRange(swellTolDeg, 0, 180)) return 'Swell tolerance must be between 0 and 180.'

  const maxWindKph = num(form.maxWindKph)
  if (!(maxWindKph >= 0)) return 'Max wind must be 0 or more.'

  if (tideBands.length === 0) return 'Pick at least one tide.'

  return {
    name, lat, lon, minSwellM, maxSwellM, minPeriodS,
    swellDeg, swellTolDeg, tideBands, maxWindKph, offshoreDeg,
  }
}
