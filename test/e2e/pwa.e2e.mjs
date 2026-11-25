// End-to-end check of "Run as an app" (the installable web app): manifest, icons, service worker, opening offline, and the Install button.
// Run:  npm run build && npm run test:e2e:pwa
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { autoDemo } from './signin.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const PORT = 4185
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addInitScript(() => { localStorage.setItem('google.setupSkipped', '1') })
await ctx.route(/open-meteo|fcsapi|frankfurter/, (r) => r.abort('failed'))
const page = await ctx.newPage()
autoDemo(page)
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const step = (s) => console.log('•', s)
const base = `http://localhost:${PORT}`

try {
  await page.goto(`${base}/`)
  step('the page links a manifest with the name, standalone display, colours and three icons (including a maskable one)')
  assert.equal(await page.locator('link[rel=manifest]').getAttribute('href'), './manifest.webmanifest')
  assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'), '#0f4c4c')
  const m = await (await page.request.get(`${base}/manifest.webmanifest`)).json()
  assert.deepEqual([m.name, m.display, m.start_url, m.scope, m.theme_color], ['WealthBridge', 'standalone', './', './', '#0f4c4c'])
  assert.deepEqual(m.icons.map((i) => `${i.sizes}:${i.purpose}`).sort(), ['192x192:any', '512x512:any', '512x512:maskable'])
  for (const i of m.icons) { const r = await page.request.get(`${base}/${i.src}`); assert.equal(r.status(), 200); assert.equal(r.headers()['content-type'], 'image/png') }

  step('a service worker takes control, and the app opens again with no connection')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.getByRole('tab', { name: 'Home' }).waitFor()
  await ctx.setOffline(true)
  await page.reload()
  await page.getByRole('tab', { name: 'Home' }).waitFor() // the page itself came from the saved copy
  await page.getByText('Welcome').count() // (sign-in is signed out after a reload; autoSignIn got us back in)
  await ctx.setOffline(false)

  step('the worker only touches this app’s own files: other sites and live files are left alone')
  const sw = await (await page.request.get(`${base}/sw.js`)).text()
  assert.ok(sw.includes('url.origin !== self.location.origin') && sw.includes('av-snapshot') && sw.includes('oauth-callback'))
  const cached = await page.evaluate(async () => { const c = await caches.open('finance-dashboard-v1'); return (await c.keys()).map((r) => new URL(r.url).pathname) })
  assert.ok(cached.length > 0 && cached.every((p) => p.startsWith('/')), 'only same-address files')
  assert.ok(!cached.some((p) => /frankfurter|open-meteo|googleapis/.test(p)))

  step('Settings → This device: the Install button appears when the browser offers it, asks, and then goes away')
  await page.getByRole('tab', { name: 'Settings' }).click()
  const row = page.getByTestId('run-as-app')
  await row.getByText(/Install this site as an app/).waitFor() // no offer yet: plain instructions
  assert.equal(await row.getByRole('button', { name: 'Install as app' }).count(), 0)
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    e.prompt = () => { window.__prompted = true }
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  await row.getByRole('button', { name: 'Install as app' }).click()
  assert.equal(await page.evaluate(() => window.__prompted), true)
  await row.getByRole('button', { name: 'Install as app' }).waitFor({ state: 'detached' })

  step('phone width: no sideways scrolling on the Settings page')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
}
await browser.close(); server.kill()
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
if (errors.length) process.exitCode = 1
if (!process.exitCode) console.log('PWA E2E PASSED')
