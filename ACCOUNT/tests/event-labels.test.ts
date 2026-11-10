import { describe, it, expect } from 'vitest'
import { EVENT_LABEL } from '@/lib/event-labels'

// Must match the events the database function account_log_security_event accepts.
const DB_EVENTS = ['sign_in_password','sign_in_passkey','mfa_verified','factor_added','factor_removed','passkey_added','passkey_removed',
  'password_changed','signed_out_others','signed_out_all','app_authorized','app_revoked','profile_updated','data_exported']

describe('activity labels', () => {
  it('has a readable label for every event the database accepts', () => {
    for (const e of DB_EVENTS) expect(EVENT_LABEL[e], e).toBeTruthy()
  })
})
