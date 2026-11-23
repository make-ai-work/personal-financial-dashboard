import test from 'node:test'
import assert from 'node:assert/strict'
import { groupNumber, plainNumber } from '../src/lib/numfmt.js'

test('thousands separators are added to the whole part only', () => {
  assert.equal(groupNumber('1250000.5'), '1,250,000.5'); assert.equal(groupNumber('999'), '999'); assert.equal(groupNumber('1000'), '1,000')
  assert.equal(groupNumber('-12345.678'), '-12,345.678'); assert.equal(groupNumber('5.'), '5.'); assert.equal(groupNumber('.5'), '.5')
  assert.equal(groupNumber(''), ''); assert.equal(groupNumber(null), ''); assert.equal(groupNumber(1234567), '1,234,567'); assert.equal(groupNumber('abc'), 'abc')
})
test('typed or pasted text becomes plain number text, or is refused', () => {
  assert.equal(plainNumber('1,250,000'), '1250000'); assert.equal(plainNumber('1 250.50'), '1250.50'); assert.equal(plainNumber('-'), '-'); assert.equal(plainNumber(''), '')
  assert.equal(plainNumber('12a'), null); assert.equal(plainNumber('1.2.3'), null); assert.equal(plainNumber('$5'), null)
})
