import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !secret) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before running db:check.');
  process.exit(1);
}

const db = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const tables = [
  'login_client_apps', 'login_accounts', 'login_account_roles', 'login_methods',
  'login_app_grants', 'login_events', 'login_codes', 'login_developer_apps',
  'login_passkeys', 'login_rate_limits',
];
let failed = false;

for (const table of tables) {
  const { error } = await db.from(table).select('*').limit(0);
  if (error) {
    failed = true;
    console.error(`FAIL public.${table}: ${error.message}`);
  } else {
    console.log(`OK   public.${table}`);
  }
}

// Read-only RPC: confirms the server role can execute the registered-product resolver.
const { data, error } = await db.rpc('login_resolve_client', {
  p_redirect: 'https://database-check.invalid/health',
});
if (error || !Array.isArray(data)) {
  failed = true;
  console.error(`FAIL public.login_resolve_client: ${error?.message || 'unexpected result'}`);
} else {
  console.log('OK   public.login_resolve_client');
}

if (failed) {
  console.error('\nDatabase setup is incomplete. Run docs/database.sql in the CAGED_DRAGON Supabase project, then run npm run db:check again.');
  process.exit(1);
}
console.log('\nCaged Dragon login database is ready.');
