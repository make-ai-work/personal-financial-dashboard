// Total net worth for the Home page: every selected country converted into the first country's currency.
import { byOwner, convert, inCountry, monthSeries, totals } from './model.js'
import { COUNTRIES, OWNERS } from './format.js'

// fx: { base: 'USD', rates: { INR: 83, ... } } (rates[Q] = how many Q for 1 base). owner: 'all' | 'mine' | 'joint' | 'spouse' | 'parent'.
export function netWorth(data, owner, fx) {
  const codes = data.settings.countries
  const base = COUNTRIES[codes[0]].currency
  const per = codes.map((c) => {
    const t = totals(byOwner(inCountry(data.accounts, c), owner))
    const cur = COUNTRIES[c].currency
    return { code: c, currency: cur, ...t, inBase: { assets: convert(t.assets, cur, base, fx), liabilities: convert(t.liabilities, cur, base, fx), net: convert(t.net, cur, base, fx) } }
  })
  const sum = (k) => per.reduce((s, p) => s + p.inBase[k], 0)
  const total = { assets: sum('assets'), liabilities: sum('liabilities'), net: sum('net') }
  return { base, per, total, ready: !Number.isNaN(total.net) }
}

// Net worth of each owner (Mine, Joint, Spouse, Parent) in the reporting currency, with its share of everyone's total.
export function ownerBreakdown(data, fx) {
  const rows = OWNERS.map((owner) => ({ owner, net: netWorth(data, owner, fx).total.net }))
  const all = rows.reduce((s, r) => s + (Number.isNaN(r.net) ? 0 : r.net), 0)
  return { base: COUNTRIES[data.settings.countries[0]].currency, ready: rows.every((r) => !Number.isNaN(r.net)), rows: rows.map((r) => ({ ...r, share: all > 0 && !Number.isNaN(r.net) ? (r.net / all) * 100 : null })), all }
}

// Month-by-month net worth of all selected countries in the reporting currency, converted at today's rate.
// -> [{ month, date, net, carried }]  (empty until the exchange rates are known)
export function combinedSeries(data, owner, fx) {
  const codes = data.settings.countries
  const base = COUNTRIES[codes[0]].currency
  const series = codes.map((c) => monthSeries(data, c, owner))
  const months = [...new Set(series.flat().map((p) => p.month))].sort()
  const out = []
  for (const m of months) {
    const hits = series.map((s) => s.find((p) => p.month === m))
    let net = 0
    hits.forEach((h, i) => { if (h) net += convert(h.net, COUNTRIES[codes[i]].currency, base, fx) })
    if (Number.isNaN(net)) return []
    out.push({ month: m, date: hits.find(Boolean).date, net, carried: hits.every((h) => !h || h.carried) })
  }
  return out
}
