// Fixture personalities. The built-ins are generic layouts that match the common DIP/menu modes on
// budget and mid-range gear; anything else comes in through an Open Fixture Library file or the
// custom channel list. Every level in the board is normalised 0..1 and turned into bytes at output.

export type Attr =
  | 'dimmer' | 'red' | 'green' | 'blue' | 'white' | 'amber' | 'uv'
  | 'pan' | 'panFine' | 'tilt' | 'tiltFine' | 'speed'
  | 'shutter' | 'colorWheel' | 'gobo' | 'goboRotate' | 'prism' | 'focus' | 'zoom' | 'frost'
  | 'fog' | 'fan' | 'macro' | 'raw';

export type FixtureCategory = 'dimmer' | 'par' | 'bar' | 'spot' | 'wash' | 'strobe' | 'fog' | 'laser' | 'smart' | 'other';

export interface ProfileChannel {
  attr: Attr;
  label: string;
  /** Level (0..1) sent when nothing in the show drives this channel, e.g. an open shutter. */
  rest?: number;
}

export interface FixtureProfile {
  id: string;
  name: string;
  /** Plain words for the Simple add-a-light list; left out of that list when absent. */
  friendly?: string;
  category: FixtureCategory;
  channels: ProfileChannel[];
  /** Beam angle at the middle of its zoom, when the data sheet gives one. */
  beamDeg?: number;
  source?: 'builtin' | 'ofl' | 'custom';
}

const ch = (attr: Attr, label: string, rest?: number): ProfileChannel => (rest === undefined ? { attr, label } : { attr, label, rest });

const R = ch('red', 'Red'), G = ch('green', 'Green'), B = ch('blue', 'Blue');
const W = ch('white', 'White'), A = ch('amber', 'Amber'), UV = ch('uv', 'UV');
const DIM = ch('dimmer', 'Dimmer'), STROBE = ch('shutter', 'Strobe', 0);

const MOVER_HEAD = [ch('pan', 'Pan', 0.5), ch('panFine', 'Pan fine'), ch('tilt', 'Tilt', 0.5), ch('tiltFine', 'Tilt fine'), ch('speed', 'P/T speed', 0)];

export const BUILTIN_PROFILES: FixtureProfile[] = ([
  { id: 'dimmer-1', name: 'Dimmer · 1ch', friendly: 'Plain dimmer or light bulb', category: 'dimmer', channels: [DIM] },
  { id: 'par-rgb-3', name: 'LED Par RGB · 3ch', friendly: 'Colour par (3 channels)', category: 'par', channels: [R, G, B] },
  { id: 'par-drgb-4', name: 'LED Par DRGB · 4ch', category: 'par', channels: [DIM, R, G, B] },
  { id: 'par-rgbw-4', name: 'LED Par RGBW · 4ch', friendly: 'Colour + white par (4 channels)', category: 'par', channels: [R, G, B, W] },
  { id: 'par-drgbs-5', name: 'LED Par DRGB+Strobe · 5ch', category: 'par', channels: [DIM, R, G, B, STROBE] },
  { id: 'par-drgbw-5', name: 'LED Par DRGBW · 5ch', category: 'par', channels: [DIM, R, G, B, W] },
  { id: 'par-rgbwau-6', name: 'LED Par RGBWA+UV · 6ch', friendly: 'Six-colour par (6 channels)', category: 'par', channels: [R, G, B, W, A, UV] },
  { id: 'par-drgbwas-7', name: 'LED Par DRGBWA+Strobe · 7ch', friendly: 'Pro par (7 channels)', category: 'par', channels: [DIM, R, G, B, W, A, STROBE] },
  { id: 'par-full-8', name: 'LED Par DRGBWAU+Strobe · 8ch', category: 'par', channels: [DIM, R, G, B, W, A, UV, STROBE] },
  { id: 'bar-4cell', name: 'LED Bar 4 cell RGB · 12ch', friendly: 'LED bar (4 sections)', category: 'bar', channels: [R, G, B, R, G, B, R, G, B, R, G, B] },
  { id: 'spot-16', name: 'Moving Spot · 16ch', friendly: 'Moving head spot', category: 'spot', channels: [...MOVER_HEAD, DIM, ch('shutter', 'Shutter', 1), ch('colorWheel', 'Colour wheel'), ch('gobo', 'Gobo wheel'), ch('goboRotate', 'Gobo rotate'), ch('prism', 'Prism'), ch('focus', 'Focus', 0.5), ch('zoom', 'Zoom', 0.5), ch('frost', 'Frost'), ch('macro', 'Macro'), ch('raw', 'Reset')] },
  { id: 'wash-15', name: 'Moving Wash RGBW · 15ch', friendly: 'Moving head wash', category: 'wash', channels: [...MOVER_HEAD, DIM, ch('shutter', 'Shutter', 1), R, G, B, W, ch('zoom', 'Zoom', 0.5), ch('macro', 'Colour macro'), ch('raw', 'Auto'), ch('raw', 'Reset')] },
  { id: 'strobe-2', name: 'Strobe · 2ch', friendly: 'Strobe light', category: 'strobe', channels: [DIM, ch('shutter', 'Rate', 0)] },
  { id: 'fog-2', name: 'Fog / Haze · 2ch', friendly: 'Fog or haze machine', category: 'fog', channels: [ch('fog', 'Output'), ch('fan', 'Fan')] },
  { id: 'string-rgb-3', name: 'Pixel string, single colour · 3ch', friendly: 'Christmas or pixel string', category: 'bar', channels: [R, G, B] },
  { id: 'laser-8', name: 'Laser · 8ch', category: 'laser', channels: [ch('macro', 'Mode'), ch('raw', 'Pattern'), ch('raw', 'Size'), ch('pan', 'X', 0.5), ch('tilt', 'Y', 0.5), R, G, B] },
] as FixtureProfile[]).map((p) => ({ ...p, source: 'builtin' as const }));

export const SMART_PROFILE: FixtureProfile = {
  id: 'smart-rgb', name: 'Smart light', category: 'smart', source: 'builtin',
  channels: [DIM, R, G, B],
};

export const hasAttr = (p: FixtureProfile, attr: Attr) => p.channels.some((c) => c.attr === attr);
export const hasColor = (p: FixtureProfile) => hasAttr(p, 'red') && hasAttr(p, 'green') && hasAttr(p, 'blue');
export const canMove = (p: FixtureProfile) => hasAttr(p, 'pan') || hasAttr(p, 'tilt');

// ── Custom channel lists ────────────────────────────────────────────────────

const WORDS: [RegExp, Attr][] = [
  [/^(dim|dimmer|intensity|master)/i, 'dimmer'], [/^r(ed)?$/i, 'red'], [/^g(reen)?$/i, 'green'], [/^b(lue)?$/i, 'blue'],
  [/^w(hite)?$/i, 'white'], [/^a(mber)?$/i, 'amber'], [/^(uv|violet)$/i, 'uv'], [/^pan.*fine/i, 'panFine'], [/^tilt.*fine/i, 'tiltFine'],
  [/^pan/i, 'pan'], [/^tilt/i, 'tilt'], [/^(speed|p.?t speed)/i, 'speed'], [/^(strobe|shutter)/i, 'shutter'], [/^colou?r/i, 'colorWheel'],
  [/^gobo.*rot/i, 'goboRotate'], [/^gobo/i, 'gobo'], [/^prism/i, 'prism'], [/^focus/i, 'focus'], [/^zoom/i, 'zoom'], [/^frost/i, 'frost'],
  [/^(fog|haze)/i, 'fog'], [/^fan/i, 'fan'], [/^(macro|mode|program)/i, 'macro'],
];

/** "dim, r, g, b, strobe" -> a profile. Unknown words become raw channels so the count stays right. */
export function parseChannelList(name: string, list: string): FixtureProfile | null {
  const parts = list.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length || parts.length > 512) return null;
  const channels = parts.map((label): ProfileChannel => {
    const attr = WORDS.find(([re]) => re.test(label))?.[1] ?? 'raw';
    return attr === 'pan' || attr === 'tilt' ? ch(attr, label, 0.5) : ch(attr, label);
  });
  return { id: `custom-${slug(name)}-${channels.length}`, name: `${name.trim() || 'Custom'} · ${channels.length}ch`, category: 'other', channels, source: 'custom' };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Open Fixture Library import ─────────────────────────────────────────────

const OFL_COLORS: Record<string, Attr> = { red: 'red', green: 'green', blue: 'blue', white: 'white', 'warm white': 'white', 'cold white': 'white', amber: 'amber', uv: 'uv' };

const OFL_CATEGORY: [string, FixtureCategory][] = [
  ['Moving Head', 'spot'], ['Scanner', 'spot'], ['Dimmer', 'dimmer'], ['Pixel Bar', 'bar'], ['Strobe', 'strobe'],
  ['Smoke', 'fog'], ['Hazer', 'fog'], ['Laser', 'laser'], ['Color Changer', 'par'],
];

function oflAttr(def: any): { attr: Attr; rest?: number } {
  const first = def?.capability ?? def?.capabilities?.[0];
  const types = new Set<string>([first?.type, ...(def?.capabilities ?? []).map((c: any) => c?.type)].filter(Boolean));
  const has = (t: string) => types.has(t);
  if (has('ColorIntensity')) return { attr: OFL_COLORS[String(first?.color ?? '').toLowerCase()] ?? 'raw' };
  if (has('Intensity')) return { attr: 'dimmer' };
  if (has('Pan')) return { attr: 'pan', rest: 0.5 };
  if (has('Tilt')) return { attr: 'tilt', rest: 0.5 };
  if (has('PanTiltSpeed')) return { attr: 'speed' };
  if (has('ShutterStrobe')) {
    // Rest on the range the file calls open, so a mover isn't left dark.
    const open = (def?.capabilities ?? [first]).find((c: any) => c?.shutterEffect === 'Open');
    const at = open?.dmxRange ? (open.dmxRange[0] + open.dmxRange[1]) / 2 / 255 : first?.shutterEffect === 'Open' ? 1 : 0;
    return { attr: 'shutter', rest: at };
  }
  if (has('WheelSlot') || has('WheelShake') || has('WheelRotation')) {
    const wheel = String(first?.wheel ?? '').toLowerCase();
    return { attr: wheel.includes('gobo') ? (has('WheelRotation') && !has('WheelSlot') ? 'goboRotate' : 'gobo') : 'colorWheel' };
  }
  if (has('ColorPreset')) return { attr: 'colorWheel' };
  if (has('Prism')) return { attr: 'prism' };
  if (has('Focus')) return { attr: 'focus', rest: 0.5 };
  if (has('Zoom')) return { attr: 'zoom', rest: 0.5 };
  if (has('Frost')) return { attr: 'frost' };
  if (has('Fog') || has('FogOutput')) return { attr: 'fog' };
  if (has('Rotation')) return { attr: 'fan' };
  if (has('Effect') || has('EffectSpeed') || has('Maintenance')) return { attr: 'macro' };
  return { attr: 'raw' };
}

/** One profile per mode from an Open Fixture Library JSON file. Returns [] for anything else. */
export function profilesFromOfl(json: any): FixtureProfile[] {
  if (!json || !Array.isArray(json.modes) || !json.availableChannels) return [];
  const defs: Record<string, any> = json.availableChannels;
  const fine = new Map<string, Attr>();
  for (const def of Object.values<any>(defs)) {
    for (const alias of def?.fineChannelAliases ?? []) {
      const a = oflAttr(def).attr;
      fine.set(alias, a === 'pan' ? 'panFine' : a === 'tilt' ? 'tiltFine' : 'raw');
    }
  }
  const category = OFL_CATEGORY.find(([c]) => (json.categories ?? []).includes(c))?.[1] ?? 'other';
  const out: FixtureProfile[] = [];
  for (const mode of json.modes) {
    if (!Array.isArray(mode?.channels)) continue;
    const channels: ProfileChannel[] = mode.channels.map((key: unknown): ProfileChannel => {
      if (typeof key !== 'string') return ch('raw', 'Unused');            // matrix insert blocks stay as spacers
      if (fine.has(key)) return ch(fine.get(key)!, key);
      const { attr, rest } = oflAttr(defs[key]);
      return ch(attr, key, rest);
    });
    if (!channels.length) continue;
    const base = `${json.manufacturerKey ? `${json.manufacturerKey} ` : ''}${json.name ?? 'Fixture'}`.trim();
    out.push({ id: `ofl-${slug(base)}-${slug(String(mode.shortName ?? mode.name ?? channels.length))}`, name: `${base} · ${mode.name ?? `${channels.length}ch`}`, category, channels, source: 'ofl' });
  }
  return out;
}
