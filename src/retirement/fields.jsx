// Small form pieces shared by the Retirement pages.

// Label + number input on one row. `value` may be '' while typing.
export function NumRow({ label, hint, value, onChange, step, width = 110, placeholder, suffix, min, id }) {
  return (
    <label className="rowf">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <span className="inl">
        <input type="number" inputMode="decimal" value={value ?? ''} step={step} min={min} placeholder={placeholder} style={{ width }} id={id}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} aria-label={label} />
        {suffix}
      </span>
    </label>
  )
}

export const Row = ({ label, hint, children }) => (
  <div className="rowf"><span>{label}{hint && <small>{hint}</small>}</span>{children}</div>
)
