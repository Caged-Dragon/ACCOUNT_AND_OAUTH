import { Avatar } from './Avatar'
import { HubNav } from './HubNav'
import { HubSearch } from './HubSearch'
import type { HubUser } from '@/lib/hub'

export function HubFrame({ user, children }: { user: HubUser; children: React.ReactNode }) {
  return (
    <div className="hub">
      <header className="hubbar">
        <a className="hubbrand" href="/"><span className="logo">Caged Dragon</span><span className="sub">Account</span></a>
        <HubSearch />
        <details className="usermenu">
          <summary aria-label="Account menu"><Avatar url={user.avatarUrl} name={user.name} size={36} /></summary>
          <div className="pop">
            <Avatar url={user.avatarUrl} name={user.name} size={64} />
            <strong>{user.name}</strong>
            <span className="fine">{user.email}</span>
            <a className="btn-outline" href="/personal-info">Manage your account</a>
            <form action="/auth/signout" method="POST"><button className="link">Sign out</button></form>
          </div>
        </details>
      </header>
      <div className="hubbody">
        <HubNav />
        <main id="main" className="hubmain">{children}</main>
      </div>
    </div>
  )
}
