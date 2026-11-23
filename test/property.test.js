import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/lib/model.js'
import {
  addProperty, addValuation, addLoan, addLoanUpdate, removeProperty, removeLoan, snapshot, totalsFor, scheduledBalance,
  scheduledPayoff, loanBalanceOn, changeLast12Months, gainSincePurchase, valueRange, nextPaymentDate, dueItems, history, ordinal, updateLoanUpdate,
} from '../src/lib/property.js'

const TODAY = '2026-10-27'
const prop = (o) => ({ name: 'Maple Street home', country: 'us', address: '14 Maple St', type: 'primary', owner: 'joint', purchaseDate: '2019-06-03', purchasePrice: 320000, taxDue: '', taxYear: 7200, ...o })

function setup() {
  let d = emptyData()
  d = addProperty(d, prop({ id: 'p1' }))
  d = addValuation(d, { propertyId: 'p1', date: '2025-10-20', value: 392000, source: 'appraisal', notes: '' })
  d = addValuation(d, { propertyId: 'p1', date: '2026-04-08', value: 402000, source: 'zillow', notes: '' })
  d = addValuation(d, { propertyId: 'p1', date: '2026-10-12', value: 410000, source: 'zillow', notes: '' })
  d = addLoan(d, { id: 'l1', propertyId: 'p1', lender: 'Wells Fargo', originalAmount: 256000, startDate: '2019-06-03', termYears: 30, rate: 3.25, monthlyPayment: 1820, paymentDay: 1 })
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-08-01', balance: 219458 })
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-09-01', balance: 218930 })
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-10-01', balance: 218400 })
  return d
}

test('adding a property seeds the purchase price and current value as valuations', () => {
  const d = addProperty(emptyData(), prop({ id: 'a' }), { currentValue: 410000, today: TODAY })
  assert.deepEqual(d.propertyValues.map((v) => [v.date, v.value, v.source]), [['2019-06-03', 320000, 'purchase'], [TODAY, 410000, 'own']])
  assert.equal(addProperty(emptyData(), prop({ purchasePrice: 0 })).propertyValues.length, 0)
})

test('snapshot: latest value and latest recorded balance, equity and LTV', () => {
  const s = snapshot(setup(), setup().properties[0], TODAY)
  assert.equal(s.value, 410000)
  assert.equal(s.valuation.source, 'zillow')
  assert.equal(s.balance, 218400)
  assert.equal(s.equity, 191600)
  assert.ok(Math.abs(s.ltv - 218400 / 410000) < 1e-9)
  assert.equal(s.monthly, 1820)
  assert.equal(s.loans[0].recorded, true)
})

test('a later-dated update wins regardless of entry order, and edits are respected', () => {
  let d = setup()
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-07-01', balance: 999999 }) // entered last, but older
  assert.equal(loanBalanceOn(d, d.loans[0], TODAY).balance, 218400)
  const id = d.loanUpdates.find((u) => u.date === '2026-10-01').id
  d = updateLoanUpdate(d, id, { balance: 218000 })
  assert.equal(loanBalanceOn(d, d.loans[0], TODAY).balance, 218000)
  assert.equal(loanBalanceOn(d, d.loans[0], '2026-08-15').balance, 219458) // as of a past date
})

test('amortisation matches the closed-form payment formula, edge cases are safe', () => {
  const loan = { originalAmount: 200000, startDate: '2026-01-15', termYears: 30, rate: 6 }
  const r = 0.005, N = 360
  const M = (200000 * r) / (1 - (1 + r) ** -N)
  const after12 = 200000 * (1 + r) ** 12 - (M * ((1 + r) ** 12 - 1)) / r // independent derivation
  assert.ok(Math.abs(scheduledBalance(loan, '2027-01-15') - after12) < 0.01)
  assert.equal(scheduledBalance(loan, '2026-01-15'), 200000)
  assert.equal(scheduledBalance(loan, '2056-01-15'), 0)
  assert.equal(scheduledBalance(loan, '2099-01-01'), 0)
  assert.equal(scheduledBalance({ originalAmount: 120000, startDate: '2020-01-01', termYears: 10, rate: 0 }, '2025-01-01'), 60000)
  assert.equal(scheduledBalance({ originalAmount: 50000 }, '2026-01-01'), 50000) // no terms: original amount
  assert.equal(scheduledBalance({}, '2026-01-01'), 0)
  assert.equal(scheduledPayoff(loan), '2056-01-15')
  assert.equal(scheduledPayoff({}), '')
})

test('without any recorded update the balance is the scheduled estimate', () => {
  let d = addProperty(emptyData(), prop({ id: 'p' }))
  d = addLoan(d, { id: 'l', propertyId: 'p', originalAmount: 100000, startDate: '2025-10-27', termYears: 10, rate: 0 })
  const b = loanBalanceOn(d, d.loans[0], TODAY)
  assert.equal(b.recorded, false)
  assert.equal(Math.round(b.balance), 90000) // 12 of 120 payments done
})

test('value change over 12 months, gain since purchase, range', () => {
  const d = setup()
  const c = changeLast12Months(d, 'p1', TODAY)
  assert.equal(c.delta, 18000) // vs 20 Oct 2025 appraisal, the latest on or before 27 Oct 2025
  assert.ok(Math.abs(c.pct - 4.5918) < 0.001)
  const g = gainSincePurchase(d.properties[0], 410000)
  assert.equal(g.delta, 90000)
  assert.ok(Math.abs(g.pct - 28.125) < 1e-9)
  assert.deepEqual(valueRange(d, 'p1'), { min: 320000, max: 410000 })
  assert.equal(changeLast12Months(addProperty(emptyData(), prop({ id: 'z' })), 'z', TODAY), null) // single valuation: no comparison
  assert.equal(gainSincePurchase({ purchasePrice: 0 }, 5), null)
})

test('country totals respect the property list given', () => {
  let d = setup()
  d = addProperty(d, prop({ id: 'p2', name: 'Pune', country: 'in', owner: 'mine', purchasePrice: 5000000 }))
  d = addLoan(d, { propertyId: 'p2', originalAmount: 2400000 })
  const us = totalsFor(d, d.properties.filter((p) => p.country === 'us'), TODAY)
  assert.deepEqual([us.count, us.value, us.balance, us.equity], [1, 410000, 218400, 191600])
  const mine = totalsFor(d, d.properties.filter((p) => p.owner === 'mine'), TODAY)
  assert.deepEqual([mine.value, mine.balance, mine.equity], [5000000, 2400000, 2600000])
})

test('next payment date: this month, next month, clamped to short months', () => {
  assert.equal(nextPaymentDate(1, '2026-10-27'), '2026-11-01')
  assert.equal(nextPaymentDate(27, '2026-10-27'), '2026-10-27') // due today
  assert.equal(nextPaymentDate(28, '2026-10-27'), '2026-10-28')
  assert.equal(nextPaymentDate(31, '2026-11-02'), '2026-11-30') // November has 30 days
  assert.equal(nextPaymentDate(31, '2027-01-31'), '2027-01-31')
  assert.equal(nextPaymentDate(30, '2027-01-31'), '2027-02-28')
  assert.equal(nextPaymentDate(15, '2026-12-20'), '2027-01-15')
  assert.equal([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal).join(' '), '1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 31st')
})

test('due items: mortgage payments and property tax, paid-off loans skipped', () => {
  let d = setup()
  d = { ...d, properties: d.properties.map((p) => ({ ...p, taxDue: '2027-01-31' })) }
  const items = dueItems(d, TODAY, 30, d.properties)
  assert.deepEqual(items.map((i) => [i.label, i.date, i.status]), [
    ['Maple Street home · Mortgage payment', '2026-11-01', 'soon'],
    ['Maple Street home · Property tax', '2027-01-31', 'ok'],
  ])
  assert.equal(items[0].text, 'due in 5 days')
  assert.match(items[0].sub, /\$ 1,820 monthly, due on the 1st/)
  d = addLoanUpdate(d, { loanId: 'l1', date: '2026-10-20', balance: 0 })
  assert.equal(dueItems(d, TODAY, 30, d.properties).some((i) => /Mortgage/.test(i.label)), false)
})

test('history: monthly, real vs carried points, equity = value - mortgage, schedule before first record', () => {
  const d = setup()
  const h = history(d, d.properties, TODAY)
  assert.equal(h[0].month, '2019-06')
  assert.equal(h.at(-1).month, '2026-10')
  assert.equal(h.length, 89)
  assert.deepEqual([h[0].value, h[0].mortgage, h[0].equity], [320000, 256000, 64000]) // purchase month
  const mid = h.find((p) => p.month === '2022-06')
  assert.equal(mid.carried, true)
  assert.equal(mid.value, 320000) // carried from the purchase valuation
  assert.ok(mid.mortgage < 256000 && mid.mortgage > 200000) // amortised, not stuck at the original amount
  const aug = h.find((p) => p.month === '2026-08')
  assert.equal(aug.carried, false)
  assert.equal(aug.mortgage, 219458) // recorded
  assert.equal(aug.value, 402000)
  assert.deepEqual([h.at(-1).value, h.at(-1).mortgage, h.at(-1).equity, h.at(-1).carried], [410000, 218400, 191600, false])
  assert.deepEqual(history(emptyData(), [], TODAY), [])
})

test('history ignores a property with no valuation, and a loan before its start date', () => {
  let d = addProperty(emptyData(), prop({ id: 'a', purchasePrice: 0, purchaseDate: '' }))
  assert.deepEqual(history(d, d.properties, TODAY), [])
  d = addValuation(d, { propertyId: 'a', date: '2026-08-10', value: 100000, source: 'own', notes: '' })
  d = addLoan(d, { propertyId: 'a', originalAmount: 40000, startDate: '2026-09-15' })
  const h = history(d, d.properties, TODAY)
  assert.deepEqual(h.map((p) => [p.month, p.mortgage]), [['2026-08', 0], ['2026-09', 40000], ['2026-10', 40000]])
})

test('removing a property or loan removes dependants', () => {
  let d = setup()
  d = removeLoan(d, 'l1')
  assert.equal(d.loanUpdates.length, 0)
  d = setup()
  d = removeProperty(d, 'p1')
  assert.deepEqual([d.properties.length, d.propertyValues.length, d.loans.length, d.loanUpdates.length], [0, 0, 0, 0])
})

test('home insurance: annual premium, warnings, and a renewal reminder', async () => {
  const { insuranceAnnual, insuranceWarnings, emptyInsurance, setHomeInsurance, dueItems } = await import('../src/lib/property.js')
  const ins = { ...emptyInsurance(), insurer: 'State Farm', premium: 150, frequency: 'month', renewal: '2026-12-01', limits: { ...emptyInsurance().limits, dwelling: 300000 } }
  assert.equal(insuranceAnnual(ins), 1800); assert.equal(insuranceAnnual({ ...ins, frequency: 'quarter', premium: 400 }), 1600); assert.equal(insuranceAnnual(null), 0)
  // below the value: a gentle note; below the rebuild cost you entered: a firm one; fine otherwise
  assert.equal(insuranceWarnings(ins, 410000, '2026-01-01')[0].level, 'warn')
  assert.equal(insuranceWarnings({ ...ins, rebuildCost: 350000 }, 410000, '2026-01-01')[0].level, 'bad')
  assert.equal(insuranceWarnings({ ...ins, rebuildCost: 250000 }, 410000, '2026-01-01').length, 0)
  assert.match(insuranceWarnings(ins, 100000, '2026-11-25')[0].text, /renews in 6 days/)
  assert.match(insuranceWarnings(ins, 100000, '2026-12-10')[0].text, /passed 9 days ago/)
  assert.match(insuranceWarnings({ ...ins, limits: {} }, 1, '2026-01-01')[0].text, /No dwelling limit/)
  // saved on the property, and shown in the reminders
  let d = emptyData()
  d = addProperty(d, { id: 'p1', name: 'Home', country: 'us', type: 'primary', owner: 'mine' })
  d = setHomeInsurance(d, 'p1', ins)
  assert.equal(d.properties[0].homeInsurance.insurer, 'State Farm')
  const item = dueItems(d, '2026-11-20', 30, d.properties).find((i) => i.id === 'ins-p1')
  assert.match(item.label, /Home insurance renewal/); assert.equal(item.date, '2026-12-01')
})
