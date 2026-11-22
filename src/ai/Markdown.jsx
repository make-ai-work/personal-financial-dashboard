// A tiny, safe renderer for the assistant's answers: paragraphs, "- " and "1. " lists, **bold**, `code`. Everything is React text, never HTML.
import { Fragment } from 'react'

const inline = (text, key) => {
  const parts = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const t = m[0]
    parts.push(t.startsWith('**') ? <b key={`${key}-${i++}`}>{t.slice(2, -2)}</b> : <code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>)
    last = m.index + t.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function Markdown({ text }) {
  const lines = String(text || '').split('\n')
  const out = []
  let list = null
  const flush = () => { if (list) { out.push(list.ordered ? <ol key={`l${out.length}`}>{list.items}</ol> : <ul key={`l${out.length}`}>{list.items}</ul>); list = null } }
  lines.forEach((line, i) => {
    const b = /^\s*[-*•]\s+(.*)$/.exec(line)
    const n = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (b || n) {
      const ordered = !!n
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push(<li key={i}>{inline((b || n)[1], i)}</li>)
    } else {
      flush()
      if (line.trim() !== '') out.push(<p key={i}>{inline(line, i)}</p>)
    }
  })
  flush()
  return <Fragment>{out}</Fragment>
}
