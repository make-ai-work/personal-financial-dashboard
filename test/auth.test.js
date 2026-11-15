import test from 'node:test'
import assert from 'node:assert/strict'
import { MFA_ENFORCED, PHASE, looksLikeCode, nextPhase } from '../src/lib/auth.js'

test('sign in goes straight to the app unless two-step is required', () => {
  assert.equal(nextPhase(PHASE.signedOut, 'signIn'), PHASE.ready)
  assert.equal(nextPhase(PHASE.signedOut, 'signIn', { mfaRequired: true }), PHASE.mfa)
})
test('the app cannot be reached by skipping the two-step screen', () => {
  assert.equal(nextPhase(PHASE.signedOut, 'mfaPassed'), PHASE.signedOut)
  assert.equal(nextPhase(PHASE.mfa, 'signIn', { mfaRequired: true }), PHASE.mfa)
  assert.equal(nextPhase(PHASE.mfa, 'mfaPassed'), PHASE.ready)
  assert.equal(nextPhase(PHASE.mfa, 'mfaCancel'), PHASE.signedOut)
})
test('sign out always returns to the sign-in screen; unknown events change nothing', () => {
  for (const p of Object.values(PHASE)) assert.equal(nextPhase(p, 'signOut'), PHASE.signedOut)
  assert.equal(nextPhase(PHASE.ready, 'bogus'), PHASE.ready)
})
test('a code must be exactly six digits, and real verification is still off', () => {
  assert.ok(looksLikeCode('123456') && looksLikeCode(' 000000 '))
  assert.ok(!looksLikeCode('12345') && !looksLikeCode('1234567') && !looksLikeCode('12ab56') && !looksLikeCode(''))
  assert.equal(MFA_ENFORCED, false)
})
