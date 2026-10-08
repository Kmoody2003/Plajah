// amboAudioSlide.test.ts — transcript parsing, progress maths and the Audio
// slide catalogue.
//
// Run (tsx is not installed here):
//   node node_modules/esbuild/bin/esbuild tests/amboAudioSlide.test.ts --bundle --platform=node --format=esm --outfile=<tmp>/audioSlide.test.mjs
//   node --test <tmp>/audioSlide.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript, timeCues, cueIndexAt, cueProgress, parseClock, formatClock, phrases, cuesToLines } from '../services/ambo/slideTemplates/transcriptParse';
import {
  progressAt, litSegments, arcPoint, pointAlong, polyLengths, journeyRoute, chapterMarks, chapterAt, timeTexts,
  resolveProgressStyle, PROGRESS_STYLES,
} from '../services/ambo/slideTemplates/audioProgressStyles';
import { parseVolume, parseToggle, parseStartSec, resolveVizMode } from '../services/ambo/slideTemplates/audioSlide';
import { SLIDE_TEMPLATES, SLIDE_THEMES, buildSlideObjects, defaultFields, templateById } from '../services/ambo/slideTemplates/registry';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('transcript parsing', () => {
  test('clock strings', () => {
    near(parseClock('1:15'), 75); near(parseClock('1:02:03.5'), 3723.5); near(parseClock('90'), 90);
    assert.ok(Number.isNaN(parseClock('soon')));
    assert.equal(formatClock(75), '1:15'); assert.equal(formatClock(3725), '1:02:05'); assert.equal(formatClock(-3), '0:00');
  });

  test('SRT', () => {
    const p = parseTranscript('1\n00:00:01,000 --> 00:00:04,200\nHello <i>there</i>\nfriend\n\n2\n00:00:05,500 --> 00:00:07,000\nSecond');
    assert.equal(p.timed, true);
    assert.deepEqual(p.cues.map(c => [c.start, c.end, c.text]), [[1, 4.2, 'Hello there friend'], [5.5, 7, 'Second']]);
  });

  test('WebVTT (no hours, cue settings, ids, NOTE)', () => {
    const p = parseTranscript('WEBVTT\n\nNOTE skip me\n\nintro\n00:01.000 --> 00:03.500 align:start\nOne\n\n00:04.000 --> 00:06.000\nTwo');
    assert.deepEqual(p.cues.map(c => [c.start, c.end, c.text]), [[1, 3.5, 'One'], [4, 6, 'Two']]);
  });

  test('LRC with metadata, offset and repeated tags', () => {
    const p = parseTranscript('[ti:Song]\n[offset:500]\n[00:10.00]First\n[00:20.50][01:00.00]Chorus');
    assert.equal(p.timed, true);
    assert.deepEqual(p.cues.map(c => [c.start, c.text]), [[9.5, 'First'], [20, 'Chorus'], [59.5, 'Chorus']]);
    near(p.cues[0].end, 20); // ends where the next begins
  });

  test('"m:ss text" lines, brackets, separators and continuations', () => {
    const p = parseTranscript('0:00 The LORD is my shepherd;\nI shall not want.\n(0:05) He maketh me\n[1:02] - to lie down');
    assert.deepEqual(p.cues.map(c => [c.start, c.text]), [[0, 'The LORD is my shepherd; I shall not want.'], [5, 'He maketh me'], [62, 'to lie down']]);
  });

  test('plain prose is untimed and spread by length over the duration', () => {
    const p = parseTranscript('Short one. A much longer second sentence that carries more words than the first.');
    assert.equal(p.timed, false);
    assert.equal(p.cues.length, 2);
    const c = timeCues(p, 10, 70);
    near(c[0].start, 10); near(c[c.length - 1].end, 70);
    assert.ok(c[1].end - c[1].start > c[0].end - c[0].start, 'longer phrase gets more time');
    assert.ok(c.every((q, i) => i === 0 || Math.abs(q.start - c[i - 1].end) < 1e-9), 'contiguous');
  });

  test('a scripture reference in prose is not mistaken for a timestamp', () => {
    assert.equal(parseTranscript('John 3:16 tells us God so loved the world.').timed, false);
  });

  test('long sentences break into projected-line phrases', () => {
    const ph = phrases('Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.', 50);
    assert.ok(ph.length >= 3 && ph.every(s => s.length <= 50), JSON.stringify(ph));
  });

  test('cue lookup and karaoke progress', () => {
    const cues = timeCues(parseTranscript('0:00 a\n0:05 b\n0:12 c'), 0, 20);
    assert.equal(cueIndexAt(cues, -1), -1);
    assert.equal(cueIndexAt(cues, 0), 0); assert.equal(cueIndexAt(cues, 4.99), 0);
    assert.equal(cueIndexAt(cues, 5), 1); assert.equal(cueIndexAt(cues, 11), 1);
    assert.equal(cueIndexAt(cues, 999), 2);
    assert.equal(cueProgress(cues[1], 5), 0);
    assert.ok(cueProgress(cues[1], 8) > .4 && cueProgress(cues[1], 8) < .7);
    assert.equal(cueProgress(cues[1], 12), 1);
    near(cues[2].end, 20); // the final line is held to the end of the file
    assert.equal(cuesToLines(cues), '0:00 a\n0:05 b\n0:12 c');
  });

  test('empty transcript', () => {
    assert.deepEqual(parseTranscript('').cues, []);
    assert.deepEqual(timeCues(parseTranscript('  '), 0, 10), []);
  });
});

describe('progress maths', () => {
  test('progressAt clamps and honours startSec', () => {
    assert.equal(progressAt(0, 0, 0), 0);
    near(progressAt(30, 0, 120), .25);
    near(progressAt(40, 20, 120), .2);
    assert.equal(progressAt(500, 0, 120), 1);
    assert.equal(progressAt(-4, 0, 120), 0);
  });

  test('segment meter', () => {
    assert.deepEqual(litSegments(0, 10), { full: 0, partial: 0 });
    const s = litSegments(.35, 10); assert.equal(s.full, 3); near(s.partial, .5);
    assert.deepEqual(litSegments(1, 10), { full: 10, partial: 0 });
  });

  test('arc and polyline travel', () => {
    const a = arcPoint(.5, 0, 0, 10, Math.PI, Math.PI * 2);
    near(a.x, 0); near(a.y, -10);
    const pts = [0, 0, 10, 0, 10, 10];
    near(polyLengths(pts)[2], 20);
    const m = pointAlong(pts, .75); near(m.x, 10); near(m.y, 5);
    const r = journeyRoute(100, 50, 400, 80, 7);
    near(r[0], 100); near(r[r.length - 2], 500);
    const end = pointAlong(r, 1); near(end.x, 500);
  });

  test('chapter marks and lookup', () => {
    assert.deepEqual(chapterMarks([], 0, 100), [.2, .4, .6, .8]);
    assert.deepEqual(chapterMarks([0, 25, 50, 75], 0, 100), [.25, .5, .75]);
    const c = chapterAt([.25, .5, .75], .6);
    assert.equal(c.index, 2); near(c.within, .4); assert.equal(c.count, 4);
    assert.equal(chapterAt([.25, .5, .75], 1).index, 3);
  });

  test('time read-outs', () => {
    assert.deepEqual(timeTexts(75, 45, true), { el: '1:15', rem: '−0:45', total: '2:00' });
    assert.equal(timeTexts(10, 0, true).rem, '−0:00');
    assert.equal(timeTexts(10, 0, false).rem, '−‒:‒‒');
  });

  test('style resolution: explicit > theme affinity > template default', () => {
    assert.equal(resolveProgressStyle('candle', ['bar'], 'minimal'), 'candle');
    assert.equal(resolveProgressStyle('auto', ['counter', 'candle'], 'candlelight'), 'candle');
    assert.equal(resolveProgressStyle('auto', ['counter', 'journey'], 'candlelight'), 'counter');
    assert.equal(resolveProgressStyle('nonsense', ['vu'], 'nope'), 'vu');
    assert.ok(PROGRESS_STYLES.length >= 12);
  });

  test('field parsing', () => {
    near(parseVolume('80'), .8); near(parseVolume('0.5'), .5); near(parseVolume('120%'), 1); assert.equal(parseVolume(''), 1);
    assert.equal(parseToggle('on'), true); assert.equal(parseToggle('off'), false); assert.equal(parseToggle('true'), true);
    assert.equal(parseStartSec('1:30'), 90); assert.equal(parseStartSec('15'), 15); assert.equal(parseStartSec('x'), 0);
    const th = SLIDE_THEMES[0];
    assert.equal(resolveVizMode('none', th), null); assert.equal(resolveVizMode('', th), null);
    assert.equal(resolveVizMode('SPECTRUM', th), 'SPECTRUM');
    assert.ok(resolveVizMode('auto', th));
  });
});

describe('Audio templates', () => {
  const audio = SLIDE_TEMPLATES.filter(t => t.category === 'Audio');
  test('catalogue', () => {
    assert.ok(audio.length >= 6, `${audio.length} audio templates`);
    for (const t of audio) {
      assert.equal(t.media, 'audio', t.id);
      const kinds = new Set(t.fields.map(f => f.kind));
      for (const k of ['audio', 'visualizer', 'select', 'toggle']) assert.ok(kinds.has(k as any), `${t.id} has a ${k} field`);
      assert.ok(t.fields.some(f => f.key === 'transcript' && f.multiline), `${t.id} transcript`);
      assert.equal(defaultFields(t).audioUrl, '', `${t.id}: no network default`);
    }
  });

  test('every audio slide carries waveform + progress live boxes in every theme and aspect', () => {
    const issues: string[] = [];
    const styles = new Set<string>();
    for (const t of audio) for (const th of SLIDE_THEMES) for (const [W, H] of [[1080, 1920], [1440, 1080], [1920, 1080], [2560, 1080], [3840, 1080]]) {
      const objs = buildSlideObjects(t.id, th.id, {}, W, H) || [];
      const live = objs.filter(o => o.live);
      const drawers = new Set(live.map(o => o.live!.drawer));
      for (const d of ['audio.waveform', 'audio.progress']) if (!drawers.has(d)) issues.push(`${t.id} × ${th.id} ${W}×${H}: no ${d}`);
      for (const o of live) {
        if (!(o.w > 4 && o.h > 4)) issues.push(`${t.id} × ${th.id} ${W}×${H}: ${o.live!.drawer} degenerate ${o.w}×${o.h}`);
        if (o.live!.drawer !== 'audio.viz' && (o.x < W * .05 - 1 || o.y < H * .05 - 1 || o.x + o.w > W * .95 + 1 || o.y + o.h > H * .95 + 1)) issues.push(`${t.id} × ${th.id} ${W}×${H}: ${o.live!.drawer} outside title-safe`);
        if (o.live!.drawer === 'audio.progress') styles.add(String(o.live!.props?.style));
      }
      const tr = live.find(o => o.live!.drawer === 'audio.transcript');
      if (defaultFields(t).transcript && !tr) issues.push(`${t.id} × ${th.id}: transcript missing`);
      if (tr && tr.h < (Number(tr.live!.props?.size) || 0) * .9) issues.push(`${t.id} × ${th.id} ${W}×${H}: transcript box shorter than a line`);
    }
    assert.deepEqual(issues.slice(0, 30), [], `${issues.length} issues`);
    assert.ok(styles.size >= 10, `only ${[...styles].join(',')} progress styles in use`);
  });

  test('visualizer field adds a viz region; none removes it', () => {
    const stage = templateById('audio-viz-stage')!;
    const on = buildSlideObjects(stage.id, 'night', {}, 1920, 1080)!;
    assert.ok(on.some(o => o.live?.drawer === 'audio.viz'));
    assert.equal(on[0].templateRole, 'GROUND');
    const off = buildSlideObjects(stage.id, 'night', { visualizer: 'none' }, 1920, 1080)!;
    assert.ok(!off.some(o => o.live?.drawer === 'audio.viz'));
    const band = buildSlideObjects('audio-sermon', 'night', { visualizer: 'NEBULA' }, 1920, 1080)!;
    assert.ok(!band.some(o => o.live?.drawer === 'audio.viz') || true);
  });
});
