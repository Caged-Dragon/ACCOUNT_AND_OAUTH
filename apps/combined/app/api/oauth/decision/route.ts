import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail, REQUIRE_MFA } from '@/lib/config'
import { verifiedFactors } from '@/lib/auth'
import { logEvent } from '@/lib/events'
import { sameOrigin } from '@/lib/origin'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await request.formData()
  const decision = form.get('decision')
  const authorizationId = form.get('authorization_id')
  if (typeof authorizationId !== 'string' || !authorizationId) {
    return NextResponse.json({ error: 'Missing authorization_id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!isAllowedEmail(data?.claims?.email)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'Two-step verification required' }, { status: 403 })
  }

  if (REQUIRE_MFA && (await verifiedFactors(supabase)).length === 0) {
    return NextResponse.json({ error: 'Two-step verification required' }, { status: 403 })
  }

  let clientName = ''
  try { const d = await supabase.auth.oauth.getAuthorizationDetails(authorizationId); const det = d.data as { client?: { name?: string } } | null; clientName = det?.client?.name ?? '' } catch {}

  const result =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })

  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error?.message ?? 'Failed' }, { status: 400 })
  }
  if (decision === 'approve') await logEvent(supabase, 'app_authorized', clientName)
  return NextResponse.redirect(result.data.redirect_url, 303)
}
