import test from 'node:test'
import assert from 'node:assert/strict'
import { channelOf, storageChoices, oldCopyNotice, canDeleteOld } from '../src/lib/channel.js'

test('which version this is', () => {
  assert.equal(channelOf({ demo: true, native: true }), 'demo')
  assert.equal(channelOf({ native: true }), 'android')
  assert.equal(channelOf({ desktop: true }), 'windows')
  assert.equal(channelOf({}), 'web')
})

test('signed in: every version offers Vault file and Google Drive, in that order; demo mode is greyed out', () => {
  for (const channel of ['android', 'windows', 'web']) {
    const c = storageChoices({ channel, signedIn: true, clientReady: true })
    assert.deepEqual(c.map((x) => [x.id, x.available]), [['file', true], ['drive', true], ['demo', false]])
    assert.equal(c[0].title, 'Vault file'); assert.equal(c[1].title, 'Google Drive'); assert.equal(c[2].title, 'Demo mode – nothing will be saved')
  }
})

test('signed out (or the demo site): only demo mode works, and the others say to sign in', () => {
  for (const channel of ['android', 'windows', 'web', 'demo']) {
    const c = storageChoices({ channel, signedIn: false, clientReady: true })
    assert.deepEqual(c.map((x) => [x.id, x.available]), [['file', false], ['drive', false], ['demo', true]])
    assert.match(c[0].hint, /Sign in with Google/); assert.match(c[1].hint, /Sign in with Google/)
  }
})

test('the vault file hint differs by version; Google Drive is the same', () => {
  const hint = (channel, canRemember) => storageChoices({ channel, signedIn: true, clientReady: true, canRemember })[0].hint
  assert.match(hint('android', true), /inside this app/)
  assert.match(hint('windows', true), /folder you choose/)
  assert.match(hint('web', true), /remembers it/)
  assert.match(hint('web', false), /cannot remember/)
  const drives = ['android', 'windows', 'web'].map((channel) => storageChoices({ channel, signedIn: true, clientReady: true })[1].hint)
  assert.equal(new Set(drives).size, 1)
})

test('Google Drive says why when Google sign-in is not set up in this copy', () => {
  const c = storageChoices({ channel: 'web', signedIn: true, clientReady: false })
  assert.equal(c[0].available, true)
  assert.equal(c[1].available, false); assert.match(c[1].hint, /not set up/)
})

test('after a move the notice names the old copy and says it is not updated', () => {
  assert.match(oldCopyNotice({ kind: 'drive', name: 'WealthTracker.wvault' }), /in your Google Drive.*not updated.*Delete it/)
  assert.match(oldCopyNotice({ kind: 'app' }), /inside this app/)
  assert.match(oldCopyNotice({ kind: 'device', name: 'a.wvault' }), /on this computer/)
  assert.equal(oldCopyNotice(null), null)
})

test('the app deletes an old copy only where it safely can', () => {
  assert.equal(canDeleteOld({ kind: 'drive', id: 'x' }), true)
  assert.equal(canDeleteOld({ kind: 'app' }), true)
  assert.equal(canDeleteOld({ kind: 'device', path: 'C:\\a.wvault' }, { desktop: true }), true)
  assert.equal(canDeleteOld({ kind: 'device', path: '' }, { desktop: true }), false)
  assert.equal(canDeleteOld({ kind: 'device' }, { desktop: false }), false) // a browser cannot delete a file it opened
  assert.equal(canDeleteOld(null), false)
})
