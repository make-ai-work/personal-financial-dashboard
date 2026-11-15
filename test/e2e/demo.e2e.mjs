// End-to-end check of the demo build (sample data, no saving). Run:  npm run build:demo && npm run test:e2e:demo
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/demo-e2e'
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4182', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
const PER_USD = { USD: 1, INR: 84, GBP: 0.8, AUD: 1.5, CHF: 0.9 }
await ctx.route('**/api.frankfurter.dev/**', (r) => {
  const u = new URL(r.request().url())
  const base = u.searchParams.get('base')
  const symbols = u.searchParams.get('symbols').split(',')
  r.fulfill({ json: { base, date: '2026-11-14', rates: Object.fromEntries(symbols.map((s) => [s, PER_USD[s] / PER_USD[base]])) } })
})
const snap = { mode: 'ok' } // ok | missing
const q = (id, price, change, changePct) => ({ id, price, change, changePct, at: 1794606199 })
await ctx.route(/ticker-snapshot\.json/, (r) => snap.mode === 'missing'
  ? r.fulfill({ status: 404, body: 'not found' })
  : r.fulfill({ json: { generatedAt: '2026-11-15T06:17:00Z', problems: [], quotes: [q('spx', 6412.3, 26.8, 0.42), q('ixic', 21980.1, 155.2, 0.71), q('sensex', 84120.5, -151.4, -0.18), q('nifty', 25780.2, -54.1, -0.21), q('ftse', 9310.4, 11.2, 0.12), q('gold', 4120.55, 14.4, 0.35), q('btc', 98450, -1196, -1.2)] } }))
const meteoCalls = []
await ctx.route(/geocoding-api\.open-meteo\.com/, (r) => { meteoCalls.push(r.request().url()); r.abort('failed') }) // never needed: the cities are built in
await ctx.route(/air-quality-api\.open-meteo\.com/, (r) => r.fulfill({ json: { current: { us_aqi: 61 } } }))
await ctx.route(/\/\/api\.open-meteo\.com/, (r) => r.fulfill({ json: { current: { temperature_2m: 55.2, relative_humidity_2m: 60, weather_code: 3, wind_speed_10m: 6.1 }, daily: { time: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], weather_code: [3, 61, 2, 0, 1], temperature_2m_max: [58, 56, 55, 54, 57], temperature_2m_min: [44, 45, 43, 41, 42] } } }))
const page = await ctx.newPage()
await page.clock.setFixedTime(new Date('2026-11-15T12:00:00'))
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !(snap.mode === 'missing' && /404/.test(m.text())) && errors.push(m.text())) // the missing-snapshot step expects one 404
const step = (s) => console.log('•', s)
const dialog = () => page.getByRole('dialog')
const topTab = (name) => page.getByRole('tab', { name })
const subtab = (name) => page.locator('.subtabs').getByRole('button', { name })
const demoBtn = () => page.getByRole('button', { name: 'Demo Mode (skip sign in)' })
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const enter = async () => { await demoBtn().click(); await page.getByRole('status').filter({ hasText: 'DEMO' }).waitFor() }

try {
  await page.goto('http://localhost:4182/')
  step('the sign-in page is kept: Google button inactive, Demo Mode active, no setup screen, no tabs')
  const google = page.getByRole('button', { name: /Sign in with Google/ })
  await google.waitFor()
  assert.ok(await google.isDisabled(), 'Google sign-in is inactive in the demo')
  assert.ok(await demoBtn().isEnabled())
  await page.getByText(/This is the demo/).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Connect your Google account' }).count(), 0)
  assert.equal(await page.getByRole('tab').count(), 0)
  await google.click({ force: true, timeout: 1000 }).catch(() => {})
  assert.equal(await page.getByRole('tab').count(), 0, 'clicking the disabled button does nothing')

  step('Demo Mode opens the app with sample data, the DEMO banner and no file, lock or passphrase controls')
  await enter()
  await page.getByText('Sample data.', { exact: false }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Lock now' }).count(), 0)

  step('Home is the landing page: the ticker shows the site\'s price snapshot (no key anywhere), each country shows its exchange city with weather and the net worth card shows the sample data')
  await page.getByRole('heading', { name: /^Markets · time · weather/ }).waitFor()
  const tkr = page.getByRole('marquee', { name: 'Market ticker' })
  await tkr.waitFor()
  const tt = await tkr.innerText()
  for (const label of ['S&P 500', 'Nasdaq', 'Sensex', 'Nifty 50', 'Gold', 'Bitcoin']) assert.ok(tt.includes(label), label)
  assert.ok(!tt.includes('FTSE'), 'the sample uses USA and India only')
  await page.getByText(/Snapshot from .* refreshed a few times a day/).waitFor()
  await page.getByTestId('row-us').getByText('55°F').waitFor()
  assert.match(await page.getByTestId('row-us').innerText(), /New York[\s\S]*AQI 61 · Moderate/)
  assert.equal(meteoCalls.length, 0, 'the cities are built in: no city lookup')
  assert.equal(await page.locator('.crow').count(), 2)
  const nwCard = page.getByLabel('Total net worth')
  await nwCard.getByTestId('networth').getByText(/^\$\s?[\d,]{7,}/).waitFor() // the sample data's combined net worth, in USD
  await nwCard.getByRole('button', { name: 'Spouse' }).click()
  await nwCard.getByTestId('networth').getByText(/^\$\s?41,000$/).waitFor() // the sample "Spouse IRA"
  await nwCard.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: '⚙ Home settings' }).click()
  await dialog().getByText(/snapshot of prices taken when the site was built/).waitFor()
  assert.equal(await dialog().getByLabel('FCS API key').count(), 0, 'no key field in the demo')
  await dialog().getByLabel('Temperature unit').selectOption('C'); await dialog().getByRole('button', { name: 'Save' }).click()
  await page.getByTestId('row-us').getByText('55°C').waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('home.unit') || localStorage.getItem('home.owner')), null, 'the demo keeps nothing in the browser')
  step('a reload also returns to the sign-in page with fresh data')
  await page.reload()
  await demoBtn().waitFor()
  assert.equal(await page.getByRole('tab').count(), 0)

  step('without a snapshot the ticker says prices are unavailable, and the rest of Home still works')
  snap.mode = 'missing'
  await page.reload(); await demoBtn().waitFor(); await enter(); await topTab('Home').click()
  await page.getByText('Prices unavailable.').waitFor()
  await page.getByText(/price snapshot has not been generated yet/).waitFor()
  await page.getByTestId('row-us').waitFor()
  snap.mode = 'ok'

  step('phone: banner and tabs fit, no sideways scrolling')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await overflow(), 0, 'sign-in page')
  await page.reload(); await demoBtn().waitFor(); await enter(); await topTab('Home').click()
  await page.getByText('Sample data.', { exact: false }).first().waitFor()
  await page.getByRole('heading', { name: /^Markets · time · weather/ }).waitFor()
  assert.equal(await overflow(), 0, 'Home')
  await topTab('Finance Dashboard').click(); await page.getByText('Summary ·').waitFor()
  assert.equal(await overflow(), 0, 'Finance')
  await topTab(/Retirement/).click(); await page.waitForTimeout(600)
  assert.equal(await overflow(), 0, 'Retirement')
  await page.screenshot({ path: `${OUT}/phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await topTab('Finance Dashboard').click(); await page.getByText('Summary ·').waitFor()
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: true })
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('DEMO E2E PASSED')
