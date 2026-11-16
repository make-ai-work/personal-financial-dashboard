import test from 'node:test'
import assert from 'node:assert/strict'
import { combinedSeries, netWorth, ownerBreakdown } from '../src/lib/networth.js'

const fx = { base: 'USD', rates: { INR: 84 } }
const data = () => ({
  settings: { countries: ['us', 'in'] },
  accounts: [
    { id: 'a', country: 'us', type: 'asset', owner: 'mine', balance: 600 }, { id: 'b', country: 'us', type: 'asset', owner: 'spouse', balance: 300 },
    { id: 'c', country: 'us', type: 'liability', owner: 'mine', balance: 100 }, { id: 'd', country: 'in', type: 'asset', owner: 'parent', balance: 8400 },
  ],
  balances: [
    { accountId: 'a', date: '2026-09-10', amount: 500 }, { accountId: 'a', date: '2026-10-10', amount: 600 },
    { accountId: 'd', date: '2026-10-12', amount: 8400 }, { accountId: 'c', date: '2026-10-10', amount: 100 },
  ],
})

test('ownership: each owner in the reporting currency with its share of the total', () => {
  const o = ownerBreakdown(data(), fx)
  assert.equal(o.base, 'USD'); assert.equal(o.ready, true)
  assert.deepEqual(o.rows.map((r) => [r.owner, r.net]), [['mine', 500], ['joint', 0], ['spouse', 300], ['parent', 100]])
  assert.equal(o.all, 900)
  assert.deepEqual(o.rows.map((r) => Math.round(r.share)), [56, 0, 33, 11])
})

test('ownership: without an exchange rate it is not ready and shows no shares instead of wrong numbers', () => {
  const o = ownerBreakdown(data(), { base: 'USD', rates: {} })
  assert.equal(o.ready, false); assert.ok(o.rows.every((r) => r.owner === 'parent' ? r.share === null || Number.isNaN(r.net) : true))
})

test('combined history: every month in the reporting currency, rates applied, empty when rates are missing', () => {
  const s = combinedSeries(data(), 'all', fx)
  assert.deepEqual(s.slice(0, 2).map((p) => p.month), ['2026-09', '2026-10']) // later months carry the last figures forward up to today
  assert.ok(s.slice(2).every((p) => p.carried && p.net === s[1].net))
  assert.equal(s[0].net, 500); assert.equal(s[1].net, 600 - 100 + 8400 / 84) // 600 assets - 100 loan + 100 from India
  assert.deepEqual(combinedSeries(data(), 'all', { base: 'USD', rates: {} }), [])
  assert.ok(combinedSeries(data(), 'spouse', fx).every((p) => p.net === 0)) // nothing recorded for the spouse in those months
})

test('the summary total matches the sum of the countries in the first currency', () => {
  const n = netWorth(data(), 'all', fx)
  assert.equal(n.total.net, 900); assert.equal(n.total.assets, 600 + 300 + 100); assert.equal(n.total.liabilities, 100)
})
