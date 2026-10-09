# Editorial & Copyright Council

A team of editors that helps an independent author the way a publisher would: it reads the book (or article), says what is working, gives a plain professional assessment, raises copyright and journalistic-integrity questions, and leaves every decision with the author. Same two-layer shape as the Art, Music and Motion councils.

**Not legal advice. AI editors are not human editors.** Both are stated in the UI, in every prompt, and in every report.

## Where it lives

| Piece | Path |
|---|---|
| Types, roster, casting | `services/editorial/council/editorialTypes.ts`, `editorialEditors.ts` |
| Lens data (spread into the roster) + `ARIA_EDITORIAL_COUNCIL_METHOD` + intent routing | `services/aria/ariaCreativeRoles.ts` (`EDITORIAL_DIRECTOR`) |
| Deterministic reading | `editorialMetrics.ts`, `editorialLocal.ts`, `editorialRights.ts`, `editorialJournalism.ts` |
| Deliberate (AI) layer | `editorialChunker.ts`, `editorialPrompts.ts`, `editorialRoutes.ts` |
| Decisions and pushback | `editorialDecisions.ts` |
| Client door and mounts' adapters | `editorialService.ts`, `editorialAdapters.ts` |
| UI | `components/editorial/council/` (`EditorialCouncilRoom`, `EditorialCouncilPanel`, `EditorialReportView`) |
| Mounted in | ebook submission Check step (`components/bookSubmit/StepPreflight.tsx`), book studio toolbar (`BookAuthoringStudio.tsx`, "Editors"), Article Desk ("Council review" tab) |
| Server | `POST /api/editorial/review`, `GET /api/editorial/{editors,sessions,sessions/:id,prefs}`, `POST /api/editorial/sessions/:id/{decision,reply}` registered in `server.ts` |
| Persistence | `users/{uid}/editorial_sessions/{id}`, `users/{uid}/editorial_prefs/main` (owner-read only in `firestore.rules`; **rules not deployed**) |
| Tests | `npm run test:editorial` (`tests/editorialCouncil.test.ts`) |

## The roster (18)

Each has a background, genres, voice, signature questions, research beats, blind spots, and standing arguments authored as pairs so both sides always state their half.

- **Developmental:** Literary (literary fiction), Genre (thriller, romance, SF/F, mystery, horror), Young Readers' (picture books, MG, YA), Memoir & Narrative Non-fiction, Expository & Trade Non-fiction (self-help, business, academic trade), Poetry & Short-form, Serial & Web-fiction (episodic pacing, screenplay-adjacent).
- **Craft:** Line & Copy (Chicago/AP, consistency), Proofreader.
- **Publishing:** Acquisitions & Market (comps, positioning, title/cover/blurb, price, honest market reality), Publishing-Operations (front/back matter, metadata, categories, ISBN, formats).
- **Responsibility:** Sensitivity & Accuracy (flags and questions, never censorship), Copyright & Permissions voice (says it is not a lawyer), Verification Editor and Journalism Ethics Editor.
- **Readers and traditions:** Reader Advocate (a first-time buyer), World-Literature & Translation, Oral & Traditional Narrative (non-Anglo structures, community consent).

Casting (`castEditors`) always seats the Copyright voice and the Reader Advocate, adds journalism editors for articles/newsletters, drops developmental editors for journalism, and guarantees at least one standing argument is in the room.

## Method

Rounds mirror the art council: **MAP** (long books) -> **PROPOSE** (every editor reads in parallel) -> **DISPUTE** (each names the read they most disagree with) -> **SYNTHESISE** (Aria picks lead / counterpoint / editor, without averaging, and puts the strongest dissent inside each verdict) -> **REFLECT** (each editor leaves a working note on the session). Only Aria speaks to the author; editors speak to the team.

**Long books.** The manuscript is split on paragraph boundaries into ~2,000-word chunks; each is summarised by a model (4 at a time; a failed chunk degrades to its honest opening). Editors then read a digest (verbatim chapter openings, summaries, verbatim standout lines) of at most ~9,000 words, and are told they are reading a digest. Pieces up to 7,000 words are read whole. Hard cap 400,000 words per review.

**No invented quotations.** Every quote a model returns is searched for in the real text (`locateQuote`). A quote that is not there is dropped (praise that cannot be quoted is treated as flattery), the report says how many were dropped, and a note with an unverifiable quote loses its anchor rather than keeping a false one.

## Output contract (guidance, not orders)

1. **What is working**: specific, quoted passages with chapter and offset.
2. **Honest assessment** per dimension (premise, structure, character, voice, pacing, prose, market fit, readiness; for journalism: sourcing, fairness, harm, transparency, clarity, readiness) in words: *Strong / Developing / Needs a rethink*, or *Not judged offline* when only counting was possible. Never numbers.
3. **Notes are options**, two to four ways to handle each, ending **"Your call: X would change if you..."**. Command phrasing ("you must") is stripped from options.
4. **Disagreement is surfaced**, not hidden.
5. **Severity** on every note: *Craft*, *Clarity*, or *Risk* (legal/ethical).
6. **The author decides.** Accept / Adapt / Decline per note, recorded with an optional reason. A declined note's fingerprint is stored in `editorial_prefs/main` and filtered from every later read, so the council does not nag; changing your mind un-declines. "Push back" sends a reply to the editor, who reconsiders honestly (holds, softens with revised options, or withdraws); the stance is recorded.
7. **The text is never rewritten** unless the author asks; then variants are offered, clearly marked as suggestions in the author's voice (prompt rule; there is no auto-apply anywhere in the code).
8. **Anti-sycophancy:** honest when unflattering, kind in delivery; praise only what can be quoted; never "ready to publish"; at least one hard thing per editor unless there truly is none, in which case they say so. If every editor returns praise only, the report adds a scepticism line.

## What is deterministic and what is AI

| Deterministic (always works, no model, runs in the browser) | AI (server, needs `ANTHROPIC_API_KEY`) |
|---|---|
| Readability (Flesch), sentence and paragraph length/variance, adverb density, filter words, dialogue share, repeated 4-grams, passive voice, chapter-length curve, chapter-opening hooks, POV-drift heuristic, show-vs-tell patterns, front/back matter, proofing slips (doubled words, spacing, quote balance) | Reading premise, character, structure, voice, market fit; chunk summaries; per-editor notes; disputes; Aria's synthesis; reconsidering after pushback |
| Rights checklist (see below), journalism mechanics (see below) | The ethics and sensitivity judgement around them |

Every metric ships with an explanation of what was counted, why an editor cares, and when to ignore it. None is presented as a verdict. A tool-only read can say "Developing" at most for voice/prose/pacing/structure; it never tells an author to rethink a book (only *readiness* can reach "Needs a rethink", on rights/proofing/presentation counts or a text too short to read). If the model is unavailable, the offline read is returned with a line saying so.

## Rights & permissions (local-first)

*This is not legal advice; consult a qualified attorney for decisions.* (Printed prominently in the UI and prompts.)

Checks: long verbatim quotations (45+ words in quotes), epigraphs (attribution-line pattern), lyric-like runs of short unpunctuated lines (stronger flag when song words nearby), trademark names in the title (a small list), named real people in non-fiction/memoir/articles (defamation and privacy question prompts), declared AI use without a description, missing copyright holder / licence / ISBN plan, article image credit and rights-basis completeness, AI-generated image without disclosure. Public-domain helper (`publicDomainHint`: US rule of thumb that works first published 96+ years ago are public domain in a given year, plus life+70 pointer; warns that editions, translations and illustrations carry their own rights) and `gutenbergSearchUrl` (link only). **Similarity hook:** `SimilarityChecker` interface plus a local `shingleSimilarity` that compares your text with a text *you supply* by exact six-word sequences; labelled "Not a plagiarism guarantee". No scraping, no web search. The council does **not** register copyright.

Official pointers (fetched 2026-10-08): U.S. Copyright Office registration <https://www.copyright.gov/registration/> and Fair Use Index <https://www.copyright.gov/fair-use/>; WIPO overview <https://www.wipo.int/copyright/en/>. Other-jurisdiction pages (e.g. UK, Canada) were not fetched and are deliberately not linked.

## Journalistic integrity

The lenses are the Verification Editor and the Ethics Editor, grounded in public codes. Text of the codes is **paraphrased, never reproduced**; follow the links.

| Source | URL | Verified |
|---|---|---|
| SPJ Code of Ethics: Seek truth and report it; Minimize harm; Act independently; Be accountable and transparent | <https://www.spj.org/spj-code-of-ethics/> | Fetched 2026-10-08, four headline principles confirmed (`spj.org/ethicscode.asp` returns 404) |
| Thomson Reuters Trust Principles | <https://www.thomsonreuters.com/en/about-us/trust-principles.html> | Fetched, confirmed |
| The Elements of Journalism (Kovach & Rosenstiel): obligation to truth, loyalty to citizens, discipline of verification, independence, power monitoring, public forum, relevance, comprehensiveness/proportion, conscience | <https://www.americanpressinstitute.org/> (site root only) | **Not verified.** The specific API page I tried returned an unrelated studies page and Wikipedia 404'd; the nine principles are from my knowledge of the book. Check against the book. |
| AP News Values and Principles | <https://www.ap.org/about/news-values-and-principles/> | **Not verified.** The fetch tool is blocked from ap.org. The three themes paraphrased in code are a general summary. |
| NPR Ethics Handbook | <https://www.npr.org/about-npr/688875732/these-are-the-standards-of-our-journalism> | **Not verified.** `ethics.npr.org` redirects here; the page timed out. |

Philosophy underneath (in `JOURNALISM_PHILOSOPHY`): public interest vs public curiosity, proportionality of harm, verification vs assertion, transparency about method, anonymous-source ethics, conflicts of interest, correcting the record, advocacy vs reporting vs opinion labelling, AI-content disclosure. Press-law orientation (libel/actual malice, privacy, shield laws) is general and ends with the not-legal-advice line.

Mechanics (all phrased as questions; the editors do not convict): attribution gaps (via the existing `detectCheckableClaims`), single-source, vague attribution ("experts say"), loaded language, unattributed and trimmed quotations, headline-body mismatch (missing numbers, low key-word overlap, absolutes), opinion without a label, minors/victims/suicide/overdose handling, accusation without allegation wording, undisclosed conflicts and sponsorship, AI-use vs disclosure, image credit completeness, and a read-only view of the fact-check workbench. **The council never marks a claim verified**: `articleToManuscript` only reads claims, a claim whose "VERIFIED" status was not set by a human with a source counts as unverified (the existing `isTrulyVerified`), and a test scans the journalism code for any write to claim status.

## Limits

- AI editors can misread tone, miss context only the author holds, and be confidently wrong. They are not human editors and do not replace one.
- Premise, character and market fit cannot be judged by counting. The offline read says "Not judged offline" rather than guessing.
- The metrics are patterns: a thriller should have short sentences, a memoir may live in the passive, repetition can be a refrain in oral-tradition writing.
- Rights checks are pattern matches. They miss paraphrase, translation, unquoted lyrics and unnamed people, and they cannot tell fair use from infringement.
- The similarity helper compares only the text you give it.
- Not legal advice. Not a plagiarism guarantee. Not a copyright registration.

## Daily cap

Server-verified tier, never the body: FREE 2, CREATOR 6, PLAJAH_PLUS 15, PRO 40 AI reviews a day (counted as `editorialRuns` in `users/{uid}/muse_usage/{day}`). The offline read is free and unlimited in the browser.

## What to tell authors (plain English)

> Ask the editors and you get a read like a publisher's: first, what is working, with the exact lines quoted; then an honest verdict on each part of the book in plain words, never a score; then notes that give you a few ways to handle each problem, and say what would change their mind. If the editors disagree, you see the disagreement. You can accept, adapt, or decline every note, or push back and make them reconsider, and anything you decline will not come back. They will not rewrite your book unless you ask. They are AI: they can be wrong, and they are not a lawyer, so anything about copyright, quotes, lyrics or real people is a question to take seriously, not legal advice.
