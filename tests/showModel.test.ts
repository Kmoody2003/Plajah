// showModel — Test Suite (the independent layer stack)
// Run with: npm run test:ambo
//
// The contract that separates a presentation system from a slide viewer:
// advancing a slide must not disturb layers that slide doesn't mention.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYER_ORDER, applySlide, clearLayer, clearAll, compositeOrder, enginesInUse,
  flattenArrangement, engineFor, textSlide, backgroundSlide, newId,
  type LiveStack, type Show, type Slide,
} from '../services/ambo/showModel';

const T0 = 1_700_000_000_000;

const layer = (slot: any, content: any) => ({ id: newId('ly'), slot, content });

const bgLoop: Slide = {
  id: 'bg', label: 'Loop',
  layers: [layer('background', { kind: 'VIDEO', src: 'loop.mp4', loop: true })],
};
const lyric1: Slide = {
  id: 'v1', label: 'Verse 1', group: 'Verse',
  layers: [layer('slide', { kind: 'TEXT', blocks: [{ text: 'Great are you Lord' }] })],
};
const lyric2: Slide = {
  id: 'c1', label: 'Chorus', group: 'Chorus',
  layers: [layer('slide', { kind: 'TEXT', blocks: [{ text: 'It’s your breath in our lungs' }] })],
};

describe('applySlide — a slide only touches the layers it defines', () => {
  test('THE POINT: advancing lyrics does not kill the background', () => {
    let s: LiveStack = {};
    s = applySlide(s, bgLoop, T0);
    s = applySlide(s, lyric1, T0 + 1000);
    s = applySlide(s, lyric2, T0 + 2000);

    assert.equal(s.background?.content.kind, 'VIDEO', 'background survived two slide changes');
    assert.equal((s.slide?.content as any).blocks[0].text, 'It’s your breath in our lungs');
    // and the background was never restarted
    assert.equal(s.background?.since, T0);
  });

  test('a slide replaces only its own slot', () => {
    let s: LiveStack = {};
    s = applySlide(s, bgLoop, T0);
    s = applySlide(s, {
      id: 'x', layers: [layer('prop', { kind: 'IMAGE', src: 'logo.png' })],
    }, T0 + 500);
    assert.ok(s.background && s.prop, 'both present');
    assert.equal(s.slide, undefined, 'untouched slot stays empty');
  });

  test('an explicit CLEAR removes that layer and nothing else', () => {
    let s: LiveStack = {};
    s = applySlide(s, bgLoop, T0);
    s = applySlide(s, lyric1, T0 + 1);
    s = applySlide(s, { id: 'clr', layers: [layer('slide', { kind: 'CLEAR' })] }, T0 + 2);
    assert.equal(s.slide, undefined, 'text cleared');
    assert.equal(s.background?.content.kind, 'VIDEO', 'background untouched');
  });

  test('a disabled layer is skipped without clearing what is there', () => {
    let s: LiveStack = applySlide({}, lyric1, T0);
    s = applySlide(s, {
      id: 'y',
      layers: [{ ...layer('slide', { kind: 'TEXT', blocks: [{ text: 'nope' }] }), enabled: false }],
    }, T0 + 1);
    assert.equal((s.slide?.content as any).blocks[0].text, 'Great are you Lord');
  });

  test('sourceSlideId records what is driving each layer', () => {
    let s: LiveStack = applySlide({}, bgLoop, T0);
    s = applySlide(s, lyric1, T0 + 1);
    assert.equal(s.background?.sourceSlideId, 'bg');
    assert.equal(s.slide?.sourceSlideId, 'v1');
  });
});

describe('per-layer clearing', () => {
  test('clearLayer leaves the rest of the stack alone', () => {
    let s: LiveStack = applySlide(applySlide({}, bgLoop, T0), lyric1, T0 + 1);
    s = clearLayer(s, 'slide');
    assert.equal(s.slide, undefined);
    assert.ok(s.background);
  });

  test('clearAll is the panic button', () => {
    assert.deepEqual(clearAll(), {});
  });
});

describe('composite order', () => {
  test('bottom to top, mask last', () => {
    assert.deepEqual([...LAYER_ORDER], ['background', 'fill', 'slide', 'scripture', 'prop', 'overlay', 'mask']);
  });

  test('returns only occupied layers, in order', () => {
    let s: LiveStack = {};
    s = applySlide(s, { id: 'a', layers: [layer('mask', { kind: 'IMAGE', src: 'm.png' })] }, T0);
    s = applySlide(s, bgLoop, T0);
    s = applySlide(s, lyric1, T0);
    assert.deepEqual(compositeOrder(s).map(e => e.slot), ['background', 'slide', 'mask']);
  });
});

describe('engine routing — every source maps to a real subsystem', () => {
  test('the reuse map', () => {
    assert.equal(engineFor({ kind: 'GENERATOR', mode: 'plasma' }), 'pixels-gen');
    assert.equal(engineFor({ kind: 'SHADER', src: 'x' }), 'pixels-shader');
    assert.equal(engineFor({ kind: 'LOTTIE', src: 'x' }), 'fabula-lottie');
    assert.equal(engineFor({ kind: 'VIDEO', src: 'x' }), 'fabula-video');
    assert.equal(engineFor({ kind: 'AUDIO', src: 'x' }), 'melos-audio');
    assert.equal(engineFor({ kind: 'TEXT', blocks: [] }), 'canvas2d');
    assert.equal(engineFor({ kind: 'SCRIPTURE', refId: '45.8.28' }), 'canvas2d');
  });

  test('enginesInUse lets an output warm only what it needs', () => {
    let s: LiveStack = {};
    s = applySlide(s, backgroundSlide({ kind: 'GENERATOR', mode: 'plasma' }), T0);
    s = applySlide(s, textSlide('Hello'), T0);
    assert.deepEqual(enginesInUse(s).sort(), ['canvas2d', 'pixels-gen']);
  });
});

describe('arrangements — a song stored once, played in any order', () => {
  const show: Show = {
    id: 'song1', title: 'Great Are You Lord', kind: 'SONG',
    slides: [lyric1, lyric2, { id: 'v2', group: 'Verse', layers: [] }],
    groups: [
      { name: 'Verse', slideIds: ['v1', 'v2'] },
      { name: 'Chorus', slideIds: ['c1'] },
    ],
    arrangement: ['Verse', 'Chorus', 'Verse', 'Chorus'],
  };

  test('flattens without duplicating stored slides', () => {
    const flat = flattenArrangement(show);
    assert.deepEqual(flat.map(s => s.id), ['v1', 'v2', 'c1', 'v1', 'v2', 'c1']);
    assert.equal(show.slides.length, 3, 'source is still three slides');
  });

  test('no arrangement means play as stored', () => {
    assert.deepEqual(
      flattenArrangement({ ...show, arrangement: undefined }).map(s => s.id),
      ['v1', 'c1', 'v2'],
    );
  });

  test('an unknown group name is skipped, not fatal', () => {
    const flat = flattenArrangement({ ...show, arrangement: ['Chorus', 'Nope'] });
    assert.deepEqual(flat.map(s => s.id), ['c1']);
  });
});

// ── Output routing ───────────────────────────────────────────────────────────
import {
  makeOutput, stackForOutput, DEFAULT_LAYERS, outputIdFromUrl,
} from '../services/ambo/outputRouter';

describe('outputs — each decides for itself what it shows', () => {
  const full: LiveStack = {
    background: { content: { kind: 'GENERATOR', mode: 'plasma' }, since: T0 },
    slide:      { content: { kind: 'TEXT', blocks: [{ text: 'hi' }] }, since: T0 },
    prop:       { content: { kind: 'IMAGE', src: 'logo.png' }, since: T0 },
    mask:       { content: { kind: 'IMAGE', src: 'm.png' }, since: T0 },
  };

  test('THE POINT: a broadcast key must not carry the background', () => {
    const key = makeOutput('KEY', 'Switcher key');
    const s = stackForOutput(full, key);
    assert.equal(s.background, undefined, 'else the key fills a solid rectangle');
    assert.ok(s.slide && s.prop);
    assert.equal(key.alpha, true);
  });

  test('a lobby loop shows only the background', () => {
    const s = stackForOutput(full, makeOutput('LOOP', 'Lobby'));
    assert.deepEqual(Object.keys(s), ['background']);
  });

  test('stage display gets text but never props', () => {
    const stage = makeOutput('STAGE', 'Pulpit');
    const s = stackForOutput(full, stage);
    assert.ok(s.slide);
    assert.equal(s.prop, undefined);
    assert.equal(stage.showStageNotes, true);
    assert.equal(stage.showNextSlide, true);
  });

  test('program gets everything, in composite order', () => {
    const s = stackForOutput(full, makeOutput('PROGRAM', 'Main'));
    assert.deepEqual(compositeOrder(s).map(e => e.slot), ['background', 'slide', 'prop', 'mask']);
  });

  test('layers can be overridden per output', () => {
    const custom = makeOutput('AUX', 'Cry room', { layers: ['slide'] });
    assert.deepEqual(Object.keys(stackForOutput(full, custom)), ['slide']);
  });

  test('every kind has a default layer set', () => {
    for (const k of Object.keys(DEFAULT_LAYERS)) {
      assert.ok(DEFAULT_LAYERS[k as keyof typeof DEFAULT_LAYERS].length > 0, k);
    }
  });

  test('ids are stable so reopening reuses the window', () => {
    assert.equal(makeOutput('PROGRAM', 'Main').id, makeOutput('PROGRAM', 'Main').id);
    assert.notEqual(makeOutput('PROGRAM', 'Main').id, makeOutput('PROGRAM', 'Overflow').id);
  });

  test('output id parses out of the window url', () => {
    assert.equal(outputIdFromUrl('?amboOut=out_key_123'), 'out_key_123');
    assert.equal(outputIdFromUrl('?other=1'), null);
  });
});

// ── Source reconciliation (the rule that makes persistent layers real) ───────
import { canUpdateInPlace } from '../services/ambo/layerSources';

describe('reconcile — a repaint must not become a restart', () => {
  test('THE POINT: a lyric change reuses the text source', () => {
    assert.ok(canUpdateInPlace(
      { kind: 'TEXT', blocks: [{ text: 'verse 1' }] },
      { kind: 'TEXT', blocks: [{ text: 'verse 2' }] },
    ));
  });

  test('the same background video is never restarted', () => {
    assert.ok(canUpdateInPlace(
      { kind: 'VIDEO', src: 'loop.mp4', loop: true },
      { kind: 'VIDEO', src: 'loop.mp4', loop: true, volume: 0.2 },
    ));
  });

  test('a DIFFERENT video does rebuild', () => {
    assert.ok(!canUpdateInPlace({ kind: 'VIDEO', src: 'a.mp4' }, { kind: 'VIDEO', src: 'b.mp4' }));
  });

  test('scripture repaints in place — Kairos cues do not restart the layer', () => {
    assert.ok(canUpdateInPlace(
      { kind: 'SCRIPTURE', refId: '45.8.28', lines: ['a'] },
      { kind: 'SCRIPTURE', refId: '45.8.31', lines: ['b'] },
    ));
  });

  test('the same generator mode keeps running; a new mode rebuilds', () => {
    assert.ok(canUpdateInPlace({ kind: 'GENERATOR', mode: 'LIQUID' }, { kind: 'GENERATOR', mode: 'LIQUID' }));
    assert.ok(!canUpdateInPlace({ kind: 'GENERATOR', mode: 'LIQUID' }, { kind: 'GENERATOR', mode: 'STORM' }));
  });

  test('changing kind always rebuilds', () => {
    assert.ok(!canUpdateInPlace({ kind: 'TEXT', blocks: [] }, { kind: 'IMAGE', src: 'x.png' }));
  });
});

describe('audio — playback lifecycle without duplicate copies', () => {
  test('the same track is a volume change, not a restart', () => {
    assert.ok(canUpdateInPlace(
      { kind: 'AUDIO', src: 'bed.mp3', volume: 0.8 },
      { kind: 'AUDIO', src: 'bed.mp3', volume: 0.4 },
    ));
  });

  test('a different track rebuilds', () => {
    assert.ok(!canUpdateInPlace({ kind: 'AUDIO', src: 'a.mp3' }, { kind: 'AUDIO', src: 'b.mp3' }));
  });

  test('audio occupies a layer slot like anything else', () => {
    const s = applySlide({}, {
      id: 'cue', layers: [layer('overlay', { kind: 'AUDIO', src: 'sting.mp3' })],
    }, T0);
    assert.equal(s.overlay?.content.kind, 'AUDIO');
  });

  test('audio routes to the Melos engine', () => {
    assert.equal(engineFor({ kind: 'AUDIO', src: 'x.mp3' }), 'melos-audio');
  });
});

// ── Media library ────────────────────────────────────────────────────────────
import {
  GENERATOR_ITEMS, PROP_ITEMS, PROP_TEMPLATES, propToLayer,
  kindForFile, searchLibrary, categoriesOf, mediaItem,
} from '../services/ambo/mediaLibrary';

describe('media library', () => {
  test('every catalogued generator is a mode Pixels actually has', () => {
    const REAL = ['WAVEFORM','SPECTRUM','TUNNEL','VORTEX','NEBULA','COSMIC','RETROGRID','KALEIDOSCOPE',
      'STAGE','LIQUID','PARTICLES','STORM','LUMINANCE','STUDIO_AURORA','STUDIO_CHROME','STUDIO_BAUHAUS',
      'STUDIO_NEBULA','STUDIO_GRAVITY','STUDIO_KINETIC','STUDIO_RIPPLE'];
    for (const g of GENERATOR_ITEMS) {
      const mode = (g.content as any).mode;
      assert.ok(REAL.includes(mode), `${mode} is not a real generator`);
    }
    assert.equal(GENERATOR_ITEMS.length, 20, 'all 20 modes are catalogued');
  });

  test('generators land on the background layer', () => {
    assert.ok(GENERATOR_ITEMS.every(g => g.slot === 'background'));
  });

  test('props land on their own layer so they never disturb slides', () => {
    assert.ok(PROP_ITEMS.every(p => p.slot === 'prop'));
  });

  test('a lower third builds title + subtitle blocks', () => {
    const t = PROP_TEMPLATES.find(x => x.id === 'lt_name')!;
    const c: any = propToLayer(t, 'Pastor Ellis', 'Lead Pastor');
    assert.equal(c.kind, 'TEXT');
    assert.deepEqual(c.blocks.map((b: any) => b.text), ['Pastor Ellis', 'Lead Pastor']);
    assert.equal(c.style.align, 'left');
  });

  test('a title-only prop does not invent an empty subtitle', () => {
    const t = PROP_TEMPLATES.find(x => x.id === 'lt_minimal')!;
    const c: any = propToLayer(t, 'Welcome');
    assert.equal(c.blocks.length, 1);
  });

  test('file kinds are detected from name or url', () => {
    assert.equal(kindForFile('loop.mp4'), 'VIDEO');
    assert.equal(kindForFile('bg.JPG'), 'IMAGE');
    assert.equal(kindForFile('sting.wav'), 'AUDIO');
    assert.equal(kindForFile('anim.lottie'), 'LOTTIE');
    assert.equal(kindForFile('https://x.test/a/b.webm?token=1'), 'VIDEO');
    assert.equal(kindForFile('notes.txt'), null);
  });

  test('dropped media lands on a sensible layer', () => {
    assert.equal(mediaItem('m1', 'Loop', 'VIDEO', 'a.mp4').slot, 'background');
    assert.equal(mediaItem('m2', 'Sting', 'AUDIO', 'a.mp3').slot, 'overlay');
    assert.equal(mediaItem('m3', 'Bug', 'LOTTIE', 'a.lottie').slot, 'prop');
  });

  test('video from the library is muted by default', () => {
    const c: any = mediaItem('m1', 'Loop', 'VIDEO', 'a.mp4').content;
    assert.equal(c.muted, true, 'a background loop must not unmute itself on stage');
  });

  test('search covers name, category and tags', () => {
    assert.ok(searchLibrary(GENERATOR_ITEMS, 'aurora').length >= 1);
    assert.ok(searchLibrary(GENERATOR_ITEMS, 'worship').length >= 2);
    assert.ok(searchLibrary(GENERATOR_ITEMS, 'atmosphere').length >= 5);
    assert.equal(searchLibrary(GENERATOR_ITEMS, '').length, GENERATOR_ITEMS.length);
  });

  test('categories are stable groupings', () => {
    assert.deepEqual(categoriesOf(GENERATOR_ITEMS).sort(), ['Atmosphere', 'Energy', 'Graphic', 'Reactive']);
  });
});

describe('scripture composites OVER slides, it does not replace them', () => {
  const sermonPoint: Slide = {
    id: 'pt1', label: 'Point 1',
    layers: [
      layer('background', { kind: 'GENERATOR', mode: 'LIQUID' }),
      layer('slide', { kind: 'TEXT', blocks: [{ text: 'All things work together' }] }),
    ],
  };
  const reading: Slide = {
    id: 'rd1', label: 'Romans 8:28',
    layers: [layer('scripture', { kind: 'SCRIPTURE', refId: '45.8.28', lines: ['And we know…'], reference: 'Romans 8:28' })],
  };

  test('THE POINT: the slide text survives underneath the verse', () => {
    let s: LiveStack = applySlide({}, sermonPoint, T0);
    s = applySlide(s, reading, T0 + 1);
    assert.ok(s.slide, 'the sermon point is still there');
    assert.equal((s.slide!.content as any).blocks[0].text, 'All things work together');
    assert.equal(s.scripture?.content.kind, 'SCRIPTURE');
    assert.ok(s.background, 'and the background kept running');
  });

  test('scripture draws above the slide and below props', () => {
    let s: LiveStack = applySlide({}, sermonPoint, T0);
    s = applySlide(s, reading, T0);
    s = applySlide(s, { id: 'p', layers: [layer('prop', { kind: 'IMAGE', src: 'logo.png' })] }, T0);
    assert.deepEqual(compositeOrder(s).map(e => e.slot), ['background', 'slide', 'scripture', 'prop']);
  });

  test('clearing the verse leaves the sermon point on screen', () => {
    let s: LiveStack = applySlide(applySlide({}, sermonPoint, T0), reading, T0);
    s = clearLayer(s, 'scripture');
    assert.equal(s.scripture, undefined);
    assert.ok(s.slide, 'the point remains — this is why scripture needs its own slot');
  });

  test('every output that carries slides also carries scripture', () => {
    for (const k of ['PROGRAM', 'KEY', 'STAGE', 'AUX', 'STREAM'] as const) {
      const layers = DEFAULT_LAYERS[k];
      if (layers.includes('slide')) assert.ok(layers.includes('scripture'), `${k} would drop the verse`);
    }
  });

  test('a Kairos cue replaces the verse without touching anything else', () => {
    let s: LiveStack = applySlide(applySlide({}, sermonPoint, T0), reading, T0);
    const next: Slide = { id: 'rd2', layers: [layer('scripture', { kind: 'SCRIPTURE', refId: '45.8.31', lines: ['If God be for us…'], reference: 'Romans 8:31' })] };
    s = applySlide(s, next, T0 + 5);
    assert.equal((s.scripture!.content as any).reference, 'Romans 8:31');
    assert.equal((s.slide!.content as any).blocks[0].text, 'All things work together');
  });
});
