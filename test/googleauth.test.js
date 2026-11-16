import test from 'node:test'
import assert from 'node:assert/strict'
import { explainGoogleError, loadGsi, parseUserInfo, signInWithGoogle, SCOPES, USERINFO_URL } from '../src/lib/googleauth.js'

const fakeGsi = ({ error, errorCb, token = 'TKN' } = {}) => {
  const seen = { revoked: null, init: null, req: null }
  return { seen, accounts: { oauth2: {
    initTokenClient: (cfg) => { seen.init = cfg; return { requestAccessToken: (o) => { seen.req = o; if (errorCb) cfg.error_callback(errorCb); else if (error) cfg.callback({ error }); else cfg.callback({ access_token: token }) } } },
    revoke: (t, cb) => { seen.revoked = t; cb?.() },
  } } }
}
const info = (j, ok = true) => async (url, opt) => ({ ok, json: async () => j, url, opt })

test('only identity is requested: openid, email, profile', () => { assert.equal(SCOPES, 'openid email profile') })

test('sign-in returns name and email and asks with the client ID; the pass is not revoked (that would also remove Google’s saved approval)', async () => {
  const gsi = fakeGsi()
  let asked
  const user = await signInWithGoogle('ID.apps.googleusercontent.com', { gsi, fetchImpl: async (url, opt) => { asked = { url, opt }; return { ok: true, json: async () => ({ sub: '42', email: 'sam@example.com', name: 'Sam', picture: 'http://p', email_verified: true }) } } })
  assert.deepEqual(user, { id: '42', email: 'sam@example.com', name: 'Sam', picture: 'http://p', verified: true })
  assert.deepEqual([gsi.seen.init.client_id, gsi.seen.init.scope, gsi.seen.req.prompt], ['ID.apps.googleusercontent.com', SCOPES, 'select_account'])
  assert.equal(asked.url, USERINFO_URL); assert.equal(asked.opt.headers.Authorization, 'Bearer TKN')
  assert.equal(gsi.seen.revoked, null)
})

test('a closed window, a blocked popup, a wrong origin and a refused user all give plain messages', async () => {
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi({ errorCb: { type: 'popup_closed' } }) }), /window was closed/)
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi({ errorCb: { type: 'popup_failed_to_open' } }) }), /Allow pop-ups/)
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi({ error: 'redirect_uri_mismatch' }) }), /authorised list/)
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi({ error: 'access_denied' }) }), /closed before it finished/)
  assert.match(explainGoogleError('invalid_client'), /does not recognise/); assert.match(explainGoogleError('weird', 'some text'), /Google said: some text/); assert.match(explainGoogleError(undefined), /did not finish/)
})

test('problems reading who signed in: a bad answer, a missing email, an unverified email', async () => {
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi(), fetchImpl: info({}, false) }), /would not say who you are/)
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi(), fetchImpl: info({ sub: '1' }) }), /did not return a name and email/)
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi(), fetchImpl: info({ sub: '1', email: 'a@b.c', email_verified: false }) }), /not verified/)
  assert.equal(parseUserInfo(null), null); assert.equal(parseUserInfo({ sub: '1', email: 'a@b.c' }).name, 'a@b.c')
})

test('loading the script: already there, loads once, and fails in words when blocked', async () => {
  const win = { google: { accounts: { oauth2: {} } } }
  assert.equal(await loadGsi({ doc: null, win }), win.google)
  const mk = (behaviour) => { const doc = { head: { appendChild: (s) => setTimeout(() => behaviour(s, win2), 0) }, createElement: () => ({ remove() {} }) }; const win2 = {}; return { doc, win: win2 } }
  const ok = mk((s, w) => { w.google = { accounts: { oauth2: {} } }; s.onload() })
  assert.ok((await loadGsi({ ...ok })).accounts)
  const blocked = mk((s) => s.onerror())
  await assert.rejects(loadGsi({ ...blocked }), /ad or privacy blocker/)
  const unusable = mk((s) => s.onload())
  await assert.rejects(loadGsi({ ...unusable }), /not usable here/)
  await assert.rejects(loadGsi({ doc: null, win: {} }), /needs a browser/)
})

test('quiet sign-in asks Google with prompt none, gives up quietly on any error or silence, and is never used in the Windows app', async () => {
  const gsi = fakeGsi()
  const user = await signInWithGoogle('x', { gsi, silent: true, fetchImpl: info({ sub: '1', email: 'a@b.c', name: 'A', email_verified: true }) })
  assert.equal(user.email, 'a@b.c'); assert.equal(gsi.seen.req.prompt, 'none')
  await assert.rejects(signInWithGoogle('x', { gsi: fakeGsi({ error: 'interaction_required' }), silent: true }), /Google said|did not finish/)
  const silentGoogle = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: () => {} }) } } } // never answers
  await assert.rejects(signInWithGoogle('x', { gsi: silentGoogle, silent: true, timeoutMs: 30 }), /did not answer/)
  await assert.rejects(signInWithGoogle('x', { desktop: { googleToken: async () => 'T' }, silent: true }), /not available here/)
})
