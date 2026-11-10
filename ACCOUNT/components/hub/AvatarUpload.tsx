'use client'
import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from './Avatar'

export function AvatarUpload({ userId, url, name, hasPhoto }: { userId: string; url: string | null; name: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
      const bmp = await createImageBitmap(file)
      const size = 256, side = Math.min(bmp.width, bmp.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size) // square crop, strips metadata
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
      if (!blob) throw new Error('Could not process that image.')
      const supabase = createClient()
      const path = `${userId}/avatar.jpg`
      const up = await supabase.storage.from('account_avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const pr = await supabase.from('account_profiles').update({ avatar_url: path }).eq('id', userId)
      if (pr.error) throw pr.error
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Remove your profile photo?')) return
    setBusy(true)
    const supabase = createClient()
    await supabase.storage.from('account_avatars').remove([`${userId}/avatar.jpg`])
    await supabase.from('account_profiles').update({ avatar_url: null }).eq('id', userId)
    window.location.reload()
  }

  return (
    <div className="photo">
      <Avatar url={url} name={name} size={84} />
      <div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
        <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>{hasPhoto ? 'Change photo' : 'Add a photo'}</button>{' '}
        {hasPhoto && <button className="link" disabled={busy} onClick={remove}>Remove</button>}
        <div className="fine">Square crop, resized on your device. Only you can see it.</div>
        {error && <p role="alert" className="error">{error}</p>}
      </div>
    </div>
  )
}
