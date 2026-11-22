import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { MAX_VERSIONS, deleteVersion, loadVersion, overwriteVersion, renameVersion, saveVersion } from '../lib/retirement.js'
import { summarise } from '../lib/montecarlo.js'
import { todayISO } from '../lib/format.js'

const pct = (x) => (x * 100).toFixed(0) + '%'

// The three saved plans as small square-ish tiles side by side, within the left column's width. Click a tile to choose that plan: its chance of
// success then shows wide across the page. The highlighted tile is the plan you are on; what you change in the inputs is a working copy of it.
// Under the tiles, the plan you are on gets its actions: Save changes, Rename, Delete. An empty slot ("+") saves the working copy as another plan.
export default function PlanCards({ A, plan, target, busy }) {
  const { data, update } = useVault()
  const versions = data.retirement.versions
  const activeId = data.retirement.activeId
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const today = todayISO()
  const live = A ? summarise(A, plan) : null
  const active = versions.find((v) => v.id === activeId) || null
  const unsaved = activeId === null // the working copy has not been saved as a plan
  const status = (succ) => (succ === null || succ === undefined ? null : succ >= target / 100 ? 'on' : 'off')
  const pill = (succ) => { const s = status(succ); return s ? <span className={`pill ${s === 'on' ? 'ok' : 'bad'}`}>{s === 'on' ? 'On track' : 'Off track'}</span> : null }
  const edited = active && JSON.stringify([active.plan, active.mc]) !== JSON.stringify([data.retirement.plan, data.retirement.mc])
  const save = () => { update((d) => saveVersion(d, name, live, today)); setName(''); setAdding(false) }
  const slots = MAX_VERSIONS - versions.length - (unsaved && versions.length < MAX_VERSIONS ? 1 : 0)
  const canAdd = versions.length < MAX_VERSIONS

  return (
    <div className="rplans-wrap" data-testid="plan-cards">
      <div className="rplans">
        {versions.map((v) => {
          const on = v.id === activeId
          const succ = on && live ? live.succ : v.summary.succ
          return (
            <button key={v.id} type="button" className={`rtile${on ? ' on' : ''}`} data-testid="plan-card" aria-current={on ? 'true' : undefined} aria-label={`Plan ${v.name}`}
              onClick={() => { if (!on) update((d) => loadVersion(d, v.id)) }}>
              <span className="rt-name">{v.name}</span>
              <span className="rt-pct">{succ === null || succ === undefined ? '…' : pct(succ)}</span>
              <span className="rt-foot">{pill(succ)}</span>
              {on && <span className="rt-sel">Showing{edited ? ' · edited' : ''}</span>}
            </button>
          )
        })}
        {unsaved && versions.length < MAX_VERSIONS && (
          <div className="rtile on" data-testid="plan-card" aria-current="true">
            <span className="rt-name">Your plan</span>
            <span className="rt-pct">{live ? pct(live.succ) : '…'}</span>
            <span className="rt-foot">{live ? pill(live.succ) : null}</span>
            <span className="rt-sel">Showing · not saved</span>
          </div>
        )}
        {Array.from({ length: Math.max(0, slots) }, (_, i) => (
          <button key={`e${i}`} type="button" className="rtile empty" aria-label="New plan slot" onClick={() => setAdding(true)}>
            <span className="rt-plus">+</span><span className="rt-name">New plan</span>
          </button>
        ))}
      </div>

      <div className="rplan-actions" data-testid="plan-actions">
        {active && !adding && (
          <>
            {renaming
              ? <input autoFocus defaultValue={active.name} maxLength={40} aria-label="Plan name" onBlur={(e) => { update((d) => renameVersion(d, active.id, e.target.value)); setRenaming(false) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              : <b className="rpa-name">{active.name}</b>}
            <span className="m">retire at {active.plan.retAge} · saved {active.savedAt}{edited ? ' · edited' : ''}</span>
            <span className="acts">
              <button className="btn sm" disabled={!live || busy || !edited} onClick={() => live && update((d) => overwriteVersion(d, active.id, live, today))}>Save changes</button>
              <button className="btn sm" onClick={() => setRenaming(true)}>Rename</button>
              <button className="btn sm danger-btn" onClick={() => window.confirm(`Delete “${active.name}”?`) && update((d) => deleteVersion(d, active.id))}>Delete</button>
              {canAdd && <button className="btn sm" onClick={() => setAdding(true)}>+ Save as new plan</button>}
            </span>
          </>
        )}
        {(adding || (unsaved && !active)) && (
          <>
            <span className="m">{unsaved ? 'Your plan is not saved yet.' : 'Keep the inputs you have now as another plan.'}</span>
            <span className="namefld">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this plan" maxLength={40} aria-label="New plan name" />
              <button className="btn sm primary" disabled={!canAdd || !live || busy} onClick={save}>{unsaved ? 'Save as plan' : 'Save as new plan'}</button>
              {adding && !unsaved && <button className="btn sm" onClick={() => { setAdding(false); setName('') }}>Cancel</button>}
            </span>
            {!canAdd && <span className="m">All {MAX_VERSIONS} plans are used. Delete one to save this.</span>}
          </>
        )}
      </div>
    </div>
  )
}
