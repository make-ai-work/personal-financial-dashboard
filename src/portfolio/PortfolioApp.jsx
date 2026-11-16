import { useEffect, useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import StatusBar from '../finance/StatusBar.jsx'
import { useFx } from '../finance/useFx.js'
import Overview from './Overview.jsx'
import CountryPortfolios from './CountryPortfolios.jsx'
import PortfolioSettings from './PortfolioSettings.jsx'
import { HoldingModal, PortfolioModal, PricesModal, TargetsModal } from './PortfolioForms.jsx'
import { COUNTRIES } from '../lib/format.js'
import { addHolding, addPortfolio, countryOf, holdingsOf, updateHolding, updatePortfolio, updatePrices } from '../lib/portfolio.js'
import { addAccount } from '../lib/model.js'
import { useNav } from '../nav.jsx'

export default function PortfolioApp() {
  const { data, update } = useVault()
  const { focus, clearFocus } = useNav()
  const codes = data.settings.portfolioCountries
  const fx = useFx(codes, data.rates)
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null)
  const active = [...codes, 'overview', 'settings'].includes(tab) ? tab : 'overview'

  useEffect(() => {
    if (focus?.portfolioId) {
      const p = data.portfolios.find((x) => x.id === focus.portfolioId)
      if (p) setTab(countryOf(data, p))
      clearFocus()
    }
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  const linkedIds = new Set(data.portfolios.map((p) => p.accountId))
  const done = () => setModal(null)

  return (
    <div className="wide-pad">
      <StatusBar />
      <nav className="subtabs">
        <button className={active === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
        {codes.map((c) => <button key={c} className={active === c ? 'on' : ''} onClick={() => setTab(c)}>{COUNTRIES[c].flag} {COUNTRIES[c].name}</button>)}
        <button onClick={() => setModal({ kind: 'portfolio', country: codes.includes(active) ? active : codes[0] })}>+ Add portfolio</button>
        <button className={active === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Settings</button>
      </nav>
      <div className="subpage">
        {active === 'overview' && <Overview fx={fx} onOpenCountry={setTab} />}
        {active === 'settings' && <PortfolioSettings />}
        {codes.includes(active) && (
          <CountryPortfolios code={active}
            onAddPortfolio={(country) => setModal({ kind: 'portfolio', country })}
            onAddHolding={(portfolio) => setModal({ kind: 'holding', portfolio })}
            onEditHolding={(portfolio, item) => setModal({ kind: 'holding', portfolio, item })}
            onPrices={(country) => setModal({ kind: 'prices', country })}
            onTargets={(portfolio) => setModal({ kind: 'targets', portfolio })} />
        )}
      </div>

      {modal?.kind === 'portfolio' && (
        <PortfolioModal countries={codes} defaultCountry={modal.country} accounts={data.accounts} linkedIds={linkedIds} parentLabel={data.settings.parentLabel} onClose={done}
          onSave={({ name, country, accountId, newAccount }) => {
            const id = crypto.randomUUID()
            update((d) => {
              let next = d
              let accId = accountId
              if (newAccount) {
                accId = crypto.randomUUID()
                next = addAccount(next, { id: accId, country, type: 'asset', name: newAccount.name, number: '', institution: newAccount.institution, owner: newAccount.owner, balance: 0, mix: null, maturityDate: '', maturityValue: null })
              }
              return addPortfolio(next, { id, name, accountId: accId })
            })
            done()
            setTab(country)
          }} />
      )}
      {modal?.kind === 'holding' && (
        <HoldingModal portfolio={modal.portfolio} country={countryOf(data, modal.portfolio)} initial={modal.item} onClose={done}
          onSave={(h) => { update((d) => (modal.item ? updateHolding(d, modal.item.id, h) : addHolding(d, h))); done() }} />
      )}
      {modal?.kind === 'prices' && (
        <PricesModal country={modal.country} portfolios={data.portfolios.filter((p) => countryOf(data, p) === modal.country)} holdingsOf={(id) => holdingsOf(data, id)} onClose={done}
          onSave={(date, entries) => {
            update((d) => d.portfolios.filter((p) => countryOf(d, p) === modal.country).reduce((acc, p) => updatePrices(acc, p.id, date, entries), d))
            done()
          }} />
      )}
      {modal?.kind === 'targets' && (
        <TargetsModal portfolio={modal.portfolio} onClose={done} onSave={(targets) => { update((d) => updatePortfolio(d, modal.portfolio.id, { targets })); done() }} />
      )}
    </div>
  )
}
