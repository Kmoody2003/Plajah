# Print-on-demand (POD) integration

Authors can turn a Plajah book into a printed book. Two honest modes:

- **Direct connect**: Plajah sends the print job to the printer's API (Lulu real; Gelato experimental). Used for (a) selling the print edition on Plajah and (b) author copies / proof copies at cost.
- **Export pack**: no usable API exists, so Plajah builds the print-ready interior PDF, full-wrap cover PDF, metadata CSV and an ONIX 3.0 starter record. The author uploads them in the printer's dashboard. The UI says so explicitly.

Code map: `services/pod/` (types, print-spec engine, royalty, EAN-13, PDF builders, providers), `routes/pod.ts` (mounted at `/api/pod`, plus one block in the Stripe webhook in `server.ts`), `components/pod/` (`PrintEditionStep`, `PrintOrdersPanel`, `BuyPrintEdition`), `tests/pod.test.ts` (`npm run test:pod`).

## Provider comparison

| Printer | Integration | Direct order | Direct publish to retail | Hardcover | Notes (verification state) |
|---|---|---|---|---|---|
| Lulu Print API | **Direct connect** (REST, OAuth client-credentials) | Yes | No (print only, ships to buyer/author) | Yes (case wrap) | Auth, bases, print-job shape, HMAC webhook confirmed from public client code + Lulu pages; cost-calc, cover-dimensions, cancel, statuses, tracking fields **not verified** (docs site is a JS app we could not fetch as text). Sandbox is a separate account. |
| Gelato | Direct connect, **experimental** | Yes (`draft` orders by default) | No | Catalog-dependent | Create-order endpoint + `X-API-KEY` seen in docs snippets; book productUid, quote, cancel, webhook auth **unverified** (docs returned 403 to our fetcher). Operator must supply `GELATO_BOOK_PRODUCT_UID`. |
| Blurb | Adapter stub, **requires partnership** | No | No | Yes | Print API is partner-gated. Export pack only until a partnership exists. |
| IngramSpark | **Export pack** | No | No | Yes | No public API found. Author needs own ISBN. Spine from Ingram's own template generator; ours is third-party-sourced. |
| Amazon KDP | **Export pack** | No | No | Yes | No API. KDP's previewer is final authority. |
| Draft2Digital Print | **Export pack** | No | No | Limited | No print API found. |

Costs, minimums and coverage: **we have not verified current per-book prices, minimum order quantities or country coverage for any printer.** The Lulu quote endpoint is the source of truth for cost (live, per address). When no live quote is available, the UI shows a clearly-labelled *illustrative* estimate and **checkout is blocked** (it only ever charges from a live printer quote). Check Lulu's and Gelato's current pricing pages and coverage lists before promising anything to authors.

## Print-spec engine (`services/pod/printSpec.ts`)

| Item | Value | Source / status |
|---|---|---|
| Bleed | 0.125 in | KDP help (fetched), also Lulu convention |
| Lulu paperback spine | `pages / 444 + 0.06` in (60 lb) | Lulu help "How is spine width calculated?" (fetched) |
| Lulu hardcover spine | stepped table (24-800 pages) | same page (fetched), encoded verbatim |
| Saddle stitch | no spine | same page |
| KDP paperback | 0.002252 in/page white, 0.0025 cream | KDP help (fetched) |
| IngramSpark paperback | same constants, pages rounded up to even | third-party summary, **not verified at Ingram** |
| KDP/Ingram hardcover spine | not encoded | use the printer's cover template |
| Gutter by page count | 0.375 / 0.5 / 0.625 / 0.75 / 0.875 in at 150 / 300 / 500 / 700 / 828 pages | written from memory of KDP's table, **not re-fetched** |
| Spine-text minimum | KDP 80 pages (79 stated), Ingram 48, default 80 | KDP fetched; Ingram third-party |
| Page limits | Lulu hardcover 24-800 (table); others from memory | **unverified**; printer re-validates on quote |
| Hardcover cover wrap | local figure is an **estimate** | For real orders the Lulu `/cover-dimensions` endpoint is called and overrides it (unverified endpoint shape) |
| Lulu `pod_package_id` | `0600X0900BWSTDPB060UW444MXX` style | Format seen in client code; modern dotted form also exists. Builder supports both. Cream+80 lb, 50 lb are not offered on Lulu (50 lb maps to 60 lb). |

Cover wrap = bleed + back + spine + front + bleed wide, trim height + 2 x bleed tall, 300 dpi px reported. Spine text is drawn only at or above the printer minimum page count.

## Files the printer downloads

Lulu fetches the PDFs from public URLs. Plajah serves `GET /api/pod/files/:orderId/:file` using **HMAC-signed, expiring links** (14 days, `POD_FILE_SECRET`), regenerating the PDFs from the book. Each order stores a hash of the book text; if the author edits the text after an order, file generation refuses (409) rather than print something different from what was bought. Cover images are fetched server-side with an https-only, private-host-blocking guard (DNS-rebinding is not fully mitigated).

Interior PDF: title page, copyright page, contents, chapter openers on recto pages, running heads, page numbers, mirrored gutters, justified text, widow/orphan control, fonts embedded (EB Garamond latin subset). **Limits:** Latin script only (other characters become `?` with a warning); text chapters only (chapters that are uploaded PDF/EPUB or comic pages are skipped with a warning); no images inside chapters; hyphenation not implemented (justification can be loose in narrow columns). Not yet visually reviewed on a printed proof.

## Pricing and money flow

- Retail: buyer pays `list price x copies + shipping/tax at printer cost`. Platform cut is **5% of the list price only**. Author profit estimate = list - print cost - 5% - card fee (2.9% + 30c, **an estimate**). Shipping and tax are pass-through. `minimumListPriceCents` finds the lowest price with profit >= 0, and checkout refuses a below-cost price.
- Author copies / proof: charged **printer total + card-fee gross-up** (at cost, no platform margin).
- Authors' profit is written to `creatorEarnings` (category `print_on_demand`, status `pending`) in the same ledger the other products use. **Payout of that ledger is whatever the existing creator-payout process does; nothing new was built for payouts.** Note the generic 90/10 path is deliberately *not* used (it would take 10% of print cost too).
- Quote and charge can differ slightly (the printer's final invoice vs the quote at checkout). The actual printer cost is not reconciled automatically.

## Setup

1. Create a **Lulu sandbox** account at developers.sandbox.lulu.com, create API keys. (Production keys come from developers.lulu.com; production needs a payment method on the Lulu account since print jobs are billed to it.)
2. Set server env (never `VITE_`-prefixed): `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET`, `LULU_SANDBOX=true`, `POD_FILE_SECRET` (random 32+ bytes), `POD_PUBLIC_BASE_URL` (a URL the printer can reach, not localhost), optional `POD_CONTACT_EMAIL`. See `.env.example`.
3. Register the webhook in Lulu's dashboard/API for topic `PRINT_JOB_STATUS_CHANGED` pointing to `https://<host>/api/pod/webhook/lulu`. Signature header `Lulu-HMAC-SHA256` = HMAC-SHA256(raw body, your client secret).
4. Stripe: the existing `STRIPE_WEBHOOK_SECRET` webhook already receives `checkout.session.completed`; the `pod_print_order` branch was added there. No new Stripe webhook endpoint is needed.
5. **Firestore rules were edited but NOT deployed.** Until deployed, client reads of `podEditions`, `podOrders` and `users/{uid}/podOrders` are denied (server routes use Admin REST and are unaffected, but the UI uses the API so it works either way). Deploy rules deliberately when ready.
6. Gelato (optional): `GELATO_API_KEY`, `GELATO_BOOK_PRODUCT_UID` (from Gelato's catalog), `GELATO_WEBHOOK_SECRET`; orders are `draft` unless `GELATO_ORDER_TYPE=order`.

## NOT verified (read before going live)

- **No real Lulu or Gelato call has ever been made.** No credentials were available. All provider behaviour is tested only against mocked `fetch` (`tests/pod.test.ts`). Run the Lulu **sandbox** end to end before production: quote, create job, webhook delivery, cancel, tracking field names, status names.
- Unverified Lulu details: cost-calculation request/response names, `/cover-dimensions` shape, `PUT /print-jobs/{id}/status/` for cancel, the full status enum, tracking fields, whether `shipping_level` accepts our five values for every country, whether sandbox accepts localhost-style PDF URLs (it must reach the public URL).
- Retail checkout, the Stripe webhook branch, Firestore reads/writes and notifications were **not exercised against live Firebase/Stripe**; the router is smoke-tested only on paths that don't need them. Idempotency is a status check (`pending_payment` -> `paid`), not a transaction: two simultaneous webhook deliveries could in theory both submit a job.
- Generated PDFs were checked structurally (page counts, sizes, recto openers, embedded font streams) but **not visually proofed or run through Lulu/KDP/Ingram validators**.
- Spine/gutter/page-limit figures marked unverified above. Tax handling, refunds on a printer rejection, and returns are not built (a rejected job is flagged `needsAttention` and the author/admin is notified; refund is manual in Stripe).
- ISBNs: Plajah does not issue ISBNs. Provide one or let the printer assign one; the barcode is drawn only for a valid ISBN-13.
- Blurb adapter is a stub by design. IngramSpark/KDP/D2D are export packs only.
- UI was syntax-checked with esbuild, not exercised in a browser. The "Buy print edition" button is wired into the BookReader paid-book gate only; `PrintEditionStep` is ready to mount from the submission wizard (`components/bookSubmit/`, not touched) and `PrintOrdersPanel` has no host screen yet.
