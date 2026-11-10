'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRecent, requireSession, verifiedFactors } from '@/lib/auth'
import { REQUIRE_MFA } from '@/lib/config'
import { logEvent } from '@/lib/events'

export async function removeFactor(formData: FormData) {
  const back = '/security/two-step'
  const { supabase, claims } = await requireSession(back, { allowUnenrolled: true })
  await requireRecent(supabase, claims, back)
  if (REQUIRE_MFA && (await verifiedFactors(supabase)).length <= 1) redirect(`${back}?error=last`)
  const { error } = await supabase.auth.mfa.unenroll({ factorId: String(formData.get('factor_id')) })
  if (!error) await logEvent(supabase, 'factor_removed')
  revalidatePath(back)
  redirect(`${back}?${error ? 'error=remove' : 'ok=removed'}`)
}

export async function deletePasskey(formData: FormData) {
  const back = '/security/passkeys'
  const { supabase, claims } = await requireSession(back, { allowUnenrolled: true })
  await requireRecent(supabase, claims, back)
  const { error } = await supabase.auth.passkey.delete({ passkeyId: String(formData.get('passkey_id')) })
  if (!error) await logEvent(supabase, 'passkey_removed')
  revalidatePath(back)
  redirect(`${back}?${error ? 'error=remove' : 'ok=passkey-removed'}`)
}

export async function signOutOthers() {
  const { supabase } = await requireSession('/security', { allowUnenrolled: true })
  await supabase.auth.signOut({ scope: 'others' })
  await logEvent(supabase, 'signed_out_others')
  redirect('/security?ok=others')
}
