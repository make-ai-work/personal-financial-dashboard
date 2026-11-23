import { useEffect, useMemo, useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { useFx } from '../finance/useFx.js'
import { homePrefs } from '../lib/homeprefs.js'
import { CountriesCard, NetWorthCard, useNow } from './Cards.jsx'
import { Locked, PortfolioHeatTile, PropertiesTile, RetirementTile, SummaryTile } from './Tiles.jsx'
import Ticker from './Ticker.jsx'
import { useNav } from '../nav.jsx'

// The landing page: a 3 by 2 grid of tiles under the ticker (which also carries the exchange rates). Row 1: Total net worth, Retirement at a glance,
// Portfolio heatmap. Row 2: Summary (with who owns what as a heatmap), Markets / time / weather, Properties. On a phone the tiles stack in that order. It works before the data file is unlocked: the
// country list is remembered from the last time it was, and the money panels ask you to unlock.
export default function Home() {
  const vault = useVault()
  const data = vault?.data || null
  const fromVault = data?.settings?.countries
  const key = fromVault ? fromVault.join(',') : ''
  const countries = useMemo(() => (fromVault && fromVault.length ? fromVault : homePrefs.countries()), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const nav = useNav()
  const openSettings = () => nav.go('settings', { section: 'home' })
  const version = 0
  const [owner, setOwner] = useState(() => homePrefs.owner())
  const pickOwner = (o) => { setOwner(o); homePrefs.setOwner(o) }
  const fx = useFx(countries, data?.rates || [])
  const parentLabel = data?.settings?.parentLabel || 'Parent'
  const now = useNow()

  useEffect(() => { if (fromVault && fromVault.length) homePrefs.setCountries(fromVault) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="home">
      <Ticker countries={countries} version={version} onSettings={openSettings} fx={fx} />
      <div className="home-page">
        <div className="home-grid" data-testid="home-grid">
          <NetWorthCard data={data} owner={owner} onOwner={pickOwner} fx={fx} parentLabel={parentLabel} />
          {data ? <RetirementTile data={data} /> : <Locked title="Retirement at a glance" />}
          {data ? <PortfolioHeatTile data={data} fx={fx} /> : <Locked title="Portfolio heatmap" />}
          {data ? <SummaryTile data={data} owner={owner} fx={fx} parentLabel={parentLabel} /> : <Locked title="Summary" />}
          <CountriesCard countries={countries} now={now} version={version} onSettings={openSettings} />
          {data ? <PropertiesTile data={data} /> : <Locked title="Properties" />}
        </div>
      </div>
    </div>
  )
}
