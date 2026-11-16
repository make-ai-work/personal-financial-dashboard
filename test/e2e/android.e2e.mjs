// End-to-end check of the Android-app behaviour, run in a browser with an in-memory stand-in for the phone's private folder,
// share sheet, Back button and app lifecycle. Run:  npm run build && npm run test:e2e:android
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/android-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'

const server = spawn('npx', ['vite', 'preview', '--port', '4184', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
// The "phone": private folder kept in localStorage so it survives a reload (a relaunch), plus share sheet, Back button, lifecycle.
await ctx.addInitScript(() => {
  const disk = () => JSON.parse(localStorage.getItem('fakeDisk') || '{}')
  const save = (d) => localStorage.setItem('fakeDisk', JSON.stringify(d))
  const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s) }
  window.__shared = []
  globalThis.__DASHBOARD_APP_TEST__ = {
    fs: {
      read: async (p) => { const d = disk(); return p in d ? Uint8Array.from(atob(d[p]), (c) => c.charCodeAt(0)) : null },
      write: async (p, bytes) => { const d = disk(); d[p] = b64(bytes); save(d) },
      remove: async (p) => { const d = disk(); delete d[p]; save(d) },
    },
    share: async ({ name, bytes }) => { window.__shared.push({ name, size: bytes.length }) },
    app: { onBack: async (cb) => { window.__back = cb; return () => {} }, onState: async (cb) => { window.__state = cb; return () => {} }, exit: () => { window.__exited = true } },
  }
})
const PER_USD = { USD: 1, INR: 84 }
await ctx.route('**/api.frankfurter.dev/**', (r) => { const u = new URL(r.request().url()); const base = u.searchParams.get('base'); r.fulfill({ json: { base, date: '2026-11-16', rates: Object.fromEntries(u.searchParams.get('symbols').split(',').map((s) => [s, PER_USD[s] / PER_USD[base]])) } }) })
await ctx.route(/open-meteo\.com|fcsapi\.com/, (r) => r.abort('failed')) // Home's weather and prices are not under test here
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text()) && errors.push(m.text()))
const step = (s) => console.log('•', s)
const dialog = () => page.getByRole('dialog')
const topTab = (name) => page.getByRole('tab', { name })
const subtab = (name) => page.locator('.subtabs').getByRole('button', { name })
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const disk = () => page.evaluate(() => JSON.parse(localStorage.getItem('fakeDisk') || '{}'))
const unlock = async (pass) => { await page.getByPlaceholder('Passphrase').fill(pass); await page.getByRole('button', { name: 'Unlock' }).click() }
const back = () => page.evaluate(() => window.__back())

// on a phone the Assets section starts folded (the choice is remembered once made)
const showAssets = async () => { const t = page.locator('.ctoggle', { hasText: 'Assets' }); if ((await t.getAttribute('aria-expanded')) === 'false') await t.click() }

try {
  await page.goto('http://localhost:4184/')
  step('the app opens straight to Home: no Google setup, no sign-in, no Account button')
  await page.getByRole('heading', { name: /^Markets · time · weather/ }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Connect your Google account' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: /Sign in with Google/ }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Account', exact: true }).count(), 0)

  step('first launch: "Create your vault" with restore and Excel import; Google Drive is shown as coming later')
  await topTab('Finance Dashboard').click()
  await page.getByRole('heading', { name: 'Create your vault' }).waitFor()
  await page.getByText(/inside this app only/).waitFor()
  await page.getByRole('button', { name: /Restore from a backup file/ }).waitFor()
  assert.ok(await page.getByRole('button', { name: /Save to Google Drive/ }).isDisabled())

  step('creating the vault stores an encrypted file in the app folder (no plaintext, no download)')
  await page.getByRole('button', { name: /Create a new encrypted vault/ }).click()
  await page.getByText(/stored inside this app/).waitFor()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create vault' }).click()
  await page.getByText('Update date', { exact: true }).waitFor()
  assert.ok('WealthTracker.wvault' in (await disk()))
  await page.getByText(/saved$/).first().waitFor()

  step('data entered is saved to the app folder on its own')
  await subtab(/USA/).click()
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await dialog().getByLabel('Account name').fill('Brokerage')
  await dialog().getByLabel('Bank / holding company').fill('Sample Securities')
  await dialog().getByLabel(/Current balance/).fill('96000')
  await dialog().locator('.radios label', { hasText: /^Mine/ }).click()
  await dialog().getByRole('button', { name: 'Save' }).click()
  await dialog().waitFor({ state: 'detached' })
  await showAssets(); await page.getByText('Brokerage').first().waitFor()
  await page.waitForTimeout(900)
  const file1 = (await disk())['WealthTracker.wvault']
  assert.ok(file1 && !Buffer.from(file1, 'base64').toString('latin1').includes('Brokerage'), 'the saved file holds no plaintext')
  assert.equal(Object.keys(await disk()).filter((k) => k.endsWith('.tmp')).length, 0, 'no leftover temporary copy')

  step('relaunch: "Your vault" asks for the passphrase; a wrong one is refused; the right one restores the data')
  await page.reload()
  await topTab('Finance Dashboard').click()
  await page.getByRole('heading', { name: 'Your vault' }).waitFor()
  await page.getByRole('button', { name: 'Restore from a backup…' }).waitFor(); await page.getByRole('button', { name: 'Delete the vault in this app…' }).waitFor()
  await unlock('not the passphrase')
  await page.getByText(/wrong passphrase|could not|incorrect|failed/i).first().waitFor()
  await unlock(PASS)
  await page.getByText('Update date', { exact: true }).waitFor()
  await subtab(/USA/).click(); await showAssets(); await page.getByText('Brokerage').first().waitFor()

  step('Settings › Your data: stored in this app, backup reminder, export through the share sheet')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByText('🔒 Your data').waitFor()
  await page.locator('#set-data').getByText('Private to this app').waitFor()
  assert.equal(await page.getByTestId('last-backup').innerText(), 'never')
  assert.equal(await page.getByText('Change file').count(), 0)
  await page.getByRole('button', { name: 'Export backup…' }).click()
  await page.waitForFunction(() => window.__shared.length === 1)
  const shared = await page.evaluate(() => window.__shared[0])
  assert.equal(shared.name, 'WealthTracker.wvault'); assert.ok(shared.size > 100)
  assert.equal(await page.getByTestId('last-backup').innerText(), 'today')
  await page.getByText(/Uninstalling the app, or clearing its data, deletes your vault/).waitFor()

  step('Restore: asks first, replaces the vault only with a valid backup, then asks for the passphrase')
  const backupB64 = (await disk())['WealthTracker.wvault']
  writeFileSync(`${OUT}/backup.wvault`, Buffer.from(backupB64, 'base64'))
  writeFileSync(`${OUT}/not-a-vault.wvault`, 'this is not a vault')
  await page.getByRole('button', { name: 'Restore…' }).click()
  await dialog().getByText(/replaces the vault stored in this app/).waitFor()
  await dialog().getByRole('button', { name: 'Cancel' }).click()
  assert.equal((await disk())['WealthTracker.wvault'], backupB64, 'cancel changes nothing')
  await page.getByRole('button', { name: 'Restore…' }).click()
  const [bad] = await Promise.all([page.waitForEvent('filechooser'), dialog().getByRole('button', { name: 'Choose a backup file…' }).click()])
  await bad.setFiles(`${OUT}/not-a-vault.wvault`)
  await page.waitForTimeout(500)
  assert.equal((await disk())['WealthTracker.wvault'], backupB64, 'a file that is not a vault never replaces the real one')
  await page.getByRole('button', { name: 'Restore…' }).click()
  const [good] = await Promise.all([page.waitForEvent('filechooser'), dialog().getByRole('button', { name: 'Choose a backup file…' }).click()])
  await good.setFiles(`${OUT}/backup.wvault`)
  await topTab('Finance Dashboard').click() // the unlock screen lives on the Finance tab
  await page.getByRole('heading', { name: 'Your vault' }).waitFor()
  await unlock(PASS)
  await page.getByText('Update date', { exact: true }).waitFor()
  await subtab(/USA/).click(); await showAssets(); await page.getByText('Brokerage').first().waitFor()

  step('Back button: closes a dialog first, then goes to Home, then leaves the app from Home')
  await topTab(/Property/).click()
  await page.getByRole('tab', { name: /Property/, selected: true }).waitFor()
  await topTab('Finance Dashboard').click()
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await dialog().waitFor()
  await back() // closes the dialog and nothing else
  await dialog().waitFor({ state: 'detached' })
  await page.getByRole('tab', { name: 'Finance Dashboard', selected: true }).waitFor()
  await back() // now Home
  await page.getByRole('tab', { name: 'Home', selected: true }).waitFor()
  await topTab(/Retirement/).click()
  await back()
  await page.getByRole('tab', { name: 'Home', selected: true }).waitFor()
  assert.equal(await page.evaluate(() => !!window.__exited), false)
  await back()
  assert.equal(await page.evaluate(() => !!window.__exited), true)

  step('coming back after a long time away locks the vault; a short break does not')
  await topTab('Finance Dashboard').click()
  await page.getByText('Update date', { exact: true }).waitFor()
  await page.evaluate(() => { window.__realNow = Date.now; window.__state(false); Date.now = () => window.__realNow() + 60_000; window.__state(true) }) // away 1 minute
  await page.waitForTimeout(300)
  assert.equal(await page.getByRole('heading', { name: 'Your vault' }).count(), 0, 'one minute away: still unlocked')
  await page.evaluate(() => { window.__state(false); Date.now = () => window.__realNow() + 60_000 + 11 * 60_000; window.__state(true) }) // 11 more minutes
  await page.getByRole('heading', { name: 'Your vault' }).waitFor()
  await page.evaluate(() => { Date.now = window.__realNow })
  await unlock(PASS)
  await page.getByText('Update date', { exact: true }).waitFor()

  step('Delete: the button stays off until DELETE is typed exactly; then the vault is erased and first launch returns')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Delete…' }).click()
  const del = dialog().getByRole('button', { name: 'Delete', exact: true })
  assert.ok(await del.isDisabled())
  await dialog().getByLabel('Type DELETE to confirm').fill('delete')
  assert.ok(await del.isDisabled(), 'lowercase is not accepted')
  await dialog().getByRole('button', { name: 'Cancel' }).click()
  assert.ok('WealthTracker.wvault' in (await disk()))
  await page.getByRole('button', { name: 'Delete…' }).click()
  await dialog().getByLabel('Type DELETE to confirm').fill('DELETE')
  await del.click()
  await topTab('Finance Dashboard').click()
  await page.getByRole('heading', { name: 'Create your vault' }).waitFor()
  assert.equal(Object.keys(await disk()).length, 0, 'nothing is left in the app folder')

  step('phone layout: no sideways scrolling')
  assert.equal(await overflow(), 0)
  await topTab('Home').click()
  assert.equal(await overflow(), 0)
  await page.screenshot({ path: `${OUT}/phone-home.png`, fullPage: true })
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('ANDROID E2E PASSED')
