// End-to-end check of the built-in Google client ID (a build that has VITE_GOOGLE_CLIENT_ID set, as the normal build does).
// Run:  npm run build && npm run test:e2e:default-client
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { solveCheck, signInClick } from './signin.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const BUILT_IN = '597536085921-uhease1si0f9176fnj4dmtu5murfe882.apps.googleusercontent.com'
const MINE = '123456789012-abcdefghij1234.apps.googleusercontent.com'
const PORT = 4187
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const gsi = "window.__clients=[];window.google={accounts:{oauth2:{initTokenClient:function(c){window.__clients.push(c.client_id);return{requestAccessToken:function(o){if(o&&o.prompt==='none'){c.callback({error:'interaction_required'});return}setTimeout(function(){c.callback({access_token:'T',expires_in:3600})},20)}}}}}}"
await ctx.route(/accounts\.google\.com\/gsi\/client/, (r) => r.fulfill({ contentType: 'text/javascript', body: gsi }))
await ctx.route(/googleapis\.com\/oauth2\/v3\/userinfo/, (r) => r.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { sub: '1', email: 'sam@example.com', name: 'Sam Example', email_verified: true } }))
await ctx.route(/open-meteo|fcsapi|frankfurter/, (r) => r.abort('failed'))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const step = (s) => console.log('•', s)
const base = `http://localhost:${PORT}/`

try {
  await page.goto(base)
  step('first visit: no setup screen; straight to the sign-in page, which is the real one')
  await page.getByRole('button', { name: /Sign in with Google/ }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Connect your Google account' }).count(), 0)
  await page.getByText(/Only your name and email are read/).waitFor()

  step('signing in uses the built-in client ID; nothing is saved about it in the browser')
  await signInClick(page)
  await page.getByRole('tab', { name: 'Home' }).waitFor()
  assert.ok((await page.evaluate(() => window.__clients)).includes(BUILT_IN))
  assert.equal(await page.evaluate(() => localStorage.getItem('google.clientId')), null)

  step('Settings → Account says so, and offers your own, or turning Google off')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByText(/Built-in Google client 597536085921-uhease1si0f/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Use the built-in one' }).count(), 0)
  await page.getByRole('button', { name: 'Use my own…' }).click()
  await page.getByLabel('OAuth client ID').fill(MINE)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText(/Your own client ID 123456789012-abcdefghij1/).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('google.clientId')), MINE)
  await page.getByRole('button', { name: 'Use the built-in one' }).click()
  await page.getByText(/Built-in Google client/).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('google.clientId')), null)

  step('Turn off Google: the placeholder sign-in, remembered; the built-in client is not used again until you switch it back on')
  await page.getByRole('button', { name: 'Turn off Google' }).click()
  await page.getByText('Not set up').waitFor()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByText(/Demo sign-in/).waitFor()
  await page.reload()
  await page.getByText(/Demo sign-in/).waitFor()
  await signInClick(page)
  await page.getByRole('tab', { name: 'Home' }).waitFor()
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Use the built-in one' }).click()
  await page.getByText(/Built-in Google client/).waitFor()

  step('with the built-in client, Google Drive is offered on the start screen (optional)')
  await page.getByRole('tab', { name: 'Finance Dashboard' }).click()
  assert.ok(await page.getByRole('button', { name: /Create in Google Drive/ }).isEnabled())
  assert.ok(await page.getByRole('button', { name: /Create a new vault file/ }).isEnabled())

  step('signing in is optional: continue without it, then sign in later from Settings → Account')
  await page.reload()
  await page.getByRole('button', { name: 'Continue without signing in' }).click()
  await page.getByRole('tab', { name: 'Home' }).waitFor()
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByTestId('who-note').getByText(/not signed in/).waitFor()
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await page.getByText(/Signed in as/).waitFor()
  await page.getByText(/sam@example\.com/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Sign in with Google' }).count(), 0)
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
}
await browser.close(); server.kill()
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
if (errors.length) process.exitCode = 1
if (!process.exitCode) console.log('DEFAULT CLIENT E2E PASSED')
