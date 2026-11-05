import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { requireRecent, requireSession } from '@/lib/auth'

export function isAdminEmail(email: unknown): boolean {
  const list = (process.env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
  return typeof email === 'string' && list.includes(email.trim().toLowerCase())
}

export const adminConfigured = () => Boolean(process.env.SUPABASE_SECRET_KEY)

// Admins must be on the allow-list AND have completed two-step verification this session.
export async function requireAdmin() {
  const { supabase, claims } = await requireSession('/admin')
  if (!isAdminEmail(claims.email)) notFound()
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') redirect('/security/two-step?need=mfa')
  await requireRecent(supabase, claims, '/admin', 15)
  return { claims }
}

export function adminClient() {
  return createAdminSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
