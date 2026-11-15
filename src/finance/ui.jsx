import { useEffect, useRef, useState } from 'react'
import { passphraseStrength } from '../lib/vault.js'
import { MIX, ownerLabel } from '../lib/format.js'

const openModals = [] // Escape closes only the top-most dialog

export function Modal({ title, onClose, children, footer, wide }) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const me = Symbol('modal')
    openModals.push(me)
    const onKey = (e) => e.key === 'Escape' && openModals[openModals.length - 1] === me && close.current()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openModals.splice(openModals.indexOf(me), 1)
    }
  }, [])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`panel modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="p-head">
          <div className="title">{title}</div>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export const OwnerChip = ({ owner, parentLabel }) => (
  <span className={`chip c-${owner}`}>{ownerLabel(owner, parentLabel)}</span>
)

export function OwnerPicker({ value, onChange, parentLabel }) {
  const opts = [
    ['mine', 'Mine', 'Only me'],
    ['joint', 'Joint', `Me + ${parentLabel.toLowerCase()}`],
    ['parent', parentLabel, `Only ${parentLabel.toLowerCase()}`],
  ]
  return (
    <div className="radios" role="radiogroup" aria-label="Owner">
      {opts.map(([k, l, s]) => (
        <label key={k} className={value === k ? 'on' : ''}>
          <input type="radio" name="owner" checked={value === k} onChange={() => onChange(k)} />
          {l}
          <small>{s}</small>
        </label>
      ))}
    </div>
  )
}

export function MixBar({ mix }) {
  if (!mix) return <span className="muted">n/a</span>
  const txt = mix.map((p, i) => (p ? `${MIX[i].short} ${p}` : '')).filter(Boolean).join(' · ')
  return (
    <>
      <div className="mix">
        {mix.map((p, i) => p > 0 && <i key={i} className={`m-${MIX[i].key}`} style={{ width: `${p}%` }} title={`${MIX[i].label} ${p}%`} />)}
      </div>
      <div className="mixtxt">{txt}</div>
    </>
  )
}

export function PassphraseForm({ submitLabel, onSubmit, busy, error }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ack, setAck] = useState(false)
  const strength = passphraseStrength(pass)
  const problem =
    pass.length < 10 ? 'Use at least 10 characters.' : pass !== confirm ? 'Passphrases do not match.' : !ack ? 'Please confirm you saved it.' : ''
  const labels = ['Too short', 'Weak', 'OK', 'Good', 'Strong']
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem) onSubmit(pass)
      }}
    >
      <label className="field">
        Passphrase
        <input className="pw" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      <div className="meter" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => <i key={n} className={strength >= n ? 'on' : ''} />)}
      </div>
      <small className="muted">{labels[strength]} · a few random words or 14+ characters works well</small>
      <label className="field">
        Confirm passphrase
        <input className="pw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <div className="warn">
        <b>There is no recovery.</b> If you forget this passphrase, the file cannot be opened by anyone. Store it in a password manager.
      </div>
      <label className="check">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand and have saved my passphrase
      </label>
      {(error || (pass && problem)) && <div className="err">{error || problem}</div>}
      <div className="right">
        <button className="btn primary" disabled={!!problem || busy}>{busy ? 'Working…' : submitLabel}</button>
      </div>
    </form>
  )
}
