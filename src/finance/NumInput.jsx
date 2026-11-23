import { useLayoutEffect, useRef, useState } from 'react'
import { groupNumber, plainNumber } from '../lib/numfmt.js'

// A number field that shows thousands separators as you type. It is used like a plain <input>: `value` is the plain number text (or a number), and
// onChange receives an event whose target.value is the plain number text (no commas), so nothing stored or calculated ever sees a comma.
export default function NumInput({ value, onChange, ...rest }) {
  const ref = useRef(null)
  const caret = useRef(null) // how many digits/point were left of the cursor before the value was re-formatted
  // What is typed is kept as text ("5." and "-" are fine while typing); the value from outside only wins when it means something different
  // (a reset, a loaded plan, a calculated field).
  const [text, setText] = useState(value == null ? '' : String(value))
  const outside = value == null ? '' : String(value)
  const incomplete = /^-?\.?$/.test(text)
  const same = incomplete ? outside === '' : text === outside || (text !== '' && outside !== '' && Number(text) === Number(outside))
  const shown = groupNumber(same ? text : outside)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || caret.current === null || document.activeElement !== el) return
    let seen = 0, pos = 0
    while (pos < shown.length && seen < caret.current) { if (shown[pos] !== ',') seen++; pos++ }
    el.setSelectionRange(pos, pos)
    caret.current = null
  })
  return (
    <input {...rest} ref={ref} inputMode="decimal" autoComplete="off" value={shown}
      onChange={(e) => {
        const plain = plainNumber(e.target.value)
        if (plain === null) return // not a number: ignore the key press
        const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length)
        caret.current = before.replace(/[,\s ]/g, '').length
        onChange?.({ target: { value: plain }, currentTarget: { value: plain } })
      }} />
  )
}
