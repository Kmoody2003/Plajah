import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTextTokens, formatTimecode, textOverlayCacheKey, rasterizeTextOverlay, TextOverlayCache } from '../services/fabula/textOverlay';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';

const at = (localT: number, fps = 24) => ({ localT, fps });

describe('Timecode formatting', () => {
  it('counts non-drop HH:MM:SS:FF at the clip rate', () => {
    assert.equal(formatTimecode(0, 24), '00:00:00:00');
    assert.equal(formatTimecode(23, 24), '00:00:00:23');
    assert.equal(formatTimecode(24, 24), '00:00:01:00');
    assert.equal(formatTimecode(24 * 60, 24), '00:01:00:00');
    assert.equal(formatTimecode(24 * 3600, 24), '01:00:00:00');
  });

  it('clamps a negative frame and survives a zero rate', () => {
    assert.equal(formatTimecode(-5, 24), '00:00:00:00');
    assert.equal(formatTimecode(30, 0), '00:00:01:06');    // a zero rate falls back to 24fps
  });
});

describe('Text token resolution', () => {
  it('advances timecode, frame and seconds with clip-local time', () => {
    const spec = { text: '{tc} f{frame} {sec}s' };
    assert.equal(resolveTextTokens(spec, at(0)), '00:00:00:00 f0 0.0s');
    assert.equal(resolveTextTokens(spec, at(1)), '00:00:01:00 f24 1.0s');
    assert.equal(resolveTextTokens(spec, at(2.5)), '00:00:02:12 f60 2.5s');
  });

  it('offsets timecode by the spec start frame, so a reel can begin at 01:00:00:00', () => {
    assert.equal(resolveTextTokens({ text: '{tc}', startFrame: 24 * 3600 }, at(0)), '01:00:00:00');
    assert.equal(resolveTextTokens({ text: '{tc}', startFrame: 24 * 3600 }, at(2)), '01:00:02:00');
  });

  it('counts by whole seconds, with start/step/pad', () => {
    assert.equal(resolveTextTokens({ text: '{count}' }, at(0)), '0');
    assert.equal(resolveTextTokens({ text: '{count}' }, at(3.9)), '3');
    assert.equal(resolveTextTokens({ text: '{count:100,-5,4}' }, at(2)), '0090');
    assert.equal(resolveTextTokens({ text: '{count:1,1,3}' }, at(5)), '006');
  });

  it('leaves unknown tokens and unpinned clock tokens verbatim rather than eating the text', () => {
    assert.equal(resolveTextTokens({ text: 'A {nope} B' }, at(1)), 'A {nope} B');
    assert.equal(resolveTextTokens({ text: '{date} {clock}' }, at(1)), '{date} {clock}');
  });

  it('resolves the clock from the pinned origin, never the wall clock', () => {
    const epochMs = Date.UTC(2026, 0, 2, 3, 4, 5) + new Date(Date.UTC(2026, 0, 2, 3, 4, 5)).getTimezoneOffset() * 60000;
    const spec = { text: '{date} {clock}', epochMs };
    const first = resolveTextTokens(spec, at(0));
    assert.equal(first, '2026-01-02 03:04:05');
    assert.equal(resolveTextTokens(spec, at(10)), '2026-01-02 03:04:15');
    // Determinism is the whole point: the same frame must resolve identically every time.
    assert.equal(resolveTextTokens(spec, at(0)), first);
  });

  it('applies the case mode after substitution', () => {
    assert.equal(resolveTextTokens({ text: 'rec {tc}', caseMode: 'upper' }, at(0)), 'REC 00:00:00:00');
    assert.equal(resolveTextTokens({ text: 'REC', caseMode: 'lower' }, at(0)), 'rec');
  });
});

describe('Overlay cache key', () => {
  it('changes when the drawn string changes, and holds while it does not', () => {
    const spec = { text: '{count}' };
    assert.equal(textOverlayCacheKey(spec, at(0.1), 320, 180), textOverlayCacheKey(spec, at(0.9), 320, 180));
    assert.notEqual(textOverlayCacheKey(spec, at(0.1), 320, 180), textOverlayCacheKey(spec, at(1.1), 320, 180));
  });

  it('changes with the look and with the frame size', () => {
    const spec = { text: 'REC' };
    assert.notEqual(textOverlayCacheKey(spec, at(0), 320, 180), textOverlayCacheKey({ ...spec, color: '#f00' }, at(0), 320, 180));
    assert.notEqual(textOverlayCacheKey(spec, at(0), 320, 180), textOverlayCacheKey(spec, at(0), 640, 360));
  });
});

describe('Rasteriser outside the browser', () => {
  it('draws nothing without a document, and nothing for an empty string', () => {
    // Node has no canvas; the export path must degrade rather than throw.
    assert.equal(rasterizeTextOverlay({ text: 'REC' }, at(0), 320, 180), null);
    assert.equal(rasterizeTextOverlay({ text: '   ' }, at(0), 320, 180), null);
    assert.equal(new TextOverlayCache().resolve('i1', { text: 'REC' }, at(0), 320, 180), null);
  });
});

describe('Text effects declare a text aux slot', () => {
  it('every text-kind effect keeps the P0..P7 ABI and ships presets', () => {
    const text = FX_EFFECTS.filter((e) => e.auxInput?.kind === 'text');
    assert.ok(text.length >= 3, 'expected the text pack to be registered');
    for (const e of text) {
      assert.ok(e.params.length <= 8, `${e.id} exceeds the parameter ABI`);
      assert.ok((e.presets?.length ?? 0) >= 2, `${e.id} needs presets`);
      assert.match(e.glsl, /aux\s*\(/, `${e.id} declares a text input but never samples aux()`);
      assert.match(e.glsl, /vec4\s+fx\s*\(\s*vec2\s+uv\s*\)/, `${e.id} has no fx() entry point`);
    }
  });
});
