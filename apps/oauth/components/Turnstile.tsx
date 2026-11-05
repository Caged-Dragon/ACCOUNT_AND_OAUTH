'use client'
import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '@/lib/config'

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void }
  }
}

// Cloudflare Turnstile. Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
export function Turnstile({ onToken, resetKey }: { onToken: (t: string) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const widget = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    const mount = () => {
      if (ref.current && window.turnstile && !widget.current) {
        widget.current = window.turnstile.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: onToken,
          'expired-callback': () => onToken(''),
        })
      }
    }
    if (window.turnstile) mount()
    else {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = mount
      document.head.appendChild(s)
    }
  }, [onToken])

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={ref} />
}
