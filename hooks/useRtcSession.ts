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
  RtcSession, RtcSessionConfig, RtcParticipant, RtcDataMessage,
} from '../services/rtcCore';
import { SessionRecorder, SessionRecorderOptions } from '../services/sessionRecorder';

export interface UseRtcSession {
  localStream: MediaStream | null;
  /** peerId → MediaStream */
  remoteStreams: Map<string, MediaStream>;
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
  /** Publish an external video track (composited canvas) in place of the camera. */
  publishExternalVideo: (track: MediaStreamTrack) => Promise<void>;
  toggleScreenShare: () => void;
  leave: () => void;
  /** Available input/output devices (populated after join; refreshed on hot-plug). */
  devices: { cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };
  /** deviceIds currently being published (to highlight the active pick). */
  activeDevices: { cameraId?: string; micId?: string };
  refreshDevices: () => void;
  /** Hot-swap camera / mic to a specific device mid-call (no peer drop). */
  switchVideoDevice: (deviceId: string) => void;
  switchAudioDevice: (deviceId: string) => void;
  /** Use desktop/system audio as the audio source (returns success). */
  useDesktopAudio: () => Promise<boolean>;
  /** Your own screen-share stream (for a local "your desktop" preview tile). */
  screenStream: MediaStream | null;
}

export function useRtcSession(
  config: RtcSessionConfig | null,
  opts: { autoJoin?: boolean; onData?: (peerId: string, msg: RtcDataMessage) => void } = { autoJoin: true },
): UseRtcSession {
  // Keep the latest onData without re-keying the session.
  const onDataRef = useRef(opts.onData);
  onDataRef.current = opts.onData;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
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
  const recorderRef = useRef<SessionRecorder | null>(null);
  // Latest streams, read by the recorder's provider each frame (so participants
  // joining/leaving mid-recording are captured automatically).
  const streamsRef = useRef<MediaStream[]>([]);
  // Stable key so we only rejoin when the actual session identity changes.
  const key = config ? `${config.collectionName || 'rtc_sessions'}/${config.sessionId}/${config.role}/${config.topology}` : null;

  useEffect(() => {
    if (!config || !key || opts.autoJoin === false) return;
    let cancelled = false;
    const session = new RtcSession(config, {
      onLocalStream: s => { if (!cancelled) setLocalStream(s); },
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
    session.join().catch(e => { if (!cancelled) setError(e?.message || 'Failed to join'); });

    return () => {
      cancelled = true;
      session.leave();
      sessionRef.current = null;
      setRemoteStreams(new Map());
      setParticipants([]);
      setPeerStates(new Map());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
  const publishExternalVideo = useCallback(async (track: MediaStreamTrack) => {
    await sessionRef.current?.publishExternalVideo(track);
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
    const blob = await rec.stop();
    recorderRef.current = null;
    setIsRecording(false);
    return blob;
  }, []);

  const sendData = useCallback((type: string, payload?: any) => {
    sessionRef.current?.sendData(type, payload);
  }, []);

  const leave = useCallback(() => {
    recorderRef.current?.stop().catch(() => {});
    recorderRef.current = null;
    sessionRef.current?.leave();
  }, []);

  return {
    localStream, remoteStreams, participants, peerStates, error,
    audioEnabled, videoEnabled, sharingScreen,
    toggleAudio, toggleVideo, setAudio, setVideo, switchCamera, cycleCamera, publishExternalVideo, toggleScreenShare, leave,
    isRecording, startRecording, stopRecording, sendData,
    devices, activeDevices, refreshDevices, switchVideoDevice, switchAudioDevice,
    useDesktopAudio, screenStream,
  };
}
