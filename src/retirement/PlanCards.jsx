import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { MAX_VERSIONS, canSaveVersion, deleteVersion, loadVersion, overwriteVersion, renameVersion, saveVersion } from '../lib/retirement.js'
import { summarise } from '../lib/montecarlo.js'
import { todayISO } from '../lib/format.js'

const pct = (x) => (x * 100).toFixed(0) + '%'

// The three saved plans, stacked in the left column's width. Choosing one (click the card or Open) shows its chance of success wide across the page. The highlighted one is the plan you are looking at; the inputs below edit a working copy of it.
//   Open         replaces the working copy with that saved plan
//   Save changes writes the working copy back into the highlighted plan
//   + Save as new plan  keeps the working copy as another plan (up to three)
export default function PlanCards({ A, plan, target, busy }) {
  const { data, update } = useVault()
  const versions = data.retirement.versions
  const activeId = data.retirement.activeId
  const [renaming, setRenaming] = useState(null)
  const [name, setName] = useState('')
  const today = todayISO()
  const live = A ? summarise(A, plan) : null
  const status = (succ) => (succ === null || succ === undefined ? null : succ >= target / 100 ? 'on' : 'off')
  const pill = (succ) => {
    const s = status(succ)
    return s ? <span className={`pill ${s === 'on' ? 'ok' : 'bad'}`}>{s === 'on' ? 'On track' : 'Off track'}</span> : null
  }
  const edited = (v) => JSON.stringify([v.plan, v.mc]) !== JSON.stringify([data.retirement.plan, data.retirement.mc])
  const save = () => { update((d) => saveVersion(d, name, live, today)); setName('') }

  return (
    <div className="rplans" data-testid="plan-cards">
      {versions.map((v, i) => {
        const on = v.id === activeId
        const succ = on && live ? live.succ : v.summary.succ
        return (
          <div className={`rplan${on ? ' on' : ' pick'}`} key={v.id} data-testid="plan-card" aria-current={on ? 'true' : undefined} onClick={on ? undefined : (e) => { if (!e.target.closest('button,input')) update((d) => loadVersion(d, v.id)) }}>
            <div className="row">
              {renaming === v.id
                ? <input autoFocus defaultValue={v.name} maxLength={40} aria-label="Plan name" onBlur={(e) => { update((d) => renameVersion(d, v.id, e.target.value)); setRenaming(null) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                : <b>{v.name}</b>}
              {on ? <span className="pill sel">Showing{edited(v) ? ' · edited' : ''}</span> : <span className="pill">saved</span>}
            </div>
            <div className="m">{succ === null || succ === undefined ? '…' : <><b>{pct(succ)}</b> chance · </>}{pill(succ)}{busy && on ? <span className="m"> calculating…</span> : null}</div>
            <div className="m">Retire at {v.plan.retAge} · saved {v.savedAt}</div>
            <div className="acts">
              {on ? (
                <>
                  <button className="btn sm" disabled={!live || busy} onClick={() => live && update((d) => overwriteVersion(d, v.id, live, today))}>Save changes</button>
                  <button className="btn sm" onClick={() => setRenaming(v.id)}>Rename</button>
                </>
              ) : (
                <button className="btn sm" onClick={() => update((d) => loadVersion(d, v.id))}>Open</button>
              )}
              <button className="btn sm danger-btn" onClick={() => window.confirm(`Delete “${v.name}”?`) && update((d) => deleteVersion(d, v.id))}>Delete</button>
            </div>
          </div>
        )
      })}
      {activeId === null && (
        <div className="rplan on" data-testid="plan-card" aria-current="true">
          <div className="row"><b>Your plan</b><span className="pill sel">Showing · not saved</span></div>
          <div className="m">{live ? <><b>{pct(live.succ)}</b> chance · {pill(live.succ)}</> : '…'}</div>
          <div className="namefld">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this plan" maxLength={40} aria-label="New plan name" />
            <button className="btn sm primary" disabled={!canSaveVersion(data) || !live || busy} onClick={save}>Save as plan</button>
          </div>
          {!canSaveVersion(data) && <div className="m">All {MAX_VERSIONS} plans are used. Delete one to save this.</div>}
        </div>
      )}
      {activeId !== null && versions.length < MAX_VERSIONS && (
        <div className="rplan empty">
          <b>+ New plan</b>
          <div className="m">Keep the inputs you have now as another plan, so you can compare them.</div>
          <div className="namefld">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this plan" maxLength={40} aria-label="New plan name" />
            <button className="btn sm" disabled={!live || busy} onClick={save}>Save as new plan</button>
          </div>
        </div>
      )}
    </div>
  )
}
