import { useVault } from './VaultContext.jsx'
import { download } from '../lib/fileio.js'

const SAVE_TEXT = { saved: 'saved', saving: 'saving…', unsaved: 'unsaved changes', error: 'save failed' }

export default function StatusBar() {
  const v = useVault()
  if (v.demo) {
    const exportCopy = async () => {
      const { exportWorkbook } = await import('../lib/excel.js')
      download('Sample-data-export.xlsx', await exportWorkbook(v.data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    }
    return (
      <div className="statusbar">
        <span className="dot demo" />
        <span>Sample data · nothing is saved</span>
        <button className="btn sm" onClick={exportCopy}>Download Excel copy</button>
      </div>
    )
  }
  return (
    <div className="statusbar">
      <span className={`dot ${v.saveState}`} />
      <span>🔒 {v.fileName} · encrypted · {SAVE_TEXT[v.saveState]}</span>
      {!v.canWrite && v.saveState !== 'saved' && <button className="btn sm" onClick={v.downloadNow}>Download to save</button>}
      <button className="btn sm" onClick={v.lock}>Lock now</button>
    </div>
  )
}
