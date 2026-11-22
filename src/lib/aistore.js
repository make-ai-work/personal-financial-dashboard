// The chat's state, outside React so the drawer can be closed and opened without losing the conversation. It is in memory only: it is cleared when you
// lock, sign out or reload, and "New chat" clears it too. Nothing about it is stored.
import { useSyncExternalStore } from 'react'
import { MAX_INPUT, streamReply } from './aichat.js'
import { getKey, getModel } from './aikey.js'

const fresh = () => ({ open: false, messages: [], busy: false, confirmed: false, error: '' })
let state = fresh()
let ctl = null
const subs = new Set()
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()) }
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
export const useAiChat = () => useSyncExternalStore(subscribe, () => state)
export const aiState = () => state

export const openChat = () => set({ open: true })
export const closeChat = () => set({ open: false })
export const confirmChat = () => set({ confirmed: true })
export function resetChat() { ctl?.abort(); ctl = null; state = fresh(); subs.forEach((f) => f()) }
export function newChat() { ctl?.abort(); ctl = null; set({ messages: [], busy: false, error: '' }) }
export function stopChat() { ctl?.abort() }

export async function sendMessage(text, { fetchImpl } = {}) {
  const t = String(text || '').trim().slice(0, MAX_INPUT)
  if (!t || state.busy || !state.confirmed) return
  const key = await getKey()
  if (!key) { set({ error: 'Claude is not set up. Add your API key in Settings → AI assistant.' }); return }
  const history = [...state.messages, { role: 'user', content: t }]
  set({ messages: [...history, { role: 'assistant', content: '' }], busy: true, error: '' })
  ctl = new AbortController()
  let answer = ''
  try {
    for await (const piece of streamReply({ key, model: getModel(), messages: history, fetchImpl, signal: ctl.signal })) {
      answer += piece
      set({ messages: [...history, { role: 'assistant', content: answer }] })
    }
    if (!answer) set({ error: 'Claude sent an empty answer. Try again.' })
  } catch (e) {
    if (e?.name === 'AbortError') set({ error: answer ? '' : 'Stopped.' })
    else set({ error: e?.message || 'Something went wrong. Try again.' })
  } finally {
    ctl = null
    // an empty assistant bubble (error before any text) is not kept
    set({ busy: false, messages: state.messages.filter((m, i) => !(i === state.messages.length - 1 && m.role === 'assistant' && m.content === '')) })
  }
}
