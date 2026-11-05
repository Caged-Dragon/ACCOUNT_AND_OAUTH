'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { recordEvent } from '@/app/actions/events'

export function ConfirmButton({ message, children, danger }: { message: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button className={danger ? 'btn-danger' : 'secondary'} onClick={(e) => { if (!confirm(message)) e.preventDefault() }}>
      {children}
    </button>
  )
}

export function SignOutEverywhere() {
  async function run() {
    if (!confirm('Sign out on all devices, including this one?')) return
    await createClient().auth.signOut({ scope: 'global' })
    window.location.assign((process.env.NEXT_PUBLIC_OAUTH_URL ?? '') + '/login')
  }
  return <button className="secondary" onClick={run}>Sign out on all devices</button>
}

export function PasskeyAdd() {
  const [error, setError] = useState('')
  async function add() {
    setError('')
    const { error } = await createClient().auth.registerPasskey()
    if (error) { setError('Could not add the passkey. If you cancelled the prompt, try again.'); return }
    await recordEvent('passkey_added')
    window.location.assign('/security/passkeys?ok=passkey')
  }
  return (
    <>
      <button className="primary" onClick={add}>Add a passkey</button>
      {error && <p role="alert" className="error">{error}</p>}
    </>
  )
}
