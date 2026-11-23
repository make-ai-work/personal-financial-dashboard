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

test('there is ONE list of countries: older vaults with separate Property and Portfolio lists get the union, Finance first', () => {
  const d = normalizeData({ settings: { countries: ['in', 'au'], propertyCountries: ['ch', 'in'], portfolioCountries: ['uk'] } })
  assert.deepEqual(d.settings.countries, ['in', 'au', 'ch', 'uk'])
  assert.equal('propertyCountries' in d.settings, false); assert.equal('portfolioCountries' in d.settings, false)
  assert.deepEqual(normalizeData({ settings: {} }).settings.countries, ['us', 'in']) // the default
  assert.ok(normalizeData({ settings: { countries: ['ie', 'us'] } }).settings.countries.includes('ie'), 'Ireland is a country')
})
