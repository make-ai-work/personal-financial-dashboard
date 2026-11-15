import { useEffect, useMemo, useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { homePrefs } from '../lib/homeprefs.js'
import { MarketsCard, TimeCard, WeatherCard, useNow } from './Cards.jsx'
import Ticker from './Ticker.jsx'
import HomeSettings from './HomeSettings.jsx'

// The landing page: a market ticker, the time in each selected country, the weather, and which markets are open.
// It works before the data file is unlocked: the country list is remembered from the last time it was.
export default function Home() {
  const vault = useVault()
  const fromVault = vault?.data?.settings?.countries
  const key = fromVault ? fromVault.join(',') : ''
  const countries = useMemo(() => (fromVault && fromVault.length ? fromVault : homePrefs.countries()), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const now = useNow()

  useEffect(() => { if (fromVault && fromVault.length) homePrefs.setCountries(fromVault) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="home">
      <Ticker countries={countries} version={version} onSettings={() => setOpen(true)} />
      <div className="home-page">
        <div className="home-bar"><button className="btn sm" onClick={() => setOpen(true)}>⚙ Home settings</button></div>
        <div className="grid3">
          <TimeCard countries={countries} now={now} />
          <WeatherCard countries={countries} version={version} onSettings={() => setOpen(true)} />
          <MarketsCard countries={countries} now={now} />
        </div>
      </div>
      {open && <HomeSettings countries={countries} onClose={() => setOpen(false)} onSaved={() => setVersion((v) => v + 1)} />}
    </div>
  )
}
