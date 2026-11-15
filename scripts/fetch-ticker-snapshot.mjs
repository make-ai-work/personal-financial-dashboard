// Writes public/ticker-snapshot.json for the DEMO site: one fetch of every ticker price using the FCS API key from the
// FCS_API_KEY environment variable (a repository secret). The key is used here, at build time, and is never written into
// the file or the site, so visitors cannot see it. Without a key it writes nothing and the demo says prices are unavailable.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fetchQuotes, tickerItems } from '../src/lib/ticker.js'

const key = (process.env.FCS_API_KEY || '').trim()
if (!key) {
  console.log('FCS_API_KEY is not set: no price snapshot written (the demo will show "Prices unavailable").')
  process.exit(0)
}
// every country's index, so the demo works whichever countries its sample data uses
const items = tickerItems(['us', 'in', 'uk', 'au', 'ch'])
const out = await fetchQuotes(items, key)
mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
const file = new URL('../public/ticker-snapshot.json', import.meta.url)
writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), quotes: out.quotes, problems: out.problems.map((p) => p.message) }, null, 1) + '\n')
console.log(`Snapshot: ${out.quotes.length} of ${items.length} prices.${out.problems.length ? ' Not available: ' + out.problems.map((p) => `${p.group} (${p.message})`).join('; ') : ''}`)
