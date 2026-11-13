# Tela Sign — native e-signatures in the Tela document layer (Blueprint)

**Status:** core built and tested, signing screen built, used from Civic Desk (preview). Server API built and tested (`routes/telaSign.ts`); the signing screen still runs on the local preview until it is switched to the API.
**Date:** 12 November 2026.
**Where:** `services/tela/sign/signCore.ts` (tests: `tests/telaSign.test.ts`), `components/tela/sign/TelaSignCeremony.tsx`.

---

## 0. What it is

A DocuSign-class signing product built into Tela, so any Plajah document can be sent for signature
without a second vendor: a permit decision from Civic Desk, a vendor contract in Plajah Business, a
volunteer waiver in Elevate, a grant agreement in Programs Desk. Governments get it inside the
Civic Rate; businesses and organizations get it inside their plans.

## 1. What's built

- **Envelopes:** one document fingerprinted with SHA-256, recipients in routing order (sequential or parallel),
  roles (signer, approver, cc), and an identity method per recipient (email link, Plajah account, SMS code, ID-verified).
- **Fields:** signature, initials, date signed (filled automatically), name, text and checkbox, positioned with the same 0–100% page boxes as Tela
  Base fields (`TelaField.layout`), so Tela's document intelligence can place them on uploaded forms.
- **Ceremony:** an electronic-records disclosure and consent step for consumers (ESIGN 15 U.S.C. 7001(c)).
  Signatures are drawn (stored as an SVG path) or typed. "It isn't your turn yet" is enforced. Signers can decline with a reason.
- **Audit trail:** every event (created, sent, viewed, consented, field, signed, declined, voided, expired, completed)
  is appended with a SHA-256 hash covering the previous one; `verifyAudit` re-walks the chain, and any edit breaks it
  from that event on. Server-side IP and user agent fields are part of the model.
- **Completion:** a final fingerprint over the document and every value, plus a certificate of completion with
  signers, methods, consent and timestamps, each event's hash, and an on-screen integrity check. The final fingerprint
  is ready to anchor on the Civic Record.
- **Legal guardrails (`checkExclusions`):**
  - **Blocked:** wills, codicils and testamentary trusts (Michigan UETA, MCL 450.833); family-law matters and court
    orders (federal ESIGN, 15 U.S.C. 7003).
  - **Paper copy still required:** utility shutoff, foreclosure, eviction and repossession notices, insurance
    cancellation, product recall and hazardous-materials documents.
  - **Flagged:** state departments, which sign electronically as DTMB determines (MCL 450.848).
- **Self-contained:** a pure-JS SHA-256 (tested against Node's crypto) means the same code runs in the browser and on the server.

Michigan law confirmed in the Terra Law Library: MCL 450.837 (electronic signatures satisfy signature requirements),
450.838 (parties must agree to transact electronically), 450.833 (exclusions), 450.848 (state agencies),
55.286d (remote electronic notarization, which is a future add-on).

## 2. Production plan

1. **Server authority (built 13 Nov 2026, `routes/telaSign.ts`, tests `tests/telaSignRouter.test.ts`):** envelopes and the audit trail are written only by the server
   (`/api/tela/sign/*`, a server-only collection like `licenseLedger`). The server stamps time, IP and user agent, and
   checks that the document hash matches the stored file.
   Built: senders create, send and void with their Plajah session; signers act through HMAC-signed links
   (`TELA_SIGN_SECRET`); the server stamps time, IP and user agent, enforces turn order and consent, and sets
   signature times itself. Envelopes are stored as one JSON string (`telaSignEnvelopes`) so hashes never drift,
   and every write claims a create-only lock on the version it starts from (`telaSignLocks`), so concurrent
   writes can't fork the history. Access codes (stored hashed) and Plajah-account signers are enforced.
   SMS and ID verification are refused at creation until they exist, so nobody believes they're enforced.
   A public `GET /api/tela/sign/verify/:hash` returns names, dates and the integrity check (no emails).
   Still to do: switch the signing screen and Civic Desk to the API, store the document itself, and email delivery.
2. **Delivery:** signing links by email (Resend, with the existing HMAC-token pattern from `services/notify`), in-app and push;
   SMS codes once platform SMS consent exists. Reminders and expiry run on the existing cron pattern.
3. **PDF in and out:** upload a PDF, use Tela document intelligence plus the Grants `HUMAN_ONLY` detector
   (`services/grants/forms.ts`) to suggest where signatures go, then flatten the signed PDF with the
   certificate page appended (pdf-lib, already in the repo).
4. **Identity levels:** email link, then Plajah account, then SMS code, then ID verification (the same vendor as Forum Tier 2).
   Higher levels are required for higher-risk documents.
5. **Templates and bulk send:** reusable documents with roles (e.g. "Sidewalk café permit"), and one template sent to many
   recipients (e.g. license renewals).
6. **Ledger anchoring:** completed envelopes' final fingerprints go onto the Civic Record so anyone can check a
   signed government document wasn't altered.
7. **Later:** remote online notarization under the Michigan Law on Notarial Acts (MCL 55.286d), and witness signatures.

## 3. Not legal advice

The exclusion checks encode the main statutory exceptions, but each government's counsel decides which
documents it signs electronically and at what identity level.

---

## 4. DocuSign, feature by feature (13 Nov 2026)

Status key: **Built** = in `signCore` / the signing screen today · **Partial** = the pieces exist elsewhere in Plajah but
aren't wired into Tela Sign · **Planned** = on the roadmap below · **Not planned** = deliberately out of scope for now ·
**Tela-only** = something DocuSign doesn't offer.

| Area | Feature | Tela Sign |
|---|---|---|
| Sending | Envelopes, signing order, parallel signers | Built |
| | Several documents in one envelope | Planned (P1) |
| | Templates with roles | Planned (P1) |
| | Bulk send (one template to many people) | Planned (P1) |
| | Self-service forms people fill and sign (PowerForms / Web Forms) | Partial: Tela forms exist (`telaHtmlExport.renderForm`) |
| | Conditional routing, signing groups | Planned (P2) |
| | Reminders and expiry | Partial: expiry built, reminders planned (P1) |
| | Correct an envelope in flight | Planned (P1), with signer-proposed corrections (Tela-only) |
| | Void | Built |
| | Sender branding | Planned (P2) |
| Fields | Signature, initials, date signed, name, text, checkbox | Built |
| | Dropdown, radio, number, email, formulas, validation, conditional fields | Partial: Tela Base already has SELECT/NUMBER/DATE fields |
| | Signer attachments (upload a document while signing) | Planned (P2) |
| | AI field placement (DocuSign "Agreement Prep") | Partial: Tela document intelligence and the Grants `HUMAN_ONLY` detector exist |
| Signers | No account needed | Built (email link) |
| | Mobile signing | Built |
| | Draw or type a signature | Built; uploading an image is planned |
| | In-person signing (a host hands over a tablet) | Planned (P1), which matters for counters, permit desks and clinics |
| | Decline with reason | Built |
| | Reassign or delegate | Planned (P2) |
| | Comments on the document | Planned (P2) |
| | Signing screen in the signer's language | Partial: notices are multilingual; the signing UI is planned (P1) |
| Identity | Email link, Plajah account | Built |
| | Access code | Built (server: stored hashed, required before any action) |
| | SMS code | Planned (P2, after platform SMS consent and carrier registration) |
| | Government ID verification | Planned (P2, same vendor as Forum Tier 2) |
| | Knowledge-based questions | Not planned (weak and being phased out industry-wide) |
| Delivery | Email | Planned (P1, Resend + HMAC links already in the repo) |
| | SMS, WhatsApp | SMS planned (P2); WhatsApp not planned |
| | Plajah inbox and push | **Tela-only**: requests arrive inside an app the person already trusts |
| Evidence | ESIGN consent | Built |
| | Audit trail and certificate | Built: hash-chained and re-verifiable on screen (stronger than a plain log) |
| | Sealed PDF with the certificate attached | Planned (P1, pdf-lib) |
| | Public "verify this document" page | **Tela-only**; the public API is built, the page is P1 |
| | Civic Record anchoring | **Tela-only**, planned |
| | UETA/ESIGN exclusion checks | **Tela-only**, built |
| | 21 CFR Part 11, eIDAS qualified signatures | Not planned (US government and SMB focus first) |
| | FedRAMP | Not planned yet; GovRAMP for state and local is planned |
| Money | Collect payment while signing | Planned (P2, Stripe Connect already in Plajah) |
| Notary | Witness signing | Planned (P2) |
| | Remote online notarization | Planned (P3, Michigan MCL 55.286d) |
| Platform | API and webhooks | Planned (P2) |
| | Salesforce, Microsoft 365 and similar connectors | Not planned for now |
| | Built into Civic Desk, Programs Desk, Business, Elevate | **Tela-only**; Civic Desk is built |
| Admin | Users, roles, retention rules, bulk export | Planned (P2) |
| AI | Plain-language summary of what you're signing | Planned (P1): ARIA, labelled, never replaces the text |

## 5. Every pain point, and Tela Sign's answer

| Pain point (DocuSign) | Tela Sign's answer |
|---|---|
| **Per-seat prices, envelope caps and overage fees.** Third-party guides report about 100 envelopes per user per year on Standard and Business Pro, with overages of a few dollars each | No seats and no envelope caps. Signing is included in Plajah plans and in the Civic Rate for governments. Only real third-party costs (SMS, ID checks) pass through, at cost |
| **Auto-renewal and cancellation traps.** Most of DocuSign's 1-star Trustpilot reviews are about renewals and cancelling | Monthly or annual, a reminder 30 days before any renewal, one-click cancel, and a full export of every document and certificate whenever you want it |
| **Phishing.** "DocuSign" emails are among the most impersonated, and attackers abuse the real platform too | Requests land in the signer's Plajah inbox from a verified sender badge (governments verified by domain). Emails only say a document is waiting and show a match code that also appears in the app, and they never ask for a password. A public verify page checks any document by its fingerprint. New senders are rate-limited and screened |
| **Signers don't know what they're signing or where to click** | A guided "next field" flow, large touch targets, an ARIA plain-language summary (labelled AI) next to the real text, and the signing screen in the signer's language |
| **Placing fields is tedious** | AI field placement from Tela's document intelligence, reusable templates with roles, and fields that use the same page model as every Tela document |
| **Fixing a mistake means voiding and starting over** | Correct an envelope in flight: only the affected signers re-review, and the audit trail shows exactly what changed. Signers can propose a correction instead of declining |
| **Add-ons cost extra** (SMS delivery, ID verification, payments) | In-app and push delivery are free. SMS and ID checks are billed at cost. Payments use Plajah's existing Stripe Connect |
| **Your proof lives in their system** | Export the sealed PDF, the certificate and the raw audit chain. Anyone can re-verify the hashes offline, and final fingerprints can be anchored on the public Civic Record |
| **Government needs** (records retention, public records, accessibility, many approvers) | Built into Civic Desk and Programs Desk: retention schedules, FOIA export with redaction, WCAG 2.1 AA, approver chains, and signed decisions linked to the case |

## 6. Roadmap

- **P1 (parity for everyday use):** server-side envelopes, email delivery, reminders, templates, bulk send,
  several documents per envelope, in-person signing, access codes, correct-in-flight, sealed PDF and certificate export,
  the public verify page, a translated signing screen, and the ARIA summary.
- **P2 (business-grade):** advanced fields and conditional logic, attachments, delegate and comments, payments, SMS
  delivery and codes, ID verification, witness signing, API and webhooks, branding, admin and retention.
- **P3:** remote online notarization (MCL 55.286d), Civic Record anchoring by default for governments, and GovRAMP.

Sources for DocuSign details (third-party where noted): DocuSign features page and SMS delivery announcement;
pricing and envelope-limit summaries from Signeasy and Automation Atlas; billing complaints from the BBB and DocuSign
community forums; phishing alerts from the DocuSign Trust Center. Verify DocuSign's current terms before citing them publicly.

## 7. Identity checks: what we build and what we buy (13 Nov 2026)

A ladder: higher-risk documents require a higher level, and the audit trail records which level was used.

| Level | Method | Build or buy | Cost to the customer |
|---|---|---|---|
| 0 | Email link (HMAC-signed) | Built | Free |
| 1 | Plajah account; passkeys next | Built (account check); passkeys to build | Free |
| 2 | Access code (built) or SMS code | Build | SMS at carrier cost |
| 3a | **State mobile ID (mDL) from the phone's wallet** | **Build** | Free |
| 3b | Photo of an ID card plus a selfie | **Buy** behind an adapter (start with Stripe Identity, ~$1.50 a check by third-party reports) | At cost |
| 3c | ID checked by staff at a counter (in-person signing) | Build | Free |
| — | Knowledge-based questions | Not offered | — |

**Why build 3a.** Chrome (141+, OpenID4VP and ISO 18013-7 Annex C) and Safari (26+, Annex C only) let a website ask the
phone's wallet for a state-issued ID through the W3C Digital Credentials API. The credential is signed by the issuing
state, so we verify a signature rather than judge a photo, and the person can share only what's needed (name, date of
birth, or just "over 18"). We build the request, the verifier and a trust list of state issuer keys (AAMVA's Digital
Trust Service). Caveat: Michigan doesn't issue a mobile ID yet; SB 617–621 were in Senate committee in February 2026.

**Why buy 3b.** Document-and-selfie checks are an arms race against deepfakes and injected camera feeds, need large fraud
datasets, bring biometric-privacy liability (Illinois BIPA above all), and government buyers ask for audited
conformance (NIST SP 800-63 IAL2). Vendors already carry that. We keep only the result, level and method, never the images.

**What we own either way:** verify once and reuse across Tela Sign, Forum Tier 2 and Grants; the rules that map document
risk to a level (e.g. permits level 1, leases and grant agreements level 2, money or property level 3); and the record.

**Order of work:** server authority (done) → passkeys → mDL verifier → vendor adapter for 3b → SMS once carrier registration is done.
