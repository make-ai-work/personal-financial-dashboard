// "Run as an app": the web version can be installed (own window, Start-menu and taskbar icon, quick start, opens offline).
// This file registers the small service worker and keeps the browser's install offer so Settings can show an Install button.
// Not used inside the Windows (Electron) app or the Android app, which are apps already.
import { isNativeApp } from './appstorage.js'

let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((f) => f())

export const isDesktopApp = () => typeof window !== 'undefined' && !!window.desktopApp
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
export const appModeAvailable = () => typeof window !== 'undefined' && !isDesktopApp() && !isNativeApp()

// Call once at start-up, before the page renders, so the browser's offer is not missed.
export function startPwa() {
  if (!appModeAvailable()) return
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => { /* the app works the same without it */ })
  }
}

export const canPrompt = () => !!deferred
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// -> 'accepted' | 'dismissed' | 'unavailable'
export async function promptInstall() {
  if (!deferred) return 'unavailable'
  const offer = deferred
  deferred = null
  notify()
  offer.prompt()
  try { return (await offer.userChoice).outcome } catch { return 'dismissed' }
}
