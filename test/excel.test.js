import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/lib/model.js'
import { exportWorkbook, importWorkbook } from '../src/lib/excel.js'
import { addProperty, addValuation, addLoan, addLoanUpdate } from '../src/lib/property.js'
import { addAccount } from '../src/lib/model.js'
import { addPortfolio, addHolding, finishLinking, updatePortfolio } from '../src/lib/portfolio.js'

// Round trip: everything exported must come back identical (the Excel file is the backup format).
test('export then import restores property, legacy pet data and settings', async () => {
  let d = emptyData()
  d = { ...d, settings: { ...d.settings, countries: ['uk', 'us', 'ch'], propertyCountries: ['au', 'in'] } }
  d = addProperty(d, { id: 'p1', name: 'Maple Street home', country: 'us', address: '14 Maple St, Austin TX', type: 'primary', owner: 'joint', purchaseDate: '2019-06-03', purchasePrice: 320000, bedrooms: 3, bathrooms: 2.5, sizeSqft: 1850, taxYear: 7200, insuranceYear: 1640, hoaMonth: 0, taxDue: '2027-01-31', notes: 'n' }, { currentValue: 410000, today: '2026-10-27' })
  d = addValuation(d, { propertyId: 'p1', date: '2026-10-12', value: 405000, source: 'zillow', notes: 'z' })
  d = addLoan(d, { id: 'l1', propertyId: 'p1', lender: 'Wells Fargo', number: '3300918823', originalAmount: 256000, startDate: '2019-06-03', termYears: 30, rate: 3.25, rateType: 'adjustable', monthlyPayment: 1820, escrow: 640, paymentDay: 1, notes: '' })
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-10-01', balance: 218400, principal: 530, interest: 650, escrow: 640, notes: 'extra' })
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-09-01', balance: 218930, principal: null, interest: null, escrow: null, notes: '' })
  // data from the retired Pets tab is kept as plain data and must still round-trip through backups
  d = { ...d, pets: [{ id: 'pet1', name: 'Milo', species: 'dog', birthDate: '2020-04-12' }], petRecords: [{ id: 'r1', petId: 'pet1', type: 'weight', date: '2026-10-03', weightKg: 29.4, name: '', cost: null }] }

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

test('portfolios, holdings (incl. a mixed fund and an unallocated line), targets and settings round-trip', async () => {
  let d = emptyData()
  d = { ...d, settings: { ...d.settings, portfolioCountries: ['uk', 'us'], concentrationLimit: 7, rebalanceTol: 2, priceStaleDays: 14 } }
  d = addAccount(d, { id: 'acc', country: 'us', type: 'asset', name: 'Brokerage', number: '', institution: 'Schwab', owner: 'joint', balance: 100, mix: null, maturityDate: '', maturityValue: null })
  d = addPortfolio(d, { id: 'pf', name: 'Schwab', accountId: 'acc' })
  d = addHolding(d, { portfolioId: 'pf', name: 'VTI', ticker: 'VTI', type: 'etf', cls: 'equities', sector: 'Broad market', geo: 'US', trackBy: 'units', units: 0.5, price: 150.25, priceDate: '2026-10-27', notes: 'n' })
  d = addHolding(d, { portfolioId: 'pf', name: 'Balanced fund', type: 'fund', cls: 'mixed', mix: [60, 0, 0, 40], trackBy: 'value', value: 10, priceDate: '2026-10-27' })
  d = finishLinking(d, 'pf', 'unallocated', '2026-10-31') // adds the unallocated line, balance stays 100
  d = updatePortfolio(d, 'pf', { targets: { equities: 70, bonds: 20, cash: 5, metals: 5 } })

  const { data: back, warnings } = await importWorkbook((await exportWorkbook(d)).buffer)
  assert.deepEqual(warnings, [])
  assert.deepEqual(back.portfolios, d.portfolios)
  assert.deepEqual(back.holdings, d.holdings)
  assert.equal(back.accounts[0].balance, 100)
  assert.deepEqual([back.settings.portfolioCountries, back.settings.concentrationLimit, back.settings.rebalanceTol, back.settings.priceStaleDays], [['uk', 'us'], 7, 2, 14])
})

test('a portfolio pointing at a missing or already-linked account is skipped with a warning', async () => {
  let d = emptyData()
  d = addAccount(d, { id: 'acc', country: 'us', type: 'asset', name: 'B', number: '', institution: '', owner: 'mine', balance: 1, mix: null, maturityDate: '', maturityValue: null })
  d = addPortfolio(d, { id: 'a', name: 'A', accountId: 'acc' })
  d = { ...d, portfolios: [...d.portfolios, { id: 'b', name: 'Second link', accountId: 'acc', reconciled: false, openingBalance: 0, targets: null }, { id: 'c', name: 'Ghost', accountId: 'nope', reconciled: false, openingBalance: 0, targets: null }] }
  const { data: back, warnings } = await importWorkbook((await exportWorkbook(d)).buffer)
  assert.deepEqual(back.portfolios.map((p) => p.name), ['A'])
  assert.equal(warnings.length, 2)
})
