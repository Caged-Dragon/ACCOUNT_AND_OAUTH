import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ACCOUNTS_URL, REQUIRE_MFA, SITE_URL } from '@/lib/config'

export async function verifiedFactors(supabase: SupabaseClient) {
  const { data } = await supabase.auth.mfa.listFactors()
  return (data?.all ?? []).filter((f) => f.status === 'verified')
}

// Signed in + second step completed (when the account has one) + enrolled (when policy requires it).
export async function requireSession(nextPath: string) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) redirect(`/login?next=${encodeURIComponent(nextPath)}`)

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    redirect(`/mfa?next=${encodeURIComponent(nextPath)}`)
  }
  if (REQUIRE_MFA && (await verifiedFactors(supabase)).length === 0) {
    // Adding a second step happens in the account center, which sends the user back here afterwards.
    redirect(`${ACCOUNTS_URL}/security/two-step?need=setup&next=${encodeURIComponent(SITE_URL + nextPath)}`)
  }
  return { supabase, claims }
}

// Step-up: sensitive actions need a second-step check within the last few minutes.
export async function requireRecent(supabase: SupabaseClient, claims: unknown, nextPath: string, minutes = 10) {
  if ((await verifiedFactors(supabase)).length === 0) return
  const amr = (claims as { amr?: { method: string; timestamp: number }[] }).amr ?? []
  const last = Math.max(0, ...amr.filter((a) => a.method.includes('totp') || a.method.includes('webauthn') || a.method.startsWith('mfa/')).map((a) => a.timestamp))
  if (Date.now() / 1000 - last > minutes * 60) redirect(`/mfa?next=${encodeURIComponent(nextPath)}&reauth=1`)
}
