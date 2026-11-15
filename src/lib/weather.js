// Weather from Open-Meteo (free, no key): look up the city once, then fetch the forecast for its coordinates.
// Only the city name (geocoding) and its coordinates (forecast) are sent.
// The search matches a place NAME only ("Austin"), so "Austin, Texas" is split: the name is searched (up to 10 matches) and
// the rest ("Texas", "UK", "India") is used to pick the right match.
export function splitPlace(input) {
  const [name, ...rest] = String(input).split(',')
  return { name: name.trim(), qualifier: rest.join(' ').trim().toLowerCase() }
}
export const geocodeUrl = (input) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(splitPlace(input).name)}&count=10&language=en&format=json`

export function forecastUrl({ lat, lon, unit }) {
  const f = unit === 'F'
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '5',
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: f ? 'fahrenheit' : 'celsius', wind_speed_unit: f ? 'mph' : 'kmh',
  })
  return `https://api.open-meteo.com/v1/forecast?${q}`
}

// WMO weather codes -> an emoji and words.
const CODES = [
  [[0], '☀️', 'Clear'], [[1], '🌤️', 'Mostly clear'], [[2], '⛅', 'Partly cloudy'], [[3], '☁️', 'Overcast'],
  [[45, 48], '🌫️', 'Fog'], [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'], [[61, 63, 65, 66, 67], '🌧️', 'Rain'],
  [[71, 73, 75, 77, 85, 86], '❄️', 'Snow'], [[80, 81, 82], '🌧️', 'Showers'], [[95, 96, 99], '⛈️', 'Thunderstorm'],
]
export function describe(code) {
  const hit = CODES.find(([codes]) => codes.includes(Number(code)))
  return hit ? { icon: hit[1], text: hit[2] } : { icon: '🌡️', text: 'Weather' }
}

export function parseGeocode(json, input = '') {
  const list = (json?.results || []).filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude))
  const { qualifier } = splitPlace(input)
  const words = qualifier.split(/[\s,]+/).filter(Boolean)
  const fits = (x) => words.every((w) => [x.admin1, x.admin2, x.country, x.country_code].some((f) => f && String(f).toLowerCase().includes(w)))
  const r = (words.length && list.find(fits)) || list[0]
  if (!r) return null
  return { name: r.name, region: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude }
}

// today + the next four days. Day names come from the date text (YYYY-MM-DD) so no time zone shifts them.
export function parseForecast(json, unit) {
  const c = json?.current
  const d = json?.daily
  if (!c || !d?.time?.length) return null
  const days = d.time.map((t, i) => ({
    day: new Date(`${t}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    high: Math.round(d.temperature_2m_max[i]), low: Math.round(d.temperature_2m_min[i]), code: d.weather_code[i],
  }))
  return {
    unit, temp: Math.round(c.temperature_2m), humidity: Math.round(c.relative_humidity_2m), wind: Math.round(c.wind_speed_10m),
    windUnit: unit === 'F' ? 'mph' : 'km/h', code: c.weather_code, high: days[0].high, low: days[0].low, next: days.slice(1, 5),
  }
}

// One request, with a time limit and plain-language failures (a hung or blocked request must never leave "Loading…" forever).
// `step` says which request it was, so a failure message shows whether the city lookup or the forecast was the one that stalled.
// Network trouble, timeouts and server errors are marked `transient` so the caller can try again.
export async function getJson(url, fetchImpl = fetch, timeoutMs = 20_000, step = 'weather request') {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null
  const started = Date.now()
  // a short technical line shown under the message, so a screenshot from a phone says what happened
  const detail = () => [
    step, `${Math.round((Date.now() - started) / 100) / 10}s`,
    typeof document !== 'undefined' ? `tab ${document.visibilityState}` : '',
    typeof navigator !== 'undefined' ? `online ${navigator.onLine}` : '',
    typeof navigator !== 'undefined' && navigator.connection?.effectiveType ? `net ${navigator.connection.effectiveType}` : '',
  ].filter(Boolean).join(' · ')
  const fail = (message, transient) => Object.assign(new Error(message), { transient, detail: detail() })
  let res
  try {
    res = await fetchImpl(url, ctl ? { signal: ctl.signal } : undefined)
  } catch (e) {
    throw fail(e?.name === 'AbortError'
      ? `The weather service (Open-Meteo) did not answer in time (${step}). Try again.`
      : `Could not reach the weather service (Open-Meteo) (${step}). Check your connection, and that no ad or privacy blocker or private DNS is stopping open-meteo.com.`, true)
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!res.ok) throw fail(res.status === 429 ? 'The weather service is limiting requests right now. Try again in a minute.' : `The weather service answered with an error (HTTP ${res.status}, ${step}). Try again later.`, res.status >= 500 || res.status === 429)
  try { return await res.json() } catch { throw fail(`The weather service sent something unreadable (${step}). Try again later.`, true) }
}

// Try again a couple of times, with a short wait, when the failure was only network trouble.
export async function withRetry(fn, delays = [1000, 3000]) {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e) {
      if (!e?.transient || i >= delays.length) throw e
      await new Promise((r) => setTimeout(r, delays[i]))
    }
  }
}

// "40.71, -74.01" skips the city lookup entirely.
export function parseCoordinates(input) {
  const m = String(input).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1]), lon = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, region: '', country: '', lat, lon }
}

// Big, common places need no lookup at all (one request instead of two). Used for the demo's default city.
const BUILTIN_PLACES = {
  'new york': { name: 'New York', region: 'New York', country: 'United States', lat: 40.7143, lon: -74.006 },
}
const placeKey = (city) => String(city).trim().toLowerCase()

// opts: a fetch function (older callers) or { fetchImpl, geo: { get(city), set(city, place) }, delays }
export async function loadWeather(city, unit, opts = {}) {
  const o = typeof opts === 'function' ? { fetchImpl: opts } : opts
  const fetchImpl = o.fetchImpl || fetch
  let g = parseCoordinates(city) || BUILTIN_PLACES[placeKey(city)] || o.geo?.get(city) || null
  if (!g) {
    g = parseGeocode(await withRetry(() => getJson(geocodeUrl(city), fetchImpl, 20_000, 'looking up the city'), o.delays), city)
    if (!g) throw new Error(`Could not find “${city}”. Try the city name alone, or a nearby larger city.`)
    o.geo?.set(city, g) // the city's coordinates do not change: ask once, remember
  }
  const f = parseForecast(await withRetry(() => getJson(forecastUrl({ lat: g.lat, lon: g.lon, unit }), fetchImpl, 20_000, 'getting the forecast'), o.delays), unit)
  if (!f) throw new Error('The weather service sent something unexpected. Try again later.')
  return { place: g.name, ...f, fetchedAt: Date.now() }
}
