// WCVideoChatRoom — Stable video room for WC 2026 Fan Clubs
//
// Architecture: local camera preview + Firestore real-time presence.
// WebRTC mesh is intentionally omitted — 24-person P2P video requires
// a server-side SFU (Agora/Livekit/Daily) to be stable. This gives
// the full Zoom-style gallery UX and all social mechanics without
// browser crashes under full load.
//
// 20-minute sessions · up to 24 people · 2-hour cooldown if waitlist

import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Users, Clock,
  UserPlus, X, Timer, Sparkles, AlertCircle, Circle,
} from 'lucide-react';
import { db, followUser } from '../services/backendService';
import { saveSessionRecording } from '../services/liveStreamService';
import { doc, collection, setDoc, deleteDoc, runTransaction, arrayUnion, increment, getDoc, updateDoc } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import type { WC26Team } from '../data/worldCup2026';
import { useRtcSession } from '../hooks/useRtcSession';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROOM_DURATION_MS = 20 * 60 * 1000;
const COOLDOWN_MS      = 2 * 60 * 60 * 1000;
// Real peer video runs on the unified rtcCore mesh. Mesh is great for an
// intimate "meet each other for real" circle but every extra person is an extra
// uplink, so the cap is mesh-safe (was 24 when this was avatar-only presence).
const MAX_PARTICIPANTS = 8;

/** Renders a remote participant's live MediaStream. */
const RemoteVideo: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />;
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface Participant {
  uid: string;
  displayName: string;
  photoURL: string | null;
  joinedAt: number;
}

interface RoomState {
  isActive: boolean;
  sessionStart: number;
  sessionEnd: number;
  cooldownUntil: number;
  hasWaiting: boolean;
  participantCount: number;
  participantUids: string[];
}

interface WCVideoChatRoomProps {
  team: WC26Team;
  currentUser: { uid: string; displayName: string | null; photoURL: string | null } | null;
  onClose: () => void;
}

type Phase = 'loading' | 'lobby' | 'in-room' | 'cooldown' | 'full' | 'ended';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000' : '#fff';
}

// ── Error Boundary ─────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }
class VideoRoomErrorBoundary extends Component<{ onClose: () => void; children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#0a0a0a] px-6 text-center">
          <AlertCircle size={40} className="text-red-400" />
          <div>
            <p className="text-xl font-black text-white">Video Room Error</p>
            <p className="text-[11px] text-white/40 mt-1">Something went wrong. Please try again.</p>
          </div>
          <button
            onClick={this.props.onClose}
            className="px-6 py-3 rounded-2xl bg-white/[0.08] border border-white/10 text-xs font-black text-white/60 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

const WCVideoChatRoomInner: React.FC<WCVideoChatRoomProps> = ({ team, currentUser, onClose }) => {
  const primary   = team.primaryColor ?? '#FF8C00';
  const secondary = team.secondaryColor ?? '#333';
  const primaryFg = contrastText(primary);
  const clubId    = `wc2026_${team.id}`;
  const uid       = currentUser?.uid;

  const roomRef    = doc(db, 'wcVideoRooms', clubId);
  const presColRef = collection(db, 'wcVideoRooms', clubId, 'presence');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSetPhase      = useCallback((p: Phase | ((prev: Phase) => Phase)) => { if (mountedRef.current) setPhase(p as any); }, []);
  const safeSetRoom       = useCallback((r: RoomState | null) => { if (mountedRef.current) setRoom(r); }, []);
  const safeSetParticipants = useCallback((ps: Participant[]) => { if (mountedRef.current) setParticipants(ps); }, []);
  const safeSetTimeLeft   = useCallback((t: number) => { if (mountedRef.current) setTimeLeft(t); }, []);
  const safeSetCooldown   = useCallback((t: number) => { if (mountedRef.current) setCooldownLeft(t); }, []);

  const [phase, setPhase]           = useState<Phase>('loading');
  const [room, setRoom]             = useState<RoomState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [timeLeft, setTimeLeft]     = useState(ROOM_DURATION_MS);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [micOn, setMicOn]           = useState(true);
  const [camOn, setCamOn]           = useState(true);
  const [joining, setJoining]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [followedUids, setFollowedUids] = useState<Set<string>>(new Set());

  const localStreamRef  = useRef<MediaStream | null>(null);
  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const sessionEndRef   = useRef<number>(0);
  const endingRef       = useRef(false);   // guard: only one client triggers session close
  const inRoomRef       = useRef(false);   // tracks whether we're physically in the room
  const unsubsRef       = useRef<(() => void)[]>([]);

  // ── Real peer video via the unified rtcCore backbone (mesh) ─────────────────
  // Active only while in the room. Owns media + signaling; we mirror its local
  // stream into localStreamRef so the existing self-view + mic/cam logic is
  // untouched, and render its remote streams as the gallery tiles.
  const rtc = useRtcSession(
    phase === 'in-room' && uid
      ? { sessionId: `wcroom_${clubId}`, topology: 'mesh', role: 'participant',
          media: { audio: true, video: true }, displayName: currentUser?.displayName || 'Fan' }
      : null,
  );
  useEffect(() => {
    localStreamRef.current = rtc.localStream;
    if (localVideoRef.current) localVideoRef.current.srcObject = rtc.localStream;
  }, [rtc.localStream]);

  // ── Stable Firestore refs ────────────────────────────────────────────────────

  const presenceDocRef = useCallback(
    () => uid ? doc(db, 'wcVideoRooms', clubId, 'presence', uid) : null,
    [clubId, uid],
  );

  // ── Room + presence subscriptions ────────────────────────────────────────────

  useEffect(() => {
    const unsubRoom = onSnapshot(roomRef, snap => {
      if (!snap.exists()) {
        safeSetRoom(null);
        safeSetPhase(p => p === 'loading' ? 'lobby' : p);
        return;
      }
      const data = snap.data() as RoomState;
      safeSetRoom(data);
      sessionEndRef.current = data.sessionEnd;

      const now = Date.now();
      const inCooldown =
        uid != null &&
        (data.participantUids ?? []).includes(uid) &&
        data.hasWaiting &&
        now < data.cooldownUntil &&
        !data.isActive;

      if (inRoomRef.current) return; // Let in-room logic handle phase changes

      if (inCooldown) {
        safeSetCooldown(data.cooldownUntil - now);
        safeSetPhase('cooldown');
      } else if (phase === 'loading') {
        safeSetPhase('lobby');
      }
    }, () => {
      // onSnapshot error handler — don't crash, just fall back to lobby
      safeSetPhase(p => p === 'loading' ? 'lobby' : p);
    });

    const unsubPresence = onSnapshot(presColRef, snap => {
      safeSetParticipants(
        snap.docs
          .map(d => d.data() as Participant)
          .sort((a, b) => a.joinedAt - b.joinedAt)
      );
    }, () => {});

    unsubsRef.current.push(unsubRoom, unsubPresence);
    return () => {
      unsubRoom();
      unsubPresence();
    };
  }, [clubId, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Countdown ticker ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'in-room' && phase !== 'cooldown') return;
    const id = setInterval(() => {
      if (!mountedRef.current) { clearInterval(id); return; }
      if (phase === 'in-room') {
        const left = Math.max(0, sessionEndRef.current - Date.now());
        safeSetTimeLeft(left);
        if (left <= 0 && !endingRef.current) {
          endingRef.current = true;
          void closeSession();
        }
      } else {
        const left = room ? Math.max(0, room.cooldownUntil - Date.now()) : 0;
        safeSetCooldown(left);
        if (left <= 0) safeSetPhase('lobby');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Media helpers ────────────────────────────────────────────────────────────

  const startMedia = async (): Promise<boolean> => {
    try {
      // Permission probe only — fail fast before entering the room. The rtcCore
      // session acquires and owns the real stream once we're 'in-room'.
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      probe.getTracks().forEach(t => t.stop());
      return true;
    } catch (err: any) {
      if (!mountedRef.current) return false;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setError('Camera and microphone access is required to join the video room.');
      } else if (err?.name === 'NotFoundError') {
        setError('No camera or microphone found on this device.');
      } else {
        setError('Could not access media devices. Please check your browser settings.');
      }
      return false;
    }
  };

  const stopMedia = () => {
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    } catch {}
    localStreamRef.current = null;
    // Cleanly disconnect video element to avoid browser errors
    if (localVideoRef.current) {
      try { localVideoRef.current.srcObject = null; } catch {}
    }
  };

  // ── Join ─────────────────────────────────────────────────────────────────────

  const joinRoom = async () => {
    if (!currentUser || joining || !mountedRef.current) return;
    setJoining(true);
    setError(null);

    const mediaOk = await startMedia();
    if (!mediaOk) { setJoining(false); return; }

    try {
      let newSessionEnd = 0;

      await runTransaction(db, async tx => {
        const snap = await tx.get(roomRef);
        const now  = Date.now();

        if (!snap.exists() || !snap.data().isActive || now >= snap.data().sessionEnd) {
          // Start a brand new session
          newSessionEnd = now + ROOM_DURATION_MS;
          tx.set(roomRef, {
            isActive: true,
            sessionStart: now,
            sessionEnd: newSessionEnd,
            cooldownUntil: 0,
            hasWaiting: false,
            participantCount: 1,
            participantUids: [currentUser.uid],
          });
        } else {
          const data = snap.data() as RoomState;
          if (data.participantCount >= MAX_PARTICIPANTS) {
            // Room full — mark waiting so previous participants get cooldown
            tx.update(roomRef, { hasWaiting: true });
            throw new Error('ROOM_FULL');
          }
          newSessionEnd = data.sessionEnd;
          tx.update(roomRef, {
            participantCount: increment(1),
            participantUids: arrayUnion(currentUser.uid),
          });
        }
      });

      // Write presence (outside transaction — non-critical, can retry)
      const presDoc = presenceDocRef();
      if (presDoc) {
        await setDoc(presDoc, {
          uid: currentUser.uid,
          displayName: currentUser.displayName ?? 'Fan',
          photoURL: currentUser.photoURL ?? null,
          joinedAt: Date.now(),
        });
      }

      sessionEndRef.current = newSessionEnd;
      safeSetTimeLeft(Math.max(0, newSessionEnd - Date.now()));
      inRoomRef.current = true;
      endingRef.current = false;
      safeSetPhase('in-room');
    } catch (err: any) {
      stopMedia();
      if (err?.message === 'ROOM_FULL') {
        safeSetPhase('full');
      } else {
        if (mountedRef.current) setError('Could not join the room. Please try again.');
        console.error('[WCVideoChatRoom] join error:', err);
      }
    } finally {
      if (mountedRef.current) setJoining(false);
    }
  };

  // ── Leave ─────────────────────────────────────────────────────────────────────

  const leaveRoom = useCallback(async () => {
    inRoomRef.current = false;
    stopMedia();

    if (uid) {
      try {
        const presDoc = presenceDocRef();
        if (presDoc) await deleteDoc(presDoc);
        await runTransaction(db, async tx => {
          const snap = await tx.get(roomRef);
          if (!snap.exists()) return;
          tx.update(roomRef, { participantCount: increment(-1) });
        });
      } catch {} // Best-effort cleanup
    }

    safeSetPhase('lobby');
  }, [uid, clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close session (timer expiry — any in-room client runs this) ───────────────

  const closeSession = useCallback(async () => {
    inRoomRef.current = false;
    stopMedia();

    if (uid) {
      try {
        // Atomic session close — only first caller wins (others skip via isActive check)
        await runTransaction(db, async tx => {
          const snap = await tx.get(roomRef);
          if (!snap.exists() || !snap.data().isActive) return;
          const data = snap.data() as RoomState;
          tx.update(roomRef, {
            isActive: false,
            cooldownUntil: data.hasWaiting ? Date.now() + COOLDOWN_MS : 0,
          });
        });

        // Remove own presence
        const presDoc = presenceDocRef();
        if (presDoc) await deleteDoc(presDoc).catch(() => {});
      } catch {}
    }

    safeSetPhase('ended');
  }, [uid, clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Stop media and clear srcObject
      try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      try { if (localVideoRef.current) localVideoRef.current.srcObject = null; } catch {}
      localStreamRef.current = null;

      // If still in room when component unmounts, clean up our own presence.
      // We do NOT close the session — the room continues for remaining participants.
      if (inRoomRef.current && uid) {
        inRoomRef.current = false;
        const presDoc = doc(db, 'wcVideoRooms', clubId, 'presence', uid);
        deleteDoc(presDoc).catch(() => {});
        runTransaction(db, async tx => {
          const s = await tx.get(roomRef);
          if (s.exists() && s.data().isActive) tx.update(roomRef, { participantCount: increment(-1) });
        }).catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Graceful leave (returns to country page, room stays alive for others) ──────

  const handleClose = useCallback(async () => {
    if (inRoomRef.current) {
      // Leave gracefully: remove our presence, decrement count, keep session alive
      inRoomRef.current = false;
      stopMedia();
      if (uid) {
        try {
          const presDoc = presenceDocRef();
          if (presDoc) await deleteDoc(presDoc);
          await runTransaction(db, async tx => {
            const s = await tx.get(roomRef);
            if (s.exists() && s.data().isActive) tx.update(roomRef, { participantCount: increment(-1) });
          });
        } catch {} // best-effort
      }
    }
    onClose();
  }, [uid, clubId, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ──────────────────────────────────────────────────────────────────

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(v => !v);
  };
  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(v => !v);
  };

  const handleFollow = async (targetUid: string) => {
    if (!uid || followedUids.has(targetUid) || !mountedRef.current) return;
    setFollowedUids(prev => new Set([...prev, targetUid]));
    try { await followUser(targetUid); }
    catch { if (mountedRef.current) setFollowedUids(prev => { const s = new Set(prev); s.delete(targetUid); return s; }); }
  };

  // ── Derived values ─────────────────────────────────────────────────────────────

  const others      = participants.filter(p => p.uid !== uid);
  const totalTiles  = (uid ? 1 : 0) + others.length;
  const gridCols    = totalTiles <= 1 ? 1 : totalTiles <= 4 ? 2 : totalTiles <= 9 ? 3 : 4;
  const firstOther  = others[0];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080808]" style={{ fontFamily: 'inherit' }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-white/[0.07] shrink-0"
        style={{ background: `linear-gradient(90deg, ${primary}15, transparent 60%)` }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{team.flag}</span>
          <div>
            <p className="text-[11px] font-black text-white uppercase tracking-wider leading-none">{team.name} · Video Room</p>
            <p className="text-[8px] text-white/30 mt-0.5">WC2026 Fan Club</p>
          </div>
        </div>
        <button onClick={handleClose} className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] transition-colors">
          <X size={14} className="text-white/50" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">

          {/* LOADING */}
          {phase === 'loading' && (
            <motion.div key="loading" className="flex-1 flex items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{ borderColor: `${primary}40`, borderTopColor: primary }} />
                <p className="text-xs text-white/30">Loading room…</p>
              </div>
            </motion.div>
          )}

          {/* LOBBY */}
          {phase === 'lobby' && (
            <motion.div key="lobby" className="flex-1 flex flex-col items-center justify-center gap-7 px-6 py-8"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Room identity */}
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                  className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-4xl"
                  style={{ background: `linear-gradient(135deg, ${primary}28, ${secondary}14)`, border: `2px solid ${primary}28` }}
                >
                  {team.flag}
                </motion.div>
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">{team.name}</h2>
                  <p className="text-xs text-white/35 mt-0.5">Video Chat Room · WC2026</p>
                </div>
              </div>

              {/* Room stats */}
              <div className="flex items-center gap-6 text-center">
                {[
                  { value: participants.length, label: 'In Room' },
                  { value: MAX_PARTICIPANTS, label: 'Max' },
                  { value: '20m', label: 'Session' },
                ].map((s, i) => (
                  <React.Fragment key={s.label}>
                    {i > 0 && <div className="w-px h-8 bg-white/10" />}
                    <div>
                      <p className="text-2xl font-black text-white tabular-nums">{s.value}</p>
                      <p className="text-[8px] text-white/30 uppercase tracking-wider mt-0.5">{s.label}</p>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Active session indicator */}
              {room?.isActive && Date.now() < room.sessionEnd && (
                <div className="flex items-center gap-2 py-2 px-4 rounded-2xl bg-white/[0.04] border border-white/8">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shrink-0" />
                  <p className="text-[10px] text-white/50">
                    Session in progress ·{' '}
                    <span className="font-black text-white/70">{fmt(Math.max(0, room.sessionEnd - Date.now()))}</span>
                    {' '}left
                  </p>
                </div>
              )}

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="w-full max-w-xs py-3 px-4 rounded-2xl bg-red-500/10 border border-red-500/20"
                  >
                    <p className="text-[10px] text-red-400 text-center">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CTA */}
              <div className="w-full max-w-xs space-y-3">
                {currentUser ? (
                  <motion.button
                    onClick={joinRoom}
                    disabled={joining}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: primary, color: primaryFg }}
                  >
                    {joining
                      ? <div className="w-4 h-4 rounded-full border-2 border-current/40 border-t-current animate-spin" />
                      : <Video size={15} />}
                    {joining ? 'Joining…' : 'Join Video Room'}
                  </motion.button>
                ) : (
                  <p className="text-center text-[10px] text-white/30">Sign in to join the video room</p>
                )}
                <p className="text-center text-[8px] text-white/20 leading-relaxed">
                  Sessions last 20 minutes. Camera &amp; microphone required.
                </p>
              </div>
            </motion.div>
          )}

          {/* FULL */}
          {phase === 'full' && (
            <motion.div key="full" className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Users size={36} className="text-white/15" />
              <div>
                <p className="text-xl font-black text-white">Room is Full</p>
                <p className="text-[11px] text-white/40 mt-1">{MAX_PARTICIPANTS} people are in this session</p>
              </div>
              <div className="py-3 px-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 max-w-xs">
                <p className="text-[10px] text-amber-400 leading-relaxed">
                  You've been added to the waitlist. The current participants will have a 2-hour cooldown before they can rejoin a new session.
                </p>
              </div>
              <button onClick={() => setPhase('lobby')} className="text-[10px] text-white/30 hover:text-white/60 transition-colors mt-2">
                Back to lobby
              </button>
            </motion.div>
          )}

          {/* COOLDOWN */}
          {phase === 'cooldown' && (
            <motion.div key="cooldown" className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Timer size={36} className="text-white/15" />
              <div>
                <p className="text-xl font-black text-white">Cooldown Period</p>
                <p className="text-[11px] text-white/40 mt-1">Others were waiting — take a breather before rejoining</p>
              </div>
              <motion.div
                animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                className="py-6 px-10 rounded-3xl"
                style={{ background: `${primary}0e`, border: `1.5px solid ${primary}22` }}
              >
                <p className="text-5xl font-black tabular-nums tracking-tight" style={{ color: primary }}>
                  {fmt(cooldownLeft)}
                </p>
                <p className="text-[8px] text-white/25 mt-2 uppercase tracking-widest">Until next session opens</p>
              </motion.div>
              <button onClick={handleClose} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
                Close
              </button>
            </motion.div>
          )}

          {/* ENDED */}
          {phase === 'ended' && (
            <motion.div key="ended" className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <Sparkles size={36} style={{ color: primary }} />
              <div>
                <p className="text-xl font-black text-white">Session Complete</p>
                <p className="text-[11px] text-white/40 mt-1">20 minutes — hope you made some connections!</p>
              </div>
              {others.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap justify-center max-w-xs">
                  <p className="text-[9px] text-white/30 w-full text-center mb-1">Still want to follow anyone from the session?</p>
                  {others.slice(0, 6).map(p => (
                    <button
                      key={p.uid}
                      onClick={() => handleFollow(p.uid)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black transition-all"
                      style={followedUids.has(p.uid)
                        ? { background: `${primary}20`, color: primary, border: `1px solid ${primary}35` }
                        : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      {followedUids.has(p.uid) ? '✓' : <UserPlus size={9} />}
                      {p.displayName.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
              <motion.button
                onClick={() => { endingRef.current = false; setPhase('lobby'); }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest mt-2"
                style={{ background: primary, color: primaryFg }}
              >
                Back to Lobby
              </motion.button>
            </motion.div>
          )}

          {/* IN ROOM */}
          {phase === 'in-room' && (
            <motion.div key="in-room" className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* Top bar: timer + follow banner */}
              <div className="flex items-stretch border-b border-white/[0.07] shrink-0">

                {/* Timer */}
                <div
                  className="flex items-center gap-3 px-5 py-3 shrink-0 border-r border-white/[0.07]"
                  style={{ background: timeLeft < 60_000 ? 'rgba(239,68,68,0.06)' : `${primary}06` }}
                >
                  <Clock size={13} style={{ color: timeLeft < 60_000 ? '#ef4444' : primary }} className="shrink-0" />
                  <div>
                    <p className={`text-[22px] font-black tabular-nums leading-none ${timeLeft < 60_000 ? 'text-red-400' : 'text-white'}`}>
                      {fmt(timeLeft)}
                    </p>
                    <p className="text-[7px] text-white/20 uppercase tracking-widest mt-0.5">remaining</p>
                  </div>
                </div>

                {/* Follow & connect */}
                <div className="flex-1 flex items-center gap-3 px-4 py-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-white leading-none">Follow &amp; Connect</p>
                    <p className="text-[8px] text-white/35 mt-0.5 truncate">
                      {firstOther
                        ? `Meet ${firstOther.displayName.split(' ')[0]} and ${others.length - 1 > 0 ? `${others.length - 1} others` : 'others'} in the room`
                        : `Invite fellow ${team.name} fans to join`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {others.slice(0, 3).map(p => (
                      <button
                        key={p.uid}
                        onClick={() => handleFollow(p.uid)}
                        title={`Follow ${p.displayName}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all"
                        style={followedUids.has(p.uid)
                          ? { background: `${primary}22`, color: primary, border: `1px solid ${primary}40` }
                          : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        {followedUids.has(p.uid) ? '✓' : <UserPlus size={8} />}
                        <span className="max-w-[40px] truncate">{p.displayName.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Gallery grid */}
              <div className="flex-1 overflow-auto p-2.5">
                <div
                  className="grid gap-2 auto-rows-fr"
                  style={{
                    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                    minHeight: '100%',
                  }}
                >
                  {/* Self tile — always first */}
                  {uid && (
                    <div className="relative rounded-2xl overflow-hidden bg-[#111] min-h-[120px] flex items-stretch">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`w-full h-full object-cover scale-x-[-1] ${!camOn ? 'opacity-0 absolute inset-0' : ''}`}
                      />
                      {!camOn && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                          style={{ background: `linear-gradient(135deg, ${primary}18, #111)` }}>
                          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shrink-0"
                            style={{ background: `${primary}25`, color: primaryFg === '#000' ? primary : '#fff' }}>
                            {currentUser?.displayName?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <VideoOff size={14} className="text-white/20" />
                        </div>
                      )}
                      {/* Name tag */}
                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1">
                        <span className="text-[9px] font-black text-white leading-none">
                          {currentUser?.displayName?.split(' ')[0] ?? 'You'}
                        </span>
                        <span className="text-[7px] text-white/35">(You)</span>
                        {!micOn && <MicOff size={7} className="text-red-400" />}
                      </div>
                      {/* Live dot */}
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-400"
                        style={{ boxShadow: '0 0 6px rgba(74,222,128,0.7)' }} />
                    </div>
                  )}

                  {/* Other participant tiles */}
                  {others.map(p => (
                    <motion.div
                      key={p.uid}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="relative rounded-2xl overflow-hidden min-h-[120px] flex items-stretch"
                      style={{ background: `linear-gradient(135deg, ${primary}10, #111)` }}
                    >
                      {/* Real peer video (rtcCore mesh) → avatar fallback until connected */}
                      {rtc.remoteStreams.has(p.uid) ? (
                        <RemoteVideo stream={rtc.remoteStreams.get(p.uid)!} />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          {p.photoURL ? (
                            <img
                              src={p.photoURL}
                              className="w-14 h-14 rounded-2xl object-cover ring-2"
                              style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                              alt={p.displayName}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div
                              className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black"
                              style={{ background: `${primary}28`, color: primary }}
                            >
                              {p.displayName[0]?.toUpperCase() ?? '?'}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bottom: name + follow */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 flex items-end justify-between">
                        <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1">
                          <span className="text-[9px] font-black text-white leading-none">
                            {p.displayName.split(' ')[0]}
                          </span>
                        </div>
                        {uid && !followedUids.has(p.uid) ? (
                          <button
                            onClick={() => handleFollow(p.uid)}
                            className="flex items-center gap-1 bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1 text-[8px] font-black text-white/55 hover:text-white transition-colors"
                          >
                            <UserPlus size={8} />
                            Follow
                          </button>
                        ) : uid && followedUids.has(p.uid) ? (
                          <div className="bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1">
                            <span className="text-[8px] font-black text-green-400">✓ Following</span>
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  ))}

                  {/* Empty slot when alone */}
                  {others.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/8 min-h-[120px] flex flex-col items-center justify-center gap-2">
                      <Users size={18} className="text-white/10" />
                      <p className="text-[8px] text-white/20">Waiting for others to join…</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4 px-4 py-3.5 border-t border-white/[0.07] bg-black/20 shrink-0">
                <button
                  onClick={toggleMic}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${micOn ? 'bg-white/[0.07] hover:bg-white/[0.12]' : 'bg-red-500/18 hover:bg-red-500/28'}`}
                  title={micOn ? 'Mute' : 'Unmute'}
                >
                  {micOn ? <Mic size={16} className="text-white/65" /> : <MicOff size={16} className="text-red-400" />}
                </button>

                <button
                  onClick={toggleCam}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${camOn ? 'bg-white/[0.07] hover:bg-white/[0.12]' : 'bg-red-500/18 hover:bg-red-500/28'}`}
                  title={camOn ? 'Stop camera' : 'Start camera'}
                >
                  {camOn ? <Video size={16} className="text-white/65" /> : <VideoOff size={16} className="text-red-400" />}
                </button>

                {/* Record the room → saves to Reello */}
                <button
                  onClick={async () => {
                    if (rtc.isRecording) {
                      const blob = await rtc.stopRecording();
                      if (blob) saveSessionRecording({ blob, title: `${team.name} Video Room — recording` });
                    } else {
                      rtc.startRecording();
                    }
                  }}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${rtc.isRecording ? 'bg-red-500/25 hover:bg-red-500/35 animate-pulse' : 'bg-white/[0.07] hover:bg-white/[0.12]'}`}
                  title={rtc.isRecording ? 'Stop & save recording' : 'Record room'}
                >
                  <Circle size={15} className={rtc.isRecording ? 'text-red-400' : 'text-white/65'} fill={rtc.isRecording ? 'currentColor' : 'none'} />
                </button>

                <div className="w-px h-7 bg-white/10" />

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                  <Users size={11} className="text-white/30" />
                  <span className="text-[9px] font-black text-white/45 tabular-nums">
                    {participants.length}/{MAX_PARTICIPANTS}
                  </span>
                </div>

                <div className="w-px h-7 bg-white/10" />

                <button
                  onClick={handleClose}
                  className="w-11 h-11 rounded-2xl flex items-center justify-center bg-red-500/18 hover:bg-red-500/32 transition-all"
                  title="Leave room"
                >
                  <PhoneOff size={16} className="text-red-400" />
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

// ── Export with error boundary ─────────────────────────────────────────────────

const WCVideoChatRoom: React.FC<WCVideoChatRoomProps> = (props) => (
  <VideoRoomErrorBoundary onClose={props.onClose}>
    <WCVideoChatRoomInner {...props} />
  </VideoRoomErrorBoundary>
);

export default WCVideoChatRoom;
