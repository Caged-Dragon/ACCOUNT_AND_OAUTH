import { requireSession, verifiedFactors } from '@/lib/auth'
import { PASSKEYS_ENABLED } from '@/lib/config'
import { EVENT_LABEL } from '@/lib/event-labels'
import { SignOutEverywhere } from '@/components/SecurityActions'
import { signOutOthers } from './actions'

const OK: Record<string, string> = { others: 'Signed out on your other devices.', password: 'Password changed.' }

export default async function Security({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sp = await searchParams
  const { supabase } = await requireSession('/security')
  const factors = await verifiedFactors(supabase)
  const [grants, last] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    supabase.from('account_security_events').select('event, created_at').order('created_at', { ascending: false }).limit(1),
  ])
  let passkeys = 0
  if (PASSKEYS_ENABLED) { const r = await supabase.auth.passkey.list(); passkeys = Array.isArray(r.data) ? r.data.length : 0 }
  const lastEvent = last.data?.[0] as { event: string; created_at: string } | undefined

  return (
    <>
      <h1 className="hubh1">Security</h1>
      <p className="hubsub">Settings and recommendations to help you keep your account secure.</p>
      {sp.ok && OK[sp.ok] && <p className="info" role="status" style={{ textAlign: 'center' }}>{OK[sp.ok]}</p>}

      <section className="card">
        <h2>How you sign in</h2>
        <ul className="rows">
          <li><a className="hrow" href="/security/password"><div><div className="t">Password</div><div className="d">Change your password</div></div><span className="chev">›</span></a></li>
          <li><a className="hrow" href="/security/two-step"><div><div className="t">2-Step Verification</div><div className="d">{factors.length ? `${factors.length} method${factors.length > 1 ? 's' : ''}: authenticator app, passkey or security key` : 'Add a second step after your password'}</div></div><span className={`pill ${factors.length ? 'good' : 'warn'}`}>{factors.length ? 'On' : 'Off'}</span></a></li>
          {PASSKEYS_ENABLED && <li><a className="hrow" href="/security/passkeys"><div><div className="t">Passkeys</div><div className="d">Sign in without a password</div></div><span className={`pill ${passkeys ? 'good' : 'warn'}`}>{passkeys ? passkeys : 'None'}</span></a></li>}
        </ul>
      </section>

      <section className="card">
        <h2>Recent security activity</h2>
        <ul className="rows">
          <li><a className="hrow" href="/security/activity"><div><div className="t">{lastEvent ? (EVENT_LABEL[lastEvent.event] ?? lastEvent.event) : 'No activity yet'}</div><div className="d">{lastEvent ? new Date(lastEvent.created_at).toLocaleString('en') : 'Sign-ins and changes will appear here'}</div></div><span className="chev">›</span></a></li>
        </ul>
      </section>

      <section className="card">
        <h2>Your devices</h2>
        <p className="fine">Lost a phone or used a shared computer? End the sessions.</p>
        <div className="actions">
          <form action={signOutOthers}><button className="secondary">Sign out other devices</button></form>
          <SignOutEverywhere />
        </div>
      </section>

      <section className="card">
        <h2>Third-party apps with account access</h2>
        <ul className="rows">
          <li><a className="hrow" href="/apps"><div><div className="t">{(grants.data ?? []).length} connected app{(grants.data ?? []).length === 1 ? '' : 's'}</div><div className="d">Review what each app can access</div></div><span className="chev">›</span></a></li>
        </ul>
      </section>
    </>
  )
}
