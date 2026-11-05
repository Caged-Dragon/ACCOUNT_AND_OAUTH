import { Shell } from '@/components/Shell'
import { AuthForm } from '@/components/AuthForm'
import { safeNext } from '@/lib/safe-next'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams
  const notice = error === 'link' ? 'That link is invalid or has expired. Please sign in or request a new one.' : error === 'deleted' ? 'Your account has been deleted.' : undefined
  return (
    <Shell title="Sign in to Caged Dragon">
      <AuthForm next={safeNext(next, '/')} notice={notice} />
    </Shell>
  )
}
