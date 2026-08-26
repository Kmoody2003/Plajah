# Knowledge Layer — Labs × Academia (decision record)

**Decided:** 2026-08-26 · **Status:** model settled, name open, refactor not started

## The question

Should Plajah Labs move inside Plajah Academia? They overlap heavily — Academia's
module cards and the Labs discipline grid open the same studios — and the overlap
reads as duplication.

## The decision

**No merge. Two layers with one direction of dependency.**

| Layer | What it is | Examples |
|---|---|---|
| **Collection** (today: Labs) | The corpus and the tools | 15 discipline studios, MuseumHall figures, ArtifactBrowser, simulators, live data, papers, Findings |
| **Delivery** (Academia) | Accountability and instruction | classes, rosters, assignments, the Learner Ledger, standards, grading |

**Academia consumes the collection. The collection stands alone.**

### Why not fold it in

1. **Audience.** The Architecture studio's ASCE-7 calculators and the Archaeology
   artifact browser serve a working architect or a curious adult. Behind a K-12
   portal, those users are told it isn't for them.
2. **Semantics.** Academia carries school machinery — FERPA/COPPA, Campus Silent
   Mode, the Integrity Wall, education-scoped chat, the Nibbles ban. The collection
   has none of that and must not inherit it.
3. **Reach.** The collection already feeds non-education surfaces: Learn chips
   deep-link from posts, Findings rides the general feed, AssetActions posts to the
   timeline. It is a horizontal layer, not a school module.

## The rules

1. **One renderer per studio.** A discipline studio is mounted in exactly one place.
   Every other surface links to it.
2. **Link, don't mount.** `AcademiaHubView` is the reference implementation — it
   takes an `onOpenModule` callback and delegates. Copy that shape.
3. **Context changes chrome, not content.** Entry carries an optional
   `{ classId, assignmentId }`. With it: an assignment bar, completion writes to the
   Learner Ledger. Without it: the public wing. Same component either way.
4. **Safety derives from the account, not the entry point.** A child gets kids-mode
   wherever they arrive from. Never gate on which nav item was tapped.
5. **One registry.** Discipline metadata has a single source of truth. Adding a
   discipline is one edit.

## Naming

"Plajah Labs" is a placeholder. It reads as an experiments/beta area (cf. Google
Labs) — actively confusing on a platform that ships experimental features — and it
underclaims: history, architecture, archaeology and combat are not labs. It is also
the only English utility word in a naming family of Chora, Lorea, Taleo, Melos,
Fabula, Tela, Ambo, Vela, Praxis.

Candidates: **Museion** (the Library of Alexandria's institution — research
institute + library + collection in one word; fits the Greek family) or **Lyceum**
(Aristotle's school and the 19th-c public-lecture movement; immediately legible).

**Open. Not blocking** — it is a display constant.

Two constraints when it lands:

- **Change display strings; keep code identifiers.** The `Labs*` component family
  (`LabsNotebook`, `LabsCitationManager`, `LabsFormulaEditor`, `LabsGrantTracker`,
  `LabsTeamSpaces`, `LabsDataVisualizer`) is shared infrastructure — `LabsNotebook`
  already serves Plajah Sports via a `context` prop. Renaming the code buys nothing.
- **Keep the `PLAJAH_LABS` AppView id.** Same trick that preserved deep links through
  `CLASSROOMS` → "Plajah Academia".

"Labs" survives as the name of the *simulate/experiment* tab inside a studio, which
is the one place it is accurate.

## Current state (2026-08-26)

**Five registries that must agree by hand:**

| Registry | File |
|---|---|
| `LabsDisciplineId`, `DISCIPLINE_CONFIG` | `services/labsApiService.ts:11,28` |
| `DISC_META` | `components/LabsDisciplineView.tsx:39` |
| `DISCIPLINES`, `DISC_ID_MAP` | `components/PlajahLabsView.tsx:64,117` |
| `DISCIPLINES` (comment: "mirrors labsApiService") | `components/ShareToPlajahComposer.tsx:23` |
| `SCIENCE_DISCIPLINES` | `data/scienceDisciplines/index.ts` |

Adding a discipline today is five edits. This is the root defect; the double-mount
is a symptom.

**Double mount:** `ClassroomsView.tsx:609–714` and `PlajahLabsView.tsx:150–192`
both render the same studios.

**Constraint:** `ClassroomModule.url` is Firestore-backed and admin-editable
(`fetchClassroomModules()` at `ClassroomsView.tsx:451`, admin input at `:1173`
with placeholder `e.g. SOLAR_SYSTEM`), with 12 hardcoded defaults injected
client-side. Teachers may already have rows pointing at these urls. Consolidation
must preserve the `url` → studio contract, not delete the branches.

**Kids-mode is view-level only:** `canOpen` (`hooks/useKidsMode.ts:59`) gates
AppView ids, so `PLAJAH_LABS` is all-or-nothing. `KIDS_DEFAULT_SURFACES:34`
whitelists it with the comment `// science modules` — written when Labs meant
science. It now also admits Architecture, World History, Archaeology and **Combat**.
The Combat Atlas is currently reachable by children on an inherited assumption.

## Workstreams

Ordered. Rename goes **last** — consolidating first shrinks its surface from five
registries to one.

**W2 — Registry unification.** 1.5–2 days. One `data/disciplines/registry.ts`:
`{ id, label, emoji, accent, kind, renderer, moduleUrls[], ageBand, kidsSafe }`.
The other five become derived views. `moduleUrls` preserves the Firestore contract.
Keep `LabsDisciplineView`'s generic chassis as the fallback for unmatched ids.

**W3 — Single mount + context.** 1–1.5 days. Remove the `ClassroomsView` branches;
route through `PLAJAH_LABS` with `initialDiscipline`. Plumbing exists —
`labsDiscipline` state (`App.tsx:946`), the `OPEN_LABS_DISCIPLINE` event, the
`initialDiscipline` prop. Extend the payload from `{disciplineId}` to
`{disciplineId, context?}`.

**W5 — Per-discipline kids gating.** 0.5–1 day. Add `canOpenDiscipline(id)` reading
`kidsSafe` from the W2 registry. **Make the Combat Atlas call here.**

**W4 — Nav re-pillar.** 0.5 day. Move out of the Education group:
`CommandSplitNav.tsx:59`, three label maps at `App.tsx:3492/3652/3747`,
`EDU_BOTTOM_TABS`. Keep the AppView id. *Not blocked* — `feat/shell-next` is
already merged to master.

**W1 — Rename.** 0.5–1 day. ~60 display-string sites. Content attributions in
`data/eduFactoids.ts`, `data/richLessonStudio.ts`, `data/demoClassroom.ts` are
mechanical; `HelpCenter.tsx:444–478` and `SmartGuide.tsx:140` are prose rewrites.

**Total: 4–6 days on a clean base.**

## Forward rule (applies now, before any of the above)

New discipline, school, or hall surfaces **link** into the studio route; they do not
mount their own copy. Free while writing new code, expensive to retrofit. With six
school views recently added (Econ, Money, Philosophy, Real Estate, Civics, Paper
Trading), this is the rule that stops the debt compounding.

## Verification

`npx vite build` is the real gate — vite skips typecheck, and bare `tsc --noEmit`
needs `NODE_OPTIONS=--max-old-space-size=8192` or it OOMs silently (~35–54
pre-existing errors is baseline).

Then in preview: each of the 15 disciplines opens from both the Labs grid and an
Academia module card; a Firestore module row with a custom `url` still resolves; a
child account cannot reach a non-`kidsSafe` wing.
