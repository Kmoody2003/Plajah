/**
 * useRtcSession — the single React entry point to the rtcCore backbone.
 *
 * Every real-time surface (live broadcast/viewer, 1:1 + group calls, video
 * rooms, talk rooms) uses this one hook. Pick a topology + role; get back the
 * local stream, a map of remote streams keyed by peer, the participant list,
 * and the standard controls.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RtcSession, RtcSessionConfig, RtcParticipant, RtcDataMessage, RtcRole,
} from '../services/rtcCore';
import { SessionRecorder, SessionRecorderOptions } from '../services/sessionRecorder';

/** A remote peer's stream WITH its identity — the join of remoteStreams × participants. This is
 *  what lets a consumer tell the host apart from guests (e.g. the Reello viewer renders the host's
 *  stream as the main video and each 'participant' as a guest tile) instead of guessing "first". */
export interface RemotePeer {
  peerId: string;
  stream: MediaStream;
  role?: RtcRole;
  name?: string;
}

export interface UseRtcSession {
  localStream: MediaStream | null;
  /** peerId → MediaStream */
  remoteStreams: Map<string, MediaStream>;
  /** remote streams joined with per-peer role/name (host vs participant/guest vs …). */
  remotePeers: RemotePeer[];
  participants: RtcParticipant[];
  /** peerId → connection state */
  peerStates: Map<string, RTCPeerConnectionState>;
  error: string | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  sharingScreen: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  /** Explicit setters (e.g. doc-driven mute in Spaces/talk rooms). */
  setAudio: (on: boolean) => void;
  setVideo: (on: boolean) => void;
  /** Recording → content flywheel. stopRecording resolves the captured Blob. */
  isRecording: boolean;
  startRecording: (opts?: SessionRecorderOptions) => boolean;
  stopRecording: () => Promise<Blob | null>;
  /** Low-latency data channel: reactions, polls, synced playback, cursors, etc. */
  sendData: (type: string, payload?: any) => void;
  switchCamera: (facing: 'user' | 'environment') => void;
  /** Cycle to the next physical camera (front → back → back-wide → …). Resolves
   *  to the new camera's facingMode (when known) + whether the preview should mirror. */
  cycleCamera: () => Promise<{ facingMode?: 'user' | 'environment'; mirror: boolean }>;
  /** The next physical camera as its OWN stream, WITHOUT publishing it. Use this when
   *  something else owns the published track — the live composer adopts the returned
   *  stream while its canvas keeps streaming, which cycleCamera would clobber. Pass the
   *  deviceId currently on screen, since the session's own track may be the canvas. */
  nextCameraStream: (currentDeviceId?: string) => Promise<{ stream: MediaStream; facingMode?: 'user' | 'environment'; mirror: boolean }>;
  /** Publish an external video track (composited canvas) in place of the camera. */
  publishExternalVideo: (track: MediaStreamTrack) => Promise<void>;
  /** Publish an external audio track (voice-changer output) in place of the mic. */
  publishExternalAudio: (track: MediaStreamTrack) => Promise<void>;
  toggleScreenShare: () => void;
  leave: () => void;
  /** Available input/output devices (populated after join; refreshed on hot-plug). */
  devices: { cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };
  /** deviceIds currently being published (to highlight the active pick). */
  activeDevices: { cameraId?: string; micId?: string };
  refreshDevices: () => void;
  /** Hot-swap camera / mic to a specific device mid-call (no peer drop). */
  switchVideoDevice: (deviceId: string) => void;
  cameraStreamForDevice: (deviceId: string) => Promise<MediaStream>;
  switchAudioDevice: (deviceId: string) => void;
  /** Use desktop/system audio as the audio source (returns success). */
  useDesktopAudio: () => Promise<boolean>;
  /** Your own screen-share stream (for a local "your desktop" preview tile). */
  screenStream: MediaStream | null;
}

/** In-flight leaves per session path. A re-key (role change: listener → speaker) used to start the
 *  new join while the old leave() was still deleting the SAME participant doc id — so the delete
 *  could land after the new setDoc and erase the fresh presence. Joins now wait for it. */
const pendingLeaves = new Map<string, Promise<void>>();
function trackLeave(path: string, p: Promise<void>) {
  pendingLeaves.set(path, p);
  p.finally(() => { if (pendingLeaves.get(path) === p) pendingLeaves.delete(path); }).catch(() => {});
}

export function useRtcSession(
  config: RtcSessionConfig | null,
  opts: { autoJoin?: boolean; onData?: (peerId: string, msg: RtcDataMessage) => void; excludePeerIds?: string[]; allowedPeerIds?: string[]; onRecordingStopped?: (blob: Blob) => void } = { autoJoin: true },
): UseRtcSession {
  // Keep the latest onData without re-keying the session.
  const onDataRef = useRef(opts.onData);
  onDataRef.current = opts.onData;
  const onRecordingStoppedRef = useRef(opts.onRecordingStopped);
  onRecordingStoppedRef.current = opts.onRecordingStopped;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const emptySession = useRef({ remoteStreams: new Map<string, MediaStream>(), remotePeers: [] as RemotePeer[], participants: [] as RtcParticipant[], peerStates: new Map<string, RTCPeerConnectionState>() }).current;
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participants, setParticipants] = useState<RtcParticipant[]>([]);
  const [peerStates, setPeerStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }>({ cameras: [], mics: [], speakers: [] });
  const [activeDevices, setActiveDevices] = useState<{ cameraId?: string; micId?: string }>({});

  const sessionRef = useRef<RtcSession | null>(null);
  const enabledRef = useRef({ audio: true, video: true });
  enabledRef.current = { audio: audioEnabled, video: videoEnabled };
  const recorderRef = useRef<SessionRecorder | null>(null);
  // Latest streams, read by the recorder's provider each frame (so participants
  // joining/leaving mid-recording are captured automatically).
  const streamsRef = useRef<MediaStream[]>([]);
  // Stable key so we only rejoin when the actual session identity changes.
  // `revive` re-keys after the page is restored from the back/forward cache (pagehide tore the
  // session down; the restored page must rejoin instead of showing a dead room).
  const [revive, setRevive] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setRevive(n => n + 1); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  const sessionPath = config ? `${config.collectionName || 'rtc_sessions'}/${config.sessionId}` : '';
  const key = config ? `${sessionPath}/${config.role}/${config.topology}#${revive}` : null;

  useEffect(() => {
    if (!config || !key || opts.autoJoin === false) return;
    setActiveSessionKey(key);
    let cancelled = false;
    const priorLeave = pendingLeaves.get(sessionPath);
    const session = new RtcSession(config, {
      onLocalStream: s => { if (!cancelled) { s.getAudioTracks().forEach(t => { t.enabled = enabledRef.current.audio; }); s.getVideoTracks().forEach(t => { t.enabled = enabledRef.current.video; }); setLocalStream(s); } },
      onScreenStream: s => { if (!cancelled) { setScreenStream(s); setSharingScreen(!!s); } },
      onRemoteStream: (id, stream) => {
        if (cancelled) return;
        setRemoteStreams(prev => { const n = new Map(prev); n.set(id, stream); return n; });
      },
      onPeerLeft: id => {
        if (cancelled) return;
        setRemoteStreams(prev => { const n = new Map(prev); n.delete(id); return n; });
        setPeerStates(prev => { const n = new Map(prev); n.delete(id); return n; });
      },
      onParticipants: list => { if (!cancelled) setParticipants(list); },
      onPeerState: (id, state) => {
        if (cancelled) return;
        setPeerStates(prev => { const n = new Map(prev); n.set(id, state); return n; });
      },
      onData: (id, msg) => { if (!cancelled) onDataRef.current?.(id, msg); },
      onError: e => { if (!cancelled) setError(e.message); },
    });
    sessionRef.current = session;
    session.setExcludedPeers(opts.excludePeerIds || []);
    session.setAllowedPeers(opts.allowedPeerIds);
    (async () => {
      if (priorLeave) await priorLeave.catch(() => {});
      if (cancelled) return;
      await session.join();
    })().catch(e => {
      trackLeave(sessionPath, session.leave());
      if (!cancelled) { setLocalStream(null); setScreenStream(null); setRemoteStreams(new Map()); setParticipants([]); setError(e?.message || 'Failed to join'); }
    });

    return () => {
      cancelled = true;
      const recording = recorderRef.current;
      recorderRef.current = null;
      if (recording) recording.stop().then(blob => { if (blob) onRecordingStoppedRef.current?.(blob); }).catch(() => {});
      streamsRef.current = [];
      setIsRecording(false);
      trackLeave(sessionPath, session.leave());
      sessionRef.current = null;
      setRemoteStreams(new Map());
      setParticipants([]);
      setPeerStates(new Map());
      setLocalStream(null);
      setScreenStream(null);
      setSharingScreen(false);
      setError(null);
      setActiveSessionKey(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { sessionRef.current?.setExcludedPeers(opts.excludePeerIds || []); }, [opts.excludePeerIds]);
  useEffect(() => { sessionRef.current?.setAllowedPeers(opts.allowedPeerIds); }, [opts.allowedPeerIds]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => { const next = !prev; sessionRef.current?.setAudioEnabled(next); return next; });
  }, []);
  const toggleVideo = useCallback(() => {
    setVideoEnabled(prev => { const next = !prev; sessionRef.current?.setVideoEnabled(next); return next; });
  }, []);
  const switchCamera = useCallback((facing: 'user' | 'environment') => {
    sessionRef.current?.switchCamera(facing).catch(() => {}).finally(() => {
      setActiveDevices(sessionRef.current?.getActiveDevices() || {});
    });
  }, []);
  const cycleCamera = useCallback(async (): Promise<{ facingMode?: 'user' | 'environment'; mirror: boolean }> => {
    try {
      const res = await sessionRef.current?.cycleCamera();
      setActiveDevices(sessionRef.current?.getActiveDevices() || {});
      return res ?? { mirror: false };
    } catch { return { mirror: false }; }
  }, []);
  const nextCameraStream = useCallback(async (currentDeviceId?: string) => {
    // No silent fallback here: the caller adopts the returned stream into a live
    // composer, and handing back an empty one would blank the broadcast. Let it throw.
    const res = await sessionRef.current?.nextCameraStream(currentDeviceId);
    if (!res) throw new Error('No active session');
    setActiveDevices(sessionRef.current?.getActiveDevices() || {});
    return res;
  }, []);
  const publishExternalVideo = useCallback(async (track: MediaStreamTrack) => {
    await sessionRef.current?.publishExternalVideo(track);
  }, []);
  const publishExternalAudio = useCallback(async (track: MediaStreamTrack) => {
    await sessionRef.current?.publishExternalAudio(track);
  }, []);
  const refreshDevices = useCallback(() => {
    sessionRef.current?.listDevices().then(d => {
      setDevices(d);
      setActiveDevices(sessionRef.current?.getActiveDevices() || {});
    });
  }, []);
  const switchVideoDevice = useCallback((deviceId: string) => {
    sessionRef.current?.switchVideoDevice(deviceId).catch(() => {}).finally(() => {
      setActiveDevices(sessionRef.current?.getActiveDevices() || {});
    });
  }, []);
  const cameraStreamForDevice = useCallback(async (deviceId: string) => {
    if (!sessionRef.current) throw new Error('Camera session is not ready.');
    return sessionRef.current.cameraStreamForDevice(deviceId);
  }, []);
  const switchAudioDevice = useCallback((deviceId: string) => {
    sessionRef.current?.switchAudioDevice(deviceId).catch(() => {}).finally(() => {
      setActiveDevices(sessionRef.current?.getActiveDevices() || {});
    });
  }, []);
  const useDesktopAudio = useCallback(async () => {
    const ok = await (sessionRef.current?.useDesktopAudio() ?? Promise.resolve(false));
    setActiveDevices(sessionRef.current?.getActiveDevices() || {});
    return ok;
  }, []);

  // Populate the device list once we have a local stream (labels need permission),
  // and refresh whenever a device is plugged in / removed.
  useEffect(() => {
    if (!localStream) return;
    refreshDevices();
    const onChange = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [localStream, refreshDevices]);
  const toggleScreenShare = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setSharingScreen(prev => {
      if (prev) { s.stopScreenShare(); return false; }
      s.startScreenShare().then(ok => { if (!ok) setSharingScreen(false); });
      return true;
    });
  }, []);
  const setAudio = useCallback((on: boolean) => { sessionRef.current?.setAudioEnabled(on); setAudioEnabled(on); }, []);
  const setVideo = useCallback((on: boolean) => { sessionRef.current?.setVideoEnabled(on); setVideoEnabled(on); }, []);

  // Correlate each remote stream with its participant identity (role/name). Recomputed on any
  // stream/participant change — cheap, and the source of truth for "who is this stream?".
  const remotePeers: RemotePeer[] = Array.from(remoteStreams.entries()).map(([peerId, stream]) => {
    const p = participants.find(pp => pp.id === peerId);
    return { peerId, stream, role: p?.role, name: p?.name };
  });

  // Keep the recorder's stream source current.
  useEffect(() => {
    streamsRef.current = [localStream, ...remoteStreams.values()].filter(Boolean) as MediaStream[];
  }, [localStream, remoteStreams]);

  const startRecording = useCallback((opts?: SessionRecorderOptions) => {
    if (recorderRef.current?.recording) return true;
    const rec = new SessionRecorder(opts);
    const ok = rec.start(() => streamsRef.current);
    if (ok) { recorderRef.current = rec; setIsRecording(true); }
    return ok;
  }, []);

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return null;
    recorderRef.current = null;
    const blob = await rec.stop();
    setIsRecording(false);
    return blob;
  }, []);

  const sendData = useCallback((type: string, payload?: any) => {
    sessionRef.current?.sendData(type, payload);
  }, []);

  const leave = useCallback(() => {
    const recording = recorderRef.current;
    recorderRef.current = null;
    if (recording) recording.stop().then(blob => { if (blob) onRecordingStoppedRef.current?.(blob); }).catch(() => {});
    streamsRef.current = [];
    setIsRecording(false);
    const s = sessionRef.current;
    if (s) trackLeave(s.path, s.leave());
  }, []);

  return {
    localStream: activeSessionKey === key ? localStream : null,
    remoteStreams: activeSessionKey === key ? remoteStreams : emptySession.remoteStreams,
    remotePeers: activeSessionKey === key ? remotePeers : emptySession.remotePeers,
    participants: activeSessionKey === key ? participants : emptySession.participants,
    peerStates: activeSessionKey === key ? peerStates : emptySession.peerStates, error,
    audioEnabled, videoEnabled, sharingScreen,
    toggleAudio, toggleVideo, setAudio, setVideo, switchCamera, cycleCamera, nextCameraStream, cameraStreamForDevice, publishExternalVideo, publishExternalAudio, toggleScreenShare, leave,
    isRecording, startRecording, stopRecording, sendData,
    devices, activeDevices, refreshDevices, switchVideoDevice, switchAudioDevice,
    useDesktopAudio, screenStream: activeSessionKey === key ? screenStream : null,
  };
}
