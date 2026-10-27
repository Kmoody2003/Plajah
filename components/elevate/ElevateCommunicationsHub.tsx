// components/elevate/ElevateCommunicationsHub.tsx
// Unified Plajah Chat + Reddit-Style Discussions Stack for Elevate Profiles, Departments, and Classrooms.
//
// 1. Reuses the Plajah Chat platform (`listenToMessages`, `sendMessage`, `ChatSystem`) for all Classroom,
//    Department, and Organization chats — with a fast Mini-UI for quick replies and a 1-click button
//    to open the Full Plajah Chat experience.
// 2. Provides every Classroom and Department with its own Reddit-Style Discussion Forum (`c/ClassroomName`),
//    complete with Upvote/Downvote (`▲ / ▼`), Flair tags, Hot/Top/New sorting, Instructor Pins,
//    nested threaded replies, quick-response composer, and a Full-Screen Discussion Forum experience.

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  MessageSquare,
  MessagesSquare,
  ArrowBigUp,
  ArrowBigDown,
  Send,
  Plus,
  Pin,
  Sparkles,
  Maximize2,
  Minimize2,
  ExternalLink,
  Hash,
  Users,
  BookOpen,
  Flame,
  TrendingUp,
  Clock,
  CheckCircle2,
  X,
  CornerDownRight,
} from 'lucide-react';
import type { Organization, OrgMembership } from '../../types';
import { auth, listenToMessages, sendMessage } from '../../services/backendService';
import { memberDepartmentIds, ROLE_LABELS, getMemberEffectiveRoleKeys } from '../../services/elevateRoles';
import type { ChurchProgram } from '../../services/churchEducationService';

const ChatSystem = lazy(() => import('../ChatSystem'));

// ── Types for Reddit-Style Classroom & Department Discussions ────────────────

export type DiscussionFlair =
  | 'Question'
  | 'Scripture Study'
  | 'Lesson Notes'
  | 'Homework & Tela'
  | 'Announcement'
  | 'Testimony & Prayer';

export interface DiscussionReplyItem {
  id: string;
  authorUid: string;
  authorName: string;
  authorRoleLabel: string;
  body: string;
  createdAt: number;
  score: number;
  upvoterUids: string[];
  downvoterUids: string[];
}

export interface DiscussionThreadItem {
  id: string;
  boardId: string;
  boardTitle: string;
  orgId: string;
  classId?: string;
  ministryId?: string;
  title: string;
  body: string;
  flair: DiscussionFlair;
  authorUid: string;
  authorName: string;
  authorRoleLabel: string;
  createdAt: number;
  pinned?: boolean;
  score: number;
  upvoterUids: string[];
  downvoterUids: string[];
  replies: DiscussionReplyItem[];
}

export interface ChatChannelDescriptor {
  roomId: string;
  name: string;
  subtitle: string;
  kind: 'CLASSROOM' | 'DEPARTMENT' | 'ORG';
  badge: string;
  ministryId?: string;
  classId?: string;
}

export interface DiscussionBoardDescriptor {
  boardId: string;
  slug: string;
  title: string;
  subtitle: string;
  kind: 'CLASSROOM' | 'DEPARTMENT' | 'ORG';
  ministryId?: string;
  classId?: string;
}

interface LocalQuickChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  text: string;
  timestamp: number;
}

const DISCUSSIONS_STORAGE_KEY = (orgId: string) => `plajah_elevate_reddit_discussions_v1_${orgId}`;
const QUICK_CHAT_STORAGE_KEY = (roomId: string) => `plajah_elevate_quick_chat_v1_${roomId}`;

const FLAIR_STYLES: Record<DiscussionFlair, string> = {
  Question: 'bg-sky-500/20 text-sky-300 border-sky-400/30',
  'Scripture Study': 'bg-amber-500/20 text-amber-300 border-amber-400/30',
  'Lesson Notes': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
  'Homework & Tela': 'bg-purple-500/20 text-purple-300 border-purple-400/30',
  Announcement: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
  'Testimony & Prayer': 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30',
};

function seedDefaultThreads(
  org: Organization,
  boards: DiscussionBoardDescriptor[],
): DiscussionThreadItem[] {
  const now = Date.now();
  const primaryClassBoard = boards.find(b => b.kind === 'CLASSROOM') || boards[0];
  const deptBoard = boards.find(b => b.kind === 'DEPARTMENT') || boards[0];

  if (!primaryClassBoard) return [];

  return [
    {
      id: `disc_seed_1_${org.id}`,
      boardId: primaryClassBoard.boardId,
      boardTitle: primaryClassBoard.slug,
      orgId: org.id,
      classId: primaryClassBoard.classId,
      ministryId: primaryClassBoard.ministryId,
      title: 'Welcome to our Classroom Discussion Forum! Post your weekly Scripture questions & study notes here',
      body: 'Use this Reddit-style forum for deep thread discussions on our weekly Verse passages and interactive Tela worksheets. Upvote helpful explanations from fellow students and instructors!',
      flair: 'Announcement',
      authorUid: 'instructor_seed',
      authorName: 'Lead Class Instructor',
      authorRoleLabel: 'Instructor',
      createdAt: now - 3600_000 * 12,
      pinned: true,
      score: 14,
      upvoterUids: [],
      downvoterUids: [],
      replies: [
        {
          id: `reply_seed_1_${org.id}`,
          authorUid: 'member_seed_1',
          authorName: 'Christian Ed Volunteer',
          authorRoleLabel: 'Department Volunteer',
          body: 'Excited for this week’s lesson! I uploaded the companion study guide in our Department Uploads.',
          createdAt: now - 3600_000 * 6,
          score: 6,
          upvoterUids: [],
          downvoterUids: [],
        },
      ],
    },
    {
      id: `disc_seed_2_${org.id}`,
      boardId: primaryClassBoard.boardId,
      boardTitle: primaryClassBoard.slug,
      orgId: org.id,
      classId: primaryClassBoard.classId,
      ministryId: primaryClassBoard.ministryId,
      title: 'Key takeaways from Romans 8 & how it connects to this week’s Tela reflection prompt',
      body: 'What stood out to everyone in verses 26–28? Drop your thoughts below before Sunday’s class session so we can discuss them together.',
      flair: 'Scripture Study',
      authorUid: 'instructor_seed',
      authorName: 'Christian Education Instructor',
      authorRoleLabel: 'Instructor',
      createdAt: now - 3600_000 * 4,
      pinned: false,
      score: 9,
      upvoterUids: [],
      downvoterUids: [],
      replies: [],
    },
    ...(deptBoard && deptBoard.boardId !== primaryClassBoard.boardId
      ? [
          {
            id: `disc_seed_3_${org.id}`,
            boardId: deptBoard.boardId,
            boardTitle: deptBoard.slug,
            orgId: org.id,
            ministryId: deptBoard.ministryId,
            title: `${deptBoard.title} — Curriculum ideas & volunteer coordination thread`,
            body: 'Share ideas for upcoming classes, youth activities, and lesson materials for our department team.',
            flair: 'Lesson Notes' as DiscussionFlair,
            authorUid: 'dept_lead_seed',
            authorName: 'Department Head',
            authorRoleLabel: 'Department Head',
            createdAt: now - 3600_000 * 8,
            pinned: true,
            score: 11,
            upvoterUids: [],
            downvoterUids: [],
            replies: [],
          },
        ]
      : []),
  ];
}

export function loadOrgDiscussionThreads(
  org: Organization,
  boards: DiscussionBoardDescriptor[],
): DiscussionThreadItem[] {
  try {
    const raw = localStorage.getItem(DISCUSSIONS_STORAGE_KEY(org.id));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  const seeded = seedDefaultThreads(org, boards);
  try {
    localStorage.setItem(DISCUSSIONS_STORAGE_KEY(org.id), JSON.stringify(seeded));
  } catch {}
  return seeded;
}

export function saveOrgDiscussionThreads(orgId: string, threads: DiscussionThreadItem[]): void {
  try {
    localStorage.setItem(DISCUSSIONS_STORAGE_KEY(orgId), JSON.stringify(threads));
  } catch {}
}

function loadLocalQuickChat(roomId: string, channelName: string): LocalQuickChatMessage[] {
  try {
    const raw = localStorage.getItem(QUICK_CHAT_STORAGE_KEY(roomId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  const seeded: LocalQuickChatMessage[] = [
    {
      id: `msg_seed_1_${roomId}`,
      roomId,
      senderId: 'instructor_seed',
      senderName: 'Class Instructor',
      senderRole: 'Instructor',
      text: `Welcome to ${channelName} on Plajah Chat! Send a quick message here or open the full Plajah Chat experience anytime.`,
      timestamp: Date.now() - 1800_000,
    },
  ];
  try {
    localStorage.setItem(QUICK_CHAT_STORAGE_KEY(roomId), JSON.stringify(seeded));
  } catch {}
  return seeded;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ElevateCommunicationsHubProps {
  org: Organization;
  membership?: OrgMembership | null;
  user?: any;
  programs?: ChurchProgram[];
  /** When embedded inside a single classroom, scopes directly to that classroom's chat & Reddit discussion board. */
  scopedClass?: {
    classId: string;
    className: string;
    ministryId?: string;
  };
  /** Initial view when opened in classroom or profile */
  initialSurface?: 'SPLIT_MINI' | 'FULL_CHAT' | 'FULL_DISCUSSIONS';
}

export const ElevateCommunicationsHub: React.FC<ElevateCommunicationsHubProps> = ({
  org,
  membership,
  user,
  programs = [],
  scopedClass,
  initialSurface = 'SPLIT_MINI',
}) => {
  const uid = user?.uid || membership?.userId || auth.currentUser?.uid || 'member_local';
  const displayName =
    membership?.displayName || user?.displayName || auth.currentUser?.displayName || 'Member';
  const effectiveRoles = useMemo(() => getMemberEffectiveRoleKeys(membership), [membership]);
  const primaryRoleLabel = ROLE_LABELS[effectiveRoles[0] || 'MEMBER'] || 'Member';

  // Member's departments (only show department channels/boards for departments the member belongs to, plus their classrooms)
  const myDeptIds = useMemo(() => new Set(memberDepartmentIds(membership, org)), [membership, org]);
  const visibleDepartments = useMemo(() => {
    const all = (org.ministries || []).filter(m => !m.isInternal);
    if (!membership || myDeptIds.size === 0) return all;
    const filtered = all.filter(d => myDeptIds.has(d.id));
    return filtered.length > 0 ? filtered : all;
  }, [org.ministries, membership, myDeptIds]);

  // Build available Plajah Chat channels (Classrooms + Member's Departments + Congregation)
  const chatChannels = useMemo<ChatChannelDescriptor[]>(() => {
    if (scopedClass) {
      return [
        {
          roomId: `plajah_cls_chat_${org.id}_${scopedClass.classId}`,
          name: `${scopedClass.className} · Classroom Chat`,
          subtitle: 'Powered by Plajah Chat · Real-time classroom messaging',
          kind: 'CLASSROOM',
          badge: 'CLASS CHAT',
          classId: scopedClass.classId,
          ministryId: scopedClass.ministryId,
        },
      ];
    }

    const list: ChatChannelDescriptor[] = [];
    for (const prog of programs) {
      list.push({
        roomId: `plajah_cls_chat_${org.id}_${prog.id}`,
        name: `${prog.name}`,
        subtitle: `Classroom Chat · ${prog.ageBand || 'All Ages'}`,
        kind: 'CLASSROOM',
        badge: 'CLASSROOM',
        classId: prog.id,
      });
    }
    for (const dept of visibleDepartments) {
      list.push({
        roomId: `plajah_dept_chat_${org.id}_${dept.id}`,
        name: `${dept.iconEmoji || '🏛️'} ${dept.name}`,
        subtitle: `Department Team Chat · ${org.name}`,
        kind: 'DEPARTMENT',
        badge: 'DEPARTMENT',
        ministryId: dept.id,
      });
    }
    list.push({
      roomId: `plajah_org_chat_${org.id}_general`,
      name: `${org.name} · Fellowship Hall`,
      subtitle: 'Organization-wide community chat',
      kind: 'ORG',
      badge: 'ORG CHAT',
    });
    return list;
  }, [org.id, org.name, programs, scopedClass, visibleDepartments]);

  // Build available Reddit-Style Discussion Boards (Classrooms + Member's Departments + Org)
  const discussionBoards = useMemo<DiscussionBoardDescriptor[]>(() => {
    const toSlug = (s: string) => `c/${s.replace(/[^a-zA-Z0-9]+/g, '')}`;
    if (scopedClass) {
      return [
        {
          boardId: `board_cls_${org.id}_${scopedClass.classId}`,
          slug: toSlug(scopedClass.className),
          title: `${scopedClass.className} Discussion Forum`,
          subtitle: 'Classroom Reddit-Style Discussion Stack · Upvote questions, Scripture notes & homework help',
          kind: 'CLASSROOM',
          classId: scopedClass.classId,
          ministryId: scopedClass.ministryId,
        },
      ];
    }

    const list: DiscussionBoardDescriptor[] = [];
    for (const prog of programs) {
      list.push({
        boardId: `board_cls_${org.id}_${prog.id}`,
        slug: toSlug(prog.name),
        title: `${prog.name} Forum`,
        subtitle: `Classroom Discussion Forum · ${prog.ageBand || 'All Ages'}`,
        kind: 'CLASSROOM',
        classId: prog.id,
      });
    }
    for (const dept of visibleDepartments) {
      list.push({
        boardId: `board_dept_${org.id}_${dept.id}`,
        slug: toSlug(dept.name),
        title: `${dept.name} Discussions`,
        subtitle: 'Department Discussion Board',
        kind: 'DEPARTMENT',
        ministryId: dept.id,
      });
    }
    list.push({
      boardId: `board_org_${org.id}_general`,
      slug: toSlug(org.name),
      title: `${org.name} Community Forum`,
      subtitle: 'Congregation-wide Reddit-style discussion board',
      kind: 'ORG',
    });
    return list;
  }, [org.id, org.name, programs, scopedClass, visibleDepartments]);

  const [surface, setSurface] = useState<'SPLIT_MINI' | 'FULL_CHAT' | 'FULL_DISCUSSIONS'>(initialSurface);
  const [activeChannelId, setActiveChannelId] = useState<string>(() => chatChannels[0]?.roomId || '');
  const [activeBoardId, setActiveBoardId] = useState<string>(() => discussionBoards[0]?.boardId || '');

  useEffect(() => {
    if (chatChannels.length > 0 && !chatChannels.some(c => c.roomId === activeChannelId)) {
      setActiveChannelId(chatChannels[0].roomId);
    }
  }, [chatChannels, activeChannelId]);

  useEffect(() => {
    if (discussionBoards.length > 0 && !discussionBoards.some(b => b.boardId === activeBoardId)) {
      setActiveBoardId(discussionBoards[0].boardId);
    }
  }, [discussionBoards, activeBoardId]);

  const activeChannel = useMemo(
    () => chatChannels.find(c => c.roomId === activeChannelId) || chatChannels[0],
    [chatChannels, activeChannelId],
  );
  const activeBoard = useMemo(
    () => discussionBoards.find(b => b.boardId === activeBoardId) || discussionBoards[0],
    [discussionBoards, activeBoardId],
  );

  // ── Plajah Chat Mini-UI State (Syncs with Firestore `listenToMessages` + local instant mirror) ──
  const [chatMessages, setChatMessages] = useState<LocalQuickChatMessage[]>([]);
  const [quickChatDraft, setQuickChatDraft] = useState('');

  useEffect(() => {
    if (!activeChannel) return;
    const localInitial = loadLocalQuickChat(activeChannel.roomId, activeChannel.name);
    setChatMessages(localInitial);

    let unsub: (() => void) | undefined;
    try {
      unsub = listenToMessages(activeChannel.roomId, liveMsgs => {
        if (Array.isArray(liveMsgs) && liveMsgs.length > 0) {
          const mapped: LocalQuickChatMessage[] = liveMsgs.map((m: any) => ({
            id: m.id,
            roomId: activeChannel.roomId,
            senderId: m.senderId,
            senderName: m.senderName || 'Member',
            senderRole: m.senderRole,
            text: m.text || '',
            timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
          }));
          setChatMessages(mapped);
        }
      });
    } catch {
      // Offline / local fallback
    }
    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [activeChannel]);

  const handleSendQuickChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickChatDraft.trim() || !activeChannel) return;
    const text = quickChatDraft.trim();
    setQuickChatDraft('');

    const optimistic: LocalQuickChatMessage = {
      id: `qm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      roomId: activeChannel.roomId,
      senderId: uid,
      senderName: displayName,
      senderRole: primaryRoleLabel,
      text,
      timestamp: Date.now(),
    };
    const next = [...chatMessages, optimistic];
    setChatMessages(next);
    try {
      localStorage.setItem(QUICK_CHAT_STORAGE_KEY(activeChannel.roomId), JSON.stringify(next));
    } catch {}

    // Also write to real Plajah Chat backend
    try {
      await sendMessage(activeChannel.roomId, text);
    } catch {}
  };

  const openGlobalPlajahChat = () => {
    window.dispatchEvent(
      new CustomEvent('NAVIGATE', {
        detail: { target: 'CHAT', params: { roomId: activeChannel?.roomId } },
      }),
    );
  };

  // ── Plajah Discussions (Reddit-Style) State ──────────────────────────────
  const [threads, setThreads] = useState<DiscussionThreadItem[]>(() =>
    loadOrgDiscussionThreads(org, discussionBoards),
  );
  const [sortBy, setSortBy] = useState<'HOT' | 'TOP' | 'NEW'>('HOT');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showNewThreadForm, setShowNewThreadForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newFlair, setNewFlair] = useState<DiscussionFlair>('Question');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const boardThreads = useMemo(() => {
    const filtered = threads.filter(t => !activeBoard || t.boardId === activeBoard.boardId);
    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (sortBy === 'TOP') return b.score - a.score;
      if (sortBy === 'NEW') return b.createdAt - a.createdAt;
      // HOT: score + reply activity + recency
      const hotA = a.score * 2 + a.replies.length * 3 + a.createdAt / 3600_000;
      const hotB = b.score * 2 + b.replies.length * 3 + b.createdAt / 3600_000;
      return hotB - hotA;
    });
  }, [threads, activeBoard, sortBy]);

  const handleVoteThread = (threadId: string, dir: 'UP' | 'DOWN') => {
    const next = threads.map(t => {
      if (t.id !== threadId) return t;
      const hasUp = t.upvoterUids.includes(uid);
      const hasDown = t.downvoterUids.includes(uid);
      let upvoterUids = t.upvoterUids.filter(x => x !== uid);
      let downvoterUids = t.downvoterUids.filter(x => x !== uid);
      let delta = 0;
      if (dir === 'UP') {
        if (hasUp) {
          delta = -1;
        } else {
          upvoterUids.push(uid);
          delta = hasDown ? 2 : 1;
        }
      } else {
        if (hasDown) {
          delta = 1;
        } else {
          downvoterUids.push(uid);
          delta = hasUp ? -2 : -1;
        }
      }
      return { ...t, score: t.score + delta, upvoterUids, downvoterUids };
    });
    setThreads(next);
    saveOrgDiscussionThreads(org.id, next);
  };

  const handleCreateThread = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !activeBoard) return;
    const created: DiscussionThreadItem = {
      id: `disc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      boardId: activeBoard.boardId,
      boardTitle: activeBoard.slug,
      orgId: org.id,
      classId: activeBoard.classId,
      ministryId: activeBoard.ministryId,
      title: newTitle.trim(),
      body: newBody.trim(),
      flair: newFlair,
      authorUid: uid,
      authorName: displayName,
      authorRoleLabel: primaryRoleLabel,
      createdAt: Date.now(),
      pinned: false,
      score: 1,
      upvoterUids: [uid],
      downvoterUids: [],
      replies: [],
    };
    const next = [created, ...threads];
    setThreads(next);
    saveOrgDiscussionThreads(org.id, next);
    setNewTitle('');
    setNewBody('');
    setShowNewThreadForm(false);
    setSelectedThreadId(created.id);
  };

  const handleAddReply = (threadId: string) => {
    const text = (replyDrafts[threadId] || '').trim();
    if (!text) return;
    const reply: DiscussionReplyItem = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      authorUid: uid,
      authorName: displayName,
      authorRoleLabel: primaryRoleLabel,
      body: text,
      createdAt: Date.now(),
      score: 1,
      upvoterUids: [uid],
      downvoterUids: [],
    };
    const next = threads.map(t =>
      t.id === threadId ? { ...t, replies: [...t.replies, reply] } : t,
    );
    setThreads(next);
    saveOrgDiscussionThreads(org.id, next);
    setReplyDrafts(prev => ({ ...prev, [threadId]: '' }));
  };

  // ── Full-Screen Plajah Chat Experience ───────────────────────────────────
  if (surface === 'FULL_CHAT') {
    return (
      <div className="rounded-3xl border border-white/15 bg-[#0b0714] overflow-hidden space-y-0">
        <div className="px-5 py-3.5 bg-[#140b24] border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <MessageSquare size={16} className="text-[#E2C27E]" />
            <span className="text-sm font-black text-white">
              Plajah Chat · Full Experience ({activeChannel?.name || org.name})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openGlobalPlajahChat}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5"
            >
              <ExternalLink size={12} /> Pop Out to Global Plajah Chat
            </button>
            <button
              type="button"
              onClick={() => setSurface('SPLIT_MINI')}
              className="px-3 py-1.5 rounded-xl bg-[#E2C27E] text-black text-xs font-black inline-flex items-center gap-1.5"
            >
              <Minimize2 size={12} /> Back to Mini-UI
            </button>
          </div>
        </div>
        <div className="h-[680px]">
          <Suspense
            fallback={
              <div className="h-full grid place-items-center text-xs text-white/50">
                Loading Full Plajah Chat…
              </div>
            }
          >
            <ChatSystem
              initialRoomId={activeChannel?.roomId}
              onBack={() => setSurface('SPLIT_MINI')}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // ── Full-Screen Plajah Reddit-Style Discussions Experience ───────────────
  if (surface === 'FULL_DISCUSSIONS') {
    return (
      <div className="rounded-3xl border border-white/15 bg-[#0d0818] p-5 sm:p-6 space-y-5 text-white">
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-orange-500/20 text-orange-300 border border-orange-400/30">
                Plajah Discussions · Reddit-Style Forum Stack
              </span>
              <span className="text-xs font-mono text-[#E2C27E]">{activeBoard?.slug}</span>
            </div>
            <h2 className="text-xl font-black text-white mt-1">{activeBoard?.title}</h2>
            <p className="text-xs text-white/60">{activeBoard?.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewThreadForm(prev => !prev)}
              className="px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> New Discussion Thread
            </button>
            <button
              type="button"
              onClick={() => setSurface('SPLIT_MINI')}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5"
            >
              <Minimize2 size={13} /> Back to Mini-UI
            </button>
          </div>
        </div>

        {/* Board Selector Pills */}
        {discussionBoards.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            {discussionBoards.map(b => (
              <button
                key={b.boardId}
                type="button"
                onClick={() => setActiveBoardId(b.boardId)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black border transition ${
                  activeBoard?.boardId === b.boardId
                    ? 'bg-[#E2C27E] text-black border-[#E2C27E]'
                    : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
                }`}
              >
                {b.slug} · {b.title}
              </button>
            ))}
          </div>
        )}

        {showNewThreadForm && (
          <form
            onSubmit={handleCreateThread}
            className="rounded-2xl border border-amber-400/30 bg-black/50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                Create Thread in {activeBoard?.slug}
              </span>
              <button
                type="button"
                onClick={() => setShowNewThreadForm(false)}
                className="text-white/50 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid sm:grid-cols-3 gap-2.5">
              <input
                required
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Thread title or question..."
                className="sm:col-span-2 bg-black/60 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white"
              />
              <select
                value={newFlair}
                onChange={e => setNewFlair(e.target.value as DiscussionFlair)}
                className="bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
              >
                {(Object.keys(FLAIR_STYLES) as DiscussionFlair[]).map(f => (
                  <option key={f} value={f}>
                    Flair: {f}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={3}
              value={newBody}
              onChange={e => setNewBody(e.target.value)}
              placeholder="Write your discussion post, Scripture breakdown, or question..."
              className="w-full bg-black/60 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white resize-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black"
              >
                Post Thread
              </button>
            </div>
          </form>
        )}

        {/* Reddit Thread List */}
        <div className="space-y-3">
          {boardThreads.map(thread => {
            const upvoted = thread.upvoterUids.includes(uid);
            const downvoted = thread.downvoterUids.includes(uid);
            return (
              <div
                key={thread.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex gap-3.5"
              >
                {/* Upvote / Downvote Rail */}
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleVoteThread(thread.id, 'UP')}
                    className={`p-1 rounded-lg transition ${
                      upvoted ? 'text-orange-400 bg-orange-500/15' : 'text-white/45 hover:text-white'
                    }`}
                  >
                    <ArrowBigUp size={18} />
                  </button>
                  <span className="text-xs font-black font-mono text-white">{thread.score}</span>
                  <button
                    type="button"
                    onClick={() => handleVoteThread(thread.id, 'DOWN')}
                    className={`p-1 rounded-lg transition ${
                      downvoted ? 'text-sky-400 bg-sky-500/15' : 'text-white/45 hover:text-white'
                    }`}
                  >
                    <ArrowBigDown size={18} />
                  </button>
                </div>

                {/* Thread Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-[#E2C27E]">
                      {thread.boardTitle}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border ${
                        FLAIR_STYLES[thread.flair]
                      }`}
                    >
                      {thread.flair}
                    </span>
                    {thread.pinned && (
                      <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-500/20 text-emerald-300 inline-flex items-center gap-1">
                        <Pin size={10} /> Pinned
                      </span>
                    )}
                    <span className="text-[10px] text-white/45">
                      Posted by <strong className="text-white/80">{thread.authorName}</strong> (
                      {thread.authorRoleLabel})
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-white">{thread.title}</h3>
                  {thread.body && (
                    <p className="text-xs text-white/75 leading-relaxed">{thread.body}</p>
                  )}

                  {/* Replies & Quick Reply Bar */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    {thread.replies.map(rep => (
                      <div
                        key={rep.id}
                        className="pl-3 border-l-2 border-white/15 py-1 space-y-0.5 text-xs"
                      >
                        <div className="text-[10px] text-white/50">
                          <strong className="text-white/85">{rep.authorName}</strong> ·{' '}
                          <span className="text-[#E2C27E]">{rep.authorRoleLabel}</span>
                        </div>
                        <p className="text-white/80">{rep.body}</p>
                      </div>
                    ))}

                    <div className="flex gap-2 pt-1">
                      <input
                        value={replyDrafts[thread.id] || ''}
                        onChange={e =>
                          setReplyDrafts(prev => ({ ...prev, [thread.id]: e.target.value }))
                        }
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddReply(thread.id);
                          }
                        }}
                        placeholder="Write a comment to this discussion thread..."
                        className="flex-1 bg-black/45 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddReply(thread.id)}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white"
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── DEFAULT: Side-by-Side Mini-UIs of Plajah Chat & Plajah Discussions ───
  return (
    <div className="space-y-4 text-white">
      {/* Top Banner */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#170c2b] via-[#120920] to-[#1a0d2e] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#E2C27E]/20 text-[#E2C27E] border border-[#E2C27E]/30">
              Plajah Communications Stack
            </span>
            <span className="text-[11px] text-white/60">
              Mini-UIs for Quick Response · Expand to Full Experience Anytime
            </span>
          </div>
          <h3 className="text-xl font-black text-white mt-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {scopedClass
              ? `${scopedClass.className} — Plajah Chat & Classroom Discussion Forum`
              : `${org.name} — My Plajah Chat & Discussion Forums`}
          </h3>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSurface('FULL_CHAT')}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-black text-white inline-flex items-center gap-1.5"
          >
            <Maximize2 size={13} className="text-[#E2C27E]" /> Full Plajah Chat
          </button>
          <button
            type="button"
            onClick={() => setSurface('FULL_DISCUSSIONS')}
            className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5"
          >
            <Maximize2 size={13} /> Full Plajah Discussions
          </button>
        </div>
      </div>

      {/* 2-Column Mini-UI Grid: Left = Plajah Chat Mini-UI, Right = Plajah Discussions (Reddit-Style) Mini-UI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT 5 COLS: PLAJAH CHAT MINI-UI */}
        <div className="lg:col-span-5 rounded-3xl border border-white/12 bg-[#110a1f]/90 p-4 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#E2C27E]/15 border border-[#E2C27E]/30 grid place-items-center text-[#E2C27E]">
                  <MessageSquare size={15} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#E2C27E] block">
                    Plajah Chat Mini-UI
                  </span>
                  <h4 className="text-sm font-black text-white truncate">
                    {activeChannel?.name || 'Classroom & Department Chat'}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSurface('FULL_CHAT')}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-[11px] font-bold text-[#E2C27E] inline-flex items-center gap-1"
                title="Open Full Plajah Chat Experience"
              >
                <Maximize2 size={11} /> Full Chat
              </button>
            </div>

            {/* Channel Switcher Pills */}
            {chatChannels.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {chatChannels.map(ch => (
                  <button
                    key={ch.roomId}
                    type="button"
                    onClick={() => setActiveChannelId(ch.roomId)}
                    className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold whitespace-nowrap border transition ${
                      activeChannel?.roomId === ch.roomId
                        ? 'bg-[#E2C27E] text-black border-[#E2C27E]'
                        : 'bg-white/5 text-white/65 border-white/10 hover:text-white'
                    }`}
                  >
                    {ch.name}
                  </button>
                ))}
              </div>
            )}

            {/* Message Stream */}
            <div className="h-72 overflow-y-auto rounded-2xl bg-black/45 border border-white/10 p-3 space-y-2.5">
              {chatMessages.map(msg => {
                const mine = msg.senderId === uid;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-white/45 mb-0.5">
                      <span className="font-bold text-white/75">{msg.senderName}</span>
                      {msg.senderRole && (
                        <span className="text-[#E2C27E]">· {msg.senderRole}</span>
                      )}
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        mine
                          ? 'bg-[#E2C27E] text-black font-semibold'
                          : 'bg-white/[0.07] text-white border border-white/10'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick-Response Composer */}
          <form onSubmit={handleSendQuickChat} className="flex gap-2 pt-1">
            <input
              value={quickChatDraft}
              onChange={e => setQuickChatDraft(e.target.value)}
              placeholder={`Quick reply in ${activeChannel?.name || 'chat'}...`}
              className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#E2C27E]"
            />
            <button
              type="submit"
              disabled={!quickChatDraft.trim()}
              className="px-3.5 py-2 rounded-xl bg-[#E2C27E] text-black text-xs font-black inline-flex items-center gap-1 disabled:opacity-40"
            >
              <Send size={13} /> Send
            </button>
          </form>
        </div>

        {/* RIGHT 7 COLS: PLAJAH DISCUSSIONS (REDDIT-STYLE FORUM STACK) MINI-UI */}
        <div className="lg:col-span-7 rounded-3xl border border-white/12 bg-[#110a1f]/90 p-4 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-400/30 grid place-items-center text-orange-300">
                  <MessagesSquare size={15} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-300 block">
                    Plajah Discussions Mini-UI · Reddit-Style Classroom &amp; Dept Stack
                  </span>
                  <h4 className="text-sm font-black text-white">
                    {activeBoard?.slug} — {activeBoard?.title}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowNewThreadForm(prev => !prev)}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-400 text-black text-[11px] font-black inline-flex items-center gap-1"
                >
                  <Plus size={12} /> New Post
                </button>
                <button
                  type="button"
                  onClick={() => setSurface('FULL_DISCUSSIONS')}
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-[11px] font-bold text-amber-300 inline-flex items-center gap-1"
                  title="Open Full Plajah Discussions Experience"
                >
                  <Maximize2 size={11} /> Full Forum
                </button>
              </div>
            </div>

            {/* Board Switcher + Sort Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {discussionBoards.length > 1 ? (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {discussionBoards.map(b => (
                    <button
                      key={b.boardId}
                      type="button"
                      onClick={() => setActiveBoardId(b.boardId)}
                      className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold whitespace-nowrap border transition ${
                        activeBoard?.boardId === b.boardId
                          ? 'bg-orange-400 text-black border-orange-400'
                          : 'bg-white/5 text-white/65 border-white/10 hover:text-white'
                      }`}
                    >
                      {b.slug}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-white/50">{activeBoard?.subtitle}</span>
              )}

              <div className="flex items-center gap-1">
                {(['HOT', 'TOP', 'NEW'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSortBy(s)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                      sortBy === s
                        ? 'bg-white/15 text-white'
                        : 'text-white/45 hover:text-white/80'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Inline Quick Thread Creator */}
            {showNewThreadForm && (
              <form
                onSubmit={handleCreateThread}
                className="rounded-2xl border border-amber-400/30 bg-black/60 p-3 space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    required
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder={`Post a question or topic in ${activeBoard?.slug}...`}
                    className="flex-1 bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                  <select
                    value={newFlair}
                    onChange={e => setNewFlair(e.target.value as DiscussionFlair)}
                    className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-[11px] text-white"
                  >
                    {(Object.keys(FLAIR_STYLES) as DiscussionFlair[]).map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  placeholder="Optional details, verse references, or discussion prompt..."
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white resize-none"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowNewThreadForm(false)}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-white/60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-amber-400 text-black text-[11px] font-black"
                  >
                    Post to {activeBoard?.slug}
                  </button>
                </div>
              </form>
            )}

            {/* Compact Reddit Thread Cards with Quick-Comment */}
            <div className="h-72 overflow-y-auto space-y-2.5 pr-1">
              {boardThreads.map(thread => {
                const upvoted = thread.upvoterUids.includes(uid);
                const downvoted = thread.downvoterUids.includes(uid);
                const expanded = selectedThreadId === thread.id;
                return (
                  <div
                    key={thread.id}
                    className="rounded-2xl border border-white/10 bg-black/45 p-3 flex gap-2.5"
                  >
                    {/* Vote column */}
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleVoteThread(thread.id, 'UP')}
                        className={`p-0.5 rounded ${
                          upvoted ? 'text-orange-400' : 'text-white/40 hover:text-white'
                        }`}
                      >
                        <ArrowBigUp size={16} />
                      </button>
                      <span className="text-[11px] font-black font-mono">{thread.score}</span>
                      <button
                        type="button"
                        onClick={() => handleVoteThread(thread.id, 'DOWN')}
                        className={`p-0.5 rounded ${
                          downvoted ? 'text-sky-400' : 'text-white/40 hover:text-white'
                        }`}
                      >
                        <ArrowBigDown size={16} />
                      </button>
                    </div>

                    {/* Thread body + quick reply */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            FLAIR_STYLES[thread.flair]
                          }`}
                        >
                          {thread.flair}
                        </span>
                        {thread.pinned && (
                          <span className="text-[9px] font-bold text-emerald-300 inline-flex items-center gap-0.5">
                            <Pin size={9} /> Pinned
                          </span>
                        )}
                        <span className="text-[10px] text-white/45 truncate">
                          u/{thread.authorName.replace(/\s+/g, '')} · {thread.authorRoleLabel}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedThreadId(expanded ? null : thread.id)
                        }
                        className="text-left w-full"
                      >
                        <p className="text-xs font-bold text-white leading-snug">{thread.title}</p>
                        {thread.body && (
                          <p className="text-[11px] text-white/65 line-clamp-2 mt-0.5">
                            {thread.body}
                          </p>
                        )}
                      </button>

                      <div className="flex items-center gap-3 text-[10px] text-white/50 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setSelectedThreadId(expanded ? null : thread.id)}
                          className="hover:text-white font-bold inline-flex items-center gap-1"
                        >
                          <CornerDownRight size={11} />
                          {thread.replies.length} {thread.replies.length === 1 ? 'Comment' : 'Comments'} · Quick Reply
                        </button>
                      </div>

                      {expanded && (
                        <div className="pt-2 mt-1 border-t border-white/10 space-y-2">
                          {thread.replies.map(r => (
                            <div
                              key={r.id}
                              className="pl-2.5 border-l-2 border-white/15 text-[11px] space-y-0.5"
                            >
                              <span className="text-[10px] text-white/50">
                                <strong className="text-white/85">{r.authorName}</strong> ·{' '}
                                <span className="text-[#E2C27E]">{r.authorRoleLabel}</span>
                              </span>
                              <p className="text-white/80">{r.body}</p>
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <input
                              value={replyDrafts[thread.id] || ''}
                              onChange={e =>
                                setReplyDrafts(prev => ({
                                  ...prev,
                                  [thread.id]: e.target.value,
                                }))
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddReply(thread.id);
                                }
                              }}
                              placeholder="Quick comment..."
                              className="flex-1 bg-black/60 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddReply(thread.id)}
                              className="px-2.5 py-1 rounded-lg bg-[#E2C27E] text-black text-[10.5px] font-black"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-white/50 pt-1 border-t border-white/10">
            <span>Click any thread for quick response</span>
            <button
              type="button"
              onClick={() => setSurface('FULL_DISCUSSIONS')}
              className="text-amber-300 hover:underline font-bold inline-flex items-center gap-1"
            >
              Open Full Plajah Discussions <ExternalLink size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ElevateCommunicationsHub;
