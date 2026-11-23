// Pure helpers for the Property tab. Dates are 'YYYY-MM-DD'; `today` is always passed in.
//
// property:      { id, name, country, address, type, owner, purchaseDate, purchasePrice, bedrooms, bathrooms,
//                  sizeSqft, taxYear, insuranceYear, hoaMonth, taxDue, notes, homeInsurance }
// homeInsurance: null | { insurer, number, premium, frequency, renewal, deductible, rebuildCost, limits: { dwelling, structures, contents, loss, liability, medical }, extras: [{ id, name, limit }], notes }
// valuation:     { id, propertyId, date, value, source, notes }                 (data.propertyValues)
// loan:          { id, propertyId, lender, number, originalAmount, startDate, termYears, rate, rateType,
//                  monthlyPayment, escrow, paymentDay, notes }                  (data.loans)
// loan update:   { id, loanId, date, balance, principal, interest, escrow, notes }  (data.loanUpdates)
import { uid } from './model.js'
import { addDays, addMonths, daysBetween, dueStatus } from './dates.js'
import { money } from './format.js'

export const PROPERTY_TYPES = [
  { key: 'primary', label: 'Primary home', icon: '🏠' },
  { key: 'rental', label: 'Rental', icon: '🏘️' },
  { key: 'investment', label: 'Investment', icon: '🏢' },
  { key: 'vacation', label: 'Vacation home', icon: '🏖️' },
  { key: 'land', label: 'Land', icon: '🌳' },
  { key: 'other', label: 'Other', icon: '🏷️' },
]
export const typeLabel = (k) => PROPERTY_TYPES.find((t) => t.key === k)?.label || 'Other'
export const typeIcon = (k) => PROPERTY_TYPES.find((t) => t.key === k)?.icon || '🏷️'

export const VALUE_SOURCES = [
  { key: 'zillow', label: 'Zillow Zestimate' },
  { key: 'appraisal', label: 'Appraisal' },
  { key: 'agent', label: 'Agent / broker estimate' },
  { key: 'own', label: 'Own estimate' },
  { key: 'purchase', label: 'Purchase price' },
  { key: 'other', label: 'Other' },
]
export const sourceLabel = (k) => VALUE_SOURCES.find((s) => s.key === k)?.label || 'Other'

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
export const ordinal = (n) => {
  const v = n % 100
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}

// ---- mutations (pure) ----
// Adding a property also seeds its value history: the purchase price (if known) and a current value.
export function addProperty(d, p, { currentValue, today } = {}) {
  const prop = { id: uid(), ...p }
  const values = []
  if (prop.purchasePrice > 0 && prop.purchaseDate) values.push({ id: uid(), propertyId: prop.id, date: prop.purchaseDate, value: prop.purchasePrice, source: 'purchase', notes: '' })
  if (currentValue > 0 && today) values.push({ id: uid(), propertyId: prop.id, date: today, value: currentValue, source: 'own', notes: '' })
  return { ...d, properties: [...d.properties, prop], propertyValues: [...d.propertyValues, ...values] }
}
export const updateProperty = (d, id, patch) => ({ ...d, properties: d.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
export function removeProperty(d, id) {
  const loanIds = new Set(d.loans.filter((l) => l.propertyId === id).map((l) => l.id))
  return {
    ...d,
    properties: d.properties.filter((p) => p.id !== id),
    propertyValues: d.propertyValues.filter((v) => v.propertyId !== id),
    loans: d.loans.filter((l) => l.propertyId !== id),
    loanUpdates: d.loanUpdates.filter((u) => !loanIds.has(u.loanId)),
  }
}
export const addValuation = (d, v) => ({ ...d, propertyValues: [...d.propertyValues, { id: uid(), ...v }] })
export const updateValuation = (d, id, patch) => ({ ...d, propertyValues: d.propertyValues.map((v) => (v.id === id ? { ...v, ...patch } : v)) })
export const removeValuation = (d, id) => ({ ...d, propertyValues: d.propertyValues.filter((v) => v.id !== id) })
export const addLoan = (d, l) => ({ ...d, loans: [...d.loans, { id: uid(), ...l }] })
export const updateLoan = (d, id, patch) => ({ ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
export const removeLoan = (d, id) => ({ ...d, loans: d.loans.filter((l) => l.id !== id), loanUpdates: d.loanUpdates.filter((u) => u.loanId !== id) })
export const addLoanUpdate = (d, u) => ({ ...d, loanUpdates: [...d.loanUpdates, { id: uid(), ...u }] })
export const updateLoanUpdate = (d, id, patch) => ({ ...d, loanUpdates: d.loanUpdates.map((u) => (u.id === id ? { ...u, ...patch } : u)) })
export const removeLoanUpdate = (d, id) => ({ ...d, loanUpdates: d.loanUpdates.filter((u) => u.id !== id) })

// ---- loans ----
const monthsElapsed = (from, to) => {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

// Balance the loan should have on `date` if every scheduled payment was made (standard amortisation).
// Falls back to the original amount when the rate, term or start date is missing.
export function scheduledBalance(loan, date) {
  const P = loan.originalAmount
  if (!(P > 0)) return 0
  if (!loan.startDate || !(loan.termYears > 0) || !(loan.rate >= 0) || loan.rate == null) return P
  const N = Math.round(loan.termYears * 12)
  const k = Math.min(Math.max(monthsElapsed(loan.startDate, date), 0), N)
  const r = loan.rate / 1200
  if (k >= N) return 0
  if (r === 0) return P * (1 - k / N)
  const g = (1 + r) ** N
  return (P * (g - (1 + r) ** k)) / (g - 1)
}

export const loansOf = (d, propertyId) => d.loans.filter((l) => l.propertyId === propertyId)
export const updatesOf = (d, loanId) => d.loanUpdates.filter((u) => u.loanId === loanId).sort(byDateDesc)
export const scheduledPayoff = (loan) => (loan.startDate && loan.termYears > 0 ? addMonths(loan.startDate, Math.round(loan.termYears * 12)) : '')

// Latest recorded balance on or before `date`; before the first record, the amortisation estimate.
export function loanBalanceOn(d, loan, date) {
  const rec = updatesOf(d, loan.id).find((u) => u.date <= date)
  if (rec) return { balance: rec.balance, date: rec.date, recorded: true }
  return { balance: scheduledBalance(loan, date), date: null, recorded: false }
}

// ---- home insurance (one policy per property, with its coverage limits) ----
export const COVERAGE_LINES = [
  { key: 'dwelling', label: 'Dwelling (the building)' },
  { key: 'structures', label: 'Other structures' },
  { key: 'contents', label: 'Personal property (contents)' },
  { key: 'loss', label: 'Loss of use (living costs)' },
  { key: 'liability', label: 'Personal liability' },
  { key: 'medical', label: 'Medical payments' },
]
export const PREMIUM_FREQUENCIES = [
  { key: 'year', label: 'per year', perYear: 1 },
  { key: 'quarter', label: 'per quarter', perYear: 4 },
  { key: 'month', label: 'per month', perYear: 12 },
]
export const emptyInsurance = () => ({ insurer: '', number: '', premium: null, frequency: 'year', renewal: '', deductible: null, rebuildCost: null, limits: { dwelling: null, structures: null, contents: null, loss: null, liability: null, medical: null }, extras: [], notes: '' })
export const insuranceAnnual = (ins) => (ins && ins.premium > 0 ? ins.premium * (PREMIUM_FREQUENCIES.find((f) => f.key === ins.frequency)?.perYear || 1) : 0)
export const setHomeInsurance = (d, propertyId, homeInsurance) => updateProperty(d, propertyId, { homeInsurance })

// Things worth a second look: a dwelling limit below the property's value or the rebuild cost, a missing dwelling limit, a renewal that is past or close.
export function insuranceWarnings(ins, value, today, soonDays = 30) {
  if (!ins) return []
  const out = []
  const dwelling = ins.limits?.dwelling
  if (!(dwelling > 0)) out.push({ level: 'warn', text: 'No dwelling limit entered, so the building cover cannot be checked.' })
  else {
    if (ins.rebuildCost > 0 && dwelling < ins.rebuildCost) out.push({ level: 'bad', text: `The dwelling limit is below the rebuild cost you entered (short by ${Math.round(ins.rebuildCost - dwelling).toLocaleString('en-US')}).` })
    else if (!(ins.rebuildCost > 0) && value > 0 && dwelling < value) out.push({ level: 'warn', text: 'The dwelling limit is below the property value. The land is not insured, so this can be fine; enter a rebuild cost to check properly.' })
  }
  if (ins.renewal) {
    const days = daysBetween(today, ins.renewal)
    if (days < 0) out.push({ level: 'bad', text: `The policy renewal date passed ${-days} day${days === -1 ? '' : 's'} ago. Update it or renew.` })
    else if (days <= soonDays) out.push({ level: 'warn', text: `The policy renews in ${days} day${days === 1 ? '' : 's'}.` })
  }
  return out
}

// ---- values ----
export const valuationsOf = (d, propertyId) => d.propertyValues.filter((v) => v.propertyId === propertyId).sort(byDateDesc)
export const currentValuation = (d, propertyId) => valuationsOf(d, propertyId)[0] || null
const valueOn = (d, propertyId, date) => valuationsOf(d, propertyId).find((v) => v.date <= date) || null

export function snapshot(d, property, today) {
  const val = currentValuation(d, property.id)
  const loans = loansOf(d, property.id).map((l) => ({ loan: l, ...loanBalanceOn(d, l, today) }))
  const value = val?.value || 0
  const balance = loans.reduce((s, l) => s + l.balance, 0)
  return {
    valuation: val, value, loans, balance, equity: value - balance, ltv: value > 0 ? balance / value : null,
    monthly: loans.reduce((s, l) => s + (l.loan.monthlyPayment || 0), 0),
  }
}

export function totalsFor(d, properties, today) {
  const t = { count: properties.length, value: 0, balance: 0, equity: 0, monthly: 0 }
  for (const p of properties) {
    const s = snapshot(d, p, today)
    t.value += s.value
    t.balance += s.balance
    t.monthly += s.monthly
  }
  t.equity = t.value - t.balance
  return t
}

// Change in value versus the latest valuation on or before the same day a year ago.
export function changeLast12Months(d, propertyId, today) {
  const cur = currentValuation(d, propertyId)
  const past = valueOn(d, propertyId, addMonths(today, -12))
  if (!cur || !past || past.id === cur.id) return null
  return { delta: cur.value - past.value, pct: ((cur.value - past.value) / past.value) * 100 }
}
export function gainSincePurchase(property, value) {
  if (!(property.purchasePrice > 0) || !(value > 0)) return null
  return { delta: value - property.purchasePrice, pct: ((value - property.purchasePrice) / property.purchasePrice) * 100 }
}
export function valueRange(d, propertyId) {
  const v = valuationsOf(d, propertyId).map((x) => x.value)
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null
}

// ---- reminders ----
// The next calendar date on or after `today` that falls on day-of-month `day` (clamped for short months).
export function nextPaymentDate(day, today) {
  const clamp = (iso) => {
    const [y, m] = iso.split('-').map(Number)
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return `${iso.slice(0, 8)}${String(Math.min(day, dim)).padStart(2, '0')}`
  }
  const thisMonth = clamp(today.slice(0, 8) + '01')
  return thisMonth >= today ? thisMonth : clamp(addMonths(today.slice(0, 8) + '01', 1))
}

export function dueItems(d, today, soonDays, properties) {
  const items = []
  for (const p of properties) {
    for (const l of loansOf(d, p.id)) {
      const bal = loanBalanceOn(d, l, today).balance
      if (l.paymentDay > 0 && l.monthlyPayment > 0 && bal > 0.5) {
        const date = nextPaymentDate(l.paymentDay, today)
        const st = dueStatus(date, today, soonDays)
        items.push({ id: `loan-${l.id}`, propertyId: p.id, country: p.country, label: `${p.name} · Mortgage payment`, sub: `${money(p.country, l.monthlyPayment)} monthly, due on the ${ordinal(l.paymentDay)}`, date, status: st.status, text: st.text, days: st.days })
      }
    }
    if (p.taxDue) {
      const st = dueStatus(p.taxDue, today, soonDays)
      items.push({ id: `tax-${p.id}`, propertyId: p.id, country: p.country, label: `${p.name} · Property tax`, sub: p.taxYear > 0 ? `${money(p.country, p.taxYear)} per year` : 'Property tax', date: p.taxDue, status: st.status, text: st.text, days: st.days })
    }
  }
  for (const p of properties) {
    if (p.homeInsurance?.renewal) {
      const st = dueStatus(p.homeInsurance.renewal, today, soonDays)
      items.push({ id: `ins-${p.id}`, propertyId: p.id, country: p.country, label: `${p.name} · Home insurance renewal`, sub: [p.homeInsurance.insurer, insuranceAnnual(p.homeInsurance) > 0 && `${money(p.country, insuranceAnnual(p.homeInsurance))} per year`].filter(Boolean).join(' · ') || 'Home insurance', date: p.homeInsurance.renewal, ...st })
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// ---- history ----
const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
const nextMonth = (ym) => addMonths(`${ym}-01`, 1).slice(0, 7)

// Month-by-month value, mortgage and equity for a set of properties. A point is "real" when a valuation
// or loan record falls in that month; otherwise the previous figures carry forward (carried: true).
// A property counts from its first valuation. Loan balances before the first record use the schedule.
export function history(d, properties, today) {
  const nowMonth = today.slice(0, 7)
  const starts = []
  const real = new Set()
  const parts = properties
    .map((p) => {
      const vals = valuationsOf(d, p.id)
      if (!vals.length) return null
      const first = vals[vals.length - 1].date
      starts.push(first)
      vals.forEach((v) => real.add(v.date.slice(0, 7)))
      const loans = loansOf(d, p.id)
      loans.forEach((l) => updatesOf(d, l.id).forEach((u) => real.add(u.date.slice(0, 7))))
      return { p, first, loans }
    })
    .filter(Boolean)
  if (!parts.length) return []
  const out = []
  for (let m = starts.sort()[0].slice(0, 7); m <= nowMonth; m = nextMonth(m)) {
    const cutoff = m === nowMonth ? today : lastDay(m)
    let value = 0
    let mortgage = 0
    for (const { p, first, loans } of parts) {
      if (cutoff < first) continue
      value += valueOn(d, p.id, cutoff)?.value || 0
      for (const l of loans) {
        if (l.startDate && cutoff < l.startDate && !updatesOf(d, l.id).some((u) => u.date <= cutoff)) continue
        mortgage += loanBalanceOn(d, l, cutoff).balance
      }
    }
    const [y, mo] = m.split('-').map(Number)
    out.push({ key: m, month: m, date: cutoff, t: Date.UTC(y, mo - 1, Number(cutoff.slice(8))), value, mortgage, equity: value - mortgage, carried: !real.has(m) })
  }
  return out
}
export { addDays, daysBetween }
