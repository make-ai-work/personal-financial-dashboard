import { useVault } from '../finance/VaultContext.jsx'
import CountriesPicker from '../finance/CountriesPicker.jsx'
import { countryOf } from '../lib/portfolio.js'

export default function PortfolioSettings() {
  const { data, update } = useVault()
  const s = data.settings
  const set = (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
  const sel = (label, sub, key, opts, suffix) => (
    <div className="row"><span>{label}<small>{sub}</small></span>
      <select className="pw sm" aria-label={label} value={s[key]} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {opts.map((o) => <option key={o} value={o}>{o}{suffix}</option>)}
      </select></div>
  )
  return (
    <div className="panel mw">
      <div className="p-head"><div className="title">Portfolio · Countries shown</div></div>
      <CountriesPicker
        value={s.portfolioCountries}
        onChange={(portfolioCountries) => set({ portfolioCountries })}
        noun={['portfolio', 'portfolios']}
        describe={(code) => {
          const n = data.portfolios.filter((p) => countryOf(data, p) === code).length
          return { count: n, text: n ? `${n} portfolio${n === 1 ? '' : 's'}` : 'No portfolios yet' }
        }}
      />
      <div className="col" style={{ borderTop: '1px solid var(--line)' }}>
        {sel('Single-stock limit', 'Warn when one stock is more than this share of its portfolio. Funds and ETFs are exempt.', 'concentrationLimit', [5, 7, 10, 15, 20], '%')}
        {sel('Rebalance tolerance', 'Flag an asset class this many percentage points away from target', 'rebalanceTol', [2, 5, 10], ' pts')}
        {sel('Price is old after', 'Flag holdings whose price date is older than this', 'priceStaleDays', [14, 30, 60, 90], ' days')}
      </div>
    </div>
  )
}
