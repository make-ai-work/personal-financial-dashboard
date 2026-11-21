// Google sign-in and Google Drive permission inside the Android app, through the phone's own Google account (Google Credential
// Manager, via the @capgo/capacitor-social-login plugin). The browser sign-in used on the web does not work inside an app window.
// Nothing is stored by this app: the name, email and access pass live in memory only. Everything plugin-specific is in this file;
// tests set globalThis.__DASHBOARD_APP_TEST__.google = { login({ clientId, scopes }) } to stand in for the phone.
import { Capacitor } from '@capacitor/core'

const testGoogle = () => globalThis.__DASHBOARD_APP_TEST__?.google || null
export const nativeGoogleAvailable = () => !!testGoogle() || Capacitor.isNativePlatform()

// Google's / the plugin's error text -> words you can act on.
export function explainNativeError(e) {
  const m = String(e?.message || e || '')
  if (/cancel|dismiss|user_cancel|no credential|12501|\[16\]/i.test(m)) return 'The Google sign-in was cancelled.'
  if (/28444|developer console|not set up correctly|10:|DEVELOPER_ERROR/i.test(m)) return 'Google does not recognise this Android app yet. The Android client (package name and signing fingerprint) must be added in Google Cloud. See Settings → Account, or the README.'
  if (/network|timeout|unreachable|unable to resolve/i.test(m)) return 'Could not reach Google. Check your connection.'
  if (/no google account|no accounts|NoCredential/i.test(m)) return 'No Google account was found on this phone. Add one in the phone settings, then try again.'
  return m ? `Google sign-in did not finish: ${m.slice(0, 160)}` : 'Google sign-in did not finish. Try again.'
}

let initialised = ''
// -> { token (or ''), expiresAt, user: { id, email, name, picture } }. `scopes` are extra permissions such as Drive.
export async function nativeGoogleLogin({ clientId, scopes = [] }) {
  try {
    const t = testGoogle()
    const r = t ? await t.login({ clientId, scopes }) : await (async () => {
      const { SocialLogin } = await import('@capgo/capacitor-social-login')
      if (initialised !== clientId) { await SocialLogin.initialize({ google: { webClientId: clientId } }); initialised = clientId }
      const res = await SocialLogin.login({ provider: 'google', options: scopes.length ? { scopes } : {} })
      return res.result
    })()
    const p = r.profile || {}
    if (!p.email) throw new Error('Google did not return a name and email.')
    return {
      token: r.accessToken?.token || '',
      expiresAt: Date.now() + 55 * 60_000, // Google passes live for about an hour; renewed by signing in again
      user: { id: String(p.id || p.email), email: String(p.email), name: String(p.name || p.givenName || p.email), picture: p.imageUrl ? String(p.imageUrl) : '', verified: true },
    }
  } catch (e) { throw new Error(explainNativeError(e)) }
}
