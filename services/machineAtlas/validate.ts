// Pure schema validator for Machine Atlas datasets. No I/O, no three.js: safe in server code, tests and CI.
import { SAFETY_CRITICAL_CATEGORIES, type AtlasDataset, type PartArchetype, type PortKind, type SystemLayout } from './types';

export interface ValidationResult { ok: boolean; errors: string[] }

const range = (r: unknown): r is [number, number] =>
  Array.isArray(r) && r.length === 2 && typeof r[0] === 'number' && typeof r[1] === 'number' && isFinite(r[0]) && isFinite(r[1]);

/** hydraulic and fluid ports both carry liquid, so they may be joined; every other kind must match exactly. */
export const kindsCompatible = (a: PortKind, b: PortKind) => a === b || (new Set<PortKind>(['hydraulic', 'fluid']).has(a) && new Set<PortKind>(['hydraulic', 'fluid']).has(b));

const nonEmpty = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

function validatePart(p: PartArchetype, errors: string[]) {
  const at = `part ${p.id}`;
  if (!nonEmpty(p.id) || !/^[a-z0-9_]+$/.test(p.id)) errors.push(`${at}: id must be lowercase snake_case`);
  if (!nonEmpty(p.name)) errors.push(`${at}: missing name`);
  if (!p.systemIds || p.systemIds.length === 0) errors.push(`${at}: no systemIds`);
  const g = p.geometry;
  if (!g) errors.push(`${at}: missing geometry`);
  else if (g.kind === 'procedural' ? !nonEmpty(g.generator) : !(nonEmpty(g.url) && nonEmpty(g.meshMatch))) errors.push(`${at}: incomplete geometry`);
  const portIds = new Set<string>();
  for (const port of p.ports || []) {
    if (portIds.has(port.id)) errors.push(`${at}: duplicate port ${port.id}`);
    portIds.add(port.id);
  }
  const c = p.content;
  if (!c) { errors.push(`${at}: missing content`); return; }
  if (!nonEmpty(c.function)) errors.push(`${at}: content.function empty`);
  if (!nonEmpty(c.whatHappensInside)) errors.push(`${at}: content.whatHappensInside empty`);
  if (!c.wear || c.wear.length === 0) errors.push(`${at}: content.wear empty`);
  if (!c.failureModes || c.failureModes.length === 0) errors.push(`${at}: no failure modes`);
  for (const f of c.failureModes || []) {
    if (!nonEmpty(f.id) || !nonEmpty(f.name)) errors.push(`${at}: failure mode missing id/name`);
    if (!f.symptoms?.length) errors.push(`${at}: failure ${f.id} has no symptoms`);
    if (!f.causes?.length) errors.push(`${at}: failure ${f.id} has no causes`);
    if (!f.tests?.length) errors.push(`${at}: failure ${f.id} has no tests`);
  }
  if (!c.diagnostics?.length) errors.push(`${at}: diagnostics empty`);
  const r = c.repair;
  if (!r) errors.push(`${at}: missing repair`);
  else {
    if (!nonEmpty(r.summary) || !r.steps?.length) errors.push(`${at}: repair needs summary and steps`);
    if (!r.tools?.length) errors.push(`${at}: repair.tools empty`);
    if (![1, 2, 3, 4, 5].includes(r.difficulty)) errors.push(`${at}: repair.difficulty must be 1-5`);
    if (!range(r.timeHoursRange) || r.timeHoursRange[0] > r.timeHoursRange[1] || r.timeHoursRange[0] < 0) errors.push(`${at}: invalid timeHoursRange`);
    if (!nonEmpty(r.disclaimer) || !/service manual/i.test(r.disclaimer)) errors.push(`${at}: disclaimer must point to the factory service manual`);
    if (SAFETY_CRITICAL_CATEGORIES.includes(p.category) && !(r.safety && r.safety.length > 0)) errors.push(`${at}: safety-critical category ${p.category} needs a non-empty safety[]`);
  }
  const k = c.cost;
  if (!k) errors.push(`${at}: missing cost`);
  else {
    if (!range(k.partsRangeUSD) || k.partsRangeUSD[0] > k.partsRangeUSD[1] || k.partsRangeUSD[0] < 0) errors.push(`${at}: invalid partsRangeUSD`);
    if (!range(k.laborHoursRange) || k.laborHoursRange[0] > k.laborHoursRange[1] || k.laborHoursRange[0] < 0) errors.push(`${at}: invalid laborHoursRange`);
    if (k.note !== 'estimate') errors.push(`${at}: cost.note must be 'estimate'`);
  }
  if (!nonEmpty(c.aseArea)) errors.push(`${at}: aseArea empty`);
  if (!nonEmpty(c.reviewStatus)) errors.push(`${at}: reviewStatus empty`);
  const l = p.license;
  if (!l || !nonEmpty(l.license) || !nonEmpty(l.author) || typeof l.attribution !== 'string' || typeof l.generated !== 'boolean') errors.push(`${at}: incomplete license record`);
  else if (!l.generated && !nonEmpty(l.sourceUrl)) errors.push(`${at}: non-generated asset needs sourceUrl`);
}

export function validateDataset(d: AtlasDataset): ValidationResult {
  const errors: string[] = [];
  const partById = new Map<string, PartArchetype>();
  for (const p of d.parts) {
    if (partById.has(p.id)) errors.push(`duplicate part id ${p.id}`);
    partById.set(p.id, p);
    validatePart(p, errors);
  }
  const sysIds = new Set<string>();
  for (const s of d.systems) {
    if (sysIds.has(s.id)) errors.push(`duplicate system id ${s.id}`);
    sysIds.add(s.id);
  }
  for (const p of d.parts) for (const sid of p.systemIds || []) if (!sysIds.has(sid)) errors.push(`part ${p.id}: unknown system ${sid}`);

  // failure modes: globally unique ids
  const failureOwner = new Map<string, string[]>();
  const seenFailure = new Set<string>();
  for (const p of d.parts) for (const f of p.content?.failureModes || []) {
    if (seenFailure.has(f.id)) errors.push(`duplicate failure mode id ${f.id}`);
    seenFailure.add(f.id);
    failureOwner.set(f.id, [...(failureOwner.get(f.id) || []), p.id]);
  }

  const faultIds = new Set<string>();
  for (const f of d.faults) {
    if (faultIds.has(f.id)) errors.push(`duplicate fault id ${f.id}`);
    faultIds.add(f.id);
    if (!failureOwner.has(f.id)) errors.push(`fault ${f.id} does not refer to a real failure mode`);
    for (const pid of f.partIds) {
      if (!partById.has(pid)) errors.push(`fault ${f.id}: unknown part ${pid}`);
    }
    const owners = failureOwner.get(f.id) || [];
    if (owners.length && !f.partIds.some(pid => owners.includes(pid))) errors.push(`fault ${f.id}: none of its partIds owns the failure mode`);
  }

  for (const s of d.systems) {
    for (const pid of s.partIds) if (!partById.has(pid)) errors.push(`system ${s.id}: unknown part ${pid}`);
    for (const p of d.parts) if (p.systemIds?.includes(s.id) && !s.partIds.includes(p.id)) errors.push(`system ${s.id}: part ${p.id} claims the system but is not listed`);
    for (const c of s.connections) {
      const a = partById.get(c.from.part), b = partById.get(c.to.part);
      if (!a) { errors.push(`system ${s.id}: connection from unknown part ${c.from.part}`); continue; }
      if (!b) { errors.push(`system ${s.id}: connection to unknown part ${c.to.part}`); continue; }
      const pa = a.ports.find(x => x.id === c.from.port), pb = b.ports.find(x => x.id === c.to.port);
      if (!pa) { errors.push(`system ${s.id}: ${c.from.part} has no port ${c.from.port}`); continue; }
      if (!pb) { errors.push(`system ${s.id}: ${c.to.part} has no port ${c.to.port}`); continue; }
      if (!kindsCompatible(pa.kind, pb.kind)) errors.push(`system ${s.id}: incompatible ports ${c.from.part}.${pa.id}(${pa.kind}) -> ${c.to.part}.${pb.id}(${pb.kind})`);
      if (!kindsCompatible(pa.kind, c.kind)) errors.push(`system ${s.id}: connection kind ${c.kind} does not match port kind ${pa.kind} on ${c.from.part}.${pa.id}`);
      if (pa.direction === 'in') errors.push(`system ${s.id}: ${c.from.part}.${pa.id} is an input port used as a source`);
      if (pb.direction === 'out') errors.push(`system ${s.id}: ${c.to.part}.${pb.id} is an output port used as a sink`);
    }
    const scn = new Set<string>();
    for (const sc of s.scenarios) {
      if (scn.has(sc.id)) errors.push(`system ${s.id}: duplicate scenario ${sc.id}`);
      scn.add(sc.id);
      if (!['S0', 'S1', 'S2', 'S3'].includes(sc.tier)) errors.push(`scenario ${sc.id}: missing simulation tier badge`);
      for (const f of sc.faults) if (!faultIds.has(f) || !failureOwner.has(f)) errors.push(`scenario ${sc.id}: fault ${f} is not a real failure mode`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Layout check: every placement refers to a real part, a declared view and (optionally) a known generator. */
export function validateLayout(layout: SystemLayout, d: AtlasDataset, generators?: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const parts = new Map(d.parts.map(p => [p.id, p]));
  const views = new Set(layout.views.map(v => v.id));
  for (const pl of layout.placements) {
    const part = parts.get(pl.part);
    if (!part) { errors.push(`placement: unknown part ${pl.part}`); continue; }
    for (const v of pl.views) if (!views.has(v)) errors.push(`placement ${pl.part}: unknown view ${v}`);
    if (generators && part.geometry.kind === 'procedural' && !generators[part.geometry.generator]) errors.push(`part ${part.id}: unknown generator ${part.geometry.generator}`);
  }
  for (const id of Object.keys(layout.explode)) if (!parts.has(id)) errors.push(`explode: unknown part ${id}`);
  for (const [sc, vs] of Object.entries(layout.visuals)) for (const v of vs) if (!parts.has(v.part)) errors.push(`visuals ${sc}: unknown part ${v.part}`);
  for (const p of d.parts) if (!layout.placements.some(pl => pl.part === p.id)) errors.push(`part ${p.id} has no placement in any view`);
  return { ok: errors.length === 0, errors };
}
