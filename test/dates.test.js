import test from 'node:test'
import assert from 'node:assert/strict'
import { addMonths, addDays, daysBetween, dueStatus } from '../src/lib/dates.js'

const TODAY = '2026-10-27'

test('date maths clamps month ends and crosses year boundaries', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29') // leap year
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15')
  assert.equal(addMonths('2026-03-15', -4), '2025-11-15')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(daysBetween('2026-10-27', '2026-11-15'), 19)
  assert.equal(daysBetween('2026-10-27', '2026-10-20'), -7)
})

test('due status: overdue, soon, ok', () => {
  assert.deepEqual(dueStatus('2026-10-20', TODAY), { status: 'overdue', days: -7, text: 'overdue 7 days' })
  assert.equal(dueStatus('2026-10-26', TODAY).text, 'overdue 1 day')
  assert.equal(dueStatus(TODAY, TODAY).text, 'due today')
  assert.equal(dueStatus('2026-11-15', TODAY).status, 'soon')
  assert.equal(dueStatus('2026-11-15', TODAY).text, 'due in 19 days')
  assert.equal(dueStatus('2026-11-26', TODAY, 30).status, 'soon') // exactly 30 days
  assert.equal(dueStatus('2026-11-27', TODAY, 30).status, 'ok')
  assert.equal(dueStatus('2026-11-27', TODAY, 60).status, 'soon')
  assert.equal(dueStatus('', TODAY), null)
})
