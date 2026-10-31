import { useState } from 'react'
import { allocation } from '../lib/portfolio.js'

const PALETTE = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--purple)', 'var(--pink)', 'var(--grey)']

// A stacked bar plus legend. `views` = [[key, label]]; `format` renders a money amount.
export default function Allocation({ holdings, names, format, views, title, sub, children }) {
  const [by, setBy] = useState(views[0][0])
  const rows = allocation(holdings, by, names)
  let i = 0
  const segs = rows.map((r) => ({ ...r, color: r.color || PALETTE[i++ % PALETTE.length] }))
  return (
    <div className="panel">
      <div className="p-head">
        <div className="title">{title} {sub && <span className="sub">{sub}</span>}</div>
        <div className="seg" role="group" aria-label="Allocation view">
          {views.map(([k, l]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}
        </div>
      </div>
      <div className="alloc">
        {segs.length === 0 ? <div className="empty">No holdings yet.</div> : (
          <>
            <div className="bar" role="img" aria-label={`Allocation by ${by}`}>
              {segs.map((s) => <i key={s.key} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label} ${s.pct.toFixed(1)}%`} />)}
            </div>
            <div className="leg">
              {segs.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label} <b>{s.pct.toFixed(1)}%</b> <span className="sub">{format(s.value)}</span></span>)}
            </div>
          </>
        )}
      </div>
      {children}
    </div>
  )
}
