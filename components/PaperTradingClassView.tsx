/**
 * PaperTradingClassView — the educator view of the practice portfolio.
 *
 * A teacher picks one of their classrooms and reads the whole class's REASONING side by side.
 * That ordering is the design: the reasoning journals are the top-level content and the returns
 * are a secondary column, because a class ranked by return teaches students that the goal is to
 * beat each other, which is the opposite of the lesson.
 *
 * Honest-by-construction rules held throughout:
 *  • A learner with no portfolio renders as "hasn't opened one" — never as a zero, never dropped
 *    from the list. A teacher must be able to see who has not started.
 *  • Returns are always shown against the same-period benchmark. A green number in a rising market
 *    is not evidence of skill and this view refuses to imply it is.
 *  • There is no leaderboard and no class ranking by return. The sortable signals are
 *    participation and reflection.
 *  • Reads are cloud-only (loadPortfolioCloud), so a teacher can never be shown their own cached
 *    portfolio under a student's name.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Users, RefreshCw, MessageSquareQuote, AlertCircle, ShieldCheck } from 'lucide-react';
import { fetchClassrooms } from '../services/backendService';
import { fetchUserProfiles } from '../services/backendService';
import { loadClassPortfolios, type ClassPortfolioRow, BENCHMARK, STARTING_CASH, fmtMoney } from '../services/paperTradingService';
import type { Classroom } from '../types';

const ACCENT = '#06D6A0';

type SortKey = 'name' | 'trades' | 'reviewed' | 'reasoning';

const Chip: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
    style={{ background: `${tone || '#ffffff'}1A`, color: tone || 'rgba(255,255,255,0.6)' }}
  >
    {children}
  </span>
);

const PaperTradingClassView: React.FC<{ onBack: () => void; user?: any }> = ({ onBack, user }) => {
  const uid = user?.uid;
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [rows, setRows] = useState<ClassPortfolioRow[]>([]);
  const [benchmarkPct, setBenchmarkPct] = useState<number | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('name');

  // Only classes this user owns. A teacher does not get to read another teacher's roster.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await fetchClassrooms();
        const mine = (all || []).filter((c: Classroom) => c.ownerId === uid);
        if (!alive) return;
        setClasses(mine);
        setSelectedId(mine[0]?.id || '');
      } catch { /* rendered as the empty state below */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [uid]);

  const selected = useMemo(() => classes.find(c => c.id === selectedId) || null, [classes, selectedId]);

  const load = useCallback(async (c: Classroom) => {
    setBusy(true);
    try {
      const uids = c.enrolledStudents || [];
      const [res, profiles] = await Promise.all([
        loadClassPortfolios(uids),
        fetchUserProfiles(uids).catch(() => []),
      ]);
      setRows(res.rows);
      setBenchmarkPct(res.benchmarkPct);
      setNames(Object.fromEntries((profiles || []).map((p: any) => [p.uid || p.id, p.displayName || p.username || 'Student'])));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (selected) void load(selected); }, [selected, load]);

  const nameOf = (u: string) => names[u] || `${u.slice(0, 6)}…`;

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === 'trades') copy.sort((a, b) => b.trades - a.trades);
    else if (sort === 'reviewed') copy.sort((a, b) => b.reviewed - a.reviewed);
    else if (sort === 'reasoning') copy.sort((a, b) => b.medianReasonChars - a.medianReasonChars);
    else copy.sort((a, b) => nameOf(a.uid).localeCompare(nameOf(b.uid)));
    return copy;
  }, [rows, sort, names]);

  const started = rows.filter(r => r.portfolio);
  const notStarted = rows.length - started.length;
  const totalTrades = rows.reduce((n, r) => n + r.trades, 0);
  const totalReviewed = rows.reduce((n, r) => n + r.reviewed, 0);
  const thinReasoning = started.filter(r => r.trades > 0 && r.medianReasonChars < 40);
  const oneHolding = started.filter(r => r.trades >= 3 && r.distinctHoldings === 1);

  return (
    <div className="min-h-full bg-[#08070c] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.14] p-6 sm:p-8"
          style={{ background: 'linear-gradient(120deg, rgba(6,214,160,0.18), rgba(107,0,153,0.14) 60%, transparent)' }}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: ACCENT }}>
            Plajah Academia · Educator view
          </p>
          <h1 className="mt-3 text-4xl font-black italic uppercase leading-[0.95] tracking-tight sm:text-5xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
            The Class Journal
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            Every learner's written reasoning, side by side. Returns are shown against {BENCHMARK} over
            the same period and the class is never ranked by them — a green number in a rising market
            is the tide, not the student.
          </p>
        </div>

        {/* Class picker */}
        {loading ? (
          <p className="mt-8 text-sm text-white/40">Loading your classes…</p>
        ) : classes.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[14px] font-bold text-white">No classrooms yet</p>
            <p className="mt-2 text-[13px] leading-relaxed text-white/55">
              This view reads the roster of a classroom you own. Create a class and enrol students,
              then their practice portfolios appear here. Nothing is shown for learners outside your
              own roster.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {classes.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-bold transition-all"
                  style={{
                    background: c.id === selectedId ? `${ACCENT}26` : 'rgba(255,255,255,0.05)',
                    color: c.id === selectedId ? '#fff' : 'rgba(255,255,255,0.55)',
                    boxShadow: c.id === selectedId ? `inset 0 0 0 1px ${ACCENT}88` : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
                  }}
                >
                  <Users size={12} /> {c.title}
                  <span className="text-white/35">{(c.enrolledStudents || []).length}</span>
                </button>
              ))}
              <button
                onClick={() => selected && load(selected)}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-white/60 disabled:opacity-40"
              >
                <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {/* Class signals — participation and reflection, never a ranking */}
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              {[
                { k: 'Opened a portfolio', v: `${started.length} / ${rows.length}` },
                { k: 'Trades placed', v: String(totalTrades) },
                { k: 'Trades reviewed', v: `${totalReviewed} / ${totalTrades}` },
                { k: `${BENCHMARK} this period`, v: benchmarkPct === null ? '—' : `${benchmarkPct > 0 ? '+' : ''}${benchmarkPct}%` },
              ].map(s => (
                <div key={s.k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{s.k}</p>
                  <p className="mt-1.5 text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.v}</p>
                </div>
              ))}
            </div>

            {/* Things worth a teacher's attention — stated as patterns to ask about, not verdicts */}
            {(notStarted > 0 || thinReasoning.length > 0 || oneHolding.length > 0) && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                  <AlertCircle size={12} /> Worth asking about
                </p>
                <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-white/65">
                  {notStarted > 0 && <li>{notStarted} learner{notStarted === 1 ? '' : 's'} {notStarted === 1 ? 'has' : 'have'} not opened a portfolio yet.</li>}
                  {thinReasoning.length > 0 && (
                    <li>
                      {thinReasoning.length} {thinReasoning.length === 1 ? 'learner is' : 'learners are'} writing very short reasons
                      ({thinReasoning.map(r => nameOf(r.uid)).join(', ')}). The reason is the assignment — a one-line
                      entry is a trade without a thesis.
                    </li>
                  )}
                  {oneHolding.length > 0 && (
                    <li>
                      {oneHolding.length} {oneHolding.length === 1 ? 'learner has' : 'learners have'} traded several times but hold a single
                      instrument ({oneHolding.map(r => nameOf(r.uid)).join(', ')}). Good opening for the diversification lesson.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Sort — deliberately no "return" option */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Sort by</span>
              {([['name', 'Name'], ['trades', 'Trades'], ['reviewed', 'Reflections'], ['reasoning', 'Depth of reasoning']] as [SortKey, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className="h-7 rounded-full px-2.5 text-[11px] font-bold transition-all"
                  style={{
                    background: sort === k ? `${ACCENT}26` : 'rgba(255,255,255,0.05)',
                    color: sort === k ? '#fff' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* The journals */}
            <div className="mt-4 space-y-3">
              {sorted.length === 0 && (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[13px] text-white/45">
                  No students are enrolled in this class yet.
                </p>
              )}

              {sorted.map(r => {
                const open = openUid === r.uid;
                const vsBench = r.returnPct !== null && benchmarkPct !== null ? Math.round((r.returnPct - benchmarkPct) * 100) / 100 : null;
                return (
                  <div key={r.uid} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                    <button
                      onClick={() => setOpenUid(open ? null : r.uid)}
                      className="flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="min-w-[140px] text-[14px] font-bold text-white">{nameOf(r.uid)}</span>

                      {!r.portfolio ? (
                        <Chip>hasn't opened one</Chip>
                      ) : (
                        <>
                          <Chip tone={ACCENT}>{r.trades} trade{r.trades === 1 ? '' : 's'}</Chip>
                          <Chip tone={r.reviewed === r.trades && r.trades > 0 ? ACCENT : '#F59E0B'}>
                            {r.reviewed}/{r.trades} reviewed
                          </Chip>
                          <span className="text-[11px] text-white/35">
                            median reason {r.medianReasonChars} chars
                          </span>
                          <span className="ml-auto text-right">
                            <span className="block text-[13px] font-bold text-white">{r.total === null ? '—' : fmtMoney(r.total)}</span>
                            <span className="block text-[11px] text-white/40">
                              {r.returnPct === null ? '' : `${r.returnPct > 0 ? '+' : ''}${r.returnPct}%`}
                              {vsBench !== null && ` · vs ${BENCHMARK} ${vsBench > 0 ? '+' : ''}${vsBench}`}
                            </span>
                          </span>
                        </>
                      )}
                    </button>

                    {open && r.portfolio && (
                      <div className="border-t border-white/10 p-4">
                        {r.portfolio.trades.length === 0 ? (
                          <p className="text-[13px] text-white/45">Portfolio opened, no trades placed yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {r.portfolio.trades.map(t => (
                              <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                                <p className="text-[12px] font-bold text-white/80">
                                  {t.side} {t.shares} × {t.symbol}
                                  <span className="ml-2 font-normal text-white/35">@ {fmtMoney(t.price)}</span>
                                </p>
                                <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-white/75">
                                  <MessageSquareQuote size={13} className="mt-0.5 shrink-0 text-white/25" />
                                  {t.reason}
                                </p>
                                {t.review ? (
                                  <p className="mt-2.5 rounded-lg border-l-2 p-2.5 text-[12px] leading-relaxed text-white/60" style={{ borderColor: ACCENT, background: 'rgba(255,255,255,0.03)' }}>
                                    <span className="font-black uppercase tracking-wider text-white/30">Looking back · </span>
                                    {t.review}
                                  </p>
                                ) : (
                                  <p className="mt-2 text-[11px] text-white/25">Not yet reviewed.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-white/30">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" />
              Virtual money only — every portfolio starts at {fmtMoney(STARTING_CASH)} and no real funds are
              involved at any point. This view shows only learners enrolled in a classroom you own. There is
              deliberately no ranking by return: the assessable work is the reasoning and the reflection.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default PaperTradingClassView;
