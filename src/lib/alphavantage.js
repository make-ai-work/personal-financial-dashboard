// Alpha Vantage (https://www.alphavantage.co), used for the INDEX part of the demo ticker.
// The free plan has no real index levels, so each index is shown through a well-known ETF that tracks it, and labelled as such
// ("SPY ETF"). The free key allows 25 requests a day and 1 a second, so the demo reads a snapshot written at deploy time
// (scripts/fetch-av-snapshot.mjs); the key stays in a repository secret and never reaches the page.
export const AV_BASE = 'https://www.alphavantage.co/query'

// ticker item id -> the ETF that stands in for it. Sensex and ASX 200 have no free-plan stand-in and are left out.
export const AV_PROXIES = {
  spx: { symbol: 'SPY', via: 'SPY ETF' },
  ixic: { symbol: 'QQQ', via: 'QQQ ETF' },
  nifty: { symbol: 'NIFTYBEES.BSE', via: 'Nifty BeES ETF' },
  ftse: { symbol: 'ISF.LON', via: 'ISF ETF' },
  smi: { symbol: 'EWL', via: 'EWL ETF' },
}

export const quoteUrl = (symbol, key) => `${AV_BASE}?${new URLSearchParams({ function: 'GLOBAL_QUOTE', symbol, apikey: key })}`

// One GLOBAL_QUOTE answer -> { price, change, changePct, at } | { error } | null (symbol unknown).
export function parseGlobalQuote(json) {
  const msg = json?.Note || json?.Information || json?.['Error Message']
  if (msg && !json?.['Global Quote']) {
    return { error: /call frequency|rate limit|requests per day|premium/i.test(msg) ? 'The Alpha Vantage daily request limit is used up.' : `Alpha Vantage said: ${String(msg).slice(0, 120)}` }
  }
  const q = json?.['Global Quote']
  const price = Number(q?.['05. price'])
  if (!(price > 0)) return null
  const day = Date.parse(`${q['07. latest trading day']}T21:00:00Z`)
  return { price, change: Number(q['09. change']) || 0, changePct: parseFloat(q['10. change percent']) || 0, at: Number.isFinite(day) ? Math.floor(day / 1000) : 0 }
}

// Quotes for ticker items that have a stand-in, one request each, a little over a second apart (the free plan's limit).
export async function fetchAvQuotes(items, key, { fetchImpl = fetch, delayMs = 1200 } = {}) {
  const quotes = []
  const problems = []
  const todo = items.filter((i) => AV_PROXIES[i.id])
  for (let n = 0; n < todo.length; n++) {
    const it = todo[n]
    const p = AV_PROXIES[it.id]
    if (n && delayMs) await new Promise((r) => setTimeout(r, delayMs))
    try {
      const out = parseGlobalQuote(await (await fetchImpl(quoteUrl(p.symbol, key))).json())
      if (out?.error) { problems.push(out.error); break } // a limit message applies to every later request too
      if (out) quotes.push({ id: it.id, ...out, via: p.via })
      else problems.push(`${p.symbol} has no data.`)
    } catch {
      problems.push('Could not reach Alpha Vantage.')
      break
    }
  }
  return { quotes, problems }
}
