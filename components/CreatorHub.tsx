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
  Plus, Radio, ArrowRight, ArrowUpRight, Wand2, PenLine,
  FolderOpen, Globe, ScrollText, LogIn, Upload, Layers, Clock,
  Megaphone, LayoutDashboard, Disc3, Grid3x3,
  DollarSign, CheckCircle2, CheckSquare, FileText, Calendar, CalendarDays,
  Users, Send, BookMarked, ClipboardList, Eye, Search, Newspaper, Receipt,
  Flag, Coffee,
} from 'lucide-react';
import type { UserProfile, Album, IPWorld } from '../types';
import MarketingKit from './MarketingKit';
import { fetchUserAlbums, fetchUserWorlds } from '../services/backendService';
import { listWritingProjects } from '../services/loreaProjectsService';
import { listMyManifests, listTelaDocs } from '../services/telaStore';
import { fetchMyProductions as fetchMusicProductions, PRODUCTION_STATUSES } from '../services/melosService';
import { fetchMyProductions as fetchFilmProductions } from '../services/filmProductionService';
import { isDemoMode, setDemoMode, subscribeDemoMode } from '../services/demoMode';
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

type Lucide = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties; color?: string }>;

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
  count?: number;   // honest per-item metric: tracks | scenes | chapters
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
          count: Array.isArray(a.tracks) ? a.tracks.length : undefined,
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
        count: p.chapterCount || 0,
      }))),
    // Films — the user's Fabula productions (cloud index).
    Promise.resolve(listProjectsCloud()).then((rows: any[]) =>
      (rows || []).map((r): ProjectItem => ({
        kind: 'FILM',
        id: r.id,
        title: r.title || 'Untitled film',
        updatedAt: r.updated || 0,
        subtitle: r.sceneCount ? `${r.sceneCount} scenes` : 'Production',
        count: typeof r.sceneCount === 'number' ? r.sceneCount : undefined,
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
  { id: 'DJ_CONSOLE',     label: 'DJ Console',        icon: Disc3 },
  { id: 'PLAJAH_PIXELS',  label: 'Plajah Pixels',     icon: Grid3x3 },
  { id: 'TV_STUDIO',      label: 'TV Studio',         icon: Clapperboard },
  { id: 'AMBO',           label: 'Ambo',              icon: MonitorPlay },
  { id: 'MEDIA_ROUTER',   label: 'Router & Switcher', icon: Cctv },
  { id: 'POSTMAN',        label: 'The Postman',       icon: Mail },
  { id: 'TERRA',          label: 'Terra',             icon: MapPin },
  { id: 'APPS',           label: 'Apps',              icon: AppWindow },
  { id: 'CROSSOVER',      label: 'Crossover',         icon: Repeat },
];

/* ── Artist Manager surface — the professional workflow layer. Creator Hub
   surfaces each discipline's real dashboard + task shortcuts so the workflow
   capability isn't buried behind the "Artist Manager" tile. ─────────────────── */
type Disc = 'music' | 'film' | 'writer';

/** Deep-link into a specific Artist Manager discipline + tab. Mirrors the app's
 *  existing `plajah_pm_discipline_v1` lever and hands the target tab to AM via a
 *  one-shot sessionStorage intent that AM's activeTab initializer consumes.
 *  `MELOS` is a top-level view, so it routes directly. */
const AM_INTENT_TAB_KEY = 'plajah_pm_intent_tab_v1';
const AM_DISCIPLINE_KEY = 'plajah_pm_discipline_v1';
function openAm(disc: Disc, tab: string | undefined, onNavigate: (v: string) => void): void {
  try {
    localStorage.setItem(AM_DISCIPLINE_KEY, disc);
    if (tab) sessionStorage.setItem(AM_INTENT_TAB_KEY, tab);
    else sessionStorage.removeItem(AM_INTENT_TAB_KEY);
  } catch { /* storage disabled — AM opens on its default tab */ }
  onNavigate('ARTIST_MANAGER');
}

/** One task shortcut inside a discipline dashboard. `tab` deep-links into AM;
 *  `melos: true` routes to the standalone Melos view instead. */
interface TaskShortcut { label: string; icon: Lucide; tab?: string; melos?: boolean; }

interface DisciplineDash {
  disc: Disc;
  name: string;
  desc: string;
  icon: Lucide;
  hue: string;               // discipline accent, matching Artist Manager's DISCIPLINES
  kinds: ProjectKind[];      // which loaded project kinds count as this discipline's productions
  overviewTab: string;       // AM tab the "Open … Manager" footer lands on
  shortcuts: TaskShortcut[];
}

const DISCIPLINE_DASH: DisciplineDash[] = [
  {
    disc: 'music', name: 'Music Production', desc: 'Artist · Band · Label',
    icon: Music2, hue: '#FF8C00', kinds: ['MUSIC'], overviewTab: 'overview',
    shortcuts: [
      { label: 'Open Melos', icon: Music2, melos: true },
      { label: 'Boards', icon: ClipboardList, tab: 'boards' },
      { label: 'Events', icon: Calendar, tab: 'events' },
      { label: 'Contracts', icon: FileText, tab: 'contracts' },
      { label: 'Invoices', icon: Receipt, tab: 'invoices' },
      { label: 'Band Payroll', icon: Users, tab: 'payroll' },
      { label: 'Promote', icon: Megaphone, tab: 'promote' },
      { label: 'Venues', icon: MapPin, tab: 'venues' },
    ],
  },
  {
    disc: 'film', name: 'Film Production', desc: 'Director · Producer · EP',
    icon: Film, hue: '#A855F7', kinds: ['FILM'], overviewTab: 'film_overview',
    shortcuts: [
      { label: 'On Set', icon: Cctv, tab: 'film_hub' },
      { label: 'Call Sheets', icon: ClipboardList, tab: 'film_callsheets' },
      { label: 'Script Supervision', icon: Eye, tab: 'film_script' },
      { label: 'My Brief', icon: FileText, tab: 'film_brief' },
      { label: 'Roster', icon: Users, tab: 'film_roster' },
      { label: 'Craft', icon: Coffee, tab: 'film_craft' },
      { label: 'Budget', icon: DollarSign, tab: 'film_budget' },
      { label: 'Schedule', icon: CalendarDays, tab: 'film_schedule' },
      { label: 'Distribution', icon: Flag, tab: 'film_distro' },
    ],
  },
  {
    disc: 'writer', name: 'Writer / Journalist', desc: 'Author · Journalist · Blogger',
    icon: PenLine, hue: '#06B6D4', kinds: ['BOOK', 'SCRIPT'], overviewTab: 'writer_overview',
    shortcuts: [
      { label: 'Projects', icon: BookMarked, tab: 'writer_projects' },
      { label: 'Manuscripts', icon: FileText, tab: 'writer_manuscripts' },
      { label: 'Research', icon: Search, tab: 'writer_research' },
      { label: 'Submissions', icon: Send, tab: 'writer_submissions' },
      { label: 'Events', icon: Calendar, tab: 'writer_events' },
      { label: 'Press', icon: Newspaper, tab: 'writer_press' },
    ],
  },
];

/* ── Honest KPI reads. Music & Writer numbers come from the SAME localStorage
   stores Artist Manager writes (`plajah_pm_*_v1`) — real user data, honest zeros
   when empty; nothing fabricated. Film's live KPIs live in AM's in-memory
   production context, so the hub derives Film stats from the loaded films. ──── */
function readPm(key: string): any[] {
  try { return JSON.parse(localStorage.getItem(`plajah_pm_${key}_v1`) || '[]'); }
  catch { return []; }
}
function lineTotal(inv: any): number {
  return (inv?.lineItems || []).reduce((a: number, l: any) => a + (Number(l?.qty) || 0) * (Number(l?.rate) || 0), 0);
}

interface MusicKpis { outstanding: number; collected: number; openTasks: number; totalTasks: number; contracts: number; totalContracts: number; hasData: boolean; }
interface WriterKpis { active: number; totalProjects: number; words: number; inReview: number; events: number; hasData: boolean; }

/** Artist Manager's writer demo (`ensureWriterDemo`) seeds rows with sentinel ids.
 *  When demo mode is off we filter them out so KPIs reflect only real work. */
const WRITER_DEMO_IDS = new Set(['proj1', 'proj2', 'proj3']);

function readAmKpis(includeDemo: boolean): { music: MusicKpis; writer: WriterKpis } {
  const invoices = readPm('invoices');
  const contracts = readPm('contracts');
  const tasks = readPm('tasks');
  // Music stores have no demo seeds — nothing to filter here.
  const music: MusicKpis = {
    outstanding: invoices.filter((i) => i.status === 'SENT' || i.status === 'OVERDUE').reduce((s, i) => s + lineTotal(i), 0),
    collected: invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + lineTotal(i), 0),
    openTasks: tasks.filter((t) => t.status !== 'DONE').length,
    totalTasks: tasks.length,
    contracts: contracts.filter((c) => c.status === 'SIGNED').length,
    totalContracts: contracts.length,
    hasData: invoices.length > 0 || contracts.length > 0 || tasks.length > 0,
  };
  let wProjects = readPm('writer_projects');
  let wSubs = readPm('writer_subs');
  let wEvents = readPm('writer_events');
  if (!includeDemo) {
    wProjects = wProjects.filter((p) => !WRITER_DEMO_IDS.has(p.id));
    wSubs = wSubs.filter((s) => !WRITER_DEMO_IDS.has(s.projectId));
    wEvents = wEvents.filter((e) => !WRITER_DEMO_IDS.has(e.projectId));
  }
  const writer: WriterKpis = {
    active: wProjects.filter((p) => ['ACTIVE', 'DRAFTING', 'EDITING'].includes(p.status)).length,
    totalProjects: wProjects.length,
    words: wProjects.reduce((s, p) => s + (Number(p.wordCountCurrent) || 0), 0),
    inReview: wSubs.filter((s) => s.status === 'SENT' || s.status === 'UNDER_REVIEW').length,
    events: wEvents.filter((e) => e.status === 'CONFIRMED' || e.status === 'PLANNING').length,
    hasData: wProjects.length > 0,
  };
  return { music, writer };
}

function fmtMoney(n: number): string {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

/* ── Live cross-discipline productions (with real status). Music comes from
   melosService, Film from filmProductionService, Writing from Lorea. Each row
   carries a real status pill; demo/showcase rows are flagged so the demo toggle
   can hide them. ──────────────────────────────────────────────────────────── */
interface ProductionRow {
  disc: Disc;
  id: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusColor: string;
  isDemo: boolean;
  updatedAt?: number;
  melosProductionId?: string; // real music productions open to their record
}

interface DiscMeta { label: string; icon: Lucide; hue: string; grad: string; }
const DISC_META: Record<Disc, DiscMeta> = {
  music:  { label: 'Music',  icon: Music2,  hue: '#FF8C00', grad: 'linear-gradient(135deg,#FF8C00,#D40055)' },
  film:   { label: 'Film',   icon: Film,    hue: '#A855F7', grad: 'linear-gradient(135deg,#A855F7,#6B0099)' },
  writer: { label: 'Writer', icon: PenLine, hue: '#06B6D4', grad: 'linear-gradient(135deg,#06B6D4,#0066FF)' },
};

const MUSIC_STATUS = new Map(PRODUCTION_STATUSES.map((s) => [s.key, s]));
const FILM_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: '#06D6A0' },
  ARCHIVED: { label: 'Archived', color: '#9C96B4' },
};
const WRITER_STATUS: Record<string, { label: string; color: string }> = {
  DRAFTING: { label: 'Drafting', color: '#00DAF3' },
  EDITING: { label: 'Editing', color: '#D0BCFF' },
  ACTIVE: { label: 'Active', color: '#06D6A0' },
  PUBLISHED: { label: 'Published', color: '#06D6A0' },
  SUBMITTED: { label: 'In review', color: '#FF8C00' },
};

/** The canonical platform showcase — mirrors Artist Manager's demos (same titles
 *  and statuses). Shown only when demo mode is on. */
const DEMO_PRODUCTIONS: ProductionRow[] = [
  { disc: 'music',  id: 'demo-neon-cathedral', title: 'Neon Cathedral', subtitle: '“the Detroit record” · Vela', statusLabel: 'Tracking', statusColor: '#FF8C00', isDemo: true },
  { disc: 'film',   id: 'demo-halflight',      title: 'Halflight',      subtitle: 'Feature · Production Showcase', statusLabel: 'On set', statusColor: '#06D6A0', isDemo: true },
  { disc: 'writer', id: 'demo-weight',         title: 'The Weight of Small Things', subtitle: 'Book · Literary Fiction', statusLabel: 'Drafting', statusColor: '#00DAF3', isDemo: true },
  { disc: 'writer', id: 'demo-protest',        title: 'The New Language of Protest Music', subtitle: 'Article · Music Journalism', statusLabel: 'In review', statusColor: '#FF8C00', isDemo: true },
  { disc: 'writer', id: 'demo-detroit',        title: 'Detroit Futures', subtitle: 'Newsletter · Urban Affairs', statusLabel: 'Active', statusColor: '#06D6A0', isDemo: true },
];

/** Load the user's real productions across disciplines, most-recent first.
 *  Each source is guarded so one failure never blanks the list. */
async function loadProductions(uid: string): Promise<ProductionRow[]> {
  const results = await Promise.allSettled([
    fetchMusicProductions(uid),
    fetchFilmProductions(uid),
    listWritingProjects(uid),
  ]);
  const rows: ProductionRow[] = [];

  if (results[0].status === 'fulfilled') {
    for (const p of (results[0].value || []) as any[]) {
      const st = MUSIC_STATUS.get(p.status);
      rows.push({
        disc: 'music', id: p.id, title: p.title || 'Untitled record',
        subtitle: p.workingTitle || p.artistName || undefined,
        statusLabel: st?.label || String(p.status || '—'), statusColor: st?.color || '#9C96B4',
        isDemo: false, updatedAt: p.updatedAt || 0, melosProductionId: p.id,
      });
    }
  }
  if (results[1].status === 'fulfilled') {
    for (const p of (results[1].value || []) as any[]) {
      if (p.isShowcase) continue;            // showcase = demo, surfaced via DEMO_PRODUCTIONS
      if (p.status === 'ARCHIVED') continue;  // keep the active list focused
      const st = FILM_STATUS[p.status || 'ACTIVE'] || FILM_STATUS.ACTIVE;
      rows.push({
        disc: 'film', id: p.id, title: p.title || 'Untitled film',
        subtitle: p.format || 'Production',
        statusLabel: st.label, statusColor: st.color,
        isDemo: false, updatedAt: p.updatedAt || 0,
      });
    }
  }
  if (results[2].status === 'fulfilled') {
    const { projects } = (results[2].value || {}) as any;
    for (const p of (projects || []) as any[]) {
      const st = WRITER_STATUS[p.status] || { label: String(p.status || '—'), color: '#9C96B4' };
      rows.push({
        disc: 'writer', id: p.id, title: p.title || 'Untitled',
        subtitle: `${p.kind === 'SCRIPT' ? 'Script' : 'Book'}${p.genre ? ` · ${p.genre}` : ''}`,
        statusLabel: st.label, statusColor: st.color,
        isDemo: false, updatedAt: p.updatedAt || 0,
      });
    }
  }
  return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Open a production in its discipline's workspace. Music opens straight to its
 *  record; Film pre-selects the production so the film suite opens on it; Writer
 *  opens Artist Manager's writer projects. */
function openProduction(row: ProductionRow, uid: string | undefined, onNavigate: (v: string) => void): void {
  if (row.disc === 'music') {
    if (row.melosProductionId) {
      try {
        window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'MELOS', params: { productionId: row.melosProductionId } } }));
        return;
      } catch { /* fall through */ }
    }
    onNavigate('MELOS');
  } else if (row.disc === 'film') {
    // The film suite restores its selection from this key on mount — pre-set it
    // so a specific (real) production opens. Demo rows keep the suite's own demo.
    if (uid && !row.isDemo) {
      try { localStorage.setItem(`plajah_active_production_${uid}`, row.id); } catch { /* storage disabled */ }
    }
    openAm('film', 'film_hub', onNavigate);
  } else {
    openAm('writer', 'writer_projects', onNavigate);
  }
}

/* Quick-create chips — honest actions only, no fabricated data.
   `hue` + `isNew` spotlight the discipline starts (Music / Film / Book). */
interface QuickChip { label: string; icon: Lucide; run: () => void; hue?: string; isNew?: boolean; }

const EASE = [0.2, 0, 0, 1] as const;

export default function CreatorHub({
  user, userProfile, onNavigate, onCreate, onGoLive, onNewPost,
}: CreatorHubProps) {
  const isGuest = !user;
  const firstName = (userProfile?.displayName || '').trim().split(/\s+/)[0] || '';
  const reduce = useReducedMotion();
  const [hubTab, setHubTab] = useState<'OVERVIEW' | 'MARKETING'>('OVERVIEW');

  const quickChips: QuickChip[] = [
    { label: 'New Music', icon: Music2, hue: '#FF8C00', isNew: true, run: () => onNavigate('MELOS') },
    { label: 'New Film', icon: Film, hue: '#A855F7', isNew: true, run: () => onNavigate('FABULA') },
    { label: 'New Book / Article', icon: BookOpen, hue: '#06B6D4', isNew: true, run: () => onNavigate('BOOKS') },
    { label: 'New Doc', icon: PenLine, run: () => onNavigate('TELA') },
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

  /* ── Global demo-data toggle (shared with Artist Manager). On (default) shows
     the platform showcase everywhere; off restricts everything to real work. ── */
  const [demoMode, setDemoModeState] = useState<boolean>(() => isDemoMode());
  useEffect(() => subscribeDemoMode(setDemoModeState), []);
  const toggleDemo = () => setDemoMode(!demoMode);

  /* ── Artist Manager KPIs — read from the same stores AM writes; refresh on
     focus so the numbers update after the user works inside AM. Demo mode
     filters out AM's seeded writer demo rows. ── */
  const [amKpis, setAmKpis] = useState(() => readAmKpis(true));
  useEffect(() => {
    if (isGuest) return;
    const refresh = () => setAmKpis(readAmKpis(demoMode));
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isGuest, demoMode]);

  /* ── Live cross-discipline productions, loaded from the real per-discipline
     services (music/film/writing) with their true status. ── */
  const [prodRows, setProdRows] = useState<ProductionRow[]>([]);
  const [loadingProds, setLoadingProds] = useState<boolean>(!isGuest);
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) { setProdRows([]); setLoadingProds(false); return; }
    let alive = true;
    setLoadingProds(true);
    loadProductions(uid)
      .then((rows) => { if (alive) setProdRows(rows); })
      .catch(() => { if (alive) setProdRows([]); })
      .finally(() => { if (alive) setLoadingProds(false); });
    return () => { alive = false; };
  }, [user?.uid]);

  /* Displayed productions — real work always; demos appended when demo mode is
     on, deduped against any real production with the same title. */
  const productions = useMemo(() => {
    if (!demoMode) return prodRows.slice(0, 8);
    const realTitles = new Set(prodRows.map((r) => r.title.trim().toLowerCase()));
    const demos = DEMO_PRODUCTIONS.filter((d) => !realTitles.has(d.title.trim().toLowerCase()));
    return [...prodRows, ...demos].slice(0, 8);
  }, [prodRows, demoMode]);

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
              const spot = !!c.hue;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={c.run}
                  className="group/chip relative inline-flex items-center gap-1.5 rounded-full border border-transparent px-3.5 py-2 text-[0.74rem] font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  style={
                    spot
                      ? { borderColor: `${c.hue}66`, background: `${c.hue}1f`, color: '#fff' }
                      : undefined
                  }
                >
                  {!spot && (
                    <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-white/[0.14] bg-white/[0.05] transition-colors duration-200 group-hover/chip:border-white/25 group-hover/chip:bg-white/[0.1]" />
                  )}
                  <Icon size={13} className="relative" style={spot ? { color: c.hue } : undefined} />
                  <span className={`relative ${spot ? '' : 'text-white/85 group-hover/chip:text-white'}`}>{c.label}</span>
                  {c.isNew && (
                    <span
                      className="relative ml-0.5 rounded-full px-1.5 py-px text-[0.5rem] font-black uppercase tracking-[0.12em] text-white"
                      style={{ background: 'var(--pj-grad-ember)' }}
                    >
                      New
                    </span>
                  )}
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

      {/* ══ 2.5 · YOUR PRODUCTIONS — the professional workflow layer ═════════ */}
      {!isGuest && (
        <section className="relative mx-auto w-full max-w-[1400px] px-5 pt-12 sm:px-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span aria-hidden className="h-6 w-1.5 rounded-full" style={{ background: 'var(--pj-grad-brand)' }} />
            <h2 className="font-display text-2xl font-black italic uppercase tracking-tight text-white sm:text-3xl">
              Your Productions
            </h2>
            <div className="ml-auto flex items-center gap-2.5">
              <DemoToggle on={demoMode} onToggle={toggleDemo} />
              <button
                type="button"
                onClick={() => onNavigate('ARTIST_MANAGER')}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[0.72rem] font-black uppercase tracking-wide text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
              >
                <LayoutDashboard size={14} /> Artist Manager <ArrowRight size={13} />
              </button>
            </div>
          </div>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-white/55">
            Every project you're on, across every craft — with the production tools and daily tasks one tap away,
            so the real work never gets buried.
          </p>

          {(loadingProjects || loadingProds) ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[360px] animate-pulse rounded-[1.75rem] border border-white/10 bg-white/[0.03]" />
              ))}
            </div>
          ) : (
            <>
              {/* Cross-discipline productions list */}
              <ProductionsCard items={productions} demoOn={demoMode} uid={user?.uid} onNavigate={onNavigate} reveal={reveal()} />

              {/* Per-discipline dashboards + task shortcuts */}
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {DISCIPLINE_DASH.map((d, i) => (
                  <DisciplineCard
                    key={d.disc}
                    dash={d}
                    projects={projects}
                    kpis={amKpis}
                    demoMode={demoMode}
                    onNavigate={onNavigate}
                    reveal={reveal(Math.min(i, 3) * 0.05)}
                  />
                ))}
              </div>
            </>
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

/* ── A small on/off switch for demo data. ── */
function DemoToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      title={on ? 'Demo data is on — showcase productions are shown' : 'Demo data is off — only your real work is shown'}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.66rem] font-black uppercase tracking-wide text-white/60 transition-colors hover:border-white/25 hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
    >
      <span>Demo data</span>
      <span
        aria-hidden
        className="relative h-4 w-7 rounded-full transition-colors duration-200"
        style={{ background: on ? 'var(--pj-grad-brand)' : 'rgba(255,255,255,0.16)' }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all duration-200"
          style={{ left: on ? '0.875rem' : '0.125rem' }}
        />
      </span>
    </button>
  );
}

/* ── Cross-discipline productions — every real work the user is on (with true
   status pulled from each discipline's service), plus showcase demos when demo
   mode is on. Opens each in its workspace. ─────────────────────────────────── */
function ProductionsCard({
  items, demoOn, uid, onNavigate, reveal,
}: {
  items: ProductionRow[];
  demoOn: boolean;
  uid?: string;
  onNavigate: (v: string) => void;
  reveal: Record<string, unknown>;
}) {
  if (items.length === 0) {
    return (
      <motion.div
        {...reveal}
        className="flex flex-col items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-12 text-center"
      >
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl text-white" style={{ background: 'var(--pj-grad-brand)' }}>
          <FolderOpen size={20} />
        </span>
        <p className="text-sm font-bold text-white">No productions yet</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/45">
          {demoOn
            ? "Start a track, a film or a book above — it'll show up here with its whole production toolkit attached."
            : 'Turn demo data on to explore a sample production, or start a track, a film or a book above.'}
        </p>
      </motion.div>
    );
  }
  const realCount = items.filter((r) => !r.isDemo).length;
  return (
    <motion.div {...reveal} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-3.5">
        <Layers size={14} className="text-white/45" />
        <span className="font-display text-[0.66rem] font-black uppercase tracking-[0.16em] text-white/45">
          Across all disciplines · {realCount || items.length}{demoOn && items.length > realCount ? ' + demo' : ''}
        </span>
      </div>
      <div className="flex flex-col">
        {items.map((row) => {
          const meta = DISC_META[row.disc];
          const RowIcon = meta.icon;
          return (
            <button
              key={`${row.disc}:${row.id}`}
              type="button"
              onClick={() => openProduction(row, uid, onNavigate)}
              aria-label={`Open ${row.title}`}
              className="group flex items-center gap-3.5 border-t border-white/[0.05] px-5 py-3.5 text-left transition-colors duration-200 first:border-t-0 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--pj-orange)]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: meta.grad }}>
                <RowIcon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[0.92rem] font-bold leading-tight text-white">{row.title}</span>
                  {row.isDemo && (
                    <span className="shrink-0 rounded-full bg-white/[0.08] px-1.5 py-px text-[0.5rem] font-black uppercase tracking-[0.12em] text-white/50">
                      Demo
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[0.72rem] text-white/45">
                  <span
                    className="rounded-full px-1.5 py-px text-[0.56rem] font-black uppercase tracking-[0.1em]"
                    style={{ color: meta.hue, boxShadow: `inset 0 0 0 1px ${meta.hue}55` }}
                  >
                    {meta.label}
                  </span>
                  {row.subtitle && <span className="truncate">{row.subtitle}</span>}
                </span>
              </span>
              <span
                className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-wide sm:inline-flex"
                style={{ color: row.statusColor, background: `${row.statusColor}1a` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.statusColor }} />
                {row.statusLabel}
              </span>
              <ArrowUpRight size={15} className="shrink-0 text-white/25 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/70" />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ── One discipline dashboard — mirrors Artist Manager's mini-KPIs and exposes
   its task shortcuts as deep-links. Music/Writer figures are read from AM's own
   stores; Film figures are derived from the user's loaded films. ───────────── */
function DisciplineCard({
  dash, projects, kpis, demoMode, onNavigate, reveal,
}: {
  dash: DisciplineDash;
  projects: ProjectItem[];
  kpis: { music: MusicKpis; writer: WriterKpis };
  demoMode: boolean;
  onNavigate: (v: string) => void;
  reveal: Record<string, unknown>;
}) {
  const Icon = dash.icon;
  const mine = projects.filter((p) => dash.kinds.includes(p.kind));
  const active = mine[0]; // recency-sorted upstream
  const demoActive = !active && demoMode ? DEMO_PRODUCTIONS.find((p) => p.disc === dash.disc) : undefined;
  const weekMs = 7 * 24 * 3600 * 1000;

  let cells: { icon: Lucide; hue: string; value: string; label: string }[];
  if (dash.disc === 'music') {
    const m = kpis.music;
    cells = [
      { icon: DollarSign, hue: '#F97316', value: fmtMoney(m.outstanding), label: 'Outstanding' },
      { icon: CheckCircle2, hue: '#10B981', value: fmtMoney(m.collected), label: 'Collected' },
      { icon: CheckSquare, hue: '#3B82F6', value: `${m.openTasks}`, label: m.totalTasks ? `Open · ${m.totalTasks} total` : 'Open tasks' },
      { icon: FileText, hue: '#A855F7', value: `${m.contracts}`, label: m.totalContracts ? `Signed · ${m.totalContracts}` : 'Contracts' },
    ];
  } else if (dash.disc === 'film') {
    const scenes = mine.reduce((s, p) => s + (p.count || 0), 0);
    const edited = mine.filter((p) => p.updatedAt && Date.now() - p.updatedAt < weekMs).length;
    cells = [
      { icon: Film, hue: '#A855F7', value: `${mine.length}`, label: 'Productions' },
      { icon: Clapperboard, hue: '#3B82F6', value: `${scenes}`, label: 'Scenes' },
      { icon: TrendingUp, hue: '#FF8C00', value: `${edited}`, label: 'Edited · 7d' },
      { icon: Clock, hue: '#8B5CF6', value: active ? (relTime(active.updatedAt)?.replace(' ago', '') || '—') : '—', label: 'Last touched' },
    ];
  } else {
    const w = kpis.writer;
    cells = [
      { icon: BookMarked, hue: '#06B6D4', value: `${w.hasData ? w.active : mine.length}`, label: w.hasData && w.totalProjects ? `Active · ${w.totalProjects}` : 'Active projects' },
      { icon: PenLine, hue: '#A855F7', value: w.hasData ? fmtNum(w.words) : '—', label: 'Words written' },
      { icon: Send, hue: '#10B981', value: `${w.inReview}`, label: 'In review' },
      { icon: Calendar, hue: '#FF8C00', value: `${w.events}`, label: 'Upcoming events' },
    ];
  }

  return (
    <motion.div
      {...reveal}
      className="relative flex flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5"
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px]" style={{ background: dash.hue }} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: `${dash.hue}22`, color: dash.hue, boxShadow: `inset 0 0 0 1px ${dash.hue}40` }}
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-black italic uppercase tracking-tight text-white">{dash.name}</h3>
          <p className="text-[0.68rem] text-white/40">{dash.desc}</p>
        </div>
      </div>

      {/* Active production */}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
        <span className="shrink-0 text-[0.56rem] font-black uppercase tracking-[0.14em] text-white/35">Active</span>
        {active ? (
          <span className="truncate text-[0.82rem] font-bold text-white">{active.title}</span>
        ) : demoActive ? (
          <>
            <span className="truncate text-[0.82rem] font-bold text-white/90">{demoActive.title}</span>
            <span className="ml-auto shrink-0 rounded-full bg-white/[0.08] px-1.5 py-px text-[0.5rem] font-black uppercase tracking-[0.12em] text-white/50">Demo</span>
          </>
        ) : (
          <span className="truncate text-[0.82rem] font-semibold text-white/40">Nothing in production yet</span>
        )}
      </div>

      {/* KPI 2×2 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {cells.map((c) => {
          const CIcon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${c.hue}22`, color: c.hue }}>
                <CIcon size={13} />
              </span>
              <p className="mt-2 font-display text-lg font-black leading-none tabular-nums text-white">{c.value}</p>
              <p className="mt-1 truncate text-[0.6rem] font-bold uppercase tracking-[0.06em] text-white/40">{c.label}</p>
            </div>
          );
        })}
      </div>

      {/* Task shortcuts */}
      <div className="mt-4">
        <p className="mb-2 text-[0.58rem] font-black uppercase tracking-[0.18em] text-white/35">Jump to</p>
        <div className="flex flex-wrap gap-1.5">
          {dash.shortcuts.map((sc) => {
            const SIcon = sc.icon;
            return (
              <button
                key={sc.label}
                type="button"
                onClick={() => (sc.melos ? onNavigate('MELOS') : openAm(dash.disc, sc.tab, onNavigate))}
                className="group/tc inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[0.72rem] font-semibold text-white/70 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
                style={{ borderColor: undefined }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${dash.hue}66`; (e.currentTarget as HTMLButtonElement).style.background = `${dash.hue}14`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = ''; (e.currentTarget as HTMLButtonElement).style.background = ''; }}
              >
                <SIcon size={13} style={{ color: dash.hue }} />
                {sc.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer — open the full discipline in Artist Manager */}
      <button
        type="button"
        onClick={() => openAm(dash.disc, dash.overviewTab, onNavigate)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-[0.72rem] font-black uppercase tracking-wide text-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)]"
        style={{ background: `${dash.hue}1f`, boxShadow: `inset 0 0 0 1px ${dash.hue}55` }}
      >
        Open {dash.name.split(' ')[0]} Manager
        <ArrowRight size={13} />
      </button>
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
