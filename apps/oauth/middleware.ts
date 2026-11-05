import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Refreshes the session cookie. It must NOT redirect to /login: doing so before
// /oauth/consent runs would drop the authorization_id and break the OAuth flow.
export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
