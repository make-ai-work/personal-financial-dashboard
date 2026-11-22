import { useState } from 'react'
import { DEFAULT_MODEL, MODEL_SUGGESTIONS, validateKey, validateModel } from '../lib/aichat.js'
import { getKey, getModel, hasKeyFlag, removeKey, setKey, setModel } from '../lib/aikey.js'
import { resetChat } from '../lib/aistore.js'
import { streamReply } from '../lib/aichat.js'

// Settings → AI assistant: bring your own Claude key. Write-only: once saved it is never shown again.
export default function AiSettings() {
  const [, tick] = useState(0)
  const [key, setKeyText] = useState('')
  const [model, setModelText] = useState(getModel())
  const [msg, setMsg] = useState({ kind: '', text: '' })
  const [busy, setBusy] = useState(false)
  const saved = hasKeyFlag()
  const say = (kind, text) => setMsg({ kind, text })

  const save = async (e) => {
    e?.preventDefault()
    const m = validateModel(model); if (!m.ok) return say('err', m.error)
    const k = validateKey(key); if (!k.ok) return say('err', k.error)
    setModel(m.model); setModelText(m.model)
    if (k.key) { await setKey(k.key); setKeyText(''); resetChat(); say('ok', 'Saved on this device. The key is not shown again.') } // a blank key leaves the saved one alone
    else say('ok', saved ? 'Model saved. The saved key is unchanged.' : 'Model saved. Add a key to use the chat.')
    tick((n) => n + 1)
  }
  const remove = async () => {
    if (!window.confirm('Remove the saved API key?')) return
    await removeKey(); resetChat(); say('ok', 'The key was removed from this device.'); tick((n) => n + 1)
  }
  // One tiny request to see whether the key and model work. It sends the single word "hi" and nothing else.
  const test = async () => {
    const k = (await getKey()) || validateKey(key).key
    if (!k) return say('err', 'Add a key first.')
    setBusy(true); say('', 'Asking Claude…')
    try {
      let got = ''
      for await (const t of streamReply({ key: k, model: validateModel(model).model || DEFAULT_MODEL, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] })) { got += t; if (got.length > 20) break }
      say('ok', 'The key and model work.')
    } catch (e) { say('err', e.message) } finally { setBusy(false) }
  }

  return (
    <div className="panel" id="set-ai">
      <div className="p-head"><div className="title">AI assistant: Claude (bring your own key)</div><span className="sub">optional · paid by you · off until you add a key</span></div>
      <form className="pad" onSubmit={save}>
        <label className="field">API key
          <input type="password" autoComplete="off" spellCheck="false" value={key} onChange={(e) => setKeyText(e.target.value)} aria-label="Claude API key"
            placeholder={saved ? 'Saved. Paste a new key to replace it' : 'sk-ant-…'} />
        </label>
        <label className="field">Model
          <input list="ai-models" value={model} onChange={(e) => setModelText(e.target.value)} aria-label="Claude model" placeholder={DEFAULT_MODEL} />
          <datalist id="ai-models">{MODEL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <div className="hint">claude-haiku-5-5 is fast and cheap; claude-sonnet-5-5 is smarter and costs more.</div>
        <div className="rowend" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <button className="btn primary">Save</button>
          <button type="button" className="btn" onClick={test} disabled={busy}>Test the key</button>
          {saved && <button type="button" className="btn danger-btn" onClick={remove}>Remove key</button>}
          <span className="chip" data-testid="ai-status">{saved ? 'Key saved on this device' : 'No key'}</span>
        </div>
        {msg.text && <div className={msg.kind === 'err' ? 'err' : msg.kind === 'ok' ? 'okmsg' : 'note'} role="status" data-testid="ai-msg">{msg.text}</div>}
        <div className="warn"><b>What is sent:</b> only the messages you type in the chat, to Anthropic, using your key. None of your accounts, balances, plans or policies are included, and you confirm once each session. Anthropic bills your key by use. The key is kept in this device&apos;s browser storage (not in your vault, a backup or the Excel export) and is never shown again.</div>
      </form>
    </div>
  )
}
