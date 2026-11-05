'use client'
import { useActionState } from 'react'
import { createOAuthClient, type CreateState } from '@/app/admin/actions'

export function CreateClientForm() {
  const [state, action, pending] = useActionState<CreateState, FormData>(createOAuthClient, {})
  return (
    <>
      <form action={action} className="form">
        <label>App name <input name="name" required maxLength={100} placeholder="Draco Mail" /></label>
        <label>Website (optional) <input name="website" type="url" placeholder="https://app.example.com" /></label>
        <label>Redirect URIs (one per line)
          <textarea name="redirect_uris" required rows={3} placeholder="https://app.example.com/api/auth/callback/caged-dragon" />
        </label>
        <label>Type
          <select name="kind" defaultValue="confidential">
            <option value="confidential">Confidential (server-side app, gets a secret)</option>
            <option value="public">Public (single-page or mobile app, PKCE only)</option>
          </select>
        </label>
        <button className="primary" disabled={pending}>Register app</button>
        {state.error && <p role="alert" className="error">{state.error}</p>}
      </form>
      {state.created && (
        <div className="secret" role="status">
          <strong>{state.created.name} registered.</strong>
          <div>Client ID: <code>{state.created.client_id}</code></div>
          {state.created.client_secret
            ? <div>Client secret: <code>{state.created.client_secret}</code><br /><span className="fine">Copy it now. It is shown only once.</span></div>
            : <div className="fine">Public client: no secret.</div>}
        </div>
      )}
    </>
  )
}
