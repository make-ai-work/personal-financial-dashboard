// End-to-end check of the Portfolio tab and its link to Finance. Run:  npm run build && npm run test:e2e:portfolio
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { autoSignIn } from './signin.mjs'

const require = createRequire(import.meta.url) // playwright is provided globally (NODE_PATH), not a project dependency
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/portfolio-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'

const server = spawn('npx', ['vite', 'preview', '--port', '4178', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.route(/open-meteo\.com/, (r) => r.fulfill({ json: { current: { temperature_2m: 20, relative_humidity_2m: 50, weather_code: 1, wind_speed_10m: 5, us_aqi: 40 }, daily: { time: ['2026-11-16', '2026-11-17'], weather_code: [1, 1], temperature_2m_max: [22, 22], temperature_2m_min: [12, 12] } } })) // Home's weather: not under test here
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker }) // start signed in
const PER_USD = { USD: 1, INR: 84, GBP: 0.8, AUD: 1.5, CHF: 0.9 }
await ctx.route('**/api.frankfurter.dev/**', (r) => {
  const u = new URL(r.request().url())
  const base = u.searchParams.get('base')
  const symbols = u.searchParams.get('symbols').split(',')
  r.fulfill({ json: { base, date: '2026-10-31', rates: Object.fromEntries(symbols.map((s) => [s, PER_USD[s] / PER_USD[base]])) } })
})
const page = await ctx.newPage()
autoSignIn(page)
await page.clock.setFixedTime(new Date('2026-10-31T12:00:00'))
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const step = (s) => console.log('•', s)
const split = async (page, l, r) => { // the two columns are 70 : 30 of the width they share
  const a = await page.locator(l).first().boundingBox(), b = await page.locator(r).first().boundingBox()
  assert.ok(Math.abs(a.width / (a.width + b.width + 16) - 0.7) < 0.02 && b.x > a.x + a.width - 2, `70 : 30, got ${JSON.stringify([a.width, b.width])}`)
}

const dialog = () => page.getByRole('dialog')
const subtab = (name) => page.locator('.subtabs').getByRole('button', { name })
const topTab = (name) => page.getByRole('tab', { name })
const panelOf = (name) => page.locator('.panel').filter({ has: page.getByRole('button', { name: '+ Add holding' }) }).filter({ hasText: name })
const accept = () => page.once('dialog', (d) => d.accept())

async function addFinanceAsset(name, institution, balance, owner) {
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await dialog().getByLabel('Account name').fill(name)
  await dialog().getByLabel('Bank / holding company').fill(institution)
  await dialog().getByLabel(/Current balance/).fill(balance)
  await dialog().locator('.radios label', { hasText: new RegExp('^' + owner) }).click()
  await dialog().getByRole('button', { name: 'Save' }).click()
  await dialog().waitFor({ state: 'detached' })
}
async function addHolding(pfName, f, { type = 'ETF', cls = 'Equities', sector = '', geo = '' } = {}) {
  await panelOf(pfName).getByRole('button', { name: '+ Add holding' }).click()
  await dialog().getByLabel('Name', { exact: true }).fill(f.name)
  await dialog().getByLabel(/Ticker/).fill(f.ticker || '')
  await dialog().getByLabel(/^Type/).selectOption({ label: type })
  await dialog().getByLabel(/^Asset class/).selectOption({ label: cls })
  if (sector) await dialog().getByLabel(/Sector/).fill(sector)
  if (geo) await dialog().getByLabel(/Geography/).fill(geo)
  await dialog().getByLabel('Units', { exact: true }).fill(String(f.units))
  await dialog().getByLabel(/Price per unit/).fill(String(f.price))
  if (f.date) await dialog().getByLabel('Price date').fill(f.date)
  await dialog().getByRole('button', { name: 'Save holding' }).click()
  await dialog().waitFor({ state: 'detached' })
}
const financeRow = (name) => page.getByRole('row', { name: new RegExp(name) })

try {
  await page.goto('http://localhost:4178/')
  step('create the vault, then two Finance asset accounts with typed balances')
  await page.getByRole('button', { name: /Create a new vault file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await page.getByRole('tab', { name: /Assets/ }).click()
  await page.getByText('Update date', { exact: true }).waitFor()
  await subtab(/USA/).click()
  await addFinanceAsset('Brokerage', 'Schwab', '96000', 'Joint')
  await addFinanceAsset('401(k)', 'Fidelity', '184000', 'Mine')

  step('link a portfolio to the Brokerage account; nothing changes in Finance yet')
  await topTab(/Portfolio/).click()
  await page.getByText('Portfolio summary').waitFor()
  await subtab('+ Add portfolio').click()
  const opts = await dialog().getByLabel('Assets account').locator('option').allInnerTexts()
  assert.ok(opts.includes('Brokerage · Schwab — $ 96,000') && opts.includes('401(k) · Fidelity — $ 184,000') && opts.at(-1).includes('Create a new Finance account'))
  await dialog().getByLabel('Assets account').selectOption({ label: 'Brokerage · Schwab — $ 96,000' })
  await dialog().getByRole('button', { name: 'Create portfolio' }).click()
  await dialog().waitFor({ state: 'detached' })
  await page.getByText('linking to Finance: Brokerage · Schwab').waitFor()
  assert.ok(await page.getByRole('button', { name: 'Finish linking' }).isDisabled()) // no holdings yet

  step('enter holdings worth $91,000 (the gold ETF is missing), then reconcile with the DEFAULT choice')
  const P = 'Brokerage · Schwab'
  await addHolding(P, { name: 'Vanguard Total Stock Market ETF', ticker: 'VTI', units: 160, price: 250 }, { sector: 'Broad market', geo: 'US' })
  await addHolding(P, { name: 'Vanguard Total International ETF', ticker: 'VXUS', units: 300, price: 60 }, { sector: 'Broad market', geo: 'International' })
  await addHolding(P, { name: 'Apple', ticker: 'AAPL', units: 40, price: 225 }, { type: 'Stock', sector: 'Technology', geo: 'US' })
  await addHolding(P, { name: 'Microsoft', ticker: 'MSFT', units: 14, price: 500 }, { type: 'Stock', sector: 'Technology', geo: 'US' })
  await addHolding(P, { name: 'Vanguard Total Bond ETF', ticker: 'BND', units: 160, price: 75 }, { cls: 'Bonds', sector: 'Bonds', geo: 'US' })
  await addHolding(P, { name: 'iShares 0-3 Month Treasury ETF', ticker: 'SGOV', units: 50, price: 100 }, { cls: 'Cash equivalents', sector: 'Cash', geo: 'US' })
  const banner = page.getByRole('region', { name: 'Finish linking' })
  const bt = await banner.innerText()
  assert.match(bt, /Holdings total\s+\$ 91,000/)
  assert.match(bt, /Assets account says\s+\$ 96,000/)
  assert.match(bt, /\$ 5,000 unexplained/)
  assert.ok(await banner.getByRole('radio', { name: /Add the difference as an unallocated holding/ }).isChecked(), 'unallocated must be the default')
  await subtab(/USA/).click()
  await banner.getByRole('button', { name: 'Finish linking' }).click()
  await banner.waitFor({ state: 'detached' })
  const pfText = await panelOf(P).innerText()
  assert.match(pfText, /Unallocated \(difference when linked\)[\s\S]*\$ 5,000/)
  assert.match(pfText, /linked to Finance: Brokerage · Schwab/)

  step('Finance now follows the portfolio: balance unchanged, tag shown, mix derived from holdings, balance locked')
  await topTab(/Assets/).click()
  await subtab(/USA/).click()
  let row = await financeRow('Brokerage').innerText()
  assert.match(row, /from portfolio/)
  assert.match(row, /\$ 96,000/)
  assert.match(row, /Eq 81\.3 · Cash 5\.5 · Bonds 13\.2/) // unallocated is left out of the mix
  await financeRow('Brokerage').getByRole('button', { name: 'Edit' }).click()
  assert.ok(await dialog().getByLabel(/Current balance/).isDisabled())
  assert.match(await dialog().innerText(), /Comes from the linked portfolio/)
  assert.equal(await dialog().getByLabel('Cash equivalents').count(), 0) // mix inputs hidden
  await page.getByRole('button', { name: 'Cancel' }).click()

  step('second portfolio whose holdings EXCEED the typed balance: no unallocated option, balance rises')
  await topTab(/Portfolio/).click()
  await subtab('+ Add portfolio').click()
  await dialog().getByLabel('Assets account').selectOption({ label: '401(k) · Fidelity — $ 184,000' })
  await dialog().getByRole('button', { name: 'Create portfolio' }).click()
  await dialog().waitFor({ state: 'detached' })
  const K = '401(k) · Fidelity'
  await addHolding(K, { name: 'Fidelity 500 Index Fund', ticker: 'FXAIX', units: 500, price: 220 }, { type: 'Mutual fund', geo: 'US' })
  await addHolding(K, { name: 'Fidelity Intl Index Fund', ticker: 'FSPSX', units: 400, price: 85 }, { type: 'Mutual fund', geo: 'International' })
  await addHolding(K, { name: 'Fidelity US Bond Index Fund', ticker: 'FXNAX', units: 3200, price: 15.625 }, { type: 'Mutual fund', cls: 'Bonds', geo: 'US' })
  const b2 = page.getByRole('region', { name: 'Finish linking' })
  assert.match(await b2.innerText(), /\+ \$ 10,000 more in holdings/)
  assert.equal(await b2.getByRole('radio').count(), 0)
  await b2.getByRole('button', { name: 'Finish linking' }).click()
  await b2.waitFor({ state: 'detached' })
  await topTab(/Assets/).click(); await subtab(/USA/).click()
  assert.match(await financeRow('401\\(k\\)').innerText(), /\$ 194,000/)

  step('allocation by class and portfolio, concentration limit, price age')
  await topTab(/Portfolio/).click(); await subtab(/USA/).click()
  let leg = await page.locator('.leg').first().innerText()
  assert.match(leg, /Equities\s+75\.2%/); assert.match(leg, /Bonds\s+21\.4%/); assert.match(leg, /Cash equivalents\s+1\.7%/); assert.match(leg, /Unallocated\s+1\.7%/)
  await page.getByRole('group', { name: 'Allocation view' }).getByRole('button', { name: 'Portfolio' }).click()
  leg = await page.locator('.leg').first().innerText()
  assert.match(leg, /401\(k\) · Fidelity\s+66\.9%/); assert.match(leg, /Brokerage · Schwab\s+33\.1%/)
  assert.match(await page.locator('.okrow').first().innerText(), /No single stock is above your 10% limit/)
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByLabel('Single-stock limit').selectOption('7')
  await page.getByRole('tab', { name: /Portfolio/ }).click(); await subtab(/USA/).click()
  const conc = await page.locator('.warnrow').first().innerText()
  assert.match(conc, /Apple is 9\.4% of Brokerage · Schwab/); assert.match(conc, /Microsoft is 7\.3%/)

  step('rebalancing against targets, then a buy-only plan for new money')
  await page.getByLabel('Portfolio to rebalance').selectOption({ label: 'Brokerage · Schwab' })
  await page.getByRole('button', { name: 'Set targets' }).last().click() // the rebalancing panel is the last on the page
  await dialog().getByLabel(/Equities/).fill('70'); await dialog().getByLabel(/Bonds/).fill('20'); await dialog().getByLabel(/Cash/).fill('5'); await dialog().getByLabel(/Precious/).fill('50')
  await dialog().getByRole('button', { name: 'Save targets' }).click()
  assert.match(await dialog().innerText(), /Targets must total 100%/) // 145%
  await dialog().getByLabel(/Precious/).fill('5')
  await dialog().getByRole('button', { name: 'Save targets' }).click()
  await dialog().waitFor({ state: 'detached' })
  const rbPanel = page.locator('.panel').filter({ hasText: 'Targets are percentages of' })
  const rt = await rbPanel.innerText()
  assert.match(rt, /Equities\s+81\.3%[\s\S]*Sell \$ 10,300/) // 74,000 of 91,000 allocated; target 70% = 63,700
  assert.match(rt, /Bonds\s+13\.2%[\s\S]*Buy \$ 6,200/)
  assert.equal((rt.match(/off target/g) || []).length, 2) // equities and bonds; metals is exactly 5 pts away (not beyond)
  assert.match(rt, /Unallocated money \(\$ 5,000\) is left out/)
  await rbPanel.getByLabel('New money to invest').fill('5000')
  const plan = await rbPanel.locator('.buyonly').innerText()
  assert.match(plan, /Bonds: buy\s+\$ 3,000/); assert.match(plan, /Precious metals: buy\s+\$ 2,000/); assert.ok(!/Equities: buy/.test(plan))

  step('add the missing gold ETF with an old price, then clear the unallocated line: Finance returns to $96,000')
  await addHolding(P, { name: 'SPDR Gold Shares', ticker: 'GLD', units: 20, price: 250, date: '2026-08-19' }, { cls: 'Precious metals', sector: 'Commodities', geo: 'Global' })
  assert.match(await page.locator('.warnrow').filter({ hasText: 'Old prices' }).innerText(), /SPDR Gold Shares \(73 days\)/)
  await topTab(/Assets/).click(); await subtab(/USA/).click()
  assert.match(await financeRow('Brokerage').innerText(), /\$ 101,000/) // holdings 96,000 + unallocated 5,000
  await topTab(/Portfolio/).click(); await subtab(/USA/).click()
  accept()
  await panelOf(P).getByRole('row', { name: /Unallocated/ }).getByRole('button', { name: 'Delete' }).click()
  await topTab(/Assets/).click(); await subtab(/USA/).click()
  row = await financeRow('Brokerage').innerText()
  assert.match(row, /\$ 96,000/); assert.match(row, /Metals 5\.2/)

  step('bulk price update changes values, stamps the date, clears the stale flag, and Finance follows')
  await topTab(/Portfolio/).click(); await subtab(/USA/).click()
  await page.getByRole('button', { name: 'Update prices' }).click()
  await dialog().getByLabel('Prices as of').fill('2026-10-31')
  await dialog().getByLabel('New price for SPDR Gold Shares').fill('262.40')
  await dialog().getByRole('button', { name: 'Save prices' }).click()
  await dialog().waitFor({ state: 'detached' })
  assert.equal(await page.locator('.warnrow').filter({ hasText: 'Old prices' }).count(), 0)
  await topTab(/Assets/).click(); await subtab(/USA/).click()
  assert.match(await financeRow('Brokerage').innerText(), /\$ 96,248/) // + 20 x 12.40

  step('overview: totals, attention list')
  await topTab(/Portfolio/).click(); await subtab('Overview').click()
  await split(page, '.sp-l', '.sp-r')
  const ov = await page.locator('.subpage').innerText()
  assert.match(ov, /USA[\s\S]*2\s+\d+\s+\$ 290,248/)
  assert.match(ov, /Brokerage · Schwab is off target/)
  assert.match(ov, /Apple is 9\.4% of Brokerage · Schwab/)
  await page.screenshot({ path: `${OUT}/overview.png`, fullPage: true })

  step('navigation both ways between Portfolio and Finance')
  await subtab(/USA/).click()
  await panelOf(P).getByRole('button', { name: 'Open in Assets' }).click()
  await page.getByText('Assets').first().waitFor()
  await page.locator('.subtabs button.on', { hasText: 'USA' }).waitFor() // waits for the tab to switch
  await financeRow('Brokerage').getByRole('button', { name: 'Open portfolio' }).click()
  await page.getByText('linked to Finance: Brokerage · Schwab').waitFor()
  await page.screenshot({ path: `${OUT}/usa.png`, fullPage: true })

  step('lock / unlock keeps the link, holdings and targets')
  await page.getByRole('button', { name: 'Lock now' }).click()
  await page.getByPlaceholder('Passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Portfolio summary').waitFor() // locking resets you to the Overview
  await subtab(/USA/).click()
  await page.getByText('linked to Finance: Brokerage · Schwab').waitFor()
  await page.getByLabel('Portfolio to rebalance').selectOption({ label: 'Brokerage · Schwab' })
  assert.match(await page.locator('.panel').filter({ hasText: 'Targets are percentages of' }).innerText(), /70%/)

  step('Excel export includes portfolios and holdings')
  await page.getByRole('tab', { name: 'Settings' }).click()
  accept()
  const [xl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export…' }).click()])
  await xl.saveAs(`${OUT}/export.xlsx`)
  const wb = new (require('exceljs').Workbook)()
  await wb.xlsx.readFile(`${OUT}/export.xlsx`)
  assert.ok(JSON.stringify(wb.getWorksheet('Portfolios').getSheetValues()).includes('Brokerage · Schwab'))
  assert.ok(wb.getWorksheet('Holdings').rowCount >= 10)

  step('deleting a portfolio keeps its Finance account (and last balance); deleting the account removes the portfolio')
  await topTab(/Portfolio/).click(); await subtab(/USA/).click()
  accept()
  await panelOf(K).getByRole('button', { name: 'Delete portfolio' }).click()
  await topTab(/Assets/).click(); await subtab(/USA/).click()
  row = await financeRow('401\\(k\\)').innerText()
  assert.match(row, /\$ 194,000/); assert.ok(!/from portfolio/.test(row)) // plain account again, mix kept
  accept()
  await financeRow('Brokerage').getByRole('button', { name: 'Delete' }).click()
  await page.getByText('Nothing here yet').or(page.getByText('No assets')).first().waitFor().catch(() => {})
  await topTab(/Portfolio/).click(); await subtab(/USA/).click()
  await page.getByText(/No portfolios in .*USA yet/).waitFor()
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('PORTFOLIO E2E PASSED')
