# Melos — the Chora production workspace

> The room where an album gets made, before it's an album.

**Status:** blueprint done · **Phase 1 SHIPPED** (service, shell, Pad/Tracklist/Arrange/Board, 3 entry points)
**Surface:** Chora (Music)
**Owner doc:** this file
**Design pitch:** https://claude.ai/code/artifact/68203375-9f3e-4d33-889d-63b3a19d1db4
**Skins:** two switchable Pad Skins — Lamplight (default) · Onion Skin

---

## 1. What this is

Chora today is a **release** platform. An artist arrives with a finished album and
uploads it. Everything before that moment — the year of writing, demoing, arguing
about the running order, chasing a sample clearance, booking three days at a studio
they can barely afford — happens somewhere else, in a mess of voice memos, a Notes
app, a group chat and a shared Drive folder.

Melos is that missing year, brought on-platform.

It is a **production environment**: an in-progress album that lives as a first-class
object, with the tools to actually make it — a writing pad, a track list with
honest commitment states, running-order experiments, an inspiration board, a sample
board with a real clearance workflow, studio session planning with cost estimates,
a beat-making room that reads and writes `.dawproject`, and a collaboration room
built on the chat / whiteboard / live stack the platform already has.

Then, when it's done, it **becomes** a Chora album — with the lyrics, credits,
photos and diary entries already populated, because they were written in Melos.

### The name

`Melos` — Greek μέλος, "song / melody"; the root of *melody*. Sits in the platform's
existing family of short, vowel-rich, Greek-Latin coinages: Chora, Lorea, Fabula,
Terra, Ora. Collision-checked: no existing `melos` identifier in the codebase.

### The feeling

Non-negotiable, and it drives every UI decision below:

> A place an artist can **zone into the work**. Calm, serene, unhurried. Plajah
> brand aesthetic, but with hints of scratch pad and something organic — this is
> a workbench, not a dashboard.

Concretely, that means: no metric tiles, no "productivity" framing, no progress
bars that shame you, no red badges. Generous whitespace. Faint manuscript staff
rulings as the substrate texture — the thing composers have actually scribbled on
for four hundred years, and specific to music in a way generic paper is not.
Handwriting (`--font-handwritten`, Gochi Hand, already in `index.css`) appears in
**margins only**, never in body text.

---

## 2. Why this belongs on Plajah specifically

Every one of these is a capability the platform already has and a competitor
would have to build from scratch:

| Melos needs | Already exists | File |
| --- | --- | --- |
| Feel/mood analysis of a track | Cora breakdown engine | `services/coraAnalysisService.ts` |
| Key, chord map, song form detection | Guided listening | `services/guidedListening.ts` |
| Audio → notation | Transcription + engraver | `services/audioTranscription.ts`, `services/musicNotation.ts`, `components/SheetMusic.tsx` |
| Public-domain sample library | Archive.org-backed PD search w/ rights parsing | `services/publicDomainMusic.ts` |
| Whiteboarding with collaborators | Konva collab board | `components/CollaboBoard.tsx` |
| Live stream / screen share to collaborators | WebRTC core + live stack | `services/rtcCore.ts`, `services/liveStreamService.ts` |
| Chat + file send | Rooms primitive + chat system | `components/ChatSystem.tsx` |
| Music video pre-production | Fabula NLE | `services/fabulaBridge.ts` |
| Pull existing audio into a project | Music locker / personal tracks | `services/musicLocker.ts` |
| Becomes a real release | Album + Track model | `types.ts`, `components/AlbumCreator.tsx` |
| Business wrapper (contracts, invoices, payroll) | Artist Manager | `components/ArtistProjectManager.tsx` |

The architectural precedent is exact: **Melos is to Chora what the Film Production
Suite is to the Film discipline.** Same shape — one shared data model in a service,
a Firestore-backed production object with subcollections, a rich demo seed, and a
suite of tab-rooms in the Artist Manager. See `services/filmProductionService.ts`
and `components/film/FilmProductionSuite.tsx`.

---

## 3. Entry points

Three doors, all landing in the same workspace:

1. **Chora › Music › `⊕ Start a Production`** — new primary action beside Upload
   Music in `components/MusicView.tsx`. The main door.
2. **Artist Manager › Music › Productions** — a new tab beside Releases in
   `PM_TABS` (`components/ArtistProjectManager.tsx`). The business-side door;
   a production in Melos becomes a release campaign in `MusicReleasesTab`.
3. **Album upload flow** — in `components/AlbumCreator.tsx`, an "or start this as
   a production instead" branch for an artist who opens Upload before they have
   anything finished to upload.

Plus the reverse door: an existing draft album can be **opened into Melos** to keep
working on it.

---

## 4. Data model

Firestore layout, mirroring the film production service:

```
melosProductions/{prodId}
melosProductions/{prodId}/songs/{songId}
melosProductions/{prodId}/arrangements/{arrId}
melosProductions/{prodId}/pins/{pinId}
melosProductions/{prodId}/samples/{sampleId}
melosProductions/{prodId}/sessions/{sessionId}
melosProductions/{prodId}/people/{personId}
melosProductions/{prodId}/notes/{noteId}
melosProductions/{prodId}/videoIdeas/{ideaId}
melosProductions/{prodId}/scores/{scoreId}
```

Canonical types live in `services/melosService.ts`. Summary:

### Production

The album-in-progress. Carries `title`, `workingTitle`, `intent` (the artist's own
paragraph on why this record exists — the thing they re-read when lost),
`status`, `targetTrackCount`, `targetReleaseDate`, `padSkin`, budget, the
collaborator list, and the ids linking it to a chat room, a whiteboard, and
eventually a published `albumId`.

### Song — the heart of the model

The single most important design decision in Melos is that a song carries **two
independent axes of state**, because artists actually think in both:

- **`state`** — where it is in the *process*:
  `SPARK → WRITING → DEMO → TRACKING → MIXING → FINISHED`
- **`commitment`** — whether it's *making the record*:
  `TENTATIVE · WORKING_ON_IT · VERIFIED · SHELVED · CUT`

A song can be `FINISHED` and still `TENTATIVE` (it's done, it might not fit).
A song can be a `SPARK` and already `VERIFIED` (it's eight bars but it's the
centre of the album). Collapsing these into one status is the mistake every
project tool makes, and it is exactly the distinction the artist asked for.

Alongside those, two subjective ratings the artist controls:

- **`love`** 0–5 — how much they like it *for this project*. Deliberately not
  "quality". A great song can be a 1 here because it belongs on the next record.
- **`confidence`** 0–100 — will this survive to the final tracklist.

Plus: structured `lyrics` (see below), `notes` (the diary entry, which flows to
Notebook view), tempo/key/time signature, `trackRef` to a pulled audio file,
`takes[]`, `feel` from the Breakdown engine, `credits[]`, `sampleIds[]`,
`images[]` (capped at 4 — Notebook view's photo slot), `color`, `tags`.

### LyricBlock — what makes rearranging possible

Lyrics are **not a text blob**. They're an ordered array of typed blocks:

```ts
{ id, kind: 'INTRO'|'VERSE'|'PRE'|'CHORUS'|'HOOK'|'BRIDGE'|'REFRAIN'|'OUTRO'|'AD_LIB'|'NOTE',
  label?, lines: string[], locked?, color? }
```

This is what enables everything the artist asked for: drag a chorus above a verse,
try the bridge earlier, duplicate a verse and rewrite one line, lock the hook so
it can't move, shuffle lines *within* a block. A text blob can't do any of it.

`lyricsLockedAt` is the integration trigger: once lyrics are locked, the flattened
text is pushed to the matching `Track.lyrics` on the album — the "populate the
lyrics box automatically" requirement.

### Arrangement — running-order experiments

**Note on the word.** "Arrangement" is ambiguous between *album running order* and
*per-song structure*. Melos models both, deliberately:

- **Album running order** → `MelosArrangement`: a named ordering of song ids
  ("Sequence A — the long walk"), with notes and an `isPrimary` flag. Several can
  exist at once and be viewed **side by side** — the requirement to look at
  multiple track arrangements at a time. Each computes a total runtime and an
  **energy curve** from per-song `feel`, so you can see the shape of the record,
  not just the list.
- **Per-song structure** → the `LyricBlock[]` order, plus `Song.structure`.

### Pin, Sample, Session, Person, CaptureNote, VideoIdea, Score

- **`InspirationPin`** — freeform board item (`IMAGE|LINK|TRACK|TEXT|COLOR|AUDIO|VIDEO`)
  with `x, y, w, h, rotation` so the board is genuinely spatial, not a grid.
  Optionally scoped to one song.
- **`SampleCandidate`** — something that caught the ear. Carries `origin`
  (`PUBLIC_DOMAIN|PLATFORM|UPLOAD|EXTERNAL|FIELD_RECORDING`), in/out points, and
  a nested **`ClearanceRecord`** with a real status machine
  (`NOT_NEEDED → NOT_STARTED → IDENTIFYING → CONTACTED → NEGOTIATING → CLEARED|DENIED|REPLACED`),
  a step checklist, rights-holder contacts, fee and split. PD samples resolve
  from `publicDomainMusic.ts` and auto-set clearance to `NOT_NEEDED` with the
  rights summary attached.
- **`StudioSession`** — kind, time, studio, room rate, engineer rate, attendees,
  target songs, goals, extra line items → `estimateSessionCost()`.
- **`Collaborator`** — role, instrument, split %, which songs they're on, invite
  status. Links to a platform `uid` when they're a Plajah user.
- **`CaptureNote`** — the mobile quick-capture atom: `TEXT|VOICE|PHOTO|HUM`, with
  optional transcript. Unfiled by default; sorted onto songs later.
- **`MusicVideoIdea`** — logline, rough treatment, shot list, reference pins,
  and `fabulaProjectId` once it graduates into Fabula.
- **`MelosScore`** — imported or transcribed notation: MusicXML, the `Notation`
  JSON from `musicNotation.ts`, source track, instrument.

---

## 5. The rooms

Melos is a workspace of rooms, not a form. Each is a tab in the shell.

| Room | Tier | What it's for |
| --- | --- | --- |
| **Pad** | paper | Write. Lyric blocks, drag to rearrange, margin notes, voice/photo capture inline. The default room. |
| **Tracklist** | paper | Every song with its two-axis state, love rating, confidence. Pull in audio files. Filter by commitment. |
| **Arrange** | paper | Album running-order experiments side by side, with runtime and energy curve per sequence. |
| **Board** | paper | Spatial inspiration board. Pin images, links, tracks, colours, audio. |
| **Sessions** | paper | Studio sessions, scheduling, cost estimates against budget. |
| **Samples** | bridge | The sample board + clearance workflow + public-domain library. Also **is the Beats browser**. |
| **Beats** | instrument | The DAW. Pads, step sequencer, **Sequence** (playlist), mixer, `.dawproject` in/out. |
| **Score** | instrument | Sheet music — import, read, or transcribe from an audio file. |
| **Feel** | instrument | Breakdown-engine analysis: per track and for the album as a whole. |
| **Room** | — | Collaboration: chat, whiteboard, live stream / screen share, file send. |
| **Video** | — | Rough music-video ideas → Fabula. |

On phone/tablet the shell collapses to **one job**: catch the idea. Hum it, say it,
type it, shoot it — three seconds, no navigation. Sorting happens on desktop.

---

## 6. Design system — two tiers, two skins

**Decided 2026-08-13 with the artist.** A light "Manuscript" direction was pitched
and rejected as too bright; two skins ship.

### The two tiers — the load-bearing rule

Melos has **two surface tiers**, and skins stop at the boundary:

- **Paper tier** — where you *think*. Low contrast, generous, textured, calm.
  Takes the skin token set in full. Rooms: Pad, Tracklist, Arrange, Board,
  Sessions, Notebook.
- **Instrument tier** — where you *play*. Matte `#0A0A0D` slab in **every** skin,
  because a 16-step grid needs density, high contrast and meter legibility — the
  exact opposite of what a lyric pad needs. Rooms: Beats, Sequence, Mixer,
  Score, Feel.

The instrument tier **inherits the skin's accent only**, so crossing the boundary
reads as a lamp swinging over rather than a different application opening. Do not
let skin tokens reach the instrument tier; that is not a shortcut, it is a bug.

### The skins

Selected per production, stored on `Production.padSkin`. A **token set swap on a
single `.melos` root**, not two codepaths.

| Skin | Ground | Accent | Character |
| --- | --- | --- | --- |
| `LAMPLIGHT` *(default)* | near-black `#0A0910` | lilac `#D0BCFF` | Staff rulings faint under a warm pool of light on the work; purple bleeding down the rails. Makes the tier handoff nearly invisible — its ground is already near-black. |
| `ONION_SKIN` | deep warm ink `#15110F` | amber `#E9A85C` | Lyric blocks are translucent tracing paper; a single desk-lamp accent; brand almost entirely withdrawn. The private one. 2am. |

Shared: manuscript staff rulings as substrate texture, an SVG `feTurbulence` grain
layer, handwriting (`--font-handwritten`) in **margins only**, the Plajah brand
triad for semantic states, and the M3 shape scale from `plajah-ds.css`.

### Instrument-tier colour logic

Inherited from the Beats (Plajah Studio) design pitch and **strict** — these are semantic, never
decorative:

| Colour | Means |
| --- | --- |
| `#FF8C00` orange | armed / recording / live signal |
| `#00DAF3` cyan | playhead, realtime |
| `#D40055` magenta | selection, focus |
| purple `#6B0099` / `#B84DFF` | brand chrome **only** — wordmark and the publish CTA |
| `#D0BCFF` lilac | `.dawproject` in/out, automation lanes |

---

## 7. Notebook view — the public half

A **new presentation mode for finished Chora albums**, separate from the workspace:
the album as a bound diary. One song per two-page spread.

**It has its own surface — it is not a Pad Skin.** Decided 2026-08-13: an earlier
light-paper treatment was rejected as too bright. The reference is the **vintage
black-page photo album**: deep warm leaf `#171210`, cream ink `#EFE4D4`, brass
photo corners `#C9A76B`, amber handwriting for the diary entry, and a warm lamp
falling across the open book with the edges dropping into the dark. Warm and
close rather than bright, because a diary is read alone.

- **Verso:** track number, runtime, title, full lyrics with section labels.
- **Recto:** up to four photos held by brass corners, slightly rotated; the diary
  entry in the artist's handwriting; credits.
- Deep gutter shadow (the spine swallows the light), warm grain, page numbers,
  radial vignette. It's a book.

Every field it renders is written during production — lyrics from the Pad, diary
from `Song.notes`, photos from `Song.images`, credits from `Song.credits`. That is
the point: Notebook view is the **payoff** for having worked in Melos, and the
reason an artist keeps their notes there instead of in a Notes app.

---

## 7b. Beats — the DAW as a Melos room

**Decided 2026-08-13:** the in-browser DAW is a **room inside Melos**, not a
separate app. See the Plajah Studio design pitch (artifact
`a96c0997-b31b-4523-9ca2-4be8055e6dd4`) for its three visual directions.

A hybrid of **Maschine**'s pad-and-group workflow and **FL Studio**'s channel-rack
step sequencer, reading and writing **`.dawproject`** — the open ZIP+XML
interchange format co-authored by Bitwig and PreSonus (v1.0 stable; also read by
Cubase 14). A beat started in Melos opens natively in Bitwig Studio, Studio One
and Cubase.

### Why it belongs here

Without it, Melos can hold a song, rate it, sequence it and clear its samples —
but it cannot **make the sound**. Beats closes that loop: a groove is built in
the room, rendered, and lands on the song as a take / its `trackRef`. No export dance, no
re-keying.

### Naming rules — non-negotiable, these words are already taken

| Melos already uses | So the DAW must use |
| --- | --- |
| **Pad** = the lyric writing pad; **Pad Skins** skin that surface | "pads" only *inside* the Beats room, never as a room name |
| **Arrange** = album running order | **Sequence** for the FL-style pattern playlist |

Conflating these is the single easiest way to make this feature incoherent.

### The integration only we can ship

The **Samples room is the Beats browser**. A sample pinned in Samples appears
on the pads — and **carries its clearance state onto the pad**. Load something
uncleared and the pad is amber before you ever bounce; a PD item resolved through
`publicDomainMusic.ts` shows green with its rights summary attached. No other DAW
knows what a clearance is.

### The honest cost

**There is no AudioWorklet or SharedArrayBuffer audio anywhere in the repo** —
every engine today (spatial mixer, podcast studio, Fabula, Pixels) is main-thread.
A sequencer needs a lookahead scheduler on a worklet clock. That is genuinely new
infrastructure and it is the long pole of this feature, not the UI. See
`docs/PLAJAH_ENGINE_ARCHITECTURE.md` for the Rust/WASM position.

Reuse map for when it's built: `plajahPixels/services/midiService.ts` (already has
Maschine presets + Jam 8×8 grid), `services/djAnalysis.ts` (peaks/beat grid),
`services/drumTranscription.ts` (audio→step patterns), `fabula/audioGraph.ts`
(channel-strip DSP), `podcastStudio/mixEngine.ts` (bus architecture),
`fabula/mediaStore.ts` (OPFS), `services/instrumentSynth.ts` (starter voices).

---

## 8. Platform integration

| Direction | Behaviour |
| --- | --- |
| Melos → Album | Publish a production: songs become `Track[]`, lyrics/credits/images/diary carry over, cover art and description prefill `AlbumCreator`. |
| Lyrics lock → Album | `lyricsLockedAt` set ⇒ flattened lyrics pushed to the matching `Track.lyrics`. |
| Album → Melos | Open an existing draft album back into a production to keep working. |
| Melos ↔ Artist Manager | Production appears in Artist Manager › Music; publishing spins up a release campaign in `MusicReleasesTab`. |
| Melos → Fabula | A `MusicVideoIdea` graduates to a Fabula project via `fabulaBridge`. |
| Melos ← Locker / Reello | Pull existing audio into a song's `trackRef`. |
| Beats → Song | "Render take" bounces a groove onto the linked song as a `DEMO` take. |
| Samples → Beats | The Samples room *is* the Beats browser; clearance state renders on the pad. |
| Beats ↔ desktop DAWs | `.dawproject` import/export — opens in Bitwig, Studio One, Cubase 14. |
| Melos ← Public Domain | PD search resolves through `publicDomainMusic.ts` with rights summary attached. |
| Melos ↔ Rooms | The collaboration room reuses the canonical rooms primitive + chat + rtcCore. |

---

## 9. Phasing

The paper tier ships first. Beats follows, because it is gated on audio
infrastructure nothing else in Melos needs — building it first would stall the
whole feature behind a worklet scheduler.

**Phase 1 — foundation** *(SHIPPED 2026-08-13)*
Blueprint. Full data model + Firestore CRUD + demo seed in `melosService.ts`.
Workspace shell with both skins and the two-tier token boundary. Pad, Tracklist,
Arrange, Board. All three entry points.

**Phase 2 — the sample and session layer**
Sample board, clearance workflow, public-domain library integration, studio
sessions with cost estimation against budget.

**Phase 3 — collaboration**
Collaborator roster with splits, the Room (chat + whiteboard + live + file send),
invitations, per-song credits.

**Phase 4 — analysis and notation**
Feel room wired to the Breakdown engine (per-track and album-wide), Score room
(import MusicXML, read, transcribe from audio).

**Phase 5 — capture and publish**
Mobile capture UI (voice, photo, hum, text with transcript), Fabula video ideas,
publish-to-album pipeline, lyrics-lock propagation.

**Phase 6 — Notebook view**
The album-as-diary presentation mode in Chora, on its own warm-dark leaf surface.

**Phase 7 — Beats (the DAW)**
Gated on new audio infrastructure. In order: AudioWorklet lookahead scheduler and
transport clock → pads + step sequencer → Sequence (pattern playlist) → mixer →
`.dawproject` read/write → bounce-to-song. Samples-as-browser and clearance-on-pad
land with the pads.

---

## 10. Open questions

- Should a production be **shareable read-only** (a "here's where the record is"
  link for a manager or label) before it's published? Leaning yes, Phase 3.
- Do collaborators need their own **light-weight view** — a musician who only
  needs their parts and session times, mirroring the film suite's per-role daily
  brief? Strong candidate for Phase 3.
- **Sample clearance is legal-adjacent.** Melos must present itself as an
  organisational tool and never as legal advice; the clearance room needs
  explicit copy to that effect and links out rather than asserting rights status.
  PD items carry the rights summary `publicDomainMusic.ts` already parses, and
  nothing else is asserted.
