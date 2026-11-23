// Mortgage amortisation with extra payments. Pure functions, all money in the loan's currency, dates 'YYYY-MM-DD'.
//   - interest each month = balance x (annual rate / 12); the regular payment is principal + interest (escrow is not part of it)
//   - extra payments go straight to principal in the month they are made, after that month's regular payment
//   - the last payment is capped at what is owed, so the loan ends exactly at zero
import { addMonths } from './dates.js'

// The level payment that repays `principal` in `months` at `ratePct` a year.
export function levelPayment(principal, ratePct, months) {
  if (!(principal > 0) || !(months > 0)) return 0
  const r = ratePct / 1200
  if (!r) return principal / months
  return (principal * r) / (1 - (1 + r) ** -months)
}

// Months left to repay `balance` with `payment` a month (null = never: the payment does not cover the interest).
export function monthsToPayOff(balance, ratePct, payment) {
  if (!(balance > 0)) return 0
  const r = ratePct / 1200
  if (!(payment > 0)) return null
  if (!r) return Math.ceil(balance / payment - 1e-9)
  if (payment <= balance * r) return null
  return Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r) - 1e-9)
}

// "23 years 4 months" (or "5 months", "1 year"), for a number of months.
export function describeMonths(n) {
  if (n == null) return 'never at this payment'
  if (n <= 0) return 'paid off'
  const y = Math.floor(n / 12), m = n % 12
  return [y && `${y} year${y === 1 ? '' : 's'}`, m && `${m} month${m === 1 ? '' : 's'}`].filter(Boolean).join(' ')
}

// extras: { monthly: n, yearly: n, yearlyMonth: 1-12 (calendar month the yearly extra is paid), lumps: [{ date, amount }] }
// -> { rows: [{ n, date, payment, interest, principal, extra, balance }], months, payoffDate, totalInterest, totalPaid, neverPaysOff }
export function schedule({ balance, ratePct, payment, startDate, extras = {}, maxMonths = 1200 }) {
  const { monthly = 0, yearly = 0, yearlyMonth = 12, lumps = [] } = extras
  const r = ratePct / 1200
  const rows = []
  let bal = balance
  let totalInterest = 0
  let totalPaid = 0
  if (!(balance > 0)) return { rows, months: 0, payoffDate: startDate, totalInterest: 0, totalPaid: 0, neverPaysOff: false }
  const lumpMonths = new Map()
  for (const l of lumps) if (l.date && l.amount > 0) { const k = l.date.slice(0, 7); lumpMonths.set(k, (lumpMonths.get(k) || 0) + Number(l.amount)) }
  for (let n = 1; n <= maxMonths && bal > 0.005; n++) {
    const date = addMonths(startDate, n - 1)
    const interest = bal * r
    let pay = Math.min(payment, bal + interest)
    let principal = pay - interest
    if (principal < 0 && n > 1 && bal >= balance) break // the payment does not cover the interest: the balance only grows
    let extra = Number(monthly) || 0
    if (yearly > 0 && Number(date.slice(5, 7)) === Number(yearlyMonth)) extra += Number(yearly)
    extra += lumpMonths.get(date.slice(0, 7)) || 0
    extra = Math.min(extra, Math.max(0, bal - principal))
    bal = Math.max(0, bal - principal - extra)
    totalInterest += interest
    totalPaid += pay + extra
    rows.push({ n, date, payment: pay, interest, principal, extra, balance: bal < 0.005 ? 0 : bal })
  }
  const last = rows[rows.length - 1]
  const neverPaysOff = !last || last.balance > 0.005
  return { rows, months: rows.length, payoffDate: neverPaysOff ? '' : last.date, totalInterest, totalPaid, neverPaysOff }
}

// The same loan with and without the extras: months and interest saved.
export function compare(input) {
  const base = schedule({ ...input, extras: {} })
  const withExtra = schedule(input)
  return {
    base, withExtra,
    monthsSaved: base.neverPaysOff || withExtra.neverPaysOff ? null : base.months - withExtra.months,
    interestSaved: base.neverPaysOff ? null : base.totalInterest - withExtra.totalInterest,
  }
}

// How long a recorded loan has left. Uses the rate and payment when both are known, else the scheduled end date (start + term). -> { months, payoffDate, source } or null
export function timeRemaining({ balance, ratePct, payment, startDate, termYears }, today) {
  if (!(balance > 0)) return { months: 0, payoffDate: today, source: 'paid' }
  if (payment > 0 && ratePct != null && ratePct >= 0) {
    const n = monthsToPayOff(balance, ratePct, payment)
    if (n != null) return { months: n, payoffDate: addMonths(today, n), source: 'payment' }
  }
  if (startDate && termYears > 0) {
    const end = addMonths(startDate, Math.round(termYears * 12))
    const [y1, m1] = today.split('-').map(Number), [y2, m2] = end.split('-').map(Number)
    return { months: Math.max(0, (y2 - y1) * 12 + (m2 - m1)), payoffDate: end, source: 'term' }
  }
  return null
}
