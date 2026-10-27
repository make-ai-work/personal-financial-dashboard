import { useState } from 'react'
import { Modal, OwnerPicker } from '../finance/ui.jsx'
import { COUNTRIES, parseAmount, todayISO } from '../lib/format.js'
import { PROPERTY_TYPES, VALUE_SOURCES } from '../lib/property.js'

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
  const options = countries.includes(f.country) ? countries : [f.country, ...countries]

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Name is required.')
    const nums = { purchasePrice: num(f.purchasePrice), bedrooms: num(f.bedrooms), bathrooms: num(f.bathrooms), sizeSqft: num(f.sizeSqft), taxYear: num(f.taxYear), insuranceYear: num(f.insuranceYear), hoaMonth: num(f.hoaMonth), currentValue: num(f.currentValue) }
    if (Object.values(nums).some((n) => bad(n))) return setErr('Amounts and sizes must be numbers (0 or more).')
    if (f.purchaseDate && f.purchaseDate > todayISO()) return setErr('Purchase date cannot be in the future.')
    const { currentValue, ...rest } = f
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
            <select value={f.country} onChange={set('country')}>{options.map((c) => <option key={c} value={c}>{COUNTRIES[c].flag} {COUNTRIES[c].name} ({COUNTRIES[c].currency})</option>)}</select>
          </label>
        </div>
        <label className="field">Address<input value={f.address} onChange={set('address')} /></label>
        <div className="three">
          <label className="field">Type<select value={f.type} onChange={set('type')}>{PROPERTY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
          <label className="field">Purchase date<input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} /></label>
          <label className="field">Purchase price ({cur})<input inputMode="decimal" value={f.purchasePrice} onChange={set('purchasePrice')} /></label>
        </div>
        <div className="three">
          <label className="field">Bedrooms (optional)<input inputMode="numeric" value={f.bedrooms} onChange={set('bedrooms')} /></label>
          <label className="field">Bathrooms (optional)<input inputMode="decimal" value={f.bathrooms} onChange={set('bathrooms')} /></label>
          <label className="field">Size, sq ft (optional)<input inputMode="numeric" value={f.sizeSqft} onChange={set('sizeSqft')} /></label>
        </div>
        <div className="three">
          <label className="field">Property tax / year (optional)<input inputMode="decimal" value={f.taxYear} onChange={set('taxYear')} /></label>
          <label className="field">Insurance / year (optional)<input inputMode="decimal" value={f.insuranceYear} onChange={set('insuranceYear')} /></label>
          <label className="field">HOA / month (optional)<input inputMode="decimal" value={f.hoaMonth} onChange={set('hoaMonth')} /></label>
        </div>
        <label className="field">Next property tax due (optional)<input type="date" value={f.taxDue} onChange={set('taxDue')} /></label>
        <div className="field">Who owns it?<OwnerPicker value={f.owner} onChange={(owner) => setF({ ...f, owner })} parentLabel={parentLabel} /></div>
        {!initial && (
          <label className="field">Current value ({cur}) — optional, becomes the first entry in the value history
            <input inputMode="decimal" value={f.currentValue} onChange={set('currentValue')} />
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
          <label className="field">Value ({cur})<input autoFocus inputMode="decimal" value={f.value} onChange={set('value')} /></label>
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
          <label className="field">Original loan ({cur})<input inputMode="decimal" value={f.originalAmount} onChange={set('originalAmount')} /></label>
          <label className="field">Start date<input type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label className="field">Term (years)<input inputMode="decimal" value={f.termYears} onChange={set('termYears')} /></label>
        </div>
        <div className="three">
          <label className="field">Interest rate (%)<input inputMode="decimal" value={f.rate} onChange={set('rate')} /></label>
          <label className="field">Rate type<select value={f.rateType} onChange={set('rateType')}><option value="fixed">Fixed</option><option value="adjustable">Adjustable</option></select></label>
          <label className="field">Payment day of month (optional)<input inputMode="numeric" value={f.paymentDay} onChange={set('paymentDay')} /></label>
        </div>
        <div className="two">
          <label className="field">Monthly payment ({cur})<input inputMode="decimal" value={f.monthlyPayment} onChange={set('monthlyPayment')} /></label>
          <label className="field">…of which escrow (optional)<input inputMode="decimal" value={f.escrow} onChange={set('escrow')} /></label>
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
          <label className="field">Balance after this payment ({cur})<input autoFocus inputMode="decimal" value={f.balance} onChange={set('balance')} /></label>
        </div>
        <div className="three">
          <label className="field">Principal paid (optional)<input inputMode="decimal" value={f.principal} onChange={set('principal')} /></label>
          <label className="field">Interest paid (optional)<input inputMode="decimal" value={f.interest} onChange={set('interest')} /></label>
          <label className="field">Escrow paid (optional)<input inputMode="decimal" value={f.escrow} onChange={set('escrow')} /></label>
        </div>
        <label className="field">Notes (optional)<input value={f.notes} onChange={set('notes')} placeholder="e.g. extra payment, rate change" /></label>
        {!initial && <label className="check"><input type="checkbox" checked={alsoEdit} onChange={(e) => setAlsoEdit(e.target.checked)} /> The interest rate or monthly payment changed — update the loan details too</label>}
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}
