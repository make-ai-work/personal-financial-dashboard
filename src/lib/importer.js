// Upload a CSV or Excel file to create or update Portfolios (with their holdings) or Assets accounts. Pure planning code: it reads a table, guesses which
// column is which, and builds a PLAN that says exactly what would change. Nothing is applied until the user confirms the plan, and the user chooses:
//   'update' = UPDATE AND OVERWRITE what is already there     'add' = NEW ADDITION, keep what is there and add the new rows
// Holdings default to ONE PORTFOLIO PER COUNTRY, each linked to its own Assets account.
import { COUNTRIES, OWNERS } from './format.js'
import { addAccount, uid } from './model.js'
import { addHolding, addPortfolio, finishLinking, holdingsOf } from './portfolio.js'

// ---------- reading the file ----------
// Comma, semicolon or tab separated; quotes and doubled quotes; a leading BOM; blank lines ignored.
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const first = src.split(/\r?\n/).find((l) => l.trim()) || ''
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"') quoted = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = [] }
    else cell += c
  }
  row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

// Rows (arrays) -> { headers, rows: [{ header: value }] }. The header is the first row that has at least two filled cells.
export function tableFromRows(raw) {
  const at = raw.findIndex((r) => r.filter((c) => String(c ?? '').trim() !== '').length >= 2)
  if (at < 0) return { headers: [], rows: [] }
  const headers = raw[at].map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`)
  const rows = raw.slice(at + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== '')).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] == null ? '' : r[i]])))
  return { headers, rows }
}

// A File (or its name and contents) -> table. CSV and .txt are read as text; .xlsx through exceljs (loaded only now, it is large).
export async function readTable({ name, text, buffer }) {
  const ext = String(name || '').toLowerCase().split('.').pop()
  if (ext === 'xlsx') {
    const mod = await import('exceljs')
    const wb = new (mod.default || mod).Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('That workbook has no sheets.')
    const raw = []
    ws.eachRow({ includeEmpty: false }, (r) => { const v = r.values.slice(1).map((c) => (c && typeof c === 'object' ? (c.result ?? c.text ?? c.richText?.map((t) => t.text).join('') ?? '') : c)); raw.push(v) })
    return tableFromRows(raw)
  }
  if (ext === 'xls') throw new Error('Old .xls files are not supported. Save it as .xlsx or .csv and try again.')
  return tableFromRows(parseCsv(text))
}

export function toNumber(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim()
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s)
  s = s.replace(/[()]/g, '').replace(/[^0-9.,]/g, '')
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.') // 1.234,56
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null
}

// ---------- guessing the columns ----------
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const HOLDING_FIELDS = [
  { key: 'ticker', label: 'Ticker / symbol', aliases: ['ticker', 'symbol', 'ticker symbol', 'instrument', 'security', 'code'] },
  { key: 'name', label: 'Name', aliases: ['name', 'description', 'security name', 'holding', 'holding name', 'investment', 'fund name', 'asset'] },
  { key: 'units', label: 'Units / shares', aliases: ['quantity', 'shares', 'units', 'qty', 'no of shares', 'number of shares', 'share count'] },
  { key: 'price', label: 'Price per unit', aliases: ['price', 'last price', 'current price', 'market price', 'unit price', 'close', 'last'] },
  { key: 'value', label: 'Total value', aliases: ['market value', 'value', 'total value', 'current value', 'amount', 'balance'] },
  { key: 'country', label: 'Country', aliases: ['country', 'market', 'region', 'domicile'] },
  { key: 'currency', label: 'Currency', aliases: ['currency', 'ccy', 'curr'] },
  { key: 'type', label: 'Type', aliases: ['type', 'security type', 'asset type', 'instrument type'] },
  { key: 'cls', label: 'Asset class', aliases: ['asset class', 'class', 'category'] },
  { key: 'sector', label: 'Sector', aliases: ['sector', 'industry'] },
  { key: 'date', label: 'Price date', aliases: ['price date', 'date', 'as of', 'as of date', 'valuation date'] },
]
export const ACCOUNT_FIELDS = [
  { key: 'name', label: 'Account name', aliases: ['account name', 'name', 'account', 'description', 'nickname'] },
  { key: 'number', label: 'Account number', aliases: ['account number', 'number', 'account no', 'acct', 'account id', 'iban'] },
  { key: 'institution', label: 'Bank / holding company', aliases: ['institution', 'bank', 'broker', 'holding company', 'provider', 'lender', 'company'] },
  { key: 'owner', label: 'Owner', aliases: ['owner', 'holder', 'owned by'] },
  { key: 'country', label: 'Country', aliases: ['country', 'market', 'region'] },
  { key: 'currency', label: 'Currency', aliases: ['currency', 'ccy', 'curr'] },
  { key: 'type', label: 'Asset or liability', aliases: ['type', 'kind', 'asset or liability', 'class'] },
  { key: 'balance', label: 'Current balance', aliases: ['current balance', 'balance', 'amount', 'value', 'market value', 'total'] },
]
// -> { fieldKey: header | '' }. Exact matches win, then headers that contain an alias; each header is used once.
export function detectColumns(headers, fields) {
  const used = new Set()
  const out = Object.fromEntries(fields.map((f) => [f.key, '']))
  const take = (f, test) => { const h = headers.find((x) => !used.has(x) && test(norm(x), f)); if (h) { out[f.key] = h; used.add(h) } }
  for (const f of fields) take(f, (n) => f.aliases.includes(n))
  for (const f of fields) if (!out[f.key]) take(f, (n) => f.aliases.some((a) => n.includes(a) && a.length > 3))
  return out
}

// ---------- understanding values ----------
// A country from a code ('us'), a name ('United Kingdom', 'UK'), a flag, or a currency ('GBP'); '' when it cannot tell.
export function resolveCountry(country, currency) {
  const c = String(country || '').trim().toLowerCase()
  if (c) {
    for (const x of Object.values(COUNTRIES)) if (c === x.code || c === x.name.toLowerCase() || c === x.flag || c === x.currency.toLowerCase()) return x.code
    if (/^(united states|usa|u\.s\.a?\.?|america)$/.test(c)) return 'us'
    if (/^(united kingdom|great britain|england|gb|gbr)$/.test(c)) return 'uk'
    if (/^(republic of ireland|eire|irl)$/.test(c)) return 'ie'
    if (/^(ind)$/.test(c)) return 'in'
  }
  const cur = String(currency || '').trim().toUpperCase()
  if (cur) return Object.values(COUNTRIES).find((x) => x.currency === cur)?.code || (cur === 'GBX' ? 'uk' : '')
  return ''
}
const HOLDING_TYPE = { stock: 'stock', equity: 'stock', share: 'stock', shares: 'stock', etf: 'etf', fund: 'fund', 'mutual fund': 'fund', bond: 'bond', cash: 'cash', other: 'other' }
const CLASS_WORDS = [[/cash|money market/, 'cash'], [/bond|fixed income|treasury|debt/, 'bonds'], [/gold|silver|metal|commodit/, 'metals'], [/equit|stock|share|etf|fund/, 'equities']]
const classOf = (v) => { const s = String(v || '').toLowerCase(); return s ? (CLASS_WORDS.find(([re]) => re.test(s))?.[1] || '') : '' }
// A DEFAULT VALUE per field, chosen in the upload dialog: it is used for every row when the file has no such column, and for rows where the cell is blank.
// Done by adding a hidden column, so the planners below need no special cases.
export function applyDefaults(table, mapping, defaults = {}) {
  const keys = Object.keys(defaults).filter((k) => String(defaults[k] ?? '').trim() !== '')
  if (!keys.length) return { table, mapping }
  const map = { ...mapping }
  const cols = Object.fromEntries(keys.map((k) => [k, `__default_${k}`]))
  const rows = table.rows.map((row) => {
    const r = { ...row }
    for (const k of keys) { const cell = mapping[k] ? row[mapping[k]] : ''; r[cols[k]] = String(cell ?? '').trim() === '' ? defaults[k] : cell }
    return r
  })
  for (const k of keys) map[k] = cols[k]
  return { table: { ...table, rows }, mapping: map }
}
const get = (row, mapping, key) => (mapping[key] ? row[mapping[key]] : '')

// ---------- holdings -> portfolios (one per country) ----------
// mode: 'update' (overwrite the holdings of the portfolios it touches) | 'add' (keep what is there, add the new rows, skip ones already held)
// -> { lines: [string], warnings: [string], counts: { portfolios, holdings, skipped }, apply(d) }
export function planHoldingsImport(d, table0, mapping0, mode, { today, defaultCountry, defaults } = {}) {
  const { table, mapping } = applyDefaults(table0, mapping0, defaults)
  const warnings = []
  const fallback = defaultCountry || d.settings.countries[0] || 'us'
  const groups = new Map()
  let skipped = 0
  table.rows.forEach((row, i) => {
    const ticker = String(get(row, mapping, 'ticker') ?? '').trim()
    const name = String(get(row, mapping, 'name') ?? '').trim() || ticker
    const units = toNumber(get(row, mapping, 'units')), price = toNumber(get(row, mapping, 'price')), value = toNumber(get(row, mapping, 'value'))
    if (!name) { skipped++; warnings.push(`Row ${i + 2}: no name or ticker, skipped.`); return }
    if (!((units != null && price != null) || value != null)) { skipped++; warnings.push(`Row ${i + 2} (${name}): needs units and price, or a total value. Skipped.`); return }
    const country = resolveCountry(get(row, mapping, 'country'), get(row, mapping, 'currency')) || fallback
    const rawType = String(get(row, mapping, 'type') ?? '').trim().toLowerCase()
    const cls = classOf(get(row, mapping, 'cls')) || classOf(rawType) || 'equities'
    const type = HOLDING_TYPE[rawType] || (cls === 'cash' ? 'cash' : cls === 'bonds' ? 'bond' : ticker ? 'stock' : 'other')
    const byUnits = units != null && price != null
    const date = String(get(row, mapping, 'date') ?? '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || today
    const h = { name, ticker, type, cls, mix: null, sector: String(get(row, mapping, 'sector') ?? '').trim(), geo: COUNTRIES[country].name, trackBy: byUnits ? 'units' : 'value', units: byUnits ? units : null, price: byUnits ? price : null, value: byUnits ? null : value, priceDate: date, notes: '' }
    if (!groups.has(country)) groups.set(country, [])
    groups.get(country).push(h)
  })
  const steps = []
  const lines = []
  for (const [country, rows] of groups) {
    const cname = COUNTRIES[country].name
    const pname = `${cname} portfolio`
    const existing = d.portfolios.find((p) => d.accounts.find((a) => a.id === p.accountId)?.country === country && p.name === pname)
      || d.portfolios.find((p) => d.accounts.find((a) => a.id === p.accountId)?.country === country)
    const key = (h) => (h.ticker || h.name).toLowerCase()
    let toAdd = rows
    if (existing && mode === 'add') {
      const have = new Set(holdingsOf(d, existing.id).map((h) => (h.ticker || h.name).toLowerCase()))
      toAdd = rows.filter((h) => !have.has(key(h)))
      const dup = rows.length - toAdd.length
      if (dup) { skipped += dup; warnings.push(`${cname}: ${dup} holding${dup === 1 ? '' : 's'} already in "${existing.name}" were skipped.`) }
    }
    const total = toAdd.reduce((s, h) => s + (h.trackBy === 'units' ? h.units * h.price : h.value), 0)
    if (existing) lines.push(`${COUNTRIES[country].flag} ${cname}: ${mode === 'update' ? `replace the ${holdingsOf(d, existing.id).length} holdings in "${existing.name}" with ${toAdd.length}` : `add ${toAdd.length} holding${toAdd.length === 1 ? '' : 's'} to "${existing.name}"`}`)
    else lines.push(`${COUNTRIES[country].flag} ${cname}: create the portfolio "${pname}" (with its own Assets account) with ${toAdd.length} holding${toAdd.length === 1 ? '' : 's'}`)
    steps.push({ country, pname, existing, toAdd, total })
  }
  const counts = { portfolios: steps.length, holdings: steps.reduce((s, x) => s + x.toAdd.length, 0), skipped }
  function apply(data) {
    let next = data
    for (const st of steps) {
      let pid = st.existing?.id
      if (!pid) {
        const accId = uid()
        pid = uid()
        next = addAccount(next, { id: accId, country: st.country, type: 'asset', name: st.pname, number: '', institution: '', owner: 'mine', balance: 0, mix: null, maturityDate: '', maturityValue: null })
        next = addPortfolio(next, { id: pid, name: st.pname, accountId: accId })
      } else if (mode === 'update') {
        next = { ...next, holdings: next.holdings.filter((h) => h.portfolioId !== pid) } // overwrite: the old holdings go
      }
      for (const h of st.toAdd) next = addHolding(next, { ...h, portfolioId: pid })
      const p = next.portfolios.find((x) => x.id === pid)
      if (p && !p.reconciled) next = finishLinking(next, pid, 'accept', today) // the account balance becomes the holdings total
    }
    return next
  }
  return { lines, warnings, counts, apply }
}

// ---------- accounts ----------
// mode 'update': a file row that matches an existing account (same number, else same name in the same country) overwrites its fields and balance;
// rows that match nothing are added. mode 'add': every row is added, except exact duplicates (same name, number and country), which are skipped.
export function planAccountsImport(d, table0, mapping0, mode, { defaultCountry, defaults } = {}) {
  const { table, mapping } = applyDefaults(table0, mapping0, defaults)
  const warnings = []
  const fallback = defaultCountry || d.settings.countries[0] || 'us'
  const items = []
  let skipped = 0
  table.rows.forEach((row, i) => {
    const name = String(get(row, mapping, 'name') ?? '').trim()
    const balance = toNumber(get(row, mapping, 'balance'))
    if (!name) { skipped++; warnings.push(`Row ${i + 2}: no account name, skipped.`); return }
    if (balance == null) { skipped++; warnings.push(`Row ${i + 2} (${name}): no balance, skipped.`); return }
    const t = String(get(row, mapping, 'type') ?? '').trim().toLowerCase()
    const type = /liab|loan|mortgage|debt|credit|owe/.test(t) || balance < 0 && !t ? 'liability' : 'asset'
    const o = String(get(row, mapping, 'owner') ?? '').trim().toLowerCase()
    const owner = OWNERS.find((x) => x === o) || (/joint|both|me \+ others|family/.test(o) ? 'joint' : /spouse|wife|husband|partner/.test(o) ? 'spouse' : /parent|mom|dad|mother|father/.test(o) ? 'parent' : 'mine')
    const country = resolveCountry(get(row, mapping, 'country'), get(row, mapping, 'currency')) || fallback
    items.push({ name, number: String(get(row, mapping, 'number') ?? '').trim(), institution: String(get(row, mapping, 'institution') ?? '').trim(), owner, country, type, balance: Math.abs(balance) })
  })
  const same = (a, it) => (it.number && a.number ? a.number === it.number : a.name.toLowerCase() === it.name.toLowerCase() && a.country === it.country)
  const lines = []
  const creates = [], updates = []
  for (const it of items) {
    const hit = d.accounts.find((a) => same(a, it) && a.type === it.type)
    if (mode === 'update' && hit) updates.push({ hit, it })
    else if (mode === 'add' && hit && hit.name.toLowerCase() === it.name.toLowerCase() && (hit.number || '') === it.number && hit.country === it.country) { skipped++; warnings.push(`"${it.name}" is already there, skipped.`) }
    else creates.push(it)
  }
  if (updates.length) lines.push(`Update and overwrite ${updates.length} existing account${updates.length === 1 ? '' : 's'}: ${updates.slice(0, 4).map((u) => u.it.name).join(', ')}${updates.length > 4 ? '…' : ''}`)
  if (creates.length) lines.push(`Add ${creates.length} new account${creates.length === 1 ? '' : 's'}: ${creates.slice(0, 4).map((c) => c.name).join(', ')}${creates.length > 4 ? '…' : ''}`)
  const counts = { updated: updates.length, created: creates.length, skipped }
  function apply(data) {
    let next = data
    for (const { hit, it } of updates) next = { ...next, accounts: next.accounts.map((a) => (a.id === hit.id ? { ...a, name: it.name, number: it.number || a.number, institution: it.institution || a.institution, owner: it.owner, country: it.country, balance: it.balance } : a)) }
    for (const it of creates) next = addAccount(next, { country: it.country, type: it.type, name: it.name, number: it.number, institution: it.institution, owner: it.owner, balance: it.balance, mix: null, maturityDate: '', maturityValue: null })
    return next
  }
  return { lines, warnings, counts, apply }
}

