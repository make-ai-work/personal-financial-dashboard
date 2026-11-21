import { useState } from 'react'
import { useVault } from './VaultContext.jsx'
import { PassphraseForm } from './ui.jsx'
import { pickExcel, isAbort, hasFS } from '../lib/fileio.js'
import { channelOf, storageChoices } from '../lib/channel.js'
import { ConfirmDelete, ConfirmRestore } from './AppDialogs.jsx'

export function FirstRun() {
  const v = useVault()
  const [step, setStep] = useState('choose')
  const [where, setWhere] = useState('device') // 'device' | 'drive': Google Drive is an optional extra choice
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
      if (where === 'drive') await v.createInDrive(pass, initial || undefined)
      else await v.create(pass, initial || undefined)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'pass') {
    return (
      <div className="panel center">
        <div className="steps"><span>1 · Choose where</span> › <b>2 · Set passphrase</b></div>
        <h2>Set a passphrase</h2>
        {notice && <p className="note">{notice}</p>}
        <p className="note">{where === 'drive'
          ? 'Your data is encrypted with this passphrase (AES-256) on this device. Only the encrypted file is uploaded to your Google Drive; Google may ask you to allow access first.'
          : v.isApp
            ? 'Your data is encrypted with this passphrase (AES-256) and stored inside this app.'
            : 'Your data is encrypted with this passphrase (AES-256) before it is saved. After you press Create you will choose where to save the file.'}</p>
        <PassphraseForm submitLabel={where === 'drive' ? 'Create in Google Drive' : v.isApp ? 'Create vault' : 'Create encrypted file'} onSubmit={create} busy={busy} error={err} />
        <button className="link" onClick={() => setStep('choose')}>← Back</button>
      </div>
    )
  }
  const channel = channelOf({ native: v.isApp, desktop: !!window.desktopApp })
  const choices = storageChoices({ channel, clientReady: v.driveEnabled, canRemember: hasFS() || v.isApp })
  const fileChoice = choices.find((c) => c.id === 'file')
  const driveChoice = choices.find((c) => c.id === 'drive')
  const startNew = (w) => { setInitial(null); setNotice(''); setWhere(w); setStep('pass') }
  return (
    <div className="panel center">
      <div className="steps"><b>1 · Choose where</b> › 2 · Set passphrase</div>
      <h2>Where should your data live?</h2>
      <p className="note">Everything is encrypted with your passphrase before it is saved. Nothing is sent to a server, and neither choice needs you to sign in.</p>
      <div className="choice" data-testid="choice-file">
        <b className="choice-h">{fileChoice.title}</b>
        <span className="note">{fileChoice.hint}</span>
        <button className="primary" onClick={() => startNew('device')}>
          Create a new vault file<small>Starts empty. You set the passphrase next.</small>
        </button>
        <button onClick={v.openFile}>{v.isApp ? 'Restore from a backup file' : 'Open an existing vault file'}<small>{v.isApp ? 'A .wvault file you exported before. It is copied into this app.' : 'A .wvault file you made before.'}</small></button>
      </div>
      <div className="choice" data-testid="choice-drive">
        <b className="choice-h">{driveChoice.title} <span className="opt">optional</span></b>
        {driveChoice.available ? (
          <>
            <span className="note">{driveChoice.hint}</span>
            <button onClick={() => startNew('drive')}>Create in Google Drive<small>Saves the encrypted file in your own Drive. Google may ask you to allow access first.</small></button>
            <button onClick={v.openFromDrive}>Open from Google Drive<small>The encrypted file this app saved to your Drive before.</small></button>
          </>
        ) : <button disabled>Create in Google Drive<small>{driveChoice.hint}</small></button>}
      </div>
      <div className="choice">
        <button onClick={importExcel}>
          Import from an Excel file<small>For a workbook exported from this app. The original is left untouched, so delete or secure it yourself afterwards.</small>
        </button>
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
  const [dlg, setDlg] = useState('') // vault inside the app only: 'restore' | 'delete'
  const inApp = v.isApp && v.storage !== 'drive' // the Android app, with the vault kept inside it (not moved to Google Drive)
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
      <h2>{inApp ? 'Your vault' : v.fileName || 'Encrypted file'}</h2>
      <p className="note">{v.storage === 'drive' ? 'Stored in your Google Drive. ' : ''}Enter your passphrase to unlock.</p>
      <form onSubmit={submit}>
        <input className="pw center-text" type="password" autoFocus autoComplete="current-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary wide" disabled={busy || !pass}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      </form>
      <p className="note">The passphrase stays in memory only while unlocked. Auto-lock clears it after idle time.</p>
      {inApp ? (
        <>
          <button className="link" onClick={() => setDlg('restore')}>Restore from a backup…</button>
          <button className="link danger" onClick={() => setDlg('delete')}>Delete the vault in this app…</button>
          {dlg === 'restore' && <ConfirmRestore onClose={() => setDlg('')} onConfirm={async () => { setDlg(''); await v.openFile() }} />}
          {dlg === 'delete' && <ConfirmDelete onClose={() => setDlg('')} onConfirm={async () => { await v.deleteAppVault(); setDlg('') }} />}
        </>
      ) : <button className="link" onClick={v.switchFile}>Use a different file</button>}
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
