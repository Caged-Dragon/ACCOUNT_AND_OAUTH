'use server'
import { revalidatePath } from 'next/cache'
import { adminClient, requireAdmin } from '@/lib/admin'

export type CreateState = { error?: string; created?: { name: string; client_id: string; client_secret?: string } }

function validRedirect(u: string): boolean {
  try {
    const url = new URL(u)
    if (u.length > 2048 || url.hash) return false
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  } catch { return false }
}

export async function createOAuthClient(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await requireAdmin()
  const name = String(formData.get('name') ?? '').trim()
  const website = String(formData.get('website') ?? '').trim()
  const uris = String(formData.get('redirect_uris') ?? '').split(/\s+/).filter(Boolean)
  const isPublic = formData.get('kind') === 'public'

  if (name.length < 2 || name.length > 100) return { error: 'Name must be 2–100 characters.' }
  if (website && !validRedirect(website)) return { error: 'Website must be a valid https address.' }
  if (uris.length === 0 || uris.length > 10) return { error: 'Add 1–10 redirect URIs, one per line.' }
  if (!uris.every(validRedirect)) return { error: 'Redirect URIs must be https (http only for localhost) with no #fragment.' }

  const { data, error } = await adminClient().auth.admin.oauth.createClient({
    client_name: name,
    client_uri: website || undefined,
    redirect_uris: uris,
    scope: 'openid email profile',
    token_endpoint_auth_method: isPublic ? 'none' : 'client_secret_basic',
  })
  if (error || !data) return { error: error?.message ?? 'Could not create the app.' }
  revalidatePath('/admin')
  return { created: { name: data.client_name, client_id: data.client_id, client_secret: data.client_secret } }
}

export async function deleteOAuthClient(formData: FormData) {
  await requireAdmin()
  await adminClient().auth.admin.oauth.deleteClient(String(formData.get('client_id')))
  revalidatePath('/admin')
}
