// Demo mode: the GitHub Pages showcase runs the same app on made-up data from demo/demo-data.json.
// It is switched on at build time (VITE_DEMO=true, see .env.demo). Nothing is saved or sent anywhere.
import { addDays, addMonths } from './dates.js'
import { isoDate } from './format.js'
import { normalizeData } from './model.js'

export const IS_DEMO = import.meta.env?.VITE_DEMO === 'true'
export const APP_URL = 'https://github.com/saurskr/wealth-bridge#readme'

const monthDiff = (from, to) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7))

// Keep the sample data looking current whenever the demo is opened: history moves forward so the latest update is
// this month, and the dates that drive warnings (price age, market figures, property tax due) are set relative to today.
export function freshenDemo(data, today = new Date()) {
  const now = isoDate(today)
  const latest = data.balances.reduce((m, b) => (b.date > m ? b.date : m), '')
  const shift = latest ? Math.max(0, monthDiff(latest, now)) : 0
  const mv = (date) => (shift && date ? addMonths(date, shift) : date)
  const recent = addDays(now, -3)
  return {
    ...data,
    balances: data.balances.map((b) => ({ ...b, date: mv(b.date) })),
    rates: data.rates.map((r) => ({ ...r, date: mv(r.date) })),
    propertyValues: data.propertyValues.map((v) => (v.source === 'purchase' ? v : { ...v, date: mv(v.date) })),
    loanUpdates: data.loanUpdates.map((u) => ({ ...u, date: mv(u.date) })),
    holdings: data.holdings.map((h) => (h.priceDate ? { ...h, priceDate: recent } : h)),
    properties: data.properties.map((p) => (p.taxDue ? { ...p, taxDue: addDays(now, 45) } : p)),
    retirement: {
      ...data.retirement,
      plan: { ...data.retirement.plan, asOf: recent },
      versions: data.retirement.versions.map((v) => ({ ...v, savedAt: mv(v.savedAt), plan: { ...v.plan, asOf: recent } })),
    },
  }
}

// The sample data, ready to use. The JSON is only loaded in demo mode.
export async function loadDemoData(today = new Date()) {
  const mod = await import('../../demo/demo-data.json')
  return normalizeData(freshenDemo(JSON.parse(JSON.stringify(mod.default)), today))
}
