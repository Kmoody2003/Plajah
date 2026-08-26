/**
 * PaperTradingView — the practice portfolio.
 *
 * Virtual cash, real live prices, and one rule the rest of the industry does not enforce: every
 * trade requires a written reason, and the journal shows it back to you afterwards so you can
 * review your own thinking. The headline figure is deliberately your return *against a benchmark*
 * rather than your raw return, because a learner in a rising market should not mistake the tide
 * for skill.
 *
 * Serves School of Money Strand 3 and School of Economics (Markets & Prices).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, TrendingUp, RefreshCw, ShieldCheck, BookOpen, Users } from 'lucide-react';
import {
  type PaperPortfolio, type PortfolioValuation,
  newPortfolio, loadPortfolio, savePortfolio, placeOrder, reviewTrade,
  valuePortfolio, stampBenchmarkStart, TRAINING_WHEELS, BENCHMARK, STARTING_CASH, fmtMoney,
} from '../services/paperTradingService';
import { fetchStockQuotes } from '../services/stockQuoteService';

const ACCENT = '#06D6A0';

const PaperTradingView: React.FC<{ onBack: () => void; user?: any }> = ({ onBack, user }) => {
  const uid = user?.uid || 'guest';
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(null);
  const [val, setVal] = useState<PortfolioValuation | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [symbol, setSymbol] = useState(TRAINING_WHEELS[0].symbol);
  const [shares, setShares] = useState('1');
  const [reason, setReason] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load or create, then stamp the benchmark so the comparison is honest from day one.
  useEffect(() => {
    let alive = true;
    (async () => {
      const existing = await loadPortfolio(uid);
      let p = existing || savePortfolio(newPortfolio(uid));
      p = await stampBenchmarkStart(p);
      if (alive) setPortfolio(p);
    })();
    return () => { alive = false; };
  }, [uid]);

  const refresh = useCallback(async (p: PaperPortfolio) => {
    setBusy(true);
    try {
      const [v, quotes] = await Promise.all([
        valuePortfolio(p),
        fetchStockQuotes(TRAINING_WHEELS.map(t => t.symbol)),
      ]);
      setVal(v);
      setPrices(Object.fromEntries(quotes.map(q => [q.symbol, q.price])));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (portfolio) void refresh(portfolio); }, [portfolio, refresh]);

  const submit = () => {
    if (!portfolio) return;
    const price = prices[symbol];
    if (!price) { setError('No live price for that instrument right now — try refreshing.'); return; }
    const res = placeOrder(portfolio, side, symbol, Number(shares), price, reason);
    if (!res.ok) { setError(res.error || 'That order could not be placed.'); return; }
    setError(null); setReason(''); setPortfolio(res.portfolio);
  };

  if (!portfolio) {
    return <div className="min-h-full bg-[#08070c] p-8 text-white/50">Loading your practice portfolio…</div>;
  }

  const ahead = val?.vsBenchmarkPct != null && val.vsBenchmarkPct >= 0;

  return (
    <div className="min-h-full bg-[#08070c] text-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-white/40 transition-colors hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.14] p-6 sm:p-8"
          style={{ background: 'linear-gradient(120deg, rgba(6,214,160,0.20), rgba(59,130,246,0.14) 60%, transparent)' }}>
          <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: ACCENT }}>
            Plajah Academia · Practice Portfolio
          </p>
          <h1 className="mt-3 text-4xl font-black italic uppercase leading-[0.95] tracking-tight sm:text-5xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Paper Trading
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            Virtual money, real prices. Every trade asks you to write down why — then shows it back to
            you later, so you can mark your own reasoning rather than just your returns.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: <ShieldCheck size={12} />, label: 'No real money · no brokerage link' },
              { icon: <BookOpen size={12} />, label: 'Every trade needs a written reason' },
              { icon: <TrendingUp size={12} />, label: `Measured against ${BENCHMARK}, not just up-or-down` },
            ].map(c => (
              <span key={c.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70">
                {c.icon}{c.label}
              </span>
            ))}
          </div>
          {/* Educators reach the class journal from here. Gated on the same teacher signal the
              profile header uses, so a student never sees a door into other learners' work. */}
          {(user?.accountType === 'TEACHER' || user?.isTeacher || (!!user?.teacherVerification && user.teacherVerification !== 'UNVERIFIED')) && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'PAPER_TRADING_CLASS' } }))}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-black uppercase tracking-wider text-[#04231b]"
              style={{ background: ACCENT }}
            >
              <Users size={14} /> Open the class journal
            </button>
          )}

          <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/35">
            Education only — nothing here is investment advice or a recommendation. Prices are
            indicative and may be delayed.
          </p>
        </div>

        {/* Value + the honest comparison */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { k: 'Total value', v: val ? fmtMoney(val.total) : '—', sub: `started at ${fmtMoney(STARTING_CASH)}` },
            { k: 'Cash', v: fmtMoney(portfolio.cash), sub: `${Object.keys(portfolio.holdings).length} position(s)` },
            { k: 'Your return', v: val ? `${val.returnPct > 0 ? '+' : ''}${val.returnPct}%` : '—', sub: 'since you started' },
            {
              k: `vs ${BENCHMARK}`,
              v: val?.vsBenchmarkPct == null ? '—' : `${val.vsBenchmarkPct > 0 ? '+' : ''}${val.vsBenchmarkPct}%`,
              sub: val?.benchmarkPct == null ? 'benchmark unavailable' : `benchmark ${val.benchmarkPct > 0 ? '+' : ''}${val.benchmarkPct}%`,
              highlight: true,
            },
          ].map(c => (
            <div key={c.k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{c.k}</p>
              <p className="mt-1.5 text-2xl font-black tabular-nums"
                style={{ color: c.highlight ? (ahead ? ACCENT : '#F87171') : '#fff', fontFamily: 'Outfit, sans-serif' }}>
                {c.v}
              </p>
              <p className="mt-0.5 text-[11px] text-white/35">{c.sub}</p>
            </div>
          ))}
        </div>

        {val?.vsBenchmarkPct != null && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] leading-relaxed text-white/55">
            {ahead
              ? `You are ahead of simply holding ${BENCHMARK} over the same period. Before concluding you have skill, ask how many trades that took, and whether you would have said the same thing in advance.`
              : `Holding ${BENCHMARK} and doing nothing would have done better over this period. That is the most common result in this exercise — and it is the lesson, not a failure.`}
          </p>
        )}

        {/* Trade ticket */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-white/70">Place a trade</h2>
            <button onClick={() => portfolio && refresh(portfolio)} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-white/60 disabled:opacity-40">
              <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Refresh prices
            </button>
          </div>

          {portfolio.trainingWheels && (
            <p className="mt-2 rounded-lg bg-white/[0.04] p-2.5 text-[11px] text-white/45">
              Training wheels are on: broad funds only. The lesson at this stage is diversification and
              time, not picking winners.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-[110px_1fr_110px]">
            <div className="flex gap-1.5">
              {(['BUY', 'SELL'] as const).map(s => (
                <button key={s} onClick={() => setSide(s)}
                  className="h-10 flex-1 rounded-xl text-[12px] font-black uppercase"
                  style={{ background: side === s ? ACCENT : 'rgba(255,255,255,0.05)', color: side === s ? '#04231b' : 'rgba(255,255,255,0.55)' }}>
                  {s}
                </button>
              ))}
            </div>
            <select value={symbol} onChange={e => setSymbol(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[13px] text-white">
              {TRAINING_WHEELS.map(t => (
                <option key={t.symbol} value={t.symbol} className="bg-[#12111a]">
                  {t.symbol} — {t.label}{prices[t.symbol] ? ` · ${fmtMoney(prices[t.symbol])}` : ''}
                </option>
              ))}
            </select>
            <input type="number" min={1} value={shares} onChange={e => setShares(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[13px] text-white" placeholder="Shares" />
          </div>

          <p className="mt-2 text-[11px] text-white/40">
            {TRAINING_WHEELS.find(t => t.symbol === symbol)?.note}
          </p>

          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="Why are you making this trade? Write the reason you would want to read back in six months."
            className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-[13px] text-white placeholder:text-white/25" />

          {error && <p className="mt-2 rounded-lg bg-red-500/10 p-2.5 text-[12px] text-red-300">{error}</p>}

          <button onClick={submit}
            className="mt-3 h-11 w-full rounded-xl text-[13px] font-black uppercase tracking-wider text-[#04231b]"
            style={{ background: ACCENT }}>
            {side === 'BUY' ? 'Buy' : 'Sell'} {shares || 0} × {symbol}
            {prices[symbol] ? ` · ${fmtMoney(Number(shares || 0) * prices[symbol])}` : ''}
          </button>
        </div>

        {/* Positions */}
        {val && val.positions.length > 0 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-white/70">Holdings</h2>
            {val.positions.map(p => (
              <div key={p.symbol} className="flex items-center gap-3 border-t border-white/5 py-2.5 first:border-t-0">
                <span className="w-16 font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{p.symbol}</span>
                <span className="text-[12px] text-white/45">{p.shares} × {fmtMoney(p.price)}</span>
                <span className="ml-auto tabular-nums font-bold">{fmtMoney(p.value)}</span>
                <span className="w-16 text-right text-[12px] tabular-nums"
                  style={{ color: p.changePct >= 0 ? ACCENT : '#F87171' }}>
                  {p.changePct > 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* The journal — the actual pedagogy */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-white/70">Your reasoning journal</h2>
          <p className="mt-1 text-[12px] text-white/40">
            Come back to these. Marking your own past reasoning is worth more than any single result.
          </p>
          {portfolio.trades.length === 0 ? (
            <p className="mt-4 text-[13px] text-white/30">No trades yet. Your first reason will appear here.</p>
          ) : (
            portfolio.trades.map(t => (
              <div key={t.id} className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                    style={{ background: t.side === 'BUY' ? 'rgba(6,214,160,0.18)' : 'rgba(248,113,113,0.18)', color: t.side === 'BUY' ? ACCENT : '#F87171' }}>
                    {t.side}
                  </span>
                  <span className="font-bold">{t.shares} × {t.symbol}</span>
                  <span className="text-white/40">at {fmtMoney(t.price)}</span>
                  <span className="ml-auto text-white/30">{new Date(t.at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-[13px] italic text-white/70">“{t.reason}”</p>
                {t.review ? (
                  <p className="mt-2 rounded-lg bg-white/[0.04] p-2.5 text-[12px] text-white/55">
                    <span className="font-bold text-white/70">Looking back: </span>{t.review}
                  </p>
                ) : (
                  <button
                    onClick={() => {
                      const r = window.prompt('Looking back at this trade — was your reasoning sound? What do you know now that you did not then?');
                      if (r && r.trim()) setPortfolio(reviewTrade(portfolio, t.id, r));
                    }}
                    className="mt-2 text-[11px] font-bold text-white/40 underline hover:text-white/70">
                    Review this reasoning →
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PaperTradingView;
