# Clinic data — HIPAA technical safeguards

**Read this first.** Software cannot make a clinic "HIPAA compliant". Compliance is a property of an organisation:
its agreements, policies, training and conduct. This code implements the *technical safeguards* of the Security
Rule (45 CFR §164.312) so that a covered entity *can* use Plajah Clinical Care within a compliant programme. It has
not been audited by a third party. Have your compliance counsel / a qualified assessor review it before real patients.

## What is built (`services/clinic/phi/`, `firestore.phi.rules`)

| §164.312 | Safeguard | Where |
|---|---|---|
| (a)(1) Access control | Dedicated `plajah-phi` database, default-deny rules, role→record-kind matrix (OWNER/ADMIN/PROVIDER/STAFF/BILLER), minimum necessary: front desk never receives the clinical key | `firestore.phi.rules`, `types.ts` |
| (a)(2)(i) Unique user ID | Firebase uid on every record and audit entry | rules + `phiSession.ts` |
| (a)(2)(iii) Automatic logoff | Vault lock on idle/tab hide (`lock()` wipes keys from memory) | `phiSession.ts` (idle hook: pending UI work) |
| (a)(2)(iv) Encryption at rest | Client-side AES-256-GCM envelope encryption; Google only ever stores ciphertext (plus Google's own at-rest encryption); keys sealed per-member (ECDH P-256 + HKDF), passphrase via PBKDF2-SHA256 600k | `phiCrypto.ts`, `phiVault.ts` |
| (b) Audit controls | Every create/update/lock/read/list/export/membership/key change writes an audit entry **in the same atomic batch** (rules enforce it with `getAfter`); entries are write-once; per-session SHA-256 hash chain detects deletion/reordering | `phiAudit.ts`, rules |
| (c)(1) Integrity | AES-GCM with identity-bound AAD (clinic, record, kind, key, revision) — a record can't be moved/replayed/edited; signed records are immutable with a content hash | `phiCrypto.ts`, rules |
| (d) Authentication | Firebase Auth uid + a separate vault passphrase (never leaves the device) | `phiVault.ts` |
| (e) Transmission | TLS to Google; payloads are already ciphertext | — |
| 164.308(a)(7) Contingency | Owner recovery key (asymmetric, shown once, rotates on use); PITR + delete protection on the database (provisioning script) | `phiVault.ts`, `scripts/provisionPhiDatabase.mjs` |

Also: suspending a member deletes their key grants and rotates the key, so they can't read anything new; records are
never deleted (suspend, don't erase); the clinic id is bound to the founder's uid so nobody can squat another clinic.

## Verification

* `npm run test:phi` — 43 tests: no plaintext in storage, AAD binding, tamper detection, role separation, cross-device
  unlock, rotation (including interrupted), recovery, audit-chain verification.
* `npm run test:phi-rules` — 93 allow/deny cases against the real Firebase Rules engine (REST `:test`; read-only).
  Because that API can't express timestamps the script substitutes `request.time`→`'NOW'`; the logic is unchanged.

## Known limitations (be honest with your auditor)

* Signed records stay under the key they were signed with after a rotation (they are immutable). A removed member who
  cached that key *before* removal could still decrypt copies they already downloaded. This is inherent to any
  system without remote wipe.
* Firebase Authentication (the plain product) is **not** in Google's BAA. Use **Identity Platform** (BAA-covered) and
  require MFA before real PHI. Firebase Hosting, FCM and the Gemini Developer API are also outside the BAA: no PHI may
  be sent to them. The scribe must run on-device or not at all.
* The encryption is client-side, so server-side search/reporting over PHI is impossible by design. Only `kind`, `day`,
  `apptRef`, `status` are plaintext metadata — review whether `day` + `status` are acceptable for your risk analysis.
* A lost vault passphrase *and* a lost recovery key means the data is unrecoverable. That is the point, and a support burden.
* Telehealth in the app is a mock and must not be used for patients.

## What stays with the covered entity (code can't do these)

1. Sign Google's **Business Associate Agreement** (Cloud Console → Compliance) — and make sure Plajah's own BAA terms
   with each clinic are in place (Plajah is then the clinic's business associate).
2. Create the database: `node scripts/provisionPhiDatabase.mjs --location=nam5 --apply` (dry-run by default).
3. Enable Cloud Audit Logs (Data Read/Write) for Firestore; set log retention (HIPAA documentation: 6 years).
4. Identity Platform + MFA; restrict who in your organisation holds Owner/IAM roles on the project.
5. Written risk analysis (§164.308(a)(1)), policies and procedures, workforce training, sanction policy.
6. Breach-notification procedure, patient access/amendment/accounting-of-disclosures workflows, retention schedule.
7. Device and workstation policy (disk encryption, screen locks, no shared logins).
