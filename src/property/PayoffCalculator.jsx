import { useMemo, useState } from 'react'
import { compare, describeMonths, levelPayment } from '../lib/amortization.js'
import { fmtDate, todayISO } from '../lib/format.js'
import { addMonths } from '../lib/dates.js'

// The regular principal-and-interest payment of a recorded loan: the monthly payment less escrow, else the standard payment for its original amount and term.
export function regularPayment(loan) {
  if (loan.monthlyPayment > 0) return Math.max(0, loan.monthlyPayment - (loan.escrow || 0))
  if (loan.originalAmount > 0 && loan.termYears > 0 && loan.rate != null) return levelPayment(loan.originalAmount, loan.rate, Math.round(loan.termYears * 12))
  return 0
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(/,/g, '')) || 0)

// Balance over time, with and without the extra payments (dependency-free SVG).
function PayoffChart({ base, extra, fmt }) {
  const W = 560, H = 190, L = 64, R = 12, T = 10, B = 24
  const n = Math.max(base.rows.length, extra.rows.length, 1)
  const max = Math.max(base.rows[0]?.balance || 0, extra.rows[0]?.balance || 0, 1) * 1.02
  const x = (i) => L + ((W - L - R) * i) / Math.max(n, 1)
  const y = (v) => T + (H - T - B) * (1 - v / max)
  const path = (rows) => `M${x(0)} ${y(rows.length ? rows[0].balance + rows[0].principal + rows[0].extra : 0)} ` + rows.map((r, i) => `L${x(i + 1)} ${y(r.balance)}`).join(' ')
  const years = Math.ceil(n / 12)
  const step = years > 20 ? 5 : years > 10 ? 2 : 1
  const ticks = []
  for (let yr = 0; yr <= years; yr += step) ticks.push(yr)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Loan balance over time, with and without extra payments">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" /><text x={L - 6} y={y(max * f) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(Math.round((max * f) / 1000) * 1000)}</text></g>)}
      {ticks.map((t) => <text key={t} x={x(t * 12)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{t === 0 ? 'now' : `+${t}y`}</text>)}
      <path d={path(base.rows)} fill="none" stroke="var(--grey)" strokeWidth="2" strokeDasharray="5 4" />
      <path d={path(extra.rows)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
    </svg>
  )
}

export default function PayoffCalculator({ loan, balance, fmt }) {
  const today = todayISO()
  const [monthly, setMonthly] = useState('')
  const [yearly, setYearly] = useState('')
  const [yearlyMonth, setYearlyMonth] = useState(12)
  const [lumps, setLumps] = useState([])
  const [rate, setRate] = useState(loan.rate != null ? String(loan.rate) : '')
  const [payment, setPayment] = useState(String(Math.round(regularPayment(loan) * 100) / 100 || ''))
  const [all, setAll] = useState(false)
  const ratePct = num(rate)
  const pay = num(payment)
  const start = addMonths(today.slice(0, 8) + '01', 1) // the next regular payment
  const result = useMemo(() => compare({ balance, ratePct, payment: pay, startDate: start, extras: { monthly: num(monthly), yearly: num(yearly), yearlyMonth, lumps: lumps.map((l) => ({ date: l.date, amount: num(l.amount) })) } }),
    [balance, ratePct, pay, start, monthly, yearly, yearlyMonth, JSON.stringify(lumps)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { base, withExtra } = result
  const usable = balance > 0 && pay > 0 && rate !== ''
  const hasExtra = num(monthly) > 0 || num(yearly) > 0 || lumps.some((l) => num(l.amount) > 0)
  const rows = withExtra.rows
  const shown = all ? rows : rows.slice(0, 12)
  const when = (r) => (r.neverPaysOff ? '—' : fmtDate(r.payoffDate))

  return (
    <details className="calc" data-testid="payoff-calc">
      <summary><b>Payoff calculator</b> <span className="sub">try extra payments and see the payoff date, the interest and the time you save</span></summary>
      <div className="pad">
        {!(balance > 0) && <div className="okrow">This loan is paid off.</div>}
        <div className="calc-grid">
          <label className="field">Interest rate (% a year)<input inputMode="decimal" value={rate} aria-label="Calculator interest rate" onChange={(e) => setRate(e.target.value)} /></label>
          <label className="field">Regular payment per month<small className="sub">principal and interest, without escrow</small><input inputMode="decimal" value={payment} aria-label="Calculator regular payment" onChange={(e) => setPayment(e.target.value)} /></label>
          <label className="field">Extra every month<input inputMode="decimal" value={monthly} placeholder="0" aria-label="Extra payment every month" onChange={(e) => setMonthly(e.target.value)} /></label>
          <label className="field">Extra once a year
            <span className="two-in"><input inputMode="decimal" value={yearly} placeholder="0" aria-label="Extra payment once a year" onChange={(e) => setYearly(e.target.value)} />
              <select value={yearlyMonth} aria-label="Month of the yearly extra" onChange={(e) => setYearlyMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></span></label>
        </div>
        <div className="lumps">
          {lumps.map((l, i) => (
            <div className="lump" key={i}>
              <label>One-time extra<input inputMode="decimal" value={l.amount} aria-label={`One-time extra ${i + 1} amount`} onChange={(e) => setLumps(lumps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></label>
              <label>On<input type="date" value={l.date} aria-label={`One-time extra ${i + 1} date`} onChange={(e) => setLumps(lumps.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} /></label>
              <button type="button" className="x" aria-label={`Remove one-time extra ${i + 1}`} onClick={() => setLumps(lumps.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => setLumps([...lumps, { amount: '', date: start }])}>+ One-time extra payment</button>
        </div>

        {!usable && balance > 0 && <div className="warnrow">Enter the interest rate and the regular payment to see the schedule.</div>}
        {usable && (base.neverPaysOff || withExtra.neverPaysOff) && <div className="badrow">At this payment the loan is never paid off: it does not cover the interest each month. Raise the payment or the extras.</div>}
        {usable && !base.neverPaysOff && (
          <>
            <div className="kpis3" data-testid="calc-results">
              <div className="kpi"><small>Payoff date, as scheduled</small><b>{when(base)}</b><small className="knote">{describeMonths(base.months)} left · interest {fmt(base.totalInterest)}</small></div>
              <div className="kpi"><small>Payoff date, with your extras</small><b className={hasExtra ? 'pos' : ''} data-testid="calc-payoff">{when(withExtra)}</b><small className="knote">{describeMonths(withExtra.months)} left · interest {fmt(withExtra.totalInterest)}</small></div>
              <div className="kpi"><small>Time saved</small><b className="pos" data-testid="calc-saved">{hasExtra && result.monthsSaved != null ? describeMonths(result.monthsSaved) : '—'}</b></div>
              <div className="kpi"><small>Interest saved</small><b className="pos" data-testid="calc-interest-saved">{hasExtra && result.interestSaved != null ? fmt(result.interestSaved) : '—'}</b></div>
            </div>
            <div className="chart"><PayoffChart base={base} extra={withExtra} fmt={fmt} /></div>
            <div className="legend pad0"><span><i style={{ background: 'var(--grey)' }} />As scheduled</span><span><i style={{ background: 'var(--accent)' }} />With your extras</span></div>
            <div className="tblw">
              <table className="t-left" data-testid="calc-schedule">
                <thead><tr><th>#</th><th>Date</th><th className="r">Payment</th><th className="r">Interest</th><th className="r">Principal</th><th className="r">Extra</th><th className="r">Balance</th></tr></thead>
                <tbody>
                  {shown.map((r) => <tr key={r.n}><td>{r.n}</td><td>{fmtDate(r.date)}</td><td className="r">{fmt(r.payment)}</td><td className="r">{fmt(r.interest)}</td><td className="r">{fmt(r.principal)}</td><td className="r">{r.extra > 0 ? fmt(r.extra) : '—'}</td><td className="r">{fmt(r.balance)}</td></tr>)}
                </tbody>
              </table>
            </div>
            {rows.length > 12 && <button type="button" className="btn sm" onClick={() => setAll(!all)}>{all ? 'Show the first year only' : `Show all ${rows.length} payments`}</button>}
            <div className="pad sub">Starts from today's balance ({fmt(balance)}) with the next payment on {fmtDate(start)}. Interest is the balance times the yearly rate divided by 12; extra payments go straight to principal. This is a planning estimate, not your lender's statement.</div>
          </>
        )}
      </div>
    </details>
  )
}
