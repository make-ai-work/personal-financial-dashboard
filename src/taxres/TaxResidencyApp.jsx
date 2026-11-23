import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { Modal } from '../finance/ui.jsx'
import { COUNTRIES, fmtDate, todayISO } from '../lib/format.js'
import { STATUSES, TAX_YEAR_NOTE, addRange, axis, changes, pos, rangeProblem, removeRange, segments, statusOf, statusOn, taxYearLabel, taxYearTicks, updateRange } from '../lib/taxres.js'

// The tab only exists when both the USA and India are in the countries list. One bar per country on a SHARED time axis, each with its own tax-year
// ticks (US: January to December; India: April to March). Coloured by status; the dates where the status changes are marked and listed.
export default function TaxResidencyApp() {
  const { data } = useVault()
  const countries = data.settings.countries
  if (!countries.includes('us') || !countries.includes('in')) {
    return <div className="wide-pad"><div className="panel"><div className="pad">Tax Residency is shown when both USA and India are in your countries list. Add them in Settings → Countries.</div></div></div>
  }
  return <Page />
}

function Page() {
  const { data, update } = useVault()
  const tr = data.taxResidency
  const today = todayISO()
  const ax = axis(tr, today)
  const [modal, setModal] = useState(null) // { country, item? }
  const save = (country, item, v) => { update((d) => (item ? updateRange(d, country, item.id, v) : addRange(d, country, v))); setModal(null) }
  return (
    <div className="wide-pad tr-page" data-testid="tax-residency">
      <div className="panel"><div className="pad sub">Record the date ranges of your tax residency to see when your status changes. Add the first period for each country, then each change. Leave the end date empty for the period you are in now. Rules for becoming resident are not calculated here; you enter the status you were or will be.</div></div>
      <div className="tr-legend" aria-label="Legend">
        {['us', 'in'].flatMap((c) => STATUSES[c].map((s) => <span key={`${c}${s.key}`}><i className={`tr-sw tone-${s.tone}`} />{c === 'us' ? 'US' : 'India'} {s.label}</span>))}
      </div>
      {['us', 'in'].map((c) => <CountryBar key={c} country={c} ranges={tr[c]} ax={ax} today={today} onAdd={() => setModal({ country: c })} onEdit={(item) => setModal({ country: c, item })} onDelete={(item) => window.confirm(`Delete this period (${statusOf(c, item.status).label}, ${fmtDate(item.from)} to ${item.to ? fmtDate(item.to) : 'now'})?`) && update((d) => removeRange(d, c, item.id))} />)}
      {modal && <RangeModal country={modal.country} item={modal.item} others={tr[modal.country].filter((r) => r.id !== modal.item?.id)} onSave={(v) => save(modal.country, modal.item, v)} onClose={() => setModal(null)} />}
    </div>
  )
}

function CountryBar({ country, ranges, ax, today, onAdd, onEdit, onDelete }) {
  const c = COUNTRIES[country === 'us' ? 'us' : 'in']
  const now = statusOn(ranges, today)
  const seg = ax ? segments(ranges, ax, today) : []
  const ticks = ax ? taxYearTicks(country, ax.start, ax.end) : []
  const ch = changes(ranges)
  const todayX = ax && today >= ax.start && today <= ax.end ? pos(ax, today) : null
  return (
    <div className="panel" data-testid={`tr-${country}`}>
      <div className="p-head">
        <div className="title">{c.flag} {c.name} <span className="sub">{TAX_YEAR_NOTE[country]}</span></div>
        <span className="acts">
          {now ? <span className={`pill tr-now tone-${statusOf(country, now).tone}`} data-testid={`tr-now-${country}`}>Now: {statusOf(country, now).label}</span> : <span className="pill">No status for today</span>}
          <button className="btn sm primary" onClick={onAdd}>+ Add period</button>
        </span>
      </div>
      <div className="pad">
        {!ax || !ranges.length ? <div className="sub">No periods yet. Add one to see the bar.</div> : (
          <>
            <div className="tr-axis" aria-hidden="true">
              {ticks.map((t) => <span key={t.date} className="tr-tick" style={{ left: `${pos(ax, t.date)}%` }}><i />{t.label}</span>)}
            </div>
            <div className="tr-bar" role="img" aria-label={`${c.name} tax residency over time`} data-testid={`tr-bar-${country}`}>
              {seg.map((s) => {
                const st = statusOf(country, s.status)
                return <button key={s.id} type="button" className={`tr-seg tone-${st.tone}`} style={{ left: `${s.left}%`, width: `${s.width}%` }} data-status={s.status} title={`${st.long || st.label}: ${fmtDate(s.from)} to ${s.to ? fmtDate(s.to) : 'now'}`} onClick={() => onEdit(ranges.find((r) => r.id === s.id))}><span>{st.label}</span></button>
              })}
              {ch.map((x) => <span key={x.date} className="tr-chg" style={{ left: `${pos(ax, x.date)}%` }} title={`${fmtDate(x.date)}: ${x.from ? statusOf(country, x.from).label + ' → ' : ''}${statusOf(country, x.to).label}`} />)}
              {todayX !== null && <span className="tr-today" style={{ left: `${todayX}%` }} title={`Today, ${fmtDate(today)}`} />}
            </div>
            <div className="tr-changes" data-testid={`tr-changes-${country}`}>
              <b>Status changes</b>
              <ul>
                {ch.map((x) => (
                  <li key={x.date}><span className="tr-d">{fmtDate(x.date)}</span> <span className="sub">{taxYearLabel(country, x.date)}</span> · {x.from ? <>{statusOf(country, x.from).label} → <b>{statusOf(country, x.to).label}</b></> : <>starts as <b>{statusOf(country, x.to).label}</b></>}</li>
                ))}
              </ul>
            </div>
          </>
        )}
        {ranges.length > 0 && (
          <div className="tblw">
            <table className="t-left">
              <thead><tr><th>Status</th><th>From</th><th>To</th><th /></tr></thead>
              <tbody>
                {ranges.map((r) => (
                  <tr key={r.id}>
                    <td><span className={`tr-sw tone-${statusOf(country, r.status).tone}`} /> <b>{statusOf(country, r.status).label}</b> <span className="sub">{statusOf(country, r.status).long || ''}</span></td>
                    <td>{fmtDate(r.from)}</td><td>{r.to ? fmtDate(r.to) : 'Now (ongoing)'}</td>
                    <td className="act"><button className="link" onClick={() => onEdit(r)}>Edit</button><button className="link danger" onClick={() => onDelete(r)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function RangeModal({ country, item, others, onSave, onClose }) {
  const c = COUNTRIES[country]
  const [f, setF] = useState({ status: item?.status || STATUSES[country][0].key, from: item?.from || '', to: item?.to || '', ongoing: item ? item.to === '' : true })
  const [err, setErr] = useState('')
  const submit = (e) => {
    e.preventDefault()
    const v = { status: f.status, from: f.from, to: f.ongoing ? '' : f.to }
    const p = !f.ongoing && !f.to ? 'Enter the end date, or tick "Still current".' : rangeProblem(v, others)
    if (p) return setErr(p)
    onSave(v)
  }
  return (
    <Modal title={`${item ? 'Edit' : 'Add'} tax residency period · ${c.flag} ${c.name}`} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="tr-form" className="btn primary">Save</button></>}>
      <form id="tr-form" onSubmit={submit}>
        <label className="field">Status
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
            {STATUSES[country].map((s) => <option key={s.key} value={s.key}>{s.label}{s.long ? ` · ${s.long}` : ''}</option>)}
          </select>
        </label>
        <div className="two">
          <label className="field">From<input type="date" autoFocus value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From date" /></label>
          <label className="field">To<input type="date" value={f.ongoing ? '' : f.to} disabled={f.ongoing} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To date" /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.ongoing} onChange={(e) => setF({ ...f, ongoing: e.target.checked })} aria-label="Still current" /> Still current (no end date)</label>
        <div className="sub">{country === 'in' ? 'India’s tax year runs 1 April to 31 March, so periods usually start on 1 April (or the date you changed status).' : 'The US tax year is the calendar year, so periods usually start on 1 January (or the date you changed status).'}</div>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}
