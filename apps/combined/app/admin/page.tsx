import { Shell } from '@/components/Shell'
import { CreateClientForm } from '@/components/CreateClientForm'
import { adminClient, adminConfigured, requireAdmin } from '@/lib/admin'
import { oidcDiagnostics } from '@/lib/diagnostics'
import { deleteOAuthClient } from './actions'

const Check = ({ ok, label }: { ok: boolean; label: string }) => (
  <li className={ok ? 'ok' : 'bad'}>{ok ? '✓' : '✗'} {label}</li>
)

export default async function Admin() {
  await requireAdmin()
  const diag = await oidcDiagnostics()

  let clients: { client_id: string; client_name: string; client_type?: string; redirect_uris: string[]; created_at: string }[] = []
  let listError = ''
  if (adminConfigured()) {
    const { data, error } = await adminClient().auth.admin.oauth.listClients()
    if (error) listError = error.message
    else clients = data?.clients ?? []
  }

  return (
    <Shell title="Registered apps" wide>
      <h2>Setup check</h2>
      <ul className="checks">
        <Check ok={diag.oauthServerEnabled} label="OAuth server is enabled (discovery document reachable)" />
        <Check ok={diag.issuerMatches} label={`Issuer is ${diag.issuer}`} />
        <Check ok={diag.asymmetricKey} label="Project signs with an asymmetric key (needed for ID tokens)" />
      </ul>

      {!adminConfigured() ? (
        <p className="info">Set <code>SUPABASE_SECRET_KEY</code> on the server to register apps here. Until then, use Authentication &gt; OAuth Apps in the Supabase dashboard.</p>
      ) : (
        <>
          <h2>Register an app</h2>
          <CreateClientForm />
          <h2>Apps</h2>
          {listError && <p className="error" role="alert">{listError}</p>}
          {clients.length === 0 && !listError && <p className="info">No apps registered yet.</p>}
          <ul className="apps">
            {clients.map((c) => (
              <li key={c.client_id}>
                <div>
                  <strong>{c.client_name}</strong> <span className="fine">{c.client_type}</span>
                  <div className="fine">ID {c.client_id}</div>
                  <div className="fine">{c.redirect_uris.join(' · ')}</div>
                </div>
                <form action={deleteOAuthClient}>
                  <input type="hidden" name="client_id" value={c.client_id} />
                  <button className="secondary">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
      <p><a href="/">Back to your account</a></p>
    </Shell>
  )
}
