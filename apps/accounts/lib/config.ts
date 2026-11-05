export const ALLOWED_DOMAIN = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'draco-mail.com').toLowerCase()

export function isAllowedEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith('@' + ALLOWED_DOMAIN)
}

// Set to ".draco-mail.com" in production so the portal and the mail site share one session.
// Leave empty for localhost.
export const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined

// WebAuthn relying-party id. Must match the Passkeys setting in Supabase (e.g. "draco-mail.com"); never change it once users enrol.
export const RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || undefined
export const PASSKEYS_ENABLED = process.env.NEXT_PUBLIC_PASSKEYS === 'true'
// When true, every account must have a second step before it can use the portal or approve apps.
export const REQUIRE_MFA = process.env.NEXT_PUBLIC_REQUIRE_MFA === 'true'
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

// This site (the account center) and its partner (the sign-in front door).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
export const OAUTH_URL = (process.env.NEXT_PUBLIC_OAUTH_URL ?? '').replace(/\/$/, '')
export const PARTNER_URL = OAUTH_URL
