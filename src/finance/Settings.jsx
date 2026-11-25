import { useState } from 'react'
import { useVault } from './VaultContext.jsx'
import CountriesPicker from './CountriesPicker.jsx'
import { PassphraseForm } from './ui.jsx'
import { ConfirmDelete, ConfirmRestore } from './AppDialogs.jsx'
import { backupAgeDays, backupStale, lastBackup, markBackup } from '../lib/nativeapp.js'
import { download, isAbort, pickExcel } from '../lib/fileio.js'
import { oldCopyNotice } from '../lib/channel.js'

export default function Settings() {
  const v = useVault()
  const { data, update } = v
  const [changing, setChanging] = useState(false)
  const [newKey, setNewKey] = useState('') // a just-made recovery key, shown once
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [dlg, setDlg] = useState('') // app only: 'restore' | 'delete'
  const [backedUp, setBackedUp] = useState(lastBackup())
  const inApp = v.storage === 'app' // the vault is kept inside the Android app
  const [confirmOld, setConfirmOld] = useState(false)
  const setSettings = (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }))

  const exportExcel = async () => {
    if (!window.confirm('The Excel copy is NOT encrypted: anyone who gets it can read all your account numbers and balances. Export anyway?')) return
    const { exportWorkbook } = await import('../lib/excel.js')
    download('WealthTracker-export.xlsx', await exportWorkbook(data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }
  const importExcel = async () => {
    try {
      const f = await pickExcel()
      const { importWorkbook } = await import('../lib/excel.js')
      const { data: d, warnings } = await importWorkbook(f.buffer)
      if (!window.confirm(`Replace ALL current data with ${d.accounts.length} items, ${d.policies.length} policies and ${d.balances.length} balances from ${f.name}?`)) return
      update(() => d)
      setMsg(`Imported ${f.name}.${warnings.length ? ' Skipped: ' + warnings.join(' ') : ''}`)
    } catch (e) {
      if (!isAbort(e)) setMsg(e.message)
    }
  }
  const makeKey = async () => {
    setBusy(true)
    try { setNewKey(await v.createRecoveryKey()); setMsg('') } finally { setBusy(false) }
  }
  const changePass = async (p) => {
    setBusy(true)
    try { await v.changePassphrase(p); setChanging(false); setMsg('Passphrase changed and file re-encrypted.') } finally { setBusy(false) }
  }

  return (
    <>
      <div className="panel" id="set-countries">
        <div className="p-head"><div className="title">Countries shown (every tab)</div></div>
        <CountriesPicker
          value={data.settings.countries}
          onChange={(countries) => setSettings({ countries })}
          noun={['item', 'items']}
          describe={(code) => {
            const a = data.accounts.filter((x) => x.country === code).length
            const p = data.policies.filter((x) => x.country === code).length
            const h = data.properties.filter((x) => x.country === code).length
            const o = data.portfolios.filter((x) => (data.accounts.find((ac) => ac.id === x.accountId)?.country || x.country) === code).length
            const parts = [a && `${a} account${a === 1 ? '' : 's'}`, p && `${p} polic${p === 1 ? 'y' : 'ies'}`, h && `${h} propert${h === 1 ? 'y' : 'ies'}`, o && `${o} portfolio${o === 1 ? '' : 's'}`].filter(Boolean)
            return { count: a + p + h + o, text: parts.length ? parts.join(' · ') : 'No data yet' }
          }}
        />
        <div className="col">
          <div className="row">
            <span>“Parent” label<small>Rename to e.g. “Mom” or “Dad”</small></span>
            <input className="pw sm" aria-label="Parent label" value={data.settings.parentLabel} maxLength={20} onChange={(e) => setSettings({ parentLabel: e.target.value })} onBlur={(e) => !e.target.value.trim() && setSettings({ parentLabel: 'Parent' })} />
          </div>
        </div>
      </div>

      <div className="panel" id="set-data">
        <div className="p-head"><div className="title">{v.demo ? "Data" : "🔒 Your data & security"}</div></div>
        <div className="col">
          {!v.demo && (
            <>
          <div className="row" data-testid="storage-row">
            <span>Stored in<small>{v.storage === 'drive'
              ? 'Only the encrypted file is in your Google Drive. If a save cannot reach Google, your changes stay in the open app and you are told, so keep it open until it says saved.'
              : v.storage === 'app' ? 'Private to this app. Other apps cannot see it.' : `${v.fileName || 'Encrypted file'} · AES-256-GCM, key derived from your passphrase`}</small></span>
            <b>{v.storage === 'drive' ? `Google Drive · ${v.fileName}` : v.storage === 'app' ? 'Vault file · inside this app' : 'Vault file'}</b>
          </div>
          <div className="row" data-testid="move-row">
            <span>Move your data<small>Copies the encrypted vault, checks the copy opens, then switches. Your current copy is left untouched until you delete it.</small></span>
            <span className="row-actions">
              <button className="btn" disabled={v.storage !== 'drive'} title={v.storage === 'drive' ? undefined : 'Current location'} onClick={async () => { setMsg(''); try { if (await v.moveToFile()) setMsg('Moved to a vault file. Your Google Drive copy is still there; see below.') } catch (e) { setMsg(e.message) } }}>{v.storage === 'drive' ? 'Move to a vault file…' : 'Vault file (current)'}</button>
              <button className="btn" disabled={v.storage === 'drive' || !v.driveEnabled} title={v.storage === 'drive' ? 'Current location' : v.driveEnabled ? undefined : 'Google sign-in is not set up in this copy of the app'} onClick={async () => { setMsg(''); try { await v.moveToDrive(); setMsg('Moved to your Google Drive. Your previous copy is still there; see below.') } catch (e) { setMsg(e.message) } }}>{v.storage === 'drive' ? 'Google Drive (current)' : 'Move to Google Drive…'}</button>
            </span>
          </div>
          {v.oldCopy && (
            <div className="warn" data-testid="old-copy">
              <b>Your old copy still exists.</b> {oldCopyNotice(v.oldCopy)}
              <div className="row-actions" style={{ marginTop: 8 }}>
                {v.canDeleteOldCopy && !confirmOld && <button className="btn danger-btn" onClick={() => setConfirmOld(true)}>Delete old copy…</button>}
                {confirmOld && <button className="btn danger-btn" onClick={async () => { try { await v.deleteOldCopy(); setConfirmOld(false); setMsg('The old copy was deleted.') } catch (e) { setMsg(e.message); setConfirmOld(false) } }}>Yes, delete the old copy for good</button>}
                {confirmOld && <button className="btn" onClick={() => setConfirmOld(false)}>Cancel</button>}
                <button className="btn" onClick={() => { setConfirmOld(false); v.keepOldCopy() }}>Keep it, stop reminding me</button>
              </div>
              {!v.canDeleteOldCopy && <p className="note">This app cannot delete that file from here. Delete it yourself in your file manager.</p>}
            </div>
          )}
          {inApp ? (
            <>
              <div className="row">
                <span>Back up<small>Opens the share sheet: Files, Drive, email…</small></span>
                <button className="btn" onClick={async () => { try { await v.exportBackup(); markBackup(); setBackedUp(lastBackup()) } catch (e) { setMsg(e.message) } }}>Export backup…</button>
              </div>
              <div className="row">
                <span>Last backup<small>A reminder to back up now and then</small></span>
                {(() => { const d = backupAgeDays(backedUp); return <span className={backupStale(d) ? 'warn-text' : ''} data-testid="last-backup">{d === null ? 'never' : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`}</span> })()}
              </div>
              <div className="row"><span>Restore<small>Replaces the vault in this app</small></span><button className="btn" onClick={() => setDlg('restore')}>Restore…</button></div>
              <div className="row"><span>Lock<small>Asks for the passphrase again</small></span><button className="btn" onClick={v.lock}>Lock now</button></div>
            </>
          ) : (
            <>
          <div className="row">
            <span>Data file<small>{v.fileName}{v.storage === 'drive' ? ' (Google Drive)' : ''} · AES-256-GCM, key derived from your passphrase</small></span>
            <span className="row-actions">
              <button className="btn" onClick={v.lock}>Lock now</button>
              <button className="btn" onClick={v.switchFile}>{v.storage === 'drive' ? 'Switch vault' : 'Change file'}</button>
            </span>
          </div>
          {!v.canWrite && (
            <div className="row">
              <span>Save a copy<small>This browser cannot save in place. Download after changes.</small></span>
              <button className="btn primary" onClick={v.downloadNow}>Download encrypted file</button>
            </div>
          )}
            </>
          )}
          <div className="row">
            <span>Passphrase<small>Re-encrypts the whole file</small></span>
            <button className="btn" onClick={() => setChanging(!changing)}>{changing ? 'Cancel' : 'Change passphrase'}</button>
          </div>
          {changing && <div className="inline-form"><PassphraseForm submitLabel="Change passphrase" onSubmit={changePass} busy={busy} /></div>}
          <div className="row" data-testid="recovery-row">
            <span>Recovery key<small>{v.hasRecovery ? 'On. Opens your vault if you forget the passphrase.' : 'Off. Make one so a forgotten passphrase can be reset.'}</small></span>
            <span className="acts">
              <button className="btn" disabled={busy} onClick={makeKey}>{v.hasRecovery ? 'Make a new key' : 'Make a recovery key'}</button>
              {v.hasRecovery && <button className="btn danger-btn" disabled={busy} onClick={async () => { await v.deleteRecoveryKey(); setNewKey(''); setMsg('Recovery key removed.') }}>Remove</button>}
            </span>
          </div>
          {newKey && (
            <div className="warn" data-testid="recovery-key-box">
              <b>Your recovery key. It is shown only now.</b>
              <div className="mono" data-testid="recovery-key" style={{ fontSize: '1.15rem', letterSpacing: '.05em', margin: '8px 0', wordBreak: 'break-all' }}>{newKey}</div>
              Write it down or save it in a password manager, somewhere other than this vault. Anyone with this key and your file can open it. Making a new key stops the old one working.
              <div className="acts" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => navigator.clipboard?.writeText(newKey)}>Copy</button>
                <button className="btn" onClick={() => download('recovery-key.txt', new TextEncoder().encode(`WealthBridge recovery key\n${newKey}\nKeep this somewhere safe and private.\n`))}>Save as a file</button>
                <button className="btn primary" onClick={() => setNewKey('')}>I have saved it</button>
              </div>
            </div>
          )}
          <div className="row">
            <span>Auto-lock after<small>Idle time before the app locks itself</small></span>
            <select className="pw sm" aria-label="Auto-lock after" value={data.settings.autoLockMin} onChange={(e) => setSettings({ autoLockMin: Number(e.target.value) })}>
              <option value={5}>5 min</option><option value={10}>10 min</option><option value={30}>30 min</option><option value={0}>Never</option>
            </select>
          </div>
            </>
          )}
          <div className="row">
            <span>Export decrypted Excel copy<small>For opening in Excel. The copy is NOT encrypted. Delete it when done.</small></span>
            <button className="btn danger-btn" onClick={exportExcel}>Export…</button>
          </div>
          <div className="row">
            <span>Import from Excel<small>Replaces all current data with a workbook exported from this app.</small></span>
            <button className="btn" onClick={importExcel}>Import…</button>
          </div>
          {inApp && !v.demo && (
            <div className="row"><span>Delete the vault<small>Cannot be undone</small></span><button className="btn danger-btn" onClick={() => setDlg('delete')}>Delete…</button></div>
          )}
          {msg && <div className="note">{msg}</div>}
          {inApp && <div className="warn"><b>Uninstalling the app, or clearing its data, deletes your vault.</b> Export a backup now and then. The backup is encrypted, so it is safe to keep in Drive.</div>}
          {dlg === 'restore' && <ConfirmRestore onClose={() => setDlg('')} onConfirm={async () => { setDlg(''); await v.openFile() }} />}
          {dlg === 'delete' && <ConfirmDelete onClose={() => setDlg('')} onConfirm={async () => { await v.deleteAppVault(); setDlg('') }} />}
          {!v.demo && v.storage === 'device' && <div className="warn">Also recommended: keep the file on an encrypted disk (BitLocker / FileVault) and keep a second backup copy somewhere private. Data files are excluded from this Git repository.</div>}
        </div>
      </div>
    </>
  )
}
