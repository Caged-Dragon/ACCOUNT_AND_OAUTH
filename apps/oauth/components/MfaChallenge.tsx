'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RP_ID } from '@/lib/config'
import { recordEvent } from '@/app/actions/events'

type Factor = { id: string; friendly_name?: string | null; factor_type: string }

export function MfaChallenge({ factors, next }: { factors: Factor[]; next: string }) {
  const keys = factors.filter((f) => f.factor_type === 'webauthn')
  const totp = factors.filter((f) => f.factor_type === 'totp')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function useKey(factorId: string) {
    setBusy(true); setError('')
    const { error } = await createClient().auth.mfa.webauthn.authenticate({
      factorId,
      webauthn: { rpId: RP_ID, rpOrigins: [location.origin] },
    })
    if (error) { setError('That did not work. Try again, or use another method.'); setBusy(false); return }
    await recordEvent('mfa_verified')
    window.location.assign(next)
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    const factor = totp[0]
    if (!factor) return
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (ce || !ch) { setError(ce?.message ?? 'Could not start verification.'); setBusy(false); return }
    const { error: ve } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: code.replace(/\s/g, '') })
    if (ve) { setError('That code is not right. Use the newest code from your app.'); setBusy(false); return }
    await recordEvent('mfa_verified')
    window.location.assign(next)
  }

  return (
    <div className="form">
      {keys.map((k) => (
        <button key={k.id} className="primary" disabled={busy} onClick={() => useKey(k.id)}>
          Use passkey or security key{keys.length > 1 ? `: ${k.friendly_name ?? 'key'}` : ''}
        </button>
      ))}
      {keys.length > 0 && (
        <p className="fine">Tip: when your browser asks, choose “Use a phone or tablet” to get a prompt on your phone and approve it with your fingerprint or face.</p>
      )}
      {keys.length > 0 && totp.length > 0 && <hr />}
      {totp.length > 0 && (
        <form onSubmit={submitCode} className="form">
          <label>Or enter the 6-digit code from your authenticator app
            <input className="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
              required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="secondary" disabled={busy}>Verify code</button>
        </form>
      )}
      <div aria-live="polite">{error && <p role="alert" className="error">{error}</p>}</div>
    </div>
  )
}
