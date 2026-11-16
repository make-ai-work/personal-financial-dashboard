import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAnswer, createLimiter, makeChallenge } from '../src/lib/humancheck.js'
import { answerFor } from './e2e/signin.mjs'
import { rng } from '../src/lib/montecarlo.js'

const seeded = (seed) => rng(seed)

test('every kind of question has the right answer, and a person can solve each from the text', () => {
  const kinds = new Set()
  for (let s = 1; s < 400; s++) {
    const c = makeChallenge(seeded(s)); kinds.add(c.kind)
    assert.equal(answerFor(c.question), c.answer, c.question)
    assert.ok(checkAnswer(c, c.answer) && checkAnswer(c, ` ${c.answer.toUpperCase()} `))
    assert.ok(!checkAnswer(c, 'zzz') && !checkAnswer(c, '') && !checkAnswer(c, undefined))
  }
  assert.deepEqual([...kinds].sort(), ['diff', 'largest', 'letter', 'sum'])
})

test('subtraction never goes negative and the largest-number question has three different numbers', () => {
  for (let s = 1; s < 300; s++) {
    const c = makeChallenge(seeded(s))
    if (c.kind === 'diff') assert.ok(Number(c.answer) > 0)
    if (c.kind === 'largest') { const nums = c.question.match(/\d+/g); assert.equal(new Set(nums).size, 3); assert.equal(Number(c.answer), Math.max(...nums.map(Number))) }
  }
})

test('three wrong answers lock the check for a while, then it opens again', () => {
  let t = 1000; const l = createLimiter({ maxTries: 3, lockMs: 30_000, now: () => t })
  assert.equal(l.locked(), false); l.fail(); l.fail(); assert.equal(l.locked(), false); assert.equal(l.triesLeft(), 1)
  l.fail(); assert.equal(l.locked(), true); assert.equal(l.secondsLeft(), 30)
  t += 29_000; assert.equal(l.locked(), true); assert.equal(l.secondsLeft(), 1)
  t += 1_000; assert.equal(l.locked(), false); assert.equal(l.triesLeft(), 3)
})
