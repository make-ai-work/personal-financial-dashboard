// Plain-data model for the finance vault. Every function is pure so it can be unit tested.
//
// account:  { id, country, type: 'asset'|'liability', name, number, institution, owner,
//             balance, mix: [eq, cash, metals, bonds] | null, maturityDate, maturityValue }
// policy:   { id, country, name, number, company, owner, deathBenefit, maturityDate, maturityValue }
// balance:  { date: 'YYYY-MM-DD', accountId, amount }   one row per account per saved update
// rate:     { date, from, to, rate }                    1 `from` = `rate` `to`, saved with each update
// property data in ./property.js; portfolios / holdings in ./portfolio.js

import { sanitizeCountries } from './countries.js'

export const uid = () => crypto.randomUUID()

export const emptyData = () => ({
  version: 1,
  settings: { countries: ['us', 'in'], propertyCountries: ['us', 'in'], portfolioCountries: ['us', 'in'], concentrationLimit: 10, rebalanceTol: 5, priceStaleDays: 30, parentLabel: 'Parent', autoLockMin: 10, dueSoonDays: 30 },
  accounts: [],
  policies: [],
  balances: [],
  rates: [],
  pets: [], // legacy: data from the retired Pets tab is kept, not shown (code lives on branch archive/pets-tab)
  petRecords: [],
  properties: [],
  propertyValues: [],
  loans: [],
  loanUpdates: [],
  portfolios: [],
  holdings: [],
})

export function normalizeData(d) {
  const base = emptyData()
  const settings = { ...base.settings, ...(d?.settings || {}) }
  settings.countries = sanitizeCountries(settings.countries, base.settings.countries)
  // Property keeps its own list; a vault from before that existed starts from the Finance list.
  settings.propertyCountries = sanitizeCountries(d?.settings?.propertyCountries || settings.countries)
  settings.portfolioCountries = sanitizeCountries(d?.settings?.portfolioCountries || settings.countries)
  // The reminder window used to be a Pets setting; carry a saved value over.
  settings.dueSoonDays = d?.settings?.dueSoonDays ?? d?.settings?.petSoonDays ?? base.settings.dueSoonDays
  return {
    version: 1,
    settings,
    accounts: d?.accounts || [],
    policies: d?.policies || [],
    balances: d?.balances || [],
    rates: d?.rates || [],
    pets: d?.pets || [],
    petRecords: d?.petRecords || [],
    properties: d?.properties || [],
    propertyValues: d?.propertyValues || [],
    loans: d?.loans || [],
    loanUpdates: d?.loanUpdates || [],
    portfolios: d?.portfolios || [],
    holdings: d?.holdings || [],
  }
}

export const byOwner = (list, owner) => (owner === 'all' ? list : list.filter((x) => x.owner === owner))
export const inCountry = (list, country) => list.filter((x) => x.country === country)

export function totals(accounts) {
  let assets = 0
  let liabilities = 0
  for (const a of accounts) {
    if (a.type === 'asset') assets += a.balance || 0
    else liabilities += a.balance || 0
  }
  return { assets, liabilities, net: assets - liabilities }
}

export const addAccount = (d, acc) => ({ ...d, accounts: [...d.accounts, { id: uid(), ...acc }] })
export const updateAccount = (d, id, patch) => ({
  ...d,
  accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
})
export function removeAccount(d, id) {
  const gone = new Set(d.portfolios.filter((p) => p.accountId === id).map((p) => p.id)) // a linked portfolio goes with it
  return {
    ...d,
    accounts: d.accounts.filter((a) => a.id !== id),
    balances: d.balances.filter((b) => b.accountId !== id),
    portfolios: d.portfolios.filter((p) => !gone.has(p.id)),
    holdings: d.holdings.filter((h) => !gone.has(h.portfolioId)),
  }
}

export const addPolicy = (d, p) => ({ ...d, policies: [...d.policies, { id: uid(), ...p }] })
export const updatePolicy = (d, id, patch) => ({
  ...d,
  policies: d.policies.map((p) => (p.id === id ? { ...p, ...patch } : p)),
})
export const removePolicy = (d, id) => ({ ...d, policies: d.policies.filter((p) => p.id !== id) })

// Record today's balances for every account in a country as a dated snapshot.
// Saving twice on the same date replaces that date's snapshot. `fx` = { base, rates: { INR: 84 } }
// (1 base = rate quote); each rate is saved with the update so history keeps the rate used.
export function saveUpdate(d, country, date, fx) {
  const ids = new Set(inCountry(d.accounts, country).map((a) => a.id))
  const balances = d.balances.filter((b) => !(b.date === date && ids.has(b.accountId)))
  for (const a of inCountry(d.accounts, country)) balances.push({ date, accountId: a.id, amount: a.balance || 0 })
  let rates = d.rates
  for (const [to, rate] of Object.entries(fx?.rates || {})) {
    if (!(rate > 0)) continue
    rates = rates.filter((r) => !(r.date === date && r.from === fx.base && r.to === to))
    rates = [...rates, { date, from: fx.base, to, rate }]
  }
  return { ...d, balances, rates }
}

export function latestSnapshot(d, country) {
  const ids = new Set(inCountry(d.accounts, country).map((a) => a.id))
  const rows = d.balances.filter((b) => ids.has(b.accountId))
  if (!rows.length) return null
  const date = rows.reduce((m, b) => (b.date > m ? b.date : m), rows[0].date)
  return { date, amounts: new Map(rows.filter((b) => b.date === date).map((b) => [b.accountId, b.amount])) }
}

// True when balances were edited (or accounts added) since the last saved update.
export function hasUnsavedBalances(d, country) {
  const accs = inCountry(d.accounts, country)
  if (!accs.length) return false
  const snap = latestSnapshot(d, country)
  if (!snap) return true
  return accs.some((a) => snap.amounts.get(a.id) !== (a.balance || 0))
}

const ym = (iso) => iso.slice(0, 7)
const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

// Month-by-month series for one country. For each month the point uses the EARLIEST update date
// in that month. Months with no update carry the previous value forward (carried: true),
// up to and including the current month.
export function monthSeries(d, country, owner, today = new Date()) {
  const accById = new Map(d.accounts.map((a) => [a.id, a]))
  const byDate = new Map()
  for (const b of d.balances) {
    const a = accById.get(b.accountId)
    if (!a || a.country !== country) continue
    const t = byDate.get(b.date) || { assets: 0, liabilities: 0 }
    if (owner === 'all' || a.owner === owner) {
      if (a.type === 'asset') t.assets += b.amount
      else t.liabilities += b.amount
    }
    byDate.set(b.date, t)
  }
  const dates = [...byDate.keys()].sort()
  if (!dates.length) return []
  const firstOfMonth = new Map()
  for (const date of dates) if (!firstOfMonth.has(ym(date))) firstOfMonth.set(ym(date), date)
  const nowMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const last = ym(dates[dates.length - 1])
  const end = nowMonth > last ? nowMonth : last
  const out = []
  for (let m = ym(dates[0]); m <= end; m = nextMonth(m)) {
    const date = firstOfMonth.get(m)
    if (date) {
      const t = byDate.get(date)
      out.push({ month: m, date, assets: t.assets, liabilities: t.liabilities, net: t.assets - t.liabilities, carried: false })
    } else {
      out.push({ ...out[out.length - 1], month: m, carried: true })
    }
  }
  return out
}

// Convert between currencies through the reporting (base) currency.
// fx = { base, rates: { INR: 84, GBP: 0.78 } } meaning 1 base = rate quote. NaN when a rate is missing.
export function convert(amount, from, to, fx) {
  if (from === to) return amount
  if (!fx) return NaN
  const rateOf = (cur) => (cur === fx.base ? 1 : fx.rates?.[cur])
  const rf = rateOf(from)
  const rt = rateOf(to)
  if (!(rf > 0) || !(rt > 0)) return NaN
  return (amount / rf) * rt
}
