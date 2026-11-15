// Storage for the Android app: the encrypted vault lives in the app's PRIVATE folder (Capacitor Filesystem, Directory.Data),
// which other apps and the file manager cannot see. It is removed if the app is uninstalled or its data is cleared, so the
// app also offers an encrypted backup through the phone's share sheet.
//
// Everything Capacitor-specific is in this file. Tests (and nothing else) can set globalThis.__DASHBOARD_APP_TEST__ =
// { fs: { read, write, remove }, share } to run the same code against an in-memory stand-in.
import { Capacitor } from '@capacitor/core'
import { parseVault } from './vault.js'

export const APP_FILE = 'WealthTracker.wvault'
const TMP_FILE = 'WealthTracker.wvault.tmp'

const hooks = () => globalThis.__DASHBOARD_APP_TEST__ || null
export const isNativeApp = () => !!hooks() || Capacitor.isNativePlatform()

// ---- bytes <-> base64 (the Filesystem plugin speaks base64) ----
export function bytesToBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export const base64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

const isMissing = (e) => /not exist|no such file|not found|does not exist/i.test(String(e?.message || e))

async function nativeFs() {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  return {
    async read(path) {
      try {
        const r = await Filesystem.readFile({ path, directory: Directory.Data })
        return base64ToBytes(typeof r.data === 'string' ? r.data : '')
      } catch (e) {
        if (isMissing(e)) return null
        throw e
      }
    },
    write: (path, bytes) => Filesystem.writeFile({ path, directory: Directory.Data, data: bytesToBase64(bytes), recursive: true }),
    async remove(path) { try { await Filesystem.deleteFile({ path, directory: Directory.Data }) } catch (e) { if (!isMissing(e)) throw e } },
  }
}
const getFs = async () => hooks()?.fs || nativeFs()

const valid = (bytes) => { try { parseVault(bytes); return true } catch { return false } }

export const appVault = {
  // The saved vault. If a save was interrupted and the main copy is damaged, the complete temporary copy is used.
  async read() {
    const fs = await getFs()
    const main = await fs.read(APP_FILE)
    if (main && valid(main)) return main
    const tmp = await fs.read(TMP_FILE)
    if (tmp && valid(tmp)) return tmp
    return main // possibly damaged: the unlock screen reports it, nothing is hidden
  },
  async exists() { return (await this.read()) !== null },
  // Write a complete temporary copy first, then the real file; the temporary copy is removed only when both are done.
  async write(bytes) {
    const fs = await getFs()
    await fs.write(TMP_FILE, bytes)
    await fs.write(APP_FILE, bytes)
    await fs.remove(TMP_FILE)
  },
  async remove() {
    const fs = await getFs()
    await fs.remove(APP_FILE)
    await fs.remove(TMP_FILE)
  },
}

// Hand an encrypted backup to the phone's share sheet (save to Files, send by email, ...).
export async function shareBackup(bytes, name) {
  if (hooks()?.share) return hooks().share({ name, bytes })
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const path = `backups/${name}`
  await Filesystem.writeFile({ path, directory: Directory.Cache, data: bytesToBase64(bytes), recursive: true })
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
  await Share.share({ title: 'Encrypted backup', dialogTitle: 'Save or send your encrypted backup', files: [uri] })
  return undefined
}
