// End-to-end check of the Property tab. Run:  npm run build && npm run test:e2e:property
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { autoSignIn } from './signin.mjs'

const require = createRequire(import.meta.url) // playwright is provided globally (NODE_PATH), not a project dependency
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/property-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'

const server = spawn('npx', ['vite', 'preview', '--port', '4177', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.route(/open-meteo\.com/, (r) => r.fulfill({ json: { current: { temperature_2m: 20, relative_humidity_2m: 50, weather_code: 1, wind_speed_10m: 5, us_aqi: 40 }, daily: { time: ['2026-11-16', '2026-11-17'], weather_code: [1, 1], temperature_2m_max: [22, 22], temperature_2m_min: [12, 12] } } })) // Home's weather: not under test here
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; localStorage.setItem('google.setupSkipped', '1') }) // start signed in
const PER_USD = { USD: 1, INR: 84, GBP: 0.8, AUD: 1.5, CHF: 0.9 }
await ctx.route('**/api.frankfurter.dev/**', (r) => {
  const u = new URL(r.request().url())
  const base = u.searchParams.get('base')
  const symbols = u.searchParams.get('symbols').split(',')
  r.fulfill({ json: { base, date: '2026-10-27', rates: Object.fromEntries(symbols.map((s) => [s, PER_USD[s] / PER_USD[base]])) } })
})
const page = await ctx.newPage()
autoSignIn(page)
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'))
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
const fill = async (f) => { for (const [l, v] of Object.entries(f)) await dialog().getByLabel(l).first().fill(v) }
const save = async (name) => { await dialog().getByRole('button', { name }).click(); await dialog().waitFor({ state: 'detached' }) }
const kpis = () => page.locator('.kpis').first().innerText()

async function addValuation(date, value, source) {
  await page.getByRole('button', { name: '+ Add valuation' }).click()
  await dialog().getByLabel('Date', { exact: true }).fill(date)
  await dialog().getByLabel(/^Value/).fill(value)
  await dialog().getByLabel('Source').selectOption({ label: source })
  await save('Save valuation')
}
async function recordUpdate(date, balance) {
  await page.getByRole('button', { name: '+ Record update' }).first().click()
  await dialog().getByLabel('Date', { exact: true }).fill(date)
  await dialog().getByLabel(/Balance after/).fill(balance)
  await save('Save update')
}

try {
  await page.goto('http://localhost:4177/')
  await page.getByRole('tab', { name: /Property/ }).click()
  step('property tab asks for the vault, then creates it')
  await page.getByRole('button', { name: /Create a new vault file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await page.getByText('Property summary').waitFor()
  assert.equal(await page.locator('.subtabs button').count(), 4) // Overview, USA, India, + Add property

  step('add a US property (validation first), then its valuations')
  await page.getByRole('button', { name: '+ Add property' }).click()
  await dialog().getByRole('button', { name: 'Save property' }).click()
  assert.match(await dialog().innerText(), /Name is required/)
  await fill({ Name: 'Maple Street home', Address: '14 Maple St, Austin TX 78701', 'Purchase date': '2019-06-03', 'Purchase price': '320000', 'Property tax / year': '7200', 'Next property tax due': '2026-12-15' })
  await dialog().locator('.radios label', { hasText: /^Joint/ }).click()
  await save('Save property')
  await page.getByText('Maple Street home').first().waitFor()
  await page.getByRole('button', { name: '+ Add valuation' }).click()
  await dialog().getByRole('button', { name: 'Save valuation' }).click()
  assert.match(await dialog().innerText(), /greater than 0/)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await addValuation('2025-10-20', '392000', 'Appraisal')
  await addValuation('2026-04-08', '402000', 'Zillow Zestimate')
  await addValuation('2026-10-12', '410000', 'Zillow Zestimate')

  step('Zillow link opens in a new tab with the address and no opener access')
  const link = page.getByRole('link', { name: /Open on Zillow/ })
  assert.match(await link.getAttribute('href'), /^https:\/\/www\.zillow\.com\/homes\/14%20Maple%20St%2C%20Austin%20TX%2078701_rb\/$/)
  assert.equal(await link.getAttribute('target'), '_blank')
  assert.match(await link.getAttribute('rel'), /noopener/)

  step('mortgage: add the loan and record three monthly updates by hand')
  await page.getByRole('button', { name: '+ Add mortgage' }).click()
  await fill({ Lender: 'Wells Fargo', 'Loan number': '3300918823', 'Original loan': '256000', 'Start date': '2019-06-03', 'Term (years)': '30', 'Interest rate': '3.25', 'Monthly payment': '1820', 'of which escrow': '640', 'Payment day': '1' })
  await save('Save loan')
  await recordUpdate('2026-08-01', '219458')
  await recordUpdate('2026-09-01', '218930')
  await recordUpdate('2026-10-01', '218400')

  step('property page figures')
  const k = await kpis()
  for (const t of ['$ 410,000', '$ 218,400', '$ 191,600', 'LTV 53%', '$ 1,820']) assert.ok(k.includes(t), `missing ${t} in ${k}`)
  const pageText = await page.locator('.subpage').innerText()
  assert.match(pageText, /\+ \$ 18,000 \(4\.6%\)/) // vs the 20 Oct 2025 appraisal
  assert.match(pageText, /\+ \$ 90,000 \(28%\)/) // since purchase
  assert.match(pageText, /Jun 2049/)
  assert.match(pageText, /recorded 1 Oct 2026/)
  assert.match(pageText, /•••• 8823/) // loan number masked
  assert.ok(!pageText.includes('3300918823'))
  await page.getByRole('button', { name: 'Show loan numbers' }).click()
  assert.ok((await page.locator('.subpage').innerText()).includes('3300918823'))
  await page.screenshot({ path: `${OUT}/property-page.png`, fullPage: true })

  step('India property with an estimated (unrecorded) mortgage balance')
  await page.getByRole('button', { name: '+ Add property' }).click()
  await dialog().getByLabel('Country').selectOption('in')
  await fill({ Name: 'Pune apartment', 'Purchase date': '2024-10-27', 'Purchase price': '6000000' })
  await dialog().locator('.radios label', { hasText: /^Mine/ }).click()
  await save('Save property')
  await page.getByRole('button', { name: '+ Add mortgage' }).click()
  await fill({ Lender: 'SBI', 'Original loan': '2400000', 'Start date': '2024-10-27', 'Term (years)': '10', 'Interest rate': '0' })
  await save('Save loan')
  assert.match(await page.locator('.subpage').innerText(), /estimated from the loan schedule/)
  assert.ok((await kpis()).includes('₹ 19,20,000')) // 24 of 120 payments done on an interest-free 10-year loan

  step('overview: totals in both currencies through the live rate, reminders')
  await subtab('Overview').click()
  const sum = await page.locator('.tblw').first().innerText()
  assert.match(sum, /Total in USD[\s\S]*\$ 481,429[\s\S]*\$ 241,257[\s\S]*\$ 240,171/) // 410000 + 6000000/84 ...
  assert.ok(!/Total in INR/.test(sum), 'totals are in the first currency only')
  await split(page, '.sp-l', '.sp-r')
  assert.match(await page.locator('.fx').innerText(), /1 USD = ₹ 84/)
  const coming = await page.locator('.panel', { hasText: 'Coming up' }).innerText()
  assert.match(coming, /Maple Street home · Mortgage payment[\s\S]*due in 5 days/)
  assert.match(coming, /Property tax[\s\S]*due 15 Dec 2026/)
  assert.ok(!/Pune apartment · Mortgage/.test(coming)) // no payment day set, so no reminder

  step('owner filter')
  await page.locator('.filterbar .seg').getByRole('button', { name: 'Joint' }).click()
  const joint = await page.locator('.tblw').first().innerText()
  assert.match(joint, /USA[\s\S]*\$ 410,000/)
  assert.match(joint, /India[\s\S]*₹ 0/)
  await page.locator('.filterbar .seg').getByRole('button', { name: 'All' }).click()

  step('country tab: totals and the equity chart (dots only for real months on long histories)')
  await subtab(/India/).click()
  assert.ok((await kpis()).includes('₹ 60,00,000'))
  assert.ok(await page.locator('.chart circle').count() <= 2) // 25 months, only the purchase month is real

  step('deleting a valuation and a mortgage update changes the figures')
  await subtab(/USA/).click()
  await page.getByText('Maple Street home').first().click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('row', { name: /12 Oct 2026/ }).getByRole('button', { name: 'Delete' }).click()
  await page.waitForFunction(() => document.querySelector('.kpis').innerText.includes('$ 402,000'))
  page.once('dialog', (d) => d.accept())
  await page.getByRole('row', { name: /1 Oct 2026.*218,400/ }).getByRole('button', { name: 'Delete' }).click()
  await page.waitForFunction(() => document.querySelector('.kpis').innerText.includes('$ 218,930'))
  assert.match(await page.locator('.subpage').innerText(), /recorded 1 Sep/)

  step('the update dialog can chain into editing the loan')
  await page.getByRole('button', { name: '+ Record update' }).first().click()
  await dialog().getByLabel(/Balance after/).fill('218400')
  await dialog().getByLabel('Date', { exact: true }).fill('2026-10-01')
  await dialog().getByRole('checkbox').check()
  await dialog().getByRole('button', { name: 'Save update' }).click()
  await dialog().getByLabel('Lender').waitFor() // loan editor opened next
  await page.getByRole('button', { name: 'Cancel' }).click()

  step('property countries are independent of Finance, and hiding never deletes')
  await page.getByRole('tab', { name: 'Settings' }).click()
  const pset = page.locator('#set-property'), fset = page.locator('#set-countries')
  await pset.getByRole('checkbox', { name: 'Show India' }).click()
  assert.match(await pset.locator('.warn').first().innerText(), /will hide 1 property\. Nothing is deleted/)
  await pset.getByRole('button', { name: 'Hide India' }).click()
  await pset.getByRole('checkbox', { name: 'Show Australia' }).check()
  assert.ok(await fset.getByRole('checkbox', { name: 'Show India' }).isChecked()) // the Finance list is untouched
  assert.ok(!(await fset.getByRole('checkbox', { name: 'Show Australia' }).isChecked()))
  await page.getByRole('tab', { name: /Property/ }).click()
  assert.equal(await page.locator('.subtabs button', { hasText: 'India' }).count(), 0)
  await page.getByRole('tab', { name: 'Settings' }).click()
  await pset.getByRole('checkbox', { name: 'Show India' }).click() // ticking again brings it back
  await page.getByRole('tab', { name: /Property/ }).click(); await subtab(/India/).click()
  assert.ok(await page.getByText('Pune apartment').first().isVisible())

  step('lock / unlock keeps everything, and Excel export includes property data')
  await page.getByRole('button', { name: 'Lock now' }).click()
  await page.getByPlaceholder('Passphrase').fill('nope nope nope')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Wrong passphrase or damaged file.').waitFor()
  await page.getByPlaceholder('Passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await subtab(/USA/).click()
  assert.ok(await page.getByText('Maple Street home').first().isVisible())
  await page.getByRole('tab', { name: 'Settings' }).click()
  page.once('dialog', (d) => d.accept())
  const [xl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export…' }).click()])
  await xl.saveAs(`${OUT}/export.xlsx`)
  const wb = new (require('exceljs').Workbook)()
  await wb.xlsx.readFile(`${OUT}/export.xlsx`)
  assert.ok(JSON.stringify(wb.getWorksheet('Property').getSheetValues()).includes('Maple Street home'))
  assert.ok(JSON.stringify(wb.getWorksheet('Loans').getSheetValues()).includes('Wells Fargo'))
  assert.ok(wb.getWorksheet('LoanUpdates').rowCount >= 3)

  step('deleting a property removes its history and loans')
  await page.getByRole('tab', { name: /Property/ }).click()
  await subtab(/USA/).click()
  await page.getByText('Maple Street home').first().click()
  page.once('dialog', (d) => d.accept())
  await page.locator('.panel').first().getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByText('No properties here yet.').waitFor()
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('PROPERTY E2E PASSED')
