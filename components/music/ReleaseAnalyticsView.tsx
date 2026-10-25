// ReleaseAnalyticsView — one release's own analytics page (owner / admin). Today: everything the
// listening parties said about it — poll results (live while a party is running), ratings and moods per
// song, the room's energy, open-question answers, and the full comment/GIF log with timestamps — plus
// the release's headline play/like/share counts. The server only serves this to the release's owner.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Download, Flame, Heart, MessageCircle, Play, Radio, Share2, Star, Users } from 'lucide-react';
import { fetchCreatorAudience, type CreatorAudienceBundle } from '../../services/musicIntelService';
import type { AudiencePollResult, AlbumAudienceTrack } from '../../services/musicIntel/audience';
import { formatMoment } from '../../services/partyEngagement';
import { fetchAlbumById } from '../../services/backendService';
import { emoteById } from '../../services/emotes/emoteLibrary';
import { EmoteGlyph } from '../emotes/EmoteGlyph';
import PartyEnergyGraph from '../party/PartyEnergyGraph';

const LIVE_REFRESH_MS = 12_000;

const Panel: React.FC<{ title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, right, children }) => (
  <section className="rounded-3xl p-5 sm:p-6 bg-white/[0.03] border border-white/[0.08] space-y-4">
    <div className="flex items-center gap-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#FFB86B] inline-flex items-center gap-1.5">{icon}{title}</h2>
      <span className="flex-1" />{right}
    </div>
    {children}
  </section>
);

const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/10">
    <div className="text-[11px] font-semibold uppercase tracking-widest text-white/45">{label}</div>
    <div className="text-2xl font-black text-white tabular-nums leading-tight">{value}</div>
    {sub && <div className="text-[12px] text-white/50">{sub}</div>}
  </div>
);

/** Same question on the same song across parties → one row (counts add, ratings weight by votes). */
interface PollRow { key: string; trackId: string; trackTitle: string; question: string; kind: AudiencePollResult['kind']; auto: boolean; total: number; counts: Record<string, number>; labels?: Record<string, string>; avg?: number; answers: string[]; parties: number }
function pollRows(tracks: Record<string, AlbumAudienceTrack>, order: string[]): PollRow[] {
  const rows = new Map<string, PollRow>();
  for (const id of order) {
    const t = tracks[id];
    if (!t) continue;
    for (const p of t.polls) {
      const key = `${id}|${p.kind}|${p.question}`;
      const r = rows.get(key) || { key, trackId: id, trackTitle: t.title, question: p.question, kind: p.kind, auto: p.auto, total: 0, counts: {}, labels: p.labels, avg: undefined as number | undefined, answers: [], parties: 0 };
      const prevTotal = r.total;
      r.total += p.total; r.parties++;
      for (const [k, n] of Object.entries(p.counts)) r.counts[k] = (r.counts[k] || 0) + n;
      if (p.kind === 'rating' && p.avg != null) r.avg = Math.round((((r.avg || 0) * prevTotal + p.avg * p.total) / Math.max(1, r.total)) * 100) / 100;
      if (p.answers?.length) r.answers.push(...p.answers);
      rows.set(key, r);
    }
  }
  return [...rows.values()];
}

const Bar: React.FC<{ label: React.ReactNode; n: number; total: number }> = ({ label, n, total }) => {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="relative rounded-xl overflow-hidden bg-white/[0.06] px-3 py-2 text-sm">
      <span className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#d40055]/55 to-[#ff8c00]/40" style={{ width: `${pct}%`, transition: 'width 400ms ease' }} aria-hidden />
      <span className="relative flex items-center justify-between gap-3"><span className="text-white/90">{label}</span><span className="text-white/70 tabular-nums">{n} · {pct}%</span></span>
    </div>
  );
};

const PollResultCard: React.FC<{ r: PollRow }> = ({ r }) => (
  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.08] space-y-2">
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/45">{r.trackTitle}{r.auto ? ' · auto poll' : ''}</div>
        <div className="text-[15px] font-semibold text-white">{r.question}</div>
      </div>
      <div className="text-right text-[12px] text-white/55 shrink-0">{r.total} {r.total === 1 ? 'answer' : 'answers'}<br />{r.parties} {r.parties === 1 ? 'party' : 'parties'}</div>
    </div>
    {r.kind === 'rating' && (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-amber-300"><Star size={16} className="fill-amber-300" /><span className="text-xl font-black text-white tabular-nums">{r.avg?.toFixed(2) ?? '—'}</span><span className="text-white/45 text-sm">average of 5</span></div>
        {[5, 4, 3, 2, 1].map(n => <Bar key={n} label={`${n} ★`} n={r.counts[String(n)] || 0} total={r.total} />)}
      </div>
    )}
    {r.kind === 'choice' && (
      <div className="space-y-1.5">
        {Object.entries(r.counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => <Bar key={id} label={r.labels?.[id] || id} n={n} total={r.total} />)}
      </div>
    )}
    {r.kind === 'text' && (
      <ul className="space-y-1.5 max-h-56 overflow-y-auto">
        {r.answers.length ? r.answers.map((a, i) => <li key={i} className="text-[14px] text-white/85 bg-white/[0.05] rounded-xl px-3 py-2 break-words">{a}</li>) : <li className="text-sm text-white/45">No answers yet.</li>}
      </ul>
    )}
  </div>
);

function csvOf(rows: PollRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Song', 'Question', 'Type', 'Option', 'Votes', 'Share', 'Average'].map(esc).join(',')];
  for (const r of rows) {
    if (r.kind === 'text') { r.answers.forEach(a => lines.push([r.trackTitle, r.question, 'open answer', a, 1, '', ''].map(esc).join(','))); continue; }
    for (const [id, n] of Object.entries(r.counts)) lines.push([r.trackTitle, r.question, r.kind, r.kind === 'rating' ? `${id} stars` : (r.labels?.[id] || id), n, r.total ? `${Math.round((n / r.total) * 100)}%` : '', r.avg ?? ''].map(esc).join(','));
  }
  return lines.join('\n');
}

const ReleaseAnalyticsView: React.FC<{ albumId: string; onBack: () => void }> = ({ albumId, onBack }) => {
  const [data, setData] = useState<CreatorAudienceBundle | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied'>('loading');
  const [totals, setTotals] = useState<{ plays: number; likes: number; shares: number; title?: string } | null>(null);
  const [songId, setSongId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetchCreatorAudience(albumId);
    if (d) { setData(d); setState('ready'); } else setState(s => (s === 'ready' ? s : 'denied'));
  }, [albumId]);
  useEffect(() => { setState('loading'); void load(); }, [load]);
  useEffect(() => {
    if (!data?.liveParties.length) return;
    const t = setInterval(() => void load(), LIVE_REFRESH_MS);   // a party is running: results come in live
    return () => clearInterval(t);
  }, [data?.liveParties.length, load]);
  useEffect(() => {
    let alive = true;
    fetchAlbumById(albumId).then(a => { if (alive && a) setTotals({ plays: (a as any).playCount || 0, likes: (a as any).likesCount || 0, shares: (a as any).shareCount || 0, title: a.title }); }).catch(() => {});
    return () => { alive = false; };
  }, [albumId]);

  const order = useMemo(() => (data?.album.tracks || []).map(t => t.id), [data]);
  const aud = data?.audience;
  const rows = useMemo(() => (aud ? pollRows(aud.tracks, order) : []), [aud, order]);
  const sel = songId && aud?.tracks[songId] ? songId : order.find(id => aud?.tracks[id]?.allComments?.length) || order[0];
  const selTrack = sel ? aud?.tracks[sel] : undefined;
  const ratedTotal = aud ? Object.values(aud.tracks).reduce((a, t) => a + t.ratingCount, 0) : 0;
  const ratedSum = aud ? Object.values(aud.tracks).reduce((a, t) => a + t.ratingSum, 0) : 0;
  const events = aud ? Object.values(aud.tracks).reduce((a, t) => a + t.events, 0) : 0;

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([csvOf(rows)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${(data?.album.title || 'release').replace(/[^\w\- ]+/g, '').trim() || 'release'} — poll results.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="min-h-screen bg-[#06040A] text-white normal-case font-sans">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="h-10 px-4 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold inline-flex items-center gap-2"><ArrowLeft size={15} /> Back</button>
          {data?.album.cover && <img src={data.album.cover} alt="" className="w-12 h-12 rounded-xl object-cover" />}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Release analytics</div>
            <h1 className="text-xl font-black truncate">{data?.album.title || totals?.title || 'Release'}</h1>
          </div>
          {!!data?.liveParties.length && <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-bold"><Radio size={12} className="animate-pulse" /> Party live · updating</span>}
        </div>

        {state === 'loading' && <p className="text-white/50 py-16 text-center">Loading analytics…</p>}
        {state === 'denied' && <p className="text-white/60 py-16 text-center">These analytics are only available to the release's owner. Sign in with the account that published it.</p>}

        {state === 'ready' && data && aud && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Plays" value={totals ? totals.plays.toLocaleString() : '—'} />
              <Kpi label="Likes" value={totals ? totals.likes.toLocaleString() : '—'} />
              <Kpi label="Shares" value={totals ? totals.shares.toLocaleString() : '—'} />
              <Kpi label="Listening parties" value={aud.sessions} sub={`${aud.listeners} listeners`} />
            </div>

            {aud.sessions === 0 ? (
              <Panel title="Listening parties" icon={<Users size={13} />}>
                <p className="text-white/60 leading-relaxed">No listening party has been held for this release yet. Start one from the player — polls, ratings, reactions and comments land here, live while it runs and kept after it ends.</p>
              </Panel>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Kpi label="Avg rating" value={ratedTotal ? <span className="inline-flex items-center gap-1"><Star size={18} className="fill-amber-300 text-amber-300" />{(ratedSum / ratedTotal).toFixed(2)}</span> : '—'} sub={`${ratedTotal} ratings`} />
                  <Kpi label="Engagement" value={events.toLocaleString()} sub="messages, reactions, votes" />
                  <Kpi label="Poll answers" value={rows.reduce((a, r) => a + r.total, 0).toLocaleString()} sub={`${rows.length} questions`} />
                  <Kpi label="Hottest moment" value={data.cards.find(c => c.id === 'album-hottest')?.stat || '—'} sub={data.cards.find(c => c.id === 'album-hottest')?.text} />
                </div>

                <Panel title="Room energy, song by song" icon={<Flame size={13} />}>
                  <PartyEnergyGraph songs={data.energy.map(e => ({ trackId: e.trackId, title: e.title, durationSec: e.durationSec, series: e.series, bucketSec: e.bucketSec }))} height={120} />
                </Panel>

                <Panel title="Poll results" icon={<BarChart3 size={13} />} right={rows.length > 0 && <button onClick={exportCsv} className="h-9 px-3 rounded-full border border-white/20 text-xs font-semibold hover:bg-white/10 inline-flex items-center gap-1.5"><Download size={13} /> CSV</button>}>
                  {rows.length === 0 ? <p className="text-white/55">No poll has been answered yet. Auto polls appear near the end of each song; you can also start your own from the chat.</p>
                    : <div className="grid gap-3 md:grid-cols-2">{rows.map(r => <PollResultCard key={r.key} r={r} />)}</div>}
                </Panel>

                <Panel title="By song" icon={<Heart size={13} />}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] uppercase tracking-widest text-white/45"><th className="py-2 pr-3">Song</th><th className="pr-3">Engaged</th><th className="pr-3">Rating</th><th className="pr-3">Felt</th><th className="pr-3">Peak</th><th>Top reaction</th></tr></thead>
                      <tbody>
                        {order.filter(id => aud.tracks[id]).map(id => {
                          const t = aud.tracks[id]; const top = t.reactions[0]; const em = top?.isEmote ? emoteById(top.key) : null;
                          return (
                            <tr key={id} className="border-t border-white/[0.07] text-white/85">
                              <td className="py-2 pr-3 font-semibold">{t.title}</td>
                              <td className="pr-3 tabular-nums">{t.engaged}</td>
                              <td className="pr-3 tabular-nums">{t.ratingAvg != null ? `${t.ratingAvg.toFixed(1)}★ (${t.ratingCount})` : '—'}</td>
                              <td className="pr-3">{t.moodTop ? `${t.moodTop.label} ${Math.round((t.moodTop.count / t.moodTop.total) * 100)}%` : '—'}</td>
                              <td className="pr-3 tabular-nums">{t.peak ? formatMoment(t.peak.atSec) : '—'}</td>
                              <td>{top ? (em ? <EmoteGlyph def={em} size={22} /> : `${top.key} ×${top.count}`) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                <Panel title="What the room said" icon={<MessageCircle size={13} />}>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {order.filter(id => aud.tracks[id]).map(id => (
                      <button key={id} onClick={() => setSongId(id)} aria-pressed={id === sel}
                        className={`h-9 px-4 shrink-0 rounded-full text-sm font-semibold border ${id === sel ? 'bg-white text-[#06040A] border-white' : 'text-white/75 border-white/15 hover:border-white/35'}`}>{aud.tracks[id].title}</button>
                    ))}
                  </div>
                  {selTrack && (selTrack.allComments?.length
                    ? <ul className="space-y-2 max-h-96 overflow-y-auto">
                        {selTrack.allComments.map((c, i) => (
                          <li key={i} className="flex gap-3 rounded-2xl px-4 py-2.5 bg-white/[0.03] border border-white/[0.07]">
                            <span className="shrink-0 w-12 text-[12px] tabular-nums text-white/50 pt-0.5 inline-flex items-start gap-1"><Play size={9} className="mt-1" />{formatMoment(c.atSec) || '—'}</span>
                            <span className="min-w-0"><span className="text-[12px] font-semibold text-white/55">{c.name}</span>
                              {c.text && <span className="block text-[15px] text-white/90 break-words">{c.text}</span>}
                              {c.gifUrl && <img src={c.gifUrl} alt="GIF" loading="lazy" referrerPolicy="no-referrer" className="mt-1 max-h-32 rounded-xl" />}
                            </span>
                          </li>
                        ))}
                      </ul>
                    : <p className="text-white/50">Nobody commented on this song yet.</p>)}
                </Panel>

                <Panel title="Parties" icon={<Share2 size={13} />}>
                  <ul className="divide-y divide-white/[0.07]">
                    {data.sessions.map(s => (
                      <li key={s.partyId} className="py-2.5 flex items-center gap-3 text-sm">
                        <span className="text-white/85 font-semibold">{new Date(s.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        {data.liveParties.includes(s.partyId) && <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 text-[11px] font-bold">LIVE</span>}
                        <span className="ml-auto text-white/55 tabular-nums">{s.listeners} listeners · {Object.values(s.tracks).reduce((a, t) => a + t.events, 0)} interactions</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ReleaseAnalyticsView;
