import { describe, expect, it, vi } from 'vitest'
import type { CronContext } from 'deepspace/worker'
import marine from '../../tests/fixtures/marine-malibu.json'
import wind from '../../tests/fixtures/wind-malibu.json'
import { refreshCalls, refreshCallsWithCooldown } from './refresh-calls'

// Nothing here touches the network or the platform: Open-Meteo is a fake
// fetch that returns the saved fixtures, and records are kept in memory.

type Row = { recordId: string; data: Record<string, unknown> }

/** A tiny in-memory stand-in for the records API the job uses. */
function fakeRecords(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { spots: [], calls: [], settings: [], ...initial }
  let nextId = 1
  const records: CronContext['records'] = {
    async query(collection, opts) {
      const where = Object.entries(opts?.where ?? {})
      const rows = tables[collection].filter((row) => where.every(([k, v]) => row.data[k] === v))
      return rows.slice(0, opts?.limit ?? rows.length)
    },
    async create(collection, data) {
      tables[collection].push({ recordId: `id-${nextId++}`, data })
    },
    async update(collection, recordId, data) {
      const row = tables[collection].find((r) => r.recordId === recordId)!
      row.data = { ...row.data, ...data }
    },
    async delete() {},
  }
  return { records, tables }
}

const okFetch = () =>
  vi.fn(async (url: string | URL | Request) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('marine-api') ? marine : wind),
  })) as unknown as typeof fetch

const failingFetch = () =>
  vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch

function spot(recordId: string, name: string, maxWindMph: number): Row {
  return {
    recordId,
    data: {
      name, lat: 34.03, lon: -118.68,
      minSwellFt: 2.5, minPeriodS: 7, swellDirs: ['W', 'SW'],
      tideBands: ['low', 'mid', 'high'], maxWindMph, offshoreDirs: ['N', 'NE'],
    },
  }
}

// 20:00 on Nov 18 in Malibu, so "tomorrow" is Nov 19, the day in the fixtures.
const NOW = new Date('2026-11-19T04:00:00Z')

describe('refreshCalls', () => {
  it('writes one call per spot with verdict, numbers and reasons', async () => {
    const { records, tables } = fakeRecords({
      spots: [spot('calm', 'Calm Cove', 15), spot('windy', 'Windy Point', 10)],
    })
    const summary = await refreshCalls(records, NOW, okFetch())

    expect(summary).toEqual({ written: 2, failed: [] })
    expect(tables.calls).toHaveLength(2)
    const calm = tables.calls.find((c) => c.data.spotId === 'calm')!.data
    expect(calm.date).toBe('2026-11-19')
    expect(calm.verdict).toBe('on')
    expect(calm.swellFt).toBe(3.7)
    expect(calm.reasons).toHaveLength(5)
    expect(tables.calls.find((c) => c.data.spotId === 'windy')!.data.verdict).toBe('no-go')
  })

  it('updates the existing call instead of adding a second one', async () => {
    const { records, tables } = fakeRecords({ spots: [spot('calm', 'Calm Cove', 15)] })
    await refreshCalls(records, NOW, okFetch())
    await refreshCalls(records, NOW, okFetch())
    expect(tables.calls).toHaveLength(1)
  })

  it('makes two requests per spot and never retries a failure', async () => {
    const { records, tables } = fakeRecords({
      spots: [spot('a', 'Spot A', 15), spot('b', 'Spot B', 15)],
    })
    const fetchFn = failingFetch()
    const summary = await refreshCalls(records, NOW, fetchFn)

    expect(summary).toEqual({ written: 0, failed: ['Spot A', 'Spot B'] })
    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(tables.calls).toHaveLength(0)
  })

  it('processes at most six spots', async () => {
    const spots = Array.from({ length: 8 }, (_, i) => spot(`s${i}`, `Spot ${i}`, 15))
    const { records, tables } = fakeRecords({ spots })
    await refreshCalls(records, NOW, okFetch())
    expect(tables.calls).toHaveLength(6)
  })
})

describe('refreshCallsWithCooldown', () => {
  it('runs the first time, then refuses for ten minutes', async () => {
    const { records, tables } = fakeRecords({ spots: [spot('calm', 'Calm Cove', 15)] })
    const fetchFn = okFetch()

    const first = await refreshCallsWithCooldown(records, NOW, fetchFn)
    expect(first).toEqual({ ok: true, summary: { written: 1, failed: [] } })

    const fourMinutesLater = new Date(NOW.getTime() + 4 * 60 * 1000)
    const second = await refreshCallsWithCooldown(records, fourMinutesLater, fetchFn)
    expect(second).toEqual({ ok: false, minutesLeft: 6 })
    // The refused click made no forecast requests.
    expect(fetchFn).toHaveBeenCalledTimes(2)

    const elevenMinutesLater = new Date(NOW.getTime() + 11 * 60 * 1000)
    const third = await refreshCallsWithCooldown(records, elevenMinutesLater, fetchFn)
    expect(third.ok).toBe(true)
    expect(tables.settings).toHaveLength(1)
  })
})
