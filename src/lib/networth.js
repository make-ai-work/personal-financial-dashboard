// Total net worth for the Home page: every selected country converted into the first country's currency.
import { byOwner, convert, inCountry, totals } from './model.js'
import { COUNTRIES } from './format.js'

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
