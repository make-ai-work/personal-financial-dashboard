// Android-app behaviour that is not storage: the Back button, coming back from the background, and the backup reminder.
// The pure rules are separate functions so they can be tested; the Capacitor calls are only here.
// Tests set globalThis.__DASHBOARD_APP_TEST__.app = { onBack(cb), onState(cb), exit() } to stand in for the phone.

const testApp = () => globalThis.__DASHBOARD_APP_TEST__?.app || null

// What the Back button does: close an open dialog first, then go to Home, and leave the app from Home.
export const backAction = ({ modalOpen, tab }) => (modalOpen ? 'closeModal' : tab !== 'home' ? 'home' : 'exit')

// After the app has been in the background for `awayMs`, lock it if that is at least the auto-lock time (0 = never lock).
export const shouldLockOnResume = ({ awayMs, autoLockMin }) => Number(autoLockMin) > 0 && awayMs >= Number(autoLockMin) * 60_000

// Remembers the Back button / background listeners and returns a function that removes them.
export async function onBackButton(cb) {
  if (testApp()) return testApp().onBack(cb)
  const { App } = await import('@capacitor/app')
  const h = await App.addListener('backButton', () => cb())
  return () => h.remove()
}
export async function onAppActive(cb) {
  if (testApp()) return testApp().onState(cb)
  const { App } = await import('@capacitor/app')
  const h = await App.addListener('appStateChange', ({ isActive }) => cb(isActive))
  return () => h.remove()
}
export async function exitApp() {
  if (testApp()) return testApp().exit?.()
  const { App } = await import('@capacitor/app')
  return App.exitApp()
}

// ---- backup reminder: when the last encrypted backup was exported (kept on this device, not in the vault) ----
const KEY = 'app.lastBackup'
export const lastBackup = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
export const markBackup = (iso = new Date().toISOString()) => { try { localStorage.setItem(KEY, iso) } catch { /* storage unavailable */ } }
// Days since the last backup, or null when there has never been one.
export function backupAgeDays(iso, now = new Date()) {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null
}
export const backupStale = (days) => days === null || days > 30
