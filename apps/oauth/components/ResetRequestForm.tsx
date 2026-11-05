'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TURNSTILE_SITE_KEY } from '@/lib/config'
import { Turnstile } from '@/components/Turnstile'

export function ResetRequestForm() {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const onToken = useCallback((t: string) => setToken(t), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (TURNSTILE_SITE_KEY && !token) return setError('Please complete the security check first.')
    setBusy(true); setError('')
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/update-password')}`,
      captchaToken: token || undefined,
    })
    setSent(true) // same message whether or not the account exists
    setBusy(false)
  }

  if (sent) return <p className="info" role="status">If that address has an account, a reset link is on its way.</p>
  return (
    <form onSubmit={submit} className="form">
      <label>Email
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Turnstile onToken={onToken} resetKey={0} />
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy}>Send reset link</button>
    </form>
  )
}
