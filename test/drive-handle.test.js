import test from 'node:test'
import assert from 'node:assert/strict'

// fileio with a stand-in for localStorage: how the Google Drive choice is remembered, and that it never disturbs the other choices.
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
globalThis.window = {}
const io = await import('../src/lib/fileio.js')
const drive = await import('../src/lib/drive.js')
const CLIENT = '123456789012-abcdefghij1234.apps.googleusercontent.com'

test('a Drive handle is remembered by id and name only, and recalled only while Google is set up', async () => {
  drive.setDriveClient(CLIENT)
  const h = io.driveHandle({ id: 'F1', name: 'WealthTracker.wvault', modifiedTime: '2026-11-21T10:00:00.000Z' })
  assert.deepEqual([h.kind, h.id, h.version], ['drive', 'F1', '2026-11-21T10:00:00.000Z'])
  await io.rememberHandle(h)
  assert.deepEqual(JSON.parse(store.get('vault.drive')), { id: 'F1', name: 'WealthTracker.wvault' }) // nothing else, and no pass or email
  assert.equal(io.driveRemembered(), true)
  const back = await io.recallHandle(); assert.deepEqual([back.kind, back.id, back.version], ['drive', 'F1', ''])
  drive.setDriveClient(''); assert.equal(io.driveRemembered(), false, 'without a Google client the Drive choice is not used')
  assert.equal(await io.recallHandle(), null) // falls back to the other choices (none here)
})

test('choosing another storage forgets Drive; forgetting clears it; it is never required', async () => {
  drive.setDriveClient(CLIENT)
  await io.rememberHandle(io.driveHandle({ id: 'F2', name: 'x' })); assert.ok(store.has('vault.drive'))
  await io.rememberHandle({ kind: 'app' }); assert.ok(!store.has('vault.drive'), 'moving to the app’s own storage drops the Drive choice')
  await io.rememberHandle(io.driveHandle({ id: 'F3', name: 'x' })); await io.forgetHandle(); assert.ok(!store.has('vault.drive'))
  assert.equal(io.isDriveHandle({ kind: 'drive' }), true); assert.equal(io.isDriveHandle({ kind: 'app' }), false); assert.equal(io.isDriveHandle(null), false)
  store.set('vault.drive', 'not json'); assert.equal(io.driveRemembered(), false)
})
