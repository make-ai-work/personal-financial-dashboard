import { useState } from 'react'
import { COUNTRIES, parseAmount, curSym } from '../lib/format.js'
import { Modal, OwnerPicker } from './ui.jsx'

const str = (v) => (v == null ? '' : String(v))

export function AccountModal({ type, country, initial, locked, parentLabel, onSave, onClose }) {
  const cur = COUNTRIES[country].currency
  const sym = curSym(cur)
  const isAsset = type === 'asset'
  const [f, setF] = useState({
    name: initial?.name || '',
    number: initial?.number || '',
    institution: initial?.institution || '',
    balance: str(initial?.balance),
    owner: initial?.owner || 'mine',
    maturityDate: initial?.maturityDate || '',
    maturityValue: str(initial?.maturityValue),
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = (e) => {
    e.preventDefault()
    const balance = locked ? initial.balance : parseAmount(f.balance)
    if (!f.name.trim()) return setErr('Account name is required.')
    if (!locked && (Number.isNaN(balance) || f.balance === '')) return setErr('Enter the current balance as a number.')
    const mv = parseAmount(f.maturityValue)
    onSave({
      country, type,
      name: f.name.trim(), number: f.number.trim(), institution: f.institution.trim(), owner: f.owner, balance,
      mix: initial?.mix ?? null, // no longer typed here; a linked portfolio calculates it from its holdings
      maturityDate: isAsset ? f.maturityDate : '',
      maturityValue: isAsset && f.maturityValue !== '' && !Number.isNaN(mv) ? mv : null,
    })
  }

  return (
    <Modal
      title={`${initial ? 'Edit' : 'Add'} ${type} · ${COUNTRIES[country].flag} ${COUNTRIES[country].name}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="acct-form" className="btn primary">Save</button></>}
    >
      <form id="acct-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Account name<input autoFocus value={f.name} onChange={set('name')} /></label>
          <label className="field">Account number<input className="mono" autoComplete="off" value={f.number} onChange={set('number')} /></label>
        </div>
        <div className="two">
          <label className="field">{isAsset ? 'Bank / holding company' : 'Lender'}<input value={f.institution} onChange={set('institution')} /></label>
          <label className="field">Current balance ({sym})<input inputMode="decimal" value={f.balance} onChange={set('balance')} disabled={locked} />{locked && <small>Comes from the linked portfolio. Change holdings or prices in Portfolio.</small>}</label>
        </div>
        <div className="field">Who owns it?<OwnerPicker value={f.owner} onChange={(owner) => setF({ ...f, owner })} parentLabel={parentLabel} /></div>
        {isAsset && !locked && (
          <>
            <div className="two">
              <label className="field">Deposit maturity date (optional)<input type="date" value={f.maturityDate} onChange={set('maturityDate')} /></label>
              <label className="field">Value at maturity (optional, {sym})<input inputMode="decimal" value={f.maturityValue} onChange={set('maturityValue')} /></label>
            </div>
          </>
        )}
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}

export function PolicyModal({ country, initial, parentLabel, onSave, onClose }) {
  const cur = COUNTRIES[country].currency
  const sym = curSym(cur)
  const [f, setF] = useState({
    name: initial?.name || '', number: initial?.number || '', company: initial?.company || '',
    deathBenefit: str(initial?.deathBenefit), owner: initial?.owner || 'mine',
    maturityDate: initial?.maturityDate || '', maturityValue: str(initial?.maturityValue),
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = (e) => {
    e.preventDefault()
    const db = parseAmount(f.deathBenefit)
    const mv = parseAmount(f.maturityValue)
    if (!f.name.trim()) return setErr('Policy name is required.')
    if (f.deathBenefit === '' || Number.isNaN(db)) return setErr('Enter the death benefit as a number.')
    onSave({
      country, name: f.name.trim(), number: f.number.trim(), company: f.company.trim(), owner: f.owner,
      deathBenefit: db, maturityDate: f.maturityDate,
      maturityValue: f.maturityValue !== '' && !Number.isNaN(mv) ? mv : null,
    })
  }
  return (
    <Modal
      title={`${initial ? 'Edit' : 'Add'} insurance policy · ${COUNTRIES[country].flag} ${COUNTRIES[country].name}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="policy-form" className="btn primary">Save</button></>}
    >
      <form id="policy-form" onSubmit={submit}>
        <div className="two">
          <label className="field">Policy name<input autoFocus value={f.name} onChange={set('name')} /></label>
          <label className="field">Policy number<input className="mono" autoComplete="off" value={f.number} onChange={set('number')} /></label>
        </div>
        <div className="two">
          <label className="field">Policy company<input value={f.company} onChange={set('company')} /></label>
          <label className="field">Death benefit ({sym})<input inputMode="decimal" value={f.deathBenefit} onChange={set('deathBenefit')} /></label>
        </div>
        <div className="two">
          <label className="field">Maturity date (optional)<input type="date" value={f.maturityDate} onChange={set('maturityDate')} /></label>
          <label className="field">Value on maturity (optional, {sym})<input inputMode="decimal" placeholder="none for term policies" value={f.maturityValue} onChange={set('maturityValue')} /></label>
        </div>
        <div className="field">Whose policy?<OwnerPicker value={f.owner} onChange={(owner) => setF({ ...f, owner })} parentLabel={parentLabel} /></div>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}
