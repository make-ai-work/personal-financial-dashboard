import { resolveClientId } from '../src/lib/google.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { isClientId, looksLikeSecret, needsSetup, shortId, validateClientId } from '../src/lib/google.js'

const ID = '123456789012-abcdefghij1234.apps.googleusercontent.com'
test('a client ID is recognised, with or without spaces and in any case', () => {
  assert.ok(isClientId(ID) && isClientId(`  ${ID}  `) && isClientId(ID.toUpperCase()))
  for (const bad of ['', 'abc', '123-abc.apps.googleusercontent.com', 'x'.repeat(30), '123456789012-abcdefghij.example.com', `https://${ID}`])
    assert.equal(isClientId(bad), false, bad)
})
test('a client secret is refused with its own message', () => {
  assert.ok(looksLikeSecret('GOCSPX-abc123') && looksLikeSecret('my client_secret'))
  assert.match(validateClientId('GOCSPX-abc123').error, /client secret/)
  assert.equal(validateClientId('GOCSPX-abc123').ok, false)
})
test('validation: empty is quiet, wrong is explained, right is ok', () => {
  assert.deepEqual(validateClientId(''), { ok: false, error: '' })
  assert.deepEqual(validateClientId(undefined), { ok: false, error: '' })
  assert.match(validateClientId('hello').error, /does not look like a client ID/)
  assert.deepEqual(validateClientId(ID), { ok: true, error: '' })
})
test('setup is needed only until an ID is saved or it is skipped', () => {
  assert.equal(needsSetup({ clientId: '', skipped: false }), true)
  assert.equal(needsSetup({ clientId: 'junk', skipped: false }), true) // an invalid saved value does not count
  assert.equal(needsSetup({ clientId: ID, skipped: false }), false)
  assert.equal(needsSetup({ clientId: '', skipped: true }), false)
})
test('long IDs are shortened for display', () => {
  assert.equal(shortId(ID), ID.slice(0, 24) + '…')
  assert.equal(shortId('1234-abcd.apps.google'), '1234-abcd.apps.google') // short ones are left alone
})

test('which client ID is used: yours first, then the built-in one, unless Google was turned off', () => {
  const mine = '111111111111-mineabcdefgh.apps.googleusercontent.com', built = '222222222222-builtabcdefgh.apps.googleusercontent.com'
  assert.deepEqual(resolveClientId({ saved: mine, fallback: built }), { clientId: mine, usingDefault: false })
  assert.deepEqual(resolveClientId({ saved: '', fallback: built }), { clientId: built, usingDefault: true })
  assert.deepEqual(resolveClientId({ saved: '', skipped: true, fallback: built }), { clientId: '', usingDefault: false }, 'turned off: no built-in client')
  assert.deepEqual(resolveClientId({ saved: mine, skipped: true, fallback: built }), { clientId: mine, usingDefault: false })
  assert.deepEqual(resolveClientId({ saved: 'junk', fallback: built }), { clientId: built, usingDefault: true })
  assert.deepEqual(resolveClientId({ saved: '', fallback: '' }), { clientId: '', usingDefault: false }, 'a build with no built-in client')
  assert.deepEqual(resolveClientId({ saved: '', fallback: 'GOCSPX-secret' }), { clientId: '', usingDefault: false })
})
