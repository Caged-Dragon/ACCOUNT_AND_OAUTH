import 'server-only'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

// Writes to the user's own security activity list. Never throws.
export async function logEvent(supabase: SupabaseClient, event: string, detail?: string) {
  try {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || ''
    await supabase.rpc('account_log_security_event', { p_event: event, p_detail: detail ?? null, p_ip: ip || null, p_ua: h.get('user-agent') })
  } catch {
    // activity logging must never break the action itself
  }
}
