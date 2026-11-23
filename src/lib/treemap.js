// Heatmap layout: a squarified treemap. Rectangles are sized by value and the colour level says what share of the total each one is.
// treemap(items, W, H) -> [{ ...item, x, y, w, h, share }] in the W by H box (percent when W = H = 100).
export function treemap(items, W = 100, H = 100) {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = list.reduce((s, i) => s + i.value, 0)
  if (!list.length || !(total > 0)) return []
  const scale = (W * H) / total
  const nodes = list.map((i) => ({ ...i, area: i.value * scale, share: i.value / total }))
  const out = []
  let x = 0, y = 0, w = W, h = H, row = []
  const sum = (r) => r.reduce((a, n) => a + n.area, 0)
  const worst = (r, side) => {
    const s = sum(r), max = Math.max(...r.map((n) => n.area)), min = Math.min(...r.map((n) => n.area))
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min))
  }
  const place = (r) => {
    const s = sum(r)
    if (w >= h) { // a column down the left edge
      const cw = s / h
      let cy = y
      for (const n of r) { const ch = n.area / cw; out.push({ ...n, x, y: cy, w: cw, h: ch }); cy += ch }
      x += cw; w -= cw
    } else { // a row along the top edge
      const rh = s / w
      let cx = x
      for (const n of r) { const cw = n.area / rh; out.push({ ...n, x: cx, y, w: cw, h: rh }); cx += cw }
      y += rh; h -= rh
    }
  }
  let i = 0
  while (i < nodes.length) {
    const side = Math.min(w, h)
    if (!row.length || worst([...row, nodes[i]], side) <= worst(row, side)) row.push(nodes[i++])
    else { place(row); row = [] }
  }
  if (row.length) place(row)
  return out
}

// The colour step (0 lightest to 4 darkest) for a share of the total.
export const heatLevel = (share) => (share < 0.05 ? 0 : share < 0.1 ? 1 : share < 0.2 ? 2 : share < 0.3 ? 3 : 4)
export const HEAT_LEGEND = ['under 5%', '5–10%', '10–20%', '20–30%', 'over 30%']
