// ─── Plajah Studio ───────────────────────────────────────────────────────────
// Hootsuite/Buffer-class publishing for artists & business pages, built on the
// existing fediverse cross-posting engine + the on-platform feed. This first
// slice is the publishing core: compose → target channels → schedule → queue +
// calendar → auto-publish. Analytics, AI assist, and team approvals layer on
// in later passes.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, CalendarClock, ListChecks, Sparkles, Plus, Trash2, Globe, Clock,
  Check, AlertTriangle, Loader2, Link as LinkIcon, ChevronLeft, ChevronRight,
  CalendarDays, Layers, X,
} from 'lucide-react';
import { useFediverse } from '../../contexts/FediverseContext';
import { createPost } from '../../services/backendService';
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

// Network character limits — the composer warns at the tightest of the selected.
const NET_LIMIT: Record<FediverseProtocol | 'plajah', number> = {
  mastodon: 500, bluesky: 300, threads: 500, plajah: 5000,
};
const NET_LABEL: Record<FediverseProtocol | 'plajah', string> = {
  mastodon: 'Mastodon', bluesky: 'Bluesky', threads: 'Threads', plajah: 'Plajah',
};
const NET_COLOR: Record<FediverseProtocol | 'plajah', string> = {
  mastodon: '#6364FF', bluesky: '#0085FF', threads: '#000000', plajah: '#FF8C00',
};

type Tab = 'COMPOSE' | 'QUEUE' | 'CALENDAR';

const STATUS_STYLE: Record<ScheduledPost['status'], { label: string; cls: string }> = {
  DRAFT:      { label: 'Draft',      cls: 'bg-white/10 text-white/60' },
  SCHEDULED:  { label: 'Scheduled',  cls: 'bg-blue-500/20 text-blue-300' },
  PUBLISHING: { label: 'Publishing', cls: 'bg-amber-500/20 text-amber-300' },
  PUBLISHED:  { label: 'Published',  cls: 'bg-emerald-500/20 text-emerald-300' },
  PARTIAL:    { label: 'Partial',    cls: 'bg-orange-500/20 text-orange-300' },
  FAILED:     { label: 'Failed',     cls: 'bg-red-500/20 text-red-300' },
};

export default function StudioView() {
  const { accounts, broadcast } = useFediverse();
  const [tab, setTab] = useState<Tab>('COMPOSE');
  const [entitlement, setEntitlement] = useState<ManagerSuiteEntitlement | null>(null);
  const [hasPlus, setHasPlus] = useState(false);
  const [queue, setQueue] = useState<ScheduledPost[]>([]);
  const publishing = useRef<Set<string>>(new Set());

  // Activate the suite on first open — this starts the 12-month free year.
  useEffect(() => { activateAndGetEntitlement().then(setEntitlement).catch(() => {}); }, []);
  // Plajah+ subscribers get Pro for free (the suite is a headline Plajah+ benefit).
  useEffect(() => { currentUserHasPlajahPlus().then(setHasPlus).catch(() => {}); }, []);

  // Live queue.
  useEffect(() => listenToQueue(setQueue), []);

  const planCtx = { hasPlajahPlus: hasPlus };
  const plan = effectivePlan(entitlement, planCtx);
  const limits = effectiveLimits(entitlement, planCtx);
  const freeYear = freeYearStatus(entitlement);
  const usedSlots = countQueueSlots(queue);

  // All channels = Plajah feed + each connected fediverse account.
  const channels = useMemo(() => [
    { id: 'plajah', kind: 'plajah' as const, label: 'Plajah Feed', handle: 'On-platform', accountId: undefined },
    ...accounts.filter(a => a.isActive).map(a => ({
      id: a.id, kind: a.protocol, label: NET_LABEL[a.protocol], handle: a.handle, accountId: a.id,
    })),
  ], [accounts]);

  // ── Publisher: publish a single post now (client fallback to the cron) ──────
  const publishPost = useCallback(async (post: ScheduledPost) => {
    if (publishing.current.has(post.id)) return;
    publishing.current.add(post.id);
    try {
      await updateScheduledPost(post.id, { status: 'PUBLISHING' });
      const results: ScheduledPostTargetResult[] = [];

      if (post.targetAccountIds.length) {
        const br = await broadcast({
          text: post.text,
          uri: post.linkUri,
          title: post.linkTitle,
          description: post.linkDescription,
          thumbnail: post.mediaUrls[0],
        }, post.targetAccountIds);
        br.succeeded.forEach(s => results.push({ channelKind: s.protocol, accountId: s.accountId, ok: true, postUrl: s.postUrl }));
        br.failed.forEach(f => results.push({ channelKind: f.protocol, accountId: f.accountId, ok: false, error: f.error }));
      }

      if (post.alsoPostToPlajah) {
        try {
          await createPost({
            text: post.text,
            media: post.mediaUrls.map(url => ({ type: 'PICTURE', url })) as any,
          });
          results.push({ channelKind: 'plajah', ok: true });
        } catch (e: any) {
          results.push({ channelKind: 'plajah', ok: false, error: e?.message ?? 'Plajah post failed' });
        }
      }

      const okCount = results.filter(r => r.ok).length;
      const failCount = results.filter(r => !r.ok).length;
      const status = failCount === 0 ? 'PUBLISHED' : okCount === 0 ? 'FAILED' : 'PARTIAL';
      await updateScheduledPost(post.id, {
        status,
        results,
        publishLog: results.map(r => `${r.ok ? '✓' : '✗'} ${NET_LABEL[r.channelKind]}${r.error ? ': ' + r.error : ''}`).join('  '),
        lastAttemptAt: Date.now(),
      });
    } catch (e) {
      await updateScheduledPost(post.id, { status: 'FAILED', publishLog: String((e as Error)?.message ?? e) }).catch(() => {});
    } finally {
      publishing.current.delete(post.id);
    }
  }, [broadcast]);

  // Tick: publish the current user's due posts even before the server cron is
  // configured (works whenever the Studio is open).
  useEffect(() => {
    const tick = () => dueScheduledPosts(queue).forEach(publishPost);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [queue, publishPost]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-8 pb-4 border-b border-white/8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Sparkles className="text-orange-400" size={26} /> Plajah Studio
            </h1>
            <p className="text-white/40 text-sm mt-1">Publish & schedule everywhere — on Plajah and across the open social web.</p>
          </div>
          <FreeYearBadge plan={plan} daysLeft={freeYear.daysLeft} inFreeYear={freeYear.inFreeYear} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-6 -mb-px">
          {([['COMPOSE', 'Compose', Send], ['QUEUE', 'Queue', ListChecks], ['CALENDAR', 'Calendar', CalendarDays]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl border-b-2 transition-colors ${tab === id ? 'border-orange-400 text-white bg-white/[0.04]' : 'border-transparent text-white/40 hover:text-white/70'}`}
            >
              <Icon size={15} /> {label}
              {id === 'QUEUE' && usedSlots > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-black">{usedSlots}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'COMPOSE' && (
          <Composer
            channels={channels}
            limits={limits}
            usedSlots={usedSlots}
            onPublishNow={publishPost}
          />
        )}
        {tab === 'QUEUE' && (
          <QueuePanel queue={queue} channels={channels} onDelete={deleteScheduledPost} onPublishNow={publishPost} />
        )}
        {tab === 'CALENDAR' && <CalendarPanel queue={queue} />}
      </div>
    </div>
  );
}

// ─── Free-year badge ────────────────────────────────────────────────────────

function FreeYearBadge({ plan, daysLeft, inFreeYear }: { plan: string; daysLeft: number; inFreeYear: boolean }) {
  if (inFreeYear) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500/20 to-amber-500/10 border border-orange-500/30">
        <Sparkles size={15} className="text-orange-300" />
        <div className="leading-tight">
          <p className="text-[11px] font-black uppercase tracking-widest text-orange-200">Pro — Free</p>
          <p className="text-[10px] text-white/50">{daysLeft} days left in your free year</p>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10">
      <p className="text-[11px] font-black uppercase tracking-widest text-white/60">{plan} plan</p>
    </div>
  );
}

// ─── Composer ───────────────────────────────────────────────────────────────

interface ChannelItem { id: string; kind: FediverseProtocol | 'plajah'; label: string; handle: string; accountId?: string }

function Composer({ channels, limits, usedSlots, onPublishNow }: {
  channels: ChannelItem[];
  limits: ReturnType<typeof effectiveLimits>;
  usedSlots: number;
  onPublishNow: (p: ScheduledPost) => void;
}) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(['plajah']));
  const [linkUri, setLinkUri] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [when, setWhen] = useState(''); // datetime-local
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selectedChannels = channels.filter(c => selected.has(c.id));
  const tightestLimit = Math.min(...(selectedChannels.length ? selectedChannels.map(c => NET_LIMIT[c.kind]) : [5000]));
  const over = text.length > tightestLimit;
  const queueFull = usedSlots >= limits.maxScheduledPosts;

  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); };

  const submit = async (scheduled: boolean) => {
    if (busy) return;
    if (!text.trim()) { flash(false, 'Write something first.'); return; }
    if (!selectedChannels.length) { flash(false, 'Pick at least one channel.'); return; }
    if (over) { flash(false, `Too long for ${selectedChannels.find(c => text.length > NET_LIMIT[c.kind])?.label}.`); return; }
    if (scheduled && !when) { flash(false, 'Choose a date & time, or hit Post now.'); return; }
    if (scheduled && queueFull) { flash(false, `Queue is full (${limits.maxScheduledPosts}). Upgrade for more.`); return; }

    setBusy(true);
    try {
      const targetAccountIds = selectedChannels.filter(c => c.accountId).map(c => c.accountId!) as string[];
      const alsoPostToPlajah = selected.has('plajah');
      const scheduledAt = scheduled ? new Date(when).getTime() : undefined;

      const post = await createScheduledPost({
        text, targetAccountIds, alsoPostToPlajah, scheduledAt,
        linkUri: linkUri.trim() || undefined,
      });

      if (!scheduled) {
        await onPublishNow(post);
        flash(true, 'Posted.');
      } else {
        flash(true, `Scheduled for ${new Date(when).toLocaleString()}.`);
      }
      setText(''); setLinkUri(''); setShowLink(false); setWhen('');
    } catch (e: any) {
      flash(false, e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8">
      {/* Channel picker */}
      <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Publish to</p>
      <div className="flex flex-wrap gap-2 mb-6">
        {channels.map(c => {
          const on = selected.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`group flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-full border text-sm font-bold transition-all ${on ? 'border-white/30 bg-white/10 text-white' : 'border-white/10 text-white/40 hover:text-white/70'}`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: on ? NET_COLOR[c.kind] : 'transparent', border: on ? 'none' : `1.5px solid ${NET_COLOR[c.kind]}66`, color: c.kind === 'threads' ? '#fff' : '#fff' }}>
                {on ? <Check size={11} /> : c.label[0]}
              </span>
              {c.label}
              <span className="text-white/30 text-[11px] hidden sm:inline">{c.handle}</span>
            </button>
          );
        })}
        {channels.length === 1 && (
          <span className="text-white/30 text-xs self-center ml-2">Connect Mastodon / Bluesky / Threads in Fediverse settings to cross-post.</span>
        )}
      </div>

      {/* Text */}
      <div className="relative">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What do you want to share?"
          className="w-full min-h-[160px] bg-white/[0.04] border border-white/10 rounded-2xl p-5 text-[15px] leading-relaxed text-white placeholder-white/25 focus:outline-none focus:border-orange-400/40 resize-y"
        />
        <div className={`absolute bottom-4 right-5 text-xs font-bold ${over ? 'text-red-400' : 'text-white/30'}`}>
          {text.length}{selectedChannels.length ? ` / ${tightestLimit}` : ''}
        </div>
      </div>

      {/* Link row */}
      <div className="mt-3">
        {showLink ? (
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2">
            <LinkIcon size={14} className="text-white/40" />
            <input value={linkUri} onChange={e => setLinkUri(e.target.value)} placeholder="https://link-to-attach.com"
              className="flex-1 bg-transparent text-sm text-white placeholder-white/25 focus:outline-none" />
            <button onClick={() => { setShowLink(false); setLinkUri(''); }} className="text-white/30 hover:text-white/60"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => setShowLink(true)} className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-white/70">
            <LinkIcon size={13} /> Attach a link
          </button>
        )}
      </div>

      {/* Schedule + actions */}
      <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 flex-1">
          <CalendarClock size={15} className="text-white/40" />
          <input
            type="datetime-local"
            value={when}
            min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            onChange={e => setWhen(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white/80 focus:outline-none [color-scheme:dark]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => submit(true)}
            disabled={busy || !when}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-sm font-bold transition-colors"
          >
            <Clock size={15} /> Schedule
          </button>
          <button
            onClick={() => submit(false)}
            disabled={busy}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-black transition-colors"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Post now
          </button>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${toast.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
            {toast.ok ? <Check size={15} /> : <AlertTriangle size={15} />} {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Queue panel ────────────────────────────────────────────────────────────

function QueuePanel({ queue, channels, onDelete, onPublishNow }: {
  queue: ScheduledPost[];
  channels: ChannelItem[];
  onDelete: (id: string) => Promise<void>;
  onPublishNow: (p: ScheduledPost) => void;
}) {
  if (!queue.length) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <Layers size={40} className="mx-auto mb-4 text-white/15" />
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
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8 space-y-3">
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
                      <Clock size={11} /> {new Date(p.scheduledAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/80 line-clamp-3 whitespace-pre-wrap">{p.text}</p>
                {p.publishLog && <p className="text-[11px] text-white/35 mt-2">{p.publishLog}</p>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {(p.status === 'SCHEDULED' || p.status === 'DRAFT' || p.status === 'FAILED') && (
                  <button onClick={() => onPublishNow(p)} title="Publish now"
                    className="p-2 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 transition-colors"><Send size={14} /></button>
                )}
                <button onClick={() => onDelete(p.id)} title="Delete"
                  className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-red-500/15 hover:text-red-300 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar panel ─────────────────────────────────────────────────────────

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
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black">{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronLeft size={16} /></button>
          <button onClick={() => shift(1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-black uppercase tracking-widest text-white/30 pb-1">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const posts = postsOn(d);
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <div key={i} className={`min-h-[78px] rounded-xl p-2 border ${isToday ? 'border-orange-400/40 bg-orange-500/5' : 'border-white/8 bg-white/[0.02]'}`}>
              <div className={`text-xs font-bold mb-1 ${isToday ? 'text-orange-300' : 'text-white/40'}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {posts.slice(0, 3).map(p => (
                  <div key={p.id} className="text-[9px] leading-tight px-1.5 py-1 rounded bg-blue-500/20 text-blue-200 truncate" title={p.text}>
                    {new Date(p.scheduledAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} {p.text.slice(0, 20)}
                  </div>
                ))}
                {posts.length > 3 && <div className="text-[9px] text-white/30 px-1">+{posts.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
