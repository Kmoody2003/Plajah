// KERA program persistence — the piece that makes a sampler patch a real, reloadable part of a
// saved project.

import { putBytes, getBytes, hasBytes } from '../../../fabula/mediaStore';
import { uploadFile } from '../../../backendService';
import { auth } from '../../../firebase';
import { emptyProgram, type KeraProgram, type KeraSample, type KeraVoiceState } from './zones';

const MAGIC = 0x4b524131; // 'KRA1'
const HEADER_BYTES = 20;   // magic(4) + sampleRate f64(8) + channels u32(4) + frames u32(4)
const keyFor = (hash: string) => `melos/beats/kera/${hash}`;

export interface SerializedKeraSample {
  id: string;
  name: string;
  sampleRate: number;
  frames: number;
  channelCount: number;
  rootNote: number;
  fineTune: number;
  loopStart: number;
  loopEnd: number;
  loopMode: 'off' | 'forward' | 'sustain';
  key: string;
  lockerUrl?: string;
}

export interface SerializedKeraProgram {
  v: 1;
  name: string;
  source: KeraProgram['source'];
  zones: KeraProgram['zones'];
  amp: KeraProgram['amp'];
  voice?: KeraVoiceState;
  playMode: KeraProgram['playMode'];
  transpose: number;
  gainDb: number;
  polyphony: number;
  samples: SerializedKeraSample[];
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function packPcm(sample: KeraSample): ArrayBuffer {
  const channelCount = sample.channels.length;
  const frames = sample.channels[0]?.length ?? 0;
  const ab = new ArrayBuffer(HEADER_BYTES + channelCount * frames * 4);
  const view = new DataView(ab);
  view.setUint32(0, MAGIC, true);
  view.setFloat64(4, sample.sampleRate, true);
  view.setUint32(12, channelCount, true);
  view.setUint32(16, frames, true);
  const out = new Float32Array(ab, HEADER_BYTES);
  for (let c = 0; c < channelCount; c++) out.set(sample.channels[c], c * frames);
  return ab;
}

function unpackPcm(ab: ArrayBuffer): { channels: Float32Array[]; sampleRate: number } | null {
  if (ab.byteLength < HEADER_BYTES) return null;
  const view = new DataView(ab);
  if (view.getUint32(0, true) !== MAGIC) return null;
  const sampleRate = view.getFloat64(4, true);
  const channelCount = view.getUint32(12, true);
  const frames = view.getUint32(16, true);
  const flat = new Float32Array(ab, HEADER_BYTES, channelCount * frames);
  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) channels.push(flat.slice(c * frames, (c + 1) * frames));
  return { channels, sampleRate };
}

async function putSamplePcm(sample: KeraSample, locker = true): Promise<{ key: string; lockerUrl?: string }> {
  const ab = packPcm(sample);
  const hash = await sha256Hex(ab);
  const key = keyFor(hash);
  if (!(await hasBytes(key))) await putBytes(key, new Blob([ab], { type: 'application/octet-stream' }));
  let lockerUrl: string | undefined;
  const user = auth.currentUser;
  if (user && locker) {
    try {
      const safe = sample.name.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'sample';
      lockerUrl = await uploadFile(`personal/${user.uid}/melos/beats/kera/${hash}_${safe}`, new Blob([ab]));
    } catch { /* best-effort: OPFS still has it, and a later save retries */ }
  }
  return { key, lockerUrl };
}

async function getSamplePcm(s: SerializedKeraSample): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  try {
    let blob = await getBytes(s.key);
    if (!blob && s.lockerUrl) {
      const res = await fetch(s.lockerUrl);
      if (res.ok) { blob = await res.blob(); void putBytes(s.key, blob); }
    }
    if (!blob) return null;
    return unpackPcm(await blob.arrayBuffer());
  } catch (e) {
    console.warn('[kera] sample hydrate failed', s.name, e);
    return null;
  }
}

export async function serializeKeraProgram(program: KeraProgram, prior?: SerializedKeraProgram | null, opts: { locker?: boolean } = {}): Promise<SerializedKeraProgram> {
  const priorById = new Map((prior?.samples ?? []).map((s) => [s.id, s]));
  const samples: SerializedKeraSample[] = [];
  for (const s of program.samples) {
    const frames = s.channels[0]?.length ?? 0;
    const p = priorById.get(s.id);
    const reusable = p && p.frames === frames && p.sampleRate === s.sampleRate && p.channelCount === s.channels.length;
    const { key, lockerUrl } = reusable ? { key: p.key, lockerUrl: p.lockerUrl } : await putSamplePcm(s, opts.locker !== false);
    const entry: SerializedKeraSample = {
      id: s.id, name: s.name, sampleRate: s.sampleRate,
      frames, channelCount: s.channels.length,
      rootNote: s.rootNote, fineTune: s.fineTune,
      loopStart: s.loopStart, loopEnd: s.loopEnd, loopMode: s.loopMode,
      key,
    };
    if (lockerUrl !== undefined) entry.lockerUrl = lockerUrl;
    samples.push(entry);
  }
  const out: SerializedKeraProgram = {
    v: 1, name: program.name, source: program.source, zones: program.zones, amp: program.amp,
    playMode: program.playMode, transpose: program.transpose, gainDb: program.gainDb,
    polyphony: program.polyphony, samples,
  };
  if (program.voice) {
    out.voice = {
      cut: Number(program.voice.cut) || 0,
      res: Number(program.voice.res) || 0,
      drive: Number(program.voice.drive) || 0,
      lfoOn: !!program.voice.lfoOn,
      lfoRate: Number(program.voice.lfoRate) || 0.3,
      lfoDepth: Number(program.voice.lfoDepth) || 0,
      x: Number(program.voice.x) || 0,
      y: Number(program.voice.y) || 0,
    };
  }
  return out;
}

export async function backupKeraSamples(sp: SerializedKeraProgram): Promise<SerializedKeraProgram> {
  const user = auth.currentUser;
  if (!user) return sp;
  const samples: SerializedKeraSample[] = [];
  for (const s of sp.samples) {
    if (s.lockerUrl) { samples.push(s); continue; }
    let lockerUrl: string | undefined;
    try {
      const blob = await getBytes(s.key);
      const hash = s.key.split('/').pop() || '';
      const safe = s.name.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'sample';
      if (blob) lockerUrl = await uploadFile(`personal/${user.uid}/melos/beats/kera/${hash}_${safe}`, blob);
    } catch { /* best-effort */ }
    samples.push(lockerUrl ? { ...s, lockerUrl } : s);
  }
  return { ...sp, samples };
}

export function keraProgramShell(sp: SerializedKeraProgram): KeraProgram {
  const prog = emptyProgram(sp.name);
  prog.source = sp.source;
  prog.zones = sp.zones;
  prog.amp = sp.amp;
  if (sp.voice) prog.voice = { ...sp.voice };
  prog.playMode = sp.playMode;
  prog.transpose = sp.transpose;
  prog.gainDb = sp.gainDb;
  prog.polyphony = sp.polyphony;
  prog.samples = sp.samples.map((s) => ({
    id: s.id, name: s.name, channels: [], sampleRate: s.sampleRate,
    rootNote: s.rootNote, fineTune: s.fineTune,
    loopStart: s.loopStart, loopEnd: s.loopEnd, loopMode: s.loopMode,
  }));
  return prog;
}

export async function deserializeKeraProgram(sp: SerializedKeraProgram): Promise<KeraProgram | null> {
  if (!sp?.samples) return null;
  const prog = emptyProgram(sp.name);
  prog.source = sp.source;
  prog.zones = sp.zones;
  prog.amp = sp.amp;
  if (sp.voice) prog.voice = { ...sp.voice };
  prog.playMode = sp.playMode;
  prog.transpose = sp.transpose;
  prog.gainDb = sp.gainDb;
  prog.polyphony = sp.polyphony;

  const out: KeraSample[] = [];
  for (const s of sp.samples) {
    const pcm = await getSamplePcm(s);
    if (!pcm) continue;
    out.push({
      id: s.id, name: s.name, channels: pcm.channels, sampleRate: pcm.sampleRate,
      rootNote: s.rootNote, fineTune: s.fineTune,
      loopStart: s.loopStart, loopEnd: s.loopEnd, loopMode: s.loopMode,
    });
  }
  prog.samples = out;
  return out.length ? prog : null;
}
