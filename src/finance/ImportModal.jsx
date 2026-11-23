import { useState } from 'react'
import { Modal } from './ui.jsx'
import { useVault } from './VaultContext.jsx'
import { todayISO } from '../lib/format.js'
import { COUNTRIES, OWNERS, ownerLabel } from '../lib/format.js'
import { ACCOUNT_FIELDS, HOLDING_FIELDS, detectColumns, planAccountsImport, planHoldingsImport, readTable } from '../lib/importer.js'

// Upload a CSV or Excel file: choose the file, check which column is which, say whether it UPDATES and OVERWRITES what is there or is a NEW ADDITION,
// read the preview of exactly what will change, then confirm. kind: 'holdings' (creates portfolios, one per country) | 'accounts' (Assets).
// The default for one field: a list for country, owner and asset/liability, plain text for the rest.
function DefaultField({ field, value, onChange }) {
  const label = `Default for ${field.label}`
  if (field.key === 'country') return <select className="dflt" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Default: none</option>{Object.values(COUNTRIES).map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select>
  if (field.key === 'owner') return <select className="dflt" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Default: none</option>{OWNERS.map((o) => <option key={o} value={o}>{ownerLabel(o)}</option>)}</select>
  if (field.key === 'type' && field.label.startsWith('Asset')) return <select className="dflt" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Default: none</option><option value="asset">Asset</option><option value="liability">Liability</option></select>
  return <input className="dflt" aria-label={label} placeholder="Default: none" value={value} onChange={(e) => onChange(e.target.value)} />
}

export default function ImportModal({ kind, defaultCountry, onClose }) {
  const { data, update } = useVault()
  const holdings = kind === 'holdings'
  const fields = holdings ? HOLDING_FIELDS : ACCOUNT_FIELDS
  const [table, setTable] = useState(null)
  const [map, setMap] = useState(null)
  const [mode, setMode] = useState('')
  const [defaults, setDefaults] = useState({}) // a value per field, used when the file has no such column or the cell is blank
  const [err, setErr] = useState('')
  const [fileName, setFileName] = useState('')

  const pick = async (file) => {
    setErr(''); setTable(null)
    if (!file) return
    try {
      const isSheet = /\.xlsx$/i.test(file.name)
      const t = await readTable(isSheet ? { name: file.name, buffer: await file.arrayBuffer() } : { name: file.name, text: await file.text() })
      if (!t.rows.length) { setErr('That file has no rows to read.'); return }
      setFileName(file.name); setTable(t); setMap(detectColumns(t.headers, fields))
    } catch (e) { setErr(`Could not read that file: ${e.message || e}. Use a .csv or .xlsx file with a heading row.`) }
  }
  const has = (k) => !!(map && (map[k] || String(defaults[k] ?? '').trim()))
  const need = holdings ? (has('ticker') || has('name')) && ((has('units') && has('price')) || has('value')) : has('name') && has('balance')
  const plan = table && map && mode && need
    ? (holdings ? planHoldingsImport(data, table, map, mode, { today: todayISO(), defaultCountry, defaults }) : planAccountsImport(data, table, map, mode, { defaultCountry, defaults }))
    : null
  const nothing = plan && (holdings ? plan.counts.holdings === 0 : plan.counts.updated + plan.counts.created === 0)
  const apply = () => { update((d) => plan.apply(d)); onClose() }

  return (
    <Modal wide title={holdings ? 'Upload holdings (creates portfolios)' : 'Upload accounts'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!plan || nothing} onClick={apply} data-testid="import-apply">Apply changes</button></>}>
      <div data-testid="import-modal">
        <p className="sub">{holdings
          ? 'A CSV or Excel (.xlsx) file with one row per holding. Holdings are grouped by country: one portfolio per country, each with its own Assets account.'
          : 'A CSV or Excel (.xlsx) file with one row per account. Assets and liabilities, balances, owners and countries are read from the columns.'}</p>
        <label className="fld">File<input type="file" accept=".csv,.tsv,.txt,.xlsx" aria-label="File to upload" onChange={(e) => pick(e.target.files?.[0])} /></label>
        {err && <div className="badrow" data-testid="import-error">{err}</div>}
        {table && map && (
          <>
            <h4>Columns <span className="sub">{fileName} · {table.rows.length} rows. Check each match.</span></h4>
            <div className="mapgrid">
              {fields.map((f) => (
                <div key={f.key} className="mapcell">
                  <label className="fld">{f.label}
                    <select value={map[f.key]} aria-label={`Column for ${f.label}`} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}>
                      <option value="">(not in file)</option>
                      {table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                  <DefaultField field={f} value={defaults[f.key] ?? ''} onChange={(v) => setDefaults({ ...defaults, [f.key]: v })} />
                </div>
              ))}
            </div>
            <div className="sub">“Default” is used for every row when the file has no such column, and for rows where that cell is blank. Leave it empty for none.</div>
            {!need && <div className="warnrow">{holdings ? 'Choose a ticker or name column, and either units and price or a total value.' : 'Choose the account name and balance columns.'}</div>}
            <h4>Is this an update or a new addition?</h4>
            <div className="choice" role="radiogroup" aria-label="Import mode">
              <label className="chk"><input type="radio" name="imode" checked={mode === 'update'} onChange={() => setMode('update')} aria-label="Update and overwrite" />
                <span><b>Update and overwrite</b><span className="sub" style={{ display: 'block' }}>{holdings ? 'The holdings of each portfolio in the file are replaced by the file.' : 'Accounts that match (by number, else name and country) are overwritten; the rest are added.'}</span></span></label>
              <label className="chk"><input type="radio" name="imode" checked={mode === 'add'} onChange={() => setMode('add')} aria-label="New addition" />
                <span><b>New addition</b><span className="sub" style={{ display: 'block' }}>Keep everything already there and add the new rows. Rows already there are skipped.</span></span></label>
            </div>
          </>
        )}
        {plan && (
          <div data-testid="import-preview">
            <h4>What will change</h4>
            <ul>{plan.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            {plan.warnings.length > 0 && <div className="warnrow"><b>{plan.warnings.length} note{plan.warnings.length === 1 ? '' : 's'}</b><ul>{plan.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}{plan.warnings.length > 8 && <li>…and {plan.warnings.length - 8} more</li>}</ul></div>}
            {nothing && <div className="badrow">Nothing in the file can be imported.</div>}
          </div>
        )}
      </div>
    </Modal>
  )
}
