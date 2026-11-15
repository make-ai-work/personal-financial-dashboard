import test from 'node:test'
import assert from 'node:assert/strict'
import { analyse, cholesky, corrMatrix, correlationsValid, generate, makeValid, normWeights, portfolioStats, rng, simulate } from '../src/lib/montecarlo.js'
import { defaultMc } from '../src/lib/retirement.js'

const plan = (o = {}) => ({ age: 35, retAge: 65, life: 95, savings: 339405, ac: 20000, g: 0.03, tax: 0.12, inf: 0.037, spend: 80000, income: [{ amt: 24000, from: 67, to: '' }, { amt: 1429, from: 60, to: '' }], ...o })
const mc = (o = {}) => ({ ...defaultMc(), w: { equities: 77.6, bonds: 18.5, cash: 2.8, metals: 1.1 }, ret: { equities: 4.5, bonds: 0.96, cash: 0.5, metals: 1 }, n: 2000, ...o })
const flat = (o = {}) => mc({ vol: { equities: 0, bonds: 0, cash: 0, metals: 0 }, w: { equities: 100, bonds: 0, cash: 0, metals: 0 }, ...o })

test('rng is repeatable and uniform-ish', () => {
  const a = rng(7), b = rng(7)
  const xs = Array.from({ length: 1000 }, a)
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, b))
  assert.ok(xs.every((x) => x >= 0 && x < 1))
  assert.ok(Math.abs(xs.reduce((s, x) => s + x, 0) / 1000 - 0.5) < 0.05)
})

test('cholesky reproduces the matrix and rejects impossible correlations', () => {
  const C = corrMatrix(defaultMc().cor)
  const L = cholesky(C)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const v = L[i].reduce((s, _, k) => s + L[i][k] * L[j][k], 0)
    assert.ok(Math.abs(v - C[i][j]) < 1e-9)
  }
  // A with B, B with C, but A against C: not possible
  const bad = { eqbd: 0.9, eqcash: -0.9, eqmt: 0, bdcash: 0.9, bdmt: 0, cashmt: 0 }
  assert.equal(correlationsValid(bad), false)
  assert.equal(generate(mc({ cor: bad }), plan()), null)
  assert.equal(analyse(mc({ cor: bad }), plan()), null)
})

test('makeValid returns possible correlations and leaves valid ones alone', () => {
  const bad = { eqbd: 0.9, eqcash: -0.9, eqmt: 0, bdcash: 0.9, bdmt: 0, cashmt: 0 }
  const fixed = makeValid(bad)
  assert.equal(correlationsValid(fixed), true)
  assert.ok(Math.sign(fixed.eqbd) === 1 && Math.sign(fixed.eqcash) === -1) // keeps the direction
  assert.deepEqual(makeValid(defaultMc().cor), defaultMc().cor)
})

test('weights are scaled to 100%', () => {
  assert.deepEqual(normWeights({ equities: 50, bonds: 25, cash: 25, metals: 0 }), [0.5, 0.25, 0.25, 0])
  const w = normWeights({ equities: 77.6, bonds: 18.5, cash: 2.8, metals: 1.1 })
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12)
  assert.deepEqual(normWeights({ equities: 0, bonds: 0, cash: 0, metals: 0 }), [0, 0, 1, 0])
})

test('with zero volatility it matches the plain calculation exactly', () => {
  const p = plan({ income: [] })
  const a = flat()
  const A = analyse(a, p)
  let bal = p.savings, c = p.ac
  const rg = (1 + p.g) / (1 + p.inf)
  for (let t = 0; t < 30; t++) { bal = bal * 1.045 + c; c *= rg }
  assert.ok(Math.abs(A.atRetirement.p50 - bal) / bal < 1e-4)
  assert.equal(A.atRetirement.p10, A.atRetirement.p90) // no spread without volatility
  assert.ok(A.succ === 0 || A.succ === 1) // all futures are identical
})

test('the portfolio mean and swing match the closed-form numbers', () => {
  const a = mc()
  const { avgReturn, swing } = portfolioStats(a)
  const { G } = generate(a, plan())
  let s = 0, s2 = 0
  for (const g of G) { s += g; s2 += g * g }
  const mean = s / G.length
  const sd = Math.sqrt(s2 / G.length - mean * mean)
  assert.ok(Math.abs(mean - 1 - avgReturn) < 0.004)
  assert.ok(Math.abs(sd - swing) < 0.004)
})

test('the same seed gives the same answer, a different seed does not', () => {
  const r1 = analyse(mc(), plan()), r2 = analyse(mc(), plan()), r3 = analyse(mc({ seed: 99 }), plan())
  assert.equal(r1.succ, r2.succ)
  assert.equal(r1.safe, r2.safe)
  assert.deepEqual(r1.bands[10], r2.bands[10])
  assert.notEqual(r1.bands[10].p50, r3.bands[10].p50)
})

test('more spending never raises the chance of success', () => {
  const a = mc()
  const { G, T } = generate(a, plan())
  let prev = 1.01
  for (const spend of [40000, 60000, 80000, 100000, 140000]) {
    const ok = simulate(a, plan({ spend }), G, T, spend, false).ok
    assert.ok(ok <= prev, `${spend}: ${ok} > ${prev}`)
    prev = ok
  }
})

test('spending exactly the safe amount meets the target, and a little more does not', () => {
  const a = mc({ target: 85 })
  const A = analyse(a, plan())
  const { G, T } = generate(a, plan())
  assert.ok(simulate(a, plan(), G, T, A.safe, false).ok >= 0.85)
  assert.ok(simulate(a, plan(), G, T, A.safe * 1.02, false).ok < 0.85 + 0.02)
  assert.ok(A.safe > 0)
})

test('the flexible rule can only help, and a zero cut changes nothing', () => {
  const fixed = analyse(mc(), plan())
  const flex = analyse(mc({ rule: 'flex', cut: 25 }), plan())
  const zero = analyse(mc({ rule: 'flex', cut: 0 }), plan())
  assert.ok(flex.succ >= fixed.succ)
  assert.equal(zero.succ, fixed.succ)
})

test('survival curve falls from the start to the plan-to age and ends at the success rate', () => {
  const A = analyse(mc(), plan())
  assert.equal(A.surv[0].v, 1)
  for (let i = 1; i < A.surv.length; i++) assert.ok(A.surv[i].v <= A.surv[i - 1].v)
  assert.ok(Math.abs(A.surv.at(-1).v - A.succ) < 1e-9)
  assert.equal(A.failed.length, Math.round((1 - A.succ) * 2000))
})

test('bands are ordered and the run covers every year', () => {
  const A = analyse(mc(), plan())
  assert.equal(A.bands.length, 61)
  for (const b of A.bands) assert.ok(b.p10 <= b.p25 && b.p25 <= b.p50 && b.p50 <= b.p75 && b.p75 <= b.p90)
})

test('retiring now (no accumulation) and income that has an end age both work', () => {
  const A = analyse(mc({ n: 500 }), plan({ retAge: 35, income: [{ amt: 30000, from: 35, to: 50 }] }))
  assert.equal(A.N, 0)
  assert.ok(A.succ >= 0 && A.succ <= 1)
  const richer = analyse(mc({ n: 500 }), plan({ retAge: 35, income: [] }))
  assert.ok(A.succ >= richer.succ)
})
