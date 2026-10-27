import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/lib/model.js'
import {
  addMonths, addDays, daysBetween, nextFrom, ageText, dueStatus, addPet, addRecord, removePet, markMedicationDone,
  latestVaccines, dueItems, nextItemForPet, spending, weightSeries, latestWeight, toUnit, fromUnit, updateRecord,
} from '../src/lib/pets.js'

const TODAY = '2026-10-27'
const rec = (o) => ({ petId: 'p', type: 'vaccine', date: '', name: '', dose: '', repeat: 'none', nextDue: '', endDate: '', lastGiven: '', vet: '', cost: null, notes: '', weightKg: null, ...o })

test('date maths clamps month ends and crosses year boundaries', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15')
  assert.equal(addMonths('2026-03-15', -4), '2025-11-15')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(daysBetween('2026-10-27', '2026-11-15'), 19)
  assert.equal(daysBetween('2026-10-27', '2026-10-20'), -7)
})

test('nextFrom follows the repeat interval', () => {
  assert.equal(nextFrom('2026-03-02', '1y'), '2027-03-02')
  assert.equal(nextFrom('2023-11-15', '3y'), '2026-11-15')
  assert.equal(nextFrom('2026-10-01', 'monthly'), '2026-11-01')
  assert.equal(nextFrom('2026-10-01', 'weekly'), '2026-10-08')
  assert.equal(nextFrom('2026-10-01', 'none'), '')
  assert.equal(nextFrom('', '1y'), '')
})

test('age text', () => {
  assert.equal(ageText('2020-04-12', TODAY), '6 yrs 6 mo')
  assert.equal(ageText('2022-09-03', TODAY), '4 yrs 1 mo')
  assert.equal(ageText('2026-05-01', TODAY), '5 mo')
  assert.equal(ageText('2026-10-20', TODAY), '7 days')
  assert.equal(ageText('2025-10-27', TODAY), '1 yr')
  assert.equal(ageText('2027-01-01', TODAY), '')
})

test('due status: overdue, soon, ok', () => {
  assert.deepEqual(dueStatus('2026-10-20', TODAY), { status: 'overdue', days: -7, text: 'overdue 7 days' })
  assert.equal(dueStatus('2026-10-26', TODAY).text, 'overdue 1 day')
  assert.equal(dueStatus(TODAY, TODAY).text, 'due today')
  assert.equal(dueStatus('2026-11-15', TODAY).status, 'soon')
  assert.equal(dueStatus('2026-11-15', TODAY).text, 'due in 19 days')
  assert.equal(dueStatus('2026-11-26', TODAY, 30).status, 'soon') // exactly 30 days
  assert.equal(dueStatus('2026-11-27', TODAY, 30).status, 'ok')
  assert.equal(dueStatus('2026-11-27', TODAY, 60).status, 'soon')
  assert.equal(dueStatus('', TODAY), null)
})

const setup = () => {
  let d = emptyData()
  d = addPet(d, { name: 'Milo', species: 'dog', insuranceRenews: '2027-03-01', insurance: 'PetSure' })
  d = addPet(d, { name: 'Luna', species: 'cat' })
  const [milo, luna] = d.pets.map((p) => p.id)
  return { d, milo, luna }
}

test('latest dose per vaccine name wins, and counts doses', () => {
  let { d, milo } = setup()
  d = addRecord(d, rec({ petId: milo, name: 'Rabies', date: '2020-11-15', repeat: '3y', nextDue: '2023-11-15' }))
  d = addRecord(d, rec({ petId: milo, name: 'rabies ', date: '2023-11-15', repeat: '3y', nextDue: '2026-11-15' }))
  d = addRecord(d, rec({ petId: milo, name: 'DHPP', date: '2026-03-02', repeat: '1y', nextDue: '2027-03-02' }))
  const v = latestVaccines(d, milo)
  assert.deepEqual(v.map((x) => [x.record.name.trim(), x.record.nextDue, x.doses]), [['DHPP', '2027-03-02', 1], ['rabies', '2026-11-15', 2]])
})

test('due items: sorted, statuses, and old doses do not nag', () => {
  let { d, milo, luna } = setup()
  d = addRecord(d, rec({ petId: milo, name: 'Rabies', date: '2020-11-15', nextDue: '2023-11-15' })) // superseded dose
  d = addRecord(d, rec({ petId: milo, name: 'Rabies', date: '2023-11-15', nextDue: '2026-11-15' }))
  d = addRecord(d, rec({ petId: milo, type: 'medication', name: 'Heartworm pill', repeat: 'monthly', date: '2026-10-01', lastGiven: '2026-10-01', nextDue: '2026-11-01' }))
  d = addRecord(d, rec({ petId: milo, type: 'medication', name: 'Ear drops', repeat: 'daily', date: '2026-10-03', endDate: '2026-11-05' }))
  d = addRecord(d, rec({ petId: luna, type: 'medication', name: 'Flea treatment', repeat: 'monthly', date: '2026-09-20', nextDue: '2026-10-20' }))
  d = addRecord(d, rec({ petId: luna, type: 'visit', name: 'Annual check-up', date: '2025-12-10', nextDue: '2026-12-10' }))
  d = addRecord(d, rec({ petId: luna, type: 'visit', name: 'Old visit', date: '2024-01-01', nextDue: '2024-06-01' })) // not the latest visit
  const items = dueItems(d, TODAY, 30)
  assert.deepEqual(items.map((i) => [i.label, i.date, i.status]), [
    ['Flea treatment', '2026-10-20', 'overdue'],
    ['Heartworm pill', '2026-11-01', 'soon'],
    ['Ear drops', '2026-11-05', 'soon'],
    ['Rabies', '2026-11-15', 'soon'],
    ['Annual check-up', '2026-12-10', 'ok'],
    ['Pet insurance renewal', '2027-03-01', 'ok'],
  ])
  assert.equal(items.find((i) => i.label === 'Ear drops').text, 'ends 5 Nov 2026')
  assert.equal(nextItemForPet(items, luna).label, 'Flea treatment')
  assert.equal(dueItems(d, TODAY, 30, luna).length, 2)
  assert.equal(dueItems(d, '2026-11-05', 30).some((i) => i.label === 'Ear drops'), true)
  assert.equal(dueItems(d, '2026-11-06', 30).some((i) => i.label === 'Ear drops'), false) // course over
})

test('marking a medication done rolls it forward, and ends a finished course', () => {
  let { d, milo } = setup()
  d = addRecord(d, rec({ petId: milo, type: 'medication', name: 'Heartworm pill', repeat: 'monthly', nextDue: '2026-11-01' }))
  const id = d.petRecords[0].id
  d = markMedicationDone(d, id, '2026-11-01')
  assert.equal(d.petRecords[0].lastGiven, '2026-11-01')
  assert.equal(d.petRecords[0].nextDue, '2026-12-01')
  d = updateRecord(d, id, { endDate: '2026-12-15' })
  d = markMedicationDone(d, id, '2026-12-01')
  assert.equal(d.petRecords[0].nextDue, '') // next dose would fall after the end date
})

test('spending counts costed records in the year only', () => {
  let { d, milo, luna } = setup()
  d = addRecord(d, rec({ petId: milo, type: 'visit', date: '2026-10-03', cost: 148 }))
  d = addRecord(d, rec({ petId: milo, type: 'visit', date: '2026-03-02', cost: 310 }))
  d = addRecord(d, rec({ petId: milo, type: 'visit', date: '2025-03-02', cost: 999 }))
  d = addRecord(d, rec({ petId: luna, type: 'visit', date: '2026-01-05', cost: 0 }))
  const s = spending(d, 2026)
  assert.deepEqual(s.get(milo), { count: 2, total: 458 })
  assert.equal(s.get(luna), undefined)
})

test('weight series: one point per month, latest wins, unit conversion', () => {
  let { d, milo } = setup()
  d = addRecord(d, rec({ petId: milo, type: 'weight', date: '2026-01-05', weightKg: 28.9 }))
  d = addRecord(d, rec({ petId: milo, type: 'weight', date: '2026-01-25', weightKg: 29.1 }))
  d = addRecord(d, rec({ petId: milo, type: 'weight', date: '2026-10-03', weightKg: 29.4 }))
  const kg = weightSeries(d, milo, 'kg')
  assert.deepEqual(kg.map((p) => [p.month, p.weight]), [['2026-01', 29.1], ['2026-10', 29.4]])
  assert.equal(weightSeries(d, milo, 'lb')[1].weight, 64.8)
  assert.equal(latestWeight(d, milo).weightKg, 29.4)
  assert.ok(Math.abs(fromUnit(toUnit(29.4, 'lb'), 'lb') - 29.4) < 1e-9)
})

test('removing a pet removes its records', () => {
  let { d, milo, luna } = setup()
  d = addRecord(d, rec({ petId: milo, name: 'x' }))
  d = addRecord(d, rec({ petId: luna, name: 'y' }))
  d = removePet(d, milo)
  assert.equal(d.pets.length, 1)
  assert.deepEqual(d.petRecords.map((r) => r.name), ['y'])
})
