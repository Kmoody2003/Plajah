// Chora mixer link: console channels → audio tracks (create, stereo links, re-sync, user renames)
// and multitrack takes → clips (armed inputs, sample-zero placement, pre-roll trim, stereo WAV).
// Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type ArrangeTrack } from '../services/melos/beats/grooveDoc';
import type { MixerChannel, MultitrackTake } from '../services/melos/beats/mixerLink/types';
import { planTracksFromMixer } from '../services/melos/beats/mixerLink/planTracks';
import { applyTake, armedInputTracks, captureInputs, encodeWavFloat, sampleZeroBeat } from '../services/melos/beats/mixerLink/takeImport';

const device = { id: 'presonus:SL32SX-0001' };
const endpoint = { transport: 'usb-asio' as const, endpointId: 'asio:PreSonus StudioLive' };
const palette = ['#111111', '#222222'];
let n = 0;
const newId = () => `t${++n}`;

const ch = (index: number, name: string, extra: Partial<MixerChannel> = {}): MixerChannel =>
  ({ index, name, nameSource: 'ucnet', endpointInput: index - 1, ...extra });

const apply = (tracks: ArrangeTrack[], plan: ReturnType<typeof planTracksFromMixer>) => {
  const out = tracks.map((t) => {
    const u = plan.update.find((x) => x.trackId === t.id);
    return u ? { ...t, input: u.input, ...(u.name ? { name: u.name } : {}), ...(u.color ? { color: u.color } : {}) } : t;
  });
  return [...out, ...plan.create];
};

test('one track per routed channel, stereo links merge, unrouted skipped', () => {
  const channels = [
    ch(1, 'Kick', { color: '#ff0000' }),
    ch(2, ''),
    ch(3, 'Keys L', { linkedWith: 4 }),
    ch(4, 'Keys R', { linkedWith: 3 }),
    ch(5, 'Talkback', { endpointInput: undefined }),
  ];
  const plan = planTracksFromMixer({ device, endpoint, channels, tracks: [], palette, newId });
  assert.deepEqual(plan.create.map((t) => t.name), ['Kick', 'Ch 2', 'Keys L']);
  assert.equal(plan.create[0].color, '#ff0000');
  assert.equal(plan.create[1].color, '#222222');
  assert.deepEqual(plan.create[2].input, { deviceId: device.id, transport: 'usb-asio', endpointId: endpoint.endpointId, input: 2, inputR: 3, mixerChannel: 3 });
  assert.deepEqual(plan.skipped, [{ index: 4, reason: 'stereo-partner' }, { index: 5, reason: 'not-routed' }]);
  assert.ok(plan.create.every((t) => t.kind === 'audio' && t.clips.length === 0));
});

test('re-sync is idempotent and keeps track ids', () => {
  const channels = [ch(1, 'Kick'), ch(2, 'Snare')];
  const first = apply([], planTracksFromMixer({ device, endpoint, channels, tracks: [], palette, newId }));
  const again = planTracksFromMixer({ device, endpoint, channels, previous: channels, tracks: first, palette, newId });
  assert.equal(again.create.length, 0);
  assert.equal(again.update.length, 0);
});

test('console rename follows; user rename is kept', () => {
  const v1 = [ch(1, 'Vox 1'), ch(2, 'Vox 2')];
  let tracks = apply([], planTracksFromMixer({ device, endpoint, channels: v1, tracks: [], palette, newId }));
  tracks = tracks.map((t) => (t.input?.mixerChannel === 2 ? { ...t, name: 'Sarah lead' } : t));
  const v2 = [ch(1, 'Pastor'), ch(2, 'Worship Lead')];
  const plan = planTracksFromMixer({ device, endpoint, channels: v2, previous: v1, tracks, palette, newId });
  tracks = apply(tracks, plan);
  assert.deepEqual(tracks.map((t) => t.name), ['Pastor', 'Sarah lead']);
});

test('changed USB routing updates the binding, other devices untouched', () => {
  const other: ArrangeTrack = { id: 'x', kind: 'audio', name: 'Other', color: '#000', mute: false, solo: false, gainDb: 0, pan: 0, clips: [],
    input: { deviceId: 'asio:Focusrite', transport: 'usb-asio', endpointId: 'asio:Focusrite', input: 0, mixerChannel: 1 } };
  const v1 = [ch(1, 'Kick')];
  const tracks = apply([other], planTracksFromMixer({ device, endpoint, channels: v1, tracks: [other], palette, newId }));
  const plan = planTracksFromMixer({ device, endpoint, channels: [ch(1, 'Kick', { endpointInput: 9 })], previous: v1, tracks, palette, newId });
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].input.input, 9);
  assert.notEqual(plan.update[0].trackId, 'x');
});

// ── take import ──────────────────────────────────────────────────────────────

const inputTrack = (id: string, input: number, armed: boolean, inputR?: number): ArrangeTrack => ({
  id, kind: 'audio', name: id, color: '#000', mute: false, solo: false, gainDb: 0, pan: 0, clips: [], armed,
  input: { deviceId: 'asio:SL', transport: 'usb-asio', endpointId: 'asio:SL', input, ...(inputR != null ? { inputR } : {}) },
});

const take = (startBeats: number): MultitrackTake => ({
  id: 'tk', deviceId: 'asio:SL', transport: 'usb-asio', sampleRate: 48000, startedAt: 0, startBeats, durationSec: 4,
  tracks: [], health: { droppedFrames: 0, clippedTracks: [] },
});

test('armed input tracks and the driver inputs they need', () => {
  const doc = newGrooveDoc('u');
  doc.arrangement = [inputTrack('kick', 0, true), inputTrack('keys', 4, true, 5), inputTrack('vox', 2, false)];
  const armed = armedInputTracks(doc);
  assert.deepEqual(armed.map((t) => t.id), ['kick', 'keys']);
  assert.deepEqual(captureInputs(armed), [0, 4, 5]);
});

test('sample zero sits one buffer before the first callback', () => {
  const doc = newGrooveDoc('u'); doc.bpm = 120; doc.tempoMap = [];
  // Transport at beat 8 at wall 10_000 ms; first callback at 11_010 ms with a 480-frame (10 ms) buffer
  // → sample 0 at 11_000 ms = 1 s later = 2 beats at 120 bpm.
  assert.ok(Math.abs(sampleZeroBeat(doc, { wallMs: 10_000, beats: 8 }, 11_010, 480, 48000) - 10) < 1e-9);
});

test('applyTake places clips; pre-roll audio becomes offset, not lost', () => {
  const doc = newGrooveDoc('u'); doc.bpm = 120; doc.tempoMap = [];
  doc.arrangement = [inputTrack('kick', 0, true)];
  let i = 0;
  applyTake(doc, take(-2), [{ trackId: 'kick', sampleKey: 'k1', name: 'Kick', durationSec: 4 }], () => `c${++i}`, { model: 'StudioLive 32SX', family: 'studiolive-iii' });
  const c = doc.arrangement[0].clips[0];
  assert.equal(c.startBeats, 0);
  assert.equal(c.audio!.offsetSec, 1);          // 2 beats at 120 bpm
  assert.ok(Math.abs(c.lengthBeats - 6) < 1e-9); // 3 s left = 6 beats
  assert.equal(doc.mixerLink!.takes!.length, 1);
  assert.equal(doc.mixerLink!.model, 'StudioLive 32SX');
});

test('encodeWavFloat writes an interleaved IEEE-float stereo WAV', () => {
  const wav = new DataView(encodeWavFloat([new Float32Array([0.5, -0.25]), new Float32Array([1, 0])], 48000));
  assert.equal(wav.getUint16(20, true), 3);   // IEEE float
  assert.equal(wav.getUint16(22, true), 2);
  assert.equal(wav.getUint32(40, true), 16);
  assert.deepEqual([44, 48, 52, 56].map((o) => wav.getFloat32(o, true)), [0.5, 1, -0.25, 0]);
});
