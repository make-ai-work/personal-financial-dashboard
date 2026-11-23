import { useState } from 'react'
import { COUNTRIES, curSym } from '../lib/format.js'
import NumInput from './NumInput.jsx'

const symbolOf = (currency) => Object.values(COUNTRIES).find((c) => c.currency === currency)
const fmtRate = (currency, r) => {
  const c = symbolOf(currency)
  return `${c.symbol}${r.toLocaleString(c.locale, { maximumFractionDigits: 4 })}`
}

// Shows "$1 = ₹84 · £0.78" with its source, and lets you refresh or set the rates by hand.
export default function FxBar({ fx, note }) {
  const [editing, setEditing] = useState(false)
  const [vals, setVals] = useState({})
  if (!fx.quotes.length) return null
  const submit = (e) => {
    e.preventDefault()
    const map = {}
    for (const q of fx.quotes) if (Number(vals[q]) > 0) map[q] = Number(vals[q])
    if (Object.keys(map).length) fx.setManual(map)
    setEditing(false)
    setVals({})
  }
  return (
    <div className="fx">
      <span>
        Exchange rate:{' '}
        {fx.ready || Object.keys(fx.rates).length
          ? <b>{curSym(fx.base)}1 = {fx.quotes.filter((q) => fx.rates[q] > 0).map((q) => fmtRate(q, fx.rates[q])).join(' · ')}</b>
          : <b>unavailable</b>}
        {fx.source && <span className={`tag t-${fx.source}`}>{fx.source}</span>}
        {fx.at && fx.source === 'live' && ` fetched ${fx.at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`}
        {fx.at && fx.source === 'saved' && ` from the update on ${fx.at.toLocaleDateString()}`}
        {fx.error && <span className="neg"> · live rate failed ({fx.error})</span>}
        {!fx.ready && !fx.loading && <span className="neg"> · some totals need a rate</span>}
        {note && <span className="fx-note"> · {note}</span>}
      </span>
      <span className="fx-actions">
        {editing ? (
          <form onSubmit={submit}>
            {fx.quotes.map((q) => (
              <NumInput key={q} className="pw sm" aria-label={`${curSym(fx.base)}1 in ${curSym(q)}`} placeholder={`${curSym(fx.base)}1 = ? ${curSym(q)}`}
                value={vals[q] ?? ''} onChange={(e) => setVals({ ...vals, [q]: e.target.value })} />
            ))}
            <button className="btn">Use</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <>
            <button className="btn" onClick={fx.refresh} disabled={fx.loading}>{fx.loading ? 'Fetching…' : 'Refresh'}</button>
            <button className="btn" onClick={() => setEditing(true)}>Set manually</button>
          </>
        )}
      </span>
    </div>
  )
}
