import test from 'node:test'
import assert from 'node:assert/strict'
import { PERIODS, performance, shiftMonth, sinceMonth } from '../src/lib/performance.js'

const months = (start, nets) => nets.map((net, i) => ({ month: shiftMonth(start, i), net }))

test('shiftMonth crosses year boundaries both ways', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.equal(shiftMonth('2026-11', 3), '2027-02'); assert.equal(shiftMonth('2026-11', -12), '2025-11'); assert.equal(shiftMonth('2026-03', -120), '2016-03')
})

test('periods compare the latest month with the month that many months earlier', () => {
  const s = months('2025-11', [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220]) // 13 months, last = 2026-11
  const p = Object.fromEntries(performance(s).map((x) => [x.key, x]))
  assert.deepEqual([p['1m'].change, p['1m'].from.net], [10, 210])
  assert.deepEqual([p['3m'].change, p['3m'].from.net], [30, 190])
  assert.deepEqual([p['6m'].change, p['6m'].from.net], [60, 160])
  assert.deepEqual([p['1y'].change, p['1y'].from.net], [120, 100]); assert.equal(Math.round(p['1y'].pct), 120)
  assert.equal(p['5y'].available, false); assert.equal(p['10y'].available, false)
  assert.equal(p['5y'].change, null)
})

test('a fall is negative, a zero start has no percentage, and an empty series has nothing', () => {
  const down = performance(months('2026-09', [300, 270, 240]))
  assert.deepEqual([down[0].change, Math.round(down[0].pct)], [-30, -11])
  const zero = performance(months('2026-10', [0, 50]))
  assert.deepEqual([zero[0].change, zero[0].pct], [50, null])
  assert.ok(performance([]).every((x) => !x.available)); assert.equal(PERIODS.length, 6)
})

test('a negative starting net worth uses its size for the percentage', () => {
  const p = performance(months('2026-10', [-100, -50]))[0]
  assert.deepEqual([p.change, p.pct], [50, 50])
})

test('sinceMonth trims the series to the period', () => {
  const s = months('2026-01', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  assert.deepEqual(sinceMonth(s, 3).map((x) => x.net), [8, 9, 10, 11]); assert.equal(sinceMonth([], 3).length, 0)
})
