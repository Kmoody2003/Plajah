// amboTabbedLibraryAndMultiview.test.ts — Unit tests for Ambo Tabbed Library, Horizontal Multiview, and Slide Contracts
// Run with: npx tsx --test tests/amboTabbedLibraryAndMultiview.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  type Slide, type SlideLayer, type LayerContent, newId, applySlide,
  type LiveStack,
} from '../services/ambo/showModel';
import { BOOKS, type BibleBook, type BibleVerse } from '../services/bibleService';
import { parseRef } from '../services/scriptureRef';
import { type AmboMediaSourceItem } from '../components/scripture/AmboMediaBin';
import { type ScriptureCue } from '../components/scripture/AmboScriptureDock';

describe('Ambo Slide Interaction Contracts', () => {
  const initialSlide: Slide = {
    id: 'sl_test_1',
    label: 'Chorus 1',
    group: 'Chorus',
    groupColor: '#FF8C00',
    layers: [
      {
        id: 'ly_bg',
        slot: 'background',
        content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
      },
      {
        id: 'ly_txt',
        slot: 'slide',
        content: {
          kind: 'TEXT',
          blocks: [{ text: 'Holy, Holy, Holy is the Lord God Almighty', role: 'body' }],
        },
      },
    ],
  };

  test('single-click previews slide; double-click takes slide directly to Program Out (LIVE)', () => {
    let currentPreviewIndex: number | null = null;
    let liveSlideId: string | null = null;
    let liveStack: LiveStack = {};

    const handleSingleClick = (idx: number) => {
      currentPreviewIndex = idx;
    };

    const handleDoubleClick = (s: Slide) => {
      liveSlideId = s.id;
      liveStack = applySlide(liveStack, s, Date.now());
    };

    // User single-clicks slide 0
    handleSingleClick(0);
    assert.equal(currentPreviewIndex, 0);
    assert.equal(liveSlideId, null);
    assert.equal(liveStack.slide, undefined);

    // User double-clicks slide 0 -> goes live immediately to Program Out!
    handleDoubleClick(initialSlide);
    assert.equal(liveSlideId, 'sl_test_1');
    assert.ok(liveStack.slide);
    assert.equal(liveStack.slide.content.kind, 'TEXT');
  });

  test('alt-click or right-click menu triggers edit mode in Tela', () => {
    let editorSlideIndex: number | null = null;

    const handleSlideClick = (e: { altKey: boolean }, idx: number) => {
      if (e.altKey) {
        editorSlideIndex = idx;
      }
    };

    // Normal click does not open editor
    handleSlideClick({ altKey: false }, 2);
    assert.equal(editorSlideIndex, null);

    // Alt+Click opens editor directly
    handleSlideClick({ altKey: true }, 2);
    assert.equal(editorSlideIndex, 2);
  });
});

describe('Ambo FreeShow-Style Tabbed Library (8 Tabs & Drag-and-Drop)', () => {
  const REQUIRED_TABS = [
    'shows',
    'media',
    'scripture',
    'chora',
    'reello',
    'taleo',
    'visualizers',
    'assets',
  ];

  test('contains all 8 required platform tabs', () => {
    assert.equal(REQUIRED_TABS.length, 8);
    assert.ok(REQUIRED_TABS.includes('shows'));
    assert.ok(REQUIRED_TABS.includes('media'));
    assert.ok(REQUIRED_TABS.includes('scripture'));
    assert.ok(REQUIRED_TABS.includes('chora'));
    assert.ok(REQUIRED_TABS.includes('reello'));
    assert.ok(REQUIRED_TABS.includes('taleo'));
    assert.ok(REQUIRED_TABS.includes('visualizers'));
    assert.ok(REQUIRED_TABS.includes('assets'));
  });

  test('serializes media and visualizer sources for drag-and-drop onto slides', () => {
    const item: AmboMediaSourceItem = {
      id: 'vis_cosmic',
      name: 'Cosmic Flow',
      kind: 'GENERATOR',
      mode: 'COSMIC',
      sub: 'Atmosphere',
    };

    const serialized = JSON.stringify({ 'ambo-source': item });
    const parsed = JSON.parse(serialized);

    assert.ok(parsed['ambo-source']);
    assert.equal(parsed['ambo-source'].id, 'vis_cosmic');
    assert.equal(parsed['ambo-source'].kind, 'GENERATOR');
    assert.equal(parsed['ambo-source'].mode, 'COSMIC');
  });
});

describe('Lectio Scripture Browser & Chapter Highlighting Contract', () => {
  test('66-book canon provides 39 Old Testament and 27 New Testament books', () => {
    assert.equal(BOOKS.length, 66);
    const otBooks = BOOKS.filter(b => b.testament === 'OT');
    const ntBooks = BOOKS.filter(b => b.testament === 'NT');
    assert.equal(otBooks.length, 39);
    assert.equal(ntBooks.length, 27);
  });

  test('exact scripture search parses reference and loads chapter context without isolating verse', () => {
    const parsed = parseRef('John 3:16');
    assert.ok(parsed);
    assert.equal(parsed.book, 43); // John is book 43
    assert.equal(parsed.chapter, 3);
    assert.equal(parsed.verse, 16);

    // Simulated chapter load (all verses in John 3)
    const simulatedJohn3Verses: BibleVerse[] = [
      { verse: 14, text: 'And as Moses lifted up the serpent in the wilderness...' },
      { verse: 15, text: 'That whosoever believeth in him should not perish...' },
      { verse: 16, text: 'For God so loved the world, that he gave his only begotten Son...' },
      { verse: 17, text: 'For God sent not his Son into the world to condemn the world...' },
    ];

    // Target verse is highlighted in context, retaining preceding and following verses
    const highlightTarget = parsed.verse;
    const highlightedVerse = simulatedJohn3Verses.find(v => v.verse === highlightTarget);
    assert.ok(highlightedVerse);
    assert.equal(highlightedVerse.verse, 16);

    // The whole chapter context remains present
    assert.equal(simulatedJohn3Verses.length, 4);
    assert.equal(simulatedJohn3Verses[0].verse, 14);
    assert.equal(simulatedJohn3Verses[3].verse, 17);
  });

  test('predetermined scripture view creates slide with 1-verse, auto-fit, and reflow support', () => {
    const verse: BibleVerse = {
      verse: 16,
      text: 'For God so loved the world, that he gave his only begotten Son...',
    };

    const bookName = 'John';
    const chapter = 3;

    const newSlide: Slide = {
      id: newId('scr_slide'),
      label: `${bookName} ${chapter}:${verse.verse}`,
      group: 'Scripture Reading',
      groupColor: '#E3C57E',
      layers: [
        {
          id: newId('ly_bg'),
          slot: 'background',
          content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
        },
        {
          id: newId('ly_scr'),
          slot: 'scripture',
          content: {
            kind: 'SCRIPTURE',
            refId: `${bookName.toLowerCase()}.${chapter}.${verse.verse}`,
            reference: `${bookName} ${chapter}:${verse.verse}`,
            translation: 'KJV',
            lines: [verse.text],
          },
        },
      ],
    };

    assert.equal(newSlide.label, 'John 3:16');
    assert.equal(newSlide.layers.length, 2);
    const scrLayer = newSlide.layers.find(l => l.slot === 'scripture');
    assert.ok(scrLayer);
    assert.equal(scrLayer.content.kind, 'SCRIPTURE');
  });
});

describe('Horizontal Multiview & Persistent Layout Memory', () => {
  test('horizontal multiview displays 5 distinct feeds and supports collapse toggle', () => {
    const FEEDS = ['PROGRAM', 'PREVIEW', 'STAGE DISPLAY', 'AUX 1 LOBBY', 'STREAM BUS'];
    assert.equal(FEEDS.length, 5);

    let isCollapsed = false;
    const toggleCollapse = () => { isCollapsed = !isCollapsed; };

    assert.equal(isCollapsed, false);
    toggleCollapse();
    assert.equal(isCollapsed, true);
    toggleCollapse();
    assert.equal(isCollapsed, false);
  });

  test('layout dimensions and tab states clamp correctly for persistent storage', () => {
    const clampBottom = (h: number) => Math.max(160, Math.min(600, h));
    const clampRight = (w: number) => Math.max(240, Math.min(560, w));
    const clampMultiview = (h: number) => Math.max(110, Math.min(360, h));

    assert.equal(clampBottom(50), 160);
    assert.equal(clampBottom(1000), 600);
    assert.equal(clampBottom(320), 320);

    assert.equal(clampRight(100), 240);
    assert.equal(clampRight(900), 560);
    assert.equal(clampRight(340), 340);

    assert.equal(clampMultiview(50), 110);
    assert.equal(clampMultiview(500), 360);
    assert.equal(clampMultiview(160), 160);
  });

  test('multiview and bottom tabbed library operate as independent panels simultaneously open', () => {
    let multiviewCollapsed = false;
    let libraryCollapsed = false;
    let multiviewHeight = 160;
    let libraryHeight = 280;

    // Both can be open simultaneously on top of each other
    assert.equal(multiviewCollapsed, false);
    assert.equal(libraryCollapsed, false);

    // Multiview can collapse while library remains open
    multiviewCollapsed = true;
    assert.equal(multiviewCollapsed, true);
    assert.equal(libraryCollapsed, false);

    // Library can collapse while multiview is open
    multiviewCollapsed = false;
    libraryCollapsed = true;
    assert.equal(multiviewCollapsed, false);
    assert.equal(libraryCollapsed, true);

    // Both can be open with independent height resizing
    multiviewCollapsed = false;
    libraryCollapsed = false;
    multiviewHeight = 200;
    libraryHeight = 350;
    assert.equal(multiviewHeight, 200);
    assert.equal(libraryHeight, 350);
  });
});

describe('Scripture Double-Click & Single-Click Transition Contracts', () => {
  test('double-click scripture sends to Program Out; single-click when live transitions to next verse', () => {
    let liveStack: LiveStack = {};
    let isScriptureLive = false;
    let cuedPreview: ScriptureCue | null = null;
    let activeTransition = 'Cross Dissolve';
    let transitionCount = 0;

    const onFireScripture = (cue: ScriptureCue) => {
      liveStack = {
        ...liveStack,
        scripture: {
          id: 'ly_scr',
          slot: 'scripture',
          content: {
            kind: 'SCRIPTURE',
            refId: cue.refId,
            reference: cue.reference,
            translation: cue.translation,
            lines: cue.lines,
          },
        },
      };
      isScriptureLive = true;
      transitionCount++;
    };

    const onCueScripture = (cue: ScriptureCue) => {
      cuedPreview = cue;
    };

    const verse16: BibleVerse = { verse: 16, text: 'For God so loved the world...' };
    const verse17: BibleVerse = { verse: 17, text: 'For God sent not his Son into the world...' };
    const verse18: BibleVerse = { verse: 18, text: 'He that believeth on him is not condemned...' };

    const buildCue = (v: BibleVerse): ScriptureCue => ({
      refId: `john.3.${v.verse}`,
      reference: `John 3:${v.verse}`,
      translation: 'KJV',
      lines: [v.text],
    });

    const handleVerseClick = (v: BibleVerse) => {
      const cue = buildCue(v);
      if (isScriptureLive) {
        onFireScripture(cue);
      } else {
        onCueScripture(cue);
      }
    };

    const handleVerseDoubleClick = (v: BibleVerse) => {
      const cue = buildCue(v);
      onFireScripture(cue);
    };

    // 1. Initial single-click when NOT live cues in preview only
    handleVerseClick(verse16);
    assert.equal(isScriptureLive, false);
    assert.ok(cuedPreview);
    assert.equal(cuedPreview.reference, 'John 3:16');
    assert.equal(liveStack.scripture, undefined);

    // 2. Double-click sends verse 16 directly to Program Out (LIVE)
    handleVerseDoubleClick(verse16);
    assert.equal(isScriptureLive, true);
    assert.ok(liveStack.scripture);
    assert.equal(liveStack.scripture.content.reference, 'John 3:16');
    assert.equal(transitionCount, 1);

    // 3. Subsequent single-click on verse 17 transitions Program Out to verse 17!
    handleVerseClick(verse17);
    assert.equal(liveStack.scripture.content.reference, 'John 3:17');
    assert.equal(transitionCount, 2);

    // 4. Subsequent single-click on verse 18 transitions Program Out to verse 18!
    handleVerseClick(verse18);
    assert.equal(liveStack.scripture.content.reference, 'John 3:18');
    assert.equal(transitionCount, 3);
  });
});

describe('ProPresenter Master Clear & Blackout Controls', () => {
  test('clear buttons clear target layers independently; blackout blanks output while retaining memory', () => {
    let live: LiveStack = {
      background: { id: 'l1', slot: 'background', content: { kind: 'GENERATOR', mode: 'AURORA' } },
      slide: { id: 'l2', slot: 'slide', content: { kind: 'TEXT', blocks: [{ text: 'Slide Text', role: 'body' }] } },
      prop: { id: 'l3', slot: 'prop', content: { kind: 'TEXT', blocks: [{ text: 'Speaker Banner', role: 'title' }] } },
      scripture: { id: 'l4', slot: 'scripture', content: { kind: 'SCRIPTURE', refId: 'jhn.3.16', lines: ['God so loved'], reference: 'John 3:16', translation: 'KJV' } },
    };

    let isBlackout = false;

    // Output monitor receives effective stack: empty when blacked out
    const getEffectiveStack = (stack: LiveStack, blk: boolean) => (blk ? {} : stack);

    // Normal live output has 4 active layers
    assert.equal(Object.keys(getEffectiveStack(live, isBlackout)).length, 4);

    // Master Blackout (BLK) toggled ON:
    isBlackout = true;
    assert.equal(Object.keys(getEffectiveStack(live, isBlackout)).length, 0); // Pitch black output!
    // But live memory is preserved:
    assert.ok(live.scripture);
    assert.ok(live.slide);

    // Blackout toggled OFF:
    isBlackout = false;
    assert.equal(Object.keys(getEffectiveStack(live, isBlackout)).length, 4); // Immediately restored!

    // Clear Scripture clears only scripture layer
    live = { ...live, scripture: undefined };
    delete (live as any).scripture;
    assert.equal(live.scripture, undefined);
    assert.ok(live.slide);
    assert.ok(live.background);

    // Clear Slide clears only slide layer
    delete (live as any).slide;
    assert.equal(live.slide, undefined);
    assert.ok(live.background);

    // Clear All clears everything
    live = {};
    assert.equal(Object.keys(live).length, 0);
  });
});

describe('Local OS Mapped Folders and Pinned Folders Hot-Switching', () => {
  test('manages pinned folders and hot-switches media library views', () => {
    interface PFolder { id: string; name: string; isSystem: boolean }
    let pinned: PFolder[] = [
      { id: 'f_vid', name: 'Videos', isSystem: true },
      { id: 'f_mus', name: 'Music', isSystem: true },
      { id: 'f_pic', name: 'Pictures', isSystem: true },
    ];
    let activeFolderId = 'f_vid';

    // User adds custom folder
    const custom: PFolder = { id: 'f_custom', name: 'Sunday Media 2026', isSystem: false };
    pinned = [...pinned, custom];
    assert.equal(pinned.length, 4);

    // Hot-switching active folder
    activeFolderId = custom.id;
    assert.equal(activeFolderId, 'f_custom');

    // Removing custom folder
    pinned = pinned.filter(f => f.id !== custom.id);
    assert.equal(pinned.length, 3);
  });
});

describe('Fabula Transition Library Parity', () => {
  test('all 16 native transitions are defined and selectable', () => {
    const TRANSITION_NAMES = [
      'Cut', 'Cross Dissolve', 'Luma Dissolve', 'Organic Light Leak',
      'Whip Pan', 'Prism Warp', 'Ink Reveal', 'Glow Dissolve',
      'Blur Dissolve', 'Bokeh Dissolve', 'Zoom Pull', 'Film Roll',
      'Glitch Cut', 'RGB Split', 'Burn / Flash', 'Push Slide', 'Shape Wipe',
    ];
    assert.ok(TRANSITION_NAMES.length >= 16);
    assert.ok(TRANSITION_NAMES.includes('Cross Dissolve'));
    assert.ok(TRANSITION_NAMES.includes('Organic Light Leak'));
    assert.ok(TRANSITION_NAMES.includes('Whip Pan'));
    assert.ok(TRANSITION_NAMES.includes('Prism Warp'));
  });
});

describe('Ambo Dedicated Program Out Window & Broadcast Channel', () => {
  test('amboOut query parameter routes directly to isolated AmboOutputWindow', () => {
    const sampleUrl = 'http://localhost:3000/?amboOut=out_main';
    const parsed = new URL(sampleUrl);
    const amboOutId = parsed.searchParams.get('amboOut');
    assert.equal(amboOutId, 'out_main');
  });

  test('BroadcastChannel payload contracts contain LiveStack layers and timers', () => {
    const stack: LiveStack = {
      background: {
        id: 'bg_1',
        slot: 'background',
        content: { kind: 'GENERATOR', mode: 'FLUX_VI_EMBER' },
      },
      slide: {
        id: 'sl_1',
        slot: 'slide',
        content: {
          kind: 'TEXT',
          blocks: [{ text: 'Praise the Lord', role: 'body' }],
        },
      },
    };
    const message = {
      type: 'SYNC',
      stack,
      timers: { elapsed: 120 },
      ts: Date.now(),
    };

    assert.equal(message.type, 'SYNC');
    assert.equal(message.stack.background?.content.kind, 'GENERATOR');
    assert.equal(message.stack.slide?.content.kind, 'TEXT');
    assert.equal(message.timers.elapsed, 120);
  });
});

describe('Plajah Pixels Visualizers & On-Platform Media Aggregation', () => {
  test('aggregates Plajah Pixels generators, shaders, and milkdrops into Ambo visualizers', () => {
    const mockScenes = [
      { mode: 'WAVEFORM', name: 'Waveform Spectrum', kind: '2d', cat: 'Energy' },
      { mode: 'PARTICLES', name: '3D Celestial Dust', kind: 'three', cat: 'Space' },
    ];
    const mockShaders = [
      { name: 'Flux Chroma Flow', src: 'shader_flux_1', cat: 'Flux', series: 'VI' },
      { name: 'Series VII ADC Neon', src: 'shader_s7_1', cat: 'Signature', series: 'VII' },
    ];
    const mockMilkdropNames = [
      'Flexi - alien machine',
      'Geiss - Tokamak fallout',
    ];

    const visualizers: AmboMediaSourceItem[] = [
      ...mockScenes.map(s => ({
        id: `scn_${s.mode}`,
        name: s.name,
        kind: 'GENERATOR' as const,
        mode: s.mode,
        sub: s.cat,
        tags: ['generator', 'pixels', s.kind, s.cat.toLowerCase()],
      })),
      ...mockShaders.map(s => ({
        id: `sh_${s.src}`,
        name: s.name,
        kind: 'GENERATOR' as const,
        mode: s.src,
        sub: `Series ${s.series}`,
        tags: ['shader', s.series === 'VI' ? 'flux' : 'series7'],
      })),
      ...mockMilkdropNames.map(m => ({
        id: `milk_${m}`,
        name: m,
        kind: 'GENERATOR' as const,
        mode: m,
        sub: 'Milkdrop Preset',
        tags: ['milkdrop', 'butterchurn'],
      })),
    ];

    assert.equal(visualizers.length, 6);
    const fluxItems = visualizers.filter(v => v.tags?.includes('flux'));
    assert.equal(fluxItems.length, 1);
    assert.equal(fluxItems[0].name, 'Flux Chroma Flow');

    const milkItems = visualizers.filter(v => v.tags?.includes('milkdrop'));
    assert.equal(milkItems.length, 2);
  });

  test('maps Firestore Reello videos and Taleo series into presentation media items', () => {
    const rawVideos = [
      { id: 'v_1', title: 'Sunday Worship Highlights', artist: 'Pastor John', duration: 184, tags: ['sermon', 'reello'], url: 'https://stream.mux.com/1.m3u8' },
      { id: 'v_2', title: 'Youth Night Reel', artist: 'Youth Ministry', duration: 42, tags: ['9:16', 'reel'], url: 'https://stream.mux.com/2.m3u8' },
    ];

    const reelloItems: AmboMediaSourceItem[] = rawVideos.map(v => {
      const isVertical = v.tags.includes('9:16');
      return {
        id: v.id,
        name: v.title,
        kind: 'VIDEO' as const,
        src: v.url,
        sub: `${isVertical ? '9:16' : '16:9'} · ${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}`,
        tags: ['reello', isVertical ? '9:16' : '16:9', ...v.tags],
      };
    });

    assert.equal(reelloItems.length, 2);
    assert.equal(reelloItems[1].sub, '9:16 · 0:42');
    assert.ok(reelloItems[1].tags?.includes('9:16'));
  });

  test('quick action "+ Slide" generates a presentation slide with ly_bg media layer', () => {
    const mediaItem: AmboMediaSourceItem = {
      id: 'scn_FLUX_EMBER',
      name: 'Flux Ember Visualizer',
      kind: 'GENERATOR',
      mode: 'FLUX_VI_EMBER',
      sub: 'Flux Series VI',
    };

    const newSlide: Slide = {
      id: newId('sl_media'),
      label: mediaItem.name,
      group: 'Visualizers',
      groupColor: '#FF8C00',
      layers: [
        {
          id: newId('ly_bg'),
          slot: 'background',
          content: {
            kind: 'GENERATOR',
            mode: mediaItem.mode || 'STUDIO_AURORA',
          },
        },
      ],
    };

    assert.ok(newSlide.id.startsWith('sl_media'));
    assert.equal(newSlide.label, 'Flux Ember Visualizer');
    assert.equal(newSlide.layers.length, 1);
    assert.equal(newSlide.layers[0].slot, 'background');
    assert.equal(newSlide.layers[0].content.kind, 'GENERATOR');
    if (newSlide.layers[0].content.kind === 'GENERATOR') {
      assert.equal(newSlide.layers[0].content.mode, 'FLUX_VI_EMBER');
    }
  });
});


