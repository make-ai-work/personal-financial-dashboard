import { useVault } from './VaultContext.jsx'
import { download } from '../lib/fileio.js'

const SAVE_TEXT = { saved: 'saved', saving: 'saving…', unsaved: 'unsaved changes', error: 'save failed', reconnect: 'not saved: reconnect Google Drive', conflict: 'changed on another device' }

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
      <span>🔒 {v.fileName}{v.storage === 'drive' ? ' · Google Drive' : ''} · encrypted · {SAVE_TEXT[v.saveState]}</span>
      {!v.canWrite && v.saveState !== 'saved' && <button className="btn sm" onClick={v.downloadNow}>Download to save</button>}
      {v.saveState === 'reconnect' && <button className="btn sm primary" onClick={v.reconnectDrive}>Reconnect Google Drive</button>}
      {v.saveState === 'conflict' && (
        <>
          <button className="btn sm primary" onClick={() => v.resolveConflict('overwrite')} title="Keep my changes and replace the file in Drive">Keep my changes</button>
          <button className="btn sm" onClick={() => v.resolveConflict('reload')} title="Discard my changes since I opened it and use the file in Drive">Use the Drive version</button>
        </>
      )}
      <button className="btn sm" onClick={v.lock}>Lock now</button>
      {['error', 'reconnect', 'conflict'].includes(v.saveState) && v.error && <span className="sb-err" role="alert">{v.error}</span>}
    </div>
  )
}
