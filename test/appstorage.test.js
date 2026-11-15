import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_FILE, appVault, base64ToBytes, bytesToBase64, isNativeApp, shareBackup } from '../src/lib/appstorage.js'
import { APP_HANDLE, ensurePermission, forgetHandle, isAppHandle, pickNewVaultHandle, readHandle, recallHandle, rememberHandle, writeHandle } from '../src/lib/fileio.js'
import { decryptVault, encryptVault, newSession } from '../src/lib/vault.js'
import { emptyData } from '../src/lib/model.js'

// An in-memory stand-in for the app's private folder.
function fakeFs() {
  const files = new Map()
  return {
    files, failOn: null,
    async read(p) { return files.has(p) ? files.get(p) : null },
    async write(p, b) { if (this.failOn === p) throw new Error('disk full'); files.set(p, new Uint8Array(b)) },
    async remove(p) { files.delete(p) },
  }
}
const install = (fs = fakeFs(), shared = []) => { globalThis.__DASHBOARD_APP_TEST__ = { fs, share: async (x) => { shared.push(x) } }; return { fs, shared } }
test.afterEach(() => { delete globalThis.__DASHBOARD_APP_TEST__ })

const makeVault = async (pass = 'correct horse battery staple', mutate = (d) => d) => {
  const s = await newSession(pass)
  return encryptVault(s, mutate(emptyData()))
}

test('base64 round-trips bytes of any size', () => {
  for (const n of [0, 1, 255, 40_000, 100_000]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256)
    assert.deepEqual(base64ToBytes(bytesToBase64(b)), b)
  }
})

test('outside the app (a browser) the native app storage is not in use', () => assert.equal(isNativeApp(), false))

test('the app vault: write, read, exists, remove; the temporary copy is cleaned up', async () => {
  const { fs } = install()
  assert.equal(isNativeApp(), true)
  assert.equal(await appVault.exists(), false)
  const v = await makeVault()
  await appVault.write(v)
  assert.deepEqual(await appVault.read(), v)
  assert.equal(await appVault.exists(), true)
  assert.deepEqual([...fs.files.keys()], [APP_FILE]) // no leftover .tmp
  await appVault.remove()
  assert.equal(await appVault.exists(), false); assert.equal(fs.files.size, 0)
})

test('an interrupted save never loses the vault: a damaged main file falls back to the complete temporary copy', async () => {
  const { fs } = install()
  const old = await makeVault('first passphrase 111', (d) => ({ ...d, accounts: [] }))
  const fresh = await makeVault('first passphrase 111', (d) => ({ ...d, accounts: [{ id: 'a', name: 'New', country: 'us', type: 'asset', balance: 5 }] }))
  await appVault.write(old)
  // the app is killed while the real file is half written: a torn main file, a complete temp file
  fs.files.set(APP_FILE, fresh.slice(0, 10))
  fs.files.set('WealthTracker.wvault.tmp', fresh)
  assert.deepEqual(await appVault.read(), fresh)
  // a valid main file wins over a stale temp file
  fs.files.set(APP_FILE, old)
  assert.deepEqual(await appVault.read(), old)
  // both damaged: the damaged main file is returned so the unlock screen can say so
  fs.files.set(APP_FILE, new Uint8Array([1, 2, 3])); fs.files.set('WealthTracker.wvault.tmp', new Uint8Array([4]))
  assert.deepEqual(await appVault.read(), new Uint8Array([1, 2, 3]))
})

test('if writing the real file fails, the complete temporary copy is kept', async () => {
  const { fs } = install()
  const v = await makeVault()
  fs.failOn = APP_FILE
  await assert.rejects(appVault.write(v), /disk full/)
  assert.ok(fs.files.has('WealthTracker.wvault.tmp'))
  fs.failOn = null
  assert.deepEqual(await appVault.read(), v) // recovered from the temporary copy
})

test('file handling in the app: no picker, an existing vault is never overwritten by accident', async () => {
  install()
  const h = await pickNewVaultHandle('x.wvault')
  assert.equal(h, APP_HANDLE); assert.ok(isAppHandle(h))
  assert.equal(await ensurePermission(h), true)
  assert.equal(await recallHandle(), null) // nothing stored yet: first-run screen
  await writeHandle(h, await makeVault())
  assert.equal(await recallHandle(), APP_HANDLE) // found in the app's folder on the next launch
  await assert.rejects(pickNewVaultHandle('x.wvault'), /already stored in this app/)
  assert.equal(await pickNewVaultHandle('x.wvault', { replace: true }), APP_HANDLE)
  assert.equal(rememberHandle(APP_HANDLE), undefined); assert.equal(forgetHandle(), undefined)
  assert.equal(await recallHandle(), APP_HANDLE, 'forgetting the file does not delete the vault')
})

test('end to end: encrypt in the app, save, read back and unlock with the passphrase (wrong passphrase refused)', async () => {
  install()
  const data = { ...emptyData(), accounts: [{ id: 'a1', country: 'us', type: 'asset', name: 'Brokerage', balance: 12345, owner: 'mine', mix: null }] }
  const session = await newSession('a long passphrase 99')
  const h = await pickNewVaultHandle('v.wvault')
  await writeHandle(h, await encryptVault(session, data))
  const bytes = await readHandle(h)
  const { data: back } = await decryptVault(bytes, 'a long passphrase 99')
  assert.equal(back.accounts[0].balance, 12345)
  await assert.rejects(decryptVault(bytes, 'wrong passphrase 00'))
  assert.ok(!Buffer.from(bytes).toString('latin1').includes('Brokerage'), 'the stored file holds no plaintext')
})

test('a backup goes to the share sheet with its name and the exact bytes', async () => {
  const { shared } = install()
  const v = await makeVault()
  await shareBackup(v, 'WealthTracker.wvault')
  assert.equal(shared.length, 1); assert.equal(shared[0].name, 'WealthTracker.wvault'); assert.deepEqual(shared[0].bytes, v)
})

test('in the app the desktop file pickers are never used, even if the browser offers them', async () => {
  const { hasFS } = await import('../src/lib/fileio.js')
  globalThis.window = { showSaveFilePicker() {}, showOpenFilePicker() {} }
  try {
    assert.equal(hasFS(), true, 'a normal browser with the pickers')
    install()
    assert.equal(hasFS(), false, 'the app')
  } finally { delete globalThis.window }
})
