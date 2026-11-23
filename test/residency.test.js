import test from 'node:test'
import assert from 'node:assert/strict'
import { usResidency, indiaResidency, yearsToRanges, indiaFYOf } from '../src/lib/residency.js'

const us = (o) => Object.fromEntries(Object.entries(o).map(([y, v]) => [y, { days: v[0] ?? '', greenCard: !!v[1], exempt: v[2] ?? '', closer: !!v[3] }]))

test('US: the IRS example, 120 + 40/3 + 20/6 = 136.33 is not enough', () => {
  const r = usResidency(us({ 2023: [20], 2024: [40], 2025: [120] }), 2025)
  assert.equal(r.status, 'nonresident'); assert.match(r.reasons[0].text, /under 183/)
})
test('US: 183 weighted days and 31 this year make a resident; fewer than 31 this year never do', () => {
  assert.equal(usResidency(us({ 2023: [180], 2024: [180], 2025: [100] }), 2025).status, 'resident') // 100 + 60 + 30 = 190
  assert.equal(usResidency(us({ 2023: [300], 2024: [300], 2025: [30] }), 2025).status, 'nonresident')
  assert.equal(usResidency(us({ 2023: [], 2024: [], 2025: [183] }), 2025).status, 'resident')
})
test('US: green card always resident; closer connection only below 183 days; excluded days do not count', () => {
  assert.equal(usResidency(us({ 2025: [10, true] }), 2025).status, 'resident')
  assert.equal(usResidency(us({ 2024: [150], 2025: [150, false, '', true] }), 2025).status, 'nonresident') // 150+50 = 200 met, closer connection applies
  assert.equal(usResidency(us({ 2024: [150], 2025: [190, false, '', true] }), 2025).status, 'resident') // 183 or more: exception unavailable
  assert.equal(usResidency(us({ 2025: [200, false, 100] }), 2025).status, 'nonresident') // 100 counted days
  assert.deepEqual(usResidency(us({ 2025: [200] }), 2025).missing, [2024, 2023])
})

const ind = (o) => Object.fromEntries(Object.entries(o).map(([y, v]) => [y, { days: v[0] ?? '', left: !!v[1], income15: !!v[2], liableElsewhere: !!v[3] }]))
const yrs = (from, to, days) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, [days]]))

test('India: 182 days is resident; 60 plus 365 is resident; neither is NRI', () => {
  assert.equal(indiaResidency(ind({ 2025: [200] }), 2025).resident, true)
  assert.equal(indiaResidency(ind({ ...yrs(2021, 2024, 100), 2025: [70] }), 2025).resident, true) // 70 and 400
  assert.equal(indiaResidency(ind({ ...yrs(2021, 2024, 50), 2025: [70] }), 2025).status, 'nri') // 70 and 200
})
test('India: ROR needs a resident history; RNOR on 9 of 10 non-resident years or 729 days in 7 years', () => {
  assert.equal(indiaResidency(ind({ ...yrs(2013, 2024, 330), 2025: [330] }), 2025).status, 'ror') // lived in India all along
  assert.equal(indiaResidency(ind({ ...yrs(2015, 2024, 10), 2025: [200] }), 2025).status, 'rnor') // came back after years away: 70 days in 7 years
  assert.equal(indiaResidency(ind({ 2025: [200] }), 2025).status, 'rnor') // no history entered counts as 0 days
  assert.ok(indiaResidency(ind({ 2025: [200] }), 2025).missing.length >= 10)
})
test('India: a citizen visiting needs 182 days, or 120 with income over 15 lakh and 365 in 4 years; deemed resident is RNOR', () => {
  assert.equal(indiaResidency(ind({ ...yrs(2021, 2024, 100), 2025: [100] }), 2025, { citizen: true }).status, 'nri') // 100 days: 182 needed
  const via = indiaResidency(ind({ ...yrs(2021, 2024, 100), 2025: [130, false, true, true] }), 2025, { citizen: true })
  assert.deepEqual([via.resident, via.status], [true, 'rnor']) // 120-day rule, RNOR
  assert.equal(indiaResidency(ind({ 2025: [30, false, true, false] }), 2025, { citizen: true }).status, 'rnor') // deemed resident
  assert.equal(indiaResidency(ind({ 2025: [30, false, true, true] }), 2025, { citizen: true }).status, 'nri') // taxed elsewhere: not deemed
  assert.equal(indiaResidency(ind({ ...yrs(2021, 2024, 200), 2025: [100, true] }), 2025, { citizen: true }).status, 'nri') // left for employment: 182 needed
  assert.equal(indiaResidency(ind({ 2025: [30, false, true, false] }), 2025, { citizen: false }).status, 'nri') // not a citizen: no deemed rule
})
test('yearly results become date ranges: US calendar years, India April to March, same neighbours merged, the current year open', () => {
  assert.deepEqual(yearsToRanges('us', [{ year: 2022, status: 'nonresident' }, { year: 2023, status: 'nonresident' }, { year: 2024, status: 'resident' }], 2025), [{ status: 'nonresident', from: '2022-01-01', to: '2023-12-31' }, { status: 'resident', from: '2024-01-01', to: '2024-12-31' }])
  assert.deepEqual(yearsToRanges('in', [{ year: 2024, status: 'nri' }, { year: 2025, status: 'rnor' }], 2025), [{ status: 'nri', from: '2024-04-01', to: '2025-03-31' }, { status: 'rnor', from: '2025-04-01', to: '' }])
  assert.equal(indiaFYOf('2026-03-31'), 2025); assert.equal(indiaFYOf('2026-04-01'), 2026)
})

test('a skipped year breaks a range', () => {
  assert.equal(yearsToRanges('us', [{ year: 2020, status: 'resident' }, { year: 2022, status: 'resident' }], 2025).length, 2)
})
