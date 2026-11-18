// The fidelity loop: replay → render → measure → look → plan → apply, until the score reaches the aim or
// progress stalls (docs/game-studio-photo-to-3d.md §2). Lanes are injected, so the same loop runs with
// Gemini in the cloud, Gemma on the desktop's GPU, or fixed answers in tests.
//
// Two guards keep the agent honest: a round that lowers the measured score is undone (one undo, the round was
// one batch) and the agent is told why; and while the scan carries the body, a part big enough to bury it is
// refused before it is applied.

import { traceField, framingCamera } from './camera';
import { parseGapReport, type GapItem, type GapReport } from './gapReport';
import { applyModelOp, describeModelOp, rgbToHex, type ModelHistory, type ModelOp } from './modelOps';
import { agentPrompt, anchorGaps, parseAgentOps, planFromGaps, type PlanContext } from './planner';
import { renderMesh } from './render';
import { replay, type ReplayInputs, type Replayed } from './replay';
import { fidelity, loopVerdict, scoreView, DEFAULT_POLICY, type FidelityScore, type LoopPolicy, type LoopVerdict, type Picture, type ViewScore } from './score';
import type { ModelCamera, ModelDoc, PaintRegion, Vec3 } from './schema';

export interface LookInput { photo: Picture; renders: { name: string; picture: Picture }[]; subject: string; round: number; openItems: GapItem[] }
export interface Lanes {
  /** The eye: compares renders with the photo, answers a gap report (raw; parsed here). */
  look: (input: LookInput) => Promise<{ raw: unknown; source: string }>;
  /** The hands: an LLM that writes ops from a prompt. Without it, the rules planner answers. */
  agent?: (prompt: { system: string; user: string }) => Promise<string>;
}

export interface RoundRecord {
  round: number;
  /** What this round measured (if the round was rejected, the worse model that got undone). */
  score: FidelityScore;
  verdict: LoopVerdict;
  report: GapReport;
  warnings: string[];
  /** This round measured a worse model than the last, so the last round's ops were undone. */
  rejected?: { from: number; to: number; ops: string[] };
  /** Sentences of what was applied this round (empty on the last, measuring-only round). */
  applied: string[];
  dropped: string[];
  planner: 'agent' | 'rules' | 'none';
  renders: { name: string; picture: Picture }[];
  ms: number;
}

export interface LoopEnv extends ReplayInputs {
  /** The reference photo, subject mask in alpha. */
  photo: Picture;
  /** Size of the extra-angle renders. */
  viewSize?: number;
  policy?: LoopPolicy;
  onRound?: (r: RoundRecord, replayed: Replayed) => void | Promise<void>;
}

/** The other angles the eye sees: a quarter turn each way and the back, relative to the photo's camera. */
export function angleCameras(photoCam: ModelCamera, size: number): Record<string, ModelCamera> {
  const at = (dy: number) => framingCamera({ yawDeg: photoCam.yawDeg + dy, pitchDeg: 12, width: size, height: size, radius: 1.0 });
  return { 'render-side': at(90), 'render-back': at(180), 'render-other-side': at(-90) };
}

function photoSampler(photo: Picture) {
  return (_view: string, box: GapItem['region']) => {
    const x0 = Math.floor(box.x0 * photo.width), x1 = Math.ceil(box.x1 * photo.width), y0 = Math.floor(box.y0 * photo.height), y1 = Math.ceil(box.y1 * photo.height);
    const s = [0, 0, 0]; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * photo.width + x) * 4; if (photo.data[o + 3] > 127) { for (let c = 0; c < 3; c++) s[c] += photo.data[o + c]; n++; } }
    return n ? rgbToHex([s[0] / n / 255, s[1] / n / 255, s[2] / n / 255]) : null;
  };
}

function coverageOf(photo: Picture, render: Picture) {
  return (box: GapItem['region']) => {
    const x0 = Math.floor(box.x0 * photo.width), x1 = Math.ceil(box.x1 * photo.width), y0 = Math.floor(box.y0 * photo.height), y1 = Math.ceil(box.y1 * photo.height);
    let a = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * photo.width + x) * 4 + 3; n++; if (photo.data[o] > 127) a++; if (render.data[o] > 127) b++; }
    return { photo: n ? a / n : 0, render: n ? b / n : 0 };
  };
}

/** Rough volume an added part takes up (its extents box), for the size guard. */
export function addedVolume(o: ModelOp): number {
  if (o.op === 'extrude') return o.length * (2 * o.radius) ** 2;
  if (o.op !== 'addPart' || o.part.op !== 'add') return 0;
  const p = o.part;
  if (p.shape === 'capsule') { const e = p.end ?? p.center; const r = Math.max(p.size[0], p.size[1]); return (Math.hypot(e[0] - p.center[0], e[1] - p.center[1], e[2] - p.center[2]) + 2 * r) * (2 * r) ** 2; }
  if (p.shape === 'torus') return p.size[0] * p.size[1] * p.size[0];
  return p.size[0] * p.size[1] * (p.size[2] || p.size[0]);
}

/** Share of the model's box a paint region covers (1 for everything). */
function paintShare(r: PaintRegion, box: number): number {
  if (r.kind === 'all') return 1;
  if (r.kind === 'box') return box ? (r.size[0] * r.size[1] * r.size[2]) / box : 1;
  if (r.kind === 'sphere') return box ? ((4 / 3) * Math.PI * r.radius ** 3) / box : 1;
  return 0;
}

export interface ApplyGuard {
  /** The model's bounds now. */
  bounds: { min: Vec3; max: Vec3 };
  /** Largest share of the model's box one added part may fill while the scan carries the body (default 0.2). */
  maxShare?: number;
}

/**
 * Keep the ops that apply in order (a later op may lean on an earlier one); report the rest. With a guard, an
 * added part that would bury the model is refused while the scan shell carries the shape: recolour with paint,
 * reshape with sculpt or small parts (a hero rebuild turns the scan off first, which lifts the guard).
 */
export function applicable(doc: ModelDoc, ops: ModelOp[], guard?: ApplyGuard): { ok: ModelOp[]; failed: string[] } {
  const ok: ModelOp[] = [], failed: string[] = [];
  let cur = doc;
  const b = guard?.bounds;
  const box = b ? (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]) : 0;
  for (const o of ops) {
    if (guard && cur.useScan && cur.base.kind === 'scan' && addedVolume(o) > box * (guard.maxShare ?? 0.2)) {
      failed.push(`${describeModelOp(cur, o)}: too big, it would bury the scan's body (recolour with paint, reshape with sculpt or smaller parts)`);
      continue;
    }
    if (guard && o.op === 'paint' && !o.layer.projectPhoto && cur.paints.some(l => l.projectPhoto) && paintShare(o.layer.region, box) > 0.5) {
      failed.push(`${describeModelOp(cur, o)}: too wide, it would hide the photo's own colours (paint a region round the gap, or a part)`);
      continue;
    }
    try { cur = applyModelOp(cur, o).doc; ok.push(o); } catch (e) { failed.push(`${describeModelOp(cur, o)}: ${(e as Error).message}`); }
  }
  return { ok, failed };
}

interface Measured { replayed: Replayed; photoRender: Picture; pixel: ViewScore; renders: { name: string; picture: Picture }[]; report: GapReport; warnings: string[]; score: FidelityScore }

export async function runFidelityLoop(history: ModelHistory, env: LoopEnv, lanes: Lanes): Promise<RoundRecord[]> {
  const policy = env.policy ?? DEFAULT_POLICY;
  const photoRef = history.doc.references.find(v => v.name === 'photo');
  if (!photoRef?.camera) throw new Error('align the photo camera first (setCamera on "photo")');
  const photoCam = photoRef.camera;
  const cams: Record<string, ModelCamera> = { photo: photoCam, 'render-photo': photoCam, ...angleCameras(photoCam, env.viewSize ?? 384) };
  const rounds: RoundRecord[] = [];
  const scores: number[] = [];
  const notes: string[] = [];
  // Setup step, before anything is measured: the photo's own colours go on where the camera sees the surface,
  // mirrored onto the sides it can't. Nothing matches colour as well; every later paint layer sits on top of it.
  if (!history.doc.paints.some(l => l.projectPhoto === 'photo')) {
    history.apply({ op: 'paint', layer: { id: 'photo-colours', name: 'Photo colours', region: { kind: 'all' }, projectPhoto: 'photo', fillUnseen: 'mirror', opacity: 1 } }, 'aria');
  }

  const measure = async (round: number, open: GapItem[]): Promise<Measured> => {
    const doc = history.doc;
    const replayed = replay(doc, env);
    // Unlit from the photo's camera: projected photo colour already carries the photo's light, so shading it
    // again would read as a colour error. The other angles are shaded so the eye can read their shape.
    const photoRender = renderMesh(replayed.mesh, photoCam, { ambient: 1 }).picture;
    const pixel = scoreView(env.photo, photoRender);
    const renders = [{ name: 'render-photo', picture: photoRender }, ...Object.entries(cams).filter(([n]) => n.startsWith('render-') && n !== 'render-photo').map(([name, cam]) => ({ name, picture: renderMesh(replayed.mesh, cam).picture }))];
    const look = await lanes.look({ photo: env.photo, renders, subject: doc.subject, round, openItems: open });
    const views = ['photo', ...renders.map(x => x.name)];
    const viewSize = Object.fromEntries([['photo', [env.photo.width, env.photo.height]], ...renders.map(x => [x.name, [x.picture.width, x.picture.height]])]);
    const { report, warnings } = parseGapReport(look.raw, { views, viewSize, source: look.source });
    return { replayed, photoRender, pixel, renders, report, warnings, score: fidelity(pixel, report.items, report.visionScore) };
  };

  let accepted: Measured | null = null;
  let lastRound: { round: number; applied: string[] } | null = null;
  for (let round = 1; ; round++) {
    const t0 = Date.now();
    let m: Measured;
    try { m = await measure(round, accepted?.report.items ?? []); }
    catch (e) {
      // The eye is a remote or local model; when it can't answer, stop with the best model kept, and say so.
      if (!accepted) throw e;
      rounds.push({ round, score: accepted.score, verdict: { stop: true, why: 'eye unavailable' }, report: accepted.report, warnings: [`eye failed: ${(e as Error).message.slice(0, 200)}`], applied: [], dropped: [], planner: 'none', renders: accepted.renders, ms: Date.now() - t0 });
      if (lastRound?.applied.length) rounds[rounds.length - 1].warnings.push(`round ${lastRound.round}'s ops were kept without being measured`);
      break;
    }
    if (!history.doc.subject && m.report.subject) history.apply({ op: 'setSubject', subject: m.report.subject }, 'aria');
    const rec: RoundRecord = { round, score: m.score, verdict: { stop: false, why: 'below target' }, report: m.report, warnings: m.warnings, applied: [], dropped: [], planner: 'none', renders: m.renders, ms: 0 };
    let base = m;
    if (accepted && lastRound?.applied.length && m.score.overall < accepted.score.overall - 0.002) {
      // The last round made it worse: take it back and plan again from the better model, with the reason.
      history.undo();
      rec.rejected = { from: accepted.score.overall, to: m.score.overall, ops: lastRound.applied };
      notes.push(`Round ${lastRound.round} was undone because it lowered the score from ${(accepted.score.overall * 100).toFixed(1)}% to ${(m.score.overall * 100).toFixed(1)}%. Its ops were: ${lastRound.applied.join('; ')}. Do not repeat them; try a smaller or different fix.`);
      base = accepted;
    } else accepted = m;
    scores.push(base.score.overall);
    let verdict = loopVerdict(scores, policy);
    // A hero is never finished while the scan still carries its shell (Kenne, hero cars, 2026-11-16).
    if (verdict.stop && history.doc.role === 'hero' && history.doc.useScan && verdict.why !== 'out of rounds') verdict = { stop: false, why: 'below target' };
    rec.verdict = verdict;
    lastRound = null;
    if (!verdict.stop && base.report.items.length) {
      const r = base.replayed;
      const ctx: PlanContext = {
        cameras: cams,
        hit: (o, d) => traceField(r.distance, o, d),
        samplePhoto: photoSampler(env.photo),
        coverage: coverageOf(env.photo, base.photoRender),
        bounds: r.bounds,
      };
      const { anchors, skipped } = anchorGaps(base.report, ctx);
      rec.dropped.push(...skipped);
      const guard: ApplyGuard = { bounds: r.bounds };
      let ops: ModelOp[] = [];
      if (lanes.agent) {
        try {
          const ans = parseAgentOps(await lanes.agent(agentPrompt(history.doc, anchors, ctx, round, notes)));
          ops = ans.ops; rec.dropped.push(...ans.dropped); rec.planner = 'agent';
        } catch (e) { rec.dropped.push(`agent lane failed: ${(e as Error).message}`); }
      }
      let { ok, failed } = applicable(history.doc, ops, guard);
      rec.dropped.push(...failed);
      if (!ok.length && !rec.rejected) {
        // The rules are the fallback for a silent or unusable agent, not a second try after a rejected round.
        ({ ok, failed } = applicable(history.doc, planFromGaps(history.doc, anchors, ctx, round), guard));
        rec.dropped.push(...failed); rec.planner = 'rules';
      }
      if (ok.length) {
        const label = `Aria, round ${round}: ${base.report.items.slice(0, 3).map(i => i.description.split(/[,.;]/)[0].toLowerCase()).join('; ')}${base.report.items.length > 3 ? '…' : ''}`;
        let cur = history.doc;
        for (const o of ok) { rec.applied.push(describeModelOp(cur, o)); cur = applyModelOp(cur, o).doc; }
        history.apply({ op: 'batch', label, ops: ok }, 'aria');
        lastRound = { round, applied: rec.applied };
      } else if (rounds.length) {
        rec.verdict = { stop: true, why: 'stalled' };
      }
    }
    rec.ms = Date.now() - t0;
    rounds.push(rec);
    await env.onRound?.(rec, m.replayed);
    if (rec.verdict.stop || (!base.report.items.length && !rec.applied.length)) break;
  }
  return rounds;
}
