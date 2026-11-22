// End-to-end check of the optional Google Drive storage, with Google and Drive stood in for. Run:  npm run build && npm run test:e2e:drive
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { autoSignIn } from './signin.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/drive-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'
const ID = '123456789012-abcdefghij1234.apps.googleusercontent.com'
const PORT = 4186
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()

// ---- stand-in for Google Drive (in memory) ----
const drive = { files: new Map(), n: 0, clock: 1000, scopes: [], reject401: 0, calls: [] }
const stamp = () => new Date(++drive.clock * 1000).toISOString()
const parseMultipart = (buf) => {
  const text = buf.toString('latin1')
  const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(text)[1])
  const marker = 'application/octet-stream\r\n\r\n'
  const start = text.indexOf(marker) + marker.length
  return { meta, bytes: Buffer.from(text.slice(start, text.lastIndexOf('\r\n--')), 'latin1') }
}
const routeDrive = async (route) => {
  const req = route.request(), u = new URL(req.url()), method = req.method()
  drive.calls.push(`${method} ${u.pathname}`)
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  const json = (obj, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(obj) })
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  if (drive.reject401 > 0) { drive.reject401--; return json({ error: { message: 'Invalid Credentials' } }, 401) }
  if (req.headers().authorization !== 'Bearer DRIVE-TOKEN') return json({ error: { message: 'bad token' } }, 401)
  if (u.pathname === '/drive/v3/files' && method === 'GET') {
    const name = /name = '([^']+)'/.exec(u.searchParams.get('q'))[1]
    return json({ files: [...drive.files.entries()].filter(([, f]) => f.name === name).map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime, size: String(f.bytes.length) })).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1)) })
  }
  if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const { meta, bytes } = parseMultipart(req.postDataBuffer())
    const id = `file${++drive.n}`; drive.files.set(id, { name: meta.name, bytes, modifiedTime: stamp() })
    return json({ id, name: meta.name, modifiedTime: drive.files.get(id).modifiedTime })
  }
  const m = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(u.pathname)
  if (m) {
    const f = drive.files.get(m[1]); if (!f) return json({ error: { message: 'File not found' } }, 404)
    if (method === 'DELETE') { drive.files.delete(m[1]); return route.fulfill({ status: 204, headers: cors }) } // gone for good
    if (method === 'PATCH' && /json/.test(req.headers()['content-type'] || '')) { if (JSON.parse(req.postData()).trashed) drive.files.delete(m[1]); return json({}) } // moved to the bin
    if (method === 'PATCH') { f.bytes = req.postDataBuffer(); f.modifiedTime = stamp(); return json({ modifiedTime: f.modifiedTime }) }
    if (u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, headers: cors, contentType: 'application/octet-stream', body: f.bytes })
    return json({ modifiedTime: f.modifiedTime })
  }
  return json({}, 400)
}
const gsiScript = `window.__gsiMode='ok';window.__gsiSession=localStorage.getItem('test.gsi')==='on';window.__scopes=[];window.google={accounts:{oauth2:{initTokenClient:function(c){return{requestAccessToken:function(o){window.__scopes.push(c.scope+'|'+(o&&o.prompt));var drive=/drive/.test(c.scope);var tok=drive?'DRIVE-TOKEN':'T';if(o&&o.prompt==='none'&&!window.__gsiSession){c.callback({error:'interaction_required'});return}setTimeout(function(){c.callback({access_token:tok,expires_in:3600})},20)}}},revoke:function(t,cb){cb&&cb()}}}}`

async function newPage(ctx) {
  await ctx.route(/accounts\.google\.com\/gsi\/client/, (r) => r.fulfill({ contentType: 'text/javascript', body: gsiScript }))
  await ctx.route(/googleapis\.com\/oauth2\/v3\/userinfo/, (r) => r.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { sub: '1001', email: 'sam@example.com', name: 'Sam Example', email_verified: true } }))
  await ctx.route(/www\.googleapis\.com\/(upload\/)?drive\//, routeDrive)
  await ctx.route(/open-meteo|fcsapi|frankfurter/, (r) => r.abort('failed'))
  const page = await ctx.newPage()
  autoSignIn(page, { stub: false })
  return page
}
const errors = []
const step = (s) => console.log('•', s)
const base = `http://localhost:${PORT}`

try {
  // ---------- with Google set up ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((id) => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; localStorage.setItem('google.clientId', id); localStorage.setItem('test.gsi', 'on') }, ID)
  const page = await newPage(ctx)
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/401|ERR_FAILED/.test(m.text()) && errors.push(m.text()))
  await page.goto(`${base}/`)
  await page.getByRole('heading', { name: 'Where should your data live?' }).waitFor() // the quiet sign-in worked

  step('Where to save: Drive sits next to the vault file options (both need the Google sign-in; demo mode is greyed out)')
  for (const n of [/Create a new vault file/, /Open an existing vault file/, /Import from an Excel file/, /Create in Google Drive/, /Open from Google Drive/]) assert.ok(await page.getByRole('button', { name: n }).isEnabled(), String(n))

  step('create the vault in Drive: the passphrase never leaves the device; only a WVLT1 ciphertext file is uploaded')
  await page.getByRole('button', { name: /Create in Google Drive/ }).click()
  await page.getByText(/Only the encrypted file is uploaded to your Google Drive/).waitFor()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create in Google Drive' }).click()
  await page.getByRole('tab', { name: 'Home', selected: true }).waitFor()
  await page.getByRole('tab', { name: /Assets/ }).click()
  await page.getByText('Update date', { exact: true }).waitFor()
  await page.getByText(/WealthTracker\.wvault · Google Drive · encrypted · saved/).waitFor()
  assert.equal(drive.files.size, 1)
  const first = [...drive.files.values()][0]
  assert.equal(first.bytes.subarray(0, 5).toString(), 'WVLT1'); assert.ok(first.bytes.length > 200)
  assert.ok((await page.evaluate(() => window.__scopes)).some((s) => s.startsWith('https://www.googleapis.com/auth/drive.file|')), 'only the drive.file scope was asked for')
  assert.ok(!(await page.evaluate(() => window.__scopes)).some((s) => /drive(?!\.file)/.test(s.replace('drive.file', ''))), 'never the broad Drive scope')
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))
  assert.ok(!stored.includes('DRIVE-TOKEN') && !stored.includes(PASS), 'no pass and no passphrase are stored')
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('vault.drive'))), { id: 'file1', name: 'WealthTracker.wvault' })

  step('changes are saved to Drive on their own, still encrypted')
  const before = first.modifiedTime
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await page.getByRole('dialog').getByLabel('Account name').fill('Drive Brokerage 999')
  await page.getByRole('dialog').getByLabel(/Current balance/).fill('4200')
  await page.getByRole('dialog').locator('.radios label', { hasText: /^Mine/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await page.getByText(/Google Drive · encrypted · saved/).waitFor()
  await page.waitForFunction(() => true); await page.waitForTimeout(1200)
  const saved = [...drive.files.values()][0]
  assert.notEqual(saved.modifiedTime, before); assert.ok(!saved.bytes.toString('latin1').includes('Drive Brokerage 999'), 'the file in Drive holds no plaintext')

  step('after a reload the app finds the Drive file again and only needs the passphrase')
  await page.reload()
  await page.getByText('Stored in your Google Drive.').waitFor()
  await page.getByPlaceholder('Passphrase').fill('wrong passphrase here'); await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Wrong passphrase or damaged file.').waitFor()
  await page.getByPlaceholder('Passphrase').fill(PASS); await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('tab', { name: /Assets/ }).click()
  await page.getByText('Update date', { exact: true }).waitFor()
  await page.locator('.ctoggle', { hasText: 'Assets' }).waitFor()
  if ((await page.locator('.ctoggle', { hasText: 'Assets' }).getAttribute('aria-expanded')) === 'false') await page.locator('.ctoggle', { hasText: 'Assets' }).click()
  await page.getByText('Drive Brokerage 999').first().waitFor()

  step('another device saved first: nothing is overwritten; you choose to keep your changes or use the Drive version')
  const remote = [...drive.files.values()][0]; remote.modifiedTime = stamp() // another device saved (the bytes are a valid older copy here)
  const theirs = Buffer.from(remote.bytes)
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await page.getByRole('dialog').getByLabel('Account name').fill('Second account 111')
  await page.getByRole('dialog').getByLabel(/Current balance/).fill('10')
  await page.getByRole('dialog').locator('.radios label', { hasText: /^Mine/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await page.getByText(/changed on another device/).first().waitFor()
  assert.deepEqual(remote.bytes, theirs, 'the other device’s file was not overwritten')
  await page.getByRole('button', { name: 'Keep my changes' }).click()
  await page.getByText(/Google Drive · encrypted · saved/).waitFor()
  assert.notDeepEqual(remote.bytes, theirs, 'now it holds my changes')
  remote.modifiedTime = stamp() // and again
  const theirs2 = Buffer.from(remote.bytes)
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await page.getByRole('dialog').getByLabel('Account name').fill('Third account 222')
  await page.getByRole('dialog').getByLabel(/Current balance/).fill('20')
  await page.getByRole('dialog').locator('.radios label', { hasText: /^Mine/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Use the Drive version' }).click()
  await page.getByPlaceholder('Passphrase').fill(PASS); await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Update date', { exact: true }).waitFor()
  if ((await page.locator('.ctoggle', { hasText: 'Assets' }).getAttribute('aria-expanded')) === 'false') await page.locator('.ctoggle', { hasText: 'Assets' }).click()
  assert.equal(await page.getByText('Third account 222').count(), 0, 'my unsaved change was dropped as chosen')
  assert.deepEqual(remote.bytes, theirs2)

  step('the pass ran out and could not be renewed quietly: changes are kept and "Reconnect" saves them')
  await page.evaluate(() => { window.__gsiSession = false }) // Google no longer answers quietly
  drive.reject401 = 1 // the next request is refused (the pass ran out); the quiet renewal then fails too
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await page.getByRole('dialog').getByLabel('Account name').fill('Reconnect account 333')
  await page.getByRole('dialog').getByLabel(/Current balance/).fill('30')
  await page.getByRole('dialog').locator('.radios label', { hasText: /^Mine/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Reconnect Google Drive' }).waitFor()
  await page.getByText(/not saved: reconnect Google Drive/).waitFor()
  const stale = Buffer.from([...drive.files.values()][0].bytes)
  await page.getByRole('button', { name: 'Reconnect Google Drive' }).click()
  await page.getByText(/Google Drive · encrypted · saved/).waitFor()
  assert.notDeepEqual([...drive.files.values()][0].bytes, stale, 'the waiting changes were saved after reconnecting')

  step('Settings (gear): shows where the file is, and moving back to a file on this computer works')
  await page.getByRole('tab', { name: 'Settings' }).click()
  const row = page.getByTestId('storage-row'); const move = page.getByTestId('move-row')
  await row.getByText('Google Drive · WealthTracker.wvault').waitFor()
  await move.getByRole('button', { name: 'Move to a vault file…' }).click() // this browser cannot keep a file location: it downloads a copy and stays in Drive
  await page.getByText(/cannot save to a chosen location/).waitFor()
  await row.getByText('Google Drive · WealthTracker.wvault').waitFor()
  await page.getByRole('button', { name: 'Switch vault' }).click()
  await page.getByRole('button', { name: /Create a new vault file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS); await page.getByLabel('Confirm passphrase').fill(PASS); await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await page.getByRole('tab', { name: /Assets/ }).click()
  await page.getByText('Update date', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('vault.drive')), null, 'the Drive choice was dropped')

  step('moving to Drive is refused while a vault is already there, and works once it is not (the computer file stays)')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await move.getByRole('button', { name: 'Move to Google Drive…' }).click()
  await page.getByText(/Your Google Drive already has a vault/).waitFor()
  assert.equal(drive.files.size, 1)
  drive.files.clear()
  await move.getByRole('button', { name: 'Move to Google Drive…' }).click()
  await page.getByText(/Moved to your Google Drive/).waitFor()
  assert.equal(drive.files.size, 1); assert.equal([...drive.files.values()][0].bytes.subarray(0, 5).toString(), 'WVLT1')
  await row.getByText('Google Drive · WealthTracker.wvault').waitFor()

  step('Danger zone: Wipe data deletes the Drive file for good and returns to Where to save')
  await page.getByRole('tab', { name: 'Settings' }).click()
  assert.equal(drive.files.size, 1)
  await page.locator('#set-danger').getByRole('button', { name: 'Wipe data…' }).click()
  await page.getByLabel('Type WIPE to confirm').fill('WIPE'); await page.getByRole('dialog').getByRole('button', { name: 'Wipe data' }).click()
  await page.getByRole('heading', { name: 'Where should your data live?' }).waitFor()
  assert.equal(drive.files.size, 0, 'the vault in Drive is erased'); assert.equal(await page.evaluate(() => localStorage.getItem('vault.drive')), null)

  step('phone width: no sideways scrolling on the start screen')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
  await ctx.close()

  // ---------- the Android app: same choices; moving keeps the old copy until you delete it ----------
  {
    step('Android app: Drive works through the phone sign-in, and moving keeps the old copy until you delete it')
    drive.files.clear(); drive.calls.length = 0
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript((id) => {
      localStorage.setItem('google.clientId', id)
      const disk = () => JSON.parse(localStorage.getItem('fakeDisk') || '{}'), save = (d) => localStorage.setItem('fakeDisk', JSON.stringify(d))
      const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s) }
      window.__logins = []
      globalThis.__DASHBOARD_APP_TEST__ = {
        fs: { read: async (p) => { const d = disk(); return p in d ? Uint8Array.from(atob(d[p]), (c) => c.charCodeAt(0)) : null }, write: async (p, b) => { const d = disk(); d[p] = b64(b); save(d) }, remove: async (p) => { const d = disk(); delete d[p]; save(d) } },
        share: async () => {},
        app: { onBack: async () => () => {}, onState: async () => () => {}, exit: () => {} },
        google: { login: async (o) => { window.__logins.push(o.scopes); return { accessToken: o.scopes.length ? { token: 'DRIVE-TOKEN' } : null, profile: { id: '1', email: 'sam@example.com', name: 'Sam Example' } } } },
      }
    }, ID)
    const page = await newPage(ctx)
    page.on('pageerror', (e) => errors.push(e.message))
    const disk = () => page.evaluate(() => JSON.parse(localStorage.getItem('fakeDisk') || '{}'))
    await page.goto(`${base}/`)
    await page.getByRole('button', { name: /Create in Google Drive/ }).waitFor() // signed in through the phone; Where should your data live?
    await page.getByRole('button', { name: /Create a new vault file/ }).click()
    await page.getByLabel('Passphrase', { exact: true }).fill(PASS); await page.getByLabel('Confirm passphrase').fill(PASS); await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Create vault' }).click()
    await page.getByRole('tab', { name: 'Home', selected: true }).waitFor()
    assert.equal(Object.keys(await disk()).filter((k) => !k.endsWith('.tmp')).length, 1, 'the vault is inside the app')

    await page.getByRole('tab', { name: 'Settings' }).click()
    const row = page.getByTestId('storage-row'), move = page.getByTestId('move-row'), old = page.getByTestId('old-copy')
    await row.getByText('Vault file · inside this app').waitFor()
    await move.getByRole('button', { name: 'Move to Google Drive…' }).click()
    await page.getByText(/Moved to your Google Drive/).waitFor()
    assert.deepEqual(await page.evaluate(() => window.__logins.at(-1)), ['https://www.googleapis.com/auth/drive.file'])
    assert.equal(drive.files.size, 1); assert.equal([...drive.files.values()][0].bytes.subarray(0, 5).toString(), 'WVLT1')
    await row.getByText('Google Drive · WealthTracker.wvault').waitFor()

    step('the old copy is NOT deleted; a message says so; deleting asks you to confirm')
    await old.getByText(/Your old copy still exists/).waitFor()
    await old.getByText(/still inside this app/).waitFor()
    assert.equal(Object.keys(await disk()).filter((k) => !k.endsWith('.tmp')).length, 1, 'still there after the move')
    await old.getByRole('button', { name: 'Delete old copy…' }).click()
    assert.equal(Object.keys(await disk()).filter((k) => !k.endsWith('.tmp')).length, 1, 'asking is not deleting')
    await old.getByRole('button', { name: 'Cancel' }).click()
    await old.getByRole('button', { name: 'Delete old copy…' }).click()
    await old.getByRole('button', { name: /Yes, delete the old copy/ }).click()
    await page.getByText('The old copy was deleted.').waitFor()
    assert.equal(Object.keys(await disk()).filter((k) => !k.endsWith('.tmp')).length, 0)
    assert.equal(await old.count(), 0); assert.equal(drive.files.size, 1, 'the Drive copy is untouched')

    step('moving back into the app copies and checks first; the Drive copy stays until deleted; the notice survives a reload')
    await move.getByRole('button', { name: 'Move to a vault file…' }).click()
    await page.getByText(/Moved to a vault file/).waitFor()
    await row.getByText('Vault file · inside this app').waitFor()
    assert.equal(drive.files.size, 1, 'the Drive copy was not deleted by the move')
    await page.reload()
    await page.getByPlaceholder('Passphrase').fill(PASS); await page.getByRole('button', { name: 'Unlock' }).click()
    await page.getByRole('tab', { name: 'Home', selected: true }).waitFor()
    await page.getByRole('tab', { name: 'Settings' }).click()
    await old.getByText(/still in your Google Drive/).waitFor()
    await old.getByRole('button', { name: 'Delete old copy…' }).click()
    await old.getByRole('button', { name: /Yes, delete the old copy/ }).click()
    await page.getByText('The old copy was deleted.').waitFor()
    assert.equal(drive.files.size, 0, 'the Drive copy is now deleted (moved to the bin)')
    assert.equal(Object.keys(await disk()).filter((k) => !k.endsWith('.tmp')).length, 1, 'the vault in the app is untouched')

    step('Android: signing in used the phone’s Google account with identity only, and nothing about the user is stored')
    await page.getByTestId('who-note').getByText(/Signed in as Sam Example/).waitFor()
    assert.deepEqual(await page.evaluate(() => window.__logins[0]), [], 'identity only: no extra permissions at sign-in')
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)).then((j) => /sam@example|Sam Example/.test(j)), false, 'nothing about the user is stored')
    await ctx.close()
  }
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
}
await browser.close(); server.kill()
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
if (errors.length) process.exitCode = 1
if (!process.exitCode) console.log('DRIVE E2E PASSED')
