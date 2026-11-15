// End-to-end check of the placeholder sign-in. Run:  npm run build && npm run test:e2e:auth
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const step = (s) => console.log('•', s)
const wantSignIn = () => page.getByRole('button', { name: /Sign in with Google/ }).waitFor()

try {
  await page.goto('http://localhost:4180/')
  step('first visit shows only the sign-in screen, labelled as a demo')
  await wantSignIn()
  assert.equal(await page.getByRole('tab').count(), 0, 'no tabs before signing in')
  await page.getByText(/Demo sign-in/).waitFor()

  step('the Google button signs in and the app opens; it survives a reload')
  await page.getByRole('button', { name: /Sign in with Google/ }).click()
  await page.getByRole('tab', { name: 'Home' }).waitFor()
  await page.reload()
  await page.getByRole('tab', { name: 'Home' }).waitFor()

  step('account dialog shows the demo user and says the two-step check is on hold')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByText(/not a real Google account/).waitFor()
  await page.getByText(/on hold: nothing is enforced/).waitFor()

  step('sign out returns to sign-in; with the two-step preview on, the code screen sits in between')
  await page.getByLabel(/Preview the two-step verification/).check()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await wantSignIn()
  await page.getByRole('button', { name: /Sign in with Google/ }).click()
  await page.getByRole('heading', { name: 'Two-step verification' }).waitFor()
  assert.equal(await page.getByRole('tab').count(), 0, 'app stays closed until the step is passed')
  assert.ok(await page.getByRole('button', { name: 'Verify' }).isDisabled())
  await page.getByLabel('Verification code').fill('12ab34')
  assert.equal(await page.getByLabel('Verification code').inputValue(), '1234') // letters are dropped
  await page.getByLabel('Verification code').fill('123456')
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.getByRole('tab', { name: 'Home' }).waitFor()

  step('cancel from the code screen goes back to sign-in; turning the preview off skips the step')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('button', { name: /Sign in with Google/ }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await wantSignIn()
  await page.getByRole('button', { name: /Sign in with Google/ }).click()
  await page.getByLabel('Verification code').fill('000000'); await page.getByRole('button', { name: 'Verify' }).click()
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByLabel(/Preview the two-step verification/).uncheck()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('button', { name: /Sign in with Google/ }).click()
  await page.getByRole('tab', { name: 'Home' }).waitFor()

  step('phone: sign-in and account are usable without scrolling sideways')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await wantSignIn()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
} catch (e) {
  await page.screenshot({ path: '/tmp/auth-failure.png', fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('AUTH E2E PASSED')
