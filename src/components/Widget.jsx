export default function Widget({ title, children }) {
  return (
    <section className="widget">
      {title && <h2 className="widget-title">{title}</h2>}
      {children}
    </section>
  )
}
