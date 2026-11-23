import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import Chart from '../finance/Chart.jsx'
import { OwnerChip } from '../finance/ui.jsx'
import { InsuranceModal, LoanModal, LoanUpdateModal, PropertyModal, ValuationModal, zillowUrl } from './PropertyForms.jsx'
import { regularPayment } from './PayoffCalculator.jsx'
import { describeMonths, timeRemaining } from '../lib/amortization.js'
import { COUNTRIES, fmtDate, maskNumber, money, todayISO } from '../lib/format.js'
import { daysBetween } from '../lib/dates.js'
import {
  addLoan, addLoanUpdate, addValuation, changeLast12Months, gainSincePurchase, history, loansOf, removeLoan, removeLoanUpdate,
  removeProperty, removeValuation, scheduledPayoff, snapshot, sourceLabel, typeIcon, typeLabel, updateLoan, updateLoanUpdate,
  updateProperty, updateValuation, updatesOf, valueRange, valuationsOf, COVERAGE_LINES, insuranceAnnual, insuranceWarnings, setHomeInsurance,
} from '../lib/property.js'

const sign = (n) => (n >= 0 ? '+ ' : '− ')
const Kv = ({ label, children, sub }) => (
  <div><small>{label}</small><b>{children || '—'}</b>{sub && <><br /><span className="sub">{sub}</span></>}</div>
)

export default function PropertyPage({ property, reveal, onDeleted }) {
  const { data, update } = useVault()
  const today = todayISO()
  const c = COUNTRIES[property.country]
  const fmt = (n) => money(property.country, n)
  const parentLabel = data.settings.parentLabel
  const [modal, setModal] = useState(null) // { kind, item?, loan? }
  const snap = snapshot(data, property, today)
  const vals = valuationsOf(data, property.id)
  const loans = loansOf(data, property.id)
  const ins = property.homeInsurance || null
  const insWarnings = insuranceWarnings(ins, snap.value, today, data.settings.dueSoonDays)
  const change = changeLast12Months(data, property.id, today)
  const gain = gainSincePurchase(property, snap.value)
  const range = valueRange(data, property.id)
  const points = history(data, [property], today)
  const size = [property.bedrooms > 0 && `${property.bedrooms} bd`, property.bathrooms > 0 && `${property.bathrooms} ba`, property.sizeSqft > 0 && `${property.sizeSqft.toLocaleString(c.locale)} sq ft`].filter(Boolean).join(' · ')
  const hasEstimate = points.some((p) => !p.carried) && loans.some((l) => !updatesOf(data, l.id).length)

  const del = (what, fn) => window.confirm(`Delete ${what}?`) && update(fn)
  const done = () => setModal(null)

  return (
    <>
      <div className="split7030">
      <div className="sp-l">
      <div className="panel">
        <div className="p-head">
          <div className="title">{typeIcon(property.type)} {property.name} <span className="cur">{typeLabel(property.type)}</span> <OwnerChip owner={property.owner} parentLabel={parentLabel} /></div>
          <div className="row-actions">
            <button className="btn" onClick={() => setModal({ kind: 'property' })}>Edit property</button>
            <button className="btn danger-btn" onClick={() => {
              if (!window.confirm(`Delete ${property.name}, its value history and its mortgages? This cannot be undone.`)) return
              update((d) => removeProperty(d, property.id))
              onDeleted()
            }}>Delete</button>
          </div>
        </div>
        <div className="kpis four">
          <div className="kpi"><small>Value</small><b>{fmt(snap.value)}</b></div>
          <div className="kpi"><small>Mortgage balance</small><b className="neg">{fmt(snap.balance)}</b></div>
          <div className="kpi"><small>Equity</small><b className={snap.equity >= 0 ? 'pos' : 'neg'}>{fmt(snap.equity)}</b>{snap.ltv != null && <span className="sub"> LTV {Math.round(snap.ltv * 100)}%</span>}</div>
          <div className="kpi"><small>Monthly payments</small><b>{fmt(snap.monthly)}</b></div>
        </div>
        <div className="kv" style={{ borderTop: '1px solid var(--line)' }}>
          <Kv label="Address">{property.address}</Kv>
          <Kv label="Bought" sub={property.purchasePrice > 0 ? `for ${fmt(property.purchasePrice)}` : ''}>{property.purchaseDate && fmtDate(property.purchaseDate)}</Kv>
          <Kv label="Size">{size}</Kv>
          <Kv label="Gain since purchase">{gain && <span className={gain.delta >= 0 ? 'pos' : 'neg'}>{sign(gain.delta)}{fmt(Math.abs(gain.delta))} ({gain.pct.toFixed(0)}%)</span>}</Kv>
          <Kv label="Property tax">{property.taxYear > 0 && `${fmt(property.taxYear)} / yr`}</Kv>
          <Kv label="Home insurance">{property.insuranceYear > 0 && `${fmt(property.insuranceYear)} / yr`}</Kv>
          <Kv label="HOA">{property.hoaMonth > 0 && `${fmt(property.hoaMonth)} / month`}</Kv>
          <Kv label="Next tax due">{property.taxDue && fmtDate(property.taxDue)}</Kv>
        </div>
        {property.notes && <div className="pad sub" style={{ borderTop: '1px solid var(--line)' }}>{property.notes}</div>}
      </div>

      <div className="panel">
        <div className="p-head">
          <div className="title">Value <span className="sub">you enter these; nothing is fetched automatically</span></div>
          <div className="row-actions">
            {property.country === 'us' && <a className="btn" href={zillowUrl(property.address || property.name)} target="_blank" rel="noopener noreferrer">Open on Zillow ↗</a>}
            <button className="btn primary" onClick={() => setModal({ kind: 'valuation' })}>+ Add valuation</button>
          </div>
        </div>
        <div className="kv">
          <div><small>Current value</small><b style={{ fontSize: '1.3rem' }}>{snap.valuation ? fmt(snap.value) : '—'}</b>
            {snap.valuation && <><br /><span className="src">{sourceLabel(snap.valuation.source)} · {fmtDate(snap.valuation.date)}</span></>}</div>
          <Kv label="Change, last 12 months">{change && <span className={change.delta >= 0 ? 'pos' : 'neg'}>{sign(change.delta)}{fmt(Math.abs(change.delta))} ({Math.abs(change.pct).toFixed(1)}%)</span>}</Kv>
          <Kv label="Range on file">{range && `${fmt(range.min)} – ${fmt(range.max)}`}</Kv>
          <Kv label="Last updated">{snap.valuation && (() => { const n = daysBetween(snap.valuation.date, today); return n <= 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} ago` })()}</Kv>
        </div>
        <div className="tblw"><table className="t-left t-val"><thead><tr><th>Date</th><th>Source</th><th className="r">Value</th><th>Notes</th><th /></tr></thead><tbody>
          {vals.length === 0 && <tr><td colSpan="5" className="none">No valuations yet. Add one to see value and equity.</td></tr>}
          {vals.map((v) => (
            <tr key={v.id}>
              <td>{fmtDate(v.date)}</td><td>{sourceLabel(v.source)}</td><td className="r">{fmt(v.value)}</td><td className="wrap">{v.notes || '—'}</td>
              <td className="act">
                <button className="link" onClick={() => setModal({ kind: 'valuation', item: v })}>Edit</button>
                <button className="link danger" onClick={() => del(`the ${fmtDate(v.date)} valuation`, (d) => removeValuation(d, v.id))}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody></table></div>
      </div>

      {snap.loans.map(({ loan: l, balance, date, recorded }) => {
        const ups = updatesOf(data, l.id)
        const payoff = scheduledPayoff(l)
        const left = timeRemaining({ balance, ratePct: l.rate, payment: regularPayment(l), startDate: l.startDate, termYears: l.termYears }, today)
        return (
          <div className="panel" key={l.id}>
            <div className="p-head">
              <div className="title">Mortgage · {l.lender} <span className="sub">recorded by you</span></div>
              <div className="row-actions">
                <button className="btn" onClick={() => setModal({ kind: 'loan', item: l })}>Edit loan</button>
                <button className="btn danger-btn" onClick={() => del(`the ${l.lender} loan and its payment history`, (d) => removeLoan(d, l.id))}>Delete loan</button>
                <button className="btn primary" onClick={() => setModal({ kind: 'update', loan: l })}>+ Record update</button>
              </div>
            </div>
            <div className="kv">
              <Kv label="Lender">{l.lender}</Kv>
              <Kv label="Loan number">{l.number && <span className="mono">{reveal ? l.number : maskNumber(l.number)}</span>}</Kv>
              <Kv label="Original loan" sub={[l.termYears > 0 && `${l.termYears} yr ${l.rateType || 'fixed'}`, l.startDate && `from ${fmtDate(l.startDate)}`].filter(Boolean).join(' · ')}>{l.originalAmount > 0 && fmt(l.originalAmount)}</Kv>
              <Kv label="Interest rate">{l.rate != null && `${l.rate}%`}</Kv>
              <Kv label="Monthly payment" sub={l.escrow > 0 ? `incl. escrow ${fmt(l.escrow)}` : l.paymentDay > 0 ? `due on day ${l.paymentDay}` : ''}>{l.monthlyPayment > 0 && fmt(l.monthlyPayment)}</Kv>
              <div><small>Current balance</small><b className="neg" style={{ fontSize: '1.2rem' }}>{fmt(balance)}</b><br />
                <span className="sub">{recorded ? `recorded ${fmtDate(date)}` : 'estimated from the loan schedule — record an update'}</span></div>
              <Kv label="Scheduled payoff" sub={payoff ? 'from rate & term' : ''}>{payoff && new Date(payoff + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</Kv>
              <Kv label="Time remaining" sub={left && left.months > 0 ? `until ${new Date(left.payoffDate + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}${left.source === 'term' ? ' · from the start date and term' : ' · at your regular payment'}` : ''}>{left ? <span data-testid="time-remaining">{describeMonths(left.months)}</span> : null}</Kv>
              <Kv label="Notes">{l.notes}</Kv>
            </div>
            <div className="tblw"><table className="t-left t-loan"><thead><tr><th>Date</th><th className="r">Balance after</th><th className="r">Principal paid</th><th className="r">Interest paid</th><th className="r">Escrow paid</th><th>Notes</th><th /></tr></thead><tbody>
              {ups.length === 0 && <tr><td colSpan="7" className="none">No updates recorded yet.</td></tr>}
              {ups.map((u) => (
                <tr key={u.id}>
                  <td>{fmtDate(u.date)}</td><td className="r">{fmt(u.balance)}</td>
                  <td className="r">{u.principal != null ? fmt(u.principal) : '—'}</td><td className="r">{u.interest != null ? fmt(u.interest) : '—'}</td><td className="r">{u.escrow != null ? fmt(u.escrow) : '—'}</td>
                  <td className="wrap">{u.notes || '—'}</td>
                  <td className="act">
                    <button className="link" onClick={() => setModal({ kind: 'update', loan: l, item: u })}>Edit</button>
                    <button className="link danger" onClick={() => del(`the ${fmtDate(u.date)} update`, (d) => removeLoanUpdate(d, u.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          </div>
        )
      })}
      <div className="panel" data-testid="home-insurance">
        <div className="p-head">
          <div className="title">Home insurance {ins?.insurer && <span className="sub">{ins.insurer}</span>}</div>
          <div className="row-actions"><button className="btn" onClick={() => setModal({ kind: 'insurance' })}>{ins ? 'Edit' : '+ Add home insurance'}</button></div>
        </div>
        {!ins && <div className="pad sub">No home insurance recorded for this property. Add the policy, its coverage limits and its renewal date to get a reminder and a check of the dwelling limit.</div>}
        {ins && (
          <>
            {insWarnings.map((w, i) => <div key={i} className={w.level === 'bad' ? 'badrow' : 'warnrow'}>{w.text}</div>)}
            <div className="kv">
              <Kv label="Premium" sub={insuranceAnnual(ins) > 0 ? `${fmt(insuranceAnnual(ins))} per year · about ${fmt(insuranceAnnual(ins) / 12)} a month` : ''}>{ins.premium > 0 && fmt(ins.premium)}</Kv>
              <Kv label="Renews">{ins.renewal && fmtDate(ins.renewal)}</Kv>
              <Kv label="Deductible">{ins.deductible > 0 && fmt(ins.deductible)}</Kv>
              <Kv label="Policy number">{ins.number && <span className="mono">{reveal ? ins.number : maskNumber(ins.number)}</span>}</Kv>
              <Kv label="Rebuild cost">{ins.rebuildCost > 0 && fmt(ins.rebuildCost)}</Kv>
            </div>
            <div className="tblw"><table className="t-left" data-testid="coverage-limits"><thead><tr><th>Coverage</th><th className="r">Limit</th></tr></thead><tbody>
              {COVERAGE_LINES.map((l) => <tr key={l.key}><td>{l.label}</td><td className="r">{ins.limits?.[l.key] > 0 ? fmt(ins.limits[l.key]) : '—'}</td></tr>)}
              {(ins.extras || []).map((x) => <tr key={x.id}><td>{x.name || 'Other cover'}</td><td className="r">{x.limit > 0 ? fmt(x.limit) : '—'}</td></tr>)}
            </tbody></table></div>
            {ins.notes && <div className="pad sub">{ins.notes}</div>}
          </>
        )}
      </div>
      <div className="panel"><div className="pad"><button className="btn" onClick={() => setModal({ kind: 'loan' })}>+ Add mortgage</button>
        {loans.length === 0 && <span className="sub"> No mortgage on this property. Add one to track balance, payments and equity.</span>}</div></div>

      </div>
      <aside className="sp-r">
      <div className="panel">
        <div className="p-head"><div className="title">Value, mortgage and equity</div></div>
        <Chart
          points={points}
          lines={[{ key: 'value', label: 'Value', color: 'var(--blue)' }, { key: 'mortgage', label: 'Mortgage balance', color: 'var(--red)' }, { key: 'equity', label: 'Equity', color: 'var(--green)' }]}
          format={fmt}
          compact={(n) => new Intl.NumberFormat(c.locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n)}
          label={`${property.name} value, mortgage and equity`}
          note={`Monthly. Filled dot = a valuation or loan record that month; hollow = carried forward.${hasEstimate ? ' Months before your first recorded mortgage update use the loan schedule.' : ''}`}
        />
      </div>
      </aside>
      </div>

      {modal?.kind === 'property' && (
        <PropertyModal initial={property} countries={data.settings.countries} parentLabel={parentLabel} onClose={done}
          onSave={(patch) => { update((d) => updateProperty(d, property.id, patch)); done() }} />
      )}
      {modal?.kind === 'insurance' && (
        <InsuranceModal property={property} initial={ins} onClose={done}
          onSave={(v) => { update((d) => setHomeInsurance(d, property.id, v)); done() }}
          onRemove={() => { if (window.confirm('Remove the home insurance from this property?')) { update((d) => setHomeInsurance(d, property.id, null)); done() } }} />
      )}
      {modal?.kind === 'valuation' && (
        <ValuationModal property={property} initial={modal.item} onClose={done}
          onSave={(v) => { update((d) => (modal.item ? updateValuation(d, modal.item.id, v) : addValuation(d, v))); done() }} />
      )}
      {modal?.kind === 'loan' && (
        <LoanModal property={property} initial={modal.item} onClose={done}
          onSave={(l) => { update((d) => (modal.item ? updateLoan(d, modal.item.id, l) : addLoan(d, l))); done() }} />
      )}
      {modal?.kind === 'update' && (
        <LoanUpdateModal property={property} loan={modal.loan} initial={modal.item} onClose={done}
          onSave={(u, alsoEdit) => {
            update((d) => (modal.item ? updateLoanUpdate(d, modal.item.id, u) : addLoanUpdate(d, u)))
            setModal(alsoEdit ? { kind: 'loan', item: modal.loan } : null)
          }} />
      )}
    </>
  )
}
