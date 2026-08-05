# Fabula Timeline Interchange — FCPXML (shipped) + AAF (follow-up)

## Shipped: FCPXML round-trip + media relink + resumable background upload
- **`services/fabula/fcpxml.ts`** — `exportFCPXML(clips, tracks, pool, fmt, name)` and
  `importFCPXML(xml) → { projectName, format, tracks, clips, mediaRefs }`. Time is FCPXML rational
  seconds on the frame grid; multi-track uses one spine `<gap>` with connected clips on lanes
  (v1=1, v2=2…, a1=-1, a2=-2). **DaVinci Resolve** reads/writes this natively (so do Premiere/FCP).
  Verified headless: a 4-clip / 3-track timeline round-trips export→import with track/start/duration/
  srcIn preserved and media refs surfaced as basenames for relink.
- **Import flow** (`Fabula.jsx` → `importTimelineWithMedia`): parse FCPXML (or EDL via the existing
  `parseTimelineFile`) → **ask where the media is** (File System Access `showDirectoryPicker`, recursive;
  `<input webkitdirectory>` fallback) → match each media ref by **basename** → read the file **local-first**
  (blob URL + idb stash `studio:blob:<id>`) → build the timeline relinked → enqueue each file for
  background upload. Unmatched refs stay offline for manual relink (existing relink cards).
- **`services/fabula/resumableUpload.ts`** — background uploader that **resumes across sessions**. Drives
  Firebase Storage's raw resumable protocol (`X-Goog-Upload-*` start/upload/finalize/query), persisting
  the session URL + byte offset per file in IndexedDB. On startup (`initResumableUploads`) it reloads the
  queue, queries each unfinished upload's received-bytes, and continues until complete; re-kicks on
  sign-in and on `online`. Bytes come from the same idb blob the editor stashes (no duplication). 8MB
  chunks. Completion stamps `asset.cloudUrl`. Export button: **EXPORT FCPXML (RESOLVE)** in Deliver.

## Follow-up: binary .aaf (validate against Resolve)
AAF is a **Microsoft Compound File Binary (CFB / OLE structured storage)** container holding the AAF
object model. Two layers to build, both in-browser-feasible but needing validation against real Resolve
`.aaf` files (which we could not do headless):

1. **CFB layer** — read/write the compound file. Options: the SheetJS **`cfb`** npm package (reads+writes
   CFB) or a hand-rolled reader (FAT/miniFAT + directory stream). Start read-only with `cfb`.
2. **AAF object model** — walk the CFB streams to the properties + the object graph:
   `Header → ContentStorage → Mobs`. For a timeline: a **CompositionMob** with `TimelineMobSlot`s (one per
   track) whose segments are `Sequence`s of `SourceClip`s; each SourceClip → a **MasterMob** → a
   **SourceMob** with an `EssenceDescriptor` + a **NetworkLocator** (the media file path, for relink).
   Map to Fabula: MobSlot → track, SourceClip.startTime/length → srcIn/duration, position in the Sequence
   → clip.start, NetworkLocator URL basename → relink key (reuse the FCPXML import's folder-relink +
   resumable-upload path verbatim — only the parser changes).
   - **Export** is the harder half: emit a valid CFB with a CompositionMob referencing external media via
     NetworkLocators (Resolve-friendly; avoid embedded essence). Validate by importing into Resolve.

**Target flavor: DaVinci Resolve AAF** (external/linked media, video + audio tracks, cuts + basic
dissolves). Avid/Pro Tools flavors differ (stricter, audio-embedded) — add later if needed.

**Wiring:** `importTimelineWithMedia` already branches on file type; add an `.aaf` branch that returns the
same `{ clips, tracks, mediaRefs }` shape, so relink + background upload work unchanged. Add
`exportAAF(...)` beside `exportFCPXML`. Blocking step before trusting either direction: a real Resolve
`.aaf` sample to parse against, and a Fabula→AAF export opened in Resolve.
