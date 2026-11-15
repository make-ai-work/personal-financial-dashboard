// Home settings live in this browser (localStorage), not in the encrypted file, so the Home page works before you unlock.
// The FCS API key is stored here too: it persists across visits on this device, but it is not encrypted.
import { IS_DEMO } from './demo.js'

// In the demo nothing is kept: settings live in memory and a reload starts again.
const mem = new Map()
const read = (k, fallback = '') => {
  if (IS_DEMO) return mem.get(k) ?? fallback
  try { return localStorage.getItem(k) ?? fallback } catch { return fallback }
}
const write = (k, v) => {
  const empty = v === '' || v == null
  if (IS_DEMO) { empty ? mem.delete(k) : mem.set(k, v); return }
  try { empty ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* storage unavailable */ }
}
const json = (k) => { try { return JSON.parse(read(k, 'null')) } catch { return null } }

export const homePrefs = {
  city: () => read('home.city'), setCity: (v) => write('home.city', v.trim()),
  unit: (fallback = 'C') => read('home.unit') || fallback, setUnit: (v) => write('home.unit', v),
  fcsKey: () => read('home.fcsKey'), setFcsKey: (v) => write('home.fcsKey', v.trim()),
  refreshMin: () => Number(read('home.refreshMin')) || 30, setRefreshMin: (v) => write('home.refreshMin', String(v)),
  countries: () => { const c = json('home.countries'); return Array.isArray(c) && c.length ? c : ['us', 'in'] },
  setCountries: (list) => write('home.countries', JSON.stringify(list)),
  quotes: () => json('home.quotes'), setQuotes: (v) => write('home.quotes', JSON.stringify(v)),
  weather: () => json('home.weather'), setWeather: (v) => write('home.weather', JSON.stringify(v)),
}
