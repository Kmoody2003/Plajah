// The board's pure logic: patching, looks, cue crossfades, submasters, effects and rendering to DMX
// universes. No clocks or I/O in here; boardEngine.ts owns those.

import { BUILTIN_PROFILES, SMART_PROFILE, hasAttr, hasColor, type Attr, type FixtureProfile } from './fixtureProfiles';

export type LevelMap = Partial<Record<Attr, number>>;
/** fixture id -> attribute levels (0..1). A look only holds what it deliberately sets. */
export type Look = Record<string, LevelMap>;

export interface PatchedFixture {
  id: string;
  /** The number an operator types: "1 thru 4". */
  fid: number;
  name: string;
  profileId: string;
  /** 1-based. Null for smart lights, which have no DMX address. */
  universe: number | null;
  address: number | null;
  /** Auto-patch leaves this one where it is. */
  locked?: boolean;
  /** Set for lights from Hue, Govee, Nanoleaf, Razer. */
  smartId?: string;
  /** Which Christmas-house light run this fixture drives. */
  run?: string;
}

export interface Group { id: string; name: string; fixtureIds: string[] }

export interface Cue {
  id: string;
  number: number;
  label: string;
  look: Look;
  /** Seconds to crossfade into this cue. */
  fade: number;
  /** Seconds after the fade before the next cue runs by itself; null waits for GO. */
  follow: number | null;
}

export interface Scene {
  id: string;
  name: string;
  color: string;
  look: Look;
  /** Seconds, used when a scene is tapped in Simple. */
  fade: number;
}

export type EffectKind = 'pulse' | 'chase' | 'rainbow' | 'circle' | 'sweep' | 'strobe' | 'flicker' | 'twinkle' | 'fire' | 'colorwave';

export interface Effect {
  id: string;
  kind: EffectKind;
  fixtureIds: string[];
  /** Cycles per minute. */
  rate: number;
  /** 0..1 depth. */
  size: number;
  /** 0..1 how far the cycle is spread across the fixtures. */
  spread: number;
  on: boolean;
  /** Colours a colorwave moves through. */
  palette?: string[];
}

export interface BoardShow {
  version: 1;
  name: string;
  fixtures: PatchedFixture[];
  customProfiles: FixtureProfile[];
  groups: Group[];
  cues: Cue[];
  scenes: Scene[];
  effects: Effect[];
  /** Christmas-house runs that are switched on, and how they're strung. */
  holiday?: Record<string, { on: boolean; bulb?: 'c9' | 'mini' | 'pixel'; pattern?: 'steady' | 'twinkle' | 'chase' }>;
}

export const emptyShow = (): BoardShow => ({ version: 1, name: 'My rig', fixtures: [], customProfiles: [], groups: [], cues: [], scenes: [], effects: [] });

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export function profileOf(fixture: Pick<PatchedFixture, 'profileId' | 'smartId'>, custom: FixtureProfile[] = []): FixtureProfile {
  if (fixture.smartId) return SMART_PROFILE;
  return custom.find((p) => p.id === fixture.profileId)
    ?? BUILTIN_PROFILES.find((p) => p.id === fixture.profileId)
    ?? BUILTIN_PROFILES[0];
}

// ── Patch ───────────────────────────────────────────────────────────────────

interface Span { universe: number; start: number; end: number; id: string }

const spanOf = (f: PatchedFixture, custom: FixtureProfile[]): Span | null =>
  f.universe == null || f.address == null ? null
    : { universe: f.universe, start: f.address, end: f.address + profileOf(f, custom).channels.length - 1, id: f.id };

/** Lowest address with room for `size` channels, moving to the next universe when one is full. */
export function nextFreeAddress(taken: Span[], size: number, fromUniverse = 1): { universe: number; address: number } {
  for (let universe = fromUniverse; ; universe++) {
    const here = taken.filter((s) => s.universe === universe).sort((a, b) => a.start - b.start);
    let at = 1;
    for (const s of here) {
      if (at + size - 1 < s.start) break;
      at = Math.max(at, s.end + 1);
    }
    if (at + size - 1 <= 512) return { universe, address: at };
  }
}

/** Add `count` units of a profile in the first free space, named and numbered in sequence. */
export function addFixtures(show: BoardShow, profile: FixtureProfile, count: number, baseName?: string, universe = 1): BoardShow {
  const fixtures = [...show.fixtures];
  const taken = fixtures.map((f) => spanOf(f, show.customProfiles)).filter(Boolean) as Span[];
  const size = profile.channels.length;
  let fid = fixtures.reduce((n, f) => Math.max(n, f.fid), 0);
  const label = baseName?.trim() || profile.name.split(' · ')[0];
  const existing = fixtures.filter((f) => f.profileId === profile.id && !f.smartId).length;
  for (let i = 0; i < count; i++) {
    const at = nextFreeAddress(taken, size, universe);
    const fixture: PatchedFixture = { id: uid('fx'), fid: ++fid, name: `${label} ${existing + i + 1}`, profileId: profile.id, universe: at.universe, address: at.address };
    fixtures.push(fixture);
    taken.push({ ...at, start: at.address, end: at.address + size - 1, id: fixture.id });
  }
  return { ...show, fixtures };
}

/**
 * Re-address every unlocked DMX fixture: same types sit together, gapless, from address 1. This is
 * what "auto address" can honestly mean without RDM: the board picks the numbers, and the operator
 * dials them into each unit (see dipSwitches).
 */
export function autoPatch(show: BoardShow, startUniverse = 1): BoardShow {
  const custom = show.customProfiles;
  const isDmx = (f: PatchedFixture) => !f.smartId;
  const locked = show.fixtures.filter((f) => isDmx(f) && f.locked);
  const loose = show.fixtures.filter((f) => isDmx(f) && !f.locked);
  const taken = locked.map((f) => spanOf(f, custom)).filter(Boolean) as Span[];
  const order = [...loose].sort((a, b) => profileOrder(a, custom) - profileOrder(b, custom) || a.fid - b.fid);
  const placed = new Map<string, { universe: number; address: number }>();
  for (const f of order) {
    const size = profileOf(f, custom).channels.length;
    const at = nextFreeAddress(taken, size, startUniverse);
    placed.set(f.id, at);
    taken.push({ universe: at.universe, start: at.address, end: at.address + size - 1, id: f.id });
  }
  return { ...show, fixtures: show.fixtures.map((f) => (placed.has(f.id) ? { ...f, ...placed.get(f.id)! } : f)) };
}

const CATEGORY_ORDER = ['spot', 'wash', 'par', 'bar', 'dimmer', 'strobe', 'laser', 'fog', 'other'];
const profileOrder = (f: PatchedFixture, custom: FixtureProfile[]) => {
  const i = CATEGORY_ORDER.indexOf(profileOf(f, custom).category);
  return i < 0 ? CATEGORY_ORDER.length : i;
};

export interface PatchProblem { kind: 'overlap' | 'overflow'; fixtureIds: string[]; message: string }

export function findPatchProblems(show: BoardShow): PatchProblem[] {
  const spans = show.fixtures.map((f) => spanOf(f, show.customProfiles)).filter(Boolean) as Span[];
  const name = (id: string) => show.fixtures.find((f) => f.id === id)?.name ?? id;
  const problems: PatchProblem[] = [];
  for (const s of spans) {
    if (s.start < 1 || s.end > 512) problems.push({ kind: 'overflow', fixtureIds: [s.id], message: `${name(s.id)} runs past channel 512` });
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i], b = spans[j];
      if (a.universe === b.universe && a.start <= b.end && b.start <= a.end) {
        problems.push({ kind: 'overlap', fixtureIds: [a.id, b.id], message: `${name(a.id)} and ${name(b.id)} share channels in universe ${a.universe}` });
      }
    }
  }
  return problems;
}

/** The nine address DIP switches, lowest first (1, 2, 4 .. 256), true = ON. */
export function dipSwitches(address: number): boolean[] {
  return Array.from({ length: 9 }, (_, i) => ((address >> i) & 1) === 1);
}

/** The "d001" a unit's menu display shows. */
export const displayAddress = (address: number) => `d${String(address).padStart(3, '0')}`;

// ── Smart lights in the patch ───────────────────────────────────────────────

/** Keep one fixture row per connected smart light, without disturbing the DMX rig. */
export function syncSmartFixtures(show: BoardShow, lights: { id: string; name: string }[]): BoardShow {
  const known = new Map(show.fixtures.filter((f) => f.smartId).map((f) => [f.smartId!, f]));
  const same = known.size === lights.length && lights.every((l) => known.get(l.id)?.name === l.name);
  if (same) return show;
  let fid = show.fixtures.reduce((n, f) => Math.max(n, f.fid), 0);
  const smart = lights.map((l): PatchedFixture => {
    const had = known.get(l.id);
    return had ? { ...had, name: l.name } : { id: `smart_${l.id}`, fid: ++fid, name: l.name, profileId: SMART_PROFILE.id, universe: null, address: null, smartId: l.id };
  });
  return { ...show, fixtures: [...show.fixtures.filter((f) => !f.smartId), ...smart] };
}

// ── Colour ──────────────────────────────────────────────────────────────────

export interface RGB { r: number; g: number; b: number }

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};
export const rgbToHex = ({ r, g, b }: RGB) => `#${[r, g, b].map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;
export const hsvToRgb = (h: number, s: number, v: number): RGB => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1) };
};

/** Levels for a colour on this fixture, pulling common white out to a real white chip when it has one. */
export function colorLevels(profile: FixtureProfile, rgb: RGB): LevelMap {
  if (!hasColor(profile)) return {};
  if (hasAttr(profile, 'white')) {
    const w = Math.min(rgb.r, rgb.g, rgb.b);
    return { red: rgb.r - w, green: rgb.g - w, blue: rgb.b - w, white: w };
  }
  return { red: rgb.r, green: rgb.g, blue: rgb.b };
}

/** What a fixture's levels look like, for on-screen tiles. */
export function previewColor(levels: LevelMap | undefined, profile: FixtureProfile): { css: string; on: number } {
  const l = levels ?? {};
  const dim = l.dimmer ?? (hasAttr(profile, 'dimmer') ? 0 : 1);
  if (!hasColor(profile)) {
    const v = clamp01(l.dimmer ?? 0);
    return { css: rgbToHex({ r: 1, g: 0.86, b: 0.7 }), on: v };
  }
  const w = l.white ?? 0, a = l.amber ?? 0, uv = l.uv ?? 0;
  const r = clamp01((l.red ?? 0) + w + a + uv * 0.3), g = clamp01((l.green ?? 0) + w + a * 0.6), b = clamp01((l.blue ?? 0) + w + uv * 0.7);
  return { css: rgbToHex({ r, g, b }), on: clamp01(dim * Math.max(r, g, b)) };
}

// ── Looks ───────────────────────────────────────────────────────────────────

/** A look with every fixture at one colour and level, heads homed, for the tap-a-scene tiles. */
export function wash(fixtures: PatchedFixture[], custom: FixtureProfile[], pick: (index: number, count: number) => RGB, level = 1): Look {
  const look: Look = {};
  fixtures.forEach((f, i) => {
    const profile = profileOf(f, custom);
    if (profile.category === 'fog') return;
    const entry: LevelMap = { ...colorLevels(profile, pick(i, fixtures.length)) };
    if (hasAttr(profile, 'dimmer')) entry.dimmer = level;
    else if (hasColor(profile)) for (const k of Object.keys(entry) as Attr[]) entry[k] = (entry[k] ?? 0) * level;
    look[f.id] = entry;
  });
  return look;
}

export interface SceneRecipe { id: string; name: string; color: string; fade: number; level?: number; pick: (i: number, n: number) => RGB }

const flat = (hex: string) => () => hexToRgb(hex);

/** The Simple tiles. They rebuild against the current rig, so adding a light just works. */
export const SCENE_RECIPES: SceneRecipe[] = [
  { id: 'bright', name: 'Bright white', color: '#fff4e6', fade: 1, pick: flat('#fff1dc') },
  { id: 'warm', name: 'Warm glow', color: '#ff9d4d', fade: 2, level: 0.8, pick: flat('#ff8a3c') },
  { id: 'cool', name: 'Cool wash', color: '#5a8dff', fade: 2, level: 0.8, pick: flat('#3f6dff') },
  { id: 'worship', name: 'Worship', color: '#6b4dff', fade: 3, level: 0.7, pick: (i) => hexToRgb(i % 2 ? '#ff9d4d' : '#3a2bd9') },
  { id: 'sunset', name: 'Sunset', color: '#ff5470', fade: 3, level: 0.85, pick: (i, n) => hsvToRgb(350 + (i / Math.max(1, n)) * 45, 0.9, 1) },
  { id: 'party', name: 'Party', color: '#d400ff', fade: 0.5, pick: (i, n) => hsvToRgb((i / Math.max(1, n)) * 360, 1, 1) },
  { id: 'dim', name: 'Low & soft', color: '#b08a6a', fade: 3, level: 0.25, pick: flat('#ffb078') },
];

// ── Mixing ──────────────────────────────────────────────────────────────────

/** Dimmer-style attributes: faded from nothing and piled on highest-takes-precedence. */
const HTP: Set<Attr> = new Set(['dimmer', 'red', 'green', 'blue', 'white', 'amber', 'uv']);

export function lerpLook(from: Look, to: Look, t: number): Look {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const out: Look = {};
  for (const id of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[id] ?? {}, b = to[id] ?? {};
    const entry: LevelMap = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<Attr>) {
      if (HTP.has(k)) entry[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
      else if (a[k] == null) entry[k] = b[k];
      else if (b[k] == null) entry[k] = a[k];
      else entry[k] = a[k]! + (b[k]! - a[k]!) * t;
    }
    out[id] = entry;
  }
  return out;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Move through a fade at `t` of `elapsed/fade`, with a snap for a zero-time fade. */
export const fadeProgress = (elapsed: number, fade: number) => (fade <= 0 ? 1 : ease(clamp01(elapsed / fade)));

/** Pile a submaster on: light attributes HTP scaled by its level, positions and wheels LTP while it's up. */
export function applySubmaster(base: Look, look: Look, level: number): Look {
  if (level <= 0) return base;
  const out: Look = { ...base };
  for (const [id, levels] of Object.entries(look)) {
    const entry: LevelMap = { ...(out[id] ?? {}) };
    for (const k of Object.keys(levels) as Attr[]) {
      const v = levels[k] ?? 0;
      if (HTP.has(k)) entry[k] = Math.max(entry[k] ?? 0, v * level);
      else entry[k] = v;
    }
    out[id] = entry;
  }
  return out;
}

/** Programmer values always win, and override whatever else is on stage. */
export function overlay(base: Look, top: Look): Look {
  const out: Look = { ...base };
  for (const [id, levels] of Object.entries(top)) out[id] = { ...(out[id] ?? {}), ...levels };
  return out;
}

export function applyEffects(base: Look, effects: Effect[], fixtures: PatchedFixture[], custom: FixtureProfile[], seconds: number): Look {
  const live = effects.filter((e) => e.on && e.fixtureIds.length);
  if (!live.length) return base;
  const out: Look = { ...base };
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  for (const e of live) {
    const members = e.fixtureIds.filter((id) => byId.has(id));
    members.forEach((id, i) => {
      const profile = profileOf(byId.get(id)!, custom);
      const phase = (seconds * e.rate) / 60 - (i / Math.max(1, members.length)) * e.spread;
      const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const entry: LevelMap = { ...(out[id] ?? {}) };
      const scaleLight = (k: number) => {
        if (hasAttr(profile, 'dimmer')) entry.dimmer = (entry.dimmer ?? 1) * k;
        else for (const a of ['red', 'green', 'blue', 'white', 'amber', 'uv'] as Attr[]) if (entry[a] != null) entry[a] = entry[a]! * k;
      };
      if (e.kind === 'pulse') scaleLight(1 - e.size * (1 - wave));
      else if (e.kind === 'chase') scaleLight(((phase % 1) + 1) % 1 < 1 / Math.max(2, members.length) ? 1 : 1 - e.size);
      else if (e.kind === 'strobe' || e.kind === 'flicker') scaleLight(((phase % 1) + 1) % 1 < 0.5 ? 1 : 1 - e.size);
      else if (e.kind === 'twinkle') {
        const step = Math.floor((seconds * e.rate) / 60 + i * 0.37);
        const h = Math.abs(Math.sin((step + i * 7.13) * 12.9898) * 43758.5453) % 1;
        scaleLight(h > 0.55 ? 1 : 1 - e.size);
      } else if (e.kind === 'fire') {
        const t = (seconds * e.rate) / 60 + i * 1.7;
        scaleLight(1 - e.size * clamp01(0.5 + 0.3 * Math.sin(t * 5.1) + 0.2 * Math.sin(t * 13.7 + 1.3)));
      } else if (e.kind === 'colorwave' && e.palette?.length) {
        const u = ((phase % 1) + 1) % 1 * e.palette.length;
        const a = hexToRgb(e.palette[Math.floor(u) % e.palette.length]), b = hexToRgb(e.palette[(Math.floor(u) + 1) % e.palette.length]);
        const f = u - Math.floor(u);
        Object.assign(entry, colorLevels(profile, { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f }));
      }
      else if (e.kind === 'rainbow') Object.assign(entry, colorLevels(profile, hsvToRgb((((phase % 1) + 1) % 1) * 360, e.size, 1)));
      else if (e.kind === 'circle' || e.kind === 'sweep') {
        const angle = phase * Math.PI * 2;
        const pan = (entry.pan ?? 0.5) + Math.sin(angle) * e.size * 0.25;
        if (hasAttr(profile, 'pan')) entry.pan = clamp01(pan);
        if (e.kind === 'circle' && hasAttr(profile, 'tilt')) entry.tilt = clamp01((entry.tilt ?? 0.5) + Math.cos(angle) * e.size * 0.25);
      }
      out[id] = entry;
    });
  }
  return out;
}

// ── Output ──────────────────────────────────────────────────────────────────

const LIGHT_ATTRS: Attr[] = ['red', 'green', 'blue', 'white', 'amber', 'uv'];

/**
 * Grand master and blackout pull light down without moving anything: positions, wheels and the fog
 * machine are left alone (fog is cut by blackout too, since a blackout in a haze cloud is the point).
 */
export function applyMaster(look: Look, fixtures: PatchedFixture[], custom: FixtureProfile[], master: number, blackout: boolean): Look {
  const m = blackout ? 0 : clamp01(master);
  if (m === 1) return look;
  const out: Look = {};
  for (const f of fixtures) {
    const levels = look[f.id];
    if (!levels) continue;
    const profile = profileOf(f, custom);
    const entry: LevelMap = { ...levels };
    if (hasAttr(profile, 'dimmer')) entry.dimmer = (entry.dimmer ?? 0) * m;
    else for (const a of LIGHT_ATTRS) if (entry[a] != null) entry[a] = entry[a]! * m;
    if (blackout && entry.fog != null) entry.fog = 0;
    out[f.id] = entry;
  }
  return out;
}

/** Bake a final look into 512-byte universes. Fine channels carry the low byte of pan and tilt. */
export function renderUniverses(look: Look, fixtures: PatchedFixture[], custom: FixtureProfile[], out: Map<number, Uint8Array> = new Map()): Map<number, Uint8Array> {
  for (const u of out.values()) u.fill(0);
  for (const f of fixtures) {
    if (f.universe == null || f.address == null) continue;
    let universe = out.get(f.universe);
    if (!universe) { universe = new Uint8Array(512); out.set(f.universe, universe); }
    const levels = look[f.id] ?? {};
    const channels = profileOf(f, custom).channels;
    channels.forEach((c, i) => {
      const at = f.address! - 1 + i;
      if (at < 0 || at >= 512) return;
      if (c.attr === 'panFine' || c.attr === 'tiltFine') {
        const coarse = levels[c.attr === 'panFine' ? 'pan' : 'tilt'] ?? restOf(channels, c.attr === 'panFine' ? 'pan' : 'tilt');
        universe![at] = Math.round(clamp01(coarse) * 65535) & 0xff;
        return;
      }
      if (c.attr === 'pan' || c.attr === 'tilt') {
        universe![at] = Math.round(clamp01(levels[c.attr] ?? c.rest ?? 0) * 65535) >> 8;
        return;
      }
      universe![at] = Math.round(clamp01(levels[c.attr] ?? c.rest ?? 0) * 255);
    });
  }
  return out;
}

const restOf = (channels: { attr: Attr; rest?: number }[], attr: Attr) => channels.find((c) => c.attr === attr)?.rest ?? 0;

// ── Command line ────────────────────────────────────────────────────────────

export type BoardCommand =
  | { kind: 'select'; fids: number[]; level?: number }
  | { kind: 'clear' }
  | { kind: 'go' }
  | { kind: 'record'; number?: number }
  | { kind: 'error'; message: string };

/**
 * A small console syntax: "1 thru 4 + 7 at 50", "5 full", "3 out", "clear", "go", "record 12".
 * Without a level it only changes the selection.
 */
export function parseCommand(input: string): BoardCommand {
  const text = input.trim().toLowerCase().replace(/@/g, ' at ').replace(/>/g, ' thru ').replace(/\s+/g, ' ');
  if (!text) return { kind: 'error', message: 'Type something like 1 thru 4 at 50' };
  if (text === 'clear' || text === 'clr') return { kind: 'clear' };
  if (text === 'go') return { kind: 'go' };
  const rec = /^(?:record|rec)(?: cue)?(?: (\d+(?:\.\d+)?))?$/.exec(text);
  if (rec) return { kind: 'record', number: rec[1] ? Number(rec[1]) : undefined };

  const m = /^(.*?)(?: (?:at (\d{1,3})|(full|fl)|(out)))?$/.exec(text);
  if (!m || !m[1]) return { kind: 'error', message: `I can't read "${input.trim()}"` };
  const level = m[2] != null ? Number(m[2]) / 100 : m[3] ? 1 : m[4] ? 0 : undefined;
  if (level != null && level > 1) return { kind: 'error', message: 'Levels go from 0 to 100' };

  const fids = new Set<number>();
  for (const raw of m[1].split(/\s*(?:\+|,| and )\s*/)) {
    const range = /^(\d+)(?: thru (\d+))?$/.exec(raw.trim());
    if (!range) return { kind: 'error', message: `I can't read "${raw.trim()}"` };
    const a = Number(range[1]), b = range[2] != null ? Number(range[2]) : a;
    if (Math.abs(b - a) > 2000) return { kind: 'error', message: 'That range is too long' };
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) fids.add(n);
  }
  return { kind: 'select', fids: [...fids], level };
}
