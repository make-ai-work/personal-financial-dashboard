import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COUNTRIES } from '../lib/format.js'
import { fetchRates } from '../lib/fx.js'

// Live rates from the first country's currency (the reporting currency) to every other selected one:
// rates[Q] = how many Q you get for 1 base. Falls back to the most recent saved rates when offline,
// and any rate can be set by hand. Cross rates between two non-base currencies go through the base.
export function useFx(codes, savedRates) {
  const base = COUNTRIES[codes[0]].currency
  const quotes = useMemo(
    () => [...new Set(codes.slice(1).map((c) => COUNTRIES[c].currency))].filter((c) => c !== base),
    [codes.join(','), base], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const saved = useRef(savedRates)
  saved.current = savedRates
  const [s, setS] = useState({ rates: {}, source: null, at: null, loading: quotes.length > 0, error: '' })

  const refresh = useCallback(async () => {
    if (!quotes.length) {
      setS({ rates: {}, source: null, at: null, loading: false, error: '' })
      return
    }
    setS((p) => ({ ...p, loading: true, error: '' }))
    try {
      const r = await fetchRates(base, quotes)
      setS({ rates: r.rates, source: 'live', at: new Date(), loading: false, error: '' })
    } catch (e) {
      const rates = {}
      let latest = ''
      for (const q of quotes) {
        const hit = [...saved.current].sort((a, b) => (a.date < b.date ? 1 : -1)).find(
          (r) => (r.from === base && r.to === q) || (r.from === q && r.to === base),
        )
        if (hit) {
          rates[q] = hit.from === base ? hit.rate : 1 / hit.rate
          if (hit.date > latest) latest = hit.date
        }
      }
      setS({ rates, source: Object.keys(rates).length ? 'saved' : null, at: latest ? new Date(latest + 'T00:00:00') : null, loading: false, error: e.message })
    }
  }, [base, quotes])

  useEffect(() => { refresh() }, [refresh])

  const setManual = (map) => setS((p) => ({ ...p, rates: { ...p.rates, ...map }, source: 'manual', at: new Date(), loading: false, error: '' }))
  const ready = quotes.every((q) => s.rates[q] > 0)
  return { base, quotes, ...s, ready, refresh, setManual }
}
