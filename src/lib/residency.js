// Works out tax residency from days spent in each country. It follows the published rules, and every result lists the rule behind it with a link to the
// official page. GUIDANCE ONLY: it does not apply treaty tie-breakers, the first-year choice or dual-status years, and rules change, so check the
// linked pages. The rules below were written from the statute summaries and the IRS and Income Tax Department wording; the linked pages are the authority.

export const REF = {
  usStatus: { label: 'IRS: Determining an individual’s tax residency status', url: 'https://www.irs.gov/individuals/international-taxpayers/determining-an-individuals-tax-residency-status' },
  usSpt: { label: 'IRS: Substantial presence test', url: 'https://itap1.for.irs.gov/owda/0/resource/Commentary_Files_Redirect_ITA/en-US/help/subprestest.html' },
  india: { label: 'Income Tax Department: Residential status', url: 'https://wm.incometaxindia.gov.in/w/residential-status' },
}
export const INCOME_LIMIT_LAKH = 15 // Indian-source income above ₹15 lakh in the year

const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0 }

// ---------------- USA (calendar year) ----------------
// in: { days, greenCard, exempt, closer } for each calendar year. -> { status: 'resident'|'nonresident', reasons: [{ text, ref }], missing: [years] }
export function usResidency(us, year) {
  const row = (y) => us?.[y] || null
  const counted = (y) => Math.max(0, n(row(y)?.days) - n(row(y)?.exempt))
  const missing = [year, year - 1, year - 2].filter((y) => !row(y) || row(y).days === '' || row(y).days == null)
  const r = row(year) || {}
  const reasons = []
  if (r.greenCard) return { status: 'resident', reasons: [{ text: 'You held a green card (lawful permanent resident) during the year, so you are a US resident for tax whatever your days (green card test).', ref: REF.usStatus }], missing }
  const c0 = counted(year), c1 = counted(year - 1), c2 = counted(year - 2)
  const total = c0 + c1 / 3 + c2 / 6
  const formula = `${c0} + ${Math.round(c1 * 100 / 3) / 100} (a third of ${c1}) + ${Math.round(c2 * 100 / 6) / 100} (a sixth of ${c2}) = ${Math.round(total * 100) / 100}`
  const meets = c0 >= 31 && total >= 183
  if (!meets) {
    reasons.push({ text: c0 < 31 ? `Only ${c0} counted days in the year: under 31, so the substantial presence test is not met.` : `Weighted days ${formula}: under 183, so the substantial presence test is not met.`, ref: REF.usSpt })
    return { status: 'nonresident', reasons, missing }
  }
  reasons.push({ text: `Substantial presence test met: at least 31 days this year and ${formula} is 183 or more.`, ref: REF.usSpt })
  if (c0 < 183 && r.closer) return { status: 'nonresident', reasons: [...reasons, { text: 'You are present for less than 183 days and say you had a tax home in, and a closer connection to, another country (closer connection exception, which needs Form 8840). Treated as a nonresident.', ref: REF.usSpt }], missing }
  return { status: 'resident', reasons, missing }
}

// ---------------- India (financial year, 1 April to 31 March; `fy` is the starting year, 2025 = FY 2025-26) ----------------
// in: { days, left, income15, liableElsewhere } per financial year; opts.citizen = Indian citizen or person of Indian origin.
// -> { status: 'ror'|'rnor'|'nri', reasons, missing, resident }. Years with no data count as 0 days / not resident.
export function indiaResidency(inn, fy, opts = {}, memo = {}) {
  if (memo[fy]) return memo[fy]
  const row = (y) => inn?.[y] || {}
  const d = (y) => n(row(y).days)
  const have = (y) => inn?.[y] && inn[y].days !== '' && inn[y].days != null
  const missing = [fy, ...Array.from({ length: 10 }, (_, i) => fy - 1 - i)].filter((y) => !have(y))
  const days = d(fy), prev4 = [1, 2, 3, 4].reduce((s, i) => s + d(fy - i), 0), prev7 = [1, 2, 3, 4, 5, 6, 7].reduce((s, i) => s + d(fy - i), 0)
  const r = row(fy), citizen = !!opts.citizen
  const reasons = []
  let resident = false, via120 = false, deemed = false
  if (days >= 182) { resident = true; reasons.push({ text: `${days} days in India in the year: 182 or more, so resident.`, ref: REF.india }) }
  else if (citizen && r.left) reasons.push({ text: `${days} days: you left India for employment abroad, so the 60-day condition does not apply and 182 days are needed. Not met.`, ref: REF.india })
  else if (citizen && r.income15 && days >= 120 && prev4 >= 365) { resident = true; via120 = true; reasons.push({ text: `As an Indian citizen or person of Indian origin visiting India with Indian-source income above ₹${INCOME_LIMIT_LAKH} lakh, the test is 120 days plus 365 days in the previous 4 years: ${days} and ${prev4}. Met, so resident (but not ordinarily resident).`, ref: REF.india }) }
  else if (citizen) reasons.push({ text: `${days} days: as an Indian citizen or person of Indian origin visiting India, 182 days are needed${r.income15 ? ` (120 with the previous 4 years at 365 or more; yours is ${prev4})` : ''}. Not met.`, ref: REF.india })
  else if (days >= 60 && prev4 >= 365) { resident = true; reasons.push({ text: `${days} days this year (60 or more) and ${prev4} in the previous 4 years (365 or more): resident.`, ref: REF.india }) }
  else reasons.push({ text: `${days} days this year and ${prev4} in the previous 4 years: neither the 182-day nor the 60 plus 365-day condition is met.`, ref: REF.india })
  if (!resident && citizen && r.income15 && !r.liableElsewhere) {
    deemed = true; resident = true
    reasons.push({ text: `Deemed resident: an Indian citizen with Indian-source income above ₹${INCOME_LIMIT_LAKH} lakh who is not liable to tax in any other country because of domicile or residence. Deemed residents are resident but not ordinarily resident.`, ref: REF.india })
  }
  let status = 'nri'
  if (resident) {
    const nonRes = Array.from({ length: 10 }, (_, i) => indiaResidency(inn, fy - 1 - i, opts, memo)).filter((x) => !x.resident).length
    const why = []
    if (deemed || via120) why.push(deemed ? 'deemed resident' : 'resident only through the 120-day rule')
    if (nonRes >= 9) why.push(`non-resident in ${nonRes} of the previous 10 years (9 or more)`)
    if (prev7 <= 729) why.push(`${prev7} days in India in the previous 7 years (729 or fewer)`)
    if (why.length) { status = 'rnor'; reasons.push({ text: `Resident but not ordinarily resident: ${why.join('; ')}.`, ref: REF.india }) }
    else { status = 'ror'; reasons.push({ text: `Resident and ordinarily resident: non-resident in ${nonRes} of the previous 10 years (RNOR needs 9 or more) and ${prev7} days in the previous 7 years (RNOR needs 729 or fewer).`, ref: REF.india }) }
  } else reasons.push({ text: 'Not resident, so non-resident (NRI).', ref: REF.india })
  return (memo[fy] = { status, reasons, missing, resident })
}

// ---------------- turning yearly results into date ranges ----------------
const dayNum = (isoDate) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86400000)
const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10)
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
// Yearly results [{ year, status }] (consecutive years) -> date ranges, merging neighbours with the same status. The year in progress (`currentYear`) has no end date.
export function yearsToRanges(country, years, currentYear) {
  const out = []
  let lastYear = null
  for (const { year, status } of years) {
    const from = country === 'in' ? iso(year, 4, 1) : iso(year, 1, 1)
    const isLast = year === years[years.length - 1].year
    const to = year === currentYear && isLast ? '' : country === 'in' ? iso(year + 1, 3, 31) : iso(year, 12, 31) // only the year in progress, when it is the last one, has no end date
    const last = out[out.length - 1]
    if (last && last.status === status && last.to !== '' && lastYear === year - 1) last.to = to // a skipped year starts a new range
    else out.push({ status, from, to })
    lastYear = year
  }
  return out
}
// The financial year (starting year) a date is in, and the current ones.
export const indiaFYOf = (isoDate) => { const y = Number(isoDate.slice(0, 4)); return Number(isoDate.slice(5, 7)) >= 4 ? y : y - 1 }

// ---------------- modelling a planned US departure ----------------
// plan: { departure: 'YYYY-MM-DD' (in the future), usVisitDays: days a year you expect to visit the US after leaving, indiaVisitDays: days a year you expect to spend in
// India before you leave, givesUpGreenCard: bool }. From the days you entered so far it builds the days for the coming years (until 4 years after leaving) and runs the same
// rules on them. Assumptions: the Indian-side answers (left for employment, income over the limit, taxed elsewhere) stay as in your latest entered year; a green card is
// kept until the year you leave and then given up unless you say otherwise; in the year you leave a green card holder is treated as resident for the whole year.
export function projectDeparture(inputs, plan, todayISO, opts = {}) {
  const dep = plan?.departure
  if (!dep || !/^\d{4}-\d{2}-\d{2}$/.test(dep) || dep <= todayISO) return null
  const usV = Math.min(365, Math.max(0, Number(plan.usVisitDays) || 0)), inV = Math.min(365, Math.max(0, Number(plan.indiaVisitDays) || 0))
  const curYear = Number(todayISO.slice(0, 4)), curFY = Number(todayISO.slice(5, 7)) >= 4 ? curYear : curYear - 1
  const depYear = Number(dep.slice(0, 4)), last = depYear + 4
  const t = dayNum(todayISO), d0 = dayNum(dep)
  // days in a date range, split at the departure day: -> { before: days on or before it, after: days after it }
  const split = (a, b) => { let before = 0, after = 0; for (let d = a; d <= b; d++) (d <= d0 ? before++ : after++); return { before, after } }
  const planUs = (a, b) => { if (b < a) return 0; const { before, after } = split(a, b); return Math.round(before * (1 - inV / 365) + after * (usV / 365)) }
  const planIn = (a, b) => { if (b < a) return 0; let before = 0, onOrAfter = 0; for (let d = a; d <= b; d++) (d < d0 ? before++ : onOrAfter++); return Math.round(before * (inV / 365) + onOrAfter * (1 - usV / 365)) }
  const us = JSON.parse(JSON.stringify(inputs.us || {})), inn = JSON.parse(JSON.stringify(inputs.in || {}))
  const lastIn = Object.keys(inputs.in || {}).filter((y) => inputs.in[y]?.days !== '' && inputs.in[y]?.days != null).sort().pop()
  const lastUs = Object.keys(inputs.us || {}).filter((y) => inputs.us[y]?.days !== '' && inputs.us[y]?.days != null).sort().pop()
  const carryIn = lastIn ? inputs.in[lastIn] : {}, carryUs = lastUs ? inputs.us[lastUs] : {}
  for (let y = curYear; y <= last; y++) {
    const a = Math.max(dayNum(`${y}-01-01`), t + 1), b = dayNum(`${y}-12-31`)
    const base = y === curYear ? Number(inputs.us?.[y]?.days) || 0 : 0
    const gc = y < depYear ? !!carryUs.greenCard : y === depYear ? !!carryUs.greenCard : !!carryUs.greenCard && plan.givesUpGreenCard === false
    us[y] = { ...(y === curYear && inputs.us?.[y] ? inputs.us[y] : {}), days: base + planUs(a, b), greenCard: gc, exempt: y === curYear ? inputs.us?.[y]?.exempt ?? '' : '', closer: !!carryUs.closer }
  }
  for (let y = curFY; y <= last; y++) {
    const a = Math.max(dayNum(`${y}-04-01`), t + 1), b = dayNum(`${y + 1}-03-31`)
    const base = y === curFY ? Number(inputs.in?.[y]?.days) || 0 : 0
    inn[y] = { ...(y === curFY && inputs.in?.[y] ? inputs.in[y] : {}), days: base + planIn(a, b), left: !!carryIn.left, income15: !!carryIn.income15, liableElsewhere: !!carryIn.liableElsewhere }
  }
  const memo = {}
  const years = []
  for (let y = Math.min(curYear, curFY); y <= last; y++) {
    const u = y >= curYear ? usResidency(us, y) : null
    const i = y >= curFY ? indiaResidency(inn, y, opts, memo) : null
    years.push({ year: y, us: u, in: i, usDays: us[y]?.days ?? null, inDays: inn[y]?.days ?? null })
  }
  return { years, departure: dep, usYears: years.filter((x) => x.us).map((x) => ({ year: x.year, status: x.us.status })), inYears: years.filter((x) => x.in).map((x) => ({ year: x.year, status: x.in.status })) }
}
