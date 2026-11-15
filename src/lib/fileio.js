// File access. Chrome/Edge can open a file and save back to the same file (File System Access API).
// Other browsers fall back to a file input for opening and a download for saving.
// In the Android app the vault lives in the app's private folder (see appstorage.js); it is represented by APP_HANDLE.
import { APP_FILE, appVault, isNativeApp } from './appstorage.js'

export const APP_HANDLE = { kind: 'app', name: APP_FILE }
export const isAppHandle = (h) => h?.kind === 'app'

// The app never uses the desktop file pickers: its vault is in the app's folder, and restores use the plain file chooser.
export const hasFS = () =>
  !isNativeApp() && typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window

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
  if (!hasFS()) return null
  return window.showSaveFilePicker({ suggestedName, types: VAULT_TYPES })
}

export async function readHandle(handle) {
  if (isAppHandle(handle)) return appVault.read()
  const file = await handle.getFile()
  return new Uint8Array(await file.arrayBuffer())
}

export async function writeHandle(handle, bytes) {
  if (isAppHandle(handle)) return appVault.write(bytes)
  const w = await handle.createWritable()
  await w.write(bytes)
  await w.close()
}

export async function ensurePermission(handle, mode = 'readwrite') {
  if (isAppHandle(handle)) return true
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
export const rememberHandle = (h) => (isAppHandle(h) ? undefined : idbRun('readwrite', (s) => s.put(h, 'vault')).catch(() => {}))
export const recallHandle = async () => (isNativeApp() ? ((await appVault.exists()) ? APP_HANDLE : null) : idbRun('readonly', (s) => s.get('vault')).catch(() => null))
export const forgetHandle = () => (isNativeApp() ? undefined : idbRun('readwrite', (s) => s.delete('vault')).catch(() => {}))
