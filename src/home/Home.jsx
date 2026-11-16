import { useEffect, useMemo, useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { useFx } from '../finance/useFx.js'
import { homePrefs } from '../lib/homeprefs.js'
import { CountriesCard, NetWorthCard, useNow } from './Cards.jsx'
import { CombinedChartPanel, OwnershipPanel, SummaryPanel } from './HomeSummary.jsx'
import Ticker from './Ticker.jsx'
import HomeSettings from './HomeSettings.jsx'

// The landing page, 70 : 30. Left (70%): the Summary and who owns what side by side, then the combined history. Right (30%): total
// net worth and, for each country, its exchange city, time, market status and weather. It works before the data file is unlocked: the
// country list is remembered from the last time it was, and the money panels ask you to unlock.
export default function Home() {
  const vault = useVault()
  const data = vault?.data || null
  const fromVault = data?.settings?.countries
  const key = fromVault ? fromVault.join(',') : ''
  const countries = useMemo(() => (fromVault && fromVault.length ? fromVault : homePrefs.countries()), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [owner, setOwner] = useState(() => homePrefs.owner())
  const pickOwner = (o) => { setOwner(o); homePrefs.setOwner(o) }
  const fx = useFx(countries, data?.rates || [])
  const parentLabel = data?.settings?.parentLabel || 'Parent'
  const now = useNow()

  useEffect(() => { if (fromVault && fromVault.length) homePrefs.setCountries(fromVault) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="home">
      <Ticker countries={countries} version={version} onSettings={() => setOpen(true)} />
      <div className="home-page">
        <div className="home70">
          <div className="h-left">
            {data ? (
              <>
                <div className="h-top">
                  <SummaryPanel data={data} owner={owner} fx={fx} parentLabel={parentLabel} />
                  <OwnershipPanel data={data} fx={fx} parentLabel={parentLabel} />
                </div>
                <CombinedChartPanel data={data} owner={owner} onOwner={pickOwner} fx={fx} parentLabel={parentLabel} />
              </>
            ) : <div className="card"><h3 className="ch"><span>Summary</span></h3><p className="c">Unlock your data to see your summary, who owns what, and your net worth history.</p></div>}
          </div>
          <div className="h-right">
            <NetWorthCard data={data} owner={owner} onOwner={pickOwner} fx={fx} parentLabel={parentLabel} />
            <CountriesCard countries={countries} now={now} version={version} onSettings={() => setOpen(true)} />
          </div>
        </div>
      </div>
      {open && <HomeSettings countries={countries} onClose={() => setOpen(false)} onSaved={() => setVersion((v) => v + 1)} />}
    </div>
  )
}
