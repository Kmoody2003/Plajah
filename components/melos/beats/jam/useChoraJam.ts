// Live jam for a SHARED Chora groove: everyone in the project plays, records and brings their rig.
//
// The groove itself syncs through coedit (clips, notes, mixer). This hook adds the performance layer:
//   • JamSession mesh (`jam_{projectId}`): live MIDI, transport follow, remote audio inputs, "who's
//     recording", and control messages to an input's owner (arm / disarm / record);
//   • the rig: what I bring (RigShares, all off by default) — this device's inputs, MIDI, presets,
//     KERA programs and Melos samples; everyone else's rigs; requests for items;
//   • takes: Live (shared the moment you stop) or Commit (kept in the local Takes tray until you
//     commit). A take records a 24-bit WAV master + Opus proxy at once and lands in the asset ledger;
//     its clip plays `ledger:{assetId}` — proxy first, master once it syncs on a good link.
//
// Desktop (WinUI native engine): capture, monitoring and MIDI timing should be owned by the native
// engine there (ASIO/WASAPI + native MIDI clock); this browser path uses getUserMedia/WebAudio and
// setTimeout scheduling, which is fine for monitoring and collab copies but not sample-accurate.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../../../../services/firebase';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { JamSession, TakeRecorder, JAM_JITTER_MS, jamNow, type JamControl, type JamRecordingState, type RecordMode } from '../../../../services/melos/jam/jamSession';
import {
  bestTier, contributeAsset, onUploadProgress, resolveAsset, subscribeAssets, type SharedAsset, type UploadProgress,
} from '../../../../services/coedit/assets';
import {
  NO_SHARES, answerRequest, discoverLocalHardware, parseInputRef, publishRig, requestItem, subscribeRequestsToMe, subscribeRigs, withdrawRig,
  type AssetRequest, type Rig, type RigInput, type RigItem, type RigShares,
} from '../../../../services/coedit/rig';
import type { UseCoedit } from '../../../../hooks/useCoedit';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { firstEmptyPadIndex } from '../../../../services/melos/beats/grooveDoc';
import {
  applyArrivedPreset, audioPeaks, chorasRigItems, contributionFor, delTrayTake, getTrayTake, ledgerAssetId, ledgerKey, ledgerKeysIn,
  listTrayTakes, placeLedgerClip, putTrayTake, replacedTakeAt, type RecordedNote, type TrayTake,
} from '../../../../services/melos/beats/jamLink';
import { pushTrackPatch } from '../../../../services/melos/beats/presetHub';
import type { MelosSampleRef } from '../melosSamples';

export type LedgerTier = 'local' | 'proxy' | 'master' | 'waiting' | 'error';

export interface JamGhost extends JamRecordingState { peer: string; name: string }
export interface InputUse { uid: string; name: string; inputId: string; trackId: string }

interface ActiveTake {
  trackId: string;
  startBeat: number;
  mode: RecordMode;
  takeId: string;
  /** Recording on someone else's input — their client records the master. */
  remote?: { to: string; inputId: string };
  recorder?: TakeRecorder;
  /** A private (commit-mode) capture stream we opened and must close. */
  privateStream?: MediaStream;
  /** Recording because a collaborator asked (rec-start on my input). */
  forPeer?: string;
}

const MUSIC_AUDIO = (deviceId: string): MediaTrackConstraints => ({
  deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: { ideal: 2 },
});
const APPLIED_KEY = 'chora.jam.appliedAssets.v1';
const readApplied = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(APPLIED_KEY) || '[]') as string[]); } catch { return new Set(); } };
const writeApplied = (s: Set<string>) => { try { localStorage.setItem(APPLIED_KEY, JSON.stringify([...s].slice(-500))); } catch { /* private mode */ } };

export function useChoraJam(input: {
  co: UseCoedit<GrooveDoc>;
  rev: number;
  getDoc: () => GrooveDoc;
  mutate: (fn: (d: GrooveDoc) => void) => void;
  melosSamples?: MelosSampleRef[];
  songStartBeats: number;
  setSongStartBeats: (b: number) => void;
  running: boolean;
  flash: (msg: string) => void;
}) {
  const { co, rev, getDoc, mutate, flash } = input;
  const projectId = co.isShared ? co.projectId : null;
  const me = auth.currentUser?.uid ?? '';
  const myFirst = (auth.currentUser?.displayName || 'Me').split(' ')[0];

  const jamRef = useRef<JamSession | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [peers, setPeers] = useState<Array<{ id: string; name?: string }>>([]);
  const [shares, setSharesState] = useState<RigShares>(NO_SHARES);
  const sharesRef = useRef(shares);
  sharesRef.current = shares;
  const [hw, setHw] = useState<{ audioInputs: RigInput[]; midiInputs: RigInput[] }>({ audioInputs: [], midiInputs: [] });
  const [rigs, setRigs] = useState<Rig[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [usingMine, setUsingMine] = useState<InputUse[]>([]);
  const usingMineRef = useRef(usingMine);
  usingMineRef.current = usingMine;
  const streamingDevice = useRef<string | null>(null);
  const [recMode, setRecMode] = useState<RecordMode>('live');
  const [take, setTake] = useState<ActiveTake | null>(null);
  const takeRef = useRef<ActiveTake | null>(null);
  const [ghosts, setGhosts] = useState<Record<string, JamGhost>>({});
  const [tray, setTray] = useState<TrayTake[]>([]);
  const [assets, setAssets] = useState<SharedAsset[]>([]);
  const [tiers, setTiers] = useState<Record<string, LedgerTier>>({});
  const loadedTier = useRef(new Map<string, LedgerTier>());
  const [progress, setProgress] = useState<Record<string, UploadProgress>>({});
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const handledRequests = useRef(new Set<string>());
  const midiTake = useRef<{ trackId: string; startBeat: number; notes: Array<{ rec: RecordedNote; endBeats: number }> } | null>(null);
  const transportSuppressUntil = useRef(0);

  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const melosSamplesRef = useRef(input.melosSamples ?? []);
  melosSamplesRef.current = input.melosSamples ?? [];
  const setSongStartRef = useRef(input.setSongStartBeats);
  setSongStartRef.current = input.setSongStartBeats;

  const refreshTray = useCallback(async () => { if (projectId) setTray(await listTrayTakes(projectId)); }, [projectId]);
  useEffect(() => { void refreshTray(); }, [refreshTray]);

  // ── ledger: subscription, upload progress, hydration ─────────────────────
  useEffect(() => {
    if (!projectId) { setAssets([]); return; }
    return subscribeAssets(projectId, setAssets);
  }, [projectId]);
  useEffect(() => onUploadProgress((p) => setProgress((cur) => ({ ...cur, [p.assetId]: p }))), []);

  // Clips/pads that play ledger assets: fetch the best tier this device should play and hand the
  // decoded buffer to the engine; upgrade proxy → master when the master lands on a good link.
  useEffect(() => {
    if (!projectId) return;
    const keys = ledgerKeysIn(getDoc());
    if (!keys.length) return;
    let cancelled = false;
    void (async () => {
      const engine = BeatsEngine.get();
      await engine.init().catch(() => { /* pre-gesture: retried on the next change */ });
      const ctx = engine.getContext();
      if (!ctx) return;
      for (const key of keys) {
        const id = ledgerAssetId(key)!;
        const asset = assetsById.get(id);
        if (!asset) continue;
        const want = bestTier(asset);
        const have = loadedTier.current.get(id);
        const upgrade = have === 'proxy' && want === 'master';
        if (!want) { if (!have) setTiers((t) => ({ ...t, [id]: 'waiting' })); continue; }
        if (have && have !== 'waiting' && have !== 'error' && !upgrade && engine.hasSampleBuffer(key)) continue;
        try {
          const got = await resolveAsset(asset);
          if (cancelled) return;
          if (!got) { setTiers((t) => ({ ...t, [id]: 'waiting' })); continue; }
          const buf = await ctx.decodeAudioData(await got.blob.arrayBuffer());
          engine.setSampleBuffer(key, buf);
          loadedTier.current.set(id, got.tier);
          setTiers((t) => ({ ...t, [id]: got.tier }));
        } catch (e) {
          console.warn('[jam] ledger asset failed', asset.name, e);
          loadedTier.current.set(id, 'error');
          setTiers((t) => ({ ...t, [id]: 'error' }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, assetsById, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Items I asked for: land them in the song when their asset arrives.
  useEffect(() => {
    if (!projectId || !me) return;
    const applied = readApplied();
    for (const a of assets) {
      const reqBy = (a.data as { requestedBy?: string } | undefined)?.requestedBy;
      if (reqBy !== me || applied.has(`${projectId}:${a.id}`)) continue;
      applied.add(`${projectId}:${a.id}`);
      writeApplied(applied);
      if (a.kind === 'preset' || a.kind === 'instrument') {
        let trackId: string | null = null;
        mutate((d) => { trackId = applyArrivedPreset(d, a); });
        if (trackId) { pushTrackPatch(trackId); flash(`${a.ownerName.split(' ')[0]}'s ${a.name} is on a new track`); }
      } else if (a.kind === 'sample') {
        mutate((d) => {
          const idx = firstEmptyPadIndex(d.kit);
          const p = idx >= 0 ? d.kit[idx] : null;
          if (!p) return;
          p.source = 'sample';
          p.sample = { key: ledgerKey(a.id), name: a.name, durationSec: a.durationSec ?? 0 };
          p.name = a.name.slice(0, 18);
          p.empty = false;
        });
        flash(`${a.ownerName.split(' ')[0]}'s ${a.name} is on a pad`);
      }
    }
  }, [assets, projectId, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── rigs + requests ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) { setRigs([]); return; }
    return subscribeRigs(projectId, setRigs);
  }, [projectId]);

  const fulfil = useCallback(async (r: AssetRequest) => {
    if (!projectId) return;
    handledRequests.current.add(r.id);
    try {
      const input2 = await contributionFor(r.item, r.from, melosSamplesRef.current);
      if (!input2) { await answerRequest(projectId, r.id, { status: 'declined' }); return; }
      const asset = await contributeAsset(projectId, input2);
      await answerRequest(projectId, r.id, { status: 'fulfilled', assetId: asset.id });
      flash(`Shared ${r.item.name} with ${r.fromName.split(' ')[0]}`);
    } catch (e) {
      handledRequests.current.delete(r.id);
      flash(e instanceof Error ? e.message : 'Could not share that item');
    }
  }, [projectId, flash]);
  const decline = useCallback(async (r: AssetRequest) => {
    if (!projectId) return;
    handledRequests.current.add(r.id);
    await answerRequest(projectId, r.id, { status: 'declined' }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !me) { setRequests([]); return; }
    return subscribeRequestsToMe(projectId, (all) => {
      const pending = all.filter((r) => r.status === 'pending' && !handledRequests.current.has(r.id));
      if (sharesRef.current.autoApprove) { pending.forEach((r) => void fulfil(r)); setRequests([]); }
      else setRequests(pending);
    });
  }, [projectId, me, fulfil]);

  const requestRigItem = useCallback(async (rig: Rig, item: RigItem, category: 'preset' | 'instrument' | 'library') => {
    if (!projectId) return;
    await requestItem(projectId, rig.uid, { ...item, category });
    flash(rig.shares.autoApprove ? `Getting ${item.name} from ${rig.name.split(' ')[0]}…` : `Asked ${rig.name.split(' ')[0]} for ${item.name}`);
  }, [projectId, flash]);

  // ── what I bring ─────────────────────────────────────────────────────────
  const publish = useCallback(async (s: RigShares, h: typeof hw) => {
    if (!projectId || !jamRef.current) return;
    const items = chorasRigItems(melosSamplesRef.current);
    // TODO(desktop): host 'desktop' when running inside the WinUI app, with native ASIO inputs.
    await publishRig(projectId, { host: 'browser', shares: s, audioInputs: h.audioInputs, midiInputs: h.midiInputs, ...items }).catch(() => {});
  }, [projectId]);

  const setShares = useCallback(async (next: RigShares) => {
    let h = hw;
    // Permission prompts only when inputs or MIDI are switched ON (labels need mic permission).
    if ((next.inputs && !sharesRef.current.inputs) || (next.midi && !sharesRef.current.midi)) {
      h = await discoverLocalHardware({ askPermission: true });
      setHw(h);
    }
    setSharesState(next);
    if (!next.inputs && streamingDevice.current) {
      await jamRef.current?.streamInput(null).catch(() => null);
      streamingDevice.current = null;
      setUsingMine([]);
    }
    await publish(next, h);
  }, [hw, publish]);

  /** Read this device's inputs (asks permission) without sharing them — for my own track inputs. */
  const discoverMine = useCallback(async () => {
    const h = await discoverLocalHardware({ askPermission: true });
    setHw(h);
    if (joined) await publish(sharesRef.current, h);
    return h;
  }, [joined, publish]);

  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => void publish(sharesRef.current, hw), 4 * 60_000); // keep the rig fresh
    return () => clearInterval(t);
  }, [joined, hw, publish]);

  // ── the mesh ─────────────────────────────────────────────────────────────
  const engineTrack = (trackId: string) => getDoc().arrangement.find((t) => t.id === trackId) ?? null;

  const playNote = useCallback((trackId: string, data: number[]) => {
    const t = engineTrack(trackId);
    if (!t || t.kind !== 'instrument') return;
    const engine = BeatsEngine.get();
    const status = data[0] & 0xf0;
    if (status === 0x90 && data[2] > 0) void engine.ensureInstrument(t).then(() => engine.instrumentNoteOn(t, data[1], data[2]));
    else if (status === 0x80 || status === 0x90) engine.instrumentNoteOff(t, data[1]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const streamMine = useCallback(async (deviceId: string | null) => {
    const jam = jamRef.current;
    if (!jam) return null;
    if (streamingDevice.current === deviceId) return jam.liveInput;
    const s = await jam.streamInput(deviceId);
    streamingDevice.current = deviceId;
    return s;
  }, []);

  const finishTakeRef = useRef<(res: Awaited<ReturnType<TakeRecorder['stop']>>, a: ActiveTake) => Promise<void>>(async () => {});
  const startLocalTakeRef = useRef<(a: Omit<ActiveTake, 'takeId'> & { deviceId: string }) => Promise<void>>(async () => {});
  const stopTakeRef = useRef<() => Promise<void>>(async () => {});

  const onControl = useCallback(async (_peer: string, c: JamControl) => {
    const who = (c.byName || 'Someone').split(' ')[0];
    if (c.kind === 'arm') {
      if (!sharesRef.current.inputs) { flash(`${who} asked to use your input — turn on "Inputs" under What I bring`); return; }
      try {
        await streamMine(c.inputId);
        setUsingMine((u) => [...u.filter((x) => !(x.uid === _peer && x.trackId === c.trackId)), { uid: _peer, name: c.byName || 'Someone', inputId: c.inputId, trackId: c.trackId }]);
      } catch { flash('Could not open that input'); }
    } else if (c.kind === 'disarm') {
      const left = usingMineRef.current.filter((x) => !(x.uid === _peer && x.inputId === c.inputId));
      setUsingMine(left);
      if (!left.length && !takeRef.current) await streamMine(null);
    } else if (c.kind === 'rec-start') {
      if (!sharesRef.current.inputs) return;
      await startLocalTakeRef.current({ trackId: c.trackId, deviceId: c.inputId, mode: c.mode ?? 'live', startBeat: c.startBeat ?? 0, forPeer: _peer });
    } else if (c.kind === 'rec-stop') {
      if (takeRef.current?.forPeer === _peer) await stopTakeRef.current();
    }
  }, [flash, streamMine]);

  const onControlRef = useRef(onControl);
  onControlRef.current = onControl;
  const playNoteRef = useRef(playNote);
  playNoteRef.current = playNote;

  const join = useCallback(async () => {
    if (!projectId || jamRef.current) return;
    setJoining(true);
    const jam = new JamSession(projectId, {
      onMidi: (_peer, ev, playAt) => {
        setTimeout(() => playNoteRef.current(ev.trackId, ev.data), Math.max(0, playAt - jamNow()));
      },
      onTransport: (_peer, t, localAt) => {
        const engine = BeatsEngine.get();
        transportSuppressUntil.current = jamNow() + 800;
        if (t.playing) {
          const fromBeats = t.beat + ((jamNow() - localAt) / 60_000) * (t.bpm || 120);
          void engine.init().then(() => engine.play('song', { fromBeats: Math.max(0, fromBeats) }));
        } else {
          if (engine.isRunning()) engine.stop();
          setSongStartRef.current(Math.max(0, t.beat));
        }
      },
      onRemoteAudio: (peer, stream) => setRemoteStreams((cur) => {
        const next = new Map(cur);
        if (stream) next.set(peer, stream); else next.delete(peer);
        return next;
      }),
      onRecording: (peer, r) => setGhosts((cur) => {
        const next = { ...cur };
        const name = peersRef.current.find((p) => p.id === peer)?.name || rigsRef.current.find((x) => x.uid === peer)?.name || 'Someone';
        if (r.state === 'recording') next[peer] = { ...r, peer, name };
        else delete next[peer];
        return next;
      }),
      onPeers: (p) => setPeers(p.map((x) => ({ id: x.id, name: x.name }))),
      onControl: (peer, c) => void onControlRef.current(peer, c),
      onError: (e) => flash(e.message),
    });
    jamRef.current = jam;
    try {
      await jam.join();
      setJoined(true);
      await publish(sharesRef.current, hw);
    } catch (e) {
      jamRef.current = null;
      flash(e instanceof Error ? e.message : 'Could not join the jam');
    } finally { setJoining(false); }
  }, [projectId, hw, publish, flash]);

  const peersRef = useRef(peers);
  peersRef.current = peers;
  const rigsRef = useRef(rigs);
  rigsRef.current = rigs;

  const leave = useCallback(async () => {
    const jam = jamRef.current;
    jamRef.current = null;
    setJoined(false);
    setPeers([]);
    setRemoteStreams(new Map());
    setUsingMine([]);
    setGhosts({});
    streamingDevice.current = null;
    if (projectId) await withdrawRig(projectId);
    await jam?.leave().catch(() => {});
  }, [projectId]);

  // Leaving the shared project (unshare / other groove / unmount) leaves the jam.
  useEffect(() => () => { void jamRef.current?.leave(); jamRef.current = null; }, [projectId]);
  useEffect(() => { if (!projectId && joined) void leave(); }, [projectId, joined, leave]);

  // ── remote inputs → track strips ─────────────────────────────────────────
  const monitors = useRef(new Map<string, { stream: MediaStream; off: () => void; el: HTMLAudioElement }>());
  useEffect(() => {
    const engine = BeatsEngine.get();
    const want = new Map<string, MediaStream>();
    for (const t of getDoc().arrangement) {
      const ref = t.jamInput ? parseInputRef(t.jamInput) : null;
      if (!ref || ref.uid === me) continue;
      const s = remoteStreams.get(ref.uid);
      if (s) want.set(t.id, s);
    }
    for (const [trackId, m] of monitors.current) {
      if (want.get(trackId) !== m.stream) { m.off(); m.el.srcObject = null; monitors.current.delete(trackId); }
    }
    for (const [trackId, stream] of want) {
      if (monitors.current.has(trackId)) continue;
      // Chromium only pulls audio from a remote WebRTC stream into WebAudio while a media element
      // plays it — a muted element keeps the pipe flowing without double monitoring.
      const el = new Audio();
      el.muted = true;
      el.srcObject = stream;
      void el.play().catch(() => {});
      const off = engine.connectLiveInput(trackId, stream);
      if (off) monitors.current.set(trackId, { stream, off, el });
      else el.srcObject = null;
    }
  }, [remoteStreams, rev, me]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const m of monitors.current.values()) { m.off(); m.el.srcObject = null; } monitors.current.clear(); }, []);

  /** Pick a track's input: one of mine, someone's shared input (`uid:inputId`), or none. */
  const setTrackInput = useCallback((trackId: string, ref: string | null) => {
    const prev = engineTrack(trackId)?.jamInput;
    const prevRef = prev ? parseInputRef(prev) : null;
    mutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      if (!t) return;
      if (ref) t.jamInput = ref; else delete t.jamInput;
    });
    const jam = jamRef.current;
    if (prevRef && prevRef.uid !== me) jam?.sendControl({ kind: 'disarm', to: prevRef.uid, inputId: prevRef.inputId, trackId });
    const next = ref ? parseInputRef(ref) : null;
    if (next && next.uid !== me) {
      if (!jam) flash('Join the jam to hear remote inputs');
      jam?.sendControl({ kind: 'arm', to: next.uid, inputId: next.inputId, trackId });
    }
  }, [mutate, me, flash]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── transport follow ─────────────────────────────────────────────────────
  const wasRunning = useRef(input.running);
  useEffect(() => {
    const jam = jamRef.current;
    if (wasRunning.current === input.running) return;
    wasRunning.current = input.running;
    if (!jam || jamNow() < transportSuppressUntil.current) return;
    jam.sendTransport({ playing: input.running, beat: BeatsEngine.get().posBeats(), bpm: getDoc().bpm });
  }, [input.running]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const jam = jamRef.current;
    if (!jam || input.running || jamNow() < transportSuppressUntil.current) return;
    jam.sendTransport({ playing: false, beat: input.songStartBeats, bpm: getDoc().bpm }); // locate
  }, [input.songStartBeats]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── MIDI from my controller ──────────────────────────────────────────────
  /** Note from a local controller: shared with the jam, and sounded here JAM_JITTER_MS later so we
   *  land together. Returns false when not jamming (caller plays it immediately as usual). */
  const sendNote = useCallback((trackId: string, on: boolean, note: number, vel: number, play: () => void): boolean => {
    const jam = jamRef.current;
    if (!jam) return false;
    const t = jamNow();
    jam.sendMidi(trackId, [on ? 0x90 : 0x80, note & 0x7f, on ? vel & 0x7f : 0], t);
    setTimeout(play, JAM_JITTER_MS);
    return true;
  }, []);

  /** Commit-mode MIDI: notes collect locally (Live mode writes them into the clip as played). */
  const captureMidiNote = useCallback((trackId: string, rec: RecordedNote, endBeats: number): boolean => {
    if (recMode !== 'commit' || !jamRef.current) return false;
    if (!midiTake.current || midiTake.current.trackId !== trackId) midiTake.current = { trackId, startBeat: rec.startBeats, notes: [] };
    midiTake.current.notes.push({ rec, endBeats });
    return true;
  }, [recMode]);

  const flushMidiTake = useCallback(async () => {
    const m = midiTake.current;
    midiTake.current = null;
    if (!m || !m.notes.length || !projectId) return;
    const t = engineTrack(m.trackId);
    await putTrayTake({
      id: `midi_${Date.now().toString(36)}`, projectId, trackId: m.trackId, trackName: t?.name || 'Track', kind: 'midi',
      startBeat: m.startBeat, createdAt: Date.now(), notes: m.notes,
    });
    await refreshTray();
    flash(`MIDI take kept in your Takes tray — commit it when you're happy`);
  }, [projectId, refreshTray, flash]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── audio takes ──────────────────────────────────────────────────────────
  const commitAudio = useCallback(async (t: { master: Blob; proxy?: Blob | null; durationSec: number; sampleRate: number; channels: number; trackId: string; startBeat: number; name: string }) => {
    if (!projectId) return;
    const versionOf = replacedTakeAt(getDoc(), t.trackId, t.startBeat) ?? undefined;
    const asset = await contributeAsset(projectId, {
      kind: 'take',
      name: t.name,
      master: t.master,
      masterInfo: { codec: 'wav', bitDepth: 24, sampleRate: t.sampleRate, channels: t.channels },
      ...(t.proxy ? { proxy: t.proxy, proxyInfo: { codec: 'opus', kbps: 96 } } : {}),
      durationSec: t.durationSec,
      ...(versionOf ? { versionOf } : {}),
      source: { device: 'browser' },
    });
    let peaks: number[] | undefined;
    const engine = BeatsEngine.get();
    const ctx = engine.getContext();
    if (ctx) {
      try {
        const buf = await ctx.decodeAudioData(await t.master.arrayBuffer());
        engine.setSampleBuffer(ledgerKey(asset.id), buf);
        loadedTier.current.set(asset.id, 'local');
        setTiers((x) => ({ ...x, [asset.id]: 'local' }));
        peaks = audioPeaks(buf);
      } catch { /* the hydrator retries */ }
    }
    mutate((d) => { placeLedgerClip(d, t.trackId, { assetId: asset.id, name: t.name, startBeat: t.startBeat, durationSec: t.durationSec, peaks }); });
  }, [projectId, mutate]); // eslint-disable-line react-hooks/exhaustive-deps

  startLocalTakeRef.current = async (a) => {
    const jam = jamRef.current;
    if (takeRef.current) return;
    try {
      let stream: MediaStream | null;
      let privateStream: MediaStream | undefined;
      if (a.mode === 'live' && jam) stream = await streamMine(a.deviceId); // everyone hears it as it's played
      else if (streamingDevice.current === a.deviceId && jam?.liveInput) stream = jam.liveInput;
      else { stream = await navigator.mediaDevices.getUserMedia({ audio: MUSIC_AUDIO(a.deviceId) }); privateStream = stream; }
      if (!stream) throw new Error('No input stream');
      const recorder = new TakeRecorder(stream);
      await recorder.start();
      const next: ActiveTake = { ...a, takeId: recorder.takeId, recorder, privateStream };
      takeRef.current = next;
      setTake(next);
      jam?.announceRecording({ trackId: a.trackId, takeId: recorder.takeId, mode: a.mode, state: 'recording', startBeat: a.startBeat });
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not start recording');
    }
  };

  finishTakeRef.current = async (res, a) => {
    const t = engineTrack(a.trackId);
    const n = (getDoc().arrangement.find((x) => x.id === a.trackId)?.clips.length ?? 0) + 1;
    const name = `${myFirst} · ${t?.name || 'Take'} ${n}`;
    if (a.mode === 'live') {
      await commitAudio({ ...res, trackId: a.trackId, startBeat: a.startBeat, name });
      jamRef.current?.announceRecording({ trackId: a.trackId, takeId: a.takeId, mode: a.mode, state: 'committed', startBeat: a.startBeat });
    } else if (projectId) {
      await putTrayTake({
        id: res.takeId, projectId, trackId: a.trackId, trackName: t?.name || 'Track', kind: 'audio', startBeat: a.startBeat, createdAt: Date.now(),
        master: res.master, proxy: res.proxy, durationSec: res.durationSec, sampleRate: res.sampleRate, channels: res.channels,
      });
      await refreshTray();
      flash('Take kept in your Takes tray (full quality) — commit or discard it');
    }
  };

  stopTakeRef.current = async () => {
    const a = takeRef.current;
    if (!a) return;
    takeRef.current = null;
    setTake(null);
    const jam = jamRef.current;
    if (a.remote) {
      jam?.sendControl({ kind: 'rec-stop', to: a.remote.to, inputId: a.remote.inputId, trackId: a.trackId });
      return;
    }
    if (!a.recorder) return;
    const res = await a.recorder.stop();
    a.privateStream?.getTracks().forEach((x) => x.stop());
    jam?.announceRecording({ trackId: a.trackId, takeId: a.takeId, mode: a.mode, state: 'stopped', startBeat: a.startBeat });
    if (!usingMineRef.current.length && a.mode === 'live' && !a.forPeer) await streamMine(null);
    await finishTakeRef.current(res, a);
  };

  /** Record a take on a track's input (mine, or ask the input's owner to record it). */
  const startTake = useCallback(async (trackId: string) => {
    const t = engineTrack(trackId);
    const ref = t?.jamInput ? parseInputRef(t.jamInput) : null;
    if (!t || !ref) { flash('Pick an input for this track first'); return; }
    const engine = BeatsEngine.get();
    let startBeat = engine.isRunning() ? engine.posBeats() : input.songStartBeats;
    if (!engine.isRunning()) {
      await engine.init();
      engine.play('song', { fromBeats: input.songStartBeats });
      startBeat = input.songStartBeats;
    }
    if (ref.uid === me) {
      await startLocalTakeRef.current({ trackId, deviceId: ref.inputId, mode: recMode, startBeat });
      return;
    }
    const jam = jamRef.current;
    if (!jam) { flash('Join the jam to record on a remote input'); return; }
    jam.sendControl({ kind: 'rec-start', to: ref.uid, inputId: ref.inputId, trackId, mode: recMode, startBeat });
    const a: ActiveTake = { trackId, startBeat, mode: recMode, takeId: `remote_${Date.now().toString(36)}`, remote: { to: ref.uid, inputId: ref.inputId } };
    takeRef.current = a;
    setTake(a);
  }, [recMode, me, flash, input.songStartBeats]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTake = useCallback(() => stopTakeRef.current(), []);

  const commitTray = useCallback(async (id: string) => {
    const t = await getTrayTake(id);
    if (!t) return;
    try {
      if (t.kind === 'audio' && t.master) {
        const n = (getDoc().arrangement.find((x) => x.id === t.trackId)?.clips.length ?? 0) + 1;
        await commitAudio({
          master: t.master, proxy: t.proxy, durationSec: t.durationSec ?? 0, sampleRate: t.sampleRate ?? 48000, channels: t.channels ?? 1,
          trackId: t.trackId, startBeat: t.startBeat, name: `${myFirst} · ${t.trackName} ${n}`,
        });
      } else if (t.kind === 'midi' && t.notes) {
        const { commitRecordedNote } = await import('../instrument/useInstrumentKeyboard');
        for (const n of t.notes) commitRecordedNote(t.trackId, n.rec, n.endBeats, mutate);
      }
      jamRef.current?.announceRecording({ trackId: t.trackId, takeId: t.id, mode: 'commit', state: 'committed', startBeat: t.startBeat });
      await delTrayTake(id);
      await refreshTray();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not commit the take');
    }
  }, [commitAudio, mutate, refreshTray, flash]); // eslint-disable-line react-hooks/exhaustive-deps

  const discardTray = useCallback(async (id: string) => {
    await delTrayTake(id);
    await refreshTray();
  }, [refreshTray]);

  /** Stop sharing my input with whoever is using it. */
  const stopSharingInput = useCallback(async (use?: InputUse) => {
    const left = use ? usingMineRef.current.filter((x) => x !== use) : [];
    setUsingMine(left);
    if (!left.length) await streamMine(null);
  }, [streamMine]);

  // Ledger assets this song plays, for the Takes view ("proxy" / "full quality" / "uploading").
  const songAssets = useMemo(() => {
    const ids = new Set(ledgerKeysIn(getDoc()).map((k) => ledgerAssetId(k)!));
    return assets.filter((a) => ids.has(a.id));
  }, [assets, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    projectId, active: !!projectId, joined, joining, join, leave, peers,
    shares, setShares, hw, discoverMine, rigs, requestRigItem, requests, fulfil, decline,
    remoteStreams, usingMine, stopSharingInput, setTrackInput,
    recMode, setRecMode, take, startTake, stopTake, ghosts, tray, commitTray, discardTray,
    sendNote, captureMidiNote, flushMidiTake,
    assets, songAssets, tiers, progress,
    isJamming: () => !!jamRef.current,
  };
}

export type ChoraJam = ReturnType<typeof useChoraJam>;
