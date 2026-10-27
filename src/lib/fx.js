// Live exchange rate from the free Frankfurter API (ECB reference rates, no key needed).
// Only the two currency codes are sent; none of your data leaves the browser.
export async function fetchRate(from, to, signal) {
  if (from === to) return { rate: 1, date: null }
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`, { signal })
  if (!res.ok) throw new Error(`FX service returned ${res.status}`)
  const json = await res.json()
  const rate = json?.rates?.[to]
  if (!(rate > 0)) throw new Error('FX service returned no rate')
  return { rate, date: json.date }
}
