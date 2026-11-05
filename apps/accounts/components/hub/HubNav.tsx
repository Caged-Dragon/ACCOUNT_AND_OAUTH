'use client'
import { usePathname } from 'next/navigation'

const ITEMS: [string, string, string][] = [
  ['/', 'Home', '⌂'], ['/personal-info', 'Personal info', '☺'], ['/security', 'Security', '⚿'],
  ['/apps', 'Connected apps', '▦'], ['/data', 'Data & privacy', '◐'],
]

export function HubNav() {
  const path = usePathname()
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'))
  return (
    <nav className="hubnav" aria-label="Account sections">
      {ITEMS.map(([href, label, icon]) => (
        <a key={href} href={href} aria-current={active(href) ? 'page' : undefined}>
          <span aria-hidden="true">{icon}</span>{label}
        </a>
      ))}
    </nav>
  )
}
