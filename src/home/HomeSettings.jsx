import { useState } from 'react'
import { Modal } from '../finance/ui.jsx'
import { homePrefs } from '../lib/homeprefs.js'
import { IS_DEMO } from '../lib/demo.js'
import { fetchQuotes, fmtPrice, tickerItems } from '../lib/ticker.js'
import { AV_PROXIES, fetchAvQuotes } from '../lib/alphavantage.js'
import { COUNTRIES } from '../lib/format.js'

export default function HomeSettings({ countries, onClose, onSaved }) {
  const [unit, setUnit] = useState(homePrefs.unit(''))
  const [provider, setProvider] = useState(homePrefs.provider())
  const [key, setKey] = useState(homePrefs.fcsKey())
  const [avKey, setAvKey] = useState(homePrefs.avKey())
  const av = provider === 'av'
  const [show, setShow] = useState(false)
  const [every, setEvery] = useState(homePrefs.refreshMin())
  const [test, setTest] = useState({ state: 'idle', text: '' })
  const indices = tickerItems(countries).filter((i) => i.group === 'index')

  const choose = (p) => {
    setProvider(p); setTest({ state: 'idle', text: '' })
    setEvery((e) => (p === 'av' ? (e >= 360 ? e : 360) : (e <= 60 ? e : 30))) // Alpha Vantage: slow schedule (25 requests a day)
  }
  const runTest = async () => {
    setTest({ state: 'busy', text: 'Checking…' })
    if (av) {
      const spx = tickerItems(['us']).filter((i) => i.id === 'spx')
      const out = await fetchAvQuotes(spx, avKey.trim(), { delayMs: 0 })
      if (out.quotes.length) setTest({ state: 'ok', text: `✓ Working: SPY ETF ${fmtPrice(out.quotes[0].price)}` })
      else setTest({ state: 'bad', text: out.problems[0] || 'The key did not work.' })
      return
    }
    const gold = tickerItems([]).filter((i) => i.id === 'gold')
    const out = await fetchQuotes(gold, key.trim(), { groups: new Set(['forex']) })
    if (out.quotes.length) setTest({ state: 'ok', text: `✓ Working: Gold ${fmtPrice(out.quotes[0].price)}` })
    else setTest({ state: 'bad', text: out.problems[0]?.message || 'The key did not work.' })
  }
  const save = () => {
    homePrefs.setUnit(unit)
    homePrefs.setRefreshMin(every)
    if (!IS_DEMO) { homePrefs.setProvider(provider); homePrefs.setFcsKey(key); homePrefs.setAvKey(avKey) }
    onSaved()
    onClose()
  }
  return (
    <Modal title="Home settings" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="rowf"><span>Temperature unit<small>Weather and air quality come from Open-Meteo (free, no key) for the city of each country’s main stock exchange. Only the city’s coordinates are sent.</small></span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Temperature unit"><option value="">Automatic (°F in the US, °C elsewhere)</option><option value="F">°F (Fahrenheit)</option><option value="C">°C (Celsius)</option></select></div>
      <hr className="sep" />
      {IS_DEMO ? (
        <div className="warn"><b>Market ticker.</b> The demo gets prices from FCS API with a short-lived token, so no API key is needed (or stored) here.</div>
      ) : (
        <>
          <div className="rowf"><span>Market data from<small>Choose one. You need your own key for either. Neither is built in.</small></span>
            <span className="radios" role="radiogroup" aria-label="Market data provider">
              <label className={!av ? 'on' : ''}><input type="radio" name="provider" checked={!av} onChange={() => choose('fcs')} /><b>FCS API</b><small>Gold and Bitcoin free; index prices need a stock plan</small></label>
              <label className={av ? 'on' : ''}><input type="radio" name="provider" checked={av} onChange={() => choose('av')} /><b>Alpha Vantage</b><small>Free key: index ETFs only (SPY, QQQ…), 25 requests a day</small></label>
            </span></div>
          <div className="rowf"><span>{av ? 'Alpha Vantage API key' : 'FCS API key'}<small>{av ? 'Get a free key at alphavantage.co.' : 'For the market ticker. Get a key at fcsapi.com.'}</small></span>
            <span className="inl"><input type={show ? 'text' : 'password'} value={av ? avKey : key} onChange={(e) => { (av ? setAvKey : setKey)(e.target.value); setTest({ state: 'idle', text: '' }) }} autoComplete="off" spellCheck="false" aria-label={av ? 'Alpha Vantage API key' : 'FCS API key'} />
              <button type="button" className="btn sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></span></div>
          <div className="rowf"><span>Check the key<small>{av ? 'Fetches one price (SPY) to confirm it works. Uses 1 of your 25 daily requests.' : 'Fetches the gold price once to confirm it works.'}</small></span>
            <span><button className="btn" onClick={runTest} disabled={!(av ? avKey : key).trim() || test.state === 'busy'}>Test</button>{' '}
              {test.text && <span className={test.state === 'ok' ? 'okmsg' : test.state === 'bad' ? 'err' : 'sub'} role="status">{test.text}</span>}</span></div>
        </>
      )}
      <div className="rowf"><span>Refresh prices every<small>{av ? 'Slow on purpose: a free Alpha Vantage key allows 25 requests a day and each refresh uses up to 5.' : 'Prices are cached so your quota lasts. Indices are only refreshed while their market is open.'}</small></span>
        <select value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="Refresh interval" disabled={IS_DEMO}>
          {av ? <><option value={360}>6 hours</option><option value={720}>12 hours</option><option value={1440}>24 hours</option></> : <><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option></>}
        </select></div>
      <div className="rowf"><span>Indices in the ticker<small>{av ? 'Alpha Vantage shows index ETF stand-ins (not Sensex or ASX 200, and no gold or Bitcoin).' : 'S&P 500, Nasdaq, Sensex and Nifty 50 are always shown, plus one main index for each other country in Finance → Settings, then gold and Bitcoin.'}</small></span>
        <span className="chips">{indices.filter((i) => !av || AV_PROXIES[i.id]).map((i) => <span className="chip" key={i.id}>{i.label}</span>)}</span></div>
      <div className="sub" style={{ marginTop: 4 }}>Countries come from Finance → Settings: {countries.map((c) => `${COUNTRIES[c].flag} ${COUNTRIES[c].name}`).join(', ')}.</div>
      <div className="warn"><b>Where this is kept.</b> {IS_DEMO ? 'In this tab only; a reload resets it.' : 'The city and key stay in this browser only (not in your encrypted file), so Home works before you unlock. They persist between visits on this device, but are not encrypted. They are sent only to Open-Meteo (the city’s coordinates) and to the market-data service you chose (your key and the symbols).'}</div>
      {!IS_DEMO && (av
        ? <div className="warn"><b>Alpha Vantage.</b> The free plan has no real index levels, so each index is shown through an ETF that tracks it (S&amp;P 500 as SPY, Nasdaq as QQQ, Nifty 50 as Nifty BeES, FTSE 100 as ISF, SMI as EWL), labelled on the ticker.</div>
        : <div className="warn"><b>FCS plans.</b> The free FCS plan covers gold and Bitcoin. Index prices (S&amp;P 500, Sensex, …) need an FCS stock plan, from about $25 a month.</div>)}
    </Modal>
  )
}
