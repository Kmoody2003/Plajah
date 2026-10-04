# Telehealth — design sketch

Status: **demo built** (fictional patients only). The production design below is not built. Nothing here is legal advice;
the HIPAA programme items live in `docs/HIPAA_TECHNICAL_SAFEGUARDS.md`.

## 1. What exists today (the demo)

* Provider side: `components/clinic/TelehealthVisitRoom.tsx` — real camera/mic/screen share, waiting room, visit chat,
  the SOAP/anatomy/prescribe drawer, a one-click "patient preview" on the same device.
* Patient side: `?telehealth=<session>` → `TelehealthJoinPage` → `TelehealthPatientView` (demo notice → waiting room → call + chat).
* Engine: `services/clinic/telehealthCall.ts` wraps `rtcCore` (the platform's mesh WebRTC engine: perfect negotiation, VP9/Opus
  tuning, device switching, screen share). Same stack as video rooms and Live.
* Honest labels: the old "256-bit P2P Encrypted" badge was a claim about a simulation; it now reads "Demo · encrypted in transit"
  (WebRTC's DTLS-SRTP is real).

**Demo limits.** Signalling documents sit in the general `rtc_sessions` collection (publicly readable, random session id,
no patient data in them). Chat is ephemeral (data channel, never stored). The guest link needs Firebase **Anonymous sign-in**
enabled (today it returns `ADMIN_ONLY_OPERATION`); until then the patient window must be signed in to any Plajah account —
which works in the same browser profile ("Open patient view in a new window") or on a phone signed in to a test account.

## 2. Can the chat/video stack carry real visits?

Yes, the *engine* can. What has to change is everything around it, because a visit is PHI:

| Concern | Demo | Production |
|---|---|---|
| Media | WebRTC, DTLS-SRTP, P2P where possible | Same. Add a **BAA-covered TURN relay** (self-hosted coturn on Compute Engine under the Google BAA, or Twilio/Cloudflare TURN with a BAA). Public STUN is fine (no media). Remove the public-TURN fallback in `iceConfig.ts` for visits. |
| Signalling | `rtc_sessions` (public read) | Dedicated `visits` signalling in `plajah-phi` with rules: only the booked provider + the invited patient token may read/write; docs deleted at end of visit. SDP contains IPs, so treat as sensitive. |
| Patient identity | Anyone with the link | One-time, expiring link bound to the appointment (signed token); patient enters DOB/last-name check; no account required (token auth). |
| Chat | Ephemeral | Stored only in the clinic vault (encrypted, audited) if the clinic wants a chart copy; otherwise not stored. Never in `plajah-prod` chat collections. |
| Recording / transcripts | None | Off by default. If enabled: explicit consent screen for both sides, stored encrypted in the vault bucket, audit entry. No cloud speech-to-text unless a BAA-covered service or on-device. |
| AI scribe / translation | Demo text only | On-device models only, or a BAA-covered vendor. Nothing to the Gemini Developer API. |
| Audit | None | Visit start/end, who joined, duration, consent, screen-share, chat export → vault audit chain. |
| Waiting room | Shows "waiting" | Provider admits the patient; patient sees no one until admitted; nothing recorded in the waiting room. |
| Reliability | Best effort | Pre-visit device/network test, audio-only fallback, reconnect, a published support path. |
| Interstate/licensure, consent, emergency location | n/a | Operational: record patient's location at visit start; consent per state; emergency protocol. |

## 3. Visit flow (production)

1. Booking creates an appointment (vault record) and a **visit token** (random 128-bit, expires, single clinic+appointment).
2. Patient gets the link by SMS/email — the message contains **no clinical content** (only "Your visit with <clinic> at 3:30").
3. Patient opens the link: device check → consent + identity check → waiting room.
4. Provider sees "patient waiting", admits. Mesh call starts through the BAA relay.
5. In visit: video, chat, screen share, shared education visuals (3D anatomy), live SOAP drawer (provider only).
6. End: provider completes → call torn down, signalling docs deleted, audit entry, SOAP note stays in the vault, optional visit summary
   released to the patient.

## 4. Build order

1. **Now (done):** demo on real stack.
2. Platform audit week: enable Identity Platform + MFA; decide anonymous-auth vs token auth for patients.
3. Visit-token service (Cloud Run, in the BAA perimeter) + `visits` rules in `plajah-phi`.
4. BAA-covered TURN + remove public TURN for visits.
5. Vault-backed chat + audit entries.
6. Waiting-room admit flow, device test, reconnect.
7. Optional recording and on-device scribe.
8. Third-party review before the first real clinic.
