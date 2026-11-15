# Postman Email Services — Plan to end of 2027

Drafted 2026-11-14. Based on the Post Man as built today (components/postman/*, routes/postman.ts,
routes/campaigns.ts, services/notify/*). Status: PROPOSAL — decisions in §7 need Kenne.

## 1. Where Postman is today

| Room / piece | What it does | Backing |
|---|---|---|
| Inbox | Reads/sends the user's own Gmail, per-user per-account, tokens never reach client | routes/postman.ts, Gmail REST, `users/{uid}/postman_accounts` |
| Letters | Plajah-to-Plajah correspondence as Tela documents; slow post, sealed letters; anchored to DM room so chat protections apply | services/postman/lettersService.ts |
| Calendar | Google Calendar events + private ICS feed | routes/postman.ts, calendarService |
| Campaigns | "Mailchimp built in": audience from platform opt-ins, compliance enforced server-side (postal address, suppression, one-click unsubscribe), bounce/complaint auto-suppress | routes/campaigns.ts, Resend batch + Svix webhook |
| Sources | Client-side-encrypted vault (Source Mode) | SourcesRoom |
| Notification email | Digests, unread nudges, test send | services/notify/emailNotifyServer.ts, Resend |

Gaps against "email services on the platform":
1. Google only. `microsoftConfigured` exists in status but there is no Outlook/Graph, IMAP, or Yahoo path.
2. No Plajah-hosted address. Nobody can *have* `name@plajah…` or `info@theirchurch.org` on Plajah.
3. No inbound. Nothing receives mail; replies to campaigns and notifications go nowhere in-platform.
4. Inbox is thin: no drafts, labels, threads view, attachments, search beyond `q=`, snooze, rules, multi-account unified view.
5. Org use is missing: shared/department inboxes, assignment, templates, tied to the org permission model.
6. Three separate sending paths (Gmail send, Resend notify, Resend campaigns) with no shared reputation/suppression view.

## 2. Principles

- **Don't run our own MTA.** Rent SMTP in/out; own the product, storage, and policy. Revisit only if volume/cost justifies it.
- **Firebase first** for metadata (Firestore) and attachments (Firebase Storage); B2 only where designated.
- **Cloud-saved and synced everywhere** (drafts, labels, rules follow the user across desktop/phone).
- **Truth rules**: UI never claims "delivered/encrypted/private" beyond what is true. Letters are at-rest encrypted, not E2E; say so. Hosted mail is readable by the server unless a vault feature says otherwise.
- **Org permission model applies**: department-scoped access; org admins don't automatically read member mail.
- **Compliance stays server-side** (the Campaigns pattern is the template for everything outbound).
- **One suppression + reputation layer** for every outbound path.

## 3. Target architecture

```
Outbound: Postman UI / Campaigns / Notify / Elevate  ──► sendCore (policy, suppression, rate, DKIM domain pick)
                                                         ──► provider adapter (Resend now; SES/Postmark behind same interface)
Inbound:  provider inbound webhook (MX → provider) ──► verify ──► spam/phish score ──► route
                                                         ──► mailbox store (Firestore index + Storage raw MIME/attachments)
External: Gmail API (have) | Microsoft Graph (new) | IMAP/SMTP generic (later) ──► same MailMessage model
Client:   unified MailMessage/Thread model; rooms = Inbox, Shared, Campaigns, Letters, Calendar, Sources
```

Key pieces:
- `services/mail/sendCore.ts` — single outbound gate (suppression, daily caps, List-Unsubscribe where bulk, From-domain selection, audit row). Existing three paths migrate onto it.
- `services/mail/provider/*` — adapter interface; Resend first, second provider kept warm for failover.
- `services/mail/inbound.ts` — webhook, signature verify, MIME parse, threading (In-Reply-To/References), attachment scan, store.
- `services/mail/domains.ts` — custom-domain wizard: DNS records (MX, SPF, DKIM, DMARC), verification polling, health.
- Mailbox model: `mail_mailboxes/{id}` (owner user/org/dept, address, aliases), `mail_threads`, `mail_messages` (metadata + Storage pointer), `mail_labels`, `mail_rules`.
- Provider-account model unified: Postman account `provider` widens from `'google'` to `'google' | 'microsoft' | 'imap' | 'plajah'`.

## 4. Phased roadmap

### Phase 0 — Foundations (Nov 2026 – Jan 2027)
- Extract `sendCore`; put notify + campaigns + Postman send behind it; shared suppression list.
- Sending-domain authentication (SPF/DKIM/DMARC) and DMARC reporting; deliverability dashboard (bounce/complaint rate) feeding Medic.
- Inbox quality: drafts (cloud-synced), threads, labels/archive/trash, attachments in/out, server search, unified multi-account view, keyboard shortcuts, phone layout.
- **Gmail restricted-scope verification** (CASA assessment, already flagged in `.env.example`) — start now; it is long-lead and gates public Gmail connect.
- Exit: one send path, Inbox feels like a real mail client for Gmail users.

### Phase 1 — More providers (Feb – Apr 2027)
- Microsoft Graph OAuth (Outlook/365 mail + calendar). Same account/message model.
- Generic IMAP/SMTP connect (app passwords; encrypted creds) for Yahoo/iCloud/others — read/send only.
- Calendar: inbound iMIP invites render as event cards; RSVP.
- Exit: any common mailbox can be connected.

### Phase 2 — Plajah-hosted mail (Apr – Jul 2027)
- Inbound pipeline live on one domain (Plajah-owned) for **Plajah addresses** (`handle@…`): every account can opt in; aliases; catch-all off by default.
- Reply-to for campaigns and notifications lands in the sender's Postman (closes the "replies go nowhere" gap).
- Spam/phish filtering (provider score + our rules + Sentinel signals); quarantine view; report-phishing.
- Storage quotas per tier; retention settings; export (mbox/EML) from day one so it's never lock-in.
- Exit: someone can use Plajah as their primary address.

### Phase 3 — Orgs, churches, businesses (Jul – Oct 2027)
- Custom-domain mailboxes via the DNS wizard (`info@church.org`), aliases and groups.
- **Shared inboxes** per department (Elevate): assign, internal notes, status, canned replies/templates, SLA hints; access follows the org permission model.
- Elevate wiring: invites, giving receipts, payroll notices, event confirmations send from the org's domain; bounces feed `markInviteBounced`.
- Campaigns upgrades: A/B subject, send-time, templates from Tela, reply handling, engagement stats; automations (welcome series) using the same audience model.
- Aria in Inbox: summarize thread, draft reply (in the user's voice, user approves), triage — on-device/local-first where possible per desktop-first AI rule.
- Exit: an org can run its whole mail on Plajah.

### Phase 4 — Hardening and GA (Oct – Dec 2027)
- Optional vault-grade mail: client-side encrypted folders via Sources/Source Mode (explicitly scoped; Plajah-to-Plajah letters E2E investigated, not promised).
- Abuse controls: new-account send ramp, per-account reputation, auto-suspend on complaint spikes, appeal flow (Fair Process).
- Legal: retention/legal hold for orgs, GDPR delete/export, admin audit log, data-processing terms; account-wall rules (org mail never crosses accounts).
- Importers (Gmail/Outlook → Plajah, Mailchimp lists → opt-in audience re-consent), load test, runbooks, pricing/tier finalization, GA.
- Out of scope (decided): IMAP/SMTP server for Plajah mailboxes. Plajah mail is read and sent in Postman on web, desktop and phone apps only.

## 5. Tiers (proposal, not committed)
- Free: connect external accounts, Letters, Calendar, Plajah address with small quota, notifications.
- Plajah+: larger quota, custom aliases, higher Campaign sends, Aria drafting.
- Orgs/Business: custom domain, shared inboxes, department routing, retention + audit, higher send caps. Direct-sales/held-money rules are unaffected.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Hosted addresses become a spam source and burn domain reputation | send ramp, per-account caps, subdomain separation (transactional vs bulk vs user mail), auto-suspend, DMARC enforcement |
| Gmail restricted-scope review delays | start in Phase 0; Microsoft + IMAP paths don't depend on it |
| Provider outage/price change | adapter interface + warm second provider |
| Storage cost growth | quotas, attachment dedupe, tiered retention, lifecycle rules |
| Overpromising privacy | truth-rule copy review; DisclosurePanel pattern extended to mail |
| Support burden of custom-domain DNS | wizard with live checks and plain-language fixes; Aria help |
| Minors / education accounts | education DM policy applies; hosted addresses off for under-13 and gated for school accounts |

## 7. Decisions needed from Kenne
1. **Hosted mailbox scope by end of 2027: DECIDED 2026-11-14 (Kenne) — web/app only.** No IMAP/SMTP server for Plajah mailboxes in 2027; desktop mail apps are out of scope (external accounts can still be connected *into* Postman). Revisit for 2028 only if demand is clear.
2. **Plajah-owned address domain** to use for user addresses (and whether a separate domain isolates reputation — recommended).
3. **Outbound/inbound provider** stays Resend + its inbound, or move inbound to SES/Postmark; recommendation: keep Resend until inbound limits are known, abstract now.
4. **Who gets hosted addresses first:** Detroit churches/nonprofits (paying wedge per GTM focus) before general users — recommended, which would pull Phase 3 org features ahead of Phase 2 general availability.
5. **Budget envelope** for storage + inbound + second provider (needs real quotes; none estimated here).

## 8. Next concrete steps
1. Extract `sendCore` and migrate the three sending paths (Phase 0, unlocks everything else).
2. File the Gmail CASA assessment.
3. Spike inbound: one test domain → webhook → stored message → shown in Inbox.
4. Spec the `MailMessage`/`Thread`/`Mailbox` Firestore model + rules (check Firestore rules size headroom first; may need `plajah-ops` or a rules move).
