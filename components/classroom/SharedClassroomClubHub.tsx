// components/classroom/SharedClassroomClubHub.tsx
// Shared Club-Model Classroom & Interactive Lecture Studio for BOTH Academia and Elevate Christian Education.
// - Mimics Plajah Clubs (Social Feed, Photos Gallery, Live Lecture Stream, Class Roster) but confined to the Teacher & Class.
// - Special Lecture Live Stream Mode:
//   1. Video Lecture Mode: students raise hand (✋) and teacher brings them on camera (split-stage video) to answer.
//   2. Audio-Only Lecture Mode (repurposed Live Talk stage): speaker podium + listener rows + raise hand to unmute & answer.
//   3. Both Video & Audio modes include live Screen Sharing (getDisplayMedia) and an Interactive Digital Whiteboard.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessagesSquare,
  Image as ImageIcon,
  Radio,
  Users,
  Hand,
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  PenTool,
  Pin,
  Heart,
  Send,
  Upload,
  Sparkles,
  Check,
  X,
  Trash2,
  Eraser,
  Download,
  Camera,
  Volume2,
  ShieldCheck,
  UserCheck,
  ExternalLink,
  Maximize2,
  Minimize2,
  BookOpen,
} from 'lucide-react';
import { useRtcSession } from '../../hooks/useRtcSession';
import { useLiveFx } from '../../hooks/useLiveFx';
import { LevelMeter } from '../live/LevelMeter';
import LectureLessonStage from './LectureLessonStage';
import { useLiveDocSource } from '../../hooks/useLiveDocSource';
import { LiveDocPicker } from '../live/LiveDocDock';
import { lessonAssembler, lessonChunks, type LessonChunk } from '../../services/lectureLesson';
import type { IngestedCurriculumUnit } from '../../services/curriculumIngestionService';
import UniversalPostComposer, { type ComposerPostData } from '../UniversalPostComposer';
import { resolveComposerMedia } from '../FeedView';
import { auth } from '../../services/backendService';
import {
  watchClassroomPosts,
  addClassroomPost,
  setClassroomPostLike,
  setClassroomPostPin,
  addClassroomPostComment,
  deleteClassroomPost,
  watchClassroomPhotos,
  shareClassMedia,
  classMediaObjectUrl,
  ClassMediaGoneError,
  editClassroomPhotoCaption,
  editClassroomPost,
  deleteClassroomPhoto,
  migrateLocalClassroomFeed,
  type ClassClubHome,
  type ClubMediaKind,
  loadLectureSession,
  blankLectureSession,
  saveLectureSession,
  type ClassroomContextKind,
  type ClassroomSocialPost,
  type ClassroomPhotoItem,
  type LectureSessionState,
  type LectureBroadcastMode,
  type LectureStageSurface,
  type RaisedHandEntry,
  type WhiteboardStroke,
} from '../../services/sharedClassroomService';

export interface SharedClassroomClubHubProps {
  classId: string;
  className: string;
  classSubtitle?: string;
  contextKind: ClassroomContextKind;
  teacherUid: string;
  teacherName: string;
  teacherAvatar?: string;
  isTeacher: boolean;
  currentUserUid?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  rosterStudents?: Array<{ id: string; name: string; avatar?: string; roleLabel?: string }>;
  /** The class record the feed and photos are shared under (its roster decides who sees them).
   *  Omitted for a sample class: there is no one to share with, so posting is off. */
  club?: ClassClubHome | null;
  initialSection?: 'SOCIAL_FEED' | 'PHOTOS' | 'LIVE_LECTURE' | 'ROSTER';
  /** Rendered inside a parent club (Christian Ed class): the parent owns the cover and channel pills,
   *  so the banner and section tabs are hidden and `initialSection` drives the section. */
  embedded?: boolean;
  /** The class's lessons the teacher can put on the stage. */
  lessons?: IngestedCurriculumUnit[];
  /** A student's own copy, when this class can tie it to their assignment (else it stays on this device). */
  ownCopy?: { load: (unitId: string) => Record<string, string> | null; save: (unitId: string, answers: Record<string, string>) => void };
}

const WHITEBOARD_COLORS = ['#FFFFFF', '#FF8C00', '#00DAF3', '#06D6A0', '#D40055', '#FFD24A', '#A78BFA'];
const LiveMediaSheet = lazy(() => import('../live/LiveMediaSheet'));
const LiveDocStage = lazy(() => import('../live/LiveDocStage'));

/** Plays a remote participant's audio (video tiles stay muted so audio is never doubled). */
const RemoteAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />;
};

/** Student -> teacher requests over the lecture session's data channel. The teacher's copy of the
 *  lecture is the source of truth and is re-broadcast to everyone after each change. */
type LectureOp =
  | { k: 'hand'; entry: RaisedHandEntry | null }
  | { k: 'chat'; msg: LectureSessionState['lectureChat'][number] }
  | { k: 'stroke'; stroke: WhiteboardStroke }
  | { k: 'unstroke'; ids: string[] }
  | { k: 'leaveStage' }
  | { k: 'react'; label: string }
  | { k: 'lessonAnswer'; qid: string; value: string };
// SCTP messages over ~256 KB are dropped; keep the broadcast state well under that.
const MAX_STATE_BYTES = 200_000;

// Scoped, not Tailwind: the class pages sit under several shells with their own layers.
const LECTURE_HALL_CSS = `
.lh{--ink:#f4f1f7;--dim:rgba(244,241,247,.72);--bd:rgba(255,255,255,.13);color:var(--ink);font-family:Inter,system-ui,sans-serif;display:grid;gap:14px}
.lh button{font:inherit;cursor:pointer}
.lh-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.lh-head h2{margin:0;font:700 1.35rem/1.15 Outfit,sans-serif}
.lh-sub{font-size:.88rem;color:var(--dim);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lh-live{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 12px;border-radius:99px;background:linear-gradient(135deg,#6B0099,#D40055);font:700 .74rem/1 Outfit,sans-serif;letter-spacing:.06em}
.lh-live i{width:7px;height:7px;border-radius:50%;background:#fff}
.lh-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:99px;border:1px solid var(--bd);background:rgba(255,255,255,.04)}
.lh-seg button{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border:0;border-radius:99px;background:transparent;color:var(--dim);font-size:.8rem;font-weight:500}
.lh-seg button:hover{color:var(--ink)}
.lh-seg button[aria-pressed="true"]{background:var(--ink);color:#160a24;font-weight:600}
.lh-go{display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 18px;border:0;border-radius:99px;background:linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00);color:#fff;font:700 .86rem/1 Outfit,sans-serif}
.lh-go.end{background:var(--ink);color:#160a24}
.lh-pick{position:absolute;z-index:40;top:44px;left:0;width:300px;max-height:320px;overflow-y:auto;padding:6px;border-radius:14px;background:#1b1029;border:1px solid var(--bd);box-shadow:0 18px 44px rgba(0,0,0,.55);display:grid;gap:2px}
.lh-pick p{margin:0;padding:10px;font-size:.82rem;color:var(--dim)}
.lh .lh-pick button{display:block;width:100%;height:auto;min-height:40px;padding:9px 11px;border-radius:9px;text-align:left;color:var(--ink);white-space:normal;line-height:1.3}
.lh .lh-pick button:hover,.lh .lh-pick button[aria-current="true"]{background:rgba(255,255,255,.1)}
.lh-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:stretch}
.lh.wide .lh-grid{grid-template-columns:minmax(0,1fr)}
.lh-main{min-width:0;display:flex;flex-direction:column;gap:12px}
.lh-stage{position:relative;flex:none;height:clamp(460px,calc(100vh - 300px),860px);display:flex;flex-direction:column;border-radius:18px;background:#0d0814;border:1px solid var(--bd);overflow:auto}
.lh-lesson{position:relative;flex:1;min-height:0;display:flex}
.lh-paper{flex:1;min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:24px;background:#f7f2ea;color:#22162e;outline:none}
.lh-lesson{flex-direction:column}
.lh-note{margin:0;padding:8px 16px;background:#22162e;color:#f7f2ea;font-size:.8rem}
.lh-paper-wait{margin:40px 0;text-align:center;font:400 1.05rem/1.5 'Source Serif 4',Georgia,serif;color:rgba(34,22,46,.7)}
.lh-pips{position:absolute;top:14px;right:22px;display:grid;gap:10px;width:220px;pointer-events:none}
.lh-pip{position:relative;height:138px;border-radius:14px;overflow:hidden;background:#2a1440;box-shadow:0 10px 26px rgba(20,8,30,.35);pointer-events:auto;display:grid;place-items:center}
.lh-pip.on{outline:3px solid #ffb066}
.lh-pip video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
.lh-pip .mono{width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#6B0099,#D40055);display:grid;place-items:center;font:700 1.15rem/1 Outfit,sans-serif;color:#fff}
.lh-pip .who{position:absolute;z-index:2;left:8px;bottom:8px;padding:4px 8px;border-radius:7px;background:rgba(10,6,16,.72);font:600 .74rem/1 Outfit,sans-serif;color:#fff}
.lh-pip button{position:absolute;z-index:2;top:7px;right:7px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(10,6,16,.72);color:#fff;display:grid;place-items:center}
.lh-back{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 15px;border:0;border-radius:99px;background:#22162e;color:#f7f2ea;font-size:.82rem;font-weight:600;box-shadow:0 8px 22px rgba(20,8,30,.4)}
.lh-floor{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px}
.lh-seats{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;min-height:64px}
.lh-seat{width:54px;display:grid;justify-items:center;gap:4px;transition:transform .25s}
.lh-seat span{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);display:grid;place-items:center;font:600 .76rem/1 Outfit,sans-serif}
.lh-seat em{font-style:normal;font-size:.7rem;color:var(--dim);max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lh-seat.up{transform:translateY(-8px)}
.lh-seat.up span{background:#ffb066;color:#2a1400}
.lh-empty{font-size:.84rem;color:var(--dim);margin:0}
.lh-ctl{display:flex;flex-wrap:wrap;gap:8px}
.lh-ctl button{display:inline-flex;align-items:center;gap:7px;height:44px;min-width:44px;justify-content:center;padding:0 15px;border:0;border-radius:99px;background:rgba(255,255,255,.1);color:var(--ink);font-size:.82rem;font-weight:500}
.lh-ctl button:hover{background:rgba(255,255,255,.16)}
.lh-ctl button.off{background:#f4f1f7;color:#160a24}
.lh-ctl button.hand{background:#ffb066;color:#2a1400;font-weight:600}
.lh-side{min-width:0;height:100%;max-height:calc(clamp(460px,calc(100vh - 300px),860px) + 90px);display:flex;flex-direction:column;border-radius:18px;background:#1b1029;border:1px solid var(--bd);overflow:hidden}
.lh-side-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 16px 12px}
.lh-side-h h3{margin:0;font:600 1rem/1 Outfit,sans-serif}
.lh-side-h span{font-size:.75rem;color:var(--dim)}
.lh-hands{display:grid;gap:6px;margin:0 10px;max-height:40%;overflow-y:auto}
.lh-hand{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.07)}
.lh-hand strong{display:block;font-size:.82rem;font-weight:600;line-height:1.3}
.lh-hand p{margin:3px 0 0;font-size:.78rem;color:var(--dim)}
.lh-hand button{flex:none;height:36px;padding:0 12px;border:1px solid rgba(255,255,255,.25);border-radius:99px;background:transparent;color:var(--ink);font-size:.78rem;font-weight:600}
.lh-hand.first{background:#f7f2ea;color:#22162e}
.lh-hand.first p{color:rgba(34,22,46,.72)}
.lh-hand.first button{border:0;background:#22162e;color:#f7f2ea}
.lh-askhow{display:grid;gap:6px;margin:0 12px}
.lh-askhow input,.lh-askhow select{height:38px;border-radius:10px;padding:0 10px;background:rgba(255,255,255,.07);border:1px solid var(--bd);color:var(--ink);font-size:.8rem;outline:none}
.lh-askhow option{color:#160a24}
.lh-chat{flex:1;min-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:12px}
.lh-chat>:first-child{margin-top:auto}
.lh-msg{align-self:flex-start;max-width:88%;padding:8px 11px;border-radius:13px;background:rgba(255,255,255,.08)}
.lh-msg.me{align-self:flex-end;background:#6B0099}
.lh-msg b{display:block;font-size:.72rem;font-weight:600;color:rgba(255,255,255,.82)}
.lh-msg p{margin:2px 0 0;font-size:.86rem;line-height:1.4;overflow-wrap:anywhere}
.lh-reacts{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}
.lh-reacts button{height:34px;padding:0 11px;border:1px solid rgba(255,255,255,.2);border-radius:99px;background:transparent;color:var(--ink);font-size:.76rem}
.lh-send{display:flex;gap:6px;padding:0 12px 12px}
.lh-send input{flex:1;min-width:0;height:44px;padding:0 15px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid var(--bd);color:var(--ink);font-size:.86rem;outline:none}
.lh-send button{width:44px;height:44px;flex:none;border:0;border-radius:50%;background:linear-gradient(135deg,#6B0099,#D40055);color:#fff;display:grid;place-items:center}
.lh-float{position:absolute;bottom:64px;padding:6px 11px;border-radius:99px;background:rgba(20,10,30,.86);color:#fff;font-size:.8rem;font-weight:600;animation:lhRise 2.2s ease-out forwards}
@keyframes lhRise{from{opacity:0;transform:translateY(12px)}15%{opacity:1}to{opacity:0;transform:translateY(-70px)}}
@media (prefers-reduced-motion:reduce){.lh-float{animation:none}}
@media (max-width:1023px){.lh-grid{grid-template-columns:minmax(0,1fr)}.lh-side{height:440px;max-height:none}.lh-stage{height:62vh}}
@media (max-width:640px){.lh-pips{width:120px;right:12px;top:10px}.lh-pip{height:84px}.lh-pip .mono{width:38px;height:38px}.lh-paper{padding:14px}.lh-pick{position:fixed;left:16px;right:16px;top:auto;width:auto}}
`;

/** A class copy's private file, fetched with the viewer's sign-in so class membership is checked. */
const ClubMedia: React.FC<{ home: ClassClubHome; photoId: string; kind: ClubMediaKind; alt: string; className?: string }> = ({ home, photoId, kind, alt, className }) => {
  const [src, setSrc] = useState('');
  const [state, setState] = useState<'loading' | 'gone' | 'error' | 'ready'>('loading');
  useEffect(() => {
    let live = true;
    setState('loading');
    classMediaObjectUrl(home, photoId).then(
      url => { if (live) { setSrc(url); setState('ready'); } },
      e => { if (live) setState(e instanceof ClassMediaGoneError ? 'gone' : 'error'); }
    );
    return () => { live = false; };
  }, [home.kind, home.id, photoId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state !== 'ready') {
    return (
      <div data-club-media={state} className={`${className || ''} flex items-center justify-center min-h-24 bg-white/[0.04] text-[11px] text-white/45 p-3 text-center`}>
        {state === 'gone' ? 'The owner removed this file.' : state === 'error' ? 'This file could not load.' : 'Loading…'}
      </div>
    );
  }
  if (kind === 'video') return <video src={src} controls className={className} />;
  if (kind === 'audio') return <audio src={src} controls className="w-full" />;
  return <img src={src} alt={alt} data-club-media="ready" className={className} />;
};

const CopyEditor: React.FC<{ value: string; multiline?: boolean; onChange: (v: string) => void; onSave: () => void; onCancel: () => void }> = ({ value, multiline, onChange, onSave, onCancel }) => (
  <div className="space-y-1.5">
    {multiline ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full rounded-xl bg-black/30 border border-white/15 p-2 text-sm text-white" />
    ) : (
      <input value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/15 px-2 py-1 text-xs text-white" />
    )}
    <div className="flex gap-1.5">
      <button type="button" onClick={onSave} disabled={!value.trim()} className="px-2.5 py-1 rounded-lg bg-amber-400 text-black text-[10px] font-black disabled:opacity-40">Save</button>
      <button type="button" onClick={onCancel} className="px-2.5 py-1 rounded-lg bg-white/10 text-white/70 text-[10px] font-bold">Cancel</button>
    </div>
  </div>
);

export const SharedClassroomClubHub: React.FC<SharedClassroomClubHubProps> = ({
  classId,
  className,
  classSubtitle,
  contextKind,
  teacherUid,
  teacherName,
  isTeacher,
  currentUserUid,
  currentUserName,
  currentUserAvatar,
  rosterStudents = [],
  club = null,
  initialSection = 'LIVE_LECTURE',
  embedded = false,
  lessons,
  ownCopy,
}) => {
  const viewerUid = currentUserUid || auth.currentUser?.uid || (isTeacher ? teacherUid : 'student_local');
  const viewerName =
    currentUserName ||
    auth.currentUser?.displayName ||
    (isTeacher ? teacherName : 'Class Student');

  const [section, setSection] = useState<'SOCIAL_FEED' | 'PHOTOS' | 'LIVE_LECTURE' | 'ROSTER'>(initialSection);
  useEffect(() => {
    if (embedded) setSection(initialSection);
  }, [embedded, initialSection]);

  // ── 1. Classroom Social Feed State ──
  const [posts, setPosts] = useState<ClassroomSocialPost[]>([]);
  const [feedError, setFeedError] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // ── 2. Classroom Photos Gallery State ──
  const [photos, setPhotos] = useState<ClassroomPhotoItem[]>([]);
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<ClassroomPhotoItem | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const galleryPhotos = photos.filter(ph => !ph.attachedToPost);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // ── 3. Special Lecture Live Stream / Audio Live Talk / Screen Share / Whiteboard State ──
  const lectureDefaults = { title: className, hostUid: teacherUid, hostName: teacherName };
  const [lecture, setLecture] = useState<LectureSessionState>(() =>
    isTeacher ? loadLectureSession(classId, lectureDefaults) : blankLectureSession(classId, lectureDefaults)
  );
  const [micMuted, setMicMuted] = useState(false);
  const [camEnabled, setCamEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handPromptDraft, setHandPromptDraft] = useState('');
  const [handRequestMode, setHandRequestMode] = useState<'CAMERA' | 'AUDIO_MIC' | 'WHITEBOARD'>('CAMERA');
  const [lectureChatDraft, setLectureChatDraft] = useState('');
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: number; emoji: string; left: number }>>([]);
  const [stageFullscreen, setStageFullscreen] = useState(false);

  // Media streams for Teacher Camera, Student Answer Camera, and Screen Share
  const teacherVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const studentVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);

  // Digital Whiteboard Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [wbTool, setWbTool] = useState<WhiteboardStroke['tool']>('pen');
  const [wbColor, setWbColor] = useState<string>('#FF8C00');
  const [wbSize, setWbSize] = useState<number>(4);
  const [wbTextDraft, setWbTextDraft] = useState('');
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<WhiteboardStroke | null>(null);

  // Feed + photos are live from the class's shared record, so everyone in the class sees the same thing.
  const clubKey = club ? `${club.kind}:${club.id}` : '';
  useEffect(() => {
    setPosts([]);
    setPhotos([]);
    setFeedError('');
    if (!club) return;
    const fail = (e: Error) => {
      console.warn('[classroomClub] feed unavailable', e);
      setFeedError('The class feed could not load. You may not be on this class roster yet.');
    };
    const offPosts = watchClassroomPosts(club, setPosts, fail);
    const offPhotos = watchClassroomPhotos(club, setPhotos, fail);
    const uid = auth.currentUser?.uid;
    if (uid) void migrateLocalClassroomFeed(classId, club, uid);
    return () => { offPosts(); offPhotos(); };
  }, [clubKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const feedAction = (work: Promise<unknown>) =>
    work.catch((e: unknown) => {
      console.warn('[classroomClub] write failed', e);
      setFeedError("That didn't save. Check your connection and that you are on this class roster.");
    });

  useEffect(() => {
    setLecture(isTeacher ? loadLectureSession(classId, lectureDefaults) : blankLectureSession(classId, lectureDefaults));
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lectureRef = useRef(lecture);
  lectureRef.current = lecture;
  const sendOpRef = useRef<(op: LectureOp) => void>(() => {});

  /** Teacher: apply + persist (the broadcast follows). Student: send the parts a student may change
   *  to the teacher and show them right away; the teacher's next broadcast settles it. */
  const updateLecture = (patch: Partial<LectureSessionState>) => {
    if (isTeacher) {
      setLecture(prev => {
        const next = { ...prev, ...patch };
        saveLectureSession(classId, next);
        return next;
      });
      return;
    }
    const prev = lectureRef.current;
    const local: Partial<LectureSessionState> = {};
    if (patch.raisedHands) {
      const mine = patch.raisedHands.find(h => h.uid === viewerUid) || null;
      sendOpRef.current({ k: 'hand', entry: mine });
      local.raisedHands = patch.raisedHands;
    }
    if (patch.lectureChat) {
      const known = new Set(prev.lectureChat.map(m => m.id));
      patch.lectureChat.filter(m => !known.has(m.id) && m.senderUid === viewerUid).forEach(msg => sendOpRef.current({ k: 'chat', msg }));
      local.lectureChat = patch.lectureChat;
    }
    if (patch.whiteboardStrokes && prev.allowStudentWhiteboard) {
      const before = new Map(prev.whiteboardStrokes.map(st => [st.id, st]));
      const after = new Set(patch.whiteboardStrokes.map(st => st.id));
      patch.whiteboardStrokes.forEach(st => { if (before.get(st.id) !== st) sendOpRef.current({ k: 'stroke', stroke: st }); });
      const gone = [...before.keys()].filter(id => !after.has(id));
      if (gone.length) sendOpRef.current({ k: 'unstroke', ids: gone });
      local.whiteboardStrokes = patch.whiteboardStrokes;
    }
    if ('activeStudentOnStage' in patch && patch.activeStudentOnStage === null && prev.activeStudentOnStage?.uid === viewerUid) {
      sendOpRef.current({ k: 'leaveStage' });
      local.activeStudentOnStage = null;
    }
    if (Object.keys(local).length) setLecture(p => ({ ...p, ...local }));
  };

  // Teacher side: apply a student's request, checked against who sent it (rtc peer id = their uid).
  const applyStudentOp = useCallback((peerId: string, op: LectureOp) => {
    setLecture(prev => {
      let next = prev;
      if (op.k === 'hand') {
        const others = prev.raisedHands.filter(h => h.uid !== peerId);
        next = { ...prev, raisedHands: op.entry && op.entry.uid === peerId ? [...others, { ...op.entry, status: 'WAITING' }] : others };
        if (!op.entry && prev.activeStudentOnStage?.uid === peerId) next.activeStudentOnStage = null;
      } else if (op.k === 'chat' && op.msg?.senderUid === peerId && typeof op.msg.text === 'string') {
        next = { ...prev, lectureChat: [...prev.lectureChat, { ...op.msg, senderRole: 'STUDENT' as const, text: op.msg.text.slice(0, 1000) }].slice(-200) };
      } else if (op.k === 'stroke' && prev.allowStudentWhiteboard && op.stroke?.id) {
        const i = prev.whiteboardStrokes.findIndex(st => st.id === op.stroke.id);
        const strokes = [...prev.whiteboardStrokes];
        if (i >= 0) strokes[i] = op.stroke; else strokes.push(op.stroke);
        next = { ...prev, whiteboardStrokes: strokes };
      } else if (op.k === 'unstroke' && prev.allowStudentWhiteboard) {
        const ids = new Set(op.ids);
        next = { ...prev, whiteboardStrokes: prev.whiteboardStrokes.filter(st => !ids.has(st.id)) };
      } else if (op.k === 'lessonAnswer' && prev.lessonSource?.interaction === 'TOGETHER' && typeof op.value === 'string') {
        next = { ...prev, lessonShared: { ...(prev.lessonShared || {}), [String(op.qid)]: op.value.slice(0, 5000) } };
      } else if (op.k === 'leaveStage' && prev.activeStudentOnStage?.uid === peerId) {
        next = { ...prev, activeStudentOnStage: null, raisedHands: prev.raisedHands.filter(h => h.uid !== peerId) };
      }
      if (next !== prev) saveLectureSession(classId, next);
      return next;
    });
  }, [classId]);

  // ── The lecture session (rtcCore 'stage'): the teacher publishes, students watch, and the student
  // the teacher calls on publishes back. Students join while the lecture tab is open, so they see
  // the lecture the moment it starts. With a roster, media only goes to people on it.
  const onStageMe = !isTeacher && lecture.activeStudentOnStage?.uid === viewerUid;
  const inLectureTab = section === 'LIVE_LECTURE';
  const lectureSessionId = `class_lecture_${classId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const allowedPeerIds = useMemo(
    () => (isTeacher && rosterStudents.length ? [...rosterStudents.map(r => r.id), teacherUid] : undefined),
    [isTeacher, rosterStudents, teacherUid],
  );
  const broadcastRef = useRef<() => void>(() => {});
  const sendLessonRef = useRef<() => void>(() => {});
  const assembleLessonRef = useRef(lessonAssembler());
  const scrollSendRef = useRef(0);
  const showReactionRef = useRef<(label: string) => void>(() => {});
  const rtcSendRef = useRef<(type: string, payload?: unknown) => void>(() => {});
  const gotStateRef = useRef(false);
  const rtc = useRtcSession(
    inLectureTab && (isTeacher ? lecture.isLive : true)
      ? {
          sessionId: lectureSessionId,
          topology: 'stage',
          role: isTeacher ? 'host' : onStageMe ? 'participant' : 'viewer',
          media: isTeacher
            ? { audio: true, video: true }
            : onStageMe
              ? { audio: true, video: lecture.mode === 'VIDEO_LECTURE' && lecture.activeStudentOnStage?.requestedMode === 'CAMERA' }
              : { audio: false, video: false },
          displayName: viewerName,
        }
      : null,
    {
      autoJoin: true,
      allowedPeerIds,
      onData: (peerId, msg) => {
        if (isTeacher) {
          if (msg.type === 'lecture:op' && msg.payload) {
            const op = msg.payload as LectureOp;
            if (op.k === 'react') {
              // Students only reach the teacher, so the teacher passes a reaction on.
              const label = String(op.label || '').slice(0, 24);
              showReactionRef.current(label);
              rtcSendRef.current('lecture:react', { label });
            } else applyStudentOp(peerId, op);
          }
          if (msg.type === 'lecture:hello') broadcastRef.current();
          if (msg.type === 'lecture:needLesson') sendLessonRef.current();
        } else if (msg.type === 'lecture:state' && msg.payload && peerId === teacherUid) {
          gotStateRef.current = true;
          setLecture(msg.payload as LectureSessionState);
        } else if (peerId === teacherUid && msg.type === 'lecture:lesson') {
          const unit = assembleLessonRef.current(msg.payload as LessonChunk);
          if (unit) setReceivedLesson(unit);
        } else if (peerId === teacherUid && msg.type === 'lecture:follow') {
          setFollowY(Number((msg.payload as { y?: number })?.y) || 0);
        } else if (peerId === teacherUid && msg.type === 'lecture:react') {
          showReactionRef.current(String((msg.payload as { label?: string })?.label || '').slice(0, 24));
        }
      },
    },
  );
  const fx = useLiveFx(rtc);
  const [mediaSheet, setMediaSheet] = useState(false);

  // The lesson on the stage is the document itself. Students get a key-free copy in small pieces and
  // draw it themselves; after that only the teacher's place in it travels.
  const [lessonPicker, setLessonPicker] = useState(false);
  // Who's called on in class is who can interact with the document.
  const calledOnUid = lecture.activeStudentOnStage?.uid;
  const [telaPicker, setTelaPicker] = useState(false);
  // A real Tela document goes through the platform's shared source, with its videos, sims and models intact.
  const liveDocMembers = useMemo(() => (rosterStudents.length ? [...rosterStudents.map(r => r.id), teacherUid] : undefined), [rosterStudents, teacherUid]);
  const liveDoc = useLiveDocSource(inLectureTab ? `class_lecture_${classId}` : null, { hostName: viewerName, audience: liveDocMembers ? 'members' : 'signedIn', memberUids: liveDocMembers });
  const [receivedLesson, setReceivedLesson] = useState<IngestedCurriculumUnit | null>(null);
  const [followY, setFollowY] = useState<number | null>(null);
  const stageLessons = useMemo(() => (lessons || []).filter(u => !u.isAnswerKeyOnly && u.libraryCategory !== 'ANSWER_KEY'), [lessons]);
  const lessonId = lecture.lessonSource?.unitId;
  const lessonUnit = !lessonId ? null : (receivedLesson?.id === lessonId ? receivedLesson : stageLessons.find(u => u.id === lessonId) || null);
  const lessonUnitRef = useRef(lessonUnit);
  lessonUnitRef.current = lessonUnit;
  const teacherPlaceRef = useRef(0);
  const lastLessonSendRef = useRef(0);
  sendLessonRef.current = () => {
    const unit = lessonUnitRef.current;
    if (!unit || Date.now() - lastLessonSendRef.current < 1500) return;
    lastLessonSendRef.current = Date.now();
    lessonChunks(unit).forEach(c => rtc.sendData('lecture:lesson', c));
  };
  useEffect(() => {
    if (isTeacher && lessonId) { lastLessonSendRef.current = 0; sendLessonRef.current(); }
  }, [isTeacher, lessonId, rtc.participants.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Student: keep asking until the lesson is here (a piece can be dropped).
    if (isTeacher || !lessonId || lessonUnit) return;
    rtc.sendData('lecture:needLesson');
    const t = window.setInterval(() => rtc.sendData('lecture:needLesson'), 2000);
    return () => window.clearInterval(t);
  }, [isTeacher, lessonId, !!lessonUnit]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleTeacherScroll = useCallback((y: number) => {
    teacherPlaceRef.current = y;
    if (scrollSendRef.current) return;
    scrollSendRef.current = window.setTimeout(() => {
      scrollSendRef.current = 0;
      rtc.sendData('lecture:follow', { y: teacherPlaceRef.current });
    }, 150);
  }, [rtc.sendData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A student who joins mid-lesson still lands on the teacher's place.
    if (!isTeacher || !lessonId) return;
    const t = window.setInterval(() => rtc.sendData('lecture:follow', { y: teacherPlaceRef.current }), 3000);
    return () => window.clearInterval(t);
  }, [isTeacher, lessonId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isTeacher && liveDoc.isHost && liveDoc.active) liveDoc.setInvited(calledOnUid ? [calledOnUid] : []);
  }, [isTeacher, liveDoc.isHost, liveDoc.active, calledOnUid]); // eslint-disable-line react-hooks/exhaustive-deps
  // How the class uses it: read along, a private copy each, or one copy everyone writes on.
  const interaction = lecture.lessonSource?.interaction || 'FOLLOW';
  const ownKey = lessonId ? `plajah_live_lesson_${classId}_${lessonId}_${viewerUid}` : '';
  const [ownAnswers, setOwnAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ownKey || !lessonId) return;
    let saved: Record<string, string> = {};
    try { saved = JSON.parse(localStorage.getItem(ownKey) || '{}'); } catch {}
    setOwnAnswers({ ...saved, ...(ownCopy?.load(lessonId) || {}) });
  }, [ownKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleOwnAnswer = (qid: string, value: string) => {
    setOwnAnswers(prev => {
      const next = { ...prev, [qid]: value };
      try { localStorage.setItem(ownKey, JSON.stringify(next)); } catch {}
      if (lessonId) ownCopy?.save(lessonId, next);
      return next;
    });
  };
  // A shared answer being typed here wins over a broadcast that hasn't caught up with it yet.
  const [typingShared, setTypingShared] = useState<Record<string, { value: string; at: number }>>({});
  const handleSharedAnswer = (qid: string, value: string) => {
    setTypingShared(prev => ({ ...prev, [qid]: { value, at: Date.now() } }));
    if (isTeacher) updateLecture({ lessonShared: { ...(lecture.lessonShared || {}), [qid]: value } });
    else sendOpRef.current({ k: 'lessonAnswer', qid, value });
  };
  const sharedAnswers = { ...(lecture.lessonShared || {}) };
  Object.entries(typingShared).forEach(([qid, t]) => { if (Date.now() - t.at < 2000) sharedAnswers[qid] = t.value; });
  const handlePutLessonOnStage = (u: IngestedCurriculumUnit) => {
    if (screenSharing) { rtc.toggleScreenShare(); setScreenSharing(false); }
    teacherPlaceRef.current = 0;
    setLessonPicker(false);
    updateLecture({ stageSurface: 'LESSON', lessonSource: { unitId: u.id, title: u.title, interaction }, lessonShared: {} });
  };
  sendOpRef.current = op => rtc.sendData('lecture:op', op);
  rtcSendRef.current = rtc.sendData;

  // Teacher: re-broadcast the lecture after every change and whenever someone joins.
  broadcastRef.current = () => {
    let state: LectureSessionState = lectureRef.current;
    if (JSON.stringify(state).length > MAX_STATE_BYTES) state = { ...state, whiteboardStrokes: state.whiteboardStrokes.slice(-60) };
    rtc.sendData('lecture:state', state);
  };
  useEffect(() => {
    if (!isTeacher || !rtc.localStream) return;
    const t = window.setTimeout(() => broadcastRef.current(), 120);
    return () => window.clearTimeout(t);
  }, [isTeacher, lecture, rtc.localStream, rtc.participants.length]);
  // A data channel opens a moment after its media, so an early broadcast can miss a new student;
  // a slow heartbeat covers that (and any dropped message).
  useEffect(() => {
    if (!isTeacher || !rtc.localStream) return;
    const t = window.setInterval(() => broadcastRef.current(), 4000);
    return () => window.clearInterval(t);
  }, [isTeacher, rtc.localStream]);
  // Students: ask for the current state once connected; back to "not live" once the teacher has left.
  const hostStream = !isTeacher ? (rtc.remoteStreams.get(teacherUid) ?? null) : null;
  useEffect(() => {
    if (isTeacher) return;
    if (hostStream) {
      // Ask until the teacher's state arrives (it also comes on the teacher's heartbeat).
      gotStateRef.current = false;
      const t = window.setInterval(() => { if (!gotStateRef.current) rtc.sendData('lecture:hello'); }, 700);
      return () => window.clearInterval(t);
    }
    // The teacher's feed also blips while a student re-joins as a speaker: only call the lecture
    // over if it stays gone.
    const t = window.setTimeout(() => setLecture(p => (p.isLive ? { ...p, isLive: false, activeStudentOnStage: null } : p)), 10_000);
    return () => window.clearTimeout(t);
  }, [isTeacher, hostStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mic / camera switches drive the published tracks.
  useEffect(() => { rtc.setAudio(!micMuted); }, [micMuted, rtc.localStream]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    rtc.setVideo(camEnabled && lecture.mode === 'VIDEO_LECTURE');
  }, [camEnabled, lecture.mode, rtc.localStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stage tiles: the teacher sees their own feed and students see the teacher's. The called-on
  // student sees themself; everyone else sees that student's published feed.
  const onStageUid = lecture.activeStudentOnStage?.uid;
  const teacherFeed = isTeacher ? rtc.localStream : hostStream;
  const studentFeed = onStageMe ? rtc.localStream : onStageUid ? (rtc.remoteStreams.get(onStageUid) ?? null) : null;
  const screenFeed = isTeacher ? rtc.screenStream : hostStream;
  useEffect(() => { if (teacherVideoRef.current && teacherVideoRef.current.srcObject !== teacherFeed) teacherVideoRef.current.srcObject = teacherFeed; });
  useEffect(() => { if (studentVideoRef.current && studentVideoRef.current.srcObject !== studentFeed) studentVideoRef.current.srcObject = studentFeed; });
  useEffect(() => { if (screenShareVideoRef.current && screenShareVideoRef.current.srcObject !== screenFeed) screenShareVideoRef.current.srcObject = screenFeed; });
  const screenSharingLive = isTeacher ? rtc.sharingScreen : !!hostStream && lecture.stageSurface === 'SCREEN_SHARE';
  useEffect(() => {
    // The browser's own "Stop sharing" ends the share: fall back to the camera stage.
    if (isTeacher && screenSharing && !rtc.sharingScreen) { setScreenSharing(false); updateLecture({ stageSurface: 'CAMERA' }); }
  }, [rtc.sharingScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Screen share goes out on the lecture session (hot track swap), so students see it.
  const handleToggleScreenShare = async () => {
    if (!isTeacher) return;
    if (screenSharing) {
      rtc.toggleScreenShare();
      setScreenSharing(false);
      updateLecture({ stageSurface: 'CAMERA' });
      return;
    }
    if (!lecture.isLive) updateLecture({ isLive: true, startedAt: Date.now() });
    updateLecture({ stageSurface: 'SCREEN_SHARE' });
    // The session only exists once the lecture is live, so give it a moment to start.
    window.setTimeout(() => { rtc.toggleScreenShare(); setScreenSharing(true); }, lecture.isLive ? 0 : 900);
  };

  // Render Digital Whiteboard Canvas whenever strokes or background change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background fill
    const bgMap: Record<LectureSessionState['whiteboardBg'], string> = {
      obsidian: '#0b0614',
      chalkboard: '#10281e',
      vellum: '#f7f2e7',
      grid: '#0e131f',
    };
    ctx.fillStyle = bgMap[lecture.whiteboardBg] || '#0b0614';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw subtle grid lines
    ctx.strokeStyle =
      lecture.whiteboardBg === 'vellum' ? 'rgba(20,20,30,0.08)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = step; x < canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = step; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw all strokes
    for (const s of lecture.whiteboardStrokes) {
      if (!s.points || s.points.length === 0) continue;
      ctx.save();
      if (s.tool === 'eraser') {
        ctx.strokeStyle = bgMap[lecture.whiteboardBg] || '#0b0614';
        ctx.lineWidth = s.size * 4;
      } else if (s.tool === 'highlighter') {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = s.size * 3.5;
      } else {
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = s.size;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.tool === 'text' && s.text) {
        ctx.font = `bold ${Math.max(16, s.size * 4)}px 'Outfit', sans-serif`;
        ctx.fillText(s.text, s.points[0].x, s.points[0].y);
      } else if (s.tool === 'line' && s.points.length >= 2) {
        const first = s.points[0];
        const last = s.points[s.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      } else if (s.tool === 'rect' && s.points.length >= 2) {
        const first = s.points[0];
        const last = s.points[s.points.length - 1];
        ctx.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
      } else if (s.tool === 'circle' && s.points.length >= 2) {
        const first = s.points[0];
        const last = s.points[s.points.length - 1];
        const r = Math.hypot(last.x - first.x, last.y - first.y);
        ctx.beginPath();
        ctx.arc(first.x, first.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [lecture.whiteboardStrokes, lecture.whiteboardBg, lecture.stageSurface, section]);

  const canWriteOnWhiteboard =
    isTeacher ||
    (lecture.allowStudentWhiteboard &&
      (lecture.activeStudentOnStage?.uid === viewerUid || !lecture.activeStudentOnStage));

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleWbPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canWriteOnWhiteboard) return;
    const pt = getCanvasPoint(e);
    if (wbTool === 'text') {
      const label = wbTextDraft.trim() || window.prompt('Enter whiteboard text / formula:') || '';
      if (!label.trim()) return;
      const stroke: WhiteboardStroke = {
        id: `wbs_${Date.now()}`,
        tool: 'text',
        color: wbColor,
        size: wbSize,
        points: [pt],
        text: label.trim(),
        authorName: viewerName,
      };
      updateLecture({ whiteboardStrokes: [...lecture.whiteboardStrokes, stroke] });
      setWbTextDraft('');
      return;
    }
    isDrawingRef.current = true;
    currentStrokeRef.current = {
      id: `wbs_${Date.now()}`,
      tool: wbTool,
      color: wbColor,
      size: wbSize,
      points: [pt],
      authorName: viewerName,
    };
    updateLecture({
      whiteboardStrokes: [...lecture.whiteboardStrokes, currentStrokeRef.current],
    });
  };

  const handleWbPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const pt = getCanvasPoint(e);
    const updatedStroke: WhiteboardStroke = {
      ...currentStrokeRef.current,
      points: [...currentStrokeRef.current.points, pt],
    };
    currentStrokeRef.current = updatedStroke;
    updateLecture({
      whiteboardStrokes: [
        ...lecture.whiteboardStrokes.slice(0, -1),
        updatedStroke,
      ],
    });
  };

  const handleWbPointerUp = () => {
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
  };

  const handleSaveWhiteboardToPhotos = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!club) {
      alert('Whiteboard snapshots are saved to a real class. Create a class first.');
      return;
    }
    const home = club;
    canvas.toBlob(blob => {
      if (!blob) return;
      void feedAction((async () => {
        await shareClassMedia(home, new File([blob], `whiteboard_${Date.now()}.png`, { type: 'image/png' }), {
          caption: `Lecture Whiteboard Snapshot · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          uploadedByUid: viewerUid,
          uploadedByName: viewerName,
          uploadedByRole: isTeacher ? 'TEACHER' : 'STUDENT',
          isWhiteboardSnapshot: true,
        });
        alert('Saved whiteboard snapshot to Classroom Photos!');
      })());
    }, 'image/png');
  };

  // Raise Hand / Call Student to Camera or Audio Mic Stage
  const myRaisedHand = lecture.raisedHands.find(h => h.uid === viewerUid && h.status !== 'ANSWERED');

  const handleToggleRaiseHand = () => {
    if (myRaisedHand) {
      updateLecture({
        raisedHands: lecture.raisedHands.filter(h => h.uid !== viewerUid),
        ...(lecture.activeStudentOnStage?.uid === viewerUid ? { activeStudentOnStage: null } : {}),
      });
    } else {
      const entry: RaisedHandEntry = {
        uid: viewerUid,
        name: viewerName,
        avatar: currentUserAvatar,
        promptNote: handPromptDraft.trim() || 'Would like to answer / ask a question',
        requestedMode:
          lecture.mode === 'AUDIO_LIVE_TALK' ? 'AUDIO_MIC' : handRequestMode,
        raisedAt: Date.now(),
        status: 'WAITING',
      };
      updateLecture({
        raisedHands: [...lecture.raisedHands.filter(h => h.uid !== viewerUid), entry],
      });
      setHandPromptDraft('');
    }
  };

  const handleCallStudentToStage = (entry: RaisedHandEntry) => {
    const updatedHands = lecture.raisedHands.map(h =>
      h.uid === entry.uid ? { ...h, status: 'ON_STAGE' as const } : h
    );
    updateLecture({
      isLive: true,
      raisedHands: updatedHands,
      activeStudentOnStage: { ...entry, status: 'ON_STAGE' },
      ...(entry.requestedMode === 'WHITEBOARD'
        ? { stageSurface: 'WHITEBOARD', allowStudentWhiteboard: true }
        : {}),
    });
  };

  const handleDismissStudentFromStage = (uid: string) => {
    const updatedHands = lecture.raisedHands.filter(h => h.uid !== uid);
    updateLecture({
      raisedHands: updatedHands,
      activeStudentOnStage:
        lecture.activeStudentOnStage?.uid === uid ? null : lecture.activeStudentOnStage,
    });
  };

  showReactionRef.current = (label: string) => {
    if (!label) return;
    const id = Date.now() + Math.random();
    setFloatingReactions(prev => [...prev, { id, emoji: label, left: 15 + Math.random() * 60 }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 2200);
  };
  const handleSendReaction = (label: string) => {
    showReactionRef.current(label);
    sendOpRef.current({ k: 'react', label });
  };

  const sendLectureChat = () => {
    const text = lectureChatDraft.trim();
    if (!text) return;
    updateLecture({
      lectureChat: [
        ...lecture.lectureChat,
        { id: `lchat_${Date.now()}`, senderUid: viewerUid, senderName: viewerName, senderRole: isTeacher ? 'TEACHER' : 'STUDENT', text, createdAt: Date.now() },
      ],
    });
    setLectureChatDraft('');
  };
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lecture.lectureChat.length, section]);

  // Social Feed Composer Submit
  const handleCreateSocialPost = async (data: ComposerPostData) => {
    if (!club) return;
    const text = (data.text || '').trim();
    await feedAction((async () => {
    // Files stay private to their owner and this class; only links and GIFs keep their own URL.
    const attachments = data.attachments || [];
    const files = attachments.filter((a: any) => a.file);
    const resolvedMedia = await resolveComposerMedia(attachments.filter((a: any) => !a.file), viewerUid).catch(() => []);
    const mediaUrls = resolvedMedia.map(m => m.url).filter(Boolean);
    const shared = await Promise.all(files.map((a: any) => shareClassMedia(club, a.file, {
      caption: text.slice(0, 200) || a.file.name,
      uploadedByUid: viewerUid,
      uploadedByName: viewerName,
      uploadedByRole: isTeacher ? 'TEACHER' : 'STUDENT',
      attachedToPost: true,
    })));
    await addClassroomPost(club, {
      authorUid: viewerUid,
      authorName: viewerName,
      authorRole: isTeacher ? 'TEACHER' : 'STUDENT',
      authorAvatar: currentUserAvatar,
      text,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      mediaItems: shared.length > 0 ? shared.map(s => ({ photoId: s.id, kind: s.kind })) : undefined,
      pinned: false,
    });
    })());
  };

  // Upload Photo to Classroom Gallery
  const handleUploadClassroomPhoto = async (file: File) => {
    if (!club) return;
    setUploadingPhoto(true);
    try {
      await feedAction((async () => {
        await shareClassMedia(club, file, {
          caption: photoCaption.trim() || file.name.replace(/\.[a-z0-9]+$/i, ''),
          uploadedByUid: viewerUid,
          uploadedByName: viewerName,
          uploadedByRole: isTeacher ? 'TEACHER' : 'STUDENT',
        });
        setPhotoCaption('');
      })());
    } finally {
      setUploadingPhoto(false);
    }
  };

  const effectiveRoster = rosterStudents;

  return (
    <div className="space-y-5 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Club-Model Classroom Header Banner */}
      <div style={embedded ? { display: 'none' } : undefined} className="rounded-3xl border border-white/12 bg-gradient-to-r from-[#17092b] via-[#120b24] to-[#0b0614] p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
              <ShieldCheck size={11} /> Teacher-Governed Classroom Club
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/75 text-[10px] font-bold">
              Lead Teacher: {teacherName}
            </span>
            {lecture.isLive && (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-white" /> Live Lecture On Air
              </span>
            )}
          </div>
          <h3 className="text-xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {className} — Classroom Club &amp; Live Lecture Studio
          </h3>
          <p className="text-xs text-white/60">
            {classSubtitle ||
              'Confined to the teacher and enrolled students: Classroom Social Feed, Photos Gallery, and Interactive Video/Audio Lecture with Raise Hand, On-Camera Student Answers, Screen Share & Digital Whiteboard.'}
          </p>
        </div>

        {/* 4 Club-Model Classroom Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSection('LIVE_LECTURE')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
              section === 'LIVE_LECTURE'
                ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow-lg'
                : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Radio size={13} /> Live Lecture &amp; Whiteboard
            {lecture.raisedHands.filter(h => h.status === 'WAITING').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-black text-[10px] font-black">
                ✋ {lecture.raisedHands.filter(h => h.status === 'WAITING').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSection('SOCIAL_FEED')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
              section === 'SOCIAL_FEED'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <MessagesSquare size={13} /> Classroom Social Feed ({posts.length})
          </button>

          <button
            type="button"
            onClick={() => setSection('PHOTOS')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
              section === 'PHOTOS'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <ImageIcon size={13} /> Classroom Photos ({galleryPhotos.length})
          </button>

          <button
            type="button"
            onClick={() => setSection('ROSTER')}
            className={`px-3.5 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 transition ${
              section === 'ROSTER'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users size={13} /> Class Roster ({effectiveRoster.length + 1})
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          TAB 1: SPECIAL INTERACTIVE LECTURE LIVE STREAM (VIDEO LECTURE + AUDIO LIVE TALK + SCREEN SHARE + DIGITAL WHITEBOARD)
          ═══════════════════════════════════════════════════════════════════════════ */}
      {section === 'LIVE_LECTURE' && (
        <div className={`lh${stageFullscreen ? ' wide' : ''}`}>
          <style>{LECTURE_HALL_CSS}</style>
          {telaPicker && <LiveDocPicker src={liveDoc} onClose={() => setTelaPicker(false)} onStarted={() => { if (screenSharing) { rtc.toggleScreenShare(); setScreenSharing(false); } updateLecture({ stageSurface: 'TELA_DOC', lessonSource: null }); }} />}
          <header className="lh-head">
            {lecture.isLive && <span className="lh-live"><i aria-hidden="true" />LIVE</span>}
            <h2>{className}</h2>
            {lecture.stageSurface === 'LESSON' && lecture.lessonSource && <span className="lh-sub">{lecture.lessonSource.title}</span>}
            <span style={{ flex: 1 }} />
            {isTeacher && (
              <>
                <div className="lh-seg" role="group" aria-label="Lecture type">
                  <button type="button" aria-pressed={lecture.mode === 'VIDEO_LECTURE'} onClick={() => updateLecture({ mode: 'VIDEO_LECTURE' })}><Video size={14} /> Video</button>
                  <button type="button" aria-pressed={lecture.mode === 'AUDIO_LIVE_TALK'} onClick={() => updateLecture({ mode: 'AUDIO_LIVE_TALK' })}><Volume2 size={14} /> Audio</button>
                </div>
                <div className="lh-seg" role="group" aria-label="What the class sees">
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <button type="button" aria-pressed={lecture.stageSurface === 'LESSON' || lecture.stageSurface === 'TELA_DOC'} aria-expanded={lessonPicker} onClick={() => setLessonPicker(v => !v)}><BookOpen size={14} /> Lesson</button>
                    {lessonPicker && (
                      <div className="lh-pick" role="menu" aria-label="Choose a lesson">
                        <button type="button" role="menuitem" onClick={() => { setLessonPicker(false); setTelaPicker(true); }}><strong>Present a Tela document…</strong></button>
                        {stageLessons.length === 0 && <p>This class has no lessons yet. Add one from the Lesson Library.</p>}
                        {stageLessons.map(u => (
                          <button key={u.id} type="button" role="menuitem" aria-current={lecture.lessonSource?.unitId === u.id} onClick={() => handlePutLessonOnStage(u)}>{u.title}</button>
                        ))}
                      </div>
                    )}
                  </span>
                  <button type="button" aria-pressed={lecture.stageSurface === 'CAMERA'} onClick={() => { if (screenSharing) void handleToggleScreenShare(); updateLecture({ stageSurface: 'CAMERA' }); }}>
                    {lecture.mode === 'AUDIO_LIVE_TALK' ? <Mic size={14} /> : <Camera size={14} />} {lecture.mode === 'AUDIO_LIVE_TALK' ? 'Podium' : 'Camera'}
                  </button>
                  <button type="button" aria-pressed={lecture.stageSurface === 'WHITEBOARD'} onClick={() => updateLecture({ stageSurface: 'WHITEBOARD' })}><PenTool size={14} /> Whiteboard</button>
                  <button type="button" aria-pressed={lecture.stageSurface === 'SCREEN_SHARE'} onClick={handleToggleScreenShare}><MonitorUp size={14} /> {screenSharing ? 'Stop sharing' : 'Screen'}</button>
                </div>
                {lecture.stageSurface === 'LESSON' && lecture.lessonSource && !!lessonUnit?.questions.length && (
                  <div className="lh-seg" role="group" aria-label="How the class uses this document">
                    {([['FOLLOW', 'Follow me'], ['OWN_COPY', 'Own copy'], ['TOGETHER', 'Together']] as const).map(([k, label]) => (
                      <button key={k} type="button" aria-pressed={interaction === k} onClick={() => updateLecture({ lessonSource: { ...lecture.lessonSource!, interaction: k } })}>{label}</button>
                    ))}
                  </div>
                )}
                <button type="button" className={`lh-go${lecture.isLive ? ' end' : ''}`} onClick={() => updateLecture({ isLive: !lecture.isLive, startedAt: Date.now() })}>
                  <Radio size={14} /> {lecture.isLive ? 'End class' : 'Go live'}
                </button>
              </>
            )}
          </header>

          <div className="lh-grid">
            <div className="lh-main">
            <div className="lh-stage">
              {/* Floating Classroom Reactions */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
                {floatingReactions.map(r => (
                  <div
                    key={r.id}
                    className="lh-float"
                    style={{ left: `${r.left}%` }}
                  >
                    {r.emoji}
                  </div>
                ))}
              </div>

              {/* STAGE SURFACE A: DIGITAL WHITEBOARD (Available in both Video & Audio modes!) */}
              {lecture.stageSurface === 'TELA_DOC' && liveDoc.active ? (
                <Suspense fallback={null}><LiveDocStage src={liveDoc} ownHandQueue>
                  <div className="lh-pip">
                    <video ref={teacherVideoRef} autoPlay playsInline muted style={{ opacity: lecture.isLive && lecture.mode === 'VIDEO_LECTURE' && teacherFeed && (isTeacher ? camEnabled : true) ? 1 : 0 }} />
                    <span className="mono" aria-hidden="true">{teacherName.slice(0, 2).toUpperCase()}</span>
                    <span className="who">{teacherName}</span>
                  </div>
                  {lecture.activeStudentOnStage && (
                    <div className="lh-pip on">
                      <video ref={studentVideoRef} autoPlay playsInline muted style={{ opacity: studentFeed?.getVideoTracks().some(t => t.readyState === 'live') && (!onStageMe || camEnabled) ? 1 : 0 }} />
                      <span className="mono" aria-hidden="true">{lecture.activeStudentOnStage.name.slice(0, 2).toUpperCase()}</span>
                      <span className="who">{lecture.activeStudentOnStage.name}</span>
                      {(isTeacher || onStageMe) && (
                        <button type="button" aria-label="Return to seat" title="Return to seat" onClick={() => handleDismissStudentFromStage(lecture.activeStudentOnStage!.uid)}><X size={13} /></button>
                      )}
                    </div>
                  )}
                </LiveDocStage></Suspense>
              ) : lecture.stageSurface === 'LESSON' ? (
                <LectureLessonStage
                  unit={lessonUnit}
                  followY={!isTeacher && interaction === 'FOLLOW' ? followY : undefined}
                  onScrollY={isTeacher ? handleTeacherScroll : undefined}
                  answers={interaction === 'TOGETHER' ? sharedAnswers : interaction === 'OWN_COPY' && !isTeacher ? ownAnswers : undefined}
                  onAnswer={interaction === 'TOGETHER' ? handleSharedAnswer : interaction === 'OWN_COPY' && !isTeacher ? handleOwnAnswer : undefined}
                  note={!lessonUnit?.questions.length ? undefined : interaction === 'TOGETHER' ? 'One copy for the whole class. Everyone sees what you write.'
                    : interaction === 'OWN_COPY' ? (isTeacher ? 'Each student is writing on their own private copy.' : 'Your own copy. Only you can see what you write here.') : undefined}
                >
                  <div className="lh-pip">
                    <video
                      ref={teacherVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ opacity: lecture.isLive && lecture.mode === 'VIDEO_LECTURE' && teacherFeed && (isTeacher ? camEnabled : true) ? 1 : 0 }}
                    />
                    <span className="mono" aria-hidden="true">{teacherName.slice(0, 2).toUpperCase()}</span>
                    <span className="who">{teacherName}</span>
                  </div>
                  {lecture.activeStudentOnStage && (
                    <div className="lh-pip on">
                      <video
                        ref={studentVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ opacity: studentFeed?.getVideoTracks().some(t => t.readyState === 'live') && (!onStageMe || camEnabled) ? 1 : 0 }}
                      />
                      <span className="mono" aria-hidden="true">{lecture.activeStudentOnStage.name.slice(0, 2).toUpperCase()}</span>
                      <span className="who">{lecture.activeStudentOnStage.name}</span>
                      {(isTeacher || onStageMe) && (
                        <button type="button" aria-label="Return to seat" title="Return to seat" onClick={() => handleDismissStudentFromStage(lecture.activeStudentOnStage!.uid)}><X size={13} /></button>
                      )}
                    </div>
                  )}
                </LectureLessonStage>
              ) : lecture.stageSurface === 'WHITEBOARD' ? (
                <div className="p-4 space-y-3">
                  {/* Whiteboard Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-black/60 border border-white/10 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          ['pen', '✏️ Pen'],
                          ['highlighter', '🖍️ Highlight'],
                          ['line', '📏 Line'],
                          ['rect', '▭ Box'],
                          ['circle', '◯ Circle'],
                          ['text', '🔤 Text'],
                          ['eraser', '🧽 Erase'],
                        ] as const
                      ).map(([tKey, tLabel]) => (
                        <button
                          key={tKey}
                          type="button"
                          onClick={() => setWbTool(tKey)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            wbTool === tKey
                              ? 'bg-amber-400 text-black font-black'
                              : 'bg-white/5 text-white/75 hover:bg-white/10'
                          }`}
                        >
                          {tLabel}
                        </button>
                      ))}
                    </div>

                    {/* Colors & Backgrounds */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {WHITEBOARD_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setWbColor(c)}
                          className={`w-5 h-5 rounded-full border ${
                            wbColor === c ? 'scale-125 border-white' : 'border-white/30'
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Color ${c}`}
                        />
                      ))}

                      <select
                        aria-label="Whiteboard background"
                        value={lecture.whiteboardBg}
                        onChange={e =>
                          updateLecture({
                            whiteboardBg: e.target.value as LectureSessionState['whiteboardBg'],
                          })
                        }
                        className="bg-black/70 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white ml-1"
                      >
                        <option value="obsidian">Obsidian Grid</option>
                        <option value="chalkboard">Green Chalkboard</option>
                        <option value="vellum">Warm Vellum</option>
                        <option value="grid">Blueprint Grid</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          updateLecture({
                            whiteboardStrokes: lecture.whiteboardStrokes.slice(0, -1),
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-white/10 text-[11px] font-bold text-white hover:bg-white/20"
                      >
                        Undo
                      </button>
                      {isTeacher && (
                        <button
                          type="button"
                          onClick={() => updateLecture({ whiteboardStrokes: [] })}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 text-[11px] font-bold hover:bg-rose-500/30"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveWhiteboardToPhotos}
                        className="px-2.5 py-1 rounded-lg bg-emerald-400 text-black text-[11px] font-black inline-flex items-center gap-1"
                      >
                        <Download size={11} /> Save to Photos
                      </button>
                    </div>
                  </div>

                  {/* Interactive HTML5 Whiteboard Canvas */}
                  <div className="relative rounded-2xl overflow-hidden border border-white/15">
                    <canvas
                      ref={canvasRef}
                      width={960}
                      height={500}
                      onPointerDown={handleWbPointerDown}
                      onPointerMove={handleWbPointerMove}
                      onPointerUp={handleWbPointerUp}
                      onPointerLeave={handleWbPointerUp}
                      className="w-full h-[380px] sm:h-[440px] touch-none cursor-crosshair block"
                    />

                    {/* Picture-in-Picture Teacher + Called-On Student Overlay while on Whiteboard */}
                    <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/15 rounded-2xl p-2">
                      <div className="px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-400/30 text-[11px] font-bold text-purple-200">
                        🎓 {teacherName} (Host)
                      </div>
                      {lecture.activeStudentOnStage && (
                        <div className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-bold text-emerald-200 flex items-center gap-1.5">
                          <span>✋ On Board: {lecture.activeStudentOnStage.name}</span>
                          {isTeacher && (
                            <button
                              type="button"
                              onClick={() => handleDismissStudentFromStage(lecture.activeStudentOnStage!.uid)}
                              className="text-rose-300 hover:text-white ml-1"
                              title="Return student to seat"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : lecture.stageSurface === 'SCREEN_SHARE' ? (
                /* STAGE SURFACE B: LIVE SCREEN SHARE */
                <div className="p-4 space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-cyan-400/30 bg-black min-h-[380px] flex flex-col items-center justify-center">
                    {screenSharingLive ? (
                      <video
                        ref={screenShareVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-h-[460px] object-contain"
                      />
                    ) : (
                      <div className="text-center p-8 space-y-3 max-w-md">
                        <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 grid place-items-center mx-auto">
                          <MonitorUp size={26} />
                        </div>
                        <h4 className="text-base font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          Classroom Screen Share &amp; Tela Presentation Stage
                        </h4>
                        <p className="text-xs text-white/60 leading-relaxed">
                          {isTeacher
                            ? 'Share your desktop window, slide deck, or interactive Tela document with the entire classroom. Students who raise their hand can also be invited on camera/mic while you share your screen.'
                            : "Your teacher's shared screen appears here when they start sharing."}
                        </p>
                        {isTeacher && <button
                          type="button"
                          onClick={handleToggleScreenShare}
                          className="px-5 py-2.5 rounded-full bg-cyan-400 text-black text-xs font-black inline-flex items-center gap-1.5"
                        >
                          <MonitorUp size={14} /> Start Live Screen Share
                        </button>}
                      </div>
                    )}
                  </div>
                </div>
              ) : lecture.mode === 'VIDEO_LECTURE' ? (
                /* STAGE SURFACE C1: INTERACTIVE VIDEO LECTURE (Teacher Camera + Split-Screen Student On-Camera Answer!) */
                <div className="p-4 space-y-3">
                  <div
                    className={`grid gap-3 ${
                      lecture.activeStudentOnStage ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                    }`}
                  >
                    {/* Teacher Primary Video Tile */}
                    <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-gradient-to-br from-[#1d0c36] via-[#110822] to-[#080410] min-h-[320px] flex flex-col justify-between p-4">
                      <video
                        ref={teacherVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`absolute inset-0 w-full h-full object-cover ${
                          lecture.isLive && teacherFeed && (isTeacher ? camEnabled : true) ? 'opacity-90' : 'opacity-0 pointer-events-none'
                        }`}
                      />
                      <div className="relative z-10 flex items-center justify-between">
                        <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-xs font-black text-white inline-flex items-center gap-1.5">
                          🎓 {teacherName} · Lecture Host
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-600/90 text-[10px] font-black uppercase text-white">
                          {lecture.isLive ? 'LIVE VIDEO' : 'STUDIO PREVIEW'}
                        </span>
                      </div>

                      {(!lecture.isLive || !teacherFeed || (isTeacher && !camEnabled)) && (
                        <div className="relative z-10 my-auto text-center space-y-2 py-8">
                          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] mx-auto grid place-items-center text-2xl font-black text-white shadow-2xl">
                            {teacherName.slice(0, 2).toUpperCase()}
                          </div>
                          <p className="text-sm font-black text-white">{teacherName}</p>
                          <p className="text-xs text-white/55">
                            {lecture.isLive
                              ? isTeacher ? 'Camera off · students still hear you' : 'Connecting to the lecture…'
                              : isTeacher ? 'Click "Go Live Now" above to start the interactive video lecture' : 'Waiting for your teacher to start the lecture'}
                          </p>
                        </div>
                      )}

                      <div className="relative z-10 flex items-center justify-between text-[11px] text-white/75 bg-black/60 backdrop-blur-md rounded-xl px-3 py-2">
                        <span>{className}</span>
                        <span>
                          {lecture.activeStudentOnStage
                            ? `Split-Stage with ${lecture.activeStudentOnStage.name}`
                            : `${lecture.raisedHands.filter(h => h.status === 'WAITING').length} Hands Raised`}
                        </span>
                      </div>
                    </div>

                    {/* Student On-Camera Answer Tile (Appears when Teacher calls on a raised hand!) */}
                    {lecture.activeStudentOnStage && (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-400/60 bg-gradient-to-br from-[#08241c] via-[#071915] to-[#050e0c] min-h-[320px] flex flex-col justify-between p-4 shadow-2xl">
                        <video
                          ref={studentVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`absolute inset-0 w-full h-full object-cover ${
                            studentFeed?.getVideoTracks().some(t => t.readyState === 'live') && (!onStageMe || camEnabled)
                              ? 'opacity-90'
                              : 'opacity-0 pointer-events-none'
                          }`}
                        />
                        <div className="relative z-10 flex items-center justify-between gap-2">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 text-xs font-black inline-flex items-center gap-1.5">
                            📹 Student On Camera · {lecture.activeStudentOnStage.name}
                          </span>
                          {(isTeacher || lecture.activeStudentOnStage.uid === viewerUid) && (
                            <button
                              type="button"
                              onClick={() => handleDismissStudentFromStage(lecture.activeStudentOnStage!.uid)}
                              className="px-2.5 py-1 rounded-full bg-rose-500/25 border border-rose-400/40 text-rose-200 text-[10px] font-black hover:bg-rose-500/40"
                            >
                              Return to Seat
                            </button>
                          )}
                        </div>

                        <div className="relative z-10 my-auto text-center space-y-2 py-6">
                          <div className="w-20 h-20 rounded-3xl bg-emerald-500/25 border-2 border-emerald-400 mx-auto grid place-items-center text-2xl font-black text-emerald-200 shadow-lg">
                            {lecture.activeStudentOnStage.name.slice(0, 2).toUpperCase()}
                          </div>
                          <p className="text-base font-black text-white">
                            {lecture.activeStudentOnStage.name}
                          </p>
                          <p className="text-xs text-emerald-200/90 max-w-xs mx-auto">
                            &ldquo;{lecture.activeStudentOnStage.promptNote || 'Answering teacher’s question on camera'}&rdquo;
                          </p>
                        </div>

                        <div className="relative z-10 flex items-center justify-between text-[11px] text-emerald-200/80 bg-black/60 backdrop-blur-md rounded-xl px-3 py-2">
                          <span>Live Mic &amp; Camera Active</span>
                          <button
                            type="button"
                            onClick={() => isTeacher && updateLecture({ stageSurface: 'WHITEBOARD' })}
                            className="text-amber-300 font-bold hover:underline"
                          >
                            Open Whiteboard Together →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* STAGE SURFACE C2: AUDIO-ONLY INTERACTIVE LECTURE (Repurposed Plajah Live Talk Stage!) */
                <div className="p-5 space-y-5 bg-gradient-to-b from-[#17092e] via-[#0e061c] to-[#080310] min-h-[360px]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">
                        Plajah Live Talk · Interactive Audio Lecture Stage
                      </span>
                      <h4 className="text-base font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {className} — Speaker Podium &amp; Raised-Hand Audio Q&amp;A
                      </h4>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 text-xs font-bold">
                      {1 + (lecture.activeStudentOnStage ? 1 : 0)} on Stage · {effectiveRoster.length} Listening
                    </span>
                  </div>

                  {/* Live Talk Speaker Podium (Teacher Host + Called-On Student Speaker) */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                      🎙️ Active Lecture Podium (Speakers)
                    </p>
                    <div className="flex flex-wrap gap-4 items-center">
                      {/* Teacher Tile */}
                      <div className="flex items-center gap-3 rounded-2xl border border-purple-400/40 bg-purple-500/10 p-3.5 min-w-[230px]">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] grid place-items-center text-white font-black text-sm shadow-[0_0_0_3px_rgba(212,0,85,0.45)]">
                          {teacherName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-white truncate">{teacherName}</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[8px] font-black uppercase">
                              Teacher Host
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-300 flex items-center gap-1 mt-0.5">
                            <Mic size={11} /> Speaking · Live Audio
                          </p>
                        </div>
                      </div>

                      {/* Called-On Student Speaker Tile */}
                      {lecture.activeStudentOnStage ? (
                        <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/15 p-3.5 min-w-[250px]">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-400 text-black grid place-items-center font-black text-sm shadow-[0_0_0_3px_rgba(16,185,129,0.5)]">
                            {lecture.activeStudentOnStage.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-white truncate">
                                {lecture.activeStudentOnStage.name}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-400 text-black text-[8px] font-black uppercase">
                                Answering
                              </span>
                            </div>
                            <p className="text-[11px] text-emerald-200 truncate mt-0.5">
                              🎙️ Unmuted: {lecture.activeStudentOnStage.promptNote}
                            </p>
                          </div>
                          {(isTeacher || lecture.activeStudentOnStage.uid === viewerUid) && (
                            <button
                              type="button"
                              onClick={() => handleDismissStudentFromStage(lecture.activeStudentOnStage!.uid)}
                              className="p-1.5 rounded-lg bg-rose-500/25 text-rose-200 hover:bg-rose-500/40"
                              title="Mute & return to listener row"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/15 px-4 py-3 text-xs text-white/50">
                          When a student raises their hand (✋), click <strong>Call On &amp; Unmute</strong> to bring them to the Live Talk podium to answer!
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {[...rtc.remoteStreams.entries()].map(([id, st]) => <RemoteAudio key={id} stream={st} />)}
            </div>

            <div className="lh-floor">
              <div className="lh-seats" aria-label="Class seats">
                {effectiveRoster.length === 0 && <span className="lh-empty">No students on the roster yet.</span>}
                {effectiveRoster.slice(0, 12).map(stu => {
                  const up = lecture.raisedHands.some(h => h.status === 'WAITING' && (h.uid === stu.id || h.name.toLowerCase() === stu.name.toLowerCase()));
                  return (
                    <div key={stu.id} className={`lh-seat${up ? ' up' : ''}`} title={up ? `${stu.name} has a hand up` : stu.name}>
                      <span>{stu.name.slice(0, 2).toUpperCase()}</span>
                      <em>{stu.name.split(' ')[0]}</em>
                    </div>
                  );
                })}
                {effectiveRoster.length > 12 && <div className="lh-seat"><span>+{effectiveRoster.length - 12}</span><em>More</em></div>}
              </div>
              <nav className="lh-ctl" aria-label="Session controls">
                {(isTeacher || onStageMe) && (
                  <button type="button" className={micMuted ? 'off' : ''} aria-pressed={!micMuted} onClick={() => setMicMuted(m => !m)}>
                    {micMuted ? <MicOff size={16} /> : <Mic size={16} />} {micMuted ? 'Muted' : 'Mic on'}
                  </button>
                )}
                {(isTeacher || onStageMe) && lecture.mode === 'VIDEO_LECTURE' && (
                  <button type="button" className={camEnabled ? '' : 'off'} aria-pressed={camEnabled} onClick={() => setCamEnabled(c => !c)}>
                    {camEnabled ? <Video size={16} /> : <VideoOff size={16} />} {camEnabled ? 'Camera on' : 'Camera off'}
                  </button>
                )}
                {!isTeacher && (
                  <button type="button" className={myRaisedHand ? 'hand' : ''} aria-pressed={!!myRaisedHand} onClick={handleToggleRaiseHand}>
                    <Hand size={16} /> {myRaisedHand ? 'Lower hand' : 'Raise hand'}
                  </button>
                )}
                <button type="button" aria-label={stageFullscreen ? 'Show the chat' : 'Hide the chat'} title={stageFullscreen ? 'Show the chat' : 'Hide the chat'} onClick={() => setStageFullscreen(f => !f)}>
                  {stageFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </nav>
            </div>

              {(isTeacher || onStageMe) && rtc.localStream && (
                <div className="border-t border-white/10 bg-black/70 px-4 py-2 space-y-2">
                  <div className="flex items-center gap-3">
                    <LevelMeter source={rtc.localAudioTrack} label="Your mic" muted={micMuted} className="flex-1" />
                    <button type="button" onClick={() => setMediaSheet(v => !v)}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${mediaSheet || fx.active ? 'bg-orange-500 text-black' : 'bg-white/10 text-white'}`}>
                      <Sparkles size={13} /> Camera, mic &amp; effects
                    </button>
                  </div>
                  {mediaSheet && (
                    <Suspense fallback={null}>
                      <LiveMediaSheet rtc={rtc} fx={fx} onClose={() => setMediaSheet(false)} micMuted={micMuted}
                        video={lecture.mode === 'VIDEO_LECTURE'} className="!w-full" />
                    </Suspense>
                  )}
                </div>
              )}
              {rtc.error && (isTeacher || onStageMe) && (
                <p className="px-4 py-2 text-[11px] font-bold text-rose-300 bg-rose-500/10 border-t border-rose-400/20">{rtc.error}</p>
              )}
              {isTeacher && lecture.isLive && rosterStudents.length === 0 && (
                <p className="px-4 py-2 text-[11px] text-amber-200 bg-amber-500/10 border-t border-amber-400/20">
                  This class has no roster yet, so anyone who opens this class can watch. Add students to keep the lecture to your class.
                </p>
              )}
            </div>

            {!stageFullscreen && (
              <aside className="lh-side" aria-label="Class conversation">
                <div className="lh-side-h">
                  <h3>Class conversation</h3>
                  <span>{effectiveRoster.length} in class</span>
                </div>

                {isTeacher && lecture.raisedHands.length > 0 && (
                  <div className="lh-hands" aria-label="Raised hands">
                    {lecture.raisedHands.map((h, i) => {
                      const isOnStage = lecture.activeStudentOnStage?.uid === h.uid;
                      const how = h.requestedMode === 'CAMERA' ? 'on camera' : h.requestedMode === 'WHITEBOARD' ? 'on the whiteboard' : 'by mic';
                      return (
                        <div key={h.uid} className={`lh-hand${i === 0 ? ' first' : ''}`}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <strong>{isOnStage ? `${h.name} is answering` : `${h.name} wants to answer ${how}`}</strong>
                            {h.promptNote && <p>{h.promptNote}</p>}
                          </div>
                          {isOnStage ? (
                            <button type="button" onClick={() => handleDismissStudentFromStage(h.uid)}>Return to seat</button>
                          ) : (
                            <button type="button" onClick={() => handleCallStudentToStage(h)}>Call on</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isTeacher && !myRaisedHand && (
                  <div className="lh-askhow">
                    <input
                      value={handPromptDraft}
                      onChange={e => setHandPromptDraft(e.target.value)}
                      aria-label="What you want to say"
                      placeholder="I have the answer to number 3"
                    />
                    <select aria-label="How to answer" value={handRequestMode} onChange={e => setHandRequestMode(e.target.value as any)}>
                      <option value="CAMERA">Answer on camera</option>
                      <option value="AUDIO_MIC">Answer by mic</option>
                      <option value="WHITEBOARD">Answer on the whiteboard</option>
                    </select>
                  </div>
                )}

                <div className="lh-chat" ref={chatScrollRef}>
                  {lecture.lectureChat.length === 0 && <p className="lh-empty">Questions and answers from the class show up here.</p>}
                  {lecture.lectureChat.map(m => (
                    <div key={m.id} className={`lh-msg${m.senderUid === viewerUid ? ' me' : ''}`}>
                      <b>{m.senderName}{m.senderRole === 'TEACHER' ? ' · Teacher' : ''}</b>
                      <p>{m.text}</p>
                    </div>
                  ))}
                </div>

                {!isTeacher && (
                  <div className="lh-reacts" role="group" aria-label="Quick reactions">
                    {['Got it', 'Slow down', ...(contextKind === 'CHRISTIAN_EDUCATION' ? ['Amen'] : ['Question'])].map(label => (
                      <button key={label} type="button" onClick={() => handleSendReaction(label)}>{label}</button>
                    ))}
                  </div>
                )}

                <form className="lh-send" onSubmit={e => { e.preventDefault(); sendLectureChat(); }}>
                  <input
                    value={lectureChatDraft}
                    onChange={e => setLectureChatDraft(e.target.value)}
                    aria-label="Message the class"
                    placeholder="Message the class"
                  />
                  <button type="submit" aria-label="Send"><Send size={15} /></button>
                </form>
              </aside>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          TAB 2: CLASSROOM SOCIAL FEED (CLUB TIMELINE CONFINED TO TEACHER & STUDENTS)
          ═══════════════════════════════════════════════════════════════════════════ */}
      {section === 'SOCIAL_FEED' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                Classroom Club Social Feed · Governed by {teacherName}
              </span>
              <span className="text-[11px] text-white/50">
                Visible only to {className} teacher &amp; enrolled students
              </span>
            </div>
            {club ? (
              <UniversalPostComposer
                currentUser={auth.currentUser}
                compact
                placeholder={`Post an announcement, question, study note, or Tela assignment to ${className}...`}
                postLabel="Post to Class"
                onPost={handleCreateSocialPost}
              />
            ) : (
              <p className="text-xs text-white/55">This is a sample class. Create a class with students to post to its feed.</p>
            )}
            {feedError && <p data-club-feed-error className="text-xs text-rose-300">{feedError}</p>}
          </div>

          <div className="space-y-3">
            {posts.length === 0 && (
              <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
                <MessagesSquare size={22} className="mx-auto text-white/25 mb-2" />
                <p className="text-sm font-bold text-white/70">No posts yet</p>
                <p className="text-xs text-white/45 mt-1">
                  {isTeacher ? 'Post an announcement or a question to start the class feed.' : 'When your teacher or classmates post, it shows up here.'}
                </p>
              </div>
            )}
            {[...posts]
              .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
              .map(post => {
                const liked = post.likes.includes(viewerUid);
                return (
                  <div
                    key={post.id}
                    className={`rounded-3xl border p-4 space-y-3 ${
                      post.pinned
                        ? 'border-amber-400/45 bg-amber-500/[0.06]'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] grid place-items-center text-xs font-black text-white">
                          {post.authorName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-white">{post.authorName}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                post.authorRole === 'TEACHER'
                                  ? 'bg-amber-400 text-black'
                                  : 'bg-white/10 text-white/75'
                              }`}
                            >
                              {post.authorRole}
                            </span>
                            {post.pinned && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-[9px] font-bold inline-flex items-center gap-1">
                                <Pin size={9} /> Pinned by Teacher
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-white/40">
                            {new Date(post.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isTeacher && club && (
                          <button
                            type="button"
                            onClick={() => feedAction(setClassroomPostPin(club, post.id, !post.pinned))}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] font-bold text-white/70"
                          >
                            {post.pinned ? 'Unpin' : 'Pin Post'}
                          </button>
                        )}
                        {club && (isTeacher || post.authorUid === viewerUid) && (
                          <button
                            type="button"
                            onClick={() => setEditing({ id: post.id, draft: post.text })}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] font-bold text-white/60"
                          >
                            Edit
                          </button>
                        )}
                        {club && (isTeacher || post.authorUid === viewerUid) && (
                          <button
                            type="button"
                            onClick={() => { if (confirm('Delete this post for everyone in the class?')) feedAction(deleteClassroomPost(club, post)); }}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-rose-500/25 text-[10px] font-bold text-white/60"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {editing?.id === post.id && club ? (
                      <CopyEditor
                        value={editing.draft}
                        multiline
                        onChange={draft => setEditing({ id: post.id, draft })}
                        onCancel={() => setEditing(null)}
                        onSave={() => { feedAction(editClassroomPost(club, post.id, editing.draft.trim(), viewerUid)); setEditing(null); }}
                      />
                    ) : (
                      <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{post.text}</p>
                    )}
                    {post.editedAt && <p className="text-[10px] text-white/40">Edited{post.editedByUid !== post.authorUid ? ' by the teacher' : ''}</p>}

                    {club && post.mediaItems && post.mediaItems.length > 0 && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        {post.mediaItems.map(m => (
                          <ClubMedia key={m.photoId} home={club} photoId={m.photoId} kind={m.kind} alt="" className="rounded-2xl max-h-64 w-full object-cover border border-white/10" />
                        ))}
                      </div>
                    )}

                    {post.mediaUrls && post.mediaUrls.length > 0 && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        {post.mediaUrls.map((u, i) => (
                          <img
                            key={i}
                            src={u}
                            alt=""
                            className="rounded-2xl max-h-64 w-full object-cover border border-white/10"
                          />
                        ))}
                      </div>
                    )}

                    {post.telaDocId && (
                      <div className="rounded-2xl border border-purple-400/35 bg-purple-500/10 p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles size={15} className="text-amber-300" />
                          <span className="text-xs font-bold text-white">
                            Interactive Tela Document: {post.telaTitle || post.telaDocId}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('plajah:openTela', { detail: { docId: post.telaDocId } })
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-amber-400 text-black text-[11px] font-black inline-flex items-center gap-1"
                        >
                          <ExternalLink size={11} /> Open in Tela
                        </button>
                      </div>
                    )}

                    {/* Like & Comment Footer */}
                    <div className="flex items-center gap-4 pt-2 border-t border-white/10 text-xs">
                      <button
                        type="button"
                        onClick={() => club && feedAction(setClassroomPostLike(club, post.id, viewerUid, !liked))}
                        className={`inline-flex items-center gap-1.5 font-bold ${
                          liked ? 'text-rose-400' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
                        {post.likes.length} {post.likes.length === 1 ? 'Like' : 'Likes'}
                      </button>
                      <span className="text-white/50">
                        {post.comments.length} {post.comments.length === 1 ? 'Comment' : 'Comments'}
                      </span>
                    </div>

                    {/* Comments */}
                    {post.comments.length > 0 && (
                      <div className="space-y-1.5 pl-3 border-l-2 border-white/10">
                        {post.comments.map(c => (
                          <div key={c.id} className="text-xs">
                            <span className="font-bold text-white mr-1.5">{c.authorName}:</span>
                            <span className="text-white/75">{c.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        value={commentDrafts[post.id] || ''}
                        onChange={e =>
                          setCommentDrafts(prev => ({ ...prev, [post.id]: e.target.value }))
                        }
                        onKeyDown={e => {
                          if (e.key === 'Enter' && club && (commentDrafts[post.id] || '').trim()) {
                            e.preventDefault();
                            feedAction(addClassroomPostComment(club, post.id, {
                              authorUid: viewerUid,
                              authorName: viewerName,
                              authorRole: isTeacher ? 'TEACHER' : 'STUDENT',
                              text: commentDrafts[post.id].trim(),
                            }));
                            setCommentDrafts(prev => ({ ...prev, [post.id]: '' }));
                          }
                        }}
                        placeholder="Write a class reply..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const txt = (commentDrafts[post.id] || '').trim();
                          if (!txt || !club) return;
                          feedAction(addClassroomPostComment(club, post.id, {
                            authorUid: viewerUid,
                            authorName: viewerName,
                            authorRole: isTeacher ? 'TEACHER' : 'STUDENT',
                            text: txt,
                          }));
                          setCommentDrafts(prev => ({ ...prev, [post.id]: '' }));
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          TAB 3: CLASSROOM PHOTOS & WHITEBOARD GALLERY
          ═══════════════════════════════════════════════════════════════════════════ */}
      {section === 'PHOTOS' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <h4 className="text-sm font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {className} · Photos, Handouts &amp; Whiteboard Snapshots
              </h4>
              <p className="text-xs text-white/55">
                Share photos of classroom projects, memory-verse art, lab notes, or saved Digital Whiteboard snapshots.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={photoCaption}
                onChange={e => setPhotoCaption(e.target.value)}
                placeholder="Photo caption (optional)..."
                className="bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
              />
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadClassroomPhoto(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploadingPhoto || !club}
                onClick={() => photoInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5"
              >
                <Upload size={13} /> {uploadingPhoto ? 'Uploading...' : 'Upload Classroom Photo'}
              </button>
            </div>
          </div>

          {feedError && <p data-club-feed-error className="text-xs text-rose-300">{feedError}</p>}
          {galleryPhotos.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
              <ImageIcon size={22} className="mx-auto text-white/25 mb-2" />
              <p className="text-sm font-bold text-white/70">No photos yet</p>
              <p className="text-xs text-white/45 mt-1">Upload a class photo, or save a lecture whiteboard to keep it here.</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {galleryPhotos.map(ph => (
              <div
                key={ph.id}
                onClick={() => setLightboxPhoto(ph)}
                className="group rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden cursor-pointer hover:border-amber-400/50 transition"
              >
                <div className="h-48 bg-black overflow-hidden relative">
                  {club && <ClubMedia home={club} photoId={ph.id} kind={ph.kind} alt={ph.caption} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />}
                  {ph.isWhiteboardSnapshot && (
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-amber-400 text-black text-[9px] font-black uppercase">
                      Whiteboard Snapshot
                    </span>
                  )}
                </div>
                <div className="p-3.5 space-y-1">
                  {editing?.id === ph.id && club ? (
                    <div onClick={e => e.stopPropagation()}>
                      <CopyEditor
                        value={editing.draft}
                        onChange={draft => setEditing({ id: ph.id, draft })}
                        onCancel={() => setEditing(null)}
                        onSave={() => { feedAction(editClassroomPhotoCaption(club, ph.id, editing.draft.trim(), viewerUid)); setEditing(null); }}
                      />
                    </div>
                  ) : (
                    <p className="text-xs font-bold text-white truncate">{ph.caption}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-white/45">
                      Uploaded by {ph.uploadedByName} ({ph.uploadedByRole})
                    </p>
                    {club && (isTeacher || ph.uploadedByUid === viewerUid) && (
                      <span className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setEditing({ id: ph.id, draft: ph.caption }); }}
                          className="text-[10px] font-bold text-white/50 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const msg = ph.uploadedByUid === viewerUid
                              ? 'Remove this from the class? Your original stays in your files.'
                              : `Remove the class's copy? The original stays with ${ph.uploadedByName || 'its owner'}.`;
                            if (confirm(msg)) feedAction(deleteClassroomPhoto(club, ph.id));
                          }}
                          className="text-[10px] font-bold text-white/50 hover:text-rose-300"
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {lightboxPhoto && (
            <div
              onClick={() => setLightboxPhoto(null)}
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div
                onClick={e => e.stopPropagation()}
                className="max-w-3xl w-full rounded-3xl border border-white/15 bg-[#0e071a] overflow-hidden p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-white">{lightboxPhoto.caption}</h4>
                  <button
                    type="button"
                    onClick={() => setLightboxPhoto(null)}
                    className="p-1.5 rounded-full bg-white/10 text-white"
                  >
                    <X size={15} />
                  </button>
                </div>
                {club && <ClubMedia home={club} photoId={lightboxPhoto.id} kind={lightboxPhoto.kind} alt={lightboxPhoto.caption} className="w-full max-h-[70vh] object-contain rounded-2xl bg-black" />}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          TAB 4: TEACHER-GOVERNED CLASS ROSTER
          ═══════════════════════════════════════════════════════════════════════════ */}
      {section === 'ROSTER' && (
        <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                Confined Classroom Club Membership
              </span>
              <h4 className="text-base font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {className} — Teacher &amp; Enrolled Students ({effectiveRoster.length + 1})
              </h4>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Governing Teacher Card */}
            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3.5 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-400 text-black grid place-items-center font-black text-sm">
                {teacherName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-white truncate">{teacherName}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-amber-300">
                  <UserCheck size={11} /> Classroom Club Owner / Teacher
                </span>
              </div>
            </div>

            {effectiveRoster.map(stu => (
              <div
                key={stu.id}
                className="rounded-2xl border border-white/10 bg-black/35 p-3.5 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 grid place-items-center text-xs font-bold text-white">
                    {stu.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{stu.name}</p>
                    <p className="text-[10px] text-white/45">{stu.roleLabel || 'Enrolled Student'}</p>
                  </div>
                </div>
                {isTeacher && (
                  <button
                    type="button"
                    onClick={() => {
                      setSection('LIVE_LECTURE');
                      handleCallStudentToStage({
                        uid: stu.id,
                        name: stu.name,
                        requestedMode: 'CAMERA',
                        promptNote: 'Called on by Teacher',
                        raisedAt: Date.now(),
                        status: 'ON_STAGE',
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-emerald-400 hover:text-black text-[10px] font-bold text-white transition"
                  >
                    Call On
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedClassroomClubHub;
