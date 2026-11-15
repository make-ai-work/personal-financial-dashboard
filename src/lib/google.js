// Google connection settings. The OAuth client ID is NOT a secret (it is visible in every page that uses
// Google sign-in), so it can live in the browser. A client SECRET is never needed and is refused.
// Every person uses their own client ID, so each one sets it up once in their own browser.

const ID_RE = /^[0-9]{6,}-[a-z0-9]{8,}\.apps\.googleusercontent\.com$/i

export const looksLikeSecret = (v) => /GOCSPX|client_secret/i.test(String(v))
export const isClientId = (v) => ID_RE.test(String(v).trim())

// { ok, error } for the setup box. Empty input is neither valid nor an error yet.
export function validateClientId(v) {
  const s = String(v ?? '').trim()
  if (!s) return { ok: false, error: '' }
  if (looksLikeSecret(s)) return { ok: false, error: 'That looks like a client secret. Do not paste it here: use the Client ID instead, which ends in .apps.googleusercontent.com.' }
  if (!isClientId(s)) return { ok: false, error: 'That does not look like a client ID. It should look like 1234567890-abcdefg.apps.googleusercontent.com.' }
  return { ok: true, error: '' }
}

// Should the setup screen come before sign-in? Not once a valid ID is saved, or when it was skipped.
export const needsSetup = ({ clientId, skipped }) => !isClientId(clientId || '') && !skipped

// Shortened for display: 1234567890-abcdefg…
export const shortId = (id) => (id.length > 26 ? id.slice(0, 24) + '…' : id)
