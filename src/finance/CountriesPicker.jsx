import { useState } from 'react'
import { COUNTRIES, COUNTRY_CODES } from '../lib/format.js'
import { moveCountry, toggleCountry } from '../lib/countries.js'

// Choose which countries a section shows (1-5), in order. The first is the reporting currency.
// Unticking only hides a country: its data stays in the file.
// describe(code) -> { count, text } for the line under each country. noun = [singular, plural].
export default function CountriesPicker({ value, onChange, describe, noun }) {
  const [pending, setPending] = useState(null)
  const order = [...value, ...COUNTRY_CODES.filter((c) => !value.includes(c))]

  const toggle = (code) => {
    if (value.includes(code)) {
      if (value.length === 1) return
      if (describe(code).count > 0) return setPending(code)
    }
    onChange(toggleCountry(value, code))
  }
  const confirmHide = () => {
    onChange(toggleCountry(value, pending))
    setPending(null)
  }

  return (
    <>
      <div className="cl">
        {order.map((code) => {
          const c = COUNTRIES[code]
          const on = value.includes(code)
          const d = describe(code)
          return (
            <div key={code} className={`crow${on ? '' : ' off'}`}>
              <input type="checkbox" aria-label={`Show ${c.name}`} checked={on} disabled={on && value.length === 1} onChange={() => toggle(code)} />
              <span className="fl">{c.flag}</span>
              <span className="nm">
                {c.name} <span className="cur">{c.currency}</span>
                {on && value[0] === code && <span className="base">reporting currency</span>}
                <small>{d.text}</small>
              </span>
              {on ? (
                <span className="row-actions">
                  <button className="mv" aria-label={`Move ${c.name} up`} disabled={value[0] === code} onClick={() => onChange(moveCountry(value, code, -1))}>↑</button>
                  <button className="mv" aria-label={`Move ${c.name} down`} disabled={value[value.length - 1] === code} onClick={() => onChange(moveCountry(value, code, 1))}>↓</button>
                </span>
              ) : <span className="hid">hidden</span>}
            </div>
          )
        })}
      </div>
      <div className="pad sub">
        Pick one to five countries. Each gets its own tab. The first in the list is the reporting currency: exchange rates are fetched from it.
        Unticking a country only hides it; its data stays in your encrypted file and comes back when you tick it again.
      </div>
      {pending && (
        <div className="pad" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="warn" style={{ margin: 0 }}>
            Unticking <b>{COUNTRIES[pending].name}</b> will hide {describe(pending).count} {describe(pending).count === 1 ? noun[0] : noun[1]}. Nothing is deleted.{' '}
            <button className="btn" onClick={confirmHide}>Hide {COUNTRIES[pending].name}</button>{' '}
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
