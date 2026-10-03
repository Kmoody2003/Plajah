# Academia Law & Medicine: open curricula with a living knowledge layer

Date: 2026-10-01. Companion to `ACADEMIA_FLAGSHIP_CURRICULUM_BLUEPRINT.md`. Authoring rules for course writers: `ACADEMIA_LAW_MEDICINE_AUTHORING_BRIEF.md`.

## Goal
A full law curriculum and a full medical curriculum, PreK through professional-school depth, without the accreditation. Same knowledge and the same exam-style testing, free and open. Includes the ethics and philosophy behind each field, pharmacology, and international and comparative law. The knowledge stays current: new research and new court rulings feed in continuously.

## Two layers
1. **Courses (static, authored).** `data/lawMedicineRoster.ts` lists every course and stage. Content lives in `data/practice/courses/<id>.ts` (assembled from one file per track in `<id>/tN.ts`). They use the existing Learn map, mastery engine and Learner Ledger, so nothing parallel was invented. Subjects `law` and `medicine` show a PreK to professional ladder.
2. **Living knowledge (dynamic, ingested).** Every lesson from high school up lists `anchors` (cases, statutes, treaties, MeSH topics, drugs, trials, guidelines) and an `asOf` month. `services/livingKnowledge/` watches real sources for those anchors and records an **impact** against each lesson: "this new thing may matter here". Learners see it as a "Recent developments" box, or "This may be out of date" when it could contradict the lesson.

## Sources (verified reachable 2026-10-01)
| Domain | Source | Covers | Notes |
|---|---|---|---|
| Medicine | PubMed E-utilities | systematic reviews, meta-analyses, RCTs, practice guidelines, retraction flags | free; identify with `tool`/`email` params (custom bot User-Agents get redirected to an abuse page); set `NCBI_API_KEY` for 10 req/s |
| Law | CourtListener (Free Law Project) | SCOTUS, federal circuits, **state supreme courts**, precedential opinions, within days | anonymous works at a low rate; set `COURTLISTENER_TOKEN` for more |
| Medicine | FDA MedWatch, CDC MMWR, WHO news (RSS) | safety alerts, public-health reports | |
| International law | UN News law feed (RSS) | news only | **Gap:** no verified machine feed for the ICJ, ECtHR (HUDOC), ICC, WTO, CJEU. Next step: add adapters one by one after confirming each endpoint |

SCOTUS's own RSS and the ICJ press feed returned 404, so they are not used. SCOTUS comes through CourtListener.

## What it does and does not claim
- Items carry the source's own title, date, link and ids. **No AI-written summaries** are stored or shown.
- A lesson is flagged for human review, never edited automatically.
- Evidence tiers: synthesis > guideline > trial. Preprints are marked not peer reviewed and never rank as evidence. Retractions flag the lesson.
- Law: a CourtListener hit for a case name next to "overruled" is a **signal, not a verdict** (courts also write "we decline to overrule"). It is not a citator like Shepard's or KeyCite. Courses must also teach the current state of known shifts (for example agency deference after Loper Bright).
- Court coverage depends on CourtListener's ingestion; some state courts lag.
- International courts are a known gap (above).

## Running it
- Local: `npx tsx scripts/ingestKnowledge.ts` (results in `.cache/living-knowledge/`); `--watchlist` prints what is watched; `--check-feeds` re-verifies feeds.
- Production: `POST /api/cron/living-knowledge?budget=60` with `x-cron-key` (ADMIN_SEED_KEY or CRON_SECRET), driven by Cloud Scheduler (not yet created). Needs `GOOGLE_SERVICE_ACCOUNT_JSON` on the Cloud Run service. Each anchor keeps its own cursor, so a short or failed run resumes without gaps.
- Collections: `knowledge_items` (public read), `knowledge_impacts` (public read; admin may mark reviewed or dismissed), `knowledge_state` (private). **Rules are added to `firestore.rules` but not deployed.**

## Honest limits to state publicly
- Content is AI-drafted and labelled **Draft** until it passes the verification ladder in `contentIntegrity` (cross-checked, sourced, educator-reviewed). Every course has a `docs/review/<id>.uncertain.md` list of claims for expert reviewers. Medicine and law should not be called verified without credentialed review.
- Educational use only; not medical or legal advice. Law is mostly US; international and comparative courses cover the rest.
- Exam-style questions are original. Real USMLE, MBE, LSAT and MCAT items and commercial banks are proprietary and not used.
- Depth: this wave builds the full ladder and a solid spine for each course. A real medical or law school is thousands of hours, so depth grows in later waves driven by the review notes and learner reports.

## Open-sourcing
Recommended: content under **CC BY-SA 4.0** (derivatives stay open), code under the repo's existing licence. All text is originally authored, so no upstream licence is inherited. Next step: `scripts/exportOpenCurriculum.ts` to emit Markdown and JSON per course with licence headers, and a public repo.

## Remaining work
1. Finish authoring the remaining Medicine courses (pre-med, basic sciences, clinical years, ethics, history).
2. Fact-check pass per course (independent reviewer agents), then expert review recruitment through the Education Ledger.
3. Create the Cloud Scheduler job, set secrets, deploy the rules.
4. Admin review queue UI for impacts (mark reviewed, dismissed, with a note).
5. International-court adapters (ICJ, HUDOC, ICC, WTO, EUR-Lex) and ClinicalTrials.gov results.
6. Open-curriculum export and public repo.
