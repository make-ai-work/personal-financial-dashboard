import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData, addAccount, removeAccount, normalizeData } from '../src/lib/model.js'
import {
  addPortfolio, addHolding, updateHolding, removeHolding, removePortfolio, updatePortfolio, updatePrices, linkStatus, finishLinking,
  holdingValue, classTotals, accountMix, allocation, concentration, staleHoldings, rebalance, portfolioTotals, holdingsOf, portfolioFor,
} from '../src/lib/portfolio.js'

const TODAY = '2026-10-31'
const acct = (o) => ({ country: 'us', type: 'asset', name: 'Brokerage', number: '', institution: 'Schwab', owner: 'joint', balance: 96000, mix: null, maturityDate: '', maturityValue: null, ...o })
const H = (portfolioId, name, cls, units, price, o = {}) => ({ portfolioId, name, cls, trackBy: 'units', units, price, type: 'etf', priceDate: '2026-10-27', ...o })

function schwab({ link = true } = {}) {
  let d = emptyData()
  d = addAccount(d, acct({ id: undefined }))
  const accountId = d.accounts[0].id
  d = addPortfolio(d, { id: 'pf', name: 'Schwab Brokerage', accountId })
  d = addHolding(d, H('pf', 'VTI', 'equities', 160, 250))
  d = addHolding(d, H('pf', 'VXUS', 'equities', 300, 60))
  d = addHolding(d, H('pf', 'AAPL', 'equities', 40, 225, { type: 'stock', sector: 'Technology', geo: 'US' }))
  d = addHolding(d, H('pf', 'MSFT', 'equities', 14, 500, { type: 'stock', sector: 'Technology', geo: 'US' }))
  d = addHolding(d, H('pf', 'BND', 'bonds', 160, 75))
  d = addHolding(d, H('pf', 'SGOV', 'cash', 50, 100))
  d = addHolding(d, H('pf', 'GLD', 'metals', 20, 250, { priceDate: '2026-08-19' }))
  return { d, accountId }
}

test('holding value: units x price, or a typed total', () => {
  assert.equal(holdingValue({ trackBy: 'units', units: 160, price: 250 }), 40000)
  assert.equal(holdingValue({ trackBy: 'value', value: 5000 }), 5000)
  assert.equal(holdingValue({ trackBy: 'units' }), 0)
})

test('a new link does not touch the account until it is reconciled', () => {
  const { d, accountId } = schwab()
  assert.equal(d.accounts[0].balance, 96000)
  assert.equal(d.portfolios[0].reconciled, false)
  assert.equal(d.portfolios[0].openingBalance, 96000)
  const st = linkStatus(d, 'pf')
  assert.deepEqual([st.account, st.holdings, st.diff, st.canAddUnallocated, st.matches], [96000, 96000, 0, false, true])
  assert.equal(portfolioFor(d, accountId).id, 'pf')
})

test('only an asset account that is not already linked can be linked', () => {
  const { d, accountId } = schwab()
  assert.equal(addPortfolio(d, { name: 'again', accountId }).portfolios.length, 1) // already linked
  let e = addAccount(emptyData(), acct({ type: 'liability' }))
  assert.equal(addPortfolio(e, { name: 'x', accountId: e.accounts[0].id }).portfolios.length, 0)
  assert.equal(addPortfolio(emptyData(), { name: 'x', accountId: 'nope' }).portfolios.length, 0)
})

test('reconcile, holdings short of the balance: default adds the difference as an unallocated holding', () => {
  let { d } = schwab()
  d = removeHolding(d, d.holdings.find((h) => h.name === 'GLD').id) // forgot the gold ETF: holdings 91,000 vs account 96,000
  const st = linkStatus(d, 'pf')
  assert.deepEqual([st.holdings, st.diff, st.canAddUnallocated], [91000, 5000, true])
  d = finishLinking(d, 'pf', 'unallocated', TODAY)
  const un = holdingsOf(d, 'pf').find((h) => h.cls === 'unallocated')
  assert.deepEqual([un.value, un.trackBy, un.priceDate, un.type], [5000, 'value', TODAY, 'unallocated'])
  assert.equal(d.accounts[0].balance, 96000) // net worth does not move
  assert.equal(d.portfolios[0].reconciled, true)
})

test('reconcile, accept the new total: the account balance drops to the holdings total', () => {
  let { d } = schwab()
  d = removeHolding(d, d.holdings.find((h) => h.name === 'GLD').id)
  d = finishLinking(d, 'pf', 'accept', TODAY)
  assert.equal(d.accounts[0].balance, 91000)
  assert.equal(holdingsOf(d, 'pf').some((h) => h.cls === 'unallocated'), false)
})

test('reconcile, holdings worth more than the balance: unallocated is not possible, balance rises', () => {
  let d = addAccount(emptyData(), acct({ name: '401(k)', balance: 184000 }))
  d = addPortfolio(d, { id: 'k', name: '401k', accountId: d.accounts[0].id })
  d = addHolding(d, H('k', 'FXAIX', 'equities', 500, 220, { type: 'fund' })) // 110,000
  d = addHolding(d, H('k', 'FSPSX', 'equities', 400, 85, { type: 'fund' })) // 34,000
  d = addHolding(d, H('k', 'FXNAX', 'bonds', 3200, 15.625, { type: 'fund' })) // 50,000 -> 194,000
  const st = linkStatus(d, 'k')
  assert.deepEqual([st.holdings, st.diff, st.canAddUnallocated], [194000, -10000, false])
  d = finishLinking(d, 'k', 'unallocated', TODAY) // asked for unallocated but there is nothing to add
  assert.equal(holdingsOf(d, 'k').some((h) => h.cls === 'unallocated'), false)
  assert.equal(d.accounts[0].balance, 194000)
  assert.deepEqual(d.accounts[0].mix, [74.2, 0, 0, 25.8]) // Finance order: equities, cash, metals, bonds
})

test('after reconciling, every holding change flows into the Finance account', () => {
  let { d } = schwab()
  d = finishLinking(d, 'pf', 'accept', TODAY)
  assert.equal(d.accounts[0].balance, 96000)
  d = updateHolding(d, d.holdings.find((h) => h.name === 'VTI').id, { price: 260 }) // +1,600
  assert.equal(d.accounts[0].balance, 97600)
  d = addHolding(d, H('pf', 'New', 'bonds', 10, 100))
  assert.equal(d.accounts[0].balance, 98600)
  d = removeHolding(d, d.holdings.find((h) => h.name === 'New').id)
  assert.equal(d.accounts[0].balance, 97600)
  assert.deepEqual(d.accounts[0].mix, accountMix(holdingsOf(d, 'pf')))
})

test('account mix is in Finance order, sums to 100, ignores unallocated, and is null with nothing allocated', () => {
  const { d } = schwab()
  assert.deepEqual(accountMix(holdingsOf(d, 'pf')), [77.1, 5.2, 5.2, 12.5])
  assert.equal(accountMix([]), null)
  assert.equal(accountMix([{ cls: 'unallocated', trackBy: 'value', value: 100 }]), null)
  const thirds = accountMix([H('x', 'a', 'equities', 1, 1), H('x', 'b', 'bonds', 1, 1), H('x', 'c', 'cash', 1, 1)])
  assert.equal(Math.round(thirds.reduce((a, b) => a + b, 0) * 10) / 10, 100)
})

test('a mixed fund counts towards its own split', () => {
  const t = classTotals([{ cls: 'mixed', mix: [60, 0, 0, 40], trackBy: 'value', value: 10000 }])
  assert.deepEqual([t.equities, t.bonds, t.cash, t.unallocated], [6000, 4000, 0, 0])
  assert.equal(classTotals([{ cls: 'mixed', mix: null, trackBy: 'value', value: 100 }]).unallocated, 100) // no split given
})

test('allocation by class, sector, geography and portfolio; blanks become Unspecified', () => {
  const { d } = schwab()
  const hs = holdingsOf(d, 'pf')
  const cls = allocation(hs, 'class')
  assert.deepEqual(cls.map((r) => [r.key, Math.round(r.pct * 10) / 10]), [['equities', 77.1], ['bonds', 12.5], ['cash', 5.2], ['metals', 5.2]])
  const sec = allocation(hs, 'sector')
  assert.equal(sec.find((r) => r.key === 'Technology').value, 16000)
  assert.equal(sec.find((r) => r.key === 'Unspecified').value, 80000)
  assert.equal(allocation(hs, 'geo').find((r) => r.key === 'US').value, 16000)
  assert.equal(allocation(hs, 'portfolio', { pf: 'Schwab' })[0].label, 'Schwab')
  assert.equal(Math.round(allocation(hs, 'class').reduce((s, r) => s + r.pct, 0)), 100)
})

test('concentration: only single stocks over the limit, measured against their own portfolio', () => {
  const { d } = schwab()
  const hits = concentration(d, d.portfolios, 7)
  assert.deepEqual(hits.map((x) => [x.holding.name, Math.round(x.share * 10) / 10]), [['AAPL', 9.4], ['MSFT', 7.3]])
  assert.deepEqual(concentration(d, d.portfolios, 10), []) // funds and ETFs are exempt, stocks are under 10%
})

test('stale prices are flagged by age', () => {
  const { d } = schwab()
  const s = staleHoldings(d, d.portfolios, TODAY, 30)
  assert.deepEqual(s.map((x) => [x.holding.name, x.age]), [['GLD', 73]])
  assert.equal(staleHoldings(d, d.portfolios, TODAY, 90).length, 0)
})

test('bulk price update: only valid entries change, the date is stamped, the account follows', () => {
  let { d } = schwab()
  d = finishLinking(d, 'pf', 'accept', TODAY)
  const gld = d.holdings.find((h) => h.name === 'GLD')
  const vti = d.holdings.find((h) => h.name === 'VTI')
  d = updatePrices(d, 'pf', TODAY, { [gld.id]: 262.4, [vti.id]: NaN, ghost: 5 })
  const g = d.holdings.find((h) => h.name === 'GLD')
  assert.deepEqual([g.price, g.priceDate], [262.4, TODAY])
  assert.equal(d.holdings.find((h) => h.name === 'VTI').price, 250) // untouched
  assert.equal(Math.round(d.accounts[0].balance), 96000 + 20 * 12.4)
})

test('rebalancing: drift, amounts to target, tolerance flags', () => {
  let { d } = schwab()
  d = updatePortfolio(d, 'pf', { targets: { equities: 70, bonds: 20, cash: 5, metals: 5 } })
  const r = rebalance(d.portfolios[0], holdingsOf(d, 'pf'), 5)
  const row = Object.fromEntries(r.rows.map((x) => [x.key, x]))
  assert.equal(Math.round(row.equities.drift * 10) / 10, 7.1)
  assert.equal(Math.round(row.equities.toTarget), -6800) // sell
  assert.equal(Math.round(row.bonds.toTarget), 7200) // buy
  assert.deepEqual([row.equities.off, row.bonds.off, row.cash.off, row.metals.off], [true, true, false, false])
  assert.equal(r.flagged, 2)
  assert.equal(r.base, 96000)
  assert.equal(rebalance(d.portfolios[0], holdingsOf(d, 'pf'), 10).flagged, 0) // looser tolerance
})

test('rebalancing: the amounts to reach target always net to zero, and need valid targets', () => {
  let { d } = schwab()
  d = updatePortfolio(d, 'pf', { targets: { equities: 60, bonds: 30, cash: 5, metals: 5 } })
  const r = rebalance(d.portfolios[0], holdingsOf(d, 'pf'), 5)
  assert.ok(Math.abs(r.rows.reduce((s, x) => s + x.toTarget, 0)) < 1e-6)
  assert.equal(rebalance({ targets: null }, [], 5), null)
  assert.deepEqual(rebalance({ targets: { equities: 50, bonds: 20, cash: 5, metals: 5 } }, [], 5), { invalid: true })
})

test('buy-only plan spends exactly the new money and never sells', () => {
  let { d } = schwab()
  d = updatePortfolio(d, 'pf', { targets: { equities: 70, bonds: 20, cash: 5, metals: 5 } })
  const r = rebalance(d.portfolios[0], holdingsOf(d, 'pf'), 5, 5000)
  assert.ok(r.plan.every((p) => p.buy >= 0))
  assert.ok(Math.abs(r.plan.reduce((s, p) => s + p.buy, 0) - 5000) < 1e-6)
  assert.equal(Math.round(r.plan.find((p) => p.key === 'bonds').buy), 4940)
  assert.equal(Math.round(r.plan.find((p) => p.key === 'equities').buy), 0)
  // more money than any shortfall: the remainder is spread by target weight
  const big = rebalance(d.portfolios[0], holdingsOf(d, 'pf'), 5, 100000)
  assert.ok(Math.abs(big.plan.reduce((s, p) => s + p.buy, 0) - 100000) < 1e-6)
  assert.ok(big.plan.every((p) => p.buy >= 0))
})

test('unallocated money is excluded from rebalancing but shown', () => {
  let { d } = schwab()
  d = removeHolding(d, d.holdings.find((h) => h.name === 'GLD').id)
  d = finishLinking(d, 'pf', 'unallocated', TODAY)
  d = updatePortfolio(d, 'pf', { targets: { equities: 70, bonds: 20, cash: 5, metals: 5 } })
  const r = rebalance(d.portfolios[0], holdingsOf(d, 'pf'), 5)
  assert.equal(r.base, 91000)
  assert.equal(r.unallocated, 5000)
})

test('deleting a portfolio keeps the account as typed values; deleting the account removes the portfolio', () => {
  let { d, accountId } = schwab()
  d = finishLinking(d, 'pf', 'accept', TODAY)
  const kept = removePortfolio(d, 'pf')
  assert.equal(kept.holdings.length, 0)
  assert.equal(kept.accounts[0].balance, 96000)
  assert.deepEqual(kept.accounts[0].mix, [77.1, 5.2, 5.2, 12.5])
  const gone = removeAccount(d, accountId)
  assert.deepEqual([gone.accounts.length, gone.portfolios.length, gone.holdings.length], [0, 0, 0])
})

test('totals, and older vaults get portfolio settings', () => {
  const { d } = schwab()
  assert.deepEqual(portfolioTotals(d, d.portfolios), { count: 1, holdings: 7, value: 96000 })
  const n = normalizeData({ settings: { countries: ['uk', 'us'] } })
  assert.deepEqual(n.settings.countries, ['uk', 'us'])
  assert.deepEqual([n.settings.concentrationLimit, n.settings.rebalanceTol, n.settings.priceStaleDays], [10, 5, 30])
  assert.deepEqual([n.portfolios, n.holdings], [[], []])
})
