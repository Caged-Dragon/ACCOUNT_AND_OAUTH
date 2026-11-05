'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth'
import { logEvent } from '@/lib/events'

export async function revokeApp(formData: FormData) {
  const { supabase } = await requireSession('/apps')
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: String(formData.get('client_id')) })
  if (!error) await logEvent(supabase, 'app_revoked', String(formData.get('client_name') ?? '').slice(0, 100))
  revalidatePath('/apps')
  redirect(`/apps?${error ? 'error=1' : 'ok=1'}`)
}
