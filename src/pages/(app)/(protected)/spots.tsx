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
import { COMPASS_POINTS } from '@/lib/compass'
import type { Town } from '../../../actions/search-town'

const MAX_SPOTS = 6
const TIDE_BANDS = ['low', 'mid', 'high'] as const

type Spot = {
  name: string
  lat: number
  lon: number
  minSwellFt: number
  maxSwellFt?: number
  minPeriodS: number
  // Compass points the swell may come from, e.g. ['SW', 'W'].
  swellDirs: string[]
  tideBands: string[]
  maxWindMph: number
  // Compass points the wind comes from when it is offshore at this spot.
  offshoreDirs: string[]
}

// The form keeps every field as text so inputs can be empty while typing.
// Rule defaults are the placeholders from the spec; the captain should tune them.
const EMPTY_FORM = {
  name: '',
  lat: '',
  lon: '',
  minSwellFt: '2.5',
  maxSwellFt: '',
  minPeriodS: '7',
  maxWindMph: '10',
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
    spot.maxSwellFt != null
      ? `${spot.minSwellFt} to ${spot.maxSwellFt} ft`
      : `at least ${spot.minSwellFt} ft`
  const list = (items?: string[]) => (items ?? []).join(', ') || 'none'
  return (
    `Swell ${swell}, period at least ${spot.minPeriodS} s, from ${list(spot.swellDirs)}. ` +
    `Tide: ${list(spot.tideBands)}. ` +
    `Wind up to ${spot.maxWindMph} mph, or offshore from ${list(spot.offshoreDirs)}.`
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
  const [swellDirs, setSwellDirs] = useState<string[]>([])
  const [offshoreDirs, setOffshoreDirs] = useState<string[]>([])
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

  // Add the item to a list if it is missing, remove it if it is there.
  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((other) => other !== item) : [...list, item]

  const save = async () => {
    const spot = buildSpot(form, { tideBands, swellDirs, offshoreDirs })
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
      setSwellDirs([])
      setOffshoreDirs([])
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

      <Label htmlFor="town">1. Find starting coordinates (optional)</Label>
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
        Search finds towns, not beaches. It only fills in starting coordinates: each spot you
        save has its own name, coordinates and rules, even when two are near the same town.
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
        {numberField('minSwellFt', 'Min swell (ft)')}
        {numberField('maxSwellFt', 'Max swell (ft)', 'optional')}
        {numberField('minPeriodS', 'Min period (s)')}
        {numberField('maxWindMph', 'Max wind (mph)')}
      </div>

      <CheckboxGroup
        legend="Swell directions that work (where the swell comes from)"
        options={COMPASS_POINTS}
        selected={swellDirs}
        onToggle={(point) => setSwellDirs((current) => toggle(current, point))}
      />
      <CheckboxGroup
        legend="Offshore wind directions (where the wind comes from)"
        options={COMPASS_POINTS}
        selected={offshoreDirs}
        onToggle={(point) => setOffshoreDirs((current) => toggle(current, point))}
      />
      <CheckboxGroup
        legend="Tides that work"
        options={TIDE_BANDS}
        selected={tideBands}
        onToggle={(band) => setTideBands((current) => toggle(current, band))}
      />

      <Button className="mt-6" onClick={save} loading={saving}>
        Add spot
      </Button>
    </section>
  )
}

/** A row of labelled checkboxes, used for compass points and tide bands. */
function CheckboxGroup(props: {
  legend: string
  options: readonly string[]
  selected: string[]
  onToggle: (option: string) => void
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium">{props.legend}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {props.options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.selected.includes(option)}
              onChange={() => props.onToggle(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Turn the text form into a Spot. Returns a message string when a field is
 * invalid, so the caller can show it instead of saving.
 */
function buildSpot(
  form: FormState,
  picked: { tideBands: string[]; swellDirs: string[]; offshoreDirs: string[] },
): Spot | string {
  // Number('') is 0, so treat blank as "not a number" explicitly.
  const num = (text: string) => (text.trim() === '' ? NaN : Number(text))
  const inRange = (value: number, min: number, max: number) => value >= min && value <= max

  const name = form.name.trim()
  if (!name) return 'Give the spot a name.'

  const lat = num(form.lat)
  const lon = num(form.lon)
  if (!inRange(lat, -90, 90)) return 'Latitude must be between -90 and 90.'
  if (!inRange(lon, -180, 180)) return 'Longitude must be between -180 and 180.'

  const minSwellFt = num(form.minSwellFt)
  if (!(minSwellFt >= 0)) return 'Min swell must be 0 or more.'
  const maxSwellFt = form.maxSwellFt.trim() === '' ? undefined : num(form.maxSwellFt)
  if (maxSwellFt !== undefined && !(maxSwellFt > minSwellFt)) {
    return 'Max swell must be bigger than min swell, or left empty.'
  }

  const minPeriodS = num(form.minPeriodS)
  if (!(minPeriodS >= 0)) return 'Min period must be 0 or more.'

  const maxWindMph = num(form.maxWindMph)
  if (!(maxWindMph >= 0)) return 'Max wind must be 0 or more.'

  if (picked.swellDirs.length === 0) return 'Pick at least one swell direction.'
  if (picked.offshoreDirs.length === 0) return 'Pick at least one offshore wind direction.'
  if (picked.tideBands.length === 0) return 'Pick at least one tide.'

  return {
    name, lat, lon, minSwellFt, maxSwellFt, minPeriodS, maxWindMph,
    swellDirs: picked.swellDirs,
    offshoreDirs: picked.offshoreDirs,
    tideBands: picked.tideBands,
  }
}
