import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeCountries, toggleCountry, moveCountry } from '../src/lib/countries.js'
import { normalizeData, emptyData } from '../src/lib/model.js'

test('sanitize keeps valid unique codes in order and never returns empty', () => {
  assert.deepEqual(sanitizeCountries(['in', 'us', 'in', 'zz']), ['in', 'us'])
  assert.deepEqual(sanitizeCountries([]), ['us'])
  assert.deepEqual(sanitizeCountries(undefined, ['uk']), ['uk'])
  assert.deepEqual(sanitizeCountries(['xx'], ['au']), ['au'])
})

test('toggle adds to the end, removes, and never empties the list', () => {
  assert.deepEqual(toggleCountry(['us', 'in'], 'uk'), ['us', 'in', 'uk'])
  assert.deepEqual(toggleCountry(['us', 'in', 'uk'], 'in'), ['us', 'uk'])
  assert.deepEqual(toggleCountry(['us'], 'us'), ['us'])
  assert.deepEqual(toggleCountry(['us'], 'nope'), ['us'])
})

test('move reorders within bounds only', () => {
  assert.deepEqual(moveCountry(['us', 'in', 'uk'], 'uk', -1), ['us', 'uk', 'in'])
  assert.deepEqual(moveCountry(['us', 'in', 'uk'], 'us', -1), ['us', 'in', 'uk'])
  assert.deepEqual(moveCountry(['us', 'in', 'uk'], 'uk', 1), ['us', 'in', 'uk'])
})

test('older vaults get a property country list copied from Finance', () => {
  const old = emptyData()
  delete old.settings.propertyCountries
  old.settings.countries = ['in', 'au', 'uk']
  const d = normalizeData(old)
  assert.deepEqual(d.settings.propertyCountries, ['in', 'au', 'uk'])
  assert.deepEqual(d.settings.countries, ['in', 'au', 'uk'])
  const own = normalizeData({ settings: { countries: ['us'], propertyCountries: ['ch', 'us'] } })
  assert.deepEqual(own.settings.propertyCountries, ['ch', 'us']) // independent once set
})
