/**
 * CreatorHub — the flagship "Creator Hub" landing (view id `CREATOR`).
 *
 * A blend of two directions: "The Marquee" (a cinematic triad-gradient hero +
 * per-studio feature panels) and "The Console" (an honest stat strip + a
 * recently-edited activity rail). Everything below the hero is driven by the
 * user's *real* project data — loaded from the genuine per-user services in the
 * codebase. Nothing is fabricated: no plays, no earnings, no analytics we can't
 * actually derive. Numbers come only from the loaded projects.
 *
 * Routing is purely via `onNavigate(viewId)` — the parent owns it. View ids
 * mirror CommandSplitNav's NAV_SECTIONS exactly. Guests see the whole surface;
 * only greetings and project areas swap to sign-in nudges.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Music2, Sparkles, LayoutPanelTop, Film, Clapperboard, MonitorPlay, Cctv,
  TrendingUp, Mail, AppWindow, Repeat, MapPin, BookOpen,
  Plus, Radio, ArrowRight, ArrowUpRight, Wand2, Video, PenLine,
  FolderOpen, Globe, ScrollText, LogIn, Upload, Layers, Clock,
  Megaphone, LayoutDashboard,
} from 'lucide-react';
import type { UserProfile, Album, IPWorld } from '../types';
import MarketingKit from './MarketingKit';
import { fetchUserAlbums, fetchUserWorlds } from '../services/backendService';
import { listWritingProjects } from '../services/loreaProjectsService';
import { listMyManifests, listTelaDocs } from '../services/telaStore';
// fabulaProjects is JS (no types) — listProjectsCloud() reads the signed-in user's films.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — untyped JS module
import { listProjectsCloud } from '../services/fabulaProjects';

export interface CreatorHubProps {
  user: any | null;
  userProfile: UserProfile | null;
  onNavigate: (view: string) => void;   // pass a view id; parent routes it
  onCreate?: () => void;                 // global create action (opens the content uploader)
  onGoLive?: () => void;                 // start a live stream (Reello)
  onNewPost?: () => void;                // open the post composer → posts to the user feed
}

type Lucide = React.ComponentType<{ size?: number; className?: string }>;

/* ── "Your Projects" — the real work the user has across the creative stack.
   Every source below is a genuine per-user loader discovered in the codebase;
   nothing is fabricated. One failing source never blanks the section. ───────── */
type ProjectKind = 'MUSIC' | 'BOOK' | 'TELA' | 'FILM' | 'SCRIPT' | 'WORLD';

interface ProjectItem {
  kind: ProjectKind;
  id: string;
  title: string;
  cover?: string;
  updatedAt?: number;
  subtitle?: string;
}

interface KindMeta { label: string; icon: Lucide; hue: string; grad: string; }
const KIND_META: Record<ProjectKind, KindMeta> = {
  MUSIC:  { label: 'Music',  icon: Music2,         hue: '#D40055', grad: 'linear-gradient(135deg,#D40055,#6B0099)' },
  FILM:   { label: 'Film',   icon: Film,           hue: '#00DAF3', grad: 'linear-gradient(135deg,#00DAF3,#0066FF)' },
  SCRIPT: { label: 'Script', icon: ScrollText,     hue: '#FF8C00', grad: 'linear-gradient(135deg,#FF8C00,#D40055)' },
  BOOK:   { label: 'Book',   icon: BookOpen,       hue: '#8B5CF6', grad: 'linear-gradient(135deg,#8B5CF6,#6B0099)' },
  TELA:   { label: 'Doc',    icon: LayoutPanelTop, hue: '#14B8A6', grad: 'linear-gradient(135deg,#14B8A6,#00DAF3)' },
  WORLD:  { label: 'World',  icon: Globe,          hue: '#6366F1', grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
};

/** Which tool each project kind opens in. Item-level deep-links aren't in the
 *  onNavigate contract, so each card lands in the tool that lists that project
 *  kind (Tela uses its canonical self-contained CustomEvent). */
function openProject(item: ProjectItem, onNavigate: (v: string) => void): void {
  switch (item.kind) {
    case 'MUSIC':  onNavigate('ARTIST_MANAGER'); break;
    case 'BOOK':   onNavigate('BOOKS'); break;
    case 'SCRIPT': onNavigate('BOOKS'); break;
    case 'FILM':   onNavigate('FABULA'); break;
    case 'WORLD':  onNavigate('WORLDS'); break;
    case 'TELA':
      try { window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: item.id } })); }
      catch { onNavigate('TELA'); }
      break;
  }
}

function relTime(ts?: number): string | undefined {
  if (!ts) return undefined;
  const diff = Date.now() - ts;
  if (diff < 0) return 'just now';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

/** Load every real project source in parallel; guard each so one failure never
 *  blanks the section. Returns a flat, recency-sorted list. */
async function loadAllProjects(uid: string): Promise<ProjectItem[]> {
  const results = await Promise.allSettled([
    // Music — the user's Chora/Melos releases (albums owned by uid, non-book).
    fetchUserAlbums(uid).then((albums: Album[]) =>
      (albums || [])
        .filter((a) => (a as any).type !== 'BOOK')
        .map((a): ProjectItem => ({
          kind: 'MUSIC',
          id: a.id,
          title: a.title || 'Untitled release',
          cover: a.coverThumb || a.coverImage || undefined,
          updatedAt: (a as any).createdAt || (a as any).timestamp || 0,
          subtitle: Array.isArray(a.tracks) && a.tracks.length ? `${a.tracks.length} tracks` : (a.artist || 'Release'),
        }))),
    // Books + Screenplays — the user's real Lorea writing work.
    listWritingProjects(uid).then(({ projects }) =>
      (projects || []).map((p): ProjectItem => ({
        kind: p.kind === 'SCRIPT' ? 'SCRIPT' : 'BOOK',
        id: p.id,
        title: p.title || (p.kind === 'SCRIPT' ? 'Untitled script' : 'Untitled book'),
        cover: p.coverImageUrl || undefined,
        updatedAt: p.updatedAt || p.createdAt || 0,
        subtitle: p.kind === 'SCRIPT'
          ? `${p.chapterCount || 0} scenes`
          : `${p.chapterCount || 0} chapters`,
      }))),
    // Films — the user's Fabula productions (cloud index).
    Promise.resolve(listProjectsCloud()).then((rows: any[]) =>
      (rows || []).map((r): ProjectItem => ({
        kind: 'FILM',
        id: r.id,
        title: r.title || 'Untitled film',
        updatedAt: r.updated || 0,
        subtitle: r.sceneCount ? `${r.sceneCount} scenes` : 'Production',
      }))),
    // Tela docs — cloud manifests + any local-only bundles, deduped by id.
    Promise.all([
      listMyManifests().catch(() => []),
      listTelaDocs().catch(() => []),
    ]).then(([cloud, local]) => {
      const byId = new Map<string, ProjectItem>();
      for (const m of [...cloud, ...local]) {
        if (!m?.id || byId.has(m.id)) continue;
        byId.set(m.id, {
          kind: 'TELA',
          id: m.id,
          title: m.title || 'Untitled canvas',
          updatedAt: m.updatedAt || 0,
          subtitle: 'Document',
        });
      }
      return [...byId.values()];
    }),
    // Worlds — the user's IP universes.
    fetchUserWorlds(uid).then((worlds: IPWorld[]) =>
      (worlds || []).map((w): ProjectItem => ({
        kind: 'WORLD',
        id: w.id,
        title: w.name || 'Untitled world',
        cover: w.coverImage || undefined,
        updatedAt: w.publishedAt || (w as any).createdAt || (w as any).timestamp || 0,
        subtitle: w.worldType === 'NON_FICTION' ? 'Non-fiction world' : 'Fiction world',
      }))),
  ]);

  const items: ProjectItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) items.push(...r.value);
  }
  return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/* ── Studio panels — one feature panel per studio. Each panel carries ITS real
   projects (filtered from the loaded set) and opens the matching tool. ─────── */
interface StudioDef {
  key: string;
  tagline: string;
  icon: Lucide;
  navId: string;           // header click → open the tool
  kinds: ProjectKind[];    // which project kinds live in this studio
  grad: string;            // per-studio accent gradient
  glow: string;            // "r,g,b" for rgba() glows
  large?: boolean;         // Melos is the big tile
}
const STUDIOS: StudioDef[] = [
  { key: 'Melos',  tagline: 'Music & releases',      icon: Music2,         navId: 'ARTIST_MANAGER',
    kinds: ['MUSIC'],           grad: 'linear-gradient(135deg,#6B0099,#D40055)', glow: '212,0,85',  large: true },
  { key: 'Fabula', tagline: 'Film & the timeline',   icon: Film,           navId: 'FABULA',
    kinds: ['FILM'],            grad: 'linear-gradient(135deg,#0066FF,#00DAF3)', glow: '0,218,243' },
  { key: 'Tela',   tagline: 'Docs, sheets & canvas', icon: LayoutPanelTop, navId: 'TELA',
    kinds: ['TELA'],            grad: 'linear-gradient(135deg,#6B0099,#00DAF3)', glow: '0,218,243' },
  { key: 'Lorea',  tagline: 'Books & screenplays',   icon: BookOpen,       navId: 'BOOKS',
    kinds: ['BOOK', 'SCRIPT'],  grad: 'linear-gradient(135deg,#FBBF24,#FF8C00)', glow: '255,140,0' },
  { key: 'Worlds', tagline: 'Your IP universes',     icon: Globe,          navId: 'WORLDS',
    kinds: ['WORLD'],           grad: 'linear-gradient(135deg,#8B5CF6,#6366F1)', glow: '139,92,246' },
];

/* ── "More tools" — the non-studio tools not given a panel. Ids mirror
   CommandSplitNav's NAV_SECTIONS exactly. ─────────────────────────────────── */
const MORE_TOOLS: { id: string; label: string; icon: Lucide }[] = [
  { id: 'ARTIST_MANAGER', label: 'Artist Manager',    icon: Music2 },
  { id: 'TV_STUDIO',      label: 'TV Studio',         icon: Clapperboard },
  { id: 'AMBO',           label: 'Ambo',              icon: MonitorPlay },
  { id: 'MEDIA_ROUTER',   label: 'Router & Switcher', icon: Cctv },
  { id: 'POSTMAN',        label: 'The Postman',       icon: Mail },
  { id: 'TERRA',          label: 'Terra',             icon: MapPin },
  { id: 'APPS',           label: 'Apps',              icon: AppWindow },
  { id: 'CROSSOVER',      label: 'Crossover',         icon: Repeat },
];

/* Quick-create chips — honest actions only, no fabricated data. */
interface QuickChip { label: string; icon: Lucide; run: () => void; }

const EASE = [0.2, 0, 0, 1] as const;

export default function CreatorHub({
  user, userProfile, onNavigate, onCreate, onGoLive, onNewPost,
}: CreatorHubProps) {
  const isGuest = !user;
  const firstName = (userProfile?.displayName || '').trim().split(/\s+/)[0] || '';
  const reduce = useReducedMotion();
  const [hubTab, setHubTab] = useState<'OVERVIEW' | 'MARKETING'>('OVERVIEW');

  const quickChips: QuickChip[] = [
    { label: 'New Doc', icon: PenLine, run: () => onNavigate('TELA') },
    { label: 'New Video', icon: Video, run: () => onNavigate('FABULA') },
    { label: 'Go Live', icon: Radio, run: () => (onGoLive ? onGoLive() : onNavigate('LIVE_HUB')) },
    { label: 'New Post', icon: Plus, run: () => (onNewPost ? onNewPost() : onNavigate('FEED')) },
  ];

  /* ── Projects state ── */
  const panelsRef = useRef<HTMLDivElement | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(!isGuest);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) { setProjects([]); setLoadingProjects(false); return; }
    let alive = true;
    setLoadingProjects(true);
    loadAllProjects(uid)
      .then((items) => { if (alive) setProjects(items); })
      .catch(() => { if (alive) setProjects([]); })
      .finally(() => { if (alive) setLoadingProjects(false); });
    return () => { alive = false; };
  }, [user?.uid]);

  /* ── Honest stats — derived SOLELY from the loaded project data. ── */
  const stats = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 3600 * 1000;
    const total = projects.length;
    const editedThisWeek = projects.filter((p) => p.updatedAt && now - p.updatedAt < weekMs).length;
    const studiosActive = STUDIOS.filter((s) => projects.some((p) => s.kinds.includes(p.kind))).length;
    const mostRecent = projects[0]; // list is recency-sorted
    // Sparkline: projects touched per week over the last 8 weeks (oldest→newest).
    const buckets = new Array(8).fill(0) as number[];
    for (const p of projects) {
      if (!p.updatedAt) continue;
      const weeksAgo = Math.floor((now - p.updatedAt) / weekMs);
      if (weeksAgo >= 0 && weeksAgo < 8) buckets[7 - weeksAgo] += 1;
    }
    const hasSpark = buckets.some((b) => b > 0);
    return { total, editedThisWeek, studiosActive, mostRecent, buckets, hasSpark };
  }, [projects]);

  const recent = useMemo(() => projects.slice(0, 6), [projects]);

  const scrollToPanels = () => panelsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /** Reveal props for scroll-in cards, disabled under reduced motion. */
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-50px' },
          transition: { duration: 0.45, ease: EASE, delay },
        };

  return (
    <div className="min-h-full w-full overflow-x-hidden text-white" style={{ background: '#0A0A0D' }}>
      {/* ══ 0 · HUB TABS — Overview | Marketing ═══════════════════════════ */}
      <HubTabs tab={hubTab} setTab={setHubTab} />

      {hubTab === 'MARKETING' ? (
        !isGuest && user && userProfile ? (
          <div className="mx-auto w-full max-w-[1400px]">
            <MarketingKit
              scope={{ kind: 'CREATOR', id: user.uid, name: userProfile.displayName }}
              currentUser={userProfile}
            />
          </div>
        ) : (
          <MarketingGuestNudge onNavigate={onNavigate} onCreate={onCreate} />
        )
      ) : (
      <>
      {/* ══ 1 · CINEMATIC HERO (Marquee) ══════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Brand-triad gradient field */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 12% -10%, rgba(107,0,153,0.55) 0%, transparent 55%),' +
              'radial-gradient(110% 80% at 92% 0%, rgba(212,0,85,0.42) 0%, transparent 52%),' +
              'radial-gradient(90% 70% at 60% 120%, rgba(255,140,0,0.22) 0%, transparent 60%)',
          }}
        />
        {/* Soft radial glows — magenta + cyan */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-[26rem] w-[26rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(0,218,243,0.30), transparent 68%)' }}
          animate={reduce ? undefined : { y: [0, 26, 0], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-40 -left-24 h-[22rem] w-[22rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(212,0,85,0.28), transparent 68%)' }}
          animate={reduce ? undefined : { y: [0, -22, 0], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
          style={{ background: 'linear-gradient(to bottom, transparent, #0A0A0D)' }}
        />

        <div className="relative mx-auto w-full max-w-[1400px] px-5 pb-14 pt-14 sm:px-8 md:pt-20">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="pj-eyebrow mb-4 !text-white/70"
          >
            Creator Hub
          </motion.p>

          {/* Greeting line — first-name when signed in, invite when guest */}
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.04 }}
            className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-white/45"
          >
            {isGuest
              ? 'Every tool you create with — together in one place'
              : `Welcome back${firstName ? `, ${firstName}` : ''} — here's your studio`}
          </motion.p>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.06 }}
            className="font-display text-[2.6rem] font-black italic uppercase leading-[0.94] tracking-tight sm:text-[3.6rem] md:text-[4.6rem]"
          >
            <span className="block text-white">Everything you make,</span>
            <span className="block pj-text-brand">one home.</span>
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.12 }}
            className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg"
          >
            {isGuest
              ? "Every creative tool on Plajah — studios, film, live, publishing and business — gathered in one place. Explore it all; sign in when you're ready to build."
              : 'Every studio, stage and storefront you have on Plajah, gathered in one place. Pick up where you left off, or start something new.'}
          </motion.p>

          {/* Primary actions — Create · Go Live · Import */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.18 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={() => (onCreate ? onCreate() : onNavigate('PLAJAH_STUDIO'))}
              className="group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-black uppercase tracking-wide text-white transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0D]"
              style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
            >
              <Wand2 size={18} />
              Create
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => (onGoLive ? onGoLive() : onNavigate('LIVE_HUB'))}
              className="group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-black uppercase tracking-wide transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0D]"
              style={{ background: 'var(--pj-orange)', color: '#12080a', boxShadow: 'var(--pj-glow-orange)' }}
            >
              <Radio size={18} />
              Go Live
            </button>

            <button
              type="button"
              onClick={() => onNavigate('PLAJAH_STUDIO')}
              className="group inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-white/90 backdrop-blur-md transition-colors duration-200 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0D]"
            >
              <Upload size={18} />
              Import
            </button>
          </motion.div>

          {/* Quick-create strip */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.26 }}
            className="mt-10 flex flex-wrap items-center gap-2.5"
          >
            <span className="mr-1 text-[0.62rem] font-black uppercase tracking-[0.2em] text-white/35">
              Quick create
            </span>
            {quickChips.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={c.run}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.14] bg-white/[0.05] px-3.5 py-2 text-[0.74rem] font-bold text-white/85 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <Icon size={13} />
                  {c.label}
                </button>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══ 2 · STAT STRIP (Console) — honest numbers only ═════════════════ */}
      {!isGuest && (
        <section className="relative mx-auto w-full max-w-[1400px] px-5 pt-2 sm:px-8">
          {loadingProjects ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
              ))}
            </div>
          ) : (
            <motion.div {...reveal()} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={FolderOpen}
                hue="#D40055"
                label="Total projects"
                value={stats.total}
                spark={stats.hasSpark ? stats.buckets : undefined}
              />
              <StatCard
                icon={Layers}
                hue="#00DAF3"
                label="Studios active"
                value={stats.studiosActive}
                sub={`of ${STUDIOS.length} studios`}
              />
              <StatCard
                icon={TrendingUp}
                hue="#FF8C00"
                label="Edited this week"
                value={stats.editedThisWeek}
              />
              <StatCard
                icon={Clock}
                hue="#8B5CF6"
                label="Most recent"
                text={stats.mostRecent?.title || '—'}
                sub={stats.mostRecent ? (relTime(stats.mostRecent.updatedAt) || KIND_META[stats.mostRecent.kind].label) : 'Nothing yet'}
              />
            </motion.div>
          )}
        </section>
      )}

      {/* ══ 3 + 4 · STUDIO PANELS (Marquee) + RECENTLY EDITED RAIL (Console) ═ */}
      <div
        ref={panelsRef}
        className="relative mx-auto w-full max-w-[1400px] scroll-mt-6 px-5 pt-10 sm:px-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden className="h-6 w-1.5 rounded-full" style={{ background: 'var(--pj-grad-brand)' }} />
          <h2 className="font-display text-2xl font-black italic uppercase tracking-tight text-white sm:text-3xl">
            Your Studios
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Studio bento ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loadingProjects
              ? STUDIOS.map((s) => (
                  <div
                    key={s.key}
                    className={`h-[220px] animate-pulse rounded-[1.75rem] border border-white/10 bg-white/[0.03] ${s.large ? 'sm:col-span-2 lg:col-span-2' : ''}`}
                  />
                ))
              : STUDIOS.map((s, i) => (
                  <StudioPanel
                    key={s.key}
                    studio={s}
                    items={projects.filter((p) => s.kinds.includes(p.kind))}
                    isGuest={isGuest}
                    onNavigate={onNavigate}
                    reveal={reveal(Math.min(i, 5) * 0.04)}
                  />
                ))}
          </div>

          {/* ── Recently edited rail ── */}
          <aside className="min-w-0">
            <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-white/45" />
                  <h3 className="font-display text-sm font-black uppercase tracking-wide text-white">
                    Recently edited
                  </h3>
                </div>
              </div>

              {isGuest ? (
                <RailNudge onNavigate={onNavigate} onCreate={onCreate} />
              ) : loadingProjects ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                  <span
                    className="mb-3 grid h-11 w-11 place-items-center rounded-2xl text-white"
                    style={{ background: 'var(--pj-grad-spatial)' }}
                  >
                    <Sparkles size={20} />
                  </span>
                  <p className="text-sm font-bold text-white">Nothing here yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/45">
                    The last things you touch across every studio will show up here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1 p-2.5">
                  {recent.map((item) => {
                    const meta = KIND_META[item.kind];
                    const Icon = meta.icon;
                    const when = relTime(item.updatedAt);
                    return (
                      <button
                        key={`${item.kind}:${item.id}`}
                        type="button"
                        onClick={() => openProject(item, onNavigate)}
                        aria-label={`Open ${item.title} in ${meta.label}`}
                        className="group flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                          style={{ background: meta.grad }}
                        >
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.86rem] font-bold leading-tight text-white">
                            {item.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[0.68rem] text-white/45">
                            <span
                              className="rounded-full px-1.5 py-px text-[0.56rem] font-black uppercase tracking-[0.1em]"
                              style={{ color: meta.hue, boxShadow: `inset 0 0 0 1px ${meta.hue}55` }}
                            >
                              {meta.label}
                            </span>
                            {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                          </span>
                        </span>
                        {when && (
                          <span className="shrink-0 text-[0.66rem] tabular-nums text-white/40">{when}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ══ 5 · MORE TOOLS BAR (Marquee) ═══════════════════════════════ */}
        <section className="pt-14">
          <div className="mb-5 flex items-center gap-3">
            <span aria-hidden className="h-6 w-1.5 rounded-full" style={{ background: 'var(--pj-grad-ember)' }} />
            <h2 className="font-display text-2xl font-black italic uppercase tracking-tight text-white sm:text-3xl">
              More tools
            </h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {MORE_TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onNavigate(t.id)}
                  aria-label={`Open ${t.label}`}
                  className="group inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0D]"
                >
                  <Icon size={16} className="text-white/55 transition-colors duration-200 group-hover:text-white" />
                  {t.label}
                  <ArrowUpRight size={14} className="text-white/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/70" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Footer flourish */}
        <div className="mb-24 mt-16 rounded-[2rem] border border-white/10 bg-white/[0.03] px-8 py-10 text-center">
          <p className="pj-eyebrow mb-3 !text-white/45">Plajah</p>
          <p className="mx-auto max-w-xl font-display text-xl font-black italic uppercase leading-tight tracking-tight text-white sm:text-2xl">
            One platform for <span className="pj-text-brand">everything you create.</span>
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/50">
            Music, film, live, writing, business — it all lives here, and it all connects.
          </p>
          <button
            type="button"
            onClick={() => (onCreate ? onCreate() : onNavigate('PLAJAH_STUDIO'))}
            className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-black uppercase tracking-wide text-white transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0D]"
            style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
          >
            <Wand2 size={16} />
            Start creating
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ── Hub tabs — Overview | Marketing. A lightweight segmented control at the top
   of the Creator Hub; Overview keeps the full landing, Marketing swaps in the
   identity-scoped MarketingKit (Organic ⇄ Paid). ─────────────────────────────── */
function HubTabs({ tab, setTab }: { tab: 'OVERVIEW' | 'MARKETING'; setTab: (t: 'OVERVIEW' | 'MARKETING') => void }) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-8">
      <div className="inline-flex items-center gap-1 p-1 rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-md">
        {([
          ['OVERVIEW', 'Overview', LayoutDashboard],
          ['MARKETING', 'Marketing', Megaphone],
        ] as const).map(([id, label, Icon]) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-[0.78rem] font-black uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)] ${
                on ? 'text-black' : 'text-white/55 hover:text-white/85'
              }`}
            >
              {on && (
                <motion.span
                  layoutId="hub-tab-pill"
                  className="absolute inset-0 rounded-xl bg-white"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2"><Icon size={14} /> {label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Guest nudge for the Marketing tab — mirrors RailNudge's sign-in affordance. ── */
function MarketingGuestNudge({ onNavigate, onCreate }: { onNavigate: (v: string) => void; onCreate?: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-center px-6 py-24 text-center">
      <span
        className="mb-5 grid h-14 w-14 place-items-center rounded-2xl text-white"
        style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
      >
        <Megaphone size={26} />
      </span>
      <p className="font-display text-2xl font-black italic uppercase tracking-tight text-white">Marketing lives here</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-white/55">
        Compose &amp; schedule across every network, track your channels, and boost with ad packages —
        all scoped to your creator identity. Sign in to get started.
      </p>
      <button
        type="button"
        onClick={() => (onCreate ? onCreate() : onNavigate('LANDING'))}
        className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-black uppercase tracking-wide text-white transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
      >
        <LogIn size={15} />
        Sign in
      </button>
    </div>
  );
}

/* ── A single honest stat card (Console). Figures use tabular-nums. ── */
function StatCard({
  icon: Icon, hue, label, value, text, sub, spark,
}: {
  icon: Lucide; hue: string; label: string;
  value?: number; text?: string; sub?: string; spark?: number[];
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-white/40">{label}</span>
        <span
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{ background: `${hue}22`, color: hue, boxShadow: `inset 0 0 0 1px ${hue}44` }}
        >
          <Icon size={14} />
        </span>
      </div>
      {text !== undefined ? (
        <span className="truncate font-display text-lg font-black tracking-tight text-white">{text}</span>
      ) : (
        <span className="font-display text-3xl font-black tabular-nums leading-none tracking-tight text-white">
          {value ?? 0}
        </span>
      )}
      {sub && <span className="mt-1.5 truncate text-[0.7rem] text-white/45">{sub}</span>}
      {spark && spark.length > 0 && (
        <div className="mt-2.5">
          <Sparkline data={spark} color={hue} />
        </div>
      )}
    </div>
  );
}

/** Tiny honest sparkline — projects touched per week over the last 8 weeks. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  const w = 100, h = 24, n = data.length, gap = 3;
  const bw = (w - gap * (n - 1)) / n;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full" preserveAspectRatio="none" aria-hidden>
      {data.map((v, i) => {
        const bh = Math.max(2, (v / max) * h);
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={h - bh}
            width={bw}
            height={bh}
            rx={1.2}
            fill={color}
            opacity={0.3 + 0.7 * (v / max)}
          />
        );
      })}
    </svg>
  );
}

/* ── One studio feature panel — carries its real projects, opens its tool. ── */
function StudioPanel({
  studio, items, isGuest, onNavigate, reveal,
}: {
  studio: StudioDef;
  items: ProjectItem[];
  isGuest: boolean;
  onNavigate: (v: string) => void;
  reveal: Record<string, unknown>;
}) {
  const Icon = studio.icon;
  const max = studio.large ? 6 : 4;
  const rows = items.slice(0, max);
  const spanCls = studio.large ? 'sm:col-span-2 lg:col-span-2' : '';

  return (
    <motion.div
      {...reveal}
      className={`group/panel relative flex flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5 transition-colors duration-300 hover:border-white/[0.16] ${spanCls}`}
    >
      {/* accent hairline + hover glow */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: studio.grad }} />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover/panel:opacity-100"
        style={{ background: `radial-gradient(circle, rgba(${studio.glow},0.4), transparent 70%)` }}
      />

      {/* Header — opens the tool */}
      <button
        type="button"
        onClick={() => onNavigate(studio.navId)}
        aria-label={`Open ${studio.key}`}
        className="relative flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
      >
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white transition-transform duration-300 group-hover/panel:scale-105"
          style={{ background: studio.grad, boxShadow: `0 8px 22px rgba(${studio.glow},0.28)` }}
        >
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-display text-xl font-black italic tracking-tight text-white">{studio.key}</span>
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[0.6rem] font-black tabular-nums text-white/60">
              {items.length}
            </span>
          </span>
          <span className="block text-[0.72rem] text-white/45">{studio.tagline}</span>
        </span>
        <ArrowUpRight size={16} className="shrink-0 text-white/30 transition-all duration-300 group-hover/panel:translate-x-0.5 group-hover/panel:-translate-y-0.5 group-hover/panel:text-white/80" />
      </button>

      {/* Body — real project rows, or a start affordance */}
      {rows.length > 0 ? (
        <div className="relative mt-4 flex flex-col gap-1">
          {rows.map((item) => {
            const meta = KIND_META[item.kind];
            const RowIcon = meta.icon;
            const when = relTime(item.updatedAt);
            return (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                onClick={() => openProject(item, onNavigate)}
                aria-label={`Open ${item.title}`}
                className="group/row flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-200 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
              >
                <span
                  aria-hidden
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                  style={{ color: meta.hue, boxShadow: `inset 0 0 0 1px ${meta.hue}44`, background: `${meta.hue}18` }}
                >
                  <RowIcon size={12} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold text-white/90 group-hover/row:text-white">
                  {item.title}
                </span>
                {when && <span className="shrink-0 text-[0.64rem] tabular-nums text-white/35">{when}</span>}
              </button>
            );
          })}
          {items.length > rows.length && (
            <button
              type="button"
              onClick={() => onNavigate(studio.navId)}
              className="mt-1 self-start rounded-lg px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-white/45 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
            >
              +{items.length - rows.length} more
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onNavigate(studio.navId)}
          className="relative mt-4 flex items-center gap-2 rounded-xl border border-dashed border-white/[0.14] bg-white/[0.02] px-3.5 py-3 text-left text-[0.78rem] font-semibold text-white/55 transition-colors duration-200 hover:border-white/25 hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
        >
          <Plus size={14} />
          {isGuest ? `Explore ${studio.key}` : `Start something in ${studio.key}`}
        </button>
      )}
    </motion.div>
  );
}

/** Rail placeholder for guests — a gentle sign-in nudge where projects would be. */
function RailNudge({ onNavigate, onCreate }: { onNavigate: (v: string) => void; onCreate?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <span
        className="mb-4 grid h-12 w-12 place-items-center rounded-2xl text-white"
        style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
      >
        <FolderOpen size={22} />
      </span>
      <p className="text-sm font-bold text-white">Sign in to see your work</p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/50">
        Your music, films, docs, books and worlds all gather here once you&apos;re signed in.
      </p>
      <button
        type="button"
        onClick={() => (onCreate ? onCreate() : onNavigate('LANDING'))}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.78rem] font-black uppercase tracking-wide text-white transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
      >
        <LogIn size={15} />
        Sign in
      </button>
    </div>
  );
}
