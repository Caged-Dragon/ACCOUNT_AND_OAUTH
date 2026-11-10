import { describe, it, expect, vi } from 'vitest'

async function load(domain: string) {
  vi.resetModules()
  process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN = domain
  return (await import('@/lib/config')).isAllowedEmail
}

describe('isAllowedEmail with no domain limit', () => {
  it('accepts normal addresses, ignoring case and spaces', async () => {
    const ok = await load('')
    for (const e of ['a@b.co', ' A@B.CO ', 'first.last+tag@mail.example.org']) expect(ok(e), e).toBe(true)
  })
  it('rejects malformed input', async () => {
    const ok = await load('')
    for (const e of ['', 'plain', 'a@b', 'a b@c.co', 'a@b.co,x@y.co', 'a@@b.co', '<a@b.co>', undefined, null, 42]) expect(ok(e), String(e)).toBe(false)
  })
})

describe('isAllowedEmail limited to one domain', () => {
  it('accepts only that exact domain', async () => {
    const ok = await load('Example.com')
    expect(ok('a@example.com')).toBe(true)
    for (const e of ['a@sub.example.com', 'a@evilexample.com', 'a@example.com.evil.io', 'a@gmail.com']) expect(ok(e), e).toBe(false)
  })
  it('tolerates a leading @ in the setting', async () => {
    const ok = await load('@example.com')
    expect(ok('a@example.com')).toBe(true)
  })
})
