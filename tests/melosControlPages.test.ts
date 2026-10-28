// MEKA control area: the pages the eight knobs (screen and hardware) drive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc';
import type { ArrangeTrack } from '../services/melos/beats/grooveDoc';
import { newAuraPatch, serializeAuraPatch } from '../services/melos/instruments/aura/patch';

const track = (id: string, type: 'aura' | 'onda', patch: Record<string, unknown>): ArrangeTrack =>
  ({ id, kind: 'instrument', name: id, color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0, clips: [], instrument: { type, patch } }) as unknown as ArrangeTrack;
import {
  focusedPage, fromUnit, groupPages, instrumentMacros, masterPages, setControlFocus, soundPages, stepControlPage, toUnit, writeInstrumentMacro,
} from '../services/melos/beats/controlPages';

test('sample pad: Pitch/Gain, Amp Envelope, Filter, Sends — eight slots each', () => {
  const d = newGrooveDoc('u');
  d.kit[0].source = 'sample';
  d.kit[0].empty = false;
  d.kit[0].sample = { key: 'k', name: 'Kick', durationSec: 1.2 };
  const pages = soundPages(d, 0);
  assert.deepEqual(pages.map((p) => p.id), ['pitch', 'amp', 'filter', 'sends']);
  for (const p of pages) assert.equal(p.params.length, 8);
  const tune = pages[0].params[0]!;
  tune.set(d, fromUnit(tune, 1));
  assert.equal(d.kit[0].pitchSemis, 24);
  assert.ok(pages[0].params.find((x) => x?.id === 'start'), 'a sample has a Start knob');
});

test('log travel round-trips and steps snap', () => {
  const d = newGrooveDoc('u');
  d.kit[0].empty = false;
  const cutoff = soundPages(d, 0).find((p) => p.id === 'filter')!.params[1]!;
  assert.ok(Math.abs(fromUnit(cutoff, 0.5) - Math.sqrt(60 * 18000)) < 1, 'halfway is the geometric middle');
  assert.ok(Math.abs(toUnit(cutoff, fromUnit(cutoff, 0.3)) - 0.3) < 1e-9);
  const type = soundPages(d, 0).find((p) => p.id === 'filter')!.params[0]!;
  type.set(d, fromUnit(type, 0.6));
  assert.equal(d.kit[0].filter.type, 'lowpass'); // 0.6 of three steps rounds to the middle one
});

test('group knobs are relative: per-pad differences survive', () => {
  const d = newGrooveDoc('u');
  d.kit[0].empty = false; d.kit[0].pitchSemis = 2;
  d.kit[1].empty = false; d.kit[1].pitchSemis = -3;
  const tune = groupPages(d, 0)[0].params[0]!;
  tune.set(d, 5);
  assert.deepEqual([d.kit[0].pitchSemis, d.kit[1].pitchSemis], [7, 2]);
  tune.set(d, 4);
  assert.deepEqual([d.kit[0].pitchSemis, d.kit[1].pitchSemis], [6, 1]);
  assert.equal(tune.get(d), 4);
});

test('instrument pad leads with its macros; record and array macro banks both write', () => {
  const d = newGrooveDoc('u');
  const aura = track('aura1', 'aura', serializeAuraPatch(newAuraPatch()) as unknown as Record<string, unknown>);
  d.arrangement.push(aura);
  d.kit[0].empty = false; d.kit[0].source = 'instrument'; d.kit[0].instrumentTrackId = aura.id;
  const pages = soundPages(d, 0);
  assert.equal(pages[0].id, 'instrument');
  assert.equal(pages[0].instrumentTrackId, aura.id);
  assert.equal(pages[0].params[0]?.label, instrumentMacros(aura)[0].label);
  assert.equal(writeInstrumentMacro(d, aura.id, 1, 0.75), 'reload');
  assert.equal((aura.instrument!.patch.macros as Record<string, number>).cutoff, 0.75);

  const onda = track('onda1', 'onda', { macros: ['Brightness', 'Movement', 'Drive', 'Width', 'Attack', 'Release', 'Sub', 'Space'].map((name) => ({ name, value: 0 })) });
  d.arrangement.push(onda);
  assert.equal(writeInstrumentMacro(d, onda.id, 2, 0.4), 'live');
  assert.equal((onda.instrument!.patch.macros as { value: number }[])[2].value, 0.4);
  assert.equal(instrumentMacros(onda).length, 8);
});

test('master page and focus stepping (hardware Page buttons)', () => {
  const d = newGrooveDoc('u');
  const vol = masterPages(d)[0].params[0]!;
  vol.set(d, -6);
  assert.equal(d.mixer.master.gainDb, -6);
  d.kit[0].empty = false;
  setControlFocus({ tab: 'sound', page: 0 });
  stepControlPage(d, 0, 1);
  assert.equal(focusedPage(d, 0).page?.id, 'amp');
  stepControlPage(d, 0, -1); stepControlPage(d, 0, -1);
  assert.equal(focusedPage(d, 0).page?.id, 'sends', 'wraps around');
  setControlFocus({ tab: 'master' });
  assert.equal(focusedPage(d, 0).page?.id, 'master');
});
