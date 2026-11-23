import test from 'node:test'
import assert from 'node:assert/strict'
import { newSession, encryptVault, decryptVault, parseVault, makeRecoveryKey, setPassphrase, decryptVaultWithRecovery, removeRecoveryKey, VaultError, passphraseStrength } from '../src/lib/vault.js'

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
  assert.notDeepEqual(parseVault(a).iv, parseVault(b).iv)
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

test('recovery key: opens the vault without the passphrase, survives a passphrase change, and a new passphrase replaces the old', async () => {
  const s0 = await newSession('first passphrase', ITER)
  assert.equal(parseVault(await encryptVault(s0, { a: 1 })).hasRecovery, false)
  const { code, session: s1 } = await makeRecoveryKey(s0)
  assert.match(code, /^([A-Z2-9]{4}-){6}[A-Z2-9]{2}$/)
  const bytes = await encryptVault(s1, { secret: 42 })
  assert.equal(parseVault(bytes).hasRecovery, true)
  assert.deepEqual((await decryptVault(bytes, 'first passphrase')).data, { secret: 42 })
  // forgot the passphrase: the key (typed in lower case, with spaces) opens it, then a new passphrase is set
  const rec = await decryptVaultWithRecovery(bytes, code.toLowerCase().replace(/-/g, ' '))
  assert.deepEqual(rec.data, { secret: 42 })
  const s2 = await setPassphrase(rec.session, 'second passphrase')
  const bytes2 = await encryptVault(s2, rec.data)
  await assert.rejects(decryptVault(bytes2, 'first passphrase'), { code: 'WRONG_PASSPHRASE' })
  assert.deepEqual((await decryptVault(bytes2, 'second passphrase')).data, { secret: 42 })
  assert.deepEqual((await decryptVaultWithRecovery(bytes2, code)).data, { secret: 42 }, 'the same recovery key still works')
  // wrong key, and a vault without one
  await assert.rejects(decryptVaultWithRecovery(bytes2, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA'), { code: 'WRONG_RECOVERY' })
  const none = await encryptVault(removeRecoveryKey(s2), { a: 1 })
  await assert.rejects(decryptVaultWithRecovery(none, code), { code: 'NO_RECOVERY' })
})

test('old WVLT1 files still open, and are saved in the new format', async () => {
  // build a legacy file by hand: the data key is the passphrase key
  const enc = new TextEncoder(), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const base = await crypto.subtle.importKey('raw', enc.encode('old passphrase'), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const header = new Uint8Array(25); header.set([0x57, 0x56, 0x4c, 0x54, 0x31], 0); new DataView(header.buffer).setUint32(5, ITER); header.set(salt, 9)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, enc.encode(JSON.stringify({ legacy: true }))))
  const file = new Uint8Array(25 + 12 + ct.length); file.set(header); file.set(iv, 25); file.set(ct, 37)
  const out = await decryptVault(file, 'old passphrase')
  assert.deepEqual(out.data, { legacy: true })
  const saved = await encryptVault(out.session, out.data)
  assert.equal(parseVault(saved).version, 2)
  assert.deepEqual((await decryptVault(saved, 'old passphrase')).data, { legacy: true })
  await assert.rejects(decryptVault(file, 'nope'), { code: 'WRONG_PASSPHRASE' })
})
