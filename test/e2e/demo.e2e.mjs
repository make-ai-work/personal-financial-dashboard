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
const fcs = { mode: 'ok', tokenCalls: 0, urls: [] } // ok | refused (domain not allowed)
const row = (ticker, c, ch, chp) => ({ ticker, update: 1794606199, active: { c, ch, chp, tm: '2026-11-16 10:00:00' }, previous: { c: c - ch } })
await ctx.route(/api-v4\.fcsapi\.com/, (route) => {
  const u = new URL(route.request().url())
  fcs.urls.push(u)
  const ok = (response) => route.fulfill({ json: { status: true, code: 200, msg: 'Successfully', response, info: { credit_count: 1 } } })
  if (u.pathname.endsWith('/jwt_token')) {
    fcs.tokenCalls++
    if (fcs.mode === 'refused') return route.fulfill({ json: { status: false, code: 101, msg: 'Add Allowed domains for your key, Public key without _token param needs Allowed Domains' } })
    return ok({ jwt_token: 'TOKEN123', public_key: u.searchParams.get('public_key'), expiry: 1794863040, expires_in: 86400 })
  }
  if (u.searchParams.get('jwt_token') !== 'TOKEN123') return route.fulfill({ json: { status: false, code: 101, msg: 'Invalid token' } })
  if (u.pathname === '/stock/latest') {
    const all = { 'SP:SPX': row('SP:SPX', 6412.3, 26.8, 0.42), 'NASDAQ:IXIC': row('NASDAQ:IXIC', 21980.1, 155.2, 0.71), 'BSE:SENSEX': row('BSE:SENSEX', 84120.5, -151.4, -0.18), 'NSE:NIFTY': row('NSE:NIFTY', 25780.2, -54.1, -0.21) }
    return ok(u.searchParams.get('symbol').split(',').map((x) => all[x]).filter(Boolean))
  }
  if (u.pathname === '/forex/latest') return ok([row('FX:XAUUSD', 4120.55, 14.4, 0.35)])
  if (u.pathname === '/crypto/latest') return ok([row('COINBASE:BTCUSD', 98450, -1196, -1.2)])
  return route.fulfill({ json: { status: false, code: 404, msg: 'unknown' } })
})
const av = { mode: 'ok' } // ok | missing
await ctx.route(/av-snapshot\.json/, (r) => av.mode === 'missing' ? r.fulfill({ status: 404, body: 'not found' }) : r.fulfill({ json: { generatedAt: '2026-11-15T06:17:00Z', problems: [], quotes: [
  { id: 'spx', price: 754.37, change: -2.75, changePct: -0.3632, at: 1794606199, via: 'SPY ETF' }, { id: 'ixic', price: 679.89, change: -8.28, changePct: -1.2032, at: 1794606199, via: 'QQQ ETF' },
  { id: 'nifty', price: 286.66, change: -1.38, changePct: -0.4, at: 1794606199, via: 'Nifty BeES ETF' }, { id: 'ftse', price: 1063.8, change: 4.2, changePct: 0.3964, at: 1794606199, via: 'ISF ETF' }] } }))
const meteoCalls = []
await ctx.route(/geocoding-api\.open-meteo\.com/, (r) => { meteoCalls.push(r.request().url()); r.abort('failed') }) // never needed: the cities are built in
await ctx.route(/air-quality-api\.open-meteo\.com/, (r) => r.fulfill({ json: { current: { us_aqi: 61 } } }))
await ctx.route(/\/\/api\.open-meteo\.com/, (r) => r.fulfill({ json: { current: { temperature_2m: 55.2, relative_humidity_2m: 60, weather_code: 3, wind_speed_10m: 6.1 }, daily: { time: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], weather_code: [3, 61, 2, 0, 1], temperature_2m_max: [58, 56, 55, 54, 57], temperature_2m_min: [44, 45, 43, 41, 42] } } }))
const page = await ctx.newPage()
await page.clock.setFixedTime(new Date('2026-11-15T12:00:00'))
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !(av.mode === 'missing' && /404/.test(m.text())) && errors.push(m.text())) // the missing-snapshot step expects one
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

  step('Home is the landing page: the ticker gets prices with a token made from the public key (no secret anywhere), each country shows its exchange city with weather and the net worth card shows the sample data')
  await page.getByRole('heading', { name: /^Markets · time · weather/ }).waitFor()
  const tkr = page.getByRole('marquee', { name: 'Market ticker' })
  await tkr.waitFor()
  const tt = await tkr.innerText()
  for (const label of ['S&P 500', 'Nasdaq', 'Nifty 50', 'Gold', 'Bitcoin']) assert.ok(tt.includes(label), label) // no Sensex stand-in on the free plan
  assert.ok(!tt.includes('FTSE'), 'the sample uses USA and India only')
  await page.getByText(/Prices as of .* refreshed every 30 minutes/).waitFor()
  const full = await tkr.innerText()
  assert.ok(/S&P 500\s*SPY ETF\s*754\.37/.test(full) && full.includes('Nifty BeES ETF') && /Gold[\s\S]*4,120\.55/.test(full) && /Bitcoin[\s\S]*98,450/.test(full), 'index ETFs from the Alpha Vantage snapshot, gold and Bitcoin from FCS')
  assert.ok(!fcs.urls.some((u) => u.pathname === '/stock/latest'), 'the demo does not ask FCS for indices')
  assert.ok((await tkr.locator('.track .set').first().evaluate((e) => e.getBoundingClientRect().width)) >= 1280, 'the strip is longer than the screen')
  await page.getByText(/Alpha Vantage \(index ETFs\)/).waitFor()
  assert.equal(fcs.tokenCalls, 1, 'one token')
  const tokenUrl = fcs.urls.find((u) => u.pathname.endsWith('/jwt_token'))
  assert.equal(tokenUrl.searchParams.get('public_key'), '0mrrYgZnCDhbOR4XtRPKDYWCAccKpz04J')
  assert.ok(fcs.urls.filter((u) => u.pathname.endsWith('/latest')).every((u) => u.searchParams.get('jwt_token') === 'TOKEN123' && !u.searchParams.has('access_key')))
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
  await dialog().getByText(/short-lived token, so no API key is needed/).waitFor()
  assert.equal(await dialog().getByLabel('FCS API key').count(), 0, 'no key field in the demo')
  await dialog().getByLabel('Temperature unit').selectOption('C'); await dialog().getByRole('button', { name: 'Save' }).click()
  await page.getByTestId('row-us').getByText('55°C').waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('home.unit') || localStorage.getItem('home.owner')), null, 'the demo keeps nothing in the browser')
  step('a reload also returns to the sign-in page with fresh data')
  await page.reload()
  await demoBtn().waitFor()
  assert.equal(await page.getByRole('tab').count(), 0)

  step('without the index snapshot the ticker still shows gold and Bitcoin, with a note')
  av.mode = 'missing'
  await page.reload(); await demoBtn().waitFor(); await enter(); await topTab('Home').click()
  await page.getByText('Index prices are not available in this demo yet.').waitFor()
  await page.getByText(/Gold/).first().waitFor()
  av.mode = 'ok'

  step('if FCS refuses the website, the ticker says so and the rest of Home still works')
  fcs.mode = 'refused'
  await page.reload(); await demoBtn().waitFor(); await enter(); await topTab('Home').click()
  await page.getByText(/not on the allowed-domain list of the FCS key/).first().waitFor()
  await page.getByTestId('row-us').waitFor()
  fcs.mode = 'ok'

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
