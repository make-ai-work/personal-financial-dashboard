import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/lib/model.js'
import { exportWorkbook, importWorkbook } from '../src/lib/excel.js'
import { addProperty, addValuation, addLoan, addLoanUpdate } from '../src/lib/property.js'
import { addPet, addRecord } from '../src/lib/pets.js'

// Round trip: everything exported must come back identical (the Excel file is the backup format).
test('export then import restores property, pets and settings', async () => {
  let d = emptyData()
  d = { ...d, settings: { ...d.settings, countries: ['uk', 'us', 'ch'], propertyCountries: ['au', 'in'] } }
  d = addProperty(d, { id: 'p1', name: 'Maple Street home', country: 'us', address: '14 Maple St, Austin TX', type: 'primary', owner: 'joint', purchaseDate: '2019-06-03', purchasePrice: 320000, bedrooms: 3, bathrooms: 2.5, sizeSqft: 1850, taxYear: 7200, insuranceYear: 1640, hoaMonth: 0, taxDue: '2027-01-31', notes: 'n' }, { currentValue: 410000, today: '2026-10-27' })
  d = addValuation(d, { propertyId: 'p1', date: '2026-10-12', value: 405000, source: 'zillow', notes: 'z' })
  d = addLoan(d, { id: 'l1', propertyId: 'p1', lender: 'Wells Fargo', number: '3300918823', originalAmount: 256000, startDate: '2019-06-03', termYears: 30, rate: 3.25, rateType: 'adjustable', monthlyPayment: 1820, escrow: 640, paymentDay: 1, notes: '' })
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-10-01', balance: 218400, principal: 530, interest: 650, escrow: 640, notes: 'extra' })
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-09-01', balance: 218930, principal: null, interest: null, escrow: null, notes: '' })
  d = addPet(d, { id: 'pet1', name: 'Milo', species: 'dog', birthDate: '2020-04-12' })
  d = addRecord(d, { petId: 'pet1', type: 'weight', date: '2026-10-03', weightKg: 29.4, name: '', cost: null })

  const { data: back, warnings } = await importWorkbook((await exportWorkbook(d)).buffer)
  assert.deepEqual(warnings, [])
  assert.deepEqual(back.settings.countries, ['uk', 'us', 'ch'])
  assert.deepEqual(back.settings.propertyCountries, ['au', 'in'])
  assert.deepEqual(back.properties, d.properties)
  assert.deepEqual(back.propertyValues, d.propertyValues)
  assert.deepEqual(back.loans, d.loans)
  assert.deepEqual(back.loanUpdates.map((u) => [u.date, u.balance, u.principal, u.notes]), d.loanUpdates.map((u) => [u.date, u.balance, u.principal, u.notes]))
  assert.equal(back.pets[0].name, 'Milo')
  assert.equal(back.petRecords[0].weightKg, 29.4)
})

test('import skips orphaned rows and reports them', async () => {
  let d = emptyData()
  d = addProperty(d, { id: 'p1', name: 'A', country: 'us', type: 'primary', owner: 'mine' })
  d = addValuation(d, { propertyId: 'ghost', date: '2026-01-01', value: 5, source: 'own', notes: '' })
  d = addLoan(d, { propertyId: 'ghost', lender: 'X' })
  const { data: back, warnings } = await importWorkbook((await exportWorkbook(d)).buffer)
  assert.equal(back.propertyValues.length, 0)
  assert.equal(back.loans.length, 0)
  assert.equal(warnings.length, 2)
})
