// Pure helpers for the Retirement tab: stored inputs, turning them into numbers using Finance balances,
// the deterministic projection (the Plan page) and the saved Monte Carlo versions.
//
// d.retirement = { plan, mc, versions }
//   plan:     what you typed on the Plan page (percent values are stored as percent, e.g. 4.7 = 4.7%)
//   mc:       Monte Carlo assumptions; `null` for w / ret.equities / ret.bonds means "follow the Plan + Portfolio"
//   versions: up to MAX_VERSIONS saved copies of { plan, mc } plus the summary of the results when saved (the plan cards on the page)
//   activeId: which saved plan the working copy came from (highlighted on the page), or null when it has not been saved
import { convert, uid } from './model.js'
import { COUNTRIES } from './format.js'
import { KEYS } from './montecarlo.js'

export const MAX_VERSIONS = 3

export const defaultPlan = () => ({
  age: 35, retAge: 65, life: 95, currency: '', ac: 20000, g: 3, spend: 80000, tax: 12,
  selected: [], adjustment: 0, eqOverride: null,
  income: [], // [{ id, name, amt, cur, from, to }]
  inherit: [], // [{ id, name, amt, year }]: a flat amount (in the plan currency, as typed, not inflation-adjusted) added to your savings in that calendar year
  includeInsurance: false, // add the value at maturity of the Assets insurance policies to the nest egg (at retirement)
  y: 4.7, inf: 3.7, prem: 4.5, asOf: '', // placeholders until you enter your own, see the stale-data warning
})
export const defaultMc = () => ({
  w: null,
  ret: { equities: null, bonds: null, cash: 0.5, metals: 1 },
  vol: { equities: 17, bonds: 7, cash: 1.5, metals: 15 },
  cor: { eqbd: 0.1, eqcash: 0, eqmt: 0.05, bdcash: 0.2, bdmt: 0.1, cashmt: 0 },
  rule: 'fixed', cut: 25, target: 85, n: 5000, seed: 12345,
})
export const defaultRetirement = () => ({ plan: defaultPlan(), mc: defaultMc(), versions: [], activeId: null })

const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback)

// Fill any gaps so older vaults, and hand-edited ones, still load.
export function normalizeRetirement(r) {
  const dp = defaultPlan()
  const dm = defaultMc()
  const p = { ...dp, ...(r?.plan || {}) }
  p.income = (p.income || []).map((s) => ({ id: s.id || uid(), name: s.name || '', amt: num(s.amt, 0), cur: s.cur || '', from: num(s.from, 67), to: s.to === '' || s.to == null ? '' : num(s.to, '') }))
  p.selected = Array.isArray(p.selected) ? p.selected : []
  p.inherit = (Array.isArray(p.inherit) ? p.inherit : []).map((x) => ({ id: x.id || uid(), name: x.name || '', amt: num(x.amt, 0), year: x.year === '' || x.year == null ? '' : num(x.year, '') }))
  p.includeInsurance = !!p.includeInsurance
  const m = { ...dm, ...(r?.mc || {}) }
  m.ret = { ...dm.ret, ...(r?.mc?.ret || {}) }
  m.vol = { ...dm.vol, ...(r?.mc?.vol || {}) }
  m.cor = { ...dm.cor, ...(r?.mc?.cor || {}) }
  m.w = r?.mc?.w ? { ...r.mc.w } : null
  const versions = (Array.isArray(r?.versions) ? r.versions : [])
    .filter((v) => v && v.plan && v.mc)
    .slice(0, MAX_VERSIONS)
    .map((v) => ({ ...v, id: v.id || uid(), plan: normalizeRetirement({ plan: v.plan }).plan, mc: normalizeRetirement({ mc: v.mc }).mc }))
  const activeId = versions.some((v) => v.id === r?.activeId) ? r.activeId : null
  return { plan: p, mc: m, versions, activeId }
}

// ---- reading the stored inputs ----
export const assetAccounts = (d) => d.accounts.filter((a) => a.type === 'asset')
export const planCurrencies = (d) => [...new Set(d.settings.countries.map((c) => COUNTRIES[c].currency))]
export const planCurrency = (d) => {
  const list = planCurrencies(d)
  return list.includes(d.retirement.plan.currency) ? d.retirement.plan.currency : list[0]
}
export const accountCurrency = (a) => COUNTRIES[a.country]?.currency || 'USD'

// Account mix order is [equities, cash, metals, bonds] (percent). Accounts no longer have a typed mix: only an account linked to a Portfolio has one, calculated
// from its holdings. Ticked accounts with no linked portfolio add to the savings but not to the mix; with none linked the plan starts from a neutral 60/30/10 mix.
const linkedMix = (d, a) => (d.portfolios.some((p) => p.accountId === a.id) && a.mix && a.mix.some((x) => x > 0) ? a.mix : null)
const round1 = (x) => Math.round(x * 10) / 10

// Resolve everything the screens need as plain numbers in the plan currency.
// fx = { base, rates } as from useFx; a rate that is missing makes that amount 0 and sets `missingRates`.
export function resolvePlan(d, fx, nowYear = new Date().getFullYear()) {
  const r = d.retirement.plan
  const currency = planCurrency(d)
  let missingRates = false
  const conv = (amt, from) => {
    const v = convert(amt || 0, from, currency, fx)
    if (Number.isFinite(v)) return v
    missingRates = true
    return 0
  }
  const picked = assetAccounts(d).filter((a) => r.selected.includes(a.id)).map((a) => {
    const balance = conv(a.balance, accountCurrency(a))
    return { id: a.id, name: a.name, owner: a.owner, balance, mix: linkedMix(d, a) }
  })
  const held = picked.reduce((s, a) => s + a.balance, 0)
  const savings = held + (Number(r.adjustment) || 0)
  const mixed = picked.filter((a) => a.mix)
  const mixHeld = mixed.reduce((s, a) => s + a.balance, 0)
  const mixFrom = mixHeld > 0 ? 'portfolios' : 'default'
  const mixSum = (i) => (mixHeld > 0 ? mixed.reduce((s, a) => s + (a.balance * a.mix[i]) / 100, 0) / mixHeld : 0)
  const eqAuto = mixHeld > 0 ? mixSum(0) * 100 : 60
  const auto = { equities: mixSum(0) * 100, cash: mixSum(1) * 100, metals: mixSum(2) * 100, bonds: mixSum(3) * 100 }
  const autoWeights = mixHeld > 0
    ? Object.fromEntries(KEYS.map((k) => [k, round1(auto[k])]))
    : { equities: 60, bonds: 30, cash: 10, metals: 0 } // no linked portfolio among the ticked accounts: a neutral starting mix
  // rounding to one decimal can leave the total 0.1 away from 100; give the difference to the largest class
  const drift = round1(100 - KEYS.reduce((s, k) => s + autoWeights[k], 0))
  if (drift) { const big = KEYS.reduce((b, k) => (autoWeights[k] > autoWeights[b] ? k : b), 'equities'); autoWeights[big] = round1(autoWeights[big] + drift) }
  const we = r.eqOverride === null || r.eqOverride === '' || r.eqOverride === undefined ? eqAuto / 100 : Number(r.eqOverride) / 100
  const income = r.income.map((s) => ({ id: s.id, name: s.name, amt: conv(s.amt, s.cur || currency), from: s.from, to: s.to }))
  const age = Number(r.age), retAge = Number(r.retAge), life = Number(r.life)
  // Policies' VALUE AT MATURITY (the survivor benefit paid out; not the death benefit), in the plan currency. Counted in the nest egg (at retirement) only when the box is ticked.
  const insurance = (d.policies || []).reduce((sum, p) => sum + conv(Number(p.maturityValue) > 0 ? p.maturityValue : 0, COUNTRIES[p.country]?.currency || currency), 0)
  // Lump sums, each as { t: years from now, amt }: flat amounts as typed. Past years and years after the plan age are ignored.
  const lumps = []
  const T = Math.max(0, life - age)
  for (const x of r.inherit || []) {
    const t = Number(x.year) - nowYear
    if (x.year !== '' && Number.isFinite(t) && t >= 0 && t < T && Number(x.amt) > 0) lumps.push({ t, amt: Number(x.amt), name: x.name, age: age + t })
  }
  if (r.includeInsurance && insurance > 0 && retAge - age < T) lumps.push({ t: Math.max(0, retAge - age), amt: insurance, name: 'Insurance survivor benefit', age: Math.max(age, retAge), insurance: true })
  return {
    currency, age, retAge, life, lumps, insurance, includeInsurance: !!r.includeInsurance, nowYear,
    ac: Number(r.ac) || 0, g: (Number(r.g) || 0) / 100, spend: Number(r.spend) || 0, tax: (Number(r.tax) || 0) / 100,
    inf: (Number(r.inf) || 0) / 100, y: (Number(r.y) || 0) / 100, prem: (Number(r.prem) || 0) / 100,
    savings, held, picked, we, eqAuto, autoWeights, mixFrom, income, asOf: r.asOf, missingRates,
  }
}

// Things that make a run meaningless. An empty list means it can run.
export function planProblems(p) {
  const out = []
  if (!(p.age >= 0 && p.age < 120)) out.push('Current age must be between 0 and 120.')
  if (!(p.retAge >= p.age)) out.push('Retirement age cannot be before your current age.')
  if (!(p.life > p.retAge)) out.push('Plan-to age must be after your retirement age.')
  if (p.life > 120) out.push('Plan-to age cannot be more than 120.')
  if (!(p.tax >= 0 && p.tax < 0.9)) out.push('Tax on withdrawals must be between 0% and 90%.')
  return out
}

// Resolved MC assumptions: values you have not overridden follow the Plan (market conditions) and your holdings.
export function resolveMc(mc, plan) {
  return {
    ...mc,
    w: mc.w || plan.autoWeights,
    ret: { ...mc.ret, equities: mc.ret.equities ?? round1(plan.prem * 100), bonds: mc.ret.bonds ?? round2(((1 + plan.y) / (1 + plan.inf) - 1) * 100) },
  }
}
const round2 = (x) => Math.round(x * 100) / 100

// ---- the Plan page's deterministic projection (nominal money) ----
export function runPlan(p, over = {}) {
  const q = { ...p, ...over }
  const r = q.we * (q.inf + q.prem) + (1 - q.we) * q.y // blended nominal return
  const N = Math.max(0, q.retAge - q.age)
  const R = Math.max(0, q.life - q.retAge)
  const lumpAt = (t) => (q.lumps || []).reduce((s, l) => s + (l.t === t ? l.amt : 0), 0) // flat amounts, as typed
  let bal = q.savings
  let c = q.ac
  const path = [{ age: q.age, bal }]
  for (let t = 0; t < N; t++) { bal = (bal + lumpAt(t)) * (1 + r) + c; c *= 1 + q.g; path.push({ age: q.age + t + 1, bal }) }
  const balRet = bal + lumpAt(N) // a lump arriving in the retirement year itself (such as the insurance benefit) is in the pot before the first withdrawal
  const gross = []
  for (let k = 0; k < R; k++) {
    const age = q.retAge + k
    const f = Math.pow(1 + q.inf, N + k)
    const inc = q.income.reduce((s, x) => s + (age >= x.from && (x.to === '' || x.to == null || age <= x.to) ? x.amt * f : 0), 0)
    gross.push(Math.max(0, q.spend * f - inc) / (1 - q.tax))
  }
  let needed = 0
  for (let k = R - 1; k >= 0; k--) needed = needed / (1 + r) + gross[k] - (k > 0 ? lumpAt(N + k) : 0) // later lumps cover part of the need
  needed = Math.max(0, needed)
  let b = balRet
  let dep = null
  for (let k = 0; k < R; k++) {
    if (k > 0) b += lumpAt(N + k)
    b -= gross[k]
    if (b < 0 && dep === null) dep = q.retAge + k
    b = Math.max(0, b) * (1 + r)
    path.push({ age: q.retAge + k + 1, bal: b })
  }
  let F = 0
  for (let t = 0; t < N; t++) F += Math.pow(1 + q.g, t) * Math.pow(1 + r, N - 1 - t)
  const shortfall = needed - balRet
  const extra = shortfall > 0 && F > 0 ? shortfall / F : 0
  return { r, N, R, balRet, balRetReal: balRet / Math.pow(1 + q.inf, N), needed, shortfall, extra, dep, path }
}

// ---- saved versions (at most MAX_VERSIONS) ----
export const canSaveVersion = (d) => d.retirement.versions.length < MAX_VERSIONS

const stamp = (d, name, summary, today) => ({
  name: (name || '').trim().slice(0, 40), savedAt: today,
  plan: JSON.parse(JSON.stringify(d.retirement.plan)), mc: JSON.parse(JSON.stringify(d.retirement.mc)), summary,
})

export function saveVersion(d, name, summary, today) {
  if (!canSaveVersion(d)) return d // the limit is enforced here, not only in the UI
  const v = { id: uid(), ...stamp(d, name || `Plan ${d.retirement.versions.length + 1}`, summary, today) }
  return { ...d, retirement: { ...d.retirement, versions: [...d.retirement.versions, v], activeId: v.id } } // the new plan is the one you are on
}
export function overwriteVersion(d, id, summary, today) {
  const old = d.retirement.versions.find((v) => v.id === id)
  if (!old) return d
  const v = { id, ...stamp(d, old.name, summary, today) }
  return { ...d, retirement: { ...d.retirement, versions: d.retirement.versions.map((x) => (x.id === id ? v : x)) } }
}
export const deleteVersion = (d, id) => ({ ...d, retirement: { ...d.retirement, versions: d.retirement.versions.filter((v) => v.id !== id), activeId: d.retirement.activeId === id ? null : d.retirement.activeId } })
export function loadVersion(d, id) {
  const v = d.retirement.versions.find((x) => x.id === id)
  if (!v) return d
  return { ...d, retirement: { ...d.retirement, plan: JSON.parse(JSON.stringify(v.plan)), mc: JSON.parse(JSON.stringify(v.mc)), activeId: v.id } }
}
export const renameVersion = (d, id, name) => ({
  ...d, retirement: { ...d.retirement, versions: d.retirement.versions.map((v) => (v.id === id ? { ...v, name: name.trim().slice(0, 40) || v.name } : v)) },
})

// Market figures older than this many days get a warning on the Plan page.
export function marketAgeDays(asOf, today = new Date()) {
  if (!asOf) return null
  return Math.floor((today - new Date(asOf + "T00:00:00")) / 864e5)
}

// ---- small setters used by the screens ----
export const setPlan = (d, patch) => ({ ...d, retirement: { ...d.retirement, plan: { ...d.retirement.plan, ...patch } } })
export const setMc = (d, patch) => ({ ...d, retirement: { ...d.retirement, mc: { ...d.retirement.mc, ...patch } } })
export const addIncome = (d, cur) => setPlan(d, { income: [...d.retirement.plan.income, { id: uid(), name: 'New source', amt: 0, cur, from: 67, to: '' }] })
export const updateIncome = (d, id, patch) => setPlan(d, { income: d.retirement.plan.income.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
export const removeIncome = (d, id) => setPlan(d, { income: d.retirement.plan.income.filter((s) => s.id !== id) })
export const addInheritance = (d) => setPlan(d, { inherit: [...d.retirement.plan.inherit, { id: uid(), name: 'Inheritance', amt: 0, year: new Date().getFullYear() + 10 }] })
export const updateInheritance = (d, id, patch) => setPlan(d, { inherit: d.retirement.plan.inherit.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
export const removeInheritance = (d, id) => setPlan(d, { inherit: d.retirement.plan.inherit.filter((x) => x.id !== id) })
export const toggleAccount = (d, id) => {
  const sel = d.retirement.plan.selected
  return setPlan(d, { selected: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] })
}
