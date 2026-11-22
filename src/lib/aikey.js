// Where the Claude key lives: on THIS device only, in the app's own IndexedDB, like the home inventory app. It is write-only (the app never shows it
// again), and it is never part of the vault, a backup, the Excel export or anything sent anywhere except to Anthropic with a chat message.
// The model name and a "has a key" flag (not secret) are in localStorage so the screens can decide what to show without waiting.
import { DEFAULT_MODEL } from './aichat.js'

const DB = 'finance-dashboard-ai'
const STORE = 'kv'
const FLAG = 'ai.on'
const MODEL = 'ai.model'
const mem = new Map() // used when IndexedDB is not available (tests, some private windows)

const ls = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* storage unavailable */ } },
}
const open = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(STORE)
  r.onsuccess = () => resolve(r.result)
  r.onerror = () => reject(r.error)
})
const run = async (mode, fn) => {
  const db = await open()
  return new Promise((resolve, reject) => { const req = fn(db.transaction(STORE, mode).objectStore(STORE)); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
}

export const hasKeyFlag = () => ls.get(FLAG) === '1'
export const getModel = () => ls.get(MODEL) || DEFAULT_MODEL
export const setModel = (m) => ls.set(MODEL, m && m !== DEFAULT_MODEL ? m : '')

export async function getKey() {
  try { return (await run('readonly', (s) => s.get('key'))) || '' } catch { return mem.get('key') || '' }
}
export async function setKey(key) {
  if (!key) return removeKey()
  try { await run('readwrite', (s) => s.put(key, 'key')) } catch { mem.set('key', key) }
  ls.set(FLAG, '1')
}
export async function removeKey() {
  try { await run('readwrite', (s) => s.delete('key')) } catch { /* nothing stored */ }
  mem.delete('key')
  ls.set(FLAG, '')
}
