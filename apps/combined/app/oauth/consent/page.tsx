import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail, ALLOWED_DOMAIN, REQUIRE_MFA } from '@/lib/config'
import { verifiedFactors } from '@/lib/auth'
import { Shell } from '@/components/Shell'

const SCOPES: Record<string, string> = {
  openid: 'Confirm that it is you',
  email: 'See your @draco-mail.com address',
  profile: 'See your name and username',
}
const host = (u: string) => { try { return new URL(u).host } catch { return u } }

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: authorizationId } = await searchParams
  if (!authorizationId) {
    return <Shell title="Request not valid"><p>This page needs a sign-in request from an app. Go back to the app and try again.</p></Shell>
  }
  const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) redirect(`/login?next=${encodeURIComponent(back)}`)

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') redirect(`/mfa?next=${encodeURIComponent(back)}`)

  if (REQUIRE_MFA && (await verifiedFactors(supabase)).length === 0) {
    redirect(`/security/two-step?need=setup&next=${encodeURIComponent(back)}`)
  }

  const email = String(claims.email ?? '').toLowerCase()
  if (!isAllowedEmail(email)) {
    return (
      <Shell title="This account can’t be used">
        <p>Continue with Caged Dragon only works with @{ALLOWED_DOMAIN} accounts. You are signed in as {email || 'an account without an email'}.</p>
        <form action="/auth/signout" method="POST"><button className="secondary">Sign out</button></form>
      </Shell>
    )
  }

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !details) {
    return <Shell title="Request expired"><p>This sign-in request is no longer valid. Go back to the app and try again.</p></Shell>
  }
  if (!('authorization_id' in details)) redirect(details.redirect_url)

  const scopes = (details.scope ?? '').split(' ').filter(Boolean)
  const insecure = !details.redirect_uri.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(details.redirect_uri)

  return (
    <Shell title={`Sign in to ${details.client.name}?`}>
      <div className="client">
        <span className="avatar" aria-hidden="true">{details.client.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{details.client.name}</strong>
          {details.client.uri && <div className="fine">{host(details.client.uri)}</div>}
        </div>
      </div>
      <p>This app will sign you in as <strong>{email}</strong> and can:</p>
      <ul className="scopes">{scopes.map((s) => <li key={s}>{SCOPES[s] ?? s}</li>)}</ul>
      <p className="fine">It cannot read your mail or change your account. You can remove access any time in Connected apps.</p>
      {insecure && <p className="error" role="alert">Warning: this app is not using a secure address.</p>}
      <p className="fine">After you choose, you will be sent to <strong>{host(details.redirect_uri)}</strong></p>
      <form action="/api/oauth/decision" method="POST" className="actions">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button className="primary" name="decision" value="approve">Allow</button>
        <button className="secondary" name="decision" value="deny">Cancel</button>
      </form>
    </Shell>
  )
}
