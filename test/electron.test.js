import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'

const require = createRequire(import.meta.url)
const { createAppServer } = require('../electron/server.cjs')
const { createOAuth } = require('../electron/oauth.cjs')
const { createVaultFiles } = require('../electron/files.cjs')

const tmp = () => mkdtempSync(path.join(tmpdir(), 'desk-'))
const get = (port, p, { method = 'GET', host, headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: host || `localhost:${port}`, ...headers } }, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], text: Buffer.concat(chunks).toString() }))
  })
  req.on('error', reject); if (body) req.write(body); req.end()
})

test('server: serves the built app, types, the single page for unknown routes, and refuses everything else', async () => {
  const root = tmp(); mkdirSync(path.join(root, 'assets')); writeFileSync(path.join(root, 'index.html'), '<h1>app</h1>'); writeFileSync(path.join(root, 'assets', 'a.js'), 'x=1')
  writeFileSync(path.join(path.dirname(root), 'secret.txt'), 'nope')
  const s = createAppServer({ root }); const { port, origin } = await s.listen(0)
  try {
    assert.equal(origin, `http://localhost:${port}`)
    const home = await get(port, '/'); assert.deepEqual([home.status, home.type, home.text], [200, 'text/html; charset=utf-8', '<h1>app</h1>'])
    const js = await get(port, '/assets/a.js'); assert.deepEqual([js.status, js.type], [200, 'text/javascript; charset=utf-8'])
    assert.equal((await get(port, '/some/page')).text, '<h1>app</h1>') // one-page app
    assert.equal((await get(port, '/assets/missing.js')).status, 404)
    assert.ok([403, 404].includes((await get(port, '/..%2Fsecret.txt')).status)); assert.ok(!(await get(port, '/..%2F..%2Fsecret.txt')).text.includes('nope'))
    assert.equal((await get(port, '/', { host: 'evil.example.com' })).status, 403) // wrong Host (rebinding)
    assert.equal((await get(port, '/', { host: `localhost:${port + 1}` })).status, 403)
    assert.equal((await get(port, '/', { method: 'DELETE' })).status, 405)
    assert.equal((await get(port, '/', { method: 'POST' })).status, 405)
  } finally { await s.close() }
})

test('server: the sign-in return page and the answer endpoint only accept our own page', async () => {
  const root = tmp(); writeFileSync(path.join(root, 'index.html'), 'x')
  const seen = []
  const s = createAppServer({ root, onOAuthResult: (r) => { seen.push(r); return { ok: true } } }); const { port } = await s.listen(0)
  try {
    const page = await get(port, '/oauth-callback'); assert.equal(page.status, 200); assert.ok(page.text.includes('/oauth-result') && page.text.includes('replaceState'))
    const body = JSON.stringify({ state: 'S1', access_token: 'TKN' })
    assert.equal((await get(port, '/oauth-result', { method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${port}` } })).status, 200)
    assert.deepEqual(seen[0], { state: 'S1', access_token: 'TKN', error: '' })
    assert.equal((await get(port, '/oauth-result', { method: 'POST', body, headers: { Origin: 'https://evil.example.com' } })).status, 403)
    assert.equal((await get(port, '/oauth-result', { method: 'GET' })).status, 405)
    assert.equal(seen.length, 1)
  } finally { await s.close() }
})

test('oauth: the browser opens Google with identity-only scopes and a one-time state; only that state is accepted, once', async () => {
  let opened
  const o = createOAuth({ origin: 'http://localhost:53682', openExternal: (u) => { opened = u } })
  const { url, state, promise } = o.begin('ID.apps.googleusercontent.com')
  const u = new URL(opened); assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.deepEqual([u.searchParams.get('client_id'), u.searchParams.get('redirect_uri'), u.searchParams.get('response_type'), u.searchParams.get('scope'), u.searchParams.get('state')], ['ID.apps.googleusercontent.com', 'http://localhost:53682/oauth-callback', 'token', 'openid email profile', state])
  assert.equal(url, opened)
  assert.equal(o.handleResult({ state: 'wrong', access_token: 'T' }).ok, false)
  assert.equal(o.handleResult({ state, access_token: 'T' }).ok, true)
  assert.equal(await promise, 'T')
  assert.equal(o.handleResult({ state, access_token: 'T2' }).ok, false, 'a state works once')
  assert.equal(o.pendingCount(), 0)
})

test('oauth: a cancelled or refused sign-in and a timeout are explained', async () => {
  const o = createOAuth({ origin: 'http://localhost:1', openExternal: () => {}, timeoutMs: 30 })
  const a = o.begin('x'); a.promise.catch(() => {}); o.handleResult({ state: a.state, error: 'access_denied' }); await assert.rejects(a.promise, /cancelled/)
  const b = o.begin('x'); b.promise.catch(() => {}); o.handleResult({ state: b.state, error: 'redirect_uri_mismatch' }); await assert.rejects(b.promise, /redirect list/)
  const c = o.begin('x'); await assert.rejects(c.promise, /not finished in time/)
  const d = createOAuth({ origin: 'http://localhost:1', openExternal: () => Promise.reject(new Error('no browser')) }).begin('x'); await assert.rejects(d.promise, /open your browser/)
})

test('files: only files chosen in a dialog can be read or written; writes are atomic; the last file is remembered', () => {
  const dir = tmp(); const f = createVaultFiles({ stateFile: path.join(dir, 'state', 'state.json') })
  const vault = path.join(dir, 'My.wvault')
  assert.throws(() => f.read(vault), /not chosen in this app/); assert.throws(() => f.writeAtomic(vault, new Uint8Array([1])), /not chosen/)
  f.allow(vault)
  f.writeAtomic(vault, new Uint8Array([1, 2, 3])); assert.deepEqual([...f.read(vault)], [1, 2, 3]); assert.ok(!existsSync(vault + '.tmp'))
  f.writeAtomic(vault, new Uint8Array([9])); assert.deepEqual([...readFileSync(vault)], [9])
  assert.throws(() => f.read(path.join(dir, 'other.txt')), /not chosen/); assert.throws(() => f.read(path.join(dir, '..', 'x')), /not chosen/)
  assert.equal(f.last(), null); f.remember(vault)
  const again = createVaultFiles({ stateFile: path.join(dir, 'state', 'state.json') }) // a new start of the app
  assert.deepEqual(again.last(), { path: vault, name: 'My.wvault' }); assert.deepEqual([...again.read(vault)], [9])
  again.forget(); assert.equal(createVaultFiles({ stateFile: path.join(dir, 'state', 'state.json') }).last(), null)
  assert.throws(() => again.remember(path.join(dir, 'unchosen.wvault')), /not chosen/)
})
