import test from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const { DAILY_LIMIT, countryOf, lookupSymbol, markLimitReached, noteRequests, parseSearch, searchLocal, searchUrl, usage } = await import('../src/lib/symbols.js')

const DAY = '2026-11-23'
const KEY = 'DEMOKEY123'
const hit = (symbol, name, type = 'ETF', region = 'United States', currency = 'USD') => ({ '1. symbol': symbol, '2. name': name, '3. type': type, '4. region': region, '8. currency': currency, '9. matchScore': '0.8' })
const fetchOf = (json, log = []) => async (url) => { log.push(url); return { json: async () => json } }
const reset = () => store.clear()

test('the request count is kept per day, starts at 0 of 25, and resets on a new day', () => {
  reset()
  assert.deepEqual([usage(DAY).used, usage(DAY).remaining, usage(DAY).limit], [0, 25, DAILY_LIMIT])
  noteRequests(1, DAY); noteRequests(2, DAY)
  assert.deepEqual([usage(DAY).used, usage(DAY).remaining], [3, 22])
  assert.deepEqual([usage('2026-11-24').used, usage('2026-11-24').remaining], [0, 25], 'a new day starts again')
  markLimitReached(DAY); assert.equal(usage(DAY).remaining, 0)
})

test('Alpha Vantage answers are read: matches with type and country; limit, key and other messages explained', () => {
  const ok = parseSearch({ bestMatches: [hit('VTI', 'Vanguard Total Stock Market ETF'), hit('INFY.BSE', 'Infosys', 'Equity', 'India/Bombay', 'INR'), hit('ISF.LON', 'iShares FTSE 100', 'ETF', 'United Kingdom', 'GBP'), hit('XYZ', 'Weird', 'Warrant', 'Mars', 'EUR')] })
  assert.deepEqual(ok.matches.map((m) => [m.symbol, m.type, m.country]), [['VTI', 'etf', 'us'], ['INFY.BSE', 'stock', 'in'], ['ISF.LON', 'etf', 'uk'], ['XYZ', 'other', '']])
  assert.equal(parseSearch({ Note: 'Our standard API call frequency is 25 requests per day.' }).kind, 'limit')
  assert.equal(parseSearch({ Information: 'Invalid API key. Please retry or visit the documentation' }).kind, 'key')
  assert.equal(parseSearch({ 'Error Message': 'something odd' }).kind, 'other')
  assert.deepEqual(parseSearch({ bestMatches: [] }), { matches: [] })
  assert.equal(countryOf('Ireland', 'EUR'), 'ie'); assert.equal(countryOf('Germany', 'EUR'), '')
})

test('a lookup asks once, counts one request, and the same symbol is then free (cache)', async () => {
  reset()
  const log = []
  const f = fetchOf({ bestMatches: [hit('VTI', 'Vanguard Total Stock Market ETF')] }, log)
  const a = await lookupSymbol('vti', { key: KEY, fetchImpl: f, day: DAY })
  assert.equal(a.source, 'alphavantage'); assert.equal(a.matches[0].name, 'Vanguard Total Stock Market ETF'); assert.equal(a.usage.used, 1)
  assert.match(log[0], /function=SYMBOL_SEARCH/); assert.match(log[0], /keywords=vti/); assert.match(log[0], /apikey=DEMOKEY123/)
  const b = await lookupSymbol('VTI', { key: KEY, fetchImpl: f, day: DAY })
  assert.equal(b.source, 'cache'); assert.equal(log.length, 1); assert.equal(b.usage.used, 1)
})

test('no key, no symbol, nothing found, no connection, and the limit are all explained, never silent', async () => {
  reset()
  assert.equal((await lookupSymbol('', { key: KEY, day: DAY })).kind, 'input')
  const nk = await lookupSymbol('AAPL', { key: '', day: DAY }); assert.equal(nk.kind, 'nokey'); assert.match(nk.error, /Settings → Home/)
  const none = await lookupSymbol('ZZZZ', { key: KEY, fetchImpl: fetchOf({ bestMatches: [] }), day: DAY }); assert.equal(none.kind, 'none'); assert.match(none.error, /suffix/)
  const net = await lookupSymbol('QQQ', { key: KEY, fetchImpl: async () => { throw new Error('offline') }, day: DAY }); assert.equal(net.kind, 'network'); assert.match(net.error, /type the name yourself/)
  // the service says the limit is reached: the rest of the day is marked used, and the next try does not even call
  const lim = await lookupSymbol('MSFT', { key: KEY, fetchImpl: fetchOf({ Note: 'You have reached the 25 requests per day limit' }), day: DAY })
  assert.equal(lim.kind, 'limit'); assert.equal(lim.usage.remaining, 0)
  let called = 0
  const again = await lookupSymbol('GOOG', { key: KEY, fetchImpl: async () => { called++; return { json: async () => ({}) } }, day: DAY })
  assert.equal(again.kind, 'limit'); assert.equal(called, 0); assert.match(again.error, /25 free lookups for today are used/)
})

test('the offline ticker list is searched first and costs no request', () => {
  const list = [{ symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'etf', region: 'United States', currency: 'USD' }, { symbol: 'VT', name: 'Vanguard Total World Stock ETF', type: 'etf', currency: 'USD', country: 'us' }]
  assert.deepEqual(searchLocal('vti', list).map((m) => m.symbol), ['VTI'])
  assert.deepEqual(searchLocal('vanguard total', list).map((m) => m.symbol).sort(), ['VT', 'VTI'])
  assert.deepEqual(searchLocal('', list), []); assert.deepEqual(searchLocal('nothing', list), [])
  assert.equal(searchUrl('A B', 'K').includes('keywords=A+B'), true)
})
