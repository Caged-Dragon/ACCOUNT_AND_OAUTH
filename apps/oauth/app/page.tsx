import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACCOUNTS_URL } from '@/lib/config'

export default async function Home() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  redirect(data?.claims && ACCOUNTS_URL ? ACCOUNTS_URL : '/login')
}
