const CLASS = { overdue: 's-over', soon: 's-soon', ok: 's-ok', none: 's-na' }

export default function StatusChip({ status, text }) {
  return <span className={`st ${CLASS[status] || 's-na'}`}>{text}</span>
}
