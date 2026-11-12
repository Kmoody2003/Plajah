# Tela Sign — native e-signatures in the Tela document layer (Blueprint)

**Status:** core built and tested, signing screen built, used from Civic Desk (preview). Not yet server-backed.
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

1. **Server authority:** envelopes and the audit trail are written only by the server
   (`/api/tela/sign/*`, a server-only collection like `licenseLedger`). The server stamps time, IP and user agent, and
   checks that the document hash matches the stored file.
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
