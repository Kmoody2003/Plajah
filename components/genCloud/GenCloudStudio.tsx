// components/genCloud/GenCloudStudio.tsx — the Plajah Cloud generate panel (images, video, voice).
//
// One panel for every room: Tela, Reello and Fabula open it through openGenCloud() with an onUse
// callback that drops results into their own canvas / upload queue / bin. Users see Plajah engine
// names and credits only. Two tabs: Create (engine, prompt, options, live quote, results) and
// Credits (balance by source + packs via Stripe Checkout). Local generation stays free in each room;
// this panel is only the paid cloud lane.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Coins, Download, Film, Image as ImageIcon, Loader2, Lock, Mic, Sparkles, X } from 'lucide-react';
import { genCloud, failed, PLAN_LABEL, type BalanceView, type EngineView, type GenBody, type JobOutput, type JobView, type PackView } from '../../services/genCloud/client';
import type { GenCloudOpenRequest } from '../../services/genCloud/open';
import type { GenKind, Resolution } from '../../services/genCloud/types';

type Tab = 'create' | 'credits';
type Aspect = NonNullable<GenBody['aspect']>;

const KIND_META: Record<GenKind, { label: string; icon: React.ReactNode }> = {
  image: { label: 'Image', icon: <ImageIcon size={15} /> },
  video: { label: 'Video', icon: <Film size={15} /> },
  voice: { label: 'Voice', icon: <Mic size={15} /> },
};
const ASPECTS: Aspect[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const SOURCE_LABEL: Record<string, string> = { tela: 'Tela', reello: 'Reello', fabula: 'Fabula' };

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const lockText = (e: EngineView) =>
  e.reason === 'adult_only' ? 'Verified adults only'
    : e.reason === 'restricted_account' ? 'Not available on this account'
      : e.lane === 'premium' ? `Needs ${PLAN_LABEL[e.upgradeTo || ''] || 'a higher plan'}`
        : `Needs ${PLAN_LABEL[e.upgradeTo || ''] || 'a higher plan'} or a credit pack`;

export interface GenCloudStudioProps { request: GenCloudOpenRequest; notice?: string | null; onClose: () => void }

export default function GenCloudStudio({ request, notice, onClose }: GenCloudStudioProps) {
  const [tab, setTab] = useState<Tab>(request.tab ?? 'create');
  const [engines, setEngines] = useState<EngineView[] | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [packs, setPacks] = useState<{ onSale: boolean; packs: PackView[] } | null>(null);
  const [closed, setClosed] = useState<string | null>(null);   // service off / signed out
  const [kind, setKind] = useState<GenKind>(request.kinds?.[0] ?? 'image');
  const [engineId, setEngineId] = useState('');
  const [prompt, setPrompt] = useState(request.prompt ?? '');
  const [text, setText] = useState('');
  const [aspect, setAspect] = useState<Aspect>(request.aspect ?? (request.kinds?.[0] === 'video' ? '16:9' : '1:1'));
  const [count, setCount] = useState(1);
  const [seconds, setSeconds] = useState<number | undefined>();
  const [resolution, setResolution] = useState<Resolution | undefined>();
  const [quote, setQuote] = useState<number | null>(null);
  const [err, setErr] = useState<{ text: string; buy?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [buying, setBuying] = useState('');

  const refreshBalance = useCallback(async () => {
    const b = await genCloud.balance();
    if (!failed(b)) setBalance(b);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [e, b, p] = await Promise.all([genCloud.engines(), genCloud.balance(), genCloud.packs()]);
      if (!alive) return;
      if (failed(e)) { setClosed(e.httpStatus === 401 ? 'Sign in to use Plajah Cloud.' : e.code === 'gencloud_off' ? 'Plajah Cloud isn’t open yet. Local generation in each room stays free.' : e.error); return; }
      setEngines(e.engines);
      if (!failed(b)) setBalance(b);
      if (!failed(p)) setPacks({ onSale: p.onSale, packs: p.packs });
    })();
    return () => { alive = false; };
  }, []);

  const kinds = useMemo(() => {
    const present = new Set((engines ?? []).map(e => e.kind));
    return (['image', 'video', 'voice'] as GenKind[]).filter(k => present.has(k) && (!request.kinds || request.kinds.includes(k)));
  }, [engines, request.kinds]);

  const list = useMemo(() => (engines ?? []).filter(e => e.kind === kind), [engines, kind]);
  const engine = list.find(e => e.id === engineId) ?? list.find(e => e.allowed) ?? list[0];

  // Keep options valid for the chosen engine.
  useEffect(() => {
    if (!engine) return;
    if (engine.id !== engineId) setEngineId(engine.id);
    if (engine.durations && (seconds === undefined || !engine.durations.includes(seconds))) setSeconds(engine.durations[0]);
    if (engine.resolutions && (resolution === undefined || !engine.resolutions.includes(resolution))) setResolution(engine.resolutions[engine.resolutions.length > 1 ? 1 : 0]);
  }, [engine, engineId, seconds, resolution]);

  const body = useMemo((): GenBody | null => {
    if (!engine) return null;
    if (engine.kind === 'voice') return { engine: engine.id, prompt: '', text };
    if (engine.kind === 'video') return { engine: engine.id, prompt, seconds, resolution, aspect };
    return { engine: engine.id, prompt, count, aspect };
  }, [engine, prompt, text, seconds, resolution, aspect, count]);

  const ready = !!body && !!engine?.allowed && (engine.kind === 'voice' ? text.trim().length > 0 : prompt.trim().length > 0);

  // Live price, from the server (the one source of truth), debounced.
  const quoteSeq = useRef(0);
  useEffect(() => {
    setQuote(null);
    if (!body || !engine?.allowed) return;
    if (engine.kind === 'voice' && !text.trim()) return;
    const seq = ++quoteSeq.current;
    const t = setTimeout(async () => {
      const q = await genCloud.quote({ ...body, prompt: body.prompt || 'x' });
      if (seq === quoteSeq.current && !failed(q)) setQuote(q.credits);
    }, 300);
    return () => clearTimeout(t);
  }, [body, engine]);

  // Poll running jobs.
  useEffect(() => {
    if (!jobs.some(j => j.status === 'queued' || j.status === 'running')) return;
    const t = setInterval(async () => {
      const next = await Promise.all(jobs.map(async j => {
        if (j.status !== 'queued' && j.status !== 'running') return j;
        const r = await genCloud.job(j.id);
        return failed(r) ? j : r.job;
      }));
      setJobs(next);
      if (next.some((j, i) => j.status !== jobs[i].status)) void refreshBalance();
    }, 4000);
    return () => clearInterval(t);
  }, [jobs, refreshBalance]);

  const generate = async () => {
    if (!body || !ready || busy) return;
    setBusy(true); setErr(null);
    const r = await genCloud.submit(body);
    setBusy(false);
    if (failed(r)) {
      setErr(r.code === 'insufficient' ? { text: 'Not enough credits for this one.', buy: true } : { text: r.error });
      return;
    }
    setJobs(js => [r.job, ...js]);
    void refreshBalance();
  };

  const use = async (j: JobView) => {
    if (!request.onUse) return;
    try {
      await request.onUse(j.outputs, { engine: j.engine, prompt });
      setUsed(s => new Set(s).add(j.id));
    } catch { setErr({ text: 'Couldn’t add that result. Try again or download it.' }); }
  };

  const buy = async (p: PackView) => {
    setBuying(p.id); setErr(null);
    const r = await genCloud.checkout(p.id);
    if (failed(r)) { setBuying(''); setErr({ text: r.error }); return; }
    window.location.assign(r.url);
  };

  const engineName = (id: string) => engines?.find(e => e.id === id)?.name ?? 'Generation';

  return (
    <div className="fixed inset-0 z-[10050] bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Plajah Cloud">
      <div className="relative w-full max-w-5xl h-full sm:h-[min(90vh,860px)] bg-[#07060a] sm:rounded-3xl border border-white/10 flex flex-col overflow-hidden text-white">
        <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 border-b border-white/10">
          <Sparkles size={18} className="text-[#7fe3f5] shrink-0 hidden sm:block" />
          <h2 className="text-base sm:text-lg font-bold whitespace-nowrap"><span className="hidden sm:inline">Plajah </span>Cloud{request.source && SOURCE_LABEL[request.source] ? <span className="text-white/40 font-normal text-sm hidden sm:inline"> · for {SOURCE_LABEL[request.source]}</span> : null}</h2>
          <nav className="flex gap-0.5 sm:gap-1 sm:ml-2">
            {(['create', 'credits'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 sm:px-3 py-1.5 rounded-full text-sm ${tab === t ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}>{t === 'create' ? 'Create' : 'Credits'}</button>
            ))}
          </nav>
          {balance && (
            <button onClick={() => setTab('credits')} className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm" title="Your credits">
              <Coins size={14} className="text-amber-300" /><span className="tabular-nums font-semibold">{balance.available.toLocaleString()}</span><span className="text-white/50 hidden sm:inline">credits</span>
            </button>
          )}
          <button onClick={onClose} className={`${balance ? '' : 'ml-auto '}shrink-0 p-1.5 sm:p-2 rounded-full hover:bg-white/10`} aria-label="Close"><X size={20} /></button>
        </header>

        {(notice || err) && (
          <div className={`mx-4 sm:mx-6 mt-3 flex flex-wrap items-center gap-3 p-3 rounded-xl text-sm border ${err ? 'bg-rose-500/10 border-rose-400/30' : 'bg-emerald-500/10 border-emerald-400/30'}`}>
            {err ? <AlertCircle size={16} className="text-rose-300 shrink-0" /> : <Check size={16} className="text-emerald-300 shrink-0" />}
            <span className="flex-1 min-w-[12rem]">{err ? err.text : notice}</span>
            {err?.buy && <button onClick={() => { setTab('credits'); setErr(null); }} className="px-3 py-1.5 rounded-full bg-amber-300 text-black text-xs font-bold">Get credits</button>}
            {err && <button onClick={() => setErr(null)} className="text-white/50 hover:text-white" aria-label="Dismiss"><X size={14} /></button>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {closed ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <Sparkles size={28} className="text-white/30" />
              <p className="text-white/70 max-w-sm">{closed}</p>
            </div>
          ) : !engines ? (
            <div className="h-full flex items-center justify-center text-white/50"><Loader2 className="animate-spin" size={22} /></div>
          ) : tab === 'create' ? (
            <div className="grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-0 md:divide-x divide-white/10 min-h-full">
              {/* ── Controls ── */}
              <section className="p-4 sm:p-6 space-y-5">
                {kinds.length > 1 && (
                  <div className="flex gap-1 p-1 rounded-full bg-white/5 w-fit">
                    {kinds.map(k => (
                      <button key={k} onClick={() => { setKind(k); setEngineId(''); }} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${kind === k ? 'bg-white text-black font-semibold' : 'text-white/70 hover:text-white'}`}>{KIND_META[k].icon}{KIND_META[k].label}</button>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wider text-white/40">Engine</div>
                  <div className="grid gap-2">
                    {list.map(e => {
                      const on = engine?.id === e.id;
                      const from = Math.min(...Object.values(e.credits).filter((n): n is number => typeof n === 'number'));
                      return (
                        <button key={e.id} onClick={() => setEngineId(e.id)} className={`text-left p-3 rounded-xl border transition ${on ? 'border-[#7fe3f5] bg-[#00B4D8]/10' : 'border-white/10 hover:border-white/25'} ${e.allowed ? '' : 'opacity-60'}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{e.name}</span>
                            {e.lane === 'premium' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200">Premium</span>}
                            {e.audio && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">Sound</span>}
                            <span className="ml-auto text-xs text-white/50 tabular-nums">from {from}{e.kind === 'video' ? '/s' : e.kind === 'voice' ? '/min' : ''}</span>
                          </div>
                          <div className="text-xs text-white/55 mt-0.5">{e.blurb}</div>
                          {!e.allowed && <div className="text-xs text-amber-200/90 mt-1 inline-flex items-center gap-1"><Lock size={11} />{lockText(e)}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {engine?.kind === 'voice' ? (
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-wider text-white/40">Text to speak</span>
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={6} maxLength={20000} placeholder="Type what the voice should say…" className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#7fe3f5]" />
                  </label>
                ) : (
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-wider text-white/40">Describe it</span>
                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} maxLength={4000} placeholder={kind === 'video' ? 'A slow push-in on a lighthouse at dusk, waves below…' : 'A watercolor fox in a snowy forest…'} className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#7fe3f5]"
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void generate(); }} />
                  </label>
                )}

                {engine && engine.kind !== 'voice' && (
                  <div className="space-y-3">
                    <Row label="Shape">{ASPECTS.map(a => <Chip key={a} on={aspect === a} onClick={() => setAspect(a)}>{a}</Chip>)}</Row>
                    {engine.kind === 'image' && <Row label="How many">{[1, 2, 3, 4].map(n => <Chip key={n} on={count === n} onClick={() => setCount(n)}>{n}</Chip>)}</Row>}
                    {engine.durations && <Row label="Length">{engine.durations.map(s => <Chip key={s} on={seconds === s} onClick={() => setSeconds(s)}>{s}s</Chip>)}</Row>}
                    {engine.resolutions && engine.resolutions.length > 1 && <Row label="Quality">{engine.resolutions.map(r => <Chip key={r} on={resolution === r} onClick={() => setResolution(r)}>{r}</Chip>)}</Row>}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button onClick={() => void generate()} disabled={!ready || busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00B4D8] text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}Generate
                  </button>
                  <span className="text-sm text-white/60 tabular-nums">{quote !== null ? <>{quote.toLocaleString()} credits</> : null}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-white/40">You’re only charged when a result comes back. Everything made here is labelled as AI-generated.</p>
              </section>

              {/* ── Results ── */}
              <section className="p-4 sm:p-6">
                {jobs.length === 0 ? (
                  <div className="h-full min-h-[14rem] flex flex-col items-center justify-center text-center text-white/40 gap-2">
                    <Sparkles size={26} />
                    <p className="text-sm max-w-xs">Your results show up here.{request.onUse ? ` Press “${request.useLabel || 'Use'}” to bring one into your work.` : ''}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {jobs.map(j => (
                      <article key={j.id} className="rounded-2xl border border-white/10 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/60 border-b border-white/10">
                          <span className="font-semibold text-white/80">{engineName(j.engine)}</span>
                          <span>·</span>
                          <span className="tabular-nums">{j.credits} credits</span>
                          <span className="ml-auto">
                            {j.status === 'succeeded' ? <span className="text-emerald-300">Done</span>
                              : j.status === 'failed' ? <span className="text-rose-300">Didn’t work · not charged</span>
                                : <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Working…</span>}
                          </span>
                        </div>
                        {j.status === 'failed' && j.error && <p className="px-3 py-2 text-sm text-white/60">{j.error}</p>}
                        {j.outputs.length > 0 && (
                          <div className={`grid gap-2 p-2 ${j.outputs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {j.outputs.map((o, i) => <Preview key={i} o={o} />)}
                          </div>
                        )}
                        {j.status === 'succeeded' && (
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-white/10">
                            {request.onUse && (
                              <button onClick={() => void use(j)} disabled={used.has(j.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-bold disabled:opacity-50">
                                {used.has(j.id) ? <><Check size={13} />Added</> : (request.useLabel || 'Use')}
                              </button>
                            )}
                            {j.outputs.map((o, i) => (
                              <a key={i} href={o.url} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/15 text-xs text-white/80 hover:text-white"><Download size={12} />{j.outputs.length > 1 ? `#${i + 1}` : 'Download'}</a>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* ── Credits ── */
            <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
              {balance && (
                <section className="rounded-2xl border border-white/10 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-3xl font-bold tabular-nums">{balance.available.toLocaleString()}</span>
                    <span className="text-white/60">credits available</span>
                    <span className="ml-auto text-sm text-white/50">Plan: <span className="text-white/80">{PLAN_LABEL[balance.plan] || balance.plan}</span></span>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                    <Stat label="From your plan" value={balance.monthly} />
                    <Stat label="Bonus" value={balance.bonus} />
                    <Stat label="Packs" value={balance.pack} />
                    <Stat label="In progress" value={balance.held} />
                  </dl>
                  {balance.frozen > 0 && <p className="mt-3 text-xs text-amber-200/90">{balance.frozen.toLocaleString()} plan credits are paused while your Plajah+ is inactive. Resubscribe within 30 days to keep them.</p>}
                </section>
              )}

              <section className="space-y-3">
                <h3 className="font-semibold">Credit packs</h3>
                {!packs?.onSale ? (
                  <p className="text-sm text-white/60">Credit packs aren’t on sale yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {packs.packs.map(p => (
                      <div key={p.id} className="rounded-2xl border border-white/10 p-4 flex items-center gap-3">
                        <div className="flex-1">
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-xs text-white/50">{p.bonusPct ? `${p.bonusPct}% bonus included` : 'Base value'}</div>
                        </div>
                        <button onClick={() => void buy(p)} disabled={!!buying} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-300 text-black text-sm font-bold disabled:opacity-50">
                          {buying === p.id ? <Loader2 size={14} className="animate-spin" /> : null}{money(p.priceCents)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-white/40">Credits work with every Plajah Cloud engine. Pack credits last 12 months and can’t be cashed out or transferred. Plan credits arrive each month with Plajah+ and roll over for a limited time. Local generation in Tela, Fabula and the Plajah app is always free.</p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs uppercase tracking-wider text-white/40">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs tabular-nums border ${on ? 'bg-white text-black border-white font-semibold' : 'border-white/15 text-white/70 hover:text-white'}`}>{children}</button>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

function Preview({ o }: { o: JobOutput }) {
  if (o.mime.startsWith('video/')) return <video src={o.url} controls playsInline className="w-full rounded-xl bg-black" />;
  if (o.mime.startsWith('audio/')) return <audio src={o.url} controls className="w-full" />;
  return <img src={o.url} alt="Generated result" className="w-full rounded-xl bg-white/5 object-contain" loading="lazy" />;
}
