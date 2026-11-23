import { useVault } from '../finance/VaultContext.jsx'

export default function PropertySettings() {
  const { data, update } = useVault()
  return (
    <div className="panel" id="set-property">
      <div className="p-head"><div className="title">Property</div></div>
      <div className="col" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="row"><span>Reminders: “due soon” window<small>Mortgage payments and property tax show as “due in N days” inside this window</small></span>
          <select className="pw sm" aria-label="Due soon window" value={data.settings.dueSoonDays} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, dueSoonDays: Number(e.target.value) } }))}>
            {[14, 30, 60].map((n) => <option key={n} value={n}>{n} days</option>)}
          </select></div>
      </div>
      <div className="pad sub" style={{ borderTop: '1px solid var(--line)' }}>
        Property uses the same list of countries as everything else (Settings → Countries).
      </div>
    </div>
  )
}
