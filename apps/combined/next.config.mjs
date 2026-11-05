const prod = process.env.NODE_ENV === 'production'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
// No form-action directive on purpose: the consent decision redirects to the client app's domain.
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com", "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${supabaseUrl}`, `connect-src 'self' ${supabaseUrl} https://challenges.cloudflare.com`, "frame-src https://challenges.cloudflare.com", "frame-ancestors 'none'",
  "base-uri 'self'", "object-src 'none'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: prod ? csp : "frame-ancestors 'none'" },
        ...(prod ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
      ],
    }]
  },
}
export default nextConfig
