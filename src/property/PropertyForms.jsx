import { useState } from 'react'
import { Modal, OwnerPicker } from '../finance/ui.jsx'
import { COUNTRIES, parseAmount, todayISO, curSym } from '../lib/format.js'
import { COVERAGE_LINES, PREMIUM_FREQUENCIES, PROPERTY_TYPES, VALUE_SOURCES, emptyInsurance } from '../lib/property.js'
import { uid } from '../lib/model.js'
import NumInput from '../finance/NumInput.jsx'

const s = (v) => (v == null ? '' : String(v))
const num = (v) => (v === '' || v == null ? null : parseAmount(v))
const bad = (n, min = 0) => n != null && (Number.isNaN(n) || n < min)

export function PropertyModal({ initial, countries, parentLabel, onSave, onClose }) {
  const [f, setF] = useState({
    name: initial?.name || '', country: initial?.country || countries[0], address: initial?.address || '', type: initial?.type || 'primary',
    owner: initial?.owner || 'mine', purchaseDate: initial?.purchaseDate || '', purchasePrice: s(initial?.purchasePrice),
    bedrooms: s(initial?.bedrooms), bathrooms: s(initial?.bathrooms), sizeSqft: s(initial?.sizeSqft),
    taxYear: s(initial?.taxYear), insuranceYear: s(initial?.insuranceYear), hoaMonth: s(initial?.hoaMonth), taxDue: initial?.taxDue || '',
    notes: initial?.notes || '', currentValue: '',
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const cur = COUNTRIES[f.country].currency
  const sym = curSym(cur)
  const options = countries.includes(f.country) ? countries : [f.country, ...countries]

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Name is required.')
    const nums = { purchasePrice: num(f.purchasePrice), bedrooms: num(f.bedrooms), bathrooms: num(f.bathrooms), sizeSqft: num(f.sizeSqft), taxYear: num(f.taxYear), insuranceYear: num(f.insuranceYear), hoaMonth: num(f.hoaMonth), currentValue: num(f.currentValue) }
    if (Object.values(nums).some((n) => bad(n))) return setErr('Amounts and sizes must be numbers (0 or more).')
    if (f.purchaseDate && f.purchaseDate > todayISO()) return setErr('Purchase date cannot be in the future.')
    const { currentValue: _currentValue, ...rest } = f
    onSave({ ...rest, name: f.name.trim(), address: f.address.trim(), notes: f.notes.trim(), ...Object.fromEntries(Object.entries(nums).filter(([k]) => k !== 'currentValue')) }, nums.currentValue)
  }

  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : 'Add property'}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="prop-form" className="btn primary">Save property</button></>}
    >
      <form id="prop-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Name<input autoFocus value={f.name} onChange={set('name')} placeholder="e.g. Maple Street home" /></label>
          <label className="field">Country
            <select value={f.country} onChange={set('country')}>{options.map((c) => <option key={c} value={c}>{COUNTRIES[c].flag} {COUNTRIES[c].name} ({curSym(COUNTRIES[c].currency)})</option>)}</select>
          </label>
        </div>
        <label className="field">Address<input value={f.address} onChange={set('address')} /></label>
        <div className="three">
          <label className="field">Type<select value={f.type} onChange={set('type')}>{PROPERTY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
          <label className="field">Purchase date<input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} /></label>
          <label className="field">Purchase price ({sym})<NumInput value={f.purchasePrice} onChange={set('purchasePrice')} /></label>
        </div>
        <div className="three">
          <label className="field">Bedrooms (optional)<input inputMode="numeric" value={f.bedrooms} onChange={set('bedrooms')} /></label>
          <label className="field">Bathrooms (optional)<NumInput value={f.bathrooms} onChange={set('bathrooms')} /></label>
          <label className="field">Size, sq ft (optional)<NumInput value={f.sizeSqft} onChange={set('sizeSqft')} /></label>
        </div>
        <div className="three">
          <label className="field">Property tax / year (optional)<NumInput value={f.taxYear} onChange={set('taxYear')} /></label>
          <label className="field">Insurance / year (optional)<NumInput value={f.insuranceYear} onChange={set('insuranceYear')} /></label>
          <label className="field">HOA / month (optional)<NumInput value={f.hoaMonth} onChange={set('hoaMonth')} /></label>
        </div>
        <label className="field">Next property tax due (optional)<input type="date" value={f.taxDue} onChange={set('taxDue')} /></label>
        <div className="field">Who owns it?<OwnerPicker value={f.owner} onChange={(owner) => setF({ ...f, owner })} parentLabel={parentLabel} /></div>
        {!initial && (
          <label className="field">Current value ({sym}) — optional, becomes the first entry in the value history
            <NumInput value={f.currentValue} onChange={set('currentValue')} />
          </label>
        )}
        <label className="field">Notes (optional)<textarea rows="2" value={f.notes} onChange={set('notes')} /></label>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

export function ValuationModal({ property, initial, onSave, onClose }) {
  const cur = COUNTRIES[property.country].currency
  const sym = curSym(cur)
  const [f, setF] = useState({ date: initial?.date || todayISO(), value: s(initial?.value), source: initial?.source || 'zillow', notes: initial?.notes || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    const value = parseAmount(f.value)
    if (!f.date) return setErr('Date is required.')
    if (f.value === '' || Number.isNaN(value) || value <= 0) return setErr('Enter the value as a number greater than 0.')
    onSave({ propertyId: property.id, date: f.date, value, source: f.source, notes: f.notes.trim() })
  }
  return (
    <Modal
      title={`${initial ? 'Edit' : 'Add'} valuation · ${property.name}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="val-form" className="btn primary">Save valuation</button></>}
    >
      <form id="val-form" onSubmit={submit}>
        {property.country === 'us' && (
          <p className="note">Open the property on{' '}
            <a href={zillowUrl(property.address || property.name)} target="_blank" rel="noopener noreferrer">Zillow ↗</a>{' '}
            in a new tab, then type or paste the number it shows here.</p>
        )}
        <div className="two">
          <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
          <label className="field">Value ({sym})<NumInput autoFocus value={f.value} onChange={set('value')} /></label>
        </div>
        <div className="two">
          <label className="field">Source<select value={f.source} onChange={set('source')}>{VALUE_SOURCES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
          <label className="field">Notes (optional)<input value={f.notes} onChange={set('notes')} /></label>
        </div>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

export const zillowUrl = (address) => `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/`

export function LoanModal({ property, initial, onSave, onClose }) {
  const cur = COUNTRIES[property.country].currency
  const sym = curSym(cur)
  const [f, setF] = useState({
    lender: initial?.lender || '', number: initial?.number || '', originalAmount: s(initial?.originalAmount), startDate: initial?.startDate || property.purchaseDate || '',
    termYears: s(initial?.termYears), rate: s(initial?.rate), rateType: initial?.rateType || 'fixed', monthlyPayment: s(initial?.monthlyPayment),
    escrow: s(initial?.escrow), paymentDay: s(initial?.paymentDay), notes: initial?.notes || '',
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    if (!f.lender.trim()) return setErr('Lender is required.')
    const n = { originalAmount: num(f.originalAmount), termYears: num(f.termYears), rate: num(f.rate), monthlyPayment: num(f.monthlyPayment), escrow: num(f.escrow), paymentDay: num(f.paymentDay) }
    if (Object.values(n).some((x) => bad(x))) return setErr('Amounts, term, rate and payment day must be numbers (0 or more).')
    if (n.paymentDay != null && (n.paymentDay < 1 || n.paymentDay > 31 || !Number.isInteger(n.paymentDay))) return setErr('Payment day must be a whole number from 1 to 31.')
    if (n.rate != null && n.rate > 60) return setErr('Interest rate looks too high. Enter it as a percentage, e.g. 3.25.')
    onSave({ propertyId: property.id, lender: f.lender.trim(), number: f.number.trim(), startDate: f.startDate, rateType: f.rateType, notes: f.notes.trim(), ...n })
  }
  return (
    <Modal
      title={`${initial ? 'Edit' : 'Add'} mortgage · ${property.name}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="loan-form" className="btn primary">Save loan</button></>}
    >
      <form id="loan-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Lender<input autoFocus value={f.lender} onChange={set('lender')} /></label>
          <label className="field">Loan number (optional)<input className="mono" autoComplete="off" value={f.number} onChange={set('number')} /></label>
        </div>
        <div className="three">
          <label className="field">Original loan ({sym})<NumInput value={f.originalAmount} onChange={set('originalAmount')} /></label>
          <label className="field">Start date<input type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label className="field">Term (years)<NumInput value={f.termYears} onChange={set('termYears')} /></label>
        </div>
        <div className="three">
          <label className="field">Interest rate (%)<NumInput value={f.rate} onChange={set('rate')} /></label>
          <label className="field">Rate type<select value={f.rateType} onChange={set('rateType')}><option value="fixed">Fixed</option><option value="adjustable">Adjustable</option></select></label>
          <label className="field">Payment day of month (optional)<input inputMode="numeric" value={f.paymentDay} onChange={set('paymentDay')} /></label>
        </div>
        <div className="two">
          <label className="field">Monthly payment ({sym})<NumInput value={f.monthlyPayment} onChange={set('monthlyPayment')} /></label>
          <label className="field">…of which escrow (optional)<NumInput value={f.escrow} onChange={set('escrow')} /></label>
        </div>
        <p className="note">Rate, term and start date let the app estimate your balance for months before your first recorded update.</p>
        <label className="field">Notes (optional)<input value={f.notes} onChange={set('notes')} /></label>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

export function LoanUpdateModal({ property, loan, initial, onSave, onClose }) {
  const cur = COUNTRIES[property.country].currency
  const sym = curSym(cur)
  const [f, setF] = useState({ date: initial?.date || todayISO(), balance: s(initial?.balance), principal: s(initial?.principal), interest: s(initial?.interest), escrow: s(initial?.escrow), notes: initial?.notes || '' })
  const [alsoEdit, setAlsoEdit] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    const balance = parseAmount(f.balance)
    const n = { principal: num(f.principal), interest: num(f.interest), escrow: num(f.escrow) }
    if (!f.date) return setErr('Date is required.')
    if (f.balance === '' || Number.isNaN(balance) || balance < 0) return setErr('Enter the balance after this payment as a number (0 or more).')
    if (Object.values(n).some((x) => bad(x))) return setErr('Principal, interest and escrow must be numbers (0 or more).')
    onSave({ loanId: loan.id, date: f.date, balance, notes: f.notes.trim(), ...n }, alsoEdit)
  }
  return (
    <Modal
      title={`${initial ? 'Edit' : 'Record'} mortgage update · ${loan.lender}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="upd-form" className="btn primary">Save update</button></>}
    >
      <form id="upd-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Date<input type="date" value={f.date} onChange={set('date')} /></label>
          <label className="field">Balance after this payment ({sym})<NumInput autoFocus value={f.balance} onChange={set('balance')} /></label>
        </div>
        <div className="three">
          <label className="field">Principal paid (optional)<NumInput value={f.principal} onChange={set('principal')} /></label>
          <label className="field">Interest paid (optional)<NumInput value={f.interest} onChange={set('interest')} /></label>
          <label className="field">Escrow paid (optional)<NumInput value={f.escrow} onChange={set('escrow')} /></label>
        </div>
        <label className="field">Notes (optional)<input value={f.notes} onChange={set('notes')} placeholder="e.g. extra payment, rate change" /></label>
        {!initial && <label className="check"><input type="checkbox" checked={alsoEdit} onChange={(e) => setAlsoEdit(e.target.checked)} /> The interest rate or monthly payment changed — update the loan details too</label>}
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

// Home insurance for one property: who insures it, the premium, the renewal date and the coverage limits.
export function InsuranceModal({ property, initial, onSave, onRemove, onClose }) {
  const sym = curSym(COUNTRIES[property.country].currency)
  const base = initial || emptyInsurance()
  const [f, setF] = useState({
    insurer: base.insurer || '', number: base.number || '', premium: s(base.premium), frequency: base.frequency || 'year', renewal: base.renewal || '',
    deductible: s(base.deductible), rebuildCost: s(base.rebuildCost), notes: base.notes || '',
    limits: Object.fromEntries(COVERAGE_LINES.map((l) => [l.key, s(base.limits?.[l.key])])),
    extras: (base.extras || []).map((x) => ({ id: x.id || uid(), name: x.name || '', limit: s(x.limit) })),
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    const n = (v) => num(v)
    const all = [n(f.premium), n(f.deductible), n(f.rebuildCost), ...COVERAGE_LINES.map((l) => n(f.limits[l.key])), ...f.extras.map((x) => n(x.limit))]
    if (all.some((v) => bad(v))) return setErr('Amounts must be numbers (0 or more).')
    if (!f.insurer.trim() && all.every((v) => v == null) && !f.renewal) return setErr('Enter at least the insurer, a limit or a renewal date.')
    onSave({
      insurer: f.insurer.trim(), number: f.number.trim(), premium: n(f.premium), frequency: f.frequency, renewal: f.renewal, deductible: n(f.deductible), rebuildCost: n(f.rebuildCost),
      limits: Object.fromEntries(COVERAGE_LINES.map((l) => [l.key, n(f.limits[l.key])])),
      extras: f.extras.filter((x) => x.name.trim() || x.limit !== '').map((x) => ({ id: x.id, name: x.name.trim(), limit: n(x.limit) })), notes: f.notes.trim(),
    })
  }
  return (
    <Modal
      title={`Home insurance · ${property.name}`}
      onClose={onClose}
      footer={<>{initial && <button type="button" className="btn danger-btn" onClick={onRemove}>Remove</button>}<button type="button" className="btn" onClick={onClose}>Cancel</button><button form="ins-form" className="btn primary">Save home insurance</button></>}
    >
      <form id="ins-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Insurer<input autoFocus value={f.insurer} onChange={set('insurer')} placeholder="e.g. State Farm" /></label>
          <label className="field">Policy number (optional)<input value={f.number} onChange={set('number')} /></label>
        </div>
        <div className="three">
          <label className="field">Premium ({sym})<NumInput value={f.premium} onChange={set('premium')} /></label>
          <label className="field">Paid<select value={f.frequency} onChange={set('frequency')}>{PREMIUM_FREQUENCIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
          <label className="field">Renewal date<input type="date" value={f.renewal} onChange={set('renewal')} /></label>
        </div>
        <div className="two">
          <label className="field">Deductible ({sym})<NumInput value={f.deductible} onChange={set('deductible')} /></label>
          <label className="field">Rebuild cost, if you know it ({sym})<NumInput value={f.rebuildCost} onChange={set('rebuildCost')} /></label>
        </div>
        <div className="field">Coverage limits ({sym})
          <div className="two">
            {COVERAGE_LINES.map((l) => (
              <label key={l.key} className="field sub-field">{l.label}
                <NumInput value={f.limits[l.key]} aria-label={`Limit: ${l.label}`} onChange={(e) => setF({ ...f, limits: { ...f.limits, [l.key]: e.target.value } })} />
              </label>
            ))}
          </div>
        </div>
        <div className="field">Other cover (flood, earthquake, umbrella…)
          {f.extras.map((x, i) => (
            <div className="two" key={x.id}>
              <input value={x.name} aria-label={`Other cover ${i + 1} name`} placeholder="Name" onChange={(e) => setF({ ...f, extras: f.extras.map((y) => (y.id === x.id ? { ...y, name: e.target.value } : y)) })} />
              <span className="two-in"><NumInput value={x.limit} aria-label={`Other cover ${i + 1} limit`} placeholder="Limit" onChange={(e) => setF({ ...f, extras: f.extras.map((y) => (y.id === x.id ? { ...y, limit: e.target.value } : y)) })} />
                <button type="button" className="x" aria-label={`Remove other cover ${i + 1}`} onClick={() => setF({ ...f, extras: f.extras.filter((y) => y.id !== x.id) })}>✕</button></span>
            </div>
          ))}
          <div><button type="button" className="btn sm" onClick={() => setF({ ...f, extras: [...f.extras, { id: uid(), name: '', limit: '' }] })}>+ Add other cover</button></div>
        </div>
        <label className="field">Notes<input value={f.notes} onChange={set('notes')} /></label>
        {err && <div className="err" role="alert">{err}</div>}
      </form>
    </Modal>
  )
}
