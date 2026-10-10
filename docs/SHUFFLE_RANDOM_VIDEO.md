# Shuffle — Omegle-style random 1:1 video (18+)

Owner request (2026-10-10): an Omegle-style function on Plajah, using Rooms. Built on Rooms' real-time
engine (rtcCore `mesh`), opened from **Start a Room → "Or meet someone new · Shuffle 18+"** or anywhere
with `window.dispatchEvent(new CustomEvent('plajah:open-shuffle'))`.

## Flow

Age + house-rules gate → lobby (up to 5 interests, optional "only match on shared interests") →
searching → connecting → live call → Next / Report / Leave. If the stranger leaves or never connects
(15 s), it moves on to the next person automatically.

## Safety (Omegle closed over abuse, so these ship on day one)

| Rail | How |
|---|---|
| 18+ only | First date of birth is stored in `shuffle_profiles/{uid}` (server-only) and **locked**; minor-flagged accounts (`isChild`, `CHILD`, `STUDENT`, school-provisioned) never enter. Self-attested — real ID/age-estimation is an open owner decision. |
| Consent to be seen | The stranger's video is **blurred until both tap Reveal** (either can blur again). |
| Report | One tap with a reason: ends the call, Plajah-blocks them, writes `content_reports` (staff queue; "looks under 18" goes to the child-safety review queue at URGENT), and the pair is **never matched again** (`shuffle_pairs`). |
| No re-meet spam | 6 h cooldown on meeting the same person; 40 matches / 10 min cap. |
| Fair Process | Standing restrictions pause Shuffle with the reason and the appeal path — the rest of Plajah keeps working. Never a hard lockout. |
| Privacy | Plajah doesn't record Shuffle calls. The session id is random and only given to the two matched users; peers are limited to the matched uid. |

## Architecture

* **Matchmaking is server-only** (`services/shuffle/shuffleServer.ts`, routes `/api/shuffle/*`), Admin
  REST, so **no Firestore rules deploy is needed** (the new collections are default-deny for clients).
  Lock-free across Cloud Run instances with `updateTime` preconditions; a waiter only claims newer
  waiters and locks its own entry first, so two people are never double-matched. Clients poll every
  1.5 s (scan every ~4.5 s).
* **Media**: `rtc_sessions/shuffle_<random>` mesh — allowed by both the live rules and the repo rules.
  TURN comes from `/api/rtc/ice` when configured (needed for many mobile networks).
* Pure rules + tests: `services/shuffle/shuffleCore.ts`, `npx tsx --test tests/shuffle.test.ts`.
* UI: `components/shuffle/ShuffleView.tsx`. Lab (mocked API): `npx vite --config shuffle-lab.vite.config.mjs`
  → `http://127.0.0.1:3113/shuffle-lab.html` (`?attested=1` skips the gate).

## Not done / owner decisions

* Not tested with two real signed-in devices yet (the call screen is only exercised by code, not a live pair).
* Real age verification (Yoti / Persona / ID) — today it's a locked self-attestation + account flags.
* Proactive nudity detection on the live video (on-device classifier that auto-blurs) — not built.
* Scale: the queue is read with a plain list (≤200 waiting). Fine early; needs a query/index or a
  dedicated matcher past that.
* Text-only mode: the server accepts `mode:'text'`, the UI is video-only for now.
