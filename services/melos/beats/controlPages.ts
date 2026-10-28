// MEKA's control area — Maschine's MASTER / GROUP / SOUND tabs, each a set of pages of eight
// parameters. The eight knobs on screen and the eight knobs on the hardware are the SAME eight
// slots of the focused page, so turning knob 3 on a Maschine moves knob 3 on screen, whatever
// the page is. Pure: pages read and write the doc; the caller pushes instrument patches.
//
//   SOUND  sample/synth pad: Pitch/Gain · Amp Envelope · Filter · Sends
//          instrument pad:   Instrument (its macros) · Pitch/Gain · Sends
//   GROUP  the 16 pads of the Group: relative Tune / Level / Decay / Cutoff, absolute Swing
//   MASTER Master (volume, tempo, swing, limiter) · Buses (A–D levels, FX returns)

import type { ArrangeTrack, GrooveDoc, GroupMeta, PadConfig, PadFilterType, VelCurve } from './grooveDoc';
import { GROUP_NAMES, PAD_BANK } from './grooveDoc';
import { AURA_MACRO_LABELS, AURA_MACRO_ORDER } from '../instruments/aura/patch';
import { BAJO_MACRO_LABELS, BAJO_MACRO_ORDER } from '../instruments/bajo/patch';
import { SOMA_MACRO_LABELS, SOMA_MACRO_ORDER } from '../instruments/soma/patch';
import { SUITE, SUITE_ORDER, type SuiteInstrument } from '../instruments/vela/suite';

export type ControlTab = 'master' | 'group' | 'sound';

export interface ControlParam {
  id: string;
  label: string;
  min: number;
  max: number;
  defaultValue?: number;
  /** Stepped parameter: the value is an index into these labels. */
  options?: string[];
  /** Hardware/drag travel is logarithmic (frequencies, times). */
  log?: boolean;
  get: (d: GrooveDoc) => number;
  set: (d: GrooveDoc, v: number) => void;
  format: (v: number) => string;
}

export interface ControlPage {
  id: string;
  label: string;
  /** Always eight slots — null is an unlit knob, like an empty slot on the hardware display. */
  params: (ControlParam | null)[];
  /** The page drives an instrument's macros; the caller pushes the patch to the engine. */
  instrumentTrackId?: string;
}

// Kept local: instrumentFactory pulls in the audio engine, and these pages must stay pure.
const isSuite = (t: string): t is SuiteInstrument => (SUITE_ORDER as string[]).includes(t);
/** VELA-family macro order (air, body, shimmer, drift) — the suite labels are keyed in that order. */
const suiteOrder = (t: SuiteInstrument): string[] => Object.keys(SUITE[t].macroLabels);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pad8 = (xs: (ControlParam | null)[]): (ControlParam | null)[] => [...xs, ...Array(8).fill(null)].slice(0, 8);
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
const db = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}dB`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const panFmt = (v: number) => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`);

const FILTERS: PadFilterType[] = ['off', 'lowpass', 'highpass'];
const CURVES: VelCurve[] = ['linear', 'soft', 'hard'];

/** 0..1 knob travel → value, honouring log travel and steps. */
export function fromUnit(p: ControlParam, u: number): number {
  const x = clamp(u, 0, 1);
  if (p.options) return Math.round(x * (p.options.length - 1));
  if (p.log && p.min > 0) return p.min * Math.pow(p.max / p.min, x);
  return p.min + x * (p.max - p.min);
}
export function toUnit(p: ControlParam, v: number): number {
  if (p.options) return p.options.length > 1 ? v / (p.options.length - 1) : 0;
  if (p.log && p.min > 0) return Math.log(clamp(v, p.min, p.max) / p.min) / Math.log(p.max / p.min);
  return (clamp(v, p.min, p.max) - p.min) / (p.max - p.min);
}

// ── Instrument macros ───────────────────────────────────────────────────────

/** The macro knobs an instrument shows on its front panel, in order, with current values. */
export function instrumentMacros(t: ArrangeTrack | undefined): { label: string; value: number }[] {
  const ins = t?.instrument;
  const patch = ins?.patch as Record<string, unknown> | undefined;
  if (!ins || !patch) return [];
  const rec = (patch.macros ?? {}) as Record<string, number>;
  const fromRecord = (order: readonly string[], labels: Record<string, string>) =>
    order.map((k) => ({ label: labels[k] ?? k, value: typeof rec[k] === 'number' ? rec[k] : 0 }));
  if (Array.isArray(patch.macros)) return (patch.macros as { name: string; value: number }[]).slice(0, 8).map((m) => ({ label: m.name, value: m.value }));
  if (ins.type === 'aura') return fromRecord(AURA_MACRO_ORDER, AURA_MACRO_LABELS);
  if (ins.type === 'soma') return fromRecord(SOMA_MACRO_ORDER, SOMA_MACRO_LABELS);
  if (ins.type === 'bajo') return fromRecord(BAJO_MACRO_ORDER, BAJO_MACRO_LABELS);
  if (isSuite(ins.type)) return fromRecord(suiteOrder(ins.type), SUITE[ins.type].macroLabels);
  return []; // KERA plays programs; it has no macro bank
}

/**
 * Write one macro into a track's patch. Returns 'live' when the engine takes it as a macro
 * message (ONDA's macro bank), 'reload' when the patch must be pushed (record-style macros that
 * expand into engine params), or null when the instrument has no such macro.
 */
export function writeInstrumentMacro(d: GrooveDoc, trackId: string, index: number, value: number): 'live' | 'reload' | null {
  const t = d.arrangement.find((x) => x.id === trackId && x.kind === 'instrument');
  const ins = t?.instrument;
  const patch = ins?.patch as Record<string, unknown> | undefined;
  if (!ins || !patch) return null;
  const v = clamp(value, 0, 1);
  if (Array.isArray(patch.macros)) {
    const m = (patch.macros as { value: number }[])[index];
    if (!m) return null;
    m.value = v;
    return 'live';
  }
  const order: readonly string[] | null = ins.type === 'aura' ? AURA_MACRO_ORDER : ins.type === 'soma' ? SOMA_MACRO_ORDER
    : ins.type === 'bajo' ? BAJO_MACRO_ORDER : isSuite(ins.type) ? suiteOrder(ins.type) : null;
  const key = order?.[index];
  if (!key) return null;
  if (!patch.macros || typeof patch.macros !== 'object') patch.macros = {};
  (patch.macros as Record<string, number>)[key] = v;
  return 'reload';
}

// ── SOUND pages ─────────────────────────────────────────────────────────────

function padParam(i: number, def: Omit<ControlParam, 'get' | 'set'> & { get: (p: PadConfig) => number; set: (p: PadConfig, v: number) => void }): ControlParam {
  return { ...def, get: (d) => { const p = d.kit[i]; return p ? def.get(p) : def.min; }, set: (d, v) => { const p = d.kit[i]; if (p) def.set(p, v); } };
}

function sendParams(doc: GrooveDoc, i: number): ControlParam[] {
  const buses = doc.mixer.sendBuses?.length ? doc.mixer.sendBuses : [{ name: 'FX 1' }, { name: 'FX 2' }];
  return buses.slice(0, 8).map((b, s) => padParam(i, {
    id: `send${s}`, label: b.name, min: 0, max: 1, defaultValue: 0, format: pct,
    get: (p) => p.sends?.[s] ?? 0,
    set: (p, v) => { const arr = p.sends ? [...p.sends] : []; while (arr.length <= s) arr.push(0); arr[s] = clamp(v, 0, 1); p.sends = arr; },
  }));
}

function pitchGainPage(doc: GrooveDoc, i: number): ControlPage {
  const pad = doc.kit[i];
  const isSample = pad?.source === 'sample';
  const dur = pad?.sample?.durationSec ?? 0;
  return {
    id: 'pitch', label: 'Pitch / Gain',
    params: pad8([
      padParam(i, { id: 'tune', label: 'Tune', min: -24, max: 24, defaultValue: 0, format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}st`, get: (p) => p.pitchSemis, set: (p, v) => { p.pitchSemis = Math.round(v); } }),
      padParam(i, { id: 'gain', label: 'Level', min: -24, max: 12, defaultValue: 0, format: db, get: (p) => p.gainDb, set: (p, v) => { p.gainDb = Math.round(v * 10) / 10; } }),
      padParam(i, { id: 'pan', label: 'Pan', min: -1, max: 1, defaultValue: 0, format: panFmt, get: (p) => p.pan, set: (p, v) => { p.pan = v; } }),
      isSample && dur > 0
        ? padParam(i, { id: 'start', label: 'Start', min: 0, max: Math.max(0.001, dur * 0.95), defaultValue: 0, format: (v) => ms(v * 1000), get: (p) => p.startSec, set: (p, v) => { p.startSec = Math.max(0, v); } })
        : null,
      padParam(i, { id: 'vel', label: 'Velocity', min: 0, max: 2, options: ['Linear', 'Soft', 'Hard'], format: (v) => ['Linear', 'Soft', 'Hard'][Math.round(v)] ?? '', get: (p) => Math.max(0, CURVES.indexOf(p.velCurve)), set: (p, v) => { p.velCurve = CURVES[Math.round(v)] ?? 'linear'; } }),
      padParam(i, { id: 'swing', label: 'Swing', min: 0, max: 1, format: pct, get: (p) => p.swing ?? doc.swing, set: (p, v) => { p.swing = v; } }),
      padParam(i, { id: 'choke', label: 'Choke', min: 0, max: 8, options: ['Off', '1', '2', '3', '4', '5', '6', '7', '8'], format: (v) => (Math.round(v) ? `${Math.round(v)}` : 'Off'), get: (p) => p.choke, set: (p, v) => { p.choke = Math.round(v); } }),
      padParam(i, { id: 'bus', label: 'Bus', min: 0, max: 3, options: [...GROUP_NAMES], format: (v) => GROUP_NAMES[Math.round(v)] ?? 'A', get: (p) => p.group, set: (p, v) => { p.group = clamp(Math.round(v), 0, 3) as 0 | 1 | 2 | 3; } }),
    ]),
  };
}

export function soundPages(doc: GrooveDoc, i: number): ControlPage[] {
  const pad = doc.kit[i];
  if (!pad || pad.empty) return [];
  const pages: ControlPage[] = [];
  if (pad.source === 'instrument' && pad.instrumentTrackId) {
    const t = doc.arrangement.find((x) => x.id === pad.instrumentTrackId);
    const macros = instrumentMacros(t);
    const tid = pad.instrumentTrackId;
    if (macros.length) {
      pages.push({
        id: 'instrument', label: t?.instrument?.presetName || 'Instrument', instrumentTrackId: tid,
        params: pad8(macros.map((m, k) => ({
          id: `macro${k}`, label: m.label, min: 0, max: 1, format: pct,
          get: (d) => instrumentMacros(d.arrangement.find((x) => x.id === tid))[k]?.value ?? 0,
          set: (d, v) => { writeInstrumentMacro(d, tid, k, v); },
        }))),
      });
    }
    pages.push(pitchGainPage(doc, i));
  } else {
    pages.push(pitchGainPage(doc, i));
    pages.push({
      id: 'amp', label: 'Amp Envelope',
      params: pad8([
        padParam(i, { id: 'attack', label: 'Attack', min: 0, max: 200, defaultValue: 0, format: ms, get: (p) => p.env.attackMs, set: (p, v) => { p.env.attackMs = Math.round(v); } }),
        padParam(i, { id: 'hold', label: 'Hold', min: 0, max: Math.max(500, Math.round((pad.sample?.durationSec ?? 0) * 1000)), defaultValue: 0, format: ms, get: (p) => p.env.holdMs, set: (p, v) => { p.env.holdMs = Math.round(v); } }),
        padParam(i, { id: 'decay', label: 'Decay', min: 20, max: 4000, defaultValue: 400, log: true, format: ms, get: (p) => p.env.decayMs, set: (p, v) => { p.env.decayMs = Math.round(v); } }),
        padParam(i, { id: 'sustain', label: 'Sustain', min: 0, max: 1, defaultValue: 0, format: (v) => (v < 0.005 ? 'Off' : pct(v)), get: (p) => p.env.sustain, set: (p, v) => { p.env.sustain = v; } }),
        padParam(i, { id: 'release', label: 'Release', min: 5, max: 4000, defaultValue: 80, log: true, format: ms, get: (p) => p.env.releaseMs, set: (p, v) => { p.env.releaseMs = Math.round(v); } }),
      ]),
    });
    pages.push({
      id: 'filter', label: 'Filter',
      params: pad8([
        padParam(i, { id: 'ftype', label: 'Type', min: 0, max: 2, options: ['Off', 'LP', 'HP'], format: (v) => ['Off', 'LP', 'HP'][Math.round(v)] ?? 'Off', get: (p) => Math.max(0, FILTERS.indexOf(p.filter.type)), set: (p, v) => { p.filter.type = FILTERS[Math.round(v)] ?? 'off'; } }),
        padParam(i, { id: 'cutoff', label: 'Cutoff', min: 60, max: 18000, defaultValue: 8000, log: true, format: hz, get: (p) => p.filter.cutoff, set: (p, v) => { p.filter.cutoff = Math.round(v); } }),
        padParam(i, { id: 'reso', label: 'Reso', min: 0.3, max: 12, defaultValue: 0.8, format: (v) => v.toFixed(1), get: (p) => p.filter.q, set: (p, v) => { p.filter.q = v; } }),
      ]),
    });
  }
  pages.push({ id: 'sends', label: 'Sends', params: pad8(sendParams(doc, i)) });
  return pages;
}

// ── GROUP pages ─────────────────────────────────────────────────────────────

/** Group macros are relative: the stored knob value is an offset, and turning it moves every
 *  pad in the Group by the change — so per-pad differences survive, like a Group macro. */
type GroupOffsets = Required<NonNullable<GroupMeta['offsets']>>;

function groupPads(d: GrooveDoc, bank: number): PadConfig[] {
  return d.kit.slice(bank * PAD_BANK, bank * PAD_BANK + PAD_BANK).filter((p) => !p.empty);
}
function offsetsOf(d: GrooveDoc, bank: number): Partial<GroupOffsets> {
  return d.groupMeta?.[bank]?.offsets ?? {};
}
function setOffset(d: GrooveDoc, bank: number, key: keyof GroupOffsets, v: number): number {
  if (!d.groupMeta) d.groupMeta = [];
  while (d.groupMeta.length <= bank) d.groupMeta.push({});
  const meta = d.groupMeta[bank];
  const prev = meta.offsets?.[key] ?? 0;
  meta.offsets = { ...meta.offsets, [key]: v };
  return v - prev;
}

export function groupPages(_doc: GrooveDoc, bank: number): ControlPage[] {
  const rel = (key: keyof GroupOffsets, def: Omit<ControlParam, 'get' | 'set' | 'id'>, apply: (p: PadConfig, delta: number) => void): ControlParam => ({
    ...def, id: `g_${key}`, defaultValue: 0,
    get: (d) => offsetsOf(d, bank)[key] ?? 0,
    set: (d, v) => { const delta = setOffset(d, bank, key, v); if (delta) for (const p of groupPads(d, bank)) apply(p, delta); },
  });
  return [{
    id: 'group', label: 'Group',
    params: pad8([
      rel('tune', { label: 'Tune', min: -12, max: 12, format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}st` }, (p, dl) => { p.pitchSemis = clamp(Math.round(p.pitchSemis + dl), -24, 24); }),
      rel('level', { label: 'Level', min: -24, max: 12, format: db }, (p, dl) => { p.gainDb = clamp(Math.round((p.gainDb + dl) * 10) / 10, -48, 12); }),
      rel('decay', { label: 'Decay', min: -2, max: 2, format: (v) => `×${Math.pow(2, v).toFixed(2)}` }, (p, dl) => { p.env.decayMs = clamp(Math.round(p.env.decayMs * Math.pow(2, dl)), 20, 4000); }),
      rel('cutoff', { label: 'Cutoff', min: -4, max: 4, format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}oct` }, (p, dl) => { p.filter.cutoff = clamp(Math.round(p.filter.cutoff * Math.pow(2, dl)), 60, 18000); }),
      {
        id: 'g_swing', label: 'Swing', min: 0, max: 1, format: pct,
        get: (d) => groupPads(d, bank)[0]?.swing ?? d.swing,
        set: (d, v) => { for (const p of groupPads(d, bank)) p.swing = v; },
      },
    ]),
  }];
}

// ── MASTER pages ────────────────────────────────────────────────────────────

export function masterPages(doc: GrooveDoc): ControlPage[] {
  const busLevel = (g: number): ControlParam => ({
    id: `bus${g}`, label: `Bus ${GROUP_NAMES[g]}`, min: -48, max: 12, defaultValue: 0, format: db,
    get: (d) => d.mixer.groups[g]?.gainDb ?? 0,
    set: (d, v) => { const ch = d.mixer.groups[g]; if (ch) ch.gainDb = Math.round(v * 10) / 10; },
  });
  const returns = (doc.mixer.sendBuses?.length ? doc.mixer.sendBuses : [{ name: 'FX 1' }, { name: 'FX 2' }]).slice(0, 4).map((b, s): ControlParam => ({
    id: `ret${s}`, label: `${b.name} ret`, min: -48, max: 12, defaultValue: 0, format: db,
    get: (d) => d.mixer.sendBuses?.[s]?.gainDb ?? 0,
    set: (d, v) => { const bus = d.mixer.sendBuses?.[s]; if (bus) bus.gainDb = Math.round(v * 10) / 10; },
  }));
  return [
    {
      id: 'master', label: 'Master',
      params: pad8([
        { id: 'mvol', label: 'Volume', min: -48, max: 6, defaultValue: 0, format: db, get: (d) => d.mixer.master.gainDb, set: (d, v) => { d.mixer.master.gainDb = Math.round(v * 10) / 10; } },
        { id: 'tempo', label: 'Tempo', min: 40, max: 240, defaultValue: 120, format: (v) => `${v.toFixed(1)}`, get: (d) => d.bpm, set: (d, v) => { d.bpm = Math.round(v * 10) / 10; } },
        { id: 'swing', label: 'Swing', min: 0, max: 1, defaultValue: 0, format: pct, get: (d) => d.swing, set: (d, v) => { d.swing = v; } },
        { id: 'limit', label: 'Limiter', min: 0, max: 1, options: ['Off', 'On'], format: (v) => (Math.round(v) ? 'On' : 'Off'), get: (d) => (d.mixer.master.limiterOn ? 1 : 0), set: (d, v) => { d.mixer.master.limiterOn = Math.round(v) === 1; } },
      ]),
    },
    { id: 'buses', label: 'Buses', params: pad8([busLevel(0), busLevel(1), busLevel(2), busLevel(3), ...returns]) },
  ];
}

export function pagesFor(doc: GrooveDoc, tab: ControlTab, pad: number): ControlPage[] {
  if (tab === 'master') return masterPages(doc);
  if (tab === 'group') return groupPages(doc, Math.floor(pad / PAD_BANK));
  return soundPages(doc, pad);
}

// ── Focus: which tab + page the knobs are on. Shared by the screen and the hardware. ──

export interface ControlFocus { tab: ControlTab; page: Record<ControlTab, number> }
let focus: ControlFocus = { tab: 'sound', page: { master: 0, group: 0, sound: 0 } };
const focusListeners = new Set<() => void>();

export function getControlFocus(): ControlFocus { return focus; }
export function setControlFocus(next: Partial<{ tab: ControlTab; page: number }>): void {
  const tab = next.tab ?? focus.tab;
  focus = { tab, page: next.page === undefined ? focus.page : { ...focus.page, [tab]: Math.max(0, next.page) } };
  for (const fn of focusListeners) fn();
}
export function subscribeControlFocus(fn: () => void): () => void { focusListeners.add(fn); return () => { focusListeners.delete(fn); }; }

/** The page the knobs are on right now, clamped to what this pad has. */
export function focusedPage(doc: GrooveDoc, pad: number): { pages: ControlPage[]; index: number; page: ControlPage | null } {
  const pages = pagesFor(doc, focus.tab, pad);
  const index = Math.min(focus.page[focus.tab], Math.max(0, pages.length - 1));
  return { pages, index, page: pages[index] ?? null };
}

/** Step the focused page (hardware Page ◀ ▶). */
export function stepControlPage(doc: GrooveDoc, pad: number, dir: -1 | 1): void {
  const { pages, index } = focusedPage(doc, pad);
  if (pages.length) setControlFocus({ page: (index + dir + pages.length) % pages.length });
}
