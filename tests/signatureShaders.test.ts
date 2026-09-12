import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SIGNATURE_WORKS, SIGNATURE_SETS, SIGNATURE_KIT, SIGNATURE_KIT_3D, signatureSource } from '../components/plajahPixels/engine/presets/signatureShaders';

const BACKSLASH = String.fromCharCode(92);

describe('Signature registry integrity', () => {
  it('keeps work ids unique, because a project file persists them', () => {
    // A duplicate is not cosmetic: every lookup is a find() that returns the FIRST match, so the
    // later work becomes unreachable and a saved reference is ambiguous. Series II and Series VI
    // both shipped a 'rose-window' before this was pinned.
    const ids = SIGNATURE_WORKS.map((w) => w.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual([...new Set(dupes)], [], `duplicate work ids: ${[...new Set(dupes)].join(', ')}`);
  });

  it('numbers the works contiguously from 1', () => {
    const ns = SIGNATURE_WORKS.map((w) => w.n).sort((a, b) => a - b);
    assert.equal(new Set(ns).size, ns.length, 'two works share a number');
    assert.equal(ns[0], 1);
    assert.equal(ns[ns.length - 1], ns.length, 'the numbering has a gap');
  });

  it('pairs every work with a declared set, and every set with works', () => {
    const setIds = new Set(SIGNATURE_SETS.map((s) => s.id));
    const orphanWorks = [...new Set(SIGNATURE_WORKS.filter((w) => !setIds.has(w.set)).map((w) => w.set))];
    assert.deepEqual(orphanWorks, [], `works reference sets that do not exist: ${orphanWorks.join(', ')}`);
    const emptySets = SIGNATURE_SETS.filter((s) => !SIGNATURE_WORKS.some((w) => w.set === s.id)).map((s) => s.id);
    assert.deepEqual(emptySets, [], `sets with no works: ${emptySets.join(', ')}`);
    assert.equal(new Set(SIGNATURE_SETS.map((s) => s.id)).size, SIGNATURE_SETS.length, 'duplicate set id');
  });

  it('never lets an escape survive into the shader body as literal characters', () => {
    // Twelve Series VI works shipped with the body written as "...\\n..." in TypeScript, which is
    // a backslash and an 'n' rather than a newline. GLSL reports `'\' : invalid character` and the
    // work silently fails to compile, so it renders nothing at all with no user-visible error.
    const bad = SIGNATURE_WORKS.filter((w) => w.body.includes(BACKSLASH)).map((w) => `${w.n} ${w.id}`);
    assert.deepEqual(bad, [], `bodies containing a literal backslash: ${bad.join(', ')}`);
  });

  it('gives every work a real Shadertoy entry point', () => {
    for (const w of SIGNATURE_WORKS) {
      assert.ok(w.body.length > 200, `${w.id} has a suspiciously short body`);
      assert.match(w.body, /void\s+mainImage\s*\(\s*out\s+vec4/, `${w.id} has no mainImage entry point`);
    }
  });

  it('makes every raymarching work define the map() the 3D kit calls', () => {
    // SIGNATURE_KIT_3D declares `vec2 map(vec3 p);` and calls it from raymarch/calcNormal, so a
    // kit3d work that does not define map() fails to link — and a 2D work cannot opt into the kit
    // just to reach a helper.
    for (const w of SIGNATURE_WORKS.filter((x) => x.kit3d)) {
      assert.match(w.body, /vec2\s+map\s*\(\s*vec3/, `${w.id} declares kit3d but defines no map()`);
    }
    for (const w of SIGNATURE_WORKS.filter((x) => !x.kit3d)) {
      assert.ok(!/vec2\s+map\s*\(\s*vec3/.test(w.body), `${w.id} defines map() but does not declare kit3d`);
    }
  });

  it('stays inside the four parameters the renderer uploads', () => {
    for (const w of SIGNATURE_WORKS) {
      assert.ok(w.params.length <= 4, `${w.id} declares ${w.params.length} params; the renderer uploads iParam0..3`);
      for (const p of w.params) assert.ok(p.def >= 0 && p.def <= 1, `${w.id}/${p.name} default ${p.def} is outside 0..1`);
      const highest = [...w.body.matchAll(/iParam([0-9])/g)].reduce((m, x) => Math.max(m, Number(x[1])), -1);
      assert.ok(highest < 4, `${w.id} reads iParam${highest}`);
      assert.ok(highest < w.params.length, `${w.id} reads iParam${highest} but names only ${w.params.length} params`);
    }
  });

  it('defines each shared helper exactly once across the preambles a work receives', () => {
    // A kit3d work gets KIT + KIT_3D, so a helper defined in both would be a redefinition error.
    // aces() lives in the 2D kit precisely so that flat works can reach it too.
    for (const name of ['aces', 'rot', 'ramp', 'h21', 'vnoise', 'fbm']) {
      const re = new RegExp(`\\b(?:vec[234]|float|int|mat2)\\s+${name}\\s*\\(`, 'g');
      const in2d = (SIGNATURE_KIT.match(re) || []).length;
      const in3d = (SIGNATURE_KIT_3D.match(re) || []).length;
      assert.ok(in2d + in3d <= 1, `${name}() is defined ${in2d + in3d} times across the kits`);
    }
    assert.match(SIGNATURE_KIT, /vec3 aces\(/, 'aces must live in the 2D kit so flat works can use it');
  });

  it('builds a complete source for every work, with the 3D preamble only where asked', () => {
    for (const w of SIGNATURE_WORKS) {
      const src = signatureSource(w);
      assert.ok(src.includes(w.body), `${w.id} source lost its body`);
      assert.ok(src.includes('plajahAudio'), `${w.id} source lost the audio kit`);
      assert.equal(src.includes('float softShadow('), !!w.kit3d, `${w.id} 3D preamble does not match kit3d`);
    }
  });

  it('covers Series VII, the Council of Art Directors', () => {
    const vii = SIGNATURE_WORKS.filter((w) => w.series === 'VII');
    assert.equal(vii.length, 24, 'Series VII should carry 24 works');
    assert.deepEqual([...new Set(vii.map((w) => w.set))].sort(), ['atelier', 'manifesto', 'phosphor', 'salon']);
    for (const set of ['atelier', 'manifesto', 'phosphor', 'salon']) {
      assert.equal(vii.filter((w) => w.set === set).length, 6, `${set} should hold six works`);
    }
  });
});
