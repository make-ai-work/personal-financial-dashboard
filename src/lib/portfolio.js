// Pure helpers for the Portfolio tab. A portfolio is linked to ONE Finance asset account; once the link is
// reconciled, that account's balance and asset mix are always calculated from the portfolio's holdings.
//
// portfolio: { id, name, accountId, reconciled, openingBalance, targets: {equities,bonds,cash,metals}|null }
// holding:   { id, portfolioId, name, ticker, type, cls, mix, sector, geo, trackBy: 'units'|'value',
//              units, price, value, priceDate, notes }
//            cls: 'equities'|'bonds'|'cash'|'metals' | 'mixed' (uses `mix`, order = MIX) | 'unallocated'
import { uid } from './model.js'
import { daysBetween } from './dates.js'

export const CLASSES = [
  { key: 'equities', label: 'Equities', color: 'var(--blue)' },
  { key: 'bonds', label: 'Bonds', color: 'var(--purple)' },
  { key: 'cash', label: 'Cash equivalents', color: 'var(--green)' },
  { key: 'metals', label: 'Precious metals', color: 'var(--amber)' },
]
export const UNALLOCATED = { key: 'unallocated', label: 'Unallocated', color: 'var(--grey)' }
export const classLabel = (k) => [...CLASSES, UNALLOCATED].find((c) => c.key === k)?.label || k
export const classColor = (k) => [...CLASSES, UNALLOCATED].find((c) => c.key === k)?.color || 'var(--grey)'

export const HOLDING_TYPES = [
  { key: 'stock', label: 'Stock' }, { key: 'etf', label: 'ETF' }, { key: 'fund', label: 'Mutual fund' },
  { key: 'bond', label: 'Bond' }, { key: 'cash', label: 'Cash' }, { key: 'other', label: 'Other' },
]
export const typeLabel = (k) => HOLDING_TYPES.find((t) => t.key === k)?.label || (k === 'unallocated' ? 'Unallocated' : 'Other')

// account.mix order, shared with Finance: [equities, cash equivalents, precious metals, bonds]
const MIX_ORDER = ['equities', 'cash', 'metals', 'bonds']

export const holdingValue = (h) => (h.trackBy === 'value' ? h.value || 0 : (h.units || 0) * (h.price || 0))
const sumValues = (hs) => hs.reduce((s, h) => s + holdingValue(h), 0)

// ---- mutations (pure). Holding changes re-sync the linked Finance account. ----
export function syncPortfolio(d, portfolioId) {
  const p = d.portfolios.find((x) => x.id === portfolioId)
  if (!p || !p.reconciled) return d // until reconciled, the account keeps its typed balance
  const hs = holdingsOf(d, portfolioId)
  return { ...d, accounts: d.accounts.map((a) => (a.id === p.accountId ? { ...a, balance: sumValues(hs), mix: accountMix(hs) } : a)) }
}

export function addPortfolio(d, { name, accountId, id }) {
  const acc = d.accounts.find((a) => a.id === accountId)
  if (!acc || acc.type !== 'asset' || d.portfolios.some((p) => p.accountId === accountId)) return d
  return { ...d, portfolios: [...d.portfolios, { id: id || uid(), name, accountId, reconciled: false, openingBalance: acc.balance || 0, targets: null }] }
}
export const updatePortfolio = (d, id, patch) => ({ ...d, portfolios: d.portfolios.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
// Deleting a portfolio keeps the account and its last calculated balance and mix as typed values.
export const removePortfolio = (d, id) => ({ ...d, portfolios: d.portfolios.filter((p) => p.id !== id), holdings: d.holdings.filter((h) => h.portfolioId !== id) })

const blank = { ticker: '', type: 'etf', cls: 'equities', mix: null, sector: '', geo: '', trackBy: 'units', units: null, price: null, value: null, priceDate: '', notes: '' }
export const addHolding = (d, h) => syncPortfolio({ ...d, holdings: [...d.holdings, { ...blank, id: uid(), ...h }] }, h.portfolioId)
export function updateHolding(d, id, patch) {
  const h = d.holdings.find((x) => x.id === id)
  return h ? syncPortfolio({ ...d, holdings: d.holdings.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, h.portfolioId) : d
}
export function removeHolding(d, id) {
  const h = d.holdings.find((x) => x.id === id)
  return h ? syncPortfolio({ ...d, holdings: d.holdings.filter((x) => x.id !== id) }, h.portfolioId) : d
}

// Bulk price refresh. entries: { holdingId: number } = new price per unit (or new total for value-tracked rows).
// Blank / invalid entries keep their old price. Every touched row gets `date`.
export function updatePrices(d, portfolioId, date, entries) {
  const holdings = d.holdings.map((h) => {
    const v = entries[h.id]
    if (h.portfolioId !== portfolioId || !(typeof v === 'number' && v >= 0)) return h
    return h.trackBy === 'value' ? { ...h, value: v, priceDate: date } : { ...h, price: v, priceDate: date }
  })
  return syncPortfolio({ ...d, holdings }, portfolioId)
}

// ---- reconciling a newly linked account ----
export function linkStatus(d, portfolioId) {
  const p = d.portfolios.find((x) => x.id === portfolioId)
  const acc = p && d.accounts.find((a) => a.id === p.accountId)
  const holdings = sumValues(holdingsOf(d, portfolioId))
  const account = acc?.balance || 0
  const diff = account - holdings // > 0: account says more than the holdings explain
  return { account, holdings, diff, canAddUnallocated: diff > 0.005, matches: Math.abs(diff) <= 0.005 }
}

// mode 'unallocated' (default): add the shortfall as a holding so the account balance does not change.
// mode 'accept': the account balance becomes the holdings total.
export function finishLinking(d, portfolioId, mode, today) {
  const p = d.portfolios.find((x) => x.id === portfolioId)
  if (!p || p.reconciled) return d
  const st = linkStatus(d, portfolioId)
  let next = d
  if (mode === 'unallocated' && st.canAddUnallocated) {
    next = { ...next, holdings: [...next.holdings, { ...blank, id: uid(), portfolioId, name: 'Unallocated (difference when linked)', type: 'unallocated', cls: 'unallocated', trackBy: 'value', value: st.diff, priceDate: today }] }
  }
  return syncPortfolio(updatePortfolio(next, portfolioId, { reconciled: true }), portfolioId)
}

// ---- queries ----
export const holdingsOf = (d, portfolioId) => d.holdings.filter((h) => h.portfolioId === portfolioId)
export const portfolioFor = (d, accountId) => d.portfolios.find((p) => p.accountId === accountId) || null
export const countryOf = (d, p) => d.accounts.find((a) => a.id === p.accountId)?.country

// Fraction of a holding in each class; a mixed holding follows its own split.
function weights(h) {
  if (h.cls === 'unallocated') return { unallocated: 1 }
  if (h.cls === 'mixed') {
    const tot = (h.mix || []).reduce((s, x) => s + (x || 0), 0)
    if (!(tot > 0)) return { unallocated: 1 }
    return Object.fromEntries(MIX_ORDER.map((k, i) => [k, (h.mix[i] || 0) / tot]))
  }
  return { [h.cls]: 1 }
}

export function classTotals(holdings) {
  const t = { equities: 0, bonds: 0, cash: 0, metals: 0, unallocated: 0 }
  for (const h of holdings) for (const [k, w] of Object.entries(weights(h))) t[k] += holdingValue(h) * w
  return t
}

// Asset mix of the allocated part of a portfolio in Finance's order and format (percent, 1 decimal, sums to 100).
export function accountMix(holdings) {
  const t = classTotals(holdings)
  const allocated = MIX_ORDER.reduce((s, k) => s + t[k], 0)
  if (!(allocated > 0)) return null
  const mix = MIX_ORDER.map((k) => Math.round((t[k] / allocated) * 1000) / 10)
  const resid = Math.round((100 - mix.reduce((a, b) => a + b, 0)) * 10) / 10
  if (resid) mix[mix.indexOf(Math.max(...mix))] += resid
  return mix.map((x) => Math.round(x * 10) / 10)
}

// Allocation rows for any grouping. by: 'class' | 'sector' | 'geo' | 'portfolio' | 'ccy' (uses h.ccy). `names` maps portfolio ids to names.
export function allocation(holdings, by, names = {}) {
  const m = new Map()
  const add = (key, label, color, v) => {
    const e = m.get(key) || { key, label, color, value: 0 }
    e.value += v
    m.set(key, e)
  }
  for (const h of holdings) {
    const v = holdingValue(h)
    if (by === 'class') {
      for (const [k, w] of Object.entries(weights(h))) if (w > 0) add(k, classLabel(k), classColor(k), v * w)
    } else if (by === 'portfolio') add(h.portfolioId, names[h.portfolioId] || 'Portfolio', null, v)
    else if (by === 'ccy') add(h.ccy || 'Other', h.ccy || 'Other', null, v)
    else {
      const raw = (by === 'sector' ? h.sector : h.geo)?.trim()
      add(raw || 'Unspecified', raw || 'Unspecified', raw ? null : 'var(--grey)', v)
    }
  }
  const total = [...m.values()].reduce((s, e) => s + e.value, 0)
  return [...m.values()].filter((e) => e.value > 0).sort((a, b) => b.value - a.value).map((e) => ({ ...e, pct: total > 0 ? (100 * e.value) / total : 0 }))
}

// Single stocks above `limit` percent of their own portfolio (funds and ETFs are exempt).
export function concentration(d, portfolios, limit) {
  const out = []
  for (const p of portfolios) {
    const hs = holdingsOf(d, p.id)
    const total = sumValues(hs)
    if (!(total > 0)) continue
    for (const h of hs) {
      const share = (100 * holdingValue(h)) / total
      if (h.type === 'stock' && share > limit) out.push({ holding: h, portfolio: p, share })
    }
  }
  return out.sort((a, b) => b.share - a.share)
}

export function staleHoldings(d, portfolios, today, days) {
  const ids = new Set(portfolios.map((p) => p.id))
  return d.holdings
    .filter((h) => ids.has(h.portfolioId) && h.type !== 'unallocated' && h.priceDate)
    .map((h) => ({ holding: h, age: daysBetween(h.priceDate, today) }))
    .filter((x) => x.age > days)
    .sort((a, b) => b.age - a.age)
}
export const priceAge = (h, today) => (h.priceDate ? daysBetween(h.priceDate, today) : null)

export const targetsTotal = (t) => CLASSES.reduce((s, c) => s + (t?.[c.key] || 0), 0)

// Class-level rebalancing against the portfolio's targets, on its allocated value (unallocated is left out).
// With newMoney > 0 also returns a buy-only plan (no selling): money goes to the most underweight classes first.
export function rebalance(portfolio, holdings, tolerance, newMoney = 0) {
  const t = portfolio.targets
  if (!t) return null
  if (Math.abs(targetsTotal(t) - 100) > 0.01) return { invalid: true }
  const cur = classTotals(holdings)
  const base = CLASSES.reduce((s, c) => s + cur[c.key], 0)
  const rows = CLASSES.map((c) => {
    const value = cur[c.key]
    const pct = base > 0 ? (100 * value) / base : 0
    const target = t[c.key] || 0
    return { key: c.key, label: c.label, color: c.color, value, pct, target, drift: pct - target, toTarget: (target / 100) * base - value, off: Math.abs(pct - target) > tolerance }
  })
  let plan = null
  if (newMoney > 0) {
    const after = base + newMoney
    const short = rows.map((r) => Math.max(0, (r.target / 100) * after - r.value))
    const need = short.reduce((a, b) => a + b, 0)
    plan = rows.map((r, i) => {
      const buy = need >= newMoney ? (need > 0 ? (short[i] * newMoney) / need : 0) : short[i] + ((newMoney - need) * r.target) / 100
      return { key: r.key, label: r.label, color: r.color, buy, afterPct: (100 * (r.value + buy)) / after, target: r.target }
    })
  }
  return { rows, base, flagged: rows.filter((r) => r.off).length, plan, unallocated: unallocatedOf(holdings) }
}
const unallocatedOf = (hs) => classTotals(hs).unallocated

export function portfolioTotals(d, portfolios) {
  let value = 0
  let holdings = 0
  for (const p of portfolios) {
    const hs = holdingsOf(d, p.id)
    value += sumValues(hs)
    holdings += hs.length
  }
  return { count: portfolios.length, holdings, value }
}
