'use server'
import { createClient } from '@/lib/supabase/server'
import { logEvent } from '@/lib/events'

// Events the browser may report after a successful sign-in step. Everything else is logged by the server itself.
const ALLOWED = ['sign_in_password', 'sign_in_passkey', 'mfa_verified', 'factor_added', 'passkey_added', 'password_changed']

export async function recordEvent(event: string) {
  if (!ALLOWED.includes(event)) return
  await logEvent(await createClient(), event)
}
