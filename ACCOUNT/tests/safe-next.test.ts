import { describe, it, expect, vi } from 'vitest'

async function load(partner: string) {
  vi.resetModules()
  process.env.NEXT_PUBLIC_OAUTH_URL = partner
  return (await import('@/lib/safe-next')).safeNext
}

describe('safeNext (where a sign-in may send the user afterwards)', () => {
  it('allows paths on this site', async () => {
    const safeNext = await load('https://partner.example.com')
    expect(safeNext('/login')).toBe('/login')
    expect(safeNext('/oauth/consent?authorization_id=abc')).toBe('/oauth/consent?authorization_id=abc')
  })

  it('allows the partner site and nothing else', async () => {
    const safeNext = await load('https://partner.example.com')
    expect(safeNext('https://partner.example.com/security')).toBe('https://partner.example.com/security')
    for (const bad of [
      'https://evil.com/x', '//evil.com', '/\\evil.com', 'https://partner.example.com.evil.com/',
      'http://partner.example.com/', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://partner.example.com/',
    ]) expect(safeNext(bad, '/fallback'), bad).toBe('/fallback')
  })

  it('uses the fallback for empty input', async () => {
    const safeNext = await load('https://partner.example.com')
    expect(safeNext('', '/f')).toBe('/f')
    expect(safeNext(null, '/f')).toBe('/f')
    expect(safeNext(undefined, '/f')).toBe('/f')
  })

  it('allows plain-http localhost for local development', async () => {
    const safeNext = await load('http://localhost:3002')
    expect(safeNext('http://localhost:3002/x')).toBe('http://localhost:3002/x')
    expect(safeNext('http://localhost:9999/x', '/f')).toBe('/f')
  })

  it('refuses every absolute URL when no partner is configured', async () => {
    const safeNext = await load('')
    expect(safeNext('https://partner.example.com/x', '/f')).toBe('/f')
  })
})
