// services/coedit/rig.ts — what each person brings to a shared session.
//
// When someone joins a shared project (browser or desktop app) their client can publish a "rig":
// the audio interfaces and inputs, MIDI controllers, instruments, presets and library they're willing
// to make part of the project. Nothing is shared without that person switching it on, per category.
// Others then see e.g. "Ana · Focusrite 2i2 (2 in) · Arturia KeyLab · Analog Lab presets" and can arm
// a track on Ana's input or ask for one of her presets/samples, which her client contributes to the
// project's asset ledger (assets.ts) when she allows it.
//
//   coedit/{projectId}/rigs/{uid_tab}        one per open session (like presence)
//   coedit/{projectId}/requests/{id}         "may I use your preset X?" → fulfilled / declined

import { addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, opsDb } from '../firebase';
import { COEDIT } from './project';

export interface RigShares {
  /** Audio inputs (interfaces, mics) may be armed by others: you stream them into the session. */
  inputs: boolean;
  /** MIDI controllers may play tracks for everyone. */
  midi: boolean;
  /** Instruments + presets may be used by the project (shared as data / samples on request). */
  instruments: boolean;
  /** Library and samples are browsable by others; using one contributes it to the project. */
  library: boolean;
  /** Fulfil requests automatically instead of asking each time. */
  autoApprove: boolean;
}

export const NO_SHARES: RigShares = { inputs: false, midi: false, instruments: false, library: false, autoApprove: false };

export interface RigInput {
  id: string;
  label: string;
  channels?: number;
}

export interface RigItem {
  id: string;
  name: string;
  kind?: string;
  /** Instrument a preset belongs to. */
  instrument?: string;
}

export interface Rig {
  key: string;
  uid: string;
  name: string;
  /** 'desktop' (WinUI app, native engine) or 'browser'. */
  host: 'desktop' | 'browser';
  at: number;
  shares: RigShares;
  audioInputs: RigInput[];
  midiInputs: RigInput[];
  instruments: RigItem[];
  presets: RigItem[];
  library: RigItem[];
}

const tab = Math.random().toString(36).slice(2, 7);
const rigsCol = (projectId: string) => collection(opsDb, COEDIT, projectId, 'rigs');

/** Reads this device's hardware (labels need mic permission; MIDI needs the Web MIDI prompt). */
export async function discoverLocalHardware(opts: { askPermission?: boolean } = {}): Promise<{ audioInputs: RigInput[]; midiInputs: RigInput[] }> {
  let audioInputs: RigInput[] = [];
  try {
    if (opts.askPermission) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    }
    const devs = await navigator.mediaDevices.enumerateDevices();
    audioInputs = devs
      .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Audio input ${i + 1}` }));
  } catch {
    /* no permission yet */
  }
  let midiInputs: RigInput[] = [];
  try {
    const nav = navigator as Navigator & { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<{ inputs: Map<string, { id: string; name?: string | null }> }> };
    if (nav.requestMIDIAccess && opts.askPermission) {
      const access = await nav.requestMIDIAccess({ sysex: false });
      midiInputs = [...access.inputs.values()].map((m) => ({ id: m.id, label: m.name || 'MIDI input' }));
    }
  } catch {
    /* MIDI unavailable or declined */
  }
  return { audioInputs, midiInputs };
}

/** Publishes (or refreshes) this session's rig. Only categories switched on are listed. */
export async function publishRig(projectId: string, rig: Omit<Rig, 'key' | 'uid' | 'name' | 'at'>): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to join the session.');
  const key = `${u.uid}_${tab}`;
  const s = rig.shares;
  const r: Omit<Rig, 'key'> = {
    uid: u.uid,
    name: u.displayName || 'Collaborator',
    at: Date.now(),
    host: rig.host,
    shares: s,
    audioInputs: s.inputs ? rig.audioInputs.slice(0, 32) : [],
    midiInputs: s.midi ? rig.midiInputs.slice(0, 32) : [],
    instruments: s.instruments ? rig.instruments.slice(0, 200) : [],
    presets: s.instruments ? rig.presets.slice(0, 500) : [],
    library: s.library ? rig.library.slice(0, 500) : [],
  };
  await setDoc(doc(rigsCol(projectId), key), r);
  return key;
}

export async function withdrawRig(projectId: string) {
  const u = auth.currentUser;
  if (u) await deleteDoc(doc(rigsCol(projectId), `${u.uid}_${tab}`)).catch(() => {});
}

export function subscribeRigs(projectId: string, cb: (rigs: Rig[]) => void): () => void {
  return onSnapshot(
    rigsCol(projectId),
    (s) => cb(s.docs.map((d) => ({ ...(d.data() as Omit<Rig, 'key'>), key: d.id })).filter((r) => Date.now() - r.at < 10 * 60_000)),
    () => cb([])
  );
}

/** A track input that lives on someone's machine: `${uid}:${inputId}`. */
export const remoteInputRef = (uid: string, inputId: string) => `${uid}:${inputId}`;
export const parseInputRef = (ref: string) => {
  const i = ref.indexOf(':');
  return i < 0 ? null : { uid: ref.slice(0, i), inputId: ref.slice(i + 1) };
};

// ── asking to use someone's preset / sample / instrument ────────────────────

export interface AssetRequest {
  id: string;
  from: string;
  fromName: string;
  to: string;
  item: RigItem & { category: 'preset' | 'instrument' | 'library' };
  status: 'pending' | 'fulfilled' | 'declined';
  /** Set when fulfilled: the ledger asset id (assets.ts). */
  assetId?: string;
  at: number;
}

export async function requestItem(projectId: string, to: string, item: AssetRequest['item']): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  await addDoc(collection(opsDb, COEDIT, projectId, 'requests'), {
    from: u.uid,
    fromName: u.displayName || 'Collaborator',
    to,
    item: JSON.parse(JSON.stringify(item)),
    status: 'pending',
    at: Date.now(),
  });
}

/** Requests addressed to me (my client fulfils them, automatically when I allowed it). */
export function subscribeRequestsToMe(projectId: string, cb: (r: AssetRequest[]) => void): () => void {
  const u = auth.currentUser;
  if (!u) return () => {};
  return onSnapshot(
    query(collection(opsDb, COEDIT, projectId, 'requests'), where('to', '==', u.uid)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AssetRequest, 'id'>) }))),
    () => cb([])
  );
}

export async function answerRequest(projectId: string, id: string, answer: { status: 'fulfilled'; assetId: string } | { status: 'declined' }) {
  await updateDoc(doc(opsDb, COEDIT, projectId, 'requests', id), answer);
}
