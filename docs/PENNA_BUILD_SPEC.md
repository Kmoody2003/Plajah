# Penna — Handwriting Workshop · Phase-1 Build Spec

**What it is.** An Academia experience that teaches letter formation (Pre-K and up) with pen/ink,
tracing, and a real stroke-scoring engine. Correct **form** is the reward: a picture paints in as the
child writes, and — the flagship **Story Mode** — handwriting the words of a public-domain fable
illustrates its pages. Grounded in the handwriting/reading-circuit research (James, Berninger) and
the Handwriting Without Tears developmental sequence.

Concept pitch (artifact): the "Penna" deck. Interactive engine demo (artifact): "Penna Form Engine".

**Core design rule (non-negotiable):** every celebration/point/reveal is bound to a **form-correct**
event — never to finishing or speed. Reward the wrong variable and the game teaches speed-scribbling.

---

## Status — what already exists in the tree

| Piece | File | State |
|---|---|---|
| Stroke-scoring engine (pure, deterministic) | `services/handwritingFormEngine.ts` | ✅ built + tested |
| Letter models (pre-writing → caps → lowercase) | `data/handwritingLetters.ts` | ✅ built |
| Engine test suite (14 cases, `node:test`) | `tests/handwritingFormEngine.test.ts` | ✅ 14/14 pass |
| Progress + points persistence | `services/handwritingProgressService.ts` | ✅ built (mirrors `readingQuestService`) |
| Full-screen React view | `components/HandwritingWorkshopView.tsx` | ⬜ TODO (this spec) |
| Wiring (route + tiles) | `types.ts`, `App.tsx`, `AcademiaHomeView.tsx`, `AcademiaModules.tsx` | ⬜ TODO |
| Firestore rule | `firestore.rules` | ⬜ TODO |
| Story Mode (fables + reveal) | `data/handwritingStories.ts`, view mode | ⬜ Phase 2 (design below) |

Run the engine tests: `npx tsx --test tests/handwritingFormEngine.test.ts`

---

## The engine (reference)

Everything scores in a normalized **100 × 140** box (guide: cap `y=15`, mid `y=75`, baseline `y=125`),
so it's resolution-independent. The view converts captured pointer coords → normalized before calling
`scoreStroke`.

```ts
import { scoreStroke, toleranceFor, DEFAULT_STRICTNESS, type Pt, type LetterModel } from '../services/handwritingFormEngine';
import { HANDWRITING_LETTERS } from '../data/handwritingLetters';

const res = scoreStroke(userPointsNormalized, letter, strokeIndex, strictness);
// res: { pass, startOk, directionOk, sequenceOk, corridorOk, score, reversed, deviation, startError, endError }
```

Four graded checks → coaching copy:

| Check | Fails when | Coaching |
|---|---|---|
| `startOk` | began far from the stroke's start dot | "Start right on the red dot — at the top." |
| `directionOk` | drew the stroke backwards (`reversed`) | "Go the other way — follow the arrow." |
| `sequenceOk` | started a later stroke out of order | "Start with the glowing stroke first." |
| `corridorOk` | wandered outside the letter's path | "Close! Try to stay inside the line." |

Strictness is age-banded (`DEFAULT_STRICTNESS`: early 0.28 / middle 0.52 / senior 0.74). This dial is
the product decision — tune against real children's strokes (see Open questions).

---

## The view — `components/HandwritingWorkshopView.tsx`

Signature (Academia convention): `const HandwritingWorkshopView: React.FC<{ onBack?: () => void; user?: … }>`
returning `<div className="min-h-full bg-[#0a0a0f] text-white">`. Back → `setView('ACADEMIA_HOME')`.

**Pen surface.** Reuse the pressure-capture pattern from `components/ComicDrawCanvas.tsx`
(`PointerEvent.pressure`, quadratic smoothing, `onPointerDown/Move/Up`). Trim to a single active
layer. Use `getCoalescedEvents()` for smooth high-rate stylus input. `pointerType` distinguishes
pen / touch / mouse (see device tiers in the pitch). `touch-action: none` on the canvas.

**Rendering per frame:** ruled guide → ghost scaffold for remaining strokes → current-stroke
highlight + red start dot + direction arrow → accepted user ink → live ink. (The "Penna Form Engine"
artifact is the reference implementation of all of this — port its `render()`, capture handlers and
reveal logic; it and the repo engine share the same scoring math.)

**Scaffold fading** (Pre-K → older): `corridor` (thick ghost) → `dotted` → `faded` → `blank`.
Drive the default off `ageTokensFor(profile).band`.

**Age + kids adaptation.** Consume `ageTokensFor(profile)` from `data/ageScaling.ts` (`tapMin` 56px
targets, `playful`, emoji greeting, `heroClass`) for the `early` band. Call
`isChildAccount(profile)` / `resolveControls(profile)` from `services/contentSafety.ts` to adapt.
`KidsSessionGuard` at app root already enforces screen-time.

**On stroke end:** call `scoreStroke`. If `pass` → keep the ink, advance `strokeIndex`, reveal the
next reward piece, and on last stroke fire the celebration + `awardHandwritingPoints(uid,'letter',key)`
+ update mastery via `saveHandwritingProgress`. If not `pass` → flash the attempt red, clear it, show
the coaching line (in Aria's voice), let them retry.

**Reward mechanic (Phase 1):** paint-a-picture — one illustration piece per correct stroke; confetti
on letter complete (respect `prefers-reduced-motion`).

---

## Wiring (the 8-step Academia recipe)

1. **`types.ts`** (~line 2827, the `AppView` union): add `| 'HANDWRITING_WORKSHOP'`.
2. **`App.tsx`** (~line 220): `const HandwritingWorkshopView = retryLazy(() => import('./components/HandwritingWorkshopView'));`
3. **`App.tsx`** (~line 4620, the conditional chain), inside `<Suspense>`:
   ```tsx
   {view === 'HANDWRITING_WORKSHOP' && (
     <HandwritingWorkshopView onBack={() => setView('ACADEMIA_HOME')} user={user} />
   )}
   ```
4. **`components/AcademiaHomeView.tsx`** `TILES` (~line 26): add
   `{ key:'penna', label:'Penna', desc:'Handwriting workshop, PreK →', icon: PenLine, view:'HANDWRITING_WORKSHOP', accent:'#C9871F', roles:['teacher','parent','student'] }`.
5. **`components/AcademiaModules.tsx`** (~line 19): add the parallel module entry (same `view`).
6. **`services/handwritingProgressService.ts`** — done; call from the view.
7. **`firestore.rules`**: add a `handwritingProgress/{uid}` rule (owner read/write), mirroring the
   `readingProgress` rule.
8. **Verify:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (compare against the ~75-error
   baseline — don't expect zero), then Browser-pane `preview_start` name `"plajah"`.

**Cross-subject spine:** on mastery gains, also call `learningLedgerService.appendRecord(...)` with a
handwriting framework/standard so Penna shows in the Learner Ledger alongside Reading/Science Quest
(confirm the `appendRecord` input shape in `services/learningLedgerService.ts` before wiring).

---

## Story Mode (flagship, Phase 2)

Write the words of a public-domain story; each correctly-written word paints in part of that page's
illustration; finishing the book mints a badge + points.

- **`data/handwritingStories.ts`** — seed a few short Aesop fables (Project Gutenberg / PD text). Shape:
  `{ id, title, license:'PD', pages: [{ text, words: string[], illustration: IllustrationSpec }] }`.
  Each `word` maps to a reveal region of the page illustration.
- **Sourcing** rides the OER/licence spine already in the repo (`services/oerLicenseGate.ts`,
  `data/oerLibrary.ts`) — only PD/CC-BY(-SA) shows. This is the same wall the Academia Integrity work
  uses; reuse it, don't reinvent.
- **Word-level scoring:** run `scoreStroke` per letter of the word; a word "counts" when its letters
  all pass. (Phase-2 nicety: whole-word geometry rather than per-letter.)
- **Completion:** `awardHandwritingPoints(uid,'book',storyId)` + `booksCompleted.push(storyId)` +
  ledger record. The pitch frames a finished book as a visible, growing shelf.

---

## Open questions / risks

- **Tolerance tuning is the real work.** Age-band defaults are first guesses. Harden them on real
  dim/tilted/child strokes exactly how `worksheetReprintCore` was hardened. Consider a hidden
  parent/teacher "difficulty" override.
- **Left-handed + dysgraphia** supports are Phase 3 — don't bake right-handed assumptions into arrow
  hints now.
- **Multi-stroke shared starts** (e.g. `A`'s two legs share the apex) can't be sequenced by start
  point alone — the engine tolerates this; the view should highlight the single expected stroke so
  order is taught visually rather than enforced punitively.
- **`getCoalescedEvents`** isn't on every browser — guard it.

---

*Reference files to open first:* `components/ReadingQuestView.tsx`, `services/readingQuestService.ts`,
`components/ComicDrawCanvas.tsx`, `data/ageScaling.ts`, `components/AcademiaHomeView.tsx`,
`services/contentSafety.ts`, `docs/ACADEMIA_SESSION_HANDOFF.md`.
