// staging — where everyone stands and where the camera is, for every shot of a scene.
//
// Coverage only cuts together if it was staged: characters on marks, a line of action between them,
// and every camera setup on the same side of that line. This module derives that floor plan from the
// shot list and the continuity ledger, lets a filmmaker move marks and cameras (overrides are stored
// on the scene and always win), checks the result, and phrases each shot's blocking for the prompt so
// a generated frame is composed the way the plan says.
//
// The stage is a unit square seen from above. x runs screen-left → screen-right as the master sees it;
// y runs upstage (0) → toward the master camera (1). It is deliberately engine-neutral: the same plan
// can drive a 2D floor plan today and an interactive 3D stage later.
//
// Pure and deterministic.

import type { SceneLedger } from './continuityLedger';

export interface StagePoint { x: number; y: number }

export interface StageMark extends StagePoint {
  name: string;
  /** Where they came from in this shot, when they move. */
  from?: StagePoint;
  posture?: string;
  /** Off the playing area (not yet entered, or exited). */
  offstage?: boolean;
}

export type SetupKind = 'wide' | 'two-shot' | 'ots' | 'single' | 'insert' | 'pov';

export interface CameraSetup extends StagePoint {
  /** What the lens is pointed at. */
  aim: StagePoint;
  kind: SetupKind;
  subject?: string;
  label: string;
}

export interface ShotStaging {
  shotId: string;
  slug?: string;
  marks: StageMark[];
  camera: CameraSetup;
  /** True when this setup is on the far side of the line of action from the scene's master. */
  crossesLine: boolean;
}

export interface StagingIssue { shotId: string; slug?: string; message: string }

export interface StagingPlan {
  sceneId?: string;
  /** The line of action — between the two characters who anchor the scene. Null with fewer than two. */
  axis: { a: StagePoint; b: StagePoint; names: [string, string] } | null;
  shots: ShotStaging[];
  issues: StagingIssue[];
}

/** Filmmaker overrides, stored on the scene as `scene.staging`. */
export interface StagingOverrides {
  /** A character's mark for the whole scene (until a later shot moves them). */
  marks?: Record<string, StagePoint>;
  /** Per shot: a camera position, and/or marks that apply from this shot on. */
  shots?: Record<string, { camera?: StagePoint; marks?: Record<string, StagePoint> }>;
}

const clamp = (n: number) => Math.max(0.03, Math.min(0.97, n));
const pt = (x: number, y: number): StagePoint => ({ x: clamp(x), y: clamp(y) });
const mid = (a: StagePoint, b: StagePoint): StagePoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = (p: StagePoint): StagePoint => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });

/** Which side of the line a→b a point is on: +1 or −1 (0 on the line). */
export function sideOfLine(a: StagePoint, b: StagePoint, p: StagePoint): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

export function setupKindFor(type = ''): SetupKind {
  if (/\bPOV\b/i.test(type)) return 'pov';
  if (/\b(OTS|OVER[- ]THE[- ]SHOULDER)\b/i.test(type)) return 'ots';
  if (/\b(INSERT|DETAIL)\b/i.test(type)) return 'insert';
  if (/\b(50[- ]?50|TWO[- ]?SHOT|2[- ]?SHOT)\b/i.test(type)) return 'two-shot';
  if (/\b(EST|ESTABLISH\w*|WIDE|MASTER|AERIAL|FULL)\b/i.test(type)) return 'wide';
  return 'single';
}

const DEFAULT_MARKS: StagePoint[] = [pt(0.34, 0.45), pt(0.66, 0.45), pt(0.5, 0.26), pt(0.22, 0.3), pt(0.78, 0.3), pt(0.5, 0.12)];

function actionOf(shot: any): string {
  const spoken = !!(shot?.character || '').trim();
  return [shot?.subject, spoken ? '' : shot?.lines, shot?.notes, shot?.action].filter(Boolean).join('. ');
}

/** Build the floor plan for a scene. `ledger` supplies who is in each shot and their posture. */
export function planStaging(scene: any, ledger: SceneLedger, overrides: StagingOverrides = scene?.staging || {}): StagingPlan {
  const names: string[] = (scene?.bible?.characters || []).map((c: any) => c?.name).filter(Boolean);
  const pos = new Map<string, StageMark>();
  names.forEach((n, i) => {
    const p = overrides.marks?.[n] || DEFAULT_MARKS[i] || pt(0.5, 0.5);
    pos.set(n, { name: n, ...pt(p.x, p.y) });
  });

  const anchor = (): StagingPlan['axis'] => {
    if (names.length < 2) return null;
    const a = pos.get(names[0])!, b = pos.get(names[1])!;
    return { a: round(a), b: round(b), names: [names[0], names[1]] };
  };
  // The master side: where the wide looks from. Every other setup is checked against it.
  const masterCam = pt(0.5, 0.94);
  const issues: StagingIssue[] = [];
  const shots: ShotStaging[] = [];
  const find = (n?: string) => names.find((x) => x.toLowerCase() === (n || '').trim().toLowerCase());

  (scene?.shots || []).forEach((shot: any, i: number) => {
    const text = actionOf(shot);
    const moved = new Map<string, StagePoint>();

    // Marks pinned from this shot on.
    for (const [n, p] of Object.entries(overrides.shots?.[shot.id]?.marks || {})) {
      const who = find(n); const cur = who && pos.get(who);
      if (cur) { moved.set(who!, { x: cur.x, y: cur.y }); Object.assign(cur, pt(p.x, p.y), { offstage: false }); }
    }
    // Movement the action describes.
    for (const n of names) {
      const cur = pos.get(n)!;
      if (overrides.shots?.[shot.id]?.marks?.[n]) continue;
      const N = esc(n);
      const exits = new RegExp(`\\b${N}\\b[^.]*\\b(exits?|leaves?|storms? out|walks? out|goes out)\\b`, 'i').test(text);
      const enters = new RegExp(`\\b${N}\\b[^.]*\\b(enters?|comes? in|arrives?|appears?|bursts? in)\\b`, 'i').test(text);
      const toward = text.match(new RegExp(`\\b${N}\\b[^.]*\\b(?:cross(?:es)? to|walks? (?:over )?to|moves? to(?:ward)?|approach(?:es)?|steps? (?:up )?to|closes? in on)\\s+(?:the\\s+)?([A-Za-z]+)`, 'i'));
      const away = new RegExp(`\\b${N}\\b[^.]*\\b(backs? away|steps? back|retreats?|turns? away)\\b`, 'i').test(text);
      const before = { x: cur.x, y: cur.y };
      if (exits) { Object.assign(cur, pt(cur.x < 0.5 ? 0.03 : 0.97, cur.y), { offstage: true }); moved.set(n, before); }
      else if (enters) {
        const home = overrides.marks?.[n] || DEFAULT_MARKS[names.indexOf(n)] || pt(0.5, 0.5);
        moved.set(n, pt(home.x < 0.5 ? 0.03 : 0.97, 0.7));
        Object.assign(cur, pt(home.x, home.y), { offstage: false });
      } else if (toward) {
        const other = find(toward[1]); const target = other && other !== n ? pos.get(other) : undefined;
        if (target) { Object.assign(cur, pt(target.x + (cur.x <= target.x ? -0.11 : 0.11), target.y + 0.02)); moved.set(n, before); }
      } else if (away) { Object.assign(cur, pt(cur.x + (cur.x < 0.5 ? -0.12 : 0.12), cur.y - 0.04)); moved.set(n, before); }
    }

    const inShot = ledger.shots[i]?.characters.map((c) => c.name) || [];
    const marks: StageMark[] = names.filter((n) => inShot.includes(n) || moved.has(n) || !pos.get(n)!.offstage).map((n) => {
      const cur = pos.get(n)!;
      return { name: n, ...round(cur), from: moved.has(n) ? round(moved.get(n)!) : undefined, posture: ledger.shots[i]?.characters.find((c) => c.name === n)?.posture, offstage: cur.offstage || undefined };
    });

    const axis = anchor();
    const kind = setupKindFor(shot?.type);
    const subjectName = find(shot?.character) || names.find((n) => new RegExp(`\\b${esc(n)}\\b`, 'i').test(shot?.type || '')) || inShot[0];
    const subject = subjectName ? pos.get(subjectName) : undefined;
    const others = names.filter((n) => n !== subjectName && !pos.get(n)!.offstage);
    const other = others.length ? pos.get(others[0]) : undefined;
    const centre = axis ? mid(axis.a, axis.b) : subject ? { x: subject.x, y: subject.y } : pt(0.5, 0.45);

    let cam: StagePoint, aim: StagePoint;
    if (kind === 'wide' || !subject) { cam = masterCam; aim = centre; }
    else if (kind === 'two-shot') { cam = pt(centre.x, centre.y + 0.34); aim = centre; }
    else if (kind === 'ots' && other) {
      // Behind the listener's shoulder, on the master side of the line, looking at the subject.
      cam = pt(other.x + (other.x - subject.x) * 0.28, other.y + 0.13); aim = subject;
    } else if (kind === 'pov' && other) { cam = pt(other.x, other.y); aim = subject; }
    else if (kind === 'insert') { cam = pt(subject.x, subject.y + 0.12); aim = subject; }
    else {
      // A single: cross-angle from the other character's side, still on the master side of the line.
      const lean = other ? (other.x - subject.x) * 0.45 : 0;
      cam = pt(subject.x + lean, subject.y + 0.26); aim = subject;
    }
    const pinned = overrides.shots?.[shot.id]?.camera;
    if (pinned) cam = pt(pinned.x, pinned.y);

    const crossesLine = !!axis && sideOfLine(axis.a, axis.b, cam) !== 0 && sideOfLine(axis.a, axis.b, cam) !== sideOfLine(axis.a, axis.b, masterCam);
    if (crossesLine) {
      issues.push({ shotId: shot.id, slug: shot.slug, message: `Camera is across the line between ${axis!.names[0]} and ${axis!.names[1]} — they will swap sides of frame on this cut. Move the camera back to the master side, or bridge it with a shot on the line.` });
    }
    shots.push({
      shotId: shot.id, slug: shot.slug, marks,
      camera: { ...round(cam), aim: round(aim), kind, subject: subjectName, label: `${shot.slug || ''} ${kind}`.trim() },
      crossesLine,
    });
  });

  return { sceneId: scene?.id, axis: anchor(), shots, issues };
}

/** A shot's blocking, as a model can use it: who is where in depth and across frame relative to this
 *  camera, and who moves. Short on purpose — it sits beside continuity, not instead of it. */
export function blockingClause(s: ShotStaging): string {
  const { camera } = s;
  const dx = camera.aim.x - camera.x, dy = camera.aim.y - camera.y;
  const len = Math.hypot(dx, dy) || 1;
  // Camera-space: `across` is screen-x (right positive), `depth` is distance along the lens axis.
  const view = (p: StagePoint) => {
    const rx = p.x - camera.x, ry = p.y - camera.y;
    return { depth: (rx * dx + ry * dy) / len, across: (rx * -dy + ry * dx) / len };
  };
  // Who this setup actually frames: a single, an insert or a POV holds its subject alone; an
  // over-the-shoulder holds the subject and the shoulder it looks past; wider setups hold everyone.
  const framed = (m: StageMark) => {
    if (camera.kind === 'wide' || camera.kind === 'two-shot' || !camera.subject) return true;
    if (m.name === camera.subject) return true;
    return camera.kind === 'ots' && s.marks.filter((x) => !x.offstage && x.name !== camera.subject)[0]?.name === m.name;
  };
  const visible = s.marks.filter((m) => !m.offstage && framed(m)).map((m) => ({ m, v: view(m) })).filter((x) => x.v.depth > -0.02).sort((a, b) => a.v.depth - b.v.depth);
  if (!visible.length) return '';
  // Depth words only when the figures really are at different distances from this camera — in a
  // flat two-shot, calling one of them "background" would be wrong.
  const layered = visible.length > 1 && visible[visible.length - 1].v.depth - visible[0].v.depth > 0.1;
  const bits = visible.map(({ m, v }, i) => {
    const plane = !layered ? '' : i === 0 ? 'foreground ' : i === visible.length - 1 ? 'background ' : 'midground ';
    const side = v.across < -0.06 ? 'frame-left' : v.across > 0.06 ? 'frame-right' : 'centre frame';
    // Direction of travel as THIS camera sees it, not as the floor plan is drawn.
    const move = m.from ? `, moving in from ${view(m.from).across < v.across ? 'screen-left' : 'screen-right'}` : '';
    return `${m.name} ${plane}${side}${m.posture ? `, ${m.posture}` : ''}${move}`;
  });
  const how = camera.kind === 'ots' ? 'over the shoulder' : camera.kind === 'pov' ? 'point of view' : camera.kind === 'wide' ? 'wide, whole space visible' : camera.kind === 'two-shot' ? 'both in frame' : camera.kind === 'insert' ? 'tight detail' : 'single';
  return `Blocking (${how}): ${bits.join('; ')}.`;
}
