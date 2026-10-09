// Sample objects + LivingPage JSON used by the lab (living-lab.tsx), the lab driver and the tests.
// One page demonstrates EVERY trigger; a second page lays out all 35 animation presets as tiles.
import type { TelaVectorObject } from '../../../types';
import type { AnimPreset, Behavior, LivingPage } from '../contracts';
import { ALL_PRESETS, IDLE_LOOPS } from '../runtime/anim';

export const LAB_W = 600, LAB_H = 900;

const base = { rotation: 0, opacity: 1, strokeWidth: 0, stroke: 'none' } as const;
const rect = (id: string, label: string, x: number, y: number, w: number, h: number, fill: string, extra: Partial<TelaVectorObject> = {}): TelaVectorObject => ({ ...base, id, kind: 'RECT', objectLabel: label, x, y, w, h, fill, rx: 10, ...extra });
const oval = (id: string, label: string, cx: number, cy: number, rx: number, ry: number, fill: string, extra: Partial<TelaVectorObject> = {}): TelaVectorObject => ({ ...base, id, kind: 'ELLIPSE', objectLabel: label, x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, fill, ...extra });
const text = (id: string, label: string, x: number, y: number, w: number, t: string, size = 22, extra: Partial<TelaVectorObject> = {}): TelaVectorObject => ({ ...base, id, kind: 'TEXT', objectLabel: label, x, y, w, h: size * 1.4, text: t, fontSize: size, fontFamily: 'Georgia, serif', fontWeight: 700, fill: '#fff6e0', ...extra });

export const labObjects: TelaVectorObject[] = [
  rect('bg', 'Sky', 0, 0, LAB_W, LAB_H, '#1b2a4e', { rx: 0, templateRole: 'GROUND', gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: '#26356b' }, { offset: 1, color: '#0f1730' }] } }),
  text('title', 'Title', 24, 14, 552, 'Living Runtime Lab', 30, { templateRole: 'HEADLINE' }),
  text('story-1', 'Story 1', 24, 56, 552, 'Bo beeps when you tap him and Mars is shy.', 17, { fontWeight: 500, templateRole: 'BODY' }),
  text('story-2', 'Story 2', 24, 80, 552, 'Drag the blanket, pull the thread, find the pips.', 17, { fontWeight: 500, templateRole: 'BODY' }),
  // Bo
  rect('bo-body', 'Bo body', 40, 130, 170, 110, '#3b82f6', { rx: 28, strokeWidth: 3, stroke: '#1e3a8a', shadow: { x: 0, y: 6, blur: 6, color: 'rgba(0,0,0,.35)' } }),
  oval('bo-eye-l', 'Bo eye L', 100, 170, 18, 18, '#fff'), oval('bo-eye-r', 'Bo eye R', 150, 170, 18, 18, '#fff'),
  oval('bo-pupil-l', 'Bo pupil L', 100, 170, 8, 8, '#0b1020'), oval('bo-pupil-r', 'Bo pupil R', 150, 170, 8, 8, '#0b1020'),
  // Zib (press), Mars (proximity)
  oval('zib', 'Zib', 290, 185, 40, 40, '#f97316', { stroke: '#7c2d12', strokeWidth: 3, gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: '#fdba74' }, { offset: 1, color: '#ea580c' }] } }),
  oval('mars', 'Mars', 460, 185, 44, 44, '#ef4444', { stroke: '#7f1d1d', strokeWidth: 3 }),
  oval('mars-blush', 'Mars blush', 478, 198, 12, 8, '#fda4af'),
  // planets
  oval('sun', 'Sun', 130, 340, 30, 30, '#fde047', { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: '#fef9c3' }, { offset: 1, color: '#f59e0b' }] } }),
  oval('planet-1', 'Planet 1', 130, 340, 14, 14, '#a78bfa'), oval('planet-2', 'Planet 2', 130, 340, 11, 11, '#34d399'), oval('planet-3', 'Planet 3', 130, 340, 9, 9, '#f472b6'),
  // stars + parallax
  oval('star-1', 'Star 1', 300, 320, 7, 7, '#fff6a8'), oval('star-2', 'Star 2', 340, 345, 5, 5, '#fff6a8'), oval('star-3', 'Star 3', 380, 318, 6, 6, '#fff6a8'), oval('star-4', 'Star 4', 420, 350, 4, 4, '#fff6a8'),
  rect('par-back', 'Parallax back', 470, 305, 100, 24, '#475569', { rx: 12 }), rect('par-front', 'Parallax front', 480, 332, 80, 24, '#94a3b8', { rx: 12 }),
  // candle + blanket + moth
  rect('candle', 'Candle', 40, 440, 24, 54, '#fef3c7', { rx: 4 }), oval('flame', 'Flame', 52, 428, 9, 15, '#fb923c', { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: '#fef08a' }, { offset: 1, color: '#f97316' }] } }),
  oval('moth', 'Hidden moth', 200, 500, 20, 12, '#d6d3d1', { stroke: '#57534e', strokeWidth: 2 }),
  rect('blanket', 'Blanket', 140, 440, 160, 70, '#a16207', { rx: 16, strokeWidth: 3, stroke: '#713f12' }),
  // depth slider
  rect('coral-track', 'Coral track', 350, 430, 10, 140, '#334155', { rx: 5 }), oval('coral', 'Coral', 355, 440, 20, 20, '#fb7185', { stroke: '#9f1239', strokeWidth: 3 }),
  // thread
  { ...base, id: 'thread', kind: 'PATH', objectLabel: 'Thread', x: 40, y: 600, w: 520, h: 90, fill: 'none', stroke: '#fbbf24', strokeWidth: 6, svgPathData: 'M 40 650 C 120 600, 200 700, 300 650 S 460 600, 560 650', pathOriginX: 40, pathOriginY: 600, pathOriginW: 520, pathOriginH: 90 },
  oval('thread-handle', 'Thread handle', 52, 650, 16, 16, '#fde68a', { stroke: '#92400e', strokeWidth: 3 }),
  // pips (counter)
  oval('pip-1', 'Pip 1', 70, 770, 18, 18, '#4ade80'), oval('pip-2', 'Pip 2', 130, 770, 18, 18, '#4ade80'), oval('pip-3', 'Pip 3', 190, 770, 18, 18, '#4ade80'),
  // misc triggers
  rect('dbl', 'Double tap me', 250, 740, 90, 60, '#c084fc', { rx: 14 }), rect('hov', 'Hover me', 360, 740, 90, 60, '#22d3ee', { rx: 14 }),
  rect('key', 'Press K', 470, 740, 90, 60, '#facc15', { rx: 14 }),
  oval('nova', 'Nova', 120, 850, 16, 16, '#fef08a'), rect('nova-switch', 'Trail switch', 200, 835, 90, 34, '#64748b', { rx: 17 }),
  rect('tick', 'Ticker', 320, 835, 60, 34, '#f43f5e', { rx: 12 }), rect('ping', 'Ping', 400, 835, 60, 34, '#38bdf8', { rx: 12 }), rect('pong', 'Pong', 480, 835, 60, 34, '#a3e635', { rx: 12 }),
  rect('listen', 'Read to me', 240, 104, 80, 30, '#0ea5e9', { rx: 15 }),
  rect('tilt-card', 'Tilt card', 40, 560, 100, 30, '#f59e0b', { rx: 8 }),
  rect('tgl', 'Toggle me', 500, 104, 76, 30, '#e879f9', { rx: 15 }), oval('tgl-target', 'Toggled', 538, 160, 12, 12, '#e879f9'),
];

const hint = (s: string) => s;
export const labBehaviors: Behavior[] = [
  // enter / idle
  { id: 'title-type', target: { id: 'title' }, on: { type: 'enter' }, do: [{ do: 'animate', anim: { preset: 'type-on', durationMs: 900 } }] },
  { id: 'story-fade', target: { label: 'Story*' }, on: { type: 'enter' }, do: [{ do: 'animate', anim: { preset: 'fade-in', durationMs: 800, delayMs: 300 } }] },
  { id: 'bo-breathe', target: { id: 'bo-body' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'breathe', loop: 'infinite' } }] },
  { id: 'eyes-blink', target: { label: 'Bo eye*' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'blink', loop: 'infinite' } }] },
  { id: 'stars-twinkle', target: { label: 'Star*' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'twinkle', loop: 'infinite' } }] },
  { id: 'flame-flicker', target: { id: 'flame' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'flicker', loop: 'infinite' } }] },
  { id: 'planet-1-orbit', target: { id: 'planet-1' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'orbit', loop: 'infinite', durationMs: 7000, amount: 1.6 } }] },
  { id: 'planet-2-orbit', target: { id: 'planet-2' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'orbit', loop: 'infinite', durationMs: 11000, amount: 2, direction: 'reverse' } }] },
  { id: 'planet-3-float', target: { id: 'planet-3' }, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset: 'float', loop: 'infinite' } }] },
  // pupils follow the pointer
  { id: 'pupils-follow', target: { label: 'Bo pupil*' }, on: { type: 'enter' }, do: [{ do: 'follow', target: { label: 'Bo pupil*' }, to: 'pointer', lookAt: true, maxOffset: 7 }] },
  // tap / press / release / doubleTap / hover / key
  { id: 'bo-tap', target: { id: 'bo-body' }, on: { type: 'tap' }, hint: hint('Tap Bo to make him beep'), do: [{ do: 'var', name: 'beeps', op: 'inc' }, { do: 'note', instrument: 'marimba', note: 'scale:C4,D4,E4,G4,A4', durationMs: 300 }, { do: 'animate', anim: { preset: 'squash' } }, { do: 'burst', kind: 'notes', count: 5 }], reduced: [{ do: 'var', name: 'beeps', op: 'inc' }, { do: 'set', target: { id: 'title' }, props: { text: 'Beep!' } }] },
  { id: 'zib-hold', target: { id: 'zib' }, on: { type: 'press', minMs: 0 }, hint: hint('Press and hold Zib to toot the kazoo'), do: [{ do: 'note', instrument: 'kazoo', note: 'C4' }, { do: 'animate', anim: { preset: 'pulse', durationMs: 300 } }, { do: 'var', name: 'tooting', op: 'set', value: true }] },
  { id: 'zib-release', target: { id: 'zib' }, on: { type: 'release' }, do: [{ do: 'var', name: 'tooting', op: 'set', value: false }, { do: 'animate', anim: { preset: 'jelly' } }] },
  { id: 'dbl-tap', target: { id: 'dbl' }, on: { type: 'doubleTap' }, hint: hint('Double tap for hearts'), do: [{ do: 'burst', kind: 'hearts', count: 12 }, { do: 'var', name: 'doubles', op: 'inc' }] },
  { id: 'hov-glow', target: { id: 'hov' }, on: { type: 'hover' }, do: [{ do: 'animate', anim: { preset: 'glow', durationMs: 600 } }, { do: 'var', name: 'hovers', op: 'inc' }] },
  { id: 'tgl-tap', target: { id: 'tgl' }, on: { type: 'tap' }, hint: hint('Tap to show or hide the dot below'), do: [{ do: 'toggle', target: { id: 'tgl-target' }, anim: { preset: 'pop-in' } }, { do: 'var', name: 'toggles', op: 'inc' }] },
  { id: 'key-c', target: { page: true }, on: { type: 'key', key: 'c' }, hint: hint('Press C to celebrate'), do: [{ do: 'celebrate' }] },
  { id: 'key-k', target: { id: 'key' }, on: { type: 'key', key: 'k' }, hint: hint('Press the K key for a burst'), do: [{ do: 'burst', at: { id: 'key' }, kind: 'confetti', count: 16 }, { do: 'var', name: 'keys', op: 'inc' }] },
  // shy Mars (proximity with speed)
  { id: 'start-hidden', target: { label: 'Mars*' }, on: { type: 'enter' }, do: [{ do: 'set', props: { opacity: 0 } }, { do: 'set', target: { id: 'moth' }, props: { opacity: 0 } }, { do: 'set', target: { id: 'tgl-target' }, props: { opacity: 0 } }] },
  { id: 'mars-peek', target: { id: 'mars' }, on: { type: 'proximity', radius: 120, slowBelow: 300 }, hint: hint('Move slowly toward Mars and he will peek out'), do: [{ do: 'animate', anim: { preset: 'pop-in' } }, { do: 'set', target: { id: 'mars-blush' }, props: { opacity: 0.9 } }, { do: 'var', name: 'peeks', op: 'inc' }] },
  { id: 'mars-hide', target: { id: 'mars' }, on: { type: 'proximity', radius: 120, fastAbove: 900 }, hint: hint('Rush at Mars and he hides'), do: [{ do: 'animate', anim: { preset: 'fade-out', durationMs: 250 } }, { do: 'set', target: { id: 'mars-blush' }, props: { opacity: 0 } }, { do: 'var', name: 'hides', op: 'inc' }] },
  // planets as notes
  { id: 'planets-tap', target: { label: 'Planet*' }, on: { type: 'tap' }, hint: hint('Tap a planet to play its note'), do: [{ do: 'note', instrument: 'glass', note: 'scale:C4,E4,G4', durationMs: 600 }, { do: 'animate', anim: { preset: 'pulse' } }, { do: 'var', name: 'planetTaps', op: 'inc' }] },
  // tilt parallax
  { id: 'par-back-tilt', target: { id: 'par-back' }, on: { type: 'tilt', axis: 'x', gain: 1 }, hint: hint('Tilt the device to shift the layers'), do: [{ do: 'animate', anim: { preset: 'parallax', amount: 0.6 } }] },
  { id: 'par-front-tilt', target: { id: 'par-front' }, on: { type: 'tilt', axis: 'both', gain: 1 }, do: [{ do: 'animate', anim: { preset: 'parallax', amount: 1.6 } }] },
  // candle: tap blows it out and dims the page
  { id: 'candle-tap', target: { id: 'candle' }, on: { type: 'tap' }, hint: hint('Tap the candle to blow it out'), do: [{ do: 'var', name: 'candleOut', op: 'toggle' }, { do: 'if', cond: { var: 'candleOut', op: '==', value: true }, then: [{ do: 'stop', target: { id: 'flame' } }, { do: 'hide', target: { id: 'flame' } }, { do: 'set', target: { page: true }, props: { fill: '#000a24', opacity: 0.55 } }], else: [{ do: 'show', target: { id: 'flame' } }, { do: 'animate', target: { id: 'flame' }, anim: { preset: 'flicker', loop: 'infinite' } }, { do: 'set', target: { page: true }, props: { opacity: 0 } }] }] },
  // blanket drag with progress; moth appears
  { id: 'blanket-drag', target: { id: 'blanket' }, on: { type: 'drag', axis: 'y', bounds: { minY: -100, maxY: 0 }, progressVar: 'lift' }, hint: hint('Drag the blanket up to see what is under it, or press Enter'), do: [{ do: 'haptic', pattern: 'soft' }] },
  { id: 'moth-appear', target: { id: 'moth' }, on: { type: 'when', cond: { var: 'lift', op: '>=', value: 0.7 } }, once: true, do: [{ do: 'animate', anim: { preset: 'fade-in', durationMs: 400 } }, { do: 'animate', anim: { preset: 'flutter', loop: 'infinite' } }] },
  // coral depth slider drives audio depth + a page hue (scrubbed by variable)
  { id: 'coral-drag', target: { id: 'coral' }, on: { type: 'drag', axis: 'y', bounds: { minY: 0, maxY: 120 }, progressVar: 'depth' }, hint: hint('Drag Coral down to go deeper'), do: [] },
  { id: 'depth-audio', target: { page: true }, on: { type: 'enter' }, do: [{ do: 'depth', value: { fromVar: 'depth' } }, { do: 'animate', target: { id: 'bg' }, anim: { keyframes: [{ at: 0, hue: 0 }, { at: 1, hue: 80 }], durationMs: 1000, easing: 'var:depth' } }] },
  // thread: draw-on bound to drag progress, snap points
  { id: 'thread-draw', target: { id: 'thread' }, on: { type: 'enter' }, do: [{ do: 'animate', anim: { preset: 'draw-on', durationMs: 1000, easing: 'var:pull' } }] },
  { id: 'thread-pull', target: { id: 'thread-handle' }, on: { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: 490 }, progressVar: 'pull', snapTo: [{ x: 490, y: 0, r: 40 }] }, hint: hint('Pull the thread across the page'), do: [{ do: 'haptic', pattern: 'tug' }] },
  { id: 'thread-done', target: { id: 'thread' }, on: { type: 'event', name: 'drag:snap:thread-pull' }, once: true, do: [{ do: 'burst', at: { id: 'thread-handle' }, kind: 'sparkles', count: 20 }, { do: 'var', name: 'threadDone', op: 'set', value: true }] },
  // pips counter + goal
  { id: 'pips-tap', target: { label: 'Pip*' }, on: { type: 'tap' }, hint: hint('Tap a pip to find it'), do: [{ do: 'var', name: 'found', op: 'inc' }, { do: 'animate', anim: { preset: 'pop-out', durationMs: 250 } }, { do: 'sfx', sound: 'chime' }], cooldownMs: 100 },
  // nova trail
  { id: 'nova-follow', target: { id: 'nova' }, on: { type: 'enter' }, do: [{ do: 'follow', target: { id: 'nova' }, to: 'pointer', lagMs: 160, maxOffset: 40 }, { do: 'trail', kind: 'sparkles', whileVar: 'trailOn' }] },
  { id: 'nova-switch', target: { id: 'nova-switch' }, on: { type: 'tap' }, hint: hint('Tap to turn the sparkle trail on or off'), do: [{ do: 'var', name: 'trailOn', op: 'toggle' }] },
  // timer
  { id: 'tick', target: { id: 'tick' }, on: { type: 'timer', afterMs: 1500, every: true }, do: [{ do: 'animate', anim: { preset: 'pulse', durationMs: 300 } }, { do: 'var', name: 'ticks', op: 'inc' }] },
  // event emit / listen
  { id: 'ping', target: { id: 'ping' }, on: { type: 'tap' }, hint: hint('Tap Ping to send a message to Pong'), do: [{ do: 'emit', name: 'ping' }] },
  { id: 'pong', target: { id: 'pong' }, on: { type: 'event', name: 'ping' }, do: [{ do: 'animate', anim: { preset: 'shake' } }, { do: 'var', name: 'pongs', op: 'inc' }] },
  // narration + goto
  { id: 'listen', target: { id: 'listen' }, on: { type: 'tap' }, hint: hint('Tap to hear the story read aloud'), do: [{ do: 'narrate' }] },
  // wait sequencing
  { id: 'seq', target: { id: 'tilt-card' }, on: { type: 'tap' }, hint: hint('Tap to run a short sequence'), do: [{ do: 'animate', anim: { preset: 'grow' } }, { do: 'wait', ms: 400 }, { do: 'animate', anim: { preset: 'shrink' } }, { do: 'wait', ms: 400 }, { do: 'var', name: 'seqDone', op: 'inc' }] },
];

export const labPage: LivingPage = {
  page: 1,
  groups: { stars: ['label:Star*'], eyes: ['label:Bo eye*'] },
  vars: { beeps: 0, tooting: false, doubles: 0, hovers: 0, keys: 0, peeks: 0, hides: 0, planetTaps: 0, candleOut: false, lift: 0, depth: 0, pull: 0, threadDone: false, found: 0, trailOn: false, ticks: 0, pongs: 0, seqDone: 0, toggles: 0 },
  behaviors: labBehaviors,
  goals: [{ id: 'found-all', label: 'Found all three pips', when: { var: 'found', op: '>=', value: 3 }, celebrate: true }, { id: 'thread-pulled', label: 'Pulled the whole thread', when: { var: 'pull', op: '>=', value: 1 } }],
  music: { cue: 'lab-lullaby', fadeMs: 500 },
  ambience: { bed: 'room-tone', gain: 0.4 },
  a11y: { summary: 'A lab page with a blue bear, a shy planet, a thread, and pips to find.', instructions: 'Everything can be used with the keyboard: Tab to a control, then Enter. Drag controls also respond to the arrow keys.' },
};

// ───────────── the preset gallery page: one tile per animation preset ─────────────
export const TILE_W = 96, TILE_H = 96, TILE_COLS = 6;
const tileXY = (i: number) => ({ x: 12 + (i % TILE_COLS) * 98, y: 56 + Math.floor(i / TILE_COLS) * 124 });
export const presetTileId = (p: AnimPreset) => `tile-${p}`;

export const presetObjects: TelaVectorObject[] = [
  rect('bg', 'Sky', 0, 0, LAB_W, LAB_H, '#1b2a4e', { rx: 0, templateRole: 'GROUND' }),
  text('title', 'Title', 12, 10, 576, 'All 35 animation presets', 22),
  ...ALL_PRESETS.flatMap((p, i) => {
    const { x, y } = tileXY(i);
    return [
      rect(`tile-${p}`, `Tile ${p}`, x + 22, y + 10, 52, 52, ['#f97316', '#38bdf8', '#a3e635', '#f472b6', '#facc15', '#c084fc'][i % 6], { rx: p === 'orbit' ? 26 : 12, strokeWidth: p === 'draw-on' ? 5 : 2, stroke: p === 'draw-on' ? '#fde68a' : '#0f172a', fill: p === 'draw-on' ? 'rgba(255,255,255,0.03)' : ['#f97316', '#38bdf8', '#a3e635', '#f472b6', '#facc15', '#c084fc'][i % 6] }),
      text(`cap-${p}`, `Caption ${p}`, x, y + 72, 96, p, 12, { textAlign: 'center', fontWeight: 600 }),
    ];
  }),
  text('typed', 'Typed', 12, 826, 576, 'Typed on, one letter at a time.', 18, { fontWeight: 500 }),
];

const idle = new Set<AnimPreset>(IDLE_LOOPS);
export const presetBehaviors: Behavior[] = ALL_PRESETS.map(p => {
  const target = { id: p === 'type-on' ? 'typed' : presetTileId(p) };
  const hintText = `Tap to replay ${p}`;
  const spec = p === 'orbit' ? { preset: p, amount: 1.4, durationMs: 4000 } : p === 'parallax' ? { preset: p, amount: 1.2 } : { preset: p };
  return idle.has(p)
    ? { id: `p-${p}`, target, on: { type: 'idle' as const }, do: [{ do: 'animate' as const, anim: { ...spec, loop: 'infinite' as const } }] }
    : { id: `p-${p}`, target: { id: p === 'type-on' ? 'typed' : presetTileId(p) }, on: { type: 'tap' as const }, hint: hintText, do: [{ do: 'animate' as const, anim: { ...spec, durationMs: p === 'type-on' || p === 'draw-on' ? 1200 : undefined } }] };
});
export const presetPage: LivingPage = { page: 2, behaviors: presetBehaviors, a11y: { summary: 'A gallery of every animation preset.' } };
