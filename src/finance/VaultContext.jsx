import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { decryptVault, encryptVault, newSession, parseVault } from '../lib/vault.js'
import { emptyData, normalizeData } from '../lib/model.js'
import { IS_DEMO, loadDemoData } from '../lib/demo.js'
import {
  download, ensurePermission, forgetHandle, hasFS, isAbort, pickNewVaultHandle, pickVault,
  readHandle, recallHandle, rememberHandle, writeHandle,
} from '../lib/fileio.js'

const Ctx = createContext(null)
export const useVault = () => useContext(Ctx)

const DEFAULT_NAME = 'WealthTracker.wvault'

export function VaultProvider({ children }) {
  const [phase, setPhase] = useState('loading') // loading | start | locked | unlocked
  const [data, setData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [saveState, setSaveState] = useState('saved') // saved | saving | unsaved | error
  const [canWrite, setCanWrite] = useState(false) // true when saving writes straight to the file
  const [error, setError] = useState('')

  const dataRef = useRef(null)
  const session = useRef(null)
  const handle = useRef(null)
  const bytes = useRef(null) // last encrypted copy, kept so a locked app can be unlocked again
  const timer = useRef(null)
  const chain = useRef(Promise.resolve())
  const needsDownload = useRef(false) // download-only browsers: changes not yet saved to a file

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
      const h = hasFS() ? await recallHandle() : null
      if (!live) return
      if (h) {
        handle.current = h
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
          await writeHandle(handle.current, out)
          setSaveState('saved')
        } else {
          needsDownload.current = true
          setSaveState('unsaved') // download needed
        }
      } catch (e) {
        setError(e.message)
        setSaveState('error')
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
    handle.current = h
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
  const create = useCallback(async (passphrase, initial = emptyData()) => {
    let h = null
    try {
      h = await pickNewVaultHandle(DEFAULT_NAME)
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
      handle.current = f.handle
      bytes.current = f.bytes
      needsDownload.current = false
      setFileName(f.name)
      setCanWrite(!!f.handle)
      if (f.handle) rememberHandle(f.handle)
      setPhase('locked')
    } catch (e) {
      if (!isAbort(e)) setError(e.message)
    }
  }, [])

  const unlock = useCallback(async (passphrase) => {
    let b = bytes.current
    if (handle.current) {
      if (!(await ensurePermission(handle.current))) throw new Error('Permission to read the file was not granted.')
      b = await readHandle(handle.current)
      bytes.current = b
    }
    if (!b) throw new Error('No file selected.')
    const { data: d, session: s } = await decryptVault(b, passphrase)
    session.current = s
    dataRef.current = normalizeData(d)
    setData(dataRef.current)
    setSaveState(!handle.current && needsDownload.current ? 'unsaved' : 'saved')
    setError('')
    setPhase('unlocked')
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
    handle.current = null
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
      if (phase === 'unlocked' && !canWrite && saveState !== 'saved') {
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

  const value = {
    demo: IS_DEMO, resetDemo,
    phase, data, fileName, saveState, canWrite, error, setError,
    update, create, openFile, unlock, lock, switchFile, changePassphrase, downloadNow,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
