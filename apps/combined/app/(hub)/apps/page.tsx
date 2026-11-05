import { requireSession } from '@/lib/auth'
import { ConfirmButton } from '@/components/SecurityActions'
import { revokeApp } from './actions'

const SCOPE: Record<string, string> = { openid: 'Confirm it is you', email: 'See your email address', profile: 'See your name and username' }
const host = (u?: string) => { try { return u ? new URL(u).host : '' } catch { return '' } }

export default async function Apps({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams
  const { supabase } = await requireSession('/apps')
  const { data: grants, error } = await supabase.auth.oauth.listGrants()

  return (
    <>
      <h1 className="hubh1">Connected apps</h1>
      <p className="hubsub">Apps you signed in to with Caged Dragon. They can recognise you, but they cannot read your mail or change your account.</p>
      {sp.ok && <p className="info" role="status" style={{ textAlign: 'center' }}>Access removed. The app is signed out everywhere.</p>}
      {(sp.error || error) && <p className="error" role="alert" style={{ textAlign: 'center' }}>Something went wrong. Try again.</p>}
      <section className="card">
        <h2>Signing in with Caged Dragon</h2>
        {grants && grants.length === 0 && <p className="fine">You haven’t signed in to any apps with Caged Dragon yet.</p>}
        <ul className="rows">
          {(grants ?? []).map((g) => {
            const uri = (g.client as { uri?: string }).uri
            return (
              <li key={g.client.id}>
                <details className="hrow" style={{ display: 'block' }}>
                  <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <span><span className="t">{g.client.name}</span>{host(uri) && <span className="d"> · {host(uri)}</span>}<br /><span className="d">Signed in since {new Date(g.granted_at).toLocaleDateString('en')}</span></span>
                    <span className="chev">▾</span>
                  </summary>
                  <div style={{ padding: '.75rem 0 .25rem' }}>
                    <div className="t">This app can:</div>
                    <ul className="checklist">{g.scopes.map((s: string) => <li key={s} className="ok">{SCOPE[s] ?? s}</li>)}</ul>
                    <form action={revokeApp} style={{ marginTop: '.75rem' }}>
                      <input type="hidden" name="client_id" value={g.client.id} />
                      <input type="hidden" name="client_name" value={g.client.name} />
                      <ConfirmButton message={`Remove access for ${g.client.name}?`}>Remove access</ConfirmButton>
                    </form>
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
