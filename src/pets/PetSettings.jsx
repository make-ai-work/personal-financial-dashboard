import { useVault } from '../finance/VaultContext.jsx'
import { COUNTRIES, COUNTRY_CODES } from '../lib/format.js'

export default function PetSettings() {
  const { data, update } = useVault()
  const s = data.settings
  const set = (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
  return (
    <div className="panel mw">
      <div className="p-head"><div className="title">Pets settings</div></div>
      <div className="col">
        <div className="row"><span>Remind me<small>“Due soon” shows this many days ahead</small></span>
          <select className="pw sm" aria-label="Remind me" value={s.petSoonDays} onChange={(e) => set({ petSoonDays: Number(e.target.value) })}>
            <option value={14}>14 days</option><option value={30}>30 days</option><option value={60}>60 days</option>
          </select></div>
        <div className="row"><span>Currency for costs<small>Used for vet visits and spending</small></span>
          <select className="pw sm" aria-label="Currency for costs" value={s.petCurrency} onChange={(e) => set({ petCurrency: e.target.value })}>
            {COUNTRY_CODES.map((k) => <option key={k} value={k}>{COUNTRIES[k].currency} {COUNTRIES[k].symbol.trim()}</option>)}
          </select></div>
        <div className="row"><span>Weight unit<small>Weights are stored in kg and shown in this unit</small></span>
          <span className="seg" role="group" aria-label="Weight unit">
            {['kg', 'lb'].map((u) => <button key={u} className={s.weightUnit === u ? 'on' : ''} onClick={() => set({ weightUnit: u })}>{u}</button>)}
          </span></div>
        <div className="warn">Pet records are saved with your other data in the same encrypted file, so one passphrase and one backup cover everything. Reminders show in this app only; nothing is emailed or pushed to your phone.</div>
      </div>
    </div>
  )
}
