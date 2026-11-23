import { useVault } from '../finance/VaultContext.jsx'
import Allocation from './Allocation.jsx'
import Rebalance from './Rebalance.jsx'
import PortfolioPanel from './PortfolioPanel.jsx'
import { COUNTRIES, money, todayISO, curSym } from '../lib/format.js'
import { concentration, countryOf, holdingsOf, portfolioTotals, staleHoldings } from '../lib/portfolio.js'

const VIEWS = [['class', 'Asset class'], ['sector', 'Sector'], ['geo', 'Geography'], ['portfolio', 'Portfolio']]

export default function CountryPortfolios({ code, onAddPortfolio, onAddHolding, onEditHolding, onPrices, onTargets }) {
  const { data } = useVault()
  const c = COUNTRIES[code]
  const today = todayISO()
  const { concentrationLimit: limit, rebalanceTol: tol, priceStaleDays: staleDays } = data.settings
  const pfs = data.portfolios.filter((p) => countryOf(data, p) === code)
  const t = portfolioTotals(data, pfs)
  const holdings = pfs.flatMap((p) => holdingsOf(data, p.id))
  const names = Object.fromEntries(pfs.map((p) => [p.id, p.name]))
  const fmt = (n) => money(code, n)
  const conc = concentration(data, pfs, limit)
  const stale = staleHoldings(data, pfs, today, staleDays)

  return (
    <div className="split7030">
      <div className="sp-l">
      <div className="panel">
        <div className="p-head">
          <div className="title">{c.flag} {c.name} <span className="cur">{curSym(c.currency)}</span></div>
          <div className="row-actions">
            <button className="btn" onClick={() => onPrices(code)} disabled={!holdings.length}>Update prices</button>
            <button className="btn primary" onClick={() => onAddPortfolio(code)}>+ Add portfolio</button>
          </div>
        </div>
        <div className="kpis"><div className="kpi"><small>Portfolio value</small><b>{fmt(t.value)}</b></div><div className="kpi"><small>Holdings</small><b>{t.holdings}</b></div><div className="kpi"><small>Portfolios</small><b>{t.count}</b></div></div>
      </div>

      {pfs.length === 0 && (
        <div className="panel"><div className="empty">No portfolios in {c.flag} {c.name} yet. A portfolio is linked to one of your Assets asset accounts; its holdings then drive that account's balance and asset mix.</div></div>
      )}
      {pfs.map((p) => (
        <PortfolioPanel key={p.id} portfolio={p} country={code} account={data.accounts.find((a) => a.id === p.accountId)} staleDays={staleDays}
          onAddHolding={onAddHolding} onEditHolding={onEditHolding} onTargets={onTargets} />
      ))}
      </div>
      <aside className="sp-r">
      {holdings.length > 0 && (
        <Allocation holdings={holdings} names={names} format={fmt} views={VIEWS} title="Allocation" sub={`all ${c.flag} ${c.name} portfolios`}>
          {conc.length > 0
            ? <div className="warnrow">⚠ Above your {limit}% single-stock limit: {conc.map((x) => `${x.holding.name} is ${x.share.toFixed(1)}% of ${x.portfolio.name}`).join(' · ')}</div>
            : <div className="okrow">No single stock is above your {limit}% limit.</div>}
          {stale.length > 0 && <div className="warnrow">🕒 Old prices: {stale.map((x) => `${x.holding.name} (${x.age} days)`).join(' · ')}</div>}
        </Allocation>
      )}
      {pfs.length > 0 && <Rebalance data={data} portfolios={pfs} tolerance={tol} format={fmt} onEditTargets={onTargets} />}
      </aside>
    </div>
  )
}
