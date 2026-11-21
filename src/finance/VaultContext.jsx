import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { decryptVault, encryptVault, newSession, parseVault } from '../lib/vault.js'
import { emptyData, normalizeData } from '../lib/model.js'
import { IS_DEMO, loadDemoData } from '../lib/demo.js'
import {
  APP_HANDLE, download, driveHandle, driveRemembered, ensurePermission, forgetHandle, hasFS, isAbort, isDesktop, pickNewVaultHandle, pickVault,
  readHandle, recallHandle, rememberHandle, writeHandle,
} from '../lib/fileio.js'
import * as drive from '../lib/drive.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { isClientId } from '../lib/google.js'
import { appVault, isNativeApp, shareBackup } from '../lib/appstorage.js'

const Ctx = createContext(null)
export const useVault = () => useContext(Ctx)

const DEFAULT_NAME = 'WealthTracker.wvault'

export function VaultProvider({ children }) {
  const auth = useAuth()
  drive.setDriveClient(auth.clientId) // before anything below may need Drive
  const driveEnabled = !IS_DEMO && !isNativeApp() && !isDesktop() && isClientId(auth.clientId || '') // an extra choice, never required
  const [phase, setPhase] = useState('loading') // loading | start | locked | unlocked
  const [data, setData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [saveState, setSaveState] = useState('saved') // saved | saving | unsaved | error
  const [canWrite, setCanWrite] = useState(false) // true when saving writes straight to the file
  const [error, setError] = useState('')
  const [storage, setStorage] = useState('') // 'drive' | 'device' | 'app' | 'download'

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
    if (IS_DEMO) {
      // Demo: sample data, kept in memory only. No file, passphrase or saving.
      loadDemoData().then((d) => {
        if (!live) return
        dataRef.current = d
        setData(d)
        setFileName('Sample data')
        setSaveState('saved')
        setPhase('unlocked')
      })
      return () => { live = false }
    }
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
  }, [])

  const persist = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (!session.current || !dataRef.current) return
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
    if (IS_DEMO) return // nothing is saved in the demo
    setSaveState('unsaved')
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, 500)
  }, [persist])

  const start = useCallback((initial, sess, h, name) => {
    session.current = sess
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
    if (IS_DEMO) return
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
    session.current = await newSession(passphrase)
    await persist()
  }, [persist])

  // Auto-lock after idle time.
  const autoLockMin = data?.settings?.autoLockMin
  useEffect(() => {
    if (IS_DEMO || phase !== 'unlocked' || !autoLockMin) return
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
  }, [phase, autoLockMin, lock])

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

  // Unlocked, from Settings: start keeping the file in Drive. The file on this computer is left exactly as it is (a ready backup).
  const moveToDrive = useCallback(async () => {
    await drive.connectDrive()
    if ((await drive.listVaults()).length) throw new Error('Your Google Drive already has a vault. Lock this one and choose "Open from Google Drive", or delete the Drive file first.')
    await persist()
    if (!bytes.current) throw new Error('Nothing to move yet.')
    const meta = await drive.createVault(bytes.current)
    const h = driveHandle(meta)
    setHandle(h)
    setFileName(h.name)
    setCanWrite(true)
    needsDownload.current = false
    pending.current = null
    rememberHandle(h)
    setError('')
    setSaveState('saved')
  }, [persist])

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

  const value = {
    driveEnabled, storage, createInDrive, openFromDrive, moveToDrive, reconnectDrive, resolveConflict,
    demo: IS_DEMO, resetDemo,
    phase, data, fileName, saveState, canWrite, error, setError,
    update, create, openFile, unlock, lock, switchFile, changePassphrase, downloadNow, exportBackup, deleteAppVault,
    isApp: isNativeApp(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
