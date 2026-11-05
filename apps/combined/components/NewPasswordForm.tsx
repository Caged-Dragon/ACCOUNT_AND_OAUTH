'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { recordEvent } from '@/app/actions/events'

export function NewPasswordForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) { setError(error.message); setBusy(false); return }
    await recordEvent('password_changed')
    window.location.assign('/security?ok=password')
  }

  return (
    <form onSubmit={submit} className="form">
      <label>New password
        <input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy}>Save new password</button>
    </form>
  )
}
