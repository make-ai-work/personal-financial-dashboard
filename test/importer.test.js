import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/lib/model.js'
import { ACCOUNT_FIELDS, HOLDING_FIELDS, toISODate, detectColumns, parseCsv, planAccountsImport, planHoldingsImport, resolveCountry, tableFromRows, toNumber } from '../src/lib/importer.js'
import { holdingsOf, portfolioFor } from '../src/lib/portfolio.js'

const TODAY = '2026-11-23'
const csv = `Symbol,Description,Quantity,Last Price,Market Value,Currency
VTI,Vanguard Total Stock Market ETF,100,"$250.50","$25,050.00",USD
AAPL,Apple Inc,10,190,1900,USD
INFY.BSE,Infosys,50,1500,75000,INR
ISF.LON,iShares FTSE 100,200,8.1,1620,GBP
,,,,,
BAD,No numbers here,,,,USD
`
const table = () => tableFromRows(parseCsv(csv))

test('CSV: quotes, commas inside quotes, semicolons and tabs, BOM and blank lines', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y",2\n\n3,"say ""hi"""'), [['a', 'b'], ['x, y', '2'], ['3', 'say "hi"']])
  assert.deepEqual(parseCsv('﻿a;b\n1;2'), [['a', 'b'], ['1', '2']])
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']])
  const t = tableFromRows([['Report'], ['Symbol', 'Qty'], ['VTI', 3]]) // a title row above the header is skipped
  assert.deepEqual([t.headers, t.rows.length], [['Symbol', 'Qty'], 1])
})

test('numbers: currency signs, thousands separators, European style, negatives', () => {
  assert.equal(toNumber('$25,050.00'), 25050); assert.equal(toNumber('₹ 1,00,000'), 100000); assert.equal(toNumber('1.234,56'), 1234.56)
  assert.equal(toNumber('(1,200.50)'), -1200.5); assert.equal(toNumber('-5'), -5); assert.equal(toNumber(''), null); assert.equal(toNumber('abc'), null); assert.equal(toNumber(7), 7)
})

test('columns are guessed from common broker headings', () => {
  const m = detectColumns(table().headers, HOLDING_FIELDS)
  assert.deepEqual([m.ticker, m.name, m.units, m.price, m.value, m.currency], ['Symbol', 'Description', 'Quantity', 'Last Price', 'Market Value', 'Currency'])
  const a = detectColumns(['Account Name', 'Account Number', 'Bank', 'Owner', 'Balance', 'Currency'], ACCOUNT_FIELDS)
  assert.deepEqual([a.name, a.number, a.institution, a.owner, a.balance], ['Account Name', 'Account Number', 'Bank', 'Owner', 'Balance'])
})

test('countries are read from a code, a name, a flag or a currency', () => {
  assert.equal(resolveCountry('United Kingdom'), 'uk'); assert.equal(resolveCountry('USA'), 'us'); assert.equal(resolveCountry('🇮🇪'), 'ie'); assert.equal(resolveCountry('', 'INR'), 'in'); assert.equal(resolveCountry('Mars', ''), '')
})

test('holdings: one portfolio per country, each with its own Assets account; skipped rows are explained; the account balance equals the holdings', () => {
  const t = table()
  const plan = planHoldingsImport(emptyData(), t, detectColumns(t.headers, HOLDING_FIELDS), 'update', { today: TODAY })
  assert.deepEqual(plan.counts, { portfolios: 3, holdings: 4, skipped: 1 }) // US (2), India, UK
  assert.equal(plan.warnings.length, 1); assert.match(plan.warnings[0], /\(No numbers here\).*needs units and price/)
  assert.ok(plan.lines.some((l) => /USA: create the portfolio "USA portfolio"/.test(l)))
  const d = plan.apply(emptyData())
  assert.equal(d.portfolios.length, 3); assert.equal(d.holdings.length, 4)
  const us = d.portfolios.find((p) => p.name === 'USA portfolio'); const acc = d.accounts.find((a) => a.id === us.accountId)
  assert.deepEqual([acc.country, acc.type, us.reconciled], ['us', 'asset', true])
  assert.equal(acc.balance, 25050 + 1900) // the linked account follows the holdings
  const h = holdingsOf(d, us.id).find((x) => x.ticker === 'VTI'); assert.deepEqual([h.units, h.price, h.trackBy, h.priceDate], [100, 250.5, 'units', TODAY])
  assert.equal(d.accounts.find((a) => a.country === 'in').balance, 75000)
})

test('holdings UPDATE overwrites the portfolio of that country; NEW ADDITION keeps it and skips what is already held', () => {
  const t = table(), map = detectColumns(t.headers, HOLDING_FIELDS)
  const first = planHoldingsImport(emptyData(), t, map, 'update', { today: TODAY }).apply(emptyData())
  // a second file with AAPL (already held) and MSFT (new) for the USA only
  const t2 = tableFromRows(parseCsv('Symbol,Description,Quantity,Last Price,Currency\nAAPL,Apple Inc,12,200,USD\nMSFT,Microsoft,5,400,USD'))
  const map2 = detectColumns(t2.headers, HOLDING_FIELDS)
  const add = planHoldingsImport(first, t2, map2, 'add', { today: TODAY })
  assert.deepEqual([add.counts.holdings, add.counts.skipped], [1, 1]); assert.match(add.warnings[0], /already in "USA portfolio" were skipped/)
  const afterAdd = add.apply(first); const us = afterAdd.portfolios.find((p) => p.name === 'USA portfolio')
  assert.deepEqual(holdingsOf(afterAdd, us.id).map((x) => x.ticker).sort(), ['AAPL', 'MSFT', 'VTI'])
  assert.equal(holdingsOf(afterAdd, us.id).find((x) => x.ticker === 'AAPL').units, 10, 'the held one is untouched')
  assert.equal(afterAdd.portfolios.length, 3, 'no new portfolio: the USA one is reused')
  const over = planHoldingsImport(first, t2, map2, 'update', { today: TODAY })
  assert.match(over.lines[0], /replace the 2 holdings in "USA portfolio" with 2/)
  const afterOver = over.apply(first)
  assert.deepEqual(holdingsOf(afterOver, us.id).map((x) => x.ticker).sort(), ['AAPL', 'MSFT'])
  assert.equal(holdingsOf(afterOver, us.id).find((x) => x.ticker === 'AAPL').units, 12)
  assert.equal(afterOver.accounts.find((a) => a.id === us.accountId).balance, 12 * 200 + 5 * 400)
  assert.equal(afterOver.portfolios.length, 3); assert.ok(portfolioFor(afterOver, us.accountId))
  assert.equal(afterOver.holdings.filter((x) => x.portfolioId !== us.id).length, 2, 'India and UK portfolios are not touched by a USA-only file')
})

test('accounts: update matches by number or name and overwrites; add skips exact duplicates; liabilities and owners are understood', () => {
  const t = tableFromRows(parseCsv('Account Name,Account Number,Bank,Owner,Balance,Currency,Type\nChecking,123456,Chase,Mine,"$8,200",USD,Asset\nMortgage,9988,Wells Fargo,Joint,"-78,000",USD,\nSavings,555,SBI,Spouse,400000,INR,Asset'))
  const map = detectColumns(t.headers, ACCOUNT_FIELDS)
  const plan = planAccountsImport(emptyData(), t, map, 'add')
  assert.deepEqual(plan.counts, { updated: 0, created: 3, skipped: 0 })
  const d = plan.apply(emptyData())
  assert.deepEqual(d.accounts.map((a) => [a.name, a.type, a.owner, a.country, a.balance]), [['Checking', 'asset', 'mine', 'us', 8200], ['Mortgage', 'liability', 'joint', 'us', 78000], ['Savings', 'asset', 'spouse', 'in', 400000]])
  // a new file: Checking's balance changed, a new account appears
  const t2 = tableFromRows(parseCsv('Account Name,Account Number,Balance,Currency\nChecking,123456,9100,USD\nBrokerage,777,5000,USD'))
  const map2 = detectColumns(t2.headers, ACCOUNT_FIELDS)
  const upd = planAccountsImport(d, t2, map2, 'update'); assert.deepEqual(upd.counts, { updated: 1, created: 1, skipped: 0 })
  const after = upd.apply(d)
  assert.equal(after.accounts.find((a) => a.name === 'Checking').balance, 9100); assert.equal(after.accounts.find((a) => a.name === 'Checking').institution, 'Chase', 'a column that is not in the file keeps its value')
  assert.equal(after.accounts.length, 4)
  const add = planAccountsImport(d, t2, map2, 'add'); assert.deepEqual([add.counts.created, add.counts.skipped], [1, 1]) // Checking is an exact duplicate (name, number, country), Brokerage is new
  const dup = planAccountsImport(d, tableFromRows(parseCsv('Account Name,Account Number,Balance\nChecking,123456,1')), detectColumns(['Account Name', 'Account Number', 'Balance'], ACCOUNT_FIELDS), 'add')
  assert.deepEqual([dup.counts.created, dup.counts.skipped], [0, 1])
})

test('defaults fill a missing column and blank cells, for holdings and accounts', () => {
  // holdings with no country or currency column: every row goes to the chosen country
  const t = tableFromRows(parseCsv('Symbol,Quantity,Price\nAAA,10,5\nBBB,2,100'))
  const map = detectColumns(t.headers, HOLDING_FIELDS)
  const plan = planHoldingsImport(emptyData(), t, map, 'update', { today: TODAY, defaults: { country: 'ie' } })
  assert.deepEqual(plan.counts, { portfolios: 1, holdings: 2, skipped: 0 }); assert.match(plan.lines[0], /Ireland/)
  // a default value does not override a cell that is filled
  const t2 = tableFromRows(parseCsv('Account Name,Balance,Owner\nA,100,Spouse\nB,200,'))
  const a = planAccountsImport(emptyData(), t2, detectColumns(t2.headers, ACCOUNT_FIELDS), 'add', { defaults: { owner: 'joint', institution: 'Chase', country: 'uk' } }).apply(emptyData())
  assert.deepEqual(a.accounts.map((x) => [x.owner, x.institution, x.country]), [['spouse', 'Chase', 'uk'], ['joint', 'Chase', 'uk']])
  // a default can satisfy a needed field (here the balance column is missing)
  const t3 = tableFromRows(parseCsv('Account Name,Notes\nZero,x\nOther,y'))
  const z = planAccountsImport(emptyData(), t3, detectColumns(t3.headers, ACCOUNT_FIELDS), 'add', { defaults: { balance: '0' } })
  assert.equal(z.counts.created, 2)
})

test('accounts: maturity date and value are read (several date styles) and kept when a later file leaves them out', () => {
  const t = tableFromRows(parseCsv('Account Name,Balance,Maturity Date,Value at Maturity\nCD one,22000,2027-02-01,"23,100"\nCD two,5000,12/31/2028,5400\nCD three,100,31/12/2029,\nLoan,-900,2030-01-01,1'))
  const map = detectColumns(t.headers, ACCOUNT_FIELDS)
  assert.deepEqual([map.maturityDate, map.maturityValue], ['Maturity Date', 'Value at Maturity'])
  const d = planAccountsImport(emptyData(), t, map, 'add', {}).apply(emptyData())
  assert.deepEqual(d.accounts.map((a) => [a.name, a.maturityDate, a.maturityValue]), [['CD one', '2027-02-01', 23100], ['CD two', '2028-12-31', 5400], ['CD three', '2029-12-31', null], ['Loan', '', null]])
  const t2 = tableFromRows(parseCsv('Account Name,Balance\nCD one,22500'))
  const after = planAccountsImport(d, t2, detectColumns(t2.headers, ACCOUNT_FIELDS), 'update', {}).apply(d)
  assert.deepEqual(after.accounts.find((a) => a.name === 'CD one') && [after.accounts[0].balance, after.accounts[0].maturityDate, after.accounts[0].maturityValue], [22500, '2027-02-01', 23100])
  assert.equal(toISODate('2027-02-30'), ''); assert.equal(toISODate('Feb 1, 2027'), '2027-02-01')
})
