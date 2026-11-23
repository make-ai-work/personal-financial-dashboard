import test from 'node:test'
import assert from 'node:assert/strict'
import { fxChips } from '../src/lib/fxchips.js'

test('ticker rates: the base to each other currency, then the pair between the others', () => {
  const c = fxChips({ base: 'USD', rates: { INR: 84, GBP: 0.8 } })
  assert.deepEqual(c.map((x) => [x.from, x.to, x.value]), [['$', '₹', '84.00'], ['$', '£', '0.800'], ['£', '₹', '105.0']])
  assert.deepEqual(fxChips({ base: 'USD', rates: { INR: 84 } }).map((x) => x.value), ['84.00'])
  assert.deepEqual(fxChips(null), []); assert.deepEqual(fxChips({ base: 'USD', rates: {} }), []); assert.deepEqual(fxChips({ base: 'USD', rates: { INR: 0, XXX: 5 } }), [])
})
