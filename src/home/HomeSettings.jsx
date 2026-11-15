import { useState } from 'react'
import { Modal } from '../finance/ui.jsx'
import { homePrefs } from '../lib/homeprefs.js'
import { IS_DEMO } from '../lib/demo.js'
import { fetchQuotes, fmtPrice, tickerItems } from '../lib/ticker.js'
import { COUNTRIES } from '../lib/format.js'

export default function HomeSettings({ countries, onClose, onSaved }) {
  const [unit, setUnit] = useState(homePrefs.unit(''))
  const [key, setKey] = useState(homePrefs.fcsKey())
  const [show, setShow] = useState(false)
  const [every, setEvery] = useState(homePrefs.refreshMin())
  const [test, setTest] = useState({ state: 'idle', text: '' })
  const indices = tickerItems(countries).filter((i) => i.group === 'index')

  const runTest = async () => {
    setTest({ state: 'busy', text: 'Checking…' })
    const gold = tickerItems([]).filter((i) => i.id === 'gold')
    const out = await fetchQuotes(gold, key.trim(), { groups: new Set(['forex']) })
    if (out.quotes.length) setTest({ state: 'ok', text: `✓ Working: Gold ${fmtPrice(out.quotes[0].price)}` })
    else setTest({ state: 'bad', text: out.problems[0]?.message || 'The key did not work.' })
  }
  const save = () => {
    homePrefs.setUnit(unit)
    homePrefs.setRefreshMin(every)
    if (!IS_DEMO) homePrefs.setFcsKey(key)
    onSaved()
    onClose()
  }
  return (
    <Modal title="Home settings" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="rowf"><span>Temperature unit<small>Weather and air quality come from Open-Meteo (free, no key) for the city of each country’s main stock exchange. Only the city’s coordinates are sent.</small></span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Temperature unit"><option value="">Automatic (°F in the US, °C elsewhere)</option><option value="F">°F (Fahrenheit)</option><option value="C">°C (Celsius)</option></select></div>
      <hr className="sep" />
      {IS_DEMO ? (
        <div className="warn"><b>Market ticker.</b> The demo shows a snapshot of prices taken when the site was built, so no API key is needed (or stored) here.</div>
      ) : (
        <>
          <div className="rowf"><span>FCS API key<small>For the market ticker. Get a key at fcsapi.com.</small></span>
            <span className="inl"><input type={show ? 'text' : 'password'} value={key} onChange={(e) => { setKey(e.target.value); setTest({ state: 'idle', text: '' }) }} autoComplete="off" spellCheck="false" aria-label="FCS API key" />
              <button type="button" className="btn sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></span></div>
          <div className="rowf"><span>Check the key<small>Fetches the gold price once to confirm it works.</small></span>
            <span><button className="btn" onClick={runTest} disabled={!key.trim() || test.state === 'busy'}>Test</button>{' '}
              {test.text && <span className={test.state === 'ok' ? 'okmsg' : test.state === 'bad' ? 'err' : 'sub'} role="status">{test.text}</span>}</span></div>
        </>
      )}
      <div className="rowf"><span>Refresh prices every<small>Prices are cached so your quota lasts. Indices are only refreshed while their market is open.</small></span>
        <select value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="Refresh interval" disabled={IS_DEMO}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option></select></div>
      <div className="rowf"><span>Indices in the ticker<small>S&amp;P 500, Nasdaq, Sensex and Nifty 50 are always shown, plus one main index for each other country in Finance → Settings, then gold and Bitcoin.</small></span>
        <span className="chips">{indices.map((i) => <span className="chip" key={i.id}>{i.label}</span>)}</span></div>
      <div className="sub" style={{ marginTop: 4 }}>Countries come from Finance → Settings: {countries.map((c) => `${COUNTRIES[c].flag} ${COUNTRIES[c].name}`).join(', ')}.</div>
      <div className="warn"><b>Where this is kept.</b> {IS_DEMO ? 'In this tab only; a reload resets it.' : 'The city and key stay in this browser only (not in your encrypted file), so Home works before you unlock. They persist between visits on this device, but are not encrypted. They are sent only to Open-Meteo (the city) and FCS API (the key and the symbols).'}</div>
      <div className="warn"><b>FCS plans.</b> The free FCS plan covers gold and Bitcoin. Index prices (S&amp;P 500, Sensex, …) need an FCS stock plan, from about $25 a month.</div>
    </Modal>
  )
}
