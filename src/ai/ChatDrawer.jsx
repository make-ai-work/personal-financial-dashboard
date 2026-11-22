import { useEffect, useRef, useState } from 'react'
import { closeChat, confirmChat, newChat, openChat, sendMessage, stopChat, useAiChat, resetChat } from '../lib/aistore.js'
import { hasKeyFlag, getModel } from '../lib/aikey.js'
import { MAX_INPUT } from '../lib/aichat.js'
import { registerModal } from '../finance/ui.jsx'
import { useNav } from '../nav.jsx'
import Markdown from './Markdown.jsx'

const IDEAS = ['What is a safe withdrawal rate in retirement?', 'Explain a Monte Carlo retirement simulation in simple terms', 'How are stock options and RSUs usually taxed?']

// "✨ Ask AI" in the top bar.
export function AskAiButton() {
  const chat = useAiChat()
  return <button className="btn" onClick={() => (chat.open ? closeChat() : openChat())} aria-label="Ask AI" aria-expanded={chat.open}>✨<span className="hide-sm"> Ask AI</span></button>
}

// Lives inside the unlocked app: when the app locks or you sign out it goes away and the conversation is cleared.
export function AiHost() {
  useEffect(() => () => resetChat(), [])
  const chat = useAiChat()
  return chat.open ? <ChatDrawer /> : null
}

function ChatDrawer() {
  const chat = useAiChat()
  const nav = useNav()
  const [text, setText] = useState('')
  const end = useRef(null)
  const input = useRef(null)
  const hasKey = hasKeyFlag()
  const model = getModel()
  useEffect(() => registerModal(closeChat), [])
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [chat.messages, chat.error, chat.confirmed])
  useEffect(() => { if (chat.confirmed) input.current?.focus() }, [chat.confirmed])
  const send = () => { const t = text; if (!t.trim()) return; setText(''); sendMessage(t) }
  const ready = hasKey && chat.confirmed
  return (
    <aside className="aichat" role="dialog" aria-label="Ask AI" data-testid="ai-drawer">
      <div className="aic-head">
        <b>Ask AI</b> <span className="pill" title="The model set in Settings → AI assistant">{model}</span>
        <span className="sp" />
        <button className="btn sm" onClick={newChat} disabled={!chat.messages.length && !chat.busy}>New chat</button>
        <button className="x" onClick={closeChat} aria-label="Close chat">✕</button>
      </div>
      <div className="aic-msgs" aria-live="polite">
        {!hasKey && (
          <div className="warnrow" data-testid="ai-nokey">Claude is not set up. Add your own API key in Settings → AI assistant. It is optional, and paid by you.
            <div><button className="btn sm primary" onClick={() => { closeChat(); nav.go('settings', { section: 'ai' }) }}>Open AI settings</button></div></div>
        )}
        {hasKey && !chat.confirmed && (
          <div className="warnrow" data-testid="ai-confirm">Your messages go to Anthropic using your own key. <b>Nothing from your vault is sent</b>: no accounts, balances, plans or policies, only what you type here.
            <div><button className="btn sm primary" onClick={confirmChat}>OK, continue</button></div></div>
        )}
        {ready && !chat.messages.length && (
          <div className="aic-ideas">{IDEAS.map((q) => <button key={q} className="chip" onClick={() => sendMessage(q)}>{q}</button>)}</div>
        )}
        {chat.messages.map((m, i) => (
          <div key={i} className={`aic-msg ${m.role === 'user' ? 'u' : 'a'}`} data-testid={m.role === 'user' ? 'ai-user' : 'ai-answer'}>
            {m.role === 'user' ? m.content : (m.content ? <Markdown text={m.content} /> : <span className="sub">thinking…</span>)}
          </div>
        ))}
        {chat.error && <div className="badrow" role="alert" data-testid="ai-error">{chat.error}</div>}
        <div ref={end} />
      </div>
      <div className="aic-note">It cannot see your data. General information only, not financial advice.</div>
      <form className="aic-compose" onSubmit={(e) => { e.preventDefault(); send() }}>
        <textarea ref={input} rows={2} value={text} maxLength={MAX_INPUT} disabled={!ready} aria-label="Your message" placeholder={ready ? 'Ask a question…' : hasKey ? 'Confirm above to start' : 'Add your key first'}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        {chat.busy ? <button type="button" className="btn" onClick={stopChat}>Stop</button> : <button className="btn primary" disabled={!ready || !text.trim()}>Send</button>}
      </form>
    </aside>
  )
}
