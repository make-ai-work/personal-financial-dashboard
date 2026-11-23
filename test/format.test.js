import test from 'node:test'
import assert from 'node:assert/strict'
test('amounts with more than 9 digits (decimals not counted) are shown in words', async () => {
  const { money, moneyCurrency } = await import('../src/lib/format.js')
  assert.equal(money('us', 999999999), '$ 999,999,999') // 9 digits: in full
  assert.equal(money('us', 1000000000), '$ 1 billion') // 10 digits
  assert.equal(money('us', 1250000000), '$ 1.25 billion'); assert.equal(money('us', -3400000000), '-$ 3.4 billion')
  assert.equal(money('us', 999999999.6), '$ 1 billion', 'rounds first, then counts digits')
  assert.equal(money('us', 2500000000000), '$ 2.5 trillion')
  assert.equal(moneyCurrency('INR', 12500000000), '₹ 1,250 crore')
  assert.equal(money('in', 100000000), '₹ 10,00,00,000', 'exactly 10 crore is not above it'); assert.equal(money('in', 100000001), '₹ 10 crore')
  assert.equal(money('in', 987654321), '₹ 98.77 crore'); assert.equal(money('in', 99999999), '₹ 9,99,99,999'); assert.equal(money('in', -250000000), '-₹ 25 crore')
  assert.equal(moneyCurrency('GBP', 1500000000), '£ 1.5 billion')
})
