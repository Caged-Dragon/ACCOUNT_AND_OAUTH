'use client'
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 520 }}>
        <h1>Something went wrong</h1>
        <p>Please try again. If it keeps happening, wait a minute and retry.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  )
}
