import { useEffect, useMemo, useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { homePrefs } from '../lib/homeprefs.js'
import { CountriesCard, NetWorthCard, useNow } from './Cards.jsx'
import Ticker from './Ticker.jsx'
import HomeSettings from './HomeSettings.jsx'

// The landing page: the market ticker, then your net worth (left, half the screen) and one compact block per country
// (right): city, time, market status and weather. It works before the data file is unlocked: the country list is
// remembered from the last time it was, and the net worth card asks you to unlock.
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
        <div className="grid2">
          <NetWorthCard data={vault?.data || null} parentLabel={vault?.data?.settings?.parentLabel || 'Parent'} />
          <CountriesCard countries={countries} now={now} version={version} onSettings={() => setOpen(true)} />
        </div>
      </div>
      {open && <HomeSettings countries={countries} onClose={() => setOpen(false)} onSaved={() => setVersion((v) => v + 1)} />}
    </div>
  )
}
