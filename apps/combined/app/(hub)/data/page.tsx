import { requireSession } from '@/lib/auth'
import { getHubUser } from '@/lib/hub'
import { ConfirmButton } from '@/components/SecurityActions'
import { deleteAccount } from './actions'

export default async function Data({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams
  await requireSession('/data')
  const user = (await getHubUser())!

  return (
    <>
      <h1 className="hubh1">Data & privacy</h1>
      <p className="hubsub">See what is stored with your account, take a copy, or delete it.</p>

      <section className="card">
        <h2>What we store</h2>
        <ul className="checklist">
          <li className="ok">Your profile: name, username, phone, birthday, language, time zone, photo</li>
          <li className="ok">Security activity: sign-ins and changes for the last 180 days</li>
          <li className="ok">Which apps you allowed to sign you in</li>
        </ul>
        <p className="fine">Apps you connect can sign you in but cannot read your account data.</p>
      </section>

      <section className="card">
        <h2>Download your data</h2>
        <p className="fine">A JSON file with your profile and your security activity. Asks for your second step first.</p>
        <a className="btn-outline" href="/api/export" download>Download my data</a>
      </section>

      <section className="card danger">
        <h2>Delete your account</h2>
        <p>This permanently deletes your account, mailbox and files. Your address <strong>{user.email}</strong> can never be registered again. This cannot be undone.</p>
        {sp.error === 'confirm' && <p className="error" role="alert">That did not match your address. Nothing was deleted.</p>}
        {sp.error === 'delete' && <p className="error" role="alert">Something went wrong. Nothing was deleted.</p>}
        <form action={deleteAccount} className="form">
          <label>Type your address to confirm <input name="confirm" autoComplete="off" required placeholder={user.email} /></label>
          <div><ConfirmButton danger message="Delete your account permanently?">Delete my account</ConfirmButton></div>
        </form>
      </section>
    </>
  )
}
