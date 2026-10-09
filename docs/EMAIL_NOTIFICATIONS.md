# Email notifications (2026-10-08)

Email is the third notification channel beside the in-app inbox (always on) and push. Its job is
to catch what you'd otherwise **miss**, never to spam.

| Kind | When an email goes out | Default |
|---|---|---|
| **User → user: messages** | Only if the message is still **unread 15 min** later; max one email per conversation per hour; several conversations are combined into one email | On |
| **User → user: likes, comments, follows, hellos, mentions** | Bundled into one **daily digest** (or weekly), e.g. “Ana and 4 others liked your post” | On |
| **New posts from people you follow** | In the digest | **Off** (opt-in) |
| **Platform notifications** (admin → one user / everyone) | Immediately (overflow past 8/day goes to the digest) | On |
| **Security** (sign-in alerts, appeal decisions — future) | Immediately, can't be turned off | Always |

Guardrails:
- Only **verified** email addresses (Google/Microsoft sign-in counts as verified). The address
  comes from Firebase Auth, never from the public, self-editable `users` doc.
- **No email from strangers**: a user-to-user notification from an account less than 3 days old
  that the recipient doesn't follow stays in-app only. Blocked senders never reach you.
- Email text is built server-side: the sender's real display name, a plain-text snippet with
  links stripped. A caller can't put phishing links or a fake sender into an email.
- Every non-security email has a **one-click unsubscribe** (RFC 8058 `List-Unsubscribe` headers +
  a link in the footer). The link's GET only shows a confirm page, because mail scanners prefetch
  links. The change is applied by a POST.

## Code
- `services/notify/emailNotifyCore.ts` — pure decisions + templates + unsubscribe tokens (tests: `npx tsx --test tests/emailNotify.test.ts`, 13/13).
- `services/notify/emailNotifyServer.ts` — Resend send, Auth email lookup, queue state
  (`email_notify_state/{uid}`, server-only), the cron worker, and server-authored in-app notifications.
- `routes/notifyEmail.ts` — unsubscribe (GET confirm / POST apply), `POST /api/notify/email/test`,
  `POST /api/cron/email-notifications`.
- `server.ts` — `/api/push` now also hands each user→user notification to the email dispatcher.
  `/api/push/admin` takes `channels: {push, inApp, email}` for platform notifications.
- Client: `services/backendService.ts` `sendPushToUser` always calls the server (with the
  notification id, so the worker can skip messages you already read). It no longer reads the
  recipient's device tokens. Settings → Email section in `components/NotificationSettings.tsx`.
  Admin → Platform Notifications channel picker in `components/AdminPushBroadcast.tsx`.

## Turning it on in production (currently OFF: no keys on Cloud Run as of 2026-10-08)

1. **Resend account** (resend.com, free tier = 3,000 emails/mo, 100/day). Add the domain
   `plajah.com`, or better a sending subdomain like `notify.plajah.com` so notification
   reputation is separate from anything else. Add the DNS records Resend shows (SPF + DKIM), plus
   a DMARC record (`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@plajah.com` to start).
   Wait until Resend shows the domain as **Verified**.
2. **Secrets on Cloud Run:**
   ```bash
   printf '%s' 're_xxx' | gcloud secrets create RESEND_API_KEY --data-file=- --project gen-lang-client-0665118474
   openssl rand -hex 32 | tr -d '\n' | gcloud secrets create EMAIL_UNSUB_SECRET --data-file=- --project gen-lang-client-0665118474
   openssl rand -hex 32 | tr -d '\n' | gcloud secrets create CRON_SECRET --data-file=- --project gen-lang-client-0665118474
   gcloud run services update plajah-api --region us-west1 --project gen-lang-client-0665118474 \
     --update-secrets RESEND_API_KEY=RESEND_API_KEY:latest,EMAIL_UNSUB_SECRET=EMAIL_UNSUB_SECRET:latest,CRON_SECRET=CRON_SECRET:latest \
     --update-env-vars RESEND_FROM="Plajah <notifications@notify.plajah.com>",VITE_APP_URL=https://plajah.com
   ```
   (The runtime service account needs `roles/secretmanager.secretAccessor` on the new secrets.)
   Keep `EMAIL_UNSUB_SECRET` stable: rotating it breaks the unsubscribe links in emails already sent.
3. **Scheduler** (every 15 min: unread-message emails + digests):
   ```bash
   gcloud scheduler jobs create http plajah-email-notifications --location us-west1 \
     --schedule "*/15 * * * *" --http-method POST \
     --uri https://plajah.com/api/cron/email-notifications \
     --headers x-cron-key=<CRON_SECRET value> --project gen-lang-client-0665118474
   ```
4. **Deploy the server code** (push to master → CI, or a manual Cloud Run deploy), then open
   Notifications → Settings → **Send test email**.

## Known limits / next
- The free Resend tier caps at 100 emails/day. An "email everyone" platform broadcast past that
  needs the paid tier ($20/mo for 50k).
- The cron scans every `email_notify_state` doc each run (fine to several thousand users). Past
  that, keep a `nextDueAt` field and query on it.
- Not yet emailed: security events (new sign-in, appeal decisions). The `SECURITY` type is
  ready; the enforcement/appeals system should call `dispatchEmailNotification({type:'SECURITY'})`.
- Digests are plain lines. Adding post thumbnails would raise click-through.
