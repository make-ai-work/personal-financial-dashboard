// Pure helpers for the Pets tab. Dates are 'YYYY-MM-DD' strings throughout; `today` is always passed in
// so every function is deterministic and unit-testable.
//
// pet:    { id, name, species, breed, sex, neutered, birthDate, icon, microchip, vet, vetPhone,
//           insurance, insuranceRenews, food, allergies, notes }
// record: { id, petId, type: 'vaccine'|'medication'|'visit'|'weight', date, name, dose, repeat,
//           nextDue, endDate, lastGiven, vet, cost, notes, weightKg }
import { uid } from './model.js'
import { fmtDate } from './format.js'

export const SPECIES = [
  { key: 'dog', label: 'Dog', icon: '🐕' },
  { key: 'cat', label: 'Cat', icon: '🐈' },
  { key: 'bird', label: 'Bird', icon: '🐦' },
  { key: 'rabbit', label: 'Rabbit', icon: '🐇' },
  { key: 'fish', label: 'Fish', icon: '🐠' },
  { key: 'reptile', label: 'Reptile', icon: '🦎' },
  { key: 'other', label: 'Other', icon: '🐾' },
]
export const ICONS = ['🐕', '🐈', '🐇', '🐦', '🐠', '🦎', '🐹', '🐢', '🐴', '🐾']
export const speciesIcon = (key) => SPECIES.find((s) => s.key === key)?.icon || '🐾'
export const speciesLabel = (key) => SPECIES.find((s) => s.key === key)?.label || 'Other'

export const VACCINE_REPEATS = [
  { key: '6m', label: '6 months' }, { key: '1y', label: '1 year' }, { key: '3y', label: '3 years' }, { key: 'none', label: 'Not repeating' },
]
export const MED_REPEATS = [
  { key: 'daily', label: 'Daily' }, { key: 'weekly', label: 'Weekly' }, { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Every 3 months' }, { key: 'yearly', label: 'Yearly' }, { key: 'none', label: 'One-off' },
]
export const repeatLabel = (type, key) =>
  (type === 'vaccine' ? VACCINE_REPEATS : MED_REPEATS).find((r) => r.key === key)?.label || ''

// ---- dates (UTC based, so daylight saving never shifts a day) ----
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

// Next due date after `date` for a repeat interval ('' when it does not repeat).
export function nextFrom(date, repeat) {
  if (!date) return ''
  switch (repeat) {
    case '6m': return addMonths(date, 6)
    case '1y': case 'yearly': return addMonths(date, 12)
    case '3y': return addMonths(date, 36)
    case 'daily': return addDays(date, 1)
    case 'weekly': return addDays(date, 7)
    case 'monthly': return addMonths(date, 1)
    case 'quarterly': return addMonths(date, 3)
    default: return ''
  }
}

export function ageText(birth, today) {
  if (!birth) return ''
  const [y1, m1, d1] = parts(birth)
  const [y2, m2, d2] = parts(today)
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (months < 0) return ''
  if (months < 1) {
    const days = daysBetween(birth, today)
    return `${days} day${days === 1 ? '' : 's'}`
  }
  if (months < 12) return `${months} mo`
  const yrs = Math.floor(months / 12)
  const mo = months % 12
  return `${yrs} yr${yrs === 1 ? '' : 's'}${mo ? ` ${mo} mo` : ''}`
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

// ---- mutations (pure) ----
export const addPet = (d, p) => ({ ...d, pets: [...d.pets, { id: uid(), ...p }] })
export const updatePet = (d, id, patch) => ({ ...d, pets: d.pets.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
export const removePet = (d, id) => ({ ...d, pets: d.pets.filter((p) => p.id !== id), petRecords: d.petRecords.filter((r) => r.petId !== id) })
export const addRecord = (d, r) => ({ ...d, petRecords: [...d.petRecords, { id: uid(), ...r }] })
export const updateRecord = (d, id, patch) => ({ ...d, petRecords: d.petRecords.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
export const removeRecord = (d, id) => ({ ...d, petRecords: d.petRecords.filter((r) => r.id !== id) })

// "Done" on a repeating medication: stamp today and roll the next due date forward (or finish it).
export function markMedicationDone(d, id, today) {
  const r = d.petRecords.find((x) => x.id === id)
  if (!r) return d
  let next = nextFrom(today, r.repeat)
  if (r.endDate && next && next > r.endDate) next = ''
  return updateRecord(d, id, { lastGiven: today, nextDue: next })
}

// ---- queries ----
export const recordsOf = (d, petId, type) =>
  d.petRecords.filter((r) => r.petId === petId && r.type === type).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

// One row per vaccine name: its most recent dose, and how many doses are on file.
export function latestVaccines(d, petId) {
  const m = new Map()
  for (const r of d.petRecords) {
    if (r.petId !== petId || r.type !== 'vaccine') continue
    const k = r.name.trim().toLowerCase()
    const cur = m.get(k)
    const doses = (cur?.doses || 0) + 1
    if (!cur || r.date > cur.record.date) m.set(k, { record: r, doses })
    else cur.doses = doses
  }
  return [...m.values()].sort((a, b) => a.record.name.localeCompare(b.record.name))
}

// Everything with a due date, soonest first: vaccines, repeating medications, daily-course ends,
// the next check-up from the latest vet visit, and pet insurance renewals.
export function dueItems(d, today, soonDays = 30, petId = null) {
  const items = []
  const push = (pet, kind, label, sub, date, textOverride, recordId) => {
    const st = dueStatus(date, today, soonDays)
    if (st) items.push({ id: `${kind}-${recordId || pet.id}`, petId: pet.id, kind, label, sub, date, recordId, status: st.status, days: st.days, text: textOverride ? textOverride(st) : st.text })
  }
  for (const pet of d.pets) {
    if (petId && pet.id !== petId) continue
    for (const { record: r } of latestVaccines(d, pet.id)) {
      if (r.nextDue) push(pet, 'vaccine', r.name, `Vaccination · given ${fmtDate(r.date)}`, r.nextDue, null, r.id)
    }
    for (const r of d.petRecords.filter((x) => x.petId === pet.id && x.type === 'medication')) {
      if (r.repeat === 'daily') {
        if (r.endDate && r.endDate >= today) push(pet, 'medication', r.name, 'Medication · course ends', r.endDate, (st) => (st.status === 'overdue' ? st.text : `ends ${fmtDate(r.endDate)}`), r.id)
      } else if (r.nextDue) {
        const last = r.lastGiven ? ` · last given ${fmtDate(r.lastGiven)}` : ''
        push(pet, 'medication', r.name, `Medication · ${repeatLabel('medication', r.repeat) || 'one-off'}${last}`, r.nextDue, null, r.id)
      }
    }
    const visits = recordsOf(d, pet.id, 'visit')
    if (visits[0]?.nextDue) push(pet, 'visit', visits[0].name || 'Vet visit', `Vet visit · last ${fmtDate(visits[0].date)}`, visits[0].nextDue, null, visits[0].id)
    if (pet.insuranceRenews) push(pet, 'insurance', 'Pet insurance renewal', pet.insurance || 'Insurance', pet.insuranceRenews, null, null)
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export const nextItemForPet = (items, petId) => items.find((i) => i.petId === petId) || null

// Costed records (vaccines, visits, medication) per pet for one calendar year.
export function spending(d, year) {
  const by = new Map()
  for (const r of d.petRecords) {
    if (!(r.cost > 0) || !r.date?.startsWith(String(year))) continue
    const e = by.get(r.petId) || { count: 0, total: 0 }
    e.count++
    e.total += r.cost
    by.set(r.petId, e)
  }
  return by
}

// ---- weight (stored in kg) ----
const LB_PER_KG = 2.2046226218
export const toUnit = (kg, unit) => (unit === 'lb' ? kg * LB_PER_KG : kg)
export const fromUnit = (v, unit) => (unit === 'lb' ? v / LB_PER_KG : v)
const round1 = (n) => Math.round(n * 10) / 10

export const latestWeight = (d, petId) =>
  d.petRecords.filter((r) => r.petId === petId && r.type === 'weight' && r.weightKg > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null

// One point per month (the latest weigh-in that month), positioned by real date.
export function weightSeries(d, petId, unit) {
  const rows = d.petRecords.filter((r) => r.petId === petId && r.type === 'weight' && r.weightKg > 0).sort((a, b) => (a.date < b.date ? -1 : 1))
  const byMonth = new Map()
  for (const r of rows) byMonth.set(r.date.slice(0, 7), r)
  return [...byMonth.values()].map((r) => {
    const [y, m, dd] = parts(r.date)
    return { key: r.id, month: r.date.slice(0, 7), date: r.date, t: Date.UTC(y, m - 1, dd), weight: round1(toUnit(r.weightKg, unit)), carried: false }
  })
}
