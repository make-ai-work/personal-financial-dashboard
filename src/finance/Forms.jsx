import { useState } from 'react'
import { COUNTRIES, MIX, parseAmount, curFlag } from '../lib/format.js'
import { Modal, OwnerPicker } from './ui.jsx'

const str = (v) => (v == null ? '' : String(v))

export function AccountModal({ type, country, initial, locked, parentLabel, onSave, onClose }) {
  const cur = COUNTRIES[country].currency
  const flag = curFlag(cur)
  const isAsset = type === 'asset'
  const [f, setF] = useState({
    name: initial?.name || '',
    number: initial?.number || '',
    institution: initial?.institution || '',
    balance: str(initial?.balance),
    owner: initial?.owner || 'mine',
    mix: (initial?.mix || [null, null, null, null]).map(str),
    maturityDate: initial?.maturityDate || '',
    maturityValue: str(initial?.maturityValue),
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const mixTotal = f.mix.reduce((s, v) => s + (parseAmount(v) || 0), 0)
  const mixUsed = f.mix.some((v) => v !== '')

  const submit = (e) => {
    e.preventDefault()
    const balance = locked ? initial.balance : parseAmount(f.balance)
    if (!f.name.trim()) return setErr('Account name is required.')
    if (!locked && (Number.isNaN(balance) || f.balance === '')) return setErr('Enter the current balance as a number.')
    if (!locked && isAsset && mixUsed && Math.abs(mixTotal - 100) > 0.01) return setErr(`Asset mix must total 100% (now ${mixTotal}%).`)
    const mv = parseAmount(f.maturityValue)
    onSave({
      country, type,
      name: f.name.trim(), number: f.number.trim(), institution: f.institution.trim(), owner: f.owner, balance,
      mix: locked ? initial.mix : isAsset && mixUsed ? f.mix.map((v) => parseAmount(v) || 0) : null,
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
          <label className="field">Current balance ({flag})<input inputMode="decimal" value={f.balance} onChange={set('balance')} disabled={locked} />{locked && <small>Comes from the linked portfolio. Change holdings or prices in Portfolio.</small>}</label>
        </div>
        <div className="field">Who owns it?<OwnerPicker value={f.owner} onChange={(owner) => setF({ ...f, owner })} parentLabel={parentLabel} /></div>
        {isAsset && !locked && (
          <>
            <div className="field">
              Asset mix (%, optional — must total 100)
              <div className="four">
                {MIX.map((m, i) => (
                  <label key={m.key} className="field sub-field">{m.label}
                    <input inputMode="decimal" value={f.mix[i]} onChange={(e) => setF({ ...f, mix: f.mix.map((v, j) => (j === i ? e.target.value : v)) })} />
                  </label>
                ))}
              </div>
              {mixUsed && <span className={Math.abs(mixTotal - 100) <= 0.01 ? 'pos' : 'neg'}>Total {mixTotal}% {Math.abs(mixTotal - 100) <= 0.01 ? '✓' : ''}</span>}
            </div>
            <div className="two">
              <label className="field">Deposit maturity date (optional)<input type="date" value={f.maturityDate} onChange={set('maturityDate')} /></label>
              <label className="field">Value at maturity (optional, {flag})<input inputMode="decimal" value={f.maturityValue} onChange={set('maturityValue')} /></label>
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
  const flag = curFlag(cur)
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
          <label className="field">Death benefit ({flag})<input inputMode="decimal" value={f.deathBenefit} onChange={set('deathBenefit')} /></label>
        </div>
        <div className="two">
          <label className="field">Maturity date (optional)<input type="date" value={f.maturityDate} onChange={set('maturityDate')} /></label>
          <label className="field">Value on maturity (optional, {flag})<input inputMode="decimal" placeholder="none for term policies" value={f.maturityValue} onChange={set('maturityValue')} /></label>
        </div>
        <div className="field">Whose policy?<OwnerPicker value={f.owner} onChange={(owner) => setF({ ...f, owner })} parentLabel={parentLabel} /></div>
        {err && <div className="err">{err}</div>}
      </form>
    </Modal>
  )
}
