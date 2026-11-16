import test from 'node:test'
import assert from 'node:assert/strict'

// The page-side code for the Windows app, run against a stand-in for window.desktopApp.
const calls = []
const files = new Map()
globalThis.window = { desktopApp: {
  isDesktop: true,
  openVault: async () => ({ path: 'C:\\v\\a.wvault', name: 'a.wvault', bytes: new Uint8Array([1, 2]) }),
  saveVaultAs: async (n) => { calls.push(['saveAs', n]); return n === 'cancel.wvault' ? null : { path: `C:\\v\\${n}`, name: n } },
  readVault: async (p) => files.get(p) || new Uint8Array(),
  writeVault: async (p, b) => { calls.push(['write', p]); files.set(p, b); return true },
  lastVault: async () => (files.size ? { path: 'C:\\v\\last.wvault', name: 'last.wvault' } : null),
  rememberVault: async (p) => { calls.push(['remember', p]) },
  forgetVault: async () => { calls.push(['forget']) },
  googleToken: async (id) => { if (id === 'bad') throw new Error("Error invoking remote method 'google:token': Error: The Google sign-in was cancelled."); return 'TKN' },
} }
const io = await import('../src/lib/fileio.js')
const { signInWithGoogle } = await import('../src/lib/googleauth.js')

test('desktop: the file bridge counts as file-system access and hands out named handles', async () => {
  assert.equal(io.isDesktop(), true); assert.equal(io.hasFS(), true)
  const r = await io.pickVault(); assert.deepEqual([r.name, [...r.bytes], r.handle.kind, r.handle.path], ['a.wvault', [1, 2], 'desktop', 'C:\\v\\a.wvault'])
  const h = await io.pickNewVaultHandle('New.wvault'); assert.deepEqual([h.kind, h.name], ['desktop', 'New.wvault'])
  await assert.rejects(io.pickNewVaultHandle('cancel.wvault'), (e) => io.isAbort(e)) // closing the dialog is a cancel, not an error
})

test('desktop: read, write, permission, remember, recall and forget go through the bridge', async () => {
  const h = { kind: 'desktop', path: 'C:\\v\\x.wvault', name: 'x.wvault' }
  await io.writeHandle(h, new Uint8Array([7, 8])); assert.deepEqual([...(await io.readHandle(h))], [7, 8])
  assert.equal(await io.ensurePermission(h), true)
  await io.rememberHandle(h); assert.deepEqual(calls.at(-1), ['remember', h.path])
  assert.deepEqual(await io.recallHandle(), { kind: 'desktop', path: 'C:\\v\\last.wvault', name: 'last.wvault' })
  await io.forgetHandle(); assert.deepEqual(calls.at(-1), ['forget'])
})

test('desktop: Google sign-in uses the browser bridge, not the in-page popup, and tidies its error message', async () => {
  let asked
  const user = await signInWithGoogle('ID', { fetchImpl: async (url, opt) => { asked = opt.headers.Authorization; return { ok: true, json: async () => ({ sub: '1', email: 'a@b.c', name: 'A', email_verified: true }) } } })
  assert.equal(user.email, 'a@b.c'); assert.equal(asked, 'Bearer TKN')
  await assert.rejects(signInWithGoogle('bad'), (e) => e.message === 'The Google sign-in was cancelled.')
})
