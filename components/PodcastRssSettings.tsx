import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Rss, Link2, Check, AlertCircle, RefreshCw, Play, Pause,
  Download, Copy, Radio, ExternalLink, ChevronDown,
  Clock, Calendar, Mic2, Globe, RotateCcw, Loader2,
  Music, BookOpen, Info,
} from 'lucide-react';
import {
  auth,
  savePodcastRssSettings,
  fetchPodcastRssSettings,
  syncImportedEpisodes,
  fetchImportedEpisodes,
  fetchUserAlbums,
  backfillMyAlbumArtistIds,
} from '../services/backendService';
import { fetchAndParseRss, validateRssUrl } from '../services/podcastRssImporter';
import { generatePodcastRSS, PODCAST_DIRECTORIES } from '../services/podcastRSSService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import type { ImportedRssEpisode, PodcastRssSettings as PodcastRssSettingsType, Album, Track } from '../types';
import { validatePodcast20Settings } from '../services/podcast20/validate';
import { PODCAST_MEDIUMS, type Podcast20Settings, type ValueRecipient, type LiveItemSettings, type PodcastPerson, type FundingLink, type Chapter } from '../services/podcast20/types';

type InnerTab = 'import' | 'episodes' | 'distribute';

// ── Podcasting 2.0 (server-backed: /api/podcast20/:albumId/settings) ─────────

interface Podcast20View {
  settings: Podcast20Settings;
  feedUrl: string;
  guid: string;
  feedStatus: string;
  publicTrackIds: string[];
  podcastIndexConfigured: boolean;
}

const FEED_STATUS_COPY: Record<string, string> = {
  public: 'Public: podcast apps and Podcast Index can read this feed',
  draft: 'Draft albums have no public feed',
  private: 'Private albums have no public feed',
  removed: 'This album is on hold and has no public feed',
  paywalled: 'Paid albums have no public feed',
  unreleased: 'The feed goes live on the release date',
  not_a_feed: 'Turn on "Publish as a podcast feed" to open a feed for this album',
  not_found: 'Album not found',
};

const p20Input = 'w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-orange-500/40 transition-colors';
const p20Label = 'text-[8px] font-black uppercase tracking-widest text-white/25 block mb-1';
const p20Btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/6 text-white/40 hover:text-white transition-all';

async function p20Fetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { errors: data?.errors as string[] | undefined });
  return data;
}

/** "0:00 Intro" / "1:02:03 Q&A" lines ⇄ chapters. */
function parseChapterLines(text: string): Chapter[] {
  const out: Chapter[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+(?::\d{1,2}){0,2}(?:\.\d+)?)\s+(.*)$/.exec(line);
    if (!m) continue;
    const parts = m[1].split(':').map(Number);
    const sec = parts.reduce((acc, n) => acc * 60 + n, 0);
    out.push({ startTime: sec, ...(m[2].trim() ? { title: m[2].trim() } : {}) });
  }
  return out;
}
function chapterLines(ch?: Chapter[]): string {
  return (ch ?? []).map(c => {
    const s = Math.floor(c.startTime);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const t = h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
    return `${t} ${c.title ?? ''}`.trim();
  }).join('\n');
}
const toLocalInput = (ms?: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (s: string) => (s ? new Date(s).getTime() : 0);

function Podcast20Section({ album, onView }: { album: Album; onView: (v: Podcast20View | null) => void }) {
  const [view, setView] = useState<Podcast20View | null>(null);
  const [draft, setDraft] = useState<Podcast20Settings>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [notifyMsg, setNotifyMsg] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError(''); setErrors([]); setView(null); onView(null);
    p20Fetch(`/api/podcast20/${encodeURIComponent(album.id)}/settings`)
      .then((v: Podcast20View) => { if (!alive) return; setView(v); setDraft(v.settings ?? {}); onView(v); })
      .catch((e: Error) => { if (alive) setLoadError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    setEpisodeId(album.tracks?.[0]?.id ?? '');
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.id]);

  const patch = (p: Partial<Podcast20Settings>) => setDraft(d => ({ ...d, ...p }));
  const recipients: ValueRecipient[] = draft.value?.recipients ?? [];
  const setRecipients = (r: ValueRecipient[]) => patch({ value: r.length ? { type: 'lightning', method: 'keysend', ...(draft.value?.suggested ? { suggested: draft.value.suggested } : {}), recipients: r } : undefined });
  const splitTotal = recipients.filter(r => !r.fee).reduce((s, r) => s + (Number(r.split) || 0), 0);
  const funding: FundingLink[] = draft.funding ?? [];
  const persons: PodcastPerson[] = draft.persons ?? [];
  const live: LiveItemSettings[] = draft.liveItems ?? [];
  const ep = (draft.episodes ?? {})[episodeId] ?? {};
  const setEp = (p: Record<string, unknown>) => {
    const next = { ...ep, ...p } as Record<string, unknown>;
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const all = { ...(draft.episodes ?? {}) } as Record<string, any>;
    if (Object.keys(next).length) all[episodeId] = next; else delete all[episodeId];
    patch({ episodes: all });
  };
  const localCheck = validatePodcast20Settings(draft, { trackIds: (album.tracks ?? []).map(t => t.id) });

  const save = async () => {
    if (!localCheck.ok) { setErrors(localCheck.errors); return; }
    setSaving(true); setErrors([]);
    try {
      const v = await p20Fetch(`/api/podcast20/${encodeURIComponent(album.id)}/settings`, { method: 'PUT', body: JSON.stringify({ settings: draft }) });
      setView(v); setDraft(v.settings ?? {}); onView(v);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      if (v.podcastIndex) setNotifyMsg(v.podcastIndex.ok ? 'Podcast Index notified' : 'Saved; Podcast Index did not accept the update');
    } catch (e: any) {
      setErrors(e.errors?.length ? e.errors : [e.message]);
    } finally { setSaving(false); }
  };

  const notify = async (add: boolean) => {
    setNotifyMsg('');
    try {
      const r = await p20Fetch(`/api/podcast20/${encodeURIComponent(album.id)}/notify`, { method: 'POST', body: JSON.stringify({ add }) });
      setNotifyMsg(r.skipped === 'not_configured' ? 'Podcast Index keys are not set up on this server' : r.ok ? (r.added ? 'Submitted to Podcast Index' : 'Podcast Index notified') : (r.description || 'Podcast Index did not accept the update'));
    } catch (e: any) { setNotifyMsg(e.message); }
  };

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-5">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Podcasting 2.0</p>
          <p className="text-[10px] text-white/20 mt-1">
            Value-for-value, chapters, transcripts, live items and comments for Fountain, Podverse, Castamatic and Podcast Index.
          </p>
        </div>
        <ChevronDown size={14} className={`text-white/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {loading && <div className="flex items-center gap-2 text-white/30 text-xs"><Loader2 size={13} className="animate-spin" /> Loading feed settings…</div>}
      {loadError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
          <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{loadError}</p>
        </div>
      )}

      {view && (
        <div className={`flex items-start gap-2 p-3 rounded-xl border ${view.feedStatus === 'public' ? 'bg-green-500/8 border-green-500/20' : 'bg-yellow-400/[0.06] border-yellow-400/15'}`}>
          {view.feedStatus === 'public' ? <Check size={12} className="text-green-400 shrink-0 mt-0.5" /> : <Info size={12} className="text-yellow-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <p className="text-[10px] text-white/50">{FEED_STATUS_COPY[view.feedStatus] ?? view.feedStatus}</p>
            <p className="text-[9px] text-white/25 mt-1 font-mono truncate">podcast:guid {view.guid}</p>
            {view.feedStatus === 'public' && <p className="text-[9px] text-white/25 mt-0.5">{view.publicTrackIds.length} episode{view.publicTrackIds.length === 1 ? '' : 's'} in the public feed (paid, held and unreleased ones stay out)</p>}
          </div>
        </div>
      )}

      {view && open && (
        <div className="space-y-6">
          {/* Show basics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs text-white/60 md:col-span-2">
              <input type="checkbox" checked={!!draft.enabled} onChange={e => patch({ enabled: e.target.checked })} className="accent-orange-500" />
              Publish as a podcast feed (needed for music albums; podcast albums are on already)
            </label>
            <div>
              <span className={p20Label}>Medium</span>
              <select value={draft.medium ?? ''} onChange={e => patch({ medium: (e.target.value || undefined) as Podcast20Settings['medium'] })} className={p20Input}>
                <option value="">Not set (podcast)</option>
                {PODCAST_MEDIUMS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <span className={p20Label}>Lock against imports</span>
              <div className="flex gap-2">
                <select value={draft.locked === undefined ? '' : draft.locked ? 'yes' : 'no'} onChange={e => patch({ locked: e.target.value === '' ? undefined : e.target.value === 'yes' })} className={`${p20Input} w-24`}>
                  <option value="">Off</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
                <input value={draft.lockedOwner ?? ''} onChange={e => patch({ lockedOwner: e.target.value || undefined })} placeholder="owner email" className={p20Input} />
              </div>
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <span className={p20Label}>Location</span>
                <input value={draft.location?.name ?? ''} onChange={e => patch({ location: { ...(draft.location ?? { name: '' }), name: e.target.value } })} placeholder="Austin, TX" className={p20Input} />
              </div>
              <div>
                <span className={p20Label}>Geo</span>
                <input value={draft.location?.geo ?? ''} onChange={e => patch({ location: { ...(draft.location ?? { name: '' }), geo: e.target.value || undefined } })} placeholder="geo:30.2672,-97.7431" className={p20Input} />
              </div>
              <div>
                <span className={p20Label}>OSM</span>
                <input value={draft.location?.osm ?? ''} onChange={e => patch({ location: { ...(draft.location ?? { name: '' }), osm: e.target.value || undefined } })} placeholder="R113314" className={p20Input} />
              </div>
            </div>
          </div>

          {/* Value for value */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={p20Label}>Value for value (Lightning)</span>
              <span className={`text-[9px] font-black ${recipients.length && Math.abs(splitTotal - 100) > 0.001 ? 'text-red-400' : 'text-white/30'}`}>
                {recipients.length ? `Splits: ${+splitTotal.toFixed(3)} / 100` : ''}
              </span>
            </div>
            <p className="text-[9px] text-white/20 leading-relaxed">
              Listeners' apps stream sats straight to each recipient's own node or Lightning address. Plajah never holds these payments and takes no share.
            </p>
            {recipients.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input value={r.name} onChange={e => setRecipients(recipients.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className={`${p20Input} col-span-3`} />
                <select value={r.type} onChange={e => setRecipients(recipients.map((x, j) => j === i ? { ...x, type: e.target.value as ValueRecipient['type'] } : x))} className={`${p20Input} col-span-2`}>
                  <option value="lnaddress">LN address</option><option value="node">Node key</option>
                </select>
                <input value={r.address} onChange={e => setRecipients(recipients.map((x, j) => j === i ? { ...x, address: e.target.value.trim() } : x))} placeholder={r.type === 'node' ? '03… (66 hex)' : 'name@wallet.com'} className={`${p20Input} col-span-4 font-mono`} />
                <input type="number" min={0} max={100} step="any" value={r.split} onChange={e => setRecipients(recipients.map((x, j) => j === i ? { ...x, split: Number(e.target.value) } : x))} className={`${p20Input} col-span-2`} />
                <button onClick={() => setRecipients(recipients.filter((_, j) => j !== i))} className="col-span-1 text-white/25 hover:text-red-400 text-xs font-black">✕</button>
                {r.type === 'node' && (
                  <div className="col-span-12 grid grid-cols-2 gap-2">
                    <input value={r.customKey ?? ''} onChange={e => setRecipients(recipients.map((x, j) => j === i ? { ...x, customKey: e.target.value || undefined } : x))} placeholder="customKey (optional, e.g. 696969)" className={p20Input} />
                    <input value={r.customValue ?? ''} onChange={e => setRecipients(recipients.map((x, j) => j === i ? { ...x, customValue: e.target.value || undefined } : x))} placeholder="customValue (optional)" className={p20Input} />
                  </div>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={() => setRecipients([...recipients, { name: '', type: 'lnaddress', address: '', split: recipients.length ? 0 : 100 }])} className={p20Btn}>+ Recipient</button>
              {recipients.length > 0 && (
                <input value={draft.value?.suggested ?? ''} onChange={e => patch({ value: { ...(draft.value ?? { type: 'lightning', method: 'keysend', recipients }), suggested: e.target.value || undefined } })} placeholder="Suggested BTC/min (0.00000005000)" className={`${p20Input} max-w-xs`} />
              )}
            </div>
          </div>

          {/* Funding + people */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <span className={p20Label}>Funding links</span>
              {funding.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input value={f.url} onChange={e => patch({ funding: funding.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} placeholder="https://…" className={p20Input} />
                  <input value={f.label ?? ''} onChange={e => patch({ funding: funding.map((x, j) => j === i ? { ...x, label: e.target.value || undefined } : x) })} placeholder="Label" className={`${p20Input} w-28`} />
                  <button onClick={() => patch({ funding: funding.filter((_, j) => j !== i) })} className="text-white/25 hover:text-red-400 text-xs font-black">✕</button>
                </div>
              ))}
              <button onClick={() => patch({ funding: [...funding, { url: '' }] })} className={p20Btn}>+ Funding link</button>
            </div>
            <div className="space-y-2">
              <span className={p20Label}>People</span>
              {persons.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input value={p.name} onChange={e => patch({ persons: persons.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="Name" className={p20Input} />
                  <input value={p.role ?? ''} onChange={e => patch({ persons: persons.map((x, j) => j === i ? { ...x, role: e.target.value || undefined } : x) })} placeholder="host / guest" className={`${p20Input} w-28`} />
                  <button onClick={() => patch({ persons: persons.filter((_, j) => j !== i) })} className="text-white/25 hover:text-red-400 text-xs font-black">✕</button>
                </div>
              ))}
              <button onClick={() => patch({ persons: [...persons, { name: '', role: 'host' }] })} className={p20Btn}>+ Person</button>
            </div>
          </div>

          {/* Per episode */}
          {(album.tracks ?? []).length > 0 && (
            <div className="space-y-3">
              <span className={p20Label}>Episode extras</span>
              <select value={episodeId} onChange={e => setEpisodeId(e.target.value)} className={`${p20Input} max-w-sm`}>
                {(album.tracks ?? []).map(t => <option key={t.id} value={t.id}>{t.title}{view.publicTrackIds.includes(t.id) ? '' : ' (not in public feed)'}</option>)}
              </select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <span className={p20Label}>Chapters (one per line: 0:00 Title)</span>
                  <textarea
                    key={episodeId}
                    defaultValue={chapterLines(ep.chapters)}
                    onBlur={e => { const c = parseChapterLines(e.target.value); setEp({ chapters: c.length ? c : undefined }); }}
                    rows={5}
                    placeholder={'0:00 Welcome\n4:30 Scripture reading\n12:05 Sermon'}
                    className={`${p20Input} font-mono`}
                  />
                </div>
                <div className="space-y-2">
                  <div>
                    <span className={p20Label}>Comments thread (ActivityPub note URL)</span>
                    <input value={ep.socialInteract?.uri ?? ''} onChange={e => setEp({ socialInteract: e.target.value ? { ...(ep.socialInteract ?? {}), uri: e.target.value, protocol: 'activitypub' } : undefined })} placeholder="https://plajah.com/ap/…" className={p20Input} />
                  </div>
                  <div>
                    <span className={p20Label}>Season name</span>
                    <input value={ep.seasonName ?? ''} onChange={e => setEp({ seasonName: e.target.value || undefined })} placeholder="Romans" className={p20Input} />
                  </div>
                  <p className="text-[9px] text-white/20 leading-relaxed">Timed lyrics or captions on the track are published as VTT/SRT transcripts automatically.</p>
                </div>
              </div>
            </div>
          )}

          {/* Live items */}
          <div className="space-y-2">
            <span className={p20Label}>Live items (On-air shows, live services)</span>
            {live.map((l, i) => {
              const set = (p: Partial<LiveItemSettings>) => patch({ liveItems: live.map((x, j) => j === i ? { ...x, ...p } : x) });
              return (
                <div key={l.id || i} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <input value={l.title} onChange={e => set({ title: e.target.value })} placeholder="Title" className={`${p20Input} md:col-span-2`} />
                  <select value={l.status} onChange={e => set({ status: e.target.value as LiveItemSettings['status'] })} className={p20Input}>
                    <option value="pending">Pending</option><option value="live">Live</option><option value="ended">Ended</option>
                  </select>
                  <input type="datetime-local" value={toLocalInput(l.start)} onChange={e => set({ start: fromLocalInput(e.target.value) })} className={p20Input} />
                  <input type="datetime-local" value={toLocalInput(l.end)} onChange={e => set({ end: fromLocalInput(e.target.value) || undefined })} className={p20Input} />
                  <button onClick={() => patch({ liveItems: live.filter((_, j) => j !== i) })} className="text-white/25 hover:text-red-400 text-xs font-black">✕</button>
                  <input value={l.streamUrl} onChange={e => set({ streamUrl: e.target.value })} placeholder="https://… stream (.m3u8 or mp3)" className={`${p20Input} md:col-span-3 font-mono`} />
                  <input value={l.contentLinks?.[0]?.href ?? ''} onChange={e => set({ contentLinks: e.target.value ? [{ href: e.target.value, label: 'Watch live on Plajah' }] : undefined })} placeholder="Watch page URL" className={`${p20Input} md:col-span-3`} />
                </div>
              );
            })}
            <button onClick={() => patch({ liveItems: [...live, { id: `live-${Date.now()}`, title: '', status: 'pending', start: Date.now() + 3_600_000, streamUrl: '' }] })} className={p20Btn}>+ Live item</button>
          </div>

          {errors.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
              <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
              <ul className="text-[10px] text-red-300 space-y-0.5">
                {errors.slice(0, 8).map(e => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-orange-500 text-black font-black uppercase tracking-wider text-xs hover:bg-orange-400 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Rss size={13} />}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save Podcasting 2.0'}
            </button>
            {view.feedStatus === 'public' && (
              <>
                <button onClick={() => notify(false)} className={p20Btn}><RefreshCw size={11} /> Ping Podcast Index</button>
                <button onClick={() => notify(true)} className={p20Btn}><BookOpen size={11} /> Submit to Podcast Index</button>
              </>
            )}
          </div>
          {notifyMsg && <p className="text-[10px] text-white/35">{notifyMsg}</p>}
          {!view.podcastIndexConfigured && <p className="text-[9px] text-white/20">Podcast Index updates are off until the server has its API key.</p>}
        </div>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function formatDuration(dur?: string): string {
  if (!dur) return '';
  const parts = dur.split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return `${m}m ${s}s`;
  }
  return dur;
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(ts?: number): string {
  if (!ts) return 'Never';
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ── Episode card ──────────────────────────────────────────────────────────────

function EpisodeCard({
  ep,
  isPlaying,
  onPlay,
}: {
  ep: ImportedRssEpisode;
  isPlaying: boolean;
  onPlay: (ep: ImportedRssEpisode) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.04] transition-all group"
    >
      <div className="relative shrink-0">
        {ep.imageUrl ? (
          <img
            src={ep.imageUrl}
            alt=""
            className="w-14 h-14 rounded-xl object-cover border border-white/10"
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Mic2 size={20} className="text-white/20" />
          </div>
        )}
        <button
          onClick={() => onPlay(ep)}
          className={`absolute inset-0 flex items-center justify-center rounded-xl transition-all ${
            isPlaying
              ? 'bg-orange-500/80 opacity-100'
              : 'bg-black/60 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white" />}
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{ep.title}</p>
        {ep.description && (
          <p className="text-xs text-white/35 leading-snug mt-0.5 line-clamp-2">{ep.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          {ep.pubDate && (
            <span className="flex items-center gap-1 text-[10px] text-white/25 font-bold">
              <Calendar size={9} />
              {formatDate(ep.pubDate)}
            </span>
          )}
          {ep.duration && (
            <span className="flex items-center gap-1 text-[10px] text-white/25 font-bold">
              <Clock size={9} />
              {formatDuration(ep.duration)}
            </span>
          )}
          {ep.episodeNumber && (
            <span className="text-[10px] text-orange-400/60 font-black">EP {ep.episodeNumber}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Directory card ────────────────────────────────────────────────────────────

function DirCard({ dir }: { dir: (typeof PODCAST_DIRECTORIES)[0] }) {
  return (
    <a
      href={dir.submitUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-4 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.04] transition-all group"
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${dir.color}18` }}
      >
        <Radio size={14} style={{ color: dir.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-widest text-white group-hover:text-white/80">
          {dir.name}
        </p>
        <p className="text-[9px] text-white/25 mt-0.5">{dir.instructions}</p>
      </div>
      <ExternalLink size={12} className="text-white/15 group-hover:text-white/40 transition-all shrink-0 mt-0.5" />
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PodcastRssSettings() {
  const [innerTab, setInnerTab] = useState<InnerTab>('import');

  // External RSS state
  const [inputUrl, setInputUrl]             = useState('');
  const [settings, setSettings]             = useState<PodcastRssSettingsType | null>(null);
  const [previewing, setPreviewing]         = useState(false);
  const [previewResult, setPreviewResult]   = useState<{
    title?: string; description?: string; imageUrl?: string; episodeCount?: number;
  } | null>(null);
  const [previewError, setPreviewError]     = useState('');
  const [syncing, setSyncing]               = useState(false);
  const [syncDone, setSyncDone]             = useState(false);
  const [syncError, setSyncError]           = useState('');

  // Episodes state
  const [episodes, setEpisodes]             = useState<ImportedRssEpisode[]>([]);
  const [loadingEps, setLoadingEps]         = useState(false);

  // Native distribution state
  const [albums, setAlbums]                 = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [copied, setCopied]                 = useState(false);
  const [xmlCopied, setXmlCopied]           = useState(false);
  const [loadingAlbums, setLoadingAlbums]   = useState(false);
  const [p20View, setP20View]               = useState<Podcast20View | null>(null);

  const { currentTrack, playTrack } = useGlobalPlayerState();

  // ── Load on mount ──

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    fetchPodcastRssSettings().then(async s => {
      if (!s) return;
      setSettings(s);
      if (s.externalFeedUrl) setInputUrl(s.externalFeedUrl);

      // Auto-sync if enabled and overdue (>7 days since last sync)
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (s.syncEnabled && s.externalFeedUrl && Date.now() - (s.lastSynced ?? 0) > sevenDaysMs) {
        try {
          const idToken = await auth.currentUser!.getIdToken();
          const res = await fetch('/api/podcast-sync', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.synced && data.xmlText) {
              const { parseRssXml } = await import('../services/podcastRssImporter');
              const feed = parseRssXml(data.xmlText);
              const updated = { ...s, lastSynced: data.syncedAt, importedEpisodeCount: feed.episodes.length };
              await savePodcastRssSettings(updated);
              await syncImportedEpisodes(feed.episodes);
              setSettings(updated);
              setEpisodes(feed.episodes);
            }
          }
        } catch { /* silent — auto-sync failure is non-fatal */ }
      }
    });

    setLoadingEps(true);
    fetchImportedEpisodes(uid).then(eps => {
      setEpisodes(eps);
      setLoadingEps(false);
    });

    // Silently backfill artistId on any old tracks that are missing it
    backfillMyAlbumArtistIds().catch(() => {});
  }, []);

  useEffect(() => {
    if (innerTab !== 'distribute') return;
    setLoadingAlbums(true);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    fetchUserAlbums(uid).then(all => {
      const pods = all.filter(
        a => a.type === 'MUSIC' && (a.subType === 'PODCAST' || (a.tracks ?? []).some(t => t.podcastMetadata))
      );
      setAlbums(pods);
      if (pods.length > 0 && !selectedAlbumId) setSelectedAlbumId(pods[0].id);
      setLoadingAlbums(false);
    });
  }, [innerTab]);

  // ── Actions ──

  const handlePreview = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) return;
    setPreviewing(true);
    setPreviewError('');
    setPreviewResult(null);
    const result = await validateRssUrl(url);
    if (result.valid) {
      setPreviewResult({
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        episodeCount: result.episodeCount,
      });
    } else {
      setPreviewError(result.error ?? 'Could not read feed');
    }
    setPreviewing(false);
  }, [inputUrl]);

  const handleSaveAndSync = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) return;
    setSyncing(true);
    setSyncError('');
    setSyncDone(false);
    try {
      const feed = await fetchAndParseRss(url);
      const newSettings: PodcastRssSettingsType = {
        externalFeedUrl: url,
        feedTitle: feed.title,
        feedDescription: feed.description,
        feedImageUrl: feed.imageUrl,
        syncEnabled: true,
        lastSynced: Date.now(),
        importedEpisodeCount: feed.episodes.length,
        isExplicit: feed.isExplicit,
        language: feed.language,
        category: feed.category,
      };
      await savePodcastRssSettings(newSettings);
      await syncImportedEpisodes(feed.episodes);
      setSettings(newSettings);
      setEpisodes(feed.episodes);
      setPreviewResult({
        title: feed.title,
        description: feed.description,
        imageUrl: feed.imageUrl,
        episodeCount: feed.episodes.length,
      });
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err: any) {
      setSyncError(err.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [inputUrl]);

  const handleResync = useCallback(async () => {
    if (!settings?.externalFeedUrl) return;
    setSyncing(true);
    setSyncError('');
    setSyncDone(false);
    try {
      const feed = await fetchAndParseRss(settings.externalFeedUrl);
      const updated = { ...settings, lastSynced: Date.now(), importedEpisodeCount: feed.episodes.length };
      await savePodcastRssSettings(updated);
      await syncImportedEpisodes(feed.episodes);
      setSettings(updated);
      setEpisodes(feed.episodes);
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err: any) {
      setSyncError(err.message ?? 'Resync failed');
    } finally {
      setSyncing(false);
    }
  }, [settings]);

  const playEpisode = useCallback((ep: ImportedRssEpisode) => {
    const track: Track = {
      id: ep.id,
      title: ep.title,
      artist: settings?.feedTitle ?? 'Podcast',
      artistId: auth.currentUser?.uid,
      url: ep.audioUrl,
      albumCover: ep.imageUrl,
      duration: 0,
      isRadioEligible: false,
      isSlideshowEligible: false,
      likes: 0,
      isExclusive: false,
      albumId: '',
      albumTitle: settings?.feedTitle ?? '',
    };
    playTrack(track, null, 'LIBRARY');
  }, [settings, playTrack]);

  // ── Native distribution helpers ──

  const selectedAlbum = albums.find(a => a.id === selectedAlbumId);
  const rssXml = selectedAlbum
    ? generatePodcastRSS(selectedAlbum, {
        siteUrl: window.location.origin,
        ...(p20View ? { feedUrl: p20View.feedUrl, podcast20: { settings: { ...p20View.settings, guid: p20View.guid } } } : {}),
      })
    : '';
  const feedUrl = selectedAlbum ? (p20View?.feedUrl ?? `${window.location.origin}/rss/${selectedAlbum.id}`) : '';

  const copyFeedUrl = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const copyXML = () => {
    navigator.clipboard.writeText(rssXml);
    setXmlCopied(true);
    setTimeout(() => setXmlCopied(false), 2000);
  };
  const downloadXML = () => {
    if (!selectedAlbum) return;
    const blob = new Blob([rssXml], { type: 'application/xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${selectedAlbum.title.replace(/\s+/g, '_')}_podcast.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Tabs ──

  const tabs: { id: InnerTab; label: string; icon: React.ElementType }[] = [
    { id: 'import',    label: 'RSS Import',  icon: Rss },
    { id: 'episodes',  label: 'Episodes',    icon: Mic2 },
    { id: 'distribute', label: 'Distribute', icon: Radio },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">
          Podcast<br />RSS
        </h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">
          Import your feed · sync episodes · distribute everywhere
        </p>
      </div>

      {/* Inner tab bar */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setInnerTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              innerTab === t.id
                ? 'bg-orange-500 text-black shadow-lg'
                : 'text-white/35 hover:text-white/60'
            }`}
          >
            {React.createElement(t.icon as any, { size: 13 })}
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── IMPORT TAB ── */}
        {innerTab === 'import' && (
          <motion.div
            key="import"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {/* Current feed status */}
            {settings?.externalFeedUrl && (
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-green-500/8 border border-green-500/20">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
                  {settings.feedImageUrl ? (
                    <img src={settings.feedImageUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <Rss size={16} className="text-green-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{settings.feedTitle || 'Connected Feed'}</p>
                  <p className="text-[10px] text-white/35 truncate mt-0.5">{settings.externalFeedUrl}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-[10px] text-green-400/70 font-bold">
                      {settings.importedEpisodeCount ?? 0} episodes synced
                    </span>
                    <span className="text-[10px] text-white/25 font-bold">
                      Last synced {timeAgo(settings.lastSynced)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleResync}
                  disabled={syncing}
                  title="Re-sync now"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-wider shrink-0"
                >
                  {syncing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  Sync
                </button>
              </div>
            )}

            {/* URL input */}
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 block">
                Your Podcast RSS Feed URL
              </label>
              <div className="flex gap-3">
                <div className="flex-1 flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] rounded-2xl px-4 py-3 focus-within:border-orange-500/40 transition-colors">
                  <Link2 size={14} className="text-white/20 shrink-0" />
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={e => { setInputUrl(e.target.value); setPreviewResult(null); setPreviewError(''); }}
                    placeholder="https://feeds.buzzsprout.com/your-show.rss"
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
                  />
                </div>
                <button
                  onClick={handlePreview}
                  disabled={!inputUrl.trim() || previewing}
                  className="px-5 py-3 rounded-2xl bg-white/8 border border-white/10 text-xs font-black uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/12 transition-all disabled:opacity-40 shrink-0"
                >
                  {previewing ? <Loader2 size={13} className="animate-spin" /> : 'Validate'}
                </button>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 px-1">
                <Info size={11} className="text-white/20 shrink-0 mt-0.5" />
                <p className="text-[9px] text-white/25 leading-relaxed">
                  Paste the RSS feed URL from your podcast host (Buzzsprout, Anchor, Libsyn, Transistor, etc.).
                  Plajah will import your episodes so they play natively on the platform.
                </p>
              </div>
            </div>

            {/* Validation error */}
            {previewError && (
              <div className="flex items-start gap-2 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
                <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{previewError}</p>
              </div>
            )}

            {/* Feed preview */}
            {previewResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 rounded-2xl bg-white/[0.025] border border-white/[0.08] space-y-4"
              >
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Feed Preview</p>
                <div className="flex items-center gap-4">
                  {previewResult.imageUrl && (
                    <img
                      src={previewResult.imageUrl}
                      alt=""
                      className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white">{previewResult.title}</p>
                    {previewResult.description && (
                      <p className="text-xs text-white/40 leading-relaxed mt-1 line-clamp-3">
                        {previewResult.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 pt-2 border-t border-white/5">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Episodes</p>
                    <p className="text-2xl font-black text-white mt-0.5">{previewResult.episodeCount ?? 0}</p>
                  </div>
                  <div className="flex items-center gap-2 text-green-400">
                    <Check size={14} />
                    <span className="text-xs font-black">Valid podcast feed</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Save & Sync CTA */}
            {(previewResult || inputUrl.trim()) && (
              <div className="space-y-3">
                <button
                  onClick={handleSaveAndSync}
                  disabled={syncing || !inputUrl.trim()}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-orange-500 text-black font-black uppercase tracking-wider text-sm hover:bg-orange-400 transition-all disabled:opacity-50"
                >
                  {syncing ? (
                    <><Loader2 size={16} className="animate-spin" /> Syncing episodes…</>
                  ) : syncDone ? (
                    <><Check size={16} /> Synced successfully!</>
                  ) : (
                    <><RefreshCw size={16} /> Save &amp; Sync Episodes</>
                  )}
                </button>
                {syncError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
                    <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{syncError}</p>
                  </div>
                )}
                <p className="text-[9px] text-white/20 text-center">
                  Episodes are imported into Plajah so listeners can play them natively.
                  Your original host continues to distribute to Apple, Spotify, etc.
                </p>
              </div>
            )}

            {/* What happens section */}
            {!settings?.externalFeedUrl && !previewResult && (
              <div className="grid grid-cols-1 gap-3 pt-4">
                {[
                  {
                    icon: Globe,
                    title: 'On-Platform Playback',
                    body: "Imported episodes play natively in Plajah's audio player. Listeners never leave the platform.",
                  },
                  {
                    icon: RefreshCw,
                    title: 'Sync Your Feed',
                    body: 'Sync whenever you publish new episodes to keep your Plajah library current.',
                  },
                  {
                    icon: Radio,
                    title: 'Distribute Everywhere',
                    body: 'Generate a Plajah RSS feed from your native albums and submit it to every major directory.',
                  },
                ].map(item => (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
                  >
                    <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center shrink-0">
                      <item.icon size={15} className="text-orange-400" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-white">{item.title}</p>
                      <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── EPISODES TAB ── */}
        {innerTab === 'episodes' && (
          <motion.div
            key="episodes"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Episode count header */}
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                {episodes.length} Imported Episodes
              </p>
              {settings?.externalFeedUrl && (
                <button
                  onClick={handleResync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-[10px] font-black uppercase tracking-wider text-white/40 hover:text-white transition-all"
                >
                  {syncing ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                  Refresh
                </button>
              )}
            </div>

            {loadingEps ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/20">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-xs font-bold">Loading episodes…</p>
              </div>
            ) : episodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 border-2 border-dashed border-white/[0.05] rounded-[2rem] text-center">
                <Mic2 size={32} className="text-white/12" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/20">No episodes yet</p>
                  <p className="text-[10px] text-white/15 mt-1">
                    Go to the RSS Import tab, paste your feed URL, and click Save &amp; Sync.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {episodes.map(ep => (
                  <EpisodeCard
                    key={ep.id}
                    ep={ep}
                    isPlaying={currentTrack?.id === ep.id}
                    onPlay={playEpisode}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── DISTRIBUTE TAB ── */}
        {innerTab === 'distribute' && (
          <motion.div
            key="distribute"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-8"
          >
            {/* Native Plajah RSS */}
            <section className="space-y-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                  Native Plajah RSS Feed
                </p>
                <p className="text-[10px] text-white/20 mt-1">
                  Generate an RSS feed from your Plajah podcast albums to submit to directories.
                </p>
              </div>

              {loadingAlbums ? (
                <div className="flex items-center gap-2 text-white/30 text-xs">
                  <Loader2 size={13} className="animate-spin" />
                  Loading podcast albums…
                </div>
              ) : albums.length === 0 ? (
                <div className="flex items-start gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <Music size={16} className="text-white/20 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-white/40">No podcast albums found</p>
                    <p className="text-[10px] text-white/20 mt-0.5">
                      Create an album with subType "PODCAST" or add podcast metadata to your tracks in Music Studio.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Album selector */}
                  <div className="relative w-full max-w-sm">
                    <select
                      value={selectedAlbumId}
                      onChange={e => setSelectedAlbumId(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10"
                    >
                      {albums.map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  </div>

                  {selectedAlbum && (
                    <>
                      {/* Feed URL */}
                      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">
                          Your RSS Feed URL
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-black/40 border border-white/8 rounded-xl px-4 py-3 font-mono text-xs text-white/50 truncate">
                            {feedUrl}
                          </div>
                          <button
                            onClick={copyFeedUrl}
                            className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest bg-violet-500/15 text-violet-400 hover:bg-violet-500/20 border border-violet-500/25 transition-all shrink-0"
                          >
                            {copied ? <Check size={11} /> : <Copy size={11} />}
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>

                        {p20View?.feedStatus !== 'public' && (
                          <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-400/[0.06] border border-yellow-400/15">
                            <AlertCircle size={11} className="text-yellow-400 shrink-0 mt-0.5" />
                            <p className="text-[9px] text-white/30 leading-relaxed">
                              {p20View
                                ? (FEED_STATUS_COPY[p20View.feedStatus] ?? 'This feed is not public yet.') + '. You can still download the XML.'
                                : 'This URL requires a live hosting endpoint. Download the XML and serve it via Firebase Hosting, or use it with a podcast CDN.'}
                            </p>
                          </div>
                        )}

                        <div className="flex gap-3">
                          <button
                            onClick={downloadXML}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/6 text-white/40 hover:text-white transition-all"
                          >
                            <Download size={11} /> Download .xml
                          </button>
                          <button
                            onClick={copyXML}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/6 text-white/40 hover:text-white transition-all"
                          >
                            {xmlCopied ? <Check size={11} /> : <Copy size={11} />}
                            {xmlCopied ? 'Copied!' : 'Copy XML'}
                          </button>
                        </div>
                      </div>

                      {/* Podcasting 2.0 */}
                      <Podcast20Section album={selectedAlbum} onView={setP20View} />

                      {/* Episode stats */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Episodes',  value: selectedAlbum.tracks?.length ?? 0 },
                          { label: 'Free',      value: selectedAlbum.tracks?.filter(t => !t.isPaywalled).length ?? 0 },
                          { label: 'Members',   value: selectedAlbum.tracks?.filter(t => t.isPaywalled).length ?? 0 },
                        ].map(s => (
                          <div key={s.label} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 text-center">
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
                            <p className="text-2xl font-black text-white">{s.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* RSS preview */}
                      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Feed Preview</p>
                        <pre className="text-[8px] text-white/25 leading-relaxed overflow-x-auto max-h-40 bg-black/20 rounded-xl p-4">
                          {rssXml.slice(0, 1000)}…
                        </pre>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>

            {/* Directory submission */}
            <section className="space-y-4">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                Submit to Podcast Directories
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PODCAST_DIRECTORIES.map(dir => (
                  <DirCard key={dir.id} dir={dir} />
                ))}
              </div>
            </section>

            {/* Podcast Index */}
            <section>
              <a
                href="https://podcastindex.org/add"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.04] transition-all group"
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/15">
                  <BookOpen size={14} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-widest text-white group-hover:text-white/80">
                    Podcast Index
                  </p>
                  <p className="text-[9px] text-white/25 mt-0.5">
                    Open-source podcast namespace — free listing for all podcasts
                  </p>
                </div>
                <ExternalLink size={12} className="text-white/15 group-hover:text-white/40 transition-all shrink-0" />
              </a>
            </section>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
}
