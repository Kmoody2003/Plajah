// Tela · Story Intelligence workspace. Everything Story Intelligence has read for this account, and the
// place a creator turns what it found into their World.
//
//   Inbox — every new finding across every reading, as a proposal: Accept, Edit first, Skip.
//   Desk  — one source: the video plays, its findings sit on its timeline, an inspector for each.
//
// Sources are Reello videos, films and albums (services/storyIntel/sources.ts). Findings and the World
// entries they become: services/storyIntel/findings.ts. Filing happens on the server
// (/api/story-intel/:kind/:id/file) so the entry, the World's assets and graph, and the source's record
// of what was filed always move together, on every device.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Clapperboard, Disc3, ExternalLink, Film, Globe2, Inbox, Loader2, Pencil, RefreshCw, Sparkles, Undo2, Video as VideoIcon, X } from 'lucide-react';
import { auth } from '../../../services/firebase';
import { fetchUserWorlds } from '../../../services/backendService';
import { listSources, fileFromSource, skipInSource, sourceMatches, getRules as getIntelRules, saveRules as saveIntelRules, readAgain as requestReadAgain, type WorldMatch } from '../../../services/storyIntel/api';
import type { IntelSourceView, SourceKind } from '../../../services/storyIntel/sources';
import DeskPlayer from './DeskPlayer';
import { clock, stateOf, DEFAULT_RULES, RULE_KINDS, type Finding, type FindingEdits, type FindingKind, type RuleMode, type StoryIntelRules } from '../../../services/storyIntel/findings';
import type { IPWorld } from '../../../types';

type View = 'inbox' | 'desk';

const KIND: Record<FindingKind, { label: string; plural: string; color: string }> = {
  character: { label: 'Character', plural: 'People', color: '#e07fcb' },
  lore: { label: 'Lore', plural: 'Places & ideas', color: '#5fc2ac' },
  timeline: { label: 'Timeline', plural: 'Timeline', color: '#e0a050' },
  asset: { label: 'Asset', plural: 'Media', color: '#7aa6ec' },
  relation: { label: 'Relationship', plural: 'Relationships', color: '#d6c15a' },
  product: { label: 'Product', plural: 'Products', color: '#9aa1ae' },
};
const KINDS: FindingKind[] = ['character', 'lore', 'timeline', 'asset', 'relation', 'product'];
const SOURCE_WORD: Record<SourceKind, string> = { video: 'Video', film: 'Film', album: 'Album' };
const srcKey = (v: Pick<IntelSourceView, 'kind' | 'id'>) => `${v.kind}:${v.id}`;
const SourceIcon: React.FC<{ kind: SourceKind; size?: number }> = ({ kind, size = 12 }) =>
  kind === 'film' ? <Film size={size} /> : kind === 'album' ? <Disc3 size={size} /> : <VideoIcon size={size} />;
const WORLD_KEY = 'tela:storyIntel:world';
const VIEW_KEY = 'tela:storyIntel:view';

const read = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

const Dot: React.FC<{ kind: FindingKind; size?: number }> = ({ kind, size = 8 }) =>
  <span className="inline-block rounded-full flex-none" style={{ width: size, height: size, background: KIND[kind].color }} />;

/** One line that says exactly what Accept will do. */
function proposalLine(f: Finding, m?: WorldMatch): React.ReactNode {
  const b = <b className="font-semibold text-white">{f.title}</b>;
  if (m && m.by === 'name' && f.kind !== 'relation') return <>Add this to <b className="font-semibold text-white">{m.name || f.title}</b>, already in this World</>;
  if (m && m.by === 'source') return <>Update {b} in this World</>;
  if (f.kind === 'character') return <>Add {b} as a character</>;
  if (f.kind === 'lore') return <>Add {b} to lore</>;
  if (f.kind === 'timeline') return <>Put {b} on the timeline{f.year ? ` in ${f.year}` : ''}</>;
  if (f.kind === 'asset') return <>Add {b} to the World's media</>;
  if (f.kind === 'relation') return <>Connect {b}: {f.summary.toLowerCase()}</>;
  return <>{b}</>;
}

export default function StoryIntelWorkspace({ onClose, initialVideoId, initialSource, initialView }: {
  onClose: () => void;
  initialVideoId?: string | null;
  /** `${kind}:${id}`, e.g. film:album_123. */
  initialSource?: string | null;
  initialView?: View;
}) {
  const uid = auth.currentUser?.uid || null;
  const [jobs, setJobs] = useState<IntelSourceView[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [worlds, setWorlds] = useState<IPWorld[] | null>(null);
  const [worldId, setWorldId] = useState(read(WORLD_KEY));
  const [view, setView] = useState<View>(initialView || (initialVideoId || initialSource ? 'desk' : ((read(VIEW_KEY) as View) || 'inbox')));
  const [deskId, setDeskId] = useState<string | null>(initialSource || (initialVideoId ? `video:${initialVideoId}` : null));
  const [matches, setMatches] = useState<Record<string, Record<string, WorldMatch>>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  // Bumped after filing: what one video added changes what the others would land in (same person, two videos).
  const [matchTick, setMatchTick] = useState(0);

  const load = useCallback(async () => {
    try { setJobs(await listSources()); setLoadError(''); }
    catch (e: any) { setLoadError(e?.message || 'Could not load your readings.'); setJobs(j => j || []); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Readings still in progress: check back every 15 seconds.
  useEffect(() => {
    if (!jobs?.some(j => j.status === 'WORKING')) return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [jobs, load]);
  useEffect(() => {
    if (!uid) { setWorlds([]); return; }
    void fetchUserWorlds(uid).then(ws => {
      setWorlds(ws);
      setWorldId(cur => (ws.some(w => w.id === cur) ? cur : ws[0]?.id || ''));
    }).catch(() => setWorlds([]));
  }, [uid]);
  useEffect(() => { if (worldId) write(WORLD_KEY, worldId); }, [worldId]);
  useEffect(() => { write(VIEW_KEY, view); }, [view]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 4200); return () => clearTimeout(t); }, [note]);

  const ready = useMemo(() => (jobs || []).filter(j => j.status === 'READY' && j.findings.length), [jobs]);
  const world = worlds?.find(w => w.id === worldId) || null;

  // What each finding would land in, for the chosen World.
  useEffect(() => {
    if (!worldId || !ready.length) { setMatches({}); return; }
    let live = true;
    void Promise.all(ready.slice(0, 40).map(j => sourceMatches(j.kind, j.id, worldId).then(m => [srcKey(j), m] as const).catch(() => [srcKey(j), {}] as const)))
      .then(rows => { if (live) setMatches(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [worldId, matchTick, ready.map(srcKey).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchJob = (key: string, filing: IntelSourceView['filing']) =>
    setJobs(js => (js || []).map(j => (srcKey(j) === key ? { ...j, filing } : j)));
  const mark = (keys: string[], on: boolean) => setBusy(b => { const n = new Set(b); keys.forEach(k => (on ? n.add(k) : n.delete(k))); return n; });

  const accept = async (job: IntelSourceView, items: Array<{ key: string; edits?: FindingEdits }>) => {
    if (!worldId) { setNote({ text: 'Pick a World first.', bad: true }); return; }
    const sk = srcKey(job);
    const ids = items.map(i => `${sk}|${i.key}`);
    mark(ids, true);
    try {
      const r = await fileFromSource(job.kind, job.id, worldId, items);
      patchJob(sk, r.worldFiling);
      const bad = r.results.filter(x => !x.ok);
      setMatches(m => ({ ...m, [sk]: { ...(m[sk] || {}), ...Object.fromEntries(r.results.filter(x => x.ok && x.entryId).map(x => [x.key, { id: x.entryId!, by: 'source' as const, name: '' }])) } }));
      const ok = r.results.length - bad.length;
      if (ok) setMatchTick(t => t + 1);
      setNote(bad.length ? { text: `${ok} added. ${bad[0].error}`, bad: true } : { text: `${ok === 1 ? 'Added' : `${ok} added`} to ${world?.name || 'your World'}.` });
    } catch (e: any) { setNote({ text: e?.message || 'Could not add that.', bad: true }); }
    finally { mark(ids, false); }
  };
  const skip = async (job: IntelSourceView, keys: string[], undo = false) => {
    const sk = srcKey(job);
    const ids = keys.map(k => `${sk}|${k}`);
    mark(ids, true);
    try { patchJob(sk, await skipInSource(job.kind, job.id, keys, undo)); }
    catch (e: any) { setNote({ text: e?.message || 'Could not save that.', bad: true }); }
    finally { mark(ids, false); }
  };
  const readAgain = async (job: IntelSourceView) => {
    try { await requestReadAgain(job.kind, job.id, job.videoOptions); setNote({ text: 'Reading it again. What you already added stays.' }); void load(); }
    catch (e: any) { setNote({ text: e?.message || 'Could not start a new reading.', bad: true }); }
  };
  const openDesk = (key: string) => { setDeskId(key); setView('desk'); };

  const ctx: Ctx = { jobs: jobs || [], ready, world, worlds: worlds || [], worldId, matches, busy, accept, skip, readAgain, openDesk, reload: async () => { await load(); setMatchTick(t => t + 1); }, notify: (text, bad) => setNote({ text, bad }) };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0d0c12] text-white font-sans">
      <header className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2.5 border-b border-white/10 bg-[#121119]">
        <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10" aria-label="Back to Tela"><ArrowLeft size={17} /></button>
        <Sparkles size={16} className="text-[#b9a4ff]" />
        <h1 className="text-[15px] font-bold mr-2">Story Intelligence</h1>
        <div role="tablist" className="flex rounded-lg bg-white/[.06] p-0.5">
          {([['inbox', 'Inbox', Inbox], ['desk', 'Desk', Clapperboard]] as const).map(([v, label, Icon]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`h-8 px-3 flex items-center gap-1.5 rounded-md text-[12.5px] font-semibold ${view === v ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <WorldPicker worlds={worlds} worldId={worldId} onChange={setWorldId} />
      </header>

      {loadError && <div className="px-5 py-2 text-[12.5px] text-amber-200 bg-amber-500/10 border-b border-amber-400/20">{loadError}</div>}
      {worlds && !worlds.length && (
        <div className="px-5 py-2 text-[12.5px] text-white/70 bg-white/[.04] border-b border-white/10">
          You don't have a World yet. Make one in Worlds, then come back to fill it from what you've published.
        </div>
      )}

      <div className="flex-1 min-h-0">
        {jobs === null
          ? <div className="h-full grid place-items-center text-white/50 text-sm"><Loader2 className="animate-spin" /></div>
          : !jobs.length
            ? <Empty />
            : view === 'inbox' ? <InboxView {...ctx} /> : <DeskView {...ctx} videoId={deskId} onPick={setDeskId} />}
      </div>

      {note && (
        <div role="status" className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[61] max-w-[min(520px,calc(100vw-32px))] px-4 py-2.5 rounded-xl text-[13px] shadow-2xl border ${note.bad ? 'bg-[#2a1616] border-red-400/30 text-red-100' : 'bg-[#17202a] border-emerald-400/30 text-emerald-50'}`}>
          {note.text}
        </div>
      )}
    </div>
  );
}

interface Ctx {
  jobs: IntelSourceView[];
  ready: IntelSourceView[];
  world: IPWorld | null;
  worlds: IPWorld[];
  worldId: string;
  reload: () => Promise<void>;
  notify: (text: string, bad?: boolean) => void;
  matches: Record<string, Record<string, WorldMatch>>;
  busy: Set<string>;
  accept: (job: IntelSourceView, items: Array<{ key: string; edits?: FindingEdits }>) => Promise<void>;
  skip: (job: IntelSourceView, keys: string[], undo?: boolean) => Promise<void>;
  readAgain: (job: IntelSourceView) => Promise<void>;
  openDesk: (key: string) => void;
}

const Empty = () => (
  <div className="h-full grid place-items-center p-6">
    <div className="max-w-md text-center grid gap-2">
      <Film className="mx-auto text-white/30" size={32} />
      <h2 className="text-lg font-bold">Nothing read yet</h2>
      <p className="text-[13px] text-white/60">Story Intelligence reads your Reello videos, films and albums: the people, places, dates and how they connect. Upload a video with Story Intelligence on, open a published video's Story tab, or run it on a film or album.</p>
    </div>
  </div>
);

function WorldPicker({ worlds, worldId, onChange }: { worlds: IPWorld[] | null; worldId: string; onChange: (id: string) => void }) {
  if (!worlds?.length) return null;
  return (
    <label className="flex items-center gap-2 text-[12px] text-white/60">
      <Globe2 size={14} className="text-[#b9a4ff]" /><span className="hidden sm:inline">Adding to</span>
      <select id="si-world" value={worldId} onChange={e => onChange(e.target.value)}
        className="h-8 max-w-[220px] rounded-lg bg-white/[.08] border border-white/15 px-2 text-[12.5px] font-semibold text-white">
        {worlds.map(w => <option key={w.id} value={w.id} className="bg-[#16151d]">{w.name || 'Untitled World'}</option>)}
      </select>
    </label>
  );
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

function InboxView({ jobs, ready, world, worlds, worldId, matches, busy, accept, skip, openDesk, reload, notify }: Ctx) {
  const [filter, setFilter] = useState<FindingKind | 'all'>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const rows = useMemo(() => ready.flatMap(job => job.findings
    .filter(f => f.kind !== 'product' && stateOf(f, job.filing) === 'NEW')
    .map(f => ({ job, f }))), [ready]);
  const shown = rows.filter(r => filter === 'all' || r.f.kind === filter)
    .sort((a, b) => (a.f.confidence === b.f.confidence ? 0 : a.f.confidence === 'high' ? -1 : 1));
  const counts = Object.fromEntries(KINDS.map(k => [k, rows.filter(r => r.f.kind === k).length])) as Record<FindingKind, number>;
  const high = rows.filter(r => r.f.confidence === 'high');
  const acceptHigh = async () => {
    const byJob = new Map<IntelSourceView, string[]>();
    for (const r of high) byJob.set(r.job, [...(byJob.get(r.job) || []), r.f.key]);
    for (const [job, keys] of byJob) await accept(job, keys.map(key => ({ key })));
  };
  const working = jobs.filter(j => j.status === 'WORKING');

  return (
    <div className="h-full grid lg:grid-cols-[minmax(0,1fr)_320px] min-h-0">
      <main className="min-h-0 overflow-y-auto px-3 sm:px-5 py-4 grid gap-3 content-start">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-bold mr-1">{rows.length ? `${rows.length} waiting for you` : 'All caught up'}</h2>
          <span className="flex-1" />
          {high.length > 0 && (
            <button disabled={!worldId} onClick={() => void acceptHigh()}
              className="h-8 px-3 rounded-lg text-[12.5px] font-bold bg-[#7c5cff] hover:brightness-110 disabled:opacity-40">
              Accept all {high.length} high-confidence
            </button>
          )}
        </div>
        <details className="lg:hidden rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
          <summary className="text-[12.5px] font-semibold cursor-pointer">Rules: what gets added on its own</summary>
          <div className="pt-2"><RulesCard worlds={worlds} worldId={worldId} reload={reload} notify={notify} /></div>
        </details>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Everything {rows.length}</Chip>
          {KINDS.filter(k => k !== 'product').map(k => (
            <Chip key={k} on={filter === k} onClick={() => setFilter(k)}><Dot kind={k} />{KIND[k].plural} {counts[k]}</Chip>
          ))}
        </div>
        {!shown.length && (
          <p className="text-[13px] text-white/55 py-8 text-center">
            {rows.length ? 'Nothing of this kind is waiting.' : 'Everything Story Intelligence found has been added or skipped. New videos, films and albums show up here once they\'re read.'}
          </p>
        )}
        {shown.map(({ job, f }) => {
          const id = `${srcKey(job)}|${f.key}`;
          const m = matches[srcKey(job)]?.[f.key];
          const firstT = f.moments[0]?.tSec;
          return (
            <article key={id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 rounded-xl border border-white/10 bg-white/[.03]">
              {f.stillUrl
                ? <img src={f.stillUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-[60px] rounded-lg object-cover bg-white/5" loading="lazy" />
                : <div className="w-16 h-16 sm:w-20 sm:h-[60px] rounded-lg grid place-items-center bg-white/5"><Dot kind={f.kind} size={12} /></div>}
              <div className="min-w-0 grid gap-1">
                <div className="flex items-start gap-2">
                  <span className="mt-[7px]"><Dot kind={f.kind} /></span>
                  <p className="text-[14px] text-white/85 min-w-0">{proposalLine(f, m)}</p>
                </div>
                <p className="text-[12.5px] text-white/60">{f.why}{f.moments.find(x => x.text) ? <> <span className="text-white/75">{f.moments.find(x => x.text)!.text}</span></> : null}</p>
                <p className="text-[11.5px] text-white/45">
                  <span className="inline-flex items-center gap-1 align-[-1px]"><SourceIcon kind={job.kind} size={11} />{job.title}</span>{firstT != null ? ` · ${clock(firstT)}` : ''} · {f.confidence === 'high' ? 'High' : 'Medium'} confidence
                  {m?.by === 'name' && <span className="text-[#b9a4ff]"> · Same name already in {world?.name || 'this World'}</span>}
                </p>
                {editing === id
                  ? <EditForm f={f} onCancel={() => setEditing(null)} onSave={async edits => { await accept(job, [{ key: f.key, edits }]); setEditing(null); }} busy={busy.has(id)} />
                  : (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Btn primary disabled={!worldId || busy.has(id)} onClick={() => void accept(job, [{ key: f.key }])}>{busy.has(id) ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Accept</Btn>
                      {f.kind !== 'asset' && f.kind !== 'relation' && <Btn disabled={!worldId || busy.has(id)} onClick={() => setEditing(id)}><Pencil size={13} />Edit first</Btn>}
                      <Btn ghost disabled={busy.has(id)} onClick={() => void skip(job, [f.key])}>Skip</Btn>
                      <Btn ghost onClick={() => openDesk(srcKey(job))}>Open in Desk<ChevronRight size={13} /></Btn>
                    </div>
                  )}
              </div>
            </article>
          );
        })}
      </main>

      <aside className="hidden lg:grid content-start gap-4 p-4 border-l border-white/10 bg-[#121119] overflow-y-auto">
        <section className="grid gap-2">
          <h3 className="text-[11px] uppercase tracking-[.08em] text-white/50 font-semibold">Waiting</h3>
          <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
            {KINDS.filter(k => counts[k]).map(k => <i key={k} style={{ width: `${(counts[k] / Math.max(1, rows.length)) * 100}%`, background: KIND[k].color }} />)}
          </div>
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 text-[12.5px] items-center">
            {KINDS.filter(k => k !== 'product').map(k => <React.Fragment key={k}><Dot kind={k} /><span className="text-white/75">{KIND[k].plural}</span><span className="tabular-nums text-white/60">{counts[k]}</span></React.Fragment>)}
          </div>
        </section>
        <RulesCard worlds={worlds} worldId={worldId} reload={reload} notify={notify} />
        <section className="grid gap-2">
          <h3 className="text-[11px] uppercase tracking-[.08em] text-white/50 font-semibold">Readings</h3>
          {[...ready, ...working].slice(0, 30).map(j => {
            const waiting = j.findings.filter(f => f.kind !== 'product' && stateOf(f, j.filing) === 'NEW').length;
            return (
              <button key={srcKey(j)} onClick={() => openDesk(srcKey(j))} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 items-center text-left p-1.5 rounded-lg hover:bg-white/[.06]">
                <Thumb job={j} />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold truncate">{j.title}</span>
                  <span className="flex items-center gap-1 text-[11.5px] text-white/50"><SourceIcon kind={j.kind} size={11} />{SOURCE_WORD[j.kind]} · {j.status === 'WORKING' ? `Reading${j.pct != null ? ` · ${j.pct}%` : ''}` : waiting ? `${waiting} waiting` : 'Done'}</span>
                </span>
              </button>
            );
          })}
        </section>
      </aside>
    </div>
  );
}

// ── Desk ──────────────────────────────────────────────────────────────────────

function DeskView({ jobs, world, worldId, matches, busy, accept, skip, readAgain, videoId, onPick }: Ctx & { videoId: string | null; onPick: (id: string) => void }) {
  const sorted = useMemo(() => [...jobs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [jobs]);
  const job = sorted.find(j => srcKey(j) === videoId) || sorted.find(j => j.status === 'READY') || sorted[0];
  const [tab, setTab] = useState<FindingKind | 'all'>('all');
  const [selKey, setSelKey] = useState<string | null>(null);
  const [frameT, setFrameT] = useState(0);
  // Where the player should be: bumping n re-seeks even to the same second.
  const [seek, setSeek] = useState({ t: 0, n: 0 });
  const jump = (t: number) => { setFrameT(t); setSeek(s => ({ t, n: s.n + 1 })); };
  useEffect(() => { setSelKey(null); setFrameT(0); setSeek({ t: 0, n: 0 }); }, [job && srcKey(job)]); // eslint-disable-line react-hooks/exhaustive-deps

  const findings = job?.findings || [];
  const sel = findings.find(f => f.key === selKey) || findings[0];
  useEffect(() => { if (sel?.moments[0]) jump(sel.moments[0].tSec); }, [sel?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const playback = job?.playbackId;
  const dur = Math.max(1, Number(job?.durationSec || 0), ...findings.flatMap(f => f.moments.map(m => m.tSec + 10)));
  const oldReading = job?.oldReading;
  const openHref = job ? (job.kind === 'video' ? `/share?type=video&id=${encodeURIComponent(job.id)}${frameT > 0 ? `&t=${Math.floor(frameT)}` : ''}` : `/share?type=album&id=${encodeURIComponent(job.id)}`) : '#';
  const shown = findings.filter(f => tab === 'all' || f.kind === tab);

  return (
    <div className="h-full grid content-start xl:content-stretch md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_320px] overflow-y-auto xl:overflow-hidden xl:min-h-0">
      <aside className="xl:min-h-0 overflow-x-auto md:overflow-x-visible xl:overflow-y-auto border-b md:border-b-0 md:border-r border-white/10 p-2.5 flex md:grid gap-1.5 content-start">
        <h3 className="hidden md:block text-[11px] uppercase tracking-[.08em] text-white/50 font-semibold px-1.5 pt-1">What it has read</h3>
        {sorted.map(j => {
          const fs = j.findings;
          const filed = fs.filter(f => stateOf(f, j.filing) === 'FILED').length;
          return (
            <button key={srcKey(j)} onClick={() => onPick(srcKey(j))}
              className={`flex-none w-[200px] md:w-auto grid grid-cols-[60px_minmax(0,1fr)] gap-2 items-center text-left p-1.5 rounded-lg ${job && srcKey(j) === srcKey(job) ? 'bg-[#7c5cff]/20' : 'hover:bg-white/[.06]'}`}>
              <Thumb job={j} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold leading-tight line-clamp-2">{j.title}</span>
                <span className="flex items-center gap-1 text-[11px] text-white/50 mt-0.5"><SourceIcon kind={j.kind} size={11} />
                  {j.status === 'WORKING' ? `Reading${j.pct != null ? ` · ${j.pct}%` : ''}` : j.status === 'FAILED' ? 'Reading failed' : j.status === 'SKIPPED' ? 'Not read' : `${fs.length} findings · ${filed} added`}
                </span>
              </span>
            </button>
          );
        })}
      </aside>

      {!job || job.status !== 'READY' || !job.findings.length ? (
        <div className="grid place-items-center p-6 text-center text-[13px] text-white/60 xl:col-span-2">
          {job?.status === 'WORKING' ? <span className="flex items-center gap-2"><Loader2 size={15} className="animate-spin" />{job.stage || 'Reading'}{job.pct != null ? ` · ${job.pct}%` : ''}</span>
            : job?.status === 'READY' ? <span>{job.error || 'Nothing to add from this one.'}</span>
            : job?.status === 'FAILED' ? <span>Story Intelligence couldn't read this one. {job.error}</span>
              : 'Pick a video.'}
        </div>
      ) : (
        <>
          <section className="xl:min-h-0 min-w-0 flex flex-col">
            <div className="p-3 sm:p-4 grid gap-3 border-b border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/50"><SourceIcon kind={job.kind} size={14} /></span>
                <h2 className="text-[16px] font-bold min-w-0 truncate">{job.title}</h2>
                <span className="flex-1" />
                <a href={openHref} target="_blank" rel="noreferrer" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[12.5px] font-semibold bg-white/[.08] hover:bg-white/15"><ExternalLink size={13} />Open</a>
                <Btn onClick={() => void readAgain(job)}><RefreshCw size={13} />Read again</Btn>
              </div>
              {oldReading && <p className="text-[12.5px] text-amber-100/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">This was read before Story Intelligence looked for people, places and dates. People come from quote speakers and lore from topics. Read it again to find the rest; anything you've added stays.</p>}
              {playback
                ? <DeskPlayer playbackId={playback} poster={job.thumbUrl} seek={seek} onTime={setFrameT} />
                : (
                  <div className="relative aspect-[21/9] max-h-[240px] rounded-lg overflow-hidden bg-black grid place-items-center">
                    {job.thumbUrl ? <img src={job.thumbUrl} alt="" className="h-full object-contain" /> : <span className="text-white/30 text-xs">No preview</span>}
                  </div>
                )}
              <span className="text-[11px] font-mono text-white/50 tabular-nums -mt-1">{clock(frameT)} / {clock(dur)}</span>
              <div className="grid gap-1.5">
                {KINDS.map(k => {
                  const fk = findings.filter(f => f.kind === k && f.moments.length);
                  if (!fk.length) return null;
                  return (
                    <div key={k} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 items-center text-[11px] text-white/55">
                      <span className="truncate">{KIND[k].plural}</span>
                      <div className="relative h-4 rounded bg-white/[.06]">
                        {fk.flatMap(f => f.moments.slice(0, 12).map((m, i) => (
                          <button key={`${f.key}-${i}`} title={`${f.title} · ${clock(m.tSec)}`} aria-label={`${f.title} at ${clock(m.tSec)}`}
                            onClick={() => { setSelKey(f.key); jump(m.tSec); }}
                            className={`absolute top-0.5 h-3 w-1.5 rounded-sm ${sel?.key === f.key ? 'ring-2 ring-white' : ''}`}
                            style={{ left: `calc(${Math.min(99, (m.tSec / dur) * 100)}% - 3px)`, background: KIND[k].color }} />
                        )))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-0.5 px-3 border-b border-white/10 overflow-x-auto">
              {(['all', ...KINDS] as const).map(k => {
                const n = k === 'all' ? findings.length : findings.filter(f => f.kind === k).length;
                if (k !== 'all' && !n) return null;
                return (
                  <button key={k} onClick={() => setTab(k)} className={`px-2.5 py-2 text-[12.5px] font-semibold whitespace-nowrap border-b-2 ${tab === k ? 'border-[#7c5cff] text-white' : 'border-transparent text-white/55 hover:text-white'}`}>
                    {k === 'all' ? 'All' : KIND[k].plural} {n}
                  </button>
                );
              })}
            </div>
            <div className="xl:flex-1 min-h-[220px] xl:overflow-y-auto p-3 grid gap-1.5 content-start">
              {shown.map(f => {
                const st = stateOf(f, job.filing);
                return (
                  <button key={f.key} onClick={() => setSelKey(f.key)}
                    className={`grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2.5 items-center text-left px-3 py-2 rounded-lg border ${sel?.key === f.key ? 'border-[#7c5cff] bg-[#7c5cff]/10' : 'border-white/10 hover:border-white/25'}`}>
                    <Dot kind={f.kind} />
                    <span className="min-w-0"><span className="block text-[13px] font-semibold truncate">{f.title}</span><span className="block text-[12px] text-white/50 truncate">{f.summary}</span></span>
                    <StateTag state={st} auto={!!job.filing?.[f.key]?.auto} />
                  </button>
                );
              })}
            </div>
          </section>

          {sel && (
            <Inspector key={`${srcKey(job)}|${sel.key}`} job={job} f={sel} world={world} worldId={worldId} match={matches[srcKey(job)]?.[sel.key]}
              busy={busy.has(`${srcKey(job)}|${sel.key}`)} accept={accept} skip={skip} onSeek={jump} />
          )}
        </>
      )}
    </div>
  );
}

function Inspector({ job, f, world, worldId, match, busy, accept, skip, onSeek }: {
  job: IntelSourceView; f: Finding; world: IPWorld | null; worldId: string; match?: WorldMatch; busy: boolean;
  accept: Ctx['accept']; skip: Ctx['skip']; onSeek: (t: number) => void;
}) {
  const st = stateOf(f, job.filing);
  const [title, setTitle] = useState(f.title);
  const [summary, setSummary] = useState(f.summary);
  const [year, setYear] = useState(String(f.year ?? ''));
  const edits = (): FindingEdits => ({
    ...(title !== f.title ? { title } : {}), ...(summary !== f.summary ? { summary } : {}),
    ...(f.kind === 'timeline' && /^-?\d{1,4}$/.test(year) && +year !== f.year ? { year: +year } : {}),
  });
  const editable = f.kind === 'character' || f.kind === 'lore' || f.kind === 'timeline';
  return (
    <aside className="md:col-span-2 xl:col-span-1 xl:min-h-0 xl:overflow-y-auto border-t xl:border-t-0 xl:border-l border-white/10 bg-[#121119] p-4 grid gap-3.5 content-start">
      <div className="flex items-center gap-3">
        {f.stillUrl ? <img src={f.stillUrl} alt="" className={`w-12 h-12 object-cover ${f.kind === 'character' ? 'rounded-full' : 'rounded-lg'}`} /> : <Dot kind={f.kind} size={14} />}
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[.08em] font-semibold" style={{ color: KIND[f.kind].color }}>{KIND[f.kind].label}{f.role && f.kind === 'character' ? ` · ${f.role}` : ''}</div>
          <h3 className="text-[16px] font-bold leading-tight">{f.title}</h3>
        </div>
      </div>
      {editable && (
        <>
          <Field label={f.kind === 'character' ? 'Name in the World' : 'Title in the World'}>
            <input id="si-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={190} className="w-full h-9 rounded-lg bg-white/[.06] border border-white/15 px-2.5 text-[13px]" />
          </Field>
          <Field label={f.kind === 'character' ? 'Bio' : 'Description'}>
            <textarea id="si-summary" value={summary} onChange={e => setSummary(e.target.value)} rows={3} maxLength={4800} className="w-full rounded-lg bg-white/[.06] border border-white/15 px-2.5 py-2 text-[13px] resize-y" />
          </Field>
          {f.kind === 'timeline' && (
            <Field label="Year on the timeline">
              <input id="si-year" value={year} onChange={e => setYear(e.target.value.replace(/[^\d-]/g, '').slice(0, 5))} inputMode="numeric" className="w-28 h-9 rounded-lg bg-white/[.06] border border-white/15 px-2.5 text-[13px] tabular-nums" />
            </Field>
          )}
        </>
      )}
      {editable && (st === 'FILED' ? !!job.filing?.[f.key]?.merged : match?.by === 'name') && (
        <p className="text-[12px] text-white/50 -mt-1.5">This is already in the World. Leave these as they are to keep what it says there; anything you change here replaces it.</p>
      )}
      {!editable && <p className="text-[13px] text-white/70">{f.kind === 'relation' ? <>{f.summary}. {f.why}</> : f.summary}</p>}
      {f.moments.length > 0 && (
        <Field label="Where it came from">
          <div className="grid gap-1">
            {f.moments.slice(0, 8).map((m, i) => (
              <button key={i} onClick={() => onSeek(m.tSec)} className="flex gap-2 text-left text-[12.5px] hover:bg-white/[.05] rounded px-1 py-0.5">
                <span className="font-mono text-[#b9a4ff] tabular-nums">{clock(m.tSec)}</span>
                <span className="text-white/70 min-w-0">{m.text || (i === 0 ? 'First appears' : 'Appears again')}</span>
              </button>
            ))}
          </div>
        </Field>
      )}
      <div className="grid gap-1 p-3 rounded-lg border border-dashed border-white/15">
        <span className="text-[11px] uppercase tracking-[.08em] text-white/50 font-semibold">Goes to</span>
        {f.kind === 'product'
          ? <><b className="text-[13px]">Your store</b><span className="text-[12px] text-white/55">{f.storeState}. Manage it from the video's Story tab.</span></>
          : <><b className="text-[13px]">{world?.name || 'Pick a World'}</b>
            <span className="text-[12px] text-white/55">
              {st === 'FILED' ? (job.filing?.[f.key]?.merged ? 'Added to an entry that was already there.' : f.kind === 'relation' ? 'Linked in the World\'s graph.' : 'Added. Not public until you publish it in Worlds.')
                : f.kind === 'relation' ? (match ? 'Both are in this World; this links them.' : 'Adds whichever of the two isn\'t in the World yet, then links them.')
                : match?.by === 'name' ? `Joins "${match.name}", already in this World, with these moments.`
                  : match?.by === 'source' ? 'Updates the entry made from this before.'
                    : `A new ${KIND[f.kind].label.toLowerCase()}, kept private until you publish it in Worlds.`}
            </span></>}
      </div>
      {f.kind !== 'product' && !(st === 'FILED' && (f.kind === 'relation' || f.kind === 'asset')) && (
        <div className="flex flex-wrap gap-1.5">
          {st === 'SKIPPED'
            ? <Btn disabled={busy} onClick={() => void skip(job, [f.key], true)}><Undo2 size={13} />Bring back</Btn>
            : <>
              <Btn primary disabled={!worldId || busy} onClick={() => void accept(job, [{ key: f.key, edits: edits() }])}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{st === 'FILED' ? 'Update in World' : 'Add to World'}
              </Btn>
              {st !== 'FILED' && <Btn ghost disabled={busy} onClick={() => void skip(job, [f.key])}><X size={13} />Skip</Btn>}
            </>}
        </div>
      )}
    </aside>
  );
}

// ── Rules ─────────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<RuleMode, string> = { ask: 'Ask me', known: 'Only if already in the World', all: 'Add when sure' };

function RulesCard({ worlds, worldId, reload, notify }: { worlds: IPWorld[]; worldId: string; reload: () => Promise<void>; notify: (t: string, bad?: boolean) => void }) {
  const [rules, setRules] = useState<StoryIntelRules | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void getIntelRules().then(setRules).catch(() => setRules(DEFAULT_RULES)); }, []);
  if (!rules) return null;
  const target = rules.worldId || worldId;
  const nameOf = (id: string) => worlds.find(w => w.id === id)?.name || 'your World';
  const save = async (next: StoryIntelRules) => {
    setRules(next); setSaving(true);
    try {
      const r = await saveIntelRules({ ...next, worldId: next.worldId || worldId });
      setRules(r.rules);
      if (r.applied) { notify(`Rules added ${r.applied} ${r.applied === 1 ? 'thing' : 'things'} to ${nameOf(r.rules.worldId)}.`); await reload(); }
    } catch (e: any) { notify(e?.message || 'Could not save the rules.', true); }
    finally { setSaving(false); }
  };
  return (
    <section className="grid gap-2.5 p-3 rounded-xl border border-white/10 bg-white/[.03]">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-bold flex-1">Rules</h3>
        {saving && <Loader2 size={13} className="animate-spin text-white/50" />}
        <label className="flex items-center gap-1.5 text-[12px] text-white/70">
          <input id="si-rules-on" type="checkbox" checked={rules.enabled} disabled={!target} onChange={e => void save({ ...rules, enabled: e.target.checked, worldId: target })} className="accent-[#7c5cff]" />
          On
        </label>
      </div>
      <p className="text-[12px] text-white/55">
        {rules.enabled
          ? <>New readings add these to <b className="text-white/80">{nameOf(rules.worldId)}</b> on their own. Everything else waits here.</>
          : 'Off: everything waits here for you.'}
      </p>
      <div className="grid gap-1.5">
        {RULE_KINDS.map(k => (
          <label key={k} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 items-center text-[12px]">
            <Dot kind={k} />
            <span className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-white/75 truncate">{KIND[k].plural}</span>
              <select id={`si-rule-${k}`} value={rules.modes[k]} onChange={e => void save({ ...rules, modes: { ...rules.modes, [k]: e.target.value as RuleMode } })}
                className="h-7 max-w-[60%] rounded-md bg-white/[.08] border border-white/15 px-1.5 text-[11.5px]">
                {(['ask', 'known', 'all'] as RuleMode[]).map(m => <option key={m} value={m} className="bg-[#16151d]">{MODE_LABEL[m]}</option>)}
              </select>
            </span>
          </label>
        ))}
      </div>
      {rules.enabled && worldId && rules.worldId !== worldId && (
        <button onClick={() => void save({ ...rules, worldId })} className="justify-self-start text-[12px] font-semibold text-[#b9a4ff] hover:underline">Use {nameOf(worldId)} instead</button>
      )}
    </section>
  );
}

// ── Small parts ───────────────────────────────────────────────────────────────

function EditForm({ f, onSave, onCancel, busy }: { f: Finding; onSave: (e: FindingEdits) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const [title, setTitle] = useState(f.title);
  const [summary, setSummary] = useState(f.summary);
  const [year, setYear] = useState(String(f.year ?? ''));
  return (
    <form className="grid gap-2 mt-1" onSubmit={e => {
      e.preventDefault();
      // Only what was changed: untouched fields must never replace what's already in the World.
      void onSave({ ...(title !== f.title ? { title } : {}), ...(summary !== f.summary ? { summary } : {}), ...(f.kind === 'timeline' && /^-?\d{1,4}$/.test(year) && +year !== f.year ? { year: +year } : {}) });
    }}>
      <input id={`si-e-title-${f.key}`} value={title} onChange={e => setTitle(e.target.value)} maxLength={190} aria-label="Name" className="h-9 rounded-lg bg-white/[.06] border border-white/15 px-2.5 text-[13px]" />
      <textarea id={`si-e-sum-${f.key}`} value={summary} onChange={e => setSummary(e.target.value)} rows={2} maxLength={4800} aria-label="Description" className="rounded-lg bg-white/[.06] border border-white/15 px-2.5 py-2 text-[13px]" />
      {f.kind === 'timeline' && <input id={`si-e-year-${f.key}`} value={year} onChange={e => setYear(e.target.value.replace(/[^\d-]/g, '').slice(0, 5))} aria-label="Year" inputMode="numeric" className="w-28 h-9 rounded-lg bg-white/[.06] border border-white/15 px-2.5 text-[13px]" />}
      <div className="flex gap-1.5">
        <Btn primary type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Add to World</Btn>
        <Btn ghost onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

function Thumb({ job }: { job: IntelSourceView }) {
  const url = job.thumbUrl;
  return url
    ? <img src={url} alt="" className="w-full aspect-video rounded-md object-cover bg-white/5" loading="lazy" />
    : <div className="w-full aspect-video rounded-md bg-gradient-to-br from-[#3b2a55] to-[#1d2a4a]" />;
}

function StateTag({ state, auto }: { state: ReturnType<typeof stateOf>; auto?: boolean }) {
  const [t, c] = state === 'FILED' ? [auto ? 'Added by rule' : 'In World', 'text-emerald-300'] : state === 'SKIPPED' ? ['Skipped', 'text-white/40'] : state === 'STORE' ? ['Store', 'text-white/50'] : ['New', 'text-[#b9a4ff]'];
  return <span className={`text-[11px] font-semibold ${c}`}>{t}</span>;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid gap-1"><span className="text-[11px] uppercase tracking-[.08em] text-white/50 font-semibold">{label}</span>{children}</div>
);

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button onClick={onClick} className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold border ${on ? 'bg-[#7c5cff]/25 border-[#7c5cff] text-white' : 'bg-white/[.04] border-white/12 text-white/70 hover:text-white'}`}>{children}</button>
);

function Btn({ primary, ghost, disabled, onClick, children, type = 'button' }: { primary?: boolean; ghost?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; type?: 'button' | 'submit' }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[12.5px] font-semibold disabled:opacity-40 ${primary ? 'bg-[#7c5cff] hover:brightness-110 text-white' : ghost ? 'text-white/70 hover:text-white hover:bg-white/[.06]' : 'bg-white/[.08] hover:bg-white/15 text-white'}`}>
      {children}
    </button>
  );
}
