import test from 'node:test'
import assert from 'node:assert/strict'
import { countDays, normalizeTravel, travelProblems } from '../src/lib/travel.js'

const T = (o) => normalizeTravel({ usArrival: '', usDeparture: '', trips: [], ...o })

test('a trip to India takes its days out of the US and adds them to India; the crossing days count in both', () => {
  const r = countDays(T({ trips: [{ exit: '2025-06-01', entry: '2025-06-21', india: true }] }), 2025, '2025-12-31')
  assert.equal(r.us[2025], 365 - 19) // 2-20 June are away; 1 and 21 June still count in the US
  assert.equal(r.in[2025], 21) // 1 to 21 June inclusive
  const other = countDays(T({ trips: [{ exit: '2025-06-01', entry: '2025-06-21', india: false }] }), 2025, '2025-12-31')
  assert.equal(other.us[2025], 346); assert.equal(other.in[2025] || 0, 0) // a trip elsewhere: not India days
})
test('before the US arrival date you were in India; the arrival day counts in both', () => {
  const r = countDays(T({ usArrival: '2024-08-15' }), 2024, '2025-03-31')
  assert.equal(r.us[2024], 139); assert.equal(r.us[2025], 90) // 15 Aug to 31 Dec; 1 Jan to 31 Mar
  assert.equal(r.in[2023], 91) // 1 Jan to 31 Mar 2024 belongs to FY 2023-24
  assert.equal(r.in[2024], 137 + 0) // 1 Apr to 15 Aug 2024 (the arrival day included); nothing after
})
test('after leaving the US for good you are in India; an open trip runs to today', () => {
  const r = countDays(T({ usDeparture: '2025-02-10' }), 2025, '2025-12-31')
  assert.equal(r.us[2025], 41) // 1 January to 10 February; the day you leave counts
  assert.deepEqual([r.in[2024], r.in[2025]], [50, 275]) // 10 Feb to 31 Mar (FY 2024-25), then 1 Apr to 31 Dec
  const open = countDays(T({ trips: [{ exit: '2025-12-01', entry: '', india: true }] }), 2025, '2025-12-31')
  assert.equal(open.us[2025], 335) // you are still away today
  assert.equal(open.in[2025], 31)
})
test('dates that do not make sense are reported', () => {
  assert.deepEqual(travelProblems(T({ usArrival: '2025-05-01', usDeparture: '2025-04-01' })), ['You left the US before you arrived.'])
  assert.match(travelProblems(T({ trips: [{ exit: '2025-06-01', entry: '2025-06-20' }, { exit: '2025-06-10', entry: '2025-06-30' }] }))[0], /overlaps/)
  assert.match(travelProblems(T({ usArrival: '2025-06-01', trips: [{ exit: '2025-05-01', entry: '2025-05-10' }] }))[0], /before you arrived/)
  assert.equal(normalizeTravel({ trips: [{ exit: 'x', entry: '2025-01-01' }] }).trips[0].exit, '') // a trip being typed is kept
  assert.match(travelProblems(T({ trips: [{ exit: '2025-03-01', entry: '2025-02-01' }] }))[0], /returns before/)
  const r = countDays(T({ trips: [{ exit: '', entry: '' }, { exit: '2025-03-01', entry: '2025-02-01' }] }), 2025, '2025-12-31')
  assert.equal(r.us[2025], 365) // trips without usable dates count for nothing
})
