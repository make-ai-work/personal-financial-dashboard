import { useState } from 'react'
import { Modal, OwnerPicker } from '../finance/ui.jsx'
import { COUNTRIES, MIX, parseAmount, todayISO, curSym } from '../lib/format.js'
import { lookupSymbol, usage as avUsage } from '../lib/symbols.js'
import { homePrefs } from '../lib/homeprefs.js'
import { useNav } from '../nav.jsx'
import { CLASSES, HOLDING_TYPES, CLASSES as CLS, holdingValue, targetsTotal } from '../lib/portfolio.js'

const s = (v) => (v == null ? '' : String(v))
const num = (v) => (v === '' || v == null ? null : parseAmount(v))
const fmt2 = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

const GEOS = ['US', 'International', 'Emerging markets', 'Global', 'India', 'UK', 'Europe', 'Other']

export function PortfolioModal({ countries, defaultCountry, accounts, linkedIds, parentLabel, onSave, onClose }) {
  const [country, setCountry] = useState(defaultCountry || countries[0])
  const free = accounts.filter((a) => a.country === country && a.type === 'asset' && !linkedIds.has(a.id))
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [newAcc, setNewAcc] = useState({ name: '', institution: '', owner: 'mine' })
  const [err, setErr] = useState('')
  const chosen = free.find((a) => a.id === accountId) || (accountId === '' ? free[0] : null)
  const creating = accountId === 'new' || (free.length === 0)
  const cur = COUNTRIES[country].currency

  const submit = (e) => {
    e.preventDefault()
    if (creating && !newAcc.name.trim()) return setErr('Name the new Assets account.')
    if (!creating && !chosen) return setErr('Pick an Assets account to link.')
    const label = name.trim() || (creating ? newAcc.name.trim() : `${chosen.name}${chosen.institution ? ` · ${chosen.institution}` : ''}`)
    onSave({ name: label, country, accountId: creating ? null : chosen.id, newAccount: creating ? { ...newAcc, name: newAcc.name.trim(), institution: newAcc.institution.trim() } : null })
  }

  return (
    <Modal
      title="Add portfolio"
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="pf-form" className="btn primary">Create portfolio</button></>}
    >
      <form id="pf-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Country
            <select value={country} onChange={(e) => { setCountry(e.target.value); setAccountId('') }}>
              {countries.map((c) => <option key={c} value={c}>{COUNTRIES[c].flag} {COUNTRIES[c].name} ({curSym(COUNTRIES[c].currency)})</option>)}
            </select>
          </label>
          <label className="field">Portfolio name (optional)<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the account name" /></label>
        </div>
        <label className="field">Link to an Assets asset account
          <select aria-label="Assets account" value={creating && free.length ? 'new' : accountId || (free[0]?.id ?? 'new')} onChange={(e) => setAccountId(e.target.value)}>
            {free.map((a) => <option key={a.id} value={a.id}>{a.name}{a.institution ? ` · ${a.institution}` : ''} — {COUNTRIES[country].symbol}{Math.round(a.balance || 0).toLocaleString(COUNTRIES[country].locale)}</option>)}
            <option value="new">+ Create a new Assets account…</option>
          </select>
        </label>
        {free.length === 0 && <p className="note">There is no unlinked asset account in {COUNTRIES[country].flag} {COUNTRIES[country].name} yet, so a new one will be created in Assets.</p>}
        {creating && (
          <div className="subform">
            <div className="two">
              <label className="field">New account name<input value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} placeholder="e.g. Brokerage" /></label>
              <label className="field">Bank / holding company<input value={newAcc.institution} onChange={(e) => setNewAcc({ ...newAcc, institution: e.target.value })} /></label>
            </div>
            <div className="field">Who owns it?<OwnerPicker value={newAcc.owner} onChange={(owner) => setNewAcc({ ...newAcc, owner })} parentLabel={parentLabel} /></div>
          </div>
        )}
        <div className="warn" style={{ margin: '4px 0 10px' }}>
          After you finish linking, the account's balance and asset-mix bar are calculated from this portfolio's holdings.
          {!creating && chosen ? <> Its current balance (<b>{COUNTRIES[country].symbol}{Math.round(chosen.balance || 0).toLocaleString(COUNTRIES[country].locale)}</b>) stays as it is until then, and you'll compare it with your holdings.</> : <> A new account starts at {cur} 0.</>}
        </div>
        <div className="sub">Each Assets account can be linked to one portfolio. Deleting the portfolio later keeps the account with its last balance.</div>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

export function HoldingModal({ portfolio, country, initial, onSave, onClose }) {
  const cur = COUNTRIES[country].currency
  const sym = curSym(cur)
  const unalloc = initial?.cls === 'unallocated'
  const [f, setF] = useState({
    name: initial?.name || '', ticker: initial?.ticker || '', type: initial?.type || 'etf', cls: initial?.cls || 'equities',
    mix: (initial?.mix || [null, null, null, null]).map(s), sector: initial?.sector || '', geo: initial?.geo || '',
    trackBy: initial?.trackBy || 'units', units: s(initial?.units), price: s(initial?.price), value: s(initial?.value),
    priceDate: initial?.priceDate || todayISO(), notes: initial?.notes || '',
  })
  const [err, setErr] = useState('')
  const [look, setLook] = useState({ state: 'idle', matches: [], msg: '', source: '' })
  const [used, setUsed] = useState(avUsage())
  const avKey = homePrefs.avKey()
  const nav = useNav()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  // Ticker first: press Look up (nothing is asked while you type) and pick the match; the name and type are filled in, and you can still change them.
  const doLook = async () => {
    setLook({ state: 'busy', matches: [], msg: '', source: '' })
    const r = await lookupSymbol(f.ticker, { key: avKey })
    setUsed(r.usage)
    if (r.error) setLook({ state: 'error', matches: [], msg: r.error, source: '' })
    else setLook({ state: 'ok', matches: r.matches, msg: '', source: r.source })
  }
  const pickMatch = (m) => {
    setF({ ...f, ticker: m.symbol, name: m.name, type: m.type === 'other' ? f.type : m.type, geo: f.geo || (m.country ? COUNTRIES[m.country]?.name || '' : '') })
    setLook({ state: 'picked', matches: [], msg: `Filled in from ${m.symbol}. Check it, then enter the units and the price.`, source: '' })
  }
  const live = holdingValue({ trackBy: f.trackBy, units: num(f.units) || 0, price: num(f.price) || 0, value: num(f.value) || 0 })
  const mixTotal = f.mix.reduce((t, v) => t + (parseAmount(v) || 0), 0)

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Name is required.')
    if (!f.priceDate) return setErr('Price date is required.')
    const n = { units: num(f.units), price: num(f.price), value: num(f.value) }
    if (Object.values(n).some((x) => x != null && (Number.isNaN(x) || x < 0))) return setErr('Units, price and value must be numbers (0 or more).')
    if (!unalloc) {
      if (f.trackBy === 'units' && (n.units == null || n.price == null)) return setErr('Enter the units and the price per unit.')
      if (f.trackBy === 'value' && n.value == null) return setErr('Enter the total value.')
      if (f.cls === 'mixed' && Math.abs(mixTotal - 100) > 0.01) return setErr(`The split must total 100% (now ${mixTotal}%).`)
    } else if (n.value == null) return setErr('Enter the value.')
    onSave({
      portfolioId: portfolio.id, name: f.name.trim(), ticker: f.ticker.trim(), type: unalloc ? 'unallocated' : f.type, cls: unalloc ? 'unallocated' : f.cls,
      mix: f.cls === 'mixed' && !unalloc ? f.mix.map((v) => parseAmount(v) || 0) : null, sector: f.sector.trim(), geo: f.geo.trim(),
      trackBy: unalloc ? 'value' : f.trackBy, units: f.trackBy === 'units' && !unalloc ? n.units : null, price: f.trackBy === 'units' && !unalloc ? n.price : null,
      value: f.trackBy === 'value' || unalloc ? n.value : null, priceDate: f.priceDate, notes: f.notes.trim(),
    })
  }

  return (
    <Modal
      title={`${initial ? 'Edit' : 'Add'} holding · ${portfolio.name}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="hold-form" className="btn primary">Save holding</button></>}
    >
      <form id="hold-form" onSubmit={submit}>
        {!unalloc && (
          <div className="field lookup" data-testid="ticker-lookup">Ticker / symbol
            <span className="two-in">
              <input autoFocus value={f.ticker} aria-label="Ticker / symbol" placeholder="e.g. VTI, INFY.BSE, ISF.LON" onChange={(e) => { set('ticker')(e); if (look.state !== 'idle') setLook({ state: 'idle', matches: [], msg: '', source: '' }) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (f.ticker.trim() && look.state !== 'busy') doLook() } }} />
              <button type="button" className="btn" onClick={doLook} disabled={!f.ticker.trim() || look.state === 'busy'}>{look.state === 'busy' ? 'Looking up…' : 'Look up'}</button>
            </span>
            <small className="sub" data-testid="av-usage">{avKey
              ? <>Alpha Vantage free key: <b>{used.used} of {used.limit}</b> requests used today, <b>{used.remaining}</b> left (resets tomorrow). A lookup uses 1; one you already did is free.</>
              : <>No Alpha Vantage key yet, so type the name yourself, or <button type="button" className="link" onClick={() => { onClose(); nav.go('settings', { section: 'home' }) }}>add a key in Settings</button> to look symbols up.</>}</small>
            {look.state === 'error' && <span className="err" role="alert" data-testid="lookup-error">{look.msg}</span>}
            {look.state === 'picked' && <span className="okmsg" role="status">{look.msg}</span>}
            {look.state === 'ok' && (
              <span className="matches" role="listbox" aria-label="Matches" data-testid="lookup-matches">
                {look.matches.slice(0, 6).map((m) => (
                  <button type="button" role="option" key={m.symbol} className="match" onClick={() => pickMatch(m)}>
                    <b>{m.symbol}</b> {m.name}<small> · {[m.region, m.currency, m.type].filter(Boolean).join(' · ')}</small>
                  </button>
                ))}
                <small className="sub">{look.source === 'alphavantage' ? 'From Alpha Vantage (1 request used).' : look.source === 'cache' ? 'From an earlier lookup (no request used).' : 'From the offline ticker list (no request used).'}</small>
              </span>
            )}
          </div>
        )}
        <label className="field">Name<input autoFocus={unalloc} value={f.name} onChange={set('name')} /></label>
        {!unalloc && (
          <>
            <div className="three">
              <label className="field">Type<select value={f.type} onChange={set('type')}>{HOLDING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
              <label className="field">Asset class
                <select value={f.cls} onChange={set('cls')}>{CLASSES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}<option value="mixed">Mixed (set split)…</option></select>
              </label>
              <label className="field">Sector (optional)<input value={f.sector} onChange={set('sector')} /></label>
            </div>
            {f.cls === 'mixed' && (
              <div className="field">Split of this holding (% — must total 100)
                <div className="four">
                  {MIX.map((m, i) => (
                    <label key={m.key} className="field sub-field">{m.label}
                      <input inputMode="decimal" value={f.mix[i]} onChange={(e) => setF({ ...f, mix: f.mix.map((v, j) => (j === i ? e.target.value : v)) })} />
                    </label>
                  ))}
                </div>
                <span className={Math.abs(mixTotal - 100) <= 0.01 ? 'pos' : 'neg'}>Total {mixTotal}%</span>
              </div>
            )}
            <label className="field">Geography (optional)<input list="geo-list" value={f.geo} onChange={set('geo')} /><datalist id="geo-list">{GEOS.map((g) => <option key={g} value={g} />)}</datalist></label>
            <div className="field">How do you track its value?
              <div className="radios">
                {[['units', 'Units × price', 'shares and a price per share'], ['value', 'Total value only', 'for funds you just check monthly']].map(([k, l, sub]) => (
                  <label key={k} className={f.trackBy === k ? 'on' : ''}><input type="radio" name="trackBy" checked={f.trackBy === k} onChange={() => setF({ ...f, trackBy: k })} />{l}<small>{sub}</small></label>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="three">
          {f.trackBy === 'units' && !unalloc ? (
            <>
              <label className="field">Units<input inputMode="decimal" value={f.units} onChange={set('units')} /></label>
              <label className="field">Price per unit ({sym})<input inputMode="decimal" value={f.price} onChange={set('price')} /></label>
            </>
          ) : <label className="field">Total value ({sym})<input inputMode="decimal" value={f.value} onChange={set('value')} /></label>}
          <label className="field">Price date<input type="date" value={f.priceDate} onChange={set('priceDate')} /></label>
        </div>
        {f.trackBy === 'units' && !unalloc && <div className="sub">Value: <b>{COUNTRIES[country].symbol}{fmt2(live)}</b></div>}
        {unalloc && <p className="note">This line holds money in the account that isn't in any holding you've entered. Edit it when you add holdings, or delete it once the holdings explain the whole balance.</p>}
        <label className="field">Notes (optional)<input value={f.notes} onChange={set('notes')} /></label>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

export function PricesModal({ country, portfolios, holdingsOf, onSave, onClose }) {
  const [date, setDate] = useState(todayISO())
  const [vals, setVals] = useState({})
  const c = COUNTRIES[country]
  const submit = (e) => {
    e.preventDefault()
    const entries = {}
    for (const [id, v] of Object.entries(vals)) {
      const n = v === '' ? NaN : parseAmount(v)
      if (Number.isFinite(n) && n >= 0) entries[id] = n
    }
    onSave(date, entries)
  }
  return (
    <Modal
      wide
      title={`Update prices · ${c.flag} ${c.name}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="prices-form" className="btn primary">Save prices</button></>}
    >
      <form id="prices-form" onSubmit={submit}>
        <label className="field" style={{ maxWidth: 220 }}>Prices as of<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <p className="note">Type the new price per unit, or the new total for holdings you track by value. Rows you leave blank keep their old price.</p>
        {portfolios.map((p) => (
          <div key={p.id} className="tblw tbl-in" style={{ marginBottom: 12 }}>
            <table className="t-left"><thead><tr><th>{p.name}</th><th className="r">Units</th><th className="r">Old</th><th>Priced</th><th className="r">New {`(${curSym(c.currency)})`}</th></tr></thead><tbody>
              {holdingsOf(p.id).filter((h) => h.type !== 'unallocated').map((h) => (
                <tr key={h.id}>
                  <td><b>{h.name}</b> <span className="sub">{h.ticker}</span></td>
                  <td className="r">{h.trackBy === 'units' ? h.units : '—'}</td>
                  <td className="r">{h.trackBy === 'units' ? h.price : h.value}</td>
                  <td>{h.priceDate}</td>
                  <td className="r"><input aria-label={`New ${h.trackBy === 'units' ? 'price' : 'value'} for ${h.name}`} inputMode="decimal" value={vals[h.id] ?? ''} onChange={(e) => setVals({ ...vals, [h.id]: e.target.value })} placeholder={h.trackBy === 'units' ? 'price' : 'total'} /></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ))}
      </form>
    </Modal>
  )
}

export function TargetsModal({ portfolio, onSave, onClose }) {
  const [t, setT] = useState(Object.fromEntries(CLS.map((c) => [c.key, s(portfolio.targets?.[c.key])])))
  const [err, setErr] = useState('')
  const total = targetsTotal(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, parseAmount(v) || 0])))
  const submit = (e) => {
    e.preventDefault()
    const out = {}
    for (const c of CLS) {
      const n = t[c.key] === '' ? 0 : parseAmount(t[c.key])
      if (Number.isNaN(n) || n < 0 || n > 100) return setErr('Each target must be a number from 0 to 100.')
      out[c.key] = n
    }
    if (Math.abs(targetsTotal(out) - 100) > 0.01) return setErr(`Targets must total 100% (now ${Math.round(targetsTotal(out) * 100) / 100}%).`)
    onSave(out)
  }
  return (
    <Modal
      title={`Targets · ${portfolio.name}`}
      onClose={onClose}
      footer={<>
        {portfolio.targets && <button type="button" className="btn danger-btn" onClick={() => onSave(null)}>Clear targets</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button><button form="tg-form" className="btn primary">Save targets</button>
      </>}
    >
      <form id="tg-form" onSubmit={submit}>
        <p className="note">Your ideal split of this portfolio by asset class, as percentages.</p>
        <div className="four">
          {CLS.map((c) => (
            <label key={c.key} className="field sub-field">{c.label} %
              <input autoFocus={c.key === 'equities'} inputMode="decimal" value={t[c.key]} onChange={(e) => setT({ ...t, [c.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <span className={Math.abs(total - 100) <= 0.01 ? 'pos' : 'neg'}>Total {Math.round(total * 100) / 100}%</span>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}
