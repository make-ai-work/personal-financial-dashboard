// Plain Excel export/import in the flat layout: Items, Insurance, Balances, Rates, Settings.
// The export is NOT encrypted. Loaded lazily because exceljs is large.
import { COUNTRIES, OWNERS, MIX } from './format.js'
import { emptyData, uid } from './model.js'
import { sanitizeCountries } from './countries.js'
import { SPECIES } from './pets.js'

const load = async () => {
  const mod = await import('exceljs')
  return mod.default || mod
}

const ITEMS = ['ID', 'Country', 'Type', 'Name', 'Account number', 'Institution', 'Owner', 'Current balance',
  ...MIX.map((m) => `${m.label} %`), 'Maturity date', 'Value at maturity']
const PETS = ['ID', 'Name', 'Species', 'Breed', 'Sex', 'Neutered', 'Birth date', 'Icon', 'Microchip', 'Vet', 'Vet phone',
  'Insurance', 'Insurance renews', 'Food', 'Allergies', 'Notes']
const PET_RECORDS = ['ID', 'Pet ID', 'Type', 'Name / reason', 'Date', 'Dose', 'Repeat', 'Next due', 'Ends on', 'Last given', 'Vet', 'Cost', 'Weight kg', 'Notes']
const INSURANCE = ['ID', 'Country', 'Policy', 'Policy number', 'Policy company', 'Owner', 'Death benefit', 'Maturity date', 'Value on maturity']

function sheet(wb, name, headers, rows) {
  const ws = wb.addWorksheet(name)
  ws.addRow(headers).font = { bold: true }
  rows.forEach((r) => ws.addRow(r))
  ws.columns.forEach((c, i) => (c.width = Math.max(12, String(headers[i]).length + 4)))
  return ws
}

export async function exportWorkbook(data) {
  const ExcelJS = await load()
  const wb = new ExcelJS.Workbook()
  sheet(wb, 'Items', ITEMS, data.accounts.map((a) => [
    a.id, a.country, a.type, a.name, a.number || '', a.institution || '', a.owner, a.balance ?? 0,
    ...(a.mix || [null, null, null, null]), a.maturityDate || '', a.maturityValue ?? null,
  ]))
  sheet(wb, 'Insurance', INSURANCE, data.policies.map((p) => [
    p.id, p.country, p.name, p.number || '', p.company || '', p.owner, p.deathBenefit ?? null, p.maturityDate || '', p.maturityValue ?? null,
  ]))
  sheet(wb, 'Balances', ['Date', 'Account ID', 'Amount'], data.balances.map((b) => [b.date, b.accountId, b.amount]))
  sheet(wb, 'Rates', ['Date', 'From', 'To', 'Rate'], data.rates.map((r) => [r.date, r.from, r.to, r.rate]))
  sheet(wb, 'Pets', PETS, data.pets.map((p) => [
    p.id, p.name, p.species, p.breed || '', p.sex || '', p.neutered || '', p.birthDate || '', p.icon || '', p.microchip || '',
    p.vet || '', p.vetPhone || '', p.insurance || '', p.insuranceRenews || '', p.food || '', p.allergies || '', p.notes || '',
  ]))
  sheet(wb, 'PetRecords', PET_RECORDS, data.petRecords.map((r) => [
    r.id, r.petId, r.type, r.name || '', r.date || '', r.dose || '', r.repeat || '', r.nextDue || '', r.endDate || '',
    r.lastGiven || '', r.vet || '', r.cost ?? null, r.weightKg ?? null, r.notes || '',
  ]))
  sheet(wb, 'Settings', ['Key', 'Value'], [
    ['countries', data.settings.countries.join(',')],
    ['propertyCountries', data.settings.propertyCountries.join(',')],
    ['parentLabel', data.settings.parentLabel],
    ['autoLockMin', data.settings.autoLockMin],
    ['petSoonDays', data.settings.petSoonDays],
    ['petCurrency', data.settings.petCurrency],
    ['weightUnit', data.settings.weightUnit],
  ])
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

const pad = (n) => String(n).padStart(2, '0')
function cell(v) {
  if (v == null) return ''
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  if (typeof v === 'object') {
    if ('result' in v) return cell(v.result)
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text)
  }
  return v
}
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

function readRows(ws) {
  if (!ws) return []
  const header = ws.getRow(1).values.slice(1).map((h) => String(cell(h)).trim())
  const rows = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const vals = row.values.slice(1)
    if (!vals.some((v) => cell(v) !== '')) return
    rows.push(Object.fromEntries(header.map((h, i) => [h, cell(vals[i])])))
  })
  return rows
}

export async function importWorkbook(buffer) {
  const ExcelJS = await load()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  if (!wb.getWorksheet('Items')) {
    throw new Error('This file is not in the Finance Dashboard layout (no "Items" sheet). Export one from Settings to see the layout.')
  }
  const data = emptyData()
  const warnings = []
  const seen = new Set()
  for (const r of readRows(wb.getWorksheet('Items'))) {
    if (!COUNTRIES[r.Country] || !['asset', 'liability'].includes(r.Type) || !r.Name) {
      warnings.push(`Skipped item row "${r.Name || '(no name)'}": needs a valid Country, Type and Name.`)
      continue
    }
    const mix = MIX.map((m) => num(r[`${m.label} %`]))
    const id = r.ID && !seen.has(r.ID) ? String(r.ID) : uid()
    seen.add(id)
    data.accounts.push({
      id, country: r.Country, type: r.Type, name: String(r.Name), number: String(r['Account number'] ?? ''),
      institution: String(r.Institution ?? ''), owner: OWNERS.includes(r.Owner) ? r.Owner : 'mine',
      balance: num(r['Current balance']) ?? 0, mix: mix.some((x) => x) ? mix.map((x) => x ?? 0) : null,
      maturityDate: String(r['Maturity date'] ?? ''), maturityValue: num(r['Value at maturity']),
    })
  }
  for (const r of readRows(wb.getWorksheet('Insurance'))) {
    if (!COUNTRIES[r.Country] || !r.Policy) {
      warnings.push(`Skipped insurance row "${r.Policy || '(no name)'}": needs a valid Country and Policy.`)
      continue
    }
    data.policies.push({
      id: r.ID ? String(r.ID) : uid(), country: r.Country, name: String(r.Policy), number: String(r['Policy number'] ?? ''),
      company: String(r['Policy company'] ?? ''), owner: OWNERS.includes(r.Owner) ? r.Owner : 'mine',
      deathBenefit: num(r['Death benefit']) ?? 0, maturityDate: String(r['Maturity date'] ?? ''), maturityValue: num(r['Value on maturity']),
    })
  }
  const ids = new Set(data.accounts.map((a) => a.id))
  for (const r of readRows(wb.getWorksheet('Balances'))) {
    if (ids.has(String(r['Account ID'])) && r.Date && num(r.Amount) != null) {
      data.balances.push({ date: String(r.Date), accountId: String(r['Account ID']), amount: num(r.Amount) })
    }
  }
  for (const r of readRows(wb.getWorksheet('Rates'))) {
    if (r.Date && r.From && r.To && num(r.Rate) > 0) data.rates.push({ date: String(r.Date), from: r.From, to: r.To, rate: num(r.Rate) })
  }
  const petIds = new Set()
  const speciesKeys = SPECIES.map((x) => x.key)
  for (const r of readRows(wb.getWorksheet('Pets'))) {
    if (!r.Name) {
      warnings.push('Skipped a pet row with no name.')
      continue
    }
    const id = r.ID && !petIds.has(String(r.ID)) ? String(r.ID) : uid()
    petIds.add(id)
    data.pets.push({
      id, name: String(r.Name), species: speciesKeys.includes(r.Species) ? r.Species : 'other', breed: String(r.Breed ?? ''),
      sex: String(r.Sex ?? ''), neutered: String(r.Neutered ?? ''), birthDate: String(r['Birth date'] ?? ''), icon: String(r.Icon ?? ''),
      microchip: String(r.Microchip ?? ''), vet: String(r.Vet ?? ''), vetPhone: String(r['Vet phone'] ?? ''), insurance: String(r.Insurance ?? ''),
      insuranceRenews: String(r['Insurance renews'] ?? ''), food: String(r.Food ?? ''), allergies: String(r.Allergies ?? ''), notes: String(r.Notes ?? ''),
    })
  }
  for (const r of readRows(wb.getWorksheet('PetRecords'))) {
    if (!petIds.has(String(r['Pet ID'])) || !['vaccine', 'medication', 'visit', 'weight'].includes(r.Type)) {
      warnings.push(`Skipped pet record "${r['Name / reason'] || r.Type || '(blank)'}": unknown pet or type.`)
      continue
    }
    data.petRecords.push({
      id: r.ID ? String(r.ID) : uid(), petId: String(r['Pet ID']), type: r.Type, name: String(r['Name / reason'] ?? ''), date: String(r.Date ?? ''),
      dose: String(r.Dose ?? ''), repeat: String(r.Repeat ?? ''), nextDue: String(r['Next due'] ?? ''), endDate: String(r['Ends on'] ?? ''),
      lastGiven: String(r['Last given'] ?? ''), vet: String(r.Vet ?? ''), cost: num(r.Cost), weightKg: num(r['Weight kg']), notes: String(r.Notes ?? ''),
    })
  }
  for (const r of readRows(wb.getWorksheet('Settings'))) {
    if (r.Key === 'countries') data.settings.countries = sanitizeCountries(String(r.Value).split(',').map((x) => x.trim()), data.settings.countries)
    if (r.Key === 'propertyCountries') data.settings.propertyCountries = sanitizeCountries(String(r.Value).split(',').map((x) => x.trim()), data.settings.countries)
    if (r.Key === 'parentLabel' && r.Value) data.settings.parentLabel = String(r.Value)
    if (r.Key === 'autoLockMin' && num(r.Value) != null) data.settings.autoLockMin = num(r.Value)
    if (r.Key === 'petSoonDays' && num(r.Value) > 0) data.settings.petSoonDays = num(r.Value)
    if (r.Key === 'petCurrency' && COUNTRIES[r.Value]) data.settings.petCurrency = r.Value
    if (r.Key === 'weightUnit' && ['kg', 'lb'].includes(r.Value)) data.settings.weightUnit = r.Value
  }
  return { data, warnings }
}
