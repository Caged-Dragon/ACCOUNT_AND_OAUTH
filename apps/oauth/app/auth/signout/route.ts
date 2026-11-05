import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/origin'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), 303)
}
