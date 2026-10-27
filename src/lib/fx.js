// Live exchange rates from the free Frankfurter API (ECB reference rates, no key needed).
// Only currency codes are sent; none of your data leaves the browser.
// Returns { rates: { INR: 84, GBP: 0.78 }, date } meaning 1 `base` = rate `quote`.
export async function fetchRates(base, quotes, signal) {
  if (!quotes.length) return { rates: {}, date: null }
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quotes.join(',')}`, { signal })
  if (!res.ok) throw new Error(`FX service returned ${res.status}`)
  const json = await res.json()
  const rates = {}
  for (const q of quotes) {
    if (!(json?.rates?.[q] > 0)) throw new Error(`FX service returned no rate for ${q}`)
    rates[q] = json.rates[q]
  }
  return { rates, date: json.date }
}
