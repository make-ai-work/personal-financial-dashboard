import { COUNTRIES } from '../lib/format.js'

// Dependency-free SVG charts for the Retirement tab. Colours are theme tokens.
const L = 56
const R = 14

export const symbolOf = (currency) => Object.values(COUNTRIES).find((c) => c.currency === currency)?.symbol.trim() || currency
export const compact = (currency, v) => symbolOf(currency) + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

// Even ticks from 0 up to a rounded-up maximum.
function yTicks(max, n = 4) {
  const raw = max / n || 1
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)
  const out = []
  for (let v = 0; v <= max + step * 0.01; v += step) out.push(v)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}
const xTicks = (lo, hi, step) => {
  const out = []
  for (let a = Math.ceil(lo / step) * step; a <= hi; a += step) out.push(a)
  return out
}

function Frame({ W, H, T = 12, B = 26, ticks, y, fmt, xs, x, children, label }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(t)}</text>
        </g>
      ))}
      {xs.map((a) => <text key={a} x={x(a)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{a}</text>)}
      {children}
    </svg>
  )
}

// Range of possible balances by age: median line, middle 50% and 10th-90th percentile bands.
export function FanChart({ bands, retAge, currency, w: W = 640 }) {
  const H = W < 500 ? 220 : 250, T = 12, B = 26
  const ages = bands.map((b) => b.age)
  const lo = ages[0], hi = ages[ages.length - 1]
  const ticks = yTicks(Math.max(...bands.map((b) => b.p90)) * 1.02 || 1)
  const mx = ticks[ticks.length - 1]
  const x = (a) => L + ((a - lo) / (hi - lo || 1)) * (W - L - R)
  const y = (v) => T + (1 - v / mx) * (H - T - B)
  const area = (a, b) => `${bands.map((d) => `${x(d.age)},${y(d[b])}`).join(' ')} ${bands.slice().reverse().map((d) => `${x(d.age)},${y(d[a])}`).join(' ')}`
  return (
    <Frame W={W} H={H} ticks={ticks} y={y} fmt={(v) => compact(currency, v)} xs={xTicks(lo, hi, 10)} x={x} label="Range of possible net worth by age">
      <polygon points={area('p10', 'p90')} fill="var(--accent)" opacity=".14" />
      <polygon points={area('p25', 'p75')} fill="var(--accent)" opacity=".28" />
      {retAge >= lo && retAge <= hi && <line x1={x(retAge)} x2={x(retAge)} y1={T} y2={H - B} stroke="var(--grey)" strokeDasharray="4 4" />}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={bands.map((d) => `${x(d.age)},${y(d.p50)}`).join(' ')} />
    </Frame>
  )
}

// Chance the money is still there at each age, zoomed to where the curve actually moves.
export function survivalWindow(surv, retAge, life) {
  const first = surv.find((d) => d.v < 0.9995)
  const lo = first ? Math.max(retAge, first.age - 2) : retAge
  const from = Math.min(lo, life - 5)
  const pts = surv.filter((d) => d.age >= from)
  const min = Math.min(...pts.map((d) => d.v))
  return { from, pts, floor: Math.max(0, Math.floor((min - 0.05) * 10) / 10), zoomed: !!first && from > retAge }
}
export function SurvivalChart({ surv, retAge, life, target, w: W = 640 }) {
  const H = W < 500 ? 190 : 170, T = 10, B = 26
  const { from, pts, floor } = survivalWindow(surv, retAge, life)
  const x = (a) => L + ((a - from) / (life - from || 1)) * (W - L - R)
  const y = (v) => T + (1 - (v - floor) / (1 - floor || 1)) * (H - T - B)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => floor + f * (1 - floor))
  const tg = target / 100
  return (
    <Frame W={W} H={H} ticks={ticks} y={y} fmt={(v) => `${Math.round(v * 100)}%`} xs={xTicks(from, life, 5)} x={x} label="Chance your savings last, by age">
      {tg >= floor && <line x1={L} x2={W - R} y1={y(tg)} y2={y(tg)} stroke="var(--amber)" strokeDasharray="4 4" />}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={pts.map((d) => `${x(d.age)},${y(d.v)}`).join(' ')} />
    </Frame>
  )
}

export function Histogram({ failed, retAge, life, n }) {
  const bins = {}
  for (const d of failed) bins[d] = (bins[d] || 0) + 1
  const ages = []
  for (let a = retAge; a < life; a++) ages.push(a)
  const mx = Math.max(1, ...ages.map((a) => bins[a] || 0))
  return (
    <div className="hist" role="img" aria-label="Age at which the money runs out">
      {ages.map((a) => <div key={a} title={`Age ${a}: ${(((bins[a] || 0) / n) * 100).toFixed(1)}% of futures`} style={{ height: `${((bins[a] || 0) / mx) * 100}%` }} />)}
    </div>
  )
}

// Plan page: single projected path in nominal money.
export function PathChart({ path, retAge, currency, w: W = 640 }) {
  const H = W < 500 ? 220 : 230, T = 14, B = 28
  const lo = path[0].age, hi = path[path.length - 1].age
  const ticks = yTicks(Math.max(...path.map((d) => d.bal), 1))
  const mx = ticks[ticks.length - 1]
  const x = (a) => L + ((a - lo) / (hi - lo || 1)) * (W - L - R)
  const y = (v) => T + (1 - v / mx) * (H - T - B)
  return (
    <Frame W={W} H={H} T={T} B={B} ticks={ticks} y={y} fmt={(v) => compact(currency, v)} xs={xTicks(lo, hi, 10)} x={x} label="Projected portfolio by age">
      {retAge >= lo && retAge <= hi && <line x1={x(retAge)} x2={x(retAge)} y1={T} y2={H - B} stroke="var(--grey)" strokeDasharray="4 4" />}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={path.map((d) => `${x(d.age)},${y(d.bal)}`).join(' ')} />
    </Frame>
  )
}

// Median path of each saved version plus the current inputs.
export function CompareChart({ rows, currency, w: W = 640 }) {
  const H = 200, T = 10, B = 26
  const all = rows.flatMap((r) => r.med50)
  const lo = Math.min(...all.map((d) => d[0])), hi = Math.max(...all.map((d) => d[0]))
  const ticks = yTicks(Math.max(...all.map((d) => d[1]), 1))
  const mx = ticks[ticks.length - 1]
  const x = (a) => L + ((a - lo) / (hi - lo || 1)) * (W - L - R)
  const y = (v) => T + (1 - v / mx) * (H - T - B)
  return (
    <Frame W={W} H={H} T={T} B={B} ticks={ticks} y={y} fmt={(v) => compact(currency, v)} xs={xTicks(lo, hi, 10)} x={x} label="Median path of each version">
      {rows.map((r) => <polyline key={r.key} fill="none" stroke={r.color} strokeWidth="2.5" strokeDasharray={r.current ? '6 4' : undefined} points={r.med50.map((d) => `${x(d[0])},${y(d[1])}`).join(' ')} />)}
    </Frame>
  )
}
