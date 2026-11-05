import { PARTNER_URL } from '@/lib/config'

// Where may a sign-in send the user afterwards? A path on this site, or a URL on the partner site. Nothing else.
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback
  if (next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) return next
  try {
    const u = new URL(next)
    const p = PARTNER_URL ? new URL(PARTNER_URL) : null
    if (p && u.origin === p.origin && (u.protocol === 'https:' || u.hostname === 'localhost')) return u.toString()
  } catch { /* not a URL */ }
  return fallback
}
