import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeData, emptyData } from '../src/lib/model.js'

test('a vault saved while the Pets tab existed keeps its pet data and reminder window', () => {
  const old = {
    ...emptyData(),
    settings: { countries: ['us'], petSoonDays: 14, petCurrency: 'in', weightUnit: 'lb' }, // petSoonDays was the reminder window
    pets: [{ id: 'p', name: 'Milo' }],
    petRecords: [{ id: 'r', petId: 'p', type: 'weight', weightKg: 29.4 }],
  }
  const d = normalizeData(old)
  assert.deepEqual(d.pets, [{ id: 'p', name: 'Milo' }]) // not dropped when the vault is saved again
  assert.equal(d.petRecords.length, 1)
  assert.equal(d.settings.dueSoonDays, 14) // carried over to the new name
  assert.equal(d.settings.weightUnit, 'lb') // legacy settings are left alone
})

test('a new vault has the default reminder window and no pets', () => {
  const d = normalizeData(undefined)
  assert.equal(d.settings.dueSoonDays, 30)
  assert.deepEqual([d.pets, d.petRecords], [[], []])
  assert.equal('petSoonDays' in d.settings, false)
})
