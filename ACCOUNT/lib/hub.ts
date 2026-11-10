import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type HubUser = {
  id: string; email: string; username: string; name: string; firstName: string
  avatarUrl: string | null; avatarPath: string | null
  profile: { given_name: string | null; family_name: string | null; display_name: string | null; phone: string | null; birthday: string | null; locale: string | null; time_zone: string | null }
}

export const getHubUser = cache(async (): Promise<HubUser | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return null
  const { data: p } = await supabase
    .from('account_profiles')
    .select('username, display_name, given_name, family_name, phone, birthday, locale, time_zone, avatar_url')
    .eq('id', claims.sub).maybeSingle()
  let avatarUrl: string | null = null
  if (p?.avatar_url) {
    const { data: s } = await supabase.storage.from('account_avatars').createSignedUrl(p.avatar_url, 3600)
    avatarUrl = s?.signedUrl ?? null
  }
  const username: string = p?.username ?? String(claims.email ?? '').split('@')[0]
  const full = [p?.given_name, p?.family_name].filter(Boolean).join(' ')
  return {
    id: claims.sub, email: String(claims.email ?? ''), username,
    name: p?.display_name || full || username, firstName: p?.given_name || p?.display_name?.split(' ')[0] || username,
    avatarUrl, avatarPath: p?.avatar_url ?? null,
    profile: { given_name: p?.given_name ?? null, family_name: p?.family_name ?? null, display_name: p?.display_name ?? null,
      phone: p?.phone ?? null, birthday: p?.birthday ?? null, locale: p?.locale ?? null, time_zone: p?.time_zone ?? null },
  }
})

export { describeUA } from '@/lib/ua'
