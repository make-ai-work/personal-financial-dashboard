import test from 'node:test'
import assert from 'node:assert/strict'
import { loanPayment, savingsGrowth } from '../src/lib/calc.js'

test('loan payment: the standard figures', () => {
  const r = loanPayment({ amount: 200000, ratePct: 6, years: 30 })
  assert.ok(Math.abs(r.payment - 1199.1) < 0.01); assert.equal(r.months, 360)
  assert.ok(Math.abs(r.totalInterest - 231676) < 5); assert.ok(Math.abs(r.interestShare - 231676 / (231676 + 200000)) < 1e-3)
  const zero = loanPayment({ amount: 12000, ratePct: 0, years: 1 }); assert.equal(zero.payment, 1000); assert.equal(zero.totalInterest, 0)
  assert.equal(loanPayment({ amount: 0, ratePct: 5, years: 5 }), null); assert.equal(loanPayment({ amount: 100, ratePct: -1, years: 5 }), null); assert.equal(loanPayment({ amount: 100, ratePct: 5, years: 0 }), null)
})
test('savings growth: matches the closed formula, and zero return is just the contributions', () => {
  const r = savingsGrowth({ start: 10000, monthly: 500, ratePct: 6, years: 10 })
  const g = Math.pow(1.005, 120)
  assert.ok(Math.abs(r.final - (10000 * g + 500 * ((g - 1) / 0.005))) < 0.01)
  assert.equal(r.contributed, 10000 + 500 * 120); assert.ok(Math.abs(r.growth - (r.final - r.contributed)) < 1e-6)
  assert.equal(r.rows.length, 10); assert.equal(r.rows[0].year, 1); assert.equal(r.rows.at(-1).months, 120)
  const flat = savingsGrowth({ start: 1000, monthly: 100, ratePct: 0, years: 2 }); assert.equal(flat.final, 3400); assert.equal(flat.growth, 0)
  assert.equal(savingsGrowth({ start: 0, monthly: 0, ratePct: 5, years: 5 }), null); assert.equal(savingsGrowth({ start: 100, monthly: 0, ratePct: 5, years: 0 }), null)
  assert.equal(savingsGrowth({ start: 100, monthly: 0, ratePct: 5, years: 1.5 }).rows.at(-1).months, 18)
})
