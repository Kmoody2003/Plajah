# Grounding Layer: NotebookLM-style source packs + Perplexity-style cited answers

Status: SPEC (scoped 2026-11-17, build planned later this week). Nothing here is built yet.
Goal: more agentic capability, accuracy and trustworthiness across the platform through ONE shared layer.

## 0. The rule

**A claim may only exist in an answer if it points at a source passage.** Unsupported claims are
removed or flagged. "Not found in your sources" is a valid, preferred answer. Every AI surface
(Aria, councils, Grants, Education, Tela, Build, Lectio) calls this layer instead of doing its own retrieval.

## 1. Compute lanes (decided 2026-11-17)

Order, for every grounding workload (embed, rerank, answer, verify):

| # | Lane | Where | Who | Notes |
|---|------|-------|-----|-------|
| 1 | **Desktop native GPU** | WinUI `NativeLlmService` (llama.cpp, Vulkan/RTX) via the LOCAL_LLM_* bridge | everyone on the Windows app | default; free, private, offline |
| 2 | **Browser WebGPU** | Transformers.js (same lane as `services/aria/ariaLocalModel.ts`) | everyone on web | small models only; honest about limits; respects the "never two models at once" 4 GB rule |
| 3 | **Plajah+ cloud (Gemini)** | `services/ai/geminiLane.ts` | **Plajah+ paid tier only** | consent + cost/time estimate first (`aiLane.ts`), `cloudConsent:true` on server routes (428 otherwise) |
| 4 | **No-model fallback** | keyword search + show raw passages | everyone | still cited, just no synthesis |

- Free users without a qualifying PC never silently hit the cloud. They get lane 2 or 4, plus an upgrade prompt for lane 3.
- Privacy-sensitive packs (grants, student records, org files) are **local-only unless the user consents per pack**.
- Pick the lane with the existing `aiLane.ts` GPU tiers + self-calibrating tok/s. Record which lane produced each answer (shown in the receipt, section 5).
- Verify: how Plajah+ is represented today (`services/aria/ariaTier.ts`, `AGENT_TIERS` in `services/agentService.ts`) before wiring the gate. Reuse it; do not add a second tier system.

## 2. What exists today (verified by skim 2026-11-17, re-check before building)

- `services/sourceVaultService.ts`: an **encrypted record vault** (passphrase, Firestore). Not a retrieval index. Do not overload it.
- `services/livingKnowledge/*` (PubMed, CourtListener, feeds): already carries **evidence tiers** (`EvidenceTier`) and "never invent content, carry the source's own title/link". This is the model for source-tier labels.
- `services/ai/{aiLane,geminiLane,localLane}.ts`: lane selection, pricing, desktop bridge. Reuse.
- `nativeLlmChat` / `nativeLlmLook` in `services/windowsBridgeService.ts`: chat + vision only. **There is no embedding message on the bridge yet** (needs `LOCAL_LLM_EMBED`, see 6.1).
- `services/ariaContextService.ts` + `services/aria/ariaContext.ts`: user context for the Aria system prompt. Becomes one source type.
- `services/liveDocSource.ts`, `services/dataCommons/*`, `services/scriptureSearch.ts`, `services/sacredResearch.ts`, `services/dossier/*`, `services/council/*`, `services/agentService.ts`: surfaces/sources to plug in.
- No shared chunk/embed/retrieve/cite code found.

## 3. Data model (`services/grounding/types.ts`)

```ts
type SourceKind = 'upload' | 'tela-doc' | 'meeting' | 'pdf' | 'url' | 'org-file' | 'class-material'
                | 'scripture' | 'federal-data' | 'case-law' | 'pubmed' | 'web';
interface Source   { id; packId; kind; title; url?; tier: EvidenceTier|'user'|'web'; fetchedAt; contentHash; ownerUid; orgId?; acl }
interface Chunk    { id; sourceId; text; start; end; page?; heading?; embedding?: Float32Array; embedModel; }
interface Pack     { id; name; ownerUid; orgId?; sourceIds[]; localOnly: boolean; createdAt; updatedAt }
interface Claim    { text; cites: { chunkId; quote; start; end }[]; verdict: 'supported'|'partial'|'unsupported'; }
interface Answer   { claims: Claim[]; confidence: 'high'|'medium'|'low'; lane; receipt: ReceiptStep[]; notFound?: string[] }
```

- Chunks are deterministic by `contentHash` so re-ingesting never duplicates (same idea as living-knowledge ids).
- Embeddings are tagged with `embedModel`; a model change re-embeds lazily. Never mix vectors from different models in one query.
- Storage: chunk text + metadata in Firestore (cloud-saved, synced, per the sync-everywhere rule); vectors cached **on device** (IndexedDB / desktop disk) and rebuilt locally. Plajah+ users can optionally sync vectors. ACLs follow the org-permission model (department-scoped; org admins blocked from content they should not see) and the account wall (org files never cross accounts).

## 4. Pipeline (`services/grounding/`)

1. **ingest**: extract text (PDF reader in `/api/tela/pdf`, Tela docs, transcripts, URLs through a server fetch proxy), chunk (structure-aware: headings/pages, ~300–500 tokens, 15% overlap), embed (lane 1/2/3).
2. **retrieve**: hybrid = BM25 keyword + vector, merged (RRF), then rerank top 30 → 8. Respect pack scope + ACL at query time.
3. **answer**: model is given numbered passages only and must return structured claims with chunk ids (JSON schema), no free text outside claims.
4. **verify**: second pass per claim: "does this passage support this claim?" → supported / partial / unsupported. Strict rules for numbers, dates, names, direct quotes (**quotes must match the chunk verbatim, checked in code, not by the model**), and scripture/legal/medical references (**looked up from the canonical source, never generated**).
5. **compose**: drop or flag unsupported claims; add confidence; if retrieval is thin or sources conflict, return a clarifying question or "not found in your sources".
6. **receipt**: log queries run, sources opened/rejected, lane used, time, cost. Shown as a collapsible "what I did" trail.

Live web (Perplexity part): server-side fetch-and-read (read the page, don't trust snippets), source-tier labelling (primary > reputable secondary > general web), dedupe by canonical URL. Search itself is cloud by nature, so **web search is Plajah+ (lane 3) or user-supplied URLs on lanes 1–2**.

## 5. UI contract (shared components in `components/grounding/`)

- `CitedAnswer`: numbered inline citations, hover = quote, click = open source scrolled to the passage and highlighted.
- `SourcePackPanel`: add/remove sources, per-pack local-only toggle, index status ("embedding 12/40 on your GPU").
- `ReceiptTrail`: collapsible agent steps.
- `ConfidenceChip` + "unsupported removed (n)" affordance.
- `AskThisSource`: one hook (`useGroundedChat(packId | context)`) any surface drops in.

## 6. Work breakdown

### 6.1 Desktop embedding + rerank lane (C#, WinUI)
- Add `LOCAL_LLM_EMBED` / `LOCAL_LLM_EMBED_RESULT` to the bridge (+ `LOCAL_LLM_RERANK`), in `windows/Services/NativeLlmService` and `services/windowsBridgeService.ts` (`nativeLlmEmbed`).
- Model: small GGUF embedder (bge-small / nomic-embed class) in the `localModelInstaller` catalog; reranker can be the chat model with a scoring prompt first.
- Needs a **new package build** (see desktop-api-proxy memory: installed app only picks up C# changes after repackaging).
- Browser fallback: Transformers.js embedder (`all-MiniLM` class) in a worker.

### 6.2 `services/grounding` core + tests
- types, chunker, hybrid index (IndexedDB + desktop), retrieve, answer schema, verifier, composer, receipt.
- Pure functions first so they unit-test without a GPU. **Eval harness** from day 1 (section 7).

### 6.3 Server routes (`/api/grounding/*`)
- `fetch` (URL read + extract), `embed` and `answer` for lane 3 only, gated by Plajah+ + `cloudConsent:true` + cost estimate, reusing `geminiLane`.
- Rate limits and per-user budget so one user cannot burn the owner's Gemini quota. Users never consume owner accounts for anything outside Plajah+.

### 6.4 Flagship surface: Aria
- "Chat with sources" in Aria + Aria meetings (notes link to transcript timestamps; ask across past meetings). Chosen first because transcripts/context already exist and the UX is easiest to judge.

### 6.5 Fan-out (one PR each, after 6.4 is accepted)
| Surface | Grounded in | Extra rule |
|---|---|---|
| Grants (Elevate) | org data + federal sources (Data Commons) | verifier checks eligibility language; local-only by default |
| Education / Academia | assigned class material only | students never get answers outside the assigned pack; worksheet keys stay server-side |
| Tela docs | "Ask this document" + pre-export fact-check pass | |
| Build (CAD/BIM) | code sections (`codeCheck`) | hazards/recalls always surfaced (safety-first rule) |
| Lectio / sermon prep | `scriptureSearch`, `sacredResearch` | scripture quoted from the canonical text only |
| Living knowledge (Law/Medicine) | already tiered | reuse the tier labels in the UI |

### 6.6 Outputs (NotebookLM-style, after core)
Briefing doc, study guide, FAQ, timeline, mind map (Tela doc/figure), **audio overview** (script from grounded claims → On-air host voices or Chora; local TTS first). Each output keeps its citations.

## 7. Accuracy + trust measurement

- **Eval harness** (`scripts/grounding-eval.ts`, runs in CI like the other `test:*`): per vertical, a fixed question set with gold answers + gold passages. Metrics: citation precision (cited passage really supports claim), recall, unsupported-claim rate after verifier, "correctly said not found" rate, per-lane latency/cost. **Run on every lane** (local small model is the weakest; the numbers tell us when a surface must require the stronger lane).
- Regression gate: a drop in citation precision blocks merge.
- Adversarial cases: prompt-injection text inside sources (sources are data, never instructions), conflicting sources, stale sources (`fetchedAt` shown), missing answer.
- Agent actions: agents may draft; **send/publish/spend always need explicit approval**; actions are in the receipt.

## 8. Risks / open questions

1. Local small models are weaker verifiers than Gemini. Mitigation: deterministic checks in code (quote match, number/date match, ID lookups) carry the load; model verification is a second layer; per-surface minimum lane for high-stakes verticals (grants, legal, medical).
2. Vector sync cost/size vs rebuild time on device: start device-local, measure.
3. Embedding model choice and licence (must be redistributable). Pick before 6.1.
4. Web search provider for Plajah+ (Gemini search grounding vs separate provider): decide in 6.3.
5. Memory budget on web: embedder + chat model must never both be resident (see ariaLocalModel rule).
6. Copyright: web/PDF chunks are quoted briefly with attribution, never reproduced wholesale in outputs.
7. Minors/education: student-facing packs follow the learning-support and consent rules.

## 9. Suggested order (this week)

1. Decide embedding model + confirm Plajah+ tier hook (half day).
2. 6.2 core with tests and eval harness skeleton, browser embedder first so it runs without the C# rebuild (1–2 days).
3. 6.1 desktop embed bridge + package build (1 day).
4. 6.4 Aria "chat with sources" + meetings (1–2 days), browser-check it.
5. 6.3 Plajah+ cloud lane + gating.
6. Fan out 6.5, then 6.6.

Definition of done for step 4: ask a question over a pack on the desktop GPU with no network, get a cited answer where every claim opens the right passage, an unanswerable question returns "not found", and the receipt shows lane = desktop.
