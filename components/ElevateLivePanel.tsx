// ElevateLivePanel — Plajah Elevate Live, inside Master Control.
//
// The org-facing backend for the auto article + briefing feature:
//   • Turn it ON per source (live streams and/or a Live Hub TV channel)
//   • Schedule runs against stream/slot windows — scheduled runs are VISIBLE
//     here with live status (SCHEDULED → MONITORING → PROCESSING → READY)
//   • Briefing drafts inbox — every generated Service Briefing lands here as
//     a DRAFT with its cost ledger, scripture index, figure callouts,
//     announcements, stills/cutouts and Reelo clips; approve + publish here.
//   • Drafts ALSO land in Sermon Studio: the generated article is saved as a
//     church-tagged Article, so it shows in Sermon Studio's library where it
//     can be edited and compiled into a book (the writing desk surface).
//
// Pipeline: services/elevateLiveBriefing.ts · store: elevateLiveStore.ts ·
// worker: elevateLiveWorker.ts (server-side by default; "Check due runs now"
// runs the same sweep in this admin session).

import React, { useEffect, useState } from 'react';
import {
  Sparkles, Loader2, Check, Play, Clock, FileText, Video, Megaphone,
  BookOpen, Users, Radio, Send, DollarSign,
} from 'lucide-react';
import type { Organization } from '../types';
import type { ElevateLiveConfig, ElevateLiveRun, ServiceBriefing } from '../services/elevateLiveBriefing';
import { briefingToMarkdown, formatClock } from '../services/elevateLiveBriefing';
import {
  getElevateLiveConfig, saveElevateLiveConfig, createElevateLiveRun,
  listElevateRunsForOrg, listElevateBriefingsForOrg, setElevateBriefingStatus,
  publishElevateArticle, greatFaithTonightTestRun, greatFaithTestConfig,
} from '../services/elevateLiveStore';
import { processDueElevateRuns } from '../services/elevateLiveWorker';

const card = 'bg-white/[0.03] border border-white/10 rounded-3xl p-5';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/40';
const btn = 'flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40';
const btnPrimary = 'flex items-center gap-2 px-5 py-2.5 bg-small-orange text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40';
const field = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-small-orange/50';

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'text-sky-300', MONITORING: 'text-red-400', PROCESSING: 'text-amber-300',
  READY: 'text-emerald-300', ERROR: 'text-red-400', DRAFT: 'text-amber-300',
  APPROVED: 'text-sky-300', PUBLISHED: 'text-emerald-300',
};

const fmtWindow = (r: ElevateLiveRun) => {
  const f = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${f(r.windowStart)} → ${f(r.windowEnd)}`;
};

const ElevateLivePanel: React.FC<{ church: Organization }> = ({ church }) => {
  const [cfg, setCfg] = useState<ElevateLiveConfig | null>(null);
  const [runs, setRuns] = useState<ElevateLiveRun[]>([]);
  const [briefings, setBriefings] = useState<ServiceBriefing[]>([]);
  const [open, setOpen] = useState<ServiceBriefing | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState('');

  // schedule form
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [sourceKind, setSourceKind] = useState<'LIVE_STREAM' | 'FAST_CHANNEL'>('FAST_CHANNEL');
  const [ordinal, setOrdinal] = useState(1);

  const load = async () => {
    const [c, r, b] = await Promise.all([
      getElevateLiveConfig(church.id).catch(() => null),
      listElevateRunsForOrg(church.id, church.name).catch(() => []),
      listElevateBriefingsForOrg(church.id).catch(() => []),
    ]);
    setCfg(c || {
      orgId: church.id, orgName: church.name, enabled: false,
      sources: [{ kind: 'FAST_CHANNEL', channelOrdinal: 1 }],
      outputs: { article: true, briefing: true, clips: true, bookChapter: false },
      faithContext: true, updatedAt: 0,
    });
    setRuns(r); setBriefings(b);
  };
  useEffect(() => { load(); }, [church.id]);

  const flash = (m: string) => { setNote(m); };

  const saveCfg = async () => {
    if (!cfg) return;
    setBusy('cfg');
    try { await saveElevateLiveConfig(cfg); flash('Settings saved.'); } catch { flash('Could not save settings.'); }
    setBusy('');
  };

  const scheduleRun = async () => {
    const ws = Date.parse(start); const we = Date.parse(end);
    if (!ws || !we || we <= ws) { flash('Pick a start and a later end.'); return; }
    setBusy('schedule');
    try {
      await createElevateLiveRun({
        id: `elevate_run_${church.id}_${ws}`, orgId: church.id, orgName: church.name,
        sourceKind, channelOrdinal: sourceKind === 'FAST_CHANNEL' ? ordinal : undefined,
        windowStart: ws, windowEnd: we, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        status: 'SCHEDULED', createdAt: Date.now(),
      });
      flash('Run scheduled — it will generate automatically when the window ends.');
      await load();
    } catch { flash('Could not schedule the run.'); }
    setBusy('');
  };

  const scheduleTonightTest = async () => {
    setBusy('tonight');
    try {
      const run = { ...greatFaithTonightTestRun(), orgId: church.id, requiresOrgResolution: false };
      await saveElevateLiveConfig(greatFaithTestConfig(church.id));
      await createElevateLiveRun(run);
      flash('Tonight\u2019s test is scheduled: 7:00–8:05pm ET, channel 2. Generation fires when the window ends.');
      await load();
    } catch { flash('Could not schedule tonight\u2019s test.'); }
    setBusy('');
  };

  const runDueNow = async () => {
    setBusy('due');
    try {
      const res = await processDueElevateRuns();
      flash(res.processed.length ? `Generated ${res.processed.length} run(s).` : res.errors.length ? `Errors: ${res.errors.map(e => e.error).join(', ')}` : 'No runs are due yet.');
      await load();
    } catch { flash('Sweep failed.'); }
    setBusy('');
  };

  const approve = async (b: ServiceBriefing) => {
    setBusy('approve');
    try { await setElevateBriefingStatus(b.id, 'APPROVED'); setOpen({ ...b, status: 'APPROVED' }); await load(); } catch { flash('Could not approve.'); }
    setBusy('');
  };

  const publish = async (b: ServiceBriefing) => {
    if (!b.articleId) { flash('This briefing has no article draft attached.'); return; }
    setBusy('publish');
    try {
      await publishElevateArticle(b.articleId);
      await setElevateBriefingStatus(b.id, 'PUBLISHED');
      setOpen({ ...b, status: 'PUBLISHED' }); flash('Article published to the church feed. It also lives in Sermon Studio for book compiling.');
      await load();
    } catch { flash('Could not publish.'); }
    setBusy('');
  };

  const srcOn = (kind: string) => !!cfg?.sources.some(s => s.kind === kind);
  const setSrc = (kind: 'LIVE_STREAM' | 'FAST_CHANNEL', on: boolean) => {
    if (!cfg) return;
    const sources = on
      ? [...cfg.sources.filter(s => s.kind !== kind), { kind, channelOrdinal: kind === 'FAST_CHANNEL' ? ordinal : undefined }]
      : cfg.sources.filter(s => s.kind !== kind);
    setCfg({ ...cfg, sources });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-small-orange/15 rounded-2xl"><Sparkles className="text-small-orange" size={24} /></div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white leading-none">Elevate Live</h2>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Auto articles · service briefings · Reelo clips — from your live streams & TV channels</p>
        </div>
      </div>
      {note && <p className="text-xs text-small-orange">{note}</p>}

      {/* ── Feature toggle ─────────────────────────────────────────── */}
      {cfg && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <p className={label}>Feature</p>
            <button onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
              className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${cfg.enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-white/5 text-white/40 border border-white/10'}`}>
              {cfg.enabled ? '● On' : '○ Off'}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm text-white/70">
            <label className="flex items-center gap-2"><input type="checkbox" checked={srcOn('LIVE_STREAM')} onChange={e => setSrc('LIVE_STREAM', e.target.checked)} /> Live streams</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={srcOn('FAST_CHANNEL')} onChange={e => setSrc('FAST_CHANNEL', e.target.checked)} /> Live Hub TV channel</label>
            <label className="flex items-center gap-2">Channel # <input type="number" min={1} max={9} value={ordinal} onChange={e => setOrdinal(Math.max(1, Number(e.target.value) || 1))} className={`${field} w-20`} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/70 mt-4">
            <input type="checkbox" checked={cfg.autoPublishBriefing !== false} onChange={e => setCfg({ ...cfg, autoPublishBriefing: e.target.checked })} />
            Auto-publish briefing to the members feed + public social feed (posted as an AI draft — role-holders can revise it after)
          </label>
          <p className={`${label} mt-5 mb-2`}>Generate</p>
          <div className="flex flex-wrap gap-4 text-sm text-white/70">
            {([['article', 'Article'], ['briefing', 'Service briefing'], ['clips', 'Reelo clips']] as const).map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={!!cfg.outputs[k]} onChange={e => setCfg({ ...cfg, outputs: { ...cfg.outputs, [k]: e.target.checked } })} /> {lbl}
              </label>
            ))}
          </div>
          <button onClick={saveCfg} disabled={busy === 'cfg'} className={`${btnPrimary} mt-5`}>
            {busy === 'cfg' ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Save settings
          </button>
        </div>
      )}

      {/* ── Scheduling ─────────────────────────────────────────────── */}
      <div className={card}>
        <p className={`${label} mb-4 flex items-center gap-2`}><Clock size={12} /> Scheduled runs</p>
        {church.name === 'Great Faith' && (
          <button onClick={scheduleTonightTest} disabled={busy === 'tonight'} className={`${btnPrimary} mb-4`}>
            {busy === 'tonight' ? <Loader2 className="animate-spin" size={14} /> : <Radio size={14} />}
            Schedule tonight&rsquo;s test — 7:00–8:05pm ET · channel 2
          </button>
        )}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex flex-col gap-1"><span className={label}>Starts</span><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={label}>Ends</span><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={label}>Source</span>
            <select value={sourceKind} onChange={e => setSourceKind(e.target.value as any)} className={field}>
              <option value="FAST_CHANNEL">TV channel</option>
              <option value="LIVE_STREAM">Live stream</option>
            </select>
          </label>
          <button onClick={scheduleRun} disabled={busy === 'schedule'} className={btn}>{busy === 'schedule' ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />} Schedule run</button>
          <button onClick={runDueNow} disabled={busy === 'due'} className={btn}>{busy === 'due' ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />} Check due runs now</button>
        </div>
        <div className="space-y-2">
          {runs.length === 0 && <p className="text-sm text-white/30">No runs yet — schedule one above and it will appear here with its status.</p>}
          {runs.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-black/30 border border-white/5 rounded-2xl px-4 py-3">
              <span className={`text-[10px] font-black uppercase tracking-widest ${STATUS_COLOR[r.status] || 'text-white/50'}`}>{r.status}</span>
              <span className="text-sm text-white/80">{r.sourceKind === 'FAST_CHANNEL' ? `TV channel${r.channelOrdinal ? ` #${r.channelOrdinal}` : ''}` : 'Live stream'}</span>
              <span className="text-xs text-white/40">{fmtWindow(r)}</span>
              {r.error && <span className="text-xs text-red-400">{r.error}</span>}
              {r.briefingId && <span className="text-xs text-emerald-300">briefing ready ↓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Briefing drafts inbox ──────────────────────────────────── */}
      <div className={card}>
        <p className={`${label} mb-1 flex items-center gap-2`}><FileText size={12} /> Briefing drafts</p>
        <p className="text-xs text-white/30 mb-4">Briefings auto-publish to your feeds as AI drafts (role-holders can revise them in the post). Copies land here and in Sermon Studio — review, publish the full article, or compile into a book there.</p>
        <div className="space-y-2">
          {briefings.length === 0 && <p className="text-sm text-white/30">No briefings yet — they&rsquo;ll appear here after a scheduled run finishes.</p>}
          {briefings.map(b => (
            <button key={b.id} onClick={() => { setOpen(open?.id === b.id ? null : b); setShowMarkdown(false); }}
              className="w-full text-left bg-black/30 border border-white/5 hover:border-white/15 rounded-2xl px-4 py-3 transition-all">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`text-[10px] font-black uppercase tracking-widest ${STATUS_COLOR[b.status]}`}>{b.status}</span>
                <span className="text-sm font-bold text-white">{b.title}</span>
                <span className="text-xs text-white/40">{new Date(b.serviceDate).toLocaleDateString()}</span>
                <span className="text-xs text-white/40 flex items-center gap-1"><DollarSign size={11} />{b.cost.totalUsd.toFixed(3)}</span>
              </div>
              <p className="text-xs text-white/40 mt-1">{b.scriptureIndex.length} scriptures · {b.biblicalFigures.length} figures · {b.announcements.length} announcements · {b.clipIds.length} clips{b.postId ? ' · live in feeds (AI draft)' : ''}</p>
            </button>
          ))}
        </div>

        {open && (
          <div className="mt-5 border-t border-white/10 pt-5 space-y-5">
            <p className="text-sm text-white/70 leading-relaxed">{open.summary}</p>

            <div>
              <p className={`${label} mb-2 flex items-center gap-2`}><DollarSign size={12} /> Cost of this run</p>
              {open.cost.lineItems.map((li, i) => (
                <p key={i} className="text-xs text-white/50 flex justify-between gap-4"><span>{li.stage} — {li.detail}</span><span>${li.usd.toFixed(4)}</span></p>
              ))}
              <p className="text-xs text-white font-bold flex justify-between gap-4 mt-1"><span>Total (estimated)</span><span>${open.cost.totalUsd.toFixed(3)}</span></p>
            </div>

            {!!open.keyPoints.length && (
              <div>
                <p className={`${label} mb-2`}>Key points</p>
                {open.keyPoints.map((k, i) => <p key={i} className="text-sm text-white/70 mb-1.5">{k.point} — <span className="text-white/40">&ldquo;{k.quote}&rdquo; ({formatClock(k.timecode)})</span></p>)}
              </div>
            )}
            {!!open.scriptureIndex.length && (
              <div>
                <p className={`${label} mb-2 flex items-center gap-2`}><BookOpen size={12} /> Scripture index</p>
                {open.scriptureIndex.map((s, i) => <p key={i} className="text-sm text-white/70 mb-1.5"><span className="text-small-orange font-bold">{s.reference}</span> ({formatClock(s.timecode)}) — {s.teachingPoint}</p>)}
              </div>
            )}
            {!!open.biblicalFigures.length && (
              <div>
                <p className={`${label} mb-2 flex items-center gap-2`}><Users size={12} /> Biblical figures</p>
                {open.biblicalFigures.map((f, i) => <p key={i} className="text-sm text-white/70 mb-1.5"><span className="font-bold text-white">{f.name}</span> — {f.whatWasSaid} <span className="text-white/40">→ {f.relationToTeaching}</span></p>)}
              </div>
            )}
            {!!open.announcements.length && (
              <div>
                <p className={`${label} mb-2 flex items-center gap-2`}><Megaphone size={12} /> Announcements &amp; reminders</p>
                {open.announcements.map((a, i) => <p key={i} className="text-sm text-white/70 mb-1.5">{a.isSaveTheDate ? '📅 ' : ''}<span className="font-bold text-white">{a.title}</span>{a.whenText ? ` — ${a.whenText}` : ''}. {a.details}</p>)}
              </div>
            )}
            {!!open.stills.length && (
              <div>
                <p className={`${label} mb-2`}>Screenshots &amp; speaker cutouts</p>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {open.stills.map((s, i) => (
                    <figure key={i} className="shrink-0 w-44">
                      <img src={s.frameUrl} alt={s.caption} className="w-44 h-24 object-cover rounded-xl border border-white/10" />
                      <figcaption className="text-[10px] text-white/40 mt-1">{s.caption} · {formatClock(s.timecode)}{s.kind === 'CUTOUT' ? ' · cutout' : ''}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
            {!!open.clipIds.length && <p className="text-xs text-white/50 flex items-center gap-2"><Video size={12} /> {open.clipIds.length} highlight clips published to the Reelo channel.</p>}

            <div className="flex flex-wrap gap-2">
              {open.status === 'DRAFT' && <button onClick={() => approve(open)} disabled={busy === 'approve'} className={btn}>{busy === 'approve' ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Approve</button>}
              {open.articleId && open.status !== 'PUBLISHED' && <button onClick={() => publish(open)} disabled={busy === 'publish'} className={btnPrimary}>{busy === 'publish' ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Publish article</button>}
              <button onClick={() => setShowMarkdown(!showMarkdown)} className={btn}><FileText size={14} /> {showMarkdown ? 'Hide' : 'View'} briefing text</button>
            </div>
            {showMarkdown && <pre className="text-xs text-white/60 whitespace-pre-wrap bg-black/40 border border-white/5 rounded-2xl p-4 max-h-96 overflow-y-auto">{briefingToMarkdown(open)}</pre>}
          </div>
        )}
      </div>
    </div>
  );
};

export default ElevateLivePanel;
