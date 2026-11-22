import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_USER, PHASE, nextPhase } from '../src/lib/auth.js'

test('signing in (with Google or as Demo User) opens the app', () => {
  assert.equal(nextPhase(PHASE.signedOut, 'signIn'), PHASE.ready)
  assert.equal(nextPhase(PHASE.ready, 'signIn'), PHASE.ready) // signing in again from Settings changes nothing about the page
})
test('sign out always returns to the sign-in screen; unknown events change nothing', () => {
  for (const p of Object.values(PHASE)) assert.equal(nextPhase(p, 'signOut'), PHASE.signedOut)
  assert.equal(nextPhase(PHASE.ready, 'bogus'), PHASE.ready)
  assert.equal(nextPhase(PHASE.signedOut, 'mfaPassed'), PHASE.signedOut) // the two-step preview is gone
})
test('the no-sign-in user is called Demo User', () => { assert.equal(DEMO_USER.name, 'Demo User'); assert.equal(DEMO_USER.demo, true) })
