import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DRIVE_SCOPE, DriveAuthError, DriveConflictError, connectDrive, createVault, currentVersion, driveToken, forgetDriveToken, listVaults, readVault,
  setDriveClient, writeVault,
} from '../src/lib/drive.js'

const CLIENT = '123456789012-abcdefghij1234.apps.googleusercontent.com'
const bytesOf = (...n) => new Uint8Array(n)

// A stand-in for Google Drive: files with ids, bytes and a modification counter, plus switches for failures.
function fakeDrive() {
  const files = new Map(); let n = 0, clock = 1000
  const d = { files, calls: [], fail: [], auth: 'ok' }
  const stamp = () => new Date(++clock * 1000).toISOString()
  d.fetch = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET'
    d.calls.push([method, u.pathname + u.search, init.headers?.Authorization])
    const next = d.fail.shift()
    if (next) return next
    const json = (obj, status = 200) => ({ ok: status < 300, status, json: async () => obj, arrayBuffer: async () => new ArrayBuffer(0) })
    if (init.headers?.Authorization !== 'Bearer TOKEN') return json({ error: { message: 'Invalid Credentials' } }, 401)
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q'); const name = /name = '([^']+)'/.exec(q)[1]
      return json({ files: [...files.entries()].filter(([, f]) => f.name === name && !f.trashed).map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime, size: String(f.bytes.length) })).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1)) })
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const text = Buffer.from(init.body).toString('latin1')
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(text)[1])
      const start = text.indexOf('application/octet-stream\r\n\r\n') + 'application/octet-stream\r\n\r\n'.length
      const bytes = new Uint8Array(Buffer.from(text.slice(start, text.lastIndexOf('\r\n--')), 'latin1'))
      const id = `file${++n}`; files.set(id, { name: meta.name, bytes, modifiedTime: stamp() })
      return json({ id, name: meta.name, modifiedTime: files.get(id).modifiedTime })
    }
    const m = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(u.pathname)
    if (m) {
      const f = files.get(m[1]); if (!f) return json({ error: { message: 'File not found' } }, 404)
      if (method === 'PATCH') { f.bytes = new Uint8Array(init.body); f.modifiedTime = stamp(); return json({ modifiedTime: f.modifiedTime }) }
      if (u.searchParams.get('alt') === 'media') return { ok: true, status: 200, arrayBuffer: async () => f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.length) }
      return json({ modifiedTime: f.modifiedTime })
    }
    return json({}, 400)
  }
  return d
}
const requester = (log = []) => async (id, { scope, prompt }) => { log.push([id, scope, prompt]); return { token: 'TOKEN', expiresAt: Date.now() + 3_600_000 } }
const opts = (d, r) => ({ fetchImpl: d.fetch, requester: r, delays: [0, 0] })
const fresh = () => { setDriveClient(''); setDriveClient(CLIENT); forgetDriveToken() }

test('token: asks quietly first, then (from a click) with a window; reuses it; refuses without a client ID; never interactive when not asked', async () => {
  fresh(); const log = []
  const r = async (id, o) => { log.push(o.prompt); if (o.prompt === 'none') throw new Error('no session'); return { token: 'TOKEN', expiresAt: Date.now() + 3_600_000 } }
  await assert.rejects(driveToken({ interactive: false, requester: r }), DriveAuthError)
  assert.deepEqual(log, ['none'])
  assert.equal(await driveToken({ interactive: true, requester: r }), 'TOKEN'); assert.deepEqual(log, ['none', 'none', ''])
  assert.equal(await driveToken({ interactive: false, requester: r }), 'TOKEN'); assert.equal(log.length, 3, 'a valid pass is reused')
  setDriveClient(''); await assert.rejects(driveToken({ interactive: true, requester: r }), /not set up/)
  fresh(); const seen = []; await driveToken({ requester: requester(seen) }); assert.deepEqual(seen[0].slice(1), [DRIVE_SCOPE, 'none'])
})

test('create, list, read and write: only ciphertext bytes travel, with the bearer pass', async () => {
  fresh(); const d = fakeDrive(), o = opts(d, requester())
  const a = await createVault(bytesOf(87, 86, 76, 84, 49, 1, 2, 3), o)
  assert.equal(a.name, 'WealthTracker.wvault'); assert.deepEqual([...d.files.get(a.id).bytes], [87, 86, 76, 84, 49, 1, 2, 3])
  const list = await listVaults(o); assert.deepEqual(list.map((f) => f.id), [a.id]); assert.equal(list[0].size, 8)
  const r = await readVault(a.id, o); assert.deepEqual([...r.bytes], [87, 86, 76, 84, 49, 1, 2, 3]); assert.equal(r.modifiedTime, a.modifiedTime)
  const w = await writeVault(a.id, bytesOf(9, 9), { ...o, known: r.modifiedTime }); assert.deepEqual([...d.files.get(a.id).bytes], [9, 9]); assert.notEqual(w.modifiedTime, a.modifiedTime)
  assert.ok(d.calls.every((c) => c[2] === 'Bearer TOKEN'))
  assert.ok(d.calls.some((c) => /q=name%20%3D%20'WealthTracker\.wvault'%20and%20trashed%20%3D%20false/.test(c[1]) || c[1].includes('WealthTracker.wvault')), 'the search is for this app’s file name only')
})

test('newest vault first when there are several', async () => {
  fresh(); const d = fakeDrive(), o = opts(d, requester())
  const first = await createVault(bytesOf(1), o); const second = await createVault(bytesOf(2), o)
  assert.deepEqual((await listVaults(o)).map((f) => f.id), [second.id, first.id])
})

test('conflict: a save is refused when the file changed since it was read; force overwrites; the version can be refreshed', async () => {
  fresh(); const d = fakeDrive(), o = opts(d, requester())
  const a = await createVault(bytesOf(1), o)
  const mine = await readVault(a.id, o)
  await writeVault(a.id, bytesOf(2), { ...o }) // another device saved
  await assert.rejects(writeVault(a.id, bytesOf(3), { ...o, known: mine.modifiedTime }), DriveConflictError)
  assert.deepEqual([...d.files.get(a.id).bytes], [2], 'nothing was overwritten')
  await writeVault(a.id, bytesOf(3), { ...o, known: mine.modifiedTime, force: true }); assert.deepEqual([...d.files.get(a.id).bytes], [3])
  const v = await currentVersion(a.id, o); await writeVault(a.id, bytesOf(4), { ...o, known: v }); assert.deepEqual([...d.files.get(a.id).bytes], [4])
})

test('401: the pass is renewed once and the request repeated; a second 401 asks the user to reconnect', async () => {
  fresh(); const d = fakeDrive(), log = []
  const o = opts(d, requester(log))
  const a = await createVault(bytesOf(1), o)
  forgetDriveToken(); let first = true
  const flaky = { ...o, fetchImpl: async (u, i) => { if (first) { first = false; return { ok: false, status: 401, json: async () => ({}) } } return d.fetch(u, i) } }
  assert.deepEqual([...(await readVault(a.id, flaky)).bytes], [1])
  const dead = { ...o, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) }
  await assert.rejects(listVaults(dead), DriveAuthError)
})

test('errors come out in plain words: missing file, API off, limits, server trouble (retried), no connection', async () => {
  fresh(); const d = fakeDrive(), o = opts(d, requester())
  await assert.rejects(readVault('nope', o), /no longer in your Google Drive/)
  d.fail.push({ ok: false, status: 403, json: async () => ({ error: { message: 'Google Drive API has not been used in project 1 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }] } }) })
  await assert.rejects(listVaults(o), /Drive API is not enabled/)
  d.fail.push({ ok: false, status: 403, json: async () => ({ error: { message: 'Rate Limit Exceeded' } }) })
  await assert.rejects(listVaults(o), /limiting requests/)
  d.fail.push({ ok: false, status: 503, json: async () => ({}) }, { ok: false, status: 503, json: async () => ({}) })
  assert.deepEqual(await listVaults(o), [], 'two server errors, then it works')
  d.fail.push({ ok: false, status: 500, json: async () => ({}) }, { ok: false, status: 500, json: async () => ({}) }, { ok: false, status: 500, json: async () => ({}) })
  await assert.rejects(listVaults(o), /problem/)
  await assert.rejects(listVaults({ ...o, fetchImpl: async () => { throw new Error('offline') } }), /Could not reach Google Drive/)
})

test('connect asks for the pass with a window when needed', async () => {
  fresh(); const log = []
  const r = async (id, o) => { log.push(o.prompt); if (o.prompt === 'none') throw new Error('x'); return { token: 'TOKEN', expiresAt: Date.now() + 3_600_000 } }
  assert.equal(await connectDrive({ requester: r }), true); assert.deepEqual(log, ['none', ''])
})
