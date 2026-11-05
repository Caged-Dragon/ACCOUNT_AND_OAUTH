'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ALLOWED_DOMAIN, PASSKEYS_ENABLED, TURNSTILE_SITE_KEY, isAllowedEmail } from '@/lib/config'
import { Turnstile } from '@/components/Turnstile'
import { recordEvent } from '@/app/actions/events'

const ALLOW_SIGNUP = process.env.NEXT_PUBLIC_ALLOW_SIGNUP === 'true'
const MAIL_URL = process.env.NEXT_PUBLIC_MAIL_URL

export function AuthForm({ next, notice }: { next: string; notice?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [reset, setReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(
    notice ? { kind: 'error', text: notice } : null
  )
  const onToken = useCallback((t: string) => setToken(t), [])

  async function finish(supabase: ReturnType<typeof createClient>, method: string) {
    await recordEvent(method)
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const needsMfa = aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'
    window.location.assign(needsMfa ? `/mfa?next=${encodeURIComponent(next)}` : next)
  }

  function needCaptcha() {
    if (TURNSTILE_SITE_KEY && !token) {
      setMessage({ kind: 'error', text: 'Please complete the security check first.' })
      return true
    }
    return false
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!isAllowedEmail(email)) return setMessage({ kind: 'error', text: `Use your @${ALLOWED_DOMAIN} address.` })
    if (needCaptcha()) return
    setBusy(true)
    const supabase = createClient()
    const captchaToken = token || undefined
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
      if (error) {
        setMessage({ kind: 'error', text: error.message })
        setBusy(false); setReset((n) => n + 1)
        return
      }
      await finish(supabase, 'sign_in_password')
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { captchaToken, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) setMessage({ kind: 'error', text: error.message })
      else if (data.session) window.location.assign(next)
      else setMessage({ kind: 'info', text: 'Check your inbox for the confirmation link, then sign in.' })
      setBusy(false); setReset((n) => n + 1)
    }
  }

  async function passkey() {
    setMessage(null)
    if (needCaptcha()) return
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPasskey({ options: { captchaToken: token || undefined } })
    if (error) {
      setMessage({ kind: 'error', text: 'Passkey sign-in was cancelled or failed. Try again, or use your password.' })
      setBusy(false); setReset((n) => n + 1)
      return
    }
    await finish(supabase, 'sign_in_passkey')
  }

  return (
    <form onSubmit={submit} className="form">
      {PASSKEYS_ENABLED && mode === 'signin' && (
        <>
          <button type="button" className="secondary" onClick={passkey} disabled={busy}>Sign in with a passkey</button>
          <p className="fine">Use your fingerprint, face, device PIN, security key, or approve on your phone. No password needed.</p>
          <hr />
        </>
      )}
      <label>Email
        <input type="email" autoComplete="username" required value={email}
          placeholder={`name@${ALLOWED_DOMAIN}`} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>Password
        <input type="password" required minLength={10}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Turnstile onToken={onToken} resetKey={reset} />
      <div aria-live="polite">{message && <p role="status" className={message.kind}>{message.text}</p>}</div>
      <button className="primary" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      {mode === 'signin' && <a href="/forgot-password">Forgot your password?</a>}
      {ALLOW_SIGNUP ? (
        <button type="button" className="link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null) }}>
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      ) : MAIL_URL ? (
        <p className="fine">No account yet? <a href={MAIL_URL}>Create your @{ALLOWED_DOMAIN} address</a> first.</p>
      ) : null}
    </form>
  )
}
