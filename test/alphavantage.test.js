import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AV_PROXIES, fetchAvQuotes, parseGlobalQuote, quoteUrl } from '../src/lib/alphavantage.js'
import { tickerItems } from '../src/lib/ticker.js'

const gq = (symbol, price, change, pct) => ({ 'Global Quote': { '01. symbol': symbol, '05. price': String(price), '07. latest trading day': '2026-11-13', '09. change': String(change), '10. change percent': `${pct}%` } })

test('the request asks for a global quote with the key, and the answer is read', () => {
  const u = new URL(quoteUrl('SPY', 'KEY'))
  assert.deepEqual([u.host, u.searchParams.get('function'), u.searchParams.get('symbol'), u.searchParams.get('apikey')], ['www.alphavantage.co', 'GLOBAL_QUOTE', 'SPY', 'KEY'])
  const q = parseGlobalQuote(gq('SPY', '754.3700', '-2.7500', '-0.3632'))
  assert.deepEqual([q.price, q.change, q.changePct], [754.37, -2.75, -0.3632]); assert.ok(q.at > 0)
})

test('an unknown symbol is null; a rate-limit message is an error; bad input is null', () => {
  assert.equal(parseGlobalQuote({ 'Global Quote': {} }), null); assert.equal(parseGlobalQuote({}), null); assert.equal(parseGlobalQuote(null), null)
  assert.match(parseGlobalQuote({ Information: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.' }).error, /daily request limit/)
  assert.match(parseGlobalQuote({ Note: 'Something else' }).error, /Alpha Vantage said/)
})

test('only items with a stand-in are asked for, labelled as ETFs; a limit stops the rest', async () => {
  const items = tickerItems(['us', 'uk', 'ch'])
  const asked = []
  const ok = async (url) => { const s = new URL(url).searchParams.get('symbol'); asked.push(s); return { json: async () => gq(s, 100, 1, 1) } }
  const out = await fetchAvQuotes(items, 'K', { fetchImpl: ok, delayMs: 0 })
  assert.deepEqual(asked, ['SPY', 'QQQ', 'NIFTYBEES.BSE', 'ISF.LON', 'EWL']) // Sensex, gold and Bitcoin are not asked for
  assert.deepEqual(out.quotes.map((q) => q.id), ['spx', 'ixic', 'nifty', 'ftse', 'smi']); assert.equal(out.quotes[0].via, 'SPY ETF')
  assert.ok(Object.keys(AV_PROXIES).every((id) => items.some((i) => i.id === id) || id === 'smi' || id === 'ftse'))
  let n = 0
  const limited = async () => ({ json: async () => (++n > 2 ? { Information: 'standard API rate limit is 25 requests per day' } : gq('X', 5, 0, 0)) })
  const l = await fetchAvQuotes(items, 'K', { fetchImpl: limited, delayMs: 0 })
  assert.equal(l.quotes.length, 2); assert.equal(n, 3); assert.match(l.problems[0], /daily request limit/)
  const down = await fetchAvQuotes(items, 'K', { fetchImpl: async () => { throw new Error('x') }, delayMs: 0 })
  assert.deepEqual([down.quotes.length, down.problems.length], [0, 1])
})

test('the snapshot script writes nothing and succeeds when there is no key', () => {
  const file = new URL('../public/av-snapshot.json', import.meta.url)
  rmSync(file, { force: true })
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/fetch-av-snapshot.mjs', import.meta.url))], { env: { ...process.env, ALPHAVANTAGE_API_KEY: '' }, encoding: 'utf8' })
  assert.equal(r.status, 0); assert.match(r.stdout, /ALPHAVANTAGE_API_KEY is not set/); assert.equal(existsSync(file), false)
})
