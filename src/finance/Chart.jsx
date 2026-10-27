// Dependency-free SVG line chart. Filled dot = a real update (earliest in its month);
// hollow dot = no update that month, previous value carried forward.
const W = 640
const H = 240
const M = { l: 64, r: 16, t: 14, b: 30 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1 }
  const raw = (max - min) / n
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v)
  return ticks
}

const monthLabel = (m, first) => {
  const [y, mo] = m.split('-').map(Number)
  return first || mo === 1 ? `${MONTHS[mo - 1]} '${String(y).slice(2)}` : MONTHS[mo - 1]
}

const DEFAULT_NOTE = 'Filled dot = updated that month (earliest update date) · Hollow dot = carried forward'

export default function Chart({ points, lines, format, compact, label, note = DEFAULT_NOTE }) {
  if (!points.length) {
    return <div className="empty">No history yet. Add accounts, then press “Save update” to record this month.</div>
  }
  const vals = points.flatMap((p) => lines.map((l) => p[l.key]))
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals))
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const timed = points.length > 1 && points[0].t != null && points[points.length - 1].t > points[0].t // position by real date
  const t0 = points[0].t
  const span = points[points.length - 1].t - t0
  const x = (i) =>
    points.length === 1 ? (M.l + W - M.r) / 2
      : timed ? M.l + ((points[i].t - t0) / span) * (W - M.l - M.r)
        : M.l + (i * (W - M.l - M.r)) / (points.length - 1)
  const y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b)
  const every = Math.ceil(points.length / 8)
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={M.l - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{compact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => i % every === 0 && (
          <text key={p.key ?? p.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{monthLabel(p.month, i === 0 || points.length > 12)}</text>
        ))}
        {lines.map((l) => (
          <g key={l.key}>
            <polyline fill="none" stroke={l.color} strokeWidth="2.5" points={points.map((p, i) => `${x(i)},${y(p[l.key])}`).join(' ')} />
            {points.map((p, i) => (points.length <= 24 || !p.carried) && (
              <circle key={p.key ?? p.month} cx={x(i)} cy={y(p[l.key])} r="3.5" stroke={l.color} strokeWidth="1.5" fill={p.carried ? 'var(--surface)' : l.color}>
                <title>{`${l.label} · ${p.carried ? p.month + ' (carried forward)' : p.date}: ${format(p[l.key])}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="legend">
        {lines.map((l) => <span key={l.key}><i style={{ background: l.color }} />{l.label}</span>)}
        <span>{note}</span>
      </div>
    </div>
  )
}
