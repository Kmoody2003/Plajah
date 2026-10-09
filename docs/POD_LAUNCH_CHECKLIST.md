# Print-on-demand launch checklist

Status (2026-10-09): everything is built and **dark**. Nothing is visible to authors or readers, and the server refuses new print requests, until a switch is turned on. Target: switched on before the end of 2026.

Switches live in the admin dashboard under **Print launch** (Firestore `config/podFlags`, no redeploy). The same panel shows a live go-live checklist from `GET /api/pod/readiness`. Admins always see the real screens as a preview while a switch is off.

| Switch | What it turns on | Money moves? |
|---|---|---|
| `PRINT_EXPORT_PACKS` | Authors design a print edition and download print-ready PDFs + metadata to upload to KDP / IngramSpark / Draft2Digital themselves | No |
| `PRINT_ORDERING` | Proof copies and author copies ordered through Plajah (Lulu), paid by card | Yes (author pays) |
| `PRINT_RETAIL` | Readers buy a print edition on the book page; printer ships; author credited the profit. Needs `PRINT_ORDERING` | Yes (reader pays) |

Turning a switch **off** only stops new orders. Printer file downloads, printer webhooks and Stripe fulfilment are never gated, so an order already paid still finishes.

## Suggested order

1. **Stage 0: now.** Nothing to do. Code is deployed dark. Deploy `firestore.rules` deliberately (new `podEditions`, `podOrders` rules). The `podLocks` collection is server-only and needs no rule.
2. **Stage 1: export packs (low risk).** Turn on `PRINT_EXPORT_PACKS`. Before that, open a real book as an admin preview and download each file; upload the interior and cover PDFs to a real KDP or IngramSpark title (without publishing) and see whether they accept them. The PDFs have only been checked structurally, never run through a printer's validator.
3. **Stage 2: Lulu sandbox rehearsal.** Create a Lulu **sandbox** developer account, set `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET`, `LULU_SANDBOX=true`, `POD_FILE_SECRET` (24+ random chars) and `POD_PUBLIC_BASE_URL` (public https; the printer must be able to fetch files from it). Register `<POD_PUBLIC_BASE_URL>/api/pod/webhook/lulu` in the Lulu developer portal. As an admin (preview), order a proof end to end with a Stripe **test** card.
4. **Stage 3: verify the unknowns.** These were written from public client code and help pages, not from Lulu's rendered docs, so confirm against the sandbox: the cost-calculation fields, the cover-dimensions call, cancel, status names, tracking fields. Compare the quoted print cost with the invoice. Fix `services/pod/providers/lulu.ts` if any shape differs.
5. **Stage 4: production keys.** Production Lulu keys, `LULU_SANDBOX=false`, Stripe live keys and the live Stripe webhook. Order one real proof copy to yourself. Then turn on `PRINT_ORDERING`.
6. **Stage 5: retail.** Only after real orders have shipped cleanly. Decide first how refunds and printer rejections are handled (currently manual: the order is flagged `needsAttention`). Then turn on `PRINT_RETAIL`.

Suggested pacing to land before year-end: stage 1 in October or November, stages 2 to 3 in November, stage 4 in early December, stage 5 only if stage 4 went cleanly.

## Known limits to keep in mind

- No real Lulu or Gelato call has ever been made; provider behaviour is tested only against mocked network calls.
- Gelato is experimental (orders as drafts, no quote, needs `GELATO_BOOK_PRODUCT_UID`). KDP, IngramSpark and Draft2Digital have no public API found: export pack only. Blurb needs a partnership.
- Interior PDF: Latin script only, text chapters only (no images, tables or comics inside chapters, no hyphenation). Visual-led books use the Tela paged drawer instead.
- Printer costs, minimum quantities and country coverage are unverified; without a live quote the UI shows a labelled estimate and checkout is blocked.
- Author profit is written to `creatorEarnings` as `pending`. Payout, printer invoice reconciliation and refunds are not built.
- A reader-facing "coming soon" is deliberately **not** shown on book pages (readers see nothing until retail is on). Authors see a calm "Coming soon" card in the print step.
