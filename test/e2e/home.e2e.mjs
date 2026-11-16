// End-to-end check of the Home page: net worth, country rows (city, time, market, weather, AQI), ticker and Home settings (all network calls stubbed).
// Run:  npm run build && npm run test:e2e:home
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { autoSignIn } from './signin.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/home-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'

const server = spawn('npx', ['vite', 'preview', '--port', '4183', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Chicago', acceptDownloads: true })
await ctx.addInitScript(() => { Object.defineProperty(document, 'visibilityState', { get: () => window.__hidden ? 'hidden' : 'visible', configurable: true }); delete window.showSaveFilePicker; delete window.showOpenFilePicker; localStorage.setItem('google.setupSkipped', '1') })

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
const av = { mode: 'ok', calls: [] } // ok | limit
const AVQ = { SPY: [754.37, -2.75, '-0.3632%'], QQQ: [679.89, -8.28, '-1.2032%'], 'NIFTYBEES.BSE': [286.66, -1.38, '-0.4814%'] }
await ctx.route(/alphavantage\.co/, (r) => {
  const sym = new URL(r.request().url()).searchParams.get('symbol')
  av.calls.push(sym)
  if (av.mode === 'limit') return r.fulfill({ json: { Information: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.' } })
  const q = AVQ[sym]
  r.fulfill({ json: q ? { 'Global Quote': { '01. symbol': sym, '05. price': String(q[0]), '07. latest trading day': '2026-11-13', '09. change': String(q[1]), '10. change percent': q[2] } } : { 'Global Quote': {} } })
})
const meteo = { block: false, calls: 0, airCalls: 0, geocodeCalls: 0, noAir: false }
await ctx.route(/geocoding-api\.open-meteo\.com/, (r) => { meteo.geocodeCalls++; r.abort('failed') }) // must never be called: the cities are built in
await ctx.route(/air-quality-api\.open-meteo\.com/, (r) => {
  meteo.airCalls++
  const lat = Number(new URL(r.request().url()).searchParams.get('latitude'))
  if (meteo.noAir || lat < 0) return r.fulfill({ json: { current: { us_aqi: null } } }) // Sydney: no data
  r.fulfill({ json: { current: { us_aqi: lat < 30 ? 142 : 38 } } }) // Mumbai 142, New York 38
})
await ctx.route(/\/\/api\.open-meteo\.com/, (r) => { // note: must not also match the other open-meteo hosts
  if (meteo.block) return r.abort('failed')
  meteo.calls++
  const u = new URL(r.request().url())
  const f = u.searchParams.get('temperature_unit') === 'fahrenheit'
  r.fulfill({ json: { current: { temperature_2m: f ? 68.4 : 20.2, relative_humidity_2m: 52, weather_code: 2, wind_speed_10m: 8.2 },
    daily: { time: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], weather_code: [2, 0, 1, 61, 3], temperature_2m_max: f ? [73.6, 72, 70, 63, 66] : [23.1, 22, 21, 17, 19], temperature_2m_min: f ? [55.1, 52, 50, 48, 49] : [12.8, 11, 10, 9, 9] } } })
})

const page = await ctx.newPage()
autoSignIn(page)
await page.clock.setFixedTime(new Date('2026-11-16T15:42:00Z')) // 9:42 AM in Chicago
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !(meteo.block && /ERR_FAILED|Failed to load resource/.test(m.text())) && errors.push(m.text())) // the blocked-service step expects one failed request
const step = (s) => console.log('•', s)
const dialog = () => page.getByRole('dialog')
const topTab = (name) => page.getByRole('tab', { name })
const subtab = (name) => page.locator('.subtabs').getByRole('button', { name })
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const ticker = () => page.getByRole('marquee', { name: 'Market ticker' })
const openSettings = async () => { await page.getByRole('button', { name: '⚙ Home settings' }).click(); await page.getByLabel('Temperature unit').waitFor() } // the Home part of the Settings tab
const saveHome = async () => { await page.getByRole('button', { name: 'Save Home settings' }).click(); await page.getByText('Saved.').waitFor(); await topTab('Home').click() }

try {
  await page.goto('http://localhost:4183/')
  step('Home is the landing page: one row per country with city, time (AM/PM, day or night icon) and market status; locked data asks to unlock')
  const ny = page.getByTestId('row-us'), mum = page.getByTestId('row-in')
  await ny.waitFor()
  assert.match(await ny.innerText(), /New York[\s\S]*10:42 AM[\s\S]*Mon[\s\S]*Open[\s\S]*Closes in 5h 18m/)
  assert.match(await mum.innerText(), /Mumbai[\s\S]*9:12 PM[\s\S]*Closed[\s\S]*Opens tomorrow in 12h 3m/)
  assert.equal(await ny.getByRole('img', { name: 'Daytime' }).count(), 1); assert.equal(await mum.getByRole('img', { name: 'Night' }).count(), 1)
  assert.equal(await page.locator('.hcrow').count(), 2) // USA and India are the default countries
  assert.match(await page.getByLabel('Markets, time and weather').innerText(), /public holidays are not included/i)
  await page.getByText('Unlock your data to see this.').waitFor()

  step('weather: no city to set; each row shows its own exchange city, in °F for the US and °C elsewhere, with AQI when there is data')
  await ny.getByText('68°F').waitFor(); await mum.getByText('20°C').waitFor()
  assert.match(await ny.innerText(), /Partly cloudy[\s\S]*High 74°[\s\S]*Low 55°[\s\S]*Wind 8 mph[\s\S]*Humidity 52%[\s\S]*AQI 38 · Good/)
  assert.match(await mum.innerText(), /High 23°[\s\S]*Low 13°[\s\S]*Wind 8 km\/h[\s\S]*AQI 142 · Unhealthy for some/)
  assert.equal(meteo.geocodeCalls, 0, 'no city lookup'); assert.equal(meteo.calls, 2); assert.equal(meteo.airCalls, 2)

  step('no key: the ticker strip is still there with names and dashes, and says prices are off; nothing was requested from FCS')
  const t0 = await ticker().innerText()
  for (const label of ['S&P 500', 'Nasdaq', 'Sensex', 'Nifty 50', 'Gold', 'Bitcoin']) assert.ok(t0.includes(label), label)
  await page.getByText('Prices are off.').waitFor()
  assert.equal(fcs.calls.length, 0)

  step('Home settings: no city field; a wrong key is reported by Test, a good key works, the unit can be forced')
  await openSettings()
  assert.equal(await page.getByLabel('Weather city').count(), 0)
  await page.getByLabel('FCS API key').fill('BADKEY')
  await page.getByRole('button', { name: 'Test' }).click()
  await page.getByText(/key is not valid/).waitFor()
  assert.equal(await page.getByLabel('FCS API key').getAttribute('type'), 'password')
  await page.getByRole('button', { name: 'Show' }).click()
  assert.equal(await page.getByLabel('FCS API key').getAttribute('type'), 'text')
  await page.getByLabel('FCS API key').fill('GOODKEY')
  await page.getByRole('button', { name: 'Test' }).click()
  await page.getByText('✓ Working: Gold 4,120.55').waitFor()
  await page.getByText(/free FCS plan covers gold and Bitcoin/i).waitFor()
  const beforeSave = fcs.calls.length // the two Test presses above made one call each
  await saveHome()

  step('the ticker rolls with the base indices, gold and Bitcoin')
  await page.getByText(/Prices as of .* refreshed every 30 minutes/).waitFor()
  const tk = await ticker().innerText()
  assert.ok(tk.includes('6,412.30') && tk.includes('▲ 0.42%') && tk.includes('▼ 1.20%'))
  assert.ok(!tk.includes('FTSE')) // UK is not a selected country yet
  const callsAfterFirst = fcs.calls.length
  assert.equal(callsAfterFirst - beforeSave, 3) // one call per group: indices, gold, Bitcoin

  step('key and weather persist: after a reload nothing is asked again within the refresh interval')
  await page.reload()
  await ny.getByText('68°F').waitFor(); await page.getByText(/Prices as of/).waitFor()
  await page.waitForTimeout(500)
  assert.equal(fcs.calls.length, callsAfterFirst, 'cached prices are reused'); assert.equal(meteo.calls, 2, 'cached weather is reused')

  step('temperature unit setting: forcing °C changes the New York row')
  await openSettings(); await page.getByLabel('Temperature unit').selectOption('C')
  await saveHome()
  await ny.getByText('20°C').waitFor()
  await openSettings(); await page.getByLabel('Temperature unit').selectOption('')
  await saveHome()
  await ny.getByText('68°F').waitFor()

  step('free FCS plan: gold and Bitcoin still show, with a plain note that indices need a stock plan')
  fcs.mode = 'free'
  await page.evaluate(() => localStorage.removeItem('home.quotes'))
  await page.reload()
  await page.getByText(/does not include index prices/).waitFor()
  const free = await ticker().innerText()
  assert.ok(/Gold[\s\S]*4,120\.55/.test(free) && /Bitcoin[\s\S]*98,450/.test(free) && !/S&P 500[^\n]*6,412/.test(free))

  step('an invalid key: dashes, an explanation and Try again; fixing it brings prices back')
  fcs.mode = 'badkey'
  await page.evaluate(() => localStorage.removeItem('home.quotes'))
  await page.reload()
  await page.getByText('Prices unavailable.').waitFor()
  await page.getByText(/key is not valid/).first().waitFor()
  assert.ok((await ticker().innerText()).includes('S&P 500'), 'the strip stays')
  fcs.mode = 'full'
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByText('6,412.30').first().waitFor()

  step('a tab opened in the background still loads weather and prices')
  await page.evaluate(() => { localStorage.removeItem('home.weatherBy'); localStorage.removeItem('home.quotes') })
  const hiddenWx = meteo.calls
  await page.addInitScript(() => { window.__hidden = true })
  await page.reload()
  await ny.getByText(/°F/).waitFor()
  await page.getByText('6,412.30').first().waitFor()
  assert.ok(meteo.calls > hiddenWx)

  step('no air quality data: the weather still shows, without an AQI chip')
  await page.evaluate(() => localStorage.removeItem('home.weatherBy'))
  meteo.noAir = true
  await page.reload()
  await ny.getByText(/°F/).waitFor()
  assert.ok(!/AQI/.test(await ny.innerText()))
  meteo.noAir = false

  step('weather: a blocked service is explained and Try again recovers')
  meteo.block = true
  await page.evaluate(() => localStorage.removeItem('home.weatherBy'))
  await page.reload()
  await page.getByText(/Could not reach the weather service[\s\S]*getting the forecast/).first().waitFor({ timeout: 20_000 }) // after two quiet retries
  meteo.block = false
  await ny.getByRole('button', { name: 'Try again' }).click()
  await ny.getByText(/°F/).waitFor()

  step('Alpha Vantage option: choose it, add your own key, test it; indices show as ETFs on a slow schedule and FCS is no longer asked')
  const fcsBefore = fcs.calls.length
  await openSettings()
  await page.locator('.radios label', { hasText: 'Alpha Vantage' }).click()
  assert.equal(await page.getByLabel('Alpha Vantage API key').inputValue(), '')
  assert.equal(await page.getByLabel('FCS API key').count(), 0)
  assert.deepEqual(await page.getByLabel('Refresh interval').locator('option').allInnerTexts(), ['6 hours', '12 hours', '24 hours'])
  await page.getByLabel('Alpha Vantage API key').fill('MYAVKEY')
  await page.getByRole('button', { name: 'Test' }).click()
  await page.getByText('✓ Working: SPY ETF 754.37').waitFor()
  await page.getByText(/index ETF stand-ins/).waitFor()
  await saveHome()
  await page.getByText('Source: Alpha Vantage (index ETFs)').waitFor()
  const avt = await ticker().innerText()
  assert.ok(/S&P 500\s*SPY ETF\s*754\.37/.test(avt) && /Nasdaq\s*QQQ ETF\s*679\.89/.test(avt) && /Nifty 50\s*Nifty BeES ETF\s*286\.66/.test(avt), avt)
  assert.ok(!avt.includes('Sensex') && !avt.includes('Gold') && !avt.includes('Bitcoin'))
  assert.equal(fcs.calls.length, fcsBefore, 'FCS is not asked while Alpha Vantage is chosen')
  assert.deepEqual(av.calls.slice(-3), ['SPY', 'QQQ', 'NIFTYBEES.BSE']) // one request per index: 3 for USA + India
  assert.equal(await page.evaluate(() => localStorage.getItem('home.avKey')), 'MYAVKEY')
  await page.getByText(/refreshed every 6 hours/).waitFor()
  const avCalls = av.calls.length
  await page.reload(); await page.getByText('Source: Alpha Vantage (index ETFs)').waitFor(); await page.waitForTimeout(400)
  assert.equal(av.calls.length, avCalls, 'cached: a reload does not use the daily quota')
  av.mode = 'limit'
  await page.getByRole('button', { name: 'Refresh now' }).click()
  await page.getByText(/daily request limit/).waitFor()
  assert.ok((await ticker().innerText()).includes('754.37'), 'the last prices stay on screen')
  av.mode = 'ok'
  step('switching back to FCS brings its prices back')
  await openSettings()
  await page.locator('.radios label', { hasText: 'FCS API' }).click()
  assert.equal(await page.getByLabel('FCS API key').inputValue(), 'GOODKEY')
  assert.deepEqual(await page.getByLabel('Refresh interval').locator('option').allInnerTexts(), ['15 minutes', '30 minutes', '60 minutes'])
  await saveHome()
  await page.getByText('Source: FCS API').waitFor()
  await ticker().getByText('6,412.30').first().waitFor()

  step('countries come from the data file: create it, add the UK and Australia in Finance, and Home follows')
  await topTab('Finance Dashboard').click()
  await page.getByRole('button', { name: /Create a new encrypted file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await page.getByText('Update date', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.locator('#set-countries').getByLabel('Show United Kingdom').check().catch(async () => page.locator('#set-countries').getByLabel('Show UK').check())
  await page.locator('#set-countries').getByLabel('Show Australia').check()
  await topTab('Home').click()
  const lon = page.getByTestId('row-uk'), syd = page.getByTestId('row-au')
  await lon.waitFor()
  assert.equal(await page.locator('.hcrow').count(), 4)
  assert.match(await lon.innerText(), /London[\s\S]*3:42 PM[\s\S]*Open[\s\S]*Closes in 48 min/)
  assert.match(await syd.innerText(), /Sydney[\s\S]*2:42 AM[\s\S]*Tue[\s\S]*Closed[\s\S]*Opens in 7h 18m/)
  assert.equal(await syd.getByRole('img', { name: 'Night' }).count(), 1)
  await syd.getByText(/°C/).waitFor(); assert.ok(!/AQI/.test(await syd.innerText()), 'Sydney has no AQI data')
  await page.getByText('FTSE 100').first().waitFor() // a new country's index is fetched at once
  assert.ok((await ticker().innerText()).includes('9,310.40'))

  step('net worth card: owner choices include Spouse, an empty file shows zero, the choice is remembered')
  const nw = page.getByLabel('Total net worth')
  const owners = await nw.getByRole('group', { name: 'Whose net worth' }).getByRole('button').allInnerTexts()
  assert.deepEqual(owners, ['All', 'Mine', 'Joint', 'Spouse', 'Parent'])
  assert.match(await nw.getByTestId('networth').innerText(), /^\$\s?0$/)
  await nw.getByRole('button', { name: 'Spouse' }).click()
  assert.equal(await page.evaluate(() => localStorage.getItem('home.owner')), 'spouse')
  await page.reload()
  assert.equal(await page.getByLabel('Total net worth').locator('button.on').innerText(), 'Spouse')

  step('desktop layout: 70 : 30; Summary and ownership side by side (half each) in the 70%; the right column holds net worth and the countries')
  await page.waitForTimeout(300)
  const left = await page.locator('.h-left').boundingBox(), right = await page.locator('.h-right').boundingBox()
  const ratio = left.width / (left.width + right.width + 16)
  assert.ok(ratio > 0.68 && ratio < 0.72, `70 : 30, got ${(ratio * 100).toFixed(1)}%`)
  assert.ok(right.x > left.x + left.width - 2)
  assert.equal(await overflow(), 0)
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: true })

  step('phone: cards stack, ticker fits, no sideways scrolling')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  assert.equal(await overflow(), 0)
  const stacked = await page.locator('.home70 > div').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  assert.ok(stacked[0] < stacked[1])
  await page.screenshot({ path: `${OUT}/phone.png`, fullPage: true })
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message, '| page errors:', errors.join(' | '))
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('HOME E2E PASSED')
