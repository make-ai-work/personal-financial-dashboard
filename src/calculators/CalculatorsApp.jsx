import { useMemo, useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import NumInput from '../finance/NumInput.jsx'
import PayoffCalculator from '../property/PayoffCalculator.jsx'
import { COUNTRIES, money, todayISO } from '../lib/format.js'
import { loanBalanceOn } from '../lib/property.js'
import { loanPayment, savingsGrowth } from '../lib/calc.js'
import { describeMonths } from '../lib/amortization.js'

const CALCS = [
  { id: 'payoff', title: 'Mortgage payoff', text: 'See what extra payments save on a mortgage: the payoff date, the interest and the time.' },
  { id: 'loan', title: 'Loan payment (EMI)', text: 'The monthly payment, total paid and total interest for a loan.' },
  { id: 'growth', title: 'Savings growth', text: 'What a starting amount and regular saving grow to.' },
]
const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(/,/g, '')) || 0)

// The Calculators tab: the screen is split 40 : 60. On the left a picker lists the calculators; on the right the chosen one works.
export default function CalculatorsApp() {
  const [id, setId] = useState('payoff')
  return (
    <div className="wide-pad calc-page" data-testid="calculators">
      <div className="calc-split">
        <nav className="panel calc-picker" aria-label="Calculator picker" data-testid="calc-picker">
          <div className="p-head"><div className="title">Calculators</div></div>
          <div className="calc-list">
            {CALCS.map((c) => (
              <button key={c.id} type="button" className={`calc-item${id === c.id ? ' on' : ''}`} aria-current={id === c.id ? 'true' : undefined} onClick={() => setId(c.id)} data-testid={`pick-${c.id}`}>
                <b>{c.title}</b><span className="sub">{c.text}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="calc-main" data-testid="calc-main">
          {id === 'payoff' && <PayoffPage />}
          {id === 'loan' && <LoanPage />}
          {id === 'growth' && <GrowthPage />}
        </div>
      </div>
    </div>
  )
}

// ---- Mortgage payoff: start from one of your recorded mortgages, or type your own numbers ----
function PayoffPage() {
  const { data } = useVault()
  const today = todayISO()
  const codes = data.settings.countries
  const loans = useMemo(() => data.loans.map((l) => {
    const p = data.properties.find((x) => x.id === l.propertyId)
    const b = loanBalanceOn(data, l, today)
    return { loan: l, property: p, balance: b.balance, label: `${p?.name || 'Property'} · ${l.lender}` }
  }).filter((x) => x.property && codes.includes(x.property.country)), [data, today, codes.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const [source, setSource] = useState(loans[0]?.loan.id || 'own')
  const [ownBalance, setOwnBalance] = useState('')
  const [country, setCountry] = useState(codes[0])
  const chosen = loans.find((x) => x.loan.id === source)
  const own = !chosen
  const fmt = (n) => money(own ? country : chosen.property.country, n)
  return (
    <div className="panel">
      <div className="p-head"><div className="title">Mortgage payoff <span className="sub">try extra payments and see the payoff date, the interest and the time you save</span></div></div>
      <div className="pad calc-source">
        <label className="field">Start from
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Start from">
            {loans.map((x) => <option key={x.loan.id} value={x.loan.id}>{x.label}</option>)}
            <option value="own">Enter my own numbers</option>
          </select>
        </label>
        {own && (
          <div className="two">
            <label className="field">Balance owed<NumInput value={ownBalance} aria-label="Balance owed" onChange={(e) => setOwnBalance(e.target.value)} /></label>
            <label className="field">Currency
              <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Currency">{codes.map((c) => <option key={c} value={c}>{COUNTRIES[c].flag} {COUNTRIES[c].currency}</option>)}</select>
            </label>
          </div>
        )}
        {!own && <div className="sub">Rate, payment and balance come from the mortgage you recorded; change them below to try something else. Nothing here is saved.</div>}
      </div>
      <PayoffCalculator key={source} standalone loan={own ? {} : chosen.loan} balance={own ? num(ownBalance) : chosen.balance} fmt={fmt} />
    </div>
  )
}

// ---- Loan payment (EMI) ----
function LoanPage() {
  const { data } = useVault()
  const country = data.settings.countries[0]
  const fmt = (n) => money(country, n)
  const [f, setF] = useState({ amount: '', rate: '', years: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const r = loanPayment({ amount: num(f.amount), ratePct: f.rate === '' ? NaN : num(f.rate), years: num(f.years) })
  return (
    <div className="panel" data-testid="loan-calc">
      <div className="p-head"><div className="title">Loan payment (EMI) <span className="sub">in {COUNTRIES[country].currency}</span></div></div>
      <div className="pad">
        <div className="calc-grid">
          <label className="field">Loan amount<NumInput value={f.amount} aria-label="Loan amount" onChange={set('amount')} /></label>
          <label className="field">Interest rate (% a year)<NumInput value={f.rate} aria-label="Loan interest rate" onChange={set('rate')} /></label>
          <label className="field">Term (years)<NumInput value={f.years} aria-label="Loan term in years" onChange={set('years')} /></label>
        </div>
        {!r && <div className="warnrow">Enter the amount, the rate and the term to see the payment.</div>}
        {r && (
          <>
            <div className="kpis3" data-testid="loan-results">
              <div className="kpi"><small>Monthly payment</small><b data-testid="loan-payment">{fmt(r.payment)}</b></div>
              <div className="kpi"><small>Total paid</small><b>{fmt(r.totalPaid)}</b><small className="knote">over {describeMonths(r.months)}</small></div>
              <div className="kpi"><small>Total interest</small><b className="neg" data-testid="loan-interest">{fmt(r.totalInterest)}</b><small className="knote">{Math.round(r.interestShare * 100)}% of what you pay</small></div>
            </div>
            <div className="split" role="img" aria-label={`Of everything paid, ${Math.round((1 - r.interestShare) * 100)} percent is the loan and ${Math.round(r.interestShare * 100)} percent is interest`}>
              <i style={{ width: `${(1 - r.interestShare) * 100}%`, background: 'var(--accent)' }} /><i style={{ width: `${r.interestShare * 100}%`, background: 'var(--amber)' }} />
            </div>
            <div className="hleg"><span><i className="sw" style={{ background: 'var(--accent)' }} />The loan itself</span><span><i className="sw" style={{ background: 'var(--amber)' }} />Interest</span></div>
            <div className="pad sub">The standard fixed payment: the same amount every month for the whole term, interest charged on the balance each month at the yearly rate divided by 12.</div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Savings growth ----
function GrowthPage() {
  const { data } = useVault()
  const country = data.settings.countries[0]
  const fmt = (n) => money(country, n)
  const [f, setF] = useState({ start: '', monthly: '', rate: '', years: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const r = savingsGrowth({ start: num(f.start), monthly: num(f.monthly), ratePct: f.rate === '' ? NaN : num(f.rate), years: num(f.years) })
  const [all, setAll] = useState(false)
  const rows = r ? (all ? r.rows : r.rows.slice(0, 10)) : []
  return (
    <div className="panel" data-testid="growth-calc">
      <div className="p-head"><div className="title">Savings growth <span className="sub">in {COUNTRIES[country].currency}</span></div></div>
      <div className="pad">
        <div className="calc-grid">
          <label className="field">Starting amount<NumInput value={f.start} placeholder="0" aria-label="Starting amount" onChange={set('start')} /></label>
          <label className="field">Saved each month<NumInput value={f.monthly} placeholder="0" aria-label="Saved each month" onChange={set('monthly')} /></label>
          <label className="field">Return (% a year)<NumInput value={f.rate} aria-label="Return per year" onChange={set('rate')} /></label>
          <label className="field">Years<NumInput value={f.years} aria-label="Years to grow" onChange={set('years')} /></label>
        </div>
        {!r && <div className="warnrow">Enter a starting amount or a monthly saving, a return and the years.</div>}
        {r && (
          <>
            <div className="kpis3" data-testid="growth-results">
              <div className="kpi"><small>Worth at the end</small><b className="pos" data-testid="growth-final">{fmt(r.final)}</b></div>
              <div className="kpi"><small>You put in</small><b data-testid="growth-contributed">{fmt(r.contributed)}</b></div>
              <div className="kpi"><small>Growth</small><b className="pos">{fmt(r.growth)}</b></div>
            </div>
            <div className="split" role="img" aria-label="Share of the final amount that you paid in and that is growth">
              <i style={{ width: `${(100 * r.contributed) / r.final}%`, background: 'var(--accent)' }} /><i style={{ width: `${(100 * r.growth) / r.final}%`, background: 'var(--green)' }} />
            </div>
            <div className="hleg"><span><i className="sw" style={{ background: 'var(--accent)' }} />What you put in</span><span><i className="sw" style={{ background: 'var(--green)' }} />Growth</span></div>
            <div className="tblw">
              <table className="t-left" data-testid="growth-table">
                <thead><tr><th>Year</th><th className="r">You put in</th><th className="r">Worth</th><th className="r">Growth</th></tr></thead>
                <tbody>{rows.map((x) => <tr key={x.year}><td>{x.year}</td><td className="r">{fmt(x.contributed)}</td><td className="r">{fmt(x.value)}</td><td className="r">{fmt(x.growth)}</td></tr>)}</tbody>
              </table>
            </div>
            {r.rows.length > 10 && <button type="button" className="btn sm" onClick={() => setAll(!all)}>{all ? 'Show the first 10 years' : `Show all ${r.rows.length} years`}</button>}
            <div className="pad sub">Interest is added every month at the yearly return divided by 12, and each month's saving is paid in at the end of the month. Not a forecast: real returns vary.</div>
          </>
        )}
      </div>
    </div>
  )
}
