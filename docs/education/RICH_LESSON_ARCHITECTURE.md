# Plajah Academia — Rich Lesson Architecture

## Product contract

A Plajah lesson is not a generated document. It is a source-aware experience graph connecting:

`source → provenance → learning target → media block → learner invitation → response → rubric judgment → Learner Ledger evidence`

The resettable Lesson Studio demo is the first consumer of this contract. Production creation, assignment, live delivery and student playback should consume the same `RichLessonDraft` shape rather than inventing parallel lesson models.

## What is built now

- `data/richLessonStudio.ts`
  - mixed source types: link, file, document, audio, video, image, dataset and 3D model;
  - provider and license/attribution provenance;
  - CCSS, C3 and NCAS standards with student-readable targets;
  - a medium-independent rubric;
  - rich experience blocks with media cues, teacher moves and checks for understanding;
  - six presentation systems: Cinematic Journey, Living Museum, Documentary Desk, Data Story, Field Lab and Socratic Studio;
  - learner evidence, interests, strengths, growth areas, supports and personalized entry points;
  - AI/tool receipts and teacher-review quality gates.
- `data/richLessonDemoStore.ts`
  - observable local state;
  - deterministic reset;
  - template changes and teacher-added sources;
  - a six-stage demo route that never writes to a user or Firestore.
- `components/academia/RichLessonStudioDemo.tsx`
  - the complete no-signup walkthrough;
  - responsive Plajah design-language implementation;
  - source, standards, template, experience, personalization and proof views.
- `tests/richLessonStudio.test.ts`
  - contract coverage, personalization invariants and exact reset behavior.

## Existing platform seams this architecture should use

| Responsibility | Existing Plajah seam | Rich-lesson integration |
|---|---|---|
| Long-context synthesis | `/api/ai/pokee`, used by production intelligence and manuscript continuity | Resolve all extracted source text, metadata, standards, rubric and class aggregates into one reasoned content map |
| Narrative and activity craft | `/api/ai/anthropic` Claude proxy | Turn the content map into a coherent age-appropriate arc, prompts and media cues |
| Teacher-facing orchestration | Aria/Plajah Agent and `ariaContextService` | Collect intent, explain choices, request teacher approval and revise locally |
| Public/cultural sources | Library of Congress sync, Chora Vault, Met/artifact services, archive content service, OER library | Implement `RichLessonSource` resolvers that preserve canonical URL, rights, creator, quote/page/time anchors and retrieval date |
| Rich experiences | Plajah Labs, spatial mixer, gallery, charting, 3D/GLTF, audio and video players | Implement each `LessonBlockKind` with a reusable renderer rather than flattening it to text |
| Standards and rubrics | assignment template service, education standards, OER taxonomy | Validate every criterion against at least one student action and observable evidence block |
| Learner evidence | `learningLedgerService` | Build private learner-context summaries and write back assessed evidence; never expose peer comparison to students |
| Delivery | school chassis, template assignments, notifications, assigned lesson view | Publish a frozen lesson version with per-learner overlays and a common objective/rubric |
| Rights | OER license gate and commercial validation | Re-resolve source rights server-side before publish; link-only sources cannot become hosted copies |

## Production pipeline

1. **Ingest.** Accept files and URLs. Virus scan, MIME-check, hash and store originals. A connector resolves canonical metadata and rights.
2. **Extract.** Produce modality-specific derivatives: OCR with page anchors; audio transcript with timecodes; video transcript/keyframes; image description; dataset schema/statistics; 3D metadata and safe viewer asset.
3. **Normalize.** Convert every item to `RichLessonSource`; preserve quotes as anchored spans, not detached strings.
4. **Reason.** Send a privacy-minimized class summary plus the complete source context to PoKee. Output a sourced content map, contradictions, coverage gaps and candidate standards—not student-facing prose.
5. **Compose.** Claude turns the approved content map into blocks using one selected presentation system. Every factual sentence or quotation references source IDs and anchors.
6. **Validate.** Deterministic gates check rights, quote anchors, standard-task-rubric coverage, accessibility derivatives, duration, reading burden and unsafe learner inferences.
7. **Personalize.** Aria creates a small learner overlay: name, invitation, scaffold, choice and stretch. The common objective, evidence rules and rubric do not change.
8. **Approve.** The teacher sees diffs, receipts and warnings; AI cannot publish.
9. **Deliver.** Freeze a versioned common lesson and separate private learner overlays. Render blocks through Plajah-native media tools.
10. **Learn.** Responses and teacher judgments write evidence to the Learner Ledger. Future personalization uses evidence, not opaque labels.

## Privacy and relationship rules

- Names and individual signals stay out of source reasoning. PoKee receives aggregate class needs unless a teacher explicitly opens a private learner preview.
- A personalized overlay may select supports or examples; it must not disclose diagnoses, compare peers, predict fixed ability or lower the common learning target.
- Store the reason for each personalization and let the teacher override it.
- Keep generated lesson content separate from source records and originals.
- Version sources, lesson core and learner overlay independently so a reset, correction or rights takedown is tractable.

## Required collections

```text
richLessonSources/{sourceId}            canonical metadata, rights, derivatives, anchors
richLessons/{lessonId}                  current lesson metadata and owner
richLessons/{lessonId}/versions/{id}    immutable common lesson draft
richLessons/{lessonId}/overlays/{uid}   private learner invitation/support overlay
richLessons/{lessonId}/receipts/{id}    model/tool/version/input-hash/output-hash receipt
richLessonRuns/{runId}                  assigned class, frozen version, timing and status
richLessonRuns/{runId}/responses/{uid}  learner artifact and evidence refs
```

Firestore rules must make overlays and responses readable only by that learner, their authorized guardians and assigned educators. The common lesson must never embed private learner signals.

## API boundaries to implement next

```ts
interface SourceResolver {
  supports(input: File | URL): boolean;
  resolve(input: File | URL): Promise<RichLessonSource>;
}

interface RichLessonReasoner {
  mapSources(input: SourceContext, classSummary: PrivacySafeClassSummary): Promise<SourcedContentMap>;
}

interface RichLessonComposer {
  compose(map: SourcedContentMap, targets: LessonStandard[], template: LessonTemplateId): Promise<RichLessonDraft>;
}

interface RichLessonValidator {
  validate(draft: RichLessonDraft): Promise<QualityGateResult>;
}
```

Connectors and model lanes must sit behind these interfaces. The core lesson, student renderer and ledger writer must not depend directly on a vendor API.

## Non-negotiable acceptance gates

- A teacher can add at least one URL, PDF, image, audio file and dataset in the same build.
- Every quote opens its page/time/source anchor.
- Every hosted media item has a known allowed use; otherwise it remains link-only.
- Every rubric criterion maps to an observable student action.
- A common lesson renders with and without any learner overlay.
- Reset removes all demo changes and performs no network or persistence write.
- A rights correction can identify every lesson version using a source.
- A learner or guardian export explains why each personalized support appeared.
- Keyboard, captions/transcript, alt descriptions and reduced motion work for every block renderer.

## Honest boundary

The resettable demo, data contract, six presentation systems, personalization logic and routing are built. Live multi-file upload, connector resolution, persisted versioning, PoKee/Claude orchestration, rich block renderers and per-learner Firestore overlays remain production work. They should be implemented behind the boundaries above, not simulated or claimed as shipped.

