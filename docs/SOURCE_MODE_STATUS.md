# Source Mode — status & what's left

Journalist-privacy feature living inside The Post Man (a "Sources" room) and chat.
Paused 2026-08-13. Branch `feat/postman-native` (commits `cee2782`, `1281179`).

**Standing rule (do not violate):** make **no** privacy claims in the UI — now or in any
future phase — without a security review first. The disclosure panel's current wording is
the ceiling until an audit clears more.

---

## Shipped & verified

**Source Vault — real client-side encryption** (`services/vaultCrypto.ts`, `sourceVaultService.ts`,
`components/postman/SourcesRoom.tsx`, `DisclosurePanel.tsx`)
- AES-GCM-256 envelope: random data key wrapped by passphrase- and recovery-derived KEKs
  (PBKDF2-SHA256, 600k). Passphrase never leaves the device; Firestore stores only ciphertext.
- Passed an adversarial audit; all findings fixed: passphrase-strength enforcement, Crockford
  recovery-code normalization, KDF params bound as AES-GCM AAD (downgrade-proof), fail-closed
  notification redaction, magic-byte attachment sniffing, dead extractable-key helpers removed,
  random doc IDs, clipboard auto-clear.
- Round-trip + negative cases (wrong passphrase, tampered ciphertext, downgrade) verified in-browser.

**Protected Threads — operational hardening** (`services/protectedThreads.ts`, `ChatWindow.tsx`,
`backendService.ts`, `exifService.ts`, `sessionTrace.ts`)
- Protect toggle + shield indicator; EXIF/GPS stripped on image send (fail-closed, magic-byte gated);
  capture deterrence; breadcrumb suspension; AI-exclusion guard.
- Notification + room-list preview redacted at the source for protected rooms (no sender, no text).
- Auto-delete window (default 30d; cycle 7/30/90/Off) with a sweep reusing the burn mechanism.
- **Regular (non-protected) chats verified unaffected** — every path is guarded by `protected`,
  and ChatSystem mounts cleanly with the feature present.

`services/cryptoService.ts` carries a loud header: it is at-rest only, NOT E2EE — never use it here.

---

## Left to do

### Phase 1 remainder (small)
- **Link-unfurl guard** — `protectedThreads.mayUnfurlLinks` exists but has no call site yet; chat has
  no link previews today. Wire it if/when link previews are added.
- **Passphrase change / vault re-key** — intentionally not built (needs an extractable key; footgun).
  If added: minimise the extractable key's lifetime, re-authenticate server-supplied KDF params.
- **Native capture blocking** — `FLAG_SECURE` on Android / equivalent on iOS for protected threads
  and the vault (web can only deter, not block).

### Hardening (fast follow, before a broad rollout)
- **Argon2id KDF** via a vetted WASM build, replacing PBKDF2 for the KEK — the audit's top future
  item; PBKDF2 is GPU-friendly, so it leans hard on passphrase entropy.
- **Structural-metadata reduction** — createdAt/updatedAt are cleartext; a breach reveals count +
  timeline of sources. Acceptable for v1; coarsen or encrypt later if the threat model demands.

### Phase 2 — the big one
- **Real end-to-end encrypted messaging**: per-device asymmetric keys (libsignal or MLS/RFC 9420),
  forward secrecy, ideally sealed sender. Native-app first (browser-delivered crypto is the weaker
  surface). This is the only thing that lets "Plajah can still read your messages" come off the
  disclosure panel — and it ships **behind an external security review**, UI wording changed only
  after the review clears it.

### Not in scope (by design — point users elsewhere)
- Anonymous public tip line (SecureDrop's job), Tor/onion access, IP-address hiding. The disclosure
  panel already directs serious source work to SecureDrop and Signal.
