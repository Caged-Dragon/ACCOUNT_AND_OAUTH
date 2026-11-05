'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RP_ID } from '@/lib/config'
import { recordEvent } from '@/app/actions/events'

export function AddFactor({ next }: { next: string }) {
  const [mode, setMode] = useState<'choose' | 'totp' | 'key'>('choose')
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const done = async () => { await recordEvent('factor_added'); window.location.assign(next || '/security/two-step?ok=added') }

  async function startTotp() {
    setMode('totp'); setBusy(true); setError('')
    const { data, error } = await createClient().auth.mfa.enroll({
      factorType: 'totp', friendlyName: `Authenticator ${Math.random().toString(36).slice(2, 8)}`,
    })
    if (error || !data) setError(error?.message ?? 'Could not start setup.')
    else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    setBusy(false)
  }

  async function confirmTotp(e: React.FormEvent) {
    e.preventDefault()
    if (!factor) return
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (ce || !ch) { setError(ce?.message ?? 'Challenge failed.'); setBusy(false); return }
    const { error: ve } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: code.replace(/\s/g, '') })
    if (ve) { setError('That code is not right. Check the newest code and try again.'); setBusy(false); return }
    await done()
  }

  async function addKey(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await createClient().auth.mfa.webauthn.register({
      friendlyName: name.trim() || `Passkey ${new Date().toLocaleDateString('en')}`,
      webauthn: { rpId: RP_ID, rpOrigins: [location.origin] },
    })
    if (error) { setError('Could not add it. If you cancelled the prompt, try again.'); setBusy(false); return }
    await done()
  }

  if (mode === 'choose') {
    return (
      <div className="form">
        <button className="primary" onClick={startTotp}>Add an authenticator app (6-digit codes)</button>
        <button className="primary" onClick={() => setMode('key')}>Add a passkey or security key</button>
        <p className="fine">Passkeys can live on this device, a hardware key, or your phone. Choosing “Use a phone or tablet” lets you approve sign-ins from your phone.</p>
      </div>
    )
  }
  if (mode === 'key') {
    return (
      <form onSubmit={addKey} className="form">
        <label>Name it (for example “iPhone” or “YubiKey”)
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={busy}>Continue</button>
        <button type="button" className="link" onClick={() => setMode('choose')}>Back</button>
      </form>
    )
  }
  return (
    <form onSubmit={confirmTotp} className="form">
      {factor ? (
        <>
          <p>Scan this with an authenticator app (Google Authenticator, 1Password, Authy…).</p>
          <img className="qr" src={factor.qr} alt="QR code for your authenticator app" width={180} height={180} />
          <p className="fine">Can’t scan? Enter this key manually: <code>{factor.secret}</code></p>
          <label>Then enter the 6-digit code
            <input className="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
              required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>Turn it on</button>
        </>
      ) : <p>Preparing…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <button type="button" className="link" onClick={() => setMode('choose')}>Back</button>
    </form>
  )
}
