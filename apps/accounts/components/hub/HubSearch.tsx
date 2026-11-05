'use client'
import { useState } from 'react'

const DEST: { label: string; href: string; words: string }[] = [
  { label: 'Personal info', href: '/personal-info', words: 'profile name photo avatar birthday language time zone' },
  { label: 'Phone number', href: '/personal-info', words: 'contact phone mobile' },
  { label: 'Password', href: '/security/password', words: 'change password reset' },
  { label: '2-Step Verification', href: '/security/two-step', words: 'two step 2fa mfa authenticator otp code security key' },
  { label: 'Passkeys', href: '/security/passkeys', words: 'passkey passwordless fingerprint face phone' },
  { label: 'Recent security activity', href: '/security/activity', words: 'activity history sign in devices login' },
  { label: 'Sign out of devices', href: '/security', words: 'devices sessions sign out' },
  { label: 'Connected apps', href: '/apps', words: 'third party apps access remove revoke sign in with caged dragon' },
  { label: 'Download your data', href: '/data', words: 'export data download backup' },
  { label: 'Delete your account', href: '/data', words: 'delete close remove account' },
]

export function HubSearch() {
  const [q, setQ] = useState('')
  const matches = q.trim() ? DEST.filter((d) => (d.label + ' ' + d.words).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : []
  return (
    <div className="hubsearch" role="search">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your account" aria-label="Search your account" />
      {q.trim() && (
        <ul className="results">
          {matches.length ? matches.map((m) => <li key={m.label}><a href={m.href}>{m.label}</a></li>) : <li className="none">No results</li>}
        </ul>
      )}
    </div>
  )
}
