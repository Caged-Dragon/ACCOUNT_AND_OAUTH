export function Shell({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`stage${wide ? ' wide' : ''}`}>
      <aside className="cage" aria-hidden="true">
        <span className="mark">Caged<br />Dragon</span>
      </aside>
      <section className="panel">
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  )
}
