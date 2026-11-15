import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { demoAuth, fetchQuotes, fmtPrice, forgetToken, groupsToRefresh, mergeCache, tickerItems } from '../lib/ticker.js'
import { marketStatus } from '../lib/markets.js'
import { AV_PROXIES, fetchAvQuotes } from '../lib/alphavantage.js'
import { homePrefs } from '../lib/homeprefs.js'
import { IS_DEMO } from '../lib/demo.js'

const when = (ms) => {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

// The rolling ticker. Normal builds ask FCS API with the key from Home settings (cached, refreshed on a gentle schedule);
// the demo uses only the public key (from the build) to get a short-lived token, so no secret is ever in the page.
function FcsTicker({ countries, version, onSettings }) {
  const items = useMemo(() => tickerItems(countries), [countries.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  // the demo: index prices come from the Alpha Vantage snapshot (ETF stand-ins); FCS serves gold and Bitcoin only
  const fcsItems = useMemo(() => (IS_DEMO ? items.filter((i) => i.group !== 'index') : items), [items])
  const [av, setAv] = useState({ state: IS_DEMO ? 'loading' : 'off', quotes: [], at: 0 })
  const publicKey = (import.meta.env.VITE_FCS_PUBLIC_KEY || '').trim()
  const key = IS_DEMO ? publicKey : homePrefs.fcsKey()
  const [cache, setCache] = useState(() => (IS_DEMO ? null : homePrefs.quotes()))
  const [tokenError, setTokenError] = useState('')
  const [problems, setProblems] = useState({}) // by group
  const [busy, setBusy] = useState(false)
  const cacheRef = useRef(cache)
  const running = useRef(false)

  useEffect(() => {
    if (!IS_DEMO) return undefined
    let live = true
    fetch(new URL('av-snapshot.json', document.baseURI))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing'))))
      .then((j) => live && setAv({ state: 'ok', quotes: (Array.isArray(j.quotes) ? j.quotes : []).filter((q) => AV_PROXIES[q.id]), at: Date.parse(j.generatedAt) || 0 }))
      .catch(() => live && setAv({ state: 'missing', quotes: [], at: 0 }))
    return () => { live = false }
  }, [])

  // mode: initial | timer | visible | force. Only the periodic refresh waits for a visible tab; the first fetch never does.
  const run = useCallback(async (mode) => {
    const force = mode === 'force'
    if (running.current || !key) return
    if (mode === 'timer' && document.visibilityState === 'hidden') return
    const now = Date.now()
    const relevant = [...new Set(['us', 'in', ...countries])]
    const open = relevant.filter((c) => marketStatus(c, new Date(now)).open)
    const groups = force ? new Set(fcsItems.map((i) => i.group))
      : groupsToRefresh({ items: fcsItems, cache: cacheRef.current, now, intervalMin: homePrefs.refreshMin(), openCountries: open, weekday: new Date(now).getUTCDay() })
    if (!groups.size) return
    running.current = true
    setBusy(true)
    let auth = key
    if (IS_DEMO) {
      try { auth = await demoAuth(publicKey); setTokenError('') } catch (e) { running.current = false; setBusy(false); setTokenError(e.message); return }
    }
    const fresh = await fetchQuotes(fcsItems, auth, { groups })
    if (IS_DEMO && fresh.problems.some((p) => p.code === 101)) forgetToken() // an expired or refused token: next time get a new one
    running.current = false
    const merged = mergeCache(cacheRef.current, fresh)
    cacheRef.current = merged
    homePrefs.setQuotes(merged)
    setCache(merged)
    setProblems((old) => {
      const next = { ...old }
      for (const g of groups) delete next[g]
      for (const p of fresh.problems) next[p.group] = p.message
      return next
    })
    setBusy(false)
  }, [key, items, fcsItems, countries]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!key) return undefined
    run('initial')
    const id = setInterval(() => run('timer'), 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') run('visible') }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [run, key, version])

  const shown = [...(cache?.quotes || []), ...av.quotes].map((q) => ({ q, it: items.find((i) => i.id === q.id) })).filter((x) => x.it)
  const order = new Map(items.map((i, n) => [i.id, n]))
  shown.sort((a, b) => order.get(a.it.id) - order.get(b.it.id))
  const avNote = IS_DEMO && av.state === 'missing' ? 'Index prices are not available in this demo yet.' : ''
  const problemText = tokenError || Object.values(problems)[0] || avNote
  const newest = Math.max(0, ...Object.values(cache?.fetched || {}))
  const interval = homePrefs.refreshMin()

  let reason = ''
  if (!key) reason = IS_DEMO ? <><b>Prices are off.</b> The demo has no market-data key set up.</> : <><b>Prices are off.</b> Add your FCS API key in <button className="link" onClick={onSettings}>Home settings</button> to turn them on.</>
  else if (!shown.length) reason = busy || (!problemText && !cache) ? 'Loading prices…' : <><b>Prices unavailable.</b> {problemText || 'The market service sent no prices.'} <button className="link" onClick={() => run('force')}>Try again</button></>
  return (
    <TickerView
      items={items} shown={shown} reason={reason} problemText={problemText} busy={busy} onRefresh={() => run('force')}
      stateText={`Prices as of ${newest ? when(newest) : '…'} · refreshed every ${interval} minutes · indices show the last close when the market is shut`}
      source={`FCS API${IS_DEMO && av.quotes.length ? ' · Alpha Vantage (index ETFs)' : ''}`}
    />
  )
}

// Alpha Vantage as the provider (the user's own key, chosen in Home settings). Free keys allow 25 requests a day, so only the index
// ETF stand-ins are fetched (at most 5 requests per refresh), on a slow schedule: every 6 hours by default, never faster.
export const AV_MIN_REFRESH_MIN = 360
function AvTicker({ countries, version, onSettings }) {
  const items = useMemo(() => tickerItems(countries).filter((i) => AV_PROXIES[i.id]), [countries.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = homePrefs.avKey()
  const [cache, setCache] = useState(() => homePrefs.avQuotes())
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const cacheRef = useRef(cache)
  const running = useRef(false)
  const interval = Math.max(AV_MIN_REFRESH_MIN, homePrefs.refreshMin())

  const run = useCallback(async (mode) => {
    if (running.current || !key) return
    const c = cacheRef.current
    const have = new Set((c?.quotes || []).map((q) => q.id))
    const complete = items.every((i) => have.has(i.id) || c?.asked?.includes(i.id)) // a country was added since: ask now
    if (mode !== 'force' && c && complete && Date.now() - c.fetchedAt < interval * 60_000) return
    if (mode === 'timer' && document.visibilityState === 'hidden') return
    running.current = true
    setBusy(true)
    const out = await fetchAvQuotes(items, key)
    running.current = false
    const byId = new Map((c?.quotes || []).map((q) => [q.id, q]))
    for (const q of out.quotes) byId.set(q.id, q)
    const next = { quotes: [...byId.values()], fetchedAt: Date.now(), asked: items.map((i) => i.id) }
    if (out.quotes.length || !c) { cacheRef.current = next; homePrefs.setAvQuotes(next); setCache(next) }
    else { const keep = { ...c, fetchedAt: Date.now() }; cacheRef.current = keep; homePrefs.setAvQuotes(keep); setCache(keep) } // do not hammer a failing service
    setProblem(out.problems[0] || '')
    setBusy(false)
  }, [key, items, interval]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!key) return undefined
    run('initial')
    const id = setInterval(() => run('timer'), 5 * 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') run('visible') }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [run, key, version])

  const order = new Map(items.map((i, n) => [i.id, n]))
  const shown = (cache?.quotes || []).map((q) => ({ q, it: items.find((i) => i.id === q.id) })).filter((x) => x.it).sort((a, b) => order.get(a.it.id) - order.get(b.it.id))
  let reason = ''
  if (!key) reason = <><b>Prices are off.</b> Add your Alpha Vantage key in <button className="link" onClick={onSettings}>Home settings</button> to turn them on.</>
  else if (!shown.length) reason = busy || (!problem && !cache) ? 'Loading prices…' : <><b>Prices unavailable.</b> {problem || 'Alpha Vantage sent no prices.'} <button className="link" onClick={() => run('force')}>Try again</button></>
  return (
    <TickerView
      items={items} shown={shown} reason={reason} problemText={problem} busy={busy} onRefresh={() => run('force')}
      stateText={`Prices as of ${cache?.fetchedAt ? when(cache.fetchedAt) : '…'} · refreshed every ${Math.round(interval / 60)} hours (the free key allows 25 requests a day) · index ETFs, last close`}
      source="Alpha Vantage (index ETFs)"
    />
  )
}

export default function Ticker(props) {
  return !IS_DEMO && homePrefs.provider() === 'av' ? <AvTicker {...props} /> : <FcsTicker {...props} />
}

// The strip is always there. Without prices it shows the names with a dash, and one line says why.
function TickerView({ items, shown, reason, problemText, busy, onRefresh, stateText, source }) {
  if (reason) {
    const nameRow = items.map((it) => <span className="tk" key={it.id}><b>{it.label}</b> <small>{it.sub}</small> <span className="px">—</span></span>)
    const names = Array.from({ length: Math.max(1, Math.ceil(10 / nameRow.length)) }, (_, n) => <span className="rep" key={n}>{nameRow}</span>)
    return (
      <>
        <div className="ticker" role="marquee" aria-label="Market ticker"><div className="track" style={{ animationDuration: `${Math.max(30, items.length * 6)}s` }}><span className="set">{names}</span><span className="set" aria-hidden="true">{names}</span></div></div>
        <div className={`tstate${problemText ? ' warnline' : ''}`}><span>{reason}</span></div>
      </>
    )
  }
  const row = shown.map(({ q, it }) => {
    const up = q.changePct >= 0
    return (
      <span className="tk" key={it.id}>
        <b>{it.label}</b> <small>{q.via || it.sub}</small> <span className="px">{fmtPrice(q.price)}</span>
        <span className={up ? 'up' : 'dn'}>{up ? '▲' : '▼'} {Math.abs(q.changePct).toFixed(2)}%</span>
      </span>
    )
  })
  const reps = Math.max(1, Math.ceil(10 / row.length)) // enough copies that each half is wider than a big screen
  const half = Array.from({ length: reps }, (_, n) => <span className="rep" key={n}>{row}</span>)
  return (
    <>
      <div className="ticker" role="marquee" aria-label="Market ticker">
        <div className="track" style={{ animationDuration: `${Math.max(30, shown.length * reps * 6)}s` }}>
          <span className="set">{half}</span>
          <span className="set" aria-hidden="true">{half}</span>
        </div>
      </div>
      <div className="tstate">
        <span>{stateText} · <button className="link" onClick={onRefresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh now'}</button></span>
        <span>Source: {source}</span>
      </div>
      {problemText && <div className="tstate warnline"><span>{problemText}</span></div>}
    </>
  )
}
