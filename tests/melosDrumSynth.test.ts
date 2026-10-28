// MEKA Drum Synth: patches, translation from Maschine / Bitwig / Live drum synths, kit loading
// and the control-area Synth pages. The DSP itself needs an AudioContext (checked in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  bitwigDrumsIn, drumSynthFromLegacy, drumSynthLength, dsParam, fromMaschine, maschineSynthsIn, newDrumSynth, MODELS, PARAMS,
} from '../services/melos/beats/drumSynth';
import { parseAdg, parseBitwig, parseNiBinary } from '../services/melos/beats/kits/parsers';
import { applyKitToGroup } from '../services/melos/beats/kits/applyKit';
import { newGrooveDoc, type SampleRef } from '../services/melos/beats/grooveDoc';
import { fromUnit, soundPages } from '../services/melos/beats/controlPages';

const BW = 'C:/Program Files/Bitwig Studio/5.1.6/Library/device-settings/';

test('every engine: models exist, params default inside their range, length is positive', () => {
  for (const [eng, models] of Object.entries(MODELS)) {
    assert.ok(models.length >= 2, eng);
    for (const d of PARAMS[eng as keyof typeof PARAMS]) assert.ok(d.def >= d.min && d.def <= d.max, `${eng}.${d.id}`);
    assert.ok(drumSynthLength(newDrumSynth(eng as keyof typeof MODELS)) > 0);
  }
  assert.equal(newDrumSynth('kick', 'nope').model, 'analog', 'unknown model falls back');
  assert.equal(dsParam(newDrumSynth('kick', 'analog', { tune: 9999 }), 'tune'), 150, 'clamped');
  assert.equal(drumSynthFromLegacy('hat-open').engine, 'hat');
});

test('Maschine Drum Synths: engine + model names map to the nearest model', () => {
  assert.deepEqual([fromMaschine('Kick', 'Dusty')?.engine, fromMaschine('Kick', 'Dusty')?.model], ['kick', 'dusty']);
  assert.equal(fromMaschine('Snare', 'Clap')?.engine, 'clap', 'Maschine’s Clap is a snare model');
  assert.equal(fromMaschine('Hi-hat', 'Memory')?.model, 'noise');
  assert.equal(fromMaschine('Percussion', 'Kettle')?.model, 'membrane');
  assert.equal(fromMaschine('Kick', 'Massive'), null);
  const found = maschineSynthsIn(['Group 1', 'Kick', 'Tronic', 'Sound 2', 'Hi-hat', 'x', 'Silver', 'Snare']);
  assert.deepEqual(found.map((d) => `${d.engine}/${d.model}`), ['kick/analog', 'hat/metal']);
});

test('Maschine group with a sample pad and drum synth pads (UTF-16 fixture)', async () => {
  const u16 = (s: string) => Buffer.from(s, 'utf16le');
  const z = Buffer.from([0, 0]);
  const bytes = Buffer.concat([u16('C:\\NI\\Samples\\Kick 1.wav'), z, u16('Kick'), z, u16('Sub'), z, u16('Snare'), z, u16('Volt'), z]);
  const spec = await parseNiBinary('maschine-group', new Uint8Array(bytes), 'Mixed');
  assert.equal(spec.pads.length, 3);
  assert.equal(spec.pads[0].sample?.kind, 'path');
  assert.deepEqual(spec.pads.slice(1).map((p) => `${p.drumSynth?.engine}/${p.drumSynth?.model}`), ['kick/sub', 'snare/analog']);
  assert.ok(spec.notes.some((n) => /Drum Synth/.test(n)));
});

test('Bitwig E-drums: the real Bitwig 5.1 device presets decode to plausible sounds', { skip: !existsSync(BW) }, () => {
  const read = (id: string) => bitwigDrumsIn(new Uint8Array(readFileSync(`${BW}${id}/Default.bwpreset`)))[0];
  const kick = read('c6d5de18-a6f1-4daa-90a9-d9254527601a');
  assert.equal(kick.engine, 'kick');
  assert.ok(kick.params.tune! > 35 && kick.params.tune! < 70, `kick tune ${kick.params.tune}`);
  assert.ok(kick.params.pitchDecay! > 0.005 && kick.params.pitchDecay! < 0.1);
  const snare = read('db22eb41-c8a0-4055-b617-637614dfa185');
  assert.equal(snare.engine, 'snare');
  assert.ok(snare.params.tune! > 100 && snare.params.tune! < 400);
  assert.equal(read('742e4a89-df78-4ca5-b6b0-ca78889d5953').engine, 'hat');
  assert.equal(read('89eba41d-46d3-4506-8ce6-ba9fe3e3bee4').engine, 'clap');
});

test('Bitwig Drum Machine: sample chains and E-drum chains keep their order', () => {
  const str = (s: string) => { const b = Buffer.from(s, 'utf8'); const h = Buffer.alloc(5); h[0] = 8; h.writeUInt32BE(b.length, 1); return Buffer.concat([h, b]); };
  const dbl = (field: number, v: number) => { const b = Buffer.alloc(13); b.writeUInt32BE(field, 0); b[4] = 7; b.writeDoubleBE(v, 5); return b; };
  const bytes = Buffer.concat([
    Buffer.from('BtWg'), str('E-Kick'), str('TUNING'), dbl(0x136, 33), str('DECAY'), dbl(0x136, -0.3),
    str('C:/Samples/Snare Tight.wav'), str('E-Hat'), str('DECAY'), dbl(0x136, -1),
  ]);
  const spec = parseBitwig(new Uint8Array(bytes), 'Mixed');
  assert.deepEqual(spec.pads.map((p) => p.drumSynth?.engine ?? 'sample'), ['kick', 'sample', 'hat']);
  assert.ok(Math.abs(spec.pads[0].drumSynth!.params.decay! - Math.pow(10, -0.3)) < 1e-9);
});

test('Live Drum Rack: a DS Kick branch becomes a Drum Synth pad with its knobs', () => {
  const xml = `<Ableton><DrumGroupDevice><BranchPresets>
    <DrumBranchPreset><Name Value="Kick"/><DevicePresets><MxDeviceInstrument>
      <FileRef><Path Value="C:/Live/Max/DS Kick.amxd"/></FileRef>
      <MxDFloatParameter><Name Value="Pitch"/><Timeable><Manual Value="58"/></Timeable></MxDFloatParameter>
      <MxDFloatParameter><Name Value="Decay"/><Timeable><Manual Value="600"/></Timeable></MxDFloatParameter>
      <MxDFloatParameter><Name Value="Drive"/><Timeable><Manual Value="40"/></Timeable></MxDFloatParameter>
    </MxDeviceInstrument></DevicePresets><ZoneSettings><ReceivingNote Value="92"/></ZoneSettings></DrumBranchPreset>
  </BranchPresets></DrumGroupDevice></Ableton>`;
  const spec = parseAdg(xml, 'Rack');
  const p = spec.pads[0];
  assert.equal(p.slot, 0);
  assert.equal(p.drumSynth?.engine, 'kick');
  assert.equal(p.drumSynth?.params.tune, 58);
  assert.equal(p.drumSynth?.params.decay, 0.6);
  assert.equal(p.drumSynth?.params.drive, 0.4);
});

test('loading a kit: drum synth pads fill without samples, envelope opened to the hit', () => {
  const doc = newGrooveDoc('u');
  const patch = { ...newDrumSynth('kick', 'analog', { decay: 1.2 }), from: 'Bitwig E-Kick' };
  const res = applyKitToGroup(doc, 0, {
    name: 'Mixed', format: 'bitwig', notes: [],
    pads: [{ slot: 0, name: 'Kick', sample: null, drumSynth: patch }, { slot: 4, name: 'Gone', sample: { kind: 'path', path: 'x.wav' } }],
  }, new Map<number, SampleRef>());
  assert.equal(res.filled, 1);
  assert.deepEqual(res.missing, ['Gone']);
  assert.equal(doc.kit[0].source, 'synth');
  assert.equal(doc.kit[0].drumSynth?.from, 'Bitwig E-Kick');
  assert.equal(doc.kit[0].env.holdMs, 1200);
});

test('Synth pages: engine, model and knobs edit the patch; a legacy voice becomes a patch', () => {
  const doc = newGrooveDoc('u'); // the default kit is legacy starter voices
  assert.equal(doc.kit[0].drumSynth, undefined);
  const pages = soundPages(doc, 0);
  assert.deepEqual(pages.slice(0, 2).map((p) => p.id), ['synth', 'synth2']);
  assert.deepEqual(pages[0].params.map((p) => p?.label), ['Engine', 'Model', 'Tune', 'Decay', 'Pitch', 'Pitch Dec', 'Click', 'Drive']);
  const decay = pages[0].params[3]!;
  decay.set(doc, 1.5);
  assert.equal(doc.kit[0].drumSynth?.params.decay, 1.5);
  assert.equal(doc.kit[0].env.holdMs, 1500, 'decay re-opens the pad envelope');
  const model = pages[0].params[1]!;
  model.set(doc, fromUnit(model, 1));
  assert.equal(doc.kit[0].drumSynth?.model, 'acoustic');
  assert.equal(doc.kit[0].drumSynth?.params.decay, 1.5, 'model change keeps the knobs');
  const engine = soundPages(doc, 0)[0].params[0]!;
  engine.set(doc, 2);
  assert.equal(doc.kit[0].drumSynth?.engine, 'hat');
  assert.equal(soundPages(doc, 0)[0].label, 'Hi-hat · Metal');
});
