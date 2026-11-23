// End-to-end check in real Chromium. Run:  npm run build && npm run test:e2e
// Forces the "download" save path (no File System Access API) so it can run headless,
// and mocks the FX API so the exchange rate is deterministic.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { autoSignIn } from './signin.mjs'

const require = createRequire(import.meta.url) // playwright is provided globally (NODE_PATH), not a project dependency
const { chromium } = require('playwright')

const OUT = process.env.E2E_OUT || '/tmp/finance-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'
const URL = 'http://localhost:4173/'

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.route(/open-meteo\.com/, (r) => r.fulfill({ json: { current: { temperature_2m: 20, relative_humidity_2m: 50, weather_code: 1, wind_speed_10m: 5, us_aqi: 40 }, daily: { time: ['2026-11-16', '2026-11-17'], weather_code: [1, 1], temperature_2m_max: [22, 22], temperature_2m_min: [12, 12] } } })) // Home's weather: not under test here
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker }) // start signed in
await ctx.route('**/api.frankfurter.dev/**', (r) => r.fulfill({ json: { base: 'USD', date: '2026-10-27', rates: { INR: 84 } } }))
const page = await ctx.newPage()
autoSignIn(page)
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00')) // 'today' must not drift
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const step = (s) => console.log('•', s)
const addAccount = async (btn, f, owner) => {
  await page.getByRole('button', { name: btn }).click()
  const m = page.getByRole('dialog')
  for (const [label, v] of Object.entries(f)) await m.getByLabel(label).fill(v)
  if (owner) await m.locator('.radios label', { hasText: new RegExp('^' + owner.replace(/[+]/g, '\\+')) }).click()
  await m.getByRole('button', { name: 'Save' }).click()
  await m.waitFor({ state: 'detached' })
}

try {
  await page.goto(URL)

  step('create encrypted vault')
  await page.getByRole('button', { name: /Create a new vault file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await dl.saveAs(`${OUT}/WealthTracker.wvault`)
  await page.getByRole('tab', { name: /Assets/ }).click()
  await page.getByText('Update date', { exact: true }).waitFor()

  step('add accounts and policy in USA')
  await page.getByRole('button', { name: /USA/ }).first().click()
  await addAccount('+ Add asset', { 'Account name': 'Checking', 'Account number': '000123456821', 'Bank / holding company': 'Chase', 'Current balance ($)': '8200' })
  await addAccount('+ Add asset', { 'Account name': 'Brokerage', 'Account number': 'X55203718', 'Bank / holding company': 'Schwab', 'Current balance ($)': '96000' }, 'Me + Others')
  await addAccount('+ Add asset', { 'Account name': 'CD', 'Account number': '7710334450', 'Bank / holding company': 'Ally', 'Current balance ($)': '22000', 'Deposit maturity date (optional)': '2027-02-01', 'Value at maturity (optional, $)': '23100' }, 'Parent')
  await addAccount('+ Add liability', { 'Account name': 'Mortgage', 'Account number': '3300918823', Lender: 'Wells Fargo', 'Current balance ($)': '78000' }, 'Me + Others')
  await page.getByRole('button', { name: '+ Add policy' }).click()
  const pm = page.getByRole('dialog')
  for (const [l, v] of Object.entries({ 'Policy name': 'Term life', 'Policy number': 'POL-100234', 'Policy company': 'AIG', 'Death benefit ($)': '750000', 'Premium paid so far (optional, $)': '12400' })) await pm.getByLabel(l).fill(v)
  await pm.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('row', { name: /Term life/ }).getByText('$ 12,400').waitFor() // premium paid shows in the policy table

  step('masking, totals, validation')
  assert.ok(await page.getByText('•••• 6821').isVisible())
  assert.ok(!(await page.locator('body').innerText()).includes('000123456821'))
  await page.getByRole('button', { name: 'Show account numbers' }).click()
  assert.ok(await page.getByText('000123456821').isVisible())
  await page.getByRole('button', { name: 'Hide account numbers' }).click()
  assert.match(await page.locator('.kpis').innerText(), /\$ 48,200/) // net = 8200+96000+22000-78000
  await page.getByRole('button', { name: '+ Add asset' }).click()
  assert.equal(await page.getByRole('dialog').getByLabel('Equities').count(), 0, 'the asset mix is gone from accounts')
  await page.getByRole('button', { name: 'Cancel' }).click()

  step('save two dated updates (Aug, then Oct) so the chart has a carried-forward month')
  await page.locator('.upd input[type=date]').fill('2026-08-10')
  await page.getByRole('button', { name: 'Save update' }).click()
  assert.ok(await page.locator('.banner').count() === 0)
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await page.getByLabel('Current balance ($)').fill('9200')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  assert.ok(await page.locator('.banner').isVisible()) // unsaved balance change detected
  await page.locator('.upd input[type=date]').fill('2026-10-27')
  await page.getByRole('button', { name: 'Save update' }).click()
  assert.equal(await page.locator('.chart circle').count(), 3) // Aug, Sep (carried), Oct
  assert.equal(await page.locator('.chart circle[fill="var(--surface)"]').count(), 1)
  await page.screenshot({ path: `${OUT}/usa.png`, fullPage: true })

  step('owner filter')
  await page.locator('.filterbar .seg').getByRole('button', { name: 'Me + Others' }).click()
  assert.match(await page.locator('.kpis').innerText(), /\$ 18,000/) // 96000 - 78000
  await page.locator('.filterbar .seg').getByRole('button', { name: 'All' }).click()

  step('rates bar on the Finance page, and the combined total (now on Home) uses them')
  await page.getByText('$1 = ₹ 84').waitFor()
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByTestId('networth').getByText(/\$\s?49,200/).waitFor() // Checking edited to 9,200 -> net 49,200
  await page.getByRole('tab', { name: /Assets/ }).click()

  step('layout: accounts on the left, chart and Performance on the right; no Summary tab; sections fold and the choice is remembered')
  assert.equal(await page.locator('.subtabs button', { hasText: 'Summary' }).count(), 0)
  const lbox = await page.locator('.fin-left').boundingBox(), rbox = await page.locator('.fin-right').boundingBox()
  assert.ok(Math.abs(lbox.width / (lbox.width + rbox.width + 16) - 0.7) < 0.02, `70 : 30: ${JSON.stringify([lbox.width, rbox.width])}`)
  assert.ok(rbox.x > lbox.x + lbox.width - 2 && lbox.x < 40, `two columns across the whole screen: ${JSON.stringify([lbox, rbox])}`)
  await page.getByRole('heading', { name: 'Performance' }).or(page.getByText('Performance').first()).waitFor()
  const assets = page.locator('.ctoggle', { hasText: 'Assets' })
  assert.equal(await assets.getAttribute('aria-expanded'), 'true')
  assert.ok(await page.locator('table.t-a').isVisible())
  await assets.click()
  assert.equal(await assets.getAttribute('aria-expanded'), 'false'); assert.equal(await page.locator('table.t-a').count(), 0)
  assert.ok(await page.getByRole('button', { name: '+ Add asset' }).isVisible(), 'the Add button stays')
  await page.getByRole('tab', { name: 'Home' }).click(); await page.getByRole('tab', { name: /Assets/ }).click()
  assert.equal(await page.locator('.ctoggle', { hasText: 'Assets' }).getAttribute('aria-expanded'), 'false', 'remembered')
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('ui.collapsed'))).assets, true)
  await page.locator('.ctoggle', { hasText: 'Insurance' }).click(); await page.locator('.ctoggle', { hasText: 'Insurance' }).click() // fold and unfold
  await page.locator('.ctoggle', { hasText: 'Assets' }).click()
  assert.ok(await page.locator('table.t-a').isVisible())
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  process.exitCode = 1
}
await page.screenshot({ path: `${OUT}/summary.png`, fullPage: true })
if (process.exitCode) { await browser.close(); server.kill(); process.exit(1) }

step('lock / wrong / right passphrase')
await page.getByRole('tab', { name: 'Settings' }).click()
await page.getByRole('button', { name: 'Lock now' }).click()
await page.getByPlaceholder('Passphrase').fill('wrong passphrase here')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByText('Wrong passphrase or damaged file.').waitFor()
await page.getByPlaceholder('Passphrase').fill(PASS)
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByRole('tab', { name: /Assets/ }).click()
await page.getByText('Update date', { exact: true }).waitFor()

step('recovery key: made once, then a forgotten passphrase is reset with it')
await page.getByRole('tab', { name: 'Settings' }).click()
await page.getByRole('button', { name: 'Make a recovery key' }).click()
const rk = (await page.getByTestId('recovery-key').innerText()).trim()
assert.match(rk, /^([A-Z2-9]{4}-){6}[A-Z2-9]{2}$/)
await page.getByRole('button', { name: 'I have saved it' }).click()
assert.equal(await page.getByTestId('recovery-key').count(), 0, 'shown only once')
await page.getByRole('button', { name: 'Lock now' }).click()
await page.getByTestId('forgot-passphrase').click()
await page.getByLabel('Recovery key').fill('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA')
await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
await page.getByLabel('Confirm passphrase').fill(PASS)
await page.getByLabel(/I understand and have saved/).check()
await page.getByRole('button', { name: 'Set new passphrase and unlock' }).click()
await page.getByText('That recovery key does not match this vault.').waitFor()
await page.getByLabel('Recovery key').fill(rk.toLowerCase())
await page.getByRole('button', { name: 'Set new passphrase and unlock' }).click()
await page.getByRole('tab', { name: /Assets/ }).click()
await page.getByText('Update date', { exact: true }).waitFor()

step('tax residency tab: date ranges, one bar per country, status changes marked, colours')
const taxTab = page.getByRole('tab', { name: /Tax residency/ })
await taxTab.click()
const addPeriod = async (country, status, from, to) => {
  await page.getByTestId(`tr-${country}`).getByRole('button', { name: '+ Add period' }).click()
  const m = page.getByRole('dialog')
  await m.getByLabel('Status').selectOption(status); await m.getByLabel('From date').fill(from)
  if (to) { await m.getByLabel('Still current').uncheck(); await m.getByLabel('To date').fill(to) }
  await m.getByRole('button', { name: 'Save' }).click()
}
await addPeriod('us', 'nonresident', '2018-01-01', '2022-12-31'); await addPeriod('us', 'resident', '2023-01-01', '')
await addPeriod('in', 'nri', '2018-04-01', '2023-03-31'); await addPeriod('in', 'rnor', '2023-04-01', '2025-03-31'); await addPeriod('in', 'ror', '2025-04-01', '')
await page.screenshot({ path: `${OUT}/taxres.png`, fullPage: true })
assert.equal(await page.getByTestId('tr-bar-us').locator('.tr-seg').count(), 2); assert.equal(await page.getByTestId('tr-bar-in').locator('.tr-seg').count(), 3)
const color = (c, st) => page.getByTestId(`tr-bar-${c}`).locator(`[data-status="${st}"]`).evaluate((e) => getComputedStyle(e).backgroundColor)
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` }
const root = (v) => page.evaluate((x) => getComputedStyle(document.documentElement).getPropertyValue(x).trim(), v)
assert.equal(await color('us', 'resident'), rgb(await root('--orange'))); assert.equal(await color('in', 'ror'), rgb(await root('--orange')))
assert.equal(await color('us', 'nonresident'), rgb(await root('--green'))); assert.equal(await color('in', 'rnor'), rgb(await root('--green')))
assert.equal(await color('in', 'nri'), rgb(await root('--lgreen')))
assert.notEqual(await color('in', 'nri'), await color('in', 'rnor'), 'NRI is a lighter green than RNOR')
assert.equal(await page.getByTestId('tr-bar-in').locator('.tr-chg').count(), 3, 'a marker at each status change')
const inChanges = await page.getByTestId('tr-changes-in').innerText()
assert.match(inChanges, /1 Apr 2023[\s\S]*NRI → RNOR/); assert.match(inChanges, /1 Apr 2025[\s\S]*RNOR → ROR/); assert.match(inChanges, /FY 2023-24/) // India's tax year runs April to March
assert.match(await page.getByTestId('tr-changes-us').innerText(), /1 Jan 2023[\s\S]*Nonresident → Resident/)
assert.match(await page.getByTestId('tr-now-us').innerText(), /Resident/); assert.match(await page.getByTestId('tr-now-in').innerText(), /ROR/)
await page.getByTestId('tr-us').getByRole('button', { name: '+ Add period' }).click() // an overlapping period is refused
await page.getByRole('dialog').getByLabel('From date').fill('2022-06-01'); await page.getByRole('dialog').getByLabel('Still current').uncheck(); await page.getByRole('dialog').getByLabel('To date').fill('2023-06-01')
await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
await page.getByRole('dialog').getByText(/overlaps another period/).waitFor()
await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
step('tax residency guided check: questions, live results, the rule and source for each year, and applying the results as date ranges')
await page.getByTestId('open-wizard').click()
const wiz = page.getByTestId('residency-wizard')
assert.match(await wiz.innerText(), /guidance, not tax advice/i)
await wiz.getByRole('link', { name: /Determining an individual/ }).waitFor()
assert.equal(await wiz.getByRole('link', { name: /Residential status/ }).first().getAttribute('href'), 'https://wm.incometaxindia.gov.in/w/residential-status')
await page.getByTestId('wiz-next').click()
await page.getByLabel('First year').selectOption('2024')
await page.getByTestId('wiz-next').click() // optional travel dates
await page.getByTestId('travel-step').waitFor()
await page.getByTestId('add-trip').click()
await page.getByLabel('Trip 1 left the US').fill('2025-06-01'); await page.getByLabel('Trip 1 came back').fill('2025-06-21'); await page.getByLabel('Trip 1 was to India').check()
await page.getByTestId('travel-us-2025').getByText('346').waitFor() // 365 - 19 days away (the crossing days still count in the US)
assert.equal(await page.getByTestId('travel-in-2025').innerText(), '21') // 1 to 21 June inclusive
assert.equal(await page.getByTestId('travel-us-2024').innerText(), '366')
await page.getByTestId('add-trip').click() // a trip with no dates yet counts for nothing and is not lost
await page.getByLabel('Trip 2 left the US').waitFor()
assert.equal(await page.getByTestId('travel-us-2025').innerText(), '346')
await page.getByLabel('Remove trip 2').click()
await page.screenshot({ path: `${OUT}/wizard-travel.png` })
await page.getByTestId('travel-fill').click()
await page.getByTestId('travel-done').waitFor()
await page.getByTestId('wiz-next').click() // USA
assert.equal(await page.getByLabel('US days 2025').inputValue(), '346', 'the days worked out from the dates are filled in, and can be changed')
for (const [y, d] of [[2024, 40], [2025, 120], [2026, 160]]) await page.getByLabel(`US days ${y}`).fill(String(d))
await page.getByTestId('us-res-2025').getByText('Nonresident').waitFor() // 120 + 40/3 = 133 (IRS example style): under 183
await page.getByTestId('us-res-2026').getByText('Resident', { exact: true }).waitFor() // 160 + 120/3 + 40/6 = 206.7
await page.screenshot({ path: `${OUT}/wizard-us.png` })
await page.getByTestId('wiz-next').click() // India
assert.equal(await page.getByLabel(/Left for employment/).count(), 0, 'citizen questions are hidden until you say you are a citizen')
for (const [y, d] of [[2024, 10], [2025, 10], [2026, 200]]) await page.getByLabel(`India days ${y}`).fill(String(d))
await page.getByTestId('in-res-2025').getByText('NRI').waitFor()
await page.getByTestId('in-res-2026').getByText('RNOR').waitFor() // resident, but non-resident in 9 of the previous 10 years
await page.getByTestId('wiz-next').click() // plan ahead (optional)
await page.getByTestId('plan-step').waitFor()
await page.getByLabel('Planned US departure date').fill('2027-06-30'); await page.getByLabel('Visit days in the US after leaving').fill('30'); await page.getByLabel('Visit days in India before leaving').fill('20')
await page.getByTestId('plan-us-2027').getByText('Resident', { exact: true }).waitFor() // most of 2027 in the US, plus the earlier years
await page.getByTestId('plan-us-2028').getByText('Nonresident').waitFor() // 30 visit days: under 31
const planned = await page.getByTestId('plan-summary').innerText()
assert.match(planned, /nonresident from 2028/); assert.match(planned, /ROR from FY 2029-30 \(was RNOR\)/)
await page.screenshot({ path: `${OUT}/wizard-plan.png` })
await page.getByTestId('wiz-next').click() // results
await page.getByTestId('wiz-plan').getByText(/Planned: leaving the US for good on 2027-06-30/).waitFor()
assert.ok(await page.getByTestId('wiz-apply').isVisible(), 'Save these Dates is in the footer')
assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Save these Dates' }).count(), 1)
const [bs, bc] = [await page.getByTestId('wiz-apply').boundingBox(), await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().boundingBox()]
assert.ok(bs.x > bc.x && Math.abs(bs.y - bc.y) < 6, 'Save these Dates sits right next to Close')
await page.getByTestId('wiz-in').locator('summary', { hasText: 'FY 2026-27' }).click()
assert.match(await page.getByTestId('wiz-in').innerText(), /Resident but not ordinarily resident[\s\S]*non-resident in 10 of the previous 10/)
assert.equal(await page.getByTestId('wiz-in').getByRole('link', { name: /Residential status/ }).first().getAttribute('href'), 'https://wm.incometaxindia.gov.in/w/residential-status')
await page.screenshot({ path: `${OUT}/wizard-results.png` })
await page.getByTestId('wiz-apply').click()
await page.getByTestId('wiz-applied').waitFor()
await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click()
assert.match(await page.getByTestId('tr-now-us').innerText(), /Resident/); assert.match(await page.getByTestId('tr-now-in').innerText(), /RNOR/)
assert.match(await page.getByTestId('tr-changes-us').innerText(), /1 Jan 2026[\s\S]*Nonresident → Resident/)
assert.match(await page.getByTestId('tr-changes-us').innerText(), /1 Jan 2028[\s\S]*Resident → Nonresident/) // the planned departure was saved as dates
assert.match(await page.getByTestId('tr-changes-in').innerText(), /FY 2029-30[\s\S]*RNOR → ROR/)
{ // dates on the left, the picture on the right; no words inside the bars
  await page.screenshot({ path: `${OUT}/taxres-layout.png`, fullPage: true })
  const [l, r] = [await page.getByTestId('tr-us').boundingBox(), await page.getByTestId('tr-timeline').boundingBox()]
  assert.ok(l.x + l.width <= r.x + 2, 'dates are left of the graph')
  for (const c of ['us', 'in']) for (const t of await page.getByTestId(`tr-bar-${c}`).locator('.tr-seg').allInnerTexts()) assert.equal(t.trim(), '', 'no text inside the bars')
  assert.equal(await page.getByTestId('tr-timeline').locator('.tr-future').count(), 2, 'the future is hatched on both bars')
}
await page.getByRole('tab', { name: /Assets/ }).click()

step('saved file holds no plaintext, then reopen it after a reload')
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-btn').click()])
await dl2?.saveAs(`${OUT}/WealthTracker.wvault`)
const raw = readFileSync(`${OUT}/WealthTracker.wvault`).toString('latin1')
for (const s of ['000123456821', 'Checking', 'Chase', 'POL-100234']) assert.ok(!raw.includes(s), `plaintext leaked: ${s}`)
await page.reload()
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Open an existing vault file/ }).click()])
await fc.setFiles(`${OUT}/WealthTracker.wvault`)
await page.getByPlaceholder('Passphrase').fill(PASS)
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByRole('tab', { name: /Assets/ }).click() // every unlock lands on Home
await page.getByText('Update date', { exact: true }).waitFor()
await page.getByRole('button', { name: /USA/ }).first().click()
assert.ok(await page.getByText('Brokerage').isVisible())

step('excel export is a readable flat workbook; import restores it')
await page.getByRole('tab', { name: 'Settings' }).click()
page.once('dialog', (d) => d.accept())
const [xl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export…' }).click()])
await xl.saveAs(`${OUT}/export.xlsx`)
const ExcelJS = require('exceljs')
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(`${OUT}/export.xlsx`)
assert.deepEqual(wb.worksheets.map((w) => w.name), ['Items', 'Insurance', 'Balances', 'Rates', 'Property', 'PropertyValues', 'Loans', 'LoanUpdates', 'Portfolios', 'Holdings', 'TaxResidency', 'TaxResidencyDays', 'TaxResidencyTravel', 'Settings'])
assert.ok(JSON.stringify(wb.getWorksheet('Items').getSheetValues()).includes('000123456821'))
await page.screenshot({ path: `${OUT}/settings.png`, fullPage: true })

await page.getByRole('button', { name: 'Change file' }).click()
const [xc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Import from an Excel file/ }).click()])
await xc.setFiles(`${OUT}/export.xlsx`)
await page.getByText(/Imported 4 items, 1 policies and 8 balances/).waitFor()

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
assert.equal(errors.length, 0)
step('Logout: saves (the encrypted file is downloaded in this browser), locks and returns to sign-in')
{
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS); await page.getByLabel('Confirm passphrase').fill(PASS); await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()]) // the imported data is now a vault again
  await page.getByTestId('logout-btn').waitFor()
  const [dlOut] = await Promise.all([page.waitForEvent('download'), page.getByTestId('logout-btn').click()])
  assert.match(dlOut.suggestedFilename(), /\.wvault$/)
  await page.getByTestId('logout-btn').waitFor({ state: 'detached' })
  assert.equal(await page.getByTestId('save-btn').count(), 0)
}
await browser.close()
server.kill()
console.log('E2E PASSED')
