import { requireSession } from '@/lib/auth'
import { getHubUser } from '@/lib/hub'
import { AvatarUpload } from '@/components/hub/AvatarUpload'
import { saveName, saveOther, savePhone } from './actions'

const LANGS: [string, string][] = [['en', 'English'], ['en-GB', 'English (UK)'], ['hi', 'हिन्दी'], ['ta', 'தமிழ்'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'], ['ja', '日本語'], ['ar', 'العربية']]
const MSG: Record<string, string> = { name: 'Name saved.', phone: 'Phone saved.', other: 'Details saved.' }
const ERR: Record<string, string> = { phone: 'Enter a valid phone number, like +91 98765 43210.', birthday: 'Enter a valid birthday in the past.', invalid: 'One of the values was not valid.', save: 'Could not save. Try again.' }

export default async function PersonalInfo({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams
  await requireSession('/personal-info')
  const user = (await getHubUser())!
  const p = user.profile
  const zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')

  return (
    <>
      <h1 className="hubh1">Personal info</h1>
      <p className="hubsub">Info about you and your preferences across Caged Dragon.</p>
      {sp.saved && MSG[sp.saved] && <p className="info" role="status" style={{ textAlign: 'center' }}>{MSG[sp.saved]}</p>}
      {sp.error && ERR[sp.error] && <p className="error" role="alert" style={{ textAlign: 'center' }}>{ERR[sp.error]}</p>}

      <section className="card">
        <h2>Profile</h2>
        <AvatarUpload userId={user.id} url={user.avatarUrl} name={user.name} hasPhoto={Boolean(user.avatarPath)} />
        <form action={saveName} className="form inline">
          <label>First name <input name="given_name" defaultValue={p.given_name ?? ''} maxLength={80} autoComplete="given-name" /></label>
          <label>Last name <input name="family_name" defaultValue={p.family_name ?? ''} maxLength={80} autoComplete="family-name" /></label>
          <label>Display name <input name="display_name" defaultValue={p.display_name ?? ''} maxLength={80} /></label>
          <button className="primary">Save</button>
        </form>
      </section>

      <section className="card">
        <h2>Contact info</h2>
        <ul className="rows">
          <li><div className="hrow"><div><div className="t">Email</div><div className="d">{user.email}</div></div><span className="pill good">Your mailbox</span></div></li>
          <li><div className="hrow"><div><div className="t">Username</div><div className="d">{user.username} (cannot be changed)</div></div></div></li>
        </ul>
        <form action={savePhone} className="form inline">
          <label>Phone <input name="phone" type="tel" defaultValue={p.phone ?? ''} placeholder="+91 98765 43210" autoComplete="tel" /></label>
          <button className="primary">Save</button>
        </form>
      </section>

      <section className="card">
        <h2>Other info</h2>
        <form action={saveOther} className="form inline">
          <label>Birthday <input name="birthday" type="date" min="1900-01-01" defaultValue={p.birthday ?? ''} autoComplete="bday" /></label>
          <label>Language
            <select name="locale" defaultValue={p.locale ?? ''}>
              <option value="">Not set</option>
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Time zone
            <select name="time_zone" defaultValue={p.time_zone ?? ''}>
              <option value="">Not set</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <button className="primary">Save</button>
        </form>
      </section>
    </>
  )
}
