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
  LayoutGrid, Monitor, UserSquare2, Columns2, MonitorSmartphone,
} from 'lucide-react';
import { LiveComposer, type ComposerMode, LOOKS, type LookId } from '../services/liveComposer';
import { buildVTuberFromSheet } from '../services/vtuber/avatarFactory';
import { VoiceFX, VOICE_EFFECTS, type VoiceEffectId } from '../services/voiceFX';
import {
  auth, db, createPost, updatePost, deletePost, notifyFollowers, uploadVideo,
} from '../services/backendService';
import { unlockAchievementByTrigger } from '../services/achievementService';
import { publishLiveDiscovery, endLiveDiscovery, saveSessionRecording } from '../services/liveStreamService';
import { buildShareUrl } from '../services/deepLinkService';
import { useRtcSession } from '../hooks/useRtcSession';
import {
  doc, collection, addDoc, setDoc, updateDoc, increment, deleteDoc,
  query, orderBy, limit,
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
async function cropDemoFace(blob: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const ar = bmp.width / bmp.height;
    if (ar > 0.9 && ar < 1.15 && bmp.width >= 700) {
      const sx = Math.round(bmp.width * 0.785), sy = Math.round(bmp.height * 0.485);
      const sw = Math.round(bmp.width * 0.215), sh = Math.round(bmp.height * 0.29);
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      c.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
      bmp.close();
      const out = await new Promise<Blob | null>(r => c.toBlob(b => r(b), 'image/png'));
      if (out) return out;
    } else { bmp.close(); }
  } catch { /* fall through to the original */ }
  return blob;
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  // ── Camera modes: front · rear · both · screen+cam · screen+cut-out person ──
  // Composed modes route through a canvas mix that we publish in place of the raw
  // camera; switching among them is instant (no track swap). front/rear stay native
  // until the user picks an advanced mode, then everything runs through the composer.
  const composerRef = useRef<LiveComposer | null>(null);
  const composerPublishedRef = useRef(false);
  const [camMode, setCamMode] = useState<ComposerMode>('front');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
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
    setModeMenuOpen(false);
    if (modeBusy || mode === camMode) return;
    setModeBusy(true);
    try {
      if (!composerRef.current) composerRef.current = new LiveComposer(() => { applyMode('front'); });
      const comp = composerRef.current;
      // Publish the (initially black) canvas FIRST — this stops the raw camera the RTC
      // layer held, so the composer can open its own cameras without a device conflict.
      if (!composerPublishedRef.current) {
        const track = comp.getStream().getVideoTracks()[0];
        await rtc.publishExternalVideo(track);
        composerPublishedRef.current = true;
      }
      await comp.setMode(mode);
      setCamMode(mode);
      setMirror(false); // the canvas is already composited — no CSS mirror on top
      setCamOn(true);
    } catch (e: any) {
      alert(e?.message || 'Could not switch to that mode on this device.');
    } finally { setModeBusy(false); }
  };

  useEffect(() => () => { composerRef.current?.dispose(); composerRef.current = null; }, []);

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
    else alert("Couldn't load that LUT — only 3D .cube files (LUT_3D_SIZE) are supported.");
  };

  // VTuber — build a face-tracked avatar from an uploaded character sheet, then go live as it.
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const [avatarBuilt, setAvatarBuilt] = useState(false);
  const [avatarBuilding, setAvatarBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState('');
  const buildAvatarFromBlob = async (blob: Blob) => {
    if (!composerRef.current) composerRef.current = new LiveComposer(() => { applyMode('front'); });
    const desc = await buildVTuberFromSheet(blob, { path: 'PUPPET2D', onProgress: (s: string, p: number) => setBuildMsg(`${s} · ${Math.round(p * 100)}%`) });
    composerRef.current.setAvatar(desc);
    setAvatarBuilt(true);
    await applyMode('vtuber');
  };
  const buildAvatar = async (file?: File | null) => {
    if (!file) return;
    setAvatarBuilding(true); setBuildMsg('Building avatar…');
    try { await buildAvatarFromBlob(file); }
    catch (e: any) { alert(e?.message || 'Could not build that character into an avatar.'); }
    finally { setAvatarBuilding(false); }
  };
  // Built-in demo character so any user can test VTuber with one tap (no upload).
  const useDemoAvatar = async () => {
    setAvatarBuilding(true); setBuildMsg('Loading demo character…');
    try {
      const res = await fetch('/vtuber/demo-character.png');
      if (!res.ok) throw new Error('Demo character isn\'t available yet.');
      await buildAvatarFromBlob(await cropDemoFace(await res.blob()));
    } catch (e: any) { alert(e?.message || 'Could not load the demo character.'); }
    finally { setAvatarBuilding(false); }
  };

  // ── Media + peers now run on the unified rtcCore backbone (broadcast topology:
  //    this host publishes, viewers subscribe). The session is live from mount so
  //    the setup-screen preview works; viewers connect once they join. ──────────
  const rtc = useRtcSession({
    sessionId: streamId,
    topology: 'broadcast',
    role: 'host',
    media: { audio: true, video: { facingMode: facing } },
    displayName: auth.currentUser?.displayName || 'Creator',
  });

  // Preview ← backbone local stream.
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = rtc.localStream; }, [rtc.localStream]);
  // Surface capture errors in the existing permission UI.
  useEffect(() => { if (rtc.error) setPermError(rtc.error); }, [rtc.error]);
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
  }, [step, showChat]);

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
    rtc.startRecording();

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
      // The timeline post becomes the replay.
      if (postId) {
        await updatePost(postId, {
          text: `${finalTitle} — live stream replay`,
          isLiveNow: false,
          media: [{ type: 'VIDEO', url: video.url || '', id: video.id, title: finalTitle }],
        }).catch(() => {});
      }
      if (streamId) await updateDoc(doc(db, 'streams', streamId), { recordingVideoId: video.id }).catch(() => {});
      setSaving('done');
      setTimeout(onClose, 1200);
    } catch (e) {
      console.warn('[Live] save failed', e);
      setSaving('error');
    }
  };

  const discardRecording = async () => {
    // Stream not saved → the auto-post comes down too (no dead "live" posts).
    if (postId) await deletePost(postId).catch(() => {});
    recordedBlobRef.current = null;
    onClose();
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
        style={{ bottom: step === 'live' && showChat ? `${bottomH}px` : '0px', transform: mirror ? 'scaleX(-1)' : 'none' }}
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
            <p className="text-[9px] text-white/35 leading-relaxed">
              Going live posts to your timeline and notifies your followers. When you end,
              you choose to save the replay to Reello or delete it.
            </p>
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
              {/* Share */}
              <button onClick={shareStream}
                className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                {copied ? <Check size={16} className="text-green-400" /> : <Share2 size={16} className="text-white" />}
              </button>
            </div>
          </div>

          {/* Title overlay */}
          <div className="absolute left-4 right-4" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 52px)' }}>
            {title && (
              <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-1.5 inline-flex max-w-full">
                <p className="text-xs font-bold text-white truncate">{title}</p>
              </div>
            )}
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
              {/* Camera-mode popover */}
              {modeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
                  <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 z-20 w-[280px] rounded-2xl bg-[#141019]/95 backdrop-blur-xl border border-white/12 p-2 shadow-2xl">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-2 pt-1 pb-2">Camera mode</p>
                    {([
                      { id: 'front', label: 'Front camera', icon: <UserSquare2 size={17} />, on: true },
                      { id: 'rear', label: 'Rear camera', icon: <Camera size={17} />, on: true },
                      { id: 'both', label: 'Both cameras', icon: <Columns2 size={17} />, on: true },
                      { id: 'screen-pip', label: 'Screen + camera', icon: <MonitorSmartphone size={17} />, on: canScreen },
                      { id: 'screen-mask', label: 'Screen + cut-out you', icon: <Monitor size={17} />, on: canScreen },
                    ] as { id: ComposerMode; label: string; icon: JSX.Element; on: boolean }[]).map(m => (
                      <button key={m.id} disabled={!m.on || modeBusy} onClick={() => applyMode(m.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${camMode === m.id ? 'bg-orange-500/20' : 'hover:bg-white/[0.06]'} disabled:opacity-35`}>
                        <span className={camMode === m.id ? 'text-orange-400' : 'text-white/70'}>{m.icon}</span>
                        <span className="flex-1 text-[13px] font-bold text-white">{m.label}</span>
                        {!m.on && <span className="text-[8px] font-black uppercase tracking-wider text-white/30">Desktop</span>}
                        {camMode === m.id && m.on && <Check size={15} className="text-orange-400" />}
                      </button>
                    ))}
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-2 pb-2">Look · color grade</p>
                      <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                        {LOOKS.map(l => (
                          <button key={l.id} onClick={() => applyLook(l.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${lookId === l.id ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/12'}`}>
                            {l.label}
                          </button>
                        ))}
                        <button onClick={() => cubeInputRef.current?.click()}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${lookId === 'custom' ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/12'}`}>
                          + .cube LUT
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-2 pb-2">VTuber avatar</p>
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {avatarBuilt && (
                          <button onClick={() => applyMode('vtuber')}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${camMode === 'vtuber' ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/12'}`}>
                            Go live as avatar
                          </button>
                        )}
                        <button onClick={useDemoAvatar} disabled={avatarBuilding}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-[#6B0099] to-[#FF8C00] text-white disabled:opacity-50">
                          {avatarBuilding ? (buildMsg || 'Loading…') : '✨ Try demo avatar'}
                        </button>
                        <button onClick={() => sheetInputRef.current?.click()} disabled={avatarBuilding}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/[0.06] text-white/80 hover:bg-white/12 disabled:opacity-50">
                          {avatarBuilt ? 'Change character' : 'Upload your own'}
                        </button>
                      </div>
                      <p className="text-[9px] text-white/30 px-2 pt-1.5 leading-snug">Tap the demo, or upload a character drawing — your face drives it live, on-device.</p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-2 pb-2">Voice changer</p>
                      <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                        {VOICE_EFFECTS.map(v => (
                          <button key={v.id} onClick={() => applyVoiceEffect(v.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${voiceId === v.id ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/12'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
              <input ref={cubeInputRef} type="file" accept=".cube" className="hidden"
                onChange={e => { uploadCube(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              <input ref={sheetInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { buildAvatar(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              {/* Camera / mic device picker */}
              {deviceMenu !== 'none' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDeviceMenu('none')} />
                  <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 z-20 w-[290px] rounded-2xl bg-[#141019]/95 backdrop-blur-xl border border-white/12 p-2 shadow-2xl max-h-[48vh] overflow-y-auto">
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
              <button onClick={() => setShowChat(s => !s)}
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
              <button onClick={() => setModeMenuOpen(o => !o)}
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
                  <p className="text-[10px] text-red-400 text-center">Couldn't save the recording — you can retry or delete.</p>
                )}
                <button onClick={saveRecording}
                  className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-95 transition-all font-black text-white text-sm flex items-center justify-center gap-2">
                  <Save size={16} /> Save replay to Reello
                </button>
                <p className="text-[9px] text-white/30 text-center leading-relaxed">
                  Saving keeps the recording on your Reello page and turns your live post into the replay.
                </p>
                <button onClick={discardRecording}
                  className="w-full py-3.5 rounded-2xl bg-white/[0.06] border border-white/10 hover:bg-red-500/15 hover:border-red-500/30 active:scale-95 transition-all font-bold text-white/60 hover:text-red-300 text-sm flex items-center justify-center gap-2">
                  <Trash2 size={15} /> Delete stream
                </button>
              </div>
            )}
          </div>
        </motion.div>
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMsgs = useLiveChat(streamId);

  // Watch via the unified rtcCore backbone (broadcast viewer — subscribe only).
  const rtc = useRtcSession({
    sessionId: streamId,
    topology: 'broadcast',
    role: 'viewer',
    media: { audio: false, video: false },
  });

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  // Stream metadata (title / live / counts) still lives on the streams doc.
  useEffect(() => {
    return onSnapshot(doc(db, 'streams', streamId), snap => {
      const data = snap.data();
      if (data) {
        setViewerCount(data.viewerCount ?? 0);
        setLikeCount(data.likeCount ?? 0);
        setStreamLive(data.isLive !== false);
      }
    });
  }, [streamId]);

  // Count this view once (broadcaster mirrors live count from rtc participants).
  useEffect(() => {
    updateDoc(doc(db, 'streams', streamId), { totalViews: increment(1) }).catch(() => {});
  }, [streamId]);

  // Attach the broadcaster's stream the moment it arrives.
  useEffect(() => {
    const first = rtc.remoteStreams.values().next().value as MediaStream | undefined;
    if (videoRef.current && first) {
      videoRef.current.srcObject = first;
      setConnected(true);
      setConnecting(false);
    }
  }, [rtc.remoteStreams]);

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

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

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
        {/* Reactions */}
        {!showChat && (
          <div className="flex items-center gap-3">
            {['❤️', '🔥', '😂', '👏', '💯'].map(e => (
              <button key={e} onClick={() => addReaction(e)} className="text-2xl active:scale-125 transition-transform">
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
