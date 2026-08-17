// skyGraph — turns the real standards graph into the constellation the Sky renders.
//
// AN HONEST CORRECTION TO THE CONCEPT.
//
// The mockup promised cross-subject wonder — "Sound sits three steps from Maths". The data does
// not support that claim. Counting the actual prerequisite edges in data/educationStandards.ts:
// 19 edges, and every single one stays inside its own subject (ELA→ELA, MATH→MATH, SCIENCE→
// SCIENCE). There are exactly zero cross-subject relationships to draw.
//
// Inventing them was the one thing worth refusing. A constellation with made-up edges is
// decoration wearing the costume of a knowledge map, and a student who follows a fabricated
// "Sound → Maths" link and finds nothing there learns that the map lies. Cross-subject edges are
// a genuine editorial job — someone has to decide that frequency ratios and numeric ratios are
// the same idea — and until that work is done the Sky shows what is true instead.
//
// What IS true, and is worth showing: prerequisite chains. "Ratios & Proportional Relationships
// unlocks Expressions & Equations" is a real edge, and a map of where a learner stands in those
// chains — lit where they're strong, dark where they haven't been — is a more useful thing than
// a decorative sky anyway. Progression reads outward: foundations sit near the centre of each
// constellation, and what they unlock sits further out.

import { STANDARDS, type LearningStandard, type Subject } from '../data/educationStandards';

export interface SkyNode {
  id: string;              // `${subject}::${domain}`
  subject: Subject;
  domain: string;
  standardIds: string[];
  /** Longest prerequisite chain reaching this domain — 0 for a foundation. */
  depth: number;
  /** 0–100 from the learner ledger; null when they've never touched it. */
  mastery: number | null;
  x: number;               // 0–1, deterministic
  y: number;               // 0–1
}

export interface SkyEdge {
  from: string;
  to: string;
  /** True when both ends have ledger history — the path the learner actually walked. */
  travelled: boolean;
}

export interface SkyGraph {
  nodes: SkyNode[];
  edges: SkyEdge[];
  /** Domains with no ledger record at all. The dark stars. */
  unopened: string[];
}

const domainKey = (s: LearningStandard) => `${s.subject}::${s.domain}`;

/** Where each subject's constellation sits. Fixed, so the sky a learner recognises today is
 *  the same sky tomorrow — a map that rearranges itself is not a map. */
const SUBJECT_ANCHOR: Partial<Record<Subject, { x: number; y: number }>> = {
  MATH:     { x: 0.26, y: 0.34 },
  ELA:      { x: 0.72, y: 0.28 },
  SCIENCE:  { x: 0.48, y: 0.74 },
  SOCIAL:   { x: 0.84, y: 0.66 },
  ARTS:     { x: 0.14, y: 0.74 },
  LANGUAGE: { x: 0.60, y: 0.10 },
  CS:       { x: 0.90, y: 0.20 },
};

/** Longest path to each domain through the prerequisite DAG. Cycles are tolerated rather than
 *  thrown on: MATH's Operations ⇄ Base Ten pair is mutually prerequisite in the real data, and
 *  a knowledge map should not crash because two topics genuinely reinforce each other. */
function computeDepths(
  domains: Map<string, string[]>,
  edges: Array<{ from: string; to: string }>,
): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const key of domains.keys()) incoming.set(key, []);
  for (const e of edges) if (e.from !== e.to) incoming.get(e.to)?.push(e.from);

  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (key: string): number => {
    if (depth.has(key)) return depth.get(key)!;
    if (visiting.has(key)) return 0;   // cycle — treat this arm as a foundation
    visiting.add(key);
    const parents = incoming.get(key) ?? [];
    const d = parents.length ? Math.max(...parents.map(walk)) + 1 : 0;
    visiting.delete(key);
    depth.set(key, d);
    return d;
  };

  for (const key of domains.keys()) walk(key);
  return depth;
}

/**
 * Build the constellation.
 *
 * @param masteryByStandard 0–100 per standard id, from learnerProficiency. Omit for the
 *        signed-out sky, which shows the shape of the map without anyone's progress on it.
 */
export function buildSkyGraph(masteryByStandard: Record<string, number> = {}): SkyGraph {
  // ── Domains ──
  const domainStandards = new Map<string, string[]>();
  const domainMeta = new Map<string, { subject: Subject; domain: string }>();
  for (const s of STANDARDS) {
    const key = domainKey(s);
    if (!domainStandards.has(key)) {
      domainStandards.set(key, []);
      domainMeta.set(key, { subject: s.subject, domain: s.domain });
    }
    domainStandards.get(key)!.push(s.id);
  }

  // ── Edges, lifted from standard-level prerequisites to domain level ──
  const byId = new Map(STANDARDS.map(s => [s.id, s]));
  const seen = new Set<string>();
  const rawEdges: Array<{ from: string; to: string }> = [];
  for (const s of STANDARDS) {
    for (const prereqId of s.prerequisites ?? []) {
      const prereq = byId.get(prereqId);
      if (!prereq) continue;                     // a dangling id is data debt, not an edge
      const from = domainKey(prereq);
      const to = domainKey(s);
      if (from === to) continue;                 // within a domain, not a visible link
      const k = `${from}→${to}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rawEdges.push({ from, to });
    }
  }

  const depths = computeDepths(domainStandards, rawEdges);

  // ── Mastery per domain: the mean of the standards actually attempted ──
  const masteryFor = (ids: string[]): number | null => {
    const scores = ids.map(id => masteryByStandard[id]).filter((n): n is number => typeof n === 'number');
    if (!scores.length) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  // ── Layout: each subject a ring, foundations inward, what they unlock further out ──
  const bySubject = new Map<Subject, string[]>();
  for (const [key, meta] of domainMeta) {
    if (!bySubject.has(meta.subject)) bySubject.set(meta.subject, []);
    bySubject.get(meta.subject)!.push(key);
  }

  const nodes: SkyNode[] = [];
  for (const [subject, keys] of bySubject) {
    const anchor = SUBJECT_ANCHOR[subject] ?? { x: 0.5, y: 0.5 };
    // Sort for a stable angle assignment: depth first, then name. No randomness anywhere —
    // the same learner must get the same sky on every device.
    const ordered = [...keys].sort((a, b) => (depths.get(a)! - depths.get(b)!) || a.localeCompare(b));
    const maxDepth = Math.max(1, ...ordered.map(k => depths.get(k)!));

    // Ring per depth, evenly spread within it. A single golden-angle spiral across the whole
    // subject packs a busy constellation (ELA has eight domains) tightly enough that the LABELS
    // collide even when the stars technically don't — and a label you can't read is a star with
    // no name. Radius grows with how many share the ring.
    const byDepth = new Map<number, string[]>();
    for (const key of ordered) {
      const d = depths.get(key)!;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(key);
    }

    for (const [depth, ring] of byDepth) {
      const spread = 0.052 + Math.max(0, ring.length - 1) * 0.019;
      const radius = depth === 0 && ring.length === 1 ? 0 : spread + (depth / maxDepth) * 0.075;
      ring.forEach((key, i) => {
        const meta = domainMeta.get(key)!;
        // Offset each ring so successive rings don't line up on the same spokes.
        const angle = (i / ring.length) * Math.PI * 2 + depth * 0.7;
        nodes.push({
          id: key,
          subject,
          domain: meta.domain,
          standardIds: domainStandards.get(key)!,
          depth,
          mastery: masteryFor(domainStandards.get(key)!),
          x: anchor.x + Math.cos(angle) * radius,
          y: anchor.y + Math.sin(angle) * radius * 1.5,
        });
      });
    }
  }

  relax(nodes);

  const masteryById = new Map(nodes.map(n => [n.id, n.mastery]));
  const edges: SkyEdge[] = rawEdges.map(e => ({
    ...e,
    travelled: masteryById.get(e.from) !== null && masteryById.get(e.to) !== null,
  }));

  return {
    nodes,
    edges,
    unopened: nodes.filter(n => n.mastery === null).map(n => n.id),
  };
}

const clamp01 = (n: number) => Math.min(1 - EDGE, Math.max(EDGE, n));

/** The canvas is far wider than it is tall, so a vertical gap buys fewer pixels than the same
 *  number horizontally. Every distance check weights y by that ratio, or the layout looks
 *  correct in normalised maths and crowded on screen. */
export const CANVAS_ASPECT = 0.64;   // measured: the canvas renders 876x560
/** Star plus its label, as a fraction of canvas width. Measured against the real render. */
export const MIN_SEPARATION = 0.101;  // 82px label cap + gap, on an 876px canvas
/** Labels overhang their star by ~45px either side, so stars can't sit flush to the edge. */
const EDGE = 0.075;

export const separation = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, (a.y - b.y) * CANVAS_ASPECT);

/**
 * Push overlapping stars apart. Deterministic: fixed iteration count, fixed order, no
 * randomness — the layout must be identical on every device and every render.
 *
 * Needed because rings alone can't prevent collisions between two subjects whose anchors sit
 * near each other, and a purely analytic layout would have to reserve so much space that the
 * sky looked empty.
 */
function relax(nodes: SkyNode[]): void {
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * CANVAS_ASPECT;
        const dist = Math.hypot(dx, dy);
        if (dist >= MIN_SEPARATION) continue;
        moved = true;
        // Identical positions can't be separated by direction, so nudge along a fixed axis
        // derived from index — still deterministic, just not zero.
        const ux = dist < 1e-6 ? ((i % 2) ? 1 : -1) : dx / dist;
        const uy = dist < 1e-6 ? ((i % 3) ? 1 : -1) : dy / dist;
        const push = (MIN_SEPARATION - dist) / 2 + 0.001;
        a.x -= ux * push;
        b.x += ux * push;
        a.y -= (uy * push) / CANVAS_ASPECT;
        b.y += (uy * push) / CANVAS_ASPECT;
      }
    }
    // Clamp every pass, not once at the end: a node shoved past the edge and only pulled back
    // afterwards lands on top of its neighbour again, which is how two labels stayed clipped
    // AND overlapping after the first fix.
    for (const n of nodes) { n.x = clamp01(n.x); n.y = clamp01(n.y); }
    if (!moved) break;
  }
}

/** What a domain unlocks next — the honest answer to "why should I care about this one?". */
export function unlockedBy(graph: SkyGraph, nodeId: string): SkyNode[] {
  const ids = graph.edges.filter(e => e.from === nodeId).map(e => e.to);
  return graph.nodes.filter(n => ids.includes(n.id));
}

/** What a domain needs first. */
export function requires(graph: SkyGraph, nodeId: string): SkyNode[] {
  const ids = graph.edges.filter(e => e.to === nodeId).map(e => e.from);
  return graph.nodes.filter(n => ids.includes(n.id));
}

/** The next worthwhile step: an unopened domain whose prerequisites are all already lit. */
export function suggestNext(graph: SkyGraph): SkyNode | null {
  const ready = graph.nodes
    .filter(n => n.mastery === null)
    .filter(n => {
      const needs = requires(graph, n.id);
      return needs.length > 0 && needs.every(p => (p.mastery ?? 0) >= 50);
    })
    .sort((a, b) => a.depth - b.depth);
  return ready[0] ?? null;
}

export const SUBJECT_HUE: Record<string, string> = {
  MATH: '#00DAF3', ELA: '#D40055', SCIENCE: '#6B0099',
  SOCIAL: '#FF8C00', ARTS: '#D0BCFF', LANGUAGE: '#06D6A0', CS: '#3B82F6',
};
