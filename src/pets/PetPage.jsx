import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import Chart from '../finance/Chart.jsx'
import StatusChip from './StatusChip.jsx'
import { PetModal, RecordModal } from './PetForms.jsx'
import { fmtDate, money, todayISO } from '../lib/format.js'
import {
  ageText, dueStatus, latestVaccines, latestWeight, markMedicationDone, recordsOf, removePet, removeRecord,
  repeatLabel, speciesLabel, toUnit, updatePet, updateRecord, weightSeries,
} from '../lib/pets.js'

const SEX = { male: 'Male', female: 'Female', unknown: '' }
const sexText = (p) => [SEX[p.sex], p.neutered === 'yes' ? (p.sex === 'female' ? 'spayed' : 'neutered') : ''].filter(Boolean).join(' · ') || '—'
const Cell = ({ label, children, sub }) => (
  <div><small>{label}</small><b>{children || '—'}</b>{sub && <><br /><span className="sub">{sub}</span></>}</div>
)

export default function PetPage({ pet, onDeleted, openRecord }) {
  const { data, update } = useVault()
  const today = todayISO()
  const { petSoonDays: soon, petCurrency: cur, weightUnit: unit } = data.settings
  const [editing, setEditing] = useState(null) // 'pet' | record being edited
  const fmt = (n) => (n != null ? money(cur, n) : '—')
  const lw = latestWeight(data, pet.id)
  const series = weightSeries(data, pet.id, unit)
  const vaccines = latestVaccines(data, pet.id)
  const meds = recordsOf(data, pet.id, 'medication')
  const visits = recordsOf(data, pet.id, 'visit')
  const weighIns = recordsOf(data, pet.id, 'weight')

  const delRecord = (r, label) => window.confirm(`Delete ${label}?`) && update((d) => removeRecord(d, r.id))
  const delPet = () => {
    if (!window.confirm(`Delete ${pet.name} and all of ${pet.name}'s records? This cannot be undone.`)) return
    update((d) => removePet(d, pet.id))
    onDeleted()
  }
  const Edit = ({ r, label }) => (
    <td className="act">
      <button className="link" onClick={() => setEditing(r)}>Edit</button>
      <button className="link danger" onClick={() => delRecord(r, label)}>Delete</button>
    </td>
  )

  return (
    <>
      <div className="panel">
        <div className="p-head">
          <div className="title"><span className="av sm">{pet.icon}</span> {pet.name} <span className="cur">{speciesLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}</span></div>
          <div className="row-actions">
            <button className="btn" onClick={() => setEditing('pet')}>Edit profile</button>
            <button className="btn danger-btn" onClick={delPet}>Delete pet</button>
          </div>
        </div>
        <div className="prof">
          <Cell label="Age" sub={pet.birthDate ? `born ${fmtDate(pet.birthDate)}` : ''}>{ageText(pet.birthDate, today)}</Cell>
          <Cell label="Sex">{sexText(pet)}</Cell>
          <Cell label="Weight" sub={lw ? `weighed ${fmtDate(lw.date)}` : ''}>{lw ? `${Math.round(toUnit(lw.weightKg, unit) * 10) / 10} ${unit}` : ''}</Cell>
          <Cell label="Microchip">{pet.microchip && <span className="mono">{pet.microchip}</span>}</Cell>
          <Cell label="Vet" sub={pet.vetPhone}>{pet.vet}</Cell>
          <Cell label="Pet insurance" sub={pet.insuranceRenews ? `renews ${fmtDate(pet.insuranceRenews)}` : ''}>{pet.insurance}</Cell>
          <Cell label="Food">{pet.food}</Cell>
          <Cell label="Allergies">{pet.allergies}</Cell>
        </div>
        {pet.notes && <div className="pad sub" style={{ borderTop: '1px solid var(--line)' }}>{pet.notes}</div>}
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">Vaccinations</div><button className="btn" onClick={() => openRecord(pet.id, 'vaccine')}>+ Add</button></div>
        <div className="tblw"><table className="t-left"><thead><tr><th>Vaccine</th><th>Given</th><th>Next due</th><th>Status</th><th /></tr></thead><tbody>
          {vaccines.length === 0 && <tr><td colSpan="5" className="none">No vaccinations recorded.</td></tr>}
          {vaccines.map(({ record: r, doses }) => {
            const st = dueStatus(r.nextDue, today, soon)
            return (
              <tr key={r.id}>
                <td><b>{r.name}</b> {doses > 1 && <span className="sub">×{doses} doses</span>}</td><td>{fmtDate(r.date)}</td><td>{fmtDate(r.nextDue)}</td>
                <td>{st ? <StatusChip status={st.status} text={st.status === 'ok' ? 'up to date' : st.text} /> : <StatusChip status="none" text="no repeat" />}</td>
                <Edit r={r} label={r.name} />
              </tr>
            )
          })}
        </tbody></table></div>
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">Medications &amp; preventives</div><button className="btn" onClick={() => openRecord(pet.id, 'medication')}>+ Add</button></div>
        <div className="tblw"><table className="t-left"><thead><tr><th>Name</th><th>Dose</th><th>Repeats</th><th>Next</th><th /></tr></thead><tbody>
          {meds.length === 0 && <tr><td colSpan="5" className="none">No medications recorded.</td></tr>}
          {meds.map((r) => {
            const daily = r.repeat === 'daily'
            const st = daily ? (r.endDate ? dueStatus(r.endDate, today, soon) : null) : dueStatus(r.nextDue, today, soon)
            const finished = daily ? !!r.endDate && r.endDate < today : !r.nextDue
            return (
              <tr key={r.id}>
                <td><b>{r.name}</b></td><td>{r.dose || '—'}</td>
                <td>{daily ? `Daily${r.endDate ? ` until ${fmtDate(r.endDate)}` : ''}` : repeatLabel('medication', r.repeat) || 'One-off'}</td>
                <td>{finished ? <StatusChip status="none" text="finished" /> : st ? <StatusChip status={st.status} text={daily && st.status !== 'overdue' ? `ends ${fmtDate(r.endDate)}` : st.text} /> : '—'}</td>
                <td className="act">
                  {!daily && r.nextDue && <button className="link" onClick={() => update((d) => markMedicationDone(d, r.id, today))}>Done</button>}
                  <button className="link" onClick={() => setEditing(r)}>Edit</button>
                  <button className="link danger" onClick={() => delRecord(r, r.name)}>Delete</button>
                </td>
              </tr>
            )
          })}
        </tbody></table></div>
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">Vet visits</div><button className="btn" onClick={() => openRecord(pet.id, 'visit')}>+ Add visit</button></div>
        <div className="tblw"><table className="t-left"><thead><tr><th>Date</th><th>Reason</th><th>Vet</th><th>Notes</th><th className="r">Cost</th><th /></tr></thead><tbody>
          {visits.length === 0 && <tr><td colSpan="6" className="none">No vet visits recorded.</td></tr>}
          {visits.map((r) => (
            <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{r.name}</td><td>{r.vet || '—'}</td><td className="wrap">{r.notes || '—'}</td><td className="r">{fmt(r.cost)}</td><Edit r={r} label={`the visit on ${fmtDate(r.date)}`} /></tr>
          ))}
        </tbody></table></div>
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">Weight</div><button className="btn" onClick={() => openRecord(pet.id, 'weight')}>+ Add weight</button></div>
        {series.length ? (
          <Chart points={series} lines={[{ key: 'weight', label: `Weight (${unit})`, color: 'var(--accent)' }]} format={(n) => `${n.toFixed(1)} ${unit}`}
            compact={(n) => `${+n.toFixed(1)} ${unit}`} label={`${pet.name} weight over time`} note="One point per month: the latest weigh-in that month." />
        ) : <div className="empty">No weigh-ins yet.</div>}
        {weighIns.length > 0 && (
          <details><summary>All weigh-ins ({weighIns.length})</summary>
            <div className="tblw"><table className="t-left"><tbody>
              {weighIns.map((r) => (
                <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{Math.round(toUnit(r.weightKg, unit) * 10) / 10} {unit}</td><Edit r={r} label={`the weigh-in on ${fmtDate(r.date)}`} /></tr>
              ))}
            </tbody></table></div>
          </details>
        )}
      </div>

      {editing === 'pet' && (
        <PetModal initial={pet} onClose={() => setEditing(null)} onSave={(patch) => { update((d) => updatePet(d, pet.id, patch)); setEditing(null) }} />
      )}
      {editing && editing !== 'pet' && (
        <RecordModal pets={data.pets} initial={editing} unit={unit} onClose={() => setEditing(null)}
          onSave={(rec) => { update((d) => updateRecord(d, editing.id, rec)); setEditing(null) }} />
      )}
    </>
  )
}
