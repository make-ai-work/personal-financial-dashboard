import { useState } from 'react'
import { Modal } from '../finance/ui.jsx'
import { useVault } from '../finance/VaultContext.jsx'
import { todayISO } from '../lib/format.js'
import { REF, INCOME_LIMIT_LAKH, indiaFYOf, indiaResidency, usResidency, yearsToRanges } from '../lib/residency.js'
import { normalizeInputs, setRanges, statusOf } from '../lib/taxres.js'

const STEPS = ['Start', 'About you', 'USA', 'India', 'Results']
const Src = ({ r }) => <a href={r.url} target="_blank" rel="noreferrer">{r.label}</a>
const Tone = ({ country, status }) => { const s = statusOf(country, status); return <span className={`pill tone-${s.tone}`}>{s.label}</span> }

// The guided check: a few questions in order (who you are, days in the US, days in India), then the result for every year with the rule behind it and a link
// to the official page. "Use these results" turns the yearly results into the date ranges on the Tax Residency tab.
export default function Wizard({ onClose }) {
  const { data, update } = useVault()
  const inputs = data.taxResidency.inputs
  const today = todayISO()
  const curYear = Number(today.slice(0, 4)), curFY = indiaFYOf(today)
  const start = inputs.startYear || curYear - 9
  const [step, setStep] = useState(0)
  const [applied, setApplied] = useState('')
  const set = (fn) => update((d) => ({ ...d, taxResidency: { ...d.taxResidency, inputs: normalizeInputs(fn(JSON.parse(JSON.stringify(d.taxResidency.inputs)))) } }))
  const usYears = Array.from({ length: curYear - start + 1 }, (_, i) => start + i)
  const inYears = Array.from({ length: curFY - start + 1 }, (_, i) => start + i)
  const setRow = (c, y, patch) => set((i) => { i[c][y] = { ...(i[c][y] || {}), ...patch }; return i })
  const opts = { citizen: inputs.citizen }
  const usRes = (y) => usResidency(inputs.us, y)
  const memo = {}
  const inRes = (y) => indiaResidency(inputs.in, y, opts, memo)
  const entered = (c, y) => inputs[c][y] && inputs[c][y].days !== '' && inputs[c][y].days != null
  const usList = usYears.filter((y) => entered('us', y)).map((y) => ({ year: y, status: usRes(y).status }))
  const inList = inYears.filter((y) => entered('in', y)).map((y) => ({ year: y, status: inRes(y).status }))

  const apply = () => {
    const make = (country, list, cur) => yearsToRanges(country, list, cur)
    update((d) => {
      let next = d
      for (const [c, list, cur] of [['us', usList, curYear], ['in', inList, curFY]]) {
        if (!list.length) continue
        const ranges = make(c, list, cur)
        const lo = ranges[0].from, hi = ranges.some((r) => r.to === '') ? '9999-12-31' : ranges[ranges.length - 1].to
        const keep = next.taxResidency[c].filter((r) => (r.to || '9999-12-31') < lo || r.from > hi) // the periods the check covers are replaced
        next = setRanges(next, c, [...keep, ...ranges])
      }
      return next
    })
    setApplied('The Tax Residency tab now shows these results as date ranges. Periods that overlapped them were replaced.')
  }

  const footer = (
    <>
      {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>← Back</button>}
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={onClose}>{step === 4 ? 'Close' : 'Save and close'}</button>
      {step < 4 && <button className="btn primary" onClick={() => setStep(step + 1)} data-testid="wiz-next">{step === 3 ? 'See my results →' : 'Next →'}</button>}
    </>
  )
  return (
    <Modal wide title="Tax residency: guided check" onClose={onClose} footer={footer}>
      <div data-testid="residency-wizard">
        <ol className="wiz-steps">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><button type="button" onClick={() => setStep(i)}>{i + 1}. {s}</button></li>)}</ol>

        {step === 0 && (
          <>
            <p>This check works out your tax residency <b>year by year</b> from the days you spent in each country, using the published rules, and then fills in the Tax Residency tab for you.</p>
            <ul>
              <li><b>USA:</b> the green card test and the substantial presence test (calendar years). Source: <Src r={REF.usStatus} /> and <Src r={REF.usSpt} />.</li>
              <li><b>India:</b> the 182-day and 60 plus 365-day tests, the rules for citizens and people of Indian origin, deemed residence, and ROR or RNOR (financial years, April to March). Source: <Src r={REF.india} />.</li>
            </ul>
            <p>You will need roughly how many days you were in each country in each year. India's RNOR test looks back 10 years, so go back as far as you can.</p>
            <div className="warnrow">This is guidance, not tax advice. It does not apply tax-treaty tie-breakers, the first-year choice or dual-status years, and the rules change. Check each result against the linked official page.</div>
          </>
        )}

        {step === 1 && (
          <>
            <label className="chk"><input type="checkbox" checked={inputs.citizen} onChange={(e) => set((i) => { i.citizen = e.target.checked; return i })} aria-label="Citizen or person of Indian origin" />
              <span>I am a citizen of India, or a person of Indian origin<span className="sub" style={{ display: 'block' }}>Person of Indian origin: you, either of your parents or any of your grandparents was born in undivided India. This changes India's day tests (182 days, or 120 with high Indian income) and adds the deemed-resident rule.</span></span></label>
            <label className="field">First year to include
              <select value={start} onChange={(e) => set((i) => { i.startYear = Number(e.target.value); return i })} aria-label="First year">
                {Array.from({ length: 16 }, (_, k) => curYear - k).map((y) => <option key={y} value={y}>{y}{y === curYear - 9 ? ' (10 years back, recommended)' : ''}</option>)}
              </select>
            </label>
            <div className="sub">Years before this are counted as zero days, which can change India's RNOR result.</div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="sub">Days you were physically in the USA in each calendar year (1 January to 31 December). Count any part of a day. The result updates as you type. <Src r={REF.usSpt} /></p>
            <div className="tblw"><table className="t-left wiz-t">
              <thead><tr><th>Year</th><th>Days in the US</th><th title="Lawful permanent resident at any time that year">Green card</th><th title="Days that do not count, such as days as an exempt individual (certain students or teachers on F, J, M or Q visas) or in transit">Days not counted</th><th title="You were in the US under 183 days, kept a tax home abroad and had a closer connection to another country (Form 8840)">Closer connection claimed</th><th>Result</th></tr></thead>
              <tbody>
                {usYears.map((y) => {
                  const r = inputs.us[y] || {}
                  const res = entered('us', y) || r.greenCard ? usRes(y) : null
                  return (
                    <tr key={y}>
                      <td><b>{y}</b></td>
                      <td><input type="number" min="0" max="366" value={r.days ?? ''} aria-label={`US days ${y}`} onChange={(e) => setRow('us', y, { days: e.target.value })} /></td>
                      <td><input type="checkbox" checked={!!r.greenCard} aria-label={`Green card ${y}`} onChange={(e) => setRow('us', y, { greenCard: e.target.checked })} /></td>
                      <td><input type="number" min="0" max="366" value={r.exempt ?? ''} aria-label={`US days not counted ${y}`} onChange={(e) => setRow('us', y, { exempt: e.target.value })} /></td>
                      <td><input type="checkbox" checked={!!r.closer} aria-label={`Closer connection ${y}`} onChange={(e) => setRow('us', y, { closer: e.target.checked })} /></td>
                      <td data-testid={`us-res-${y}`}>{res ? <Tone country="us" status={res.status} /> : <span className="sub">enter days</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
            <div className="sub">The test also uses the two years before, so enter those years too. A year left empty counts as 0 days.</div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="sub">Days you were in India in each financial year (1 April to 31 March). <Src r={REF.india} /></p>
            <div className="tblw"><table className="t-left wiz-t">
              <thead><tr><th>Financial year</th><th>Days in India</th>{inputs.citizen && <><th title="You left India that year to take up a job abroad (or as a crew member of a ship)">Left for employment abroad</th><th title={`Your total income from Indian sources (not counting income earned abroad) was over ₹${INCOME_LIMIT_LAKH} lakh`}>Indian income over ₹{INCOME_LIMIT_LAKH} lakh</th><th title="You were liable to tax in another country because of your domicile or residence there (for example a US tax resident)">Taxed in another country</th></>}<th>Result</th></tr></thead>
              <tbody>
                {inYears.map((y) => {
                  const r = inputs.in[y] || {}
                  const res = entered('in', y) ? inRes(y) : null
                  return (
                    <tr key={y}>
                      <td><b>FY {y}-{String((y + 1) % 100).padStart(2, '0')}</b></td>
                      <td><input type="number" min="0" max="366" value={r.days ?? ''} aria-label={`India days ${y}`} onChange={(e) => setRow('in', y, { days: e.target.value })} /></td>
                      {inputs.citizen && <>
                        <td><input type="checkbox" checked={!!r.left} aria-label={`Left for employment ${y}`} onChange={(e) => setRow('in', y, { left: e.target.checked })} /></td>
                        <td><input type="checkbox" checked={!!r.income15} aria-label={`Income over limit ${y}`} onChange={(e) => setRow('in', y, { income15: e.target.checked })} /></td>
                        <td><input type="checkbox" checked={!!r.liableElsewhere} aria-label={`Taxed elsewhere ${y}`} onChange={(e) => setRow('in', y, { liableElsewhere: e.target.checked })} /></td>
                      </>}
                      <td data-testid={`in-res-${y}`}>{res ? <Tone country="in" status={res.status} /> : <span className="sub">enter days</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
            {!inputs.citizen && <div className="sub">The extra questions for citizens and people of Indian origin are hidden. Change that on step 2.</div>}
          </>
        )}

        {step === 4 && (
          <Results usYears={usYears} inYears={inYears} entered={entered} usRes={usRes} inRes={inRes} usList={usList} inList={inList} apply={apply} applied={applied} />
        )}
      </div>
    </Modal>
  )
}

function Results({ usYears, inYears, entered, usRes, inRes, usList, inList, apply, applied }) {
  const block = (country, years, res, label) => {
    const rows = years.filter((y) => entered(country === 'us' ? 'us' : 'in', y))
    return (
      <div className="wiz-res" data-testid={`wiz-${country}`}>
        <h4>{label}</h4>
        {!rows.length && <div className="sub">No days entered.</div>}
        {rows.map((y) => {
          const r = res(y)
          return (
            <details key={y} className="wiz-year">
              <summary><b>{country === 'in' ? `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}` : y}</b> <Tone country={country} status={r.status} />{r.missing.length > 0 && <span className="sub"> · {r.missing.length} earlier year{r.missing.length === 1 ? '' : 's'} not entered (counted as 0 days)</span>}</summary>
              <ul>{r.reasons.map((x, i) => <li key={i}>{x.text} <span className="sub">Source: <Src r={x.ref} /></span></li>)}</ul>
            </details>
          )
        })}
      </div>
    )
  }
  return (
    <>
      <p className="sub">Each year shows its result. Open a year to see the rule behind it and the official page it comes from.</p>
      {block('us', usYears, usRes, 'USA (calendar years)')}
      {block('in', inYears, inRes, 'India (financial years, April to March)')}
      <div className="row-actions">
        <button className="btn primary" disabled={!usList.length && !inList.length} onClick={apply} data-testid="wiz-apply">Use these results on the Tax Residency tab</button>
      </div>
      {applied && <div className="okrow" data-testid="wiz-applied">{applied}</div>}
      <div className="warnrow">Guidance, not tax advice. Treaty tie-breakers, the first-year choice and dual-status years are not applied. Check the official pages: <Src r={REF.usStatus} />, <Src r={REF.usSpt} />, <Src r={REF.india} />.</div>
    </>
  )
}
