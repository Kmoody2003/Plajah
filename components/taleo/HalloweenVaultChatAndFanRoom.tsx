import { UserAvatar } from '../avatar/UserAvatar';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Ghost,
  Flame,
  Send,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Camera,
  Sparkles,
  Users,
  MessageSquare,
  BarChart3,
  Flashlight,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  Play,
  Film,
  Check,
  Radio,
  Eye,
  Compass,
} from 'lucide-react';
import { db, auth, joinClubTeam } from '../../services/backendService';
import { storage } from '../../services/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  arrayUnion,
} from 'firebase/firestore';
import { onSnapshot } from '../../services/safeSnapshot';
import {
  HalloweenFilterEngine,
  HALLOWEEN_FILTERS,
  type HalloweenFilterId,
} from '../../services/halloween/halloweenFilterEngine';
import { halloweenAudio } from '../../services/halloween/halloweenAudioSfx';
import { StoryIntelVTuberVoiceStudio } from './StoryIntelVTuberVoiceStudio';
import { FaceSwapLink } from '../../services/faceswap/faceSwapLink';
import { CastFaceOverlay } from '../../services/halloween/castFaceOverlay';
import { CAST_EMOTES, type CastEmoteId } from '../../services/halloween/ravencrestCastStage';
import { PoseTracker, type PoseFrame } from '../../services/vtuber/poseTracker';
import { AsyncPoseTracker } from '../../services/vtuber/poseTrackerAsync';
import { ClipRecorder } from './ClipRecorder';
import { PUMPKIN_PATCH_CLUB_ID, openClubRoom, teamRoomFor } from '../../services/halloween/pumpkinPatchClub';
import {
  STORY_INTEL_VTUBER_CHARACTERS,
  loadCreatorCharacterPolicy,
} from '../../services/halloween/storyIntelCharacterRigAndVoiceEngine';

// The fan room is chat, live video and the social side for now: the separate 3D movie character
// studio is switched off (the live-video character picker stays). Flip to bring it back.
const FAN_ROOM_CHARACTER_STUDIO = false;

export interface HalloweenFaction {
  id: string;
  name: string;
  shortName: string;
  emoji: string;
  color: string;
  leader: string;
  portraitUrl: string;
}

export const HALLOWEEN_FACTIONS: HalloweenFaction[] = [
  {
    id: 'district13',
    name: 'District 13 Vigilantes',
    shortName: 'Pumpkin Patch',
    emoji: '🎃',
    color: '#F97316',
    leader: 'Melvin Lester ("Pumpkin Patch")',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg',
  },
  {
    id: 'greencastle',
    name: 'Green Castle Army',
    shortName: 'Miriam’s Army',
    emoji: '🧙‍♀️',
    color: '#10B981',
    leader: 'Wicked Witch Miriam',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_3_portrait.jpg',
  },
  {
    id: 'bloodline',
    name: 'Order of Orlok & Tepes',
    shortName: 'Vampire Court',
    emoji: '🧛',
    color: '#EF4444',
    leader: 'President Tepes & Count Orlok',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_7_portrait.jpg',
  },
  {
    id: 'farmhouse',
    name: '1968 Farmhouse Survivors',
    shortName: 'Night Crew',
    emoji: '🧟',
    color: '#84CC16',
    leader: 'Ben (Night of the Living Dead)',
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_4_portrait.jpg',
  },
  {
    id: 'specters',
    name: 'Saltair Pavilion Specters',
    shortName: 'Lil’ Boo Ghost Club',
    emoji: '👻',
    color: '#A855F7',
    leader: "Lil' Boo & Mary Henry",
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_6_portrait.jpg',
  },
];

export interface HalloweenVaultChatMessage {
  id: string;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  factionId: string;
  activeFilter: HalloweenFilterId;
  dimLightsOn?: boolean;
  text: string;
  snapshotDataUrl?: string;
  /** Recorded clip (Firebase Storage download URL), up to 30 s. */
  videoUrl?: string;
  fxTrigger?: 'BATS' | 'GHOST' | 'JACK' | 'DIM';
  at: number;
}

/** Only our own storage bucket's download URLs are played back in chat. */
const isStorageVideoUrl = (u?: string) => !!u && u.startsWith('https://firebasestorage.googleapis.com/');

export interface HalloweenVaultPoll {
  id: string;
  question: string;
  subtitle: string;
  options: { label: string; emoji: string; factionTag?: string }[];
  votes: Record<number, string[]>; // optionIndex -> array of uids
}

const newChatMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Segmentation: while a 3D character is on, the performer's real body (MediaPipe person mask) is
// blurred and darkened so the character replaces them instead of being pasted on top.
let segMaskCanvas: HTMLCanvasElement | null = null;
let segTmpCanvas: HTMLCanvasElement | null = null;
function dimPerson(
  ctx: CanvasRenderingContext2D,
  frame: CanvasImageSource,
  mask: { data: Float32Array; w: number; h: number },
  place: (c: CanvasRenderingContext2D) => void,
  W: number,
  H: number
) {
  segMaskCanvas ??= document.createElement('canvas');
  segTmpCanvas ??= document.createElement('canvas');
  const mc = segMaskCanvas;
  if (mc.width !== mask.w || mc.height !== mask.h) {
    mc.width = mask.w;
    mc.height = mask.h;
  }
  const mctx = mc.getContext('2d')!;
  const img = mctx.createImageData(mask.w, mask.h);
  for (let i = 0; i < mask.data.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.min(255, mask.data[i] * 320);
  }
  mctx.putImageData(img, 0, 0);
  const tc = segTmpCanvas;
  if (tc.width !== W || tc.height !== H) {
    tc.width = W;
    tc.height = H;
  }
  const t = tc.getContext('2d')!;
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, W, H);
  t.save();
  t.filter = 'blur(14px) brightness(0.28) saturate(0.5)';
  place(t);
  t.drawImage(frame, 0, 0);
  t.restore();
  // Keep only the person, softened at the edge.
  t.save();
  t.globalCompositeOperation = 'destination-in';
  t.filter = 'blur(6px)';
  place(t);
  // Stretch the mask over the frame (it may be at a different resolution than the frame).
  t.drawImage(mc, 0, 0, (frame as HTMLVideoElement).videoWidth || (frame as HTMLCanvasElement).width, (frame as HTMLVideoElement).videoHeight || (frame as HTMLCanvasElement).height);
  t.restore();
  ctx.drawImage(tc, 0, 0);
}

const STORAGE_CHAT_KEY = 'plajah:halloween:vaultChat:v1';
const STORAGE_POLLS_KEY = 'plajah:halloween:vaultPolls:v1';
const STORAGE_FACTION_KEY = 'plajah:halloween:vaultFaction:v1';
const STORAGE_FILTER_KEY = 'plajah:halloween:filterState:v1';

const SEEDED_POLLS: HalloweenVaultPoll[] = [
  {
    id: 'poll_pumpkin_mvp',
    question: 'Who steals the show in "Pumpkin Patch" (2025)?',
    subtitle: 'Planet Ween Universe · District 13 Showdown',
    options: [
      { label: 'Melvin Lester ("Pumpkin Patch") & Dual Plasma Blades', emoji: '🎃', factionTag: 'district13' },
      { label: 'Wicked Witch Miriam & Flying Monkey Squadron', emoji: '🧙‍♀️', factionTag: 'greencastle' },
      { label: 'Stitch (The Scarecrow) on the District 13 Rooftops', emoji: '🌾', factionTag: 'farmhouse' },
      { label: "Lil' Boo (Ectoplasmic Jar Sidekick)", emoji: '👻', factionTag: 'specters' },
    ],
    votes: {
      0: ['u_1', 'u_2', 'u_3', 'u_4', 'u_5'],
      1: ['u_6', 'u_7', 'u_8'],
      2: ['u_9', 'u_10'],
      3: ['u_11', 'u_12', 'u_13', 'u_14'],
    },
  },
  {
    id: 'poll_double_feature',
    question: 'Which Halloween Vault Double Feature are we streaming tonight at midnight?',
    subtitle: 'Vote to lock the Fan Room Watch-Party queue',
    options: [
      { label: 'Pumpkin Patch (2025) + Night of the Living Dead (1968)', emoji: '🧟', factionTag: 'district13' },
      { label: 'The Housemaid (1960) + Carnival of Souls (1962)', emoji: '🎹', factionTag: 'specters' },
      { label: 'Nosferatu (1922) + The Phantom of the Opera (1925)', emoji: '🧛', factionTag: 'bloodline' },
      { label: 'House on Haunted Hill (1959) + Häxan (1922)', emoji: '🏰', factionTag: 'greencastle' },
    ],
    votes: {
      0: ['u_1', 'u_3', 'u_5', 'u_8', 'u_11'],
      1: ['u_2', 'u_6', 'u_12'],
      2: ['u_4', 'u_7', 'u_9', 'u_13'],
      3: ['u_10', 'u_14'],
    },
  },
  {
    id: 'poll_best_filter',
    question: 'Which Halloween Live Camera Face Filter hits hardest with "Dim the Lights" on?',
    subtitle: 'Try them live in the Camera Booth on the left!',
    options: [
      { label: "Carved Jack-o'-Lantern Talking Head", emoji: '🎃' },
      { label: 'Ghost Face Elongated Scream Phantom', emoji: '👻' },
      { label: 'Full-Moon Werewolf + Snapping Fangs', emoji: '🐺' },
      { label: 'Necrotic Zombie / Count Vampire', emoji: '🧛' },
    ],
    votes: {
      0: ['u_1', 'u_2', 'u_4', 'u_9'],
      1: ['u_3', 'u_7', 'u_11'],
      2: ['u_5', 'u_8', 'u_12'],
      3: ['u_6', 'u_10', 'u_13'],
    },
  },
];

interface HalloweenVaultChatAndFanRoomProps {
  onOpenHauntedExhibition: () => void;
  onPlayFilmById?: (filmId: string) => void;
}

export const HalloweenVaultChatAndFanRoom: React.FC<HalloweenVaultChatAndFanRoomProps> = ({
  onOpenHauntedExhibition,
  onPlayFilmById,
}) => {
  // ── Persistent Filter & Dim-the-Lights State ──
  const [selectedFilter, setSelectedFilter] = useState<HalloweenFilterId>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_FILTER_KEY) || '{}');
      return saved.filter || 'jackolantern';
    } catch {
      return 'jackolantern';
    }
  });
  const [dimLightsMode, setDimLightsMode] = useState<boolean>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_FILTER_KEY) || '{}');
      return saved.dimLights ?? true;
    } catch {
      return true;
    }
  });
  const [batSwarmOverlay, setBatSwarmOverlay] = useState<boolean>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_FILTER_KEY) || '{}');
      return saved.batSwarm ?? true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_FILTER_KEY,
        JSON.stringify({
          filter: selectedFilter,
          dimLights: dimLightsMode,
          batSwarm: batSwarmOverlay,
        })
      );
    } catch {
      /* ignore */
    }
  }, [selectedFilter, dimLightsMode, batSwarmOverlay]);

  // ── Camera / Simulated Talking Head State ──
  const [cameraSource, setCameraSource] = useState<'SIMULATED' | 'WEBCAM'>('SIMULATED');
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState<boolean>(true);
  const [simulatedTalkingBurst, setSimulatedTalkingBurst] = useState<boolean>(true);
  const [sfxMuted, setSfxMuted] = useState<boolean>(false);

  // ── Persistent Faction, Chat & Polls State ──
  const [myFactionId, setMyFactionId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_FACTION_KEY) || 'district13';
    } catch {
      return 'district13';
    }
  });

  // Real messages only. Older builds shipped demo messages (ids `seed_*`) and cached them in each
  // browser, so those are dropped from the cache on load.
  const [messages, setMessages] = useState<HalloweenVaultChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CHAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((m: HalloweenVaultChatMessage) => !String(m?.id).startsWith('seed_'));
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  const [polls, setPolls] = useState<HalloweenVaultPoll[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_POLLS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return SEEDED_POLLS;
  });

  const [activeRightTab, setActiveRightTab] = useState<'CHAT' | 'POLLS' | 'FACTIONS'>('CHAT');
  // Phones show one half of the room at a time (lg+ shows both columns side by side).
  const [phonePane, setPhonePane] = useState<'BOOTH' | 'CHAT'>('BOOTH');
  const [chatDraft, setChatDraft] = useState('');
  const [roomFxOverlay, setRoomFxOverlay] = useState<'BATS' | 'GHOST' | 'JACK' | null>(null);
  const [floatingWidgetOpen, setFloatingWidgetOpen] = useState<boolean>(false);
  // While the room itself is on screen the floating pill only duplicates it (and covers it on phones).
  const roomSectionRef = useRef<HTMLElement | null>(null);
  const [roomInView, setRoomInView] = useState(false);
  useEffect(() => {
    const el = roomSectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setRoomInView(entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<HalloweenFilterEngine | null>(null);
  // The 30fps render loop below is mounted once, so it reads camera state through refs.
  const cameraSourceRef = useRef(cameraSource);
  cameraSourceRef.current = cameraSource;
  const talkingBurstRef = useRef(simulatedTalkingBurst);
  talkingBurstRef.current = simulatedTalkingBurst;

  // ── Character face swap (internal: only appears when the local facelab sidecar is running) ──
  const swapLinkRef = useRef<FaceSwapLink | null>(null);
  const [swapAvailable, setSwapAvailable] = useState(false);
  const [swapFaces, setSwapFaces] = useState<Record<string, number>>({});
  const [swapCharacterId, setSwapCharacterId] = useState<string | null>(null);
  const swapActiveRef = useRef(false);
  swapActiveRef.current = !!swapCharacterId;
  const [swapError, setSwapError] = useState<string | null>(null);
  const swapCharacters = useMemo(() => {
    const policy = loadCreatorCharacterPolicy();
    return STORY_INTEL_VTUBER_CHARACTERS.filter(
      (c) => policy.characters[c.id]?.allowVTuberFaceMapping !== false
    );
  }, []);
  // ── Become a Ravencrest character: the 3D model is drawn over your tracked face ──
  const [castCharacterId, setCastCharacterId] = useState<string | null>(null);
  const [castLoading, setCastLoading] = useState(false);
  const castOverlayRef = useRef<CastFaceOverlay | null>(null);
  const castActiveRef = useRef(false);
  castActiveRef.current = !!castCharacterId;
  // Full-body tracking for the 3D characters (MediaPipe pose, loaded on first use).
  // Worker first (30 Hz, off the main thread); the blocking tracker only if workers can't run it.
  const poseTrackerRef = useRef<{ state: 'loading' | 'ready' | 'failed'; async?: AsyncPoseTracker; sync?: PoseTracker } | null>(null);
  /** Latest person mask: the real body is dimmed behind the 3D character (segmentation). */
  const personMaskRef = useRef<PoseFrame['mask'] | null>(null);
  const castCharacter = useMemo(
    () => swapCharacters.find((c) => c.id === castCharacterId) ?? null,
    [swapCharacters, castCharacterId]
  );

  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const portraitImgRef = useRef<HTMLImageElement | null>(null);

  const myUid = useMemo(() => {
    if (auth.currentUser?.uid) return auth.currentUser.uid;
    try {
      let guest = localStorage.getItem('plajah:halloween:guestUid');
      if (!guest) {
        guest = `guest_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem('plajah:halloween:guestUid', guest);
      }
      return guest;
    } catch {
      return 'guest_halloween';
    }
  }, []);

  const myDisplayName = auth.currentUser?.displayName || 'NightVaultFan';
  // Only signed-in (non-guest) accounts can post; guests read along.
  const canChat = !!auth.currentUser && !auth.currentUser.isAnonymous;
  const myFaction = useMemo(
    () => HALLOWEEN_FACTIONS.find((f) => f.id === myFactionId) || HALLOWEEN_FACTIONS[0],
    [myFactionId]
  );

  // Preload character portrait for simulated talking head backdrop
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/generated/comics/pumpkin_patch_v4/char_2_portrait.jpg';
    portraitImgRef.current = img;
  }, []);

  // Persist faction, messages, polls to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FACTION_KEY, myFactionId);
    } catch {
      /* ignore */
    }
  }, [myFactionId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(messages.slice(-80)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_POLLS_KEY, JSON.stringify(polls));
    } catch {
      /* ignore */
    }
  }, [polls]);

  // Firestore real-time subscription for persistent multi-user Halloween Vault chat
  useEffect(() => {
    try {
      const chatQ = query(
        collection(db, 'halloweenVaultRooms', 'main_vault', 'chat'),
        orderBy('at', 'desc'),
        limit(50)
      );
      const unsub = onSnapshot(
        chatQ,
        (snap) => {
          if (snap.empty) return;
          const remoteMsgs = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) } as HalloweenVaultChatMessage))
            .reverse();
          setMessages((prev) => {
            const byId = new Map<string, HalloweenVaultChatMessage>();
            for (const m of [...prev, ...remoteMsgs]) {
              byId.set(m.id, m);
            }
            return Array.from(byId.values()).sort((a, b) => a.at - b.at).slice(-80);
          });
        },
        () => {}
      );
      return () => unsub();
    } catch {
      return;
    }
  }, []);

  // Initialize HalloweenFilterEngine and run 30fps live render loop
  useEffect(() => {
    // Expressions on: 3D characters copy the performer's mouth, brows and blinks.
    const engine = new HalloweenFilterEngine({ expressions: true });
    engine.setMirrored(true); // the booth draws the webcam as a selfie view
    engine.setFilter(selectedFilter);
    engine.setDimLights(dimLightsMode);
    engine.setBatSwarm(batSwarmOverlay);
    engineRef.current = engine;
    if (import.meta.env.DEV) (window as any).__halloweenFilterEngine = engine;

    let raf = 0;
    let lastFrame = 0;
    let lastPoseMs = -1e9;
    let lastPoseTs = -1;

    const renderTick = (nowMs: number) => {
      raf = requestAnimationFrame(renderTick);
      if (nowMs - lastFrame < 31) return; // ~30 fps
      lastFrame = nowMs;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = 640;
      const H = 360;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      const tSec = nowMs / 1000;
      const videoEl = videoRef.current;
      const hasLiveWebcam =
        cameraSourceRef.current === 'WEBCAM' &&
        videoEl &&
        videoEl.readyState >= 2 &&
        videoEl.videoWidth > 0;

      if (hasLiveWebcam && videoEl) {
        // Character swap: send this frame to the GPU sidecar, draw the newest swapped frame
        // (falls back to the raw camera if the sidecar stalls for more than half a second).
        const link = swapLinkRef.current;
        let frame: CanvasImageSource = videoEl;
        let fw = videoEl.videoWidth;
        let fh = videoEl.videoHeight;
        if (swapActiveRef.current && link?.connected) {
          link.pushFrame(videoEl);
          if (link.latest && nowMs - link.latestAt < 500) {
            frame = link.latest;
            fw = link.latest.width;
            fh = link.latest.height;
          }
        }
        // Draw mirrored webcam feed
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        const s = Math.max(W / fw, H / fh);
        const dw = fw * s;
        const dh = fh * s;
        ctx.drawImage(frame, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.restore();
        const mask = castActiveRef.current ? personMaskRef.current : null;
        if (mask) {
          // Same mirrored cover placement for the frame and its mask (the mask is in video pixels).
          dimPerson(ctx, frame, mask, (c) => {
            c.translate(W, 0);
            c.scale(-1, 1);
            c.translate((W - dw) / 2, (H - dh) / 2);
            c.scale(dw / fw, dh / fh);
          }, W, H);
        }
      } else {
        // Draw atmospheric simulated studio talking-head feed so any user can test all filters immediately
        drawSimulatedStudioTalkingHead(ctx, W, H, tSec, talkingBurstRef.current);
      }

      // Drive synthetic audio level when simulated talking burst is active
      if (!hasLiveWebcam && talkingBurstRef.current) {
        const wave =
          0.35 +
          0.55 *
            Math.max(0, Math.sin(tSec * 7.8) * Math.cos(tSec * 4.3) + 0.35 * Math.sin(tSec * 13.1));
        engine.setAudioLevel(wave);
      }

      // Full-body tracking drives the 3D character's arms and torso (full model, 3D world
      // landmarks + the person mask), in a worker at camera rate; the rig filters between results.
      const overlay = castOverlayRef.current;
      if (overlay && castActiveRef.current) {
        const pt = poseTrackerRef.current;
        const applyPose = (fr: PoseFrame | null) => {
          overlay.setBodyPose(fr?.world ? { world: fr.world } : null);
          if (fr?.mask) personMaskRef.current = fr.mask;
        };
        if (!hasLiveWebcam || !videoEl) {
          overlay.setBodyPose(null);
          personMaskRef.current = null;
        } else if (!pt) {
          const p: NonNullable<typeof poseTrackerRef.current> = { state: 'loading' };
          poseTrackerRef.current = p;
          const opts = { full: true, segmentation: true };
          const a = new AsyncPoseTracker();
          void a.init(opts).then(async (ok) => {
            if (ok) {
              p.async = a;
              p.state = 'ready';
              return;
            }
            const s = new PoseTracker();
            if (await s.init(opts)) {
              p.sync = s;
              p.state = 'ready';
            } else p.state = 'failed';
          });
        } else if (pt.state === 'ready' && pt.async) {
          if (nowMs - lastPoseMs >= 30) {
            lastPoseMs = nowMs;
            lastPoseTs = Math.max(lastPoseTs + 1, Math.round(nowMs));
            pt.async.send(videoEl, lastPoseTs);
          }
          const r = pt.async.poll();
          if (r.fresh) applyPose(r.frame);
        } else if (pt.state === 'ready' && pt.sync && nowMs - lastPoseMs >= 80) {
          lastPoseMs = nowMs;
          lastPoseTs = Math.max(lastPoseTs + 1, Math.round(nowMs));
          applyPose(pt.sync.detect(videoEl, lastPoseTs));
        }
      } else {
        personMaskRef.current = null;
      }

      // Apply the realistic Halloween face filter, bat swarm & Dim-the-Lights found-footage beam!
      engine.apply(ctx, canvas, hasLiveWebcam ? videoEl : null, nowMs);

      // Mirror onto the persistent floating mini-drawer canvas if open
      const mini = miniCanvasRef.current;
      if (mini) {
        if (mini.width !== 320 || mini.height !== 180) {
          mini.width = 320;
          mini.height = 180;
        }
        const mctx = mini.getContext('2d');
        if (mctx) mctx.drawImage(canvas, 0, 0, 320, 180);
      }
    };

    raf = requestAnimationFrame(renderTick);
    return () => {
      cancelAnimationFrame(raf);
      poseTrackerRef.current?.async?.dispose();
      poseTrackerRef.current?.sync?.dispose();
      poseTrackerRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync filter changes into the active engine instance
  useEffect(() => {
    engineRef.current?.setFilter(selectedFilter);
  }, [selectedFilter]);

  useEffect(() => {
    engineRef.current?.setDimLights(dimLightsMode);
  }, [dimLightsMode]);

  useEffect(() => {
    engineRef.current?.setBatSwarm(batSwarmOverlay);
  }, [batSwarmOverlay]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!castCharacter) {
      engine?.setFaceLayer(null);
      void castOverlayRef.current?.setCharacter(null);
      return;
    }
    const overlay = (castOverlayRef.current ??= new CastFaceOverlay());
    setCastLoading(true);
    overlay
      .setCharacter(castCharacter.vtuberModelUrl ?? castCharacter.glbModelUrl)
      .then(() => engineRef.current?.setFaceLayer(overlay.draw))
      .catch(() => setCastCharacterId(null))
      .finally(() => setCastLoading(false));
  }, [castCharacter]);

  useEffect(() => () => castOverlayRef.current?.dispose(), []);

  useEffect(() => {
    if (!simulatedTalkingBurst && cameraSource === 'SIMULATED') {
      engineRef.current?.setAudioLevel(0);
    }
  }, [simulatedTalkingBurst, cameraSource]);

  // Webcam & Microphone audio level analyzer
  const startLiveWebcam = async () => {
    setWebcamError(null);
    try {
      const video = { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' };
      // The mic only drives the talking jaw: a missing or blocked mic must not cost the camera.
      const stream = await navigator.mediaDevices
        .getUserMedia({ video, audio: true })
        .catch(() => navigator.mediaDevices.getUserMedia({ video, audio: false }));
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraSource('WEBCAM');

      // Hook microphone RMS to jaw openness
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC && stream.getAudioTracks().length > 0) {
          const actx = new AC();
          const source = actx.createMediaStreamSource(stream);
          const analyser = actx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const buf = new Uint8Array(analyser.frequencyBinCount);
          const pollMic = () => {
            if (streamRef.current !== stream) {
              void actx.close().catch(() => {});
              return;
            }
            analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 2; i < 36; i++) sum += buf[i];
            const avg = sum / (34 * 255);
            engineRef.current?.setAudioLevel(Math.min(1, avg * 2.8));
            requestAnimationFrame(pollMic);
          };
          requestAnimationFrame(pollMic);
        }
      } catch {
        /* ignore audio analyzer fallback */
      }
    } catch (err: any) {
      setWebcamError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission declined — running on Simulated Talking-Head Studio so you can still test all filters!'
          : 'No webcam detected — running on Simulated Talking-Head Studio so you can test all filters!'
      );
      setCameraSource('SIMULATED');
    }
  };

  const stopLiveWebcam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraSource('SIMULATED');
  };

  // Probe for the local face-swap sidecar once; without it the swap panel never renders.
  useEffect(() => {
    let cancelled = false;
    const link = new FaceSwapLink();
    void link.connect().then(async (ok) => {
      if (cancelled || !ok) {
        link.close();
        return;
      }
      swapLinkRef.current = link;
      setSwapAvailable(true);
      const faces = await link.scan(swapCharacters.map((c) => c.portraitUrl));
      if (!cancelled) setSwapFaces(faces);
    });
    return () => {
      cancelled = true;
      link.close();
      swapLinkRef.current = null;
    };
  }, [swapCharacters]);

  const chooseSwapCharacter = async (characterId: string | null) => {
    const link = swapLinkRef.current;
    if (!link) return;
    setSwapError(null);
    if (!characterId) {
      await link.clearSource();
      setSwapCharacterId(null);
      return;
    }
    const character = swapCharacters.find((c) => c.id === characterId);
    if (!character) return;
    const r = await link.setSource(character.portraitUrl);
    if (!r.ok) {
      setSwapError(r.error || 'Could not load that character face');
      return;
    }
    setSwapCharacterId(characterId);
    // The swapped face is the costume; the drawn Halloween masks would cover it.
    setSelectedFilter('none');
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** Picking a team also puts a signed-in fan in that team's room of the official Pumpkin Patch Club. */
  const chooseTeam = (teamId: string) => {
    setMyFactionId(teamId);
    if (canChat) void joinClubTeam(PUMPKIN_PATCH_CLUB_ID, teamId).catch(() => {});
  };

  const triggerRoomFx = (fx: 'BATS' | 'GHOST' | 'JACK') => {
    setRoomFxOverlay(fx);
    if (fx === 'BATS') halloweenAudio.playBatSwarmSfx();
    else if (fx === 'GHOST') halloweenAudio.playGhostScreamSfx();
    else if (fx === 'JACK') halloweenAudio.playPlasmaBladesAppear();
    setTimeout(() => setRoomFxOverlay((prev) => (prev === fx ? null : prev)), 2800);
  };

  const handleSendMessage = async (opts?: {
    snapshotDataUrl?: string;
    videoUrl?: string;
    customText?: string;
    fxTrigger?: 'BATS' | 'GHOST' | 'JACK';
    id?: string;
  }) => {
    const text = (opts?.customText ?? chatDraft).trim();
    if (!text && !opts?.snapshotDataUrl && !opts?.videoUrl) return;
    if (!canChat) return;

    const newMsg: HalloweenVaultChatMessage = {
      id: opts?.id ?? newChatMessageId(),
      uid: myUid,
      displayName: myDisplayName,
      photoURL: auth.currentUser?.photoURL || null,
      factionId: myFactionId,
      activeFilter: selectedFilter,
      dimLightsOn: dimLightsMode,
      text:
        text ||
        `📸 Shared a live ${
          HALLOWEEN_FILTERS.find((f) => f.id === selectedFilter)?.shortLabel || 'Halloween'
        } ${dimLightsMode ? 'Found-Footage Night Beam ' : ''}snapshot!`,
      snapshotDataUrl: opts?.snapshotDataUrl,
      videoUrl: opts?.videoUrl,
      fxTrigger: opts?.fxTrigger,
      at: Date.now(),
    };

    setMessages((prev) => [...prev, newMsg]);
    if (!opts?.customText) setChatDraft('');
    if (opts?.fxTrigger) triggerRoomFx(opts.fxTrigger);

    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);

    try {
      // Same id locally and in Firestore, so the snapshot replaces the optimistic copy
      // instead of showing the message twice.
      await setDoc(doc(db, 'halloweenVaultRooms', 'main_vault', 'chat', newMsg.id), {
        uid: newMsg.uid,
        displayName: newMsg.displayName,
        photoURL: newMsg.photoURL || null,
        factionId: newMsg.factionId,
        activeFilter: newMsg.activeFilter,
        dimLightsOn: !!newMsg.dimLightsOn,
        text: newMsg.text,
        ...(newMsg.snapshotDataUrl ? { snapshotDataUrl: newMsg.snapshotDataUrl } : {}),
        ...(newMsg.videoUrl ? { videoUrl: newMsg.videoUrl } : {}),
        ...(newMsg.fxTrigger ? { fxTrigger: newMsg.fxTrigger } : {}),
        at: newMsg.at,
      });
    } catch {
      // Not saved: take it back off the screen and give the draft back.
      setMessages((prev) => prev.filter((m) => m.id !== newMsg.id));
      if (!opts?.customText && text) setChatDraft(text);
    }
  };

  /** Uploads a recorded clip to the poster's own storage folder and posts it to the room. */
  const postClipToChat = async (clip: Blob, mimeType: string, seconds: number, caption: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !canChat) throw new Error('Sign in to post clips');
    const id = newChatMessageId();
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = storageRef(storage, `posts/${uid}/halloween-vault/${id}.${ext}`);
    await uploadBytes(file, clip, { contentType: mimeType });
    const videoUrl = await getDownloadURL(file);
    setActiveRightTab('CHAT');
    await handleSendMessage({ id, videoUrl, customText: `🎬 ${caption} (${Math.round(seconds)}s)` });
  };

  const boothLookLabel = castCharacter
    ? `${castCharacter.emoji} as ${castCharacter.name}`
    : `${HALLOWEEN_FILTERS.find((f) => f.id === selectedFilter)?.icon || '🎃'} ${
        HALLOWEEN_FILTERS.find((f) => f.id === selectedFilter)?.label || 'Halloween'
      }`;

  const handleSnapFilteredPhotoToChat = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const filterMeta = HALLOWEEN_FILTERS.find((f) => f.id === selectedFilter);
      halloweenAudio.playFlashlightClick();
      void handleSendMessage({
        snapshotDataUrl: dataUrl,
        customText: castCharacter
          ? `${castCharacter.emoji} Checked into the Halloween Vault as ${castCharacter.name}!`
          : `${filterMeta?.icon || '🎃'} Checked into the Halloween Vault with the ${
              filterMeta?.label || 'Halloween'
            } filter${dimLightsMode ? ' + 🔦 Dim the Lights Found-Footage Beam' : ''}!`,
      });
    } catch {
      /* ignore */
    }
  };

  const handleVotePoll = async (pollId: string, optionIdx: number) => {
    setPolls((prev) =>
      prev.map((p) => {
        if (p.id !== pollId) return p;
        const nextVotes: Record<number, string[]> = {};
        for (const [k, arr] of Object.entries(p.votes)) {
          nextVotes[Number(k)] = (arr || []).filter((u) => u !== myUid);
        }
        nextVotes[optionIdx] = [...(nextVotes[optionIdx] || []), myUid];
        return { ...p, votes: nextVotes };
      })
    );
  };

  const activeFilterMeta =
    HALLOWEEN_FILTERS.find((f) => f.id === selectedFilter) || HALLOWEEN_FILTERS[1];

  return (
    <>
      {/* ── MAIN INLINE HALLOWEEN VAULT FAN ROOM & LIVE FILTER STUDIO ────────── */}
      <section ref={roomSectionRef} className="relative rounded-3xl overflow-hidden [overflow:clip] border-2 border-orange-500/35 bg-gradient-to-b from-[#170d08] via-[#0e0a0f] to-[#09080c] shadow-[0_25px_90px_rgba(249,115,22,0.18)] p-4 sm:p-8">
        {/* Decorative Halloween Cobweb & Ember Backdrop */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-orange-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" />

        {/* Room-Wide Triggered Halloween FX Overlay (Bat Swarm / Ghost Wail / Plasma Slash) */}
        <AnimatePresence>
          {roomFxOverlay && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-black/45 backdrop-blur-[2px]"
            >
              {roomFxOverlay === 'BATS' && (
                <div className="text-center space-y-2">
                  <motion.div
                    initial={{ scale: 0.5, y: 40 }}
                    animate={{ scale: [1, 1.35, 1.15], y: [-10, -50, -90] }}
                    transition={{ duration: 2.2 }}
                    className="text-6xl sm:text-7xl tracking-widest"
                  >
                    🦇 🦇 🦇 🦇 🦇
                  </motion.div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-purple-300 bg-black/80 px-4 py-1.5 rounded-full border border-purple-500/40">
                    Nocturnal Bat Colony Unleashed Across the Vault!
                  </p>
                </div>
              )}
              {roomFxOverlay === 'GHOST' && (
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: [0.9, 1.25, 1.05], opacity: [0, 1, 0] }}
                  transition={{ duration: 2.4 }}
                  className="text-center space-y-2"
                >
                  <div className="text-7xl">👻</div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200 bg-black/80 px-4 py-1.5 rounded-full border border-cyan-400/40">
                    Spectral Phantom Wail Echoes Through District 13!
                  </p>
                </motion.div>
              )}
              {roomFxOverlay === 'JACK' && (
                <motion.div
                  initial={{ scale: 0.8, rotate: -6 }}
                  animate={{ scale: [1, 1.2, 1], rotate: [-6, 6, 0] }}
                  transition={{ duration: 2.0 }}
                  className="text-center space-y-2"
                >
                  <div className="text-7xl drop-shadow-[0_0_30px_rgba(249,115,22,0.9)]">🎃⚔️🔥</div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-orange-300 bg-black/85 px-4 py-1.5 rounded-full border border-orange-500/50">
                    FSHHH-CRACKLE! Pumpkin Patch Dual Plasma Slash!
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Header Bar */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 sm:pb-6 border-b border-orange-500/20">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-orange-500 text-black text-[9px] font-black uppercase tracking-[0.22em] flex items-center gap-1.5 shadow-lg shadow-orange-500/25">
                <Radio size={11} className="animate-pulse" /> Live<span className="hidden sm:inline"> Persistent</span> Vault Room
              </span>
              <span className="hidden sm:inline px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[9px] font-black uppercase tracking-widest">
                🎃 Real-Time Face Filters + Found-Footage Dim-the-Lights
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                <Users size={11} className="text-orange-400" /> {24 + messages.length}<span className="hidden sm:inline"> Horror Fans</span> Online
              </span>
            </div>
            <h2 className="text-[1.65rem] leading-[1.05] sm:text-4xl font-black uppercase tracking-tight text-white">
              <span className="hidden sm:inline">Halloween Curation </span><span className="text-orange-400">Fan Room</span> &amp; Live Filter Chat
            </h2>
            <p className="text-[13px] sm:text-sm text-white/65 max-w-3xl leading-relaxed line-clamp-3 sm:line-clamp-none">
              Transform any talking head into a realistic <span className="text-orange-300 font-bold">Carved Jack-o’-Lantern</span>,{' '}
              <span className="text-slate-200 font-bold">Ghost Face</span>,{' '}
              <span className="text-lime-300 font-bold">Zombie</span>,{' '}
              <span className="text-amber-300 font-bold">Werewolf</span>, or{' '}
              <span className="text-red-400 font-bold">Vampire</span>, flip on{' '}
              <span className="text-emerald-300 font-bold">🔦 Dim the Lights</span> for night found-footage flashlight mode, and chat persistently with fellow horror fans.
            </p>
          </div>

          <div className="grid grid-cols-[1fr_auto] sm:flex items-center gap-2.5 sm:flex-wrap shrink-0">
            <button
              onClick={onOpenHauntedExhibition}
              className="h-11 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-orange-400 hover:brightness-110 text-black font-black text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all cursor-pointer"
            >
              <Compass size={15} className="hidden sm:block" /> 🏰 <span className="sm:hidden">Ravencrest</span><span className="hidden sm:inline">Explore Ravencrest</span>
            </button>
            <button
              onClick={() => {
                const next = !sfxMuted;
                setSfxMuted(next);
                halloweenAudio.setMuted(next);
              }}
              title={sfxMuted ? 'Unmute Halloween SFX' : 'Mute Halloween SFX'}
              className="h-11 px-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/75 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer"
            >
              {sfxMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-orange-400" />}
              {sfxMuted ? 'SFX Off' : 'SFX On'}
            </button>
          </div>
        </div>

        {/* Team / Faction Allegiance Strip */}
        <div className="relative z-10 py-3 sm:py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 sm:flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-orange-300">
              Your Halloween Team:
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
            {HALLOWEEN_FACTIONS.map((fac) => {
              const active = fac.id === myFactionId;
              return (
                <button
                  key={fac.id}
                  onClick={() => chooseTeam(fac.id)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border transition-all cursor-pointer ${
                    active
                      ? 'bg-orange-500/25 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white/65'
                  }`}
                >
                  <span>{fac.emoji}</span>
                  <span>{fac.shortName}</span>
                  {active && <Check size={11} className="text-orange-400" />}
                </button>
              );
            })}
            {teamRoomFor(myFactionId) && (
              <button
                onClick={() => openClubRoom(PUMPKIN_PATCH_CLUB_ID, teamRoomFor(myFactionId)!.channelId)}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-black cursor-pointer"
                title="Your team's room in the official Pumpkin Patch Club"
              >
                <Users size={11} /> Team room
              </button>
            )}
          </div>
        </div>

        {/* Main 2-Column Interactive Grid: Left = Live Camera & Halloween Face Filter Studio | Right = Persistent Chat & Fan Polls */}
        <div className="lg:hidden relative z-10 grid grid-cols-2 gap-1 p-1 mt-4 rounded-2xl bg-black/50 border border-white/10">
          {([
            ['BOOTH', '🎭 Filter Booth'],
            ['CHAT', `💬 Chat & Polls (${messages.length})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPhonePane(id)}
              className={`rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                phonePane === id ? 'bg-orange-500 text-black' : 'text-white/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 lg:pt-6">
          {/* ── LEFT COLUMN (7 cols): LIVE HALLOWEEN FILTER BOOTH & DIM-THE-LIGHTS CAM ── */}
          <div className={`lg:col-span-7 flex-col gap-4 ${phonePane === 'BOOTH' ? 'flex' : 'hidden lg:flex'}`}>
            {/* Live Filtered Video Canvas Viewport */}
            <div className="relative rounded-2xl overflow-hidden border-2 border-orange-500/40 bg-black sm:aspect-video shadow-2xl group">
              <video ref={videoRef} playsInline muted className="hidden" />
              <canvas
                ref={canvasRef}
                className="w-full aspect-video sm:aspect-auto sm:h-full object-cover block"
              />

              {/* Top-left Status Pills */}
              <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-orange-500/40 text-[9px] font-black uppercase tracking-widest text-orange-300 flex items-center gap-1.5">
                  {castCharacter ? (
                    <>
                      <span>{castCharacter.emoji}</span>
                      <span>{castLoading ? `Summoning ${castCharacter.shortName}…` : castCharacter.name}</span>
                    </>
                  ) : (
                    <>
                      <span>{activeFilterMeta.icon}</span>
                      <span>{activeFilterMeta.label}</span>
                    </>
                  )}
                </span>
                {dimLightsMode && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950/90 backdrop-blur-md border border-emerald-400/50 text-[9px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1">
                    <Flashlight size={11} /> <span className="sm:hidden">Night Beam</span><span className="hidden sm:inline">Dim the Lights · Found-Footage Beam</span>
                  </span>
                )}
                {batSwarmOverlay && (
                  <span className="px-2 py-1 rounded-lg bg-purple-950/85 border border-purple-400/40 text-[9px] font-black uppercase tracking-widest text-purple-200">
                    🦇 Bat Swarm Active
                  </span>
                )}
              </div>

              {/* Bottom Controls Overlay */}
              <div className="sm:absolute sm:bottom-3 sm:inset-x-3 p-2 sm:p-0 grid grid-cols-2 sm:flex items-center justify-between gap-2 sm:flex-wrap bg-black/70 sm:bg-transparent">
                <div className="contents sm:flex items-center gap-1.5 sm:flex-wrap">
                  {cameraSource === 'SIMULATED' ? (
                    <button
                      onClick={startLiveWebcam}
                      className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                    >
                      <Video size={13} /> <span className="sm:hidden">Webcam</span><span className="hidden sm:inline">Use My Live Webcam</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopLiveWebcam}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                    >
                      <VideoOff size={13} /> <span className="sm:hidden">Stop Cam</span><span className="hidden sm:inline">Switch to Simulated Talking Head</span>
                    </button>
                  )}

                  {cameraSource === 'SIMULATED' && (
                    <button
                      onClick={() => setSimulatedTalkingBurst((v) => !v)}
                      className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        simulatedTalkingBurst
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-black/75 border-white/20 text-white/70'
                      }`}
                    >
                      <Mic size={12} />
                      <span className="sm:hidden">{simulatedTalkingBurst ? 'Jaw On' : 'Jaw Off'}</span>
                      <span className="hidden sm:inline">{simulatedTalkingBurst ? 'Talking Jaw: Active' : 'Talking Jaw: Paused'}</span>
                    </button>
                  )}
                </div>

                <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5">
                  <button
                    onClick={handleSnapFilteredPhotoToChat}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-white/15 hover:bg-orange-500 hover:text-black backdrop-blur-md border border-white/25 text-white font-black text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Camera size={13} /> Snap &amp; Post to Chat
                  </button>
                </div>
              </div>
            </div>

            {webcamError && (
              <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 font-semibold">
                {webcamError}
              </div>
            )}

            {swapAvailable && (
              <div className="rounded-2xl bg-black/50 border border-fuchsia-500/30 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-300">
                    🎭 Character Face Swap · Internal
                  </span>
                  <span className="text-[10px] text-white/45">
                    Local GPU sidecar{cameraSource === 'WEBCAM' ? '' : ' · start your webcam to see it'}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  <button
                    onClick={() => void chooseSwapCharacter(null)}
                    className={`p-2 rounded-xl border text-[10px] font-black uppercase cursor-pointer ${
                      !swapCharacterId
                        ? 'bg-fuchsia-500 text-black border-fuchsia-300'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
                    }`}
                  >
                    Off
                  </button>
                  {swapCharacters.map((c) => {
                    const faces = swapFaces[c.portraitUrl];
                    const noFace = faces === 0;
                    const active = swapCharacterId === c.id;
                    return (
                      <button
                        key={c.id}
                        disabled={noFace}
                        title={noFace ? 'No human face the swap model can read' : c.name}
                        onClick={() => void chooseSwapCharacter(c.id)}
                        className={`rounded-xl border overflow-hidden text-left transition-all ${
                          active
                            ? 'border-fuchsia-300 shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                            : 'border-white/10 hover:border-white/30'
                        } ${noFace ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <img src={c.portraitUrl} alt="" className="w-full aspect-video object-cover" />
                        <p className="px-1.5 py-1 text-[9px] font-black uppercase truncate text-white">
                          {c.shortName}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {swapError && <p className="text-[11px] text-rose-300 font-semibold">{swapError}</p>}
              </div>
            )}

            {/* ── RAVENCREST 3D CHARACTERS: become one of the cast on camera ── */}
            <div className="rounded-2xl bg-black/50 border border-orange-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                  🧛 Become a 3D Movie Character
                </span>
                <span className="text-[10px] text-white/45">
                  Ravencrest cast · follows your head{cameraSource === 'WEBCAM' ? '' : ' · start your webcam to drive it'}
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                <button
                  onClick={() => setCastCharacterId(null)}
                  className={`rounded-xl border text-[10px] font-black uppercase cursor-pointer ${
                    !castCharacter
                      ? 'bg-orange-500 text-black border-orange-300'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
                  }`}
                >
                  Off
                </button>
                {swapCharacters.map((c) => {
                  const active = castCharacterId === c.id;
                  return (
                    <button
                      key={c.id}
                      title={c.name}
                      onClick={() => setCastCharacterId(c.id)}
                      className={`rounded-xl border overflow-hidden text-left transition-all cursor-pointer ${
                        active
                          ? 'border-orange-300 shadow-[0_0_18px_rgba(249,115,22,0.45)]'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <img src={c.portraitUrl} alt="" className="w-full aspect-[4/5] object-cover object-top" />
                      <p className="px-1.5 py-1 text-[9px] font-black uppercase truncate text-white">{c.shortName}</p>
                    </button>
                  );
                })}
              </div>
              {castCharacter && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    onClick={() => castOverlayRef.current?.recenter()}
                    title="Sit how you'll perform, look at the camera, then press to make that 'facing forward'"
                    className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-400 text-black text-[10px] font-black uppercase tracking-wide cursor-pointer"
                  >
                    🎯 Recenter
                  </button>
                  {CAST_EMOTES.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => castOverlayRef.current?.playEmote(e.id as CastEmoteId)}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-orange-500 hover:text-black border border-white/10 text-white text-[10px] font-black uppercase tracking-wide cursor-pointer"
                    >
                      {e.emoji} {e.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ClipRecorder
              getCanvas={() => canvasRef.current}
              canPost={canChat}
              filenameBase={`halloween-vault-${castCharacter?.shortName.toLowerCase() || selectedFilter}`}
              onPost={(clip, mime, seconds) => postClipToChat(clip, mime, seconds, `Video message ${boothLookLabel}`)}
            />

            {/* ── HALLOWEEN FACE FILTER SELECTOR GRID ── */}
            <div className="rounded-2xl bg-black/50 border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                  🎭 Realistic Halloween Face &amp; Talking-Head Filters
                </span>
                <span className="text-[10px] text-white/45">
                  Conforms to head tilt, gaze &amp; live mouth movement
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {HALLOWEEN_FILTERS.map((f) => {
                  const active = !castCharacter && selectedFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        setSelectedFilter(f.id);
                        setCastCharacterId(null);
                        if (f.id === 'bats') halloweenAudio.playBatSwarmSfx();
                        else if (f.id === 'ghostface') halloweenAudio.playGhostScreamSfx();
                        else if (f.id === 'jackolantern') halloweenAudio.playPlasmaBladesAppear();
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-orange-500 text-black border-orange-300 shadow-[0_0_20px_rgba(249,115,22,0.35)]'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg">{f.icon}</span>
                        {active && (
                          <span className="px-1.5 py-0.5 rounded bg-black/20 text-[8px] font-black uppercase">
                            <span className="sm:hidden">✓</span><span className="hidden sm:inline">Active</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight mt-1 leading-tight line-clamp-2 sm:line-clamp-none sm:truncate">
                        {f.shortLabel}
                      </p>
                      <p
                        className={`hidden sm:block text-[9px] line-clamp-2 leading-tight mt-0.5 ${
                          active ? 'text-black/75 font-semibold' : 'text-white/45'
                        }`}
                      >
                        {f.blurb}
                      </p>
                    </button>
                  );
                })}

                {/* Dedicated "Dim the Lights" Found-Footage Night Beam Toggle Card */}
                <button
                  onClick={() => {
                    const next = !dimLightsMode;
                    setDimLightsMode(next);
                    halloweenAudio.playFlashlightClick();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    dimLightsMode
                      ? 'bg-emerald-500 text-black border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg">🔦</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                        dimLightsMode ? 'bg-black/25 text-black' : 'bg-white/10 text-white/50'
                      }`}
                    >
                      {dimLightsMode ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight mt-1 leading-tight line-clamp-2 sm:line-clamp-none sm:truncate">
                    <span className="sm:hidden">Dim Lights</span><span className="hidden sm:inline">Dim the Lights</span>
                  </p>
                  <p
                    className={`hidden sm:block text-[9px] line-clamp-2 leading-tight mt-0.5 ${
                      dimLightsMode ? 'text-black/75 font-semibold' : 'text-white/45'
                    }`}
                  >
                    Night found-footage cam + flashlight beam on face
                  </p>
                </button>
              </div>

              {/* Room-Wide Chat FX Action Bar */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
                <div className="grid grid-cols-3 w-full sm:w-auto sm:flex items-center gap-2 sm:flex-wrap">
                  <button
                    onClick={() => setBatSwarmOverlay((v) => !v)}
                    className={`px-2 sm:px-3 py-1.5 leading-tight text-center rounded-lg text-[9px] font-black uppercase tracking-wide sm:tracking-widest border transition-all cursor-pointer ${
                      batSwarmOverlay
                        ? 'bg-purple-500/25 border-purple-400 text-purple-200'
                        : 'bg-white/5 border-white/10 text-white/50'
                    }`}
                  >
                    🦇 <span className="sm:hidden">Bats {batSwarmOverlay ? 'On' : 'Off'}</span><span className="hidden sm:inline">Bat Overlay: {batSwarmOverlay ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    onClick={() =>
                      handleSendMessage({
                        customText: '🦇 Summoned a nocturnal Bat Swarm across the Halloween Vault!',
                        fxTrigger: 'BATS',
                      })
                    }
                    className="px-2 sm:px-3 py-1.5 leading-tight text-center rounded-lg bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-400/40 text-[9px] font-black uppercase tracking-wide sm:tracking-widest text-purple-300 transition-all cursor-pointer"
                  >
                    🦇 <span className="sm:hidden">Swarm Chat</span><span className="hidden sm:inline">Send Bat Swarm to Chat</span>
                  </button>
                  <button
                    onClick={() =>
                      handleSendMessage({
                        customText: '🎃 Ignited Melvin Lester’s Dual Orange Plasma Blades in the chat!',
                        fxTrigger: 'JACK',
                      })
                    }
                    className="px-2 sm:px-3 py-1.5 leading-tight text-center rounded-lg bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-400/40 text-[9px] font-black uppercase tracking-wide sm:tracking-widest text-orange-300 transition-all cursor-pointer"
                  >
                    🎃 <span className="sm:hidden">Slash FX</span><span className="hidden sm:inline">Plasma Slash FX</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (5 cols): PERSISTENT HALLOWEEN CHAT ROOM & FAN POLLS ── */}
          <div className={`lg:col-span-5 flex-col rounded-2xl bg-[#0c090d] border border-orange-500/25 overflow-hidden h-[68dvh] min-h-[440px] sm:h-[560px] ${phonePane === 'CHAT' ? 'flex' : 'hidden lg:flex'}`}>
            {/* Tab Bar */}
            <div className="flex border-b border-white/10 bg-black/40">
              <button
                onClick={() => setActiveRightTab('CHAT')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider sm:tracking-widest whitespace-nowrap flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  activeRightTab === 'CHAT'
                    ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                    : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                <MessageSquare size={13} /> <span className="hidden sm:inline">Vault </span>Chat ({messages.length})
              </button>
              <button
                onClick={() => setActiveRightTab('POLLS')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider sm:tracking-widest whitespace-nowrap flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  activeRightTab === 'POLLS'
                    ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                    : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                <BarChart3 size={13} /> <span className="hidden sm:inline">Fan </span>Polls ({polls.length})
              </button>
              <button
                onClick={() => setActiveRightTab('FACTIONS')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider sm:tracking-widest whitespace-nowrap flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  activeRightTab === 'FACTIONS'
                    ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                    : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                <Users size={13} /> Teams (5)
              </button>
            </div>

            {/* TAB 1: PERSISTENT CHAT MESSAGES */}
            {activeRightTab === 'CHAT' && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && (
                    <p className="text-center text-xs text-white/45 py-10">
                      No messages yet — be the first to post in the Halloween Vault.
                    </p>
                  )}
                  {messages.map((msg) => {
                    const fac =
                      HALLOWEEN_FACTIONS.find((f) => f.id === msg.factionId) ||
                      HALLOWEEN_FACTIONS[0];
                    const filt = HALLOWEEN_FILTERS.find((f) => f.id === msg.activeFilter);
                    const isMine = msg.uid === myUid;
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-2xl p-3 border transition-all ${
                          isMine
                            ? 'bg-orange-500/12 border-orange-500/35 ml-4'
                            : 'bg-white/[0.03] border-white/10 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <UserAvatar
                              uid={msg.uid}
                              src={msg.photoURL || null}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover border border-white/15 shrink-0"
                              fallback={null}
                            />
                            <span className="text-xs">{fac.emoji}</span>
                            <span className="text-[11px] font-black text-white">
                              {msg.displayName}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase"
                              style={{
                                backgroundColor: `${fac.color}22`,
                                color: fac.color,
                                border: `1px solid ${fac.color}44`,
                              }}
                            >
                              {fac.shortName}
                            </span>
                            {filt && filt.id !== 'none' && (
                              <span className="px-1.5 py-0.5 rounded bg-white/8 text-[8px] font-bold text-white/70">
                                {filt.icon} {filt.shortLabel}
                              </span>
                            )}
                            {msg.dimLightsOn && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[8px] font-bold text-emerald-300">
                                🔦 Night-Cam
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-white/30">
                            {new Date(msg.at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <p className="text-xs text-white/85 leading-relaxed break-words">
                          {msg.text}
                        </p>

                        {isStorageVideoUrl(msg.videoUrl) && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-rose-500/30 max-w-xs">
                            <video src={msg.videoUrl} controls playsInline preload="metadata" className="w-full h-auto bg-black" />
                          </div>
                        )}

                        {msg.snapshotDataUrl && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-orange-500/30 max-w-xs">
                            <img
                              src={msg.snapshotDataUrl}
                              alt="Filtered Halloween Cam Snapshot"
                              className="w-full h-auto object-cover"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                {/* Chat Composer */}
                <div className="p-3 border-t border-white/10 bg-black/60 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSendMessage();
                      }}
                      disabled={!canChat}
                      placeholder={canChat ? `Chat as ${myFaction.emoji} ${myFaction.shortName}…` : 'Sign in to chat'}
                      className="flex-1 min-w-0 h-11 sm:h-10 px-3.5 rounded-xl bg-white/5 border border-white/15 focus:border-orange-400 text-base sm:text-xs text-white placeholder-white/35 outline-none"
                    />
                    <button
                      onClick={() => void handleSendMessage()}
                      disabled={!canChat || !chatDraft.trim()}
                      className="shrink-0 h-11 sm:h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send size={13} /> Send
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: INTERACTIVE HALLOWEEN FAN POLLS */}
            {activeRightTab === 'POLLS' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {polls.map((poll) => {
                  const totalVotes = Object.values(poll.votes).reduce(
                    (acc, arr) => acc + (arr?.length || 0),
                    0
                  );
                  return (
                    <div
                      key={poll.id}
                      className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-3"
                    >
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-orange-400">
                          {poll.subtitle}
                        </p>
                        <h4 className="text-xs font-black text-white mt-0.5">{poll.question}</h4>
                      </div>

                      <div className="space-y-2">
                        {poll.options.map((opt, idx) => {
                          const voters = poll.votes[idx] || [];
                          const pct =
                            totalVotes > 0 ? Math.round((voters.length / totalVotes) * 100) : 0;
                          const votedByMe = voters.includes(myUid);
                          return (
                            <button
                              key={idx}
                              onClick={() => void handleVotePoll(poll.id, idx)}
                              className={`w-full relative overflow-hidden rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                                votedByMe
                                  ? 'border-orange-400 bg-orange-500/15'
                                  : 'border-white/10 bg-black/40 hover:border-white/25'
                              }`}
                            >
                              <div
                                className="absolute inset-y-0 left-0 bg-orange-500/20 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                              <div className="relative flex items-center justify-between gap-2 text-xs">
                                <span className="font-bold text-white flex items-center gap-1.5">
                                  <span>{opt.emoji}</span>
                                  <span>{opt.label}</span>
                                </span>
                                <span className="text-[10px] font-black text-orange-300 shrink-0">
                                  {pct}% ({voters.length})
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 3: TEAM / FACTION ROSTER & QUICK WATCH */}
            {activeRightTab === 'FACTIONS' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {HALLOWEEN_FACTIONS.map((fac) => {
                  const isMine = fac.id === myFactionId;
                  return (
                    <div
                      key={fac.id}
                      onClick={() => chooseTeam(fac.id)}
                      className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer transition-all ${
                        isMine
                          ? 'bg-orange-500/15 border-orange-400'
                          : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <img
                        src={fac.portraitUrl}
                        alt={fac.leader}
                        className="w-12 h-12 rounded-xl object-cover border border-white/15 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span>{fac.emoji}</span>
                          <h4 className="text-xs font-black uppercase text-white truncate">
                            {fac.name}
                          </h4>
                        </div>
                        <p className="text-[10px] text-white/55 truncate mt-0.5">
                          Champion: <span className="text-orange-300 font-bold">{fac.leader}</span>
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                          isMine
                            ? 'bg-orange-500 text-black'
                            : 'bg-white/10 text-white/60'
                        }`}
                      >
                        {isMine ? 'Joined' : 'Join'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── STORY INTELLIGENCE REALTIME CHARACTER VOICE CHANGER & VTUBER FACE-MAPPING STUDIO ── */}
        {FAN_ROOM_CHARACTER_STUDIO && (
        <div className="relative z-10 mt-8 pt-6 border-t border-orange-500/20">
          <StoryIntelVTuberVoiceStudio
            canPostClips={canChat}
            onPostClipToChat={(clip, mime, seconds, character) =>
              postClipToChat(clip, mime, seconds, `${character.emoji} Video message as ${character.name}`)
            }
            onSendVTuberMessageToChat={({ character, text, snapshotDataUrl, voiceChanged }) => {
              setActiveRightTab('CHAT');
              void handleSendMessage({
                snapshotDataUrl,
                customText: `${character.emoji} [VTuber: ${character.name}${
                  voiceChanged ? ` · 🎙️ ${character.voicePreset.presetLabel}` : ''
                }] ${text}`,
                fxTrigger:
                  character.id === 'char_1'
                    ? 'JACK'
                    : character.id === 'char_3'
                    ? 'BATS'
                    : character.id === 'char_6'
                    ? 'GHOST'
                    : undefined,
              });
            }}
          />
        </div>
        )}
      </section>

      {/* ── PERSISTENT FLOATING HALLOWEEN VAULT CHAT & FILTER MINI-DRAWER ── */}
      <div className={`fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-3 sm:bottom-5 sm:right-5 z-[65] ${roomInView && !floatingWidgetOpen ? 'hidden lg:block' : ''}`}>
        <AnimatePresence mode="wait">
          {!floatingWidgetOpen ? (
            <motion.button
              key="pill"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onClick={() => setFloatingWidgetOpen(true)}
              aria-label="Open Halloween vault chat"
              className="px-3 sm:px-4 py-2 sm:py-3 rounded-2xl bg-[#160b06]/95 hover:bg-[#1f1008] border-2 border-orange-500/60 text-white shadow-[0_12px_40px_rgba(249,115,22,0.38)] backdrop-blur-xl flex items-center gap-2 sm:gap-2.5 cursor-pointer"
            >
              <span className="text-lg">{activeFilterMeta.icon}</span>
              <span className="sm:hidden text-xs font-black">💬 {messages.length}</span>
              <div className="hidden sm:block text-left">
                <p className="text-[9px] font-black uppercase tracking-widest text-orange-400 leading-none">
                  Persistent Vault Room
                </p>
                <p className="text-xs font-black text-white mt-0.5">
                  Halloween Chat &amp; Filter Cam ({messages.length})
                </p>
              </div>
              <Maximize2 size={14} className="hidden sm:block text-orange-300 ml-1" />
            </motion.button>
          ) : (
            <motion.div
              key="drawer"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="w-[calc(100vw-24px)] max-w-sm sm:w-96 sm:max-w-none rounded-3xl bg-[#11090c]/95 border-2 border-orange-500/50 shadow-[0_25px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden flex flex-col"
            >
              <div className="px-4 py-3 bg-gradient-to-r from-orange-500/20 to-purple-500/15 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>🎃</span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white">
                      Halloween Vault Live Room
                    </p>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-orange-300">
                      {activeFilterMeta.label} {dimLightsMode ? '· 🔦 Dim Lights' : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFloatingWidgetOpen(false)}
                  aria-label="Minimize vault chat"
                  className="w-11 h-11 sm:w-auto sm:h-auto sm:p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white cursor-pointer flex items-center justify-center"
                >
                  <Minimize2 size={13} />
                </button>
              </div>

              {/* Live Mini Filtered Canvas Preview */}
              <div className="relative aspect-video bg-black border-b border-white/10">
                <canvas ref={miniCanvasRef} className="w-full h-full object-cover block" />
                <div className="absolute bottom-2 inset-x-2 flex items-center justify-between gap-1">
                  <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    {HALLOWEEN_FILTERS.filter((f) => f.id !== 'none').map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFilter(f.id)}
                        title={f.label}
                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                          selectedFilter === f.id
                            ? 'bg-orange-500 text-black'
                            : 'bg-black/75 text-white/80 hover:bg-black'
                        }`}
                      >
                        {f.icon}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setDimLightsMode((v) => !v)}
                    title="Toggle Dim the Lights Found-Footage Beam"
                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase cursor-pointer ${
                      dimLightsMode
                        ? 'bg-emerald-500 text-black'
                        : 'bg-black/75 text-white/60 border border-white/15'
                    }`}
                  >
                    🔦 Beam
                  </button>
                </div>
              </div>

              {/* Recent Messages */}
              <div className="max-h-48 overflow-y-auto p-3 space-y-2">
                {messages.slice(-6).map((m) => (
                  <div key={m.id} className="text-[11px] bg-white/[0.04] rounded-xl p-2 border border-white/5">
                    <span className="font-black text-orange-300">{m.displayName}: </span>
                    <span className="text-white/85">{m.text}</span>
                  </div>
                ))}
              </div>

              {/* Quick Send */}
              <div className="p-2.5 border-t border-white/10 flex items-center gap-1.5 bg-black/60">
                <input
                  type="text"
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSendMessage();
                  }}
                  disabled={!canChat}
                  placeholder={canChat ? 'Send message to Vault Room…' : 'Sign in to chat'}
                  className="flex-1 min-w-0 h-11 sm:h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-base sm:text-[11px] text-white outline-none"
                />
                <button
                  onClick={() => void handleSendMessage()}
                  className="shrink-0 h-11 sm:h-8 px-4 sm:px-3 rounded-lg bg-orange-500 text-black font-black text-[10px] uppercase cursor-pointer"
                >
                  Send
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Draws a lifelike animated studio talking head when no physical webcam
// is active so the user can test every face filter & Dim-the-Lights beam live!
// ─────────────────────────────────────────────────────────────────────────────
function drawSimulatedStudioTalkingHead(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tSec: number,
  talking: boolean
) {
  // Nocturnal Halloween Vault studio backdrop
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.42, 30, W * 0.5, H * 0.5, W * 0.75);
  bg.addColorStop(0, '#271722');
  bg.addColorStop(0.55, '#120b14');
  bg.addColorStop(1, '#050408');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle gothic studio archways in background
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.12)';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    const ax = W * 0.5 + i * W * 0.32;
    ctx.beginPath();
    ctx.arc(ax, H * 0.48, W * 0.12, Math.PI, 0);
    ctx.lineTo(ax + W * 0.12, H);
    ctx.moveTo(ax - W * 0.12, H * 0.48);
    ctx.lineTo(ax - W * 0.12, H);
    ctx.stroke();
  }

  // Animated talking head coordinates matching HalloweenFilterEngine's synthetic anchor
  const swayX = Math.sin(tSec * 1.15) * W * 0.025 + Math.cos(tSec * 2.3) * W * 0.008;
  const swayY = Math.sin(tSec * 1.7) * H * 0.016;
  const cx = W * 0.5 + swayX;
  const cy = H * 0.45 + swayY;
  const rx = Math.min(W, H) * 0.21;
  const ry = rx * 1.24;
  const roll = Math.sin(tSec * 0.95) * 0.065;

  // Shoulders & leather trench collar
  ctx.save();
  ctx.translate(cx, cy + ry * 1.25);
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 2.05, ry * 0.78, 0, Math.PI, 0);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#27272a';
  ctx.stroke();

  // Neck
  ctx.fillStyle = '#d6a889';
  ctx.fillRect(-rx * 0.34, -ry * 0.52, rx * 0.68, ry * 0.55);
  ctx.restore();

  // Base human talking head (so filters that blend with skin/eyes/mouth like Zombie, Werewolf, Vampire look realistic!)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(roll);

  const skinGrad = ctx.createRadialGradient(-rx * 0.2, -ry * 0.2, rx * 0.1, 0, 0, ry * 1.1);
  skinGrad.addColorStop(0, '#f3cbb0');
  skinGrad.addColorStop(0.65, '#d6a281');
  skinGrad.addColorStop(1, '#8c583a');
  ctx.fillStyle = skinGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(0, -ry * 0.32, rx * 1.04, ry * 0.78, 0, Math.PI, 0);
  ctx.fill();

  // Natural eyes
  const ex = rx * 0.41;
  const ey = -ry * 0.12;
  const er = rx * 0.21;
  const gx = Math.sin(tSec * 0.8) * er * 0.22;
  const gy = Math.cos(tSec * 1.1) * er * 0.12;
  for (const dir of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(dir * ex, ey, er * 0.85, er * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2f2f';
    ctx.beginPath();
    ctx.arc(dir * ex + gx, ey + gy, er * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(dir * ex + gx, ey + gy, er * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  // Natural talking mouth
  const speechOpen = talking
    ? Math.max(0.05, Math.sin(tSec * 6.8) * 0.25 + Math.sin(tSec * 11.3) * 0.15)
    : 0.04;
  ctx.fillStyle = '#450a0a';
  ctx.beginPath();
  ctx.ellipse(0, ry * 0.42, rx * 0.36, ry * Math.max(0.05, speechOpen), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export default HalloweenVaultChatAndFanRoom;
