// The preset looks library. A preset is rig-independent: it says what the colours, pattern, moving
// head pose and effects are, and lookFromPreset() bakes that against whatever is patched today.

import { canMove, hasAttr, hasColor, type FixtureProfile } from './fixtureProfiles';
import { colorLevels, hexToRgb, profileOf, type Effect, type EffectKind, type Look, type LevelMap, type PatchedFixture, type RGB } from './boardCore';

export type LookCategory = 'Concert' | 'Effects' | 'Worship' | 'Theatre' | 'Broadcast' | 'Architecture' | 'Christmas' | 'Home';
export const LOOK_CATEGORIES: LookCategory[] = ['Concert', 'Effects', 'Worship', 'Theatre', 'Broadcast', 'Architecture', 'Christmas', 'Home'];

/** How the palette spreads across the rig. */
export type LookPattern = 'flat' | 'alternate' | 'gradient' | 'split';
/** Where moving heads point. */
export type LookPose = 'down' | 'fan' | 'cross' | 'audience' | 'center' | 'wide' | 'up';

/** The slots a generic colour wheel holds, in order. Real wheels differ; check the fixture's manual. */
export const WHEEL_COLORS = ['#ffffff', '#ff2020', '#ff8a20', '#ffe020', '#20e040', '#20d0ff', '#2040ff', '#ff20c0'];

/** The wheel position closest to a colour, as a channel level. */
export function nearestWheelLevel(c: RGB): number {
  let best = 0, bestD = Infinity;
  WHEEL_COLORS.forEach((hex, i) => {
    const w = hexToRgb(hex);
    const d = (w.r - c.r) ** 2 + (w.g - c.g) ** 2 + (w.b - c.b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return (best + 0.5) / WHEEL_COLORS.length;
}

export interface LookEffectSpec { kind: EffectKind; rate: number; size?: number; spread?: number; palette?: string[] }

export interface LookPreset {
  id: string;
  name: string;
  category: LookCategory;
  palette: string[];
  pattern: LookPattern;
  level: number;
  pose: LookPose;
  fade: number;
  effects: LookEffectSpec[];
}

type Row = [name: string, palette: string, pattern?: LookPattern, level?: number, pose?: LookPose, fade?: number, effects?: string];

const WARM = '#ffb46b', AMBER = '#ff8a2a', WHITE = '#fff4e6', COOL = '#d8ecff', CANDLE = '#ff9d4d';

/** "pulse:60:1:1 rainbow:30" -> kind:rate:size:spread */
const parseEffects = (text = ''): LookEffectSpec[] => text.split(' ').filter(Boolean).map((e) => {
  const [kind, rate, size, spread] = e.split(':');
  return { kind: kind as EffectKind, rate: Number(rate) || 60, size: size ? Number(size) : 1, spread: spread ? Number(spread) : 1 };
});

const TABLE: Record<LookCategory, Row[]> = {
  Concert: [
    ['Arena Blue', '#1450ff #36a3ff', 'gradient', 1, 'fan', 2],
    ['Red Wall', '#ff1420', 'flat', 1, 'audience', 0.5],
    ['Magenta Rush', '#ff1a8c #7a12ff', 'alternate', 1, 'cross', 1, 'sweep:18:0.6'],
    ['Amber Anthem', '#ff8a2a #ffd9a0', 'alternate', 1, 'fan', 2],
    ['Cyan Stab', '#00e0ff', 'flat', 1, 'center', 0.2],
    ['Neon Split', '#ff0d6a #00f0d0', 'split', 1, 'wide', 1],
    ['Ultraviolet', '#5b18ff #a020ff', 'gradient', 0.9, 'down', 2],
    ['Sunset Stadium', '#ff4a1a #ffb030 #ff1a70', 'gradient', 1, 'fan', 3],
    ['Ballad Silhouette', '#143cff', 'flat', 0.5, 'up', 4],
    ['Rock Chase', '#ff2010 #ffffff', 'alternate', 1, 'audience', 0.2, 'chase:150'],
    ['EDM Drop', '#ffffff #00a8ff', 'alternate', 1, 'center', 0, 'flicker:360:1:0'],
    ['Festival Fan', '#ff00c8 #00d0ff #ffe000', 'gradient', 1, 'fan', 1, 'sweep:24:0.8'],
    ['Hip-Hop Gold', '#ffb400 #7a4a00', 'alternate', 0.9, 'cross', 2],
    ['Encore Blinders', '#fff1dc', 'flat', 1, 'audience', 0.1, 'pulse:120:0.7:0'],
  ],
  Effects: [
    ['Rainbow Roll', '#ff0000', 'flat', 1, 'fan', 1, 'rainbow:24'],
    ['Slow Rainbow', '#ff0000', 'flat', 0.8, 'down', 2, 'rainbow:6'],
    ['Single Chase', '#ffffff', 'flat', 1, 'down', 0.5, 'chase:120'],
    ['Colour Chase', '#ff1a4a #1a7aff', 'alternate', 1, 'down', 0.5, 'chase:90'],
    ['Pulse Wave', '#7a2bff', 'flat', 1, 'fan', 1, 'pulse:60'],
    ['Heartbeat', '#ff1020', 'flat', 1, 'down', 0.5, 'pulse:72:0.9:0'],
    ['Ballyhoo', '#ffffff #ffd24a', 'alternate', 1, 'fan', 0.5, 'circle:40:1'],
    ['Circle Sweep', '#00d0ff', 'flat', 1, 'fan', 1, 'circle:18:0.7'],
    ['Side Sweep', '#ff2a8a', 'flat', 1, 'audience', 1, 'sweep:20:0.8'],
    ['Flicker White', '#ffffff', 'flat', 1, 'center', 0, 'flicker:240:1'],
    ['Lightning', '#dcebff', 'flat', 1, 'wide', 0, 'twinkle:12:1'],
    ['Fire', '#ff6a14 #ff2a08', 'alternate', 1, 'down', 1, 'fire:60'],
    ['Water Ripple', '#0a58ff #18d0e0', 'gradient', 0.8, 'down', 2, 'colorwave:15'],
    ['Sparkle', '#ffffff', 'flat', 1, 'down', 1, 'twinkle:60:1'],
    ['Aurora', '#10e090 #2060ff #a020ff', 'gradient', 0.7, 'fan', 3, 'colorwave:8'],
    ['Police', '#ff0a14 #0a30ff', 'split', 1, 'down', 0, 'flicker:150:1:1'],
  ],
  Worship: [
    ['Prayer', '#2a1c8c #ff9d4d', 'alternate', 0.45, 'down', 5],
    ['Sanctuary Gold', '#ffb46b', 'flat', 0.7, 'down', 4],
    ['Holy Blue', '#1c48d8 #7aa8ff', 'gradient', 0.6, 'fan', 4],
    ['Pentecost', '#ff3a10 #ff9a20', 'alternate', 0.85, 'fan', 3, 'fire:30:0.5'],
    ['Advent', '#4a1a9a #ffd9a0', 'alternate', 0.6, 'down', 4],
    ['Easter Morning', '#fff1dc #ffcf70', 'gradient', 0.9, 'up', 6],
    ['Altar Call', '#fff4e6', 'flat', 0.35, 'center', 6],
    ['Praise Lift', '#5b18ff #ff7a2a', 'split', 1, 'fan', 2, 'sweep:10:0.4'],
  ],
  Theatre: [
    ['General Wash', WHITE, 'flat', 0.85, 'down', 3],
    ['Warm Day', '#ffd9a8', 'flat', 0.9, 'down', 3],
    ['Moonlight', '#6f95ff', 'flat', 0.45, 'wide', 5],
    ['Dawn', '#ff8a5c #7fa8e0', 'gradient', 0.5, 'wide', 8],
    ['Dusk', '#b04aff #ff6a2a', 'gradient', 0.5, 'wide', 8],
    ['Interrogation', '#fff4e6', 'flat', 1, 'center', 0.5],
    ['Noir', '#aab8d0', 'alternate', 0.4, 'cross', 3],
    ['Curtain Warmers', '#ff4a2a #ffb46b', 'alternate', 0.6, 'down', 3],
    ['Candlelit', CANDLE, 'flat', 0.5, 'down', 4, 'fire:30:0.25'],
  ],
  Broadcast: [
    ['Three-Point Key', '#fff8f0 #ffe6c8', 'alternate', 1, 'center', 1],
    ['Daylight Studio', COOL, 'flat', 1, 'down', 1],
    ['Tungsten Studio', '#ffd2a0', 'flat', 1, 'down', 1],
    ['News Desk', '#ffffff #1c6cff', 'split', 0.9, 'down', 1],
    ['Interview Warm', WARM, 'flat', 0.7, 'center', 2],
    ['Keynote', '#1464ff #fff4e6', 'alternate', 0.85, 'down', 2],
    ['Awards Sweep', '#ffc030 #ffffff', 'alternate', 1, 'fan', 1, 'circle:12:0.5'],
  ],
  Architecture: [
    ['Warm Façade Wash', '#ffcf9a', 'flat', 0.8, 'up', 5],
    ['Cool Façade Wash', '#cfe4ff', 'flat', 0.8, 'up', 5],
    ['Column Uplight', '#ffb46b', 'flat', 0.9, 'up', 4],
    ['Column Accent Blue', '#ffb46b #1c48d8', 'alternate', 0.9, 'up', 4],
    ['Gala Purple', '#7a12ff #ffb46b', 'alternate', 0.8, 'up', 5],
    ['Bridge Sunset', '#ff5a1a #ff1a70 #5a18ff', 'gradient', 0.9, 'up', 8],
    ['Civic Red, White, Blue', '#e01020 #ffffff #1030e0', 'gradient', 0.9, 'up', 4],
    ['Cancer Awareness Pink', '#ff4aa0', 'flat', 0.9, 'up', 5],
    ['Cove Warm White', '#ffd7ae', 'flat', 0.6, 'down', 5],
    ['Lobby Daylight', COOL, 'flat', 0.7, 'down', 5],
    ['Museum Accent', WHITE, 'flat', 0.5, 'center', 5],
    ['Garden Moon', '#90b0ff #30c070', 'alternate', 0.45, 'up', 6],
    ['Slow Colour Drift', '#2060ff #a020ff #ff4a7a', 'gradient', 0.8, 'up', 6, 'colorwave:3'],
  ],
  Christmas: [
    ['Classic Warm White', '#ffc88a', 'flat', 0.9, 'down', 2],
    ['Cool Icicle', '#dcebff', 'flat', 0.9, 'down', 2, 'twinkle:30:0.5'],
    ['Traditional Red & Green', '#e01020 #10a030', 'alternate', 0.9, 'down', 2],
    ['Candy Cane', '#ff1020 #ffffff', 'alternate', 0.95, 'down', 1, 'chase:40:0.6'],
    ['Silent Night', '#1c48d8 #ffc88a', 'alternate', 0.5, 'down', 5],
    ['Gold & Silver', '#ffb030 #e8eef8', 'alternate', 0.85, 'down', 2, 'twinkle:40:0.4'],
    ['Multicolour Vintage', '#e01020 #10a030 #1030e0 #ffa010', 'alternate', 0.85, 'down', 2],
    ['Twinkle Star', '#fff1dc', 'flat', 0.9, 'down', 2, 'twinkle:80:0.9'],
    ['Santa Chase', '#ff1020 #10a030 #fff1dc', 'alternate', 1, 'down', 0.5, 'chase:120'],
    ['Snowfall', '#ffffff #bcd8ff', 'gradient', 0.8, 'down', 2, 'colorwave:12'],
    ['Hanukkah Blue', '#1038d8 #e8eef8', 'alternate', 0.85, 'down', 3],
    ['New Year Sparkle', '#ffd24a #ffffff #ff2a8a', 'alternate', 1, 'down', 1, 'twinkle:120:1'],
  ],
  Home: [
    ['Movie Night', '#ff7a2a', 'flat', 0.15, 'down', 3],
    ['Reading', '#ffd7ae', 'flat', 0.8, 'down', 2],
    ['Dinner Party', AMBER, 'flat', 0.4, 'down', 3],
    ['Focus', COOL, 'flat', 1, 'down', 2],
    ['Sunrise', '#ff7a4a #ffd9a0', 'gradient', 0.6, 'down', 10],
    ['Game Night', '#7a12ff #00d0ff', 'split', 0.7, 'down', 2],
    ['Bedtime', '#ff5a1a', 'flat', 0.08, 'down', 5],
  ],
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const LOOK_PRESETS: LookPreset[] = LOOK_CATEGORIES.flatMap((category) => TABLE[category].map((
  [name, palette, pattern = 'flat', level = 1, pose = 'down', fade = 2, effects]: Row,
): LookPreset => ({
  id: `${slug(category)}-${slug(name)}`, name, category, palette: palette.split(' '), pattern, level, pose, fade, effects: parseEffects(effects),
})));

/** A look that shows off one effect, so the Effects gallery plays the real thing. */
export function effectPreview(kind: EffectKind, palette: string[], pose: LookPose = 'down', rate = 60): LookPreset {
  return { id: `effect-${kind}`, name: kind, category: 'Effects', palette, pattern: palette.length > 1 ? 'alternate' : 'flat', level: 1, pose, fade: 0.3, effects: [{ kind, rate, size: 1, spread: 1, palette }] };
}

/** Index into a palette for fixture i of n under a pattern, as a blend position. */
export function patternColor(pattern: LookPattern, palette: string[], i: number, n: number): RGB {
  const at = (k: number) => hexToRgb(palette[Math.max(0, Math.min(palette.length - 1, k))]);
  if (palette.length === 1 || pattern === 'flat') return at(0);
  if (pattern === 'alternate') return at(i % palette.length);
  if (pattern === 'split') return at(i < n / 2 ? 0 : palette.length - 1);
  const t = n <= 1 ? 0 : (i / (n - 1)) * (palette.length - 1);
  const a = Math.floor(t), f = t - a;
  const c0 = at(a), c1 = at(a + 1);
  return { r: c0.r + (c1.r - c0.r) * f, g: c0.g + (c1.g - c0.g) * f, b: c0.b + (c1.b - c0.b) * f };
}

/** Pan and tilt for mover i of n. 0.5/0.5 hangs straight down; tilt runs ±135°, pan ±270°. */
export function posePanTilt(pose: LookPose, i: number, n: number): { pan: number; tilt: number } {
  const across = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;     // -1..1, stage right to left
  const deg = (d: number) => 0.5 + d / 270;
  switch (pose) {
    case 'fan': return { pan: 0.5, tilt: deg(across * 40) };
    case 'wide': return { pan: 0.5, tilt: deg(across * 65) };
    case 'cross': return { pan: 0.5, tilt: deg(-across * 32) };
    case 'center': return { pan: 0.5, tilt: deg(-across * 14) };
    // Heads hang facing the audience at pan 0.5 + 90° of pan (see stage aim), so tip them towards the house.
    case 'audience': return { pan: 0.5 + 90 / 540, tilt: deg(55 + across * 6) };
    case 'up': return { pan: 0.5, tilt: deg(across * 22) };
    default: return { pan: 0.5, tilt: 0.5 };
  }
}

/** Bake a preset against the patch: a look to fade to and the effects that run on top of it. */
export function lookFromPreset(preset: LookPreset, fixtures: PatchedFixture[], custom: FixtureProfile[]): { look: Look; effects: Effect[] } {
  // A strobe left at full is a white wash over everything, so looks leave strobes and fog alone.
  const lit = fixtures.filter((f) => !['fog', 'strobe'].includes(profileOf(f, custom).category));
  const movers = lit.filter((f) => canMove(profileOf(f, custom)));
  const look: Look = {};
  lit.forEach((f, i) => {
    const profile = profileOf(f, custom);
    const entry: LevelMap = {};
    const color = patternColor(preset.pattern, preset.palette, i, lit.length);
    if (hasColor(profile)) Object.assign(entry, colorLevels(profile, color));
    else if (hasAttr(profile, 'colorWheel')) entry.colorWheel = nearestWheelLevel(color);
    if (hasAttr(profile, 'dimmer')) entry.dimmer = preset.level;
    else if (hasColor(profile)) for (const k of ['red', 'green', 'blue', 'white'] as const) if (entry[k] != null) entry[k] = entry[k]! * preset.level;
    if (canMove(profile)) Object.assign(entry, posePanTilt(preset.pose, movers.indexOf(f), movers.length));
    look[f.id] = entry;
  });
  const ids = lit.map((f) => f.id);
  const effects = preset.effects.map((e, i): Effect => ({
    id: `${preset.id}-${i}`, kind: e.kind, fixtureIds: ids, rate: e.rate, size: e.size ?? 1, spread: e.spread ?? 1, on: true,
    palette: preset.palette,
  }));
  return { look, effects };
}
