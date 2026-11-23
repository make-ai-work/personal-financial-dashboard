// Ticker lookup for "Add holding": type a symbol, find its name. Uses your own Alpha Vantage key (the one in Settings → Home). The free key allows
// 25 requests a day, so this module is built to be open about that:
//   - a lookup only runs when you press "Look up" (never while typing), and the same symbol is never asked twice (answers are cached on this device)
//   - a counter of today's lookups is kept on this device (resets each day) and shown next to the button, with how many are left
//   - the full ticker list you will provide later (LOCAL_TICKERS) is searched FIRST, offline, and costs no request
//   - every failure (no key, limit reached, unknown symbol, no connection) has a plain message, and typing the name yourself always works
import { AV_BASE } from './alphavantage.js'
import { LOCAL_TICKERS } from './tickers.js'

export const DAILY_LIMIT = 25
const USAGE = 'av.usage'
const CACHE = 'av.symcache'
const MAX_CACHE = 300

const ls = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } },
}
const today = () => new Date().toISOString().slice(0, 10)

// ---- today's request count (shared with anything else that spends Alpha Vantage requests) ----
export function usage(day = today()) {
  try { const j = JSON.parse(ls.get(USAGE)); if (j && j.day === day) return { used: Number(j.used) || 0, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - (Number(j.used) || 0)), day } } catch { /* none yet */ }
  return { used: 0, limit: DAILY_LIMIT, remaining: DAILY_LIMIT, day }
}
export function noteRequests(n = 1, day = today()) {
  const u = usage(day)
  ls.set(USAGE, JSON.stringify({ day, used: u.used + n }))
  return usage(day)
}
// The limit was hit (Alpha Vantage said so): count the rest of the day as used.
export const markLimitReached = (day = today()) => ls.set(USAGE, JSON.stringify({ day, used: DAILY_LIMIT }))

// ---- Alpha Vantage SYMBOL_SEARCH ----
export const searchUrl = (keywords, key) => `${AV_BASE}?${new URLSearchParams({ function: 'SYMBOL_SEARCH', keywords, apikey: key })}`

const KIND = { equity: 'stock', stock: 'stock', etf: 'etf', 'mutual fund': 'fund', fund: 'fund', bond: 'bond' }
// Alpha Vantage region/currency -> one of this app's countries (or '' when unsure; EUR only counts for Ireland).
export function countryOf(region = '', currency = '') {
  const r = region.toLowerCase()
  if (r.includes('united states')) return 'us'
  if (r.includes('india')) return 'in'
  if (r.includes('united kingdom')) return 'uk'
  if (r.includes('australia')) return 'au'
  if (r.includes('switzerland')) return 'ch'
  if (r.includes('ireland')) return 'ie'
  return { USD: 'us', INR: 'in', GBP: 'uk', GBX: 'uk', AUD: 'au', CHF: 'ch' }[String(currency).toUpperCase()] || ''
}

// -> { matches: [{ symbol, name, type, region, country, currency, score }] } | { error, kind: 'limit' | 'key' | 'other' }
export function parseSearch(json) {
  const msg = json?.Note || json?.Information || json?.['Error Message']
  if (msg && !json?.bestMatches) {
    if (/call frequency|rate limit|requests per day|premium|per minute|per day/i.test(msg)) return { error: 'The Alpha Vantage daily limit is reached. It resets tomorrow; type the name yourself for now.', kind: 'limit' }
    if (/invalid api|apikey/i.test(msg)) return { error: 'Alpha Vantage rejected the key. Check it in Settings → Home.', kind: 'key' }
    return { error: `Alpha Vantage said: ${String(msg).slice(0, 140)}`, kind: 'other' }
  }
  const matches = (json?.bestMatches || []).map((m) => ({
    symbol: String(m['1. symbol'] || ''), name: String(m['2. name'] || ''), type: KIND[String(m['3. type'] || '').toLowerCase()] || 'other',
    region: String(m['4. region'] || ''), currency: String(m['8. currency'] || ''), score: Number(m['9. matchScore']) || 0,
  })).filter((m) => m.symbol)
  return { matches: matches.map((m) => ({ ...m, country: countryOf(m.region, m.currency) })) }
}

const cacheRead = () => { try { return JSON.parse(ls.get(CACHE)) || {} } catch { return {} } }
const cacheWrite = (c) => { const keys = Object.keys(c); if (keys.length > MAX_CACHE) for (const k of keys.slice(0, keys.length - MAX_CACHE)) delete c[k]; ls.set(CACHE, JSON.stringify(c)) }

// Search the bundled list (offline). A symbol match first, then names that start with the text, then names that contain it.
export function searchLocal(query, list = LOCAL_TICKERS) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const score = (t) => (t.symbol.toLowerCase() === q ? 3 : t.symbol.toLowerCase().startsWith(q) ? 2 : t.name.toLowerCase().startsWith(q) ? 2 : t.name.toLowerCase().includes(q) ? 1 : 0)
  return list.map((t) => ({ t, s: score(t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map(({ t }) => ({ symbol: t.symbol, name: t.name, type: t.type || 'other', region: t.region || '', currency: t.currency || '', country: t.country || countryOf(t.region, t.currency), score: 1 }))
}

// The whole lookup: local list -> cache -> Alpha Vantage. -> { matches, source: 'list' | 'cache' | 'alphavantage', usage } | { error, kind, usage }
// `fetchImpl` is injectable for tests.
export async function lookupSymbol(query, { key, fetchImpl = fetch, day } = {}) {
  const q = String(query || '').trim()
  if (!q) return { error: 'Type a ticker or a name first.', kind: 'input', usage: usage(day) }
  const local = searchLocal(q)
  if (local.length) return { matches: local, source: 'list', usage: usage(day) }
  const cache = cacheRead()
  const ck = q.toUpperCase()
  if (cache[ck]) return { matches: cache[ck], source: 'cache', usage: usage(day) }
  if (!key) return { error: 'Add your Alpha Vantage key in Settings → Home to look symbols up. You can type the name yourself meanwhile.', kind: 'nokey', usage: usage(day) }
  if (usage(day).remaining <= 0) return { error: `The ${DAILY_LIMIT} free lookups for today are used. It resets tomorrow; type the name yourself for now.`, kind: 'limit', usage: usage(day) }
  let json
  try {
    const res = await fetchImpl(searchUrl(q, key))
    noteRequests(1, day)
    json = await res.json()
  } catch { return { error: 'Could not reach Alpha Vantage. Check your connection, or type the name yourself.', kind: 'network', usage: usage(day) } }
  const out = parseSearch(json)
  if (out.error) { if (out.kind === 'limit') markLimitReached(day); return { ...out, usage: usage(day) } }
  if (!out.matches.length) return { error: `Alpha Vantage found nothing for "${q}". Check the symbol (some exchanges need a suffix, such as .LON or .BSE), or type the name yourself.`, kind: 'none', usage: usage(day) }
  cache[ck] = out.matches; cacheWrite(cache)
  return { matches: out.matches, source: 'alphavantage', usage: usage(day) }
}
