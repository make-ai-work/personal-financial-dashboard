import { useState } from 'react'
import { useVault } from './VaultContext.jsx'
import {
  addAccount, addPolicy, byOwner, hasUnsavedBalances, inCountry, monthSeries, removeAccount, removePolicy,
  saveUpdate, totals, updateAccount, updatePolicy,
} from '../lib/model.js'
import { COUNTRIES, fmtDate, maskNumber, maturesSoon, money, ownerLabel, todayISO, curSym } from '../lib/format.js'
import { AccountModal, PolicyModal } from './Forms.jsx'
import { Collapsible, OwnerChip } from './ui.jsx'
import { usePhone } from '../lib/usePhone.js'
import { performance, sinceMonth } from '../lib/performance.js'
import Chart from './Chart.jsx'
import { portfolioFor } from '../lib/portfolio.js'
import { useNav } from '../nav.jsx'

export default function CountryView({ code, owner, reveal, fx }) {
  const { data, update } = useVault()
  const { go } = useNav()
  const c = COUNTRIES[code]
  const parentLabel = data.settings.parentLabel
  const [modal, setModal] = useState(null) // { kind: 'account'|'policy', type?, item? }
  const [date, setDate] = useState(todayISO())
  const [mode, setMode] = useState('net')
  const [range, setRange] = useState(null) // a Performance period (months) that trims the chart, or null for all
  const phone = usePhone()

  const accounts = byOwner(inCountry(data.accounts, code), owner)
  const assets = accounts.filter((a) => a.type === 'asset')
  const liabilities = accounts.filter((a) => a.type === 'liability')
  const policies = byOwner(inCountry(data.policies, code), owner)
  const t = totals(accounts)
  const dirty = hasUnsavedBalances(data, code)
  const series = monthSeries(data, code, owner)
  const perf = performance(series)
  const chartPoints = range ? sinceMonth(series, range) : series
  const fmt = (n) => money(code, n)
  const compact = (n) => new Intl.NumberFormat(c.locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n)
  const num = (n) => (reveal ? n : maskNumber(n))
  const ownerName = owner === 'all' ? 'All' : ownerLabel(owner, parentLabel)

  const onSave = (patch) => {
    if (modal.kind === 'account') {
      update((d) => (modal.item ? updateAccount(d, modal.item.id, patch) : addAccount(d, patch)))
    } else {
      update((d) => (modal.item ? updatePolicy(d, modal.item.id, patch) : addPolicy(d, patch)))
    }
    setModal(null)
  }
  const del = (kind, item) => {
    const linked = kind === 'account' && portfolioFor(data, item.id)
    const msg = kind === 'account'
      ? `Delete “${item.name}”? Its balance history is removed too, so past chart points change.${linked ? ` The linked portfolio “${linked.name}” and its holdings are deleted as well.` : ''} This cannot be undone.`
      : `Delete policy “${item.name}”?`
    if (window.confirm(msg)) update((d) => (kind === 'account' ? removeAccount(d, item.id) : removePolicy(d, item.id)))
  }
  const doSaveUpdate = () => update((d) => saveUpdate(d, code, date, fx.quotes.length && Object.keys(fx.rates).length ? { base: fx.base, rates: fx.rates } : null))

  const Actions = ({ kind, item }) => (
    <td className="act">
      {kind === 'account' && portfolioFor(data, item.id) && <button className="link" onClick={() => go('portfolio', { portfolioId: portfolioFor(data, item.id).id })}>Open portfolio</button>}
      <button className="link" onClick={() => setModal({ kind, type: item.type, item })}>Edit</button>
      <button className="link danger" onClick={() => del(kind, item)}>Delete</button>
    </td>
  )

  return (
    <div className="fin-grid">
      <div className="fin-left">
      <div className="panel">
        <div className="p-head">
          <div className="title">{c.flag} {c.name} <span className="cur">{curSym(c.currency)}</span></div>
          <div className="upd">
            <label>Update date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <button className="btn primary" onClick={doSaveUpdate} disabled={!date}>Save update</button>
          </div>
        </div>
        {dirty && <div className="banner">Balances changed since your last saved update — press “Save update” to record them for {date}.</div>}
        <div className="kpis">
          <div className="kpi"><small>Net worth · {ownerName}</small><b className={t.net >= 0 ? 'pos' : 'neg'}>{fmt(t.net)}</b></div>
          <div className="kpi"><small>Assets</small><b>{fmt(t.assets)}</b></div>
          <div className="kpi"><small>Liabilities</small><b className="neg">{fmt(t.liabilities)}</b></div>
        </div>
      </div>

      <Collapsible id="assets" title="Assets" sub={fmt(t.assets)} phone={phone} phoneFolded action={<button className="btn" onClick={() => setModal({ kind: 'account', type: 'asset' })}>+ Add asset</button>}>
        <div className="tblw">
          <table className="t-a">
            <thead><tr><th>Account name</th><th>Account number</th><th>Bank / holding co.</th><th>Owner</th><th>Current balance</th><th>Maturity date</th><th>Value at maturity</th><th /></tr></thead>
            <tbody>
              {assets.length === 0 && <tr><td colSpan="8" className="none">No assets{owner !== 'all' ? ' in this category' : ' yet'}.</td></tr>}
              {assets.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.name}</b> {portfolioFor(data, a.id) && <span className="chiplink" title="The balance is calculated from the portfolio's holdings">📈 from portfolio</span>}</td>
                  <td className="mono">{num(a.number)}</td>
                  <td>{a.institution || '—'}</td>
                  <td><OwnerChip owner={a.owner} parentLabel={parentLabel} /></td>
                  <td><b>{fmt(a.balance)}</b></td>
                  <td>{fmtDate(a.maturityDate)} {maturesSoon(a.maturityDate) && <span className="chip soon" title="Matures within 12 months">soon</span>}</td>
                  <td>{a.maturityValue != null ? fmt(a.maturityValue) : '—'}</td>
                  <Actions kind="account" item={a} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      <Collapsible id="liabilities" title="Liabilities" sub={fmt(t.liabilities)} phone={phone} phoneFolded action={<button className="btn" onClick={() => setModal({ kind: 'account', type: 'liability' })}>+ Add liability</button>}>
        <div className="tblw">
          <table className="t-l">
            <thead><tr><th>Account name</th><th>Account number</th><th>Lender</th><th>Owner</th><th>Current balance</th><th /></tr></thead>
            <tbody>
              {liabilities.length === 0 && <tr><td colSpan="6" className="none">No liabilities{owner !== 'all' ? ' in this category' : ' yet'}.</td></tr>}
              {liabilities.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td className="mono">{num(a.number)}</td>
                  <td>{a.institution || '—'}</td>
                  <td><OwnerChip owner={a.owner} parentLabel={parentLabel} /></td>
                  <td><b className="neg">{fmt(a.balance)}</b></td>
                  <Actions kind="account" item={a} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      <Collapsible id="insurance" title="Insurance" sub={'not counted in net worth'} phone={phone} phoneFolded action={<button className="btn" onClick={() => setModal({ kind: 'policy' })}>+ Add policy</button>}>
        <div className="tblw">
          <table className="t-p">
            <thead><tr><th>Policy</th><th>Policy number</th><th>Policy company</th><th>Owner</th><th>Death benefit</th><th>Premium paid</th><th>Maturity date</th><th>Value on maturity</th><th /></tr></thead>
            <tbody>
              {policies.length === 0 && <tr><td colSpan="9" className="none">No policies{owner !== 'all' ? ' in this category' : ' yet'}.</td></tr>}
              {policies.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td className="mono">{num(p.number)}</td>
                  <td>{p.company || '—'}</td>
                  <td><OwnerChip owner={p.owner} parentLabel={parentLabel} /></td>
                  <td><b>{fmt(p.deathBenefit)}</b></td>
                  <td>{p.premiumPaid != null ? fmt(p.premiumPaid) : '—'}</td>
                  <td>{fmtDate(p.maturityDate)} {maturesSoon(p.maturityDate) && <span className="chip soon">soon</span>}</td>
                  <td>{p.maturityValue != null ? fmt(p.maturityValue) : '—'}</td>
                  <Actions kind="policy" item={p} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      </div>
      <aside className="fin-right">
      <div className="panel">
        <div className="p-head">
          <div className="title">Net worth by month <span className="cur">{curSym(c.currency)}</span></div>
          <div className="seg">
            <button className={mode === 'net' ? 'on' : ''} onClick={() => setMode('net')}>Net worth</button>
            <button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}>Assets &amp; liabilities</button>
          </div>
        </div>
        <Chart
          points={chartPoints}
          format={fmt}
          compact={compact}
          label={`${c.flag} ${c.name} month by month`}
          lines={mode === 'net'
            ? [{ key: 'net', label: 'Net worth', color: 'var(--accent)' }]
            : [{ key: 'assets', label: 'Assets', color: 'var(--green)' }, { key: 'liabilities', label: 'Liabilities', color: 'var(--red)' }]}
        />
      </div>
        <div className="panel">
          <div className="p-head"><div className="title">Performance <span className="sub">{ownerName}</span></div>{range && <button className="link" onClick={() => setRange(null)}>Show all</button>}</div>
          <table className="perf">
            <thead><tr><th>Period</th><th>Change</th><th>%</th><th>Net worth then</th></tr></thead>
            <tbody>
              {perf.map((p) => (
                <tr key={p.key} className={`${range === p.months ? 'sel' : ''}${p.available ? ' pick' : ''}`} onClick={() => p.available && setRange(range === p.months ? null : p.months)} aria-selected={range === p.months}>
                  <td>{p.label}</td>
                  {p.available ? (
                    <>
                      <td className={p.change >= 0 ? 'pos' : 'neg'}>{p.change >= 0 ? '+ ' : '− '}{fmt(Math.abs(p.change))}</td>
                      <td className={p.change >= 0 ? 'pos' : 'neg'}>{p.pct == null ? '—' : `${p.pct >= 0 ? '+' : '−'}${Math.abs(p.pct).toFixed(1)}%`}</td>
                      <td>{fmt(p.from.net)}</td>
                    </>
                  ) : <><td className="none">—</td><td className="none">—</td><td className="none">not enough history</td></>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fine pnote">Change in net worth between the month that long ago and now, for the owner you are viewing. Click a period to show just that range on the chart.</div>
        </div>
      </aside>
      {modal?.kind === 'account' && (
        <AccountModal type={modal.type} country={code} initial={modal.item} locked={!!(modal.item && portfolioFor(data, modal.item.id))} parentLabel={parentLabel} onSave={onSave} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'policy' && (
        <PolicyModal country={code} initial={modal.item} parentLabel={parentLabel} onSave={onSave} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
