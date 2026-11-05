import { requireRecent, requireSession } from '@/lib/auth'
import { logEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, claims } = await requireSession('/data')
  await requireRecent(supabase, claims, '/data')

  const [profile, events] = await Promise.all([
    supabase.from('account_profiles')
      .select('username, display_name, given_name, family_name, phone, birthday, locale, time_zone, created_at')
      .eq('id', claims.sub).maybeSingle(),
    supabase.from('account_security_events')
      .select('event, detail, ip_address, user_agent, created_at')
      .order('created_at', { ascending: false }).limit(1000),
  ])
  await logEvent(supabase, 'data_exported')

  const body = JSON.stringify({
    exported_at: new Date().toISOString(), email: claims.email,
    profile: profile.data, security_activity: events.data,
  }, null, 2)
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="caged-dragon-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
