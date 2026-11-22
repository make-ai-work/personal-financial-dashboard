// Optional storage: keep the ENCRYPTED vault file in the user's own Google Drive. Only ciphertext ever leaves the device; the passphrase
// and the data inside stay on it. This is one more choice next to "a file on this computer" (and the app's own storage on Android):
// nothing is required to use it, and the other options are untouched.
//
//  - Scope: drive.file, i.e. only files THIS app created. It cannot see anything else in the Drive. The file is named
//    WealthTracker.wvault and is visible in My Drive, so you can see it, download it, or restore a version.
//  - The access pass lives in memory (about an hour) and is renewed quietly when Google still has you signed in; when it cannot be, the
//    app keeps your changes and shows "Reconnect". Nothing about the pass is stored.
//  - Two devices: a save first checks the file has not changed since this copy last read or wrote it; if it has, nothing is
//    overwritten (DriveConflictError) and you choose.
//  - Only the file's id and name are remembered on this device (to find it next time); they are not secrets.
import { isClientId } from './google.js'
import { requestGoogleToken } from './googleauth.js'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DRIVE_FILE = 'WealthTracker.wvault'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

// The pass is missing or expired and could not be renewed quietly: the user must press Reconnect.
export class DriveAuthError extends Error { constructor(m = 'Google Drive needs you to reconnect.') { super(m); this.name = 'DriveAuthError' } }
// The file in Drive changed after this copy last read or wrote it (another device saved).
export class DriveConflictError extends Error { constructor(m = 'This file was changed on another device since you opened it.') { super(m); this.name = 'DriveConflictError' } }

const state = { clientId: '', token: null, expiresAt: 0 }
export const setDriveClient = (id) => { const next = String(id || '').trim(); if (next !== state.clientId) { state.clientId = next; state.token = null; state.expiresAt = 0 } }
export const driveClientReady = () => isClientId(state.clientId)
export const forgetDriveToken = () => { state.token = null; state.expiresAt = 0 }
export const hasDriveToken = () => !!state.token && state.expiresAt - Date.now() > 60_000

// A pass for Drive. interactive: may show Google's window (call it from a click); otherwise only a quiet renewal is tried.
export async function driveToken({ interactive = false, requester = requestGoogleToken } = {}) {
  if (hasDriveToken()) return state.token
  if (!driveClientReady()) throw new Error('Google is not set up yet. Add your client ID in Settings → Account.')
  const save = (r) => { state.token = r.token; state.expiresAt = r.expiresAt; return r.token }
  try { return save(await requester(state.clientId, { scope: DRIVE_SCOPE, prompt: 'none' })) } catch { /* quiet renewal failed */ }
  if (!interactive) throw new DriveAuthError()
  return save(await requester(state.clientId, { scope: DRIVE_SCOPE, prompt: '' }))
}

const explain = (status, body) => {
  const msg = body?.error?.message ? String(body.error.message).slice(0, 140) : ''
  if (status === 404) return 'The file is no longer in your Google Drive (deleted, or not created by this app).'
  if (status === 403) return /rate|quota/i.test(msg) ? 'Google Drive is limiting requests right now. Try again in a minute.' : /has not been used|disabled|accessNotConfigured/i.test(msg + (body?.error?.errors?.[0]?.reason || '')) ? 'The Google Drive API is not enabled for your Google project. Enable it in Google Cloud (APIs & Services → Library).' : `Google Drive refused the request${msg ? `: ${msg}` : ''}.`
  if (status === 429) return 'Google Drive is limiting requests right now. Try again in a minute.'
  if (status >= 500) return 'Google Drive had a problem. Try again in a moment.'
  return `Google Drive said no (${status})${msg ? `: ${msg}` : ''}.`
}

// One authorised request with one quiet renewal on 401 and two retries on busy/server errors. Returns the Response.
async function call(url, init = {}, { fetchImpl = fetch, interactive = false, requester, delays = [800, 2500] } = {}) {
  let renewed = false
  for (let attempt = 0; ; attempt++) {
    const token = await driveToken({ interactive, requester })
    let res
    try { res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } }) } catch {
      if (attempt < delays.length) { await new Promise((r) => setTimeout(r, delays[attempt])); continue }
      throw new Error('Could not reach Google Drive. Check your connection.')
    }
    if (res.ok) return res
    if (res.status === 401 && !renewed) { renewed = true; forgetDriveToken(); continue }
    if (res.status === 401) throw new DriveAuthError()
    if ((res.status === 429 || res.status >= 500) && attempt < delays.length) { await new Promise((r) => setTimeout(r, delays[attempt])); continue }
    let body = null
    try { body = await res.json() } catch { /* no details */ }
    throw new Error(explain(res.status, body))
  }
}

// Ask for the pass (from a click), e.g. before the first Drive action or after "Reconnect".
export async function connectDrive(opts = {}) { await driveToken({ interactive: true, requester: opts.requester }); return true }

// This app's vault files, newest first: [{ id, name, modifiedTime, size }]
export async function listVaults(opts = {}) {
  const q = encodeURIComponent(`name = '${DRIVE_FILE}' and trashed = false`)
  const res = await call(`${API}/files?q=${q}&spaces=drive&pageSize=20&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`, {}, opts)
  const j = await res.json()
  return (j.files || []).map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: Number(f.size) || 0 }))
}

const multipart = (meta, bytes) => {
  const boundary = `fd${Math.random().toString(36).slice(2)}${Date.now()}`
  const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`)
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length)
  return { body, type: `multipart/related; boundary=${boundary}` }
}

// Create the vault file. -> { id, name, modifiedTime }
export async function createVault(bytes, opts = {}) {
  const { body, type } = multipart({ name: DRIVE_FILE, mimeType: 'application/octet-stream' }, bytes)
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`, { method: 'POST', headers: { 'Content-Type': type }, body }, opts)
  return res.json()
}

// -> { bytes, modifiedTime }
export async function readVault(id, opts = {}) {
  const meta = await (await call(`${API}/files/${encodeURIComponent(id)}?fields=modifiedTime`, {}, opts)).json()
  const res = await call(`${API}/files/${encodeURIComponent(id)}?alt=media`, {}, opts)
  return { bytes: new Uint8Array(await res.arrayBuffer()), modifiedTime: meta.modifiedTime }
}

// Replace the file's contents, but only if it is still the version this copy last saw (known). -> { modifiedTime }
export async function writeVault(id, bytes, { known, force = false, ...opts } = {}) {
  if (known && !force) {
    const now = await (await call(`${API}/files/${encodeURIComponent(id)}?fields=modifiedTime`, {}, opts)).json()
    if (now.modifiedTime !== known) throw new DriveConflictError()
  }
  const res = await call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes }, opts)
  return res.json()
}

export const currentVersion = async (id, opts = {}) => (await (await call(`${API}/files/${encodeURIComponent(id)}?fields=modifiedTime`, {}, opts)).json()).modifiedTime

// Remove the vault file from Drive (it goes to the Drive bin, so it can still be restored from there). Only a file this app made.
export async function deleteVault(id, opts = {}) {
  await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }, opts)
}

// Permanently delete the vault file (not the bin). Used only by "Wipe data". Only a file this app made.
export async function wipeVault(id, opts = {}) {
  await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' }, opts)
}
