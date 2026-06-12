// ─── Plajah Creator Tool Bag ─────────────────────────────────────────────────
// Hootsuite/Buffer-class publishing suite — compose, schedule, queue, calendar,
// and analytics across Plajah + connected external networks.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, CalendarClock, ListChecks, Sparkles, Plus, Trash2, Globe, Clock,
  Check, AlertTriangle, Loader2, Link as LinkIcon, ChevronLeft, ChevronRight,
  CalendarDays, Layers, X, BarChart3, Lock, Zap, TrendingUp, Eye, Heart,
  MessageCircle, Share2, Users, ArrowUpRight,
} from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { useFediverse } from '../../contexts/FediverseContext';
import { createPost, uploadFile } from '../../services/backendService';
import UniversalPostComposer, { type ComposerPostData } from '../UniversalPostComposer';
import {
  activateAndGetEntitlement, effectivePlan, effectiveLimits, freeYearStatus,
  currentUserHasPlajahPlus,
} from '../../services/managerSuite/entitlementService';
import {
  createScheduledPost, deleteScheduledPost, updateScheduledPost,
  listenToQueue, countQueueSlots, dueScheduledPosts,
} from '../../services/managerSuite/scheduledPostsService';
import type { ManagerSuiteEntitlement, ScheduledPost, ScheduledPostTargetResult } from '../../services/managerSuite/types';
import type { FediverseProtocol } from '../../services/fediverse/types';

// ─── Platform definitions ─────────────────────────────────────────────────────

type PlatformStatus = 'connected' | 'connect' | 'coming_soon';

interface PlatformDef {
  id: string;
  label: string;
  color: string;
  charLimit: number;
  abbr: string;
  protocol?: FediverseProtocol;
  status: PlatformStatus;
  accountId?: string;
}

const NET_LABEL: Record<FediverseProtocol | 'plajah', string> = {
  mastodon: 'Mastodon', bluesky: 'Bluesky', threads: 'Threads', plajah: 'Plajah',
};
const NET_COLOR: Record<string, string> = {
  plajah: '#FF8C00', mastodon: '#6364FF', bluesky: '#0085FF', threads: '#aaaaaa',
  twitter: '#000000', instagram: '#E1306C', facebook: '#1877F2', linkedin: '#0A66C2',
  tiktok: '#010101', youtube: '#FF0000', pinterest: '#E60023', snapchat: '#FFFC00',
};
const NET_LIMIT: Record<string, number> = {
  plajah: 5000, mastodon: 500, bluesky: 300, threads: 500,
  twitter: 280, instagram: 2200, facebook: 63206, linkedin: 3000,
  tiktok: 2200, youtube: 5000, pinterest: 500, snapchat: 250,
};
const NET_ABBR: Record<string, string> = {
  plajah: 'P', mastodon: 'M', bluesky: 'B', threads: 'T',
  twitter: 'X', instagram: 'IG', facebook: 'FB', linkedin: 'LI',
  tiktok: 'TK', youtube: 'YT', pinterest: 'PI', snapchat: 'SC',
};

type Tab = 'COMPOSE' | 'QUEUE' | 'CALENDAR' | 'ANALYTICS';

const STATUS_STYLE: Record<ScheduledPost['status'], { label: string; cls: string }> = {
  DRAFT:      { label: 'Draft',      cls: 'bg-white/10 text-white/60' },
  SCHEDULED:  { label: 'Scheduled',  cls: 'bg-blue-500/20 text-blue-300' },
  PUBLISHING: { label: 'Publishing', cls: 'bg-amber-500/20 text-amber-300' },
  PUBLISHED:  { label: 'Published',  cls: 'bg-emerald-500/20 text-emerald-300' },
  PARTIAL:    { label: 'Partial',    cls: 'bg-orange-500/20 text-orange-300' },
  FAILED:     { label: 'Failed',     cls: 'bg-red-500/20 text-red-300' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudioView() {
  const { accounts, broadcast } = useFediverse();
  const [tab, setTab] = useState<Tab>('COMPOSE');
  const [entitlement, setEntitlement] = useState<ManagerSuiteEntitlement | null>(null);
  const [hasPlus, setHasPlus] = useState(false);
  const [queue, setQueue] = useState<ScheduledPost[]>([]);
  const publishing = useRef<Set<string>>(new Set());

  useEffect(() => { activateAndGetEntitlement().then(setEntitlement).catch(() => {}); }, []);
  useEffect(() => { currentUserHasPlajahPlus().then(setHasPlus).catch(() => {}); }, []);
  useEffect(() => listenToQueue(setQueue), []);

  const planCtx = { hasPlajahPlus: hasPlus };
  const plan = effectivePlan(entitlement, planCtx);
  const limits = effectiveLimits(entitlement, planCtx);
  const freeYear = freeYearStatus(entitlement);
  const usedSlots = countQueueSlots(queue);

  // Build full platform list — connected fediverse accounts merge into the static list
  const platforms = useMemo<PlatformDef[]>(() => {
    const fediverseProtocols: FediverseProtocol[] = ['bluesky', 'mastodon', 'threads'];
    const connectedProtos = new Set(
      accounts.filter(a => a.isActive).map(a => a.protocol)
    );

    const fediPlatforms: PlatformDef[] = fediverseProtocols.map(proto => {
      const acc = accounts.find(a => a.protocol === proto && a.isActive);
      return {
        id: proto,
        label: NET_LABEL[proto],
        color: NET_COLOR[proto],
        charLimit: NET_LIMIT[proto],
        abbr: NET_ABBR[proto],
        protocol: proto,
        status: acc ? 'connected' : 'connect',
        accountId: acc?.id,
      };
    });

    const externalPlatforms: PlatformDef[] = [
      { id: 'twitter',   label: 'X (Twitter)',  color: '#000000', charLimit: 280,   abbr: 'X',  status: 'coming_soon' },
      { id: 'instagram', label: 'Instagram',    color: '#E1306C', charLimit: 2200,  abbr: 'IG', status: 'coming_soon' },
      { id: 'facebook',  label: 'Facebook',     color: '#1877F2', charLimit: 63206, abbr: 'FB', status: 'coming_soon' },
      { id: 'linkedin',  label: 'LinkedIn',     color: '#0A66C2', charLimit: 3000,  abbr: 'LI', status: 'coming_soon' },
      { id: 'tiktok',    label: 'TikTok',       color: '#010101', charLimit: 2200,  abbr: 'TK', status: 'coming_soon' },
      { id: 'youtube',   label: 'YouTube',      color: '#FF0000', charLimit: 5000,  abbr: 'YT', status: 'coming_soon' },
      { id: 'pinterest', label: 'Pinterest',    color: '#E60023', charLimit: 500,   abbr: 'PI', status: 'coming_soon' },
      { id: 'snapchat',  label: 'Snapchat',     color: '#FFFC00', charLimit: 250,   abbr: 'SC', status: 'coming_soon' },
    ];

    return [
      { id: 'plajah', label: 'Plajah Feed', color: '#FF8C00', charLimit: 5000, abbr: 'P', status: 'connected' },
      ...fediPlatforms,
      ...externalPlatforms,
    ];
  }, [accounts]);

  const channels = useMemo(() => platforms.filter(p => p.status === 'connected').map(p => ({
    id: p.id, kind: (p.protocol ?? 'plajah') as FediverseProtocol | 'plajah',
    label: p.label, handle: accounts.find(a => a.id === p.accountId)?.handle ?? 'On-platform',
    accountId: p.accountId,
  })), [platforms, accounts]);

  const publishPost = useCallback(async (post: ScheduledPost) => {
    if (publishing.current.has(post.id)) return;
    publishing.current.add(post.id);
    try {
      await updateScheduledPost(post.id, { status: 'PUBLISHING' });
      const results: ScheduledPostTargetResult[] = [];
      if (post.targetAccountIds.length) {
        const br = await broadcast({
          text: post.text, uri: post.linkUri, title: post.linkTitle,
          description: post.linkDescription, thumbnail: post.mediaUrls[0],
        }, post.targetAccountIds);
        br.succeeded.forEach(s => results.push({ channelKind: s.protocol, accountId: s.accountId, ok: true, postUrl: s.postUrl }));
        br.failed.forEach(f => results.push({ channelKind: f.protocol, accountId: f.accountId, ok: false, error: f.error }));
      }
      if (post.alsoPostToPlajah) {
        try {
          await createPost({ text: post.text, media: post.mediaUrls.map(url => ({ type: 'PICTURE', url })) as any });
          results.push({ channelKind: 'plajah', ok: true });
        } catch (e: any) {
          results.push({ channelKind: 'plajah', ok: false, error: e?.message ?? 'Plajah post failed' });
        }
      }
      const okCount = results.filter(r => r.ok).length;
      const failCount = results.filter(r => !r.ok).length;
      const status = failCount === 0 ? 'PUBLISHED' : okCount === 0 ? 'FAILED' : 'PARTIAL';
      await updateScheduledPost(post.id, {
        status, results,
        publishLog: results.map(r => `${r.ok ? '✓' : '✗'} ${NET_LABEL[r.channelKind as keyof typeof NET_LABEL] ?? r.channelKind}${r.error ? ': ' + r.error : ''}`).join('  '),
        lastAttemptAt: Date.now(),
      });
    } catch (e) {
      await updateScheduledPost(post.id, { status: 'FAILED', publishLog: String((e as Error)?.message ?? e) }).catch(() => {});
    } finally {
      publishing.current.delete(post.id);
    }
  }, [broadcast]);

  useEffect(() => {
    const tick = () => dueScheduledPosts(queue).forEach(publishPost);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [queue, publishPost]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-10 pt-6 sm:pt-8 pb-0 border-b border-white/8">
        <div className="flex items-start sm:items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-2 sm:gap-3">
              <Sparkles className="text-orange-400 shrink-0" size={22} />
              <span>Plajah Creator Tool Bag</span>
            </h1>
            <p className="text-white/40 text-xs sm:text-sm mt-1">Publish, schedule, and analyze everywhere — Plajah and beyond.</p>
          </div>
          <FreeYearBadge plan={plan} daysLeft={freeYear.daysLeft} inFreeYear={freeYear.inFreeYear} />
        </div>

        {/* Tabs — horizontal scroll on mobile */}
        <div className="flex gap-0.5 -mb-px overflow-x-auto no-scrollbar">
          {([
            ['COMPOSE',   'Compose',   Send],
            ['QUEUE',     'Queue',     ListChecks],
            ['CALENDAR',  'Calendar',  CalendarDays],
            ['ANALYTICS', 'Analytics', BarChart3],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 sm:px-5 py-3 text-xs sm:text-sm font-bold rounded-t-xl border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                tab === id
                  ? 'border-orange-400 text-white bg-white/[0.04]'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              <Icon size={14} /> {label}
              {id === 'QUEUE' && usedSlots > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[9px] font-black">{usedSlots}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'COMPOSE' && (
          <Composer platforms={platforms} channels={channels} limits={limits} usedSlots={usedSlots} onPublishNow={publishPost} />
        )}
        {tab === 'QUEUE' && (
          <QueuePanel queue={queue} channels={channels} onDelete={deleteScheduledPost} onPublishNow={publishPost} />
        )}
        {tab === 'CALENDAR' && <CalendarPanel queue={queue} />}
        {tab === 'ANALYTICS' && <AnalyticsPanel platforms={platforms} queue={queue} />}
      </div>
    </div>
  );
}

// ─── Free-year badge ──────────────────────────────────────────────────────────

function FreeYearBadge({ plan, daysLeft, inFreeYear }: { plan: string; daysLeft: number; inFreeYear: boolean }) {
  if (inFreeYear) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/10 border border-orange-500/30">
        <Sparkles size={13} className="text-orange-300 shrink-0" />
        <div className="leading-tight">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-200">Pro — Free</p>
          <p className="text-[9px] text-white/50">{daysLeft}d remaining</p>
        </div>
      </div>
    );
  }
  return (
    <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/60">{plan}</p>
    </div>
  );
}

// ─── Platform badge ───────────────────────────────────────────────────────────

function PlatformBadge({ platform, size = 'sm' }: { platform: PlatformDef; size?: 'sm' | 'xs' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-5 h-5 text-[8px]';
  return (
    <span
      className={`${dim} rounded-full inline-flex items-center justify-center font-black shrink-0`}
      style={{ background: `${platform.color}22`, color: platform.color, border: `1.5px solid ${platform.color}44` }}
    >
      {platform.abbr}
    </span>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ChannelItem { id: string; kind: FediverseProtocol | 'plajah'; label: string; handle: string; accountId?: string }

function Composer({ platforms, channels, limits, usedSlots, onPublishNow }: {
  platforms: PlatformDef[];
  channels: ChannelItem[];
  limits: ReturnType<typeof effectiveLimits>;
  usedSlots: number;
  onPublishNow: (p: ScheduledPost) => void;
}) {
  const currentUser = getAuth().currentUser;
  const [selected, setSelected] = useState<Set<string>>(new Set(['plajah']));
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [composerKey, setComposerKey] = useState(0); // reset UPC after post

  const selectedChannels = channels.filter(c => selected.has(c.id));
  const queueFull = usedSlots >= limits.maxScheduledPosts;

  const toggle = (id: string, status: PlatformStatus) => {
    if (status !== 'connected') return;
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); };

  const handlePost = async (data: ComposerPostData) => {
    if (busy) return;
    if (!selectedChannels.length) { flash(false, 'Pick at least one connected channel.'); return; }
    if (when && queueFull) { flash(false, `Queue is full (${limits.maxScheduledPosts}). Upgrade for more.`); return; }
    setBusy(true);
    try {
      // Upload any blob attachments
      const uid = currentUser?.uid ?? 'anon';
      const mediaUrls: string[] = [];
      for (const att of data.attachments) {
        if (att.file && att.url.startsWith('blob:')) {
          try {
            const url = await uploadFile(`posts/${uid}/${Date.now()}_${att.file.name}`, att.file);
            mediaUrls.push(url);
          } catch { /* skip failed uploads */ }
        } else if (att.url && !att.url.startsWith('blob:')) {
          mediaUrls.push(att.url);
        }
      }

      const targetAccountIds = selectedChannels.filter(c => c.accountId).map(c => c.accountId!);
      const alsoPostToPlajah = selected.has('plajah');
      const scheduledAt = when ? new Date(when).getTime() : undefined;

      const post = await createScheduledPost({
        text: data.text, targetAccountIds, alsoPostToPlajah, scheduledAt,
        mediaUrls,
      });

      if (!when) { await onPublishNow(post); flash(true, 'Posted!'); }
      else { flash(true, `Scheduled for ${new Date(when).toLocaleString()}.`); }

      setWhen('');
      setComposerKey(k => k + 1); // unmount/remount UPC to clear its state
    } catch (e: any) {
      flash(false, e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Main: Platform selector + composer */}
      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-5 lg:py-8 flex flex-col gap-5">

        {/* Platform grid */}
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Publish to</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {platforms.map(p => {
              const on = selected.has(p.id);
              const isConnected = p.status === 'connected';
              const isComingSoon = p.status === 'coming_soon';
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id, p.status)}
                  disabled={!isConnected}
                  title={isComingSoon ? `${p.label} — Coming Soon` : p.status === 'connect' ? `Connect ${p.label} in Fediverse Settings` : ''}
                  className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all text-center ${
                    isConnected
                      ? on ? 'border-white/30 bg-white/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5 cursor-pointer'
                      : 'border-white/5 opacity-35 cursor-not-allowed'
                  }`}
                >
                  {isComingSoon && (
                    <span className="absolute -top-1 -right-1 px-1 bg-[#111] border border-white/10 text-white/30 text-[5px] font-black uppercase rounded-full leading-4">Soon</span>
                  )}
                  {p.status === 'connect' && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center">
                      <Plus size={7} className="text-black" />
                    </span>
                  )}
                  {isConnected && on && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: p.color }}>
                      <Check size={7} className="text-white" />
                    </span>
                  )}
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black"
                    style={{ background: `${p.color}18`, color: isConnected ? p.color : '#555', border: `1.5px solid ${p.color}${isConnected ? '44' : '15'}` }}>
                    {p.abbr}
                  </span>
                  <span className="text-[7px] font-bold text-white/45 leading-tight truncate w-full">{p.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
          {/* Platform char-limit bars */}
          {selectedChannels.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2.5">
              {selectedChannels.map(c => (
                <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/8">
                  <span className="text-[8px] font-bold text-white/40">{c.label}</span>
                  <span className="text-[8px] text-white/25">{NET_LIMIT[c.kind] ?? 5000} char limit</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule picker */}
        <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5">
          <CalendarClock size={14} className="text-orange-400/60 shrink-0" />
          <input
            type="datetime-local"
            value={when}
            min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            onChange={e => setWhen(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white/80 focus:outline-none [color-scheme:dark] min-w-0"
          />
          {when && (
            <button onClick={() => setWhen('')} className="text-white/30 hover:text-white/60"><X size={13} /></button>
          )}
          {!when && <span className="text-[9px] text-white/20 font-bold hidden sm:block">Leave empty to post immediately</span>}
        </div>

        {/* Universal Post Composer */}
        <div className="flex-1">
          {busy ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 size={20} className="animate-spin text-orange-400" />
              <span className="text-white/40 text-sm font-bold">{when ? 'Scheduling…' : 'Posting…'}</span>
            </div>
          ) : (
            <UniversalPostComposer
              key={composerKey}
              currentUser={currentUser}
              placeholder={when ? `Schedule for ${new Date(when).toLocaleString()}…` : 'What are you sharing today? Post to ' + (selectedChannels.map(c => c.label).join(', ') || 'no platforms selected') + '…'}
              onPost={handlePost}
            />
          )}
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${toast.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
              {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right sidebar: account status */}
      <div className="lg:w-56 xl:w-64 border-t lg:border-t-0 lg:border-l border-white/8 px-4 py-5 shrink-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Accounts</p>
        <div className="space-y-1.5">
          {platforms.filter(p => ['plajah', 'bluesky', 'mastodon', 'threads'].includes(p.id)).map(p => (
            <div key={p.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
              p.status === 'connected' ? 'border-white/10 bg-white/[0.04]' : 'border-white/5 opacity-50'
            }`}>
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0"
                style={{ background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}33` }}>
                {p.abbr}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-white/60 truncate">{p.label}</p>
                <p className={`text-[8px] ${p.status === 'connected' ? 'text-green-400' : 'text-orange-400'}`}>
                  {p.status === 'connected' ? 'Connected' : 'Link account'}
                </p>
              </div>
              {p.status === 'connected' ? <Check size={11} className="text-green-400 shrink-0" /> : (
                p.status === 'connect' && <Plus size={11} className="text-orange-400 shrink-0" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-white/8">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Coming Soon</p>
          <div className="flex flex-wrap gap-1">
            {platforms.filter(p => p.status === 'coming_soon').map(p => (
              <span key={p.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/6 text-[8px] text-white/25">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: `${p.color}50` }} />
                {p.label.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Queue panel ──────────────────────────────────────────────────────────────

function QueuePanel({ queue, channels, onDelete, onPublishNow }: {
  queue: ScheduledPost[];
  channels: ChannelItem[];
  onDelete: (id: string) => Promise<void>;
  onPublishNow: (p: ScheduledPost) => void;
}) {
  if (!queue.length) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <Layers size={36} className="mx-auto mb-4 text-white/15" />
        <p className="text-white/40 font-bold">Nothing queued yet.</p>
        <p className="text-white/25 text-sm mt-1">Compose a post and schedule it to see it here.</p>
      </div>
    );
  }
  const labelFor = (p: ScheduledPost) => {
    const names = [
      ...(p.alsoPostToPlajah ? ['Plajah'] : []),
      ...p.targetAccountIds.map(id => channels.find(c => c.accountId === id)?.label ?? 'account'),
    ];
    return names.join(' · ') || '—';
  };
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-3">
      {queue.map(p => {
        const st = STATUS_STYLE[p.status];
        return (
          <div key={p.id} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${st.cls}`}>{st.label}</span>
                  <span className="text-white/40 text-xs">{labelFor(p)}</span>
                  {p.scheduledAt && (
                    <span className="text-white/30 text-xs flex items-center gap-1">
                      <Clock size={10} /> {new Date(p.scheduledAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/80 line-clamp-3 whitespace-pre-wrap">{p.text}</p>
                {p.publishLog && <p className="text-[11px] text-white/35 mt-2">{p.publishLog}</p>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {(p.status === 'SCHEDULED' || p.status === 'DRAFT' || p.status === 'FAILED') && (
                  <button onClick={() => onPublishNow(p)} title="Publish now"
                    className="p-2 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 transition-colors"><Send size={13} /></button>
                )}
                <button onClick={() => onDelete(p.id)} title="Delete"
                  className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-red-500/15 hover:text-red-300 transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar panel ───────────────────────────────────────────────────────────

function CalendarPanel({ queue }: { queue: ScheduledPost[] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const scheduled = queue.filter(p => typeof p.scheduledAt === 'number');
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const postsOn = (d: Date) => scheduled.filter(p => {
    const pd = new Date(p.scheduledAt!);
    return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth() && pd.getDate() === d.getDate();
  });
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black">{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronLeft size={16} /></button>
          <button onClick={() => shift(1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
          <div key={i} className="text-center text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/30 pb-2">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const posts = postsOn(d);
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <div key={i} className={`min-h-[60px] sm:min-h-[80px] rounded-xl p-1.5 sm:p-2 border ${isToday ? 'border-orange-400/40 bg-orange-500/5' : 'border-white/8 bg-white/[0.02]'}`}>
              <div className={`text-[10px] sm:text-xs font-bold mb-1 ${isToday ? 'text-orange-300' : 'text-white/40'}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {posts.slice(0, 2).map(p => (
                  <div key={p.id} className="text-[8px] leading-tight px-1 py-0.5 rounded bg-blue-500/20 text-blue-200 truncate">
                    {new Date(p.scheduledAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                ))}
                {posts.length > 2 && <div className="text-[8px] text-white/30 px-1">+{posts.length - 2}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Analytics panel ──────────────────────────────────────────────────────────

function AnalyticsPanel({ platforms, queue }: { platforms: PlatformDef[]; queue: ScheduledPost[] }) {
  const published = queue.filter(p => p.status === 'PUBLISHED' || p.status === 'PARTIAL');
  const scheduled = queue.filter(p => p.status === 'SCHEDULED');
  const failed = queue.filter(p => p.status === 'FAILED');

  const MOCK_METRICS = [
    { label: 'Impressions', icon: Eye, plajahValue: '—', color: '#6366f1' },
    { label: 'Engagements', icon: Heart, plajahValue: '—', color: '#ec4899' },
    { label: 'Comments', icon: MessageCircle, plajahValue: '—', color: '#3b82f6' },
    { label: 'Shares', icon: Share2, plajahValue: '—', color: '#10b981' },
    { label: 'Followers', icon: Users, plajahValue: '—', color: '#f59e0b' },
    { label: 'Link Clicks', icon: ArrowUpRight, plajahValue: '—', color: '#FF8C00' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      {/* Quick stats */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Posts Published', value: published.length, color: 'text-emerald-400' },
          { label: 'Scheduled', value: scheduled.length, color: 'text-blue-400' },
          { label: 'Failed', value: failed.length, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 sm:p-5 text-center">
            <p className={`text-2xl sm:text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-bold text-white/40 mt-1 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Per-platform analytics grid */}
      <h3 className="text-sm font-black text-white/60 uppercase tracking-widest mb-4">Platform Analytics</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {platforms.map(p => {
          const isConnected = p.status === 'connected';
          return (
            <div key={p.id} className={`relative bg-white/[0.03] border rounded-2xl p-4 sm:p-5 transition-all ${isConnected ? 'border-white/12' : 'border-white/6 opacity-60'}`}>
              {/* Platform header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{ background: `${p.color}18`, color: isConnected ? p.color : '#555', border: `1.5px solid ${p.color}${isConnected ? '40' : '22'}` }}>
                  {p.abbr}
                </span>
                <div>
                  <p className="text-sm font-black text-white/80">{p.label}</p>
                  <p className="text-[9px] font-bold" style={{ color: isConnected ? p.color : '#555' }}>
                    {p.status === 'connected' ? 'Connected' : p.status === 'connect' ? 'Not linked' : 'Coming Soon'}
                  </p>
                </div>
                {p.status === 'connected' && <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
              </div>

              {isConnected ? (
                /* Connected: show metric stubs — real data when APIs are wired */
                <div className="space-y-2.5">
                  {MOCK_METRICS.slice(0, 4).map(m => {
                    const Icon = m.icon;
                    return (
                      <div key={m.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] text-white/40">
                          <Icon size={12} style={{ color: m.color }} />
                          {m.label}
                        </div>
                        <span className="text-[11px] font-bold text-white/30">—</span>
                      </div>
                    );
                  })}
                  <div className="mt-3 pt-3 border-t border-white/8 text-[9px] text-white/20 text-center">
                    Analytics available when live API is connected
                  </div>
                </div>
              ) : (
                /* Not connected: show lock overlay */
                <div className="flex flex-col items-center justify-center py-4 gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Lock size={16} className="text-white/20" />
                  </div>
                  {p.status === 'connect' ? (
                    <>
                      <p className="text-[10px] text-white/30 text-center">Link your {p.label} account to unlock analytics</p>
                      <button className="px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 text-[10px] font-black hover:bg-orange-500/25 transition-colors">
                        Connect
                      </button>
                    </>
                  ) : (
                    <p className="text-[10px] text-white/25 text-center">{p.label} integration coming soon</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Publishing activity */}
      <div className="mt-8 bg-white/[0.03] border border-white/10 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-orange-400" />
          <h4 className="text-sm font-black text-white/70">Publishing Activity</h4>
        </div>
        {published.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/25 text-sm">No published posts yet — start composing to build your history.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {published.slice(0, 8).map(p => (
              <div key={p.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                <p className="text-[11px] text-white/50 line-clamp-1 flex-1">{p.text}</p>
                <span className="text-[10px] text-white/25 shrink-0">
                  {p.lastAttemptAt ? new Date(p.lastAttemptAt).toLocaleDateString() : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
