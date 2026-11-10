import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/origin'
import { OAUTH_URL } from '@/lib/config'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = await createClient()
  await supabase.auth.signOut() // the session cookie is shared, so this signs out the sign-in site too
  return NextResponse.redirect(`${OAUTH_URL}/login`, 303)
}
