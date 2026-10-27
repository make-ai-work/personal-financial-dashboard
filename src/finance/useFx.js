import { useCallback, useEffect, useRef, useState } from 'react'
import { COUNTRIES } from '../lib/format.js'
import { fetchRate } from '../lib/fx.js'

// Live rate between the two selected countries' currencies: 1 base = rate quote.
// Falls back to the most recent saved rate when offline; can also be set by hand.
export function useFx(c1, c2, rates) {
  const base = COUNTRIES[c1].currency
  const quote = COUNTRIES[c2].currency
  const ratesRef = useRef(rates)
  ratesRef.current = rates
  const [s, setS] = useState({ rate: null, source: null, at: null, loading: true, error: '' })

  const refresh = useCallback(async () => {
    setS((p) => ({ ...p, loading: true, error: '' }))
    try {
      const r = await fetchRate(base, quote)
      setS({ rate: r.rate, source: 'live', at: new Date(), loading: false, error: '' })
    } catch (e) {
      const saved = [...ratesRef.current].sort((a, b) => (a.date < b.date ? 1 : -1)).find(
        (r) => (r.from === base && r.to === quote) || (r.from === quote && r.to === base),
      )
      const rate = saved ? (saved.from === base ? saved.rate : 1 / saved.rate) : null
      setS({ rate, source: saved ? 'saved' : null, at: saved ? new Date(saved.date + 'T00:00:00') : null, loading: false, error: e.message })
    }
  }, [base, quote])

  useEffect(() => { refresh() }, [refresh])

  const setManual = (rate) => setS({ rate, source: 'manual', at: new Date(), loading: false, error: '' })
  return { base, quote, ...s, refresh, setManual }
}
