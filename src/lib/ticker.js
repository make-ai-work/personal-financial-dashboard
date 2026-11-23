// The market ticker: which prices to show, how to ask FCS API for them, and how to read the answer.
// FCS API (https://fcsapi.com): GET https://api-v4.fcsapi.com/<group>/latest?symbol=A,B&access_key=KEY
// Responses: { status, code, msg, response: [{ ticker, update, active: { c, ch, chp, tm }, previous: {...} }], info }.
// The free plan covers forex and crypto only; index prices need an FCS stock plan (error code 105 otherwise).

export const FCS_BASE = 'https://api-v4.fcsapi.com'

// group = which FCS endpoint serves it: 'index' -> stock/latest?type=index, 'forex' -> forex/latest, 'crypto' -> crypto/latest
const BASE_ITEMS = [
  { id: 'spx', label: 'S&P 500', sub: 'SPY', group: 'index', symbol: 'SP:SPX' }, // the index SPY tracks
  { id: 'ixic', label: 'Nasdaq', sub: 'Composite', group: 'index', symbol: 'NASDAQ:IXIC' },
  { id: 'sensex', label: 'Sensex', sub: 'India', group: 'index', symbol: 'BSE:SENSEX' },
  { id: 'nifty', label: 'Nifty 50', sub: 'India', group: 'index', symbol: 'NSE:NIFTY' },
]
// One main index for each other selectable country (USA and India are covered above).
const COUNTRY_ITEMS = {
  uk: { id: 'ftse', label: 'FTSE 100', sub: 'UK', group: 'index', symbol: 'FTSE:UKX' },
  au: { id: 'asx', label: 'ASX 200', sub: 'Australia', group: 'index', symbol: 'ASX:XJO' },
  ch: { id: 'smi', label: 'SMI', sub: 'Switzerland', group: 'index', symbol: 'SIX:SMI' },
}
const FIXED_ITEMS = [
  { id: 'gold', label: 'Gold', sub: 'XAU/USD', group: 'forex', symbol: 'FX:XAUUSD' },
  { id: 'btc', label: 'Bitcoin', sub: 'BTC/USD', group: 'crypto', symbol: 'COINBASE:BTCUSD' },
]

// Everything the ticker shows for a list of country codes, in display order.
export function tickerItems(countries) {
  const extra = countries.map((c) => COUNTRY_ITEMS[c]).filter(Boolean)
  return [...BASE_ITEMS, ...extra, ...FIXED_ITEMS]
}

const PATH = { index: 'stock/latest', forex: 'forex/latest', crypto: 'crypto/latest' }
// One request per group (symbols are sent together), so a refresh costs at most 3 calls.
// `key` is an FCS access key (string) or { token } for a short-lived token (the public demo site).
export function buildRequests(items, key) {
  const groups = {}
  for (const it of items) (groups[it.group] ||= []).push(it.symbol)
  return Object.entries(groups).map(([group, symbols]) => {
    const q = new URLSearchParams({ symbol: symbols.join(',') })
    if (typeof key === 'object' && key) q.set('jwt_token', key.token)
    else q.set('access_key', key)
    if (group === 'index') q.set('type', 'index')
    return { group, symbols, url: `${FCS_BASE}/${PATH[group]}?${q}` }
  })
}

// FCS error codes -> plain words.
export function explainError(code, msg = '') {
  switch (Number(code)) {
    case 101: case 104: return 'The FCS API key is not valid. Check it in Home settings.'
    case 102: case 103: return 'The FCS account is not active.'
    case 403: case 105: return 'This FCS plan does not include index prices. They need an FCS stock plan; gold and Bitcoin work on the free plan.'
    case 211: return 'The monthly FCS request limit is used up.'
    case 429: return 'FCS is limiting requests (free plan: 3 per minute). Try again in a minute.'
    default: return msg ? `FCS said: ${String(msg).split('----')[0].trim()}` : 'The market service did not answer.'
  }
}

// A token for the public demo: the browser asks FCS with only the PUBLIC key (the website must be on the key's allowed-domain
// list in the FCS dashboard) and gets a pass that works for a day. Nothing secret is involved. One credit per token.
export const tokenUrl = (publicKey) => `${FCS_BASE}/forex/jwt_token?${new URLSearchParams({ public_key: publicKey })}`
export async function fetchToken(publicKey, { fetchImpl = fetch } = {}) {
  let json
  try { json = await (await fetchImpl(tokenUrl(publicKey))).json() } catch { throw new Error('Could not reach the market service. Check your connection.') }
  const t = json?.response?.jwt_token
  if (json?.status === true && t) return { token: t, expiresAt: (Number(json.response.expiry) || Math.floor(Date.now() / 1000) + 3600) * 1000 }
  if (/allowed domain/i.test(json?.msg || '')) throw new Error('This website is not on the allowed-domain list of the FCS key, so prices are off. (FCS dashboard → Security → Allowed Domains.)')
  throw new Error(explainError(json?.code, json?.msg))
}
// One token at a time, reused until five minutes before it expires.
let cachedToken = null
export async function demoAuth(publicKey, opts = {}) {
  if (!cachedToken || cachedToken.publicKey !== publicKey || cachedToken.expiresAt - Date.now() < 5 * 60_000) cachedToken = { ...(await fetchToken(publicKey, opts)), publicKey }
  return { token: cachedToken.token }
}
export const forgetToken = () => { cachedToken = null }

// Turn one FCS JSON answer into quotes, matched back to the items by symbol. Items FCS did not return are left out.
export function parseQuotes(json, items) {
  if (!json || json.status !== true || !Array.isArray(json.response)) return { quotes: [], error: explainError(json?.code, json?.msg), code: json?.code }
  const bySymbol = new Map(items.map((it) => [it.symbol, it]))
  const quotes = []
  for (const r of json.response) {
    const it = bySymbol.get(r.ticker)
    const a = r.active
    if (!it || !a || !(Number(a.c) > 0)) continue
    quotes.push({ id: it.id, price: Number(a.c), change: Number(a.ch) || 0, changePct: Number(a.chp) || 0, at: Number(r.update) || 0 })
  }
  return { quotes, error: '', code: json.code }
}

// Fetch the given groups (default: all), one after another, gentle on the free plan's 3-per-minute limit. Returns what
// could be read, a note for what could not, and when each group was answered. `fetchImpl` is injectable for tests.
export async function fetchQuotes(items, key, { groups, fetchImpl = fetch } = {}) {
  const quotes = []
  const problems = []
  const fetched = {} // when each group was last ASKED (even if the answer was an error), so a failing group is not hammered
  const asked = []
  for (const req of buildRequests(items, key)) {
    if (groups && !groups.has(req.group)) continue
    fetched[req.group] = Date.now()
    asked.push(...items.filter((i) => i.group === req.group).map((i) => i.id))
    try {
      const res = await fetchImpl(req.url)
      const json = await res.json().catch(() => null)
      const out = parseQuotes(json, items.filter((i) => i.group === req.group))
      quotes.push(...out.quotes)
      if (out.error) problems.push({ group: req.group, code: out.code, message: out.error })
    } catch {
      problems.push({ group: req.group, code: 0, message: 'Could not reach the market service. Check your connection.' })
    }
  }
  return { quotes, problems, fetched, asked }
}

// Merge a fresh answer into what was cached: new quotes replace old ones for the same item, other items are kept.
export function mergeCache(cache, fresh) {
  const byId = new Map((cache?.quotes || []).map((q) => [q.id, q]))
  for (const q of fresh.quotes) byId.set(q.id, q)
  return { quotes: [...byId.values()], fetched: { ...(cache?.fetched || {}), ...fresh.fetched }, asked: [...new Set([...(cache?.asked || []), ...(fresh.asked || [])])] }
}

// When to ask again. A group is refreshed when its numbers are older than the interval AND it can have moved:
// indices only while one of their markets is open (they hold their last close otherwise), gold on weekdays, Bitcoin always.
// Anything older than 12 hours is refreshed regardless, and a group never fetched is fetched.
// openCountries = country codes (among those whose indices are shown) whose exchange is open now.
export function groupsToRefresh({ items, cache, now, intervalMin, openCountries, weekday }) {
  const need = new Set()
  for (const it of items) {
    const got = cache?.fetched?.[it.group]
    if (!got || !cache?.asked?.includes(it.id)) { need.add(it.group); continue } // never asked (for example a country was just added)
    const age = now - got
    if (age > 12 * 3600_000) { need.add(it.group); continue }
    if (age < intervalMin * 60_000) continue
    const moves = it.group === 'crypto' || (it.group === 'forex' && weekday >= 1 && weekday <= 5) || (it.group === 'index' && openCountries.length > 0)
    if (moves) need.add(it.group)
  }
  return need
}

export const fmtPrice = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
