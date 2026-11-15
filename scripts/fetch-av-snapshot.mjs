// Writes public/av-snapshot.json for the DEMO site: index prices (as ETF stand-ins) from Alpha Vantage, using the key in the
// environment variable ALPHAVANTAGE_API_KEY (a repository secret). The key is used here, at build time, and never written to the
// file or the site. The free plan allows 25 requests a day, so a snapshot that is still fresh (under 5 hours old) is reused from
// the live site (PREVIOUS_SNAPSHOT_URL) instead of asking again, and if Alpha Vantage refuses, the previous one is kept.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fetchAvQuotes } from '../src/lib/alphavantage.js'
import { tickerItems } from '../src/lib/ticker.js'

const key = (process.env.ALPHAVANTAGE_API_KEY || '').trim()
const prevUrl = (process.env.PREVIOUS_SNAPSHOT_URL || '').trim()
const FRESH_MS = 5 * 3600_000
if (!key) {
  console.log('ALPHAVANTAGE_API_KEY is not set: no index snapshot written (the demo will show no index prices).')
  process.exit(0)
}
let prev = null
if (prevUrl) {
  try { const r = await fetch(prevUrl); if (r.ok) prev = await r.json() } catch { /* first deploy, or offline */ }
}
const write = (obj) => {
  mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../public/av-snapshot.json', import.meta.url), JSON.stringify(obj, null, 1) + '\n')
}
if (prev && Array.isArray(prev.quotes) && prev.quotes.length && Date.now() - Date.parse(prev.generatedAt) < FRESH_MS) {
  write(prev)
  console.log(`Reused the snapshot from ${prev.generatedAt} (still fresh): no Alpha Vantage requests used.`)
  process.exit(0)
}
const out = await fetchAvQuotes(tickerItems(['us', 'in', 'uk', 'au', 'ch']), key)
if (out.quotes.length) {
  write({ generatedAt: new Date().toISOString(), quotes: out.quotes, problems: out.problems })
  console.log(`Snapshot: ${out.quotes.length} index prices.${out.problems.length ? ' Problems: ' + out.problems.join('; ') : ''}`)
} else if (prev && prev.quotes?.length) {
  write(prev)
  console.log(`Alpha Vantage gave nothing (${out.problems.join('; ')}); kept the previous snapshot from ${prev.generatedAt}.`)
} else {
  console.log(`Alpha Vantage gave nothing (${out.problems.join('; ')}) and there is no previous snapshot.`)
}
