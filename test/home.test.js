import test from 'node:test'
import assert from 'node:assert/strict'
import { clockFor, clocksFor, greeting } from '../src/lib/clocks.js'
import { duration, marketStatus, marketsFor } from '../src/lib/markets.js'
import { buildRequests, explainError, fetchQuotes, groupsToRefresh, mergeCache, parseQuotes, tickerItems } from '../src/lib/ticker.js'
import { describe, forecastUrl, geocodeUrl, parseForecast, parseGeocode, splitPlace } from '../src/lib/weather.js'

const MON_15_42Z = new Date('2026-11-16T15:42:00Z') // Monday afternoon in London, morning in New York

test('clocks use each capital: Washington for the USA, Canberra (Sydney time) for Australia', () => {
  const us = clockFor('us', MON_15_42Z)
  assert.equal(us.city, 'Washington, D.C.'); assert.equal(us.time, '10:42 AM'); assert.equal(us.day, 'Mon 16 Nov'); assert.equal(us.zone, 'EST')
  const inn = clockFor('in', MON_15_42Z)
  assert.equal(inn.city, 'New Delhi'); assert.equal(inn.time, '9:12 PM'); assert.equal(inn.zone, 'IST')
  assert.equal(clockFor('uk', MON_15_42Z).time, '3:42 PM')
  const au = clockFor('au', MON_15_42Z)
  assert.equal(au.city, 'Canberra'); assert.equal(au.time, '2:42 AM'); assert.equal(au.day, 'Tue 17 Nov') // already tomorrow
  assert.equal(clockFor('ch', MON_15_42Z).city, 'Bern')
  assert.equal(clockFor('ch', MON_15_42Z).time, '4:42 PM')
})

test('daylight saving changes the capital clock (New York in July is EDT)', () => {
  const us = clockFor('us', new Date('2026-07-06T14:00:00Z'))
  assert.equal(us.time, '10:00 AM'); assert.equal(us.zone, 'EDT')
})

test('clocksFor keeps the order of the list and skips unknown codes', () => {
  assert.deepEqual(clocksFor(['in', 'xx', 'us'], MON_15_42Z).map((c) => c.code), ['in', 'us'])
})

test('greeting is capitalised and follows the hour', () => {
  assert.equal(greeting(0), 'Good Morning'); assert.equal(greeting(11), 'Good Morning')
  assert.equal(greeting(12), 'Good Afternoon'); assert.equal(greeting(17), 'Good Afternoon')
  assert.equal(greeting(18), 'Good Evening'); assert.equal(greeting(23), 'Good Evening')
})

test('durations read naturally', () => {
  assert.equal(duration(48), '48 min'); assert.equal(duration(318), '5h 18m'); assert.equal(duration(180), '3h'); assert.equal(duration(2700), '1d 21h'); assert.equal(duration(1440), '1d')
})

test('market status: open now, closed in the evening, closed before the open', () => {
  const m = Object.fromEntries(marketsFor(['us', 'in', 'uk', 'au', 'ch'], MON_15_42Z).map((x) => [x.code, x]))
  assert.equal(m.us.open, true); assert.equal(m.us.label, 'Closes in 5h 18m')
  assert.equal(m.in.open, false); assert.equal(m.in.label, 'Opens tomorrow in 12h 3m')
  assert.equal(m.uk.open, true); assert.equal(m.uk.label, 'Closes in 48 min')
  assert.equal(m.au.open, false); assert.equal(m.au.label, 'Opens in 7h 18m') // 2:42 AM Tuesday in Sydney
  assert.equal(m.ch.open, true); assert.equal(m.ch.label, 'Closes in 48 min') // 4:42 PM, closes 5:30 PM
})

test('market status: the open and close minutes themselves, and weekends', () => {
  assert.equal(marketStatus('us', new Date('2026-11-16T14:29:00Z')).open, false) // 9:29 ET
  assert.equal(marketStatus('us', new Date('2026-11-16T14:30:00Z')).open, true) // 9:30 ET
  assert.equal(marketStatus('us', new Date('2026-11-16T20:59:00Z')).open, true) // 15:59 ET
  assert.equal(marketStatus('us', new Date('2026-11-16T21:00:00Z')).open, false) // 16:00 ET
  const sat = marketStatus('us', new Date('2026-11-14T17:00:00Z')) // Saturday noon ET
  assert.equal(sat.open, false); assert.match(sat.label, /^Opens Monday in 1d 21h/) // to Monday 9:30
  const friNight = marketStatus('us', new Date('2026-11-14T02:00:00Z')) // Friday 9 PM ET
  assert.match(friNight.label, /^Opens Monday in 2d 12h/)
  assert.equal(marketStatus('us', new Date('2026-11-15T20:00:00Z')).label, 'Opens tomorrow in 18h 30m') // Sunday 3 PM ET -> Monday 9:30
})

test('market status follows daylight saving', () => {
  assert.equal(marketStatus('us', new Date('2026-07-06T13:30:00Z')).open, true) // 9:30 EDT
  assert.equal(marketStatus('us', new Date('2026-07-06T13:29:00Z')).open, false)
  assert.equal(marketStatus('uk', new Date('2026-07-06T07:00:00Z')).open, true) // 8:00 BST
})

// ---- ticker ----
const real = (ticker, c, ch, chp, update = 1794606199) => ({ ticker, update, active: { c, ch, chp, tm: '2026-11-13 14:30:00' }, previous: { c: c - ch } })

test('the ticker shows the base indices, one index per other selected country, gold and Bitcoin', () => {
  assert.deepEqual(tickerItems(['us', 'in']).map((i) => i.id), ['spx', 'ixic', 'sensex', 'nifty', 'gold', 'btc'])
  assert.deepEqual(tickerItems(['us', 'in', 'uk', 'au', 'ch']).map((i) => i.id), ['spx', 'ixic', 'sensex', 'nifty', 'ftse', 'asx', 'smi', 'gold', 'btc'])
  assert.deepEqual(tickerItems(['uk']).map((i) => i.id), ['spx', 'ixic', 'sensex', 'nifty', 'ftse', 'gold', 'btc']) // the base set is always there
})

test('requests: one call per group, symbols together, key and type in the query', () => {
  const reqs = buildRequests(tickerItems(['us', 'uk']), 'KEY123')
  assert.deepEqual(reqs.map((r) => r.group), ['index', 'forex', 'crypto'])
  const idx = new URL(reqs[0].url)
  assert.equal(idx.origin + idx.pathname, 'https://api-v4.fcsapi.com/stock/latest')
  assert.equal(idx.searchParams.get('symbol'), 'SP:SPX,NASDAQ:IXIC,BSE:SENSEX,NSE:NIFTY,FTSE:UKX')
  assert.equal(idx.searchParams.get('type'), 'index'); assert.equal(idx.searchParams.get('access_key'), 'KEY123')
  const fx = new URL(reqs[1].url); assert.equal(fx.pathname, '/forex/latest'); assert.equal(fx.searchParams.get('symbol'), 'FX:XAUUSD'); assert.equal(fx.searchParams.get('type'), null)
  assert.equal(new URL(reqs[2].url).searchParams.get('symbol'), 'COINBASE:BTCUSD')
})

test('parsing a real-shaped answer matches quotes to items and ignores symbols we did not ask for', () => {
  const items = tickerItems(['us', 'uk']).filter((i) => i.group === 'index')
  const out = parseQuotes({ status: true, code: 200, response: [real('SP:SPX', 7561.67, -30.73, -0.405), real('NSE:NIFTY', 25144.3, -155.05, -0.613), real('OTHER:XYZ', 1, 0, 0)] }, items)
  assert.deepEqual(out.quotes.map((q) => [q.id, q.price, q.changePct]), [['spx', 7561.67, -0.405], ['nifty', 25144.3, -0.613]])
  assert.equal(out.error, '')
})

test('errors are explained in words, including a plan without index prices', () => {
  assert.match(explainError(101), /key is not valid/)
  assert.match(explainError(105), /stock plan/)
  assert.match(explainError(211), /monthly/)
  const out = parseQuotes({ status: false, code: 105, msg: 'plan' }, tickerItems(['us']))
  assert.deepEqual(out.quotes, []); assert.match(out.error, /stock plan/)
  assert.match(parseQuotes(null, []).error, /did not answer/)
})

test('fetchQuotes returns what worked and notes what did not (free plan: gold and Bitcoin only)', async () => {
  const calls = []
  const fakeFetch = async (url) => {
    calls.push(url)
    const u = new URL(url)
    const body = u.pathname.startsWith('/stock') ? { status: false, code: 105, msg: 'not in plan' }
      : u.pathname.startsWith('/forex') ? { status: true, code: 200, response: [real('FX:XAUUSD', 3883.84, 7.3, 0.19)] }
        : { status: true, code: 200, response: [real('COINBASE:BTCUSD', 64372.85, 250, 0.39)] }
    return { json: async () => body }
  }
  const out = await fetchQuotes(tickerItems(['us']), 'K', { fetchImpl: fakeFetch })
  assert.equal(calls.length, 3)
  assert.deepEqual(out.quotes.map((q) => q.id), ['gold', 'btc'])
  assert.equal(out.problems.length, 1); assert.equal(out.problems[0].group, 'index'); assert.match(out.problems[0].message, /stock plan/)
  assert.ok(out.fetched.forex && out.fetched.crypto && out.fetched.index) // all three were asked, one failed
  assert.deepEqual(out.asked.sort(), ['btc', 'gold', 'ixic', 'nifty', 'sensex', 'spx'])
  const only = await fetchQuotes(tickerItems(['us']), 'K', { groups: new Set(['crypto']), fetchImpl: fakeFetch })
  assert.deepEqual(only.quotes.map((q) => q.id), ['btc'])
})

test('a network failure is reported, not thrown', async () => {
  const out = await fetchQuotes(tickerItems(['us']), 'K', { fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(out.quotes.length, 0); assert.equal(out.problems.length, 3); assert.match(out.problems[0].message, /Could not reach/)
})

test('merging keeps old quotes for groups that were not refreshed', () => {
  const old = { quotes: [{ id: 'spx', price: 1 }, { id: 'btc', price: 2 }], fetched: { index: 100, crypto: 100 }, asked: ['spx', 'btc'] }
  const merged = mergeCache(old, { quotes: [{ id: 'btc', price: 3 }], fetched: { crypto: 200 }, asked: ['btc'], problems: [] })
  assert.deepEqual(merged.quotes.map((q) => [q.id, q.price]).sort(), [['btc', 3], ['spx', 1]])
  assert.deepEqual(merged.fetched, { index: 100, crypto: 200 })
  assert.deepEqual(merged.asked.sort(), ['btc', 'spx'])
})

test('refresh rules: never fetched -> all; fresh -> none; stale -> only what can have moved', () => {
  const items = tickerItems(['us'])
  const now = 1_000_000_000_000
  const cache = { quotes: items.map((i) => ({ id: i.id })), asked: items.map((i) => i.id), fetched: { index: now - 40 * 60_000, forex: now - 40 * 60_000, crypto: now - 40 * 60_000 } }
  const base = { items, cache, now, intervalMin: 30 }
  assert.deepEqual([...groupsToRefresh({ ...base, cache: null, openCountries: [], weekday: 1 })].sort(), ['crypto', 'forex', 'index'])
  assert.equal(groupsToRefresh({ ...base, cache: { ...cache, fetched: { index: now - 5 * 60_000, forex: now - 5 * 60_000, crypto: now - 5 * 60_000 } }, openCountries: ['us'], weekday: 1 }).size, 0)
  assert.deepEqual([...groupsToRefresh({ ...base, openCountries: ['us'], weekday: 1 })].sort(), ['crypto', 'forex', 'index'])
  assert.deepEqual([...groupsToRefresh({ ...base, openCountries: [], weekday: 1 })].sort(), ['crypto', 'forex']) // markets shut: indices keep their close
  assert.deepEqual([...groupsToRefresh({ ...base, openCountries: [], weekday: 6 })], ['crypto']) // weekend: only Bitcoin moves
  const old = { ...cache, fetched: { index: now - 13 * 3600_000, forex: now - 13 * 3600_000, crypto: now - 5 * 60_000 } }
  assert.deepEqual([...groupsToRefresh({ ...base, cache: old, openCountries: [], weekday: 6 })].sort(), ['forex', 'index']) // 12-hour backstop
  // a country added after the last fetch: its index was never asked for, so the index group is fetched at once
  const added = { ...base, items: tickerItems(['us', 'uk']), cache: { ...cache, fetched: { index: now - 60_000, forex: now - 60_000, crypto: now - 60_000 } }, openCountries: [], weekday: 6 }
  assert.deepEqual([...groupsToRefresh(added)], ['index'])
  // a group that answered with an error is not asked again until the interval has passed
  const failed = { quotes: [], asked: items.map((i) => i.id), fetched: { index: now - 60_000, forex: now - 60_000, crypto: now - 60_000 } }
  assert.equal(groupsToRefresh({ ...base, cache: failed, openCountries: ['us'], weekday: 1 }).size, 0)
})

// ---- weather ----
test('weather URLs carry the city, coordinates and units', () => {
  assert.equal(geocodeUrl('São Paulo, Brazil'), 'https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Paulo&count=10&language=en&format=json') // only the name is searched
  const f = new URL(forecastUrl({ lat: 30.27, lon: -97.74, unit: 'F' }))
  assert.equal(f.searchParams.get('temperature_unit'), 'fahrenheit'); assert.equal(f.searchParams.get('wind_speed_unit'), 'mph'); assert.equal(f.searchParams.get('latitude'), '30.27')
  assert.equal(new URL(forecastUrl({ lat: 1, lon: 2, unit: 'C' })).searchParams.get('wind_speed_unit'), 'kmh')
})

test('"City, Region" picks the matching place from the search results', () => {
  assert.deepEqual(splitPlace('Austin, Texas'), { name: 'Austin', qualifier: 'texas' }); assert.deepEqual(splitPlace(' Pune '), { name: 'Pune', qualifier: '' })
  const results = [
    { name: 'Austin', admin1: 'Minnesota', country: 'United States', country_code: 'US', latitude: 43.67, longitude: -92.97 },
    { name: 'Austin', admin1: 'Texas', country: 'United States', country_code: 'US', latitude: 30.27, longitude: -97.74 },
    { name: 'Austin', admin1: 'Tasmania', country: 'Australia', country_code: 'AU', latitude: -42.1, longitude: 147.2 },
  ]
  assert.equal(parseGeocode({ results }, 'Austin, Texas').region, 'Texas')
  assert.equal(parseGeocode({ results }, 'Austin, AU').region, 'Tasmania') // a country code works too
  assert.equal(parseGeocode({ results }, 'Austin').region, 'Minnesota') // no qualifier: the best-ranked match
  assert.equal(parseGeocode({ results }, 'Austin, Atlantis').region, 'Minnesota') // nothing matches: fall back to the first
  assert.equal(parseGeocode({ results: [] }, 'x'), null)
})

test('weather answers are read into a small summary', () => {
  assert.deepEqual(parseGeocode({ results: [{ name: 'Austin', admin1: 'Texas', country: 'United States', latitude: 30.26, longitude: -97.74 }] }), { name: 'Austin', region: 'Texas', country: 'United States', lat: 30.26, lon: -97.74 })
  assert.equal(parseGeocode({}), null)
  const f = parseForecast({
    current: { temperature_2m: 68.4, relative_humidity_2m: 52, weather_code: 2, wind_speed_10m: 8.2 },
    daily: { time: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], weather_code: [2, 0, 1, 61, 3], temperature_2m_max: [73.6, 72, 70, 63, 66], temperature_2m_min: [55.1, 52, 50, 48, 49] },
  }, 'F')
  assert.deepEqual([f.temp, f.humidity, f.wind, f.windUnit, f.high, f.low], [68, 52, 8, 'mph', 74, 55])
  assert.deepEqual(f.next.map((d) => d.day), ['Tue', 'Wed', 'Thu', 'Fri'])
  assert.equal(parseForecast({}, 'C'), null)
})

test('weather codes map to words and an icon', () => {
  assert.deepEqual(describe(0), { icon: '☀️', text: 'Clear' }); assert.equal(describe(63).text, 'Rain'); assert.equal(describe(95).text, 'Thunderstorm'); assert.equal(describe(999).text, 'Weather')
})
