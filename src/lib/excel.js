// Plain Excel export/import in the flat layout: Items, Insurance, Balances, Rates, Settings.
// The export is NOT encrypted. Loaded lazily because exceljs is large.
import { COUNTRIES, OWNERS, MIX } from './format.js'
import { emptyData, uid } from './model.js'
import { sanitizeCountries } from './countries.js'
import { SPECIES } from './pets.js'
import { PROPERTY_TYPES, VALUE_SOURCES } from './property.js'
import { CLASSES as PF_CLASSES } from './portfolio.js'

const load = async () => {
  const mod = await import('exceljs')
  return mod.default || mod
}

const ITEMS = ['ID', 'Country', 'Type', 'Name', 'Account number', 'Institution', 'Owner', 'Current balance',
  ...MIX.map((m) => `${m.label} %`), 'Maturity date', 'Value at maturity']
const PETS = ['ID', 'Name', 'Species', 'Breed', 'Sex', 'Neutered', 'Birth date', 'Icon', 'Microchip', 'Vet', 'Vet phone',
  'Insurance', 'Insurance renews', 'Food', 'Allergies', 'Notes']
const PET_RECORDS = ['ID', 'Pet ID', 'Type', 'Name / reason', 'Date', 'Dose', 'Repeat', 'Next due', 'Ends on', 'Last given', 'Vet', 'Cost', 'Weight kg', 'Notes']
const PROPERTY = ['ID', 'Name', 'Country', 'Address', 'Type', 'Owner', 'Purchase date', 'Purchase price', 'Bedrooms', 'Bathrooms', 'Size sq ft',
  'Property tax / year', 'Insurance / year', 'HOA / month', 'Next tax due', 'Notes']
const PROPERTY_VALUES = ['ID', 'Property ID', 'Date', 'Value', 'Source', 'Notes']
const LOANS = ['ID', 'Property ID', 'Lender', 'Loan number', 'Original amount', 'Start date', 'Term years', 'Rate %', 'Rate type', 'Monthly payment', 'Escrow', 'Payment day', 'Notes']
const LOAN_UPDATES = ['ID', 'Loan ID', 'Date', 'Balance', 'Principal', 'Interest', 'Escrow', 'Notes']
const PORTFOLIOS = ['ID', 'Name', 'Finance account ID', 'Reconciled', 'Opening balance', 'Target equities %', 'Target bonds %', 'Target cash %', 'Target metals %']
const HOLDINGS = ['ID', 'Portfolio ID', 'Name', 'Ticker', 'Type', 'Class', 'Split equities %', 'Split cash %', 'Split metals %', 'Split bonds %',
  'Sector', 'Geography', 'Track by', 'Units', 'Price', 'Value', 'Price date', 'Notes']
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
  sheet(wb, 'Property', PROPERTY, data.properties.map((p) => [
    p.id, p.name, p.country, p.address || '', p.type, p.owner, p.purchaseDate || '', p.purchasePrice ?? null, p.bedrooms ?? null, p.bathrooms ?? null,
    p.sizeSqft ?? null, p.taxYear ?? null, p.insuranceYear ?? null, p.hoaMonth ?? null, p.taxDue || '', p.notes || '',
  ]))
  sheet(wb, 'PropertyValues', PROPERTY_VALUES, data.propertyValues.map((v) => [v.id, v.propertyId, v.date, v.value, v.source, v.notes || '']))
  sheet(wb, 'Loans', LOANS, data.loans.map((l) => [
    l.id, l.propertyId, l.lender, l.number || '', l.originalAmount ?? null, l.startDate || '', l.termYears ?? null, l.rate ?? null, l.rateType || '',
    l.monthlyPayment ?? null, l.escrow ?? null, l.paymentDay ?? null, l.notes || '',
  ]))
  sheet(wb, 'LoanUpdates', LOAN_UPDATES, data.loanUpdates.map((u) => [u.id, u.loanId, u.date, u.balance, u.principal ?? null, u.interest ?? null, u.escrow ?? null, u.notes || '']))
  sheet(wb, 'Portfolios', PORTFOLIOS, data.portfolios.map((p) => [
    p.id, p.name, p.accountId, p.reconciled ? 'yes' : 'no', p.openingBalance ?? null,
    p.targets?.equities ?? null, p.targets?.bonds ?? null, p.targets?.cash ?? null, p.targets?.metals ?? null,
  ]))
  sheet(wb, 'Holdings', HOLDINGS, data.holdings.map((h) => [
    h.id, h.portfolioId, h.name, h.ticker || '', h.type, h.cls, ...(h.mix || [null, null, null, null]), h.sector || '', h.geo || '', h.trackBy,
    h.units ?? null, h.price ?? null, h.value ?? null, h.priceDate || '', h.notes || '',
  ]))
  sheet(wb, 'Settings', ['Key', 'Value'], [
    ['countries', data.settings.countries.join(',')],
    ['propertyCountries', data.settings.propertyCountries.join(',')],
    ['portfolioCountries', data.settings.portfolioCountries.join(',')],
    ['concentrationLimit', data.settings.concentrationLimit],
    ['rebalanceTol', data.settings.rebalanceTol],
    ['priceStaleDays', data.settings.priceStaleDays],
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
  const propIds = new Set()
  const typeKeys = PROPERTY_TYPES.map((t) => t.key)
  const sourceKeys = VALUE_SOURCES.map((x) => x.key)
  for (const r of readRows(wb.getWorksheet('Property'))) {
    if (!r.Name || !COUNTRIES[r.Country]) {
      warnings.push(`Skipped property "${r.Name || '(no name)'}": needs a name and a valid country.`)
      continue
    }
    const id = r.ID && !propIds.has(String(r.ID)) ? String(r.ID) : uid()
    propIds.add(id)
    data.properties.push({
      id, name: String(r.Name), country: r.Country, address: String(r.Address ?? ''), type: typeKeys.includes(r.Type) ? r.Type : 'other',
      owner: OWNERS.includes(r.Owner) ? r.Owner : 'mine', purchaseDate: String(r['Purchase date'] ?? ''), purchasePrice: num(r['Purchase price']),
      bedrooms: num(r.Bedrooms), bathrooms: num(r.Bathrooms), sizeSqft: num(r['Size sq ft']), taxYear: num(r['Property tax / year']),
      insuranceYear: num(r['Insurance / year']), hoaMonth: num(r['HOA / month']), taxDue: String(r['Next tax due'] ?? ''), notes: String(r.Notes ?? ''),
    })
  }
  for (const r of readRows(wb.getWorksheet('PropertyValues'))) {
    if (propIds.has(String(r['Property ID'])) && r.Date && num(r.Value) > 0) {
      data.propertyValues.push({ id: r.ID ? String(r.ID) : uid(), propertyId: String(r['Property ID']), date: String(r.Date), value: num(r.Value), source: sourceKeys.includes(r.Source) ? r.Source : 'other', notes: String(r.Notes ?? '') })
    } else warnings.push('Skipped a property value row: unknown property, missing date or no value.')
  }
  const loanIds = new Set()
  for (const r of readRows(wb.getWorksheet('Loans'))) {
    if (!propIds.has(String(r['Property ID'])) || !r.Lender) {
      warnings.push(`Skipped loan "${r.Lender || '(no lender)'}": unknown property or no lender.`)
      continue
    }
    const id = r.ID && !loanIds.has(String(r.ID)) ? String(r.ID) : uid()
    loanIds.add(id)
    data.loans.push({
      id, propertyId: String(r['Property ID']), lender: String(r.Lender), number: String(r['Loan number'] ?? ''), originalAmount: num(r['Original amount']),
      startDate: String(r['Start date'] ?? ''), termYears: num(r['Term years']), rate: num(r['Rate %']), rateType: r['Rate type'] === 'adjustable' ? 'adjustable' : 'fixed',
      monthlyPayment: num(r['Monthly payment']), escrow: num(r.Escrow), paymentDay: num(r['Payment day']), notes: String(r.Notes ?? ''),
    })
  }
  for (const r of readRows(wb.getWorksheet('LoanUpdates'))) {
    if (loanIds.has(String(r['Loan ID'])) && r.Date && num(r.Balance) != null) {
      data.loanUpdates.push({ id: r.ID ? String(r.ID) : uid(), loanId: String(r['Loan ID']), date: String(r.Date), balance: num(r.Balance), principal: num(r.Principal), interest: num(r.Interest), escrow: num(r.Escrow), notes: String(r.Notes ?? '') })
    } else warnings.push('Skipped a loan update row: unknown loan, missing date or no balance.')
  }
  const pfIds = new Set()
  const accountIds = new Set(data.accounts.map((a) => a.id))
  const clsKeys = [...PF_CLASSES.map((c) => c.key), 'mixed', 'unallocated']
  for (const r of readRows(wb.getWorksheet('Portfolios'))) {
    if (!r.Name || !accountIds.has(String(r['Finance account ID'])) || data.portfolios.some((p) => p.accountId === String(r['Finance account ID']))) {
      warnings.push(`Skipped portfolio "${r.Name || '(no name)'}": unknown or already-linked Finance account.`)
      continue
    }
    const id = r.ID && !pfIds.has(String(r.ID)) ? String(r.ID) : uid()
    pfIds.add(id)
    const t = { equities: num(r['Target equities %']), bonds: num(r['Target bonds %']), cash: num(r['Target cash %']), metals: num(r['Target metals %']) }
    data.portfolios.push({
      id, name: String(r.Name), accountId: String(r['Finance account ID']), reconciled: r.Reconciled === 'yes', openingBalance: num(r['Opening balance']) ?? 0,
      targets: Object.values(t).some((x) => x != null) ? Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v ?? 0])) : null,
    })
  }
  for (const r of readRows(wb.getWorksheet('Holdings'))) {
    if (!pfIds.has(String(r['Portfolio ID'])) || !r.Name) {
      warnings.push(`Skipped holding "${r.Name || '(no name)'}": unknown portfolio.`)
      continue
    }
    const split = [r['Split equities %'], r['Split cash %'], r['Split metals %'], r['Split bonds %']].map(num)
    data.holdings.push({
      id: r.ID ? String(r.ID) : uid(), portfolioId: String(r['Portfolio ID']), name: String(r.Name), ticker: String(r.Ticker ?? ''), type: String(r.Type || 'other'),
      cls: clsKeys.includes(r.Class) ? r.Class : 'unallocated', mix: split.some((x) => x != null) ? split.map((x) => x ?? 0) : null, sector: String(r.Sector ?? ''),
      geo: String(r.Geography ?? ''), trackBy: r['Track by'] === 'value' ? 'value' : 'units', units: num(r.Units), price: num(r.Price), value: num(r.Value),
      priceDate: String(r['Price date'] ?? ''), notes: String(r.Notes ?? ''),
    })
  }
  for (const r of readRows(wb.getWorksheet('Settings'))) {
    if (r.Key === 'countries') data.settings.countries = sanitizeCountries(String(r.Value).split(',').map((x) => x.trim()), data.settings.countries)
    if (r.Key === 'propertyCountries') data.settings.propertyCountries = sanitizeCountries(String(r.Value).split(',').map((x) => x.trim()), data.settings.countries)
    if (r.Key === 'portfolioCountries') data.settings.portfolioCountries = sanitizeCountries(String(r.Value).split(',').map((x) => x.trim()), data.settings.countries)
    if (r.Key === 'concentrationLimit' && num(r.Value) > 0) data.settings.concentrationLimit = num(r.Value)
    if (r.Key === 'rebalanceTol' && num(r.Value) > 0) data.settings.rebalanceTol = num(r.Value)
    if (r.Key === 'priceStaleDays' && num(r.Value) > 0) data.settings.priceStaleDays = num(r.Value)
    if (r.Key === 'parentLabel' && r.Value) data.settings.parentLabel = String(r.Value)
    if (r.Key === 'autoLockMin' && num(r.Value) != null) data.settings.autoLockMin = num(r.Value)
    if (r.Key === 'petSoonDays' && num(r.Value) > 0) data.settings.petSoonDays = num(r.Value)
    if (r.Key === 'petCurrency' && COUNTRIES[r.Value]) data.settings.petCurrency = r.Value
    if (r.Key === 'weightUnit' && ['kg', 'lb'].includes(r.Value)) data.settings.weightUnit = r.Value
  }
  return { data, warnings }
}
