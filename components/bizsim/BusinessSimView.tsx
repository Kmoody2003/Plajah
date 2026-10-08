import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Play, RotateCcw, Trophy, Landmark, ShieldCheck, BookOpen, ListChecks, Sparkles, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TIERS, INDUSTRIES, BADGES, tierDef, industryDef, EVENTS, QUESTS, eventById } from '../../data/bizSim/content';
import type { Tier, Industry } from '../../data/bizSim/types';
import { newGame, playTurn, resolveEvent, listDecisions, statements, report, levelOf, LEVELS, demandAt, capacityOf, availableQuests, ipScore, protectionScore, eventCashScale, type SimState, type Decision } from '../../services/bizSim/engine';
import { IP_LINKS } from '../../data/ipToolkit';
import IpToolkitPanel from './IpToolkitPanel';

/**
 * Venture Lab: a business simulation for every age, from a six-day lemonade stand to a two-year
 * venture with legal entities, trademarks, copyrights, patents and funding rounds. It is a simplified
 * teaching model; the real steps live in Praxis and the official links in the IP toolkit.
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void; onBack?: () => void }

const money = (n: number, kid = false) => (kid ? `${Math.round(n * 100) / 100}` : `$${Math.round(n).toLocaleString()}`);
const KID_INDUSTRIES: Industry[] = ['lemonade', 'shop'];
const BUILDER_INDUSTRIES: Industry[] = ['lemonade', 'shop', 'ecommerce', 'services', 'restaurant', 'publishing', 'music'];
const industriesFor = (t: Tier): Industry[] => (t === 'seedling' || t === 'sprout' ? KID_INDUSTRIES : t === 'builder' ? BUILDER_INDUSTRIES : INDUSTRIES.map(i => i.id));

function suggestTier(profile: any): Tier {
  const by = profile?.birthYear; if (!by) return profile?.accountType === 'TEACHER' || profile?.accountType === 'PARENT' ? 'executive' : 'founder';
  const age = new Date().getFullYear() - by; return age <= 8 ? 'seedling' : age <= 11 ? 'sprout' : age <= 14 ? 'builder' : age <= 18 ? 'founder' : 'executive';
}

const saveKey = (uid?: string) => `plajah:bizsim:${uid || 'guest'}`;
const loadSaved = (uid?: string): SimState | null => { try { const r = localStorage.getItem(saveKey(uid)); return r ? (JSON.parse(r) as SimState) : null; } catch { return null; } };
const persist = (uid: string | undefined, s: SimState | null) => { try { s ? localStorage.setItem(saveKey(uid), JSON.stringify(s)) : localStorage.removeItem(saveKey(uid)); } catch { /* private mode */ } };

const Bar: React.FC<{ label: string; v: number; color: string }> = ({ label, v, color }) => (
  <div><div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-white/45 mb-1"><span>{label}</span><span>{Math.round(v)}</span></div><div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full transition-all" style={{ width: `${Math.max(2, Math.min(100, v))}%`, background: color }} /></div></div>
);

const BusinessSimView: React.FC<Props> = ({ user, profile, onNavigate, onBack }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const [game, setGame] = useState<SimState | null>(() => loadSaved(uid));
  const [tier, setTier] = useState<Tier>(() => suggestTier(profile));
  const [industry, setIndustry] = useState<Industry>('lemonade');
  const [name, setName] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [priceIdx, setPriceIdx] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<'decide' | 'setup' | 'books' | 'protect' | 'log'>('decide');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => persist(uid, game), [game, uid]);
  useEffect(() => { if (!industriesFor(tier).includes(industry)) setIndustry(industriesFor(tier)[0]); }, [tier, industry]);

  const t = game ? tierDef(game.cfg.tier) : tierDef(tier);
  const ind = game ? industryDef(game.cfg.industry) : industryDef(industry);
  const kid = game ? game.cfg.tier === 'seedling' || game.cfg.tier === 'sprout' : tier === 'seedling' || tier === 'sprout';

  const decisions = useMemo(() => (game ? listDecisions(game) : []), [game]);
  const chosen = decisions.filter(d => picks.includes(d.id));
  const spend = chosen.filter(d => d.kind !== 'loan' && d.kind !== 'equity').reduce((a, d) => a + d.cost, 0);
  const financing = chosen.reduce((a, d) => a + (d.kind === 'loan' ? Number(d.desc.match(/Borrow (\d+)/)?.[1] || 0) : d.kind === 'equity' ? Number(d.desc.match(/Raise (\d+)/)?.[1] || 0) : 0), 0);
  const cashLeft = game ? game.cash + financing - spend : 0;
  const idx = priceIdx ?? (game ? Math.max(0, t.priceSteps.indexOf(1)) : 0);
  const price = game ? Math.round(ind.refPrice * t.priceSteps[idx] * 100) / 100 : 0;
  const preview = game ? Math.min(demandAt(game, price), capacityOf(game)) : 0;

  const start = () => { const g = newGame({ tier, industry, seed: Math.floor(Math.random() * 1e6), name: name.trim() || (kid ? 'My Shop' : 'My Venture') }); setGame(g); setPicks([]); setPriceIdx(undefined); setTab('decide'); setErrors([]); };
  const toggle = (d: Decision) => { if (d.disabled) return; setPicks(p => (p.includes(d.id) ? p.filter(x => x !== d.id) : [...p, d.id])); };
  const run = () => {
    if (!game) return; const out = playTurn(game, { picks, priceIdx: priceIdx ?? idx });
    if (!out.ok) { setErrors(out.errors); return; }
    setErrors([]); setGame(out.state); setPicks([]);
  };
  const choose = (i: number) => { if (game) setGame(resolveEvent(game, i)); };
  const restart = () => { persist(uid, null); setGame(null); setPicks([]); };

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!game) return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24"><div className="max-w-4xl mx-auto px-5 py-7">
      <div className="flex items-center gap-3 mb-2">{onBack && <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full grid place-items-center bg-white/5 hover:bg-white/10"><ArrowLeft size={18} /></button>}<p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#06D6A0]">Venture Lab</p></div>
      <h1 className="text-3xl font-black tracking-tight leading-[1.05]">Run a business. Make mistakes safely.</h1>
      <p className="text-white/55 text-sm mt-1 mb-6">Start a virtual business, set prices, protect your name and your work, handle surprises, and see what happens. It is a simplified model, built to teach, and the real steps are in Praxis.</p>
      <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45 mb-2">1. Pick your level</h2>
      <div className="grid sm:grid-cols-5 gap-2 mb-6">{TIERS.map(x => (
        <button key={x.id} type="button" aria-pressed={tier === x.id} onClick={() => setTier(x.id)} className={`text-left rounded-2xl border p-3 ${tier === x.id ? 'border-white bg-white/10' : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.07]'}`}><p className="font-black">{x.label}</p><p className="text-[10px] text-white/45">{x.ages}</p><p className="text-[11px] text-white/60 mt-1 leading-snug">{x.turns} {x.turnName.toLowerCase()}s</p></button>))}</div>
      <p className="text-[12px] text-white/55 -mt-3 mb-6">{tierDef(tier).blurb}</p>
      <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45 mb-2">2. Choose a business</h2>
      <div className="grid sm:grid-cols-3 gap-2 mb-6">{industriesFor(tier).map(id => { const x = industryDef(id); return (
        <button key={id} type="button" aria-pressed={industry === id} onClick={() => setIndustry(id)} className={`text-left rounded-2xl border p-3 ${industry === id ? 'border-white bg-white/10' : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.07]'}`}><span className="text-2xl">{x.emoji}</span><p className="font-black mt-1">{x.label}</p><p className="text-[11px] text-white/55 leading-snug">{x.blurb}</p></button>); })}</div>
      <label className="grid gap-1 max-w-sm text-[11px] font-black text-white/60 mb-6">3. Name your business<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sunny Lemonade" className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm text-white font-normal" /></label>
      <button type="button" onClick={start} className="rounded-full bg-[#06D6A0] text-black px-7 py-3 text-[14px] font-black inline-flex items-center gap-2"><Play size={16} /> Open for business</button>
    </div></div>
  );

  const st = statements(game); const lv = levelOf(game.xp); const next = LEVELS[lv] ?? LEVELS[LEVELS.length - 1];
  const hist = game.history.map(h => ({ turn: h.turn, Cash: Math.round(h.cashEnd), Profit: Math.round(h.profit), Revenue: Math.round(h.revenue) }));
  const last = game.history[game.history.length - 1];
  const pendingEvent = game.pending ? eventById(game.pending) : null;
  const ended = game.phase === 'ended'; const rep = ended ? report(game) : null;
  const questsLeft = availableQuests(game);
  const turnLabel = `${t.turnName} ${Math.min(game.turn + 1, t.turns)} of ${t.turns}`;
  const groupOf = (g: Decision['group']) => decisions.filter(d => d.group === g);

  const linkChips = (links?: string[]) => (links || []).flatMap(k => (['form', 'books', 'fund', 'comply'].includes(k)
    ? [<button key={k} type="button" onClick={() => onNavigate('PRAXIS')} className="text-[11px] font-black text-[#7fe0bd] underline underline-offset-2">Do it for real in Praxis</button>]
    : IP_LINKS.filter(l => l.kind === k).slice(0, 2).map(l => <a key={l.id} href={l.url} target="_blank" rel="noreferrer noopener" className="text-[11px] font-black text-[#7fe0bd] underline underline-offset-2">{l.label}</a>)));

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white pb-24"><div className="max-w-5xl mx-auto px-4 sm:px-5 py-5">
      <div className="flex items-center gap-3 mb-3">
        <button type="button" onClick={onBack || (() => onNavigate('LEARN'))} aria-label="Back" className="w-9 h-9 rounded-full grid place-items-center bg-white/5 hover:bg-white/10"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#06D6A0]">{t.label} · {ind.label}</p><h1 className="text-xl font-black truncate">{ind.emoji} {game.cfg.name}</h1></div>
        <div className="text-right"><p className="text-[10px] font-black uppercase tracking-wider text-white/45">{ended ? 'Game over' : turnLabel}</p><p className="text-[11px] text-white/60">Level {lv}</p></div>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-4"><div className="h-full bg-[#FFD24A]" style={{ width: `${Math.min(100, (game.xp / next) * 100)}%` }} /></div>

      <div className={`grid gap-2 mb-4 ${kid ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5'}`}>
        {[{ l: kid ? 'Coins' : 'Cash', v: money(game.cash, kid), c: game.cash < 0 ? '#ff6b8a' : '#fff' }, ...(game.debt ? [{ l: 'Debt', v: money(game.debt), c: '#ffb35c' }] : []), { l: kid ? 'Last time' : 'Last profit', v: last ? money(last.profit, kid) : '-', c: last && last.profit < 0 ? '#ff6b8a' : '#5ff0c6' }, { l: kid ? 'Customers' : 'Sold', v: last ? `${last.sold}` : '-', c: '#fff' }, ...(t.equity && game.equityPct ? [{ l: 'You own', v: `${100 - game.equityPct}%`, c: '#fff' }] : [])].map(k => (
          <div key={k.l} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-white/45">{k.l}</p><p className="text-xl font-black mt-0.5" style={{ color: k.c }}>{k.v}</p></div>))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"><Bar label="Reputation" v={game.reputation} color="#06D6A0" /><Bar label="Awareness" v={game.awareness} color="#00DAF3" /><Bar label="Quality" v={game.quality} color="#FF8C00" /><Bar label="Capacity use" v={Math.min(100, (preview / Math.max(1, capacityOf(game))) * 100)} color="#D40055" /></div>

      {hist.length >= 2 && !kid && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 mb-4" style={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={hist} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}><CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="turn" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} /><YAxis tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,.12)', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="Cash" stroke="#00DAF3" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="Revenue" stroke="#FF8C00" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="Profit" stroke="#06D6A0" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer>
        </div>)}

      {last && last.notes.length > 0 && !ended && <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-2.5 mb-4 text-[12px] text-white/70">{last.notes.slice(-3).join(' ')}{last.stockout ? ' You turned customers away because you ran out of capacity.' : ''}</div>}

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4" role="tablist">
        {([['decide', 'Decide', Play], ['setup', 'Set up', ListChecks], ...(t.statements ? [['books', 'Books', BookOpen]] : []), ['protect', 'Protect', ShieldCheck], ['log', 'History', Landmark]] as Array<[typeof tab, string, React.ElementType]>).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-3.5 py-2 rounded-full text-[12px] font-black inline-flex items-center gap-1.5 ${tab === id ? 'bg-white text-black' : 'bg-white/5 text-white/65 hover:bg-white/10'}`}><Icon size={13} /> {label}{id === 'setup' && questsLeft.length > 0 ? ` (${questsLeft.length})` : ''}</button>))}
      </div>

      {tab === 'decide' && !ended && (
        <section className="grid gap-4" aria-label="Decide">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/45 mb-2">Set your price</p>
            <div className="flex flex-wrap gap-1.5">{t.priceSteps.map((m, i) => (<button key={i} type="button" aria-pressed={idx === i} onClick={() => setPriceIdx(i)} className={`px-3.5 py-2 rounded-xl text-[13px] font-black border ${idx === i ? 'bg-white text-black border-white' : 'border-white/15 text-white/75 hover:bg-white/10'}`}>{money(ind.refPrice * m, kid)}</button>))}</div>
            <p className="text-[12px] text-white/55 mt-2">At {money(price, kid)} you can expect about <b className="text-white">{preview}</b> {ind.units} per {t.turnName.toLowerCase()}; each costs you {money(ind.unitCost, kid)} to make, so you earn about <b className="text-white">{money(preview * (price - ind.unitCost), kid)}</b> before other costs.</p>
          </div>
          {(['growth', 'people', 'money', 'industry'] as const).map(g => { const ds = groupOf(g); if (!ds.length) return null; return (
            <div key={g}><p className="text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">{g === 'growth' ? 'Grow' : g === 'people' ? 'People and equipment' : g === 'money' ? 'Money' : ind.label}</p>
              <div className="grid sm:grid-cols-2 gap-2">{ds.map(d => { const on = picks.includes(d.id); return (
                <button key={d.id} type="button" disabled={!!d.disabled} aria-pressed={on} onClick={() => toggle(d)} className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${d.disabled ? 'opacity-40 border-white/8' : on ? 'border-[#06D6A0] bg-[#06D6A0]/10' : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.08]'}`}>
                  <span className="flex justify-between gap-2 text-[13px] font-black"><span>{d.label}</span><span className="text-white/60">{d.kind === 'loan' || d.kind === 'equity' ? 'gain' : d.cost ? money(d.cost, kid) : 'free'}</span></span>
                  <span className="block text-[11px] text-white/50 leading-snug mt-0.5">{d.disabled || d.desc}</span></button>); })}</div></div>); })}
          <div className="sticky bottom-3 rounded-2xl border border-white/15 bg-[#130e1c]/95 backdrop-blur p-3 flex items-center gap-3 flex-wrap">
            <p className="text-[12px] text-white/70 flex-1 min-w-[180px]">Spending <b className="text-white">{money(spend, kid)}</b>{financing ? <> · borrowing/raising <b className="text-white">{money(financing, kid)}</b></> : null} · left after: <b className={cashLeft < 0 ? 'text-rose-300' : 'text-white'}>{money(cashLeft, kid)}</b></p>
            <button type="button" disabled={!!pendingEvent || cashLeft < 0} onClick={run} className="rounded-full bg-[#06D6A0] text-black px-6 py-2.5 text-[13px] font-black disabled:opacity-40 inline-flex items-center gap-1.5"><Play size={14} /> Run the {t.turnName.toLowerCase()}</button>
          </div>
          {errors.length > 0 && <p role="alert" className="text-[12px] text-rose-300 flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{errors.join(' ')}</p>}
        </section>)}

      {tab === 'setup' && (
        <section aria-label="Set up your business" className="grid gap-3">
          <p className="text-[12px] text-white/60">Real businesses do these steps before and while they trade. Each costs money or time here, and each changes what happens to you later.</p>
          {QUESTS.filter(q => q.tiers.includes(game.cfg.tier)).map(q => { const done = game.done.includes(q.id); const pending = game.pendingQuests[q.id] !== undefined; const avail = questsLeft.some(x => x.id === q.id); return (
            <div key={q.id} className={`rounded-2xl border p-4 ${done ? 'border-emerald-400/30 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="font-black flex items-center gap-2">{q.title}{done && <span className="text-[10px] font-black text-emerald-300">DONE</span>}{pending && <span className="text-[10px] font-black text-amber-300">IN PROGRESS</span>}</p><p className="text-[12px] text-white/65 mt-0.5">{q.kid}</p><p className="text-[12px] text-white/50 mt-1 leading-snug">{q.learn}</p><div className="flex gap-3 flex-wrap mt-1.5">{linkChips(q.links)}</div></div>
                {avail && !ended && <button type="button" onClick={() => { setPicks(p => (p.includes(`q:${q.id}`) ? p : [...p, `q:${q.id}`])); setTab('decide'); }} className="rounded-full bg-white text-black text-[11px] font-black px-3.5 py-1.5 whitespace-nowrap">{q.cost ? `Do it (${money(q.cost, kid)})` : 'Do it (free)'}</button>}</div>
            </div>); })}
        </section>)}

      {tab === 'books' && t.statements && (
        <section aria-label="Financial statements" className="grid md:grid-cols-3 gap-3 text-[13px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="font-black mb-2">Profit and loss (so far)</p>{([['Sales', st.pl.revenue], ['Other income', st.pl.otherIncome], ['Cost of goods', -st.pl.cogs], ['Gross profit', st.pl.grossProfit], ['Operating costs', -st.pl.opex], ['One-off costs', -st.pl.oneOff], ['Depreciation', -st.pl.depreciation], ['Interest', -st.pl.interest], ['Tax', -st.pl.tax], ['Net profit', st.pl.netProfit]] as Array<[string, number]>).map(([l, v]) => <p key={l} className={`flex justify-between py-0.5 ${l === 'Net profit' || l === 'Gross profit' ? 'font-black border-t border-white/10 mt-1 pt-1' : 'text-white/75'}`}><span>{l}</span><span>{money(v)}</span></p>)}</div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="font-black mb-2">Balance sheet</p>{([['Cash', st.bs.cash], ['Equipment', st.bs.equipment], ['Total assets', st.bs.assets], ['Debt', st.bs.debt], ['Money put in', st.bs.contributed], ['Profit kept', st.bs.retained], ['Equity', st.bs.equity]] as Array<[string, number]>).map(([l, v]) => <p key={l} className={`flex justify-between py-0.5 ${l === 'Total assets' || l === 'Equity' ? 'font-black border-t border-white/10 mt-1 pt-1' : 'text-white/75'}`}><span>{l}</span><span>{money(v)}</span></p>)}<p className="text-[11px] text-white/45 mt-2">Assets always equal debt plus equity.</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="font-black mb-2">Cash flow</p>{([['From the business', st.cf.operating], ['Spent on equipment', st.cf.investing], ['Loans and investors', st.cf.financing], ['Change in cash', st.cf.netChange]] as Array<[string, number]>).map(([l, v]) => <p key={l} className={`flex justify-between py-0.5 ${l === 'Change in cash' ? 'font-black border-t border-white/10 mt-1 pt-1' : 'text-white/75'}`}><span>{l}</span><span>{money(v)}</span></p>)}<p className="text-[11px] text-white/45 mt-2">Profit is not cash: tax and equipment can make them differ.</p></div>
        </section>)}

      {tab === 'protect' && (
        <section aria-label="Protect your business" className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="font-black mb-2">Legal setup</p>
              {([['Business type', game.legal.entity === 'none' ? 'Not registered' : game.legal.entity === 'sole' ? 'Sole proprietor' : game.legal.entity === 'llc' ? 'LLC' : 'Corporation'], ['Tax ID (EIN)', game.legal.ein ? 'Yes' : 'No'], ['Business bank account', game.legal.bank ? 'Yes' : 'No'], ['Insurance', game.legal.insurance ? 'Yes' : 'No'], ['Records', game.legal.records ? 'Yes' : 'No']] as Array<[string, string]>).map(([l, v]) => <p key={l} className="flex justify-between text-[13px] py-0.5"><span className="text-white/65">{l}</span><b className={/^(No|Not)/.test(v) ? 'text-white/40' : 'text-emerald-300'}>{v}</b></p>)}</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="font-black mb-2">Your IP</p>
              {([['Trademark', game.ip.trademark === 'registered' ? 'Registered' : game.ip.trademark === 'pending' ? `Pending (${game.ip.tmTurnsLeft} left)` : game.ip.trademark === 'searched' ? 'Searched only' : 'None'], ['Copyrights registered', String(game.ip.copyrights)], ['Patent', game.ip.patent === 'none' ? 'None' : game.ip.patent], ['Trade secret policy', game.ip.secrets ? 'In place' : 'None'], ['Licences out', String(game.ip.licensesOut)]] as Array<[string, string]>).map(([l, v]) => <p key={l} className="flex justify-between text-[13px] py-0.5"><span className="text-white/65">{l}</span><b className={/^(None|0|Searched)/.test(v) ? 'text-white/40' : 'text-emerald-300'}>{v}</b></p>)}
              <p className="text-[11px] text-white/45 mt-2">Protection score {Math.round(protectionScore(game) * 10) / 10} · IP strength {Math.round(ipScore(game) * 10) / 10}</p></div>
          </div>
          <p className="text-[12px] text-white/60">{ind.ipFocus}</p>
          <IpToolkitPanel />
        </section>)}

      {tab === 'log' && (
        <section aria-label="History" className="grid gap-2">{[...game.history].reverse().map(h => (
          <div key={h.turn} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[12px]"><p className="font-black">{t.turnName} {h.turn}: {h.sold} {ind.units} sold, profit {money(h.profit, kid)}, cash {money(h.cashEnd, kid)}</p>{h.notes.length > 0 && <p className="text-white/55 mt-0.5">{h.notes.join(' ')}</p>}</div>))}{game.history.length === 0 && <p className="text-sm text-white/45">Nothing has happened yet. Run your first {t.turnName.toLowerCase()}.</p>}</section>)}

      {/* Event modal */}
      {pendingEvent && (
        <div role="dialog" aria-modal="true" aria-label={pendingEvent.title} className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0e0b16] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300 flex items-center gap-1.5"><Sparkles size={12} /> Something happened</p>
            <h2 className="text-xl font-black mt-1">{pendingEvent.title}</h2><p className="text-[14px] text-white/75 mt-2 leading-relaxed">{pendingEvent.body}</p>
            <div className="grid gap-2 mt-4">{pendingEvent.choices.map((c, i) => { const s = eventCashScale(game, pendingEvent); const cash = c.effects.cash ? Math.round(c.effects.cash * s) : 0; return (
              <button key={i} type="button" onClick={() => choose(i)} className="text-left rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/10 px-4 py-3"><span className="flex justify-between text-[14px] font-black"><span>{c.label}</span>{cash !== 0 && <span className={cash < 0 ? 'text-rose-300' : 'text-emerald-300'}>{cash < 0 ? '-' : '+'}{money(Math.abs(cash), kid)}</span>}</span><span className="block text-[12px] text-white/55 mt-0.5">{c.desc}</span></button>); })}</div>
          </div>
        </div>)}

      {/* Lesson from the last event */}
      {game.lastEvent && !pendingEvent && !ended && (
        <div className="rounded-2xl border border-[#06D6A0]/30 bg-[#06D6A0]/[0.06] p-4 mb-4"><p className="text-[10px] font-black uppercase tracking-wider text-[#5ff0c6]">What you can learn from that</p><p className="text-[13px] text-white/80 mt-1 leading-relaxed">{game.lastEvent.result ? `${game.lastEvent.result} ` : ''}{game.lastEvent.learn}</p><div className="flex gap-3 flex-wrap mt-2">{linkChips(game.lastEvent.links)}</div>
          <button type="button" onClick={() => setGame({ ...game, lastEvent: undefined })} className="mt-2 text-[11px] text-white/45 underline">Dismiss</button></div>)}

      {/* End report */}
      {ended && rep && (
        <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#1b1030] to-[#0e0b16] p-6 mt-2">
          <div className="flex items-center gap-3"><Trophy className="text-[#FFD24A]" size={28} /><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">{rep.outcome === 'bankrupt' ? 'The business closed' : 'Season complete'}</p><p className="text-2xl font-black">{'★'.repeat(rep.stars)}{'☆'.repeat(5 - rep.stars)}</p></div></div>
          <div className="grid sm:grid-cols-3 gap-3 mt-4 text-center"><div className="rounded-xl bg-black/25 p-3"><p className="text-[10px] uppercase tracking-wider text-white/45">Company value</p><p className="text-xl font-black">{money(rep.companyValue, kid)}</p></div><div className="rounded-xl bg-black/25 p-3"><p className="text-[10px] uppercase tracking-wider text-white/45">Your share</p><p className="text-xl font-black">{money(rep.ownerShare, kid)}</p></div><div className="rounded-xl bg-black/25 p-3"><p className="text-[10px] uppercase tracking-wider text-white/45">Protection score</p><p className="text-xl font-black">{rep.protection}</p></div></div>
          {rep.outcome === 'bankrupt' && <p className="text-[13px] text-white/70 mt-3">Running out of cash is how many real businesses fail, even profitable ones. Watch cash, not just sales.</p>}
          {rep.lessons.length > 0 && <div className="mt-4"><p className="text-[11px] font-black uppercase tracking-wider text-white/45 mb-1">To think about next time</p><ul className="list-disc pl-5 text-[13px] text-white/75 grid gap-1">{rep.lessons.map(l => <li key={l}>{l}</li>)}</ul></div>}
          <div className="flex flex-wrap gap-1.5 mt-4">{BADGES.filter(b => game.badges.includes(b.id)).map(b => <span key={b.id} title={b.blurb} className="text-[11px] font-black rounded-full bg-white/10 px-3 py-1">{b.emoji} {b.label}</span>)}</div>
          <div className="flex gap-2 flex-wrap mt-5"><button type="button" onClick={restart} className="rounded-full bg-[#06D6A0] text-black px-5 py-2.5 text-[13px] font-black inline-flex items-center gap-1.5"><RotateCcw size={14} /> Play again</button><button type="button" onClick={() => onNavigate('PRAXIS')} className="rounded-full border border-white/20 px-5 py-2.5 text-[13px] font-black">Start a real venture in Praxis</button><button type="button" onClick={() => setTab('books')} className="rounded-full border border-white/20 px-5 py-2.5 text-[13px] font-black">{t.statements ? 'Review the books' : 'See history'}</button></div>
        </div>)}

      {!ended && <button type="button" onClick={() => { if (window.confirm('Start over? This game will be lost.')) restart(); }} className="mt-6 text-[11px] text-white/35 underline">Abandon this game</button>}
    </div></div>
  );
};

export default BusinessSimView;
