import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyData, addAccount, saveUpdate, monthSeries, totals, hasUnsavedBalances,
  removeAccount, byOwner, convert, latestSnapshot,
} from '../src/lib/model.js'

const acc = (o) => ({ country: 'us', type: 'asset', name: 'x', number: '', institution: '', owner: 'mine', balance: 0, mix: null, maturityDate: '', maturityValue: null, ...o })
const setup = () => {
  let d = emptyData()
  d = addAccount(d, acc({ name: 'Checking', balance: 100 }))
  d = addAccount(d, acc({ name: 'Joint brokerage', owner: 'joint', balance: 50 }))
  d = addAccount(d, acc({ name: 'Loan', type: 'liability', balance: 30 }))
  return d
}

test('totals split assets and liabilities', () => {
  const t = totals(setup().accounts)
  assert.deepEqual(t, { assets: 150, liabilities: 30, net: 120 })
})

test('owner filter', () => {
  assert.equal(byOwner(setup().accounts, 'joint').length, 1)
  assert.equal(byOwner(setup().accounts, 'all').length, 3)
})

test('saveUpdate replaces a same-day snapshot and records the rate once', () => {
  let d = setup()
  d = saveUpdate(d, 'us', '2026-03-10', { base: 'USD', rates: { INR: 84 } })
  d = saveUpdate(d, 'us', '2026-03-10', { base: 'USD', rates: { INR: 85, GBP: 0.8 } })
  assert.equal(d.balances.length, 3)
  assert.equal(d.rates.length, 2) // INR replaced, GBP added
  assert.equal(d.rates.find((r) => r.to === 'INR').rate, 85)
})

test('unsaved balance detection', () => {
  let d = setup()
  assert.equal(hasUnsavedBalances(d, 'us'), true)
  d = saveUpdate(d, 'us', '2026-03-10')
  assert.equal(hasUnsavedBalances(d, 'us'), false)
  d = { ...d, accounts: d.accounts.map((a, i) => (i === 0 ? { ...a, balance: 999 } : a)) }
  assert.equal(hasUnsavedBalances(d, 'us'), true)
  assert.equal(latestSnapshot(d, 'us').date, '2026-03-10')
})

test('month series uses the earliest update in a month and carries missing months forward', () => {
  let d = setup()
  d = saveUpdate(d, 'us', '2026-01-20')
  d = { ...d, accounts: d.accounts.map((a) => (a.name === 'Checking' ? { ...a, balance: 200 } : a)) }
  d = saveUpdate(d, 'us', '2026-03-25')
  d = { ...d, accounts: d.accounts.map((a) => (a.name === 'Checking' ? { ...a, balance: 300 } : a)) }
  d = saveUpdate(d, 'us', '2026-03-05') // earlier date in March than the 25th
  const s = monthSeries(d, 'us', 'all', new Date(2026, 4, 15)) // today = May 2026
  assert.deepEqual(s.map((p) => p.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'])
  assert.deepEqual(s.map((p) => p.carried), [false, true, false, true, true])
  assert.equal(s[0].net, 120) // 100 + 50 - 30
  assert.equal(s[2].date, '2026-03-05') // earliest date in the month
  assert.equal(s[2].net, 320) // 300 + 50 - 30
  assert.equal(s[1].net, 120) // carried from January
  assert.equal(s[4].net, 320) // carried from March
})

test('month series respects the owner filter but keeps months aligned', () => {
  let d = setup()
  d = saveUpdate(d, 'us', '2026-01-02')
  const s = monthSeries(d, 'us', 'joint', new Date(2026, 0, 31))
  assert.equal(s.length, 1)
  assert.deepEqual([s[0].assets, s[0].liabilities], [50, 0])
  assert.equal(monthSeries(d, 'us', 'parent', new Date(2026, 0, 31))[0].net, 0)
})

test('removing an account removes its history', () => {
  let d = saveUpdate(setup(), 'us', '2026-01-02')
  d = removeAccount(d, d.accounts[0].id)
  assert.equal(d.accounts.length, 2)
  assert.equal(d.balances.length, 2)
})

test('currency conversion', () => {
  const fx = { base: 'USD', rates: { INR: 84, GBP: 0.8 } }
  assert.equal(convert(10, 'USD', 'INR', fx), 840)
  assert.equal(convert(840, 'INR', 'USD', fx), 10)
  assert.equal(convert(5, 'USD', 'USD', fx), 5)
  assert.equal(convert(840, 'INR', 'GBP', fx), 8) // cross rate goes through the base currency
  assert.ok(Number.isNaN(convert(5, 'USD', 'INR', null)))
  assert.ok(Number.isNaN(convert(5, 'USD', 'CHF', fx))) // no rate for CHF
})
