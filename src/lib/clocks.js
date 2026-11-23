// Clocks for the Home page: the time in the capital of each selected country.
// A country with several time zones uses its capital's (USA: Washington, D.C.; Australia: Canberra).
import { COUNTRIES } from './format.js'

export const CAPITALS = {
  us: { city: 'Washington, D.C.', tz: 'America/New_York', zoneLocale: 'en-US' },
  in: { city: 'New Delhi', tz: 'Asia/Kolkata', zoneLocale: 'en-IN' },
  uk: { city: 'London', tz: 'Europe/London', zoneLocale: 'en-GB' },
  au: { city: 'Canberra', tz: 'Australia/Sydney', zoneLocale: 'en-AU' }, // Canberra keeps Sydney's clock
  ch: { city: 'Bern', tz: 'Europe/Zurich', zoneLocale: 'en-GB' },
  ie: { city: 'Dublin', tz: 'Europe/Dublin', zoneLocale: 'en-IE' },
}

const clean = (s) => s.replace(/[  ]/g, ' ')
const part = (parts, type) => parts.find((p) => p.type === type)?.value || ''

// { city, country, time: '10:42 AM', day: 'Mon 16 Nov', zone: 'EST' } for a country code at an instant.
export function clockFor(code, now = new Date()) {
  const cap = CAPITALS[code]
  const time = clean(new Intl.DateTimeFormat('en-US', { timeZone: cap.tz, hour: 'numeric', minute: '2-digit' }).format(now))
  const d = new Intl.DateTimeFormat('en-GB', { timeZone: cap.tz, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(now)
  const day = `${part(d, 'weekday')} ${part(d, 'day')} ${part(d, 'month')}`
  const zone = part(new Intl.DateTimeFormat(cap.zoneLocale, { timeZone: cap.tz, timeZoneName: 'short' }).formatToParts(now), 'timeZoneName')
  return { code, city: cap.city, country: COUNTRIES[code].name, time, day, zone }
}

export const clocksFor = (codes, now = new Date()) => codes.filter((c) => CAPITALS[c]).map((c) => clockFor(c, now))

// "Good Morning / Afternoon / Evening" from the hour on this device.
export function greeting(hour) {
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}
