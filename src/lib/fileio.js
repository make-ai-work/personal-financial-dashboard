// File access. Chrome/Edge can open a file and save back to the same file (File System Access API).
// Other browsers fall back to a file input for opening and a download for saving.
// In the Android app the vault lives in the app's private folder (see appstorage.js); it is represented by APP_HANDLE.
import { APP_FILE, appVault, isNativeApp } from './appstorage.js'
import * as drive from './drive.js'

export const APP_HANDLE = { kind: 'app', name: APP_FILE }
export const isAppHandle = (h) => h?.kind === 'app'

// The app never uses the desktop file pickers: its vault is in the app's folder, and restores use the plain file chooser.
export const hasFS = () =>
  isDesktop() || (!isNativeApp() && typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window)

// The Windows (Electron) app: files go through native dialogs and a small, checked bridge (electron/preload.cjs).
const dk = () => (typeof window !== 'undefined' ? window.desktopApp : null)
export const isDesktop = () => !!dk()?.isDesktop
export const isDesktopHandle = (h) => h?.kind === 'desktop'
const desktopHandle = (r) => ({ kind: 'desktop', path: r.path, name: r.name })
const abort = () => new DOMException('Cancelled', 'AbortError')

// Google Drive (optional, web version): the handle holds the file's id and the version this copy last saw (to detect another device saving).
export const isDriveHandle = (h) => h?.kind === 'drive'
export const driveHandle = (f) => ({ kind: 'drive', id: f.id, name: f.name || drive.DRIVE_FILE, version: f.modifiedTime || '' })
const DRIVE_KEY = 'vault.drive' // only the file's id and name (not secrets), so the next visit finds it
const driveStored = () => { try { const j = JSON.parse(localStorage.getItem(DRIVE_KEY)); return j && j.id ? j : null } catch { return null } }
export const driveRemembered = () => !!driveStored() && drive.driveClientReady()

export const isAbort = (e) => e?.name === 'AbortError'

const VAULT_TYPES = [{ description: 'Finance Dashboard vault', accept: { 'application/octet-stream': ['.wvault'] } }]

function pickViaInput(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => (input.files[0] ? resolve(input.files[0]) : reject(new DOMException('No file', 'AbortError')))
    input.oncancel = () => reject(new DOMException('Cancelled', 'AbortError'))
    input.click()
  })
}

export async function pickVault() {
  if (isDesktop()) {
    const r = await dk().openVault()
    if (!r) throw abort()
    return { handle: desktopHandle(r), name: r.name, bytes: new Uint8Array(r.bytes) }
  }
  if (hasFS()) {
    const [handle] = await window.showOpenFilePicker({ types: VAULT_TYPES })
    const file = await handle.getFile()
    return { handle, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
  }
  const file = await pickViaInput('.wvault')
  return { handle: null, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
}

export async function pickExcel() {
  const file = await pickViaInput('.xlsx')
  return { name: file.name, buffer: await file.arrayBuffer() }
}

// Returns a writable handle, or null when the browser can only download.
// In the app there is nothing to pick: the vault goes in the app's folder. An existing vault is never overwritten by accident.
export async function pickNewVaultHandle(suggestedName, { replace = false } = {}) {
  if (isNativeApp()) {
    if (!replace && (await appVault.exists())) throw new Error('A vault is already stored in this app. Open it, or delete it first.')
    return APP_HANDLE
  }
  if (isDesktop()) {
    const r = await dk().saveVaultAs(suggestedName)
    if (!r) throw abort()
    return desktopHandle(r)
  }
  if (!hasFS()) return null
  return window.showSaveFilePicker({ suggestedName, types: VAULT_TYPES })
}

export async function readHandle(handle) {
  if (isAppHandle(handle)) return appVault.read()
  if (isDriveHandle(handle)) { const r = await drive.readVault(handle.id); handle.version = r.modifiedTime; return r.bytes }
  if (isDesktopHandle(handle)) return new Uint8Array(await dk().readVault(handle.path))
  const file = await handle.getFile()
  return new Uint8Array(await file.arrayBuffer())
}

export async function writeHandle(handle, bytes) {
  if (isAppHandle(handle)) return appVault.write(bytes)
  if (isDriveHandle(handle)) { const r = await drive.writeVault(handle.id, bytes, { known: handle.version || undefined }); handle.version = r.modifiedTime; return }
  if (isDesktopHandle(handle)) return dk().writeVault(handle.path, bytes)
  const w = await handle.createWritable()
  await w.write(bytes)
  await w.close()
}

export async function ensurePermission(handle, mode = 'readwrite') {
  if (isDriveHandle(handle)) return drive.connectDrive() // may show Google's window: called from the Unlock click
  if (isAppHandle(handle) || isDesktopHandle(handle)) return true
  const opts = { mode }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

export function download(name, bytes, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// Remember the last file handle so the next visit only needs the passphrase.
const DB = 'finance-dashboard'
const STORE = 'handles'
const openDb = () =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
async function idbRun(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
// The app's vault needs no remembering: it is found in the app's folder.
const setDriveKey = (v) => { try { v ? localStorage.setItem(DRIVE_KEY, JSON.stringify(v)) : localStorage.removeItem(DRIVE_KEY) } catch { /* storage unavailable */ } }
export function rememberHandle(h) {
  if (isDriveHandle(h)) { setDriveKey({ id: h.id, name: h.name }); return undefined }
  setDriveKey(null) // moving back to a file on this computer forgets the Drive choice
  if (isAppHandle(h)) return undefined
  if (isDesktopHandle(h)) return dk().rememberVault(h.path).catch(() => {})
  return idbRun('readwrite', (st) => st.put(h, 'vault')).catch(() => {})
}
export async function recallHandle() {
  const d = driveStored()
  if (d && drive.driveClientReady()) return driveHandle({ id: d.id, name: d.name })
  if (isDesktop()) return dk().lastVault().then((r) => (r ? desktopHandle(r) : null)).catch(() => null)
  if (isNativeApp()) return (await appVault.exists()) ? APP_HANDLE : null
  return idbRun('readonly', (st) => st.get('vault')).catch(() => null)
}
export function forgetHandle() {
  setDriveKey(null)
  if (isDesktop()) return dk().forgetVault().catch(() => {})
  if (isNativeApp()) return undefined
  return idbRun('readwrite', (st) => st.delete('vault')).catch(() => {})
}
