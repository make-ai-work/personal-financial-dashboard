import { HEAT_LEGEND, heatLevel, treemap } from '../lib/treemap.js'

// A heatmap: one block per item, sized by its value, coloured by its share of the total (light = small share, dark = large).
// items: [{ key, label, value, sub? }]. `ratio` is width / height of the whole picture.
export default function Heatmap({ items, ratio = 2, label = 'Heatmap', legend = true, format }) {
  const rects = treemap(items)
  if (!rects.length) return null
  return (
    <div className="heat-wrap">
      <div className="heat" style={{ aspectRatio: ratio }} role="img" aria-label={label} data-testid="heatmap">
        {rects.map((r) => {
          const lvl = heatLevel(r.share)
          const room = r.w > 13 && r.h > 22 // too small a block shows only its colour; the name is in the tooltip and the legend under it
          return (
            <div key={r.key} className={`heat-tile heat-l${lvl}`} data-testid="heat-tile" data-key={r.key} data-level={lvl}
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} title={`${r.label}: ${(r.share * 100).toFixed(1)}%${format ? ` · ${format(r.value)}` : ''}`}>
              {room && <><b>{r.label}</b><span>{(r.share * 100).toFixed(r.share < 0.1 ? 1 : 0)}%</span></>}
            </div>
          )
        })}
      </div>
      {legend && <div className="heat-legend" aria-hidden="true"><span className="sub">% of total:</span>{HEAT_LEGEND.map((t, i) => <span key={t}><i className={`heat-l${i}`} />{t}</span>)}</div>}
    </div>
  )
}
