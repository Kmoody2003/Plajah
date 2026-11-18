// The fidelity loop: replay → render → measure → look → plan → apply, until the score reaches the aim or
// progress stalls (docs/game-studio-photo-to-3d.md §2). Lanes are injected, so the same loop runs with
// Gemini in the cloud, Gemma on the desktop's GPU, or fixed answers in tests.
//
// Two guards keep the agent honest: a round that lowers the measured score is undone (one undo, the round was
// one batch) and the agent is told why; and while the scan carries the body, a part big enough to bury it is
// refused before it is applied.

import { traceField, framingCamera } from './camera';
import { parseGapReport, SEVERITIES, type GapItem, type GapReport } from './gapReport';
import { applyModelOp, describeModelOp, rgbToHex, type ModelHistory, type ModelOp } from './modelOps';
import { agentPrompt, anchorGaps, parseAgentOps, planFromGaps, type PlanContext } from './planner';
import { renderMesh } from './render';
import { outlineFixes } from './outline';
import { replay, type ReplayInputs, type Replayed } from './replay';
import { fidelity, loopVerdict, matchScore, scoreView, DEFAULT_POLICY, type FidelityScore, type LoopPolicy, type LoopVerdict, type Picture, type ViewScore } from './score';
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
  /** The same, with every eye claim at the confidence the eye gave it (no discount where the photo contradicted it). */
  strictScore: FidelityScore;
  verdict: LoopVerdict;
  report: GapReport;
  warnings: string[];
  /** This round measured a worse model than the last, so the last round's ops were undone. */
  rejected?: { from: number; to: number; ops: string[] };
  /** Each edit tried on its own against the photo: kept or dropped, at what strength, match before → after. */
  trials: string[];
  /** Where the round's time went, ms: replay+render, eye, agent, edit trials. */
  timings: { measure: number; eye: number; agent: number; trials: number; trialCount: number };
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
  /** Measured outline fixes each round (outline.ts), tried like any edit. Default on. */
  outlineFixes?: boolean;
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

/**
 * The same edit at a fraction of its strength: parts and extrusions shrink toward their centre, strokes press
 * lighter, paint goes on thinner, a part's move or resize goes part of the way. Null when an op has no strength.
 */
export function scaled(doc: ModelDoc, o: ModelOp, f: number): ModelOp | null {
  const lerp = (a: number[], b: number[]) => a.map((v, i) => +(v + (b[i] - v) * f).toFixed(4)) as Vec3;
  switch (o.op) {
    case 'addPart': {
      const p = o.part, size = p.size.map(v => +(v * f).toFixed(4)) as Vec3;
      // A ring keeps its inner edge where it was (on the body) while its tube gets thinner.
      if (p.shape === 'torus') size[0] = +(p.size[0] - 2 * p.size[1] * (1 - f)).toFixed(4);
      if (p.shape === 'capsule') return { op: 'addPart', part: { ...p, size, end: p.end ? lerp(p.center, p.end) : p.end } };
      return { op: 'addPart', part: { ...p, size, blend: p.blend !== undefined ? p.blend * f : undefined } };
    }
    case 'extrude': return { ...o, length: o.length * f, radius: o.radius * Math.sqrt(f), endRadius: o.endRadius !== undefined ? o.endRadius * Math.sqrt(f) : undefined };
    case 'sculpt': return { op: 'sculpt', stroke: { ...o.stroke, strength: o.stroke.strength * f } };
    case 'paint': return o.layer.projectPhoto ? null : { op: 'paint', layer: { ...o.layer, opacity: o.layer.opacity * f } };
    case 'updatePart': {
      const cur = doc.parts.find(x => x.id === o.partId);
      if (!cur) return null;
      const patch: Record<string, unknown> = { ...o.patch };
      for (const k of ['center', 'size', 'rot', 'end'] as const) {
        const to = o.patch[k], from = cur[k];
        if (Array.isArray(to) && Array.isArray(from)) patch[k] = lerp(from, to);
      }
      return { op: 'updatePart', partId: o.partId, patch };
    }
    default: return null;
  }
}

/**
 * Put edits where the model actually is: a ring that the agent placed off the body's axis (it used the anchor
 * point on the surface as the ring's centre) is moved onto the axis at the same height.
 */
export function ground(o: ModelOp, bounds: { min: Vec3; max: Vec3 }): ModelOp {
  if (o.op !== 'addPart' || o.part.shape !== 'torus' || Math.abs(o.part.rot[0]) > 20 || Math.abs(o.part.rot[2]) > 20) return o;
  const cx = (bounds.min[0] + bounds.max[0]) / 2, cz = (bounds.min[2] + bounds.max[2]) / 2;
  const off = Math.hypot(o.part.center[0] - cx, o.part.center[2] - cz);
  if (off < 0.01 || off > o.part.size[0] / 2) return o;
  return { op: 'addPart', part: { ...o.part, center: [+cx.toFixed(4), o.part.center[1], +cz.toFixed(4)] } };
}

/**
 * A gap the eye reports again cannot cost more than it did, unless this round's kept edits touched it: the
 * eye re-rating an unchanged area is noise, and noise must not undo good work (it did, twice, on the conga).
 */
export function steadyGaps(items: GapItem[], before: GapItem[], touched: Set<string>): GapItem[] {
  const prev = new Map(before.map(i => [i.id, i]));
  return items.map(i => {
    const p = prev.get(i.id);
    if (!p || touched.has(i.id)) return i;
    const sev = SEVERITIES[Math.min(SEVERITIES.indexOf(i.severity), SEVERITIES.indexOf(p.severity))];
    return { ...i, severity: sev, confidence: Math.min(i.confidence, p.confidence) };
  });
}

interface Measured { strict: FidelityScore; measureMs: number; eyeMs: number; replayed: Replayed; photoRender: Picture; pixel: ViewScore; renders: { name: string; picture: Picture }[]; report: GapReport; warnings: string[]; score: FidelityScore }

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
    const tm = Date.now();
    const replayed = replay(doc, env);
    // Unlit from the photo's camera: projected photo colour already carries the photo's light, so shading it
    // again would read as a colour error. The other angles are shaded so the eye can read their shape.
    const photoRender = renderMesh(replayed.mesh, photoCam, { ambient: 1 }).picture;
    const pixel = scoreView(env.photo, photoRender);
    const renders = [{ name: 'render-photo', picture: photoRender }, ...Object.entries(cams).filter(([n]) => n.startsWith('render-') && n !== 'render-photo').map(([name, cam]) => ({ name, picture: renderMesh(replayed.mesh, cam).picture }))];
    const measureMs = Date.now() - tm, te = Date.now();
    const look = await lanes.look({ photo: env.photo, renders, subject: doc.subject, round, openItems: open });
    const eyeMs = Date.now() - te;
    const views = ['photo', ...renders.map(x => x.name)];
    const viewSize = Object.fromEntries([['photo', [env.photo.width, env.photo.height]], ...renders.map(x => [x.name, [x.picture.width, x.picture.height]])]);
    const { report, warnings } = parseGapReport(look.raw, { views, viewSize, source: look.source });
    const strictItems = steadyGaps(report.items, open, touched);
    report.items = strictItems.map(i => {
      const k = refuted.get(i.id) ?? 0;
      return k && (i.view === 'photo' || i.view === 'render-photo') ? { ...i, confidence: +(i.confidence * 0.5 ** k).toFixed(3) } : i;
    });
    return { strict: fidelity(pixel, strictItems, report.visionScore), measureMs, eyeMs, replayed, photoRender, pixel, renders, report, warnings, score: fidelity(pixel, report.items, report.visionScore) };
  };

  /** Gap ids the last round's kept edits answered (their `why`). */
  let touched = new Set<string>();
  /**
   * Eye claims the photo contradicts: every edit aimed at them changed what the photo's camera sees and made
   * the match worse. Each such round halves the claim's confidence (only for claims in the photo's own view;
   * the photo can't speak for the back). Measurement beats opinion where there is measurement.
   */
  const refuted = new Map<string, number>();
  let refutedNow = new Set<string>(), supported = new Set<string>();
  /** One edit tried on the current doc: the photo match it gives. */
  const tryDoc = (d: ModelDoc) => { const mesh = replay(d, env).mesh; const picture = renderMesh(mesh, photoCam, { ambient: 1 }).picture; return { m: matchScore(scoreView(env.photo, picture)), picture, mesh }; };
  /** The other angles, small: enough to tell whether an edit the photo can't see changes anything at all. */
  const angleCams = Object.values(angleCameras(photoCam, 96));
  const anglePics = (mesh: Replayed['mesh']) => angleCams.map(c => renderMesh(mesh, c, { depthOnly: false }).picture);
  /** Pixels that visibly changed between two photo-camera renders (a silhouette flip, or a clear colour change). */
  const changedPixels = (a: Picture, b: Picture) => {
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if ((a.data[i + 3] > 127) !== (b.data[i + 3] > 127)) { n++; continue; }
      if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) n++;
    }
    return n;
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
      rounds.push({ round, score: accepted.score, strictScore: accepted.strict, verdict: { stop: true, why: 'eye unavailable' }, report: accepted.report, warnings: [`eye failed: ${(e as Error).message.slice(0, 200)}`], applied: [], dropped: [], planner: 'none', renders: accepted.renders, trials: [], timings: { measure: 0, eye: 0, agent: 0, trials: 0, trialCount: 0 }, ms: Date.now() - t0 });
      if (lastRound?.applied.length) rounds[rounds.length - 1].warnings.push(`round ${lastRound.round}'s ops were kept without being measured`);
      break;
    }
    if (!history.doc.subject && m.report.subject) history.apply({ op: 'setSubject', subject: m.report.subject }, 'aria');
    const rec: RoundRecord = { round, score: m.score, strictScore: m.strict, verdict: { stop: false, why: 'below target' }, report: m.report, warnings: m.warnings, trials: [], timings: { measure: m.measureMs, eye: m.eyeMs, agent: 0, trials: 0, trialCount: 0 }, applied: [], dropped: [], planner: 'none', renders: m.renders, ms: 0 };
    let base = m;
    if (accepted && lastRound?.applied.length && m.score.overall < accepted.score.overall - 1e-9) {
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
    touched = new Set();
    refutedNow = new Set(); supported = new Set();
    // The measured half of the eye: outline disagreements between the photo and the photo-camera render.
    const outlineOps = verdict.stop || env.outlineFixes === false ? [] : outlineFixes(env.photo, base.photoRender, renderMesh(base.replayed.mesh, photoCam, { depthOnly: true }).depth, photoCam, round);
    if (!verdict.stop && (base.report.items.length || outlineOps.length)) {
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
      if (lanes.agent && anchors.length) {
        try {
          const ta = Date.now();
          const ans = parseAgentOps(await lanes.agent(agentPrompt(history.doc, anchors, ctx, round, notes)));
          rec.timings.agent = Date.now() - ta;
          ops = ans.ops; rec.dropped.push(...ans.dropped); rec.planner = 'agent';
        } catch (e) { rec.dropped.push(`agent lane failed: ${(e as Error).message}`); }
      }
      ops = [...ops.map(o => ground(o, r.bounds)), ...outlineOps];
      let { ok, failed } = applicable(history.doc, ops, guard);
      rec.dropped.push(...failed);
      const tt = Date.now();
      ok = trialEdits(history.doc, ok, base.pixel, base.photoRender, rec, base.replayed.mesh);
      rec.timings.trials = Date.now() - tt;
      if (!ok.some(o => whyOf(o) !== 'outline') && !rec.rejected && anchors.length) {
        // The rules are the fallback for a silent, unusable or unhelpful agent (not a second try after a rejected
        // round). They are tried on top of whatever outline fixes were kept.
        let after = history.doc;
        for (const o of ok) after = applyModelOp(after, o).doc;
        const fromRules = applicable(after, planFromGaps(after, anchors, ctx, round).map(o => ground(o, r.bounds)), guard);
        rec.dropped.push(...fromRules.failed);
        const tr = Date.now();
        const afterPic = ok.length ? renderMesh(replay(after, env).mesh, photoCam, { ambient: 1 }).picture : base.photoRender;
        const kept = trialEdits(after, fromRules.ok, ok.length ? scoreView(env.photo, afterPic) : base.pixel, afterPic, rec);
        rec.timings.trials += Date.now() - tr;
        if (kept.length) { ok = [...ok, ...kept]; rec.planner = 'rules'; }
      }
      if (rec.planner === 'none' && ok.length) rec.planner = 'rules';
      for (const why of refutedNow) refuted.set(why, (refuted.get(why) ?? 0) + 1);
      if (ok.length) {
        for (const o of ok) { const why = whyOf(o); if (why) touched.add(why); }
        const outlineKept = ok.filter(o => whyOf(o) === 'outline').length;
        const said = base.report.items.slice(0, 3).map(i => i.description.split(/[,.;]/)[0].toLowerCase());
        if (outlineKept) said.unshift(`${outlineKept} outline fix${outlineKept > 1 ? 'es' : ''}`);
        const label = `Aria, round ${round}: ${said.join('; ')}${base.report.items.length > 3 ? '…' : ''}`;
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

  /**
   * Each edit on its own, in order, against the photo: at full strength, then half, then a quarter. An edit is
   * kept at the strength that matches the photo best. If the edit changes what the photo's camera sees, it must
   * raise the match; if it doesn't change a single visible pixel (the back, a dent seen face-on), the photo
   * can't judge it, so it passes and the eye judges it next round (and the round guard can still undo it).
   * Materials ride along with the edits that use them.
   */
  function trialEdits(start: ModelDoc, ops: ModelOp[], before: ViewScore, beforePic: Picture, rec: RoundRecord, startMesh?: Replayed['mesh']): ModelOp[] {
    let cur = start, curM = matchScore(before), curPic = beforePic;
    let curAngles: Picture[] | null = null; // the current doc's other angles, rendered when first needed
    let curMesh: Replayed['mesh'] | undefined = startMesh;
    const kept: ModelOp[] = [];
    for (const o of ops) {
      if (o.op === 'putMaterial' || o.op === 'setSubject') { try { cur = applyModelOp(cur, o).doc; kept.push(o); } catch { /* reported by applicable */ } continue; }
      const label = describeModelOp(cur, o);
      let seenAny = false;
      let best: { op: ModelOp; doc: ModelDoc; m: number; f: number; picture: Picture; seen: boolean; angles: Picture[] | null; mesh: Replayed['mesh'] } | null = null;
      const tried: string[] = [];
      for (const f of [1, 0.5, 0.25]) {
        const v = f === 1 ? o : scaled(cur, o, f);
        if (!v) break;
        let d: ModelDoc;
        try { d = applyModelOp(cur, v).doc; } catch { break; }
        const { m, picture, mesh } = tryDoc(d);
        rec.timings.trialCount++;
        const seen = changedPixels(curPic, picture) > 0;
        let angles: Picture[] | null = null, elsewhere = false;
        if (seen) seenAny = true;
        if (!seen) {
          // Not visible from the photo: it has to change at least one other angle, or it does nothing at all
          // (a part buried inside the body, a paint under another paint) and is only clutter.
          curAngles ??= anglePics(curMesh ?? tryDoc(cur).mesh);
          angles = anglePics(mesh);
          elsewhere = angles.some((a, i) => changedPixels(curAngles![i], a) > 0);
        }
        tried.push(`${f * 100}% ${(m * 100).toFixed(2)}${seen ? '' : elsewhere ? ' (unseen)' : ' (no effect)'}`);
        const passes = seen ? m > curM + 1e-4 : elsewhere && m >= curM - 1e-6;
        if (passes && (!best || m > best.m)) best = { op: v, doc: d, m, f, picture, seen, angles, mesh };
        // Clearly better at full strength: no need to try it weaker.
        if (best && f === 1 && m > curM + 0.002) break;
      }
      if (best) {
        rec.trials.push(`kept ${label}${best.f < 1 ? ` at ${best.f * 100}%` : ''}: ${(curM * 100).toFixed(2)} → ${(best.m * 100).toFixed(2)}${best.seen ? '' : ' (not visible from the photo; the eye judges it)'}`);
        cur = best.doc; curM = best.m; curPic = best.picture; curAngles = best.angles; curMesh = best.mesh; kept.push(best.op);
        const why = whyOf(o); if (why) { supported.add(why); refutedNow.delete(why); }
      } else {
        const why = whyOf(o); if (why && seenAny && !supported.has(why)) refutedNow.add(why);
        rec.trials.push(`dropped ${label}: no strength improved the photo match or changed another angle (${(curM * 100).toFixed(2)} → ${tried.join(', ')})`);
      }
    }
    // A material no kept edit uses is noise in the history.
    const used = new Set(kept.flatMap(o => o.op === 'addPart' ? [o.part.material] : o.op === 'paint' ? [o.layer.material] : o.op === 'extrude' ? [o.material] : o.op === 'updatePart' ? [o.patch.material] : []));
    const out = kept.filter(o => o.op !== 'putMaterial' || used.has(o.material.id) || start.materials.some(m => m.id === o.material.id));
    return out.some(o => o.op !== 'putMaterial' && o.op !== 'setSubject') ? out : [];
  }
}

function whyOf(o: ModelOp): string | undefined {
  switch (o.op) {
    case 'addPart': return o.part.why;
    case 'extrude': return o.why;
    case 'sculpt': return o.stroke.why;
    case 'paint': return o.layer.why;
    default: return undefined;
  }
}
