import { Shell } from '@/components/Shell'
import { NewPasswordForm } from '@/components/NewPasswordForm'
import { requireRecent, requireSession } from '@/lib/auth'

export default async function UpdatePassword() {
  const { supabase, claims } = await requireSession('/update-password')
  await requireRecent(supabase, claims, '/update-password')
  return <Shell title="Choose a new password"><NewPasswordForm /></Shell>
}
