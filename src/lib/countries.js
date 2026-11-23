// Pure helpers for the "Countries shown" lists (Finance and Property each keep their own).
import { COUNTRY_CODES } from './format.js'

// Keep only valid, unique codes in order; never return an empty list.
export function sanitizeCountries(list, fallback = ['us']) {
  const out = []
  for (const c of list || []) if (COUNTRY_CODES.includes(c) && !out.includes(c)) out.push(c)
  return out.length ? out : [...fallback]
}

// Tick or untick a country. Unticking the last remaining one is ignored.
export function toggleCountry(list, code) {
  if (list.includes(code)) return list.length > 1 ? list.filter((c) => c !== code) : list
  return COUNTRY_CODES.includes(code) ? [...list, code] : list
}

export function moveCountry(list, code, dir) {
  const i = list.indexOf(code)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
