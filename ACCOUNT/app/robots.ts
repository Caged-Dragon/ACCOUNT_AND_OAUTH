import type { MetadataRoute } from 'next'

// Sign-in and account pages must never appear in search results.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } }
}
