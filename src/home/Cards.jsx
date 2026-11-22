import { useEffect, useRef, useState } from 'react'
import { cityClock, EXCHANGE_CITIES } from '../lib/exchangecity.js'
import { marketStatus, EXCHANGES } from '../lib/markets.js'
import { COUNTRIES, OWNERS, moneyCurrency, ownerLabel, curSym } from '../lib/format.js'
import { describe, loadPlaceWeather } from '../lib/weather.js'
import { netWorth } from '../lib/networth.js'
import { homePrefs } from '../lib/homeprefs.js'

// A Date that refreshes itself (every 15 seconds is plenty for minute-accurate clocks).
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const unitFor = (code) => homePrefs.unit('') || EXCHANGE_CITIES[code].unit

// Weather for one country's exchange city. The first fetch never waits for a visible tab; the periodic refresh does.
function useCityWeather(code, version) {
  const unit = unitFor(code)
  const [state, setState] = useState({ data: null, error: '', loading: true, detail: '' })
  const running = useRef(false)
  const retryRef = useRef(() => {})
  useEffect(() => {
    let live = true
    const check = async (reason) => {
      const cached = homePrefs.weatherOf(code)
      const fresh = cached && cached.unit === unit && Date.now() - cached.fetchedAt < homePrefs.refreshMin() * 60_000
      if (fresh && reason !== 'retry') { setState({ data: cached, error: '', loading: false, detail: '' }); return }
      if (reason === 'timer' && document.visibilityState === 'hidden') return
      if (running.current) return
      running.current = true
      setState((s) => ({ ...s, loading: true, error: '' }))
      try {
        const data = { ...(await loadPlaceWeather(EXCHANGE_CITIES[code], unit)), unit }
        homePrefs.setWeatherOf(code, data)
        if (live) setState({ data, error: '', loading: false, detail: '' })
      } catch (e) {
        if (live) setState((s) => ({ ...s, loading: false, error: e.message || 'Could not load the weather.', detail: e.detail || '' }))
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
  }, [code, unit, version])
  return { ...state, retry: () => retryRef.current() }
}

// One country: line 1 = city, time (with a day or night icon), market status; line 2 = the weather.
export function CountryRow({ code, now, version }) {
  const ck = cityClock(code, now)
  const m = marketStatus(code, now)
  const w = useCityWeather(code, version)
  const d = w.data
  const info = d && describe(d.code)
  return (
    <div className="hcrow" data-testid={`row-${code}`}>
      <div className="l1">
        <div className="cty"><span className="fl">{COUNTRIES[code].flag}</span><b>{ck.city}</b><small>{EXCHANGES[code].name}</small></div>
        <div className="tme"><b>{ck.time}</b><span className="dn-ico" role="img" aria-label={ck.isDay ? 'Daytime' : 'Night'}>{ck.isDay ? '☀️' : '🌙'}</span><small>{ck.day}</small></div>
        <div className="mst"><span className={`pill ${m.open ? 'o' : 'c'}`}>{m.open ? 'Open' : 'Closed'}</span><small>{m.label}</small></div>
      </div>
      <div className="l2">
        {w.loading && !d && <span className="c">Loading the weather…</span>}
        {w.error && <span className="err">{w.error} <button className="link" onClick={w.retry}>Try again</button>{w.detail && <small className="diag">Details: {w.detail}</small>}</span>}
        {d && (
          <>
            <span className="wt"><span aria-hidden="true">{info.icon}</span> {d.temp}°{d.unit}</span>
            <span>{info.text}</span>
            <span title="High / low today">H/L <b>{d.high}/{d.low}°</b></span>
            <span>Wind <b>{d.wind} {d.windUnit}</b></span><span title="Humidity">Hum <b>{d.humidity}%</b></span>
            {d.aqi != null && <span className="aqi" title="US air quality index">AQI <b>{d.aqi}</b> · {d.aqiLabel}</span>}
          </>
        )}
      </div>
    </div>
  )
}

export function CountriesCard({ countries, now, version, onSettings }) {
  const list = countries.filter((c) => EXCHANGE_CITIES[c] && EXCHANGES[c])
  return (
    <div className="card" aria-label="Markets, time and weather">
      <h3 className="ch"><span>Markets · time · weather</span><button className="link" onClick={onSettings}>⚙ Home settings</button></h3>
      {list.map((c) => <CountryRow key={c} code={c} now={now} version={version} />)}
      <p className="fine">The city is where each country’s main stock exchange is. Market hours are regular trading hours only; public holidays are not included. Weather: Open-Meteo.</p>
    </div>
  )
}

// Total net worth with an owner selector (the choice also drives the Summary and chart on the left). Needs the unlocked data.
export function NetWorthCard({ data, owner, onOwner, fx, parentLabel }) {
  return (
    <div className="card nwc" aria-label="Total net worth">
      <h3 className="ch"><span>Total net worth</span></h3>
      <div className="seg" role="group" aria-label="Whose net worth">
        {['all', ...OWNERS].map((o) => <button key={o} className={owner === o ? 'on' : ''} onClick={() => onOwner(o)}>{o === 'all' ? 'All' : ownerLabel(o, parentLabel)}</button>)}
      </div>
      {data ? <NetWorthBody data={data} owner={owner} fx={fx} /> : <p className="c">Unlock your data to see this.</p>}
    </div>
  )
}

function NetWorthBody({ data, owner, fx }) {
  const nw = netWorth(data, owner, fx)
  const cur = nw.base
  const show = (n) => (Number.isNaN(n) ? '—' : moneyCurrency(cur, n))
  const multi = nw.per.length > 1
  return (
    <>
      <div className="nwtop">
        <div className="nwmain">
          <div className="nwbig" data-testid="networth">{nw.ready ? show(nw.total.net) : fx.loading ? 'Loading rates…' : '—'}</div>
          <div className="sub">in {curSym(cur)}{multi ? ' · converted at today’s rates' : ''}{fx.source === 'saved' ? ' (saved rates)' : ''}{!nw.ready && !fx.loading ? ' · exchange rates needed: open Finance Dashboard and set them' : ''}</div>
        </div>
        <div className="nwrows" aria-label="By country">
          {nw.per.map((p) => (
            <div className="nwr" key={p.code}>
              <span>{COUNTRIES[p.code].flag} {COUNTRIES[p.code].name}</span>
              <span>{moneyCurrency(p.currency, p.net)}{multi && p.currency !== cur && !Number.isNaN(p.inBase.net) ? <small> ≈ {show(p.inBase.net)}</small> : null}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="nwtiles">
        <div><small>Assets</small><b className="pos">{show(nw.total.assets)}</b></div>
        <div><small>Liabilities</small><b className="neg">{show(nw.total.liabilities)}</b></div>
      </div>
    </>
  )
}
