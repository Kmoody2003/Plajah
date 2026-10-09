# Plajah Social: Safety, Reliability, Bots & Growth — Assessment (2026-10-08)

Written after Kenne was locked out of X for a reason that was never explained. That experience is
the design brief: **Plajah must be the place where safety is real and fairness is real at the same
time.** Most platforms get one. X gets neither — opaque lockouts *and* a spam/bot problem.

This document is the honest state of the code as audited today (four parallel audits, file:line
evidence in each section), what was fixed in this pass, and the plan.

---

## 1. Headline verdict

| Area | State before this pass | Severity |
|---|---|---|
| Illegal content (CSAM) | **No detection, no reporting, no evidence preservation.** Admin "Remove" hard-deleted the doc and left the media publicly readable. | Critical |
| Media moderation | **Nothing scans images, video, audio, avatars, or live.** Only post *text* is screened, in the browser, fail-open, bypassable. | Critical |
| Enforcement | Suspensions are written but **nothing enforces them**. No user notice, no appeals. | High |
| Child accounts | A child account could set `isChild:false` on itself (rules don't lock the field). | Critical |
| Storage | Anyone signed in could **overwrite another creator's album art / film / live recording**; DM media was world-readable. | Critical |
| Open relays | `/api/push` let anyone push any text to every device (tokens are on public profiles). `/api/email/broadcast` let guests email 500 addresses from our domain. | Critical — **fixed this pass** |
| Bots | App Check not enforced (server verifier dead code + missing aud/iss check), no email verification, no disposable-email block, rate limits client-side or per-instance, counters forgeable. | High |
| Security ops | The "CSO / Threat Protection" dashboard shows **simulated data** (hard-coded seeds, `Math.random` risk). | High (false confidence) |
| Live Talk (Spaces) | **Broken for everyone but the host**: chat denied by rules, raise-hand denied, leave never removes anyone, dead talks stay "Live". | High |
| Watch / Listen / Read parties | Happy path works. Host leaving orphans the party; guests never learn it ended; party docs leaked paid video URLs; no chat/reactions. | Medium-High |
| Rooms / Presence | Ghost members; anyone could hijack or kill shared sports rooms; "Right Now" feed always empty (no rule). | Medium |
| Feed / posting / discovery | Genuinely strong: paginated For You + Following, quote/repost, drafts, scheduling, Community Notes, "why this post". | Good |
| DMs | Feature-rich but load **entire history** per room; not end-to-end encrypted (at-rest obfuscation only). | Medium |

The good news: the *social product* (feed, posting, clubs, emotes, fediverse bridge) is ahead of
where most startups are. The gaps are in the **trust layer underneath it** — and that layer is
exactly what being locked out of X made you care about.

---

## 2. Keeping illegal & grotesque content off — without flagging creative work

### Free / low-cost services (verified 2026-10-08; eligibility terms change — confirm when applying)

| Service | What it catches | Cost | Notes |
|---|---|---|---|
| **Microsoft PhotoDNA Cloud Service** | *Known* CSAM (perceptual hash vs NCMEC/industry lists) | Free for qualified orgs, vetted | Images only. Microsoft does not retain images. **Apply first.** |
| **Google Content Safety API** | *Novel* CSAM (classifier → review priority) | Free for qualifying companies | A human must still review before action. |
| **Google CSAI Match** | Known CSAM in **video** | Free for qualifying partners | Fingerprint + API. |
| **NCMEC ESP registration + CyberTipline API** | Legal reporting channel | Free | Required: 18 USC 2258A duty to report apparent CSAM once known; REPORT Act (2024) → preserve 1 year. |
| **OpenAI moderation (`omni-moderation-latest`)** | Graphic violence, sexual, self-harm (images + text); sexual/minors is **text-only** | Free | Good first-pass gore/sexual signal. Never the only CSAM control. |
| **Gemini (already in our stack)** | Context: is this fiction, art, SFX, medical, educational — or real harm? | Existing key | The "don't flag art" layer. |
| Meta **PDQ / TMK+PDQF** | Open-source perceptual hashing | Free | Needs a hash list to match against (from the programs above). |
| Thorn **Safer** / Hive | Hash + classifier, enterprise | Paid | Gold standard if/when budget exists. |
| Cloudflare CSAM Scanning Tool | Known CSAM at the CDN | Free | Only scans what's served *through Cloudflare* — our media is on Firebase/Mux, so not a fit without moving delivery. |

### The "don't flag creative work" rule (built into `services/safety/safetyPolicy.ts`)

1. **Only two things auto-block:** a positive hash match, or two independent signals agreeing on
   sexualized minors. Those go to the CSAM path (block → private quarantine → preserve → report).
2. **A single classifier score never removes art.** Fictional/artistic graphic content (horror
   art, film SFX, anatomy, figure drawing) gets a **label + tap-to-reveal blur**, chosen by the
   viewer. Real-world extreme gore → human review.
3. **Uncertain = allow + queue for a human**, not removal.
4. Creators can self-label (mature, horror, medical) and self-labeled work is never penalized for
   being what it says it is.

### What we owe legally (US)
- Report apparent CSAM to NCMEC's CyberTipline once we have actual knowledge (18 USC 2258A).
- Preserve the report contents and associated data for **1 year** (REPORT Act 2024).
- Never let staff browse the material; admin tools show **metadata + blurred placeholder only**.
- Never hard-delete evidence (the old "Remove" button did exactly that — now soft-remove).

---

## 3. The Fair Process policy (new, owner-mandated)

> **We never lock you out 100%.** If your account is under review, you can still sign in, read,
> and talk to people privately. You'll always know exactly what we think you did, which rule, what
> is limited, and for how long — and you can fix it or contest it.

Graduated ladder (`services/enforcement/standingCore.ts`):

| Level | What's limited | Always still available |
|---|---|---|
| Good standing | nothing | — |
| Limited reach | posts shown less in For You | everything else |
| Restricted public | no new public posts/comments | DMs, chat, reading, appeals |
| Restricted media | no uploads / going live | text posting, DMs, appeals |
| **Criminal review** (serious) | DMs **text-only, rate-limited, existing threads only, never to minor accounts**; no uploads/live/public posting | sign-in, reading, **appeal** |

Every action carries: the content, the rule (quoted), the restriction, the expiry. The user gets
two buttons — **Fix it** (edit/remove/relabel → fast-track restore) and **Appeal** (their own
statement + evidence). Anything above "limited reach" must be decided on appeal by a **different
human** than the one who issued it. Appeals show a status timeline and an SLA target.

**One honest exception:** confirmed CSAM. The law requires reporting and preservation; the content
is never restored and details may be withheld at law enforcement's request. The appeal still
exists. Messaging stays in the most restricted tier — child safety outranks access, and that is
the one place we will not compromise.

Why this is a growth feature, not just a policy: "you can't get silently locked out here" is a
sentence people will repeat to their friends after their own X/Instagram lockout. Put it on the
landing page.

---

## 4. Making bots unable to thrive (invisible to humans)

Principle: **real people should never see a CAPTCHA; bots should hit a wall at every step.**

Layers, cheapest-for-humans first:
1. **Attestation** — Firebase App Check with reCAPTCHA Enterprise (invisible score) on web, Play
   Integrity on Android/TV, on *every* `/api` call; server verifies aud/iss. Monitor mode first,
   then enforce. (Server verifier fixed; was dead code.)
2. **Signup** — verify email (nudge, not a wall), block disposable domains, per-IP/ASN velocity,
   Identity Platform `beforeCreate` blocking function for the real enforcement point.
3. **Trust tiers** (`services/trust/trustCore.ts`) — NEW → BASIC → TRUSTED → VERIFIED_CREATOR.
   New accounts can read, post, and chat normally; what's capped is the bot playbook: links per
   post, DMs to strangers, mass mentions, mass follows, group creation. Real people graduate in
   days without noticing.
4. **Server-side rate limits** shared across Cloud Run instances (per-uid, not per-IP), rules-side
   counters for posts/comments/DMs/follows/reports.
5. **Unforgeable counters** — follower/like counts bound to real edges (were ±1-able by anyone).
6. **Behavior signals** → the Warden agent (below): signup bursts, follow churn, duplicate content
   across accounts, report spikes.
7. **Edge** — Cloud Armor (adaptive protection + bot management), `--max-instances`, budget alerts.

---

## 5. Security & IT Council

Replaces the simulated CSO dashboard with agents fed by **real** signals (`security_events`,
`errorReports`, `content_reports`, `csam_cases` metadata, `enforcement_actions`, health probes,
CI audit results). Each agent does cheap deterministic checks every 15 min and only calls an LLM
when something crosses a threshold; a daily Council Brief synthesizes everything.

| Agent | Charter |
|---|---|
| **Sentinel** | Threats: auth anomalies, App Check failures, credential stuffing, unusual admin actions |
| **Warden** | Bots & abuse: signup velocity, spam bursts, follow churn, 429 storms |
| **Guardian** | Child safety & illegal content pipeline health + report SLAs (metadata only, never media) |
| **Medic** | Platform health: error rates by component, endpoint latency, permission-denied clusters |
| **Auditor** | Dependencies, secrets, CodeQL findings → proposed upgrades |
| **Steward** | Efficiency & reliability: unbounded listeners, slow endpoints, bundle regressions → concrete fix proposals |

Guardrails: agents **propose**, they don't change production. The only automatic actions are
reversible, short-lived (≤1h), logged mitigations with an undo (e.g. tighten a rate limit for one
abusive key). They can never lock a human out — that would violate Fair Process.

---

## 6. Live Talk, Watch-Along, Listening Parties — status & fixes

**Live Talk** was broken beyond the host (chat parent doc never created + rules mismatch; raise-hand
and leave both denied; ghost speakers; dead talks stay listed; missing index; any listener could
rewrite the speaker list; `rtc_sessions` world-writable; stale WebRTC signals auto-muting speakers
on rejoin; 256 kbps audio per listener connection; shared public TURN relay in production).
Fix in progress: members subcollection with real roles (host/co-host/speaker/listener), working
chat + reactions, raise/lower hand, kick/remove-from-stage/block/report, host handoff, heartbeat +
auto-end, per-join nonce + ICE restart, 48 kbps voice, short-lived TURN credentials from the server.
Scale ceiling on P2P is ~25 listeners — **an SFU (LiveKit or Cloudflare Realtime) is required for
real Spaces-scale audiences**; that's the single biggest infrastructure decision for live social.

**Parties**: host heartbeat + "host reconnecting" + ended state, co-host / pass-the-remote,
per-guest entitlement (no more URLs on public party docs), rate-nudged drift correction, EPUB
sync, YouTube support or honest hiding, party chat + reactions + viewer avatars + invite friends +
public "watch with others now" discovery.

**Rooms / Presence**: heartbeat-based membership, shared sports rooms can't be hijacked/ended,
polls one-vote-per-user, server-clock staleness, TTL cleanup, and the missing `now_active` rule.

All of this needs a **real two-device test** before it's called done. Nothing here has been
exercised by two live authenticated clients yet.

---

## 7. Fast & reliable — the performance list

1. DMs: `listenToMessages` loads entire history → `limitToLast(60)` + load earlier.
2. Chat room list opened twice, unlimited → one shared, limited subscription.
3. Notifications / club chat / club posts queries had **no orderBy** → arbitrary results past the
   limit (users "lose" new messages). Fixed + indexes.
4. Typing indicator rewrote the room doc → every participant's list re-rendered per keystroke.
5. Push/notification fan-out ran in the sender's browser and read recipients' device tokens →
   moved server-side (privacy + speed).
6. Missing composite indexes (chat rooms, live talks, genre feed) → silent empty lists.
7. Poll votes stored as uid arrays in the post doc (1 MB cap, public voter lists) → next pass.

---

## 8. Why people would move their conversations to Plajah — genuine mechanics we already have

Ranked by pull, all real in code:

1. **One inbox for the open social web.** Read and reply to Bluesky, Mastodon and Threads, cross-
   post, even Bluesky DMs — from Plajah. You don't have to abandon your audience to come here.
   *+ new:* "Find your people" imports your Bluesky/Mastodon follows and matches them to Plajah.
2. **Fair Process.** No silent lockouts, ever; always a way to fix or contest. Nobody else offers it.
3. **Conversation attached to the thing itself.** Watch-along, listen-along, read-along parties
   where everyone plays their *own* full-quality copy in sync, with chat and reactions. X Spaces
   is audio only; Teleparty is a browser extension. Ours is native across video, music and books.
4. **Chorus emotes + Crowd Light.** Crowd reactions that evolve as more people join, drive the
   creator's real smart lights, and can be burned into the stream. Live becomes a shared
   physical moment.
5. **Clubs = Discord channels + paid memberships + the creator's actual catalog** in one place.
6. **Protected (Source Mode) threads** with real client-side crypto + content-free push, and
   **burn-after-seen / Intimate Mode** DMs.
7. **Guardian CC** — families and schools can bring kids into a social space that is designed for it.
8. **Open ranking**: user-tunable feed, "why this post", Community Notes scored across viewpoints.
9. **Rich invite cards** for clubs, rooms, talks, parties, live streams (being added) — the link
   you paste into X/iMessage/Discord *previews as a live room with people in it*.
10. **Live Talk recordings auto-publish as podcasts** — every conversation becomes content.

What to add next to compound it:
- **"Bring your circle" invites** with personal links that auto-follow both ways (in progress).
- **Spaces-scale Live Talk on an SFU** + scheduled talks with reminders.
- **Creator-run "town squares"**: persistent per-creator rooms that light up when they're live.
- **Portable identity** (ATProto/ActivityPub publishing *from* Plajah, not just reading) so leaving
  is free — which is precisely why people stay.
- Landing page line: *"Your account can't vanish overnight here. That's a promise."*

---

## 9. What was done in this pass vs pending

Done directly (lead session): `/api/push` now auth + server-resolved recipient + real sender +
per-uid limit + server token pruning; `/api/email/broadcast` registered-only + daily quota + text-
only for non-admins + sender attribution; `/api/social-import/follow-batch` validated + capped.

In flight (parallel agents, see each agent's doc): content-safety pipeline
(`docs/CONTENT_SAFETY_PIPELINE.md`), Fair Process enforcement + appeals
(`docs/FAIR_PROCESS_POLICY.md`), anti-bot (`docs/ANTI_BOT_PLAYBOOK.md`), Security & IT Council
(`docs/SECURITY_IT_COUNCIL.md`), storage + child-safety rules, Live Talk (`docs/LIVE_TALK.md`),
parties/rooms/presence (`docs/WATCH_LISTEN_READ_PARTIES.md`), social perf + migration
(`docs/SOCIAL_MIGRATION_AND_PERF.md`).

**Blocking structural issue:** the repo `firestore.rules` is ~280 KB — over Firebase's 256 KiB
limit — so it cannot be deployed, and production runs an older, different ruleset. Every rules fix
from this pass is also written as a snippet under `docs/rules-patches/` for application to the live
ruleset. Splitting/pruning the rules file is the prerequisite to shipping most of the safety work
and should be the next dedicated task.

Owner actions needed: apply for PhotoDNA + Google child-safety tools; register Plajah with NCMEC as
an ESP; set `OPENAI_API_KEY` (moderation), TURN provider keys, reCAPTCHA Enterprise site key;
decide on an SFU for Live Talk.
