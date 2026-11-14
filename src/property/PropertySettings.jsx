import { useVault } from '../finance/VaultContext.jsx'
import CountriesPicker from '../finance/CountriesPicker.jsx'

export default function PropertySettings() {
  const { data, update } = useVault()
  return (
    <div className="panel mw">
      <div className="p-head"><div className="title">Property · Countries shown</div></div>
      <CountriesPicker
        value={data.settings.propertyCountries}
        onChange={(propertyCountries) => update((d) => ({ ...d, settings: { ...d.settings, propertyCountries } }))}
        noun={['property', 'properties']}
        describe={(code) => {
          const n = data.properties.filter((p) => p.country === code).length
          return { count: n, text: n ? `${n} propert${n === 1 ? 'y' : 'ies'}` : 'No properties yet' }
        }}
      />
      <div className="col" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="row"><span>Reminders: “due soon” window<small>Mortgage payments and property tax show as “due in N days” inside this window</small></span>
          <select className="pw sm" aria-label="Due soon window" value={data.settings.dueSoonDays} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, dueSoonDays: Number(e.target.value) } }))}>
            {[14, 30, 60].map((n) => <option key={n} value={n}>{n} days</option>)}
          </select></div>
      </div>
      <div className="pad sub" style={{ borderTop: '1px solid var(--line)' }}>
        Independent of Finance: you can own property in a country that has no Finance tab, and the other way round.
      </div>
    </div>
  )
}
