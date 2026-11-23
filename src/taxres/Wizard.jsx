import { useState } from 'react'
import { Modal } from '../finance/ui.jsx'
import { useVault } from '../finance/VaultContext.jsx'
import { todayISO } from '../lib/format.js'
import { REF, INCOME_LIMIT_LAKH, indiaFYOf, indiaResidency, projectDeparture, usResidency, yearsToRanges } from '../lib/residency.js'
import { normalizeInputs, setRanges, statusOf } from '../lib/taxres.js'
import { countDays, travelProblems } from '../lib/travel.js'

const STEPS = ['Start', 'About you', 'Travel dates (optional)', 'USA', 'India', 'Plan ahead (optional)', 'Results']
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
  const proj = projectDeparture(inputs, inputs.plan, today, opts) // a planned future US departure, if one is set
  const withPlan = !!(proj && inputs.plan.include)
  const usFinal = withPlan ? [...usList.filter((x) => x.year < curYear), ...proj.usYears] : usList
  const inFinal = withPlan ? [...inList.filter((x) => x.year < curFY), ...proj.inYears] : inList

  const apply = () => {
    const make = (country, list, cur) => yearsToRanges(country, list, cur)
    update((d) => {
      let next = d
      for (const [c, list, cur] of [['us', usFinal, curYear], ['in', inFinal, curFY]]) {
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
      <button className="btn" onClick={onClose}>{step === 6 ? 'Close' : 'Save and close'}</button>
      {step === 6 && <button className="btn primary" disabled={!usFinal.length && !inFinal.length} onClick={apply} data-testid="wiz-apply">Save these Dates</button>}
      {step < 6 && <button className="btn primary" onClick={() => setStep(step + 1)} data-testid="wiz-next">{step === 5 ? 'See my results →' : step === 2 ? 'Next (skip if you will type days) →' : step === 5 ? 'Next →' : 'Next →'}</button>}
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

        {step === 2 && <TravelStep inputs={inputs} start={start} today={today} usYears={usYears} inYears={inYears} set={set} />}

        {step === 3 && (
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

        {step === 4 && (
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

        {step === 5 && <PlanStep inputs={inputs} proj={proj} set={set} today={today} />}

        {step === 6 && (
          <Results usYears={usYears} inYears={inYears} entered={entered} usRes={usRes} inRes={inRes} proj={proj} withPlan={withPlan} applied={applied} set={set} inputs={inputs} />
        )}
      </div>
    </Modal>
  )
}

// Optional: the dates you arrived in and left the US, and each trip out of it (with a tick for India), turned into days per year for both countries.
function TravelStep({ inputs, start, today, usYears, inYears, set }) {
  const t = inputs.travel
  const [done, setDone] = useState('')
  const setT = (patch) => { setDone(''); set((i) => { i.travel = { ...i.travel, ...patch }; return i }) }
  const setTrip = (id, patch) => setT({ trips: t.trips.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const hasDates = !!(t.usArrival || t.usDeparture || t.trips.length)
  const problems = travelProblems(t)
  const days = hasDates && !problems.length ? countDays(t, start, today) : null
  const fill = () => {
    set((i) => {
      for (const y of usYears) i.us[y] = { ...(i.us[y] || {}), days: days.us[y] || 0 }
      for (const y of inYears) i.in[y] = { ...(i.in[y] || {}), days: days.in[y] || 0 }
      return i
    })
    setDone(`Filled in the days for ${usYears.length} US year${usYears.length === 1 ? '' : 's'} and ${inYears.length} India year${inYears.length === 1 ? '' : 's'}. You can still change any number on the next two steps.`)
  }
  return (
    <div data-testid="travel-step">
      <p>Optional. Instead of counting days yourself, enter when you arrived in or left the US and each trip you took out of it. The days in each country are worked out for every year. <b>Skip this step to type the days yourself.</b></p>
      <div className="two">
        <label className="field">I arrived in the US on <span className="sub">(leave empty if you were already there at the start)</span><input type="date" value={t.usArrival} onChange={(e) => setT({ usArrival: e.target.value })} aria-label="US arrival date" /></label>
        <label className="field">I left the US for good on <span className="sub">(leave empty if you are still there)</span><input type="date" value={t.usDeparture} onChange={(e) => setT({ usDeparture: e.target.value })} aria-label="US departure date" /></label>
      </div>
      <h4>Trips out of the US</h4>
      {t.trips.length === 0 && <div className="sub">No trips yet.</div>}
      {t.trips.length > 0 && (
        <div className="tblw"><table className="t-left wiz-t">
          <thead><tr><th>Left the US on</th><th>Came back on</th><th>Trip was to India</th><th /></tr></thead>
          <tbody>
            {t.trips.map((x, i) => (
              <tr key={x.id}>
                <td><input type="date" value={x.exit} aria-label={`Trip ${i + 1} left the US`} onChange={(e) => setTrip(x.id, { exit: e.target.value })} /></td>
                <td><input type="date" value={x.entry} aria-label={`Trip ${i + 1} came back`} onChange={(e) => setTrip(x.id, { entry: e.target.value })} /><div className="sub">empty = not back yet</div></td>
                <td><input type="checkbox" checked={x.india} aria-label={`Trip ${i + 1} was to India`} onChange={(e) => setTrip(x.id, { india: e.target.checked })} /></td>
                <td className="act"><button className="link danger" onClick={() => setT({ trips: t.trips.filter((y) => y.id !== x.id) })} aria-label={`Remove trip ${i + 1}`}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <button className="btn sm" onClick={() => setT({ trips: [...t.trips, { id: Math.random().toString(36).slice(2), exit: '', entry: '', india: false }] })} data-testid="add-trip">+ Add trip</button>
      {problems.map((p) => <div key={p} className="badrow">{p}</div>)}
      {days && (
        <>
          <h4>Days worked out from your dates</h4>
          <div className="tblw"><table className="t-left wiz-t" data-testid="travel-days">
            <thead><tr><th>Year</th><th>Days in the US</th><th>Days in India (financial year starting that year)</th></tr></thead>
            <tbody>{usYears.map((y) => <tr key={y}><td><b>{y}</b></td><td data-testid={`travel-us-${y}`}>{days.us[y] || 0}</td><td data-testid={`travel-in-${y}`}>{inYears.includes(y) ? days.in[y] || 0 : '—'}</td></tr>)}</tbody>
          </table></div>
          <button className="btn primary" onClick={fill} data-testid="travel-fill">Use these days</button>
          {done && <div className="okrow" data-testid="travel-done">{done}</div>}
        </>
      )}
      <div className="sub" style={{ marginTop: 10 }}>How the days are counted: any part of a day in the US counts, so the day you arrive and the day you leave both count there. India counts the day you arrive and the day you leave too, so a crossing day counts in both countries. Time outside the US before you arrived and after you left for good is counted as time in India, and a trip marked "to India" counts as India from the day you left the US to the day you came back. Trips elsewhere only take days out of the US. The current year is counted up to today.</div>
    </div>
  )
}

// Optional: model leaving the US for good on a future date. Uses the days entered so far and runs the same rules on the coming years.
function PlanStep({ inputs, proj, set, today }) {
  const pl = inputs.plan
  const setPlan = (patch) => set((i) => { i.plan = { ...i.plan, ...patch }; return i })
  const bad = pl.departure && pl.departure <= today
  const anyGreenCard = Object.values(inputs.us).some((r) => r.greenCard)
  const fyLabel = (y) => `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`
  const lines = []
  if (proj) {
    const depYear = Number(pl.departure.slice(0, 4))
    const firstNon = proj.usYears.find((x) => x.year >= depYear && x.status === 'nonresident')
    lines.push(firstNon ? `USA: you would be a US tax resident through ${firstNon.year - 1}, and a nonresident from ${firstNon.year}.` : 'USA: with these answers you stay a US tax resident through the years shown.')
    let prev = null
    for (const x of proj.inYears) { if (x.status !== prev) lines.push(`India: ${statusOf('in', x.status).label} from ${fyLabel(x.year)}${prev ? ` (was ${statusOf('in', prev).label})` : ''}.`); prev = x.status }
  }
  return (
    <div data-testid="plan-step">
      <p>Optional. Model leaving the US for good on a future date, to see when your tax status would change in each country. It starts from the days you have entered and works out the coming years.</p>
      <div className="two">
        <label className="field">If I leave the US for good on<input type="date" value={pl.departure} onChange={(e) => setPlan({ departure: e.target.value })} aria-label="Planned US departure date" /></label>
        <label className="field">…and expect to visit the US (days a year after leaving)<input type="number" min="0" max="365" value={pl.usVisitDays} onChange={(e) => setPlan({ usVisitDays: e.target.value })} aria-label="Visit days in the US after leaving" /></label>
      </div>
      <label className="field">Days a year I expect to spend in India before I leave (visits)<input type="number" min="0" max="365" value={pl.indiaVisitDays} onChange={(e) => setPlan({ indiaVisitDays: e.target.value })} aria-label="Visit days in India before leaving" style={{ maxWidth: 160 }} /></label>
      {anyGreenCard && <label className="chk"><input type="checkbox" checked={pl.givesUpGreenCard} onChange={(e) => setPlan({ givesUpGreenCard: e.target.checked })} aria-label="Give up the green card" /><span>I will give up my green card when I leave<span className="sub" style={{ display: 'block' }}>If you keep it, you stay a US tax resident whatever your days.</span></span></label>}
      {bad && <div className="badrow">Choose a date after today. To record a past departure, use the travel dates step.</div>}
      {proj && (
        <>
          <h4>What would change</h4>
          <ul data-testid="plan-summary">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <div className="tblw"><table className="t-left wiz-t" data-testid="plan-table">
            <thead><tr><th>Year</th><th>USA days</th><th>USA</th><th>India days (FY from April)</th><th>India</th></tr></thead>
            <tbody>
              {proj.years.map((x) => (
                <tr key={x.year}>
                  <td><b>{x.year}</b></td>
                  <td>{x.us ? x.usDays : '—'}</td><td data-testid={`plan-us-${x.year}`}>{x.us ? <Tone country="us" status={x.us.status} /> : '—'}</td>
                  <td>{x.in ? x.inDays : '—'}</td><td data-testid={`plan-in-${x.year}`}>{x.in ? <Tone country="in" status={x.in.status} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      <div className="sub" style={{ marginTop: 8 }}>Assumptions: the current year keeps the days you entered and adds the days to come. Days after you leave are in India except your US visits; days before are in the US except your India visits. The India answers (left for employment, income over the limit, taxed elsewhere) stay as in your latest year. A green card is kept until the year you leave; in that year a green card holder is treated as resident for the whole year (dual-status is not modelled). Years are shown for 4 years after you leave.</div>
    </div>
  )
}

function Results({ usYears, inYears, entered, usRes, inRes, proj, withPlan, applied, set, inputs }) {
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
      {proj && (
        <div className="wiz-res" data-testid="wiz-plan">
          <h4>Planned: leaving the US for good on {proj.departure}</h4>
          <label className="chk"><input type="checkbox" checked={inputs.plan.include} onChange={(e) => set((i) => { i.plan = { ...i.plan, include: e.target.checked }; return i })} aria-label="Include the planned years" /><span>Include the planned years when I save the dates</span></label>
          {['us', 'in'].map((c) => (
            <div key={c}>
              <b>{c === 'us' ? 'USA' : 'India'}</b>
              {proj.years.filter((x) => x[c]).map((x) => (
                <details key={x.year} className="wiz-year">
                  <summary><b>{c === 'in' ? `FY ${x.year}-${String((x.year + 1) % 100).padStart(2, '0')}` : x.year}</b> <Tone country={c} status={x[c].status} /> <span className="sub">planned</span></summary>
                  <ul>{x[c].reasons.map((r, i) => <li key={i}>{r.text} <span className="sub">Source: <Src r={r.ref} /></span></li>)}</ul>
                </details>
              ))}
            </div>
          ))}
        </div>
      )}
      {applied && <div className="okrow" data-testid="wiz-applied">{applied}</div>}
      <div className="warnrow">Guidance, not tax advice. Treaty tie-breakers, the first-year choice and dual-status years are not applied. Check the official pages: <Src r={REF.usStatus} />, <Src r={REF.usSpt} />, <Src r={REF.india} />.</div>
    </>
  )
}
