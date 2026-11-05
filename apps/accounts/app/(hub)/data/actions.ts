'use server'
import { redirect } from 'next/navigation'
import { requireRecent, requireSession } from '@/lib/auth'
import { getHubUser } from '@/lib/hub'
import { OAUTH_URL } from '@/lib/config'
import type { SupabaseClient } from '@supabase/supabase-js'

async function removeFolder(supabase: SupabaseClient, bucket: string, prefix: string, depth = 0) {
  const { data } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
  const files: string[] = []
  for (const o of data ?? []) {
    if (o.id) files.push(`${prefix}/${o.name}`)
    else if (depth < 2) await removeFolder(supabase, bucket, `${prefix}/${o.name}`, depth + 1)
  }
  if (files.length) await supabase.storage.from(bucket).remove(files)
}

export async function deleteAccount(fd: FormData) {
  const { supabase, claims } = await requireSession('/data')
  await requireRecent(supabase, claims, '/data')
  const user = (await getHubUser())!
  if (String(fd.get('confirm') ?? '').trim().toLowerCase() !== user.email.toLowerCase()) redirect('/data?error=confirm')

  await removeFolder(supabase, 'account_avatars', user.id)
  const { error } = await supabase.rpc('account_delete_my_account')
  if (error) redirect('/data?error=delete')
  try { await supabase.auth.signOut() } catch { /* the session is already gone */ }
  redirect(`${OAUTH_URL}/login?error=deleted`)
}
