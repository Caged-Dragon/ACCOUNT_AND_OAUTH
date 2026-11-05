// Checks the three things that most often break "Continue with Caged Dragon".
export async function oidcDiagnostics() {
  const issuer = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
  const result = { issuer, oauthServerEnabled: false, issuerMatches: false, asymmetricKey: false }
  try {
    const d = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: 'no-store' })
    if (d.ok) {
      const j = await d.json()
      result.oauthServerEnabled = true
      result.issuerMatches = j.issuer === issuer
    }
    const k = await fetch(`${issuer}/.well-known/jwks.json`, { cache: 'no-store' })
    if (k.ok) {
      const j = await k.json()
      result.asymmetricKey = Array.isArray(j.keys) && j.keys.some((x: { kty?: string }) => x.kty === 'RSA' || x.kty === 'EC' || x.kty === 'OKP')
    }
  } catch {
    // leave the booleans false
  }
  return result
}
