// Shared WebMIDI input service (NKS tier 1) — promotes the access/enumeration wiring that
// lived component-locally in plajahPixels/components/MidiController.tsx into a reusable
// singleton. Reuses the Pixels Maschine mappings (pure module, no React) — do NOT refactor
// Pixels itself. Subscribers get parsed events synchronously from the midimessage handler, so
// a pad hit reaches AudioBufferSourceNode.start() in the same task it arrived in.

import { detectDeviceType } from '../../components/plajahPixels/services/midiService';

export interface BeatsMidiEvent {
  kind: 'noteon' | 'noteoff' | 'cc';
  channel: number;
  note?: number;
  velocity?: number;   // 1–127 for noteon
  cc?: number;
  value?: number;      // 0–127
  deviceName: string;
  deviceType: ReturnType<typeof detectDeviceType>;
}

type Listener = (e: BeatsMidiEvent) => void;

let access: MIDIAccess | null = null;
let requesting: Promise<void> | null = null;
const listeners = new Set<Listener>();
const boundInputs = new Set<string>();

function bindInput(input: MIDIInput): void {
  if (boundInputs.has(input.id)) return;
  boundInputs.add(input.id);
  const deviceName = input.name || 'MIDI device';
  const deviceType = detectDeviceType(deviceName);
  input.onmidimessage = (msg: MIDIMessageEvent) => {
    const data = msg.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    let ev: BeatsMidiEvent | null = null;
    if (status === 0x90 && data[2] > 0) ev = { kind: 'noteon', channel, note: data[1], velocity: data[2], deviceName, deviceType };
    else if (status === 0x80 || (status === 0x90 && data[2] === 0)) ev = { kind: 'noteoff', channel, note: data[1], deviceName, deviceType };
    else if (status === 0xb0) ev = { kind: 'cc', channel, cc: data[1], value: data[2], deviceName, deviceType };
    if (!ev) return;
    // Synchronous fan-out — no CustomEvent hop, no queue: latency is the feature.
    for (const fn of listeners) { try { fn(ev); } catch { /* one bad listener can't break the hit path */ } }
  };
}

function bindAll(): void {
  if (!access) return;
  access.inputs.forEach((input) => bindInput(input));
}

async function ensureAccess(): Promise<void> {
  if (access) return;
  if (!('requestMIDIAccess' in navigator)) return;
  if (!requesting) {
    requesting = navigator.requestMIDIAccess({ sysex: false }).then((a) => {
      access = a;
      bindAll();
      // Hot-plug: rebind whenever a device (re)appears.
      a.onstatechange = () => bindAll();
    }).catch(() => { /* denied/unsupported — midiStatus() reports it */ });
  }
  await requesting;
}

/** Subscribe to parsed MIDI events; lazily requests MIDI access on first use. */
export function subscribeMidi(fn: Listener): () => void {
  listeners.add(fn);
  void ensureAccess();
  return () => { listeners.delete(fn); };
}

export function midiStatus(): { supported: boolean; connected: string[] } {
  const connected: string[] = [];
  access?.inputs.forEach((i) => { if (i.state === 'connected') connected.push(i.name || i.id); });
  return { supported: 'requestMIDIAccess' in navigator, connected };
}
