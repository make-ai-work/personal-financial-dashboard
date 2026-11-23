// Tax residency over time, for people with ties to both the USA and India. Each country has a list of DATE RANGES with a status:
//   US:    Resident | Nonresident                         (tax year: 1 January to 31 December)
//   India: NRI | RNOR | ROR                                (tax year, "financial year": 1 April to 31 March)
// A range is { id, status, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' | '' }; an empty `to` means "still current". Pure code: the screen is src/taxres/.
import { uid } from './model.js'
import { emptyTravel, normalizeTravel } from './travel.js'

export const COUNTRY_KEYS = ['us', 'in']
export const STATUSES = {
  us: [{ key: 'resident', label: 'Resident', tone: 'orange' }, { key: 'nonresident', label: 'Nonresident', tone: 'green' }],
  in: [{ key: 'nri', label: 'NRI', tone: 'lgreen', long: 'Non-Resident Indian' }, { key: 'rnor', label: 'RNOR', tone: 'green', long: 'Resident but Not Ordinarily Resident' }, { key: 'ror', label: 'ROR', tone: 'orange', long: 'Resident and Ordinarily Resident' }],
}
export const statusOf = (country, key) => STATUSES[country]?.find((s) => s.key === key) || null
export const TAX_YEAR_NOTE = { us: 'Tax year: 1 January to 31 December', in: 'Tax year (financial year): 1 April to 31 March' }

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const validISO = (s) => ISO.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
const dayNum = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000)
const fromDay = (n) => new Date(n * 86400000).toISOString().slice(0, 10)
const next = (iso) => fromDay(dayNum(iso) + 1)

// The answers given in the guided check (days per year and a few yes/no questions); kept so you can come back and change one.
export const emptyPlan = () => ({ departure: '', usVisitDays: '', indiaVisitDays: '', givesUpGreenCard: true, include: true })
export const emptyInputs = () => ({ startYear: null, citizen: false, us: {}, in: {}, travel: emptyTravel(), plan: emptyPlan() })
export const emptyTaxResidency = () => ({ us: [], in: [], inputs: emptyInputs() })
const cleanRow = (r, keys) => Object.fromEntries(keys.map(([k, kind]) => [k, kind === 'bool' ? !!r?.[k] : r?.[k] === '' || r?.[k] == null || !Number.isFinite(Number(r[k])) ? '' : Math.max(0, Number(r[k]))]))
export function normalizeInputs(i) {
  const out = emptyInputs()
  out.startYear = Number.isInteger(i?.startYear) && i.startYear > 1950 && i.startYear < 2200 ? i.startYear : null
  out.citizen = !!i?.citizen
  out.travel = normalizeTravel(i?.travel)
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? '' : Math.min(365, Math.max(0, Number(v))))
  out.plan = { departure: validISO(i?.plan?.departure) ? i.plan.departure : '', usVisitDays: num(i?.plan?.usVisitDays), indiaVisitDays: num(i?.plan?.indiaVisitDays), givesUpGreenCard: i?.plan?.givesUpGreenCard !== false, include: i?.plan?.include !== false }
  for (const [y, r] of Object.entries(i?.us || {})) if (/^\d{4}$/.test(y)) out.us[y] = cleanRow(r, [['days', 'num'], ['greenCard', 'bool'], ['exempt', 'num'], ['closer', 'bool']])
  for (const [y, r] of Object.entries(i?.in || {})) if (/^\d{4}$/.test(y)) out.in[y] = cleanRow(r, [['days', 'num'], ['left', 'bool'], ['income15', 'bool'], ['liableElsewhere', 'bool']])
  return out
}

// Anything stored or imported -> a clean { us: [...], in: [...] }: unknown statuses and bad dates are dropped, ranges sorted by start date.
export function normalizeTaxResidency(t) {
  const out = emptyTaxResidency()
  out.inputs = normalizeInputs(t?.inputs)
  for (const c of COUNTRY_KEYS) {
    const list = Array.isArray(t?.[c]) ? t[c] : []
    out[c] = list
      .filter((r) => r && statusOf(c, r.status) && validISO(r.from) && (r.to === '' || r.to == null || (validISO(r.to) && r.to >= r.from)))
      .map((r) => ({ id: r.id || uid(), status: r.status, from: r.from, to: r.to || '' }))
      .sort((a, b) => a.from.localeCompare(b.from))
  }
  return out
}

// Problem with one range being added or edited, or '' when it is fine. `others` are the other ranges of the same country.
export function rangeProblem(range, others = []) {
  if (!validISO(range.from)) return 'Enter the start date.'
  if (range.to !== '' && !validISO(range.to)) return 'The end date is not a date.'
  if (range.to !== '' && range.to < range.from) return 'The end date is before the start date.'
  const end = range.to || '9999-12-31'
  const clash = others.find((o) => range.from <= (o.to || '9999-12-31') && end >= o.from)
  return clash ? `This overlaps another period (${clash.from} to ${clash.to || 'now'}).` : ''
}

export function setRanges(d, country, ranges) { return { ...d, taxResidency: { ...d.taxResidency, [country]: normalizeTaxResidency({ [country]: ranges })[country] } } }
export const addRange = (d, country, r) => setRanges(d, country, [...d.taxResidency[country], { id: uid(), ...r }])
export const updateRange = (d, country, id, patch) => setRanges(d, country, d.taxResidency[country].map((r) => (r.id === id ? { ...r, ...patch } : r)))
export const removeRange = (d, country, id) => setRanges(d, country, d.taxResidency[country].filter((r) => r.id !== id))

// Where the status CHANGES: [{ date, from: status|null, to: status }], one per boundary where the next period starts right after the last one ends
// (or after a gap, then `from` is null). The first period's start is the first change.
export function changes(ranges) {
  const out = []
  let prev = null
  for (const r of [...ranges].sort((a, b) => a.from.localeCompare(b.from))) {
    const adjacent = prev && prev.to !== '' && next(prev.to) >= r.from
    if (!prev || !adjacent || prev.status !== r.status) out.push({ date: r.from, from: adjacent ? prev.status : null, to: r.status })
    prev = r
  }
  return out
}

// ---- tax years ----
export const taxYearStart = (country, year) => (country === 'in' ? `${year}-04-01` : `${year}-01-01`)
// The tax year a date falls in: US "2026", India "FY 2025-26" (April 2025 to March 2026).
export function taxYearLabel(country, iso) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7))
  if (country !== 'in') return String(y)
  const s = m >= 4 ? y : y - 1
  return `FY ${s}-${String((s + 1) % 100).padStart(2, '0')}`
}
// The tax-year boundaries between two dates (for the axis ticks): [{ date, label }].
export function taxYearTicks(country, minISO, maxISO) {
  const out = []
  const y0 = Number(minISO.slice(0, 4)) - 1, y1 = Number(maxISO.slice(0, 4)) + 1
  for (let y = y0; y <= y1; y++) {
    const date = taxYearStart(country, y)
    if (date >= minISO && date <= maxISO) out.push({ date, label: taxYearLabel(country, date) })
  }
  return out
}

// A shared time axis for both bars: from the earliest start (rounded back to a Jan 1 for US / Apr 1 for India, whichever is earlier) to the latest end, today, or a year ahead.
export function axis(tr, todayISO) {
  const all = COUNTRY_KEYS.flatMap((c) => tr[c])
  if (!all.length) return null
  const min = all.reduce((m, r) => (r.from < m ? r.from : m), all[0].from)
  const ends = all.map((r) => r.to || todayISO)
  const max = [todayISO, ...ends].reduce((m, x) => (x > m ? x : m))
  const y = Number(min.slice(0, 4))
  const start = min < `${y}-04-01` ? `${y}-01-01` : `${y}-04-01`
  const endY = Number(max.slice(0, 4)) + (max > `${max.slice(0, 4)}-09-30` ? 1 : 0)
  return { start, end: `${endY}-12-31` }
}
// A date as a 0-100 position on the axis.
export const pos = (ax, iso) => Math.min(100, Math.max(0, ((dayNum(iso) - dayNum(ax.start)) / (dayNum(ax.end) - dayNum(ax.start) + 1)) * 100))
// Segments of one country's bar: [{ id, status, left, width, from, to }] in % of the axis (an open end runs to today).
export function segments(ranges, ax, todayISO) {
  return ranges.map((r) => {
    const to = r.to || (todayISO > r.from ? todayISO : r.from)
    const left = pos(ax, r.from)
    return { id: r.id, status: r.status, from: r.from, to: r.to, left, width: Math.max(0.6, pos(ax, next(to)) - left) }
  })
}
// The status in force on a date, or null.
export const statusOn = (ranges, iso) => ranges.find((r) => r.from <= iso && (r.to === '' || r.to >= iso))?.status || null
