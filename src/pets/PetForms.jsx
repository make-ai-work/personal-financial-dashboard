import { useState } from 'react'
import { Modal } from '../finance/ui.jsx'
import { parseAmount, todayISO } from '../lib/format.js'
import { ICONS, MED_REPEATS, SPECIES, VACCINE_REPEATS, fromUnit, nextFrom, speciesIcon, toUnit } from '../lib/pets.js'

const s = (v) => (v == null ? '' : String(v))

export function PetModal({ initial, onSave, onClose }) {
  const [f, setF] = useState({
    name: initial?.name || '', species: initial?.species || 'dog', breed: initial?.breed || '', sex: initial?.sex || 'unknown',
    neutered: initial?.neutered || 'unknown', birthDate: initial?.birthDate || '', icon: initial?.icon || speciesIcon(initial?.species || 'dog'),
    microchip: initial?.microchip || '', vet: initial?.vet || '', vetPhone: initial?.vetPhone || '', insurance: initial?.insurance || '',
    insuranceRenews: initial?.insuranceRenews || '', food: initial?.food || '', allergies: initial?.allergies || '', notes: initial?.notes || '',
  })
  const [iconTouched, setIconTouched] = useState(!!initial)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Name is required.')
    if (f.birthDate && f.birthDate > todayISO()) return setErr('Birth date cannot be in the future.')
    onSave({ ...f, name: f.name.trim() })
  }
  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : 'Add pet'}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="pet-form" className="btn primary">Save pet</button></>}
    >
      <form id="pet-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Name<input autoFocus value={f.name} onChange={set('name')} /></label>
          <label className="field">Species
            <select value={f.species} onChange={(e) => setF({ ...f, species: e.target.value, icon: iconTouched ? f.icon : speciesIcon(e.target.value) })}>
              {SPECIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label className="field">Breed (optional)<input value={f.breed} onChange={set('breed')} /></label>
          <label className="field">Sex
            <select value={f.sex} onChange={set('sex')}><option value="male">Male</option><option value="female">Female</option><option value="unknown">Unknown</option></select>
          </label>
        </div>
        <div className="two">
          <label className="field">Birth date (or adoption date)<input type="date" value={f.birthDate} onChange={set('birthDate')} /></label>
          <label className="field">Icon
            <select value={f.icon} onChange={(e) => { setIconTouched(true); set('icon')(e) }}>{ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</select>
          </label>
        </div>
        <div className="two">
          <label className="field">Microchip number (optional)<input className="mono" value={f.microchip} onChange={set('microchip')} /></label>
          <label className="field">Neutered / spayed
            <select value={f.neutered} onChange={set('neutered')}><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Unknown</option></select>
          </label>
        </div>
        <div className="two">
          <label className="field">Vet name (optional)<input value={f.vet} onChange={set('vet')} /></label>
          <label className="field">Vet phone (optional)<input value={f.vetPhone} onChange={set('vetPhone')} /></label>
        </div>
        <div className="two">
          <label className="field">Pet insurance &amp; policy no. (optional)<input value={f.insurance} onChange={set('insurance')} /></label>
          <label className="field">Insurance renews on (optional)<input type="date" value={f.insuranceRenews} onChange={set('insuranceRenews')} /></label>
        </div>
        <div className="two">
          <label className="field">Food (optional)<input value={f.food} onChange={set('food')} /></label>
          <label className="field">Allergies (optional)<input value={f.allergies} onChange={set('allergies')} /></label>
        </div>
        <label className="field">Notes (optional)<textarea rows="2" value={f.notes} onChange={set('notes')} /></label>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

const TYPES = [['vaccine', 'Vaccination'], ['medication', 'Medication'], ['visit', 'Vet visit'], ['weight', 'Weight']]
const defaultRepeat = (type) => (type === 'vaccine' ? '1y' : type === 'medication' ? 'monthly' : '')

export function RecordModal({ pets, petId, type: startType, initial, unit, onSave, onClose }) {
  const [pid, setPid] = useState(initial?.petId || petId || pets[0]?.id)
  const [type, setType] = useState(initial?.type || startType || 'vaccine')
  const [f, setF] = useState({
    name: initial?.name || '', date: initial?.date || todayISO(), dose: initial?.dose || '', repeat: initial?.repeat || defaultRepeat(startType || 'vaccine'),
    nextDue: initial?.nextDue || '', endDate: initial?.endDate || '', vet: initial?.vet || '', cost: s(initial?.cost), notes: initial?.notes || '',
    weight: initial?.weightKg ? String(Math.round(toUnit(initial.weightKg, unit) * 10) / 10) : '',
  })
  const [nextTouched, setNextTouched] = useState(!!initial?.nextDue)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const pet = pets.find((p) => p.id === pid)

  const autoNext = nextFrom(f.date, f.repeat)
  const nextShown = nextTouched || type === 'visit' ? f.nextDue : autoNext
  const showNext = type === 'vaccine' ? f.repeat !== 'none' : type === 'medication' ? !['daily', 'none'].includes(f.repeat) : type === 'visit'

  const switchType = (t) => {
    setType(t)
    setF({ ...f, repeat: defaultRepeat(t), nextDue: '' })
    setNextTouched(false)
    setErr('')
  }

  const submit = (e) => {
    e.preventDefault()
    if (!f.date) return setErr('Date is required.')
    if (type === 'vaccine' && !f.name.trim()) return setErr('Enter the vaccine name.')
    if (type === 'medication' && !f.name.trim()) return setErr('Enter the medication name.')
    if (type === 'visit' && !f.name.trim()) return setErr('Enter the reason for the visit.')
    const cost = f.cost === '' ? null : parseAmount(f.cost)
    if (cost != null && (Number.isNaN(cost) || cost < 0)) return setErr('Cost must be a number.')
    const w = parseAmount(f.weight)
    if (type === 'weight' && (f.weight === '' || Number.isNaN(w) || w <= 0)) return setErr('Enter the weight as a number.')
    if (type === 'medication' && f.repeat === 'daily' && f.endDate && f.endDate < f.date) return setErr('The end date is before the start date.')
    onSave({
      petId: pid, type, date: f.date, name: type === 'weight' ? '' : f.name.trim(), dose: type === 'medication' ? f.dose.trim() : '',
      repeat: type === 'vaccine' || type === 'medication' ? f.repeat : '', nextDue: showNext ? nextShown : '',
      endDate: type === 'medication' && f.repeat === 'daily' ? f.endDate : '', lastGiven: initial?.lastGiven || '',
      vet: type === 'vaccine' || type === 'visit' ? f.vet.trim() : '', cost: type === 'weight' ? null : cost,
      notes: f.notes.trim(), weightKg: type === 'weight' ? fromUnit(w, unit) : null,
    })
  }

  const labels = {
    vaccine: ['Vaccine', 'Date given'], medication: ['Medication', 'Last given (or start date)'], visit: ['Reason for visit', 'Visit date'], weight: ['', 'Date weighed'],
  }[type]
  return (
    <Modal
      title={`${initial ? 'Edit' : 'Add'} record${pet ? ` · ${pet.icon} ${pet.name}` : ''}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="rec-form" className="btn primary">Save</button></>}
    >
      {!initial && (
        <div className="seg rec-types" role="group" aria-label="Record type">
          {TYPES.map(([k, l]) => <button type="button" key={k} className={type === k ? 'on' : ''} onClick={() => switchType(k)}>{l}</button>)}
        </div>
      )}
      <form id="rec-form" onSubmit={submit}>
        {pets.length > 1 && !initial && (
          <label className="field">Pet<select value={pid} onChange={(e) => setPid(e.target.value)}>{pets.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}</select></label>
        )}
        <div className="two">
          {type !== 'weight' && <label className="field">{labels[0]}<input autoFocus value={f.name} onChange={set('name')} /></label>}
          <label className="field">{labels[1]}<input type="date" value={f.date} onChange={set('date')} /></label>
          {type === 'weight' && <label className="field">Weight ({unit})<input autoFocus inputMode="decimal" value={f.weight} onChange={set('weight')} /></label>}
        </div>
        {type === 'medication' && (
          <div className="two">
            <label className="field">Dose<input value={f.dose} onChange={set('dose')} placeholder="e.g. 1 tablet" /></label>
            <label className="field">Repeats
              <select value={f.repeat} onChange={(e) => { setF({ ...f, repeat: e.target.value }); setNextTouched(false) }}>{MED_REPEATS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
            </label>
          </div>
        )}
        {type === 'vaccine' && (
          <label className="field">Repeats every
            <select value={f.repeat} onChange={(e) => { setF({ ...f, repeat: e.target.value }); setNextTouched(false) }}>{VACCINE_REPEATS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
          </label>
        )}
        {type === 'medication' && f.repeat === 'daily' && (
          <label className="field">Course ends on (optional)<input type="date" value={f.endDate} onChange={set('endDate')} /></label>
        )}
        {showNext && (
          <label className="field">{type === 'visit' ? 'Next check-up due (optional)' : 'Next due (filled in for you, editable)'}
            <input type="date" value={nextShown} onChange={(e) => { setNextTouched(true); setF({ ...f, nextDue: e.target.value }) }} />
          </label>
        )}
        {(type === 'vaccine' || type === 'visit') && (
          <div className="two">
            <label className="field">Vet / clinic (optional)<input value={f.vet} onChange={set('vet')} /></label>
            <label className="field">Cost (optional)<input inputMode="decimal" value={f.cost} onChange={set('cost')} /></label>
          </div>
        )}
        {type === 'medication' && <label className="field">Cost (optional)<input inputMode="decimal" value={f.cost} onChange={set('cost')} /></label>}
        <label className="field">Notes (optional)<textarea rows="2" value={f.notes} onChange={set('notes')} /></label>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}
