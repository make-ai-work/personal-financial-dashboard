// Plain Excel export/import in the flat layout: Items, Insurance, Balances, Rates, Settings.
// The export is NOT encrypted. Loaded lazily because exceljs is large.
import { COUNTRIES, OWNERS, MIX } from './format.js'
import { emptyData, uid } from './model.js'

const load = async () => {
  const mod = await import('exceljs')
  return mod.default || mod
}

const ITEMS = ['ID', 'Country', 'Type', 'Name', 'Account number', 'Institution', 'Owner', 'Current balance',
  ...MIX.map((m) => `${m.label} %`), 'Maturity date', 'Value at maturity']
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
  sheet(wb, 'Settings', ['Key', 'Value'], [
    ['countries', data.settings.countries.join(',')],
    ['parentLabel', data.settings.parentLabel],
    ['autoLockMin', data.settings.autoLockMin],
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
  for (const r of readRows(wb.getWorksheet('Settings'))) {
    if (r.Key === 'countries') {
      const c = String(r.Value).split(',').map((x) => x.trim())
      if (c.length === 2 && c.every((x) => COUNTRIES[x]) && c[0] !== c[1]) data.settings.countries = c
    }
    if (r.Key === 'parentLabel' && r.Value) data.settings.parentLabel = String(r.Value)
    if (r.Key === 'autoLockMin' && num(r.Value) != null) data.settings.autoLockMin = num(r.Value)
  }
  return { data, warnings }
}
