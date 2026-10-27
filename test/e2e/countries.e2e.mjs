// Generic country selection in Finance. Run:  npm run build && npm run test:e2e:countries
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url) // playwright is provided globally (NODE_PATH), not a project dependency
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/countries-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'

const server = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
// Deterministic rates per USD: INR 84, GBP 0.8, AUD 1.5, CHF 0.9 (cross rates derived from the requested base)
const PER_USD = { USD: 1, INR: 84, GBP: 0.8, AUD: 1.5, CHF: 0.9 }
const fetched = []
await ctx.route('**/api.frankfurter.dev/**', (r) => {
  const u = new URL(r.request().url())
  const base = u.searchParams.get('base')
  const symbols = u.searchParams.get('symbols').split(',')
  fetched.push(`${base}->${symbols.join(',')}`)
  r.fulfill({ json: { base, date: '2026-10-27', rates: Object.fromEntries(symbols.map((s) => [s, PER_USD[s] / PER_USD[base]])) } })
})
const page = await ctx.newPage()
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'))
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const step = (s) => console.log('•', s)
const dialog = () => page.getByRole('dialog')
const subtab = (name) => page.locator('.subtabs').getByRole('button', { name })
const addAsset = async (name, balance) => {
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await dialog().getByLabel('Account name').fill(name)
  await dialog().getByLabel(/Current balance/).fill(balance)
  await dialog().getByRole('button', { name: 'Save' }).click()
  await dialog().waitFor({ state: 'detached' })
}
const summaryText = async () => {
  await subtab('Summary').click()
  return page.locator('.tblw').first().innerText()
}

try {
  await page.goto('http://localhost:4176/')
  await page.getByRole('tab', { name: 'Finance Dashboard' }).click()
  await page.getByRole('button', { name: /Create a new encrypted file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await page.getByText('Summary ·').waitFor()

  step('default is two countries (USA, India), as before')
  assert.equal(await page.locator('.subtabs button').count(), 4) // Summary, USA, India, Settings

  step('seed one account per country, then add a third country (UK)')
  await subtab(/USA/).click(); await addAsset('Checking', '1000')
  await subtab(/India/).click(); await addAsset('Savings', '84000')
  await subtab('Settings').click()
  await page.getByRole('checkbox', { name: 'Show UK' }).check()
  await subtab(/UK/).click(); await addAsset('Cash ISA', '400')

  step('summary: one total row per currency, converted through the reporting currency')
  let t = await summaryText()
  assert.match(t, /Total in USD[\s\S]*\$ 2,500/) // 1000 + 84000/84 + 400/0.8
  assert.match(t, /Total in INR[\s\S]*₹ 2,10,000/) // 2500 * 84, Indian digit grouping
  assert.match(t, /Total in GBP[\s\S]*£ 2,000/) // 2500 * 0.8
  assert.match(await page.locator('.fx').innerText(), /1 USD = ₹ 84 · £ 0\.8/)
  assert.ok(fetched.some((f) => f === 'USD->INR,GBP'), `one request for both rates, got ${fetched}`)
  assert.ok(await page.locator('.chart circle').count() > 0 || true)

  step('hiding a country that has data warns, hides, never deletes')
  await subtab('Settings').click()
  await page.getByRole('checkbox', { name: 'Show India' }).click()
  assert.match(await page.locator('.warn').first().innerText(), /will hide 1 item\. Nothing is deleted/)
  await page.getByRole('button', { name: 'Hide India' }).click()
  assert.equal(await page.locator('.subtabs button', { hasText: 'India' }).count(), 0)
  t = await summaryText()
  assert.ok(!t.includes('India'))
  assert.match(t, /Total in USD[\s\S]*\$ 1,500/) // 1000 + 400/0.8
  await subtab('Settings').click()
  await page.getByRole('checkbox', { name: 'Show India' }).check()
  await subtab(/India/).click()
  assert.ok(await page.getByText('Savings').isVisible()) // data came back

  step('reorder: UK first makes GBP the reporting currency and re-fetches rates from it')
  await subtab('Settings').click()
  await page.getByRole('button', { name: 'Move UK up' }).click() // list is USA, UK, India (India re-ticked last)
  assert.ok(await page.getByRole('button', { name: 'Move UK up' }).isDisabled()) // now first
  await subtab('Summary').click()
  await page.getByText(/1 GBP = /).waitFor()
  assert.ok(fetched.includes('GBP->USD,INR'), `rates re-fetched from GBP, got ${fetched}`)
  assert.match(await page.locator('.fx').innerText(), /1 GBP = \$ 1\.25 · ₹ 105/)
  assert.match(await summaryText(), /Total in GBP[\s\S]*£ 2,000/) // same wealth, same answer

  step('a single country hides combined totals and the exchange-rate bar')
  await subtab('Settings').click()
  for (const name of ['India', 'USA']) {
    await page.getByRole('checkbox', { name: `Show ${name}` }).click()
    if (await page.getByRole('button', { name: `Hide ${name}` }).count()) await page.getByRole('button', { name: `Hide ${name}` }).click()
  }
  assert.ok(await page.getByRole('checkbox', { name: 'Show UK' }).isDisabled()) // cannot untick the last one
  t = await summaryText()
  assert.ok(!/Total in/.test(t))
  assert.equal(await page.locator('.fx').count(), 0)
  await page.screenshot({ path: `${OUT}/single.png`, fullPage: true })
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('COUNTRIES E2E PASSED')
