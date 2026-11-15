// The Home page shows one row per country, for the city where that country's main stock exchange is.
// Coordinates are built in, so the weather needs no city lookup. isDay is a plain 6 am to 6 pm rule on the city's own clock.
export const EXCHANGE_CITIES = {
  us: { city: 'New York', tz: 'America/New_York', lat: 40.7128, lon: -74.006, unit: 'F' },
  in: { city: 'Mumbai', tz: 'Asia/Kolkata', lat: 19.076, lon: 72.8777, unit: 'C' },
  uk: { city: 'London', tz: 'Europe/London', lat: 51.5072, lon: -0.1276, unit: 'C' },
  au: { city: 'Sydney', tz: 'Australia/Sydney', lat: -33.8688, lon: 151.2093, unit: 'C' },
  ch: { city: 'Zurich', tz: 'Europe/Zurich', lat: 47.3769, lon: 8.5417, unit: 'C' },
}

const clean = (s) => s.replace(/[  ]/g, ' ')

// { city, time: '9:42 AM', day: 'Sun', isDay } at an instant.
export function cityClock(code, now = new Date()) {
  const c = EXCHANGE_CITIES[code]
  const time = clean(new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(now))
  const day = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, weekday: 'short' }).format(now)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: 'numeric', hourCycle: 'h23' }).format(now))
  return { code, city: c.city, time, day, isDay: hour >= 6 && hour < 18 }
}
