import { useEffect, useRef, useState } from 'react'
import { clocksFor, greeting } from '../lib/clocks.js'
import { marketsFor } from '../lib/markets.js'
import { COUNTRIES } from '../lib/format.js'
import { describe, loadWeather } from '../lib/weather.js'
import { homePrefs } from '../lib/homeprefs.js'
import { IS_DEMO } from '../lib/demo.js'

// A Date that refreshes itself (every 15 seconds is plenty for minute-accurate clocks).
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function TimeCard({ countries, now }) {
  const clocks = clocksFor(countries, now)
  return (
    <div className="card" aria-label="Time">
      <h3 className="ch"><span>Time</span><span className="sub">capital city of each country</span></h3>
      <p className="hello">{greeting(now.getHours())}</p>
      <div className="clocks">
        {clocks.map((c) => (
          <div className="ck" key={c.code}>
            <span className="fl">{COUNTRIES[c.code].flag}</span>
            <div className="nm"><b>{c.city}</b><small>{c.country} · {c.zone}</small></div>
            <div className="tm"><b>{c.time}</b><small>{c.day}</small></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MarketsCard({ countries, now }) {
  const list = marketsFor(countries, now)
  return (
    <div className="card mkts" aria-label="Markets">
      <h3 className="ch"><span>Markets</span><span className="sub">now</span></h3>
      <div className="mlist">
        {list.map((m) => (
          <div className="mk" key={m.code}>
            <span className="fl">{COUNTRIES[m.code].flag}</span>
            <div className="nm"><b>{m.name}</b><small>{m.label}</small></div>
            <span className={`pill ${m.open ? 'o' : 'c'}`}>{m.open ? 'Open' : 'Closed'}</span>
          </div>
        ))}
      </div>
      <p className="fine">Regular trading hours only. Public holidays are not included, so a holiday can show as open.</p>
    </div>
  )
}

export function WeatherCard({ countries, version, onSettings }) {
  const city = homePrefs.city() || (IS_DEMO ? 'New York' : '')
  const unit = homePrefs.unit(countries[0] === 'us' ? 'F' : 'C')
  const [state, setState] = useState({ data: null, error: '', loading: false })
  const retryRef = useRef(() => {})

  const running = useRef(false)
  useEffect(() => {
    if (!city) { setState({ data: null, error: '', loading: false }); return undefined }
    let live = true
    // reason: initial | timer | visible | retry. Only the periodic refresh waits for a visible tab; the first fetch never does.
    const check = async (reason) => {
      const cached = homePrefs.weather()
      const fresh = cached && cached.city === city && cached.unit === unit && Date.now() - cached.fetchedAt < homePrefs.refreshMin() * 60_000
      if (fresh && reason !== 'retry') { setState({ data: cached, error: '', loading: false }); return }
      if (reason === 'timer' && document.visibilityState === 'hidden') return
      if (running.current) return
      running.current = true
      setState((s) => ({ ...s, loading: true, error: '' }))
      try {
        const data = { ...(await loadWeather(city, unit, { geo: { get: homePrefs.geo, set: homePrefs.setGeo } })), city, unit }
        homePrefs.setWeather(data)
        if (live) setState({ data, error: '', loading: false })
      } catch (e) {
        if (live) setState((s) => ({ ...s, loading: false, error: e.message || 'Could not load the weather.' }))
      } finally {
        running.current = false
      }
    }
    check('initial')
    const id = setInterval(() => check('timer'), 5 * 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') check('visible') }
    document.addEventListener('visibilitychange', onVisible)
    retryRef.current = () => check('retry')
    return () => { live = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [city, unit, version])

  const d = state.data
  const w = d && describe(d.code)
  return (
    <div className="card wx" aria-label="Weather">
      <h3><span>Weather{d ? ` · ${d.place}` : city ? ` · ${city}` : ''}</span><button className="link" onClick={onSettings}>{city ? 'Change' : 'Set city'}</button></h3>
      {!city && <p className="c">Choose your city in Home settings to see the weather. Only the city name is sent, to Open-Meteo.</p>}
      {city && !d && !state.error && <p className="c">Loading the weather…</p>}
      {state.error && <p className="err">{state.error} <button className="link" onClick={() => retryRef.current()}>Try again</button></p>}
      {d && (
        <>
          <div className="big"><span className="ico" aria-hidden="true">{w.icon}</span><span className="t">{d.temp}°{d.unit}</span></div>
          <div className="c">{w.text}</div>
          <div className="row"><span>High <b>{d.high}°</b></span><span>Low <b>{d.low}°</b></span><span>Wind <b>{d.wind} {d.windUnit}</b></span><span>Humidity <b>{d.humidity}%</b></span></div>
          <div className="fc">{d.next.map((x) => <div key={x.day}>{x.day}<b>{x.high}°</b><span aria-hidden="true">{describe(x.code).icon}</span></div>)}</div>
        </>
      )}
    </div>
  )
}
