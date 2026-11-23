import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { decryptVault, decryptVaultWithRecovery, encryptVault, makeRecoveryKey, newSession, parseVault, removeRecoveryKey, setPassphrase } from '../lib/vault.js'
import { emptyData, normalizeData } from '../lib/model.js'
import { loadDemoData } from '../lib/demo.js'
import {
  APP_HANDLE, download, driveHandle, driveRemembered, ensurePermission, forgetHandle, hasFS, isAbort, isDesktop, pickNewVaultHandle, pickVault,
  readHandle, recallHandle, rememberHandle, writeHandle,
} from '../lib/fileio.js'
import { canDeleteOld } from '../lib/channel.js'
import * as drive from '../lib/drive.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { isClientId } from '../lib/google.js'
import { appVault, isNativeApp, shareBackup } from '../lib/appstorage.js'

const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

const Ctx = createContext(null)
export const useVault = () => useContext(Ctx)

const DEFAULT_NAME = 'WealthTracker.wvault'
const OLD_KEY = 'vault.oldCopy' // what a move left behind: { kind: 'app' | 'device' | 'drive', name, id?, path? } (no secrets)
const readOld = () => { try { const j = JSON.parse(localStorage.getItem(OLD_KEY)); return j && j.kind ? j : null } catch { return null } }
const writeOld = (v) => { try { v ? localStorage.setItem(OLD_KEY, JSON.stringify(v)) : localStorage.removeItem(OLD_KEY) } catch { /* storage unavailable */ } }
// Describe the place a handle points at, for "your previous copy is still ...".
const describe = (h) => (h.kind === 'drive' ? { kind: 'drive', name: h.name, id: h.id } : h.kind === 'app' ? { kind: 'app', name: h.name } : { kind: 'device', name: h.name, path: h.path || '' })

export function VaultProvider({ children }) {
  const auth = useAuth()
  drive.setDriveClient(auth.clientId) // before anything below may need Drive
  const driveEnabled = auth.real && isClientId(auth.clientId || '') // Google Drive is one of the two places to keep your data; it needs a Google sign-in
  const [phase, setPhase] = useState('loading') // loading | start (nothing chosen yet) | locked | unlocked
  const [demo, setDemo] = useState(false) // demo mode: sample data in memory, nothing saved (until you sign in and choose where to keep your data)
  const demoRef = useRef(false)
  const setDemoMode = (on) => { demoRef.current = on; setDemo(on) }
  const [data, setData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [hasRecovery, setHasRecovery] = useState(false) // this vault has a recovery key (so a forgotten passphrase can be reset)
  const [saveState, setSaveState] = useState('saved') // saved | saving | unsaved | error
  const [canWrite, setCanWrite] = useState(false) // true when saving writes straight to the file
  const [error, setError] = useState('')
  const [storage, setStorage] = useState('') // 'drive' | 'device' | 'app' | 'download'
  const [oldCopy, setOldCopy] = useState(readOld) // the copy a move left behind, until you delete it or choose to keep it

  const dataRef = useRef(null)
  const session = useRef(null)
  const handle = useRef(null)
  const bytes = useRef(null) // last encrypted copy, kept so a locked app can be unlocked again
  const timer = useRef(null)
  const chain = useRef(Promise.resolve())
  const needsDownload = useRef(false) // download-only browsers: changes not yet saved to a file
  const pending = useRef(null) // newest encrypted copy that could not be saved yet (Drive: reconnect or conflict), kept so it is not lost
  const setHandle = (h) => { handle.current = h; setStorage(h ? (h.kind === 'drive' ? 'drive' : h.kind === 'app' ? 'app' : 'device') : 'download') }

  useEffect(() => {
    let live = true
    if (!auth.real) { setPhase('start'); return undefined } // not signed in: only demo mode is on offer
    ;(async () => {
      const h = hasFS() || isNativeApp() || driveRemembered() ? await recallHandle() : null
      if (!live) return
      if (h) {
        setHandle(h)
        setFileName(h.name)
        setCanWrite(true)
        setPhase('locked')
      } else setPhase('start')
    })()
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // "Demo mode – nothing will be saved": sample data in memory. Signing in later (Settings) lets you keep it by choosing where to save.
  const startDemo = useCallback(async () => {
    const d = await loadDemoData()
    dataRef.current = d
    session.current = null
    setData(d)
    setFileName('Sample data')
    setSaveState('saved')
    setDemoMode(true)
    setPhase('unlocked')
  }, [])

  const persist = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (demoRef.current || !session.current || !dataRef.current) return
      setSaveState('saving')
      try {
        const out = await encryptVault(session.current, dataRef.current)
        bytes.current = out
        if (handle.current) {
          pending.current = out
          await writeHandle(handle.current, out)
          pending.current = null
          setError('')
          setSaveState('saved')
        } else {
          needsDownload.current = true
          setSaveState('unsaved') // download needed
        }
      } catch (e) {
        setError(e.message)
        // Google Drive: the changes stay safe in memory (and in `pending`) until you reconnect or choose what to do about a conflict
        setSaveState(e instanceof drive.DriveAuthError ? 'reconnect' : e instanceof drive.DriveConflictError ? 'conflict' : 'error')
      }
    })
    return chain.current
  }, [])

  const update = useCallback((fn) => {
    const next = fn(dataRef.current)
    dataRef.current = next
    setData(next)
    if (demoRef.current) return // nothing is saved in demo mode
    setSaveState('unsaved')
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, 500)
  }, [persist])

  const start = useCallback((initial, sess, h, name) => {
    setDemoMode(false) // a real vault now: the demo data (if any) is what it starts with
    session.current = sess
    setHasRecovery(!!sess.rec)
    setHandle(h)
    dataRef.current = initial
    setData(initial)
    setFileName(name)
    setCanWrite(!!h)
    setError('')
    setPhase('unlocked')
    if (h) rememberHandle(h)
    return persist()
  }, [persist])

  // Create a new encrypted file (optionally pre-filled from an Excel import).
  const create = useCallback(async (passphrase, initial = emptyData(), { replace = false } = {}) => {
    let h = null
    try {
      h = await pickNewVaultHandle(DEFAULT_NAME, { replace })
    } catch (e) {
      if (isAbort(e)) return false
      throw e
    }
    const sess = await newSession(passphrase)
    await start(normalizeData(initial), sess, h, h?.name || DEFAULT_NAME)
    if (!h) await downloadNow()
    return true
  }, [start]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadNow = useCallback(async () => {
    await persist()
    if (bytes.current) {
      download(fileName || DEFAULT_NAME, bytes.current)
      needsDownload.current = false
      setSaveState('saved')
    }
  }, [persist, fileName])

  const openFile = useCallback(async () => {
    setError('')
    try {
      const f = await pickVault()
      parseVault(f.bytes)
      let h = f.handle
      if (isNativeApp()) { await appVault.write(f.bytes); h = APP_HANDLE } // restoring a backup: the app keeps its own copy
      // whatever was open is gone: a pending autosave must never overwrite the file that was just opened
      clearTimeout(timer.current)
      setDemoMode(false)
      dataRef.current = null
      session.current = null
      setData(null)
      setHandle(h)
      bytes.current = f.bytes
      needsDownload.current = false
      setFileName(f.name)
      setCanWrite(!!h)
      if (h) rememberHandle(h)
      setPhase('locked')
    } catch (e) {
      if (!isAbort(e)) setError(e.message)
    }
  }, [])

  const unlock = useCallback(async (passphrase) => {
    let b = bytes.current
    const retry = !!pending.current // changes that could not be saved before locking: open those, then try saving again
    if (handle.current) {
      if (!(await ensurePermission(handle.current))) throw new Error('Permission to read the file was not granted.')
      if (retry) b = pending.current
      else { b = await readHandle(handle.current); bytes.current = b }
    }
    if (!b) throw new Error('No file selected.')
    const { data: d, session: s } = await decryptVault(b, passphrase)
    session.current = s
    setHasRecovery(!!s.rec)
    dataRef.current = normalizeData(d)
    setData(dataRef.current)
    setSaveState(!handle.current && needsDownload.current ? 'unsaved' : 'saved')
    setError('')
    setPhase('unlocked')
    if (retry) { setSaveState('unsaved'); persist() }
  }, [persist])

  // Encrypted copy for safekeeping: the phone's share sheet in the app, a download in the browser.
  const exportBackup = useCallback(async () => {
    await persist()
    if (!bytes.current) return
    if (isNativeApp()) await shareBackup(bytes.current, handle.current?.name || DEFAULT_NAME)
    else download(fileName || DEFAULT_NAME, bytes.current)
  }, [persist, fileName])

  // App only: remove the vault stored in this app (irreversible), then start over.
  const deleteAppVault = useCallback(async () => {
    clearTimeout(timer.current)
    await appVault.remove()
    dataRef.current = null
    session.current = null
    setHandle(null)
    bytes.current = null
    setData(null)
    setFileName('')
    setCanWrite(false)
    setPhase('start')
  }, [])

  const lock = useCallback(async () => {
    if (demoRef.current) return
    clearTimeout(timer.current)
    if (dataRef.current) await persist()
    dataRef.current = null
    session.current = null
    setData(null)
    setPhase('locked')
  }, [persist])

  const switchFile = useCallback(async () => {
    if (phase === 'unlocked') await lock()
    setHandle(null)
    pending.current = null
    bytes.current = null
    forgetHandle()
    setFileName('')
    setCanWrite(false)
    setPhase('start')
  }, [lock, phase])

  const changePassphrase = useCallback(async (passphrase) => {
    session.current = await setPassphrase(session.current, passphrase) // the data key and any recovery key stay the same
    await persist()
  }, [persist])

  // Recovery key: made once, shown once. It opens the vault if the passphrase is forgotten (see unlockWithRecovery).
  const createRecoveryKey = useCallback(async () => {
    const { code, session: s } = await makeRecoveryKey(session.current)
    session.current = s
    setHasRecovery(true)
    await persist()
    return code
  }, [persist])
  const deleteRecoveryKey = useCallback(async () => {
    session.current = removeRecoveryKey(session.current)
    setHasRecovery(false)
    await persist()
  }, [persist])

  // Forgot the passphrase: open with the recovery key and set a new passphrase in one step (the old passphrase stops working).
  const unlockWithRecovery = useCallback(async (recoveryKey, newPassphrase) => {
    let b = bytes.current
    if (handle.current) {
      if (!(await ensurePermission(handle.current))) throw new Error('Permission to read the file was not granted.')
      b = await readHandle(handle.current); bytes.current = b
    }
    if (!b) throw new Error('No file selected.')
    const { data: d, session: s } = await decryptVaultWithRecovery(b, recoveryKey)
    session.current = await setPassphrase(s, newPassphrase)
    setHasRecovery(true)
    dataRef.current = normalizeData(d)
    setData(dataRef.current)
    setError('')
    setPhase('unlocked')
    setSaveState('unsaved')
    await persist() // writes the file with the new passphrase
  }, [persist])

  // Auto-lock after idle time.
  const autoLockMin = data?.settings?.autoLockMin
  useEffect(() => {
    if (demo || phase !== 'unlocked' || !autoLockMin) return
    let t
    const arm = () => {
      clearTimeout(t)
      t = setTimeout(lock, autoLockMin * 60_000)
    }
    const evts = ['mousemove', 'keydown', 'click', 'touchstart']
    evts.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    arm()
    return () => {
      clearTimeout(t)
      evts.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [phase, autoLockMin, lock, demo])

  // Warn before closing the tab while a download-only vault has unsaved changes.
  useEffect(() => {
    const warn = (e) => {
      if (phase === 'unlocked' && (!canWrite || ['reconnect', 'conflict', 'error'].includes(saveState)) && saveState !== 'saved') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase, canWrite, saveState])

  const resetDemo = useCallback(async () => {
    const d = await loadDemoData()
    dataRef.current = d
    setData(d)
  }, [])

  // ---- Google Drive (optional): the encrypted file in your own Drive. Never required; the other choices are unchanged. ----
  const createInDrive = useCallback(async (passphrase, initial = emptyData()) => {
    await drive.connectDrive() // may show Google's approval window: this runs from a click
    if ((await drive.listVaults()).length) throw new Error('A vault already exists in your Google Drive. Choose "Open from Google Drive" instead (or delete it in Drive first).')
    const sess = await newSession(passphrase)
    const init = normalizeData(initial)
    const meta = await drive.createVault(await encryptVault(sess, init))
    const h = driveHandle(meta)
    await start(init, sess, h, h.name)
    return true
  }, [start])

  const openFromDrive = useCallback(async () => {
    setError('')
    try {
      await drive.connectDrive()
      const files = await drive.listVaults()
      if (!files.length) throw new Error('No vault was found in your Google Drive. Create one with "Save to Google Drive", or open a file from this computer.')
      const f = files[0] // the most recently saved
      const r = await drive.readVault(f.id)
      parseVault(r.bytes)
      clearTimeout(timer.current)
      setDemoMode(false)
      dataRef.current = null
      session.current = null
      pending.current = null
      setData(null)
      const h = driveHandle({ id: f.id, name: f.name, modifiedTime: r.modifiedTime })
      setHandle(h)
      bytes.current = r.bytes
      needsDownload.current = false
      setFileName(h.name)
      setCanWrite(true)
      rememberHandle(h)
      setPhase('locked')
    } catch (e) { setError(e.message) }
  }, [])

  // Unlocked, from Settings: start keeping the vault in Drive. The copy is read back and compared before anything switches over, and the
  // old copy is NEVER deleted here: it stays until you choose "Delete old copy" (see oldCopy).
  const moveToDrive = useCallback(async () => {
    await drive.connectDrive()
    if ((await drive.listVaults()).length) throw new Error('Your Google Drive already has a vault. Lock this one and choose "Open from Google Drive", or delete the Drive file first.')
    await persist()
    if (!bytes.current) throw new Error('Nothing to move yet.')
    const meta = await drive.createVault(bytes.current)
    const back = await drive.readVault(meta.id)
    if (!sameBytes(back.bytes, bytes.current)) throw new Error('The copy in Google Drive did not match, so nothing was changed. Try again.')
    const old = handle.current ? describe(handle.current) : null
    const h = driveHandle({ id: meta.id, name: meta.name, modifiedTime: back.modifiedTime })
    setHandle(h)
    setFileName(h.name)
    setCanWrite(true)
    needsDownload.current = false
    pending.current = null
    rememberHandle(h)
    if (old) { writeOld(old); setOldCopy(old) }
    setError('')
    setSaveState('saved')
  }, [persist])

  // Unlocked, from Settings: leave Google Drive for a vault file (inside the app on Android, a place you choose elsewhere). Same rules:
  // copy, check, switch, keep the old copy until you delete it.
  const moveToFile = useCallback(async () => {
    if (!handle.current || handle.current.kind !== 'drive') throw new Error('The vault is not in Google Drive.')
    await persist()
    if (!bytes.current) throw new Error('Nothing to move yet.')
    const old = describe(handle.current)
    let h
    try { h = await pickNewVaultHandle(DEFAULT_NAME) } catch (e) { if (isAbort(e)) return false; throw e }
    if (!h) { // a browser that cannot keep a file location: offer the download and stay in Drive
      download(DEFAULT_NAME, bytes.current)
      throw new Error('This browser cannot save to a chosen location. An encrypted copy was downloaded, and the vault stays in Google Drive.')
    }
    await writeHandle(h, bytes.current)
    if (!sameBytes(await readHandle(h), bytes.current)) throw new Error('The saved file did not match, so nothing was changed. Try again.')
    setHandle(h)
    setFileName(h.name)
    setCanWrite(true)
    pending.current = null
    rememberHandle(h)
    writeOld(old)
    setOldCopy(old)
    setError('')
    setSaveState('saved')
    return true
  }, [persist])

  // "Delete old copy": only after a move, only that copy, and the current vault is never touched.
  const deleteOldCopy = useCallback(async () => {
    const old = readOld()
    if (!old) { setOldCopy(null); return }
    if (old.kind === 'drive') { await drive.connectDrive(); await drive.deleteVault(old.id) } // from a click, so Google may ask first
    else if (old.kind === 'app') await appVault.remove()
    else if (isDesktop() && old.path) await window.desktopApp.deleteVault(old.path)
    else throw new Error('Delete the old file yourself, in your file manager. This app cannot remove a file in the browser.')
    writeOld(null)
    setOldCopy(null)
  }, [])
  const keepOldCopy = useCallback(() => { writeOld(null); setOldCopy(null) }, [])

  // The Drive pass ran out and could not be renewed quietly: ask for it again (from a click), then save what is waiting.
  const reconnectDrive = useCallback(async () => {
    try { await drive.connectDrive(); setError(''); await persist() } catch (e) { setError(e.message) }
  }, [persist])

  // Another device saved first. 'overwrite': keep my changes and replace the Drive copy. 'reload': discard mine and open the Drive copy.
  const resolveConflict = useCallback(async (choice) => {
    try {
      if (choice === 'overwrite') {
        handle.current.version = await drive.currentVersion(handle.current.id)
        await persist()
      } else {
        clearTimeout(timer.current)
        const r = await drive.readVault(handle.current.id)
        handle.current.version = r.modifiedTime
        bytes.current = r.bytes
        pending.current = null
        dataRef.current = null
        session.current = null
        setData(null)
        setError('')
        setSaveState('saved')
        setPhase('locked')
      }
    } catch (e) { setError(e.message) }
  }, [persist])

  // Danger zone: reset the vault and erase the data in its current storage. The vault file / Drive file is deleted (a browser file that cannot
  // be deleted is emptied instead), what this device remembers about it is forgotten, and the app returns to "Where should your data live?".
  const wipe = useCallback(async () => {
    clearTimeout(timer.current)
    const h = handle.current
    if (h?.kind === 'app') await appVault.remove()
    else if (h?.kind === 'drive') { await drive.connectDrive(); await drive.wipeVault(h.id) } // permanently, not just to the bin
    else if (h?.kind === 'desktop') await window.desktopApp.deleteVault(h.path)
    else if (h?.createWritable) {
      try { const w = await h.createWritable(); await w.write(new Uint8Array(0)); await w.close() } catch { throw new Error('The file could not be erased. Check that this browser still has permission to it, then try again.') }
      try { await h.remove?.() } catch { /* emptied is enough where deleting is not allowed */ }
    }
    await forgetHandle()
    writeOld(null); setOldCopy(null)
    dataRef.current = null
    session.current = null
    bytes.current = null
    pending.current = null
    needsDownload.current = false
    setHandle(null)
    setData(null)
    setFileName('')
    setCanWrite(false)
    setError('')
    setSaveState('saved')
    setDemoMode(false)
    setPhase('start')
  }, [])

  const value = {
    driveEnabled, storage, createInDrive, openFromDrive, moveToDrive, moveToFile, reconnectDrive, resolveConflict,
    oldCopy, canDeleteOldCopy: canDeleteOld(oldCopy, { desktop: isDesktop() }), deleteOldCopy, keepOldCopy,
    demo, startDemo, resetDemo, wipe,
    phase, data, fileName, saveState, canWrite, error, setError,
    update, create, openFile, unlock, lock, switchFile, changePassphrase, hasRecovery, createRecoveryKey, deleteRecoveryKey, unlockWithRecovery, downloadNow, exportBackup, deleteAppVault,
    isApp: isNativeApp(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
