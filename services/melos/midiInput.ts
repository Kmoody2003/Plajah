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

/** Input arrived / something was sent. `routed` is false for a note nothing acted on. */
export interface MidiActivity { dir: 'in' | 'out'; routed: boolean; note?: number }
type ActivityListener = (a: MidiActivity) => void;

let access: MIDIAccess | null = null;
let requesting: Promise<void> | null = null;
const listeners = new Set<Listener>();
const activity = new Set<ActivityListener>();
/** Ports we have attached a handler to, by id — see `bindInput` for why the handler is checked. */
const boundInputs = new Map<string, MIDIInput>();

function ping(a: MidiActivity): void {
  for (const fn of activity) { try { fn(a); } catch { /* a meter must never break the hit path */ } }
}

function bindInput(input: MIDIInput): void {
  // Re-attach if this port has lost its handler. A port that disconnects and comes back keeps its
  // id but the browser clears `onmidimessage` and closes it, so an id-only guard means a device
  // unplugged and replugged goes permanently silent — connected in the readout, dead in use.
  if (boundInputs.get(input.id) === input && input.onmidimessage) return;
  boundInputs.set(input.id, input);
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
    // Something arrived. Reported before routing, so the meter can distinguish "MIDI is reaching
    // Melos" from "Melos did something with it" — which is the whole diagnosis when a device is
    // plugged in and nothing is making a sound.
    ping({ dir: 'in', routed: false, note: ev.note });
    // Synchronous fan-out — no CustomEvent hop, no queue: latency is the feature.
    for (const fn of listeners) { try { fn(ev); } catch { /* one bad listener can't break the hit path */ } }
  };
}

function bindAll(): void {
  if (!access) return;
  access.inputs.forEach((input) => bindInput(input));
  // Opening an output is what makes it usable; ports arrive closed.
  access.outputs.forEach((o) => { if (o.state === 'connected' && o.connection === 'closed') void o.open?.(); });
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

export interface MidiDeviceInfo { name: string; type: ReturnType<typeof detectDeviceType> }

export function midiStatus(): { supported: boolean; connected: MidiDeviceInfo[] } {
  const connected: MidiDeviceInfo[] = [];
  access?.inputs.forEach((i) => {
    if (i.state === 'connected') {
      const name = i.name || i.id;
      connected.push({ name, type: detectDeviceType(name) });
    }
  });
  return { supported: 'requestMIDIAccess' in navigator, connected };
}

/** Force the access request now (so the UI can show devices before any note is played). */
export function ensureMidi(): void {
  void ensureAccess();
}

/** Subscribe to the activity meter — the DAW-style blink. */
export function subscribeMidiActivity(fn: ActivityListener): () => void {
  activity.add(fn);
  void ensureAccess();
  return () => { activity.delete(fn); };
}

/** Called by the router once an event has actually produced an action. */
export function noteMidiRouted(note?: number): void {
  ping({ dir: 'in', routed: true, note });
}

// ── output ───────────────────────────────────────────────────────────────────
//
// There was no output path at all before this. Melos could be played BY a controller and could
// not play anything else — so a hardware synth or a second DAW sitting next to it heard nothing.
// Every connected output is opened and fed; picking one port would be a preference nobody asked
// for, and "all of them" is what auto-routed means.

let sendOut = true;

/** Whether notes Melos plays are mirrored to the MIDI outputs. */
export function midiOutEnabled(): boolean { return sendOut; }
export function setMidiOut(on: boolean): void { sendOut = on; }

export function midiOutputs(): string[] {
  const names: string[] = [];
  access?.outputs.forEach((o) => { if (o.state === 'connected') names.push(o.name || o.id); });
  return names;
}

function sendAll(bytes: number[], note?: number): void {
  if (!sendOut || !access) return;
  let sent = false;
  access.outputs.forEach((o) => {
    if (o.state !== 'connected') return;
    try { o.send(bytes); sent = true; } catch { /* a closed port must not break the note */ }
  });
  if (sent) ping({ dir: 'out', routed: true, note });
}

export function midiSendNoteOn(note: number, velocity127: number, channel = 0): void {
  sendAll([0x90 | (channel & 0x0f), note & 0x7f, Math.max(1, Math.min(127, Math.round(velocity127))) & 0x7f], note);
}

export function midiSendNoteOff(note: number, channel = 0): void {
  sendAll([0x80 | (channel & 0x0f), note & 0x7f, 0], note);
}

/** Panic — every note off on every channel. Worth having the moment you can send at all. */
export function midiSendAllOff(): void {
  if (!access) return;
  for (let ch = 0; ch < 16; ch++) sendAll([0xb0 | ch, 123, 0]);
}
