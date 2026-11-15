// Performance of net worth over fixed periods, read from the month-by-month series (see monthSeries in model.js).
// Each period compares the latest month with the month that many months earlier. A period longer than the history is
// reported as not available instead of guessing.
export const PERIODS = [
  { key: '1m', label: '1 M', months: 1 }, { key: '3m', label: '3 M', months: 3 }, { key: '6m', label: '6 M', months: 6 },
  { key: '1y', label: '1 Y', months: 12 }, { key: '5y', label: '5 Y', months: 60 }, { key: '10y', label: '10 Y', months: 120 },
]

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const n = y * 12 + (m - 1) + delta
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`
}

// series: [{ month: 'YYYY-MM', net, ... }] in order, one point per month up to now.
// -> [{ key, label, months, available, from, change, pct }]  (pct is null when the starting net worth is 0)
export function performance(series) {
  const last = series[series.length - 1]
  return PERIODS.map((p) => {
    const base = { ...p, available: false, from: null, change: null, pct: null }
    if (!last) return base
    const start = series.find((s) => s.month === shiftMonth(last.month, -p.months))
    if (!start) return base
    const change = last.net - start.net
    return { ...base, available: true, from: start, change, pct: start.net === 0 ? null : (change / Math.abs(start.net)) * 100 }
  })
}

// The part of the series a selected period covers.
export const sinceMonth = (series, months) => {
  const last = series[series.length - 1]
  return last ? series.filter((s) => s.month >= shiftMonth(last.month, -months)) : series
}
