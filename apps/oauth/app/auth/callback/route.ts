import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/safe-next'
import { ACCOUNTS_URL } from '@/lib/config'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'), ACCOUNTS_URL || '/')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(next.startsWith('http') ? next : `${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/login?error=link`)
}
