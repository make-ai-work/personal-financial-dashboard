// End-to-end check of the Windows (Electron) app, run on Linux under a virtual screen. Dialogs and the browser are stood in for
// (DASHBOARD_TEST_DIR). Run:  npm run build && xvfb-run -a npm run test:e2e:windows
import { createRequire } from 'node:module'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { signInClick } from './signin.mjs'

const require = createRequire(import.meta.url)
const { _electron } = require('playwright')
const PASS = 'correct horse battery staple'
const work = mkdtempSync(path.join(tmpdir(), 'win-e2e-'))
const userData = path.join(work, 'userdata')
const PORT = '53691'
const launch = () => _electron.launch({
  executablePath: require('electron'),
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--user-data-dir=${userData}`, 'electron/main.cjs'],
  env: { ...process.env, DASHBOARD_TEST_DIR: work, DASHBOARD_PORT: PORT },
})
const step = (s) => console.log('•', s)
const errors = []
let app

try {
  app = await launch()
  let page = await app.firstWindow()
  await page.route(/frankfurter/, (r) => r.fulfill({ json: { base: 'USD', date: '2026-11-14', rates: { INR: 84 } } }))
  await page.route(/open-meteo/, (r) => r.fulfill({ json: { current: { temperature_2m: 20, relative_humidity_2m: 50, weather_code: 1, wind_speed_10m: 5, us_aqi: 40 }, daily: { time: ['2026-11-16', '2026-11-17'], weather_code: [1, 1], temperature_2m_max: [22, 22], temperature_2m_min: [12, 12] } } }))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.waitForLoadState('domcontentloaded')

  step('the app is served from a fixed local address and has the desktop bridge')
  assert.equal(await page.evaluate(() => location.origin), `http://localhost:${PORT}`)
  assert.equal(await page.evaluate(() => typeof window.desktopApp?.openVault), 'function')
  assert.equal(await page.evaluate(() => typeof require), 'undefined', 'the page has no Node access')

  step('first run asks for the Google client ID and shows the redirect address to authorise')
  await page.getByRole('heading', { name: 'Connect your Google account' }).waitFor()
  await page.getByText(`http://localhost:${PORT}/oauth-callback`).first().waitFor()
  await page.getByText('Authorized redirect URIs').waitFor()
  await page.getByRole('button', { name: /Skip for now/ }).click()
  await signInClick(page) // demo sign-in (no client ID)
  await page.getByRole('tab', { name: 'Home' }).waitFor()

  step('create the encrypted data file: it is written to disk by the app, with no plaintext inside')
  await page.getByRole('tab', { name: 'Finance Dashboard' }).click()
  await page.getByRole('button', { name: /Create a new encrypted file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create encrypted file' }).click()
  await page.getByText('Update date', { exact: true }).waitFor()
  const file = path.join(work, 'WealthTracker.wvault')
  assert.ok(existsSync(file), 'the vault file exists')
  assert.equal(readFileSync(file).subarray(0, 5).toString(), 'WVLT1')

  step('data entered is saved to the same file on its own')
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await page.getByRole('dialog').getByLabel('Account name').fill('Private Brokerage 777')
  await page.getByRole('dialog').getByLabel(/Current balance/).fill('4200')
  await page.getByRole('dialog').locator('.radios label', { hasText: /^Mine/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await page.getByText('Private Brokerage 777').first().waitFor()
  await page.waitForTimeout(1500)
  assert.ok(!readFileSync(file).toString('latin1').includes('Private Brokerage 777'), 'the saved file holds no plaintext')
  assert.ok(readFileSync(file).length > 200)
  assert.ok(!existsSync(file + '.tmp'), 'no half-written file is left')

  step('the page cannot read or write files it was not given')
  const denied = await page.evaluate(async () => { try { await window.desktopApp.readVault('C:\\Windows\\win.ini'); return 'read' } catch (e) { return String(e.message) } })
  assert.match(denied, /not chosen in this app/)
  const denied2 = await page.evaluate(async () => { try { await window.desktopApp.writeVault('/etc/passwd', new Uint8Array([1])); return 'wrote' } catch (e) { return String(e.message) } })
  assert.match(denied2, /not chosen in this app/)

  step('after closing and reopening, the app finds the file again and only needs the passphrase')
  await app.close(); app = null
  app = await launch(); page = await app.firstWindow(); page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/frankfurter/, (r) => r.fulfill({ json: { base: 'USD', date: '2026-11-14', rates: { INR: 84 } } }))
  await page.route(/open-meteo/, (r) => r.fulfill({ json: { current: { temperature_2m: 20, relative_humidity_2m: 50, weather_code: 1, wind_speed_10m: 5, us_aqi: 40 }, daily: { time: ['2026-11-16', '2026-11-17'], weather_code: [1, 1], temperature_2m_max: [22, 22], temperature_2m_min: [12, 12] } } }))
  await page.waitForLoadState('domcontentloaded')
  await signInClick(page) // nothing about the user is stored: sign in again
  await page.getByRole('tab', { name: 'Home' }).waitFor()
  await page.getByRole('tab', { name: 'Finance Dashboard' }).click()
  await page.getByText('WealthTracker.wvault').first().waitFor()
  await page.getByPlaceholder('Passphrase').fill('wrong passphrase here'); await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Wrong passphrase or damaged file.').waitFor()
  await page.getByPlaceholder('Passphrase').fill(PASS); await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Private Brokerage 777').first().waitFor()

  step('Home shows the net worth from the unlocked file')
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByTestId('networth').waitFor()
  await page.getByTestId('networth').getByText(/4,200/).waitFor() // once the exchange rates have arrived

  step('links to other sites do not open inside the app')
  const before = (await app.windows()).length
  await page.evaluate(() => window.open('https://example.com/', '_blank'))
  await page.waitForTimeout(500)
  assert.equal((await app.windows()).length, before)
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  rmSync(work, { recursive: true, force: true })
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
if (errors.length) process.exitCode = 1
if (!process.exitCode) console.log('WINDOWS E2E PASSED')
