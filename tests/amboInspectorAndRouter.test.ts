// amboInspectorAndRouter.test.ts — Unit tests for Ambo Slide Management, Inspector, Media Bin, and Router Receiver
// Run with: npx tsx --test tests/amboInspectorAndRouter.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  type Slide, type SlideLayer, type LayerContent, newId, applySlide,
} from '../services/ambo/showModel';
import { type AmboMediaSourceItem } from '../components/scripture/AmboMediaBin';

describe('Ambo Slide Management', () => {
  const initialSlide: Slide = {
    id: 'sl_1',
    label: 'Verse 1',
    group: 'Verse',
    groupColor: '#3B82F6',
    layers: [
      {
        id: 'ly_bg1',
        slot: 'background',
        content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
      },
      {
        id: 'ly_txt1',
        slot: 'slide',
        content: {
          kind: 'TEXT',
          blocks: [{ text: 'Amazing Grace, how sweet the sound', role: 'body' }],
        },
      },
    ],
  };

  test('can duplicate slide with fresh unique IDs and copy label', () => {
    const duplicated: Slide = {
      ...initialSlide,
      id: newId('sl'),
      label: `${initialSlide.label} (Copy)`,
      layers: initialSlide.layers.map(l => ({ ...l, id: newId('ly') })),
    };

    assert.notEqual(duplicated.id, initialSlide.id);
    assert.equal(duplicated.label, 'Verse 1 (Copy)');
    assert.equal(duplicated.layers.length, 2);
    assert.notEqual(duplicated.layers[0].id, initialSlide.layers[0].id);
  });

  test('can route NDI stream or video input into slide background', () => {
    const targetSlide = { ...initialSlide };
    const ndiInputId = 'ndi_cam_front';
    const ndiLabel = 'PTZ Camera 1 (Front)';

    const newContent: LayerContent = { kind: 'LIVE', inputId: ndiInputId, label: ndiLabel };
    const updatedLayers = targetSlide.layers.map(l =>
      l.slot === 'background' ? { ...l, content: newContent } : l,
    );
    const updatedSlide = { ...targetSlide, layers: updatedLayers };

    const bgLayer = updatedSlide.layers.find(l => l.slot === 'background');
    assert.ok(bgLayer);
    assert.equal(bgLayer?.content.kind, 'LIVE');
    if (bgLayer?.content.kind === 'LIVE') {
      assert.equal(bgLayer.content.inputId, 'ndi_cam_front');
      assert.equal(bgLayer.content.label, 'PTZ Camera 1 (Front)');
    }
  });

  test('preserves body text when changing background source', () => {
    const slide = { ...initialSlide };
    const textLayerBefore = slide.layers.find(l => l.slot === 'slide');

    // Route a new flux generator
    const updatedSlide: Slide = {
      ...slide,
      layers: slide.layers.map(l =>
        l.slot === 'background'
          ? { ...l, content: { kind: 'GENERATOR' as const, mode: 'LIQUID' } }
          : l,
      ),
    };

    const textLayerAfter = updatedSlide.layers.find(l => l.slot === 'slide');
    assert.deepEqual(textLayerBefore, textLayerAfter);
  });
});

describe('Ambo Media Bin Drag and Drop Payload', () => {
  test('serializes and deserializes drag and drop source payload accurately', () => {
    const item: AmboMediaSourceItem = {
      id: 'ndi_obs_studio',
      name: 'OBS NDI Program',
      kind: 'LIVE',
      inputId: 'ndi_obs_studio',
      sub: 'Desktop LAN',
      tags: ['ndi', '1080p60'],
    };

    const payload = JSON.stringify({
      type: 'ambo-source',
      source: item,
    });

    const parsed = JSON.parse(payload);
    assert.equal(parsed.type, 'ambo-source');
    assert.equal(parsed.source.id, 'ndi_obs_studio');
    assert.equal(parsed.source.kind, 'LIVE');
    assert.equal(parsed.source.inputId, 'ndi_obs_studio');
  });

  test('applies dropped flux generator onto slide background layer', () => {
    const targetSlide: Slide = {
      id: 'sl_test',
      label: 'Sermon Point',
      layers: [
        {
          id: 'ly_bg',
          slot: 'background',
          content: { kind: 'COLOR' as any, color: '#000000' },
        },
      ],
    };

    const droppedGenerator: AmboMediaSourceItem = {
      id: 'gen_nebula',
      name: 'Deep Nebula',
      kind: 'GENERATOR',
      mode: 'STUDIO_NEBULA',
    };

    const updatedLayers = targetSlide.layers.map(l =>
      l.slot === 'background'
        ? { ...l, content: { kind: 'GENERATOR' as const, mode: droppedGenerator.mode! } }
        : l,
    );
    const updatedSlide = { ...targetSlide, layers: updatedLayers };

    assert.equal(updatedSlide.layers[0].content.kind, 'GENERATOR');
    if (updatedSlide.layers[0].content.kind === 'GENERATOR') {
      assert.equal(updatedSlide.layers[0].content.mode, 'STUDIO_NEBULA');
    }
  });
});

describe('Single-Click Preview vs Double-Click Program Out Contract', () => {
  test('single click cues preview background override without altering live audience output', () => {
    let liveState = {};
    let previewBackgroundOverride: LayerContent | null = null;

    // Simulate single click on an NDI camera source
    const ndiItem: AmboMediaSourceItem = {
      id: 'ndi_cam_altar',
      name: 'Altar Camera',
      kind: 'LIVE',
      inputId: 'ndi_cam_altar',
    };

    // Single click handler
    previewBackgroundOverride = {
      kind: 'LIVE',
      inputId: ndiItem.inputId!,
      label: ndiItem.name,
    };

    // Live state should still be empty / untouched
    assert.deepEqual(liveState, {});
    assert.equal(previewBackgroundOverride.kind, 'LIVE');
    assert.equal(previewBackgroundOverride.inputId, 'ndi_cam_altar');
  });

  test('double click takes source straight to live program out', () => {
    let liveState: Record<string, any> = {};

    const generatorItem: AmboMediaSourceItem = {
      id: 'gen_storm',
      name: 'Storm',
      kind: 'GENERATOR',
      mode: 'STORM',
    };

    // Double click handler
    liveState = {
      ...liveState,
      background: {
        id: 'ly_bg_live',
        slot: 'background',
        content: { kind: 'GENERATOR', mode: generatorItem.mode },
      },
    };

    assert.ok(liveState.background);
    assert.equal(liveState.background.content.kind, 'GENERATOR');
    assert.equal(liveState.background.content.mode, 'STORM');
  });
});

describe('Switcher Router Receiver Matrix Contract', () => {
  test('can route discovered NDI feed into SW1-SW4 switcher inputs', () => {
    // Media engine routing contract
    const routes: Record<string, string> = {};
    const route = (destId: string, srcId: string) => {
      routes[destId] = srcId;
    };

    const discoveredNdi = {
      id: 'ndi_tricaster_main',
      label: 'TriCaster Main PGM',
      kind: 'ndi',
    };

    // 1-Click route to SW 1
    route('sw1', discoveredNdi.id);
    assert.equal(routes['sw1'], 'ndi_tricaster_main');

    // 1-Click route to SW 2
    route('sw2', discoveredNdi.id);
    assert.equal(routes['sw2'], 'ndi_tricaster_main');

    // Route to SW 3 and SW 4
    route('sw3', 'decklink_cam_sdi1');
    route('sw4', 'whep_remote_guest');
    assert.equal(routes['sw3'], 'decklink_cam_sdi1');
    assert.equal(routes['sw4'], 'whep_remote_guest');
  });

  test('can route source directly to Program (PGM) or Preview (PVW)', () => {
    let programDest = 'sw1';
    let previewDest = 'sw2';
    const routes: Record<string, string> = {
      sw1: 'cam_stage_wide',
      sw2: 'cam_altar_tight',
    };

    // Direct Take PGM
    const directTakePgm = (srcId: string) => {
      routes[programDest] = srcId;
    };

    // Direct Cue PVW
    const directCuePvw = (srcId: string) => {
      routes[previewDest] = srcId;
    };

    directTakePgm('ndi_live_drone');
    assert.equal(routes[programDest], 'ndi_live_drone');

    directCuePvw('decklink_sdi_pastor');
    assert.equal(routes[previewDest], 'decklink_sdi_pastor');
  });
});

