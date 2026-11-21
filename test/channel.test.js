import test from 'node:test'
import assert from 'node:assert/strict'
import { channelOf, storageChoices, oldCopyNotice, canDeleteOld } from '../src/lib/channel.js'

test('which version this is', () => {
  assert.equal(channelOf({ demo: true, native: true }), 'demo')
  assert.equal(channelOf({ native: true }), 'android')
  assert.equal(channelOf({ desktop: true }), 'windows')
  assert.equal(channelOf({}), 'web')
})

test('every real version offers the same two choices in the same order', () => {
  for (const channel of ['android', 'windows', 'web']) {
    const c = storageChoices({ channel, clientReady: true })
    assert.deepEqual(c.map((x) => [x.id, x.title]), [['file', 'Vault file'], ['drive', 'Google Drive']])
    assert.ok(c.every((x) => x.available))
  }
})

test('the vault file hint differs by version; Google Drive is the same', () => {
  const hint = (channel, canRemember) => storageChoices({ channel, clientReady: true, canRemember })[0].hint
  assert.match(hint('android', true), /inside this app/)
  assert.match(hint('windows', true), /folder you choose/)
  assert.match(hint('web', true), /remembers it/)
  assert.match(hint('web', false), /cannot remember/)
  const drives = ['android', 'windows', 'web'].map((channel) => storageChoices({ channel, clientReady: true })[1].hint)
  assert.equal(new Set(drives).size, 1)
})

test('Google Drive says why when it is unavailable; the vault file never needs Google', () => {
  const c = storageChoices({ channel: 'web', clientReady: false })
  assert.equal(c[0].available, true)
  assert.equal(c[1].available, false); assert.match(c[1].hint, /client ID/)
  const d = storageChoices({ channel: 'demo' })
  assert.ok(d.every((x) => !x.available)); assert.match(d[0].hint, /Nothing is saved/)
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
