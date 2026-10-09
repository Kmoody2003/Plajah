/**
 * LiveTalkView — Plajah Live Talk (audio rooms, the X Spaces competitor).
 *
 * Architecture (docs/LIVE_TALK.md):
 *   - Room state:   liveTalks/{id} (host-owned; denormalized roster) + members/{uid} (one per person)
 *   - Chat:         liveTalks/{id}/chat           Reactions: liveTalks/{id}/reactions
 *   - Audio:        rtcCore 'stage' topology (speakers publish, listeners subscribe), liveness on
 *   - Cap:          LIVE_TALK_MAX_PARTICIPANTS (20) people total, LIVE_TALK_MAX_SPEAKERS (10) on stage
 * Pure logic lives in services/liveTalk/liveTalkCore.ts (unit-tested); Firestore in liveTalkService.ts.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Mic, MicOff, X, Play, Music, Film, Send, Share2, Radio, Shield, Volume2, List, Trash2,
  Hand, Flag, MoreHorizontal, LogOut, Crown, UserMinus, UserX, ArrowDown, ArrowUp, Circle, Loader2, Lock, Bell,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import type { ChatMessage } from '../types';
import { auth, createLiveTalk, loginWithGoogle } from '../services/backendService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { useRtcSession } from '../hooks/useRtcSession';
import LanguageChannels from './LanguageChannels';
import ReportDialog from './safety/ReportDialog';
import { saveStudioEpisode } from '../services/podcastStudio/studioService';
import { prefetchIceServers } from '../services/iceConfig';
import {
  LIVE_TALK_MAX_PARTICIPANTS, LIVE_TALK_MAX_SPEAKERS, HOST_HEARTBEAT_MS, MEMBER_HEARTBEAT_MS, CHAT_PAGE,
  REACTION_EMOJIS, type TalkMember, type JoinBlock, type TalkPhase,
  isStageRole, isModerator, joinBlocker, headcount, capacityLabel, sortMembers, isMemberStale,
  deriveDenorm, denormEqual, takeoverCandidate, isHostStale, allowedPeerIds, talkPhase,
  coalesceReactions, formatElapsed, toMillis, canSetRole, sanitizeChat,
} from '../services/liveTalk/liveTalkCore';
import * as svc from '../services/liveTalk/liveTalkService';
import type { LiveTalkDoc, Me } from '../services/liveTalk/liveTalkService';

const avatarFor = (uid: string, photo?: string) => photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`;
const signedInUser = (u: FirebaseUser | null) => (u && !u.isAnonymous ? u : null);

// ── Remote audio sink ───────────────────────────────────────────────────────────
const RemoteAudioPlayer: React.FC<{ stream: MediaStream; muted?: boolean; onBlocked: () => void }> = ({ stream, muted, onBlocked }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    // Autoplay can be refused until the user interacts — surface a "tap to listen" button.
    el.play().catch(() => onBlocked());
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps
  return <audio ref={ref} autoPlay playsInline muted={muted} data-livetalk-audio style={{ display: 'none' }} />;
};

// ── Speaker tile with live voice activity ─────────────────────────────────────────
const SpeakerTile: React.FC<{
  member: TalkMember; stream: MediaStream | null; isMe: boolean; canAct: boolean; onMenu: () => void;
}> = ({ member, stream, isMe, canAct, onMenu }) => {
  const [level, setLevel] = useState(0);
  const muted = !!(member.selfMuted || member.mutedByHost);
  useEffect(() => {
    if (!stream || muted || !stream.getAudioTracks().length) { setLevel(0); return; }
    let raf = 0; let ctx: AudioContext | null = null;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      const an = ctx.createAnalyser(); an.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let last = 0;
      const tick = (t: number) => {
        if (t - last > 80) { // ~12fps is plenty for a halo and spares re-renders
          last = t;
          an.getByteFrequencyData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i];
          setLevel(sum / buf.length / 255);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch { /* no WebAudio — tile still renders */ }
    return () => { cancelAnimationFrame(raf); if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {}); };
  }, [stream, muted]);
  const speaking = level > 0.02;
  const roleBadge = member.role === 'host' ? 'Host' : member.role === 'cohost' ? 'Co-host' : null;
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }} className="flex flex-col items-center gap-1 relative w-[72px]">
      <button type="button" onClick={onMenu} disabled={!canAct} aria-label={`${member.name} options`}
        className="relative w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border border-white/10 transition-[box-shadow,transform] duration-200"
        style={speaking ? { boxShadow: `0 0 0 3px var(--pj-cyan), var(--pj-glow-cyan)`, transform: 'scale(1.05)' } : undefined}>
        <img src={avatarFor(member.uid, member.photo)} className="w-full h-full object-cover" alt="" />
        {muted && (
          <span className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <MicOff size={16} style={{ color: member.mutedByHost ? 'var(--pj-warning)' : 'var(--pj-danger)' }} />
          </span>
        )}
      </button>
      {roleBadge && (
        <span className="absolute -top-2 -left-1 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider text-white shadow"
          style={{ background: member.role === 'host' ? 'var(--pj-magenta)' : 'var(--pj-purple)' }}>{roleBadge}</span>
      )}
      <p className="text-[9px] font-black uppercase text-center text-white/60 truncate max-w-[72px]">{isMe ? 'You' : member.name}</p>
    </motion.div>
  );
};

// ── Floating reaction ──────────────────────────────────────────────────────────
interface Floater { id: number; emoji: string; x: number }

interface LiveTalkViewProps {
  onBrowse: () => void;
  initialShowSetup?: boolean;
  initialTalkId?: string;
}

const LiveTalkView: React.FC<LiveTalkViewProps> = ({ onBrowse, initialShowSetup, initialTalkId }) => {
  const [user, setUser] = useState<FirebaseUser | null>(signedInUser(auth.currentUser));
  useEffect(() => onAuthStateChanged(auth, u => setUser(signedInUser(u))), []);
  const uid = user?.uid || null;
  const me: Me | null = useMemo(() => (user ? { uid: user.uid, name: user.displayName || 'Guest', photo: user.photoURL || '' } : null), [user]);

  // Discovery
  const [activeTalks, setActiveTalks] = useState<LiveTalkDoc[]>([]);
  useEffect(() => svc.listenToLiveTalkDiscovery(setActiveTalks), []);
  useEffect(() => { prefetchIceServers(); }, [uid]);

  // Room
  const [talkId, setTalkId] = useState<string | null>(null);
  const [talk, setTalk] = useState<LiveTalkDoc | null>(null);
  const [talkLoaded, setTalkLoaded] = useState(false);
  const [members, setMembers] = useState<TalkMember[]>([]);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [block, setBlock] = useState<JoinBlock | null>(null);
  const [waitingForSpot, setWaitingForSpot] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLimit, setChatLimit] = useState(CHAT_PAGE);
  const [inputText, setInputText] = useState('');
  const [talkTab, setTalkTab] = useState<'CHAT' | 'PEOPLE' | 'ASSETS'>('CHAT');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [report, setReport] = useState<null | { type: 'live' | 'profile'; id: string; uid?: string; name?: string; snapshot?: string }>(null);
  const [leaveSheet, setLeaveSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [langChannelActive, setLangChannelActive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showSetup, setShowSetup] = useState(false);
  const [setupData, setSetupData] = useState({ title: '', description: '', topic: '', category: 'Discussion' });
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentTrack, currentVideo, playTrack, playVideo } = useGlobalPlayerState();

  const flash = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(t => (t === msg ? null : t)), 3200); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => { if (initialShowSetup) setShowSetup(true); }, [initialShowSetup]);

  // ── Mic devices + setup test ───────────────────────────────────────────────────
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [signalConfirmed, setSignalConfirmed] = useState(false);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter(d => d.kind === 'audioinput');
      setDevices(mics);
      setSelectedDeviceId(cur => cur || mics[0]?.deviceId || '');
    } catch { /* no media devices */ }
  }, []);
  useEffect(() => {
    loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
  }, [loadDevices]);
  useEffect(() => {
    if (!showSetup) return;
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(s => { s.getTracks().forEach(t => t.stop()); loadDevices(); })
      .catch(() => {});
  }, [showSetup, loadDevices]);

  const stopMicTest = useCallback(() => {
    setIsTestingMic(false);
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    micTestStreamRef.current?.getTracks().forEach(t => t.stop()); micTestStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close().catch(() => {});
    audioCtxRef.current = null; analyserRef.current = null;
  }, []);
  const startMicTest = async (deviceId: string) => {
    try {
      stopMicTest();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      micTestStreamRef.current = stream;
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC(); audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      setIsTestingMic(true); setSignalConfirmed(false);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        const canvas = canvasRef.current; const an = analyserRef.current;
        if (!canvas || !an) return;
        const c = canvas.getContext('2d'); if (!c) return;
        an.getByteFrequencyData(data);
        c.clearRect(0, 0, canvas.width, canvas.height);
        const bars = 30, w = canvas.width / bars; let total = 0;
        for (let i = 0; i < bars; i++) {
          const v = data[Math.floor((i / bars) * data.length)]; total += v;
          const h = (v / 255) * canvas.height * 0.95;
          const g = c.createLinearGradient(0, canvas.height, 0, canvas.height - h);
          g.addColorStop(0, '#6B0099'); g.addColorStop(0.5, '#D40055'); g.addColorStop(1, '#00DAF3');
          c.fillStyle = g;
          c.beginPath();
          if ((c as any).roundRect) (c as any).roundRect(i * w + 2, canvas.height - h - 2, w - 4, h, 4); else c.rect(i * w + 2, canvas.height - h - 2, w - 4, h);
          c.fill();
        }
        if (total / bars / 255 > 0.08) setSignalConfirmed(true);
        animationFrameRef.current = requestAnimationFrame(draw);
      };
      animationFrameRef.current = requestAnimationFrame(draw);
    } catch { flash('Microphone unavailable — check browser permissions.'); }
  };
  useEffect(() => () => stopMicTest(), [stopMicTest]);

  // ── Room subscriptions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!talkId) return;
    setTalkLoaded(false);
    const u1 = svc.listenToTalk(talkId, t => { setTalk(t); setTalkLoaded(true); }, () => setTalkLoaded(true));
    const u2 = svc.listenToMembers(talkId, setMembers);
    return () => { u1(); u2(); };
  }, [talkId]);

  useEffect(() => {
    if (!talkId) return;
    return svc.listenToTalkChat(talkId, chatLimit, msgs => setMessages(msgs));
  }, [talkId, chatLimit]);
  useEffect(() => { if (talkTab === 'CHAT') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, talkTab]);

  // Incoming reactions float up for everyone (listeners have no data channel to each other).
  const floaterId = useRef(0);
  const spawn = useCallback((emoji: string, n: number) => {
    const batch: Floater[] = Array.from({ length: Math.min(5, Math.max(1, n)) }, () => ({ id: ++floaterId.current, emoji, x: 10 + Math.random() * 80 }));
    setFloaters(f => [...f.slice(-30), ...batch]);
    window.setTimeout(() => setFloaters(f => f.filter(x => !batch.includes(x))), 2600);
  }, []);
  useEffect(() => {
    if (!talkId || !joined) return;
    return svc.listenToReactions(talkId, r => { if (r.uid !== uid) spawn(r.emoji, r.count); });
  }, [talkId, joined, uid, spawn]);

  const myMember = useMemo(() => members.find(m => m.uid === uid) || null, [members, uid]);
  const amHost = !!(uid && talk?.hostId === uid);
  const amMod = isModerator(talk, uid);
  const speakerUids = talk?.speakerUids || (talk ? [talk.hostId] : []);
  const amOnStage = !!uid && joined && (amHost || (speakerUids.includes(uid) && isStageRole(myMember?.role)));
  const ended = talkLoaded && (!talk || talk.isActive !== true);

  // My member doc vanished: kicked → leave the audio too; otherwise (pruned as stale after a
  // throttled background tab) quietly re-register so peers keep allowing my connection.
  const sawMyDoc = useRef(false);
  useEffect(() => {
    if (myMember) { sawMyDoc.current = true; return; }
    if (!joined || !sawMyDoc.current || !talk || !me || !talkId) return;
    sawMyDoc.current = false;
    if ((talk.kicked || []).includes(me.uid)) { setJoined(false); setBlock('kicked'); return; }
    if (talk.isActive) svc.joinTalk(talkId, me, talk.hostId === me.uid).catch(() => {});
  }, [myMember, joined, talk, me, talkId]);
  const kickedMe = !!(uid && (talk?.kicked || []).includes(uid));
  useEffect(() => { if (kickedMe && joined) { setJoined(false); setBlock('kicked'); } }, [kickedMe, joined]);

  // ── Join / leave ──────────────────────────────────────────────────────────────
  const enter = useCallback(async (id: string, asHost = false) => {
    setTalkId(id); setShowSetup(false); setBlock(null); setWaitingForSpot(false); setMessages([]); setChatLimit(CHAT_PAGE);
    if (!me) { setJoined(false); return; }
    setJoining(true);
    try {
      const t = await svc.getTalk(id);
      const blocked = t ? await svc.isBlockedWithHost(t.hostId, me.uid) : false;
      let reason = joinBlocker(t, me.uid, { blocked });
      // A rejoin (my member doc survived a reload) doesn't count against the cap.
      if (reason === 'full' && await svc.isMember(id, me.uid)) reason = null;
      if (reason) { setBlock(reason); setJoined(false); return; }
      await svc.joinTalk(id, me, asHost || t!.hostId === me.uid);
      setJoined(true);
    } catch (e: any) {
      // Rules said no: most likely the room filled up between our read and our write.
      const t = await svc.getTalk(id).catch(() => null);
      setBlock(joinBlocker(t, me.uid) || (headcount(t) >= LIVE_TALK_MAX_PARTICIPANTS ? 'full' : null));
      if (!joinBlocker(t, me.uid)) flash('Could not join this talk. Please try again.');
      setJoined(false);
    } finally { setJoining(false); }
  }, [me, flash]);

  // Deep link: auto-join exactly once per link (leaving must not bounce you back in).
  const joinedFromLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialTalkId || joinedFromLinkRef.current === initialTalkId) return;
    joinedFromLinkRef.current = initialTalkId;
    void enter(initialTalkId);
  }, [initialTalkId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Signed in from the room's sign-in prompt → join the room they were looking at.
  useEffect(() => { if (me && talkId && !joined && !joining && !block && !ended && talkLoaded) void enter(talkId); }, [me?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio (rtcCore stage) ────────────────────────────────────────────────────
  const memberUidsKey = members.map(m => m.uid).sort().join(',');
  const speakerKey = speakerUids.join(',');
  const allowed = useMemo(() => (uid ? allowedPeerIds(uid, amOnStage, speakerUids, memberUidsKey ? memberUidsKey.split(',') : []) : []),
    [uid, amOnStage, speakerKey, memberUidsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const kickedKey = (talk?.kicked || []).join(',');
  const excluded = useMemo(() => (kickedKey ? kickedKey.split(',') : []), [kickedKey]);

  const recStartRef = useRef(0);
  const savingRef = useRef(false);
  const saveRecording = useCallback(async (blob: Blob | null) => {
    if (!blob || savingRef.current || !uid) return;
    savingRef.current = true;
    try {
      await saveStudioEpisode({ uid, blob, title: talk?.title || 'Live Talk', durationMs: recStartRef.current ? Date.now() - recStartRef.current : 0 });
      flash('Recording saved as a podcast episode');
    } catch { flash('Could not save the recording'); }
    finally { savingRef.current = false; recStartRef.current = 0; }
  }, [uid, talk?.title, flash]);

  const rtc = useRtcSession(
    talk && talkId && uid && joined && !ended
      ? {
          sessionId: `talk_${talkId}`,
          topology: 'stage',
          role: amOnStage ? (amHost ? 'host' : 'participant') : 'viewer',
          media: { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(selectedDeviceId ? { deviceId: { ideal: selectedDeviceId } } : {}) }, video: false },
          displayName: me?.name || 'Guest',
          liveness: true,
        }
      : null,
    { autoJoin: true, allowedPeerIds: allowed, excludePeerIds: excluded, onRecordingStopped: b => { void saveRecording(b); } },
  );

  // Mic follows the room: on stage AND not self-muted AND not muted by a moderator.
  const mutedByHost = !!myMember?.mutedByHost;
  const selfMuted = myMember ? myMember.selfMuted !== false : true;
  useEffect(() => { rtc.setAudio(amOnStage && !selfMuted && !mutedByHost); }, [amOnStage, selfMuted, mutedByHost, rtc.localStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Presence heartbeat for everyone; talk heartbeat + roster upkeep for the host.
  useEffect(() => {
    if (!talkId || !uid || !joined) return;
    const t = setInterval(() => { svc.memberHeartbeat(talkId, uid).catch(() => {}); }, MEMBER_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [talkId, uid, joined]);
  useEffect(() => {
    if (!talkId || !amHost || !joined || ended) return;
    svc.hostHeartbeat(talkId).catch(() => {});
    const t = setInterval(() => { svc.hostHeartbeat(talkId).catch(() => {}); }, HOST_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [talkId, amHost, joined, ended]);
  // New host after hand-off / takeover promotes their own member doc.
  useEffect(() => {
    if (talkId && uid && amHost && joined && myMember && myMember.role !== 'host') svc.claimHostRole(talkId, uid).catch(() => {});
  }, [talkId, uid, amHost, joined, myMember?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  // Host keeps the denormalized roster (speakerUids, counts, discovery card) in sync + prunes ghosts.
  useEffect(() => {
    if (!talkId || !talk || !amHost || !joined || ended) return;
    const t = window.setTimeout(() => {
      const ts = Date.now();
      const stale = members.filter(m => m.uid !== talk.hostId && isMemberStale(m, ts)).map(m => m.uid);
      if (stale.length) svc.pruneMembers(talkId, stale).catch(() => {});
      const d = deriveDenorm(members, talk.hostId, ts);
      if (!denormEqual(talk as any, d)) svc.writeDenorm(talkId, d).catch(() => {});
    }, 700);
    return () => window.clearTimeout(t);
  }, [members, talk, amHost, joined, ended, talkId, now - (now % 30_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  // Host vanished > 60s: the first present co-host takes the room over.
  const hostGone = !!talk && talk.isActive && isHostStale(talk as any, now);
  useEffect(() => {
    if (!talk || !talkId || !me || !joined || !hostGone) return;
    if (takeoverCandidate(talk as any, members, Date.now()) === me.uid) {
      svc.takeOverHost(talk, me).then(() => flash('The host dropped off — you are now hosting')).catch(() => {});
    }
  }, [hostGone, members.length, joined, Math.floor(now / 10_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab closing: free the seat (best-effort; the stale-member prune is the backstop).
  useEffect(() => {
    if (!talkId || !uid || !joined) return;
    const onHide = (e: PageTransitionEvent) => { if (!e.persisted) void svc.leaveTalk(talkId, uid); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [talkId, uid, joined]);

  // Spot opened while waiting on a full room.
  useEffect(() => {
    if (waitingForSpot && block === 'full' && talk && headcount(talk) < LIVE_TALK_MAX_PARTICIPANTS) {
      flash('A spot just opened — tap Join now');
    }
  }, [waitingForSpot, block, talk ? headcount(talk) : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetRoom = () => {
    rtc.leave();
    setTalkId(null); setTalk(null); setMembers([]); setJoined(false); setBlock(null); setMessages([]);
    setLeaveSheet(false); setMenuFor(null); setWaitingForSpot(false); sawMyDoc.current = false;
  };

  const leaveRoom = async () => {
    if (talkId && uid && joined) await svc.leaveTalk(talkId, uid).catch(() => {});
    resetRoom();
  };

  const stopAndSaveRecording = async () => {
    if (!rtc.isRecording) return;
    const blob = await rtc.stopRecording();
    if (talkId) svc.setRecording(talkId, false).catch(() => {});
    await saveRecording(blob);
  };

  const endForAll = async () => {
    if (!talkId) return;
    await stopAndSaveRecording();
    await svc.endTalk(talkId).catch(() => flash('Could not end the talk'));
    await leaveRoom();
  };

  const cohosts = members.filter(m => m.role === 'cohost' && !isMemberStale(m, now));
  const handOffAndLeave = async (to: TalkMember) => {
    if (!talk || !talkId) return;
    await stopAndSaveRecording();
    try { await svc.handOffHost(talk, to); } catch { flash('Hand-off failed'); return; }
    await leaveRoom();
  };

  // ── Create ───────────────────────────────────────────────────────────────────
  const handleCreateTalk = async () => {
    if (!setupData.title.trim() || !me || creating) return;
    setCreating(true);
    stopMicTest();
    try {
      const t = await createLiveTalk(setupData);
      if (!t) throw new Error('create failed');
      await svc.initTalkAsHost(t.id, me);
      await enter(t.id, true);
    } catch { flash('Could not start the talk. Please try again.'); }
    finally { setCreating(false); }
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const toggleMyMic = async () => {
    if (!talkId || !uid || !myMember) return;
    if (mutedByHost) { flash('A moderator muted you. They can unmute you.'); return; }
    const next = !selfMuted;
    rtc.setAudio(amOnStage && !next); // instant local feedback; doc follows
    await svc.setSelfMuted(talkId, uid, next).catch(() => flash('Could not change mute'));
  };

  const toggleHand = async () => {
    if (!talkId || !uid || !myMember) return;
    await svc.setHandRaised(talkId, uid, !myMember.handRaised).catch(() => flash('Could not update your hand'));
  };

  const stageCount = members.filter(m => isStageRole(m.role)).length;
  const moveTo = async (m: TalkMember, role: 'cohost' | 'speaker' | 'listener') => {
    if (!talkId || !talk || !uid) return;
    if (!canSetRole(talk as any, uid, m, role, stageCount)) {
      flash(isStageRole(role) && stageCount >= LIVE_TALK_MAX_SPEAKERS ? `The stage is full (${LIVE_TALK_MAX_SPEAKERS} max)` : 'Not allowed');
      return;
    }
    setMenuFor(null);
    await svc.setMemberRole(talkId, m.uid, role).catch(() => flash('Could not change role'));
  };
  const kick = async (m: TalkMember) => {
    if (!talkId) return;
    setMenuFor(null);
    if (!window.confirm(`Remove ${m.name} from this talk? They won't be able to rejoin.`)) return;
    await svc.kickMember(talkId, m.uid).then(() => flash(`${m.name} was removed`)).catch(() => flash('Could not remove'));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || !talkId || !joined) return;
    const text = sanitizeChat(inputText);
    if (!text) return;
    setInputText('');
    await svc.sendTalkChat(talkId, me, text).catch(() => { setInputText(text); flash('Message not sent'); });
  };

  const handleShareCurrent = async () => {
    if (!talkId || !uid || !amOnStage) return;
    const src = currentTrack ? { type: 'MUSIC' as const, title: currentTrack.title, url: currentTrack.url, mediaId: currentTrack.id }
      : currentVideo ? { type: 'VIDEO' as const, title: currentVideo.title, url: currentVideo.url, mediaId: currentVideo.id } : null;
    if (!src) { flash('Play a track or video first, then share it'); return; }
    await svc.shareAsset(talkId, uid, src).then(() => flash('Shared to the room')).catch(() => flash('Could not share'));
  };

  // Reactions: tap → float locally at once; writes coalesce to one doc per emoji per ~700ms.
  const tapQueue = useRef<string[]>([]);
  const tapTimer = useRef<number | null>(null);
  const react = (emoji: string) => {
    if (!talkId || !uid) return;
    spawn(emoji, 1);
    tapQueue.current.push(emoji);
    if (tapTimer.current) return;
    tapTimer.current = window.setTimeout(() => {
      const taps = tapQueue.current; tapQueue.current = []; tapTimer.current = null;
      coalesceReactions(taps).forEach(r => { svc.sendReaction(talkId, uid, r.emoji, r.count).catch(() => {}); });
    }, 700);
  };

  const toggleRecording = async () => {
    if (!talkId || !amHost) return;
    if (rtc.isRecording) { await stopAndSaveRecording(); return; }
    if (rtc.startRecording({ audioOnly: true })) {
      recStartRef.current = Date.now();
      await svc.setRecording(talkId, true).catch(() => {});
    } else flash('Recording is not supported in this browser');
  };

  const unblockAudio = () => {
    document.querySelectorAll<HTMLAudioElement>('audio[data-livetalk-audio]').forEach(a => { a.play().catch(() => {}); });
    setAudioBlocked(false);
  };

  // ── Derived view state ─────────────────────────────────────────────────────────
  const peerStates = Array.from(rtc.peerStates.values());
  const phase: TalkPhase = talkPhase({
    ended, signedIn: !!uid, full: block === 'full', memberJoined: joined,
    peerStates, expectedPeers: amOnStage ? Math.max(0, members.length - 1) : speakerUids.filter(s => s !== uid).length,
  });
  const sorted = sortMembers(members);
  const stage = sorted.filter(m => isStageRole(m.role));
  if (talk && !stage.some(m => m.uid === talk.hostId)) {
    stage.unshift({ uid: talk.hostId, role: 'host', name: talk.hostName || 'Host', photo: talk.hostPhoto, selfMuted: true });
  }
  const audience = sorted.filter(m => !isStageRole(m.role));
  const hands = audience.filter(m => m.handRaised);
  const createdAt = toMillis(talk?.timestamp) || now;
  const count = headcount(talk);

  // ── Render: setup ──────────────────────────────────────────────────────────────
  if (showSetup && !talkId) {
    return (
      <div className="flex-1 flex flex-col p-8 space-y-8 bg-black/40 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-headline uppercase tracking-tight">Setup Talk</h3>
          <button onClick={() => { stopMicTest(); setShowSetup(false); }} aria-label="Close" className="p-2 hover:bg-white/5 rounded-full text-white/40"><X size={20} /></button>
        </div>
        {!user ? (
          <SignInCard reason="Sign in to host a Live Talk." />
        ) : (
          <>
            <div className="space-y-6">
              <Field label="Talk Title">
                <input type="text" maxLength={190} placeholder="The Future of Plajah..." value={setupData.title}
                  onChange={e => setSetupData({ ...setupData, title: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all text-white" />
              </Field>
              <Field label="Topic">
                <input type="text" maxLength={90} placeholder="Tech, Philosophy, Music..." value={setupData.topic}
                  onChange={e => setSetupData({ ...setupData, topic: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all text-white" />
              </Field>
              <Field label="Category">
                <select value={setupData.category} onChange={e => setSetupData({ ...setupData, category: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all appearance-none text-white">
                  {['Discussion', 'Education', 'Entertainment', 'Music', 'Q&A'].map(c => <option key={c} value={c} className="bg-black">{c}</option>)}
                </select>
              </Field>
              <Field label="Microphone">
                <select value={selectedDeviceId} onChange={e => { setSelectedDeviceId(e.target.value); if (isTestingMic) startMicTest(e.target.value); }}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#00DAF3]/50 transition-all appearance-none text-white">
                  {devices.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-black">{d.label || `Microphone (${d.deviceId.slice(0, 5)})`}</option>)}
                  {devices.length === 0 && <option value="" className="bg-black">Default microphone</option>}
                </select>
              </Field>
              <div className="space-y-4 p-5 bg-white/[0.02] border border-white/5 rounded-3xl">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Mic check</span>
                  <button type="button" onClick={() => (isTestingMic ? stopMicTest() : startMicTest(selectedDeviceId))}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${isTestingMic ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-[#00DAF3]/20 border-[#00DAF3]/30 text-[#00DAF3]'}`}>
                    {isTestingMic ? 'Stop Test' : 'Test Mic'}
                  </button>
                </div>
                <div className="relative h-16 w-full bg-black/40 rounded-2xl border border-white/5 overflow-hidden flex items-center justify-center">
                  <canvas ref={canvasRef} width={400} height={64} className={`absolute inset-0 w-full h-full transition-opacity ${isTestingMic ? 'opacity-100' : 'opacity-0'}`} />
                  {!isTestingMic && <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Tap Test Mic to see your level</span>}
                </div>
                {signalConfirmed && (
                  <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    style={{ background: 'var(--pj-success-soft)', color: 'var(--pj-success)' }}>
                    <Volume2 size={12} /> Signal confirmed
                  </div>
                )}
              </div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest">Up to {LIVE_TALK_MAX_PARTICIPANTS} people · {LIVE_TALK_MAX_SPEAKERS} on stage</p>
            </div>
            <button onClick={handleCreateTalk} disabled={!setupData.title.trim() || creating}
              className="w-full py-5 aurora-bg rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-bloom hover:scale-[1.02] active:scale-[0.98] transition-all text-white disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center gap-2">
              {creating ? <><Loader2 size={14} className="animate-spin" /> Going live…</> : 'Go Live'}
            </button>
          </>
        )}
        <Toast msg={toast} />
      </div>
    );
  }

  // ── Render: room ───────────────────────────────────────────────────────────────
  if (talkId) {
    const pill = PHASE_PILL[phase];
    const menuMember = menuFor ? members.find(m => m.uid === menuFor) || stage.find(m => m.uid === menuFor) || null : null;
    return (
      <div className="flex-1 flex flex-col h-full bg-black/40 relative overflow-hidden">
        {Array.from(rtc.remoteStreams.entries()).map(([peer, stream]) => (
          <RemoteAudioPlayer key={peer} stream={stream} muted={langChannelActive} onBlocked={() => setAudioBlocked(true)} />
        ))}

        {/* Floating reactions */}
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
          <AnimatePresence>
            {floaters.map(f => (
              <motion.span key={f.id} className="absolute bottom-24 text-2xl" style={{ left: `${f.x}%` }}
                initial={{ opacity: 0, y: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], y: -260, scale: 1.1 }}
                exit={{ opacity: 0 }} transition={{ duration: 2.4, ease: [0.2, 0, 0, 1] }}>{f.emoji}</motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Header */}
        <div className="p-5 border-b border-white/5 bg-white/[0.02] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] transition-colors"
                style={{ background: pill.bg, color: pill.fg }} aria-live="polite">
                {pill.spin ? <Loader2 size={10} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full ${phase === 'live' ? 'animate-pulse' : ''}`} style={{ background: pill.fg }} />}
                {pill.label}
              </span>
              {talk?.isRecording && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em]"
                  style={{ background: 'var(--pj-danger-soft)', color: 'var(--pj-danger)' }} title="This talk is being recorded">
                  <Circle size={8} fill="currentColor" className="animate-pulse" /> Recording
                </span>
              )}
              {!ended && <span className="text-[10px] font-mono text-white/40">{formatElapsed(now - createdAt)}</span>}
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-black font-mono text-white/50 px-2" title="People in the room / capacity">
                <Users size={11} /> {capacityLabel(count)}
              </span>
              {talk && uid && (
                <button onClick={() => setReport({ type: 'live', id: talk.id, uid: talk.hostId, name: talk.title, snapshot: talk.title })}
                  className="p-2 hover:bg-white/5 rounded-full text-white/40" aria-label="Report this talk" title="Report"><Flag size={14} /></button>
              )}
              <button onClick={() => (amHost && joined && !ended ? setLeaveSheet(true) : leaveRoom())}
                className="p-2 hover:bg-white/5 rounded-full text-white/50" aria-label="Leave"><X size={16} /></button>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-white leading-tight">{talk?.title || 'Live Talk'}</h3>
            {talk && <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.1em]">{talk.topic} • {talk.category} • Hosted by {talk.hostName}</p>}
          </div>
          {talk?.isRecording && !amHost && (
            <p className="text-[10px] text-white/50">The host is recording this talk. Anything said on stage may be published.</p>
          )}
          {joined && !ended && (
            <div className="px-1"><LanguageChannels getStreams={() => Array.from(rtc.remoteStreams.values())} onActiveChange={setLangChannelActive} /></div>
          )}
        </div>

        {/* Blocking states */}
        {(phase === 'signin' || phase === 'full' || phase === 'ended' || block) ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
              className="max-w-sm w-full text-center space-y-4 p-8 glass border border-white/5 rounded-3xl">
              {phase === 'ended' || block === 'ended' ? (
                <><Radio size={28} className="mx-auto text-white/30" /><h4 className="text-sm font-black uppercase tracking-widest">This talk has ended</h4>
                  <button onClick={resetRoom} className="w-full py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest">Find another talk</button></>
              ) : phase === 'signin' ? (
                <SignInCard reason="Sign in to listen, chat and raise your hand." />
              ) : block === 'full' ? (
                <><Users size={28} className="mx-auto text-white/40" />
                  <h4 className="text-sm font-black uppercase tracking-widest">This talk is full ({capacityLabel(count)})</h4>
                  <p className="text-[11px] text-white/50">Live Talk rooms hold {LIVE_TALK_MAX_PARTICIPANTS} people for now so the audio stays crisp.</p>
                  {count < LIVE_TALK_MAX_PARTICIPANTS ? (
                    <button onClick={() => talkId && enter(talkId)} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-black" style={{ background: 'var(--pj-cyan)' }}>Join now</button>
                  ) : waitingForSpot ? (
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--pj-cyan)' }}><Bell size={11} className="inline mr-1" />We'll tell you here when a spot opens</p>
                  ) : (
                    <button onClick={() => setWaitingForSpot(true)} className="w-full py-3 bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">Notify me when a spot opens</button>
                  )}
                  <button onClick={resetRoom} className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-white/40">Back</button></>
              ) : block === 'kicked' ? (
                <><UserX size={28} className="mx-auto text-white/40" /><h4 className="text-sm font-black uppercase tracking-widest">You were removed from this talk</h4>
                  <button onClick={resetRoom} className="w-full py-3 bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">Back</button></>
              ) : (
                <><Lock size={28} className="mx-auto text-white/40" /><h4 className="text-sm font-black uppercase tracking-widest">This talk isn't available to you</h4>
                  <button onClick={resetRoom} className="w-full py-3 bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">Back</button></>
              )}
            </motion.div>
          </div>
        ) : (
          <>
            {/* Banners */}
            <AnimatePresence>
              {audioBlocked && (
                <Banner key="ab" tone="cyan" onClick={unblockAudio}><Volume2 size={12} /> Tap to turn on room audio</Banner>
              )}
              {rtc.error && amOnStage && (
                <Banner key="err" tone="warning">Microphone unavailable ({rtc.error}). You can still listen and chat.</Banner>
              )}
              {hostGone && !amHost && (
                <Banner key="hg" tone="warning">The host lost connection{cohosts.length ? ' — a co-host will take over shortly' : ''}…</Banner>
              )}
              {mutedByHost && amOnStage && <Banner key="mbh" tone="warning"><MicOff size={12} /> A moderator muted you</Banner>}
            </AnimatePresence>

            {/* Stage */}
            <div className="px-5 pt-5 pb-4 border-b border-white/5 bg-black/20 space-y-4 overflow-y-auto max-h-[42%]">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--pj-cyan)' }}>On stage</h4>
                <span className="text-[10px] font-black font-mono text-white/30">{stage.length}/{LIVE_TALK_MAX_SPEAKERS}</span>
              </div>
              <motion.div layout className="flex flex-wrap gap-3">
                <AnimatePresence>
                  {stage.map(m => (
                    <SpeakerTile key={m.uid} member={m} isMe={m.uid === uid}
                      stream={m.uid === uid ? rtc.localStream : (rtc.remoteStreams.get(m.uid) || null)}
                      canAct={!!uid} onMenu={() => setMenuFor(m.uid)} />
                  ))}
                </AnimatePresence>
              </motion.div>

              {amMod && hands.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 p-3 rounded-2xl border"
                  style={{ background: 'var(--pj-cyan-soft)', borderColor: 'rgba(0,218,243,0.25)' }}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--pj-cyan)' }}><Hand size={11} className="inline mr-1" />Requests to speak</h4>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--pj-cyan)' }}>{hands.length}</span>
                  </div>
                  {hands.map(m => (
                    <div key={m.uid} className="flex items-center gap-2 bg-black/40 p-2 rounded-xl">
                      <img src={avatarFor(m.uid, m.photo)} className="w-7 h-7 rounded-lg" alt="" />
                      <span className="flex-1 text-[11px] font-bold truncate">{m.name}</span>
                      <button onClick={() => moveTo(m, 'speaker')} disabled={stageCount >= LIVE_TALK_MAX_SPEAKERS}
                        className="px-2.5 py-1 text-black text-[8px] font-black rounded-lg uppercase tracking-wider disabled:opacity-40" style={{ background: 'var(--pj-cyan)' }}>Invite</button>
                      <button onClick={() => talkId && svc.lowerHandFor(talkId, m.uid).catch(() => {})} className="px-2 py-1 text-[8px] font-black rounded-lg uppercase tracking-wider bg-white/10">Dismiss</button>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex border-b border-white/5">
                {(['CHAT', 'PEOPLE', 'ASSETS'] as const).map(tab => (
                  <button key={tab} onClick={() => setTalkTab(tab)}
                    className={`flex-1 py-3 text-[8px] font-black uppercase tracking-widest transition-colors ${talkTab === tab ? 'bg-white/5 text-white border-b-2 border-[#00DAF3]' : 'text-white/30 hover:text-white/50'}`}>
                    {tab === 'CHAT' ? 'Chat' : tab === 'PEOPLE' ? `Listeners (${audience.length})` : `Shared (${talk?.sharedAssets?.length || 0})`}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                {talkTab === 'CHAT' && (
                  <>
                    {messages.length >= chatLimit && (
                      <button onClick={() => setChatLimit(n => n + CHAT_PAGE)} className="w-full py-2 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/70">Load earlier messages</button>
                    )}
                    {messages.length === 0 && <p className="text-center text-[10px] uppercase tracking-widest text-white/20 py-8">Say hi to the room</p>}
                    {messages.map(msg => (
                      <div key={msg.id} className="flex gap-3 group">
                        <img src={avatarFor(msg.senderId, msg.senderPhoto)} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 shrink-0" alt="" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest truncate" style={{ color: 'var(--pj-cyan)' }}>{msg.senderName}</span>
                            <span className="text-[8px] font-mono text-white/20">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {(amMod || msg.senderId === uid) && (
                              <button onClick={() => talkId && svc.deleteTalkChat(talkId, msg.id).catch(() => flash('Could not delete'))}
                                className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 text-white/30 hover:text-red-400 transition-opacity" aria-label="Delete message"><Trash2 size={12} /></button>
                            )}
                          </div>
                          <p className="text-sm text-white/75 leading-relaxed break-words">{msg.text}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
                {talkTab === 'PEOPLE' && (
                  <div className="space-y-2">
                    {audience.length === 0 && <p className="text-center text-[10px] uppercase tracking-widest text-white/20 py-8">Waiting for listeners…</p>}
                    {audience.map(m => (
                      <button key={m.uid} onClick={() => setMenuFor(m.uid)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left">
                        <img src={avatarFor(m.uid, m.photo)} className="w-8 h-8 rounded-xl" alt="" />
                        <span className="flex-1 text-[12px] font-bold truncate">{m.uid === uid ? `${m.name} (you)` : m.name}</span>
                        {m.handRaised && <Hand size={12} style={{ color: 'var(--pj-cyan)' }} />}
                        <MoreHorizontal size={14} className="text-white/30" />
                      </button>
                    ))}
                  </div>
                )}
                {talkTab === 'ASSETS' && (
                  <div className="space-y-3">
                    {(talk?.sharedAssets || []).slice().reverse().map((asset, idx) => (
                      <div key={asset.id || idx} className="p-3 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3">
                        <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">{asset.type === 'MUSIC' ? <Music size={14} className="text-white/40" /> : <Film size={14} className="text-white/40" />}</div>
                        <div className="flex-1 min-w-0">
                          <h5 className="text-[11px] font-black text-white truncate">{asset.title}</h5>
                          <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{asset.type} • {new Date(asset.timestamp).toLocaleTimeString()}</p>
                        </div>
                        <button aria-label="Play" onClick={() => {
                          if (asset.type === 'MUSIC' && asset.mediaId) playTrack({ id: asset.mediaId, title: asset.title, url: asset.url } as any, null, 'RADIO');
                          else if (asset.type === 'VIDEO' && asset.mediaId) playVideo({ id: asset.mediaId, title: asset.title, url: asset.url } as any);
                        }} className="p-2 hover:text-[#00DAF3]"><Play size={14} fill="currentColor" /></button>
                      </div>
                    ))}
                    {!(talk?.sharedAssets || []).length && (
                      <div className="text-center py-10"><List size={28} className="mx-auto mb-3 text-white/10" /><p className="text-[10px] font-black uppercase tracking-widest text-white/20">Nothing shared yet</p></div>
                    )}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="p-4 bg-black/40 border-t border-white/5 space-y-3">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {amOnStage ? (
                    <button onClick={toggleMyMic} disabled={mutedByHost}
                      className="flex-1 min-w-[120px] py-3 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border disabled:opacity-60"
                      style={selfMuted || mutedByHost
                        ? { background: 'var(--pj-danger-soft)', borderColor: 'rgba(239,68,68,0.3)', color: 'var(--pj-danger)' }
                        : { background: 'var(--pj-success-soft)', borderColor: 'rgba(6,214,160,0.3)', color: 'var(--pj-success)' }}>
                      {selfMuted || mutedByHost ? <MicOff size={14} /> : <Mic size={14} />}
                      {mutedByHost ? 'Muted by host' : selfMuted ? 'Unmute' : 'Mute'}
                    </button>
                  ) : joined && (
                    <button onClick={toggleHand}
                      className="flex-1 min-w-[120px] py-3 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border transition-colors"
                      style={myMember?.handRaised ? { background: 'var(--pj-cyan)', color: '#000', borderColor: 'transparent' } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <Hand size={14} /> {myMember?.handRaised ? 'Lower hand' : 'Raise hand'}
                    </button>
                  )}
                  {amOnStage && devices.length > 1 && (
                    <select aria-label="Microphone" value={rtc.activeDevices.micId || selectedDeviceId}
                      onChange={e => { setSelectedDeviceId(e.target.value); rtc.switchAudioDevice(e.target.value); }}
                      className="bg-black/80 border border-white/10 rounded-xl px-2 py-3 text-[9px] text-white outline-none max-w-[120px]">
                      {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic (${d.deviceId.slice(0, 5)})`}</option>)}
                    </select>
                  )}
                  {amOnStage && (
                    <button onClick={handleShareCurrent} className="p-3 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10" title="Share what you're playing" aria-label="Share media"><Share2 size={14} /></button>
                  )}
                  {amHost && (
                    <button onClick={toggleRecording} title={rtc.isRecording ? 'Stop & save as podcast' : 'Record'} aria-label="Record"
                      className={`p-3 rounded-xl border ${rtc.isRecording ? 'animate-pulse' : 'bg-white/5 border-white/10 text-white/70'}`}
                      style={rtc.isRecording ? { background: 'var(--pj-danger-soft)', borderColor: 'rgba(239,68,68,0.3)', color: 'var(--pj-danger)' } : undefined}>
                      <Circle size={14} fill={rtc.isRecording ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  {amOnStage && !amHost && (
                    <button onClick={() => talkId && uid && svc.stepDown(talkId, uid).catch(() => {})} title="Leave the stage" aria-label="Leave the stage"
                      className="p-3 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10"><ArrowDown size={14} /></button>
                  )}
                </div>
                {joined && (
                  <div className="flex items-center justify-between gap-1">
                    {REACTION_EMOJIS.map(e => (
                      <motion.button key={e} whileTap={{ scale: 1.35 }} onClick={() => react(e)} aria-label={`React ${e}`}
                        className="flex-1 py-1.5 rounded-xl hover:bg-white/5 text-lg">{e}</motion.button>
                    ))}
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="relative">
                  <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} maxLength={500} disabled={!joined}
                    placeholder={joined ? 'Say something…' : 'Join to chat'}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pr-12 text-sm outline-none focus:border-[#00DAF3]/50 transition-colors text-white disabled:opacity-50" />
                  <button type="submit" disabled={!joined || !inputText.trim()} aria-label="Send" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#00DAF3] disabled:opacity-30"><Send size={18} /></button>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Member action sheet */}
        <AnimatePresence>
          {menuMember && talk && (
            <Sheet onClose={() => setMenuFor(null)}>
              <div className="flex items-center gap-3 mb-4">
                <img src={avatarFor(menuMember.uid, menuMember.photo)} className="w-10 h-10 rounded-xl" alt="" />
                <div className="min-w-0">
                  <p className="text-sm font-black truncate">{menuMember.name}{menuMember.uid === uid ? ' (you)' : ''}</p>
                  <p className="text-[9px] uppercase tracking-widest text-white/40">{menuMember.role === 'cohost' ? 'Co-host' : menuMember.role}</p>
                </div>
              </div>
              <div className="space-y-1">
                {menuMember.uid === uid ? (
                  <>
                    {amOnStage && !amHost && <SheetBtn icon={<ArrowDown size={14} />} onClick={() => { setMenuFor(null); talkId && uid && svc.stepDown(talkId, uid).catch(() => {}); }}>Leave the stage</SheetBtn>}
                    {amOnStage && <SheetBtn icon={selfMuted ? <Mic size={14} /> : <MicOff size={14} />} onClick={() => { setMenuFor(null); void toggleMyMic(); }}>{selfMuted ? 'Unmute' : 'Mute'}</SheetBtn>}
                  </>
                ) : (
                  <>
                    {amMod && menuMember.uid !== talk.hostId && (
                      <>
                        {isStageRole(menuMember.role) && (
                          <SheetBtn icon={menuMember.mutedByHost ? <Mic size={14} /> : <MicOff size={14} />}
                            onClick={() => { setMenuFor(null); talkId && svc.setMutedByHost(talkId, menuMember.uid, !menuMember.mutedByHost).catch(() => flash('Not allowed')); }}>
                            {menuMember.mutedByHost ? 'Allow to unmute' : 'Mute'}
                          </SheetBtn>
                        )}
                        {!isStageRole(menuMember.role) && <SheetBtn icon={<ArrowUp size={14} />} onClick={() => moveTo(menuMember, 'speaker')}>Invite to speak</SheetBtn>}
                        {menuMember.role === 'speaker' && <SheetBtn icon={<ArrowDown size={14} />} onClick={() => moveTo(menuMember, 'listener')}>Move to audience</SheetBtn>}
                        {amHost && menuMember.role !== 'cohost' && <SheetBtn icon={<Crown size={14} />} onClick={() => moveTo(menuMember, 'cohost')}>Make co-host</SheetBtn>}
                        {amHost && menuMember.role === 'cohost' && <SheetBtn icon={<Shield size={14} />} onClick={() => moveTo(menuMember, 'speaker')}>Remove co-host</SheetBtn>}
                        {(amHost || menuMember.role !== 'cohost') && <SheetBtn danger icon={<UserMinus size={14} />} onClick={() => kick(menuMember)}>Remove from talk</SheetBtn>}
                      </>
                    )}
                    <SheetBtn icon={<Flag size={14} />} onClick={() => { setMenuFor(null); setReport({ type: 'profile', id: menuMember.uid, uid: menuMember.uid, name: menuMember.name }); }}>Report {menuMember.name}</SheetBtn>
                  </>
                )}
              </div>
            </Sheet>
          )}
          {leaveSheet && talk && (
            <Sheet onClose={() => setLeaveSheet(false)}>
              <h4 className="text-sm font-black uppercase tracking-widest mb-1">Leave this talk?</h4>
              <p className="text-[11px] text-white/50 mb-4">{rtc.isRecording ? 'The recording will be saved as a podcast episode.' : 'Everyone in the room will be notified.'}</p>
              <div className="space-y-1">
                <SheetBtn danger icon={<Radio size={14} />} onClick={endForAll}>End talk for everyone</SheetBtn>
                {cohosts.map(c => (
                  <SheetBtn key={c.uid} icon={<LogOut size={14} />} onClick={() => handOffAndLeave(c)}>Leave — {c.name} keeps hosting</SheetBtn>
                ))}
                {cohosts.length === 0 && <p className="text-[10px] text-white/30 px-3 py-2">Make someone a co-host to leave without ending the talk.</p>}
                <SheetBtn icon={<X size={14} />} onClick={() => setLeaveSheet(false)}>Stay</SheetBtn>
              </div>
            </Sheet>
          )}
        </AnimatePresence>

        {report && (
          <ReportDialog open onClose={() => setReport(null)} targetType={report.type} targetId={report.id} targetUid={report.uid}
            targetName={report.name} snapshot={report.snapshot} />
        )}
        <Toast msg={toast} />
      </div>
    );
  }

  // ── Render: lobby ──────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full bg-black/40 overflow-y-auto">
      <div className="p-8 text-center space-y-10">
        <div className="space-y-4">
          <div className="w-24 h-24 bg-primary/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-bloom"><Mic size={40} className="text-primary" /></div>
          <div>
            <h3 className="text-3xl font-headline uppercase tracking-tight">LiveTalk</h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mt-2">Live audio rooms</p>
          </div>
        </div>
        {activeTalks.length > 0 ? (
          <div className="space-y-3 text-left">
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Live now</span>
              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">Live</span>
            </div>
            <AnimatePresence>
              {activeTalks.map(t => {
                const full = headcount(t) >= LIVE_TALK_MAX_PARTICIPANTS;
                return (
                  <motion.button layout key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    onClick={() => enter(t.id)} className="w-full p-5 glass border border-white/5 rounded-3xl text-left hover:bg-white/10 transition-colors group">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={avatarFor(t.hostId, t.hostPhoto)} className="w-8 h-8 rounded-lg shadow-lg" alt="" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60 truncate">{t.hostName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(t as LiveTalkDoc).isRecording && <Circle size={8} fill="currentColor" style={{ color: 'var(--pj-danger)' }} />}
                        <Users size={12} className="text-white/30" />
                        <span className="text-[10px] font-black font-mono" style={{ color: full ? 'var(--pj-warning)' : 'rgba(255,255,255,0.5)' }}>{capacityLabel(headcount(t))}</span>
                      </div>
                    </div>
                    <h5 className="text-sm font-black uppercase tracking-tight text-white group-hover:text-[#00DAF3] transition-colors">{t.title}</h5>
                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-1">{t.topic}{full ? ' · Full' : ''}</p>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="py-12 glass border border-white/5 rounded-3xl">
            <Radio size={32} className="mx-auto mb-4 text-white/20" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">No live talks right now</p>
          </div>
        )}
        <div className="space-y-3">
          <button onClick={() => setShowSetup(true)} className="w-full py-5 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-primary hover:text-white transition-colors">Host a Talk</button>
          <button onClick={onBrowse} className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] text-white/60 hover:bg-white/10">Browse Archives</button>
        </div>
      </div>
      <Toast msg={toast} />
    </div>
  );
};

// ── Small presentational pieces ───────────────────────────────────────────────────

const PHASE_PILL: Record<TalkPhase, { label: string; bg: string; fg: string; spin?: boolean }> = {
  signin: { label: 'Sign in to listen', bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.7)' },
  full: { label: 'Full', bg: 'var(--pj-warning-soft)', fg: 'var(--pj-warning)' },
  joining: { label: 'Joining', bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.7)', spin: true },
  connecting: { label: 'Connecting', bg: 'var(--pj-cyan-soft)', fg: 'var(--pj-cyan)', spin: true },
  live: { label: 'Live', bg: 'var(--pj-danger-soft)', fg: 'var(--pj-danger)' },
  reconnecting: { label: 'Reconnecting', bg: 'var(--pj-warning-soft)', fg: 'var(--pj-warning)', spin: true },
  ended: { label: 'Ended', bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.5)' },
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-2">
    <span className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-2">{label}</span>
    {children}
  </label>
);

const SignInCard: React.FC<{ reason: string }> = ({ reason }) => (
  <div className="space-y-4 text-center">
    <Mic size={28} className="mx-auto text-white/40" />
    <p className="text-sm text-white/70">{reason}</p>
    <button onClick={() => { loginWithGoogle().catch(() => {}); }}
      className="w-full py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest">Sign in</button>
  </div>
);

const Banner: React.FC<{ tone: 'cyan' | 'warning'; onClick?: () => void; children: React.ReactNode }> = ({ tone, onClick, children }) => (
  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
    className="overflow-hidden">
    <div role={onClick ? 'button' : 'status'} onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2 text-[10px] font-black uppercase tracking-widest ${onClick ? 'cursor-pointer' : ''}`}
      style={tone === 'cyan' ? { background: 'var(--pj-cyan-soft)', color: 'var(--pj-cyan)' } : { background: 'var(--pj-warning-soft)', color: 'var(--pj-warning)' }}>
      {children}
    </div>
  </motion.div>
);

const Sheet: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <motion.div className="absolute inset-0 z-40 flex items-end justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: 0.2 }} onClick={onClose}>
    <motion.div className="w-full max-w-md m-3 p-5 rounded-3xl border border-white/10 bg-[#111] shadow-2xl" onClick={e => e.stopPropagation()}
      initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}>
      {children}
    </motion.div>
  </motion.div>
);

const SheetBtn: React.FC<{ icon: React.ReactNode; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ icon, onClick, danger, children }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 text-left text-[12px] font-bold transition-colors"
    style={danger ? { color: 'var(--pj-danger)' } : undefined}>
    {icon}<span className="truncate">{children}</span>
  </button>
);

const Toast: React.FC<{ msg: string | null }> = ({ msg }) => (
  <AnimatePresence>
    {msg && (
      <motion.div role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }}
        className="absolute left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2 rounded-full bg-white text-black text-[11px] font-bold shadow-2xl max-w-[90%] text-center">
        {msg}
      </motion.div>
    )}
  </AnimatePresence>
);

export default LiveTalkView;
