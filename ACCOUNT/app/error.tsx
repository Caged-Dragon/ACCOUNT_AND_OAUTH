'use client'
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="stage"><aside className="cage" aria-hidden="true" /><section className="panel">
      <h1>Something went wrong</h1>
      <p>Please try again. If it keeps happening, wait a minute and retry.</p>
      <button className="primary" onClick={reset}>Try again</button>
    </section></main>
  )
}
