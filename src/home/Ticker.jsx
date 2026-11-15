import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchQuotes, fmtPrice, groupsToRefresh, mergeCache, tickerItems } from '../lib/ticker.js'
import { marketStatus } from '../lib/markets.js'
import { homePrefs } from '../lib/homeprefs.js'
import { IS_DEMO } from '../lib/demo.js'

const when = (ms) => {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

// The rolling ticker. Normal builds ask FCS API with the key from Home settings (cached, refreshed on a gentle schedule);
// the demo reads a snapshot file written when the site was built, so no key is ever in the page.
export default function Ticker({ countries, version, onSettings }) {
  const items = useMemo(() => tickerItems(countries), [countries.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = homePrefs.fcsKey()
  const [cache, setCache] = useState(() => (IS_DEMO ? null : homePrefs.quotes()))
  const [problems, setProblems] = useState({}) // by group
  const [busy, setBusy] = useState(false)
  const [snap, setSnap] = useState({ state: 'loading', at: 0, message: '' })
  const cacheRef = useRef(cache)
  const running = useRef(false)

  // demo: the snapshot
  useEffect(() => {
    if (!IS_DEMO) return
    let live = true
    fetch(new URL('ticker-snapshot.json', document.baseURI))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing'))))
      .then((j) => {
        if (!live) return
        const quotes = Array.isArray(j.quotes) ? j.quotes : []
        setCache({ quotes, fetched: {}, asked: [] })
        setSnap({ state: quotes.length ? 'ok' : 'empty', at: Date.parse(j.generatedAt) || 0, message: (j.problems || [])[0] || '' })
      })
      .catch(() => live && setSnap({ state: 'missing', at: 0, message: '' }))
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
    const groups = force ? new Set(items.map((i) => i.group))
      : groupsToRefresh({ items, cache: cacheRef.current, now, intervalMin: homePrefs.refreshMin(), openCountries: open, weekday: new Date(now).getUTCDay() })
    if (!groups.size) return
    running.current = true
    setBusy(true)
    const fresh = await fetchQuotes(items, key, { groups })
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
  }, [key, items, countries]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (IS_DEMO || !key) return undefined
    run('initial')
    const id = setInterval(() => run('timer'), 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') run('visible') }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [run, key, version])

  const shown = (cache?.quotes || []).map((q) => ({ q, it: items.find((i) => i.id === q.id) })).filter((x) => x.it)
  const order = new Map(items.map((i, n) => [i.id, n]))
  shown.sort((a, b) => order.get(a.it.id) - order.get(b.it.id))
  const problemText = Object.values(problems)[0] || ''
  const newest = IS_DEMO ? snap.at : Math.max(0, ...Object.values(cache?.fetched || {}))
  const interval = homePrefs.refreshMin()

  // The strip is always there. Without prices it shows the index names with a dash, and one line says why.
  let reason = ''
  if (!IS_DEMO && !key) reason = <><b>Prices are off.</b> Add your FCS API key in <button className="link" onClick={onSettings}>Home settings</button> to turn them on.</>
  else if (IS_DEMO && snap.state !== 'ok' && snap.state !== 'loading') reason = <><b>Prices unavailable.</b> {snap.message || 'The demo’s price snapshot has not been generated yet.'}</>
  else if (!shown.length) reason = busy || (!problemText && !IS_DEMO && !cache) || (IS_DEMO && snap.state === 'loading') ? 'Loading prices…' : <><b>Prices unavailable.</b> {problemText || 'The market service sent no prices.'} <button className="link" onClick={() => run('force')}>Try again</button></>
  if (reason) {
    const names = items.map((it) => <span className="tk" key={it.id}><b>{it.label}</b> <small>{it.sub}</small> <span className="px">—</span></span>)
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
        <b>{it.label}</b> <small>{it.sub}</small> <span className="px">{fmtPrice(q.price)}</span>
        <span className={up ? 'up' : 'dn'}>{up ? '▲' : '▼'} {Math.abs(q.changePct).toFixed(2)}%</span>
      </span>
    )
  })
  return (
    <>
      <div className="ticker" role="marquee" aria-label="Market ticker">
        <div className="track" style={{ animationDuration: `${Math.max(30, shown.length * 6)}s` }}>
          <span className="set">{row}</span>
          <span className="set" aria-hidden="true">{row}</span>
        </div>
      </div>
      <div className="tstate">
        <span>
          {IS_DEMO ? `Snapshot from ${snap.at ? when(snap.at) : 'the site build'} · refreshed a few times a day` : `Prices as of ${newest ? when(newest) : '…'} · refreshed every ${interval} minutes`} · indices show the last close when the market is shut
          {!IS_DEMO && <> · <button className="link" onClick={() => run('force')} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh now'}</button></>}
        </span>
        <span>Source: FCS API</span>
      </div>
      {problemText && <div className="tstate warnline"><span>{problemText}</span></div>}
    </>
  )
}
