// End-to-end check of the AI chat, with Anthropic stood in for (a streamed reply). Run:  npm run build && npm run build:demo && npm run test:e2e:ai
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { autoSignIn } from './signin.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const PASS = 'correct horse battery staple'
const KEY = 'sk-ant-api03-' + 'k'.repeat(34)
const servers = [spawn('npx', ['vite', 'preview', '--port', '4190', '--strictPort'], { stdio: 'ignore' }), spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', '4191', '--strictPort'], { stdio: 'ignore' })]
await new Promise((r) => setTimeout(r, 3000))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
await ctx.route(/open-meteo|fcsapi|frankfurter/, (r) => r.abort('failed'))

// The stand-in for Anthropic: records every request, answers with a streamed reply, or an error status when asked.
const api = { calls: [], status: 200, text: 'A **safe withdrawal rate** is the share you can take each year.\n\n- Often quoted as 4%\n- It depends on your plan' }
const sseEvent = (e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`
await ctx.route('https://api.anthropic.com/v1/messages', async (route) => {
  const req = route.request()
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  api.calls.push({ headers: req.headers(), body: JSON.parse(req.postData() || '{}') })
  if (api.status !== 200) return route.fulfill({ status: api.status, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { message: 'nope' } }) })
  const pieces = api.text.match(/.{1,9}/gs)
  const body = sseEvent({ type: 'message_start' }) + pieces.map((t) => sseEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })).join('') + sseEvent({ type: 'message_stop' })
  return route.fulfill({ status: 200, headers: cors, contentType: 'text/event-stream', body })
})
const page = await ctx.newPage()
autoSignIn(page)
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const step = (s) => console.log('•', s)
const drawer = () => page.getByTestId('ai-drawer')
const ask = async (q) => { await drawer().getByLabel('Your message').fill(q); await drawer().getByRole('button', { name: 'Send' }).click() }

try {
  await page.goto('http://localhost:4190/')
  step('create a vault so there is private data that must never be sent')
  await page.getByRole('button', { name: /Create a new vault file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS); await page.getByLabel('Confirm passphrase').fill(PASS); await page.getByRole('checkbox').check()
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await page.getByRole('tab', { name: /Assets/ }).click()
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await page.getByRole('dialog').getByLabel('Account name').fill('Secret Brokerage 4242')
  await page.getByRole('dialog').getByLabel(/Current balance/).fill('987654')
  await page.getByRole('dialog').locator('.radios label', { hasText: /^Mine/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await page.getByText('Secret Brokerage 4242').first().waitFor()

  step('without a key the chat says Claude is not set up and points to Settings')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await drawer().getByTestId('ai-nokey').waitFor()
  assert.ok(await drawer().getByLabel('Your message').isDisabled())
  await drawer().getByRole('button', { name: 'Open AI settings' }).click()
  await page.locator('#set-ai').waitFor()

  step('Settings → AI assistant: a short key is refused; a good key is saved on this device and never shown again')
  await page.getByLabel('Claude API key').fill('short'); await page.locator('#set-ai').getByRole('button', { name: 'Save' }).click()
  await page.getByText('That does not look like an API key.').waitFor()
  await page.getByLabel('Claude API key').fill(KEY); await page.locator('#set-ai').getByRole('button', { name: 'Save' }).click()
  await page.getByText('Saved on this device. The key is not shown again.').waitFor()
  assert.equal(await page.getByLabel('Claude API key').inputValue(), '', 'the key box is empty again')
  assert.match((await page.getByLabel('Claude API key').getAttribute('placeholder')) || '', /Saved\. Paste a new key to replace it/)
  await page.getByTestId('ai-status').getByText('Key saved on this device').waitFor()
  assert.ok(!(await page.locator('body').innerText()).includes(KEY), 'the key is not on the page')
  const ls = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))
  assert.ok(!ls.includes(KEY), 'the key is not in localStorage (it is in IndexedDB)')
  await page.getByLabel('Claude model').fill('claude-sonnet-5-5'); await page.locator('#set-ai').getByRole('button', { name: 'Save' }).click()
  await page.getByText('Model saved. The saved key is unchanged.').waitFor()
  await page.getByLabel('Claude model').fill(''); await page.locator('#set-ai').getByRole('button', { name: 'Save' }).click()

  step('the chat asks you to confirm once: nothing from the vault is sent')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await drawer().getByTestId('ai-confirm').waitFor()
  await drawer().getByText(/Nothing from your vault is sent/).waitFor()
  assert.ok(await drawer().getByLabel('Your message').isDisabled(), 'typing is off until you confirm')
  assert.equal(api.calls.length, 0, 'nothing was sent before confirming')
  await drawer().getByRole('button', { name: 'OK, continue' }).click()
  await drawer().getByLabel('Your message').waitFor()

  step('a question streams an answer, rendered as bold and a list; the request carries only what was typed')
  await ask('What is a safe withdrawal rate?')
  await drawer().getByTestId('ai-answer').getByText('safe withdrawal rate').first().waitFor()
  await drawer().getByTestId('ai-answer').locator('li').nth(1).waitFor()
  assert.equal(await drawer().getByTestId('ai-answer').locator('b').first().innerText(), 'safe withdrawal rate')
  assert.equal(api.calls.length, 1)
  const c = api.calls[0]
  assert.equal(c.headers['x-api-key'], KEY); assert.equal(c.headers['anthropic-dangerous-direct-browser-access'], 'true'); assert.equal(c.headers['anthropic-version'], '2023-06-01')
  assert.equal(c.body.model, 'claude-haiku-5-5'); assert.equal(c.body.stream, true)
  assert.deepEqual(c.body.messages, [{ role: 'user', content: 'What is a safe withdrawal rate?' }])
  const sent = JSON.stringify(c.body)
  for (const secret of ['Secret Brokerage 4242', '987654', 'WealthTracker', PASS]) assert.ok(!sent.includes(secret), `private data leaked into the request: ${secret}`)

  step('a follow-up sends the earlier messages for context; Stop and New chat work')
  await ask('And for a 40 year retirement?')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="ai-answer"]').length === 2)
  assert.equal(api.calls[1].body.messages.length, 3)
  await drawer().getByRole('button', { name: 'New chat' }).click()
  assert.equal(await drawer().getByTestId('ai-user').count(), 0)
  assert.equal(await drawer().getByTestId('ai-confirm').count(), 0, 'the confirmation lasts for the session')

  step('errors are explained: a rejected key, an unknown model, a rate limit')
  api.status = 401; await ask('hello'); await drawer().getByTestId('ai-error').getByText('Anthropic rejected the API key.').waitFor()
  api.status = 404; await ask('hello again'); await drawer().getByTestId('ai-error').getByText(/does not know the model 'claude-haiku-5-5'/).waitFor()
  api.status = 429; await ask('once more'); await drawer().getByTestId('ai-error').getByText(/rate limit or spending limit/).waitFor()
  api.status = 200

  step('Escape closes the drawer; locking the app clears the conversation')
  await ask('keep this one'); await drawer().getByTestId('ai-answer').first().waitFor()
  await page.keyboard.press('Escape'); await drawer().waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Ask AI' }).click()
  assert.ok((await drawer().getByTestId('ai-user').count()) >= 1, 'closing keeps the conversation')
  await page.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Lock now/ }).first().click()
  await page.getByPlaceholder('Passphrase').fill(PASS); await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('button', { name: 'Ask AI' }).click()
  assert.equal(await drawer().getByTestId('ai-user').count(), 0, 'the conversation is gone after locking')
  await drawer().getByTestId('ai-confirm').waitFor() // and it asks to confirm again

  step('Remove key: the chat is off again')
  await page.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('tab', { name: 'Settings' }).click()
  page.once('dialog', (d) => d.accept())
  await page.locator('#set-ai').getByRole('button', { name: 'Remove key' }).click()
  await page.getByTestId('ai-status').getByText('No key').waitFor()
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await drawer().getByTestId('ai-nokey').waitFor()
  await page.getByRole('button', { name: 'Close chat' }).click()

  step('phone width: the drawer fills the screen without sideways scrolling')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Ask AI' }).click()
  const box = await drawer().boundingBox(); assert.ok(box.width <= 391)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
  await page.setViewportSize({ width: 1280, height: 900 })

  step('the demo site has no AI button and no AI settings')
  const demo = await ctx.newPage()
  await demo.goto('http://localhost:4191/')
  await demo.getByRole('button', { name: 'Continue without signing in' }).click()
  await demo.getByRole('button', { name: /Demo mode – nothing will be saved/ }).click()
  await demo.getByRole('status').filter({ hasText: 'DEMO MODE' }).waitFor()
  assert.equal(await demo.getByRole('button', { name: 'Ask AI' }).count(), 0)
  await demo.getByRole('tab', { name: 'Settings' }).click()
  assert.equal(await demo.locator('#set-ai').count(), 0)
} catch (e) {
  await page.screenshot({ path: '/tmp/ai-failure.png', fullPage: true })
  console.error('FAILED:', e.message)
  process.exitCode = 1
}
await browser.close(); servers.forEach((s) => s.kill())
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
if (errors.length) process.exitCode = 1
if (!process.exitCode) console.log('AI E2E PASSED')
