# Plajah Experience Expansion Blueprint

**Date:** 2026-07-03
**Scope:** Reello · Taleo · Photography & Art · Chora · Plajah Academia (History + Architecture)
**Principle:** Additive, not rewrite. Every proposal below builds on components, services, and data
models that already exist in the codebase. Reuse is cited inline.

---

## Part 1 — Reello: YouTube depth, TikTok/IG energy, Plajah-only superpowers

### 1A. YouTube-parity refinements (the "subtle but important" layer)

These are the small features that make YouTube feel finished. Current gaps confirmed in
`RelloView.tsx`, `VideoPlayer.tsx`, `VideoTab.tsx`, `backendService.ts`:

1. **Watch history + Continue Watching** — there is no persistent watch record.
   Add `users/{uid}/watchHistory/{videoId}` (positionSec, duration, updatedAt, completed).
   Write from `VideoPlayer` on pause/seek/unmount (throttled). Surfaces: a "Continue Watching"
   shelf in `VideoTab` discover view, a History tab, and "resume from where you left off" in the
   player. This also feeds the recommendation engine for free.
2. **Wire `feedScoreEngine` into the Reello feed** — `fetchVideosByInterests()` exists but
   `RelloView` uses flat recent-50. Blend: 40% interest-scored, 30% followed creators, 20%
   trending (7-day like+comment velocity), 10% fresh/random discovery.
3. **Subscription bell / notify-on-upload** — follow exists; add a per-follow `notifyLevel`
   ('ALL' | 'HIGHLIGHTS' | 'NONE') on `follow_relations`, respected by `notifyFollowers()`.
4. **Trending tab** — computed view over likes/comments/plays velocity. Start client-side over
   the recent-200 window; move to a scheduled Cloud Run job when volume demands.
5. **Chapters everywhere** — the player scrubber already renders chapter markers; add a chapter
   editor to `VideoManager` (timestamped list in description, YouTube-style auto-parse).
6. **Watch Later** — one-tap save; reuse `VideoPlaylist` with a reserved system playlist id.
7. **Content-rating + kids-mode filter** — respect the existing kids-mode/content-safety engine
   (EdTech phase 0) in the Reello feed query.
8. **Ambient/theater/mini-player modes** — mini-player already exists for music
   (`MiniMusicPlayer`); add a video mini-player so browsing doesn't kill playback.

### 1B. TikTok/Instagram fusion (a hint, not a clone)

1. **Remix / Stitch (Plajah-style: "Reprise")** — allow a creator to pull up to N seconds of a
   Reello video into **Fabula** as a pre-licensed clip (license field already exists on Video).
   The published result carries `remixOfVideoId`, rendering a source credit chip on the player.
   This is TikTok's duet/stitch built on infrastructure no competitor has: a real NLE in-platform.
2. **Sounds** — extract/attach a Track to any Reello short ("use this sound"), linking Chora ↔
   Reello. `Track` already supports `videoUrl`/`mediaKind`; add `soundOfVideoId` + a "videos using
   this sound" rail.
3. **Vertical-first polish** — `verticalVideoUrl` already exists on Video. Prefer it in the
   shorts feed; add double-tap-to-like, long-press 2× speed, swipe-left → creator channel
   (IG-style), and a comment sheet that doesn't cover the video.
4. **Stories-adjacent: "Today" posts** — 24h ephemeral clips on the creator channel ring.
   Reuse `Post` + a TTL field; don't build a separate system.
5. **Creator reply-with-video on comments** — a comment can be answered with a short; threads
   the two (`replyVideoId` on `VideoComment`).

### 1C. Novel, Plajah-only ideas (harness the platform)

1. **Worlds-native video ("Lore Layer")** — Video already carries `worldId`, `characterIds`,
   `characterTimestamps`, `whatIfBranchPoints`. Nobody surfaces this. Add a player overlay toggle:
   when a tagged character appears, a tappable chip opens their World Hub card (bio, relationships,
   timeline). This turns every series into a browsable universe — YouTube/TikTok/Netflix have
   nothing structurally comparable.
2. **What-If branching as a first-class format** — `whatIfBranchPoints` exists on the data model.
   Build the player UX: at a branch point the video pauses and offers alternate continuations
   (other videos). Interactive fiction/creator choose-your-path — a genuinely new short-form genre.
3. **Live → Short pipeline** — streams already archive to Reello (`saveStreamArchive`). Add
   "clip this" during/after live (in/out points → Mux clip → instant short with attribution),
   closing the Twitch-clips gap natively.
4. **Learn chip** — when a video's tags match an Academia/Labs discipline or a Chora lesson,
   show a "Go deeper" chip linking to it. Education is Plajah's cross-platform moat; use it as
   a discovery surface, not a silo.
5. **Creator Passport provenance** — stamp uploads with the Creator Passport record so reused/
   remixed content always resolves to origin. (Phase 0 spec already written.)

---

## Part 2 — Taleo: heavy storytelling, the Film School as a blockbuster

Taleo's design stays. This is elevation + missing connective tissue.
Existing assets: `FilmSchoolView.tsx` (5 modules + Script Vault), `HistoryMomentsView.tsx`,
`FilmClubCreator.tsx`, `MoviesTVView.tsx` (HOME/TV/UNIVERSE/LIBRARY), Worlds engine, Internet
Archive integration (`archiveContentService.ts`).

### 2A. The Film Museum (flagship)

A new Taleo tab modeled on the proven `WorldCupMuseum.tsx` pattern (curated seed data +
Wikipedia REST API bios/portraits + card grid → detail modal), elevated:

- **Halls**: Directors · Writers · Producers · Cinematographers · Editors · Composers.
- **Per-figure page**: portrait + biography (Wikipedia summary API, cached), filmography
  timeline, signature techniques ("the Spielberg face", "Deakins' negative fill"), curated
  article links, and **documentaries about them** — sourced from the existing Internet Archive
  integration (public domain) plus platform uploads tagged to the figure.
- **Movements & Eras wing**: German Expressionism → French New Wave → New Hollywood → Dogme 95…
  each era links its films (Archive.org public-domain catalog is strong precisely on early
  cinema), its figures, and a "watch the era" playlist.
- Seed data file: `data/filmMuseum.ts` (figures with wikiSlug, era, roles, signatureWorks,
  techniques, docLinks) following `data/soccerLegends.ts` conventions.

### 2B. Film School → a true school

- **Curriculum tracks**: Foundations → Screenwriting → Directing → Cinematography → Editing →
  Sound → Producing → **Acting & the Craft** (new department: technique lineages — Stanislavski,
  Meisner, Method; scene-study exercises; audition craft; movement/voice).
- **Watch-along lessons**: lesson text synced to a film timestamp ("watch the baptism montage,
  00:00–03:10, then read: cross-cutting as thesis"). Public-domain films make this legally clean.
- **Shot-by-shot analyzer**: reuse the player's chapter/timestamp machinery to annotate scenes
  (shot size, movement, motivation) — a film-literacy tool nobody at consumer scale has.
- **Make-your-own path**: every lesson ends with a Fabula assignment ("recreate this blocking
  with your phone"), published to Reello with the lesson tag → a visible student wall.
- **Ledger integration**: completions write `LearningRecord`s via `learningLedgerService` —
  film school becomes part of the portable Academic Passport.

### 2C. Film Club as a Taleo section (not just a creator tool)

`FilmClubCreator` exists; give clubs a home: a **Film Clubs** tab in Taleo listing clubs by
film/genre/era, with scheduled watch parties, weekly picks, and club discussion threads
(existing `discussionPosts` + `clubs` collections). Add "official" curated clubs (e.g., the
Criterion-style "Canon Club") seeded by the platform.

### 2D. Worlds integration (finish the loose thread)

- Surface a **Universe rail** on `MovieUXView`: when `video.worldId` is set, show the world's
  characters/lore/timeline inline and "More from this universe".
- UNIVERSE tab in `MoviesTVView` becomes the cross-world browser (worlds with linked films,
  characters appearing across titles).

### 2E. Streaming-polish gaps (from the audit)

Persistent watch history + continue-watching (share Part 1A's collection), content-rating
badges (field exists, render it), subtitle/CC track support in the player, and a "leaving soon /
new this week" editorial row. All small; all compounding.

---

## Part 3 — Photography & Art: a new stratosphere

Today: solid personal-photo core (`PhotoGallery`, `PhotoManager`, `PhotoEditPanel`, albums,
slideshow+music, event pools, Worlds photos). Missing: the entire art/museum/education layer.
Target: **one of the best places online to learn the visual arts** — photography, painting,
architecture-as-art — beginner to master, with personal photos treated with the same care.

### 3A. The Gallery (digital art museum)

- **Classical collection**: seed from open-access museum APIs — The Met Open Access,
  Rijksmuseum, Art Institute of Chicago, Cleveland Museum of Art, Wikimedia Commons — all free,
  keyless or free-key, high-resolution, public domain. Same API-first pattern as Labs
  (`labsApiService.ts` is the template: config-driven multi-source fetch + cache).
- **Curated wings**: Renaissance · Baroque · Impressionism · Modernism · Photography Masters ·
  Architecture (Gaudí to Hadid) — each wing = seed file of works + movement essay + figure links.
- **Deep-zoom viewer**: museum APIs serve IIIF tiles; a IIIF viewer gives Google-Arts-grade
  zoom into brushwork. (OpenSeadragon is the standard; lazy-load like TensorFlow.js is.)
- **Artist & photographer biographies**: `WorldCupMuseum` pattern again — figures with wikiSlug,
  movement, era, showcase works pulled live from museum APIs, article links, documentaries.

### 3B. Art & Photography School

Mirror the Film School structure (and Chora's `MusicTheoryStudio` difficulty tiers
NOVICE → MAESTRO):

- **Photography track**: exposure triangle → composition → light → color → portrait/street/
  landscape/documentary → editing (teach *inside* `PhotoEditPanel` — guided edit exercises on
  supplied RAW-style images; the recipe engine already supports non-destructive practice) →
  the business of photography.
- **Art track**: elements & principles → drawing foundations → color theory → art history
  survey (comprehensive, era-by-era, using the Gallery's own collection as the textbook) →
  criticism & reading a painting.
- **Ledger-backed**: completions write to the learning ledger like everything else.

### 3C. Personal photos, elevated

- **EXIF display** (camera, lens, settings) on photo detail — table stakes for a photo
  community, already stored in file metadata, just parse client-side.
- **Portfolio rooms** (already in `PHOTOGRAPHER_PRO_FEATURES` roadmap): elegant, chrome-free
  gallery pages per photographer — the "high end" presentation layer.
- **Critique circles**: opt-in structured feedback (composition/light/story scores + comment),
  modeled on Labs' peer-review `ReviewData` shape.
- **Weekly salons**: themed challenges ("Shadow", "Blue hour") with community exhibitions —
  the photographic equivalent of Reello trends.

### 3D. Novel connectors

- Painting → "photograph this" assignments (recreate Vermeer light with a phone).
- Art in Worlds: attach Gallery works as world moodboards (photos already support `worldId`).
- Pixels: use the classical collection as licensed-clean visual source material for VJ sets.

---

## Part 4 — Chora: the wholistic music experience

Chora already has the hardest parts: `MusicTheoryStudio` (6 lesson modules, ear training,
NOVICE→MAESTRO), real engraved notation (`SheetMusic`), the YIN/poly/Basic-Pitch transcription →
MusicXML → Lorea scores pipeline. What's missing is the *humanities* half and the knitting.

1. **The Conservatory Hall (music museum)**: composer & musician biographies on the
   `WorldCupMuseum` pattern — Bach to Coltrane to Aretha; era wings (Baroque → Classical →
   Romantic → Jazz → Blues/Gospel → Rock/Soul/Hip-Hop); each figure with bio, key works,
   listening links (Archive.org/Wikimedia/Jamendo integrations already exist for legal audio),
   articles, documentaries.
2. **Music history curriculum**: parallel to lessons — "the development of harmony",
   "the birth of recorded sound", "sampling and the law" — each with listening assignments
   playable in the existing GlobalPlayer.
3. **Repertoire library**: public-domain scores (IMSLP links + MusicXML where available) side by
   side with Lorea's user-transcribed scores → "study the score while you listen" (playhead-sync
   already exists in `SheetMusic`).
4. **Listen-like-a-musician mode**: on any track, the Breakdown view (transcription) becomes a
   guided tour — key, form, chord map. The transcription engine is the moat; today it's hidden
   behind a button.
5. **Instrument primers**: how each orchestra/band instrument works, its range and roles, with
   ear-training hooks into the existing Web Audio synthesis.
6. **Ledger + Academia**: theory-lesson completions write LearningRecords; Chora becomes the
   music department of Academia.

---

## Part 5 — Plajah Academia (SHIPPED: Phase 1) + History & Architecture

**Decision implemented (2026-07-03):** user-facing rename Classrooms → **Plajah Academia**
(internal `CLASSROOMS` AppView id retained so pinned navs and deep links keep working), plus
**World History** and **Architecture** shipped as Labs-model disciplines surfaced as Academia
modules. See "Phase 1 delivered" below.

### 5A. Structural model (per user direction: mirror Plajah Labs disciplines)

Both sections are `LabsDisciplineId`s (`history`, `architecture`) with the full Labs chassis:
hero + live-data strip + tabs (Papers · Visualize · Datasets · Textbooks · Discipline Feed ·
Plajah Social), Aria explain, expertise tiers, notebook/citations/formula tools.

### 5B. World History roadmap (beyond Phase 1)

- **Textbooks**: OpenStax World History Vol 1 & 2 + U.S. History are wired in (real CC-BY
  books, live asset URLs verified).
- **Eras atlas**: interactive timeline (prehistory → present) with era pages: map, key events,
  figures (Wikipedia-API bios via the museum pattern), primary sources (Library of Congress,
  Europeana, DPLA — all free APIs), and "as seen in Taleo/Books" cross-links.
- **Figure encyclopedia**: `data/historyFigures.ts` seed + Wikipedia enrichment.
- **Quiz/quest cartridge**: History Quest on the Reading/Science Quest chassis, writing the
  learner ledger, K-12-aligned via `educationStandards.ts`.

### 5C. Architecture roadmap (beyond Phase 1) — "everything downstream of buildings"

- **The formula & codes repository**: a reference library on the Labs formula-editor foundation
  (KaTeX already integrated): statics (beam deflection, moment, shear), materials (stress/strain,
  modulus tables), loads (dead/live/wind/seismic), plus **pointers into the real specs** — IBC,
  Eurocodes, ASCE 7 (link + summary; the codes themselves are licensed, so summarize + cite).
- **Free structural-engineering APIs & data**: USGS seismic design data (already integrated —
  architecture discipline ships with `usgs: true`), NOAA wind/climate loads, OpenStreetMap
  building footprints, and open FEM tooling references.
- **3D model museum**: famous-building models (.glb) in a viewer on the existing
  react-three-fiber stack (`SolarSystemModule`/`HumanBodyExperience` are the in-repo templates;
  `useGLTF` from drei). Curate from free-licensed sources (Smithsonian 3D, Sketchfab CC).
- **Blueprint archive**: public-domain drawings — the Library of Congress **HABS/HAER** archive
  (Historic American Buildings Survey) is exactly this: free, high-res measured drawings of
  famous structures. Seed `data/blueprintArchive.ts` with curated entries + IIIF/image links.
- **Great architects hall**: museum-pattern biographies (Imhotep → Brunelleschi → Wright →
  Hadid), movements (Gothic → Bauhaus → Brutalism → Parametricism).
- **Practitioner shelf**: for working architects/engineers — arXiv `cs.CE` papers (wired),
  sun-path/daylighting calculators, span tables, and a glossary from AEC open vocabularies.

### 5D. Phase 1 delivered (this change set)

| Change | Files |
|---|---|
| Rename to Plajah Academia (labels, tooltip, mobile nav, page header, Labs cross-links) | `App.tsx`, `ClassroomsView.tsx`, `PlajahLabsView.tsx` |
| `history` + `architecture` disciplines (config, meta, hub registration) | `services/labsApiService.ts`, `components/LabsDisciplineView.tsx`, `components/PlajahLabsView.tsx` |
| OpenStax World History Vol 1/2 + U.S. History textbooks (verified URLs) | `services/labsApiService.ts` |
| World History + Architecture module cards in Academia opening the discipline experience | `components/ClassroomsView.tsx` |

---

## Part 6 — Cross-platform threads (do once, use five times)

1. **The Museum engine**: one generic `MuseumHall` component (seed data + Wikipedia/museum-API
   enrichment + card grid + figure modal) powers the Film Museum, the Art Gallery figures, the
   Conservatory Hall, History figures, and the Architects hall. Build it first.
2. **The School chassis**: curriculum tracks + lesson viewer + ledger writes, shared by Film
   School, Photo/Art School, Chora, and Academia quests.
3. **Watch/listen history**: one `users/{uid}/watchHistory` model serves Reello, Taleo, and
   Chora continue-listening.
4. **Learn chips**: tag-matching between content (videos/tracks/photos) and education
   (lessons/disciplines) as a universal discovery affordance.

## Suggested phasing

- **Phase 1 (done)**: Academia rename; History + Architecture disciplines live.
- **Phase 2**: Museum engine + Film Museum + watch history/continue watching (Reello & Taleo).
- **Phase 3**: Reello feed algorithm blend, trending, bell, shorts polish; Art Gallery
  (Met/Rijksmuseum APIs) + artist bios.
- **Phase 4**: School chassis — Acting department, Photo/Art school, Chora Conservatory +
  history curriculum; ledger integration across all.
- **Phase 5**: Novel formats — Lore Layer, What-If branching UX, Reprise remix via Fabula,
  Sounds; Architecture 3D museum + blueprint archive + codes repository.
