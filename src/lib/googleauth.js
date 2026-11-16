// Real "Sign in with Google" for the web and desktop versions, using Google Identity Services (the token popup).
// Only identity is requested (openid, email, profile): the name and email are shown so you can see who is signed in.
// Nothing else is read, no token is kept, and the data file keeps its own passphrase. Each person uses their own client ID.
export const GSI_URL = 'https://accounts.google.com/gsi/client'
export const SCOPES = 'openid email profile'
export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

// Load Google's script once. Resolves with window.google. Rejects with a plain-language error if it cannot load
// (offline, or an ad / privacy blocker).
export function loadGsi({ doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, timeoutMs = 15_000 } = {}) {
  if (win?.google?.accounts?.oauth2) return Promise.resolve(win.google)
  return new Promise((resolve, reject) => {
    if (!doc) return reject(new Error('Google sign-in needs a browser.'))
    const s = doc.createElement('script')
    const timer = setTimeout(() => { s.remove?.(); reject(new Error('Google sign-in did not load in time. Check your connection.')) }, timeoutMs)
    s.src = GSI_URL; s.async = true
    s.onload = () => { clearTimeout(timer); win?.google?.accounts?.oauth2 ? resolve(win.google) : reject(new Error('Google sign-in loaded but is not usable here.')) }
    s.onerror = () => { clearTimeout(timer); reject(new Error('Could not load Google sign-in. Check your connection, and that no ad or privacy blocker is stopping accounts.google.com.')) }
    doc.head.appendChild(s)
  })
}

// Google's error codes -> words.
export function explainGoogleError(code, description = '') {
  switch (code) {
    case 'popup_closed': case 'access_denied': return 'The Google sign-in window was closed before it finished.'
    case 'popup_failed_to_open': return 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
    case 'redirect_uri_mismatch': case 'origin_mismatch': return 'This website address is not on your Google client’s authorised list. Add it under Authorised JavaScript origins in Google Cloud, then try again.'
    case 'invalid_client': return 'Google does not recognise this client ID. Check it in Account → Google connection.'
    default: return description ? `Google said: ${String(description).slice(0, 160)}` : 'Google sign-in did not finish. Try again.'
  }
}

export function parseUserInfo(j) {
  if (!j || !j.sub || !j.email) return null
  return { id: String(j.sub), email: String(j.email), name: String(j.name || j.given_name || j.email), picture: j.picture ? String(j.picture) : '', verified: j.email_verified !== false }
}

// Open the Google popup, then read who signed in. gsi / fetchImpl are injectable for tests.
export async function signInWithGoogle(clientId, { gsi, fetchImpl = fetch, desktop } = {}) {
  // The Windows app signs in through the user's browser (Google refuses sign-in inside an app's own window).
  const dd = desktop === undefined ? (typeof window !== 'undefined' ? window.desktopApp : null) : desktop
  const useDesktop = !gsi && !!dd?.googleToken
  const google = useDesktop ? null : (gsi || (await loadGsi()))
  const token = useDesktop ? await dd.googleToken(clientId).catch((e) => { throw new Error(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }) : await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp) => (resp?.error ? reject(new Error(explainGoogleError(resp.error, resp.error_description))) : resolve(resp.access_token)),
      error_callback: (err) => reject(new Error(explainGoogleError(err?.type, err?.message))),
    })
    client.requestAccessToken({ prompt: 'select_account' })
  })
  let json
  try {
    const res = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('bad status')
    json = await res.json()
  } catch { throw new Error('Signed in, but Google would not say who you are. Try again.') }
  const user = parseUserInfo(json)
  if (!user) throw new Error('Google did not return a name and email. Try again.')
  if (!user.verified) throw new Error('That Google account’s email address is not verified.')
  // identity only: the pass is not needed any more
  if (useDesktop) fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {})
  else try { google.accounts.oauth2.revoke?.(token, () => {}) } catch { /* ignore */ }
  return user
}
