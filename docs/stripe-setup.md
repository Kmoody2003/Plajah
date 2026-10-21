# Getting Stripe working across Plajah

Every Stripe call reads `STRIPE_SECRET_KEY` on the server. Locally it comes from `.env.local`; in production it comes from the App Hosting environment. If either side holds an old key, checkout, payouts, and the creator dashboard all fail together.

## 1. Test mode first (local)

1. Open [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys). Make sure **Test mode** is on.
2. Copy the **Secret key** (`sk_test_…`) and the **Publishable key** (`pk_test_…`).
3. In `.env.local`, replace the old lines:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
   Use a **standard** secret key. The old `rk_live_` restricted key also lacked Connect and transfer permissions, so creator payouts would fail even before it expired.
4. Turn on Connect in test mode: [dashboard.stripe.com/test/connect](https://dashboard.stripe.com/test/connect). Pick **Platform / marketplace**. Creators onboard as **Express** accounts.
5. Create the three Plajah+ prices under **Products**: one product with three **recurring monthly** prices.
   - Tier 1: $4.99
   - Tier 2: $9.99
   - Tier 3: $14.99

   Paste the `price_…` ids:
   ```
   STRIPE_PRICE_TIER1=price_...
   STRIPE_PRICE_TIER2=price_...
   STRIPE_PRICE_TIER3=price_...
   ```
6. Install the Stripe CLI, log in, and forward webhooks to the dev server. Each command prints a `whsec_…` secret.
   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   stripe listen --forward-connect-to localhost:3000/api/stripe/connect-webhook
   ```
   Paste the secrets into `.env.local` as `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`. Merch has its own endpoint, `/api/merch/stripe-webhook`, which uses `STRIPE_MERCH_WEBHOOK_SECRET`.
7. Restart the dev server (`npm run dev`). The env file is read only at startup.

## 2. Smoke test (test cards only)

Use card `4242 4242 4242 4242` with any future expiry and any CVC.

| Flow | What to check |
|---|---|
| Creator payouts | Payment Dashboard → Connect Stripe. Finish Express onboarding with test data. `GET /api/stripe/connect/status` reports onboarded. |
| Album / track | Set a price in the uploader, buy it from a second account. `users/{buyer}/contentLicenses/album_{id}` exists; `creatorEarnings/cs_…` is `paid_out`. |
| Book | Price in USD in the submission wizard, then buy it. The license is minted and the creator gets 95%. |
| Film (buy and rent) | Set a Rent + Buy price in the Film Distribution Hub. The Taleo page shows both buttons at those prices. A rental license expires after the window. |
| Club | Paid club, then subscribe. A `clubMemberships/{clubId}_{uid}` row is ACTIVE. |
| Live tip | Tip a creator who has connected payouts. The earning row is `paid_direct`. |
| Plajah+ | Subscribe, then open the billing portal from the Plajah+ button. |

In the Stripe dashboard, **Developers → Events** should show each `checkout.session.completed` delivered with a 200.

## 3. Going live

1. Switch the dashboard to live mode. Create a **new** standard secret key and the live publishable key. Never paste keys into chat, commits or screenshots. If a key is exposed, roll it at once.
2. Activate Connect in live mode and recreate the three Plajah+ prices; live price ids differ from test ones.
3. Add the webhook endpoints under **Developers → Webhooks**:

   | Endpoint | Listen to | Events | Env var |
   |---|---|---|---|
   | `https://plajah.com/api/stripe/webhook` | Your account | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` | `STRIPE_WEBHOOK_SECRET` |
   | `https://plajah.com/api/stripe/connect-webhook` | Connected accounts | `account.updated`, `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`, `balance.available`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
   | `https://plajah.com/api/merch/stripe-webhook` | Your account | `checkout.session.completed` | `STRIPE_MERCH_WEBHOOK_SECRET` |

4. Store the secrets in Cloud Secret Manager, not as plain `value:` entries in `apphosting.yaml`:
   ```bash
   firebase apphosting:secrets:set STRIPE_SECRET_KEY
   firebase apphosting:secrets:set STRIPE_WEBHOOK_SECRET
   firebase apphosting:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET
   firebase apphosting:secrets:set STRIPE_MERCH_WEBHOOK_SECRET
   ```
   Then reference each one in `apphosting.yaml` with `secret:` (available at `RUNTIME`). Set `VITE_STRIPE_PUBLISHABLE_KEY` and the three `STRIPE_PRICE_TIER*` ids as plain values (`BUILD` and `RUNTIME`).
5. Deploy, then run one real low-value purchase and refund it.

## Notes

- Platform admins run `/api/patronage/payout`; it is no longer callable by anyone signed in.
- Prices in the creator editors are dollars and are charged in USD. Books priced only in other currencies must also have a USD price.
- Per-chapter book prices are stored but cannot be bought yet; there is no chapter checkout.
