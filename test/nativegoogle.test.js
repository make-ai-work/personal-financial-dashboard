import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = {}
const set = (google) => { globalThis.__DASHBOARD_APP_TEST__ = { google } }
const { nativeGoogleLogin, explainNativeError, nativeGoogleAvailable } = await import('../src/lib/nativegoogle.js')
const { requestGoogleToken, signInWithGoogle } = await import('../src/lib/googleauth.js')
const CLIENT = '123456789012-abcdefghij1234.apps.googleusercontent.com'
const DRIVE = 'https://www.googleapis.com/auth/drive.file'
const ok = { accessToken: { token: 'T1' }, profile: { id: 'u1', email: 'a@b.c', name: 'Ann' } }

test('the phone sign-in returns who you are and a short-lived pass, kept in memory only', async () => {
  set({ login: async () => ok })
  assert.equal(nativeGoogleAvailable(), true)
  const r = await nativeGoogleLogin({ clientId: CLIENT })
  assert.deepEqual([r.user.name, r.user.email, r.token], ['Ann', 'a@b.c', 'T1'])
  assert.ok(r.expiresAt > Date.now() + 50 * 60_000)
})

test('signing in on Android uses the phone, never the browser popup, and asks for identity only', async () => {
  let asked
  set({ login: async (o) => { asked = o; return ok } })
  const u = await signInWithGoogle(CLIENT)
  assert.equal(u.email, 'a@b.c'); assert.deepEqual(asked.scopes, [])
})

test('Drive on Android asks for the Drive permission and returns a pass; a quiet renewal is not attempted', async () => {
  let asked
  set({ login: async (o) => { asked = o; return ok } })
  const r = await requestGoogleToken(CLIENT, { scope: DRIVE, prompt: '' })
  assert.deepEqual(asked.scopes, [DRIVE]); assert.equal(r.token, 'T1')
  await assert.rejects(requestGoogleToken(CLIENT, { scope: DRIVE, prompt: 'none' }), /not available here/)
})

test('no Drive permission given -> a plain explanation', async () => {
  set({ login: async () => ({ accessToken: null, profile: { email: 'a@b.c' } }) })
  await assert.rejects(requestGoogleToken(CLIENT, { scope: DRIVE }), /permission for Drive/)
})

test('Windows: the browser sign-in is asked for the Drive permission; quiet renewal never opens a browser', async () => {
  delete globalThis.__DASHBOARD_APP_TEST__
  const calls = []
  const desktop = { googleToken: async (id, scope) => { calls.push([id, scope]); return 'WT' } }
  const r = await requestGoogleToken(CLIENT, { scope: DRIVE, prompt: '', desktop })
  assert.equal(r.token, 'WT'); assert.deepEqual(calls, [[CLIENT, DRIVE]])
  await assert.rejects(requestGoogleToken(CLIENT, { scope: DRIVE, prompt: 'none', desktop }), /not available here/)
  assert.equal(calls.length, 1)
})

test('errors become plain words', () => {
  assert.match(explainNativeError(new Error('[28444] Developer console is not set up correctly')), /Android client/)
  assert.match(explainNativeError(new Error('User cancelled')), /cancelled/)
  assert.match(explainNativeError(new Error('No credentials available')), /cancelled|Google account/)
  assert.match(explainNativeError(new Error('boom')), /boom/)
})
