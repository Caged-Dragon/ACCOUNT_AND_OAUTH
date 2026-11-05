import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { MfaChallenge } from '@/components/MfaChallenge'
import { verifiedFactors } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/safe-next'

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string; reauth?: string }> }) {
  const sp = await searchParams
  const next = safeNext(sp.next, '/')
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(next)}`)

  const factors = await verifiedFactors(supabase)
  if (factors.length === 0) redirect(next)
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!sp.reauth && aal?.currentLevel === 'aal2') redirect(next)

  return (
    <Shell title={sp.reauth ? 'Confirm it is you' : 'Two-step verification'}>
      <p>{sp.reauth ? 'This change needs a fresh check.' : 'One more step to finish signing in.'}</p>
      <MfaChallenge next={next} factors={factors.map((f) => ({ id: f.id, friendly_name: f.friendly_name, factor_type: f.factor_type }))} />
      <form action="/auth/signout" method="POST"><button className="link">Use a different account</button></form>
    </Shell>
  )
}
