import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Loader2, Plus, QrCode, Copy } from 'lucide-react';
import QRCode from 'qrcode';
import type { Application, ApplicationStage, JobPosting } from '../../types';
import type { DeptKey, ProductionRoleKey } from '../../services/filmProductionService';
import { DEPARTMENTS } from '../../services/filmProductionService';
import { submitApplication } from '../../services/hiringService';
import {
  createProductionOpening, fetchOpenProductionOpenings, fetchProductionApplications,
  fetchProductionOpenings, hireProductionApplicant, moveProductionApplication,
} from '../../services/filmStaffingService';
import { useProd } from './FilmProductionSuite';
import { acceptProductionInvite, createProductionInvite, productionInviteUrl } from '../../services/productionInviteService';

const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const pill = (active: boolean) => `px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${active ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/30'}`;

export const FilmStaffingTab: React.FC = () => {
  const { prod, can } = useProd();
  const canHire = can('MANAGE_HIRING');
  const [mode, setMode] = useState<'production' | 'find'>('production');
  const [openings, setOpenings] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [publicOpenings, setPublicOpenings] = useState<JobPosting[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [invite, setInvite] = useState({ position: 'Crew', dept: 'CAMERA' as DeptKey, roleKey: 'CREW' as 'CREW'|'CAST'|'VIEWER', maxUses: 1 });
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteQr, setInviteQr] = useState('');
  const [form, setForm] = useState({ title: '', dept: 'CAMERA' as DeptKey, roleKey: 'CREW' as ProductionRoleKey, description: '', location: '', compRange: '' });

  const load = useCallback(async () => {
    if (!prod) return;
    const [ps, apps, publicPs] = await Promise.all([
      fetchProductionOpenings(prod.id).catch(() => []),
      canHire ? fetchProductionApplications(prod.id).catch(() => []) : Promise.resolve([]),
      fetchOpenProductionOpenings().catch(() => []),
    ]);
    setOpenings(ps); setApplications(apps); setPublicOpenings(publicPs);
  }, [prod?.id, canHire]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('productionInvite');
    if (!token) return;
    acceptProductionInvite(token).then(r => {
      setMessage(`You joined ${r.productionTitle}. It is now available in your productions.`);
      const url = new URL(window.location.href); url.searchParams.delete('productionInvite'); window.history.replaceState({}, '', url.toString());
    }).catch(e => setMessage((e as Error).message));
  }, []);

  const makeInvite = async () => {
    if (!prod) return; setBusy(true); setMessage('');
    try { const created = await createProductionInvite(prod, invite); const url = productionInviteUrl(created.token); setInviteUrl(url); setInviteQr(await QRCode.toDataURL(url, { width: 260, margin: 1 })); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };

  const create = async () => {
    if (!prod || !form.title.trim()) return;
    setBusy(true); setMessage('');
    try {
      await createProductionOpening(prod, { title: form.title, department: form.dept, roleKey: form.roleKey, description: form.description, location: form.location, compRange: form.compRange });
      setForm({ title: '', dept: 'CAMERA', roleKey: 'CREW', description: '', location: '', compRange: '' });
      setCreating(false); await load();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  const apply = async (posting: JobPosting) => {
    setBusy(true); setMessage('');
    try { const result = await submitApplication(posting, {}); setMessage(result ? `Application sent to ${posting.productionTitle}.` : 'Sign in to apply.'); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  const advance = async (app: Application, stage: ApplicationStage) => { setBusy(true); await moveProductionApplication(app.id, stage); await load(); setBusy(false); };
  const hire = async (posting: JobPosting, app: Application) => {
    if (!prod) return;
    setBusy(true); setMessage('');
    try { await hireProductionApplicant(prod, posting, app); await load(); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  const appsFor = (id: string) => applications.filter(a => a.jobId === id && !['REJECTED', 'WITHDRAWN'].includes(a.stage));

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex gap-2"><button className={pill(mode === 'production')} onClick={() => setMode('production')}>Production Staffing</button><button className={pill(mode === 'find')} onClick={() => setMode('find')}>Find Crew Calls</button></div>
      {mode === 'production' && canHire && <button onClick={() => setCreating(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest"><Plus size={12}/> Opening</button>}
    </div>
    {message && <div className={`${card} px-4 py-3 text-[11px] text-violet-300`}>{message}</div>}
    {mode === 'production' && canHire && <div className={`${card} p-5 space-y-3`}>
      <div className="flex items-center gap-2"><QrCode size={15} className="text-violet-300"/><div><p className="text-xs font-black text-white">Quick production invite</p><p className="text-[9px] text-white/35">Skip the hiring funnel and enroll someone into a predefined non-privileged role.</p></div></div>
      <div className="grid sm:grid-cols-4 gap-2"><input className={input} value={invite.position} onChange={e=>setInvite(v=>({...v,position:e.target.value}))} placeholder="Position"/><select className={input} value={invite.dept} onChange={e=>setInvite(v=>({...v,dept:e.target.value as DeptKey}))}>{DEPARTMENTS.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select><select className={input} value={invite.roleKey} onChange={e=>setInvite(v=>({...v,roleKey:e.target.value as any}))}><option value="CREW">Crew</option><option value="CAST">Cast</option><option value="VIEWER">Viewer</option></select><input className={input} type="number" min="1" max="100" value={invite.maxUses} onChange={e=>setInvite(v=>({...v,maxUses:Number(e.target.value)||1}))}/></div>
      <button onClick={makeInvite} disabled={busy} className="w-full py-2 rounded-xl bg-white/5 text-violet-300 text-[10px] font-black uppercase tracking-widest">Generate link + QR</button>
      {inviteUrl && <div className="flex flex-col sm:flex-row gap-4 items-center"><img src={inviteQr} alt="Production join QR code" className="w-36 h-36 rounded-xl"/><div className="min-w-0 flex-1"><p className="text-[10px] text-white/45 break-all">{inviteUrl}</p><button onClick={()=>navigator.clipboard.writeText(inviteUrl)} className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/15 text-violet-300 text-[10px] font-black"><Copy size={11}/> Copy invite</button></div></div>}
    </div>}
    {creating && <div className={`${card} p-5 space-y-3`}>
      <div className="grid grid-cols-2 gap-3"><input className={input} placeholder="Position (e.g. 2nd AC)" value={form.title} onChange={e => setForm(f => ({...f,title:e.target.value}))}/><select className={input} value={form.dept} onChange={e => setForm(f => ({...f,dept:e.target.value as DeptKey}))}>{DEPARTMENTS.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3"><select className={input} value={form.roleKey} onChange={e => setForm(f => ({...f,roleKey:e.target.value as ProductionRoleKey}))}><option value="CREW">Crew</option><option value="CAST">Cast</option><option value="VIEWER">Viewer / Offsite</option></select><input className={input} placeholder="Pay / rate range" value={form.compRange} onChange={e => setForm(f => ({...f,compRange:e.target.value}))}/></div>
      <input className={input} placeholder="Location" value={form.location} onChange={e => setForm(f => ({...f,location:e.target.value}))}/><textarea className={input} rows={3} placeholder="Responsibilities and requirements" value={form.description} onChange={e => setForm(f => ({...f,description:e.target.value}))}/>
      <button disabled={busy} onClick={create} className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">{busy ? 'Posting…' : 'Publish Crew Opening'}</button>
    </div>}
    {mode === 'production' ? <div className="space-y-3">
      {!openings.length && <div className={`${card} p-10 text-center`}><Briefcase size={24} className="mx-auto text-white/20 mb-2"/><p className="text-sm font-black text-white/50">No crew openings yet</p></div>}
      {openings.map(p => <div key={p.id} className={`${card} p-5`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-white">{p.title}</p><p className="text-[10px] text-white/40">{p.productionDepartment} · {p.compRange || 'Rate not listed'} · {p.status}</p></div><span className="text-[10px] text-violet-300">{appsFor(p.id).length} applicants</span></div>{p.description && <p className="text-[11px] text-white/45 mt-2">{p.description}</p>}
        {canHire && <div className="mt-3 space-y-2">{appsFor(p.id).map(a => <div key={a.id} className="flex items-center gap-3 border-t border-white/[0.05] pt-3"><div className="flex-1"><p className="text-xs font-black text-white">{a.applicantName}</p><p className="text-[9px] text-white/35">{a.stage}</p></div>{a.stage === 'APPLIED' && <button className="px-3 py-1.5 rounded-lg bg-white/5 text-[9px] text-white/60" onClick={() => advance(a,'SCREENING')}>Screen</button>}{a.stage === 'SCREENING' && <button className="px-3 py-1.5 rounded-lg bg-white/5 text-[9px] text-white/60" onClick={() => advance(a,'OFFER')}>Offer</button>}{a.stage === 'OFFER' && <button className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-[9px] text-emerald-300" onClick={() => hire(p,a)}>Hire + Enroll</button>}</div>)}</div>}
      </div>)}
    </div> : <div className="grid sm:grid-cols-2 gap-3">{publicOpenings.map(p => <div key={p.id} className={`${card} p-5 flex flex-col`}><p className="text-[9px] uppercase tracking-widest text-violet-300">{p.productionTitle}</p><p className="text-sm font-black text-white mt-1">{p.title}</p><p className="text-[10px] text-white/40 mt-1">{p.productionDepartment} · {p.location || 'Location TBD'} · {p.compRange || 'Rate not listed'}</p><p className="text-[11px] text-white/45 mt-3 flex-1">{p.description}</p><button disabled={busy} onClick={() => apply(p)} className="mt-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-300 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">One-tap Apply</button></div>)}</div>}
    {busy && <div className="flex items-center gap-2 text-[10px] text-white/30"><Loader2 size={12} className="animate-spin"/> Updating staffing pipeline…</div>}
  </motion.div>;
};

export default FilmStaffingTab;
