// Monte Carlo retirement engine. Pure functions only, so it can be unit tested.
//
// Everything runs in REAL terms (today's money): inflation is already stripped out, so spending, income and
// contributions are inflation-adjusted and only the real return of each asset class is random.
//   - annual real returns are lognormal, per asset class: gross = exp(mu + sigma * z), mu = ln(1 + compound real return)
//   - z is correlated across classes through a Cholesky factor of the correlation matrix
//   - the mix is rebalanced to the target weights every year (constant mix)
//   - a seeded PRNG gives repeatable runs; the same draws are reused when searching for "safe spending"

export const KEYS = ['equities', 'bonds', 'cash', 'metals']
export const KEY_LABEL = { equities: 'Equities', bonds: 'Bonds', cash: 'Cash equivalents', metals: 'Precious metals' }
// pair key -> [row, column] in the 4x4 correlation matrix
export const COR_PAIRS = { eqbd: [0, 1], eqcash: [0, 2], eqmt: [0, 3], bdcash: [1, 2], bdmt: [1, 3], cashmt: [2, 3] }

// mulberry32: small, fast, good enough for simulation, and identical in every browser.
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Cholesky factor L (C = L L^T), or null when C is not positive definite (an impossible set of correlations).
export function cholesky(C) {
  const n = C.length
  const L = C.map(() => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = C[i][j]
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]
      if (i === j) {
        if (s <= 1e-10) return null
        L[i][i] = Math.sqrt(s)
      } else L[i][j] = s / L[j][j]
    }
  }
  return L
}

export function corrMatrix(cor) {
  const M = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)))
  for (const [k, [i, j]] of Object.entries(COR_PAIRS)) M[i][j] = M[j][i] = Number(cor[k]) || 0
  return M
}
export const correlationsValid = (cor) => cholesky(corrMatrix(cor)) !== null

// "Make valid": shrink every correlation toward 0 by the smallest step that makes the set possible.
export function makeValid(cor) {
  const clamp = (x) => Math.max(-1, Math.min(1, Number(x) || 0))
  const base = Object.fromEntries(Object.keys(COR_PAIRS).map((k) => [k, clamp(cor[k])]))
  for (let f = 1; f >= 0; f = Math.round((f - 0.02) * 100) / 100) {
    const t = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * f * 100) / 100]))
    if (correlationsValid(t)) return t
  }
  return Object.fromEntries(Object.keys(COR_PAIRS).map((k) => [k, 0]))
}

// Weights as fractions summing to 1 (typed weights may sum to 99.9 or 101 and are scaled).
export function normWeights(w) {
  const t = KEYS.reduce((a, k) => a + (Number(w[k]) || 0), 0)
  return KEYS.map((k) => (t > 0 ? (Number(w[k]) || 0) / t : k === 'cash' ? 1 : 0))
}

// Mean and standard deviation of the portfolio's one-year real growth factor, exact for the lognormal model.
export function portfolioStats(a) {
  const w = normWeights(a.w)
  const mu = KEYS.map((k) => Math.log(1 + a.ret[k] / 100))
  const sg = KEYS.map((k) => a.vol[k] / 100)
  const C = corrMatrix(a.cor)
  let mean = 0
  for (let i = 0; i < 4; i++) mean += w[i] * Math.exp(mu[i] + (sg[i] * sg[i]) / 2)
  let v = 0
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const cov = Math.exp(mu[i] + mu[j] + (sg[i] * sg[i] + sg[j] * sg[j]) / 2) * (Math.exp(C[i][j] * sg[i] * sg[j]) - 1)
      v += w[i] * w[j] * cov
    }
  }
  return { avgReturn: mean - 1, swing: Math.sqrt(Math.max(0, v)) }
}

const years = (plan) => Math.max(0, plan.life - plan.age)
export const incomeAt = (plan, age) =>
  (plan.income || []).reduce((s, x) => s + (age >= (x.from ?? 0) && (x.to === '' || x.to == null || age <= x.to) ? x.amt || 0 : 0), 0)

// One-year portfolio growth factors for every simulated future: G[p * T + t].
export function generate(a, plan) {
  const L = cholesky(corrMatrix(a.cor))
  if (!L) return null
  const T = years(plan)
  const n = a.n
  const G = new Float32Array(n * T)
  const w = normWeights(a.w)
  const mu = KEYS.map((k) => Math.log(1 + a.ret[k] / 100))
  const sg = KEYS.map((k) => a.vol[k] / 100)
  const rand = rng(a.seed)
  let spare = null
  const normal = () => {
    if (spare !== null) { const v = spare; spare = null; return v }
    let u = 0
    while (u === 0) u = rand()
    const v = rand()
    const r = Math.sqrt(-2 * Math.log(u))
    spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }
  const z = [0, 0, 0, 0]
  for (let p = 0; p < n; p++) {
    for (let t = 0; t < T; t++) {
      for (let i = 0; i < 4; i++) z[i] = normal()
      let g = 0
      for (let i = 0; i < 4; i++) {
        let c = 0
        for (let j = 0; j <= i; j++) c += L[i][j] * z[j]
        g += w[i] * Math.exp(mu[i] + sg[i] * c)
      }
      G[p * T + t] = g
    }
  }
  return { G, T }
}

// Run every future with a given yearly spending (today's money). With `keep`, also returns balances by year.
export function simulate(a, plan, G, T, spend, keep) {
  const n = a.n
  const N = Math.max(0, plan.retAge - plan.age)
  const R = Math.max(0, plan.life - plan.retAge)
  const dep = new Int16Array(n).fill(-1) // age the money ran out, or -1
  const B = keep ? new Float32Array((T + 1) * n) : null
  const realGrowth = (1 + plan.g) / (1 + plan.inf)
  const tax = plan.tax
  // Lump sums (inheritance, insurance benefit) are flat amounts in the year they arrive; in today's money that is amt / (1 + inflation)^years.
  const lump = new Float64Array(T + 1)
  for (const l of plan.lumps || []) if (l.t >= 0 && l.t < T) lump[l.t] += l.amt / Math.pow(1 + plan.inf, l.t)
  let ok = 0
  for (let p = 0; p < n; p++) {
    let bal = plan.savings
    let c = plan.ac
    let iwr = 0
    if (keep) B[p] = bal
    for (let t = 0; t < N; t++) {
      bal = (bal + lump[t]) * G[p * T + t] + c
      c *= realGrowth
      if (keep) B[(t + 1) * n + p] = bal
    }
    for (let k = 0; k < R; k++) {
      const age = plan.retAge + k
      const inc = incomeAt(plan, age)
      let gross = Math.max(0, spend - inc) / (1 - tax)
      if (a.rule === 'flex') {
        // guardrail: after the first year, cut spending when the withdrawal rate drifts 20% above where it started
        if (k === 0) iwr = bal > 0 ? gross / bal : 0
        else if (bal > 0 && gross / bal > iwr * 1.2) gross = Math.max(0, spend * (1 - a.cut / 100) - inc) / (1 - tax)
      }
      bal += lump[N + k]
      bal -= gross
      if (bal < 0 && dep[p] < 0) dep[p] = age
      bal = Math.max(0, bal) * G[p * T + N + k]
      if (keep) B[(N + k + 1) * n + p] = bal
    }
    if (dep[p] < 0) ok++
  }
  return { ok: ok / n, dep, B, N, R }
}

// The whole analysis. Returns null when the correlations are impossible.
export function analyse(a, plan) {
  const g = generate(a, plan)
  if (!g) return null
  const { G, T } = g
  const n = a.n
  const r = simulate(a, plan, G, T, plan.spend, true)
  const bands = []
  for (let t = 0; t <= T; t++) {
    const col = new Float32Array(n)
    for (let p = 0; p < n; p++) col[p] = r.B[t * n + p]
    col.sort()
    const q = (f) => col[Math.min(n - 1, Math.floor(f * n))]
    bands.push({ age: plan.age + t, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) })
  }
  const failed = [...r.dep].filter((d) => d >= 0).sort((x, y) => x - y)
  const surv = []
  for (let k = 0; k <= r.R; k++) {
    const age = plan.retAge + k - 1
    surv.push({ age: plan.retAge + k, v: 1 - failed.filter((d) => d <= age).length / n })
  }
  // Spending that still meets the target chance: bisection, reusing the same random draws.
  let lo = 0
  let hi = Math.max(plan.spend, 1) * 4
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    if (simulate(a, plan, G, T, mid, false).ok >= a.target / 100) lo = mid
    else hi = mid
  }
  return {
    succ: r.ok, bands, atRetirement: bands[r.N], atEnd: bands[T], failed, surv, safe: lo, N: r.N, R: r.R,
    medianDepletion: failed.length ? failed[Math.floor(failed.length / 2)] : null,
  }
}

// The small summary that a saved version keeps for the comparison table and chart.
export const summarise = (A, plan) => ({
  succ: A.succ, medRet: A.atRetirement.p50, safe: A.safe, medEnd: A.atEnd.p50, savings: plan.savings,
  med50: A.bands.map((d) => [d.age, Math.round(d.p50)]),
})
