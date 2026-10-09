/**
 * safetyPolicy — the ONE place that turns classifier signals into a moderation decision.
 *
 * PURE: no I/O, no env, no clock (callers pass `now` where needed). Unit tested in
 * tests/safetyPolicy.test.ts. Imported by the server pipeline (services/safety/mediaSafetyServer.ts)
 * and by the client (moderation visibility helpers at the bottom), so keep it dependency-free.
 *
 * Product rules (owner, 2026-10-08):
 *   1. Illegal content — CSAM above all — never stays up.
 *   2. Creative work is NOT flagged: horror art, anatomy, figure drawing, film SFX, fashion, music video.
 *   3. A single classifier score NEVER removes art. Removal needs a hash match or two independent
 *      signals agreeing. Uncertain → stays up (maybe blurred) and goes to a human, not to deletion.
 *
 * Decision ladder (first match wins):
 *   a. Any positive hash match (PhotoDNA / PDQ / CSAI)            → csam_block_and_report
 *   b. Gemini "sexualized_minor" AND a second signal agrees, not fictional → csam_block_and_report
 *   c. Sexualized-minor suspicion from one signal / fictional depiction → human_review, HIDDEN, csam queue
 *   d. Real-world extreme gore with two signals agreeing          → block (appealable, still reviewed)
 *   e. Graphic content that is fictional/artistic                 → blur_interstitial (viewer opt-in)
 *   f. Graphic content with one signal only / unclear             → human_review, BLURRED meanwhile
 *   g. Sexual: explicit + non-artistic + two signals              → block ; artistic → blur ; moderate → label
 *   h. Self-harm                                                  → blur + priority review (wellbeing)
 *   i. Nothing scanned (all providers failed)                     → allow, scanComplete=false (sweep retries)
 *   j. Otherwise                                                  → allow
 */

// ── Inputs ────────────────────────────────────────────────────────────────────

export type SafetySurface =
  | 'post' | 'avatar' | 'dm' | 'video' | 'album_art' | 'live_frame' | 'comment' | 'tela' | 'book';

export const SAFETY_SURFACES: readonly SafetySurface[] =
  ['post', 'avatar', 'dm', 'video', 'album_art', 'live_frame', 'comment', 'tela', 'book'];

export interface HashMatchSignal {
  source: 'photodna' | 'pdq' | 'csai';
  matched: boolean;
}

/** omni-moderation-latest category_scores (0..1). `sexual/minors` is TEXT-only on that model. */
export type OpenAiScores = Partial<Record<
  | 'sexual' | 'sexual/minors' | 'violence' | 'violence/graphic'
  | 'self-harm' | 'self-harm/intent' | 'self-harm/instructions'
  | 'harassment' | 'hate' | 'illicit' | 'illicit/violent', number>>;

export type GeminiVerdict =
  | 'safe'                 // nothing notable
  | 'sensitive_artistic'   // nudity/gore/darkness inside clearly creative, medical or educational work
  | 'sexual_adult'         // sexually explicit adult content
  | 'graphic_fictional'    // gore that is fictional: SFX, horror art, games, illustration
  | 'graphic_real'         // real-world injury / death / violence
  | 'sexualized_minor'     // a minor depicted in a sexualized way (any medium)
  | 'uncertain';

export interface GeminiSignal {
  verdict: GeminiVerdict;
  isArtistic: boolean;
  minorsPresent: 'none' | 'possible' | 'likely';
  realVsFictional: 'real' | 'fictional' | 'unclear';
  reason: string;
}

export interface SafetySignals {
  hashMatch?: HashMatchSignal | HashMatchSignal[];
  openai?: OpenAiScores;
  gemini?: GeminiSignal;
  /** Providers that were configured but failed (e.g. 'openai:http_500'). */
  providerErrors?: string[];
  /**
   * Gemini refused to answer. 'prohibited' = blockReason PROHIBITED_CONTENT (Google's non-configurable
   * filter, aimed primarily at CSAM) — treated as ONE signal: hidden + csam review, never auto-reported.
   */
  geminiRefused?: 'prohibited' | 'safety';
}

export interface SafetyContext {
  surface: SafetySurface;
  /** Labels the creator applied themselves (ContentLabel values). */
  creatorLabels?: string[];
  /** The upload came from a creative tool / creator flow (Tela, Fabula, album art, book cover…). */
  isCreativeWorkUpload?: boolean;
}

// ── Outputs ───────────────────────────────────────────────────────────────────

export type SafetyAction =
  | 'allow' | 'label' | 'blur_interstitial' | 'human_review' | 'block' | 'csam_block_and_report';

/** Same vocabulary as Post.contentLabels so the existing SensitiveContentGate understands them. */
export type SafetyLabel = 'GRAPHIC_VIOLENCE' | 'MATURE_18' | 'ARTISTIC_NUDITY' | 'SENSITIVE_OTHER';

/** How the content shows WHILE a human_review is pending (and for the final action). */
export type InterimDisplay = 'normal' | 'label' | 'blur' | 'hidden';

export type ReviewQueue = 'none' | 'standard' | 'priority' | 'csam';

export interface SafetyDecision {
  action: SafetyAction;
  labels: SafetyLabel[];
  /** Internal, for moderators / logs. Never shown verbatim to the uploader. */
  reason: string;
  /** Short, rule-based copy that is safe to show the uploader (null when nothing to say). */
  userFacingRule: string | null;
  display: InterimDisplay;
  reviewQueue: ReviewQueue;
  /** false when no provider produced a signal — the sweep must retry (scanStatus:'unscanned'). */
  scanComplete: boolean;
}

// ── Thresholds (named so the doc + tests reference the same numbers) ─────────

/** OpenAI `sexual` score that corroborates a Gemini sexualized-minor verdict. */
export const MINOR_CORROBORATION_SEXUAL = 0.5;
/** OpenAI `sexual` score that makes a "minors possible" Gemini read worth a csam-queue look. */
export const MINOR_POSSIBLE_SEXUAL_REVIEW = 0.3;
/** OpenAI `violence/graphic` at/above → graphic content (label + interstitial or review). */
export const GORE_GRAPHIC = 0.7;
/** OpenAI `violence/graphic` at/above, plus Gemini graphic_real → block (two-signal agreement). */
export const GORE_EXTREME = 0.9;
/** OpenAI `violence` (non-graphic) at/above → just a label. */
export const VIOLENCE_LABEL = 0.6;
/** OpenAI `sexual` at/above → MATURE_18 label (viewer settings decide blur). */
export const SEXUAL_LABEL = 0.6;
/** OpenAI `sexual` at/above → forced interstitial. */
export const SEXUAL_EXPLICIT = 0.85;
/** OpenAI `self-harm` (or /intent) at/above → blur + priority review. */
export const SELF_HARM_REVIEW = 0.6;
/** OpenAI `self-harm/instructions` at/above → hidden pending review. */
export const SELF_HARM_INSTRUCTIONS_HIDE = 0.5;

/** Surfaces with no room for a viewer interstitial (shown tiny, everywhere, without consent). */
const NO_INTERSTITIAL_SURFACES: ReadonlySet<SafetySurface> = new Set(['avatar']);

// ── Helpers ───────────────────────────────────────────────────────────────────

const score = (s: OpenAiScores | undefined, k: keyof OpenAiScores): number => {
  const v = s?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

const hashes = (h: SafetySignals['hashMatch']): HashMatchSignal[] =>
  !h ? [] : Array.isArray(h) ? h : [h];

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

function decide(
  action: SafetyAction, display: InterimDisplay, reviewQueue: ReviewQueue,
  labels: SafetyLabel[], reason: string, userFacingRule: string | null, scanComplete = true,
): SafetyDecision {
  return { action, display, reviewQueue, labels: uniq(labels), reason, userFacingRule, scanComplete };
}

const RULE_CSAM = 'Plajah has zero tolerance for content that sexualizes minors.';
const RULE_GORE = 'Real-world graphic violence is not allowed on Plajah.';
const RULE_SEXUAL = 'Sexually explicit content is not allowed on Plajah.';
const RULE_SELF_HARM = 'Content that instructs or encourages self-harm is not allowed. If you are struggling, help is available.';
const RULE_REVIEW = 'This upload is being reviewed by the Plajah safety team.';

/**
 * Collapse a creative context: Gemini calling it artistic, the creator labelling it, or the
 * upload coming from a creative tool. Any one of these makes a lone classifier score non-removing.
 */
function creativeEvidence(g: GeminiSignal | undefined, ctx: SafetyContext, label: SafetyLabel | null): boolean {
  if (g && (g.isArtistic || g.verdict === 'sensitive_artistic' || g.verdict === 'graphic_fictional' || g.realVsFictional === 'fictional')) return true;
  if (label && ctx.creatorLabels?.includes(label)) return true;
  return !!ctx.isCreativeWorkUpload && (!g || g.realVsFictional !== 'real');
}

/** A blur result on a surface that cannot host an interstitial becomes a hidden human review. */
function surfaceAdjust(d: SafetyDecision, ctx: SafetyContext): SafetyDecision {
  if (!NO_INTERSTITIAL_SURFACES.has(ctx.surface)) return d;
  if (d.action === 'blur_interstitial' || (d.action === 'human_review' && d.display === 'blur')) {
    return { ...d, action: 'human_review', display: 'hidden', reviewQueue: d.reviewQueue === 'none' ? 'standard' : d.reviewQueue,
      reason: `${d.reason}; ${ctx.surface} cannot show an interstitial`, userFacingRule: d.userFacingRule ?? RULE_REVIEW };
  }
  return d;
}

// ── The decision function ─────────────────────────────────────────────────────

export function decideSafety(signals: SafetySignals, ctx: SafetyContext): SafetyDecision {
  const { openai, gemini } = signals;
  const hashList = hashes(signals.hashMatch);
  const anySignal = hashList.length > 0 || !!openai || !!gemini || !!signals.geminiRefused;

  // a. Hash match: a known, verified CSAM image. No classifier opinion can override this.
  const hit = hashList.find(h => h.matched);
  if (hit) {
    return decide('csam_block_and_report', 'hidden', 'csam', [], `hash match (${hit.source})`, RULE_CSAM);
  }

  if (!anySignal) {
    // i. Nothing ran (no providers configured, or every one failed). Do not pretend it was approved.
    const errs = signals.providerErrors?.length ? `provider errors: ${signals.providerErrors.join(', ')}` : 'no provider produced a signal';
    return decide('allow', 'normal', 'none', [], `unscanned — ${errs}`, null, false);
  }

  const sexual = score(openai, 'sexual');
  const gore = score(openai, 'violence/graphic');
  const violence = score(openai, 'violence');
  const selfHarm = Math.max(score(openai, 'self-harm'), score(openai, 'self-harm/intent'));
  const selfHarmHowTo = score(openai, 'self-harm/instructions');
  const textMinors = score(openai, 'sexual/minors'); // only populated when text was moderated too

  // b/c. Sexualized minors.
  const geminiMinor = gemini?.verdict === 'sexualized_minor';
  const secondMinorSignal = sexual >= MINOR_CORROBORATION_SEXUAL || textMinors >= MINOR_CORROBORATION_SEXUAL;
  if (geminiMinor && secondMinorSignal && gemini!.realVsFictional !== 'fictional') {
    return decide('csam_block_and_report', 'hidden', 'csam', [],
      `two-signal agreement on sexualized minor (gemini + openai sexual=${sexual.toFixed(2)})`, RULE_CSAM);
  }
  if (geminiMinor || textMinors >= MINOR_CORROBORATION_SEXUAL) {
    // One signal, or a fictional depiction (drawn/animated). Still prohibited, still hidden — but a
    // trained human decides whether it is reportable before anything leaves the building.
    return decide('human_review', 'hidden', 'csam', [],
      geminiMinor && gemini!.realVsFictional === 'fictional'
        ? 'fictional depiction of a sexualized minor (gemini)'
        : 'single-signal sexualized-minor suspicion', RULE_REVIEW);
  }
  if (signals.geminiRefused === 'prohibited') {
    return decide('human_review', 'hidden', 'csam', [], 'gemini refused: PROHIBITED_CONTENT', RULE_REVIEW);
  }
  if (gemini?.minorsPresent === 'likely' && sexual >= MINOR_POSSIBLE_SEXUAL_REVIEW) {
    return decide('human_review', 'hidden', 'csam', [],
      `minor likely present with sexual score ${sexual.toFixed(2)}`, RULE_REVIEW);
  }
  if (gemini?.minorsPresent === 'possible' && sexual >= MINOR_POSSIBLE_SEXUAL_REVIEW) {
    return surfaceAdjust(decide('human_review', 'blur', 'csam', ['SENSITIVE_OTHER'],
      `minor possibly present with sexual score ${sexual.toFixed(2)}`, null), ctx);
  }

  // h (first half). Self-harm instructions: hidden pending review.
  if (selfHarmHowTo >= SELF_HARM_INSTRUCTIONS_HIDE) {
    return decide('human_review', 'hidden', 'priority', ['SENSITIVE_OTHER'], `self-harm instructions ${selfHarmHowTo.toFixed(2)}`, RULE_SELF_HARM);
  }

  // d/e/f. Graphic violence.
  const geminiGraphic = gemini?.verdict === 'graphic_real' || gemini?.verdict === 'graphic_fictional';
  if (gore >= GORE_GRAPHIC || geminiGraphic) {
    const creative = creativeEvidence(gemini, ctx, 'GRAPHIC_VIOLENCE');
    const geminiReal = gemini?.verdict === 'graphic_real' && gemini.realVsFictional === 'real' && !gemini.isArtistic;
    if (geminiReal && gore >= GORE_EXTREME) {
      return decide('block', 'hidden', 'standard', ['GRAPHIC_VIOLENCE'],
        `real-world extreme gore (gemini graphic_real + openai violence/graphic=${gore.toFixed(2)})`, RULE_GORE);
    }
    if (creative && !geminiReal) {
      const creatorLabelled = !!ctx.creatorLabels?.includes('GRAPHIC_VIOLENCE');
      // The creator already gated it → their label + the viewer's own settings are enough.
      return surfaceAdjust(creatorLabelled
        ? decide('label', 'label', 'none', ['GRAPHIC_VIOLENCE'], 'graphic, fictional/artistic, creator-labelled', null)
        : decide('blur_interstitial', 'blur', 'none', ['GRAPHIC_VIOLENCE'], 'graphic, fictional/artistic — viewer opt-in', null), ctx);
    }
    // One signal, or "real" from one side only: keep it up behind a blur and ask a human.
    return surfaceAdjust(decide('human_review', 'blur', geminiReal ? 'priority' : 'standard', ['GRAPHIC_VIOLENCE'],
      geminiReal ? `gemini says real-world gore, openai ${gore.toFixed(2)} below ${GORE_EXTREME}` : `graphic (openai ${gore.toFixed(2)}), context unclear`,
      null), ctx);
  }

  // g. Sexual content.
  const geminiSexual = gemini?.verdict === 'sexual_adult';
  const geminiArtNude = gemini?.verdict === 'sensitive_artistic' && sexual >= SEXUAL_LABEL;
  if (sexual >= SEXUAL_LABEL || geminiSexual || geminiArtNude) {
    const creative = creativeEvidence(gemini, ctx, 'ARTISTIC_NUDITY') || !!ctx.creatorLabels?.includes('MATURE_18');
    if (geminiSexual && !gemini!.isArtistic && sexual >= SEXUAL_EXPLICIT && !creative) {
      return surfaceAdjust(decide('block', 'hidden', 'standard', ['MATURE_18'],
        `explicit sexual content (gemini sexual_adult + openai sexual=${sexual.toFixed(2)})`, RULE_SEXUAL), ctx);
    }
    const label: SafetyLabel = creative ? 'ARTISTIC_NUDITY' : 'MATURE_18';
    if (sexual >= SEXUAL_EXPLICIT || geminiSexual) {
      // Explicit-looking but artistic, or only one signal: interstitial, plus a human look when non-artistic.
      return surfaceAdjust(creative
        ? decide('blur_interstitial', 'blur', 'none', [label], 'explicit-looking but artistic — viewer opt-in', null)
        : decide('human_review', 'blur', 'standard', [label], `sexual content, single signal (openai ${sexual.toFixed(2)})`, null), ctx);
    }
    return surfaceAdjust(decide('label', 'label', 'none', [label], `suggestive (openai sexual=${sexual.toFixed(2)})`, null), ctx);
  }

  // h (second half). Self-harm depiction.
  if (selfHarm >= SELF_HARM_REVIEW) {
    return surfaceAdjust(decide('human_review', 'blur', 'priority', ['SENSITIVE_OTHER'], `self-harm ${selfHarm.toFixed(2)}`, null), ctx);
  }

  // Non-graphic violence (action films, combat sports, war photography) → label only.
  if (violence >= VIOLENCE_LABEL) {
    return decide('label', 'label', 'none', ['GRAPHIC_VIOLENCE'], `violence ${violence.toFixed(2)}`, null);
  }

  if (gemini?.verdict === 'uncertain' || signals.geminiRefused === 'safety') {
    return decide('human_review', 'normal', 'standard', [], (gemini ? `gemini uncertain: ${gemini.reason}` : 'gemini refused (safety)').slice(0, 300), null);
  }

  // A configured provider failed but another answered: allow, but the scan is partial.
  const partial = !!signals.providerErrors?.length;
  return decide('allow', 'normal', 'none', [], partial ? `allow (partial scan: ${signals.providerErrors!.join(', ')})` : 'allow', null, !partial);
}

// ── Combining several media items / video frames ──────────────────────────────

const ACTION_RANK: Record<SafetyAction, number> = {
  allow: 0, label: 1, blur_interstitial: 2, human_review: 3, block: 4, csam_block_and_report: 5,
};
const DISPLAY_RANK: Record<InterimDisplay, number> = { normal: 0, label: 1, blur: 2, hidden: 3 };
const QUEUE_RANK: Record<ReviewQueue, number> = { none: 0, standard: 1, priority: 2, csam: 3 };

/** The most severe decision wins; labels union; scanComplete only if every item completed. */
export function combineDecisions(ds: SafetyDecision[]): SafetyDecision {
  if (!ds.length) return decide('allow', 'normal', 'none', [], 'no media', null, true);
  const worst = ds.reduce((a, b) => (ACTION_RANK[b.action] > ACTION_RANK[a.action] ? b : a));
  const display = ds.reduce<InterimDisplay>((a, b) => (DISPLAY_RANK[b.display] > DISPLAY_RANK[a] ? b.display : a), 'normal');
  const reviewQueue = ds.reduce<ReviewQueue>((a, b) => (QUEUE_RANK[b.reviewQueue] > QUEUE_RANK[a] ? b.reviewQueue : a), 'none');
  return {
    ...worst,
    display,
    reviewQueue,
    labels: uniq(ds.flatMap(d => d.labels)),
    scanComplete: ds.every(d => d.scanComplete),
  };
}

/** Max-merge OpenAI scores across frames (a video is as severe as its worst frame). */
export function maxScores(list: (OpenAiScores | undefined)[]): OpenAiScores | undefined {
  const present = list.filter(Boolean) as OpenAiScores[];
  if (!present.length) return undefined;
  const out: OpenAiScores = {};
  for (const s of present) for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'number') (out as any)[k] = Math.max((out as any)[k] ?? 0, v);
  }
  return out;
}

// ── What the target document carries (public, so it never says "csam") ──────

export type ModerationStatus =
  | 'approved' | 'label' | 'blur_interstitial' | 'pending_review' | 'pending_review_hidden' | 'blocked' | 'removed';

export function moderationStatusFor(d: SafetyDecision): ModerationStatus {
  switch (d.action) {
    case 'allow': return 'approved';
    case 'label': return 'label';
    case 'blur_interstitial': return 'blur_interstitial';
    case 'human_review':
      return d.display === 'hidden' ? 'pending_review_hidden' : d.display === 'blur' ? 'blur_interstitial' : 'pending_review';
    case 'block':
    case 'csam_block_and_report':
      return 'blocked'; // deliberately identical: the public doc must not reveal a CSAM case exists
  }
}

// ── Client visibility (PostCard / feeds) ─────────────────────────────────────

export type ModerationVisibility = 'show' | 'label' | 'interstitial' | 'hidden';

export function moderationVisibility(status: unknown): ModerationVisibility {
  switch (status) {
    case 'label': return 'label';
    case 'blur_interstitial': return 'interstitial';
    case 'pending_review_hidden':
    case 'blocked':
    case 'csam':
    case 'removed':
      return 'hidden';
    default: return 'show';
  }
}

/** Feed filter: hidden statuses disappear for everyone except the author (who gets a notice). */
export function isModerationHiddenFor(status: unknown, viewerIsAuthor: boolean): boolean {
  return moderationVisibility(status) === 'hidden' && !viewerIsAuthor;
}

// ── Report escalation (sexual_minor_safety reports) ──────────────────────────

export interface ReportEscalationInput {
  /** Distinct reporters with reason sexual_minor_safety on this target. */
  distinctReporters: number;
  /** The scan decision for the target's media, if a scan ran. */
  scan?: SafetyDecision;
}

/** Reports-alone never file a CyberTip; they hide pending review only when corroborated. */
export const MINOR_REPORTS_TO_HIDE = 3;

export function escalateMinorSafetyReport(i: ReportEscalationInput): { hide: boolean; queue: ReviewQueue; fileCase: boolean } {
  if (i.scan?.action === 'csam_block_and_report') return { hide: true, queue: 'csam', fileCase: true };
  const scanWorried = !!i.scan && (i.scan.reviewQueue === 'csam' || i.scan.display === 'hidden');
  const hide = scanWorried || i.distinctReporters >= MINOR_REPORTS_TO_HIDE;
  return { hide, queue: 'csam', fileCase: false };
}
