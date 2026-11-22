import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData, normalizeData, removeAccount, addAccount } from '../src/lib/model.js'
import {
  MAX_VERSIONS, canSaveVersion, defaultPlan, deleteVersion, loadVersion, marketAgeDays, normalizeRetirement, overwriteVersion, planProblems,
  renameVersion, resolveMc, resolvePlan, runPlan, saveVersion,
} from '../src/lib/retirement.js'

const fx = { base: 'USD', rates: { INR: 80 } }
const withAccounts = () => {
  let d = emptyData()
  d = addAccount(d, { id: 'a1', country: 'us', type: 'asset', name: 'Brokerage', owner: 'mine', balance: 100000, mix: [80, 10, 0, 10] })
  d = addAccount(d, { id: 'a2', country: 'in', type: 'asset', name: 'Mutual funds', owner: 'mine', balance: 8000000, mix: [100, 0, 0, 0] }) // = $100,000
  d = addAccount(d, { id: 'a3', country: 'us', type: 'asset', name: 'Checking', owner: 'mine', balance: 20000, mix: null })
  d = addAccount(d, { id: 'l1', country: 'us', type: 'liability', name: 'Loan', owner: 'mine', balance: 5000 })
  return d
}
const pick = (d, ids, extra = {}) => ({ ...d, retirement: { ...d.retirement, plan: { ...d.retirement.plan, selected: ids, ...extra } } })

test('a new vault has the retirement defaults and old vaults get them filled in', () => {
  assert.deepEqual(emptyData().retirement.versions, [])
  const d = normalizeData({ accounts: [] })
  assert.equal(d.retirement.plan.retAge, 65)
  assert.equal(d.retirement.mc.n, 5000)
  assert.equal(normalizeRetirement({ plan: { retAge: 60 } }).plan.retAge, 60)
})

test('savings add up the ticked accounts in the plan currency and honour the adjustment', () => {
  const d = pick(withAccounts(), ['a1', 'a2'], { adjustment: 5000 })
  const p = resolvePlan(d, fx)
  assert.equal(p.currency, 'USD')
  assert.equal(Math.round(p.savings), 205000) // 100,000 + 8,000,000/80 + 5,000
  assert.equal(p.picked.length, 2)
  assert.equal(p.missingRates, false)
})

test('a liability can never be ticked in, and a missing rate is flagged instead of guessed', () => {
  const d = pick(withAccounts(), ['l1', 'a2'])
  const p = resolvePlan(d, { base: 'USD', rates: {} })
  assert.equal(p.picked.length, 1)
  assert.equal(p.missingRates, true)
  assert.equal(p.savings, 0)
})

test('equity share and weights come from the account mixes, weighted by balance', () => {
  const p = resolvePlan(pick(withAccounts(), ['a1', 'a2']), fx)
  assert.ok(Math.abs(p.eqAuto - 90) < 1e-9) // (80% of 100k + 100% of 100k) / 200k
  assert.equal(p.autoWeights.equities, 90)
  assert.equal(p.autoWeights.cash, 5)
  assert.equal(p.autoWeights.bonds, 5)
  assert.equal(Math.round(Object.values(p.autoWeights).reduce((a, b) => a + b, 0) * 10) / 10, 100)
  // an account with no mix counts as cash
  const c = resolvePlan(pick(withAccounts(), ['a3']), fx)
  assert.equal(c.autoWeights.cash, 100)
  // typed equity share wins over the automatic one
  assert.equal(resolvePlan(pick(withAccounts(), ['a1'], { eqOverride: 50 }), fx).we, 0.5)
})

test('nothing ticked gives a neutral starting mix that still adds up to 100', () => {
  const p = resolvePlan(withAccounts(), fx)
  assert.equal(p.savings, 0)
  assert.equal(Object.values(p.autoWeights).reduce((a, b) => a + b, 0), 100)
})

test('income is converted and keeps its ages', () => {
  const d = pick(withAccounts(), [], { income: [{ id: 'i1', name: 'Pension', amt: 800000, cur: 'INR', from: 60, to: '' }] })
  const p = resolvePlan(d, fx)
  assert.equal(p.income[0].amt, 10000)
  assert.equal(p.income[0].from, 60)
})

test('removing a Finance account unticks it from the plan', () => {
  const d = removeAccount(pick(withAccounts(), ['a1', 'a2']), 'a1')
  assert.deepEqual(d.retirement.plan.selected, ['a2'])
})

test('plan problems are reported', () => {
  const ok = resolvePlan(withAccounts(), fx)
  assert.deepEqual(planProblems(ok), [])
  assert.equal(planProblems({ ...ok, retAge: 30 }).length, 1)
  assert.ok(planProblems({ ...ok, life: 60 }).length >= 1)
  assert.ok(planProblems({ ...ok, tax: 0.95 }).length >= 1)
})

test('resolveMc follows the market figures until you override them', () => {
  const p = resolvePlan(withAccounts(), fx)
  const m = resolveMc(defaultPlan() && normalizeRetirement().mc, p)
  assert.equal(m.ret.equities, 4.5)
  assert.equal(m.ret.bonds, Math.round(((1.047 / 1.037) - 1) * 10000) / 100)
  assert.equal(resolveMc({ ...normalizeRetirement().mc, ret: { equities: 6, bonds: 2, cash: 0.5, metals: 1 } }, p).ret.equities, 6)
})

test('the deterministic projection: closes the gap it reports, and reacts to the yield', () => {
  const p = resolvePlan(pick(withAccounts(), ['a1', 'a2']), fx)
  const o = runPlan(p)
  assert.ok(o.needed > 0 && o.balRet > 0)
  assert.ok(Math.abs(o.shortfall - (o.needed - o.balRet)) < 1e-6)
  // saving the extra amount (growing with contributions) makes the balance cover the need
  if (o.extra > 0) {
    const fixed = runPlan(p, { ac: p.ac + o.extra })
    assert.ok(fixed.balRet >= fixed.needed - 1)
  }
  assert.ok(runPlan(p, { y: p.y + 0.02 }).needed < o.needed) // higher yields need a smaller nest egg
  assert.equal(runPlan({ ...p, spend: 0, income: [] }).needed, 0)
})

test('income lowers the nest egg needed, and an end age is respected', () => {
  const p = resolvePlan(pick(withAccounts(), ['a1']), fx)
  const none = runPlan({ ...p, income: [] })
  const some = runPlan({ ...p, income: [{ amt: 20000, from: 67, to: '' }] })
  const short = runPlan({ ...p, income: [{ amt: 20000, from: 67, to: 70 }] })
  assert.ok(some.needed < short.needed && short.needed < none.needed)
})

test('at most three versions can be saved', () => {
  let d = withAccounts()
  const sum = { succ: 0.8, medRet: 1, safe: 1, medEnd: 1, savings: 1, med50: [] }
  for (let i = 0; i < 5; i++) d = saveVersion(d, `V${i}`, sum, '2026-11-15')
  assert.equal(d.retirement.versions.length, MAX_VERSIONS)
  assert.equal(canSaveVersion(d), false)
  assert.deepEqual(d.retirement.versions.map((v) => v.name), ['V0', 'V1', 'V2'])
  d = deleteVersion(d, d.retirement.versions[1].id)
  assert.equal(canSaveVersion(d), true)
  assert.equal(d.retirement.versions.length, 2)
  // a vault with more than three on disk is trimmed when loaded
  const big = { ...d.retirement, versions: Array.from({ length: 5 }, (_, i) => ({ ...d.retirement.versions[0], id: `x${i}` })) }
  assert.equal(normalizeData({ retirement: big }).retirement.versions.length, 3)
})

test('saving copies the inputs; loading restores them; overwrite keeps the name', () => {
  let d = pick(withAccounts(), ['a1'], { retAge: 62, spend: 70000 })
  const sum = { succ: 0.79, medRet: 1, safe: 1, medEnd: 1, savings: 1, med50: [] }
  d = saveVersion(d, '  Retire early  ', sum, '2026-11-15')
  const v = d.retirement.versions[0]
  assert.equal(v.name, 'Retire early')
  assert.equal(v.plan.retAge, 62)
  // change the live inputs; the saved copy must not move
  d = { ...d, retirement: { ...d.retirement, plan: { ...d.retirement.plan, retAge: 67 }, mc: { ...d.retirement.mc, seed: 7 } } }
  assert.equal(d.retirement.versions[0].plan.retAge, 62)
  const loaded = loadVersion(d, v.id)
  assert.equal(loaded.retirement.plan.retAge, 62)
  assert.equal(loaded.retirement.mc.seed, 12345)
  const over = overwriteVersion(d, v.id, { ...sum, succ: 0.5 }, '2026-11-20')
  assert.equal(over.retirement.versions[0].name, 'Retire early')
  assert.equal(over.retirement.versions[0].plan.retAge, 67)
  assert.equal(over.retirement.versions[0].summary.succ, 0.5)
  assert.equal(renameVersion(d, v.id, 'Base').retirement.versions[0].name, 'Base')
  assert.equal(renameVersion(d, v.id, '   ').retirement.versions[0].name, 'Retire early')
})

test('market figures older than a month are detectable', () => {
  assert.equal(marketAgeDays('', new Date()), null)
  assert.equal(marketAgeDays('2026-10-15', new Date('2026-11-15T00:00:00')), 31)
})

test('inheritance is a flat amount added in its year; past years and years after the plan age are ignored', () => {
  const base = pick(withAccounts(), ['a1'], { age: 35, retAge: 65, life: 95, inherit: [
    { id: 'i1', name: 'Parents', amt: 150000, year: 2038 }, { id: 'i2', name: 'Old', amt: 1000, year: 2020 }, { id: 'i3', name: 'Too late', amt: 1000, year: 2200 }, { id: 'i4', name: 'Blank', amt: 5, year: '' },
  ] })
  const p = resolvePlan(base, fx, 2026)
  assert.deepEqual(p.lumps.map((l) => [l.t, l.amt, l.age]), [[12, 150000, 47]]) // 2038 is 12 years away, age 47
  const without = runPlan({ ...p, lumps: [] })
  const o = runPlan(p)
  // flat, as typed: it then grows at the blended return for the remaining years of saving (N = 30)
  const grown = 150000 * Math.pow(1 + o.r, 30 - 12)
  assert.ok(Math.abs(o.balRet - without.balRet - grown) < 1, `${o.balRet - without.balRet} vs ${grown}`)
  assert.ok(o.shortfall < without.shortfall)
})

test('the insurance survivor benefit adds the Finance policies’ death benefits to the nest egg at retirement, only when ticked', () => {
  let d = pick(withAccounts(), ['a1'], { age: 35, retAge: 65, life: 95 })
  d = { ...d, policies: [{ id: 'p1', country: 'us', name: 'Term', deathBenefit: 500000 }, { id: 'p2', country: 'in', name: 'LIC', deathBenefit: 8000000 }] } // $500,000 + 8,000,000 INR = $100,000
  const off = resolvePlan(d, fx, 2026)
  assert.ok(Math.abs(off.insurance - 600000) < 1e-6); assert.deepEqual(off.lumps, [])
  const on = resolvePlan({ ...d, retirement: { ...d.retirement, plan: { ...d.retirement.plan, includeInsurance: true } } }, fx, 2026)
  assert.deepEqual(on.lumps.map((l) => [l.t, Math.round(l.amt), !!l.insurance]), [[30, 600000, true]])
  assert.ok(Math.abs(runPlan(on).balRet - runPlan(off).balRet - 600000) < 1e-3) // flat, in the retirement year, so not grown
})

test('versions: the saved plan you are on is remembered, and old vaults load without it', () => {
  assert.equal(normalizeRetirement({}).activeId, null)
  let d = emptyData()
  d = saveVersion(d, 'Retire at 60', { succ: 0.9 }, '2026-11-22')
  assert.equal(d.retirement.activeId, d.retirement.versions[0].id)
  const id = d.retirement.versions[0].id
  assert.equal(normalizeRetirement(d.retirement).activeId, id)
  assert.equal(normalizeRetirement({ ...d.retirement, activeId: 'nope' }).activeId, null)
  d = deleteVersion(d, id); assert.equal(d.retirement.activeId, null)
  d = saveVersion(d, '', { succ: 0.5 }, '2026-11-22'); assert.equal(d.retirement.versions[0].name, 'Plan 1')
})
