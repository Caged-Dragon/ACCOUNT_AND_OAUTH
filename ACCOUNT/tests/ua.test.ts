import { describe, it, expect } from 'vitest'
import { describeUA } from '@/lib/ua'

describe('describeUA', () => {
  it('names common browsers and systems', () => {
    expect(describeUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')).toBe('Chrome on Windows')
    expect(describeUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0')).toBe('Edge on Windows')
    expect(describeUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS')
    expect(describeUA('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toBe('Firefox on Linux')
    expect(describeUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')).toBe('Chrome on Android')
  })
  it('handles missing input', () => {
    expect(describeUA(null)).toBe('Unknown device')
    expect(describeUA('')).toBe('Unknown device')
  })
})
