# Caged Dragon authentication email delivery

Email confirmation is sent by **Supabase Auth**, not by the Caged Dragon database or Vercel function. No database migration can make Supabase deliver email without an enabled sender.

## Why confirmation messages may not arrive

Supabase's built-in email sender is development-only. It only sends to addresses that belong to the Supabase project's organization/team, and its current documented limit is 2 messages per hour. Requests for an already-confirmed account do not generate a new confirmation email. Use a genuinely new test address when checking a first-time signup.

## Configure a sender

1. Create an account with an email/transactional provider that offers SMTP credentials.
2. Verify a sender address or domain that you control, following that provider's requirements. For public production delivery, use a domain you control and configure SPF, DKIM and DMARC.
3. Open the Supabase Dashboard for **CAGED_DRAGON** → **Authentication** → **Emails** → **SMTP Settings**.
4. Enable custom SMTP and enter the provider's SMTP host, port, username, password, verified From address, and sender name (for example, `Caged Dragon`). Keep credentials in Supabase settings only; never put them in browser JavaScript, a public repository, or a support chat.
5. Keep email confirmations enabled. In **Authentication → URL Configuration**, set the Site URL to `https://caged-dragon-auth.vercel.app` and allow the sign-in site's confirmation redirect URL.
6. Keep the default confirmation template unless you have a tested replacement. Its link must use Supabase's confirmation URL variable (`{{ .ConfirmationURL }}`).
7. Test signup with an unused address that you can access. Check inbox and spam, then inspect Supabase Auth logs if the send fails.

A company-owned domain is not required for local/development experiments if your chosen provider permits an authenticated sender mailbox you control. Provider rules vary. For a public identity service, an authenticated domain is strongly preferred for deliverability and sender trust.

## Current app switches

- Email/password sign-in and signup are implemented.
- `EMAIL_ENABLED=0` only keeps password-reset-by-email and change-email controls disabled; it does not disable email/password sign-in.
- Do not set `UNVERIFIED_SIGNUP=1` in production.
- Phone OTP is a separate flow and remains disabled until an SMS provider is configured.
