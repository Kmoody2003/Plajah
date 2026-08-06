/**
 * MobileLiveStreamer — Phone-first live broadcast interface.
 *
 * Streamer view: portrait camera preview, bottom control dock, slide-up chat.
 * Viewer view: full-screen video, overlay chat, reaction animations.
 *
 * Stream lifecycle (the platform-wide operational logic for live):
 *   GO LIVE  → stream doc + auto-post on the author's timeline + follower
 *              notification + FIRST_LIVE_STREAM achievement + recording starts.
 *   LIVE     → WebRTC broadcast to viewers (offer/answer per viewer — this is
 *              what makes "is actually live" verifiable), live viewer count +
 *              total views, camera flip via replaceTrack (recording unaffected
 *              because it captures a canvas mix, not the raw camera track).
 *   END      → prompt: SAVE (recording → Reello "Past Live Streams" + the
 *              timeline post becomes the replay) or DELETE (post removed).
 *
 * Layout: everything is contained — fixed inset-0 + real pt-safe/pb-safe
 * utilities + dvh-based sheets so no control ever renders off-screen.
 */

import { createPortal } from 'react-dom';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio, X, Camera, CameraOff, Mic, MicOff, FlipHorizontal2, MessageCircle,
  Users, Share2, Check, Heart, Send, ChevronDown, Eye, Zap, Sparkles,
  Clock, Settings, Volume2, VolumeX, RotateCcw, ArrowLeft, Save, Trash2,
  LayoutGrid, Monitor, UserSquare2, Columns2, MonitorSmartphone, Plus, BarChart3,
  HardDriveDownload, FolderOpen, Download, ShieldCheck,
} from 'lucide-react';
import { LiveComposer, type ComposerMode, LOOKS, type LookId, AMBIENT_FX, type AmbientFx } from '../services/liveComposer';
import { buildVTuberFromSheet } from '../services/vtuber/avatarFactory';
import { buildBodyRig } from '../services/vtuber/bodyPuppet';
import { VoiceFX, VOICE_EFFECTS, type VoiceEffectId } from '../services/voiceFX';
import {
  auth, db, createPost, updatePost, deletePost, notifyFollowers, uploadVideo,
} from '../services/backendService';
import { unlockAchievementByTrigger } from '../services/achievementService';
import { publishLiveDiscovery, endLiveDiscovery, saveSessionRecording } from '../services/liveStreamService';
import { buildShareUrl } from '../services/deepLinkService';
import { useRtcSession } from '../hooks/useRtcSession';
import {
  startLocalRecording, pickRecordingFile, supportsFilePicker,
  downloadLocalRecording, markLocalRecordingUploaded, deleteLocalRecording,
  listPendingLocalRecordings, type LiveRecordingSink, type LocalRecordingMeta,
} from '../services/localRecordingStore';
import StreamRecoveryList from './StreamRecoveryList';
import {
  doc, collection, addDoc, setDoc, updateDoc, increment, deleteDoc,
  query, orderBy, limit, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';

// ─── ICE + helpers ────────────────────────────────────────────────────────────

const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
] };

const uid4 = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMsg { id: string; user: string; text: string; ts: number }
interface Reaction { id: string; emoji: string; x: number }

export interface MobileLiveStreamerProps {
  /** 'streamer' = broadcaster; 'viewer' = watcher */
  mode: 'streamer' | 'viewer';
  /** Required for viewer mode */
  streamId?: string;
  /** Stream title set by broadcaster */
  title?: string;
  ownerName?: string;
  /** Optional club scoping — when set the stream is tagged to the club. */
  clubId?: string;
  /** Private (club-only) stream: skips the public timeline post + follower ping. */
  isPrivate?: boolean;
  onClose: () => void;
}

// ─── Shared hook: live chat subscription ──────────────────────────────────────

function useLiveChat(streamId: string | null) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  useEffect(() => {
    if (!streamId) return;
    const q = query(
      collection(db, 'streams', streamId, 'chat'),
      orderBy('ts', 'desc'),
      limit(50),
    );
    return onSnapshot(q, snap => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)).reverse());
    });
  }, [streamId]);
  return msgs;
}

async function sendChat(streamId: string, text: string) {
  const user = auth.currentUser;
  if (!user || !text.trim()) return;
  await addDoc(collection(db, 'streams', streamId, 'chat'), {
    user: user.displayName || 'Viewer',
    text: text.trim(),
    ts: Date.now(),
    uid: user.uid,
  });
}

// ─── Audience emotes + polls (Twitch-style, on the same Firestore rails as chat) ──────

const QUICK_EMOTES = ['❤️', '🔥', '😂', '👏', '😱', '🎉'];

async function sendLiveEvent(streamId: string, emoji: string) {
  const user = auth.currentUser;
  if (!user) return;
  await addDoc(collection(db, 'streams', streamId, 'events'), { type: 'emote', emoji, uid: user.uid, ts: Date.now() });
}

/** Host-side: fires for each NEW audience event — emotes become on-stream bursts. */
function useLiveEvents(streamId: string | null, onEmote: (emoji: string) => void) {
  const cbRef = useRef(onEmote); cbRef.current = onEmote;
  useEffect(() => {
    if (!streamId) return;
    const since = Date.now();
    const qy = query(collection(db, 'streams', streamId, 'events'), orderBy('ts', 'desc'), limit(24));
    return onSnapshot(qy, (snap: any) => {
      snap.docChanges().forEach((ch: any) => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (d?.ts > since && d?.type === 'emote' && typeof d.emoji === 'string') cbRef.current(d.emoji.slice(0, 8));
      });
    });
  }, [streamId]);
}

interface LivePoll { id: string; q: string; options: string[]; closed?: boolean; createdAt: number }

/** Both sides: the active poll (on the stream doc) + live vote tallies + my vote. */
function usePoll(streamId: string | null) {
  const [poll, setPoll] = useState<LivePoll | null>(null);
  const [counts, setCounts] = useState<number[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, 'streams', streamId), (snap: any) => setPoll(snap.data()?.activePoll ?? null));
  }, [streamId]);
  const pollId = poll?.id;
  useEffect(() => {
    setCounts([]); setMyVote(null);
    if (!streamId || !pollId) return;
    return onSnapshot(collection(db, 'streams', streamId, 'polls', pollId, 'votes'), (snap: any) => {
      const c: number[] = []; let mine: number | null = null;
      snap.forEach((d: any) => {
        const opt = d.data()?.opt;
        if (typeof opt === 'number') { c[opt] = (c[opt] || 0) + 1; if (d.id === auth.currentUser?.uid) mine = opt; }
      });
      setCounts(c); setMyVote(mine);
    });
  }, [streamId, pollId]);
  return { poll, counts, myVote };
}

async function castVote(streamId: string, pollId: string, opt: number) {
  const user = auth.currentUser; if (!user) return;
  await setDoc(doc(db, 'streams', streamId, 'polls', pollId, 'votes', user.uid), { opt, ts: Date.now() });
}

/** Parse a dictated poll: "Your question…? option A or option B or option C". */
export function parsePollDictation(text: string): { q: string; options: string[] } {
  const t = text.trim();
  const qm = t.indexOf('?');
  if (qm > 0) {
    const q = t.slice(0, qm + 1).trim();
    const options = t.slice(qm + 1).split(/\s+or\s+|,/i).map(s => s.trim()).filter(Boolean).slice(0, 4);
    return { q, options: options.length >= 2 ? options : [] };
  }
  return { q: t, options: [] };
}

/** Voice dictation via the Web Speech API (Chrome/Android; no-op elsewhere). */
function useDictation(onText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const onTextRef = useRef(onText); onTextRef.current = onText;
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const start = () => {
    if (!SR || listening) return;
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onresult = (e: any) => { const t = e.results?.[0]?.[0]?.transcript; if (t) onTextRef.current(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch { /* */ } };
  return { listening, supported: !!SR, start, stop };
}

/** The animated poll card — shared by streamer (results + end) and viewers (tap to vote). */
const LivePollCard: React.FC<{
  poll: LivePoll; counts: number[]; myVote: number | null;
  onVote?: (i: number) => void; onEnd?: () => void;
}> = ({ poll, counts, myVote, onVote, onEnd }) => {
  const total = counts.reduce((a, b) => a + (b || 0), 0);
  const max = Math.max(0, ...counts.map(c => c || 0));
  return (
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="rounded-2xl overflow-hidden border border-white/15 bg-[#141019]/85 backdrop-blur-xl shadow-2xl pointer-events-auto">
      <div className="h-1 bg-gradient-to-r from-[#6B0099] via-[#FF8C00] to-[#6B0099] bg-[length:200%_100%] animate-[gradient-x_3s_linear_infinite]" />
      <div className="px-3 pt-2.5 pb-1.5">
        <p className="text-[13px] font-black text-white leading-snug">📊 {poll.q}</p>
      </div>
      <div className="px-2.5 pb-2 space-y-1.5">
        {poll.options.map((opt, i) => {
          const n = counts[i] || 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const won = !!poll.closed && n === max && max > 0;
          return (
            <button key={i} disabled={!onVote || !!poll.closed} onClick={() => onVote?.(i)}
              className={`relative w-full rounded-xl overflow-hidden border text-left transition-all active:scale-[0.98] ${myVote === i ? 'border-orange-400' : 'border-white/10'} ${won ? 'ring-2 ring-yellow-400/80' : ''}`}>
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#6B0099]/75 to-[#FF8C00]/75 transition-[width] duration-700 ease-out"
                style={{ width: total ? `${Math.max(pct, 5)}%` : '0%' }} />
              <div className="relative flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-[12px] font-bold text-white truncate">{won ? '🏆 ' : ''}{opt}{myVote === i ? ' ✓' : ''}</span>
                <span className="text-[11px] font-black text-white/85 tabular-nums shrink-0">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] text-white/40">{total} vote{total === 1 ? '' : 's'}{poll.closed ? ' · final 🎉' : onVote ? ' · tap to vote' : ''}</span>
        {onEnd && !poll.closed && <button onClick={onEnd} className="text-[10px] font-black text-orange-300 uppercase tracking-wide">End poll</button>}
      </div>
    </motion.div>
  );
};

/** Poll creation sheet — type it, or dictate it ("Question…? A or B or C"). */
const PollComposer: React.FC<{ onLaunch: (q: string, options: string[]) => void; onClose: () => void }> = ({ onLaunch, onClose }) => {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<string[]>(['', '']);
  const dict = useDictation(t => {
    const parsed = parsePollDictation(t);
    if (parsed.q) setQ(parsed.q);
    if (parsed.options.length >= 2) setOpts(parsed.options);
  });
  const clean = opts.map(o => o.trim()).filter(Boolean);
  const valid = q.trim().length > 1 && clean.length >= 2;
  return (
    <div className="fixed inset-0 z-[240] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#17121e] border border-white/12 rounded-t-3xl p-4 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-black text-sm">📊 New poll</p>
          <div className="flex items-center gap-2">
            {dict.supported && (
              <button onClick={() => (dict.listening ? dict.stop() : dict.start())}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${dict.listening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/10 text-white/80'}`}>
                <Mic size={12} /> {dict.listening ? 'Listening…' : 'Dictate'}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X size={14} className="text-white" /></button>
          </div>
        </div>
        {dict.supported && <p className="text-[10px] text-white/35 mb-2">Say: “Your question? option A <b>or</b> option B <b>or</b> option C”</p>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask your audience…"
          className="w-full bg-white/[0.06] border border-white/12 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-orange-400/60 mb-2" />
        {opts.map((o, i) => (
          <div key={i} className="flex gap-1.5 mb-1.5">
            <input value={o} onChange={e => setOpts(p => p.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`}
              className="flex-1 bg-white/[0.06] border border-white/12 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-orange-400/60" />
            {opts.length > 2 && (
              <button onClick={() => setOpts(p => p.filter((_, j) => j !== i))} className="w-9 rounded-xl bg-white/[0.06] text-white/50 flex items-center justify-center"><X size={13} /></button>
            )}
          </div>
        ))}
        {opts.length < 4 && (
          <button onClick={() => setOpts(p => [...p, ''])} className="text-[11px] font-bold text-white/50 flex items-center gap-1 mb-3"><Plus size={12} /> Add option</button>
        )}
        <button disabled={!valid} onClick={() => onLaunch(q.trim(), clean)}
          className="w-full py-3 rounded-2xl font-black text-sm bg-gradient-to-r from-[#6B0099] to-[#FF8C00] text-white disabled:opacity-40">
          🚀 Launch poll
        </button>
      </div>
    </div>
  );
};

// ─── Crash containment ────────────────────────────────────────────────────────
// A failure inside the live UI must NEVER take down the whole platform. This
// boundary contains it to the overlay, shows the real error (so it's
// diagnosable, not a white screen), and lets the user close back to the app.

class LiveErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: any) {
    return { error: String(e?.message || e).slice(0, 300) };
  }
  componentDidCatch(e: any, info: any) {
    console.error('[Live] UI crashed:', e, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[210] bg-black/95 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <Radio size={32} className="text-red-400" />
          <p className="text-white font-black">The live screen hit an error</p>
          <p className="text-white/45 text-xs leading-relaxed break-words max-w-sm">{this.state.error}</p>
          <button onClick={this.props.onClose}
            className="mt-2 px-8 py-3.5 bg-white/10 border border-white/15 rounded-2xl text-white font-bold text-sm">
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Manual pro camera controls ───────────────────────────────────────────────
// Driven entirely by the device's real MediaStreamTrack.getCapabilities() — we only
// render a control the hardware actually exposes, and apply it live via
// applyConstraints. Some controls (focus distance, shutter, ISO, colour temperature)
// require flipping the matching *Mode to 'manual' first, done in the same call.
const PRO_CAPS: { key: string; label: string; mode?: string }[] = [
  { key: 'zoom', label: 'Zoom' },
  { key: 'focusDistance', label: 'Focus', mode: 'focusMode' },
  { key: 'exposureCompensation', label: 'Exposure' },
  { key: 'exposureTime', label: 'Shutter', mode: 'exposureMode' },
  { key: 'iso', label: 'ISO', mode: 'exposureMode' },
  { key: 'colorTemperature', label: 'White balance', mode: 'whiteBalanceMode' },
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'sharpness', label: 'Sharpness' },
];
const CameraProControls: React.FC<{ track: MediaStreamTrack | null }> = ({ track }) => {
  const [caps, setCaps] = useState<any>(null);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [torch, setTorch] = useState(false);
  const [fps, setFps] = useState(30);

  useEffect(() => {
    if (!track || track.kind !== 'video') { setCaps(null); return; }
    try {
      const c: any = track.getCapabilities?.() ?? {};
      const s: any = track.getSettings?.() ?? {};
      setCaps(c);
      const v: Record<string, number> = {};
      PRO_CAPS.forEach(({ key }) => { if (c[key]) v[key] = typeof s[key] === 'number' ? s[key] : c[key].min; });
      setVals(v); setTorch(!!s.torch); setFps(Math.round(s.frameRate || 30));
    } catch { setCaps(null); }
  }, [track]);

  if (!track) return <p className="text-[11px] text-white/40 px-3 py-2">Start the camera to adjust controls.</p>;
  const apply = (adv: any) => { track.applyConstraints({ advanced: [adv] }).catch(() => {}); };
  const numeric = caps ? PRO_CAPS.filter(({ key }) => caps[key] && typeof caps[key].min === 'number' && caps[key].max > caps[key].min) : [];
  const hasTorch = !!caps?.torch;
  const has60 = caps && !Array.isArray(caps.frameRate) && (caps.frameRate?.max ?? 0) >= 50;
  if (!numeric.length && !hasTorch && !has60) return <p className="text-[11px] text-white/40 px-3 py-2">This camera doesn't expose manual controls in the browser.</p>;

  return (
    <div className="px-1 pb-1 space-y-3">
      {(hasTorch || has60) && (
        <div className="flex gap-2">
          {hasTorch && <button onClick={() => { const t = !torch; setTorch(t); apply({ torch: t }); }} className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${torch ? 'bg-orange-500 text-black' : 'bg-white/8 text-white'}`}>Torch {torch ? 'on' : 'off'}</button>}
          {has60 && [30, 60].map(f => <button key={f} onClick={() => { setFps(f); track.applyConstraints({ frameRate: f }).catch(() => {}); }} className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${fps === f ? 'bg-orange-500 text-black' : 'bg-white/8 text-white'}`}>{f} fps</button>)}
        </div>
      )}
      {numeric.map(({ key, label, mode }) => {
        const c = caps[key];
        return (
          <div key={key}>
            <div className="text-[10px] text-white/50 mb-1">{label}</div>
            <input type="range" min={c.min} max={c.max} step={c.step || (c.max - c.min) / 100} value={vals[key] ?? c.min}
              onChange={e => { const val = parseFloat(e.target.value); setVals(p => ({ ...p, [key]: val })); apply(mode ? { [mode]: 'manual', [key]: val } : { [key]: val }); }}
              className="w-full accent-orange-500" />
          </div>
        );
      })}
    </div>
  );
};

// If the demo asset is the full character SHEET (squarish, large), crop to the clear
// front-facing face close-up (lower-right) so the puppet is a clean talking head — the
// face tracker builds from one detected face, not a multi-view sheet. A pre-cropped
// portrait (non-square) is passed through unchanged.
// A built-in demo character: a multi-view sheet + the face region to crop (as fractions of
// the sheet). Each drawing lays the face out differently, so the crop rect is per-character.
// `body` describes the FULL-BODY view for the pose-driven paper doll: where it is on the
// sheet, where the head splits, and (when the arms hang clear of the body) the arm regions.
type DemoAvatar = {
  id: string; name: string; emoji: string; url: string;
  crop: { sx: number; sy: number; sw: number; sh: number };
  /** Face-swap performance anchors (fractions of the FACE crop): jaw hinge, eyes, mouth. */
  puppet?: { jawSplit?: number; face?: { eyeL?: { x: number; y: number; r: number }; eyeR?: { x: number; y: number; r: number }; mouth?: { x: number; y: number; w: number } } };
  body?: { crop: { sx: number; sy: number; sw: number; sh: number }; headSplit: number; arms?: { w: number; y0: number; y1: number } };
};
const DEMO_AVATARS: DemoAvatar[] = [
  { id: 'anime',   name: 'Aiko',  emoji: '🎌', url: '/vtuber/demo-character.png', crop: { sx: 0.785, sy: 0.485, sw: 0.215, sh: 0.29 },
    puppet: { jawSplit: 0.7, face: { eyeL: { x: 0.36, y: 0.47, r: 0.09 }, eyeR: { x: 0.64, y: 0.47, r: 0.09 }, mouth: { x: 0.5, y: 0.78, w: 0.26 } } },
    body: { crop: { sx: 0.005, sy: 0.03, sw: 0.30, sh: 0.96 }, headSplit: 0.21 } }, // hands in pockets — no arm cut
  { id: 'cartoon', name: 'Kal',   emoji: '🎨', url: '/vtuber/demo-southpark.png', crop: { sx: 0.02,  sy: 0.01,  sw: 0.29,  sh: 0.36 },
    puppet: { jawSplit: 0.76, face: { eyeL: { x: 0.38, y: 0.45, r: 0.12 }, eyeR: { x: 0.62, y: 0.45, r: 0.12 }, mouth: { x: 0.5, y: 0.8, w: 0.3 } } },
    body: { crop: { sx: 0.02, sy: 0.01, sw: 0.30, sh: 0.46 }, headSplit: 0.52, arms: { w: 0.18, y0: 0.52, y1: 0.85 } } },
];
// Default body proportions for uploaded drawings (assumes a standing A-pose character).
const UPLOAD_BODY = { headSplit: 0.22, arms: { w: 0.2, y0: 0.2, y1: 0.62 } };

// Crop one face out of a character sheet and key its backdrop to transparent (so the
// face-swap overlays just the character, not a rectangle). Sampled from a corner, so it
// works for both a solid studio backdrop and a plain white sheet.
async function cropSheetFace(blob: Blob, crop: DemoAvatar['crop']): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const sx = Math.round(bmp.width * crop.sx), sy = Math.round(bmp.height * crop.sy);
    const sw = Math.round(bmp.width * crop.sw), sh = Math.round(bmp.height * crop.sh);
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const cx = c.getContext('2d')!;
    cx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    bmp.close();
    try {
      const img = cx.getImageData(0, 0, sw, sh), d = img.data;
      const br = d[0], bg = d[1], bb = d[2];
      const tol = 66;
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
        if (dist < tol) d[i + 3] = 0;
        else if (dist < tol * 1.7) d[i + 3] = Math.round(((dist - tol) / (tol * 0.7)) * 255);
      }
      cx.putImageData(img, 0, 0);
    } catch { /* keep opaque if imagedata is blocked */ }
    const out = await new Promise<Blob | null>(r => c.toBlob(b => r(b), 'image/png'));
    if (out) return out;
  } catch { /* fall through to the original */ }
  return blob;
}

// ─── Main component ───────────────────────────────────────────────────────────

/** A remote peer's live video in a compact tile (guest on stage). Attaches the MediaStream to a
 *  <video> and shows the name + an optional remove (host) control. */
const PeerTile: React.FC<{ stream: MediaStream; name?: string; onRemove?: () => void }> = ({ stream, name, onRemove }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="relative w-24 h-32 rounded-xl overflow-hidden bg-black border border-white/20 shrink-0 shadow-lg">
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
        <span className="text-[7px] font-black uppercase tracking-widest text-white bg-black/60 px-1 py-0.5 rounded truncate">{name || 'Guest'}</span>
        {onRemove && <button onClick={onRemove} className="text-white bg-red-500/90 rounded-full w-4 h-4 flex items-center justify-center text-[9px] leading-none shrink-0">×</button>}
      </div>
    </div>
  );
};

const MobileLiveStreamer: React.FC<MobileLiveStreamerProps> = ({
  mode, streamId: initStreamId, title: initTitle, ownerName, clubId, isPrivate, onClose,
}) => {
  // Portal to <body>: rendered in place, an ancestor with a CSS transform makes
  // position:fixed anchor to that ancestor (the overlay appears at the page TOP
  // and the user has to scroll up). The portal pins it to the real viewport.
  return createPortal(
    <LiveErrorBoundary onClose={onClose}>
      {mode === 'viewer' && initStreamId
        ? <MobileViewer streamId={initStreamId} title={initTitle} ownerName={ownerName} onClose={onClose} />
        : <MobileStreamer clubId={clubId} isPrivate={isPrivate} onClose={onClose} />}
    </LiveErrorBoundary>,
    document.body,
  );
};

export default MobileLiveStreamer;

// ─── Unified public API ───────────────────────────────────────────────────────
// The whole app goes live and watches through these two — one engine, one
// `streams` collection, one signaling scheme. (Names read better than
// "MobileLiveStreamer mode=…" at the call sites.)

/** The single broadcaster. Surfaced by LiveHub, Reello, Feed, VideoTab, Clubs. */
export const LiveStudio: React.FC<{
  clubId?: string; isPrivate?: boolean; onClose: () => void;
}> = ({ clubId, isPrivate, onClose }) => (
  <MobileLiveStreamer mode="streamer" clubId={clubId} isPrivate={isPrivate} onClose={onClose} />
);

/** The single viewer. Drop-in for the old LiveStreamViewer (same props). */
export const LiveViewer: React.FC<{
  streamId: string; title?: string; ownerName?: string; onClose: () => void;
}> = ({ streamId, title, ownerName, onClose }) => (
  <MobileLiveStreamer mode="viewer" streamId={streamId} title={title} ownerName={ownerName} onClose={onClose} />
);

// ─────────────────────────────────────────────────────────────────────────────
//  STREAMER SIDE
// ─────────────────────────────────────────────────────────────────────────────

function MobileStreamer({ onClose, clubId, isPrivate }: { onClose: () => void; clubId?: string; isPrivate?: boolean }) {
  const [step, setStep] = useState<'setup' | 'live' | 'ended'>('setup');
  const [title, setTitle] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [mirror, setMirror] = useState(true); // mirror the preview for front cameras only
  const [isLive, setIsLive] = useState(false);
  // Stable id from mount → the rtc session + preview start immediately; goLive
  // just publishes the streams doc + flips it live.
  const [streamId] = useState(() => uid4());
  const [postId, setPostId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [copied, setCopied] = useState(false);
  const [permError, setPermError] = useState('');
  const [goLiveError, setGoLiveError] = useState('');
  const discoveryFeedIdRef = useRef<string | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [bottomH, setBottomH] = useState(0); // measured height of the chat + dock stack
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMsgs = useLiveChat(streamId || null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const didMountRef = useRef(false);

  // ── Local recording (crash-safe on-device copy) ─────────────────────────────
  // The stream is committed to on-device storage AS it records, so a failed upload
  // or a closed tab never loses it. `storeLocal` is on by default; on desktop the
  // user can also pick an exact file to mirror the recording into.
  const [storeLocal, setStoreLocal] = useState(true);
  const localSinkRef = useRef<LiveRecordingSink | null>(null);
  const fileWritableRef = useRef<FileSystemWritableFileStream | null>(null);
  const [fileChosen, setFileChosen] = useState(false); // user picked a desktop file target
  const [savedToDevice, setSavedToDevice] = useState(false);
  const [pendingRec, setPendingRec] = useState<LocalRecordingMeta | null>(null); // recovery from a prior crash
  const [showRecovery, setShowRecovery] = useState(false);

  // On mount, surface any prior recording that never got saved (crash/close mid-stream).
  useEffect(() => {
    listPendingLocalRecordings().then(list => {
      const prior = list.sort((a, b) => b.startedAt - a.startedAt)[0];
      if (prior) setPendingRec(prior);
    }).catch(() => {});
  }, []);

  // ── Camera modes: front · rear · both · screen+cam · screen+cut-out person ──
  // Composed modes route through a canvas mix that we publish in place of the raw
  // camera; switching among them is instant (no track swap). front/rear stay native
  // until the user picks an advanced mode, then everything runs through the composer.
  const composerRef = useRef<LiveComposer | null>(null);
  const composerPublishedRef = useRef(false);
  const [camMode, setCamMode] = useState<ComposerMode>('front');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null); // surfaced FX/composer failure (device diag)
  const [modeTab, setModeTab] = useState(0);            // active slide in the horizontal feature carousel
  const modeScrollRef = useRef<HTMLDivElement>(null);
  const scrollToTab = (i: number) => {
    setModeTab(i);
    const el = modeScrollRef.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const onModeScroll = () => {
    const el = modeScrollRef.current; if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== modeTab) setModeTab(i);
  };
  // Mode menu ⇄ chat are mutually exclusive (both dock above the shrunken video).
  const openModeMenu = () => { setShowChat(false); setModeMenuOpen(o => !o); };
  const [modeBusy, setModeBusy] = useState(false);
  const canScreen = typeof navigator !== 'undefined' && typeof (navigator.mediaDevices as any)?.getDisplayMedia === 'function';

  // Device pickers — tap the camera / mic control to choose a specific input.
  const [deviceMenu, setDeviceMenu] = useState<'none' | 'camera' | 'mic'>('none');
  const openDeviceMenu = (which: 'camera' | 'mic') => { setDeviceMenu(m => m === which ? 'none' : which); rtc.refreshDevices(); };
  // The live camera track (composer source when composing, else the raw RTC camera) so
  // the pro controls apply to the real hardware in every mode.
  const getActiveCamTrack = (): MediaStreamTrack | null =>
    composerPublishedRef.current ? (composerRef.current?.getActiveCameraTrack() ?? null) : (rtc.localStream?.getVideoTracks()[0] ?? null);

  const applyMode = async (mode: ComposerMode) => {
    // NOTE: the carousel stays OPEN so you can keep previewing the effect on the video
    // above it (don't auto-close here). Same-mode calls must still proceed until the
    // composer is published — the old `mode === camMode` early-return made
    // applyLook('front'-default) a silent no-op, so looks/LUTs never reached the output.
    if (modeBusy || (mode === camMode && composerPublishedRef.current)) return;
    const prevMode = camMode;
    setModeBusy(true);
    try {
      if (!composerRef.current) composerRef.current = new LiveComposer(() => { applyMode('front'); });
      const comp = composerRef.current;
      // First engage: the composer ADOPTS the live RTC camera as its source (no clone → no
      // black; no second getUserMedia → no device conflict) and publishes its canvas. RTC
      // keeps the source alive (swapVideoTrack keepOld). Before this, the raw camera streams
      // directly — the composer isn't running at all, so an idle stream stays cool.
      if (!composerPublishedRef.current) {
        const rtcCam = rtc.localStream?.getVideoTracks()[0];
        if (rtcCam && rtcCam.readyState === 'live') comp.adoptFrontTrack(rtcCam);
        const track = comp.getStream().getVideoTracks()[0];
        await rtc.publishExternalVideo(track);
        composerPublishedRef.current = true;
      }
      await comp.setMode(mode);
      setCamMode(mode);
      setMirror(false); // the canvas is already composited — no CSS mirror on top
      setCamOn(true);
      setFxError(null);
    } catch (e: any) {
      // Dual-camera (both) needs simultaneous front+rear, which many phones can't do — fall
      // back to the previous working mode instead of leaving a broken state.
      const dual = mode === 'both';
      setFxError(dual
        ? "This phone can't run the front + rear cameras at once — staying on your current camera."
        : (e?.message || 'Could not switch to that mode on this device.'));
      try { await composerRef.current?.setMode(prevMode === 'both' ? 'front' : prevMode); } catch { /* */ }
    } finally { setModeBusy(false); }
  };

  useEffect(() => () => { composerRef.current?.dispose(); composerRef.current = null; }, []);

  // Lock to portrait while streaming. A rotating phone rotates the camera feed, which
  // throws off MediaPipe face tracking (sideways face → not identified) and the avatar
  // orientation. Best-effort: works in an installed PWA / some Android browsers; a hard
  // lock elsewhere needs the native app.
  useEffect(() => {
    const so: any = (typeof screen !== 'undefined') ? (screen as any).orientation : null;
    try { so?.lock?.('portrait-primary')?.catch?.(() => { try { so?.lock?.('portrait')?.catch?.(() => {}); } catch { /* */ } }); } catch { /* unsupported */ }
    return () => { try { so?.unlock?.(); } catch { /* */ } };
  }, []);

  // Real-time voice changer — routes the mic through a Web Audio effect and publishes
  // the processed track. The raw mic keeps feeding the effect; switching effects is
  // instant (rewires the graph, same output track).
  const voiceFxRef = useRef<VoiceFX | null>(null);
  const rawMicRef = useRef<MediaStreamTrack | null>(null);
  const [voiceId, setVoiceId] = useState<VoiceEffectId>('none');
  const applyVoiceEffect = async (id: VoiceEffectId) => {
    try {
      if (id === 'none') {
        if (voiceFxRef.current) { voiceFxRef.current.dispose(); voiceFxRef.current = null; }
        if (rawMicRef.current) await rtc.publishExternalAudio(rawMicRef.current);
        setVoiceId('none');
        return;
      }
      if (!rawMicRef.current) rawMicRef.current = rtc.localStream?.getAudioTracks()[0] || null;
      if (!rawMicRef.current) { alert('Microphone not ready yet.'); return; }
      if (!voiceFxRef.current) {
        voiceFxRef.current = new VoiceFX(new MediaStream([rawMicRef.current]));
        await rtc.publishExternalAudio(voiceFxRef.current.getStream().getAudioTracks()[0]);
      }
      voiceFxRef.current.setEffect(id);
      setVoiceId(id);
    } catch (e: any) { alert(e?.message || 'Could not apply that voice effect.'); }
  };
  useEffect(() => () => { voiceFxRef.current?.dispose(); voiceFxRef.current = null; }, []);

  // Color grade / LUTs — grading lives in the composer, so picking a look first ensures
  // the composer is publishing (entering plain front mode if it wasn't).
  const [lookId, setLookId] = useState<LookId | 'custom'>('none');
  const [nightOn, setNightOn] = useState(false);
  const cubeInputRef = useRef<HTMLInputElement>(null);
  const applyLook = async (look: LookId) => {
    if (!composerPublishedRef.current) await applyMode('front');
    composerRef.current?.setLook(look); setLookId(look);
  };
  const uploadCube = async (file?: File | null) => {
    if (!file) return;
    if (!composerPublishedRef.current) await applyMode('front');
    const ok = composerRef.current?.setCubeLut(await file.text());
    if (ok) setLookId('custom');
    else alert("Couldn't load that LUT — needs a 3D .cube file (LUT_3D_SIZE), and WebGL on this device.");
  };

  // Audience fun layer — ambient FX, on-stream emote bursts (audience-triggered), polls.
  const [ambientId, setAmbientId] = useState<AmbientFx>('none');
  const applyAmbient = (fx: AmbientFx) => { composerRef.current?.setAmbient(fx); setAmbientId(fx); };
  useLiveEvents(streamId || null, emoji => composerRef.current?.spawnBurst(emoji, 10));
  const [pollOpen, setPollOpen] = useState(false);
  const { poll, counts } = usePoll(streamId || null);
  const launchPoll = async (q: string, options: string[]) => {
    setPollOpen(false);
    if (!streamId) return;
    const p: LivePoll = { id: uid4(), q, options, createdAt: Date.now(), closed: false };
    await updateDoc(doc(db, 'streams', streamId), { activePoll: p }).catch(() => {});
  };
  const endPoll = async () => {
    if (!streamId || !poll) return;
    composerRef.current?.spawnBurst('🎉', 18);
    await updateDoc(doc(db, 'streams', streamId), { activePoll: { ...poll, closed: true } }).catch(() => {});
    setTimeout(() => { updateDoc(doc(db, 'streams', streamId), { activePoll: null }).catch(() => {}); }, 8000);
  };

  // VTuber — build a face-tracked avatar from an uploaded character sheet, then go live as it.
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const [avatarBuilt, setAvatarBuilt] = useState(false);
  const [avatarBuilding, setAvatarBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState('');
  const [demoId, setDemoId] = useState<string | null>(null);
  const [avatarKind, setAvatarKind] = useState<'puppet' | 'vrm' | null>(null);
  const buildAvatarFromBlob = async (blob: Blob, puppet?: DemoAvatar['puppet']) => {
    if (!composerRef.current) composerRef.current = new LiveComposer(() => { applyMode('front'); });
    const desc = await buildVTuberFromSheet(blob, {
      path: 'PUPPET2D', puppet,
      onProgress: (s: string, p: number) => setBuildMsg(`${s} · ${Math.round(p * 100)}%`),
    });
    composerRef.current.setAvatar(desc);
    setAvatarBuilt(true); setAvatarKind('puppet');
    await applyMode('vtuber');
  };
  // Upload a real 3D .vrm model — the engine drives its humanoid bones + ARKit blendshapes
  // from your face/pose (industry-standard VTuber path). Loaded from a local object URL.
  const vrmInputRef = useRef<HTMLInputElement>(null);
  const loadVrm = async (file?: File | null) => {
    if (!file) return;
    setAvatarBuilding(true); setBuildMsg('Loading 3D model…'); setDemoId(null);
    try {
      if (!composerRef.current) composerRef.current = new LiveComposer(() => { applyMode('front'); });
      const url = URL.createObjectURL(file);
      composerRef.current.setAvatar({ kind: 'VRM', url, source: 'upload' } as any);
      setAvatarBuilt(true); setAvatarKind('vrm'); setVtuberStyleState('face');
      await applyMode('vtuber');
    } catch (e: any) { alert(e?.message || 'Could not load that .vrm model.'); }
    finally { setAvatarBuilding(false); }
  };
  // Full-body paper doll: cut the body view (keyed) into a pose-driven rig — instant,
  // zero CV on the artwork (all tracking runs on the streamer's real body).
  const buildBodyFromBlob = async (raw: Blob, crop: { sx: number; sy: number; sw: number; sh: number }, cfg: { headSplit: number; arms?: { w: number; y0: number; y1: number } }) => {
    if (!composerRef.current) composerRef.current = new LiveComposer(() => { applyMode('front'); });
    const keyed = await cropSheetFace(raw, crop); // same crop+key helper the face path uses
    const rig = await buildBodyRig(keyed, cfg);
    composerRef.current.setBodyAvatar({ kind: 'BODY2D', rig });
  };
  const buildAvatar = async (file?: File | null) => {
    if (!file) return;
    setAvatarBuilding(true); setBuildMsg('Building avatar…'); setDemoId(null);
    try {
      await buildBodyFromBlob(file, { sx: 0, sy: 0, sw: 1, sh: 1 }, UPLOAD_BODY).catch(() => {});
      await buildAvatarFromBlob(file);
    }
    catch (e: any) { alert(e?.message || 'Could not build that character into an avatar.'); }
    finally { setAvatarBuilding(false); }
  };
  // Built-in demo characters so any user can test VTuber with one tap (no upload).
  const useDemoAvatar = async (demo: DemoAvatar) => {
    setAvatarBuilding(true); setBuildMsg(`Loading ${demo.name}…`); setDemoId(demo.id);
    try {
      const res = await fetch(demo.url);
      if (!res.ok) throw new Error(`${demo.name} isn't available yet.`);
      const raw = await res.blob();
      if (demo.body) await buildBodyFromBlob(raw, demo.body.crop, demo.body).catch(() => {});
      await buildAvatarFromBlob(await cropSheetFace(raw, demo.crop), demo.puppet);
    } catch (e: any) { alert(e?.message || 'Could not load that character.'); setDemoId(null); }
    finally { setAvatarBuilding(false); }
  };
  // Face swap ↔ full body — restarts the engine live.
  const [vtuberStyle, setVtuberStyleState] = useState<'face' | 'body'>('face');
  const applyVtuberStyle = async (s: 'face' | 'body') => {
    setVtuberStyleState(s);
    await composerRef.current?.setVtuberStyle(s);
    if (camMode !== 'vtuber' && avatarBuilt) await applyMode('vtuber');
  };
  // Green-screen / OBS mode — render the avatar on a chroma key instead of over live video.
  const [greenOn, setGreenOn] = useState(false);
  const toggleGreen = async () => { const on = !greenOn; setGreenOn(on); await composerRef.current?.setGreenScreen(on); };

  // ── Media + peers now run on the unified rtcCore backbone (broadcast topology:
  //    this host publishes, viewers subscribe). The session is live from mount so
  //    the setup-screen preview works; viewers connect once they join. ──────────
  // 'stage' topology (not 'broadcast'): the host still publishes to every viewer exactly as before,
  // but it ALSO lets an approved viewer publish — that's how a guest comes "on stage". Viewers stay
  // recv-only ('viewer' role) until the host promotes them (streams/{id}.guests).
  const rtc = useRtcSession({
    sessionId: streamId,
    topology: 'stage',
    role: 'host',
    media: { audio: true, video: { facingMode: facing } },
    displayName: auth.currentUser?.displayName || 'Creator',
  });

  // ── Guests on stage ────────────────────────────────────────────────────────
  const [guestRequests, setGuestRequests] = useState<Array<{ uid: string; name: string; photo?: string }>>([]);
  const [guests, setGuests] = useState<Array<{ uid: string; name: string; photo?: string }>>([]);
  const [showGuestPanel, setShowGuestPanel] = useState(false);
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, 'streams', streamId), (snap: any) => {
      const d = snap.data() || {};
      setGuestRequests(Array.isArray(d.guestRequests) ? d.guestRequests : []);
      setGuests(Array.isArray(d.guests) ? d.guests : []);
    });
  }, [streamId]);
  const approveGuest = async (g: { uid: string; name: string; photo?: string }) => {
    try { await updateDoc(doc(db, 'streams', streamId), { guests: arrayUnion(g), guestRequests: arrayRemove(g) }); } catch { /* */ }
  };
  const denyRequest = async (g: { uid: string; name: string; photo?: string }) => {
    try { await updateDoc(doc(db, 'streams', streamId), { guestRequests: arrayRemove(g) }); } catch { /* */ }
  };
  const removeGuest = async (g: { uid: string; name: string; photo?: string }) => {
    try { await updateDoc(doc(db, 'streams', streamId), { guests: arrayRemove(g) }); } catch { /* */ }
  };
  // Live guest video tiles — remote publishers that are participants (not the host = us).
  const guestPeers = rtc.remotePeers.filter(p => p.role === 'participant');

  // Preview ← backbone local stream.
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = rtc.localStream; }, [rtc.localStream]);
  // Surface capture errors in the existing permission UI.
  useEffect(() => { if (rtc.error) setPermError(rtc.error); }, [rtc.error]);

  // NO composer-always-on: the raw RTC camera streams directly by default (zero GPU cost —
  // an idle stream never spins up the compositor, so the phone stays cool). The composer
  // only engages the FIRST time the user picks an effect (look / LUT / VTuber / camera mode)
  // — see applyMode's first-publish, which adopts the live RTC camera as the source. Running
  // a full WebGL compositor + trackers every frame when nobody asked for an effect was
  // pegging the GPU (overheating, lag, frozen viewport) for no benefit.
  // Bridge the existing mic/cam/flip UI setters to the backbone.
  useEffect(() => { rtc.setAudio(micOn); }, [micOn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { rtc.setVideo(camOn); }, [camOn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; } // skip initial (already user-facing)
    rtc.switchCamera(facing);
  }, [facing]); // eslint-disable-line react-hooks/exhaustive-deps
  // Flip = cycle to the NEXT physical camera (front → back → back-wide → …), not a
  // mirror. cycleCamera walks the enumerated cameras by deviceId — a facingMode hint
  // alone doesn't reliably switch to the back camera on phones — and reports whether
  // the preview should be mirrored (front cameras only).
  const flipCamera = async () => {
    // Once the composer owns the video, "flip" toggles its front/rear source.
    if (composerPublishedRef.current) { await applyMode(camMode === 'rear' ? 'front' : 'rear'); return; }
    const { mirror: m } = await rtc.cycleCamera();
    setMirror(m);
  };
  // Live viewer count / peak ← backbone participants; mirrored to the streams doc
  // so the viewer side can display it.
  useEffect(() => {
    if (!isLive) return;
    const c = rtc.participants.length;
    setViewerCount(c);
    setPeakViewers(prev => {
      const peak = Math.max(prev, c);
      updateDoc(doc(db, 'streams', streamId), { viewerCount: c, peakViewers: peak }).catch(() => {});
      return peak;
    });
  }, [rtc.participants, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live timer
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isLive, startTime]);

  // Lifetime view count ← streams doc (viewers increment it on join).
  useEffect(() => {
    if (!streamId) return;
    return onSnapshot(doc(db, 'streams', streamId), snap => {
      setTotalViews(snap.data()?.totalViews ?? 0);
    });
  }, [streamId]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);
  // Measure the chat + dock stack so the camera can shrink to sit above it (not under it).
  useEffect(() => {
    const el = bottomRef.current;
    if (!el || step !== 'live') { setBottomH(0); return; }
    const measure = () => setBottomH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [step, showChat, modeMenuOpen]);

  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // (Recording is handled by the rtcCore backbone — rtc.startRecording/stopRecording.)

  const goLive = async () => {
    const user = auth.currentUser;
    if (!user) { setGoLiveError('Sign in to go live.'); return; }
    setGoLiveError('');
    const finalTitle = title.trim() || 'Live Stream';
    if (!title.trim()) setTitle(finalTitle);
    const id = streamId;
    try {
    await setDoc(doc(db, 'streams', id), {
      title: finalTitle,
      ownerName: user?.displayName || 'Creator',
      ownerUid: user?.uid,
      viewerCount: 0,
      totalViews: 0,
      peakViewers: 0,
      startedAt: Date.now(),
      isLive: true,
      ...(clubId ? { clubId, isPrivate: !!isPrivate } : {}),
    });
    } catch (e: any) {
      // Surface the real failure (e.g. permissions) instead of doing nothing.
      setGoLiveError(e?.message || 'Could not start the stream. Try again.');
      return;
    }
    setStartTime(Date.now());
    setIsLive(true);
    setStep('live');

    // Durable on-device recording: commit every chunk as it records so a failed
    // upload or a closed tab never loses the stream. Best-effort — if the local
    // store can't init, the live still records to memory + uploads as before.
    if (storeLocal) {
      try {
        localSinkRef.current = await startLocalRecording({
          title: finalTitle,
          mime: 'video/webm',
          streamId: id,
          fileWritable: fileWritableRef.current,
        });
        fileWritableRef.current = null; // ownership handed to the sink
      } catch { localSinkRef.current = null; }
    }
    rtc.startRecording(storeLocal ? { onData: c => { localSinkRef.current?.write(c); } } : undefined);

    // ── Lifecycle side effects (all fire-and-forget; the stream never blocks) ──
    if (user) {
      // 0. Discovery mirror → live_feeds so every "what's live now" surface +
      //    the unified viewer find THIS stream (the one source of truth).
      publishLiveDiscovery({
        streamId: id, title: finalTitle,
        ownerName: user.displayName || 'Creator', ownerPhoto: user.photoURL || '',
        clubId, isPublic: !isPrivate,
      }).then(fid => { discoveryFeedIdRef.current = fid; }).catch(() => {});

      // Public-only side effects — skipped for private/club streams.
      if (!isPrivate) {
        // 1. Auto-post on the author's timeline
        createPost({
          text: `🔴 Live now: ${finalTitle}`,
          isLiveNow: true,
          liveStreamId: id,
        }).then(pid => { if (pid) setPostId(pid); }).catch(() => {});
        // 2. Dedicated "is live" notification to followers
        notifyFollowers(user.uid, 'CONTENT', '🔴 Live Now',
          `${user.displayName || 'A creator you follow'} is live: ${finalTitle}`,
          'LIVE_HUB', id).catch(() => {});
      }
      // 3. First-stream achievement (always)
      unlockAchievementByTrigger(user.uid, 'FIRST_LIVE_STREAM').catch(() => {});
    }
  };

  // ── End flow: stop everything, then prompt save vs delete ──────────────────
  const endStream = async () => {
    // Stop + keep the recording (the save/delete prompt uses it), then leave.
    try { recordedBlobRef.current = await rtc.stopRecording(); } catch {}
    // Finalize the on-device copy (not-yet-uploaded — saveRecording marks it uploaded on success).
    try { await localSinkRef.current?.close(false); } catch {}
    if (streamId) {
      await updateDoc(doc(db, 'streams', streamId), { isLive: false, endedAt: Date.now() }).catch(() => {});
    }
    // Drop the discovery mirror out of "what's live now".
    endLiveDiscovery(discoveryFeedIdRef.current);
    rtc.leave();
    setIsLive(false);
    setStep('ended');
  };

  const saveRecording = async () => {
    setSaving('saving');
    try {
      // The backbone recorder may not have finished on end — make sure it has.
      const blob = recordedBlobRef.current || await rtc.stopRecording();
      if (!blob || blob.size < 1000) throw new Error('No recording captured');
      const finalTitle = title.trim() || 'Live Stream';
      const file = new File([blob], `live-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
      const video = await uploadVideo({
        file,
        title: `${finalTitle} (Live Replay)`,
        description: `Recorded live on ${new Date().toLocaleDateString()} · peak ${peakViewers} viewers · ${totalViews} views`,
        isLiveRecording: true,
        isPrivate: !!isPrivate,
        duration: elapsed,
        genre: 'Live',
      });
      // The timeline post becomes the replay. Carry the Mux playback id + poster so the social
      // feed can preview + play it (Mux videos have an empty url) — and if Mux is still
      // transcoding, PostVideo recovers both by looking the video up by id.
      if (postId) {
        const replayMedia: any = { type: 'VIDEO', url: (video as any).url || '', id: video.id, title: finalTitle };
        if ((video as any).muxPlaybackId) replayMedia.muxPlaybackId = (video as any).muxPlaybackId;
        const poster = (video as any).thumbnailUrl || (video as any).coverImageUrl;
        if (poster) replayMedia.thumbnail = poster;
        await updatePost(postId, {
          text: `${finalTitle} — live stream replay`,
          isLiveNow: false,
          media: [replayMedia],
        }).catch(() => {});
      }
      if (streamId) await updateDoc(doc(db, 'streams', streamId), { recordingVideoId: video.id }).catch(() => {});
      // Cloud copy is safe now → clear the on-device backup so it doesn't pile up.
      const localId = localSinkRef.current?.id;
      if (localId) { try { await markLocalRecordingUploaded(localId); await deleteLocalRecording(localId); } catch {} }
      setSaving('done');
      setTimeout(onClose, 1200);
    } catch (e) {
      console.warn('[Live] save failed', e);
      // Upload failed — but the on-device copy is intact. Tell the user it's safe.
      setSaving('error');
    }
  };

  // Download the on-device copy to the device (Downloads folder on Android / save
  // dialog on desktop). The lifeline when the cloud upload fails.
  const saveToDevice = async () => {
    const finalTitle = title.trim() || 'Live Stream';
    const localId = localSinkRef.current?.id;
    let ok = false;
    if (localId) ok = await downloadLocalRecording(localId, `${finalTitle.replace(/[^\w.\-]+/g, '_')}.webm`).catch(() => false);
    // Fallback to the in-memory blob if the store never engaged.
    if (!ok && recordedBlobRef.current) {
      const url = URL.createObjectURL(recordedBlobRef.current);
      const a = document.createElement('a');
      a.href = url; a.download = `${finalTitle.replace(/[^\w.\-]+/g, '_')}.webm`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 10_000);
      ok = true;
    }
    if (ok) setSavedToDevice(true);
  };

  const discardRecording = async () => {
    // Stream not saved → the auto-post comes down too (no dead "live" posts).
    if (postId) await deletePost(postId).catch(() => {});
    // Explicit delete → drop the on-device copy too (the user chose not to keep it).
    const localId = localSinkRef.current?.id;
    if (localId) { try { await deleteLocalRecording(localId); } catch {} }
    recordedBlobRef.current = null;
    onClose();
  };

  // Setup-time "save to a file" pick. Called from the toggle's click (a user gesture,
  // which showSaveFilePicker requires) so the handle is ready before Go Live.
  const chooseLocalFile = async () => {
    const w = await pickRecordingFile(`${(title.trim() || 'live-stream')}.webm`);
    if (w) { fileWritableRef.current = w; setFileChosen(true); setStoreLocal(true); }
  };

  const addReaction = (emoji: string) => {
    const r: Reaction = { id: uid4(), emoji, x: 20 + Math.random() * 60 };
    setReactions(prev => [...prev, r]);
    setTimeout(() => setReactions(prev => prev.filter(x => x.id !== r.id)), 2500);
  };

  const copyLink = () => {
    const url = buildShareUrl('livestream', streamId);
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const shareStream = async () => {
    const url = buildShareUrl('livestream', streamId);
    if (navigator.share) {
      await navigator.share({ title: title || 'Live Stream', url }).catch(() => {});
    } else {
      copyLink();
    }
  };

  if (permError) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4 p-8 z-[200]">
        <CameraOff size={40} className="text-red-400" />
        <p className="text-white font-bold text-center">Camera access needed</p>
        <p className="text-white/40 text-sm text-center">{permError}</p>
        <button onClick={onClose} className="mt-4 px-6 py-3 bg-white/10 rounded-2xl text-white font-bold">Back</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col select-none overflow-hidden" style={{ height: '100dvh' }}>
      {/* Camera preview — shrinks to sit above the chat + dock stack when chat is open */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute top-0 left-0 right-0 w-full object-contain bg-black transition-all duration-300"
        style={{ bottom: step === 'live' && (showChat || modeMenuOpen) ? `${bottomH}px` : '0px', transform: mirror ? 'scaleX(-1)' : 'none' }}
      />

      {/* Dim overlay when cam off */}
      {!camOn && step !== 'ended' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <CameraOff size={48} className="text-white/30" />
        </div>
      )}

      {/* Setup overlay — shown before going live */}
      {step === 'setup' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent"
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-safe">
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
              <X size={18} className="text-white" />
            </button>
            <div className="flex items-center gap-2">
              <button onClick={flipCamera} title="Switch camera"
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                <FlipHorizontal2 size={18} className="text-white" />
              </button>
              <button onClick={() => setMicOn(m => !m)}
                className={`w-10 h-10 rounded-full backdrop-blur flex items-center justify-center ${micOn ? 'bg-black/50' : 'bg-red-500/80'}`}>
                {micOn ? <Mic size={18} className="text-white" /> : <MicOff size={18} className="text-white" />}
              </button>
            </div>
          </div>

          {/* Setup form */}
          <div className="px-5 pb-safe space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Stream title</p>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What are you streaming today?"
                maxLength={80}
                className="w-full bg-black/50 backdrop-blur border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-400/60"
              />
            </div>
            {/* Local recording — save a copy on this device AS you stream, so a failed
                upload never loses the video. */}
            <div className="rounded-2xl bg-black/50 backdrop-blur border border-white/15 overflow-hidden">
              <button onClick={() => setStoreLocal(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${storeLocal ? 'bg-orange-500/20 text-orange-400' : 'bg-white/8 text-white/40'}`}>
                  <HardDriveDownload size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white leading-tight">Save a copy on this device</p>
                  <p className="text-[10px] text-white/45 leading-tight mt-0.5">Recorded as you stream — survives a failed upload.</p>
                </div>
                <div className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${storeLocal ? 'bg-orange-500' : 'bg-white/15'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${storeLocal ? 'translate-x-4' : ''}`} />
                </div>
              </button>
              {storeLocal && supportsFilePicker() && (
                <div className="px-4 pb-3 -mt-1">
                  <button onClick={chooseLocalFile}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold border ${fileChosen ? 'bg-green-500/15 border-green-500/30 text-green-300' : 'bg-white/8 border-white/15 text-white/70 hover:text-white'}`}>
                    {fileChosen ? <><Check size={13} /> Saving to your chosen file</> : <><FolderOpen size={13} /> Choose where to save…</>}
                  </button>
                </div>
              )}
              {storeLocal && !supportsFilePicker() && (
                <p className="px-4 pb-3 -mt-1 text-[10px] text-white/40 leading-snug">
                  Saved to this device's storage. After the stream you can download it or save the replay to Reello.
                </p>
              )}
            </div>
            <p className="text-[9px] text-white/35 leading-relaxed">
              Going live posts to your timeline and notifies your followers. When you end,
              you choose to save the replay to Reello or delete it.
            </p>
            {pendingRec && (
              <button onClick={() => setShowRecovery(true)}
                className="w-full rounded-2xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center gap-3 text-left hover:bg-amber-500/15 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 grid place-items-center shrink-0"><HardDriveDownload size={16} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-amber-300">Unsaved live recordings</p>
                  <p className="text-[10px] text-white/50 leading-snug">Tap to review, retry the upload, or download them before they're lost.</p>
                </div>
                <span className="text-amber-300 text-lg shrink-0">›</span>
              </button>
            )}
            {goLiveError && (
              <p className="text-[11px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">{goLiveError}</p>
            )}
            <button
              onClick={goLive}
              className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-95 transition-all font-black text-white text-base tracking-wide flex items-center justify-center gap-2 shadow-[0_8px_32px_rgba(239,68,68,0.5)]"
            >
              <Radio size={18} className="animate-pulse" /> Go Live
            </button>
          </div>
        </motion.div>
      )}

      {/* Live UI */}
      {step === 'live' && (
        <>
          {/* FX engine status + error — always visible so on-device failures are diagnosable
              (tap to dismiss the error). 'FX ready' = composer publishing; 'raw camera' = not. */}
          <div className="absolute left-0 right-0 z-20 flex flex-col items-center gap-1 pointer-events-none"
            style={{ top: 'calc(max(env(safe-area-inset-top), 10px) + 44px)' }}>
            {fxError && (
              <button onClick={() => setFxError(null)}
                className="pointer-events-auto max-w-[92%] px-3 py-1.5 rounded-full bg-red-500/90 text-white text-[11px] font-bold shadow-lg">
                ⚠️ {fxError} (tap)
              </button>
            )}
            <span className="px-2 py-0.5 rounded-full bg-black/45 backdrop-blur text-[9px] font-mono text-white/60">
              {composerPublishedRef.current ? `FX ✓ · ${camMode}${lookId !== 'none' ? ' · ' + lookId : ''}` : 'direct camera · tap Mode to add effects'}
            </span>
          </div>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-safe z-10">
            <div className="flex items-center gap-2">
              {/* LIVE badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 rounded-full shadow-[0_4px_16px_rgba(239,68,68,0.6)]">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Live</span>
              </div>
              {/* Timer */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 backdrop-blur rounded-full">
                <Clock size={11} className="text-white/60" />
                <span className="text-[11px] font-bold text-white/80 font-mono">{fmt(elapsed)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Viewers (live) */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 backdrop-blur rounded-full">
                <Eye size={11} className="text-white/60" />
                <span className="text-[11px] font-bold text-white/80">{viewerCount}</span>
              </div>
              {/* Guests — bring viewers on stage. Badge shows pending requests. */}
              <button onClick={() => setShowGuestPanel(v => !v)}
                className="relative w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                <Users size={16} className="text-white" />
                {guestRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{guestRequests.length}</span>
                )}
              </button>
              {/* Share */}
              <button onClick={shareStream}
                className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                {copied ? <Check size={16} className="text-green-400" /> : <Share2 size={16} className="text-white" />}
              </button>
            </div>
          </div>

          {/* Guests-on-stage: live video tiles for approved guests */}
          {guestPeers.length > 0 && (
            <div className="absolute left-3 right-3 flex gap-2 overflow-x-auto z-10" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 128px)' }}>
              {guestPeers.map(p => {
                const g = guests.find(x => x.uid === p.peerId);
                return <PeerTile key={p.peerId} stream={p.stream} name={p.name || g?.name} onRemove={g ? () => removeGuest(g) : undefined} />;
              })}
            </div>
          )}

          {/* Guest management panel — approve requests, remove guests */}
          {showGuestPanel && (
            <div className="absolute top-0 bottom-0 right-0 w-72 max-w-[85vw] bg-[#0c0c0e]/95 backdrop-blur-xl border-l border-white/10 z-30 flex flex-col">
              <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
                <span className="text-[11px] font-black uppercase tracking-widest text-white">Guests on stage</span>
                <button onClick={() => setShowGuestPanel(false)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60"><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {guestRequests.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Requests</p>
                    {guestRequests.map(g => (
                      <div key={g.uid} className="flex items-center gap-2 mb-2">
                        <img src={g.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${g.uid}`} className="w-8 h-8 rounded-full object-cover" alt="" />
                        <span className="flex-1 text-[11px] font-bold text-white truncate">{g.name}</span>
                        <button onClick={() => approveGuest(g)} className="px-2.5 py-1 rounded-full bg-green-500/90 text-white text-[9px] font-black uppercase">Bring on</button>
                        <button onClick={() => denyRequest(g)} className="px-2 py-1 rounded-full bg-white/10 text-white/60 text-[9px] font-black uppercase">No</button>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">On stage ({guests.length})</p>
                  {guests.length === 0 && <p className="text-[10px] text-white/30">No guests yet. Approve a request to bring someone on.</p>}
                  {guests.map(g => (
                    <div key={g.uid} className="flex items-center gap-2 mb-2">
                      <img src={g.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${g.uid}`} className="w-8 h-8 rounded-full object-cover" alt="" />
                      <span className="flex-1 text-[11px] font-bold text-white truncate">{g.name}</span>
                      <button onClick={() => removeGuest(g)} className="px-2.5 py-1 rounded-full bg-red-500/80 text-white text-[9px] font-black uppercase">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Title overlay */}
          <div className="absolute left-4 right-4" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 52px)' }}>
            {title && (
              <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-1.5 inline-flex max-w-full">
                <p className="text-xs font-bold text-white truncate">{title}</p>
              </div>
            )}
          </div>

          {/* Active poll — streamer sees live results + can end it */}
          <div className="absolute left-3 right-3 max-w-sm mx-auto pointer-events-none z-10"
            style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 88px)' }}>
            <AnimatePresence>
              {poll && <LivePollCard key={poll.id} poll={poll} counts={counts} myVote={null} onEnd={endPoll} />}
            </AnimatePresence>
          </div>

          {/* Floating reactions */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <AnimatePresence>
              {reactions.map(r => (
                <motion.div
                  key={r.id}
                  initial={{ y: 0, opacity: 1, scale: 1 }}
                  animate={{ y: -300, opacity: 0, scale: 1.4 }}
                  exit={{}}
                  transition={{ duration: 2.4, ease: 'easeOut' }}
                  className="absolute bottom-32 text-3xl"
                  style={{ left: `${r.x}%` }}
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Tap-out: tapping the exposed video (or anywhere outside the panel) closes the
              feature carousel. Sits above the video (z-auto) but below the dock (z-10). */}
          {modeMenuOpen && <div className="fixed inset-0 z-[5]" onClick={() => setModeMenuOpen(false)} />}

          {/* Bottom stack — chat anchored at the very bottom, controls above it, camera above both.
              flex-col-reverse renders the first child (chat) at the bottom and the dock above it. */}
          <div ref={bottomRef} className="absolute inset-x-0 bottom-0 z-10 flex flex-col-reverse">
            {/* Live chat — in flow, above the dock */}
            <AnimatePresence>
              {showChat && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="h-[46dvh] bg-black/85 backdrop-blur-xl rounded-t-3xl flex flex-col overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                    <p className="text-sm font-black text-white">Live Chat</p>
                    <button onClick={() => setShowChat(false)} className="text-white/40 hover:text-white"><ChevronDown size={20} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0">
                    {chatMsgs.length === 0 && <p className="text-[12px] text-white/30 text-center py-6">No messages yet — say hello 👋</p>}
                    {chatMsgs.map(m => (
                      <div key={m.id} className="flex items-start gap-2">
                        <span className="text-[11px] font-black text-orange-400 shrink-0 mt-0.5">{(m.user || 'Viewer').split(' ')[0]}</span>
                        <span className="text-[13px] text-white/90 leading-relaxed">{m.text}</span>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 shrink-0">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && chatInput.trim()) { sendChat(streamId, chatInput); setChatInput(''); } }}
                      placeholder="Say something…"
                      className="flex-1 bg-white/10 border border-white/15 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
                    />
                    <button
                      onClick={() => { if (chatInput.trim()) { sendChat(streamId, chatInput); setChatInput(''); } }}
                      className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shrink-0"
                    >
                      <Send size={16} className="text-white" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dock (controls) */}
            <div className="flex flex-col items-center gap-3 px-4 pb-safe pt-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
            {/* ── Feature carousel — swipe LEFT/RIGHT through features; the video sits ABOVE
                   this panel so you always see what each feature does to the image ── */}
            <AnimatePresence>
              {modeMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="w-full max-w-md mx-auto bg-black/55 backdrop-blur-2xl rounded-2xl border border-white/10 overflow-hidden">
                  {/* Tab bar (also swipeable) */}
                  <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {[['📷', 'Camera'], ['🎨', 'Looks'], ['🎭', 'Avatar'], ['🎙️', 'Voice'], ['🎉', 'Fun']].map(([icon, label], i) => (
                      <button key={label} onClick={() => scrollToTab(i)}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${modeTab === i ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/70'}`}>
                        {icon} {label}
                      </button>
                    ))}
                    <button onClick={() => setModeMenuOpen(false)} className="ml-auto shrink-0 text-white/40 px-1"><ChevronDown size={18} /></button>
                  </div>
                  {/* Horizontal snap carousel */}
                  <div ref={modeScrollRef} onScroll={onModeScroll}
                    className="flex overflow-x-auto snap-x snap-mandatory h-[30dvh] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {/* Slide 1 · Camera + Night */}
                    <div className="w-full shrink-0 snap-center overflow-y-auto px-2 py-1">
                      {([
                        { id: 'front', label: 'Front camera', icon: <UserSquare2 size={17} />, on: true },
                        { id: 'rear', label: 'Rear camera', icon: <Camera size={17} />, on: true },
                        { id: 'both', label: 'Both cameras', icon: <Columns2 size={17} />, on: true },
                        { id: 'screen-pip', label: 'Screen + camera', icon: <MonitorSmartphone size={17} />, on: canScreen },
                        { id: 'screen-mask', label: 'Screen + cut-out you', icon: <Monitor size={17} />, on: canScreen },
                      ] as { id: ComposerMode; label: string; icon: React.JSX.Element; on: boolean }[]).map(m => (
                        <button key={m.id} disabled={!m.on || modeBusy} onClick={() => applyMode(m.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${camMode === m.id ? 'bg-orange-500/20' : 'hover:bg-white/[0.06]'} disabled:opacity-35`}>
                          <span className={camMode === m.id ? 'text-orange-400' : 'text-white/70'}>{m.icon}</span>
                          <span className="flex-1 text-[13px] font-bold text-white">{m.label}</span>
                          {!m.on && <span className="text-[8px] font-black uppercase tracking-wider text-white/30">Desktop</span>}
                          {camMode === m.id && m.on && <Check size={15} className="text-orange-400" />}
                        </button>
                      ))}
                      <button onClick={async () => { const on = !nightOn; setNightOn(on); await composerRef.current?.setNightMode(on); }}
                        className={`mt-1.5 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${nightOn ? 'bg-indigo-500/25' : 'hover:bg-white/[0.06]'}`}>
                        <span className="text-[17px]">🌙</span>
                        <span className="flex-1 text-[13px] font-bold text-white">Night mode <span className="text-white/40 font-medium">· low light</span></span>
                        <span className={`text-[9px] font-black uppercase tracking-wider ${nightOn ? 'text-indigo-300' : 'text-white/30'}`}>{nightOn ? 'On' : 'Off'}</span>
                      </button>
                    </div>
                    {/* Slide 2 · Looks */}
                    <div className="w-full shrink-0 snap-center overflow-y-auto px-2 py-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-1 pb-2">Color grade — live preview above</p>
                      <div className="flex flex-wrap gap-1.5">
                        {LOOKS.map(l => (
                          <button key={l.id} onClick={() => applyLook(l.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${lookId === l.id ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>
                            {l.label}
                          </button>
                        ))}
                        <button onClick={() => cubeInputRef.current?.click()}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${lookId === 'custom' ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>
                          + .cube LUT
                        </button>
                      </div>
                    </div>
                    {/* Slide 3 · Avatar */}
                    <div className="w-full shrink-0 snap-center overflow-y-auto px-2 py-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        {DEMO_AVATARS.map(demo => {
                          const active = demoId === demo.id;
                          return (
                            <button key={demo.id} onClick={() => useDemoAvatar(demo)} disabled={avatarBuilding}
                              className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all disabled:opacity-50 ${active ? 'border-orange-400 ring-2 ring-orange-400/40' : 'border-white/12'}`}>
                              <img src={demo.url} alt={demo.name} loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${(demo.crop.sx + demo.crop.sw / 2) * 100}% ${(demo.crop.sy + demo.crop.sh / 2) * 100}%`, transform: 'scale(2.6)' }} />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pt-3 pb-1">
                                <span className="text-[10px] font-bold text-white flex items-center gap-0.5"><span>{demo.emoji}</span>{demo.name}</span>
                              </div>
                              {active && avatarBuilding && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                        <button onClick={() => sheetInputRef.current?.click()} disabled={avatarBuilding}
                          className="rounded-xl aspect-square border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 text-white/60 disabled:opacity-50">
                          <Plus size={18} />
                          <span className="text-[9px] font-bold leading-none">Upload</span>
                        </button>
                      </div>
                      {avatarBuilt && avatarKind === 'puppet' && (
                        <div className="flex gap-1.5 mt-2">
                          {([['face', '👤 Face swap'], ['body', '🕺 Full body']] as const).map(([s, label]) => (
                            <button key={s} onClick={() => applyVtuberStyle(s)}
                              className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${vtuberStyle === s ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {camMode === 'vtuber' ? (
                          <button onClick={() => applyMode('front')}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-500 text-white flex items-center gap-1">
                            <CameraOff size={13} /> Turn off avatar
                          </button>
                        ) : avatarBuilt && (
                          <button onClick={() => applyMode('vtuber')}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-[#6B0099] to-[#FF8C00] text-white">
                            Go live as avatar
                          </button>
                        )}
                        <button onClick={() => vrmInputRef.current?.click()} disabled={avatarBuilding}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/[0.06] text-white/80 disabled:opacity-50">🧊 .vrm (3D)</button>
                        {avatarBuilt && (
                          <button onClick={toggleGreen}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${greenOn ? 'bg-green-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>🟩 Green</button>
                        )}
                      </div>
                      <p className="text-[9px] text-white/30 pt-1.5 leading-snug">
                        {avatarBuilding ? (buildMsg || 'Loading…') : 'Tap a character — your face/body drives it live. Preview stays above.'}
                      </p>
                    </div>
                    {/* Slide 4 · Voice */}
                    <div className="w-full shrink-0 snap-center overflow-y-auto px-2 py-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-1 pb-2">Voice changer</p>
                      <div className="flex flex-wrap gap-1.5">
                        {VOICE_EFFECTS.map(v => (
                          <button key={v.id} onClick={() => applyVoiceEffect(v.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${voiceId === v.id ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Slide 5 · Fun */}
                    <div className="w-full shrink-0 snap-center overflow-y-auto px-2 py-1">
                      <button onClick={() => { setModeMenuOpen(false); setPollOpen(true); }}
                        className="mb-2 px-3 py-2 rounded-xl text-[11px] font-black bg-gradient-to-r from-[#6B0099] to-[#FF8C00] text-white flex items-center gap-1.5">
                        <BarChart3 size={13} /> New poll — type or dictate
                      </button>
                      <p className="text-[9px] text-white/35 px-1 pb-1">Ambient effect</p>
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        {AMBIENT_FX.map(f => (
                          <button key={f.id} onClick={() => applyAmbient(f.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${ambientId === f.id ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>
                            {f.icon} {f.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-white/35 px-1 pt-1 pb-1">Hype burst (viewers can fire these too)</p>
                      <div className="flex gap-1.5">
                        {QUICK_EMOTES.map(e => (
                          <button key={e} onClick={() => composerRef.current?.spawnBurst(e, 12)}
                            className="w-9 h-9 rounded-lg bg-white/[0.06] text-[17px] flex items-center justify-center active:scale-90 transition-transform">
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Dots + engine health */}
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    {[0, 1, 2, 3, 4].map(i => (
                      <span key={i} className={`h-1.5 rounded-full transition-all ${modeTab === i ? 'w-4 bg-orange-400' : 'w-1.5 bg-white/25'}`} />
                    ))}
                  </div>
                  <p className="text-[8px] font-mono text-white/25 text-center px-2 py-1 truncate">
                    {(() => {
                      const d = composerRef.current?.getDiagnostics();
                      return d
                        ? `${composerPublishedRef.current ? 'LIVE' : 'idle'} · grade:${d.grade}${d.night ? '+night' : ''}${d.green ? '+green' : ''} · look:${d.look} · ${d.mode} · vtuber:${d.vtuber}${d.track ? ` · ${d.track}` : ''}`
                        : 'engine off — raw camera';
                    })()}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Reactions row */}
            <div className="flex items-center gap-3">
              {['❤️', '🔥', '😂', '👏', '💯', '🎉'].map(e => (
                <button key={e} onClick={() => addReaction(e)}
                  className="text-2xl active:scale-125 transition-transform">
                  {e}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="relative flex items-center justify-between w-full max-w-md mx-auto">
              <input ref={cubeInputRef} type="file" accept=".cube" className="hidden"
                onChange={e => { uploadCube(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              <input ref={sheetInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { buildAvatar(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              <input ref={vrmInputRef} type="file" accept=".vrm,model/gltf-binary" className="hidden"
                onChange={e => { loadVrm(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              {pollOpen && <PollComposer onLaunch={launchPoll} onClose={() => setPollOpen(false)} />}
              {/* Camera / mic device picker */}
              {deviceMenu !== 'none' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDeviceMenu('none')} />
                  <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 z-20 w-[290px] rounded-2xl bg-[#141019]/35 backdrop-blur-2xl border border-white/12 p-2 shadow-2xl max-h-[48vh] overflow-y-auto">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-2 pt-1 pb-2">{deviceMenu === 'camera' ? 'Choose camera' : 'Choose microphone'}</p>
                    {(deviceMenu === 'camera' ? rtc.devices.cameras : rtc.devices.mics).map((d, i) => {
                      const active = deviceMenu === 'camera' ? rtc.activeDevices.cameraId === d.deviceId : rtc.activeDevices.micId === d.deviceId;
                      return (
                        <button key={d.deviceId || i}
                          onClick={() => { if (deviceMenu === 'camera') rtc.switchVideoDevice(d.deviceId); else rtc.switchAudioDevice(d.deviceId); setDeviceMenu('none'); }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${active ? 'bg-orange-500/20' : 'hover:bg-white/[0.06]'}`}>
                          <span className={active ? 'text-orange-400' : 'text-white/70'}>{deviceMenu === 'camera' ? <Camera size={16} /> : <Mic size={16} />}</span>
                          <span className="flex-1 text-[13px] font-bold text-white truncate">{d.label || (deviceMenu === 'camera' ? `Camera ${i + 1}` : `Microphone ${i + 1}`)}</span>
                          {active && <Check size={15} className="text-orange-400 shrink-0" />}
                        </button>
                      );
                    })}
                    {(deviceMenu === 'camera' ? rtc.devices.cameras : rtc.devices.mics).length === 0 && (
                      <p className="text-[11px] text-white/40 px-3 py-3">No devices yet — grant camera/mic permission, then reopen.</p>
                    )}
                    {deviceMenu === 'camera' && (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-2 pb-1">Manual controls</p>
                        <CameraProControls track={getActiveCamTrack()} />
                      </div>
                    )}
                  </div>
                </>
              )}
              {/* Chat toggle */}
              <button onClick={() => { setModeMenuOpen(false); setShowChat(s => !s); }}
                className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur border border-white/15 flex items-center justify-center">
                  <MessageCircle size={22} className={showChat ? 'text-orange-400' : 'text-white'} />
                </div>
                <span className="text-[9px] text-white/50">Chat</span>
              </button>

              {/* Camera device picker (tap → choose which camera) */}
              <button onClick={() => openDeviceMenu('camera')}
                className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center ${deviceMenu === 'camera' ? 'bg-orange-500/80 border-orange-400' : 'bg-black/60 border-white/15'}`}>
                  <FlipHorizontal2 size={20} className="text-white" />
                  <ChevronDown size={11} className="text-white/70 -ml-0.5 mt-2 self-end" />
                </div>
                <span className="text-[9px] text-white/50">Camera</span>
              </button>

              {/* Camera mode: front · rear · both · screen + cam · screen + cut-out */}
              <button onClick={openModeMenu}
                className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center transition-all ${modeMenuOpen || camMode !== 'front' ? 'bg-orange-500/80 border-orange-400' : 'bg-black/60 border-white/15'}`}>
                  {modeBusy ? <RotateCcw size={20} className="text-white animate-spin" /> : <LayoutGrid size={22} className="text-white" />}
                </div>
                <span className="text-[9px] text-white/50">Mode</span>
              </button>

              {/* End stream — big center button */}
              <button onClick={endStream}
                className="flex flex-col items-center gap-1">
                <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-[0_8px_24px_rgba(239,68,68,0.6)] active:scale-95 transition-transform">
                  <Radio size={26} className="text-white" />
                </div>
                <span className="text-[9px] text-red-400 font-bold">End</span>
              </button>

              {/* Mic device picker (tap → choose which microphone) */}
              <button onClick={() => openDeviceMenu('mic')}
                className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center ${deviceMenu === 'mic' ? 'bg-orange-500/80 border-orange-400' : 'bg-black/60 border-white/15'}`}>
                  <Volume2 size={20} className="text-white" />
                  <ChevronDown size={11} className="text-white/70 -ml-0.5 mt-2 self-end" />
                </div>
                <span className="text-[9px] text-white/50">Mic</span>
              </button>

              {/* Mute toggle (audio on/off) */}
              <button onClick={() => setMicOn(m => !m)}
                className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center ${micOn ? 'bg-black/60 border-white/15' : 'bg-red-500 border-red-500'}`}>
                  {micOn ? <Mic size={22} className="text-white" /> : <MicOff size={22} className="text-white" />}
                </div>
                <span className="text-[9px] text-white/50">{micOn ? 'Mute' : 'Unmuted'}</span>
              </button>

              {/* Camera toggle */}
              <button onClick={() => setCamOn(c => !c)}
                className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center ${camOn ? 'bg-black/60 border-white/15' : 'bg-red-500 border-red-500'}`}>
                  {camOn ? <Camera size={22} className="text-white" /> : <CameraOff size={22} className="text-white" />}
                </div>
                <span className="text-[9px] text-white/50">{camOn ? 'Cam' : 'Hidden'}</span>
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ── Ended: save / delete prompt ───────────────────────────────────────── */}
      {step === 'ended' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/92 backdrop-blur-md flex flex-col items-center justify-center px-6 pt-safe pb-safe"
        >
          <div className="w-full max-w-sm space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <Radio size={24} className="text-red-400" />
              </div>
              <p className="text-lg font-black text-white">Stream ended</p>
              <p className="text-xs text-white/40">{title || 'Live Stream'}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Duration', value: fmt(elapsed) },
                { label: 'Peak viewers', value: String(peakViewers) },
                { label: 'Total views', value: String(totalViews) },
              ].map(s => (
                <div key={s.label} className="bg-white/[0.05] border border-white/10 rounded-2xl px-2 py-3 text-center">
                  <p className="text-sm font-black text-white">{s.value}</p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/35 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {saving === 'saving' ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-xs text-white/50">Saving your replay to Reello…</p>
              </div>
            ) : saving === 'done' ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <Check size={28} className="text-green-400" />
                <p className="text-xs text-white/60">Saved — it's in Reello under Past Live Streams.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {saving === 'error' && (
                  <div className="rounded-xl bg-green-500/10 border border-green-500/25 px-3 py-2.5 flex items-start gap-2">
                    <ShieldCheck size={15} className="text-green-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-green-200/90 leading-snug">
                      Upload failed — but your recording is safe on this device. Retry the upload, or save it to your device below.
                    </p>
                  </div>
                )}
                <button onClick={saveRecording}
                  className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-95 transition-all font-black text-white text-sm flex items-center justify-center gap-2">
                  <Save size={16} /> {saving === 'error' ? 'Retry — save replay to Reello' : 'Save replay to Reello'}
                </button>
                <p className="text-[9px] text-white/30 text-center leading-relaxed">
                  Saving keeps the recording on your Reello page and turns your live post into the replay.
                </p>
                {storeLocal && (
                  <button onClick={saveToDevice}
                    className={`w-full py-3.5 rounded-2xl border active:scale-95 transition-all font-bold text-sm flex items-center justify-center gap-2 ${savedToDevice ? 'bg-green-500/15 border-green-500/30 text-green-300' : 'bg-white/[0.06] border-white/10 text-white/70 hover:text-white'}`}>
                    {savedToDevice ? <><Check size={15} /> Saved to your device</> : <><Download size={15} /> Save to device</>}
                  </button>
                )}
                <button onClick={discardRecording}
                  className="w-full py-3.5 rounded-2xl bg-white/[0.06] border border-white/10 hover:bg-red-500/15 hover:border-red-500/30 active:scale-95 transition-all font-bold text-white/60 hover:text-red-300 text-sm flex items-center justify-center gap-2">
                  <Trash2 size={15} /> Delete stream
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Failed / unsaved live recordings — retry upload, download, or delete. */}
      {showRecovery && (
        <StreamRecoveryList onClose={() => {
          setShowRecovery(false);
          listPendingLocalRecordings().then(l => setPendingRec(l.sort((a, b) => b.startedAt - a.startedAt)[0] || null)).catch(() => {});
        }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  VIEWER SIDE — mobile-first full-screen viewer
// ─────────────────────────────────────────────────────────────────────────────

function MobileViewer({ streamId, title, ownerName, onClose }: {
  streamId: string; title?: string; ownerName?: string; onClose: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [streamLive, setStreamLive] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [guests, setGuests] = useState<Array<{ uid: string; name: string; photo?: string }>>([]);
  const [requested, setRequested] = useState(false);

  const myUid = auth.currentUser?.uid || '';
  const isGuest = !!myUid && guests.some(g => g.uid === myUid);

  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMsgs = useLiveChat(streamId);

  // 'stage' topology: normally a recv-only viewer, but once the host brings me on I re-key as a
  // 'participant' and publish my cam/mic (this is a guest coming on stage). The host's stream is
  // still the main video for everyone; guests render as tiles.
  const rtc = useRtcSession({
    sessionId: streamId,
    topology: 'stage',
    role: isGuest ? 'participant' : 'viewer',
    media: isGuest ? { audio: true, video: { facingMode: 'user' } } : { audio: false, video: false },
    displayName: auth.currentUser?.displayName || 'Guest',
  });

  const requestToJoin = async () => {
    if (!myUid) { alert('Sign in to join the stream.'); return; }
    setRequested(true);
    await updateDoc(doc(db, 'streams', streamId), {
      guestRequests: arrayUnion({ uid: myUid, name: auth.currentUser?.displayName || 'Guest', photo: auth.currentUser?.photoURL || '' }),
    }).catch(() => {});
  };
  const leaveStage = async () => {
    const me = guests.find(g => g.uid === myUid);
    if (me) await updateDoc(doc(db, 'streams', streamId), { guests: arrayRemove(me) }).catch(() => {});
    setRequested(false);
  };
  // Other guests on stage (not me) → tiles.
  const guestPeers = rtc.remotePeers.filter(p => p.role === 'participant');

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  // Stream metadata (title / live / counts) still lives on the streams doc.
  useEffect(() => {
    return onSnapshot(doc(db, 'streams', streamId), snap => {
      const data = snap.data();
      if (data) {
        setViewerCount(data.viewerCount ?? 0);
        setLikeCount(data.likeCount ?? 0);
        setStreamLive(data.isLive !== false);
        setGuests(Array.isArray(data.guests) ? data.guests : []);
      }
    });
  }, [streamId]);

  // Count this view once (broadcaster mirrors live count from rtc participants).
  useEffect(() => {
    updateDoc(doc(db, 'streams', streamId), { totalViews: increment(1) }).catch(() => {});
  }, [streamId]);

  // Attach the HOST's stream as the main video — identified by role, not "first" (with guests on
  // stage there are multiple publishers; the first could be a guest). Falls back to any stream.
  useEffect(() => {
    const host = rtc.remotePeers.find(p => p.role === 'host');
    const main = host?.stream || rtc.remotePeers[0]?.stream;
    if (videoRef.current && main) {
      if (videoRef.current.srcObject !== main) videoRef.current.srcObject = main;
      setConnected(true);
      setConnecting(false);
    }
  }, [rtc.remotePeers]);

  // Stop the spinner after a grace period even if nothing connects.
  useEffect(() => {
    const t = setTimeout(() => setConnecting(false), 12000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const addReaction = (emoji: string) => {
    const r: Reaction = { id: uid4(), emoji, x: 10 + Math.random() * 70 };
    setReactions(prev => [...prev, r]);
    sendChat(streamId, emoji).catch(() => {});
    setTimeout(() => setReactions(prev => prev.filter(x => x.id !== r.id)), 2500);
  };

  const toggleLike = async () => {
    setLiked(l => !l);
    await updateDoc(doc(db, 'streams', streamId), { likeCount: increment(liked ? -1 : 1) }).catch(() => {});
    if (!liked) addReaction('❤️');
  };

  // Audience fun layer: quick emotes fire ON THE STREAM (the host bakes them into the
  // video for everyone) + float locally for instant feedback. Polls: tap to vote.
  const lastEmoteRef = useRef(0);
  const quickEmote = (emoji: string) => {
    const now = Date.now();
    if (now - lastEmoteRef.current < 900) return; // rate limit
    lastEmoteRef.current = now;
    const r: Reaction = { id: uid4(), emoji, x: 10 + Math.random() * 70 };
    setReactions(prev => [...prev, r]);
    setTimeout(() => setReactions(prev => prev.filter(x => x.id !== r.id)), 2500);
    sendLiveEvent(streamId, emoji).catch(() => {});
  };
  const { poll, counts, myVote } = usePoll(streamId);

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Active poll — tap an option to vote, watch the bars race live */}
      <div className="absolute left-3 right-3 max-w-sm mx-auto z-10 pointer-events-none"
        style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 60px)' }}>
        <AnimatePresence>
          {poll && (
            <LivePollCard key={poll.id} poll={poll} counts={counts} myVote={myVote}
              onVote={i => castVote(streamId, poll.id, i).catch(() => {})} />
          )}
        </AnimatePresence>
      </div>

      {/* Connecting / ended overlay */}
      <AnimatePresence>
        {(connecting || !streamLive) && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 px-8"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center">
              <Radio size={28} className={`text-red-400 ${streamLive ? 'animate-pulse' : ''}`} />
            </div>
            <p className="text-white font-bold text-center">
              {streamLive ? 'Connecting to stream…' : 'This stream has ended'}
            </p>
            <p className="text-white/40 text-sm text-center">
              {streamLive ? `${ownerName || 'Creator'} is live` : 'Check their Reello page for the replay'}
            </p>
            {!streamLive && (
              <button onClick={onClose} className="mt-2 px-6 py-3 bg-white/10 rounded-2xl text-white font-bold text-sm">Close</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-safe z-10">
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          {/* Verified-live badge: red only while the broadcaster is actually live */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${streamLive ? 'bg-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.5)]' : 'bg-white/15'}`}>
            <span className={`w-1.5 h-1.5 rounded-full bg-white ${streamLive ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">{streamLive ? 'Live' : 'Ended'}</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/60 backdrop-blur rounded-full">
            <Eye size={11} className="text-white/60" />
            <span className="text-[11px] font-bold text-white/80">{viewerCount}</span>
          </div>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
          {muted ? <VolumeX size={16} className="text-red-400" /> : <Volume2 size={16} className="text-white" />}
        </button>
      </div>

      {/* Guests on stage — the host + other guests' live tiles (mine is published, not shown here) */}
      {guestPeers.length > 0 && (
        <div className="absolute left-3 right-3 flex gap-2 overflow-x-auto z-10" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 52px)' }}>
          {guestPeers.map(p => <PeerTile key={p.peerId} stream={p.stream} name={p.name} />)}
        </div>
      )}

      {/* Join-the-stream control: request → (host approves) → on stage with mic/cam + leave. */}
      {streamLive && (
        <div className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}>
          {isGuest ? (
            <>
              <span className="px-3 py-1.5 rounded-full bg-red-500 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> You're on stage</span>
              <button onClick={rtc.toggleAudio} className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">{rtc.audioEnabled ? <Mic size={15} className="text-white" /> : <MicOff size={15} className="text-red-400" />}</button>
              <button onClick={rtc.toggleVideo} className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center"><Video size={15} className={rtc.videoEnabled ? 'text-white' : 'text-red-400'} /></button>
              <button onClick={leaveStage} className="px-3 py-1.5 rounded-full bg-white/15 text-white text-[9px] font-black uppercase tracking-widest">Leave stage</button>
            </>
          ) : requested ? (
            <span className="px-4 py-2 rounded-full bg-black/60 backdrop-blur text-white/70 text-[9px] font-black uppercase tracking-widest">Requested — waiting for host…</span>
          ) : (
            <button onClick={requestToJoin} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-[9px] font-black uppercase tracking-widest transition-all">
              <Users size={14} /> Ask to join
            </button>
          )}
        </div>
      )}

      {/* Creator info */}
      <div className="absolute left-4" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 52px)' }}>
        <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-1.5">
          <p className="text-xs font-black text-white">{ownerName || 'Live Stream'}</p>
          {title && <p className="text-[9px] text-white/50">{title}</p>}
        </div>
      </div>

      {/* Floating reactions */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {reactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ y: 0, opacity: 1, scale: 0.8 }}
              animate={{ y: -280, opacity: 0, scale: 1.5 }}
              exit={{}}
              transition={{ duration: 2.2, ease: 'easeOut' }}
              className="absolute bottom-32 text-3xl"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Slide-up chat */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            className="absolute inset-x-0 bottom-0 bg-black/85 backdrop-blur-xl rounded-t-3xl flex flex-col"
            style={{ maxHeight: '55dvh' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-orange-400" />
                <p className="text-sm font-black text-white">Live Chat</p>
              </div>
              <button onClick={() => setShowChat(false)} className="text-white/40"><ChevronDown size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 min-h-0">
              {chatMsgs.map(m => (
                <div key={m.id} className="flex items-start gap-2">
                  <span className="text-[10px] font-black text-orange-400 shrink-0 mt-0.5">{(m.user || 'Viewer').split(' ')[0]}</span>
                  <span className="text-[11px] text-white/80 leading-relaxed">{m.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 pb-safe">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { sendChat(streamId, chatInput); setChatInput(''); } }}
                placeholder="Say something…"
                className="flex-1 bg-white/10 border border-white/15 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
              />
              <button onClick={() => { sendChat(streamId, chatInput); setChatInput(''); }}
                className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center">
                <Send size={14} className="text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 px-5 pb-safe pt-4">
        {/* Quick emotes — these burst ON the stream itself for everyone watching */}
        {!showChat && (
          <div className="flex items-center gap-2">
            {QUICK_EMOTES.map(e => (
              <button key={e} onClick={() => quickEmote(e)}
                className="w-11 h-11 rounded-full bg-black/50 backdrop-blur border border-white/15 text-[20px] flex items-center justify-center active:scale-125 transition-transform">
                {e}
              </button>
            ))}
          </div>
        )}
        {/* Action bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowChat(s => !s)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full border font-bold text-sm transition-all ${showChat ? 'bg-orange-500 border-orange-500 text-white' : 'bg-black/60 backdrop-blur border-white/20 text-white'}`}
          >
            <MessageCircle size={16} />
            Chat
            {chatMsgs.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{chatMsgs.length}</span>
            )}
          </button>
          <button onClick={toggleLike}
            className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${liked ? 'bg-red-500 border-red-500' : 'bg-black/60 backdrop-blur border-white/20'}`}>
            <Heart size={20} className={`${liked ? 'text-white fill-white' : 'text-white'}`} />
          </button>
          <button
            className="w-12 h-12 rounded-full bg-black/60 backdrop-blur border border-white/20 flex items-center justify-center"
            onClick={() => navigator.share?.({ title: title, url: window.location.href }).catch(() => {})}
          >
            <Share2 size={20} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile-optimized entry button for LiveHubView ────────────────────────────

export function MobileGoLiveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-400 active:scale-95 transition-all rounded-2xl font-black text-white text-sm shadow-[0_8px_24px_rgba(239,68,68,0.4)]"
    >
      <Radio size={16} className="animate-pulse" />
      Go Live
      <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-[9px]">Mobile</span>
    </button>
  );
}
