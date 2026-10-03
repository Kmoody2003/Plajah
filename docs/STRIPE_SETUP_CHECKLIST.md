# Plajah Billing — Stripe setup checklist (do LATER, test mode first, then live)

Everything is built and gated: every billing route returns `403 {code:"COMING_SOON", flag}` until you flip the
flag in Firestore `config/billingFlags`. Nothing below has been exercised against live Stripe by the builder —
treat the go-live test script (section 9) as the first real verification.

Architecture in one line: each billing entity (personal profile = USER, organization = ORG, business page =
BUSINESS, film production = PRODUCTION) gets its OWN Stripe Express connected account. Invoices, payment links,
customers and fees live on THAT account (direct, `Stripe-Account` header). Plajah never holds funds.
Plajah's application fee is `BILLING_APP_FEE_PCT` (default 0).

Do everything in **Test mode** first (toggle in the Stripe dashboard), repeat in **Live mode**.

## 1. Platform Connect settings (Dashboard → Settings → Connect)
- [ ] Enable Connect (platform profile completed; accept the platform responsibilities questions).
- [ ] Connect → Settings → **Onboarding**: account type **Express**.
- [ ] Branding (Settings → Connect → Branding): platform name "Plajah", icon (square, >=128px), logo, brand + accent colors. Express onboarding and the Express dashboard show this.
- [ ] Support info: support email/phone/URL shown on connected-account onboarding.
- [ ] Terms of service URL + Privacy policy URL (Connect → Settings → Onboarding / Branding).
- [ ] Onboarding fields: leave Stripe-hosted defaults (Stripe collects identity/bank). Do not request extra fields until needed.
- [ ] **Capabilities** requested on every new account: `card_payments`, `transfers` (code requests both). For ACH bank-debit payment of invoices also enable **US bank account (ACH Direct Debit)** under Settings → Payment methods → Connect and set env `BILLING_ACH=1` (code then also requests `us_bank_account_ach_payments`). Existing accounts need the capability requested again (re-run onboarding link).
- [ ] Payout schedule defaults (Settings → Connect → Payouts): daily/2-day delay (recommended for trust) — connected accounts can change it in their Express dashboard.
- [ ] Statement descriptor: set a sensible platform default; entities can set their own in their Express dashboard.
- [ ] Settings → Connect → **Extensions**: leave Express dashboard enabled (the "Open Stripe dashboard" button uses a login link).

## 2. Invoicing (Dashboard → Settings → Billing → Invoices) — platform defaults apply to connected accounts that have not customised
- [ ] Hosted invoice page: enabled (it is the pay page customers land on; URL stored as `hostedUrl`).
- [ ] Customer emails: enable "Email finalized invoices to customers" is NOT needed — Plajah sends explicitly via the API (`sendInvoice`). Leave Stripe automatic emails per entity preference.
- [ ] Receipts: Settings → Customer emails → "Successful payments" ON (receipt after paying).
- [ ] Payment methods accepted on invoices: card (+ ACH if enabled above). Settings → Payment methods.
- [ ] NOTE invoices are created with `auto_advance:false` and collection_method `send_invoice`. Stripe's own automatic reminder/overdue emails therefore do NOT run; Plajah's reminder sweep (section 6) does the nudging.

## 3. Payment Links
- [ ] Settings → Payment methods: confirm card (+ ACH) on for links. Payment Links need no other dashboard switch; created per entity via API.
- [ ] Optional: Settings → Payment links → default branding/receipt settings.

## 4. Stripe Tax (optional — flag `SALES_TAX`)
- [ ] Enable Stripe Tax on the **connected account** (the entity does this in its own Express dashboard → Tax) — Plajah only passes `automatic_tax` when the account reports Stripe Tax `active`. Otherwise tax stays manual (`tax` / `taxRatePct` on the invoice) and nothing breaks.
- [ ] Platform: Stripe Tax is billed to the connected account.

## 5. Webhooks
The system works WITHOUT webhooks (sync endpoint + sweep). Webhooks make it real-time.
- [ ] **Existing platform endpoint** `/api/stripe/webhook` → keep as is (secret `STRIPE_WEBHOOK_SECRET`, already set).
- [ ] **Create the Connect endpoint** (Developers → Webhooks → Add endpoint → *Listen to events on Connected accounts*):
  - URL: `https://plajah.com/api/stripe/connect-webhook`
  - Events: `invoice.finalized`, `invoice.sent`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.overdue`, `invoice.updated`, `checkout.session.completed` (payment links), `account.updated`, `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`, `balance.available`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
  (`invoice.overdue` may not exist on older API versions; skip it if the dashboard does not list it — overdue is computed locally anyway.)
  - [ ] Copy the signing secret → Cloud Run env **`STRIPE_CONNECT_WEBHOOK_SECRET`**. Until it is set the endpoint returns 500 and stays dormant (billing then relies on sync/sweep).

## 6. Environment variables (Cloud Run)
| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | already set |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | NEW — Connect webhook signing secret (section 5) |
| `BILLING_APP_FEE_PCT` | Plajah application fee on invoices/payment links, percent. Default `0`. Capped at 30. |
| `ELEVATE_CRON_KEY` | shared key for the Cloud Scheduler job (header `x-elevate-cron-key`); same one the budget-alert job uses |
| `BILLING_SWEEP=1` | optional in-process sweep every `BILLING_SWEEP_MIN` (default 60) minutes. Cloud Run scales to zero — prefer Scheduler |
| `BILLING_ACH=1` | also request the ACH capability on new accounts |
| `RESEND_API_KEY`, `RESEND_FROM` | estimates are emailed through Resend when set (invoices use Stripe's own email) |

- [ ] **Cloud Scheduler** job (e.g. every 30–60 min): `POST https://plajah.com/api/billing/recurring/run` with header `x-elevate-cron-key: $ELEVATE_CRON_KEY`, body `{}`. One sweep does: pull latest state of every OPEN/PARTIAL invoice from Stripe (the no-webhook path), email later installments when they come within 7 days of due, send before/after-due reminders, generate due recurring invoices.

## 7. Flags — Firestore document `config/billingFlags` (all default OFF; set a key to `true`)
Platform admins can use OFF features in "preview" (response header `X-Billing-Preview`) so test before flipping.
| Flag | Turns on | Prerequisites |
|---|---|---|
| `INVOICES` | create/send/void/mark-paid/remind/duplicate/sync/PDF; connect + status routes | Stripe key; entity connected & `charges_enabled` |
| `ESTIMATES` | estimates save/send/respond/convert, public accept page | `INVOICES` for convert; Resend optional |
| `RECURRING_INVOICES` | recurring templates + sweep generation | `INVOICES`, Cloud Scheduler job |
| `INSTALLMENTS` | deposits/milestones (one Stripe invoice per installment) | `INVOICES` |
| `REMINDERS` | automatic before/after-due reminders | `INVOICES`, Cloud Scheduler job |
| `PAYMENT_LINKS` | Stripe Payment Links + QR | entity connected |
| `CUSTOMERS` | customer list UI (client-side Firestore; no server routes) | — |
| `PRICE_BOOK` | price-book UI (client-side Firestore; no server routes) | — |
| `BALANCE_DASHBOARD` | balance / payouts / 30-day totals | entity connected |
| `SALES_TAX` | pass `automatic_tax` on single invoices | Stripe Tax active on the connected account |
| `ACCOUNTING_SYNC` | ORG invoices post journals (Dr AR / Cr Invoiced Income; payment Dr Stripe Clearing / Cr AR; void reverses) | org has Elevate books; webhook recommended for payouts |
| `PRODUCTION_FINANCE` | billing for PRODUCTION entities | `INVOICES` |
| `CREW_PAY` | **no routes yet** — needs a funds-flow design review (Plajah must never hold funds) | — |

Server caches flags 30 s.

## 8. Existing Stripe flows you should re-check
- [ ] Organizations that onboard via the old `/api/stripe/connect/onboard` now get their OWN Express account (not the owner's personal one). Already-linked orgs keep their account. Finance staff only.
- [ ] Business POS (`/api/business-ops` flows) still resolves the business's account from the owner's USER account or `organizations/{id}`; the new BUSINESS billing entity uses `businesses/{uid}.stripeAccountId` (its own account). Decide whether these should converge.

## 9. Go-live test script (test mode)
1. [ ] Set `config/billingFlags` `{INVOICES:true, BALANCE_DASHBOARD:true, PAYMENT_LINKS:true}` (add others as you test).
2. [ ] Create a test entity (a throwaway user or org you admin). `POST /api/billing/connect/start {entity:{kind,id}}` → open the returned URL, finish Express onboarding with Stripe test data (test SSN `000-00-0000`, test bank `000123456789` / routing `110000000`).
3. [ ] `GET /api/billing/status?kind=&id=` → `chargesEnabled:true`, `payoutsEnabled:true`.
4. [ ] Create a customer (Firestore `billingCustomers` doc with `entityKey`), then `POST /api/billing/invoices/save` (draft) → note number `INV-0001`.
5. [ ] `POST /api/billing/invoices/send {id}` → status `OPEN`, `hostedUrl` set; check the invoice appears in the entity's own Stripe dashboard (test mode; emails are not delivered in test mode).
6. [ ] Open `hostedUrl`, pay with card `4242 4242 4242 4242`, any future expiry/CVC.
7. [ ] `POST /api/billing/invoices/sync {id}` (no webhook needed) → status `PAID`, `amountPaid` = total. With the Connect webhook live this flips automatically.
8. [ ] Balance: `GET /api/billing/balance?kind=&id=` → pending balance shows the payment; in test mode trigger an instant payout from the entity's dashboard → appears under payouts.
9. [ ] ORG only: turn on `ACCOUNTING_SYNC`; confirm two journals (`inv:` AR issue, `invpay:` payment) in Elevate; after the payout, confirm payout reconciliation counts the invoice payment as matched.
10. [ ] Also test: installments (`INSTALLMENTS`), payment link, estimate accept → convert, void, mark-paid (out-of-band), reminder, duplicate, recurring (run the sweep manually with the cron key).
11. [ ] Repeat steps 2–7 in **Live** mode with a real $1 invoice to a real card, then refund it from the entity's dashboard.

## 10. Unverified assumptions (the builder could not test against Stripe)
- Express connected accounts can create/finalize/send **invoices** directly (platform key + `Stripe-Account`), and `application_fee_amount` is accepted on those invoices. Believed correct per Connect direct-charge docs.
- Invoice items are attached with `invoice:` to a draft created with `pending_invoice_items_behavior:'exclude'`; line `quantity`+`unit_amount` for integer quantities, otherwise a single `amount`.
- `auto_advance:false` + explicit finalize + `sendInvoice` is the intended send path; Stripe does not send emails in test mode.
- `invoices.pay(id, {paid_out_of_band:true})` marks an open invoice paid; `invoice.paid_out_of_band` exists on the invoice object in API `2024-12-18.acacia` (removed in newer versions — Plajah also records `paidOutOfBand` locally).
- `stripe.tax.settings.retrieve` with `status==='active'` indicates Stripe Tax is ready; failure silently falls back to manual tax. Automatic tax needs a customer address and is NOT used for installment invoices.
- Payment Links `custom_unit_amount` (+ `preset`) and `application_fee_percent` accepted on a connected account.
- Account binding check: each billing request verifies the Stripe account's `metadata.entityKey` equals the entity (legacy accounts with only `metadata.uid` pass when that uid administers the entity). Accounts created before this change by the old flow for orgs carry `metadata.uid` only.
- Destination vs direct: this feature is **direct**. The existing church donation flow uses **destination** charges (platform pays Stripe fees) — they coexist; payout reconciliation handles both.
- Recurring invoices are a Plajah-side sweep (template → child invoice each period, emailed via Stripe `send_invoice`), NOT Stripe subscriptions. Auto-charging a saved card is not offered (no payment-method capture yet).
- Firestore `billingCounters` numbering uses optimistic concurrency via REST commit preconditions (retries up to 10x).
- ORG accounting adds chart accounts `1100 Accounts Receivable` and `4400 Invoiced Income` (seeded on demand; skipped if an existing chart already uses those codes → posting then logs and no-ops).
- `config/billingFlags` is publicly readable because the existing `config/{id}` rule is `read: if true`; only admins can write.
