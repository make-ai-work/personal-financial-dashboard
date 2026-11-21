// Google sign-in for the desktop app, done in the user's normal browser (Google does not allow sign-in inside an app's own window).
// The app opens Google's page with a one-time `state`; Google sends the browser back to http://localhost:<port>/oauth-callback;
// the local server hands the answer to resolve(). Only the access pass for identity (openid email profile) is asked for.
const crypto = require('node:crypto')

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPE = 'openid email profile'
// Only these permissions can be asked for: identity, and Google Drive limited to files this app created.
const ALLOWED = new Set(['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'])
const cleanScope = (scope) => {
  const parts = String(scope || SCOPE).split(/\s+/).filter(Boolean)
  if (!parts.length || parts.some((x) => !ALLOWED.has(x))) throw new Error('That Google permission is not allowed in this app.')
  return parts.join(' ')
}

function createOAuth({ origin, openExternal, timeoutMs = 5 * 60_000 }) {
  const pending = new Map() // state -> { resolve, reject, timer }
  const redirectUri = `${origin}/oauth-callback`

  function begin(clientId, scope) {
    const scopes = cleanScope(scope)
    const state = crypto.randomBytes(24).toString('base64url')
    const url = `${AUTH_URL}?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'token', scope: scopes, state, prompt: 'select_account', include_granted_scopes: 'false' })}`
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(state); reject(new Error('Google sign-in was not finished in time. Try again.')) }, timeoutMs)
      pending.set(state, { resolve, reject, timer })
    })
    Promise.resolve(openExternal(url)).catch((e) => { const p = pending.get(state); if (p) { clearTimeout(p.timer); pending.delete(state); p.reject(new Error('Could not open your browser for Google sign-in.')) } })
    return { url, state, promise }
  }

  // The answer from the browser. Unknown or reused state values are refused.
  function handleResult({ state, access_token: token, error }) {
    const p = pending.get(state)
    if (!p) return { ok: false, message: 'This sign-in link is not valid any more. Go back to the app and try again.' }
    pending.delete(state)
    clearTimeout(p.timer)
    if (error || !token) { p.reject(new Error(error === 'access_denied' ? 'The Google sign-in was cancelled.' : error === 'redirect_uri_mismatch' ? 'This address is not on your Google client’s authorised redirect list. Add it in Google Cloud, then try again.' : 'Google sign-in did not finish. Try again.')); return { ok: false, message: 'Sign-in was not completed.' } }
    p.resolve(token)
    return { ok: true }
  }
  return { begin, handleResult, redirectUri, pendingCount: () => pending.size }
}

module.exports = { createOAuth, AUTH_URL, SCOPE, ALLOWED, cleanScope }
