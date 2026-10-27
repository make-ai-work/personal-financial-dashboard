// Date helpers shared by Pets and Property. Dates are 'YYYY-MM-DD' strings; `today` is always passed in.
import { fmtDate } from './format.js'

// UTC based, so daylight saving never shifts a day
const pad = (n) => String(n).padStart(2, '0')
const parts = (iso) => iso.split('-').map(Number)
const make = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

export function addDays(date, n) {
  const [y, m, d] = parts(date)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return make(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}
export function addMonths(date, n) {
  const [y, m, d] = parts(date)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate() // clamp 31 Jan + 1 month -> 28/29 Feb
  return make(ny, nm, Math.min(d, dim))
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = parts(a)
  const [y2, m2, d2] = parts(b)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5)
}

// status of a due date relative to today
export function dueStatus(date, today, soonDays = 30) {
  if (!date) return null
  const days = daysBetween(today, date)
  if (days < 0) return { status: 'overdue', days, text: `overdue ${-days} day${days === -1 ? '' : 's'}` }
  if (days === 0) return { status: 'soon', days, text: 'due today' }
  if (days <= soonDays) return { status: 'soon', days, text: `due in ${days} day${days === 1 ? '' : 's'}` }
  return { status: 'ok', days, text: `due ${fmtDate(date)}` }
}
