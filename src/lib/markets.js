// Is each country's main stock exchange open right now? Regular trading hours on weekdays, in the exchange's own
// time zone. Public holidays are NOT included, so a holiday can show as open.
export const EXCHANGES = {
  us: { name: 'NYSE · Nasdaq', tz: 'America/New_York', open: [9, 30], close: [16, 0] },
  in: { name: 'NSE · BSE', tz: 'Asia/Kolkata', open: [9, 15], close: [15, 30] },
  uk: { name: 'London Stock Exchange', tz: 'Europe/London', open: [8, 0], close: [16, 30] },
  au: { name: 'ASX', tz: 'Australia/Sydney', open: [10, 0], close: [16, 0] },
  ch: { name: 'SIX Swiss Exchange', tz: 'Europe/Zurich', open: [9, 0], close: [17, 30] },
}
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function localParts(now, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t) => p.find((x) => x.type === t)?.value
  return { weekday: DAYS[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

// 48 -> "48 min", 318 -> "5h 18m", 180 -> "3h", 2700 -> "1d 21h"
export function duration(mins) {
  const m = Math.max(0, Math.round(mins))
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
  const h = Math.floor((m % 1440) / 60)
  return `${Math.floor(m / 1440)}d${h ? ` ${h}h` : ''}`
}

const isWeekday = (d) => d >= 1 && d <= 5

// { code, name, open, label, minutes } where minutes = until the next close (open) or the next open (closed).
export function marketStatus(code, now = new Date()) {
  const ex = EXCHANGES[code]
  const open = ex.open[0] * 60 + ex.open[1]
  const close = ex.close[0] * 60 + ex.close[1]
  const { weekday, minutes } = localParts(now, ex.tz)
  if (isWeekday(weekday) && minutes >= open && minutes < close) {
    return { code, name: ex.name, open: true, minutes: close - minutes, label: `Closes in ${duration(close - minutes)}` }
  }
  let ahead = 0 // calendar days until the next trading day
  let wait
  if (isWeekday(weekday) && minutes < open) wait = open - minutes
  else {
    ahead = 1
    while (!isWeekday((weekday + ahead) % 7)) ahead++
    wait = ahead * 1440 - minutes + open
  }
  const label = ahead === 0 ? `Opens in ${duration(wait)}`
    : ahead === 1 ? `Opens tomorrow in ${duration(wait)}`
      : `Opens ${DAY_NAMES[(weekday + ahead) % 7]} in ${duration(wait)}`
  return { code, name: ex.name, open: false, minutes: wait, label }
}

export const marketsFor = (codes, now = new Date()) => codes.filter((c) => EXCHANGES[c]).map((c) => marketStatus(c, now))
