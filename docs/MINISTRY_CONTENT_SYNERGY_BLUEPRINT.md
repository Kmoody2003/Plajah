# Ministry Content Synergy Engine — Technical Blueprint

*Created July 5, 2026. The technical spec behind GTM §26. Goal: **one service in → a week of publishable content out**, with ARIA doing the editorial work and a human approving drafts. Every stage reuses an engine Plajah already built for another vertical — this is integration, not greenfield.*

---

## 0. Principle

Make creating and repurposing content **seamless across the creative stack** so a ministry (or any cultural/nonprofit org) captures once and publishes everywhere. Each hop is an existing engine; the Synergy Engine is the connective tissue + ARIA's editorial layer.

```
 Reello stream / Switcher live  ──▶  Fabula clean-feed project (auto, on stream end)
        │  audio                          (overlays stay separable & editable)
        ▼
 audioTranscription (timecoded)  ──▶  ARIA editorial pass
                                          ├─▶ Article draft   (org feed + global feed / Newstand)
                                          ├─▶ Podcast episode (Chora / Podcast Studio)
                                          └─▶ Book chapter    (Lorea)
        ▲                                    │  fact / scripture detected → supplemental material
        │                                    ▼
 Timecoded stills  +  Event Photo Pool  ──▶  auto-illustration of drafts
 (pool auto-opens when a Service Time hits; optional geo auto check-in feeds it)
```

## 1. Existing building blocks (reuse, don't rebuild)

| Capability | Where it lives today |
|---|---|
| UGC video / streams | Reello (`VideoTab`, `VideoPlayer`, `videos` collection) |
| Live switcher / broadcast | TV Studio + Switcher (`services/tvStudioEngine.ts` `StudioProject`), WebRTC Live |
| NLE / edit projects | Fabula editor |
| Transcription (timecoded) | `services/audioTranscription.ts` `transcribeTrack(url, opts)` |
| AI (ARIA) | `services/ariaContextService.ts`, `services/agentService.ts` (server AI proxies: `/api/proxy` Anthropic + Gemini) |
| Articles | `types.ts` `Article`, the Newstand |
| Podcasts | Podcast Studio (`services/podcastStudio/*`), Chora |
| Books / eBooks | Lorea (`BookReader`, Album with `bookChapters`) |
| Event photo pools | `EventPhotoPool` type + `EventPhotoPoolView`, `subscribeToPhotoPool`, `uploadPhoto` |
| Churches / orgs | `Organization` (`orgType 'CHURCH'`/`CULTURAL`), `org.serviceTimes` |
| Monetization | Sanctuary hybrid + Stripe rails + Plajah+ |

## 2. Data model (new types)

- **`ContentRepurposeJob`** — the spine. `{ id, orgId, sourceType: 'REELLO'|'LIVE'|'UPLOAD', sourceId, status: 'CAPTURED'|'TRANSCRIBING'|'DRAFTING'|'READY'|'PUBLISHED', transcriptId?, outputs: RepurposeOutput[], createdAt, createdBy }`.
- **`RepurposeOutput`** — one produced asset. `{ kind: 'ARTICLE'|'PODCAST'|'BOOK_CHAPTER'|'CLIP', status: 'DRAFT'|'APPROVED'|'PUBLISHED', title, body?, audioUrl?, chapterId?, supplements: Supplement[], stills: TimecodedStill[], publishedRef? }`.
- **`Supplement`** — ARIA-surfaced context anchored to a transcript span. `{ type: 'SCRIPTURE'|'FACT'|'CITATION'|'DEFINITION'|'MEDIA', anchorTimecode, label, detail, source?, reference? }` (e.g. `SCRIPTURE` → `reference:'John 3:16'`, `detail:` verse text + cross-refs).
- **`TimecodedStill`** — `{ timecode, imageUrl, quote, source: 'FRAME'|'PHOTO_POOL' }`.
- **`CheckInPreferences`** on the user profile — `{ autoCheckIn: boolean, fences: GeoFence[] }`, `GeoFence { orgId, lat, lng, radiusM, label }` — **optional, off by default**.

## 3. Pipeline stages

### 3.1 Capture → Fabula clean-feed project (auto, on stream end)
When a Reello stream or Switcher broadcast **ends**, fire `onStreamEnd(streamId)` → create a Fabula project auto-populated from the stream's timeline **events** (scene cuts, title-ins, lower-thirds) as **separate, editable layers** over a **clean program feed** (no burned-in graphics). Requires the switcher to persist a **clean feed + an events/overlay track** rather than only the flattened composite. The events already exist in the switcher's timeline; the work is exporting them un-flattened and mapping to Fabula's project/track model.

### 3.2 Transcribe
`transcribeTrack(streamAudioUrl)` → timecoded transcript, stored as `transcriptId`. This is the substrate everything else quotes.

### 3.3 ARIA editorial pass (the core new service)
`services/ministryRepurpose.ts` (Phase 1 below). ARIA (server AI proxy) receives the transcript + org context and produces, per requested output kind:
- **Article** — headline, dek, sectioned body, pull-quotes (each tied to a timecode).
- **Podcast** — episode title, show notes, chapter markers (from transcript sections).
- **Book chapter** — long-form chapter for a Lorea Album.
- **Supplements** — ARIA flags every **Bible passage** ("John 3:16") and **checkable fact/claim** and attaches a `Supplement` (scripture text + cross-refs via a Bible API; citation/definition/related media for facts). Rendered inline in the draft as accept/dismiss chips.

### 3.4 Auto-illustration
For each pull-quote: grab the **video frame at its timecode** (Mux thumbnail at `?time=`) *or* a photo from the org's **Event Photo Pool** for that service. Attach as `TimecodedStill`.

### 3.5 Event Photo Pool trigger + optional geo check-in
When a `serviceTime` window opens, ensure an Event Photo Pool exists for that occurrence. Members who opted into **auto check-in** and are inside the org's **geo-fence** are checked in and can contribute to the pool hands-free (or are prompted). All optional, privacy-first, revocable.

### 3.6 Review & publish
Drafts land in an **Elevate → Content Studio** review surface. A human approves; approved outputs publish to their home engine (Newstand article, Chora/Podcast episode, Lorea chapter, Reello clip) and optionally out via the social-media manager. Any output can be **Sanctuary-gated** for monetization.

## 4. Phased build

- **Phase 1 (foundation — build now):** the `ContentRepurposeJob`/`RepurposeOutput`/`Supplement` types + `services/ministryRepurpose.ts` that, given a transcript (or a Reello video with audio), calls ARIA to produce an **article draft** with scripture/fact **supplements** and timecoded pull-quotes. Pure service + types, tsc-verified, no UI dependency. This is the ARIA editorial core everything else composes on.
- **Phase 2:** the **Content Studio** review UI in the church console — list jobs, review the article draft, accept/dismiss supplements, one-click publish to the org + global feed. Wire a **"Repurpose this stream"** entry point on Reello videos owned by an org.
- **Phase 3:** **podcast** + **book-chapter** outputs (reuse Podcast Studio + Lorea Album builder) from the same job.
- **Phase 4:** **auto-illustration** — timecoded frame stills + Event Photo Pool photo selection into drafts.
- **Phase 5:** **Fabula clean-feed auto-project** on stream end (switcher persists clean feed + separable overlay track → Fabula project).
- **Phase 6:** **geo auto check-in** (`CheckInPreferences` + fences) feeding the pool; service-time-triggered pool creation.

## 5. Value recap (why it's worth building)

Seamless capture→publish is the moat: no church-media or creator-repurposing tool spans the whole loop, the marginal cost is only AI inference (already budgeted), time-to-value is a single service, and it compounds retention because the org's content, congregation, giving, and archive all live on Plajah. The same engine serves museums/universities/nonprofits, so Elevate's build is also the Cultural-org GTM.
