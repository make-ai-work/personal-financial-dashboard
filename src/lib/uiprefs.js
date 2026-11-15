// Small per-device interface choices (which sections are folded). Kept in this browser; in the demo nothing is kept.
import { IS_DEMO } from './demo.js'

const mem = {}
const KEY = 'ui.collapsed'
const load = () => { if (IS_DEMO) return mem; try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }

// true / false once the user has chosen, undefined before
export const getCollapsed = (id) => load()[id]
export function setCollapsed(id, value) {
  if (IS_DEMO) { mem[id] = value; return }
  try { localStorage.setItem(KEY, JSON.stringify({ ...load(), [id]: value })) } catch { /* storage unavailable */ }
}
