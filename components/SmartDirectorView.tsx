/**
 * SmartDirectorView — the Smart Director control surface.
 *
 * "Turn your child's sporting event into a professional broadcast." Several
 * people at a game each contribute a phone camera; a shared AUTO-director (or a
 * human tapping TAKE) decides which camera is the live PROGRAM feed, and every
 * viewer renders that switched broadcast.
 *
 * ONE component, three postures resolved from the shared production doc:
 *   • PRODUCER  (owner)       — full multiview, AUTO/MANUAL, tap-to-take, runs
 *                               the auto-director loop, drives the scoreboard.
 *   • CONTRIBUTOR (joined)    — sees the multiview + which feed is live, controls
 *                               their OWN camera + role, can suggest cuts.
 *   • VIEWER (everyone else)  — sees only the big PROGRAM feed + scoreboard.
 *
 * ─── Remote media wiring (rtcCore) ─────────────────────────────────────────────
 * This file renders the DIRECTION STATE (the "master feed" = shared Firestore
 * truth) and the local camera fully. The actual REMOTE contributor pixels ride
 * services/rtcCore.ts (mesh topology, one RtcSession per production keyed by
 * feedId). Every place a remote stream needs to attach is marked
 * `TODO(rtcCore)` — call attachRemoteStream(feedId, stream) from the RtcSession
 * onRemoteStream handler and the tile lights up with no other change.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio, Video, VideoOff, Wand2, Hand, ArrowLeft, Users, Circle,
  Zap, Camera, Mic, ClipboardList, Newspaper, Dot,
} from 'lucide-react';
import {
  createProduction, joinAsContributor, updateFeed, setProgram, setMode,
  leaveProduction, subscribeProduction,
  type SmartProduction, type DirectorFeed, type ContributorRole,
} from '../services/smartDirectorService';
import {
  DirectorEngine, createMotionScorer,
  type FeedActivity, type MotionScorer,
} from '../services/directorEngine';
import {
  subscribeGameState, updateGameState, pushHighlight,
  type GameState,
} from '../services/sportscastService';
import SportsProducerPanel from './SportsProducerPanel';

// ─── Constants / helpers ──────────────────────────────────────────────────────

const ORANGE = '#FF8C00';

const ROLES: { id: ContributorRole; label: string; icon: React.ReactNode }[] = [
  { id: 'camera',        label: 'Camera',       icon: <Camera size={13} /> },
  { id: 'correspondent', label: 'Correspondent', icon: <Newspaper size={13} /> },
  { id: 'commentator',   label: 'Commentator',  icon: <Mic size={13} /> },
  { id: 'scorekeeper',   label: 'Scorekeeper',  icon: <ClipboardList size={13} /> },
];

interface Props {
  productionId?: string;
  /** PlajahEvent-ish (title / lat / lng). Kept loose on purpose. */
  event?: any;
  /** Signed-in user ({ uid, displayName, ... }). */
  currentUser: any;
  onBack: () => void;
}

type Posture = 'PRODUCER' | 'CONTRIBUTOR' | 'VIEWER';

// ─── Component ────────────────────────────────────────────────────────────────

const SmartDirectorView: React.FC<Props> = ({ productionId, event, currentUser, onBack }) => {
  const uid: string = currentUser?.uid || currentUser?.id || '';
  const displayName: string = currentUser?.displayName || currentUser?.name || 'Guest';

  const [prodId, setProdId] = useState<string | undefined>(productionId);
  const [production, setProduction] = useState<SmartProduction | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localOn, setLocalOn] = useState(true);
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [directorReason, setDirectorReason] = useState<string>('');

  // ── Media refs ──────────────────────────────────────────────────────────────
  const localStreamRef = useRef<MediaStream | null>(null);
  /** feedId -> <video> element (own feed shows local; others await rtcCore). */
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  /** feedId -> attached remote MediaStream (populated by attachRemoteStream). */
  const remoteStreams = useRef<Map<string, MediaStream>>(new Map());
  /** feedId -> MotionScorer (per-feed previous-frame memory). */
  const scorers = useRef<Map<string, MotionScorer>>(new Map());
  const engineRef = useRef<DirectorEngine>(new DirectorEngine({ smoothing: 0.3 }));
  const rafRef = useRef<number | null>(null);
  const lastScoreTsRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  // Keep a live ref to the production so the rAF loop reads fresh state.
  const productionRefLatest = useRef<SmartProduction | null>(null);
  productionRefLatest.current = production;

  // ── Posture resolution ────────────────────────────────────────────────────
  const posture: Posture = useMemo(() => {
    if (!production) return 'VIEWER';
    if (production.ownerId === uid) return 'PRODUCER';
    if (production.feeds.some(f => f.contributorId === uid)) return 'CONTRIBUTOR';
    return 'VIEWER';
  }, [production, uid]);

  const myFeed: DirectorFeed | null = useMemo(
    () => production?.feeds.find(f => f.contributorId === uid) ?? null,
    [production, uid],
  );

  // ── Create-or-attach the production ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (productionId) { setProdId(productionId); return; }
      if (!uid || creating) return;
      // No production id supplied → this user opens a new one as the producer.
      setCreating(true);
      const created = await createProduction({
        ownerId: uid,
        ownerName: displayName,
        eventTitle: event?.title || event?.name || 'Live Sports Broadcast',
        ownerJoinsAsCamera: true,
        ownerLabel: 'Cam 1',
      });
      if (!cancelled && created) setProdId(created.id);
      setCreating(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionId, uid]);

  // ── Subscribe to production + scoreboard ────────────────────────────────────
  useEffect(() => {
    if (!prodId) return;
    const unsub = subscribeProduction(prodId, setProduction);
    return unsub;
  }, [prodId]);

  useEffect(() => {
    const feedId = production?.feedId;
    if (!feedId) return;
    const unsub = subscribeGameState(feedId, setGameState);
    return unsub;
  }, [production?.feedId]);

  // ── Acquire the local camera (producer + contributor publish; viewer doesn't) ─
  const publishes = posture === 'PRODUCER' || posture === 'CONTRIBUTOR';
  useEffect(() => {
    if (!publishes) return;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        });
        localStreamRef.current = stream;
        // Bind to my own tile if it's already mounted.
        if (myFeed) bindVideo(myFeed.id, stream);
        // TODO(rtcCore): publish this stream on the production's RtcSession
        //   (mesh topology, sessionId = production.id, selfId = uid) so the other
        //   contributors/viewers receive it. See services/rtcCore.ts.
      } catch (e) {
        console.warn('[SmartDirector] camera unavailable:', (e as Error)?.message);
      }
    })();
    return () => { stream?.getTracks().forEach(t => t.stop()); localStreamRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishes, myFeed?.id]);

  // Ensure this user is on the roster when they land as a would-be contributor
  // on a production they don't own and haven't joined yet.
  useEffect(() => {
    if (!prodId || !production || !uid) return;
    if (production.ownerId === uid) return;               // owner already on roster
    if (production.feeds.some(f => f.contributorId === uid)) return; // already joined
    // Auto-join as a camera. (A landing "join as viewer" flow would skip this.)
    joinAsContributor(prodId, { contributorId: uid, contributorName: displayName, role: 'camera' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodId, production?.id, uid]);

  // ── <video> binding ─────────────────────────────────────────────────────────
  const bindVideo = useCallback((feedId: string, stream: MediaStream | null) => {
    const el = videoRefs.current.get(feedId);
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play?.().catch(() => {});
    }
  }, []);

  const registerVideo = useCallback((feedId: string, el: HTMLVideoElement | null) => {
    if (!el) { videoRefs.current.delete(feedId); return; }
    videoRefs.current.set(feedId, el);
    // My own feed → local stream; others → any remote stream already received.
    if (feedId === myFeed?.id && localStreamRef.current) bindVideo(feedId, localStreamRef.current);
    else if (remoteStreams.current.has(feedId)) bindVideo(feedId, remoteStreams.current.get(feedId)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myFeed?.id, bindVideo]);

  /**
   * PUBLIC hookup point for rtcCore. Call this from the RtcSession's
   * onRemoteStream(peerId, stream) handler with feedId === peerId. The tile for
   * that feed will start showing the remote camera and become scorable by the
   * auto-director. (Exposed on window in dev for manual wiring/testing.)
   */
  const attachRemoteStream = useCallback((feedId: string, stream: MediaStream) => {
    remoteStreams.current.set(feedId, stream);
    bindVideo(feedId, stream);
  }, [bindVideo]);

  useEffect(() => {
    // TODO(rtcCore): remove this dev shim once RtcSession wiring lands.
    (window as any).__smartDirectorAttach = attachRemoteStream;
    return () => { if ((window as any).__smartDirectorAttach === attachRemoteStream) delete (window as any).__smartDirectorAttach; };
  }, [attachRemoteStream]);

  // ── AUTO director loop (owner only) ─────────────────────────────────────────
  useEffect(() => {
    if (posture !== 'PRODUCER' || !prodId) return;

    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick);
      // Score at ~4 Hz — plenty for shot decisions, cheap on the main thread.
      if (ts - lastScoreTsRef.current < 250) return;
      lastScoreTsRef.current = ts;

      const prod = productionRefLatest.current;
      if (!prod || prod.directionState.mode !== 'AUTO') return;

      const activity: FeedActivity[] = prod.feeds.map(f => {
        let scorer = scorers.current.get(f.id);
        if (!scorer) { scorer = createMotionScorer(); scorers.current.set(f.id, scorer); }
        const el = videoRefs.current.get(f.id);
        return {
          feedId: f.id,
          activityScore: scorer.score(el),
          role: f.role,
          lastOnAt: f.lastOnAt,
          active: f.active,
        };
      });

      const decision = engineRef.current.decide(activity, prod.directionState, prod.settings, Date.now());
      if (decision && decision.programFeedId !== prod.directionState.programFeedId) {
        setDirectorReason(decision.reason);
        setProgram(prodId, decision.programFeedId, 'auto-director');
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      scorers.current.forEach(s => s.dispose());
      scorers.current.clear();
      engineRef.current.reset();
    };
  }, [posture, prodId]);

  // ── Cleanup on unmount: leave the roster ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (prodId && uid && posture === 'CONTRIBUTOR') leaveProduction(prodId, uid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodId, uid, posture]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const mode = production?.directionState.mode ?? 'AUTO';
  const programFeedId = production?.directionState.programFeedId ?? '';

  const toggleMode = useCallback(() => {
    if (!prodId) return;
    setMode(prodId, mode === 'AUTO' ? 'MANUAL' : 'AUTO', uid);
  }, [prodId, mode, uid]);

  const take = useCallback((feedId: string) => {
    if (!prodId) return;
    // A human TAKE is an override: drop to MANUAL so the director doesn't cut back.
    if (mode === 'AUTO') setMode(prodId, 'MANUAL', uid);
    setProgram(prodId, feedId, uid);
  }, [prodId, mode, uid]);

  const changeMyRole = useCallback((role: ContributorRole) => {
    if (!prodId || !myFeed) return;
    updateFeed(prodId, myFeed.id, { role });
  }, [prodId, myFeed]);

  const toggleLocalCam = useCallback(() => {
    const on = !localOn;
    setLocalOn(on);
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = on; });
  }, [localOn]);

  const logHighlight = useCallback(() => {
    const feedId = production?.feedId;
    if (!feedId || !gameState) return;
    pushHighlight(feedId, {
      type: 'BIG_PLAY',
      label: 'Big Play',
      team: null,
      commentaryText: `Big play! ${gameState.homeTeam} ${gameState.homeScore} - ${gameState.awayScore} ${gameState.awayTeam}`,
    });
  }, [production?.feedId, gameState]);

  // Record the PROGRAM picture locally (MVP: records whatever stream is bound to
  // the current program tile — the producer's own feed today, remote once wired).
  const toggleRecord = useCallback(() => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    const el = videoRefs.current.get(programFeedId);
    const src: MediaStream | null =
      (el?.srcObject as MediaStream | null) || localStreamRef.current;
    if (!src || !('MediaRecorder' in window)) return;
    try {
      recordedChunks.current = [];
      const rec = new MediaRecorder(src, { mimeType: 'video/webm' });
      rec.ondataavailable = e => { if (e.data.size) recordedChunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        // TODO(archive): hand `blob`/`url` to the highlight/clip archiver instead
        // of only exposing it here.
        (window as any).__smartDirectorLastClip = url;
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      console.warn('[SmartDirector] record failed:', (e as Error)?.message);
    }
  }, [recording, programFeedId]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const feeds = production?.feeds ?? [];
  const programFeed = feeds.find(f => f.id === programFeedId) ?? null;

  // VIEWER: just the big PROGRAM feed + scoreboard.
  if (posture === 'VIEWER') {
    return (
      <div className="fixed inset-0 z-[700] bg-black flex flex-col">
        <TopBar
          title={production?.eventTitle || 'Live Broadcast'}
          posture={posture}
          onBack={onBack}
          feedCount={feeds.length}
        />
        <div className="flex-1 relative flex items-center justify-center p-4">
          <ProgramStage
            programFeed={programFeed}
            registerVideo={registerVideo}
            gameState={gameState}
            reason=""
            big
          />
        </div>
      </div>
    );
  }

  // PRODUCER / CONTRIBUTOR.
  const canDirect = posture === 'PRODUCER';

  return (
    <div className="fixed inset-0 z-[700] bg-[#07070c] flex flex-col text-white">
      <TopBar
        title={production?.eventTitle || 'Smart Director'}
        posture={posture}
        onBack={onBack}
        feedCount={feeds.length}
        right={
          canDirect && (
            <button
              onClick={toggleMode}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all ${
                mode === 'AUTO'
                  ? 'border-orange-500/50 bg-orange-500/15 text-orange-400'
                  : 'border-white/15 bg-white/5 text-white/70 hover:border-white/30'
              }`}
              title="Toggle auto-director"
            >
              {mode === 'AUTO' ? <Wand2 size={14} /> : <Hand size={14} />}
              {mode === 'AUTO' ? 'Auto Director' : 'Manual'}
            </button>
          )
        }
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-3">
        {/* ── PROGRAM stage ─────────────────────────────────────────────── */}
        <div className="lg:w-[62%] flex flex-col gap-3 min-h-0">
          <ProgramStage
            programFeed={programFeed}
            registerVideo={registerVideo}
            gameState={gameState}
            reason={mode === 'AUTO' ? directorReason : ''}
          />

          {/* Producer scoreboard controls reuse the existing sportscast panel. */}
          {canDirect && production?.feedId && <SportsProducerPanel feedId={production.feedId} />}
        </div>

        {/* ── Multiview + controls ──────────────────────────────────────── */}
        <div className="lg:w-[38%] flex flex-col gap-3 min-h-0">
          {/* My role picker (contributor) */}
          {myFeed && (
            <div className="bg-white/4 border border-white/10 rounded-2xl p-3">
              <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">
                My Role · {myFeed.label}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => changeMyRole(r.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                      myFeed.role === r.id
                        ? 'border-orange-500/50 bg-orange-500/15 text-orange-400'
                        : 'border-white/8 bg-white/4 text-white/50 hover:border-white/20'
                    }`}
                  >
                    {r.icon} {r.label}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleLocalCam}
                className={`mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                  localOn
                    ? 'border-white/10 bg-white/5 text-white/70'
                    : 'border-red-500/40 bg-red-500/15 text-red-400'
                }`}
              >
                {localOn ? <Video size={13} /> : <VideoOff size={13} />}
                {localOn ? 'Camera On' : 'Camera Off'}
              </button>
            </div>
          )}

          {/* Multiview grid */}
          <div className="flex items-center justify-between px-1">
            <p className="text-white/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <Users size={12} /> Multiview · {feeds.length}
            </p>
            {mode === 'AUTO' && canDirect && (
              <span className="text-orange-400/70 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Circle size={7} className="fill-orange-400 text-orange-400 animate-pulse" /> Directing
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-2 pr-0.5">
            {feeds.length === 0 && (
              <div className="col-span-2 text-center text-white/30 text-xs py-10">
                Waiting for cameras to join…
              </div>
            )}
            {feeds.map(f => (
              <FeedTile
                key={f.id}
                feed={f}
                isProgram={f.id === programFeedId}
                isMine={f.contributorId === uid}
                canTake={canDirect}
                onTake={() => take(f.id)}
                registerVideo={registerVideo}
              />
            ))}
          </div>

          {/* Record / Highlight */}
          {canDirect && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleRecord}
                className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                  recording
                    ? 'border-red-500/60 bg-red-600/25 text-red-300'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25'
                }`}
              >
                <Dot size={16} className={recording ? 'fill-red-400 text-red-400' : ''} />
                {recording ? 'Stop Rec' : 'Record'}
              </button>
              <button
                onClick={logHighlight}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-all"
              >
                <Zap size={14} /> Highlight
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const TopBar: React.FC<{
  title: string;
  posture: Posture;
  feedCount: number;
  onBack: () => void;
  right?: React.ReactNode;
}> = ({ title, posture, feedCount, onBack, right }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur-xl">
    <div className="flex items-center gap-3 min-w-0">
      <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors">
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Radio size={14} style={{ color: ORANGE }} />
          <span className="text-white font-black text-sm truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Smart Director</span>
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-white/8 text-white/50">
            {posture}
          </span>
          <span className="text-[9px] text-white/30 flex items-center gap-1"><Users size={9} /> {feedCount}</span>
        </div>
      </div>
    </div>
    {right}
  </div>
);

const ProgramStage: React.FC<{
  programFeed: DirectorFeed | null;
  registerVideo: (feedId: string, el: HTMLVideoElement | null) => void;
  gameState: GameState | null;
  reason?: string;
  big?: boolean;
}> = ({ programFeed, registerVideo, gameState, reason, big }) => (
  <div className={`relative w-full ${big ? 'flex-1' : 'aspect-video'} bg-black rounded-3xl overflow-hidden border border-white/10`}>
    {programFeed ? (
      <video
        key={programFeed.id}
        ref={el => registerVideo(programFeed.id, el)}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center text-white/25 text-sm font-bold uppercase tracking-widest">
        No Program Feed
      </div>
    )}

    {/* ON AIR badge */}
    <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg">
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> On Air
      {programFeed && <span className="opacity-80 font-bold">· {programFeed.label}</span>}
    </div>

    {/* Scoreboard overlay */}
    {gameState && <ScoreboardOverlay gs={gameState} />}

    {/* Auto-director reason ticker */}
    <AnimatePresence>
      {reason && (
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute bottom-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur text-orange-300 text-[10px] font-bold"
        >
          <Wand2 size={11} /> {reason}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const ScoreboardOverlay: React.FC<{ gs: GameState }> = ({ gs }) => (
  <div className="absolute top-3 right-3 flex items-stretch rounded-xl overflow-hidden border border-white/15 bg-black/70 backdrop-blur text-[11px] font-black shadow-lg">
    <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ background: `${gs.homeColor}22` }}>
      <span className="w-2 h-2 rounded-full" style={{ background: gs.homeColor }} />
      <span className="text-white/90 uppercase tracking-wide">{gs.homeTeam.slice(0, 4)}</span>
      <span className="text-white tabular-nums">{gs.homeScore}</span>
    </div>
    <div className="flex flex-col items-center justify-center px-2 py-0.5 bg-white/5 text-white/60">
      <span className="text-[8px] uppercase tracking-widest">{gs.periodLabel}</span>
      <span className="text-[9px] font-mono text-white/80">{gs.timeRemaining}</span>
    </div>
    <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ background: `${gs.awayColor}22` }}>
      <span className="text-white tabular-nums">{gs.awayScore}</span>
      <span className="text-white/90 uppercase tracking-wide">{gs.awayTeam.slice(0, 4)}</span>
      <span className="w-2 h-2 rounded-full" style={{ background: gs.awayColor }} />
    </div>
  </div>
);

const FeedTile: React.FC<{
  feed: DirectorFeed;
  isProgram: boolean;
  isMine: boolean;
  canTake: boolean;
  onTake: () => void;
  registerVideo: (feedId: string, el: HTMLVideoElement | null) => void;
}> = ({ feed, isProgram, isMine, canTake, onTake, registerVideo }) => {
  const roleMeta = ROLES.find(r => r.id === feed.role);
  const showsVideo = feed.role === 'camera' || feed.role === 'correspondent';
  return (
    <button
      type="button"
      onClick={canTake ? onTake : undefined}
      className={`relative aspect-video rounded-2xl overflow-hidden border-2 text-left transition-all ${
        isProgram ? 'border-red-500 ring-2 ring-red-500/40' : 'border-white/10 hover:border-white/30'
      } ${canTake ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {showsVideo ? (
        <video
          ref={el => registerVideo(feed.id, el)}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
      ) : (
        <div className="absolute inset-0 bg-white/5 flex items-center justify-center text-white/30">
          {roleMeta?.icon}
        </div>
      )}

      {/* Placeholder hint for remote feeds not yet wired to rtcCore. */}
      {!isMine && showsVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-white/20 text-[9px] font-bold uppercase tracking-widest pointer-events-none">
          {/* TODO(rtcCore): remote stream attaches here via attachRemoteStream */}
          Awaiting feed
        </div>
      )}

      {/* Program ring label */}
      {isProgram && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-black uppercase tracking-widest">
          Live
        </div>
      )}

      {/* Footer: label + role + take hint */}
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/85 to-transparent">
        <span className="text-white text-[10px] font-bold truncate flex items-center gap-1">
          {roleMeta?.icon}
          {feed.label}{isMine ? ' (You)' : ''}
        </span>
        {canTake && !isProgram && (
          <span className="text-[8px] font-black uppercase tracking-widest text-orange-400/80">Take</span>
        )}
      </div>
    </button>
  );
};

export default SmartDirectorView;
