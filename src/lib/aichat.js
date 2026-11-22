// The AI chat: your own Anthropic (Claude) key, called straight from the app to api.anthropic.com. There is no server of ours in between.
// Set up like the home inventory app (bring your own key, saved on this device only, never shown again, asks before sending), plus a chat.
// NOTHING from the vault is ever sent: only the messages you type in the chat. Pure functions and the one streaming call live here so they can be tested.
export const API_URL = 'https://api.anthropic.com/v1/messages'
export const DEFAULT_MODEL = 'claude-haiku-5-5'
export const MODEL_SUGGESTIONS = ['claude-haiku-5-5', 'claude-sonnet-5-5']
export const MAX_HISTORY = 20 // messages sent for context
export const MAX_TOKENS = 1024 // cap on one answer
export const MAX_INPUT = 4000 // characters in one message
export const TIMEOUT_MS = 90_000 // waiting for the answer to start

export const SYSTEM_PROMPT =
  'You are a helpful, concise assistant inside a personal finance dashboard (accounts, property, portfolio and retirement planning). ' +
  'You can NOT see any of the user\'s data: no accounts, balances, plans or policies are shared with you. If asked about their numbers, say you cannot see them ' +
  'and offer to explain the concept or how to work it out. Give general explanations, not personalised financial, tax or legal advice, and say so briefly when it matters. ' +
  'Prefer short answers, plain words and small examples. Use simple lists when they help.'

// A key is checked for shape only; an empty one means "remove it". Same rule as the home inventory app.
export function validateKey(key) {
  const k = String(key ?? '').trim()
  if (k === '') return { ok: true, key: '' }
  if (k.length < 20 || /\s/.test(k)) return { ok: false, error: 'That does not look like an API key.' }
  return { ok: true, key: k }
}
export function validateModel(model) {
  const m = String(model ?? '').trim()
  if (m === '') return { ok: true, model: DEFAULT_MODEL }
  if (m.length > 100 || /\s/.test(m)) return { ok: false, error: 'That does not look like a model name.' }
  return { ok: true, model: m }
}

// The last MAX_HISTORY messages, always starting with a user message (the API requires it), empty ones dropped.
export function trimHistory(messages, max = MAX_HISTORY) {
  const list = messages.filter((m) => m && typeof m.content === 'string' && m.content.trim() !== '').map((m) => ({ role: m.role, content: m.content }))
  let out = list.slice(-max)
  while (out.length && out[0].role !== 'user') out = out.slice(1)
  return out
}

export function buildRequest({ key, model, messages, signal }) {
  return {
    url: API_URL,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true', // Anthropic's rule for calls made from a browser with your own key
      },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, stream: true, system: SYSTEM_PROMPT, messages: trimHistory(messages) }),
      signal,
    },
  }
}

export class AiError extends Error { constructor(message, status = 0) { super(message); this.name = 'AiError'; this.status = status } }

// Plain-words errors, as in the home inventory app.
export function explainAiError(status, model = '') {
  if (status === 401 || status === 403) return 'Anthropic rejected the API key.'
  if (status === 404) return `Anthropic does not know the model '${model}'.`
  if (status === 429 || status === 529) return 'Anthropic rate limit or spending limit reached. Try again later.'
  if (status === 0) return 'Could not reach the Anthropic API. Check your internet connection.'
  return `Anthropic returned an error (HTTP ${status}).`
}

// One SSE event block ("event: ...\ndata: {...}") -> { type, data } or null.
export function parseSseBlock(block) {
  let data = ''
  for (const line of block.split('\n')) if (line.startsWith('data:')) data += line.slice(5).trim()
  if (!data) return null
  try { return JSON.parse(data) } catch { return null }
}

// Streams the answer: yields each piece of text as it arrives. Throws AiError (plain words) when it cannot.
export async function* streamReply({ key, model, messages, fetchImpl = fetch, signal, timeoutMs = TIMEOUT_MS }) {
  const ctl = new AbortController()
  const abort = () => ctl.abort()
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', abort, { once: true }) }
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  let res
  try {
    const { url, init } = buildRequest({ key, model, messages, signal: ctl.signal })
    res = await fetchImpl(url, init)
  } catch (e) {
    clearTimeout(timer)
    if (signal?.aborted) throw e
    throw new AiError(explainAiError(0))
  }
  clearTimeout(timer)
  if (!res.ok) throw new AiError(explainAiError(res.status, model), res.status)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const ev = parseSseBlock(buf.slice(0, i)); buf = buf.slice(i + 2)
        if (!ev) continue
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) yield ev.delta.text
        else if (ev.type === 'error') throw new AiError(ev.error?.type === 'overloaded_error' || ev.error?.type === 'rate_limit_error' ? explainAiError(429) : 'Anthropic stopped the answer. Try again.')
        else if (ev.type === 'message_stop') return
      }
    }
  } finally { try { reader.cancel() } catch { /* already closed */ } }
}
