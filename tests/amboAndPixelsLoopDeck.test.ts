// tests/amboAndPixelsLoopDeck.test.ts — Unit tests for LoopDeck & Watch Folder features in Ambo and Pixels.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  filesToMediaItems,
  selectRandomItem,
  selectSequentialItem,
  LoopTracker,
  classifyFileKind,
} from '../services/mediaEngine/watchFolderLoopService';
import {
  createWatchFolderShow,
  mergeWatchFolderShow,
  getNextLoopDeckSlide,
} from '../services/ambo/amboLoopDeckService';
import { type Slide } from '../services/ambo/showModel';

describe('watchFolderLoopService — Media Classification & Selection', () => {
  test('correctly classifies video, image, and audio files', () => {
    assert.equal(classifyFileKind('intro_loop.mp4'), 'VIDEO');
    assert.equal(classifyFileKind('motion_bg.mov'), 'VIDEO');
    assert.equal(classifyFileKind('abstract_loop.webm'), 'VIDEO');
    assert.equal(classifyFileKind('backdrop.jpg'), 'IMAGE');
    assert.equal(classifyFileKind('slide_art.png'), 'IMAGE');
    assert.equal(classifyFileKind('theme_song.mp3'), 'AUDIO');
  });

  test('selectSequentialItem advances sequentially and wraps around', () => {
    const items = ['clip1', 'clip2', 'clip3'];
    const first = selectSequentialItem(items, 0);
    assert.equal(first?.item, 'clip2');
    assert.equal(first?.index, 1);

    const second = selectSequentialItem(items, 1);
    assert.equal(second?.item, 'clip3');
    assert.equal(second?.index, 2);

    const wrap = selectSequentialItem(items, 2);
    assert.equal(wrap?.item, 'clip1');
    assert.equal(wrap?.index, 0);
  });

  test('selectRandomItem selects random items avoiding current item if multiple exist', () => {
    const items = [
      { id: '1', name: 'clipA' },
      { id: '2', name: 'clipB' },
      { id: '3', name: 'clipC' },
    ];

    for (let i = 0; i < 20; i++) {
      const pick = selectRandomItem(items, items[0], it => it.id);
      assert.ok(pick);
      assert.notEqual(pick.item.id, '1', 'Random selection should not immediately repeat the current item');
    }
  });

  test('selectRandomItem works cleanly with 1 item', () => {
    const items = [{ id: 'solo', name: 'onlyClip' }];
    const pick = selectRandomItem(items, items[0], it => it.id);
    assert.equal(pick?.item.id, 'solo');
    assert.equal(pick?.index, 0);
  });
});

describe('LoopTracker — Loop Iteration Counting', () => {
  test('advances only after targetLoops iterations are reached', () => {
    let advances = 0;
    let progressHistory: number[] = [];

    const tracker = new LoopTracker(3, () => {
      advances++;
    }, (curr, target) => {
      progressHistory.push(curr);
    });

    assert.equal(tracker.getTargetLoops(), 3);
    assert.equal(tracker.getCurrentLoops(), 0);

    // Loop 1
    const trig1 = tracker.recordLoop();
    assert.equal(trig1, false);
    assert.equal(tracker.getCurrentLoops(), 1);
    assert.equal(advances, 0);

    // Loop 2
    const trig2 = tracker.recordLoop();
    assert.equal(trig2, false);
    assert.equal(tracker.getCurrentLoops(), 2);
    assert.equal(advances, 0);

    // Loop 3 — target reached!
    const trig3 = tracker.recordLoop();
    assert.equal(trig3, true);
    assert.equal(tracker.getCurrentLoops(), 0, 'Resets count upon reaching target loops');
    assert.equal(advances, 1);
  });

  test('allows dynamically changing target loops and resetting', () => {
    let advances = 0;
    const tracker = new LoopTracker(2, () => { advances++; });

    tracker.recordLoop();
    assert.equal(tracker.getCurrentLoops(), 1);

    tracker.setTargetLoops(5);
    assert.equal(tracker.getTargetLoops(), 5);

    tracker.reset();
    assert.equal(tracker.getCurrentLoops(), 0);
  });
});

describe('amboLoopDeckService — Presentation Shows & Watch Folder', () => {
  test('createWatchFolderShow creates a valid presentation show with media slides', () => {
    const mockFiles = [
      { id: '1', name: 'loop_ambient.mp4', path: 'Loops/loop_ambient.mp4', kind: 'VIDEO' as const, url: 'blob:video1', size: 1024, lastModified: 100 },
      { id: '2', name: 'loop_neon.mp4', path: 'Loops/loop_neon.mp4', kind: 'VIDEO' as const, url: 'blob:video2', size: 2048, lastModified: 200 },
      { id: '3', name: 'still_worship.jpg', path: 'Loops/still_worship.jpg', kind: 'IMAGE' as const, url: 'blob:img3', size: 512, lastModified: 300 },
    ];

    const show = createWatchFolderShow('VJ_Loops', mockFiles, {
      loopCount: 3,
      selectionMode: 'random',
    });

    assert.equal(show.kind, 'MEDIA');
    assert.equal(show.title, 'Watch Folder: VJ_Loops');
    assert.equal(show.slides.length, 3);
    assert.equal(show.slides[0].label, 'loop_ambient');
    assert.equal(show.slides[0].layers[0].slot, 'background');
    assert.equal(show.slides[0].layers[0].content.kind, 'VIDEO');
    assert.equal(show.slides[2].layers[0].content.kind, 'IMAGE');
    assert.equal(show.loopDeck?.enabled, true);
    assert.equal(show.loopDeck?.loopCount, 3);
    assert.equal(show.loopDeck?.selectionMode, 'random');
  });

  test('mergeWatchFolderShow adds new files without disrupting existing slides', () => {
    const initialFiles = [
      { id: '1', name: 'clipA.mp4', path: 'clipA.mp4', kind: 'VIDEO' as const, url: 'blob:1', size: 100, lastModified: 1 },
    ];
    const show = createWatchFolderShow('LiveDeck', initialFiles);
    assert.equal(show.slides.length, 1);

    const updatedFiles = [
      { id: '1', name: 'clipA.mp4', path: 'clipA.mp4', kind: 'VIDEO' as const, url: 'blob:1', size: 100, lastModified: 1 },
      { id: '2', name: 'clipB.mp4', path: 'clipB.mp4', kind: 'VIDEO' as const, url: 'blob:2', size: 200, lastModified: 2 },
    ];

    const merged = mergeWatchFolderShow(show, updatedFiles);
    assert.equal(merged.slides.length, 2);
    assert.equal(merged.slides[0].label, 'clipA');
    assert.equal(merged.slides[1].label, 'clipB');
  });

  test('getNextLoopDeckSlide respects random vs sequential selection modes', () => {
    const slides: Slide[] = [
      { id: 's1', label: 'Slide 1', layers: [] },
      { id: 's2', label: 'Slide 2', layers: [] },
      { id: 's3', label: 'Slide 3', layers: [] },
    ];

    // Sequential mode
    const nextSeq = getNextLoopDeckSlide(slides, 's1', 'sequential');
    assert.equal(nextSeq?.slide.id, 's2');

    const nextWrap = getNextLoopDeckSlide(slides, 's3', 'sequential');
    assert.equal(nextWrap?.slide.id, 's1');

    // Random mode: runs multiple trials ensuring it avoids immediate repeat
    for (let i = 0; i < 20; i++) {
      const nextRnd = getNextLoopDeckSlide(slides, 's2', 'random');
      assert.ok(nextRnd);
      assert.notEqual(nextRnd.slide.id, 's2', 'Random mode should not immediately select current slide');
    }
  });
});
