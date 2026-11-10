// Gamer hub — the player's universal gamer card (score, breakdown, ledger) and the network leaderboards.
// Reads /api/gamer; works signed out (leaderboards only).

import React, { useEffect, useState } from 'react';
import { Trophy, ShieldCheck, Loader2, History, Medal } from 'lucide-react';
import { gamer, isSignedIn, failed, type GamerProfile, type LeaderRow } from '../../services/gamerNet/client';
import type { GamerEntry } from '../../services/gamerNet/ledger';
import { ACHIEVEMENTS } from '../../services/gamerNet/score';

const BOARDS = [{ id: 'all', label: 'Gamer Score' }, { id: 'ttt', label: 'Cyber Tic Tac Toe' }];
const achTitle = (id: string) => ACHIEVEMENTS.find(a => a.id === id)?.title ?? id;

function describe(e: GamerEntry): string {
  switch (e.event) {
    case 'MATCH_RESULT': return `${e.result === 'win' ? 'Won' : e.result === 'loss' ? 'Lost' : 'Drew'} ${e.rated ? 'a rated' : 'a friendly'} match${e.reason === 'timeout' ? ' (clock)' : e.reason === 'resign' ? ' (resign)' : ''}${e.rated && e.ratingAfter !== undefined && e.ratingBefore !== undefined ? ` · ${e.ratingAfter - e.ratingBefore >= 0 ? '+' : ''}${e.ratingAfter - e.ratingBefore}` : ''}`;
    case 'ACHIEVEMENT': return `Unlocked “${e.note ?? achTitle(e.achievementId ?? '')}” · +${e.points ?? 0}`;
    case 'LOCAL_PLAY': return `Played ${e.note ?? 'locally'}${e.result ? ` · ${e.result}` : ''}`;
    case 'EXTERNAL_IMPORT': return `Imported from ${e.platform ?? 'another platform'}`;
    default: return e.event;
  }
}

export default function GamerHub() {
  const [board, setBoard] = useState('all');
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [me, setMe] = useState<GamerProfile | null>(null);
  const [hist, setHist] = useState<GamerEntry[]>([]);
  const [verify, setVerify] = useState<string>('');
  const signedIn = isSignedIn();

  useEffect(() => {
    let alive = true; setRows(null);
    void gamer.leaderboard(board, 20).then(r => { if (alive) setRows(failed(r) ? [] : r.players); });
    return () => { alive = false; };
  }, [board]);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void gamer.me().then(async r => {
      if (!alive || failed(r)) return;
      setMe(r.profile);
      const h = await gamer.history(r.profile.uid, 8); if (alive && !failed(h)) setHist(h.entries);
    });
    return () => { alive = false; };
  }, [signedIn]);

  const runVerify = async () => {
    if (!me) return; setVerify('Checking…');
    const r = await gamer.verify(me.uid);
    setVerify(failed(r) ? r.error : r.chain.ok && r.scoreMatches ? `Verified · ${r.chain.length} entries, score recomputed from genesis = ${r.recomputed.total}` : `Problem: ${r.chain.problem ?? 'score differs from replay'}`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3"><Medal size={18} className="text-small-orange" /><h4 className="text-sm font-black uppercase tracking-widest">Your gamer card</h4></div>
        {!signedIn ? (
          <p className="text-sm text-white/60">Sign in to start your Plajah gamer ledger — every refereed match and achievement, yours to keep and verify.</p>
        ) : !me ? (
          <div className="flex items-center gap-2 text-white/50 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0"><div className="text-xs text-white/50 truncate">{me.name}</div><div className="text-4xl font-black tracking-tight">{me.score.toLocaleString()}</div><div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Plajah Gamer Score</div></div>
              <div className="text-right text-[11px] text-white/50 leading-5">
                <div>Play {me.scoreCard.play}</div><div>Skill {me.scoreCard.skill}</div><div>Achievements {me.scoreCard.achievements}</div><div>Linked {me.scoreCard.external}</div>
              </div>
            </div>
            {me.achievements.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">{me.achievements.map(a => <span key={a} className="px-2 py-1 rounded-full bg-small-orange/15 border border-small-orange/30 text-[10px] font-bold">{achTitle(a)}</span>)}</div>
            )}
            <div className="mt-4 flex items-center gap-2 text-[11px] text-white/50"><History size={13} /> Ledger · {me.ledger.length} entries</div>
            <ul className="mt-2 space-y-1.5">
              {hist.map(e => <li key={e.seq} className="text-xs text-white/75 flex justify-between gap-2"><span className="min-w-0 truncate">{describe(e)}</span><span className="text-white/35 shrink-0">{new Date(e.at).toLocaleDateString()}</span></li>)}
              {hist.length === 0 && <li className="text-xs text-white/40">No entries yet — play an online match.</li>}
            </ul>
            <button onClick={runVerify} className="mt-3 min-h-[40px] w-full rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10">
              <ShieldCheck size={14} /> Verify my ledger
            </button>
            {verify && <p className="mt-2 text-[11px] text-white/60">{verify}</p>}
          </>
        )}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 min-w-0">
        <div className="flex items-center gap-2 mb-3"><Trophy size={18} className="text-yellow-400" /><h4 className="text-sm font-black uppercase tracking-widest">Leaderboard</h4></div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {BOARDS.map(b => (
            <button key={b.id} onClick={() => setBoard(b.id)} className={`shrink-0 min-h-[36px] px-4 rounded-full text-[11px] font-black uppercase tracking-widest ${board === b.id ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>{b.label}</button>
          ))}
        </div>
        {rows === null ? (
          <div className="flex items-center gap-2 text-white/50 text-sm py-6"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-white/50 py-6">No ranked players yet — be the first. Quick matches in Cyber Tic Tac Toe put you on the board.</p>
        ) : (
          <ol className="divide-y divide-white/5">
            {rows.map(p => (
              <li key={p.uid} className={`flex items-center gap-3 py-2.5 ${me?.uid === p.uid ? 'text-small-orange' : ''}`}>
                <span className="w-7 text-center text-sm font-black text-white/50">{p.rank}</span>
                {p.photo ? <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-white/10" />}
                <span className="flex-1 min-w-0 truncate text-sm font-bold">{p.name}</span>
                {board === 'all' ? <span className="text-sm font-black tabular-nums">{p.score.toLocaleString()}</span> : (
                  <span className="text-right"><span className="block text-sm font-black tabular-nums">{p.rating}</span><span className="block text-[10px] text-white/40">{p.wins}-{p.losses}-{p.draws}</span></span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
