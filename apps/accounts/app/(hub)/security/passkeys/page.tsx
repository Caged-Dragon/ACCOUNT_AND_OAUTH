import { notFound } from 'next/navigation'
import { ConfirmButton, PasskeyAdd } from '@/components/SecurityActions'
import { requireSession } from '@/lib/auth'
import { PASSKEYS_ENABLED } from '@/lib/config'
import { deletePasskey } from '../actions'

const OK: Record<string, string> = { passkey: 'Passkey added.', 'passkey-removed': 'Passkey removed.' }

export default async function Passkeys({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!PASSKEYS_ENABLED) notFound()
  const sp = await searchParams
  const { supabase } = await requireSession('/security/passkeys', { allowUnenrolled: true })
  const res = await supabase.auth.passkey.list()
  const passkeys: { id: string; friendly_name?: string; created_at: string }[] = Array.isArray(res.data) ? res.data : []

  return (
    <>
      <h1 className="hubh1">Passkeys</h1>
      <p className="hubsub">Sign in with your fingerprint, face, screen lock or a security key. Choose “Use a phone or tablet” to approve from your phone.</p>
      {sp.ok && OK[sp.ok] && <p className="info" role="status">{OK[sp.ok]}</p>}
      {sp.error && <p className="error" role="alert">Could not remove it. Try again.</p>}
      <section className="card">
        <h2>Your passkeys</h2>
        {passkeys.length === 0 && <p className="fine">You have no passkeys yet.</p>}
        <ul className="rows">
          {passkeys.map((p) => (
            <li key={p.id}>
              <div className="hrow">
                <div><div className="t">{p.friendly_name || 'Passkey'}</div><div className="d">Added {new Date(p.created_at).toLocaleDateString('en')}</div></div>
                <form action={deletePasskey}><input type="hidden" name="passkey_id" value={p.id} /><ConfirmButton message="Remove this passkey?">Remove</ConfirmButton></form>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="card"><h2>Add a passkey</h2><PasskeyAdd /></section>
    </>
  )
}
