import test from 'node:test'
import assert from 'node:assert/strict'
import { newSession, encryptVault, decryptVault, parseVault, VaultError, passphraseStrength } from '../src/lib/vault.js'

const ITER = 100_000 // minimum accepted; keeps tests fast

test('round trip with the right passphrase', async () => {
  const session = await newSession('correct horse battery', ITER)
  const data = { accounts: [{ number: '000123456821' }] }
  const bytes = await encryptVault(session, data)
  const out = await decryptVault(bytes, 'correct horse battery')
  assert.deepEqual(out.data, data)
})

test('file does not contain plaintext', async () => {
  const session = await newSession('pw-pw-pw-pw-pw', ITER)
  const bytes = await encryptVault(session, { number: '000123456821', name: 'Checking' })
  const text = Buffer.from(bytes).toString('latin1')
  assert.ok(!text.includes('000123456821') && !text.includes('Checking'))
})

test('wrong passphrase is rejected', async () => {
  const session = await newSession('right passphrase', ITER)
  const bytes = await encryptVault(session, { a: 1 })
  await assert.rejects(decryptVault(bytes, 'wrong passphrase'), (e) => e instanceof VaultError && e.code === 'WRONG_PASSPHRASE')
})

test('tampered ciphertext and header are rejected', async () => {
  const session = await newSession('right passphrase', ITER)
  const bytes = await encryptVault(session, { a: 1 })
  const c = bytes.slice(); c[c.length - 1] ^= 1
  await assert.rejects(decryptVault(c, 'right passphrase'), { code: 'WRONG_PASSPHRASE' })
  const h = bytes.slice(); h[12] ^= 1 // salt byte, authenticated as AAD
  await assert.rejects(decryptVault(h, 'right passphrase'), { code: 'WRONG_PASSPHRASE' })
})

test('each save uses a fresh IV', async () => {
  const session = await newSession('right passphrase', ITER)
  const a = await encryptVault(session, { a: 1 })
  const b = await encryptVault(session, { a: 1 })
  assert.notDeepEqual(a.slice(25, 37), b.slice(25, 37))
})

test('non-vault and absurd iteration counts are rejected', () => {
  assert.throws(() => parseVault(new Uint8Array(100)), { code: 'NOT_A_VAULT' })
  const bad = new Uint8Array(100)
  bad.set([0x57, 0x56, 0x4c, 0x54, 0x31], 0)
  new DataView(bad.buffer).setUint32(5, 4_000_000_000)
  assert.throws(() => parseVault(bad), { code: 'NOT_A_VAULT' })
})

test('passphrase strength grows with length', () => {
  assert.equal(passphraseStrength('short'), 0)
  assert.ok(passphraseStrength('correct horse battery staple') >= 3)
})
