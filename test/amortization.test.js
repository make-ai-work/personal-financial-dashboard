import test from 'node:test'
import assert from 'node:assert/strict'
import { compare, describeMonths, levelPayment, monthsToPayOff, schedule, timeRemaining } from '../src/lib/amortization.js'

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`)

test('the level payment matches the standard figure (200,000 at 6% for 30 years = 1,199.10)', () => {
  close(levelPayment(200000, 6, 360), 1199.1010503)
  close(levelPayment(120000, 0, 120), 1000)
  assert.equal(levelPayment(0, 5, 360), 0)
})

test('a plain schedule ends at zero after the term and pays the exact total interest', () => {
  const pay = levelPayment(200000, 6, 360)
  const s = schedule({ balance: 200000, ratePct: 6, payment: pay, startDate: '2026-01-01' })
  assert.equal(s.months, 360); assert.equal(s.neverPaysOff, false); assert.equal(s.rows.at(-1).balance, 0)
  close(s.totalInterest, 231676.4, 1) // 1199.10 x 360 − 200,000
  close(s.rows[0].interest, 1000); close(s.rows[0].principal, 199.10, 0.01)
  assert.equal(s.payoffDate, '2055-12-01')
  close(s.totalPaid, 200000 + s.totalInterest, 1e-6)
})

test('an extra amount every month shortens the loan and saves interest', () => {
  const pay = levelPayment(200000, 6, 360)
  const c = compare({ balance: 200000, ratePct: 6, payment: pay, startDate: '2026-01-01', extras: { monthly: 200 } })
  assert.ok(c.monthsSaved > 100, `saved ${c.monthsSaved} months`)
  assert.ok(c.interestSaved > 60000)
  assert.equal(c.withExtra.rows.at(-1).balance, 0)
  // 200 extra a month on this loan pays it off in 21 years (252 months), 108 months early
  assert.equal(c.withExtra.months, 252); assert.equal(c.monthsSaved, 108)
})

test('a yearly extra and one-time lump sums land in their month, and never overpay', () => {
  const s = schedule({ balance: 50000, ratePct: 5, payment: 1000, startDate: '2026-01-01', extras: { yearly: 2000, yearlyMonth: 6, lumps: [{ date: '2026-03-15', amount: 5000 }] } })
  assert.equal(s.rows[2].extra, 5000) // March
  assert.equal(s.rows[5].extra, 2000) // June
  assert.equal(s.rows[0].extra, 0)
  const tiny = schedule({ balance: 1000, ratePct: 5, payment: 400, startDate: '2026-01-01', extras: { lumps: [{ date: '2026-01-01', amount: 99999 }] } })
  assert.equal(tiny.rows.at(-1).balance, 0); assert.ok(tiny.totalPaid < 1005) // the extra is capped at what is owed
})

test('a payment that does not cover the interest never pays off, and says so', () => {
  const s = schedule({ balance: 100000, ratePct: 12, payment: 500, startDate: '2026-01-01' })
  assert.equal(s.neverPaysOff, true)
  assert.equal(monthsToPayOff(100000, 12, 500), null)
  assert.equal(describeMonths(null), 'never at this payment')
})

test('months to pay off, and how they are described', () => {
  assert.equal(monthsToPayOff(200000, 6, levelPayment(200000, 6, 360)), 360)
  assert.equal(monthsToPayOff(1200, 0, 100), 12)
  assert.equal(monthsToPayOff(0, 5, 100), 0)
  assert.equal(describeMonths(280), '23 years 4 months'); assert.equal(describeMonths(12), '1 year'); assert.equal(describeMonths(5), '5 months'); assert.equal(describeMonths(0), 'paid off')
})

test('time remaining: from the payment when the rate is known, else from the start date and term', () => {
  const pay = levelPayment(200000, 6, 360)
  const a = timeRemaining({ balance: 200000, ratePct: 6, payment: pay }, '2026-01-01')
  assert.equal(a.months, 360); assert.equal(a.source, 'payment'); assert.equal(a.payoffDate, '2056-01-01')
  const b = timeRemaining({ balance: 150000, startDate: '2020-06-01', termYears: 30 }, '2026-06-01')
  assert.equal(b.months, 288); assert.equal(b.source, 'term'); assert.equal(b.payoffDate, '2050-06-01')
  assert.equal(timeRemaining({ balance: 150000 }, '2026-06-01'), null)
  assert.equal(timeRemaining({ balance: 0 }, '2026-06-01').months, 0)
})
