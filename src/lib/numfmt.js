// Number fields show thousands separators while you type ("1,250,000.50"). The value that is stored and passed on is always the plain number text
// ("1250000.50"). These are the two small pure helpers behind the NumInput component.

// "1250000.5" -> "1,250,000.5". Only the whole part is grouped; what is after the point is left exactly as typed. Anything else is returned as it is.
export function groupNumber(plain) {
  const s = String(plain ?? '')
  const m = /^(-?)(\d*)(\.\d*)?$/.exec(s)
  if (!m) return s
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '')
}

// What was typed or pasted -> plain number text, or null when it cannot be a number. Commas and spaces are ignored: "1,250" and "1 250" both give "1250".
export function plainNumber(typed) {
  const s = String(typed ?? '').replace(/[,\s ]/g, '')
  return /^-?\d*\.?\d*$/.test(s) ? s : null
}
