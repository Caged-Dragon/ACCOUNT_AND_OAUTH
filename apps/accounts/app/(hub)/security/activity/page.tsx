import { requireSession } from '@/lib/auth'
import { describeUA, getHubUser } from '@/lib/hub'
import { EVENT_LABEL } from '@/lib/event-labels'

type Ev = { id: number; event: string; detail: string | null; ip_address: string | null; user_agent: string | null; created_at: string }

export default async function Activity() {
  const { supabase } = await requireSession('/security/activity')
  const user = (await getHubUser())!
  const { data } = await supabase.from('account_security_events').select('id, event, detail, ip_address, user_agent, created_at').order('created_at', { ascending: false }).limit(50)
  const events: Ev[] = data ?? []
  const tz = user.profile.time_zone || undefined
  const fmt = (d: string) => { try { return new Date(d).toLocaleString('en', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }) } catch { return new Date(d).toLocaleString('en') } }

  // Flag sign-ins from a network we have not seen before (oldest to newest).
  const seen = new Set<string>(); const fresh = new Set<number>()
  ;[...events].reverse().forEach((e, i) => {
    if (e.event.startsWith('sign_in') && e.ip_address) { if (i > 0 && !seen.has(e.ip_address)) fresh.add(e.id); seen.add(e.ip_address) }
  })

  return (
    <>
      <h1 className="hubh1">Recent security activity</h1>
      <p className="hubsub">Sign-ins and security changes on your account{tz ? ` (times in ${tz})` : ''}. Don’t recognise something? Change your password and sign out other devices.</p>
      <section className="card">
        {events.length === 0 ? <p className="fine">Nothing recorded yet.</p> : (
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{EVENT_LABEL[e.event] ?? e.event}{e.detail ? `: ${e.detail}` : ''}</strong>{' '}
                  {fresh.has(e.id) && <span className="pill warn">New network</span>}
                  <div className="fine">{describeUA(e.user_agent)}{e.ip_address ? ` · ${e.ip_address}` : ''}</div>
                </div>
                <span className="when">{fmt(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
