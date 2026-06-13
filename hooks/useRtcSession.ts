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
  RtcSession, RtcSessionConfig, RtcParticipant,
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
  switchCamera: (facing: 'user' | 'environment') => void;
  toggleScreenShare: () => void;
  leave: () => void;
}

export function useRtcSession(
  config: RtcSessionConfig | null,
  opts: { autoJoin?: boolean } = { autoJoin: true },
): UseRtcSession {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participants, setParticipants] = useState<RtcParticipant[]>([]);
  const [peerStates, setPeerStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

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
    sessionRef.current?.switchCamera(facing).catch(() => {});
  }, []);
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

  const leave = useCallback(() => {
    recorderRef.current?.stop().catch(() => {});
    recorderRef.current = null;
    sessionRef.current?.leave();
  }, []);

  return {
    localStream, remoteStreams, participants, peerStates, error,
    audioEnabled, videoEnabled, sharingScreen,
    toggleAudio, toggleVideo, setAudio, setVideo, switchCamera, toggleScreenShare, leave,
    isRecording, startRecording, stopRecording,
  };
}
