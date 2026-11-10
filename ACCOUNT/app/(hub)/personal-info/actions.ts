'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth'
import { logEvent } from '@/lib/events'

const BACK = '/personal-info'
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max) || null

async function save(patch: Record<string, string | null>, saved: string) {
  const { supabase, claims } = await requireSession(BACK)
  const { error } = await supabase.from('account_profiles').update(patch).eq('id', claims.sub)
  if (error) redirect(`${BACK}?error=${encodeURIComponent(error.message.includes('check') ? 'invalid' : 'save')}`)
  await logEvent(supabase, 'profile_updated')
  revalidatePath('/', 'layout')
  redirect(`${BACK}?saved=${saved}`)
}

export async function saveName(fd: FormData) {
  await save({ given_name: text(fd.get('given_name'), 80), family_name: text(fd.get('family_name'), 80), display_name: text(fd.get('display_name'), 80) }, 'name')
}

export async function savePhone(fd: FormData) {
  const phone = text(fd.get('phone'), 20)
  if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) redirect(`${BACK}?error=phone`)
  await save({ phone }, 'phone')
}

export async function saveOther(fd: FormData) {
  const birthday = text(fd.get('birthday'), 10)
  if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || birthday < '1900-01-01' || birthday > new Date().toISOString().slice(0, 10))) redirect(`${BACK}?error=birthday`)
  const locale = text(fd.get('locale'), 10)
  const tz = text(fd.get('time_zone'), 64)
  if (tz && !(Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone').includes(tz)) redirect(`${BACK}?error=invalid`)
  await save({ birthday, locale, time_zone: tz }, 'other')
}
