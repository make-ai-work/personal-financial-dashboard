import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData, normalizeData } from '../src/lib/model.js'
import { exportWorkbook, importWorkbook } from '../src/lib/excel.js'
import { addRange, axis, changes, normalizeTaxResidency, rangeProblem, removeRange, segments, statusOn, taxYearLabel, taxYearTicks, updateRange } from '../src/lib/taxres.js'

test('tax years: US is January to December, India is April to March', () => {
  assert.equal(taxYearLabel('us', '2026-03-31'), '2026'); assert.equal(taxYearLabel('us', '2026-04-01'), '2026')
  assert.equal(taxYearLabel('in', '2026-03-31'), 'FY 2025-26'); assert.equal(taxYearLabel('in', '2026-04-01'), 'FY 2026-27'); assert.equal(taxYearLabel('in', '2099-12-01'), 'FY 2099-00')
  assert.deepEqual(taxYearTicks('us', '2025-06-01', '2027-02-01').map((t) => t.date), ['2026-01-01', '2027-01-01'])
  assert.deepEqual(taxYearTicks('in', '2025-06-01', '2027-06-01').map((t) => [t.date, t.label]), [['2026-04-01', 'FY 2026-27'], ['2027-04-01', 'FY 2027-28']])
})

test('ranges are validated, sorted, and unknown statuses are dropped', () => {
  const n = normalizeTaxResidency({ us: [{ status: 'resident', from: '2020-01-01', to: '2022-12-31' }, { status: 'nonresident', from: '2015-01-01', to: '' }, { status: 'visitor', from: '2018-01-01' }, { status: 'resident', from: 'x' }, { status: 'resident', from: '2020-05-01', to: '2020-01-01' }], in: [{ status: 'NRI', from: '2020-01-01' }, { status: 'nri', from: '2020-01-01' }] })
  assert.deepEqual(n.us.map((r) => [r.status, r.from]), [['nonresident', '2015-01-01'], ['resident', '2020-01-01']]); assert.equal(n.in.length, 1)
  assert.equal(normalizeTaxResidency(undefined).us.length, 0); assert.equal(normalizeData({}).taxResidency.in.length, 0)
  const r = { from: '2021-01-01', to: '2021-06-01' }
  assert.match(rangeProblem(r, [{ from: '2020-01-01', to: '2021-01-01' }]), /overlaps/); assert.equal(rangeProblem(r, [{ from: '2021-06-02', to: '' }]), '')
  assert.match(rangeProblem({ from: '', to: '' }), /start date/); assert.match(rangeProblem({ from: '2021-02-01', to: '2021-01-01' }), /before/)
  assert.match(rangeProblem({ from: '2021-01-01', to: '' }, [{ from: '2022-01-01', to: '' }]), /overlaps/) // an open end runs into the next one
})

test('status changes are the boundaries where the status differs; a gap or the first period also counts', () => {
  const d = [{ id: 'a', status: 'nri', from: '2015-04-01', to: '2023-03-31' }, { id: 'b', status: 'rnor', from: '2023-04-01', to: '2025-03-31' }, { id: 'c', status: 'ror', from: '2025-04-01', to: '' }]
  assert.deepEqual(changes(d).map((c) => [c.date, c.from, c.to]), [['2015-04-01', null, 'nri'], ['2023-04-01', 'nri', 'rnor'], ['2025-04-01', 'rnor', 'ror']])
  assert.deepEqual(changes([{ status: 'ror', from: '2020-01-01', to: '2020-12-31' }, { status: 'ror', from: '2022-01-01', to: '' }]).map((c) => [c.date, c.from]), [['2020-01-01', null], ['2022-01-01', null]]) // a gap: shown as a new start
  assert.equal(statusOn(d, '2024-01-01'), 'rnor'); assert.equal(statusOn(d, '2010-01-01'), null)
})

test('the shared axis and the bar segments', () => {
  const tr = { us: [{ id: '1', status: 'nonresident', from: '2020-01-01', to: '2022-12-31' }, { id: '2', status: 'resident', from: '2023-01-01', to: '' }], in: [{ id: '3', status: 'nri', from: '2019-04-01', to: '' }] }
  const ax = axis(tr, '2026-11-23')
  assert.equal(ax.start, '2019-04-01'); assert.equal(ax.end, '2027-12-31'); assert.equal(axis({ us: [], in: [] }, '2026-01-01'), null)
  const seg = segments(tr.us, ax, '2026-11-23')
  assert.ok(seg[0].left > 0 && seg[0].left + seg[0].width <= seg[1].left + 1e-6 + 0.01) // the two are side by side
  assert.ok(seg[1].left + seg[1].width <= 100)
})

test('add, edit and remove; Excel round trip keeps the ranges', async () => {
  let d = emptyData()
  d = addRange(d, 'us', { status: 'resident', from: '2020-01-01', to: '2022-12-31' })
  d = addRange(d, 'in', { status: 'rnor', from: '2023-04-01', to: '' })
  const id = d.taxResidency.us[0].id
  d = updateRange(d, 'us', id, { to: '2023-12-31' }); assert.equal(d.taxResidency.us[0].to, '2023-12-31')
  d = { ...d, taxResidency: { ...d.taxResidency, inputs: { startYear: 2016, citizen: true, us: { 2025: { days: 120, greenCard: false, exempt: 5, closer: true } }, in: { 2025: { days: 70, left: true, income15: true, liableElsewhere: false } } } } }
  const { data: back, warnings } = await importWorkbook((await exportWorkbook(d)).buffer)
  assert.deepEqual(warnings, [])
  assert.deepEqual(back.taxResidency.inputs, d.taxResidency.inputs) // the guided-check answers survive too
  assert.deepEqual(back.taxResidency.us.map((r) => [r.status, r.from, r.to]), [['resident', '2020-01-01', '2023-12-31']])
  assert.deepEqual(back.taxResidency.in.map((r) => [r.status, r.from, r.to]), [['rnor', '2023-04-01', '']])
  d = removeRange(d, 'us', id); assert.equal(d.taxResidency.us.length, 0)
})
