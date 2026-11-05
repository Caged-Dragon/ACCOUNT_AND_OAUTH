import { redirect } from 'next/navigation'
export default async function Old({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString()
  redirect(`/security/two-step${qs ? `?${qs}` : ''}`)
}
