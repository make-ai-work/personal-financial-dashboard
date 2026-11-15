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
export async function getJson(url, fetchImpl = fetch, timeoutMs = 15_000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null
  let res
  try {
    res = await fetchImpl(url, ctl ? { signal: ctl.signal } : undefined)
  } catch (e) {
    throw new Error(e?.name === 'AbortError'
      ? 'The weather service (Open-Meteo) did not answer in time. Try again.'
      : 'Could not reach the weather service (Open-Meteo). Check your connection, and that no ad or privacy blocker is stopping open-meteo.com.')
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!res.ok) throw new Error(res.status === 429 ? 'The weather service is limiting requests right now. Try again in a minute.' : `The weather service answered with an error (HTTP ${res.status}). Try again later.`)
  try { return await res.json() } catch { throw new Error('The weather service sent something unreadable. Try again later.') }
}

export async function loadWeather(city, unit, fetchImpl = fetch) {
  const g = parseGeocode(await getJson(geocodeUrl(city), fetchImpl), city)
  if (!g) throw new Error(`Could not find “${city}”. Try the city name alone, or a nearby larger city.`)
  const f = parseForecast(await getJson(forecastUrl({ lat: g.lat, lon: g.lon, unit }), fetchImpl), unit)
  if (!f) throw new Error('The weather service sent something unexpected. Try again later.')
  return { place: g.name, ...f, fetchedAt: Date.now() }
}
