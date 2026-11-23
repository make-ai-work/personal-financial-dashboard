// The two small general calculators on the Calculators tab. (The mortgage payoff calculator is in amortization.js.)
import { levelPayment } from './amortization.js'

// A loan with a fixed rate and term (an "EMI"): -> { months, payment, totalPaid, totalInterest, interestShare } or null for unusable inputs.
export function loanPayment({ amount, ratePct, years }) {
  const months = Math.round(Number(years) * 12)
  if (!(amount > 0) || !(months > 0) || !(Number(ratePct) >= 0)) return null
  const payment = levelPayment(amount, Number(ratePct), months)
  const totalPaid = payment * months
  return { months, payment, totalPaid, totalInterest: totalPaid - amount, interestShare: totalPaid > 0 ? (totalPaid - amount) / totalPaid : 0 }
}

// What regular saving grows to. Interest is added every month at rate / 12 and the monthly saving is paid in at the end of each month.
// -> { final, contributed, growth, rows: [{ year, contributed, value, growth }] } or null.
export function savingsGrowth({ start, monthly, ratePct, years }) {
  const n = Math.round(Number(years) * 12)
  const s = Number(start) || 0, m = Number(monthly) || 0, r = Number(ratePct)
  if (!(n > 0) || !(r >= 0) || !(s > 0 || m > 0)) return null
  let v = s
  const rows = []
  for (let i = 1; i <= n; i++) {
    v = v * (1 + r / 1200) + m
    if (i % 12 === 0 || i === n) { const contributed = s + m * i; rows.push({ year: Math.ceil(i / 12), months: i, contributed, value: v, growth: v - contributed }) }
  }
  const last = rows[rows.length - 1]
  return { final: last.value, contributed: last.contributed, growth: last.growth, rows }
}
