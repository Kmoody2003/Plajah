// genAgent — Fabula's client for the generation agent: a prompt in Fabula → an agent that runs a
// job on an external creative service using the USER'S OWN linked account → results that land back
// in the project's bins. The agent itself is a cloud service (Cloud Run, same `/api/*` convention as
// Crossover); this file is only the browser client + the local job mirror.
//
// Connect model: a service with an official API is driven by that API on the user's own linked
// account (per-user credential, encrypted server-side, revocable — never a shared platform key). A
// service without one is HANDED OFF: Fabula compiles the prompt and reference pack, the user runs it
// in their own browser on their own subscription, and the watch folder catches the download.
//
// We deliberately do NOT drive the API-less services by replaying stored browser sessions from a
// datacenter. The account that bot-detection bans would be the user's. See GEN_HANDOFF_PLAN.md §3.
//
// Results are written by the agent to cloud storage; when a job completes, the client pulls the result
// URLs and the caller imports them into a target bin — "populating bins headless", the watch-folder way.
//
// Until the backend is deployed the client degrades gracefully: `health()` reports offline and the UI
// explains, rather than throwing. Jobs are mirrored in IndexedDB so status survives reloads.

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { getOptionalIdToken } from '../backendService';

const API = '/api/genagent';

export type GenKind = 'image' | 'video' | 'upscale';
export type ConnectMode = 'api' | 'ui' | 'hybrid';

/** How a job gets executed. `connected` = our agent drives the provider's API on the user's linked
 *  account. `handoff` = Fabula compiles the prompt + reference pack, the user runs it themselves in
 *  their own browser, and the watch folder catches the download. Handoff is the ONLY way to spend a
 *  user's consumer subscription credits — see GEN_HANDOFF_PLAN.md §2. */
export type GenMode = 'connected' | 'handoff';

/** Whose balance a *connected* job spends.
 *  - `shared`   — the API draws the same credits as the user's paid plan (Magnific — verify).
 *  - `separate` — the API is its own prepaid wallet, unrelated to the consumer subscription
 *                 (Kling, Runway). A subscription grants NO API access and credits don't transfer.
 *  - `none`     — no usable public API at all; handoff only (Dreamina, Google Flow).
 *  The panel must state this before the user hits Generate, or they get billed by surprise. */
export type WalletModel = 'shared' | 'separate' | 'none';

/** What a reference image is *for*. Providers accept different subsets — see ConnectorCaps.refRoles. */
export type RefRole =
  | 'character' | 'style' | 'location' | 'prop'
  | 'first_frame' | 'last_frame'
  | 'source';            // the image being upscaled / reimagined

export interface ConnectorCaps {
  refRoles: RefRole[];       // which reference roles this provider honors
  maxRefs: number;           // hard cap on attached references
  aspects?: string[];        // constrained aspect list ('*' absent = free)
  durations?: number[];      // selectable clip lengths in seconds
  supportsNegative?: boolean;
  supportsSeed?: boolean;
}

export interface Connector {
  id: string;              // 'kling' | 'magnific' | …
  name: string;            // display
  kind: GenKind;           // what it produces
  modes: GenMode[];        // 'connected' present only where an official API exists
  walletModel: WalletModel;
  blurb: string;           // one-line "what it's good at"
  promptHint: string;      // dialect hint fed to the SLATE prompt compiler (shotPromptSystem)
  caps: ConnectorCaps;
  handoffUrl?: string;     // where handoff mode opens the user
  desktopUrl?: string;     // native-app deep link, where one is known to exist
  walletNote?: string;     // plain-English billing truth, shown in the panel
  connectMode?: ConnectMode; // legacy field, retained for the existing backend contract
  connected?: boolean;     // user's account linked (filled by /connectors)
  hint?: string;           // masked tail of the stored key, e.g. "••••1234" — never the key itself
}

export interface GenJob {
  id: string;
  provider: string;
  kind: GenKind;
  prompt: string;
  params?: Record<string, any>;
  spec?: ShotSpec;         // the full shot spec this job was compiled from (refs, locks, provenance)
  mode?: GenMode;          // 'connected' (agent ran it) | 'handoff' (user ran it, watch folder caught it)
  projectId: string;
  bin: string;             // target bin the results should land in
  status: 'queued' | 'running' | 'done' | 'error' | 'backend-offline';
  progress?: number;       // 0..1
  results?: { url: string; name: string; mime: string }[];
  error?: string;
  /** A non-fatal caveat about how the job had to be adapted — e.g. the provider has no 2.39:1 frame,
   *  so it was generated at the nearest ratio and needs cropping. Shown alongside the result. */
  note?: string;
  createdAt: number;
}

// The connector registry — the single source of truth for BOTH how a provider is driven and how the
// SLATE prompt compiler should phrase for it. `Fabula.jsx`'s SERVICES / STILL_TARGETS derive from this
// (see videoServices() / stillTargets() below) so there is one list, not three.
//
// `modes` is the honest bit: 'connected' appears only where an official public API exists. Dreamina and
// Google Flow have none — Flow is the consumer front-end for Veo, sold by subscription, with no API, and
// reaching Veo through Gemini/Vertex spends the user's GCP bill instead. Those are handoff-only, and no
// amount of engineering changes that. We do NOT drive them by replaying stored browser sessions: the
// account that gets banned for datacenter-IP automation would be the user's. See GEN_HANDOFF_PLAN.md §3.
//
// The backend overrides `connected` per user; this static list lets the panel render (and explain
// "connect your account") before the backend is even reachable.
export const CONNECTORS: Connector[] = [
  {
    id: 'runway', name: 'Runway Gen-4', kind: 'video', modes: ['connected', 'handoff'],
    walletModel: 'separate', connectMode: 'api',
    blurb: 'Fast, controllable image→video with first/last frame',
    promptHint: 'Terse, motion-first phrasing. No audio cues.',
    caps: { refRoles: ['first_frame', 'last_frame', 'style', 'character'], maxRefs: 3, durations: [5, 10], supportsSeed: true },
    handoffUrl: 'https://app.runwayml.com/',
    walletNote: 'API billing is a separate developer balance — your Runway subscription credits do not apply.',
  },
  {
    id: 'kling', name: 'Kling', kind: 'video', modes: ['connected', 'handoff'],
    walletModel: 'separate', connectMode: 'api',
    blurb: 'Cinematic text/image→video, strongest motion + performance',
    promptHint: 'Rich motion + performance language. Lip-sync after.',
    caps: { refRoles: ['first_frame', 'last_frame', 'character'], maxRefs: 4, durations: [5, 10], supportsNegative: true },
    handoffUrl: 'https://app.klingai.com/',
    walletNote: 'Kling’s API is a prepaid developer balance, entirely separate from a consumer membership — credits transfer neither way.',
  },
  {
    id: 'veo', name: 'Veo 3', kind: 'video', modes: ['connected', 'handoff'],
    walletModel: 'separate', connectMode: 'api',
    blurb: 'Native dialogue audio generated with the shot',
    promptHint: 'Supports native dialogue audio — include spoken lines in quotes.',
    caps: { refRoles: ['first_frame', 'style'], maxRefs: 2, durations: [8], supportsNegative: true },
    handoffUrl: 'https://labs.google/fx/tools/flow',
    walletNote: 'Connected mode reaches Veo through Gemini/Vertex and bills your own Google Cloud project — it does NOT spend Google AI Ultra/Pro credits. To use those, pick Google Flow and hand off.',
  },
  {
    id: 'flow', name: 'Google Flow', kind: 'video', modes: ['handoff'],
    walletModel: 'none',
    blurb: 'Google’s filmmaking front-end for Veo — subscription credits',
    promptHint: 'Supports native dialogue audio — include spoken lines in quotes.',
    caps: { refRoles: ['first_frame', 'style', 'character'], maxRefs: 3 },
    handoffUrl: 'https://labs.google/fx/tools/flow',
    walletNote: 'No public API. Handoff spends the AI Ultra/Pro credits you already pay for.',
  },
  {
    id: 'dreamina', name: 'Dreamina', kind: 'video', modes: ['handoff'],
    walletModel: 'none',
    blurb: 'ByteDance image + video, strong stylised motion',
    promptHint: 'Natural-language shot description; concise beats.',
    caps: { refRoles: ['first_frame', 'character', 'style'], maxRefs: 3 },
    handoffUrl: 'https://dreamina.capcut.com/',
    walletNote: 'No public API and automation is against its terms — handoff only, on your own account.',
  },
  {
    id: 'seedance', name: 'Seedance', kind: 'video', modes: ['handoff'],
    walletModel: 'none',
    blurb: 'Multi-action beats in a single shot',
    promptHint: 'Natural-language shot description, supports multi-action beats.',
    caps: { refRoles: ['first_frame', 'character'], maxRefs: 2 },
  },
  {
    // The only connector with a working adapter so far — services/fabula/magnificApi.ts,
    // routes at /api/genagent/* in server.ts. A source image routes to the upscaler; no source
    // routes to Mystic text→image.
    id: 'magnific', name: 'Magnific', kind: 'upscale', modes: ['connected', 'handoff'],
    walletModel: 'shared', connectMode: 'api',
    blurb: 'Mystic stills + extreme-detail upscaling, on your plan credits',
    promptHint: 'Describe texture and material truth; the upscaler hallucinates detail toward the prompt.',
    // Mystic's aspect enum has no cinema ratios. magnificApi.mysticAspect() picks the nearest and
    // returns a note saying what to crop — these are the ones it can hit exactly.
    caps: {
      refRoles: ['source', 'first_frame', 'style'], maxRefs: 2, supportsSeed: true,
      aspects: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '2:1', '1:2', '5:4', '4:5', '20:9', '9:20'],
    },
    handoffUrl: 'https://magnific.com/',
    desktopUrl: 'https://www.magnific.com/desktop',
    walletNote: 'Formerly Freepik — one credit pool across image, video, audio and upscale. Magnific’s MCP server states it shares the in-app credit balance; the REST API this uses is billed to the same account, but confirm on your account page before relying on it.',
  },
  {
    id: 'midjourney', name: 'Midjourney', kind: 'image', modes: ['handoff'],
    walletModel: 'none',
    blurb: 'Best-in-class stills; pair with Magnific to finish',
    promptHint: 'Dense visual noun-phrases; trailing --ar / --style flags.',
    caps: { refRoles: ['style', 'character'], maxRefs: 2, supportsSeed: true },
    handoffUrl: 'https://www.midjourney.com/imagine',
    walletNote: 'No public API — handoff spends your Midjourney plan.',
  },
  {
    id: 'flux', name: 'Flux / Krea', kind: 'image', modes: ['handoff'],
    walletModel: 'none',
    blurb: 'Photoreal stills, strong prompt adherence',
    promptHint: 'Plain descriptive sentences; responds well to explicit camera and lens.',
    caps: { refRoles: ['style', 'character'], maxRefs: 2, supportsSeed: true },
    handoffUrl: 'https://www.krea.ai/',
  },
  {
    id: 'ideogram', name: 'Ideogram', kind: 'image', modes: ['handoff'],
    walletModel: 'none',
    blurb: 'Stills with legible in-frame text',
    promptHint: 'State rendered text in quotes; keep the rest short.',
    caps: { refRoles: ['style'], maxRefs: 1 },
    handoffUrl: 'https://ideogram.ai/',
  },
];

// Ids persisted in existing production documents by the older SERVICES / STILL_TARGETS lists, which
// bundled two providers into one option. Map them forward so a saved production still resolves.
const LEGACY_IDS: Record<string, string> = {
  mj_magnific: 'midjourney',   // "Midjourney → Magnific" — the still is Midjourney's; Magnific finishes it
};

export const connectorById = (id: string): Connector | undefined =>
  CONNECTORS.find((c) => c.id === id) || CONNECTORS.find((c) => c.id === LEGACY_IDS[id]);
/** The video-generation targets — replaces Fabula.jsx's local SERVICES list. */
export const videoServices = (): Connector[] => CONNECTORS.filter((c) => c.kind === 'video');
/** The still targets — replaces Fabula.jsx's local STILL_TARGETS list. */
export const stillTargets = (): Connector[] => CONNECTORS.filter((c) => c.kind !== 'video');
/** Can this provider actually be automated, or is handoff the only honest option? */
export const canConnect = (id: string): boolean => !!connectorById(id)?.modes.includes('connected');

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const tok = await getOptionalIdToken().catch(() => null);
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

// ── backend availability ──────────────────────────────────────────────────────

export interface AgentStatus {
  ok: boolean;
  /** Providers with a working server-side adapter *today* — a connector can declare `connected` mode
   *  because the vendor has an API, and still not be wired here yet. Settings must tell them apart. */
  connected: string[];
  /** False means ENCRYPTION_KEY isn't configured, so linking will fail. Better to say so up front
   *  than to let someone paste a key into a form that can't store it. */
  encryptionConfigured?: boolean;
}

export async function agentStatus(): Promise<AgentStatus> {
  try {
    const res = await fetch(`${API}/health`, { method: 'GET' });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/json')) return { ok: false, connected: [] };
    const data = await res.json();
    return { ok: !!data?.ok, connected: Array.isArray(data?.connected) ? data.connected : [], encryptionConfigured: data?.encryptionConfigured };
  } catch { return { ok: false, connected: [] }; }
}

let _healthy: boolean | null = null;
export async function health(): Promise<boolean> {
  if (_healthy != null) return _healthy;
  try {
    const res = await fetch(`${API}/health`, { method: 'GET' });
    // Require a genuine JSON ack — a dev-server SPA fallback returns 200 text/html, which must
    // NOT read as "agent online".
    const ct = res.headers.get('content-type') || '';
    _healthy = res.ok && ct.includes('application/json') && !!(await res.json().catch(() => null))?.ok;
  } catch { _healthy = false; }
  return _healthy;
}

// ── connectors + account linking ────────────────────────────────────────────────
export async function listConnectors(): Promise<Connector[]> {
  const base = CONNECTORS.map((c) => ({ ...c }));
  try {
    const res = await fetch(`${API}/connectors`, { method: 'POST', headers: await authHeaders(), body: '{}' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.connectors)) {
        // MERGE, never replace: the backend is authoritative only for per-user link state. Capabilities,
        // wallet model and prompt dialect live in the static registry — letting the server's payload
        // overwrite them would strip `caps`/`modes` and break the handoff compiler.
        const byId = new Map<string, any>(data.connectors.map((c: any) => [c.id, c]));
        return base.map((c) => {
          const remote = byId.get(c.id);
          return remote ? { ...c, connected: !!remote.connected, hint: remote.hint } : c;
        });
      }
    }
  } catch { /* backend offline → static list, everything unlinked */ }
  return base;
}

export interface ConnectChallenge {
  /** OAuth-style providers hand back a URL to open. */
  authUrl?: string;
  connected?: boolean;
  /** API-key providers (Magnific) ask the user to paste a key instead. The key goes straight to the
   *  server, is encrypted there, and is never returned to the browser. */
  needsKey?: boolean;
  keyUrl?: string;      // where to create the key
  keyLabel?: string;
  keyHelp?: string;
}

/** Begin linking the user's account for a provider. Returns either an auth URL to open, a key
 *  challenge to render a paste form for, or a status if already connected. */
export async function connectAccount(provider: string): Promise<ConnectChallenge> {
  const res = await fetch(`${API}/connect`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ provider }) });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error(msg?.error || `Couldn't start linking ${provider} (${res.status}).`);
  }
  return res.json();
}

/** Hand a provider API key to the server, which verifies it against the provider, encrypts it, and
 *  stores it against this uid. The key is deliberately not kept anywhere client-side. */
export async function saveProviderKey(provider: string, key: string): Promise<{ connected: boolean; hint?: string }> {
  const res = await fetch(`${API}/connect/key`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ provider, key }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Couldn't save that key (${res.status}).`);
  return data;
}

/** Unlink a provider — the stored key is deleted server-side. */
export async function revokeProvider(provider: string): Promise<boolean> {
  const res = await fetch(`${API}/connect/revoke`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ provider }),
  });
  if (!res.ok) return false;
  return !!(await res.json().catch(() => null))?.revoked;
}

// ── the shot spec ───────────────────────────────────────────────────────────────
// ONE Fabula-native description of what to generate. Every door into generation (the SLATE shot card,
// the media pool, a right-clicked timeline clip) builds one of these; adapters compile it down to a
// provider's payload, and `compileHandoff` compiles it to a prompt + reference pack for providers we
// can't drive. The prompt is one field among many — references are the point.

export interface GenRef {
  role: RefRole;
  /** Fabula media-pool asset id, when the reference is already in the project. */
  assetId?: string;
  /** Worlds entity id (cast member / location / prop). Resolved via fabulaWorldBridge so a character's
   *  established look follows them across every shot without the user re-attaching it each time. */
  worldEntityId?: string;
  url?: string;
  name?: string;
  /** Verbatim text lock from the scene bible (visual_lock / environment_lock) — carried alongside the
   *  image because most providers honor both, and the text is what keeps identity stable. */
  lock?: string;
  weight?: number;
}

export interface ShotSpec {
  prompt: string;
  negative?: string;
  refs: GenRef[];
  aspect?: string;
  duration?: number;
  seed?: number;
  /** Provenance back into the cut — lets a finished result replace the `kind:"script"` placeholder clip
   *  that `buildEditFromBreakdown()` laid down for this shot. */
  sceneId?: string;
  shotId?: string;
  slug?: string;
}

/** Build a ShotSpec from a SLATE shot + its scene bible. `which` picks which of the shot's three
 *  compiled prompts to run. Character locks become refs so identity survives across shots; a chosen
 *  still becomes the first frame for the video pass. */
export function specFromShot(input: {
  shot: any; bible?: any; which: 'still' | 'video' | 'voice';
  aspect?: string; sceneId?: string; firstFrame?: { assetId?: string; url?: string; name?: string };
}): ShotSpec {
  const { shot, bible, which, aspect, sceneId, firstFrame } = input;
  const refs: GenRef[] = [];

  // Character identity locks — the whole reason consistency holds across a scene.
  (bible?.characters || []).forEach((c: any) => {
    if (!c?.visual_lock) return;
    refs.push({ role: 'character', name: c.name, lock: c.visual_lock, worldEntityId: c.id });
  });
  if (bible?.environment_lock) refs.push({ role: 'location', name: 'ENVIRONMENT', lock: bible.environment_lock });
  if (firstFrame && which === 'video') {
    refs.push({ role: 'first_frame', assetId: firstFrame.assetId, url: firstFrame.url, name: firstFrame.name || 'chosen still' });
  }

  return {
    prompt: (shot?.[which] || '').trim(),
    refs,
    aspect,
    sceneId,
    shotId: shot?.id,
    slug: shot?.slug,
  };
}

/** Trim a spec's references to what a provider will actually accept, so the UI never promises a ref the
 *  service is going to silently drop. Text-only locks (no image) are never dropped — they fold into the
 *  prompt instead, which every provider understands. */
export function refsForConnector(spec: ShotSpec, connector: Connector): { used: GenRef[]; dropped: GenRef[] } {
  const imageRefs = (spec.refs || []).filter((r) => r.assetId || r.url);
  const eligible = imageRefs.filter((r) => connector.caps.refRoles.includes(r.role));
  const used = eligible.slice(0, connector.caps.maxRefs);
  const dropped = imageRefs.filter((r) => !used.includes(r));
  return { used, dropped };
}

export interface HandoffBundle {
  prompt: string;            // provider-dialect prompt, ready to paste
  refs: GenRef[];            // images to download as the reference pack
  droppedRefs: GenRef[];     // refs this provider can't take — surfaced, never silently discarded
  openUrl?: string;
  notes: string[];           // what the user has to do by hand on the far side
}

/** Compile a spec into everything the user needs to run this shot themselves on a provider we can't
 *  (or shouldn't) drive. This is the path that spends their existing subscription credits, and the
 *  watch folder catches whatever they download. */
export function compileHandoff(spec: ShotSpec, connector: Connector): HandoffBundle {
  const { used, dropped } = refsForConnector(spec, connector);
  const notes: string[] = [];
  let prompt = (spec.prompt || '').trim();

  // Text locks that aren't carried as images fold into the prompt verbatim — that's how identity holds
  // on services with no reference-image slot.
  const textLocks = (spec.refs || [])
    .filter((r) => r.lock && !used.some((u) => u.name === r.name))
    .map((r) => r.lock as string);
  if (textLocks.length && !textLocks.every((l) => prompt.includes(l))) {
    const missing = textLocks.filter((l) => !prompt.includes(l));
    if (missing.length) prompt += `\n\n${missing.join(' ')}`;
  }

  if (spec.negative) {
    if (connector.caps.supportsNegative) notes.push(`Negative prompt: ${spec.negative}`);
    else notes.push(`No negative-prompt field on ${connector.name} — "${spec.negative}" must be worked into the prompt.`);
  }

  // Provider dialect: Midjourney takes trailing flags, everything else uses UI fields.
  if (connector.id === 'midjourney') {
    if (spec.aspect) prompt += ` --ar ${spec.aspect.replace(':', ':')}`;
    if (spec.seed != null) prompt += ` --seed ${spec.seed}`;
  } else {
    if (spec.aspect) notes.push(`Set aspect to ${spec.aspect}.`);
    if (spec.duration) notes.push(`Set duration to ${spec.duration}s.`);
    if (spec.seed != null && connector.caps.supportsSeed) notes.push(`Seed ${spec.seed}.`);
  }

  used.forEach((r) => notes.push(`Attach "${r.name || r.role}" as ${r.role.replace(/_/g, ' ')}.`));
  dropped.forEach((r) => notes.push(`${connector.name} can't take "${r.name || r.role}" (${r.role}) — its description is folded into the prompt instead.`));
  notes.push('Download the result into your watch folder and it lands in this bin automatically.');

  return { prompt, refs: used, droppedRefs: dropped, openUrl: connector.handoffUrl, notes };
}

// ── landing a result back in the cut ────────────────────────────────────────────
// `buildEditFromBreakdown()` lays down one `kind:"script"` placeholder per shot (plus a `kind:"voice"`
// clip on an audio track for shots with dialogue — same shotId, and it must NOT be replaced by picture).
// This is the round-trip that closes the loop: a finished generation takes its placeholder's slot.

export interface CutClip {
  id: string;
  trackId?: string;
  start?: number;
  duration?: number;
  srcIn?: number;
  kind?: string;
  shotId?: string;
  assetId?: string;
  label?: string;
  disabled?: boolean;
  [k: string]: any;
}

export interface PlaceResult {
  clips: CutClip[];
  filled: number;      // placeholders that took the media directly
  alternates: number;  // slots that already held media — new take added, previous muted
}

/** Put a generated asset into every picture slot belonging to `shotId`.
 *  - An empty `kind:"script"` placeholder becomes a media clip in place, keeping its start and duration
 *    so the pacing the script implied survives.
 *  - A slot already holding media is an alternate take: the new clip is added alongside and the previous
 *    one muted, never deleted — the user may still want the take they had.
 *  - Audio-track clips for the same shot (the `voice` rows) are left alone.
 *  `mkId` is injected so callers keep their own id scheme and this stays deterministic under test. */
export function placeResultInCut(
  clips: CutClip[],
  shotId: string,
  asset: { id: string; name?: string },
  mkId: () => string,
): PlaceResult {
  if (!shotId || !asset?.id) return { clips, filled: 0, alternates: 0 };
  const next: CutClip[] = [];
  let filled = 0, alternates = 0;

  for (const c of clips) {
    const isPicture = !String(c.trackId || '').startsWith('a');
    if (c.shotId !== shotId || !isPicture) { next.push(c); continue; }
    if (c.kind === 'script') {
      next.push({ ...c, kind: 'media', assetId: asset.id, srcIn: 0, label: asset.name || c.label });
      filled++;
    } else {
      next.push({ ...c, disabled: true });
      next.push({
        id: mkId(), trackId: c.trackId, start: c.start, duration: c.duration,
        srcIn: 0, kind: 'media', assetId: asset.id, label: asset.name || c.label, shotId,
      });
      alternates++;
    }
  }
  return { clips: filled || alternates ? next : clips, filled, alternates };
}

// ── jobs ────────────────────────────────────────────────────────────────────────
const jobsKey = (projectId: string) => `fabula:genJobs:${projectId}`;
async function loadLocal(projectId: string): Promise<GenJob[]> { return (await idbGet(jobsKey(projectId))) || []; }
async function saveLocal(projectId: string, jobs: GenJob[]) { await idbSet(jobsKey(projectId), jobs); }
async function upsertLocal(job: GenJob) {
  const jobs = await loadLocal(job.projectId);
  const i = jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) jobs[i] = job; else jobs.unshift(job);
  await saveLocal(job.projectId, jobs.slice(0, 100));
}

export async function listJobs(projectId: string): Promise<GenJob[]> {
  // local mirror first (instant), reconciled with the server when reachable
  const local = await loadLocal(projectId);
  try {
    const res = await fetch(`${API}/jobs?projectId=${encodeURIComponent(projectId)}`, { method: 'GET', headers: await authHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.jobs)) { await saveLocal(projectId, data.jobs); return data.jobs as GenJob[]; }
    }
  } catch { /* offline → local only */ }
  return local;
}

/** Submit a generation job. Persisted locally immediately; if the backend is unreachable the job is
 *  marked 'backend-offline' so the panel can explain instead of silently failing. */
export async function submitJob(input: {
  provider: string; kind: GenKind; prompt: string; params?: Record<string, any>;
  spec?: ShotSpec; projectId: string; bin: string;
}): Promise<GenJob> {
  const base: GenJob = {
    id: `gj_${Date.now().toString(36)}_${Math.floor(performance.now()).toString(36)}`,
    provider: input.provider, kind: input.kind, prompt: input.prompt, params: input.params,
    spec: input.spec, mode: 'connected',
    projectId: input.projectId, bin: input.bin, status: 'queued', createdAt: Date.now(),
  };
  // Guard the honest case: a provider with no public API can't be submitted at all. Fail here with a
  // clear reason rather than queueing something the backend will reject (or, worse, try to scrape).
  const c = connectorById(input.provider);
  if (c && !c.modes.includes('connected')) {
    const j: GenJob = { ...base, status: 'error', error: `${c.name} has no public API — use Hand off instead.` };
    await upsertLocal(j); return j;
  }
  try {
    const res = await fetch(`${API}/jobs`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(input) });
    if (res.ok) {
      const data = await res.json();
      const job: GenJob = { ...base, id: data.jobId || base.id, status: data.status || 'queued' };
      await upsertLocal(job); return job;
    }
    if (res.status === 401) { const j = { ...base, status: 'error' as const, error: 'Sign in to generate.' }; await upsertLocal(j); return j; }
    const j = { ...base, status: 'error' as const, error: `Job rejected (${res.status}).` }; await upsertLocal(j); return j;
  } catch {
    const j = { ...base, status: 'backend-offline' as const, error: 'Generation agent isn’t connected yet.' };
    await upsertLocal(j); return j;
  }
}

/** Poll a single job's status; updates the local mirror. Returns null if unreachable. */
export async function pollJob(projectId: string, jobId: string): Promise<GenJob | null> {
  try {
    const res = await fetch(`${API}/jobs/${encodeURIComponent(jobId)}`, { method: 'GET', headers: await authHeaders() });
    if (!res.ok) return null;
    const job = (await res.json()) as GenJob;
    await upsertLocal({ ...job, projectId });
    return job;
  } catch { return null; }
}

/** Map a result mime to a Fabula pool asset type. */
export function assetTypeForMime(mime: string): 'video' | 'image' | 'audio' {
  if (mime.startsWith('video')) return 'video';
  if (mime.startsWith('audio')) return 'audio';
  return 'image';
}
