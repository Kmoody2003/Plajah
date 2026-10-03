# Thesa — the Plajah stash (blueprint)

> Status: **scope only, no code.** Written 2026-10-02. Name: Thesa.
> Inspired by Deepstash-style idea cards, but native: every card is tied to real
> Plajah content, some cards are *things you do* (breathe, sketch, play a 15-second
> word game), and the wellness half is wired into Ora.

## 1. Name

**Thesa** — locked 2026-10-02. From Greek *thesauros*, "treasure store" (the root of
"thesaurus"): where you keep what's worth keeping, and a nod to the word games.
Same soft Latinate register as Chora, Tela, Lorea, Ora, Vela.
(Considered: Arca, Florae, Lumi.) Trademark check still advisable.

Vocabulary: *card* = anything in the feed slot. Two families — **Ideas** (read it,
stash it) and **Moments** (do it, 15–45 seconds). *Your Thesa* = your saved cards.

## 2. What exists today (verified in code)

| Piece | Where | State |
|---|---|---|
| History figure card | `components/HistoryMomentPulseCard.tsx`, injected in `FeedView.tsx` (~3407, ~3462) | read-only, rotates, can't save |
| Factoids | `data/eduFactoids.ts` (16 one-liners) → `EducationRail`, `GlobalArchiveHero` | read-only, hardcoded |
| Feed ranking | `services/feedScoreEngine.ts` — deep/medium/base actions, `computeActionQuality` | extensible |
| Breathwork | `components/ora/Stillness.tsx` — 4 patterns, wall-clock timing, logs `OraSession` | `PATTERNS` is file-local, min duration 1 min |
| Ora sessions | `OraSession.kind: 'BREATH'|'STILL'|'REST'|'FOCUS'`, actual seconds, feeds `ora.minutes` adapter | live, owner-only rules |
| Tela | `components/tela/*` — Vector (pen/shapes), Image (raster layers), Studio posture, `TelaEmbed` (follow-latest / pinned) | built; **`TelaEmbed` is not yet wired into FeedView/PostCard** |
| Inking | `components/notes/InkLayer.tsx` + `services/inkMath.ts` (pen/pencil/highlighter, pressure, palm rejection, eraser, lasso; emits Tela Vector PATH objects) inside Notes Studio | pure web Pointer Events (works in WebView2/Android/iPad); **untracked on master, reachable only via Notes** |

Two consequences: (a) Thesa is the natural *first consumer* of Tela-in-feed, which
was already the stated next step for Tela; (b) the Stillness engine needs a small
extraction (export patterns, allow 30 s) before a feed card can reuse it.

## 3. Card model

One registry, one contract, so a new card type is a file, not a feature.

```ts
type ThesaFamily = 'IDEA' | 'MOMENT';
type ThesaKind =
  | 'FACT' | 'PRINCIPLE' | 'TECHNIQUE'            // IDEA
  | 'BREATH' | 'SKETCH' | 'WORDPLAY';             // MOMENT (+ 'CHECKIN' later)

interface ThesaCard {
  id: string;
  family: ThesaFamily;
  kind: ThesaKind;
  topic: string;                 // 'music' | 'film' | 'history' | 'wellbeing' ...
  payload: Record<string, unknown>;   // kind-specific, validated per kind
  source: { service: string; refId?: string; label: string };  // "Taleo · Film History"
  deeper?: { view: string; params?: Record<string, string> };  // deep link
  durationSec?: number;          // MOMENT only
  wellness: boolean;             // true => special ranking/ad rules (§7)
  status: 'DRAFT' | 'REVIEW' | 'LIVE';
  authorUid?: string;            // creator-attached ideas
}
```

**Moment contract:** tap-to-begin (never autoplay, never hijack scroll) → card
expands to a focus sheet (**portal to `document.body`** — transformed ancestors
re-anchor `position:fixed`) → runs on a **wall-clock timer, not rAF** (Ora lesson:
background tabs stretch frame counters) → resolves back into the feed.
A run records *actual seconds*, ignores anything under 5 s, and a hidden tab pauses
the run instead of counting. Reduced-motion and mute-by-default are required.

## 4. The Moments

### 4.1 Breathe (30 s)
Reuses the Stillness phase engine (extract `PATTERNS` + the wall-clock runner into a
shared module; add a 30 s duration — today's floor is 1 min). Pattern chosen by time
of day or pinned by the user.

**Default: breath cards are purely for the person in that moment and connect to
nothing** — no `OraSession`, no minutes, no streak, no run record, no feed signal;
nothing is persisted. **Opt-in (decided 2026-10-02):** a setting, off by default and
clearly explained, lets the user choose to log breath Moments to Ora (`OraSession
kind:'BREATH'`, feeding `ora.minutes`). Only the user's own Ora record is written —
never ranking, ads, or anything outside Ora. Opt-in is per-user and reversible.

### 4.2 Sketch (30–45 s)
A prompt ("draw your morning as weather", "sketch the idea on this card"). Needs a
small freehand surface — Tela's Vector device has pen/shape tools but no
pressure-aware freehand. Add a **Sketch surface** emitting Tela Vector path
objects (Catmull-Rom smoothing, pressure → width, 6 brushes, 3 layers, undo,
palette from the card's topic). Finish → saves as a real Tela doc (reference, never
export) → optional "post to feed" renders it via `TelaEmbed`. Prompt library is
authored; Aria can also generate prompts from a stashed Idea ("sketch this in 30 s")
with Museion art references. Sketches are private until the user shares.

### 4.3 Wordplay (15 s / 30 s)
Small deterministic games on offline word lists: unscramble, **cloze** (fill the
missing word from an Idea you stashed — this doubles as retrieval practice),
word ladder, rhyme chain, category blitz. **Daily seed** so everyone gets the same
puzzle and results can share as a card without spoilers. Later: guess-the-year
(history/film), name-that-instrument (Chora).

## 5. Ora integration

Breath Moments are **isolated by default**; logging to Ora is user opt-in (§4.1). The rest of the link is light:

- Stash a Principle/Technique → one tap **Send to Commonplace** (built on
  `notebookService`; do not add a parallel notes store).
- Sketches → one tap into Horizon / Longhand.
- A 5-second **Tides** mood check-in may appear as a `CHECKIN` Moment *only* as a
  shortcut into Ora's own Tides (which stores it there, owner-only), never in Thesa.
- Quiet Hours can suppress Moments entirely; wellness cards appear only if the user
  has opted into Ora; time-of-day suggestions come from the clock, never inferred mood.
- Non-wellness Moments (Sketch, Wordplay) may count toward an `thesa.moments` goal
  source; breath counts toward Ora minutes only if the user opted in (§4.1).

## 6. Data (Firestore)

| Collection | Access | Notes |
|---|---|---|
| `thesaCards` | public read when `LIVE`; author create DRAFT/SUBMITTED only; approval admin | mirrors the `oraRestLoops` pattern — no self-approval |
| `users/{uid}/thesa_stash` | owner-only | saved card ids, annotation, collection ids |
| `users/{uid}/thesa_runs` | owner-only, **no admin escape hatch** | Sketch/Wordplay results only; breath goes to `ora_sessions` only if the user opted in |
| `thesaCollections` | owner write; public read if `visibility:'PUBLIC'` | |

Gotchas to bake in: no `undefined` field writes; `where`+`orderBy` needs a
composite index; deploy rules with `firebase deploy --only firestore`; the client
must keep guest/offline behaviour (local fallback like `notebookService`).

## 7. Rules that must not be broken

1. **Wellness cards don't train the feed (CONFIRMED 2026-10-02).** Ora's non-negotiable is that wellbeing
   data never reaches ad/recommendation/feed/search signals. So `wellness:true`
   cards are ranked by clock + explicit opt-in only; completion and skip are **not**
   fed to `feedScoreEngine`. (Needs your confirmation — it costs some personalisation.)
2. **No ad adjacency** for wellness cards: no sponsored card within N slots, and
   never in the ad-rail aside.
3. **No clinical claims** on any breath/mood copy; no streak shame, no penalty for skipping.
4. **Sharing is an act, not a default**: only a sketch or a puzzle score can leave
   the user's Thesa, and only when they choose. Never mood, never raw run history.
5. **Minors / kids-mode**: sharing off, sketch uploads private, Moments stay local to
   the family-account policy (COPPA/guardian-CC decided before Phase 2 ships).
6. Shared sketches pass the existing `contentSafety` filter.
7. Photosensitivity: any animated card meets the same spec as the Pixels meditation shaders.

## 8. Feed integration

New card slot in `FeedView` alongside `HistoryMomentPulseCard` (which becomes one
renderer of `FACT`/figure cards rather than a separate system).
`feedScoreEngine` gains actions: **stash** (deep), **complete Moment** (medium),
**skip / less-like-this** (negative) — for non-wellness cards only (§7.1).
Spacing rule: at most one Moment per N posts; never two in a row.

## 9. Content sourcing

1. **Curated** — adapters (not rewrites) from `eduFactoids`, `musicHistory`,
   `filmMuseum`, `worldHistoryData`, curricula → `ThesaCard`.
2. **Extracted** — Aria drafts Ideas from Lorea chapters, transcripts, Taleo essays;
   always cites source; review queue before `LIVE`. Single persona rule: Aria only.
3. **Creator-attached** — creators add Ideas to their own releases; drives traffic to them.
4. **Community** — submit + upvote, later.

## 10. Phases

| # | Ships | Depends on |
|---|---|---|
| 0 | `ThesaCard` schema + registry, adapters from factoids/history, feed card, stash + personal Thesa view, rules | — |
| 1 | Moments: Breath (extract Stillness engine, add 30 s), Wordplay ×3, run logging, `ora.minutes` + `thesa.moments` adapters | Stillness extraction |
| 2 | Sketch surface → Tela doc → `TelaEmbed` in feed (first Tela-in-feed consumer) | Tela P3 feed wiring |
| 3 | Collections, annotate-and-post, deep links, ranking signals | 0 |
| 4 | Aria extraction + review queue, creator-attached ideas, spaced-repetition resurface + Education Ledger link, community | 0–3 |

## 11. Decisions

Resolved 2026-10-02:
1. Wellness/breath cards: no signals, no ad adjacency, **nothing stored by default**; user may opt in to log breath to their own Ora record.
2. Sketches private until the user posts.
3. **Kids-mode Moments ship at launch** (sharing off, sketches private, vetted
   content, guardian-CC policy settled first — launch blocker, not a later phase).
4. Moments live in the feed **and** a dedicated Thesa view (stash shelf + "give me a moment").

5. **Name: Thesa.**
