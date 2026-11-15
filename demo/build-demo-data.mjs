// Builds demo/demo-data.json (made-up sample data for the demo site) using the app's own functions, so it always
// matches the data model. Run:  node demo/build-demo-data.mjs
import { writeFileSync } from 'node:fs'
import { emptyData, addAccount, addPolicy, saveUpdate, normalizeData } from '../src/lib/model.js'
import { addPortfolio, addHolding, finishLinking, updatePortfolio } from '../src/lib/portfolio.js'
import { addProperty, addValuation, addLoan, addLoanUpdate } from '../src/lib/property.js'
import { defaultMc, resolveMc, resolvePlan, saveVersion, setPlan } from '../src/lib/retirement.js'
import { analyse, summarise } from '../src/lib/montecarlo.js'

const TODAY = '2026-11-15'
let d = emptyData()
d = { ...d, settings: { ...d.settings, countries: ['us', 'in'], propertyCountries: ['us', 'in'], portfolioCountries: ['us', 'in'], parentLabel: 'Parent' } }

// ---- Finance accounts (final balances; linked portfolio accounts match their holdings) ----
const A = (id, country, type, name, number, institution, owner, balance, mix, extra = {}) =>
  ({ id, country, type, name, number, institution, owner, balance, mix, maturityDate: '', maturityValue: null, ...extra })
const accounts = [
  A('us-brokerage', 'us', 'asset', 'Sample Brokerage', '0000-1111-2201', 'Sample Securities', 'joint', 96000, null),
  A('us-401k', 'us', 'asset', '401(k)', '0000-1111-2202', 'Sample Retirement Co', 'mine', 184000, null),
  A('us-checking', 'us', 'asset', 'Checking', '0000-1111-2203', 'Sample Bank', 'mine', 8200, [0, 100, 0, 0]),
  A('us-savings', 'us', 'asset', 'Savings', '0000-1111-2204', 'Sample Bank', 'joint', 24000, [0, 100, 0, 0]),
  A('us-cd', 'us', 'asset', 'Certificate of deposit', '0000-1111-2205', 'Sample Bank', 'parent', 20000, [0, 100, 0, 0], { maturityDate: '2027-06-30', maturityValue: 21400 }),
  A('us-car', 'us', 'liability', 'Car loan', '0000-1111-2206', 'Sample Auto Finance', 'mine', 12300, null),
  A('in-funds', 'in', 'asset', 'Mutual funds', '0000-3333-4401', 'Sample AMC', 'mine', 4200000, null),
  A('in-fd', 'in', 'asset', 'Fixed deposit', '0000-3333-4402', 'Sample Bank India', 'parent', 1200000, [0, 100, 0, 0], { maturityDate: '2027-03-31', maturityValue: 1290000 }),
  A('in-savings', 'in', 'asset', 'Savings account', '0000-3333-4403', 'Sample Bank India', 'mine', 450000, [0, 100, 0, 0]),
]
for (const a of accounts) d = addAccount(d, a)
d = addPolicy(d, { id: 'us-term', country: 'us', name: 'Term life', number: 'POL-0001', company: 'Sample Life Insurance', owner: 'mine', deathBenefit: 500000, maturityDate: '2044-01-01', maturityValue: null })
d = addPolicy(d, { id: 'in-endow', country: 'in', name: 'Endowment plan', number: 'POL-0002', company: 'Sample Life India', owner: 'mine', deathBenefit: 3000000, maturityDate: '2032-04-01', maturityValue: 5200000 })

// ---- eleven monthly updates, rising to the final balances ----
const finals = Object.fromEntries(accounts.map((a) => [a.id, a.balance]))
for (let i = 0; i <= 10; i++) {
  const date = `2026-${String(i + 1).padStart(2, '0')}-05`
  const growth = 0.86 + 0.14 * (i / 10) + (i % 3 === 1 ? -0.012 : 0.006) * (i < 10 ? 1 : 0)
  d = { ...d, accounts: d.accounts.map((a) => ({ ...a, balance: Math.round(finals[a.id] * (a.type === 'liability' ? 1.25 - 0.25 * (i / 10) : growth) / 100) * 100 })) }
  const rate = Math.round((82.9 + i * 0.11) * 100) / 100
  for (const c of ['us', 'in']) d = saveUpdate(d, c, date, { base: 'USD', rates: { INR: rate } })
}
d = { ...d, accounts: d.accounts.map((a) => ({ ...a, balance: finals[a.id] })) }

// ---- portfolios linked to Finance accounts ----
const H = (id, portfolioId, name, ticker, type, cls, sector, geo, units, price) => ({ id, portfolioId, name, ticker, type, cls, sector, geo, trackBy: 'units', units, price, priceDate: TODAY })
d = addPortfolio(d, { id: 'pf-brokerage', name: 'Sample Brokerage', accountId: 'us-brokerage' })
d = addPortfolio(d, { id: 'pf-401k', name: '401(k)', accountId: 'us-401k' })
d = addPortfolio(d, { id: 'pf-funds', name: 'Mutual funds', accountId: 'in-funds' })
for (const h of [
  H('h1', 'pf-brokerage', 'Total US Stock Market ETF', 'VTI', 'etf', 'equities', 'Broad market', 'US', 160, 250),
  H('h2', 'pf-brokerage', 'Total International Stock ETF', 'VXUS', 'etf', 'equities', 'Broad market', 'International', 400, 60),
  H('h3', 'pf-brokerage', 'Sample Tech Co', 'STC', 'stock', 'equities', 'Technology', 'US', 40, 225),
  H('h4', 'pf-brokerage', 'Total Bond Market ETF', 'BND', 'etf', 'bonds', 'Bonds', 'US', 160, 75),
  H('h5', 'pf-brokerage', 'Treasury Bill ETF', 'SGOV', 'etf', 'cash', 'Cash', 'US', 60, 100),
  H('h6', 'pf-401k', 'S&P 500 Index Fund', 'SPXFUND', 'fund', 'equities', 'Broad market', 'US', 120, 1000),
  H('h7', 'pf-401k', 'Total Bond Fund', 'BONDFUND', 'fund', 'bonds', 'Bonds', 'US', 640, 100),
  H('h8', 'pf-funds', 'Nifty 50 Index Fund', 'NIFTYIDX', 'fund', 'equities', 'Broad market', 'India', 21000, 100),
  H('h9', 'pf-funds', 'Flexi-cap Fund', 'FLEXICAP', 'fund', 'equities', 'Broad market', 'India', 14000, 100),
  H('h10', 'pf-funds', 'Liquid Fund', 'LIQUID', 'fund', 'cash', 'Cash', 'India', 7000, 100),
]) d = addHolding(d, h)
d = updatePortfolio(d, 'pf-brokerage', { targets: { equities: 60, bonds: 25, cash: 10, metals: 5 } })
d = finishLinking(d, 'pf-brokerage', 'unallocated', TODAY) // $91,000 of holdings: the $5,000 difference becomes an "unallocated" line
d = finishLinking(d, 'pf-401k', 'accept', TODAY)
d = finishLinking(d, 'pf-funds', 'accept', TODAY)

// ---- property and a mortgage ----
d = addProperty(d, { id: 'prop-home', name: 'Maple Street home', country: 'us', address: '14 Maple St, Sampleville', type: 'primary', owner: 'joint', purchaseDate: '2019-06-03', purchasePrice: 320000, bedrooms: 3, bathrooms: 2, sizeSqft: 1850, taxYear: 4800, insuranceYear: 1500, hoaMonth: null, taxDue: '2026-12-15', notes: '' })
d = addProperty(d, { id: 'prop-flat', name: 'City flat', country: 'in', address: 'Sample Nagar, Pune', type: 'investment', owner: 'mine', purchaseDate: '2018-02-14', purchasePrice: 5200000, bedrooms: 2, bathrooms: 2, sizeSqft: 1100, taxYear: null, insuranceYear: null, hoaMonth: null, taxDue: '', notes: '' })
for (const v of [
  ['v1', 'prop-home', '2025-11-12', 385000, 'own'], ['v2', 'prop-home', '2026-03-10', 392000, 'zillow'], ['v3', 'prop-home', '2026-10-12', 405000, 'zillow'],
  ['v4', 'prop-flat', '2025-11-20', 7100000, 'agent'], ['v5', 'prop-flat', '2026-10-18', 7500000, 'agent'],
]) d = addValuation(d, { id: v[0], propertyId: v[1], date: v[2], value: v[3], source: v[4], notes: '' })
d = addLoan(d, { id: 'loan-home', propertyId: 'prop-home', lender: 'Sample Lender', number: 'LN-0001', originalAmount: 256000, startDate: '2019-06-03', termYears: 30, rate: 3.25, rateType: 'fixed', monthlyPayment: 1820, escrow: 640, paymentDay: 1, notes: '' })
;[['2026-06-01', 219900], ['2026-07-01', 219400], ['2026-08-01', 218900], ['2026-09-01', 218400], ['2026-10-01', 217900], ['2026-11-01', 217400]].forEach(([date, balance], i) =>
  { d = addLoanUpdate(d, { id: `lu${i}`, loanId: 'loan-home', date, balance, principal: 500, interest: 590 - i, escrow: 640, notes: '' }) })

// ---- retirement plan and two saved versions ----
const fx = { base: 'USD', rates: { INR: 84 } }
d = setPlan(d, {
  age: 38, retAge: 62, life: 95, currency: 'USD', ac: 18000, g: 3, spend: 70000, tax: 12,
  selected: ['us-brokerage', 'us-401k', 'in-funds'], adjustment: 0, eqOverride: null,
  income: [
    { id: 'inc-ss', name: 'Social Security', amt: 22000, cur: 'USD', from: 67, to: '' },
    { id: 'inc-pf', name: 'Provident fund pension', amt: 600000, cur: 'INR', from: 60, to: '' },
  ],
  y: 4.4, inf: 3.2, prem: 4.5, asOf: TODAY,
})
const run = (plan, mc) => { const p = resolvePlan({ ...d, retirement: { ...d.retirement, plan } }, fx); const a = resolveMc(mc, p); return summarise(analyse(a, p), p) }
const mc = { ...defaultMc(), n: 5000, seed: 12345 }
d = { ...d, retirement: { ...d.retirement, mc } }
const base = d.retirement.plan
d = saveVersion(d, 'Base case', run(base, mc), '2026-11-10')
const later = { ...base, retAge: 65, spend: 65000 }
d = saveVersion({ ...d, retirement: { ...d.retirement, plan: later } }, 'Retire at 65', run(later, mc), '2026-11-12')
d = { ...d, retirement: { ...d.retirement, plan: base } } // the plan itself is the base case
d = { ...d, retirement: { ...d.retirement, versions: d.retirement.versions.map((v, i) => ({ ...v, id: `ver-${i + 1}` })) } }

writeFileSync(new URL('./demo-data.json', import.meta.url), JSON.stringify(normalizeData(d), null, 1) + '\n')
console.log('wrote demo/demo-data.json:', d.accounts.length, 'accounts,', d.balances.length, 'balances,', d.holdings.length, 'holdings,', d.retirement.versions.map((v) => `${v.name} ${(v.summary.succ * 100).toFixed(0)}%`).join(', '))
