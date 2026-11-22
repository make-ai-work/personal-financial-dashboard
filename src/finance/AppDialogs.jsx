import { useState } from 'react'
import { Modal } from './ui.jsx'

// A restore replaces the vault stored in this app, so it asks first.
export function ConfirmRestore({ onClose, onConfirm }) {
  return (
    <Modal title="Restore from a backup?" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={onConfirm}>Choose a backup file…</button></>}>
      <p className="note" style={{ textAlign: 'left' }}>This replaces the vault stored in this app with the backup file you choose. Anything saved here since that backup is lost. Nothing changes until you pick a valid file.</p>
    </Modal>
  )
}

// Deleting the vault cannot be undone, so it has to be typed.
export function ConfirmDelete({ onClose, onConfirm }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = text.trim() === 'DELETE'
  const go = async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }
  return (
    <Modal title="Delete the vault in this app?" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger-btn" disabled={!ok || busy} onClick={go}>Delete</button></>}>
      <p className="note" style={{ textAlign: 'left' }}>All accounts, history, portfolios, properties and retirement plans stored here will be erased. <b>This cannot be undone.</b> Export a backup first if you might want it.</p>
      <label className="field">Type DELETE to confirm
        <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-label="Type DELETE to confirm" />
      </label>
    </Modal>
  )
}

// Wiping erases the vault and all its data from its current storage, so it has to be typed.
export function ConfirmWipe({ where, onClose, onConfirm }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = text.trim() === 'WIPE'
  const go = async () => { setBusy(true); setErr(''); try { await onConfirm() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  return (
    <Modal title="Wipe all data?" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger-btn" disabled={!ok || busy} onClick={go}>{busy ? 'Wiping…' : 'Wipe data'}</button></>}>
      <p className="note" style={{ textAlign: 'left' }}>This erases the vault in {where}: all accounts, history, portfolios, properties and retirement plans. The app then asks where to keep a new vault. <b>This cannot be undone.</b> Any old copy left behind by an earlier move is not touched.</p>
      <label className="field">Type WIPE to confirm
        <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-label="Type WIPE to confirm" />
      </label>
      {err && <div className="err">{err}</div>}
    </Modal>
  )
}
