import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOfxManifest, ofxDescriptorFor, parseChoiceLabel, ofxParam, stableHash } from '../services/fabula/ofxManifest';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';
import { FORGE_TRANSITIONS } from '../services/fabula/forgeTransitions';

describe('OFX manifest', () => {
  it('describes every effect and transition with unique identifiers', () => {
    const m = buildOfxManifest();
    assert.equal(m.plugins.length, FX_EFFECTS.length + FORGE_TRANSITIONS.length);
    const ids = m.plugins.map(p => p.pluginIdentifier);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^com\.plajah\.fabula\./);
  });

  it('keeps the kernel param ABI in declaration order and typed', () => {
    const trails = FX_EFFECTS.find(e => e.id === 'trails')!;
    const d = ofxDescriptorFor(trails);
    assert.deepEqual(d.kernel!.paramAbi, trails.params.map(p => p.key));
    assert.equal(d.params.length, trails.params.length);
    d.params.forEach((p, i) => assert.equal(p.abiIndex, i));
    const mode = d.params.find(p => p.name === 'mode')!;
    assert.equal(mode.type, 'OfxParamTypeChoice');
    assert.deepEqual(mode.options, ['max', 'add', 'screen']);
    assert.equal(mode.label, 'Blend');
    assert.equal(d.temporalClipAccess, true);
    assert.equal(d.clips[0].temporalAccess, true);
  });

  it('parses enumeration labels and leaves ordinary labels alone', () => {
    assert.deepEqual(parseChoiceLabel('Mode (0 overlay · 1 matte · 2 heat · 3 alpha)'), { base: 'Mode', options: ['overlay', 'matte', 'heat', 'alpha'] });
    assert.equal(parseChoiceLabel('Radius (px)'), null);
    assert.equal(parseChoiceLabel('Threshold'), null);
    const p = ofxParam({ key: 'invert', label: 'Invert Map', min: 0, max: 1, default: 0, step: 1 }, 3);
    assert.equal(p.type, 'OfxParamTypeBoolean');
    const q = ofxParam({ key: 'block', label: 'Block Size', min: 2, max: 64, default: 16, step: 1, unit: 'px' }, 1);
    assert.equal(q.type, 'OfxParamTypeInteger'); assert.equal(q.hint, 'Unit: px');
  });

  it('declares aux inputs as General context with an optional Aux clip', () => {
    const d = ofxDescriptorFor(FX_EFFECTS.find(e => e.id === 'timedisplace')!);
    assert.ok(d.contexts.includes('OfxImageEffectContextGeneral'));
    assert.deepEqual(d.clips.map(c => c.name), ['Source', 'Aux', 'Output']);
    assert.equal(d.clips[1].optional, true);
  });

  it('is deterministic and hashes the shared header', () => {
    assert.equal(JSON.stringify(buildOfxManifest()), JSON.stringify(buildOfxManifest()));
    assert.match(stableHash('abc'), /^[0-9a-f]{8}$/);
    assert.notEqual(stableHash('abc'), stableHash('abd'));
  });
});
