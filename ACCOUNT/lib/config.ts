// Empty = anyone with a valid email may sign in. Set a domain (e.g. "example.com") to limit sign-in to that domain.
export const ALLOWED_DOMAIN = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase().replace(/^@/, '')

export function isAllowedEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false
  const e = email.trim().toLowerCase()
  if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(e)) return false
  return !ALLOWED_DOMAIN || e.endsWith('@' + ALLOWED_DOMAIN)
}

// Production: your parent domain with a leading dot (e.g. ".example.com") so the sign-in site and account center share one session.
// Leave empty for localhost.
export const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined

// WebAuthn relying-party id. Must match the Passkeys setting in Supabase (your parent domain, e.g. "example.com"); never change it once users enrol.
export const RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || undefined
export const PASSKEYS_ENABLED = process.env.NEXT_PUBLIC_PASSKEYS === 'true'
// When true, every account must have a second step before it can use the portal or approve apps.
export const REQUIRE_MFA = process.env.NEXT_PUBLIC_REQUIRE_MFA === 'true'
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

// This site (the account center) and its partner (the sign-in front door).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
export const OAUTH_URL = (process.env.NEXT_PUBLIC_OAUTH_URL ?? '').replace(/\/$/, '')
export const PARTNER_URL = OAUTH_URL
