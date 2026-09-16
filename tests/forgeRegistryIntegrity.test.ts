import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FX_EFFECTS, FX_HEADER } from '../components/plajahPixels/engine/fx/effects';
import { PHASE3_TRANSITIONS, TX_HEADER } from '../components/plajahPixels/engine/fx/phase3Transitions';

/** Highest P-slot referenced by a shader body (-1 when it reads none). */
function highestSlot(glsl: string): number {
  let top = -1;
  for (const m of glsl.matchAll(/\bP([0-7])\b/g)) top = Math.max(top, Number(m[1]));
  return top;
}

describe('Forge registry integrity', () => {
  it('no effect shader reads a parameter slot it does not declare', () => {
    const bad: string[] = [];
    for (const e of FX_EFFECTS) {
      const passes = e.passes?.length ? e.passes : [{ id: 'main', glsl: e.glsl }];
      for (const p of passes) {
        const top = highestSlot(p.glsl);
        if (top >= e.params.length) bad.push(`${e.id}:${p.id} reads P${top} but declares ${e.params.length} params`);
      }
    }
    assert.deepEqual(bad, [], bad.join('\n'));
  });

  it('no transition shader reads a parameter slot it does not declare', () => {
    const bad: string[] = [];
    for (const t of PHASE3_TRANSITIONS) {
      const top = highestSlot(t.glsl);
      if (top >= t.params.length) bad.push(`${t.id} reads P${top} but declares ${t.params.length} params`);
    }
    assert.deepEqual(bad, [], bad.join('\n'));
  });

  it('every effect declares an fx() entry point and unique parameter keys', () => {
    for (const e of FX_EFFECTS) {
      const passes = e.passes?.length ? e.passes : [{ id: 'main', glsl: e.glsl }];
      for (const p of passes) assert.match(p.glsl, /vec4\s+fx\s*\(\s*vec2\s+uv\s*\)/, `${e.id}:${p.id} has no fx() entry point`);
      assert.equal(new Set(e.params.map(p => p.key)).size, e.params.length, `${e.id} has duplicate param keys`);
      assert.ok(e.params.length <= 8, `${e.id} declares ${e.params.length} params; the ABI carries 8`);
      for (const p of e.params) assert.ok(p.min < p.max, `${e.id}/${p.key} has an empty range`);
    }
  });

  it('keeps the persistent-state contract coherent', () => {
    // A state buffer is invisible by construction, so a mistake here shows up as an effect that
    // quietly does nothing rather than as a crash. Pin the shape instead.
    for (const e of FX_EFFECTS) {
      const passes = e.passes || [];
      const stateTargets = passes.filter((p) => p.target === 'state0' || p.target === 'state1');
      const declared = e.state ?? 0;

      if (declared) {
        assert.ok(declared >= 1 && declared <= 2, `${e.id} declares ${declared} state buffers; 1 or 2 are supported`);
        assert.ok(stateTargets.length > 0, `${e.id} declares state buffers but no pass writes one`);
        assert.ok(passes.some((p) => !p.target || p.target === 'out'), `${e.id} writes state but never draws anything visible`);
      }
      for (const p of stateTargets) {
        assert.ok(declared > 0, `${e.id}:${p.id} writes ${p.target} but the effect declares no state`);
        const index = p.target === 'state1' ? 1 : 0;
        assert.ok(index < declared, `${e.id}:${p.id} writes ${p.target} but only ${declared} buffer(s) are declared`);
      }
      // A state pass runs before the visible one; the reverse order reads a buffer written a
      // frame late, which looks like lag nobody can explain.
      if (declared && stateTargets.length) {
        const firstVisible = passes.findIndex((p) => !p.target || p.target === 'out');
        const lastState = passes.map((p, i) => ({ p, i })).filter(({ p }) => p.target && p.target !== 'out').pop()!.i;
        assert.ok(lastState < firstVisible, `${e.id} draws before its simulation pass has run`);
      }
    }
  });

  it('no shader body redefines a helper the shared header already provides', () => {
    // A duplicate definition compiles as a redefinition error on some drivers; catching it here
    // is cheaper than finding it on one machine's GPU.
    const helpers = ['rgb2hsv', 'hsv2rgb', 'inp', 'src', 'aux', 'prev', 'prevSrc', 'prevSrcN'];
    const clash: string[] = [];
    for (const e of FX_EFFECTS) {
      const passes = e.passes?.length ? e.passes : [{ id: 'main', glsl: e.glsl }];
      for (const p of passes) for (const h of helpers) {
        if (new RegExp(`\\b(vec[234]|float|int)\\s+${h}\\s*\\(`).test(p.glsl)) clash.push(`${e.id}:${p.id} redefines ${h}()`);
      }
    }
    assert.deepEqual(clash, [], clash.join('\n'));
    for (const h of ['rgb2hsv', 'hsv2rgb']) assert.ok(FX_HEADER.includes(h), `header lost ${h}`);
    for (const h of ['outg', 'inc', 'hsv2rgb']) assert.ok(TX_HEADER.includes(h), `transition header lost ${h}`);
  });
});
