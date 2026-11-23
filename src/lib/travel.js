// Days in the USA and in India worked out from travel dates, as an alternative to typing the days for each year (used by the Tax Residency guided check).
//   usArrival   the date you arrived in the US (empty = you were in the US from the start of the period)
//   usDeparture the date you left the US for good (empty = still there)
//   trips       [{ id, exit, entry, india }]: each time you left the US and came back; `india` = the trip was to India. An empty `entry` = not back yet.
// Assumptions, stated in the screen: outside the US (before you arrived or after you left for good) you were in India; the day you cross a border counts
// in BOTH countries (the US counts any part of a day; India counts the day of arrival and the day of departure); you flew on the date you give.
import { validISO } from './taxres.js'

const dayNum = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000)
const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10)

export const emptyTravel = () => ({ usArrival: '', usDeparture: '', trips: [] })
export function normalizeTravel(t) {
  const ok = (v) => (validISO(v) ? v : '')
  return {
    usArrival: ok(t?.usArrival), usDeparture: ok(t?.usDeparture),
    // A trip being typed (no dates yet) is kept; it counts for nothing until it has a left-the-US date and a sensible return date.
    trips: (Array.isArray(t?.trips) ? t.trips : []).filter((x) => x && typeof x === 'object')
      .map((x) => ({ id: x.id || Math.random().toString(36).slice(2), exit: ok(x.exit), entry: ok(x.entry), india: !!x.india }))
      .sort((a, b) => (a.exit || '9').localeCompare(b.exit || '9')),
  }
}

// Problems in the dates: [string]. Trips must not overlap; arrival before departure.
export function travelProblems(t) {
  const out = []
  if (t.usArrival && t.usDeparture && t.usDeparture < t.usArrival) out.push('You left the US before you arrived.')
  const trips = t.trips.filter((x) => x.exit).sort((a, b) => a.exit.localeCompare(b.exit))
  trips.forEach((x, i) => {
    if (x.entry && x.entry < x.exit) out.push(`A trip that left on ${x.exit} returns before it left.`)
    const next = trips[i + 1]
    if (next && (x.entry === '' || x.entry > next.exit)) out.push(`The trip leaving ${x.exit} overlaps the trip leaving ${next.exit}.`)
    if (t.usArrival && x.exit < t.usArrival) out.push(`The trip leaving ${x.exit} is before you arrived in the US.`)
    if (t.usDeparture && x.exit > t.usDeparture) out.push(`The trip leaving ${x.exit} is after you left the US for good.`)
  })
  return out
}

// -> { us: { [calendarYear]: days }, in: { [financialYearStart]: days } } from 1 January of `fromYear` to `todayISO`.
export function countDays(t, fromYear, todayISO) {
  const start = dayNum(`${fromYear}-01-01`), end = dayNum(todayISO)
  const arr = t.usArrival ? dayNum(t.usArrival) : null, dep = t.usDeparture ? dayNum(t.usDeparture) : null
  const trips = t.trips.filter((x) => x.exit && (!x.entry || x.entry >= x.exit)).map((x) => ({ a: dayNum(x.exit), b: x.entry ? dayNum(x.entry) : end + 1, india: x.india })) // not back yet: away through today
  const us = {}, inn = {}
  for (let d = start; d <= end; d++) {
    const date = isoOf(d), y = Number(date.slice(0, 4)), fy = Number(date.slice(5, 7)) >= 4 ? y : y - 1
    const inUsSpan = (arr === null || d >= arr) && (dep === null || d <= dep)
    const inside = trips.find((x) => d > x.a && d < x.b) // strictly between leaving and returning: away from the US
    const tripIndia = trips.find((x) => x.india && d >= x.a && d <= x.b)
    const usDay = inUsSpan && !inside
    const inDay = (arr !== null && d <= arr) || (dep !== null && d >= dep) || !!tripIndia
    us[y] = (us[y] || 0) + (usDay ? 1 : 0)
    inn[fy] = (inn[fy] || 0) + (inDay ? 1 : 0)
  }
  return { us, in: inn }
}
