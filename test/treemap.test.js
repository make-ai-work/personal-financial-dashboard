import test from 'node:test'
import assert from 'node:assert/strict'
import { heatLevel, treemap } from '../src/lib/treemap.js'

test('treemap: every item gets a block, areas follow the values, blocks fill the box without overlapping', () => {
  const items = [{ key: 'a', value: 50 }, { key: 'b', value: 30 }, { key: 'c', value: 15 }, { key: 'd', value: 5 }, { key: 'zero', value: 0 }]
  const r = treemap(items, 100, 60)
  assert.equal(r.length, 4) // zero is dropped
  assert.ok(Math.abs(r.reduce((s, x) => s + x.w * x.h, 0) - 6000) < 1e-6)
  for (const x of r) assert.ok(Math.abs(x.w * x.h - (x.value / 100) * 6000) < 1e-6 && x.x >= -1e-9 && x.y >= -1e-9 && x.x + x.w <= 100 + 1e-9 && x.y + x.h <= 60 + 1e-9)
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j]
    assert.ok(a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9, 'no overlap')
  }
  assert.deepEqual(treemap([]), []); assert.deepEqual(treemap([{ key: 'x', value: 0 }]), [])
  assert.equal(treemap([{ key: 'only', value: 5 }])[0].w, 100)
})
test('heat levels by share of the total', () => {
  assert.deepEqual([0.01, 0.05, 0.099, 0.1, 0.19, 0.2, 0.29, 0.3, 0.9].map(heatLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4])
})
