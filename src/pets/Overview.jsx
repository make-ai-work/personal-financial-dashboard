import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import StatusChip from './StatusChip.jsx'
import { ageText, dueItems, nextItemForPet, speciesLabel, spending } from '../lib/pets.js'
import { money, todayISO } from '../lib/format.js'

const WINDOW_DAYS = 60

export default function Overview({ onOpenPet, onAddPet }) {
  const { data } = useVault()
  const today = todayISO()
  const { petSoonDays: soon, petCurrency: cur } = data.settings
  const [filter, setFilter] = useState('all')
  const all = dueItems(data, today, soon)
  const shown = all.filter((i) => (filter === 'all' || i.petId === filter) && i.days <= Math.max(WINDOW_DAYS, soon))
  const year = Number(today.slice(0, 4))
  const spend = spending(data, year)
  const petById = new Map(data.pets.map((p) => [p.id, p]))
  const rows = data.pets.map((p) => ({ pet: p, ...(spend.get(p.id) || { count: 0, total: 0 }) }))
  const total = rows.reduce((s, r) => ({ count: s.count + r.count, total: s.total + r.total }), { count: 0, total: 0 })

  return (
    <>
      <div className="pets">
        {data.pets.map((p) => {
          const next = nextItemForPet(all, p.id)
          return (
            <button key={p.id} className="pet" onClick={() => onOpenPet(p.id)}>
              <div className="top">
                <div className="av">{p.icon}</div>
                <div><h3>{p.name}</h3><small>{[p.breed || speciesLabel(p.species), ageText(p.birthDate, today)].filter(Boolean).join(' · ')}</small></div>
              </div>
              <div className="next">
                <span>{next ? next.label : 'Nothing scheduled'}</span>
                {next ? <StatusChip status={next.status} text={next.text} /> : <StatusChip status="ok" text="all clear" />}
              </div>
            </button>
          )
        })}
        <button className="pet add-card" onClick={onAddPet}>+ Add a pet</button>
      </div>

      {data.pets.length === 0 && <div className="panel"><div className="empty">No pets yet. Add your first pet to start tracking vaccinations, visits, medication and weight.</div></div>}

      {data.pets.length > 0 && (
        <>
          <div className="panel">
            <div className="p-head">
              <div className="title">Upcoming &amp; overdue <span className="sub">next {Math.max(WINDOW_DAYS, soon)} days</span></div>
              <div className="seg" role="group" aria-label="Pet filter">
                <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All pets</button>
                {data.pets.map((p) => <button key={p.id} className={filter === p.id ? 'on' : ''} onClick={() => setFilter(p.id)}>{p.name}</button>)}
              </div>
            </div>
            {shown.length === 0 && <div className="empty">Nothing due. Add vaccinations or medication with a repeat to see reminders here.</div>}
            {shown.map((i) => (
              <div className="rem" key={i.id}>
                <span>{petById.get(i.petId).icon} {petById.get(i.petId).name} · {i.label}<small>{i.sub}</small></span>
                <StatusChip status={i.status} text={i.text} />
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="p-head"><div className="title">Spending <span className="sub">vaccinations, visits &amp; medication with a cost, {year}</span></div></div>
            <div className="tblw"><table className="t-left"><thead><tr><th>Pet</th><th className="r">Entries</th><th className="r">Total</th></tr></thead><tbody>
              {rows.map((r) => <tr key={r.pet.id}><td>{r.pet.icon} {r.pet.name}</td><td className="r">{r.count}</td><td className="r">{money(cur, r.total)}</td></tr>)}
              <tr className="total"><td>All pets</td><td className="r">{total.count}</td><td className="r">{money(cur, total.total)}</td></tr>
            </tbody></table></div>
          </div>
        </>
      )}
    </>
  )
}
