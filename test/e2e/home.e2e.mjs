// End-to-end check of the Home page: clocks, weather, markets, ticker and Home settings (all network calls stubbed).
// Run:  npm run build && npm run test:e2e:home
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/home-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'

const server = spawn('npx', ['vite', 'preview', '--port', '4183', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Chicago', acceptDownloads: true })
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; if (!sessionStorage.getItem('seeded')) { localStorage.setItem('auth.demo', '1'); sessionStorage.setItem('seeded', '1') } })

// ---- stubs ----
const PER_USD = { USD: 1, INR: 84, GBP: 0.8, AUD: 1.5, CHF: 0.9 }
await ctx.route('**/api.frankfurter.dev/**', (r) => {
  const u = new URL(r.request().url())
  const base = u.searchParams.get('base')
  r.fulfill({ json: { base, date: '2026-11-16', rates: Object.fromEntries(u.searchParams.get('symbols').split(',').map((s) => [s, PER_USD[s] / PER_USD[base]])) } })
})
const fcs = { mode: 'full', calls: [] } // full | free (no index plan) | badkey
const row = (ticker, c, ch, chp) => ({ ticker, update: 1794606199, active: { c, ch, chp, tm: '2026-11-16 10:00:00' }, previous: { c: c - ch } })
await ctx.route(/api-v4\.fcsapi\.com/, (route) => {
  const u = new URL(route.request().url())
  fcs.calls.push(u.pathname)
  const ok = (response) => route.fulfill({ json: { status: true, code: 200, msg: 'Successfully', response, info: { credit_count: 1 } } })
  const fail = (code, msg) => route.fulfill({ json: { status: false, code, msg, info: { credit_count: 0 } } })
  if (u.searchParams.get('access_key') === 'BADKEY' || fcs.mode === 'badkey') return fail(101, 'You have not supplied a valid API Access Key.')
  if (u.pathname === '/stock/latest') {
    if (fcs.mode === 'free') return fail(105, 'Endpoint is not included in your plan')
    const all = { 'SP:SPX': row('SP:SPX', 6412.3, 26.8, 0.42), 'NASDAQ:IXIC': row('NASDAQ:IXIC', 21980.1, 155.2, 0.71), 'BSE:SENSEX': row('BSE:SENSEX', 84120.5, -151.4, -0.18), 'NSE:NIFTY': row('NSE:NIFTY', 25780.2, -54.1, -0.21), 'FTSE:UKX': row('FTSE:UKX', 9310.4, 11.2, 0.12) }
    return ok(u.searchParams.get('symbol').split(',').map((s) => all[s]).filter(Boolean))
  }
  if (u.pathname === '/forex/latest') return ok([row('FX:XAUUSD', 4120.55, 14.4, 0.35)])
  if (u.pathname === '/crypto/latest') return ok([row('COINBASE:BTCUSD', 98450, -1196, -1.2)])
  return fail(404, 'unknown')
})
const meteo = { geocodeMiss: false, calls: 0, geocodeUrls: [] }
await ctx.route(/geocoding-api\.open-meteo\.com/, (r) => {
  meteo.geocodeUrls.push(r.request().url())
  r.fulfill({ json: meteo.geocodeMiss ? {} : { results: [{ name: 'Austin', admin1: 'Minnesota', country: 'United States', latitude: 43.67, longitude: -92.97 }, { name: 'Austin', admin1: 'Texas', country: 'United States', latitude: 30.27, longitude: -97.74 }] } })
})
await ctx.route(/\/\/api\.open-meteo\.com/, (r) => { // note: must not also match geocoding-api.open-meteo.com
  meteo.calls++
  const u = new URL(r.request().url())
  const f = u.searchParams.get('temperature_unit') === 'fahrenheit'
  r.fulfill({ json: { current: { temperature_2m: f ? 68.4 : 20.2, relative_humidity_2m: 52, weather_code: 2, wind_speed_10m: 8.2 },
    daily: { time: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], weather_code: [2, 0, 1, 61, 3], temperature_2m_max: f ? [73.6, 72, 70, 63, 66] : [23.1, 22, 21, 17, 19], temperature_2m_min: f ? [55.1, 52, 50, 48, 49] : [12.8, 11, 10, 9, 9] } } })
})

const page = await ctx.newPage()
await page.clock.setFixedTime(new Date('2026-11-16T15:42:00Z')) // 9:42 AM in Chicago
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const step = (s) => console.log('•', s)
const dialog = () => page.getByRole('dialog')
const topTab = (name) => page.getByRole('tab', { name })
const subtab = (name) => page.locator('.subtabs').getByRole('button', { name })
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const ticker = () => page.getByRole('marquee', { name: 'Market ticker' })
const openSettings = async () => { await page.getByRole('button', { name: '⚙ Home settings' }).click(); await dialog().waitFor() }

try {
  await page.goto('http://localhost:4183/')
  step('Home is the landing page: capitalised greeting, a clock for each country (capital time zones), markets open/closed')
  await page.getByRole('heading', { name: /^Time/ }).waitFor()
  await page.getByText('Good Morning').waitFor()
  const time = page.getByLabel('Time', { exact: true })
  assert.match(await time.innerText(), /Washington, D\.C\.[\s\S]*10:42 AM[\s\S]*Mon 16 Nov/)
  assert.match(await time.innerText(), /New Delhi[\s\S]*9:12 PM/)
  assert.equal(await time.locator('.ck').count(), 2) // USA and India are the default countries
  const markets = page.getByLabel('Markets', { exact: true })
  const mtext = await markets.innerText()
  assert.match(mtext, /NYSE · Nasdaq[\s\S]*Closes in 5h 18m[\s\S]*Open/)
  assert.match(mtext, /NSE · BSE[\s\S]*Opens tomorrow in 12h 3m[\s\S]*Closed/)
  assert.match(mtext, /Public holidays are not included/)

  step('no key and no city yet: the ticker says it is off and the weather asks for a city; nothing was requested')
  await page.getByText('Market ticker is off.').waitFor()
  await page.getByText(/Choose your city in Home settings/).waitFor()
  assert.equal(fcs.calls.length, 0); assert.equal(meteo.calls, 0)

  step('Home settings: a wrong key is reported by the Test button, a good key works, city and unit are saved')
  await openSettings()
  await dialog().getByLabel('Weather city').fill('Austin, Texas')
  await dialog().getByLabel('Temperature unit').selectOption('F')
  await dialog().getByLabel('FCS API key').fill('BADKEY')
  await dialog().getByRole('button', { name: 'Test' }).click()
  await dialog().getByText(/key is not valid/).waitFor()
  assert.equal(await dialog().getByLabel('FCS API key').getAttribute('type'), 'password')
  await dialog().getByRole('button', { name: 'Show' }).click()
  assert.equal(await dialog().getByLabel('FCS API key').getAttribute('type'), 'text')
  await dialog().getByLabel('FCS API key').fill('GOODKEY')
  await dialog().getByRole('button', { name: 'Test' }).click()
  await dialog().getByText('✓ Working: Gold 4,120.55').waitFor()
  await dialog().getByText(/free FCS plan covers gold and Bitcoin/i).waitFor()
  const beforeSave = fcs.calls.length // the two Test presses above made one call each
  await dialog().getByRole('button', { name: 'Save' }).click()
  await dialog().waitFor({ state: 'detached' })

  step('the ticker rolls with the base indices, gold and Bitcoin; the weather appears in °F')
  await ticker().waitFor()
  const tk = await ticker().innerText()
  for (const label of ['S&P 500', 'Nasdaq', 'Sensex', 'Nifty 50', 'Gold', 'Bitcoin']) assert.ok(tk.includes(label), label)
  assert.ok(tk.includes('6,412.30') && tk.includes('▲ 0.42%') && tk.includes('▼ 1.20%'))
  assert.ok(!tk.includes('FTSE')) // UK is not a selected country yet
  await page.getByText(/Prices as of .* refreshed every 30 minutes/).waitFor()
  const wx = page.getByLabel('Weather', { exact: true })
  await wx.getByText('68°F').waitFor()
  assert.match(await wx.innerText(), /austin[\s\S]*Partly cloudy[\s\S]*High 74°[\s\S]*Low 55°[\s\S]*Humidity 52%/i)
  assert.equal(await wx.locator('.fc > div').count(), 4)
  const callsAfterFirst = fcs.calls.length
  assert.equal(callsAfterFirst - beforeSave, 3) // one call per group: indices, gold, Bitcoin
  assert.ok(meteo.geocodeUrls[0].includes('name=Austin&count=10'), 'only the name is searched: ' + meteo.geocodeUrls[0])
  assert.ok(meteo.calls === 1 && (await page.evaluate(() => localStorage.getItem('home.weather'))).includes('Austin'))

  step('key, city and prices persist: after a reload nothing is asked again within the refresh interval')
  await page.reload()
  await ticker().waitFor()
  await page.getByLabel('Weather', { exact: true }).getByText('68°F').waitFor()
  await page.waitForTimeout(500)
  assert.equal(fcs.calls.length, callsAfterFirst, 'cached prices are reused'); assert.equal(meteo.calls, 1, 'cached weather is reused')

  step('free FCS plan: gold and Bitcoin still show, with a plain note that indices need a stock plan')
  fcs.mode = 'free'
  await page.evaluate(() => localStorage.removeItem('home.quotes'))
  await page.reload()
  await page.getByText(/does not include index prices/).waitFor()
  const free = await ticker().innerText()
  assert.ok(free.includes('Gold') && free.includes('Bitcoin') && !free.includes('S&P 500'))

  step('an invalid key: no prices, an explanation and Try again; fixing it brings prices back')
  fcs.mode = 'badkey'
  await page.evaluate(() => localStorage.removeItem('home.quotes'))
  await page.reload()
  await page.getByText('Prices unavailable.').waitFor()
  await page.getByText(/key is not valid/).first().waitFor()
  fcs.mode = 'full'
  await page.getByRole('button', { name: 'Try again' }).click()
  await ticker().getByText('S&P 500').first().waitFor()

  step('weather: an unknown city is explained')
  meteo.geocodeMiss = true
  await openSettings()
  await dialog().getByLabel('Weather city').fill('Nowhereville')
  await dialog().getByRole('button', { name: 'Save' }).click()
  await page.getByText(/Could not find “Nowhereville”/).waitFor()
  meteo.geocodeMiss = false
  await openSettings(); await dialog().getByLabel('Weather city').fill('Austin'); await dialog().getByLabel('Temperature unit').selectOption('C')
  await dialog().getByRole('button', { name: 'Save' }).click()
  await page.getByLabel('Weather', { exact: true }).getByText('20°C').waitFor()

  step('countries come from the data file: create it, add the UK and Australia in Finance, and Home follows')
  await topTab('Finance Dashboard').click()
  await page.getByRole('button', { name: /Create a new encrypted file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await page.getByText('Summary ·').waitFor()
  await subtab('Settings').click()
  await page.getByLabel('Show United Kingdom').check().catch(async () => page.getByLabel('Show UK').check())
  await page.getByLabel('Show Australia').check()
  await topTab('Home').click()
  const time2 = page.getByLabel('Time', { exact: true })
  await time2.getByText('London').waitFor()
  assert.equal(await time2.locator('.ck').count(), 4)
  assert.match(await time2.innerText(), /Canberra[\s\S]*2:42 AM[\s\S]*Tue 17 Nov/) // Australia uses its capital's clock
  assert.match(await time2.innerText(), /London[\s\S]*3:42 PM/)
  const m2 = await page.getByLabel('Markets', { exact: true }).innerText()
  assert.match(m2, /London Stock Exchange[\s\S]*Closes in 48 min/); assert.match(m2, /ASX[\s\S]*Opens in 7h 18m/)
  await ticker().getByText('FTSE 100').first().waitFor() // a new country's index is fetched at once
  assert.ok((await ticker().innerText()).includes('9,310.40'))
  // the country list is remembered: after locking, Home still shows four clocks and four markets
  await page.getByRole('button', { name: 'Lock now' }).click().catch(() => {})
  await topTab('Home').click()
  assert.equal(await page.getByLabel('Time', { exact: true }).locator('.ck').count(), 4)

  step('desktop layout: three cards of sensible size side by side, no sideways scrolling')
  await page.waitForTimeout(300)
  const boxes = await page.locator('.grid3 > .card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  assert.equal(boxes.length, 3)
  assert.ok(Math.abs(boxes[0] - boxes[1]) <= 2, `time and weather cards are the same width: ${boxes}`)
  assert.ok(boxes[2] < boxes[0], 'markets is the smaller card')
  assert.equal(await overflow(), 0)
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: true })

  step('phone: cards stack, ticker fits, no sideways scrolling')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  assert.equal(await overflow(), 0)
  const stacked = await page.locator('.grid3 > .card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  assert.ok(stacked[0] < stacked[1] && stacked[1] < stacked[2])
  await page.screenshot({ path: `${OUT}/phone.png`, fullPage: true })
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('HOME E2E PASSED')
