// End-to-end check in real Chromium. Run:  npm run build && npm run test:e2e
// Forces the "download" save path (no File System Access API) so it can run headless,
// and mocks the FX API so the exchange rate is deterministic.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url) // playwright is provided globally (NODE_PATH), not a project dependency
const { chromium } = require('playwright')

const OUT = process.env.E2E_OUT || '/tmp/finance-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'
const URL = 'http://localhost:4173/'

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
await ctx.route('**/api.frankfurter.dev/**', (r) => r.fulfill({ json: { base: 'USD', date: '2026-10-27', rates: { INR: 84 } } }))
const page = await ctx.newPage()
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00')) // 'today' must not drift
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const step = (s) => console.log('•', s)
const addAccount = async (btn, f, owner) => {
  await page.getByRole('button', { name: btn }).click()
  const m = page.getByRole('dialog')
  for (const [label, v] of Object.entries(f)) await m.getByLabel(label).fill(v)
  if (owner) await m.locator('.radios label', { hasText: new RegExp('^' + owner) }).click()
  await m.getByRole('button', { name: 'Save' }).click()
  await m.waitFor({ state: 'detached' })
}

try {
  await page.goto(URL)
  await page.getByRole('tab', { name: 'Finance Dashboard' }).click()

  step('create encrypted vault')
  await page.getByRole('button', { name: /Create a new encrypted file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await dl.saveAs(`${OUT}/WealthTracker.wvault`)
  await page.getByText('Summary ·').waitFor()

  step('add accounts and policy in USA')
  await page.getByRole('button', { name: /USA/ }).first().click()
  await addAccount('+ Add asset', { 'Account name': 'Checking', 'Account number': '000123456821', 'Bank / holding company': 'Chase', 'Current balance (USD)': '8200', 'Cash equivalents': '100' })
  await addAccount('+ Add asset', { 'Account name': 'Brokerage', 'Account number': 'X55203718', 'Bank / holding company': 'Schwab', 'Current balance (USD)': '96000', Equities: '85', 'Cash equivalents': '10', Bonds: '5' }, 'Joint')
  await addAccount('+ Add asset', { 'Account name': 'CD', 'Account number': '7710334450', 'Bank / holding company': 'Ally', 'Current balance (USD)': '22000', 'Cash equivalents': '100', 'Deposit maturity date (optional)': '2027-02-01', 'Value at maturity (optional, USD)': '23100' }, 'Parent')
  await addAccount('+ Add liability', { 'Account name': 'Mortgage', 'Account number': '3300918823', Lender: 'Wells Fargo', 'Current balance (USD)': '78000' }, 'Joint')
  await page.getByRole('button', { name: '+ Add policy' }).click()
  const pm = page.getByRole('dialog')
  for (const [l, v] of Object.entries({ 'Policy name': 'Term life', 'Policy number': 'POL-100234', 'Policy company': 'AIG', 'Death benefit (USD)': '750000' })) await pm.getByLabel(l).fill(v)
  await pm.getByRole('button', { name: 'Save' }).click()

  step('masking, totals, validation')
  assert.ok(await page.getByText('•••• 6821').isVisible())
  assert.ok(!(await page.locator('body').innerText()).includes('000123456821'))
  await page.getByRole('button', { name: 'Show account numbers' }).click()
  assert.ok(await page.getByText('000123456821').isVisible())
  await page.getByRole('button', { name: 'Hide account numbers' }).click()
  assert.match(await page.locator('.kpis').innerText(), /\$ 48,200/) // net = 8200+96000+22000-78000
  await page.getByRole('button', { name: '+ Add asset' }).click()
  await page.getByLabel('Account name').fill('Bad mix')
  await page.getByLabel('Current balance (USD)').fill('1')
  await page.getByLabel('Equities').fill('50')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  assert.match(await page.getByRole('dialog').innerText(), /must total 100%/)
  await page.getByRole('button', { name: 'Cancel' }).click()

  step('save two dated updates (Aug, then Oct) so the chart has a carried-forward month')
  await page.locator('.upd input[type=date]').fill('2026-08-10')
  await page.getByRole('button', { name: 'Save update' }).click()
  assert.ok(await page.locator('.banner').count() === 0)
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await page.getByLabel('Current balance (USD)').fill('9200')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  assert.ok(await page.locator('.banner').isVisible()) // unsaved balance change detected
  await page.locator('.upd input[type=date]').fill('2026-10-27')
  await page.getByRole('button', { name: 'Save update' }).click()
  assert.equal(await page.locator('.chart circle').count(), 3) // Aug, Sep (carried), Oct
  assert.equal(await page.locator('.chart circle[fill="var(--surface)"]').count(), 1)
  await page.screenshot({ path: `${OUT}/usa.png`, fullPage: true })

  step('owner filter')
  await page.locator('.filterbar .seg').getByRole('button', { name: 'Joint' }).click()
  assert.match(await page.locator('.kpis').innerText(), /\$ 18,000/) // 96000 - 78000
  await page.locator('.filterbar .seg').getByRole('button', { name: 'All' }).click()

  step('summary with FX')
  await page.getByRole('button', { name: 'Summary' }).click()
  await page.getByText('1 USD = ₹ 84').waitFor()
  const sum = await page.locator('.tblw').first().innerText()
  assert.match(sum, /Total in USD[\s\S]*\$ 49,200/) // Checking edited to 9,200 -> net 49,200
  assert.match(sum, /Total in INR[\s\S]*₹ 41,32,800/) // 49,200 x 84, Indian digit grouping
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  process.exitCode = 1
}
await page.screenshot({ path: `${OUT}/summary.png`, fullPage: true })
if (process.exitCode) { await browser.close(); server.kill(); process.exit(1) }

step('lock / wrong / right passphrase')
await page.getByRole('button', { name: 'Lock now' }).click()
await page.getByPlaceholder('Passphrase').fill('wrong passphrase here')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByText('Wrong passphrase or damaged file.').waitFor()
await page.getByPlaceholder('Passphrase').fill(PASS)
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByText('Summary ·').waitFor()

step('saved file holds no plaintext, then reopen it after a reload')
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download to save' }).click().catch(() => null)])
await dl2?.saveAs(`${OUT}/WealthTracker.wvault`)
const raw = readFileSync(`${OUT}/WealthTracker.wvault`).toString('latin1')
for (const s of ['000123456821', 'Checking', 'Chase', 'POL-100234']) assert.ok(!raw.includes(s), `plaintext leaked: ${s}`)
await page.reload()
await page.getByRole('tab', { name: 'Finance Dashboard' }).click()
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Open an existing encrypted file/ }).click()])
await fc.setFiles(`${OUT}/WealthTracker.wvault`)
await page.getByPlaceholder('Passphrase').fill(PASS)
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByText('Summary ·').waitFor()
await page.getByRole('button', { name: /USA/ }).first().click()
assert.ok(await page.getByText('Brokerage').isVisible())

step('excel export is a readable flat workbook; import restores it')
await page.getByRole('button', { name: 'Settings' }).click()
page.once('dialog', (d) => d.accept())
const [xl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export…' }).click()])
await xl.saveAs(`${OUT}/export.xlsx`)
const ExcelJS = require('exceljs')
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(`${OUT}/export.xlsx`)
assert.deepEqual(wb.worksheets.map((w) => w.name), ['Items', 'Insurance', 'Balances', 'Rates', 'Pets', 'PetRecords', 'Property', 'PropertyValues', 'Loans', 'LoanUpdates', 'Settings'])
assert.ok(JSON.stringify(wb.getWorksheet('Items').getSheetValues()).includes('000123456821'))
await page.screenshot({ path: `${OUT}/settings.png`, fullPage: true })

await page.getByRole('button', { name: 'Change file' }).click()
const [xc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Import from an Excel file/ }).click()])
await xc.setFiles(`${OUT}/export.xlsx`)
await page.getByText(/Imported 4 items, 1 policies and 8 balances/).waitFor()

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
assert.equal(errors.length, 0)
await browser.close()
server.kill()
console.log('E2E PASSED')
