// Plain-data model for the finance vault. Every function is pure so it can be unit tested.
//
// account:  { id, country, type: 'asset'|'liability', name, number, institution, owner,
//             balance, mix: [eq, cash, metals, bonds] | null, maturityDate, maturityValue }
// policy:   { id, country, name, number, company, owner, deathBenefit, maturityDate, maturityValue }
// balance:  { date: 'YYYY-MM-DD', accountId, amount }   one row per account per saved update
// rate:     { date, from, to, rate }                    1 `from` = `rate` `to`, saved with each update

export const uid = () => crypto.randomUUID()

export const emptyData = () => ({
  version: 1,
  settings: { countries: ['us', 'in'], parentLabel: 'Parent', autoLockMin: 10 },
  accounts: [],
  policies: [],
  balances: [],
  rates: [],
})

export function normalizeData(d) {
  const base = emptyData()
  return {
    version: 1,
    settings: { ...base.settings, ...(d?.settings || {}) },
    accounts: d?.accounts || [],
    policies: d?.policies || [],
    balances: d?.balances || [],
    rates: d?.rates || [],
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
export const removeAccount = (d, id) => ({
  ...d,
  accounts: d.accounts.filter((a) => a.id !== id),
  balances: d.balances.filter((b) => b.accountId !== id),
})

export const addPolicy = (d, p) => ({ ...d, policies: [...d.policies, { id: uid(), ...p }] })
export const updatePolicy = (d, id, patch) => ({
  ...d,
  policies: d.policies.map((p) => (p.id === id ? { ...p, ...patch } : p)),
})
export const removePolicy = (d, id) => ({ ...d, policies: d.policies.filter((p) => p.id !== id) })

// Record today's balances for every account in a country as a dated snapshot.
// Saving twice on the same date replaces that date's snapshot.
export function saveUpdate(d, country, date, fx) {
  const ids = new Set(inCountry(d.accounts, country).map((a) => a.id))
  const balances = d.balances.filter((b) => !(b.date === date && ids.has(b.accountId)))
  for (const a of inCountry(d.accounts, country)) balances.push({ date, accountId: a.id, amount: a.balance || 0 })
  let rates = d.rates
  if (fx && fx.rate > 0) {
    rates = rates.filter((r) => !(r.date === date && r.from === fx.from && r.to === fx.to))
    rates = [...rates, { date, from: fx.from, to: fx.to, rate: fx.rate }]
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

// Convert between the two selected currencies. fx = { base, quote, rate } meaning 1 base = rate quote.
export function convert(amount, from, to, fx) {
  if (from === to) return amount
  if (!fx || !(fx.rate > 0)) return NaN
  if (from === fx.base && to === fx.quote) return amount * fx.rate
  if (from === fx.quote && to === fx.base) return amount / fx.rate
  return NaN
}
