import { Avatar } from '@/components/hub/Avatar'
import { requireSession, verifiedFactors } from '@/lib/auth'
import { getHubUser } from '@/lib/hub'
import { PASSKEYS_ENABLED } from '@/lib/config'
import { EVENT_LABEL } from '@/lib/event-labels'

export const metadata = { title: 'Home' }

export default async function Home() {
  const { supabase } = await requireSession('/')
  const user = (await getHubUser())!
  const [factors, grants, events] = await Promise.all([
    verifiedFactors(supabase),
    supabase.auth.oauth.listGrants(),
    supabase.from('account_security_events').select('event, created_at').order('created_at', { ascending: false }).limit(3),
  ])
  let passkeys = 0
  if (PASSKEYS_ENABLED) { const r = await supabase.auth.passkey.list(); passkeys = Array.isArray(r.data) ? r.data.length : 0 }
  const apps = grants.data ?? []
  const twoStep = factors.length > 0
  const protectedAcct = twoStep

  return (
    <>
      <div className="hero">
        <Avatar url={user.avatarUrl} name={user.name} size={96} />
        <h1 className="hubh1" style={{ margin: 0 }}>Welcome, {user.name}</h1>
        <p className="hubsub">Manage your info, security and connected apps for your Caged Dragon account.</p>
      </div>

      <div className="cardgrid">
        <section className="card">
          <h2>Privacy & personalisation</h2>
          <p className="fine">Your profile, contact details and preferences.</p>
          <a className="more" href="/personal-info">Manage your personal info</a>
        </section>

        <section className="card">
          <h2>{protectedAcct ? 'Your account is protected' : 'Protect your account'}</h2>
          <ul className="checklist">
            <li className="ok">Password set</li>
            <li className={twoStep ? 'ok' : 'no'}>2-Step Verification {twoStep ? `on (${factors.length})` : 'is off'}</li>
            {PASSKEYS_ENABLED && <li className={passkeys ? 'ok' : 'no'}>{passkeys ? `${passkeys} passkey${passkeys > 1 ? 's' : ''}` : 'No passkey yet'}</li>}
            {twoStep && factors.length === 1 && <li className="no">Add a backup method</li>}
          </ul>
          <a className="more" href="/security">Review security</a>
        </section>

        <section className="card">
          <h2>Connected apps</h2>
          <p className="fine">{apps.length ? `${apps.length} app${apps.length > 1 ? 's' : ''} can sign you in: ${apps.slice(0, 3).map((a) => a.client.name).join(', ')}${apps.length > 3 ? '…' : ''}` : 'No apps are connected.'}</p>
          <a className="more" href="/apps">Manage connected apps</a>
        </section>

        <section className="card">
          <h2>Recent security activity</h2>
          {events.data && events.data.length > 0 ? (
            <ul className="checklist">
              {events.data.map((e: { event: string; created_at: string }, i: number) => (
                <li key={i} className="ok">{EVENT_LABEL[e.event] ?? e.event}, {new Date(e.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</li>
              ))}
            </ul>
          ) : <p className="fine">Nothing recorded yet.</p>}
          <a className="more" href="/security/activity">See all activity</a>
        </section>

        <section className="card">
          <h2>Data & privacy</h2>
          <p className="fine">Download a copy of your data or delete your account.</p>
          <a className="more" href="/data">Manage your data</a>
        </section>
      </div>
    </>
  )
}
