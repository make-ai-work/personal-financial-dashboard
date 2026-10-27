// End-to-end check of the Pets tab. Run:  npm run build && npm run test:e2e:pets
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url) // playwright is provided globally (NODE_PATH), not a project dependency
const { chromium } = require('playwright')
const OUT = process.env.E2E_OUT || '/tmp/pets-e2e'
mkdirSync(OUT, { recursive: true })
const PASS = 'correct horse battery staple'

const server = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
await ctx.route('**/api.frankfurter.dev/**', (r) => r.fulfill({ json: { base: 'USD', date: '2026-10-27', rates: { INR: 84 } } }))
const page = await ctx.newPage()
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'))
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const step = (s) => console.log('•', s)
const dialog = () => page.getByRole('dialog')
const fill = async (f) => { for (const [l, v] of Object.entries(f)) await dialog().getByLabel(l, { exact: false }).first().fill(v) }
const save = async () => { await dialog().getByRole('button', { name: /^Save/ }).click(); await dialog().waitFor({ state: 'detached' }) }

async function addRecord(type, fields, pet) {
  await page.getByRole('button', { name: '+ Add record' }).click()
  await dialog().locator('.rec-types').getByRole('button', { name: type }).click()
  if (pet) await dialog().getByLabel('Pet').selectOption({ label: pet })
  await fill(fields)
}

try {
  await page.goto('http://localhost:4175/')
  await page.getByRole('tab', { name: /Pets/ }).click()

  step('pets tab asks for the vault, then creates it')
  await page.getByRole('button', { name: /Create a new encrypted file/ }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(PASS)
  await page.getByLabel('Confirm passphrase').fill(PASS)
  await page.getByRole('checkbox').check()
  const [vault] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Create encrypted file' }).click()])
  await vault.saveAs(`${OUT}/pets.wvault`)
  await page.getByText('No pets yet').waitFor()

  step('add two pets (validation first)')
  await page.getByRole('button', { name: '+ Add a pet' }).click()
  await dialog().getByRole('button', { name: 'Save pet' }).click()
  assert.match(await dialog().innerText(), /Name is required/)
  await fill({ Name: 'Milo', Breed: 'Labrador', 'Birth date': '2020-04-12', 'Vet name': 'Parkside Veterinary', Food: 'Royal Canin Adult', Allergies: 'Chicken', 'Pet insurance': 'PetSure POL-88231', 'Insurance renews': '2027-03-01', 'Microchip number': '985110001234567' })
  await dialog().getByLabel('Sex').selectOption('male')
  await dialog().getByLabel('Neutered').selectOption('yes')
  await save()
  await page.getByText('6 yrs 6 mo').waitFor() // age computed from the birth date on the pet page
  await page.getByRole('button', { name: '+ Add pet' }).click()
  await fill({ Name: 'Luna', 'Birth date': '2022-09-03' })
  await dialog().getByLabel('Species').selectOption('cat')
  await dialog().getByLabel('Sex').selectOption('female')
  await save()

  step('records: vaccines, medication, visits, weights')
  await page.getByRole('button', { name: /Milo/ }).first().click()
  await addRecord('Vaccination', { Vaccine: 'Rabies', 'Date given': '2023-11-15', Cost: '60' }, null)
  await dialog().getByLabel('Repeats every').selectOption('3y')
  assert.equal(await dialog().getByLabel(/Next due/).inputValue(), '2026-11-15') // auto-filled from the interval
  await save()
  await page.getByText('due in 19 days').first().waitFor()
  await addRecord('Vaccination', { Vaccine: 'DHPP', 'Date given': '2026-03-02' })
  await save()
  await addRecord('Medication', { Medication: 'Heartworm pill', 'Last given': '2026-10-01', Dose: '1 tablet' })
  assert.equal(await dialog().getByLabel(/Next due/).inputValue(), '2026-11-01')
  await save()
  await addRecord('Medication', { Medication: 'Ear drops', 'Last given': '2026-10-03' })
  await dialog().getByLabel(/^Repeats/).selectOption('daily')
  await dialog().getByLabel('Course ends on').fill('2026-11-05')
  await save()
  await addRecord('Vet visit', { 'Reason for visit': 'Ear infection', 'Visit date': '2026-10-03', 'Vet / clinic': 'Parkside Veterinary', Cost: '148' })
  await save()
  await addRecord('Vet visit', { 'Reason for visit': 'Annual check-up', 'Visit date': '2026-03-02', Cost: '310' })
  await save()
  for (const [d, w] of [['2026-01-05', '28.9'], ['2026-01-25', '29.1'], ['2026-10-03', '29.4']]) {
    await addRecord('Weight', { 'Date weighed': d, 'Weight (kg)': w })
    await save()
  }
  await page.getByRole('button', { name: /Luna/ }).first().click()
  await addRecord('Medication', { Medication: 'Flea treatment', 'Last given': '2026-09-20' })
  await save()
  await addRecord('Vet visit', { 'Reason for visit': 'Annual check-up', 'Visit date': '2025-12-10' })
  await dialog().getByLabel('Next check-up due').fill('2026-12-10')
  await save()

  step('pet page content')
  await page.getByRole('button', { name: /Milo/ }).first().click()
  const milo = await page.locator('.page').innerText()
  assert.match(milo, /Male · neutered/)
  assert.match(milo, /29\.4 kg/)
  assert.match(milo, /Royal Canin Adult/)
  assert.ok(await page.locator('.chart circle').count() === 2) // Jan (latest of two) + Oct
  assert.ok(await page.getByText('ends 5 Nov 2026').first().isVisible())
  await page.screenshot({ path: `${OUT}/milo.png`, fullPage: true })

  step('Done rolls a medication forward')
  await page.getByRole('row', { name: /Heartworm pill/ }).getByRole('button', { name: 'Done' }).click()
  assert.ok(await page.getByRole('row', { name: /Heartworm pill/ }).getByText('due 27 Nov 2026').isVisible()) // a month on from today; 31 days is outside the 30-day window

  step('overview: upcoming sorted, overdue flagged, spending')
  await page.getByRole('button', { name: 'Overview' }).click()
  const rows = await page.locator('.rem').allInnerTexts()
  assert.match(rows[0], /Luna · Flea treatment[\s\S]*overdue 7 days/) // 20 Sep + 1 month = 20 Oct, 7 days before today
  assert.match(rows.join('|'), /Milo · Rabies[\s\S]*due in 19 days/)
  assert.match(rows.join('|'), /Luna · Annual check-up[\s\S]*due 10 Dec 2026/)
  const order = rows.map((r) => r.split('\n')[0])
  assert.ok(order.findIndex((r) => /Flea/.test(r)) < order.findIndex((r) => /Rabies/.test(r)))
  assert.match(await page.locator('.pet').first().innerText(), /Milo[\s\S]*Rabies|Milo[\s\S]*Ear drops/)
  assert.match(await page.locator('.panel', { hasText: 'Spending' }).innerText(), /Milo\s+2\s+\$ 458/) // 148 + 310; the 2023 rabies dose is outside 2026
  await page.screenshot({ path: `${OUT}/overview.png`, fullPage: true })

  step('settings: weight unit switches to lb, reminder window changes statuses')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'lb' }).click()
  await page.getByRole('button', { name: /Milo/ }).first().click()
  assert.match(await page.locator('.prof').innerText(), /64\.8 lb/)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel(/Remind me/).selectOption('14')
  await page.getByRole('button', { name: 'Overview' }).click()
  assert.match(await page.locator('.rem', { hasText: 'Rabies' }).innerText(), /due 15 Nov 2026/) // 19 days is now outside the 14-day window
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel(/Remind me/).selectOption('30')

  step('delete a pet removes its records')
  await page.getByRole('button', { name: /Luna/ }).first().click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete pet' }).click()
  await page.getByRole('button', { name: 'Overview' }).waitFor()
  assert.equal(await page.locator('.pet:not(.add-card)').count(), 1)
  assert.ok(!(await page.locator('.page').innerText()).includes('Flea treatment'))

  step('persistence: lock, wrong passphrase, unlock, download, reload, reopen')
  await page.getByRole('button', { name: 'Lock now' }).click()
  await page.getByPlaceholder('Passphrase').fill('definitely wrong')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Wrong passphrase or damaged file.').waitFor()
  await page.getByPlaceholder('Passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('button', { name: /Milo/ }).first().waitFor()
  const [saved] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download to save' }).click()])
  await saved.saveAs(`${OUT}/pets.wvault`)
  const raw = (await import('node:fs')).readFileSync(`${OUT}/pets.wvault`).toString('latin1')
  for (const t of ['Milo', 'Heartworm', 'PetSure', '985110001234567']) assert.ok(!raw.includes(t), `plaintext leaked: ${t}`)
  await page.reload()
  await page.getByRole('tab', { name: /Pets/ }).click()
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Open an existing encrypted file/ }).click()])
  await fc.setFiles(`${OUT}/pets.wvault`)
  await page.getByPlaceholder('Passphrase').fill(PASS)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('button', { name: /Milo/ }).first().click()
  assert.match(await page.locator('.page').innerText(), /Heartworm pill[\s\S]*Rabies|Rabies[\s\S]*Heartworm pill/)
  assert.match(await page.locator('.prof').innerText(), /64\.8 lb/) // settings persisted too

  step('the Finance tab shares the same unlocked vault, and Excel export includes pets')
  await page.getByRole('tab', { name: 'Finance Dashboard' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  page.once('dialog', (d) => d.accept())
  const [xl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export…' }).click()])
  await xl.saveAs(`${OUT}/export.xlsx`)
  const wb = new (require('exceljs').Workbook)()
  await wb.xlsx.readFile(`${OUT}/export.xlsx`)
  assert.ok(JSON.stringify(wb.getWorksheet('Pets').getSheetValues()).includes('Milo'))
  assert.ok(wb.getWorksheet('PetRecords').rowCount >= 8)
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true })
  console.error('FAILED:', e.message)
  await browser.close(); server.kill(); process.exit(1)
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none')
assert.equal(errors.length, 0)
await browser.close(); server.kill()
console.log('PETS E2E PASSED')
