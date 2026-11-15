import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeData, emptyData } from '../src/lib/model.js'

test('a new vault has the default reminder window', () => {
  assert.equal(normalizeData(undefined).settings.dueSoonDays, 30)
  assert.equal(emptyData().settings.dueSoonDays, 30)
})

test('a saved reminder window is kept and unknown top-level data is not carried into the vault', () => {
  const d = normalizeData({ ...emptyData(), settings: { countries: ['us'], dueSoonDays: 14 }, somethingRemoved: [{ id: 'x' }] })
  assert.equal(d.settings.dueSoonDays, 14)
  assert.equal('somethingRemoved' in d, false)
})
