import { useVault } from './VaultContext.jsx'

const SAVE_TEXT = { saved: 'saved', saving: 'saving…', unsaved: 'unsaved changes', error: 'save failed' }

export default function StatusBar() {
  const v = useVault()
  return (
    <div className="statusbar">
      <span className={`dot ${v.saveState}`} />
      <span>🔒 {v.fileName} · encrypted · {SAVE_TEXT[v.saveState]}</span>
      {!v.canWrite && v.saveState !== 'saved' && <button className="btn sm" onClick={v.downloadNow}>Download to save</button>}
      <button className="btn sm" onClick={v.lock}>Lock now</button>
    </div>
  )
}
