# Creator Passport — Key & Recovery Model (Draft v0.1)

> Design only — not implementation. This is the make-or-break of the whole product: a self-sovereign
> identity that normal creators can't lock themselves out of, and that Plajah can never unilaterally seize.

## 0. Why this is the hard part

A portable identity is a keypair. That gives two opposite failure modes, and the design must thread both:

- **Custodial trap:** if Plajah holds the keys, it's just another Google login — Plajah can lock you out, get subpoenaed, or get breached, and the "it follows you" promise is fake.
- **Self-custody cliff:** if the creator holds the only key and loses it, their *entire career identity* is gone forever. Normal people *will* lose keys. A product with this cliff dies.

The answer is **not** "pick one." It's a **layered key hierarchy + threshold recovery** where no single party (including Plajah) is both necessary and sufficient.

## 1. Key hierarchy

Built on `did:plc`, which separates *rotation keys* (can update the DID document → change the signing key / re-point the handle / migrate PDS) from the *signing key* (day-to-day). We add device keys on top.

| Tier | Key | Holds | Used for | Compromise impact |
|---|---|---|---|---|
| **Device** | passkey / WebAuthn (per device) | Secure enclave / platform passkey cloud | daily login, authorizing the signing key | one device; revocable |
| **Signing** | repo signing key | PDS-side, gated by device auth | signing commits + records | rotatable via rotation keys |
| **Rotation** | N rotation keys (did:plc) | distributed across **guardians** (see §2) | DID-doc updates, recovery, migration | needs a *threshold*, not one |

Principle: **day-to-day is convenient (passkeys); control is distributed (threshold rotation keys).** Losing a phone ≠ losing your identity. Losing one guardian ≠ losing control.

## 2. Recovery = threshold guardians (M-of-N)

Control of the rotation keys is split into **N shares** held by **guardians**, requiring **M-of-N** to recover or rotate (e.g. 2-of-3, 3-of-5). Two viable share mechanisms (pick in Phase 1):

- **Social recovery (account-based):** each guardian is itself a Passport/Webauthn account that holds a key share or co-signs a recovery; recovery = M guardians approve in-app. Best UX, no seed phrases.
- **Cryptographic shares (SSS/MPC):** Shamir-split the rotation secret, or use an MPC/threshold-signature service so the full key never exists in one place. Stronger, more complex.

**Recommended default:** *social recovery* for normal creators (frictionless), with an *MPC/SSS escape hatch* for power users — both reduce to "M-of-N must agree."

### Who are the guardians? (the crucial part)
A **mix**, so no one party is decisive:
- **Plajah holds exactly ONE share/role** — a participant, never a majority. Plajah alone can neither recover nor seize the identity, and Plajah disappearing does not lock the creator out.
- **Creator-chosen guardians** — trusted people (bandmate, manager, friend) and/or the creator's own second device / hardware key.
- **Optional independent recovery service(s)** — third parties, so the trust isn't all Plajah.

Concrete starting policy: **2-of-3** = {creator's second device} + {one creator-chosen guardian} + {Plajah}. Any two recover; no one alone. Power users can set 3-of-5 with more independent guardians.

## 3. Non-unilateral by construction (the trust guarantee)

The defining property: **Plajah is never both necessary and sufficient.**
- Not *sufficient*: Plajah's single share can't update the DID doc or move the identity.
- Not *necessary*: the creator can pick a policy that excludes Plajah entirely (e.g. their devices + their guardians), and can **migrate the rotation-key custody off Plajah** the same way they migrate the PDS.

This is what makes it a *standard* rather than a walled garden: leaving Plajah — identity, repo, *and* recovery — is a supported, first-class operation.

## 4. UX flows

- **Onboarding (60 seconds):** create passkey on this device → auto-provision DID + signing key → set recovery to the default 2-of-3 (this device + invite 1 guardian + Plajah) → done. Recovery isn't a scary seed phrase; it's "add a trusted contact."
- **New device:** approve from an existing device (passkey) — normal.
- **Lost all devices:** start recovery → M-of-N guardians approve (push/email/app) → rotation keys mint a fresh signing key + register the new device. Identity intact, no data lost (repo is content-addressed and PDS-hosted).
- **Suspected compromise:** rotate signing key (one guardian-approved action) → old key invalid; nothing re-signed needs re-upload (records are content-addressed).
- **Leaving Plajah:** migrate PDS (CAR export/import) + re-point DID + reassign Plajah's guardian share to another party. Identity, work, and recovery all leave together.
- **Power-user mode:** export a recovery secret / pair a hardware key as an additional guardian; opt out of Plajah as guardian.

## 5. Threat model (must survive each)

| Threat | Mitigation |
|---|---|
| Phishing for login | Passkeys/WebAuthn are origin-bound, phishing-resistant |
| Plajah breach | Plajah holds ≤1 share; can't recover/seize alone |
| Plajah coercion / subpoena | Same — single share is useless; creator can exclude Plajah |
| Plajah shutdown | Identity + repo + recovery are migratable; creator keeps M-of-N off-Plajah |
| Lost device | Other devices / guardians recover |
| Lost ALL devices | Guardian threshold recovers |
| Malicious guardian | Needs M, not 1; rotate them out |
| Guardian collusion (M of them) | Choose guardians accordingly; raise threshold; high-value creators use independent services |
| Stolen device | Passkey gated by biometric; revoke device key; rotate |
| Key-rotation race / replay | did:plc rotation log is signed + ordered; PLC directory enforces history |

## 6. What we explicitly do NOT do

- **No seed phrase as the primary path.** It's the self-custody cliff for normal users. (Available as an optional power-user escape hatch only.)
- **No Plajah-sole custody.** Ever.
- **No keys or PII on-chain.** Only repo Merkle-root hashes get timestamped (authorship proof). Recovery is off-chain.

## 7. Phased rollout

- **P1a:** passkey device auth + DID provisioning + signing key. (Usable, but recovery-incomplete — gate real launch on P1b.)
- **P1b:** social recovery (default 2-of-3 with Plajah as one share) + device add/revoke + key rotation. **This is the launch gate.**
- **P1c:** MPC/SSS escape hatch + power-user policies (3-of-5, independent guardians, hardware keys) + guardian-share migration off Plajah.

## 8. Open decisions (need your call before P1)

1. **Share mechanism for v1:** social recovery only, or social + MPC from day one?
2. **Default threshold:** 2-of-3 (proposed) vs 3-of-5.
3. **Plajah's guardian role default:** always-on by default (opt-out) vs opt-in only.
4. **Independent recovery partners:** do we recruit third-party guardian services early (stronger decentralization story) or add later?
5. **Hardware-key support** in v1, or P1c?

---

### One-line summary
**Daily life is passkeys; control is M-of-N threshold rotation keys where Plajah is one voice, never the deciding one — so creators can't be locked out, and can't be captured.**
