import { useState } from 'react'
import { allocation } from '../lib/portfolio.js'
import { Collapsible } from '../finance/ui.jsx'
import Heatmap from '../components/Heatmap.jsx'

const PALETTE = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--purple)', 'var(--pink)', 'var(--grey)']

// A stacked bar plus legend. `views` = [[key, label]]; `format` renders a money amount.
export default function Allocation({ id, holdings, names, format, views, title, sub, children }) {
  const [by, setBy] = useState(views[0][0])
  const rows = allocation(holdings, by, names)
  let i = 0
  const segs = rows.map((r) => ({ ...r, color: r.color || PALETTE[i++ % PALETTE.length] }))
  const seg = (
    <div className="seg" role="group" aria-label="Allocation view">
      {views.map(([k, l]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}
    </div>
  )
  return (
    <Collapsible id={id} title={title} sub={sub} defaultOpen={false} action={seg}>
      <div className="alloc">
        {segs.length === 0 ? <div className="empty">No holdings yet.</div> : (
          <>
            <Heatmap items={segs.map((x) => ({ key: x.key, label: x.label, value: x.value }))} label={`Allocation by ${by}, as a heatmap`} ratio={2.1} format={format} />
            <div className="leg">
              {segs.map((x) => <span key={x.key}><i style={{ background: x.color }} />{x.label} <b>{x.pct.toFixed(1)}%</b> <span className="sub">{format(x.value)}</span></span>)}
            </div>
          </>
        )}
      </div>
      {children}
    </Collapsible>
  )
}
