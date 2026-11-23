export const COUNTRIES = {
  us: { code: 'us', name: 'USA', flag: '🇺🇸', currency: 'USD', symbol: '$ ', locale: 'en-US' },
  in: { code: 'in', name: 'India', flag: '🇮🇳', currency: 'INR', symbol: '₹ ', locale: 'en-IN' },
  uk: { code: 'uk', name: 'UK', flag: '🇬🇧', currency: 'GBP', symbol: '£ ', locale: 'en-GB' },
  au: { code: 'au', name: 'Australia', flag: '🇦🇺', currency: 'AUD', symbol: 'A$ ', locale: 'en-AU' },
  ch: { code: 'ch', name: 'Switzerland', flag: '🇨🇭', currency: 'CHF', symbol: 'CHF ', locale: 'de-CH' },
  ie: { code: 'ie', name: 'Ireland', flag: '🇮🇪', currency: 'EUR', symbol: '€ ', locale: 'en-IE' },
}
export const COUNTRY_CODES = Object.keys(COUNTRIES)
// A currency shown by its symbol ($, ₹, £, A$, CHF) instead of its code (USD, INR, ...). Unknown currencies keep their code.
export const curSym = (currency) => Object.values(COUNTRIES).find((c) => c.currency === currency)?.symbol.trim() || currency

export const OWNERS = ['mine', 'joint', 'spouse', 'parent']
export const ownerLabel = (owner, parentLabel = 'Parent') =>
  owner === 'mine' ? 'Mine' : owner === 'joint' ? 'Me + Others' : owner === 'spouse' ? 'Spouse' : parentLabel || 'Parent'

export const MIX = [
  { key: 'equities', label: 'Equities', short: 'Eq' },
  { key: 'cash', label: 'Cash equivalents', short: 'Cash' },
  { key: 'metals', label: 'Precious metals', short: 'Metals' },
  { key: 'bonds', label: 'Bonds', short: 'Bonds' },
]

// An amount is shown in WORDS once its whole-number part has more than 9 digits (1,000,000,000 and up; decimals are not counted):
// "$ 1.25 billion", "£ 3.4 trillion", and for rupees in crore ("₹ 1,250 crore"). Smaller amounts keep every digit.
export function bigWords(currency, abs) {
  if (abs < 1e9) return null
  if (currency === 'INR') return { n: abs / 1e7, unit: 'crore' }
  return abs >= 1e12 ? { n: abs / 1e12, unit: 'trillion' } : { n: abs / 1e9, unit: 'billion' }
}
export function money(countryCode, n) {
  const c = COUNTRIES[countryCode]
  const v = Math.round(n || 0)
  const abs = Math.abs(v)
  const w = bigWords(c.currency, abs)
  const text = w ? `${w.n.toLocaleString(c.locale, { maximumFractionDigits: 2 })} ${w.unit}` : abs.toLocaleString(c.locale)
  return (v < 0 ? '-' : '') + c.symbol + text
}

export function moneyCurrency(currency, n) {
  const c = Object.values(COUNTRIES).find((x) => x.currency === currency)
  return money(c.code, n)
}

export function parseAmount(s) {
  const n = Number(String(s).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

const pad = (n) => String(n).padStart(2, '0')
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => isoDate(new Date())

export function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// true when a maturity date falls within the next 12 months (and is not already past)
export function maturesSoon(iso, today = new Date()) {
  if (!iso) return false
  const days = (new Date(iso + 'T00:00:00') - today) / 864e5
  return days >= -1 && days <= 365
}

export function maskNumber(n) {
  if (!n) return '—'
  return '•••• ' + String(n).slice(-4)
}
