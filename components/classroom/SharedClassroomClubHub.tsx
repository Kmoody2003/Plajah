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
} from 'lucide-react';
import { useRtcSession } from '../../hooks/useRtcSession';
import { useLiveFx } from '../../hooks/useLiveFx';
import { LevelMeter } from '../live/LevelMeter';
import UniversalPostComposer, { type ComposerSubmitData } from '../UniversalPostComposer';
import { resolveComposerMedia } from '../FeedView';
import { uploadFile, auth } from '../../services/backendService';
import {
  loadClassroomPosts,
  addClassroomPost,
  toggleClassroomPostLike,
  toggleClassroomPostPin,
  addClassroomPostComment,
  loadClassroomPhotos,
  addClassroomPhoto,
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
  initialSection?: 'SOCIAL_FEED' | 'PHOTOS' | 'LIVE_LECTURE' | 'ROSTER';
  /** Rendered inside a parent club (Christian Ed class): the parent owns the cover and channel pills,
   *  so the banner and section tabs are hidden and `initialSection` drives the section. */
  embedded?: boolean;
}

const WHITEBOARD_COLORS = ['#FFFFFF', '#FF8C00', '#00DAF3', '#06D6A0', '#D40055', '#FFD24A', '#A78BFA'];
const LiveMediaSheet = lazy(() => import('../live/LiveMediaSheet'));

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
  | { k: 'leaveStage' };
// SCTP messages over ~256 KB are dropped; keep the broadcast state well under that.
const MAX_STATE_BYTES = 200_000;

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
  initialSection = 'LIVE_LECTURE',
  embedded = false,
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
  const [posts, setPosts] = useState<ClassroomSocialPost[]>(() =>
    loadClassroomPosts(classId)
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // ── 2. Classroom Photos Gallery State ──
  const [photos, setPhotos] = useState<ClassroomPhotoItem[]>(() =>
    loadClassroomPhotos(classId)
  );
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<ClassroomPhotoItem | null>(null);
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

  useEffect(() => {
    setPosts(loadClassroomPosts(classId));
    setPhotos(loadClassroomPhotos(classId));
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
          if (msg.type === 'lecture:op' && msg.payload) applyStudentOp(peerId, msg.payload as LectureOp);
          if (msg.type === 'lecture:hello') broadcastRef.current();
        } else if (msg.type === 'lecture:state' && msg.payload && peerId === teacherUid) {
          gotStateRef.current = true;
          setLecture(msg.payload as LectureSessionState);
        }
      },
    },
  );
  const fx = useLiveFx(rtc);
  const [mediaSheet, setMediaSheet] = useState(false);
  sendOpRef.current = op => rtc.sendData('lecture:op', op);

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
    const dataUrl = canvas.toDataURL('image/png');
    const nextPhotos = addClassroomPhoto(classId, {
      url: dataUrl,
      caption: `Lecture Whiteboard Snapshot · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      uploadedByUid: viewerUid,
      uploadedByName: viewerName,
      uploadedByRole: isTeacher ? 'TEACHER' : 'STUDENT',
      isWhiteboardSnapshot: true,
    });
    setPhotos(nextPhotos);
    alert('Saved whiteboard snapshot to Classroom Photos!');
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

  const handleTriggerReaction = (emoji: string) => {
    const id = Date.now() + Math.random();
    setFloatingReactions(prev => [...prev, { id, emoji, left: 15 + Math.random() * 70 }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 2200);
  };

  // Social Feed Composer Submit
  const handleCreateSocialPost = async (data: ComposerSubmitData) => {
    const text = (data.text || '').trim();
    const resolvedMedia = await resolveComposerMedia(data.attachments || [], viewerUid).catch(() => []);
    const mediaUrls = resolvedMedia.map(m => m.url).filter(Boolean);
    const next = addClassroomPost(classId, {
      authorUid: viewerUid,
      authorName: viewerName,
      authorRole: isTeacher ? 'TEACHER' : 'STUDENT',
      authorAvatar: currentUserAvatar,
      text,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      telaDocId: data.assetEmbed?.kind === 'TELA_DOC' ? data.assetEmbed.id : undefined,
      telaTitle: data.assetEmbed?.kind === 'TELA_DOC' ? data.assetEmbed.title : undefined,
      pinned: false,
    });
    setPosts(next);
  };

  // Upload Photo to Classroom Gallery
  const handleUploadClassroomPhoto = async (file: File) => {
    setUploadingPhoto(true);
    try {
      let url = '';
      try {
        url = await uploadFile(`uploads/organizations/${classId}/gallery_${Date.now()}_${file.name}`, file);
      } catch {
        url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => reject(new Error('Could not read image'));
          r.readAsDataURL(file);
        });
      }
      const next = addClassroomPhoto(classId, {
        url,
        caption: photoCaption.trim() || file.name.replace(/\.[a-z0-9]+$/i, ''),
        uploadedByUid: viewerUid,
        uploadedByName: viewerName,
        uploadedByRole: isTeacher ? 'TEACHER' : 'STUDENT',
      });
      setPhotos(next);
      setPhotoCaption('');
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
            <ImageIcon size={13} /> Classroom Photos ({photos.length})
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
        <div className="space-y-4">
          {/* Top Lecture Control Bar: Video Lecture vs Audio Live Talk + Stage Surface Switcher */}
          <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-4 flex flex-wrap items-center justify-between gap-3">
            {/* Broadcast Mode Switcher (Video Lecture vs Audio Live Talk) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/45 mr-1">
                Lecture Mode:
              </span>
              <button
                type="button"
                onClick={() => isTeacher && updateLecture({ mode: 'VIDEO_LECTURE' })}
                className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                  lecture.mode === 'VIDEO_LECTURE'
                    ? 'bg-[#D40055] text-white shadow'
                    : 'bg-white/5 text-white/65 hover:text-white'
                }`}
              >
                <Video size={13} /> Video Lecture (On-Camera Student Answers)
              </button>
              <button
                type="button"
                onClick={() => isTeacher && updateLecture({ mode: 'AUDIO_LIVE_TALK' })}
                className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                  lecture.mode === 'AUDIO_LIVE_TALK'
                    ? 'bg-[#8B5CF6] text-white shadow'
                    : 'bg-white/5 text-white/65 hover:text-white'
                }`}
              >
                <Volume2 size={13} /> Audio Live Talk Lecture (Interactive Podium)
              </button>
            </div>

            {/* Stage Surface Switcher (Camera/Podium · Screen Share · Digital Whiteboard) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => isTeacher && updateLecture({ stageSurface: 'CAMERA' })}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                  lecture.stageSurface === 'CAMERA'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 border-white/15 text-white/75 hover:text-white'
                }`}
              >
                {lecture.mode === 'AUDIO_LIVE_TALK' ? <Mic size={13} /> : <Camera size={13} />}
                {lecture.mode === 'AUDIO_LIVE_TALK' ? 'Audio Podium' : 'Camera Stage'}
              </button>

              <button
                type="button"
                onClick={handleToggleScreenShare}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                  lecture.stageSurface === 'SCREEN_SHARE'
                    ? 'bg-cyan-400 text-black border-cyan-300 font-black'
                    : 'bg-white/5 border-white/15 text-white/75 hover:text-white'
                }`}
              >
                <MonitorUp size={13} /> {screenSharing ? 'Stop Screen Share' : 'Share Screen'}
              </button>

              <button
                type="button"
                onClick={() => isTeacher && updateLecture({ stageSurface: 'WHITEBOARD' })}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                  lecture.stageSurface === 'WHITEBOARD'
                    ? 'bg-amber-400 text-black border-amber-300 font-black'
                    : 'bg-white/5 border-white/15 text-white/75 hover:text-white'
                }`}
              >
                <PenTool size={13} /> Digital Whiteboard
              </button>

              {isTeacher && (
                <button
                  type="button"
                  onClick={() => updateLecture({ isLive: !lecture.isLive, startedAt: Date.now() })}
                  className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow ${
                    lecture.isLive
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-400 hover:bg-emerald-300 text-black'
                  }`}
                >
                  <Radio size={13} /> {lecture.isLive ? 'End Lecture' : 'Go Live Now'}
                </button>
              )}
            </div>
          </div>

          {/* Main Lecture Grid: Stage (8 cols) + Raise Hand Queue & Live Lecture Chat (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT 8 COLS: PRIMARY LECTURE STAGE */}
            <div
              className={`${
                stageFullscreen ? ' lg:col-span-12' : 'lg:col-span-8'
              } rounded-3xl border border-white/15 bg-[#090412] overflow-hidden shadow-2xl relative`}
            >
              {/* Floating Classroom Reactions */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
                {floatingReactions.map(r => (
                  <div
                    key={r.id}
                    className="absolute bottom-16 text-2xl animate-bounce"
                    style={{ left: `${r.left}%` }}
                  >
                    {r.emoji}
                  </div>
                ))}
              </div>

              {/* STAGE SURFACE A: DIGITAL WHITEBOARD (Available in both Video & Audio modes!) */}
              {lecture.stageSurface === 'WHITEBOARD' ? (
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

                  {/* Classroom Listener Rows */}
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/45">
                      🎧 Classroom Listeners ({effectiveRoster.length})
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {effectiveRoster.map(stu => {
                        const hand = lecture.raisedHands.find(
                          h => h.name.toLowerCase() === stu.name.toLowerCase() && h.status === 'WAITING'
                        );
                        return (
                          <div
                            key={stu.id}
                            className={`rounded-2xl border p-2.5 flex items-center gap-2.5 ${
                              hand
                                ? 'border-amber-400/60 bg-amber-500/10'
                                : 'border-white/10 bg-black/35'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-xl bg-white/10 grid place-items-center text-xs font-bold text-white shrink-0">
                              {stu.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-white truncate">{stu.name}</p>
                              <p className="text-[10px] text-white/45">
                                {hand ? '✋ Hand Raised' : 'Listening'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {[...rtc.remoteStreams.entries()].map(([id, st]) => <RemoteAudio key={id} stream={st} />)}
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

              {/* Bottom Stage Controls Bar (Mic, Cam, Raise Hand, Reactions, Fullscreen) */}
              <div className="border-t border-white/10 bg-black/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMicMuted(m => !m)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                      micMuted ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30' : 'bg-white/10 text-white'
                    }`}
                  >
                    {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
                    {micMuted ? 'Mic Muted' : 'Mic On'}
                  </button>

                  {lecture.mode === 'VIDEO_LECTURE' && (
                    <button
                      type="button"
                      onClick={() => setCamEnabled(c => !c)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                        !camEnabled ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30' : 'bg-white/10 text-white'
                      }`}
                    >
                      {camEnabled ? <Video size={14} /> : <VideoOff size={14} />}
                      {camEnabled ? 'Camera On' : 'Camera Off'}
                    </button>
                  )}

                  {/* Quick Classroom Reactions */}
                  <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
                    {['✋', '💡', '👏', '📖', '✅'].map(emo => (
                      <button
                        key={emo}
                        type="button"
                        onClick={() => handleTriggerReaction(emo)}
                        className="hover:scale-125 transition px-1 text-sm"
                        title={`React ${emo}`}
                      >
                        {emo}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Raise Hand Button for Students (or Demo Test) */}
                  <button
                    type="button"
                    onClick={handleToggleRaiseHand}
                    className={`px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition shadow ${
                      myRaisedHand
                        ? 'bg-amber-400 text-black'
                        : 'bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-400 hover:text-black'
                    }`}
                  >
                    <Hand size={14} />
                    {myRaisedHand ? '✋ Hand Raised (Lower)' : '✋ Raise Hand to Answer'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStageFullscreen(f => !f)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                    title="Toggle wide stage"
                  >
                    {stageFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT 4 COLS: RAISE-HAND QUEUE (CALL ON CAMERA / MIC) + LIVE LECTURE Q&A CHAT */}
            <div className="lg:col-span-4 space-y-4">
              {/* Raise Hand Queue Card */}
              <div className="rounded-3xl border border-amber-400/30 bg-amber-500/[0.05] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                    <Hand size={14} /> Raised Hands Queue ({lecture.raisedHands.filter(h => h.status === 'WAITING').length})
                  </span>
                  {isTeacher && (
                    <label className="inline-flex items-center gap-1.5 text-[10px] text-white/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lecture.allowStudentWhiteboard}
                        onChange={e => updateLecture({ allowStudentWhiteboard: e.target.checked })}
                        className="rounded accent-amber-400"
                      />
                      Student Whiteboard
                    </label>
                  )}
                </div>

                {/* Student Raise Hand Topic Input */}
                {!myRaisedHand && (
                  <div className="space-y-2 rounded-2xl bg-black/40 border border-white/10 p-2.5">
                    <input
                      value={handPromptDraft}
                      onChange={e => setHandPromptDraft(e.target.value)}
                      placeholder="Optional note: e.g. 'I have the answer to #3'..."
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                    />
                    <div className="flex items-center justify-between gap-1.5">
                      <select
                        aria-label="How to answer"
                        value={handRequestMode}
                        onChange={e => setHandRequestMode(e.target.value as any)}
                        className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white"
                      >
                        <option value="CAMERA">📹 Come on Camera</option>
                        <option value="AUDIO_MIC">🎙️ Audio Mic Only</option>
                        <option value="WHITEBOARD">✏️ Solve on Whiteboard</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleToggleRaiseHand}
                        className="px-3 py-1 rounded-lg bg-amber-400 text-black text-[11px] font-black inline-flex items-center gap-1"
                      >
                        <Hand size={11} /> Raise Hand
                      </button>
                    </div>
                  </div>
                )}

                {/* Waiting Hands List */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {lecture.raisedHands.length === 0 && (
                    <p className="text-xs text-white/45 py-2">
                      No hands raised right now. Students can tap <strong>✋ Raise Hand</strong> to answer on camera, audio mic, or whiteboard.
                    </p>
                  )}
                  {lecture.raisedHands.map(h => {
                    const isOnStage = lecture.activeStudentOnStage?.uid === h.uid;
                    return (
                      <div
                        key={h.uid}
                        className={`rounded-2xl border p-3 space-y-2 ${
                          isOnStage
                            ? 'border-emerald-400/60 bg-emerald-500/15'
                            : 'border-white/10 bg-black/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm">✋</span>
                            <span className="text-xs font-black text-white truncate">{h.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-[9px] font-black uppercase text-amber-200">
                            {h.requestedMode === 'CAMERA'
                              ? '📹 Video'
                              : h.requestedMode === 'WHITEBOARD'
                              ? '✏️ Board'
                              : '🎙️ Audio'}
                          </span>
                        </div>
                        {h.promptNote && (
                          <p className="text-[11px] text-white/70 leading-snug">{h.promptNote}</p>
                        )}
                        {isTeacher && (
                          <div className="flex items-center gap-1.5 pt-1">
                            {!isOnStage ? (
                              <button
                                type="button"
                                onClick={() => handleCallStudentToStage(h)}
                                className="flex-1 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black text-[11px] font-black inline-flex items-center justify-center gap-1"
                              >
                                {lecture.mode === 'VIDEO_LECTURE' ? (
                                  <>
                                    <Video size={12} /> Bring on Camera to Answer
                                  </>
                                ) : (
                                  <>
                                    <Mic size={12} /> Call On &amp; Unmute Mic
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDismissStudentFromStage(h.uid)}
                                className="flex-1 py-1.5 rounded-xl bg-rose-500/25 border border-rose-400/40 text-rose-200 text-[11px] font-black"
                              >
                                Return to Seat
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Lecture Q&A Chat */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-1.5">
                  <MessagesSquare size={13} /> Live Lecture Backchannel
                </h4>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {lecture.lectureChat.map(m => (
                    <div key={m.id} className="rounded-xl bg-black/35 border border-white/10 p-2.5 text-xs">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="font-black text-white">
                          {m.senderName}{' '}
                          <span className="text-amber-300 font-bold">({m.senderRole})</span>
                        </span>
                      </div>
                      <p className="text-white/80 leading-snug">{m.text}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={lectureChatDraft}
                    onChange={e => setLectureChatDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && lectureChatDraft.trim()) {
                        e.preventDefault();
                        updateLecture({
                          lectureChat: [
                            ...lecture.lectureChat,
                            {
                              id: `lchat_${Date.now()}`,
                              senderUid: viewerUid,
                              senderName: viewerName,
                              senderRole: isTeacher ? 'TEACHER' : 'STUDENT',
                              text: lectureChatDraft.trim(),
                              createdAt: Date.now(),
                            },
                          ],
                        });
                        setLectureChatDraft('');
                      }
                    }}
                    placeholder="Type an answer or question in lecture chat..."
                    className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!lectureChatDraft.trim()) return;
                      updateLecture({
                        lectureChat: [
                          ...lecture.lectureChat,
                          {
                            id: `lchat_${Date.now()}`,
                            senderUid: viewerUid,
                            senderName: viewerName,
                            senderRole: isTeacher ? 'TEACHER' : 'STUDENT',
                            text: lectureChatDraft.trim(),
                            createdAt: Date.now(),
                          },
                        ],
                      });
                      setLectureChatDraft('');
                    }}
                    className="px-3 py-2 rounded-xl bg-amber-400 text-black text-xs font-black"
                  >
                    <Send size={12} />
                  </button>
                </div>
              </div>
            </div>
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
            <UniversalPostComposer
              currentUser={auth.currentUser}
              compact
              placeholder={`Post an announcement, question, study note, or Tela assignment to ${className}...`}
              submitLabel="Post to Class"
              onPost={handleCreateSocialPost}
            />
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

                      {isTeacher && (
                        <button
                          type="button"
                          onClick={() => setPosts(toggleClassroomPostPin(classId, post.id))}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] font-bold text-white/70"
                        >
                          {post.pinned ? 'Unpin' : 'Pin Post'}
                        </button>
                      )}
                    </div>

                    <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{post.text}</p>

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
                        onClick={() => setPosts(toggleClassroomPostLike(classId, post.id, viewerUid))}
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
                          if (e.key === 'Enter' && (commentDrafts[post.id] || '').trim()) {
                            e.preventDefault();
                            const next = addClassroomPostComment(classId, post.id, {
                              authorUid: viewerUid,
                              authorName: viewerName,
                              authorRole: isTeacher ? 'TEACHER' : 'STUDENT',
                              text: commentDrafts[post.id].trim(),
                            });
                            setPosts(next);
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
                          if (!txt) return;
                          const next = addClassroomPostComment(classId, post.id, {
                            authorUid: viewerUid,
                            authorName: viewerName,
                            authorRole: isTeacher ? 'TEACHER' : 'STUDENT',
                            text: txt,
                          });
                          setPosts(next);
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
                disabled={uploadingPhoto}
                onClick={() => photoInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5"
              >
                <Upload size={13} /> {uploadingPhoto ? 'Uploading...' : 'Upload Classroom Photo'}
              </button>
            </div>
          </div>

          {photos.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
              <ImageIcon size={22} className="mx-auto text-white/25 mb-2" />
              <p className="text-sm font-bold text-white/70">No photos yet</p>
              <p className="text-xs text-white/45 mt-1">Upload a class photo, or save a lecture whiteboard to keep it here.</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {photos.map(ph => (
              <div
                key={ph.id}
                onClick={() => setLightboxPhoto(ph)}
                className="group rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden cursor-pointer hover:border-amber-400/50 transition"
              >
                <div className="h-48 bg-black overflow-hidden relative">
                  <img
                    src={ph.url}
                    alt={ph.caption}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  {ph.isWhiteboardSnapshot && (
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-amber-400 text-black text-[9px] font-black uppercase">
                      Whiteboard Snapshot
                    </span>
                  )}
                </div>
                <div className="p-3.5 space-y-1">
                  <p className="text-xs font-bold text-white truncate">{ph.caption}</p>
                  <p className="text-[10px] text-white/45">
                    Uploaded by {ph.uploadedByName} ({ph.uploadedByRole})
                  </p>
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
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.caption}
                  className="w-full max-h-[70vh] object-contain rounded-2xl bg-black"
                />
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
