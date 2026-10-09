# Journalist toolset and the Tela article engine

Built 2026-10-08. Entry points: Creator Hub (the "Newsroom" quick chip and studio panel), the Newstand header ("Newsroom desk"), the Lorea Writer's Desk header ("Newsroom"), and the article editor's **Tools / Publish** drawer. App view id: `JOURNALIST_DESK`. Public masthead page: `?type=publication&id=<id>` (view id `PUBLICATION_PAGE`).

Status: type-checked (scoped `tsc` over the new files, zero errors in them), 52 unit tests green (`npm run test:journalist`). **Not exercised in a running app and not tested against a Firestore emulator.** Firestore rules are written and **undeployed**.

## 1. How Tela powers articles

An article is still *authored* in the block editor (`components/ArticleEditor.tsx`), and is *stored and rendered* as a Tela document.

```
ArticleEditor blocks ──buildArticleTelaDoc()──▶ TelaDoc
   masthead frame   VECTOR device: the chosen gallery template's opener page with HEADLINE / DECK / LABEL
                    slots filled by templateRole, or a built-in masthead when no template exists yet
   cover frame      MEDIA device (image)
   story frames     WRITER devices, one per run of text, split wherever a media block interrupts
   media frames     MEDIA devices (image / audio / video), caption as a Writer line
```

Publishing (`services/journalist/articleService.ts → publishArticle`):

1. Build the doc (or, with "My Tela edits" selected, load the author's hand-tuned doc from this device).
2. Run the pre-publish gate (section 3). Blockers stop here.
3. `publishTelaVersion()` freezes a version locally (OPFS/localStorage) and returns the bundle.
4. The same bundle is copied to Firestore at `articles/{id}/versions/{versionId}` as `bundleJson` (write-once). **This copy is what readers load**: Tela bundles are local-first, so another reader's device cannot reach the author's OPFS.
5. The article doc gets `tela {docId, versionId, templateId, mode}`, plus derived `bodyText`, `bodyHtml`, `wordCount`, `notices`, `disclosures`, `imageRights`, `status`, `embargoUntil`, `publicationId`, `section`, `access`.

Reading (`components/journalist/ArticleTelaBody.tsx`, used by `ArticleView`):

* Live article: renders the article's newest `tela.versionId`, **following** it through a live `onSnapshot` of the article doc, so a correction published elsewhere appears without a reload.
* Archived article (`tela.mode = 'archived'`): pinned to `tela.pinnedVersionId`; never changes.
* Legacy blocks-only article: `legacyArticleSnapshot()` builds a deterministic read-only Tela doc (`legacy:<id>`) from the blocks, rendered through the same `TelaEmbed` (snapshot mode). A "Classic view" link switches back to the original block renderer (preference stored in `localStorage`).
* Old versions: each correction notice that replaced text links "Read the version this replaced" (`previousVersionId`).

Templates: `loadArticleTemplates()` reads the Tela gallery and feature-detects gallery group (or tag) `ARTICLE`, `MAGAZINE`, `CATALOG`. Today, until the template workstream lands them, `ARTICLE`/`CATALOG` are empty and the drawer says so and uses the built-in masthead. They appear automatically when the registry gets them. No publication-template files were edited.

Drafts: edits to an article that already has a frozen version (or is live, or scheduled) are saved to `article.draft`, never to the live fields, so *Save draft* can never change what readers see or skip the correction rule. The editor opens with the working copy.

## 2. Corrections, updates, retractions (no silent edits)

`services/journalist/correctionLog.ts` (unit-tested):

* Labels: CORRECTION, CLARIFICATION, UPDATE, EDITOR'S NOTE, RETRACTION, each with a standard lead-in.
* Append-only: `appendNotice` returns a new array; `isAppendOnly` rejects edits, removals and reordering. The same rule is in `firestore.rules` (`noticesAppendOnly`, list-slice equality on the prefix).
* `classifyEdit` compares published text with the new text; any change (even one word) requires a notice before publish (`silentEditProblem`, enforced by the gate).
* Each body-changing notice is stamped (in memory, before the single write) with the new `versionId` and the `previousVersionId`.
* Retractions pin to the top of the log, add a banner, mark the feed title `[Retracted]`, and set `status: RETRACTED`.
* Note-only notices (editor's note, retraction text) can be added from *Newsroom → My articles → Add public notice*.

Honest limit: the log lives on the article document. A database admin can still rewrite it. This is product policy plus rules, not a tamper-proof ledger.

## 3. Pre-publish gate (`services/journalist/publishGate.ts`)

Blockers: no headline; headline error (empty, over 100 characters); every image (cover and inline) needs a credit line and a rights basis; AI disclosure on without an explanation; sponsored without sponsor; conflict of interest without a description; any claim marked DISPUTED; republishing changed text without a notice.
Warnings: unverified claims, Aria used but AI disclosure off, fair use / CC / licensed without a source link, very short story, embargo.
Embargo works like a scheduled album release: a future `embargoUntil` makes the action SCHEDULE, the article is saved with `isPublic: true`, `status: SCHEDULED` and the embargo time, and **every reader compares the time** (`services/journalist/embargo.ts`: `isEmbargoed`, `visibleToReader`, `effectiveStatus`). There is no scheduler, no cron job and no key, so a release is never late. The author always sees their own piece; everyone else gets "not found" in lists, direct opens, feeds (RSS/Atom/Apple News/email), publication pages and share cards until the time passes. **Weak point, by design:** this is a client/server read-time filter, not a Firestore rule (a list query cannot be rule-filtered per document), so a determined reader who queries Firestore directly could fetch the document. `tests/journalistEmbargo.test.ts` fails if a known reader stops applying the check. For a genuinely secret embargo, keep the piece as a private draft until release. Known gaps: an embargo-released article is not announced to the social feed or subscribers at the moment of release (nothing runs then), and a NEW reader of the articles collection must remember to call `visibleToReader`.

## 4. Journalist tools (all in `components/journalist/`, logic in `services/journalist/`)

| Tool | Where | Notes |
|---|---|---|
| Story pipeline kanban (PITCH, ASSIGNED, REPORTING, DRAFT, EDIT, LEGAL, SCHEDULED, PUBLISHED) | `NewsroomDesk`, `deskLogic.ts` | Deadlines with overdue / due-in-24h flags. SCHEDULED/PUBLISHED cannot be reached by dragging: `canMoveTo` forces the publish flow. |
| Pitch tracker + assignment | `PitchTracker` | Status machine (`canTransitionPitch`); accepting a pitch creates the story on the desk. Org mode: pick an organization you belong to; assignment lists active members; moves need `MANAGE_CONTENT` via `orgCan`. Without an org it is single-user. |
| Sources and contacts | `SourceManager` | Ground rules per source (on record / background / deep background / off record) enforced by the quote tool. Per-source contact log. Optional sealing of contact + notes with WebCrypto (see below). **Sources are owner-only, never shared with an org.** |
| Interviews | `InterviewNotes`, `quotes.ts` | Record with MediaRecorder; live transcript via the browser speech API where available; paste/import timestamped transcripts; optional Gemini transcription (`transcribeSpeech`, timestamps estimated); quote extractor links quote to timestamp to source, blocks off-record / deep-background, checks a draft quote against the transcript (`verifyQuote`). Audio is **not uploaded**; only the transcript is saved, owner-only, on request. |
| Fact-check workbench | `FactCheckBench`, `factCheck.ts`, `aiAssist.ts` | Claims per article: VERIFIED / UNVERIFIED / DISPUTED, source links, Wayback links (capture-now, latest, availability API; the app never calls archive.org itself). Heuristic and AI flaggers only create UNVERIFIED suggestions. `setClaimStatus` throws for non-human actors; `isTrulyVerified` ignores a VERIFIED record that is not human-set with a source. |
| AP style checker | `StyleHeadlinePanel`, `styleChecker.ts` | Numbers 1-9 / 10+, sentence-start numerals, titles, datelines, attribution verbs, unattributed quotes, passive voice, month / time / percent / ordinal-date formats, spacing. One-click fixes map back to the right block (`locateInBlocks`). A linter, not the AP Stylebook; it does not check facts or fairness. |
| Headline tester | same panel, `headlineTester.ts` | Length, case, clickbait flags, search-result and share-card previews, rule-based variants that add no facts, plus Aria-proposed variants. |
| Byline, credentials, verified badge | `PublicationManager` | Credentials are submitted `SELF_ASSERTED`; **only Plajah staff** (rules: `isAdmin`) can approve or write `journalist_badges/{uid}`. The badge shows as "Verified journalist" on the article header; it is not yet shown on profiles or list cards. Creator Passport id is shown as an attribution record (it is not a cryptographic identity). |
| Embargo, schedule, notices | `ArticleDesk`, `MyArticles` | See sections 2 and 3. |
| Disclosures | `ArticleDesk` | AI-use, sponsored (+ sponsor), affiliate links, conflict of interest (+ note). Shown under the article, in every feed/AMP/ANF/email export, and as list-card badges (Corrected / Retracted / Sponsored / AI-assisted). |
| Image credit and license | `ArticleDesk` | Required before publish. Plajah records the claim; it does not verify licenses. |
| Publications (mastheads) | `PublicationManager`, `PublicationPage`, `publicationLogic.ts` | Name, tagline, sections, editors (display only), corrections policy, ethics link, RSS/Atom, access FREE or SUBSCRIBERS (uses `hasActiveSubscription`, i.e. any Plajah+ subscription, not a per-creator entitlement). **PAID_ISSUES is not wired** (BuyToOwn and `/api/stripe/content-purchase` only support film, book, album, track). |

### Source vault: what the encryption really is
`vaultCrypto.ts`: AES-256-GCM, key = PBKDF2-SHA256 (310,000 iterations, random 16-byte salt) from your passphrase, random 12-byte IV, in the browser via WebCrypto. A database leak or admin sees ciphertext for the sealed fields (contact, notes). Not protected: a weak passphrase, a compromised device/browser, and metadata (name, role, ground rules, the contact log are **not** sealed). No recovery. Not independently audited. Unsealed sources show a visible "Not encrypted" warning.

## 5. Stack wiring

| Surface | What was done |
|---|---|
| ArticleView | Tela body + live follow, correction log, disclosures, Classic view toggle, working Share (native share or copy link), PDF button (print stylesheet that prints only the article, full length). |
| ArticlesFeed / Newstand | Trust badges on cards; Newstand "Newsroom desk" button. Embargoed/draft articles never appear (`isPublic: false`). |
| Share / OG card | Existing server OG route reused. Added for articles: description = deck or body excerpt; an unpublished article shows a generic "Article on Plajah" card (no headline or cover leak). |
| Writers Desk | "Newsroom" button in the header (via the existing `NAVIGATE` event). |
| Creator Hub | Articles load into "Your Projects" with honest status, a "Newsroom" studio panel and a quick chip. |
| Aria | `useAriaSurface` kept. New actions: `suggestHeadlines`, `pickTemplate`, `flagClaims`, `openDesk`. Any Aria edit sets "AI used", which triggers the disclosure warning. Aria can only *flag* claims; it cannot verify. |
| Fabula / Tela broadcast | `broadcastBridge.ts`: article -> lower third (via the Fabula lower-third registry + `openLowerThirdInTela`) and recent headlines -> ticker (Tela ticker collection). Feature-detected; opens in Tela as editable docs. Nothing is pushed into a Fabula timeline automatically. |
| Export | PDF (print), HTML ("AMP-lite", not validated AMP), RSS 2.0 + Atom 1.0 per author and per publication, Apple News Format JSON, email HTML. Server: `routes/articleFeeds.ts` mounted at `/feeds`. Email goes through the existing built-in campaigns service (`sendTest` / `sendCampaign`): consent, postal address, unsubscribe are enforced server-side, and the article email omits its own footer. |

Feed URLs: `/feeds/author/<uid>.rss|.atom`, `/feeds/publication/<slug>.rss|.atom`, `/feeds/article/<id>/amp`, `/feeds/article/<id>/apple-news.json`, `/feeds/article/<id>/email.html`.

## 6. Data model (Firestore)

```
articles/{id}                    + tela, status, publishedAt, bodyText, bodyHtml, wordCount, notices[], disclosures,
                                   imageRights[], embargoUntil, publicationId, section, access, draft
articles/{id}/versions/{vid}     { versionId, articleId, authorId, createdAt, label, bundleJson, noticeId?, previousVersionId? }  write-once
newsroom_stories    {ownerId, orgId?, slug, stage, assigneeId, deadline, articleId, pitchId, ...}   owner or org staff
newsroom_pitches    {ownerId, orgId?, headline, angle, status, responseDue, storyId}                owner or org staff
newsroom_claims     {ownerId, articleId, text, status, statusBy, sources[], suggestedBy}            owner or org staff
newsroom_sources    {ownerId, name, attribution, confidential, vault?, contact?, notes?}           OWNER ONLY
newsroom_source_log {ownerId, sourceId, kind, attribution, summary}                                 OWNER ONLY
newsroom_interviews {ownerId, sourceId?, segments[], transcriptEngine}                              OWNER ONLY
publications        {ownerId, orgId?, name, slug, sections[], editors[], access, correctionsPolicy} public read; owner/org staff write
press_credentials   {ownerId, issuer, kind, reviewStatus}                                           owner; status changed by staff only
journalist_badges/{uid}                                                                             public read; staff write
```
Rules are in `firestore.rules` (articles block, plus a "Journalist toolset" section before `brand_accounts`). **Undeployed, and not run against an emulator or the Rules `:test` API.** Brace balance was checked.

## 7. Not wired / open items

* Visual check of article layout (masthead + stacked story cards) in a browser was not done; only a server-render no-throw check of every device type.
* The Tela editor is not embedded in the article editor. "Fine-tune layout in Tela" saves a draft, writes the local Tela doc and opens Tela; coming back means Newsroom -> Edit -> publish "From: My Tela edits". The Tela doc lives on one device.
* Paid issues (BuyToOwn) need an `issue` kind in `purchaseContent` and the server route. Soft paywall only: locked bodies are hidden by the app and left out of feeds, but the text is readable by anyone querying Firestore directly.
* Article templates (12 article / 12 magazine / catalog) are consumed by feature detection only.
* No Cloud Scheduler job exists for exact embargo release.
* There is no staff review UI for press credentials yet; staff must write `journalist_badges/{uid}` by hand (console or admin tooling).
* Existing `isValidArticle` in the repo rules requires an `id` field and a numeric `timestamp`, which `createArticle` does not send (it uses `serverTimestamp()`). If deployed rules match the repo, article writes already fail today; verify before deploying.
* The feed route lists the whole `articles` collection through the admin REST helper with a 60 s cache (max 2000 docs). Replace with a structured query at scale.
* PDF export is a print stylesheet on the article page, not the Tela frame print path (that path is private to `TelaView`).
