import { describe, it, expect } from 'vitest'
import { sameOrigin } from '@/lib/origin'

const req = (h: Record<string, string>) => new Request('https://site.test/api', { method: 'POST', headers: h })

describe('sameOrigin (blocks forged cross-site posts)', () => {
  it('accepts a post from this site', () => {
    expect(sameOrigin(req({ origin: 'https://site.test', 'x-forwarded-host': 'site.test' }))).toBe(true)
  })
  it('rejects another site, a missing Origin, and junk', () => {
    expect(sameOrigin(req({ origin: 'https://evil.test', 'x-forwarded-host': 'site.test' }))).toBe(false)
    expect(sameOrigin(req({ 'x-forwarded-host': 'site.test' }))).toBe(false)
    expect(sameOrigin(req({ origin: 'not a url', 'x-forwarded-host': 'site.test' }))).toBe(false)
    expect(sameOrigin(req({ origin: 'https://site.test.evil.test', 'x-forwarded-host': 'site.test' }))).toBe(false)
  })
})
