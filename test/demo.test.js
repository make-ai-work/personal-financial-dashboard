import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { freshenDemo, IS_DEMO } from '../src/lib/demo.js'
import { normalizeData } from '../src/lib/model.js'
import { holdingValue, holdingsOf, linkStatus } from '../src/lib/portfolio.js'
import { MAX_VERSIONS } from '../src/lib/retirement.js'

const raw = () => JSON.parse(readFileSync(new URL('../demo/demo-data.json', import.meta.url), 'utf8'))

test('demo mode is off unless the build turns it on', () => assert.equal(IS_DEMO, false))

test('the sample data loads through the normal data model and is internally consistent', () => {
  const d = normalizeData(raw())
  const ids = (list) => list.map((x) => x.id)
  for (const list of [d.accounts, d.policies, d.properties, d.propertyValues, d.loans, d.loanUpdates, d.portfolios, d.holdings, d.retirement.versions])
    assert.equal(new Set(ids(list)).size, list.length, 'ids are unique')
  const acc = new Set(ids(d.accounts))
  assert.ok(d.balances.every((b) => acc.has(b.accountId)))
  assert.ok(d.portfolios.every((p) => acc.has(p.accountId) && p.reconciled))
  assert.ok(d.propertyValues.every((v) => d.properties.some((p) => p.id === v.propertyId)))
  assert.ok(d.loans.every((l) => d.properties.some((p) => p.id === l.propertyId)))
  assert.ok(d.loanUpdates.every((u) => d.loans.some((l) => l.id === u.loanId)))
  assert.ok(d.retirement.versions.length >= 1 && d.retirement.versions.length <= MAX_VERSIONS)
  assert.ok(d.retirement.plan.selected.every((id) => acc.has(id)))
})

test('every linked Finance balance equals its portfolio holdings, and the unallocated line is shown', () => {
  const d = normalizeData(raw())
  for (const p of d.portfolios) {
    const total = holdingsOf(d, p.id).reduce((s, h) => s + holdingValue(h), 0)
    assert.equal(d.accounts.find((a) => a.id === p.accountId).balance, total, p.name)
    assert.ok(linkStatus(d, p.id).matches)
  }
  assert.equal(d.holdings.filter((h) => h.cls === 'unallocated').length, 1)
})

test('the sample covers every tab', () => {
  const d = normalizeData(raw())
  assert.ok(d.accounts.some((a) => a.type === 'liability') && d.accounts.some((a) => a.owner === 'parent'))
  assert.ok(d.policies.length >= 1 && d.balances.length > 20 && d.rates.length >= 1)
  assert.ok(d.properties.length >= 1 && d.loans.length >= 1)
  assert.ok(d.portfolios.length >= 1 && d.holdings.length >= 5)
  assert.ok(d.retirement.plan.income.length >= 1)
})

test('freshening moves history to the current month and dates the warnings relative to today', () => {
  const d = raw()
  const latest = d.balances.reduce((m, b) => (b.date > m ? b.date : m), '')
  const out = freshenDemo(d, new Date('2027-03-20T12:00:00'))
  const newest = out.balances.reduce((m, b) => (b.date > m ? b.date : m), '')
  assert.equal(newest.slice(0, 7), '2027-03')
  assert.equal(newest.slice(8), latest.slice(8)) // same day of month
  assert.equal(out.balances.length, d.balances.length)
  const purchase = d.propertyValues.find((v) => v.source === 'purchase')
  if (purchase) assert.equal(out.propertyValues.find((v) => v.id === purchase.id).date, purchase.date) // the purchase never moves
  assert.ok(out.holdings.filter((h) => h.priceDate).every((h) => h.priceDate === '2027-03-17'))
  assert.equal(out.retirement.plan.asOf, '2027-03-17')
  assert.equal(out.properties.find((p) => p.taxDue).taxDue, '2027-05-04') // 45 days ahead
  assert.equal(out.retirement.versions[0].plan.asOf, '2027-03-17')
})

test('freshening in the same month, or before it, leaves the history where it is', () => {
  const d = raw()
  const same = freshenDemo(d, new Date('2026-11-20T12:00:00'))
  assert.deepEqual(same.balances.map((b) => b.date), d.balances.map((b) => b.date))
  const earlier = freshenDemo(d, new Date('2026-05-01T12:00:00'))
  assert.deepEqual(earlier.balances.map((b) => b.date), d.balances.map((b) => b.date))
})

test('freshening does not change the input', () => {
  const d = raw()
  const copy = JSON.stringify(d)
  freshenDemo(d, new Date('2028-01-10T12:00:00'))
  assert.equal(JSON.stringify(d), copy)
})
