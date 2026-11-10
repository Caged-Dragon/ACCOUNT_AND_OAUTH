import { NewPasswordForm } from '@/components/NewPasswordForm'
import { requireRecent, requireSession } from '@/lib/auth'

export const metadata = { title: 'Password' }

export default async function Password() {
  const { supabase, claims } = await requireSession('/security/password')
  await requireRecent(supabase, claims, '/security/password')
  return (
    <>
      <h1 className="hubh1">Password</h1>
      <p className="hubsub">Choose a strong password you do not use anywhere else (at least 10 characters).</p>
      <section className="card"><NewPasswordForm /></section>
    </>
  )
}
