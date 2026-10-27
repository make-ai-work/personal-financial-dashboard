import { useState } from 'react'
import { useVault } from './VaultContext.jsx'
import { PassphraseForm } from './ui.jsx'
import { pickExcel, isAbort } from '../lib/fileio.js'

export function FirstRun() {
  const v = useVault()
  const [step, setStep] = useState('choose')
  const [initial, setInitial] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const importExcel = async () => {
    setErr('')
    try {
      const f = await pickExcel()
      const { importWorkbook } = await import('../lib/excel.js')
      const { data, warnings } = await importWorkbook(f.buffer)
      setInitial(data)
      setNotice(`Imported ${data.accounts.length} items, ${data.policies.length} policies and ${data.balances.length} balances from ${f.name}.${warnings.length ? ' ' + warnings.length + ' rows skipped.' : ''}`)
      setStep('pass')
    } catch (e) {
      if (!isAbort(e)) setErr(e.message)
    }
  }

  const create = async (pass) => {
    setBusy(true)
    setErr('')
    try {
      await v.create(pass, initial || undefined)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'pass') {
    return (
      <div className="panel center">
        <div className="steps"><span>1 · Choose file</span> › <b>2 · Set passphrase</b></div>
        <h2>Set a passphrase</h2>
        {notice && <p className="note">{notice}</p>}
        <p className="note">Your data is encrypted with this passphrase (AES-256) before it is saved. After you press Create you will choose where to save the file.</p>
        <PassphraseForm submitLabel="Create encrypted file" onSubmit={create} busy={busy} error={err} />
        <button className="link" onClick={() => setStep('choose')}>← Back</button>
      </div>
    )
  }
  return (
    <div className="panel center">
      <div className="steps"><b>1 · Choose file</b> › 2 · Set passphrase</div>
      <h2>Where is your data?</h2>
      <p className="note">Everything is encrypted with your passphrase before it is saved. Nothing is sent to a server.</p>
      <div className="choice">
        <button className="primary" onClick={() => { setInitial(null); setNotice(''); setStep('pass') }}>
          Create a new encrypted file<small>Starts empty. You set the passphrase next.</small>
        </button>
        <button onClick={v.openFile}>Open an existing encrypted file<small>A .wvault file you made before.</small></button>
        <button onClick={importExcel}>
          Import from an Excel file<small>For a workbook exported from this app (Items / Insurance / Balances / Rates sheets). The original is left untouched, so delete or secure it yourself afterwards.</small>
        </button>
        <button disabled>Save to Google Drive<small>Coming in a later step.</small></button>
      </div>
      {(v.error || err) && <div className="err">{v.error || err}</div>}
    </div>
  )
}

export function Unlock() {
  const v = useVault()
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await v.unlock(pass)
      setPass('')
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="panel center narrow">
      <div className="lock">🔒</div>
      <h2>{v.fileName || 'Encrypted file'}</h2>
      <p className="note">Enter your passphrase to unlock.</p>
      <form onSubmit={submit}>
        <input className="pw center-text" type="password" autoFocus autoComplete="current-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary wide" disabled={busy || !pass}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      </form>
      <p className="note">The passphrase stays in memory only while unlocked. Auto-lock clears it after idle time.</p>
      <button className="link" onClick={v.switchFile}>Use a different file</button>
    </div>
  )
}

// Shows the first-run or unlock screen until the vault is open, then renders the section.
export function VaultGate({ children }) {
  const { phase } = useVault()
  if (phase === 'loading') return null
  if (phase === 'start') return <FirstRun />
  if (phase === 'locked') return <Unlock />
  return children
}
