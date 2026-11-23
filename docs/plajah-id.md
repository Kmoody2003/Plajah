# Plajah ID: one identity for every person and every organization

Status: **phase 1 built 2026-11-23 (uncommitted): IDs, history, Settings and org page display, backfill script. Phases 2–4 not started.**
Builds on: Creator Passport (`services/creatorPassport.ts`, whose honesty note says today's "passport" is just the uid), the device account roster (`services/accountRoster.ts`), org memberships (`orgMemberships`), and the Elevate org switcher (`services/elevateHome.ts`).

## 1. The problem

Today a "person" on Plajah is a Firebase account: one email, one uid. One real person often has several (a personal Gmail, a church staff address, a school address). Each is a separate silo, and nothing on the server says they're the same person. The account switcher just remembers them on one device. Orgs are owned by whichever uid created them, so the org's identity is tied to one staff member's login.

## 2. What a Plajah ID is

A Plajah ID is a permanent identity record that sits **above** logins.

| | Person ID | Organization ID |
|---|---|---|
| Looks like | `PJ-7K3M-9QXA-2HFD-8R4C` | `PJO-4TRW-8N6C-VJ5E-1M7Q` |
| Who it is | one human | the institution itself |
| Holds | linked logins (emails, Google, Apple, phone), profile, org roles | its own credentials, its controllers, its people and roles |
| Survives | email changes, lost accounts | every staff change |

**How the ID is made.** It's 15 random characters (75 bits from a secure server generator) in Crockford base32 (no I/L/O/U, so no look-alike letters), plus a check character that catches every single-character typo. It is **not** derived from an email, name or uid. Knowing someone's email tells you nothing about their ID, and nobody can pick or guess a particular ID.

**Who can make one.** Only the server (Cloud Run `plajah-api` with the Admin SDK) mints IDs. Firestore rules deny every client write to identity collections, so nobody can forge an ID or write one onto their own profile.

## 3. "Hard to impersonate": what actually makes it secure

The ID number is just a name. What protects it is **who can act as it**. Nothing is impossible to impersonate, but this makes it extremely hard:

1. **Passkeys are the master credential.** A person's Plajah ID is controlled by passkeys (WebAuthn: Face ID, Windows Hello, a phone or a security key). Passkeys can't be phished, reused or leaked in a database breach, because the private key never leaves the device. Emails and Google logins become *linked logins*: they let you in for everyday use, but changing the identity itself (linking or unlinking logins, recovery, org control) requires a passkey.
2. **Linking a login needs proof from both sides.** To attach a second email you must be signed into the ID (passkey) and into that email's account, using a one-time code that expires in 10 minutes. Nobody can claim "this email is mine" without controlling it.
3. **Step-up for dangerous actions**: unlinking, adding a controller to an org, transferring an org, or downloading identity history. These require a fresh passkey check (under 5 minutes old).
4. **Recovery that isn't a back door.** You get recovery codes once, at creation, shown one time and stored only as hashes. Optionally, trusted contacts can help, with a waiting period plus notifications to every linked login. There is no "email us and we'll reset it" path: that is how identities get stolen.
5. **Visible verification.** A verified badge shows only when the ID has a passkey and, for orgs, has passed org verification (domain or EIN). Look-alike display names can't copy the badge, because it comes from the record, not the name.

## 4. Encryption and privacy

- **Linked emails are not stored in plain text on the identity.** The identity stores a keyed hash (HMAC-SHA-256 with a server secret held in Secret Manager) for lookups, plus the address encrypted with a Cloud KMS key for display to the owner. A database leak doesn't reveal which emails belong to which ID.
- **The ID is public; the links are private.** Anyone can see `PJ-…` and its verified badge. Only the owner sees which logins and orgs are linked. Orgs see only the person's role in *that* org.
- **Org affiliations stay off public profiles** (same rule as the org sidebar prefs today).

## 5. Organizations: the org outlives its people

An org's ID belongs to the org, not to whoever created it.

- **Controllers**: two or more person IDs (for example, senior pastor and board chair) that together control the org identity. Big changes need **2 of N controllers** to approve: adding or removing a controller, transferring, changing payout accounts, or deleting. No single staff member can walk off with the org.
- **People and roles** hang off the org ID (today's `orgMemberships`, re-keyed to person IDs over time). When staff change, roles move; the org ID, its history, its money and its content stay put.
- **Org credentials**: the org can hold its own login (for example, an office email) linked to the org ID rather than to a person, for shared devices like the front desk or a kiosk.
- **This drives the Elevate switcher.** Switching to an org acts *as you, in your role there*. Today the switcher signs in whichever saved email owns the membership; with Plajah ID it's one sign-in, because all your memberships hang off one person ID.

## 6. Immutable history

Every identity has an **append-only, hash-chained event log**:

```
identities/{id}/history/{seq}
  { seq, type, at, actor, data, prevHash, hash, sig }
  hash = SHA-256(seq | type | at | actor | canonical(data) | prevHash)
  sig  = KMS signature over hash (asymmetric key; public key published)
```

- Events: created, login linked or unlinked, passkey added or removed, recovery used, controller added or removed, role granted or revoked, name changed, org verified, transferred.
- **Nobody can edit or delete it**: Firestore rules allow no client writes, and the server only ever *appends*. Changing an old entry breaks every hash after it, so tampering is detectable by anyone holding the public key.
- **Anchoring (phase 3):** a daily digest of all identity log heads, published to a public transparency file (and optionally a public timestamping service), so even Plajah can't silently rewrite history.
- The owner can view and export their full history; org controllers can view the org's.

This is also the real version of Creator Passport. `passportIdFor(uid)` becomes "the Plajah ID that uid is linked to", and uploads can be signed against it.

## 7. Data model (Firestore, server-written only)

```
identities/{plajahId}          kind: 'person'|'org', createdAt, displayName, verified, status, controllers[] (org), headHash
identities/{plajahId}/logins/{loginId}   provider, uidHash, emailHmac, emailEnc, linkedAt   (owner-only read)
identities/{plajahId}/passkeys/{credId}  publicKey, signCount, transports, addedAt, label   (owner-only read)
identities/{plajahId}/history/{seq}      (above)
loginIndex/{uid}               { plajahId }   ← how a signed-in Firebase uid finds its identity (server-written)
users/{uid}.plajahId           mirrored for display (rules: client can't change it)
```

Custom auth claim `pjid` is set on the Firebase token by the server, so rules can check `request.auth.token.pjid == …` across all of a person's logins.

## 8. Phases

| Phase | What ships | Size |
|---|---|---|
| **1. IDs exist** | Server mints a person ID for every account (backfill and on sign-up) and an org ID for every org; `loginIndex`; `pjid` claim; hash-chained history with `created` events; ID shown in Settings › Account and on the org page. | ~1 week |
| **2. One person, many logins** | Passkey registration (`@simplewebauthn/server`); link or unlink logins with two-sided proof; recovery codes; account switcher groups logins under the one ID; Elevate switcher uses it (no re-sign-in between your own logins). | ~2 weeks |
| **3. Orgs own themselves** | Org controllers with 2-of-N approvals; org-held logins; memberships keyed by person ID; KMS-signed history with a published public key; daily transparency digest; history export. | ~2–3 weeks |
| **4. Portable** | Creator Passport signing on uploads; optional AT-Proto DID (`did:plc`) bound to the Plajah ID so the identity works off Plajah too. | later |

## 8b. Phase 1 as built

- `services/plajahId/core.ts`: ID generation and parsing (Luhn mod 32 check), canonical-JSON SHA-256 hash chain, `verifyChain`.
- `services/plajahId/store.ts`: `identities`, `history`, `logins`, `loginIndex`, `orgIdentityIndex`. Every create is one atomic commit with must-not-exist preconditions, so racing requests can't mint twice.
- `routes/plajahId.ts` at `/api/plajah-id`: `POST /me` (mint and set the `pjid` claim), `GET /me/history`, `GET|POST /org/:orgId` (owner or admins mint), `GET /org/:orgId/history`.
- Clients can't read or write any of it: `firestore.rules` has no match, so Firestore denies by default (no rules bytes spent).
- UI: Settings › Account type shows your card with a verified history. The org page's Home column shows the org's ID, with the full card and history for owners and staff.
- `scripts/plajahIdBackfill.ts`: dry run by default, `--apply` mints for every existing sign-in and every non-demo org.
- Tests: `tests/plajahId.test.ts` (format, typos, tampering) and `tests/plajahIdStore.test.ts` (a fake Firestore REST: create-once, races, org controllers, tamper detection).

## 9. Decisions needed from you

1. **ID format**: built as `PJ-XXXX-XXXX-XXXX-XXXX` for people and `PJO-…` for orgs. Change before the backfill runs, or add a vanity handle on top later?
2. **Passkeys required?** Required for org controllers only, or for everyone after a grace period? (Recommendation: required for controllers and admins, strongly prompted for everyone.)
3. **Org control quorum**: 2-of-N by default, adjustable per org?
4. **Public transparency digest**: publish it (strongest guarantee) or keep it internal (simpler)?
5. **Kids and school-provisioned accounts**: do they get an ID controlled by the parent or school until 18 (or 13)?
