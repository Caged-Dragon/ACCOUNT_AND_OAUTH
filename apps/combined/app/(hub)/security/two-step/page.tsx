import { AddFactor } from '@/components/AddFactor'
import { ConfirmButton } from '@/components/SecurityActions'
import { requireSession, verifiedFactors } from '@/lib/auth'
import { REQUIRE_MFA } from '@/lib/config'
import { safeNext } from '@/lib/safe-next'
import { removeFactor } from '../actions'

const OK: Record<string, string> = { added: 'Added. Your second step is on.', removed: 'Removed.' }
const ERR: Record<string, string> = {
  remove: 'Could not remove it. Try again.',
  last: 'Two-step verification is required for this account, so your last method cannot be removed. Add another first.',
}
const KIND: Record<string, string> = { totp: 'Authenticator app', webauthn: 'Passkey or security key', phone: 'Phone' }

export default async function TwoStep({ searchParams }: { searchParams: Promise<{ need?: string; ok?: string; error?: string; next?: string }> }) {
  const sp = await searchParams
  const next = safeNext(sp.next, '')
  const { supabase } = await requireSession('/security/two-step', { allowUnenrolled: true })
  const factors = await verifiedFactors(supabase)

  return (
    <>
      <h1 className="hubh1">2-Step Verification</h1>
      <p className="hubsub">After your password, prove it is you with a passkey, security key (including your phone) or an authenticator app.</p>
      {sp.need === 'mfa' && <p className="error" role="alert">Admin tools need two-step verification. Add a method below, then try again.</p>}
      {sp.need === 'setup' && <p className="error" role="alert">Two-step verification is required for this account. Add a method to continue.</p>}
      {sp.ok && OK[sp.ok] && <p className="info" role="status">{OK[sp.ok]}</p>}
      {sp.error && ERR[sp.error] && <p className="error" role="alert">{ERR[sp.error]}</p>}

      <section className="card">
        <h2>Your methods</h2>
        {factors.length === 0 && <p className="error">No second step yet: your account relies on your password alone.{REQUIRE_MFA ? '' : ' Add one now.'}</p>}
        {factors.length === 1 && <p className="info">Add a second method as a backup, so losing one device does not lock you out.</p>}
        <ul className="rows">
          {factors.map((f) => (
            <li key={f.id}>
              <div className="hrow">
                <div><div className="t">{f.friendly_name || KIND[f.factor_type] || f.factor_type}</div><div className="d">{KIND[f.factor_type] ?? f.factor_type} · added {new Date(f.created_at).toLocaleDateString('en')}</div></div>
                <form action={removeFactor}><input type="hidden" name="factor_id" value={f.id} /><ConfirmButton message="Remove this verification method?">Remove</ConfirmButton></form>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="card"><h2>Add a method</h2><AddFactor next={next} /></section>
    </>
  )
}
