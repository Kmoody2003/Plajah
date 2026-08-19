/**
 * CreatorHub — the flagship "Creator Hub" landing (view id `CREATOR`).
 *
 * Replaces the old behaviour where CREATOR just rendered UserDashboard (blank
 * for guests). This is a curated, self-contained launcher that surfaces every
 * one of Plajah's creative + business tools in the Plajah design language:
 * a cinematic triad-gradient hero, then labelled clusters of tool cards.
 *
 * It navigates purely via `onNavigate(viewId)` — the parent owns routing. View
 * ids, labels and lucide icons mirror CommandSplitNav's NAV_SECTIONS exactly.
 * Nothing is gated behind auth *inside the hub*: guests see every tool and the
 * cards navigate; only the greeting changes for signed-out visitors.
 */
import React from 'react';
import { motion } from 'motion/react';
import {
  Music2, Sparkles, LayoutPanelTop, Film, Clapperboard, MonitorPlay, Cctv,
  TrendingUp, Mail, AppWindow, Repeat, Briefcase, ShoppingBag, MapPin, BookOpen,
  Plus, Radio, LayoutDashboard, ArrowRight, ArrowUpRight, Wand2, Video, PenLine,
} from 'lucide-react';
import type { UserProfile } from '../types';

export interface CreatorHubProps {
  user: any | null;
  userProfile: UserProfile | null;
  onNavigate: (view: string) => void;   // pass a view id; parent routes it
  onOpenDashboard?: () => void;          // opens the existing UserDashboard
  onCreate?: () => void;                 // global create action
  onGoLive?: () => void;                 // start live
}

type Lucide = React.ComponentType<{ size?: number; className?: string }>;

interface ToolDef {
  id: string;
  label: string;
  icon: Lucide;
  desc: string;
  /** Optional per-tool accent that overrides the cluster accent (e.g. Tela cyan). */
  accent?: string;
  featured?: boolean;
}

interface Cluster {
  key: string;
  blurb: string;
  /** cluster accent — a --pj gradient token */
  grad: string;
  /** solid accent colour for eyebrow + glow */
  hue: string;
  tools: ToolDef[];
}

/* ── The curated tool map. Ids/labels/icons match CommandSplitNav NAV_SECTIONS.
   Descriptions are written here, accurate to each tool. ─────────────────────── */
const CLUSTERS: Cluster[] = [
  {
    key: 'Studios & Making',
    blurb: 'Where the work gets made — songs, docs, scripts, releases.',
    grad: 'var(--pj-grad-brand)',
    hue: '#D40055',
    tools: [
      { id: 'TELA', label: 'Tela', icon: LayoutPanelTop, accent: 'var(--pj-grad-spatial)', featured: true,
        desc: 'The unified document canvas — docs, sheets, forms & design in one place.' },
      { id: 'PLAJAH_STUDIO', label: 'Creator Tool Bag', icon: Sparkles,
        desc: 'Every making tool in one kit — the creator studio for whatever you build.' },
      { id: 'ARTIST_MANAGER', label: 'Artist Manager', icon: Music2,
        desc: 'Run your artist career — releases, personas, rights & the numbers behind them.' },
      { id: 'BOOKS', label: 'Lorea', icon: BookOpen,
        desc: 'Write books, screenplays, comics & prose — then publish them to readers.' },
    ],
  },
  {
    key: 'Film & Video',
    blurb: 'From first cut to broadcast — the whole moving-image pipeline.',
    grad: 'var(--pj-grad-spatial)',
    hue: '#00DAF3',
    tools: [
      { id: 'FABULA', label: 'Fabula', icon: Film,
        desc: 'The AI film editor — assemble, cut & score your movie on a real timeline.' },
      { id: 'TV_STUDIO', label: 'TV Studio', icon: Clapperboard,
        desc: 'A live production switcher with titles, graphics & multi-source mixing.' },
      { id: 'MEDIA_ROUTER', label: 'Router & Switcher', icon: Cctv,
        desc: 'Route cameras, feeds & scenes — the signal brain behind your broadcast.' },
    ],
  },
  {
    key: 'Live & Stage',
    blurb: 'Go on air — with studio-grade looks and a presenter surface.',
    grad: 'var(--pj-grad-ember)',
    hue: '#FF8C00',
    tools: [
      { id: 'LIVE_HUB', label: 'Live Hub', icon: Sparkles,
        desc: 'Stream with pro camera looks, VTuber mode, live translation & sync parties.' },
      { id: 'AMBO', label: 'Ambo Presenter', icon: MonitorPlay,
        desc: 'Drive slides, scripture & cues on a second screen while you present live.' },
    ],
  },
  {
    key: 'Publish & Reach',
    blurb: 'Get it seen — promote, deliver and take it beyond Plajah.',
    grad: 'var(--pj-grad-warm)',
    hue: '#6B0099',
    tools: [
      { id: 'AD_PACKAGES', label: 'Promote', icon: TrendingUp,
        desc: 'Buy reach across Plajah — campaigns, billboards & audience targeting.' },
      { id: 'POSTMAN', label: 'The Postman', icon: Mail,
        desc: 'Your native mailroom — write, send & manage audience mail without leaving.' },
      { id: 'APPS', label: 'Apps', icon: AppWindow,
        desc: 'The in-platform app drawer — utilities & mini-tools for your workflow.' },
      { id: 'CROSSOVER', label: 'Crossover', icon: Repeat,
        desc: 'Convert, repair & analyse media — hardware-accelerated, format to format.' },
    ],
  },
  {
    key: 'Business & Growth',
    blurb: 'Turn the craft into a business — storefront, land & the books.',
    grad: 'var(--pj-grad-brand)',
    hue: '#D40055',
    tools: [
      { id: 'PLAJAH_BUSINESS', label: 'Plajah Business', icon: Briefcase,
        desc: 'Your company backbone — pages, team roles, orders, inventory & ops.' },
      { id: 'STORE_HUB', label: 'Plajah Store', icon: ShoppingBag,
        desc: 'Sell merch, products & digital goods — your storefront on the platform.' },
      { id: 'TERRA', label: 'Terra', icon: MapPin,
        desc: 'The real-estate layer — parcels, open listings & property records.' },
    ],
  },
];

/* Quick-create chips — honest actions only, no fabricated data. */
interface QuickChip { label: string; icon: Lucide; run: () => void; }

export default function CreatorHub({
  user, userProfile, onNavigate, onOpenDashboard, onCreate, onGoLive,
}: CreatorHubProps) {
  const isGuest = !user;
  const firstName = (userProfile?.displayName || '').trim().split(/\s+/)[0] || '';

  const quickChips: QuickChip[] = [
    { label: 'New Doc', icon: PenLine, run: () => onNavigate('TELA') },
    { label: 'New Video', icon: Video, run: () => onNavigate('FABULA') },
    { label: 'Go Live', icon: Radio, run: () => (onGoLive ? onGoLive() : onNavigate('LIVE_HUB')) },
    { label: 'New Post', icon: Plus, run: () => (onCreate ? onCreate() : onNavigate('FEED')) },
  ];

  const ease = [0.2, 0, 0, 1] as const;

  return (
    <div
      className="min-h-full w-full overflow-x-hidden text-white"
      style={{ background: '#0A0A0D' }}
    >
      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Gradient field */}
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
        {/* Animated slow-drift orbs */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-[26rem] w-[26rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(0,218,243,0.30), transparent 68%)' }}
          animate={{ y: [0, 26, 0], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-40 -left-24 h-[22rem] w-[22rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(212,0,85,0.28), transparent 68%)' }}
          animate={{ y: [0, -22, 0], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
          style={{ background: 'linear-gradient(to bottom, transparent, #0A0A0D)' }}
        />

        <div className="relative mx-auto w-full max-w-[1400px] px-5 pb-16 pt-14 sm:px-8 md:pt-20">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="pj-eyebrow mb-5 !text-white/70"
          >
            Creator Hub
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.05 }}
            className="font-display text-[2.6rem] font-black italic uppercase leading-[0.94] tracking-tight sm:text-[3.6rem] md:text-[4.6rem]"
          >
            {isGuest ? (
              <>
                <span className="block text-white">Everything you make,</span>
                <span className="block pj-text-brand">one home.</span>
              </>
            ) : (
              <>
                <span className="block text-white">
                  {firstName ? <>Welcome back, {firstName}.</> : 'Welcome back.'}
                </span>
                <span className="block pj-text-brand">Let's make something.</span>
              </>
            )}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.12 }}
            className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg"
          >
            {isGuest
              ? 'Every creative tool on Plajah — studios, film, live, publishing and business — gathered in one place. Explore it all; sign in when you\'re ready to build.'
              : 'Every studio, stage and storefront you have on Plajah, gathered in one place. Pick up where you left off, or start something new.'}
          </motion.p>

          {/* Primary actions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.18 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={() => (onCreate ? onCreate() : onNavigate('PLAJAH_STUDIO'))}
              className="group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-black uppercase tracking-wide text-white transition-transform duration-200 hover:-translate-y-0.5"
              style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
            >
              <Wand2 size={18} />
              Create
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => (onGoLive ? onGoLive() : onNavigate('LIVE_HUB'))}
              className="group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-black uppercase tracking-wide transition-transform duration-200 hover:-translate-y-0.5"
              style={{ background: 'var(--pj-orange)', color: '#12080a', boxShadow: 'var(--pj-glow-orange)' }}
            >
              <Radio size={18} />
              Go Live
            </button>

            <button
              type="button"
              onClick={() => (onOpenDashboard ? onOpenDashboard() : onNavigate('DASHBOARD'))}
              className="group inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-white/90 backdrop-blur-md transition-colors duration-200 hover:bg-white/[0.12]"
            >
              <LayoutDashboard size={18} />
              {isGuest ? 'Sign in' : 'Open Dashboard'}
            </button>
          </motion.div>

          {/* Quick-create strip */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.26 }}
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.14] bg-white/[0.05] px-3.5 py-2 text-[0.74rem] font-bold text-white/85 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.1] hover:text-white"
                >
                  <Icon size={13} />
                  {c.label}
                </button>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══ CLUSTERS ═══════════════════════════════════════════════════════ */}
      <div className="relative mx-auto w-full max-w-[1400px] px-5 pb-24 sm:px-8">
        {CLUSTERS.map((cluster, ci) => (
          <section key={cluster.key} className="pt-12 first:pt-2">
            {/* Cluster header */}
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="h-6 w-1.5 rounded-full"
                    style={{ background: cluster.grad }}
                  />
                  <h2 className="font-display text-2xl font-black italic uppercase tracking-tight text-white sm:text-3xl">
                    {cluster.key}
                  </h2>
                </div>
                <p className="mt-2 max-w-xl pl-[18px] text-sm text-white/50">{cluster.blurb}</p>
              </div>
            </div>

            {/* Card grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cluster.tools.map((tool, ti) => {
                const Icon = tool.icon;
                const accent = tool.accent || cluster.grad;
                const glow = tool.accent ? '0,218,243' : hexTriad(cluster.hue);
                return (
                  <motion.button
                    key={tool.id}
                    type="button"
                    onClick={() => onNavigate(tool.id)}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.45, ease, delay: Math.min(ti, 4) * 0.04 }}
                    aria-label={`Open ${tool.label}`}
                    className={`group relative flex flex-col items-start overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 text-left transition-all duration-300 hover:-translate-y-1.5 hover:border-white/20 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0D] ${
                      tool.featured ? 'sm:col-span-2 lg:col-span-1' : ''
                    }`}
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                  >
                    {/* hover glow wash */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                      style={{ background: `radial-gradient(circle, rgba(${glow},0.45), transparent 70%)` }}
                    />
                    {/* featured hairline gradient edge */}
                    {tool.featured && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-px"
                        style={{ background: accent }}
                      />
                    )}

                    <div className="relative flex w-full items-start justify-between">
                      <span
                        className="grid h-12 w-12 place-items-center rounded-2xl text-white transition-transform duration-300 group-hover:scale-105"
                        style={{ background: accent, boxShadow: `0 8px 22px rgba(${glow},0.28)` }}
                      >
                        <Icon size={22} />
                      </span>
                      {tool.featured && (
                        <span
                          className="rounded-full border border-[#00DAF3]/40 bg-[#00DAF3]/10 px-2.5 py-1 text-[0.56rem] font-black uppercase tracking-[0.15em] text-[#00DAF3]"
                        >
                          New
                        </span>
                      )}
                    </div>

                    <h3 className="relative mt-5 font-display text-xl font-black italic tracking-tight text-white">
                      {tool.label}
                    </h3>
                    <p className="relative mt-2 flex-1 text-sm leading-relaxed text-white/55">
                      {tool.desc}
                    </p>

                    <span className="relative mt-5 inline-flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-white/40 transition-colors duration-300 group-hover:text-white/90">
                      Open
                      <ArrowUpRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {ci < CLUSTERS.length - 1 && (
              <div className="mt-12 h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            )}
          </section>
        ))}

        {/* Footer flourish */}
        <div className="mt-16 rounded-[2rem] border border-white/10 bg-white/[0.03] px-8 py-10 text-center">
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
            className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-black uppercase tracking-wide text-white transition-transform duration-200 hover:-translate-y-0.5"
            style={{ background: 'var(--pj-grad-brand)', boxShadow: 'var(--pj-glow-brand)' }}
          >
            <Wand2 size={16} />
            Start creating
          </button>
        </div>
      </div>
    </div>
  );
}

/** Map a cluster hue hex to an "r,g,b" triad string for rgba() glows. */
function hexTriad(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
