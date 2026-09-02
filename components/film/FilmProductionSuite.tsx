/**
 * Film Production Suite — the on-set execution layer for Artist Manager › Film.
 *
 * Tabs: Production Hub · Call Sheets · Roster · My Brief · Craft Services
 * One live Firestore-backed production shared across every crew member, plus a
 * private Reello broadcast to offsite producers.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, FileText, Users, ClipboardList, Utensils, Plus, X, Sparkles,
  Radio, CheckCircle2, Clock, MapPin, Sun, Sunset, AlertTriangle, Hospital,
  Coffee, Send, Copy, Zap, ChevronRight, CalendarDays, ShieldAlert, Wand2,
  CircleDot, CheckCheck, UserCheck, Soup, Circle, Bell, Camera as CameraIcon, Printer, FolderPlus, BrainCircuit, Save,
} from 'lucide-react';
import { UserProfile } from '../../types';
import { LiveStudio } from '../MobileLiveStreamer';
import * as FP from '../../services/filmProductionService';
import {
  DEPARTMENTS, deptMeta, fmtCall, pagesToEighths, generateCallSheet, buildDailyBrief,
  generateDPR, buildSides, dprDayTotals,
  type Production, type ProductionMember, type ProductionScene, type CallSheet,
  type ProdTask, type CraftItem, type CraftOrder, type DeptKey,
  type DailyProductionReport, type DprSceneRow, type CastWorkCode, type SceneShootStatus, type SidePage,
  type ProductionPermission, type ProductionRoleKey,
  type ProductionBudgetLine, type ProductionLocation, type ProductionFestival, type ProductionClearance,
  type PurchaseOrder, type PettyCashEntry, type Timecard, type ProductionTake, type ContinuityCheck,
} from '../../services/filmProductionService';
import { listWritingProjects, fetchScriptScenes, type WritingProject } from '../../services/loreaProjectsService';
import { Button, Surface, Input, Textarea, Chip, Actions, Eyebrow } from '../ui';
import { hasLegacyFilmData, importLegacyFilmData } from '../../services/legacyFilmMigration';
import { askProductionBrain, type ProductionBrainAnswer, type ProductionBrainMode } from '../../services/productionIntelligenceService';
import * as Schedule from '../../services/productionScheduleService';
import type { CallSheetTemplate, RecipientDelivery } from '../../services/productionScheduleService';
import { canManageProductionChat, provisionProductionChat } from '../../services/productionChatService';
import { putTaskWithAction } from '../../services/productionActionService';
import { copyFilmShowcaseProduction, ensureFilmShowcaseProduction, buildFilmShowcaseCorpus } from '../../services/productionShowcaseTemplate';
import { MasterClock } from './MasterClock';
import { OnSetMobile, useIsPhone } from './OnSetMobile';
import { isDemoMode, subscribeDemoMode } from '../../services/demoMode';

// Identifiers for the always-available, in-memory demo production.
const DEMO_FILM_ID = 'demo_film_local';
const DEMO_FILM_OWNER = 'demo_owner';

// ─── Shared live production context ──────────────────────────────────────────

interface Ctx {
  prod: Production | null;
  productions: Production[];
  selectProduction: (id: string) => void;
  createProduction: (title: string) => Promise<void>;
  copyShowcase: () => Promise<void>;
  applySample: () => Promise<void>;
  members: ProductionMember[];
  scenes: ProductionScene[];
  budgetLines: ProductionBudgetLine[];
  locations: ProductionLocation[];
  festivals: ProductionFestival[];
  clearances: ProductionClearance[];
  purchaseOrders: PurchaseOrder[];
  pettyCash: PettyCashEntry[];
  timecards: Timecard[];
  takes: ProductionTake[];
  continuityChecks: ContinuityCheck[];
  callSheets: CallSheet[];
  deliveries: RecipientDelivery[];
  callSheetTemplates: CallSheetTemplate[];
  tasks: ProdTask[];
  menu: CraftItem[];
  orders: CraftOrder[];
  dprs: DailyProductionReport[];
  activeSheet: CallSheet | null;
  activeSheetId: string | null;
  setActiveSheetId: (id: string) => void;
  me: ProductionMember | null;
  isOwner: boolean;
  readOnly: boolean;
  can: (permission: ProductionPermission) => boolean;
  loading: boolean;
  goTab: (t: string) => void;
}
const ProdCtx = createContext<Ctx | null>(null);
export const useProd = () => {
  const c = useContext(ProdCtx);
  if (!c) throw new Error('useProd outside provider');
  return c;
};

export const FilmProductionProvider: React.FC<{ currentUser?: UserProfile | null; onGoTab: (t: string) => void; children: React.ReactNode }> = ({ currentUser, onGoTab, children }) => {
  const uid = currentUser?.uid || FP.currentUid() || '';
  const [productions, setProductions] = useState<Production[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prod, setProd] = useState<Production | null>(null);
  const [members, setMembers] = useState<ProductionMember[]>([]);
  const [scenes, setScenes] = useState<ProductionScene[]>([]);
  const [budgetLines, setBudgetLines] = useState<ProductionBudgetLine[]>([]);
  const [locations, setLocations] = useState<ProductionLocation[]>([]);
  const [festivals, setFestivals] = useState<ProductionFestival[]>([]);
  const [clearances, setClearances] = useState<ProductionClearance[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [pettyCash, setPettyCash] = useState<PettyCashEntry[]>([]);
  const [timecards, setTimecards] = useState<Timecard[]>([]);
  const [takes, setTakes] = useState<ProductionTake[]>([]);
  const [continuityChecks, setContinuityChecks] = useState<ContinuityCheck[]>([]);
  const [callSheets, setCallSheets] = useState<CallSheet[]>([]);
  const [deliveries, setDeliveries] = useState<RecipientDelivery[]>([]);
  const [callSheetTemplates, setCallSheetTemplates] = useState<CallSheetTemplate[]>([]);
  const [tasks, setTasks] = useState<ProdTask[]>([]);
  const [menu, setMenu] = useState<CraftItem[]>([]);
  const [orders, setOrders] = useState<CraftOrder[]>([]);
  const [dprs, setDprs] = useState<DailyProductionReport[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const chatStructureSignature = useRef('');

  // A fully-populated, read-only demo production built entirely in memory — no
  // Firestore, no uid required. It is always listed so a brand-new (or signed-out)
  // user lands on a real production graph to explore, the same way Music ships the
  // Neon Cathedral demo and Writer seeds a demo book. Copying it makes a real one.
  const demoCorpus = useMemo(() => buildFilmShowcaseCorpus(DEMO_FILM_ID, DEMO_FILM_OWNER, 'Plajah Producer', true), []);
  const isDemo = selectedId === DEMO_FILM_ID;

  // Global demo-data toggle (shared with Creator Hub / Artist Manager). When off,
  // neither the in-memory demo nor the Firestore showcase is created or listed.
  const [demoOn, setDemoOn] = useState(() => isDemoMode());
  useEffect(() => subscribeDemoMode(setDemoOn), []);

  const selectionKey = `plajah_active_production_${uid}`;

  // Membership drives the production list; the demo/showcase is appended only when
  // demo mode is on, so there is something to open before anything real exists.
  useEffect(() => {
    let alive = true;
    (async () => {
      const demoProd = demoCorpus.production;
      if (!uid) {
        if (!alive) return;
        setProductions(demoOn ? [demoProd] : []);
        setSelectedId(demoOn ? demoProd.id : null);
        setLoading(false);
        return;
      }
      // Demo off → don't create or surface the showcase or the in-memory demo.
      const showcase = demoOn ? await ensureFilmShowcaseProduction(uid, currentUser?.displayName || undefined).catch(() => null) : null;
      const owned = await FP.fetchMyProductions(uid);
      let real = [...owned.filter(row => row.id !== showcase?.id), ...(showcase ? [showcase] : [])];
      if (!demoOn) real = real.filter(row => !row.isShowcase); // hide any pre-existing showcase
      // The Firestore showcase already serves as the signed-in demo; only fall back to
      // the in-memory demo when that failed AND demo mode is on.
      const rows = showcase ? real : (demoOn ? [...real, demoProd] : real);
      if (!alive) return;
      setProductions(rows);
      const saved = localStorage.getItem(selectionKey);
      const fallback = real.find(row => !row.isShowcase && row.status !== 'ARCHIVED') || (demoOn ? (showcase || demoProd) : null);
      setSelectedId(rows.some(row => row.id === saved) ? saved : fallback?.id || null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [uid, selectionKey, demoCorpus, demoOn]);

  useEffect(() => {
    let alive = true;
    if (!selectedId) { setProd(null); return; }
    if (selectedId === DEMO_FILM_ID) { setProd(demoCorpus.production); return; }
    localStorage.setItem(selectionKey, selectedId);
    FP.fetchProduction(selectedId).then(row => { if (alive) setProd(row); });
    return () => { alive = false; };
  }, [selectedId, selectionKey, demoCorpus]);

  useEffect(() => {
    if (!selectedId) {
      setMembers([]); setScenes([]); setCallSheets([]); setDeliveries([]); setCallSheetTemplates([]); setTasks([]); setMenu([]); setOrders([]); setDprs([]);
      setBudgetLines([]); setLocations([]); setFestivals([]); setClearances([]);
      setPurchaseOrders([]); setPettyCash([]); setTimecards([]); setTakes([]); setContinuityChecks([]);
      return;
    }
    if (selectedId === DEMO_FILM_ID) {
      // Feed every tab straight from the in-memory corpus; skip all live subscriptions.
      setMembers(demoCorpus.members); setScenes(demoCorpus.scenes);
      setCallSheets(demoCorpus.callSheets); setDeliveries(demoCorpus.recipientDeliveries);
      setCallSheetTemplates([]); setTasks(demoCorpus.tasks);
      setMenu(demoCorpus.craftMenu); setOrders(demoCorpus.craftOrders);
      setDprs(demoCorpus.dprs); setBudgetLines(demoCorpus.budgetLines);
      setLocations(demoCorpus.locations); setFestivals(demoCorpus.festivals);
      setClearances((demoCorpus as { clearances?: ProductionClearance[] }).clearances || []);
      setPurchaseOrders([]); setPettyCash([]); setTimecards([]); setTakes([]); setContinuityChecks([]);
      return;
    }
    const unsubs = [
      FP.subMembers(selectedId, setMembers), FP.subScenes(selectedId, setScenes),
      FP.subCallSheets(selectedId, setCallSheets), FP.subTasks(selectedId, setTasks),
      Schedule.subscribeRecipientDeliveries(selectedId, setDeliveries),
      Schedule.subscribeCallSheetTemplates(selectedId, setCallSheetTemplates),
      FP.subCraftMenu(selectedId, setMenu), FP.subCraftOrders(selectedId, setOrders),
      FP.subDprs(selectedId, setDprs), FP.subBudgetLines(selectedId, setBudgetLines),
      FP.subLocations(selectedId, setLocations), FP.subFestivals(selectedId, setFestivals),
      FP.subClearances(selectedId, setClearances),
      FP.subPurchaseOrders(selectedId, setPurchaseOrders), FP.subPettyCash(selectedId, setPettyCash), FP.subTimecards(selectedId, setTimecards),
      FP.subTakes(selectedId, setTakes), FP.subContinuityChecks(selectedId, setContinuityChecks),
    ];
    return () => unsubs.forEach(u => u());
  }, [selectedId, demoCorpus]);

  // Default active sheet = published sheet dated today, else nearest upcoming, else lowest day.
  const liveCallSheets = useMemo(() => callSheets.map(sheet => {
    const confirmations: Record<string, number> = {};
    deliveries.filter(row => row.callSheetId === sheet.id && row.callSheetVersion === sheet.version && row.status === 'CONFIRMED').forEach(row => { confirmations[row.memberId] = row.confirmedAt || row.updatedAt; if (row.memberUid) confirmations[row.memberUid] = row.confirmedAt || row.updatedAt; });
    return FP.projectCallSheetScenes({ ...sheet, confirmations }, scenes);
  }), [callSheets, scenes, deliveries]);
  const sorted = useMemo(() => [...liveCallSheets].sort((a, b) => a.shootDay - b.shootDay), [liveCallSheets]);
  useEffect(() => {
    if (activeSheetId && callSheets.some(c => c.id === activeSheetId)) return;
    if (sorted.length) {
      const today = new Date().toISOString().slice(0, 10);
      const todaySheet = sorted.find(c => c.date === today);
      setActiveSheetId((todaySheet || sorted.find(c => c.status === 'PUBLISHED') || sorted[0]).id);
    }
  }, [sorted, activeSheetId, callSheets]);

  const activeSheet = liveCallSheets.find(c => c.id === activeSheetId) || null;
  const me = members.find(m => m.uid && m.uid === uid) || null;
  const readOnly = !!prod?.isShowcase;
  const isOwner = !!prod && !readOnly && prod.ownerUid === uid;
  const can = useCallback((permission: ProductionPermission) => !prod?.isShowcase && FP.hasProductionPermission(prod, uid, permission), [prod, uid]);
  useEffect(() => {
    if (!prod || prod.isShowcase || !uid || !canManageProductionChat(prod, uid)) return;
    const signature = JSON.stringify({
      productionId: prod.id,
      members: members.map(member => [member.uid, member.dept, member.status]),
      calls: callSheets.map(sheet => [sheet.id, sheet.shootDay, sheet.status, sheet.version, sheet.date]),
    });
    if (signature === chatStructureSignature.current) return;
    chatStructureSignature.current = signature;
    provisionProductionChat(prod, members, scenes, callSheets, uid).catch(error => {
      chatStructureSignature.current = '';
      console.warn('[production-chat] automatic structure sync failed', error);
    });
  }, [prod, uid, members, scenes, callSheets]);
  const selectProduction = useCallback((id: string) => setSelectedId(id), []);
  const createProduction = useCallback(async (title: string) => {
    const created = await FP.createProduction(uid, title);
    setProductions(rows => [created, ...rows]);
    setSelectedId(created.id);
  }, [uid]);
  const applySample = useCallback(async () => {
    if (!prod) return;
    await FP.applySampleProduction(prod.id, uid);
    setProd({ ...prod, sampleAppliedAt: Date.now() });
  }, [prod, uid]);
  const copyShowcase = useCallback(async () => {
    const created = await copyFilmShowcaseProduction(uid, currentUser?.displayName || undefined);
    setProductions(rows => [created, ...rows]); setSelectedId(created.id);
  }, [uid, currentUser?.displayName]);

  const value: Ctx = {
    prod, productions, selectProduction, createProduction, copyShowcase, applySample,
    members, scenes, budgetLines, locations, festivals, clearances, purchaseOrders, pettyCash, timecards, takes, continuityChecks, callSheets: liveCallSheets, deliveries, callSheetTemplates, tasks, menu, orders, dprs,
    activeSheet, activeSheetId, setActiveSheetId, me, isOwner, readOnly, can, loading, goTab: onGoTab,
  };
  return (
    <ProdCtx.Provider value={value}>
      <ProductionWorkspaceBar />
      {prod && <MasterClock />}
      {prod ? children : <ProductionEmptyState signedIn={!!uid} />}
    </ProdCtx.Provider>
  );
};

const ProductionWorkspaceBar: React.FC = () => {
  const { prod, productions, selectProduction, createProduction, copyShowcase, applySample, isOwner, readOnly } = useProd();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [legacyAvailable, setLegacyAvailable] = useState(() => hasLegacyFilmData(prod?.id));
  useEffect(() => setLegacyAvailable(hasLegacyFilmData(prod?.id)), [prod?.id]);
  const submit = async () => {
    setBusy(true);
    try { await createProduction(title); setTitle(''); setCreating(false); } finally { setBusy(false); }
  };
  const importLegacy = async () => {
    if (!prod) return;
    setBusy(true);
    try { await importLegacyFilmData(prod.id); setLegacyAvailable(false); } finally { setBusy(false); }
  };
  return (
    <>
    <Surface level={2} shape="sheet" className="mb-5 flex flex-wrap items-center gap-3" aria-label="Production workspace">
      <div className="min-w-0 flex-1">
        <Eyebrow>Production workspace</Eyebrow>
        {productions.length > 0 && (
          <select className="pj-input mt-2" value={prod?.id || ''} onChange={event => selectProduction(event.target.value)} aria-label="Active production">
            {productions.map(row => <option key={row.id} value={row.id}>{row.title}{row.isShowcase ? ' · Demo' : row.status === 'ARCHIVED' ? ' · Archived' : ''}</option>)}
          </select>
        )}
      </div>
      {creating ? (
        <div className="flex flex-1 items-end gap-2 min-w-[260px]">
          <Input label="Production title" value={title} onChange={event => setTitle(event.target.value)} autoFocus />
          <Button variant="primary" size="md" loading={busy} disabled={!title.trim()} onClick={submit}>Create</Button>
          <Button variant="ghost" size="md" onClick={() => setCreating(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {prod && isOwner && legacyAvailable && <Button variant="outline" size="sm" loading={busy} onClick={importLegacy}>Import old film data</Button>}
          {prod && isOwner && !prod.sampleAppliedAt && <Button variant="outline" size="sm" onClick={applySample}>Use sample data</Button>}
          {readOnly && <Button variant="accent" size="sm" icon={<Copy />} loading={busy} onClick={async () => { setBusy(true); try { await copyShowcase(); } finally { setBusy(false); } }}>Copy project</Button>}
          <Button variant={prod ? 'secondary' : 'primary'} size="sm" icon={<FolderPlus />} onClick={() => setCreating(true)}>New production</Button>
        </div>
      )}
    </Surface>
    {readOnly && <Surface level={2} brand className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><Eyebrow>Plajah project template</Eyebrow><p className="type-title-md mt-1">Explore every workflow in a safe read-only production.</p><p className="type-body-sm mt-1 text-white/55">Copy Afterlight whenever you want an editable production with the same connected data.</p></div><Button variant="primary" icon={<Copy />} loading={busy} onClick={async () => { setBusy(true); try { await copyShowcase(); } finally { setBusy(false); } }}>Copy and build from it</Button></Surface>}
    </>
  );
};

const ProductionEmptyState: React.FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <Surface level={1} shape="hero" brand className="text-center py-12">
    <Eyebrow>Film production</Eyebrow>
    <h2 className="type-title-lg mt-3">{signedIn ? 'Create or join a production' : 'Sign in to manage productions'}</h2>
    <p className="type-body-md mt-2 text-white/55">Productions keep script, crew authority, schedule, call sheets, and reports on one shared record.</p>
  </Surface>
);

// ─── Small shared UI atoms (match ArtistProjectManager styling) ──────────────

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const pill = (active: boolean) => `px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/30 hover:text-white/60'}`;

const DeptChip: React.FC<{ dept: DeptKey; time?: string }> = ({ dept, time }) => {
  const d = deptMeta(dept);
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black" style={{ background: `${d.color}18`, color: d.color }}>
      <span>{d.emoji}</span>{d.label}{time && <span className="ml-1 text-white/90 bg-black/30 rounded px-1.5 py-0.5">{fmtCall(time)}</span>}
    </span>
  );
};

const askAria = (prompt: string) => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt } }));

// ─── Production Hub ──────────────────────────────────────────────────────────

// On phones, the On Set hub becomes the phone-first "Today" companion; larger
// screens keep the full desktop hub. The Master Clock sits above both.
export const ProductionHubTab: React.FC = () => {
  const isPhone = useIsPhone();
  return isPhone ? <OnSetMobile /> : <ProductionHubDesktop />;
};

const ProductionHubDesktop: React.FC = () => {
  const { prod, members, scenes, callSheets, tasks, orders, activeSheet, setActiveSheetId, isOwner, goTab } = useProd();
  const [broadcasting, setBroadcasting] = useState(false);

  const cs = activeSheet;
  const confirmedCount = cs ? Object.keys(cs.confirmations || {}).length : 0;
  const expectedCount = cs ? cs.deptCalls.length + cs.castRows.length : 0;
  const confirmPct = expectedCount ? Math.round((confirmedCount / expectedCount) * 100) : 0;
  const openTasks = tasks.filter(t => t.status !== 'DONE');
  const urgent = openTasks.filter(t => t.priority === 'URGENT' || t.priority === 'HIGH');
  const activeOrders = orders.filter(o => o.status === 'REQUESTED' || o.status === 'PREPPING');
  const dayPages = cs ? cs.sceneRows.reduce((s, r) => s + r.pages, 0) : 0;

  const generateToday = () => {
    if (!prod) return;
    const nextDay = (callSheets.length ? Math.max(...callSheets.map(c => c.shootDay)) : 0) + 1;
    const day = callSheets.length === 0 ? 1 : nextDay;
    const gen = generateCallSheet(prod, scenes, members, day, { date: new Date().toISOString().slice(0, 10) });
    FP.putCallSheet(prod.id, gen);
    setActiveSheetId(gen.id);
    goTab('film_callsheets');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Production banner */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-violet-400 mb-1">On-Set Production Hub</p>
            <h2 className="text-2xl font-black text-white truncate">{prod?.title || 'Production'}</h2>
            <p className="text-[11px] text-white/40 mt-1">{prod?.format || 'Feature'} · {members.length} crew & cast · {prod?.totalDays || '—'} shoot days</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={() => setBroadcasting(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/25 transition-all">
              <Radio size={13} /> Broadcast to Producers
            </button>
            <button onClick={() => goTab('film_brief')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/60 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
              <UserCheck size={13} /> My Daily Brief
            </button>
          </div>
        </div>
      </div>

      {/* Today on set */}
      {cs ? (
        <div className={`${card} overflow-hidden`}>
          <div className="px-5 py-3 bg-violet-500/10 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400"><CalendarDays size={18} /></div>
              <div>
                <p className="text-sm font-black text-white">Day {cs.dayOf} of {cs.totalDays} {cs.status === 'PUBLISHED' ? <span className="text-emerald-400 text-[9px] ml-1">● PUBLISHED v{cs.version}</span> : <span className="text-white/30 text-[9px] ml-1">DRAFT</span>}</p>
                <p className="text-[10px] text-white/40">{cs.date || 'Date TBD'} · {cs.locationName}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div><p className="text-[9px] font-black uppercase tracking-widest text-white/30">Gen. Call</p><p className="text-sm font-black text-violet-400">{fmtCall(cs.generalCall)}</p></div>
              <div><p className="text-[9px] font-black uppercase tracking-widest text-white/30">Scenes</p><p className="text-sm font-black text-white">{cs.sceneRows.length}</p></div>
              <div><p className="text-[9px] font-black uppercase tracking-widest text-white/30">Pages</p><p className="text-sm font-black text-white">{pagesToEighths(dayPages)}</p></div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Weather / sun strip */}
            {cs.weather && (cs.weather.sunrise || cs.weather.summary) && (
              <div className="flex items-center gap-4 text-[11px] text-white/50 flex-wrap">
                {cs.weather.sunrise && <span className="flex items-center gap-1.5"><Sun size={13} className="text-amber-400" /> Sunrise {fmtCall(cs.weather.sunrise)}</span>}
                {cs.weather.sunset && <span className="flex items-center gap-1.5"><Sunset size={13} className="text-orange-400" /> Sunset {fmtCall(cs.weather.sunset)}</span>}
                {cs.weather.summary && <span className="flex items-center gap-1.5"><CloudDot /> {cs.weather.summary}</span>}
              </div>
            )}
            {/* Confirmation tracker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Crew Confirmations</p>
                <p className="text-[10px] font-black text-white/60">{confirmedCount}/{expectedCount} confirmed</p>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full ${confirmPct >= 80 ? 'bg-emerald-500' : confirmPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${confirmPct}%` }} /></div>
            </div>
            {/* Department call board — "what's on schedule per role" */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Department Call Times</p>
              <div className="flex flex-wrap gap-2">
                {cs.deptCalls.map(dc => <DeptChip key={dc.dept} dept={dc.dept} time={dc.callTime} />)}
              </div>
            </div>
            <button onClick={() => goTab('film_callsheets')} className="flex items-center gap-1.5 text-violet-400 text-[11px] font-black uppercase tracking-widest hover:text-violet-300">
              Open full call sheet <ChevronRight size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className={`${card} p-8 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-violet-500/15 flex items-center justify-center text-violet-400 mx-auto mb-4"><FileText size={22} /></div>
          <p className="text-sm font-black text-white mb-1">No call sheet yet</p>
          <p className="text-xs text-white/40 mb-4 max-w-sm mx-auto">Auto-generate a call sheet from your scenes, cast, and crew — department call times and cast pickups are computed for you.</p>
          <button onClick={generateToday} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all"><Wand2 size={14} /> Generate Day 1 Call Sheet</button>
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat icon={<ClipboardList size={15} />} label="Open Tasks" value={openTasks.length} sub={`${urgent.length} urgent`} color="#3b82f6" onClick={() => goTab('film_hub')} />
        <MiniStat icon={<Utensils size={15} />} label="Craft Orders" value={activeOrders.length} sub="in queue" color="#14b8a6" onClick={() => goTab('film_craft')} />
        <MiniStat icon={<Users size={15} />} label="Roster" value={members.length} sub={`${members.filter(m => m.isCast || m.dept === 'CAST').length} cast`} color="#a855f7" onClick={() => goTab('film_roster')} />
        <MiniStat icon={<FileText size={15} />} label="Call Sheets" value={callSheets.length} sub={`${callSheets.filter(c => c.status === 'PUBLISHED').length} published`} color="#f59e0b" onClick={() => goTab('film_callsheets')} />
      </div>

      {/* Task dashboard */}
      <TaskBoard />

      <ProductionBrainPanel />

      {broadcasting && (
        <ProducerBroadcast prodId={prod?.id || ''} onClose={() => setBroadcasting(false)} />
      )}
    </motion.div>
  );
};

const ProductionBrainPanel: React.FC = () => {
  const { prod } = useProd();
  const [mode, setMode] = useState<ProductionBrainMode>('ASK');
  const [question, setQuestion] = useState('What should this production focus on next, and which role owns each decision?');
  const [result, setResult] = useState<ProductionBrainAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const modes: Array<{ id: ProductionBrainMode; label: string }> = [
    { id: 'ASK', label: 'Ask' }, { id: 'RISK_SCAN', label: 'Risk scan' },
    { id: 'NEXT_ACTIONS', label: 'Next actions' }, { id: 'CONTINUITY', label: 'Continuity' },
    { id: 'DAY_PLAN', label: 'Shoot-day plan' },
  ];
  const run = async () => {
    if (!prod || (mode === 'ASK' && !question.trim())) return;
    setBusy(true); setError('');
    try { setResult(await askProductionBrain(prod.id, question.trim(), mode)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Production Brain could not complete the analysis.'); }
    finally { setBusy(false); }
  };
  return (
    <Surface level={2} shape="hero" brand className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="pj-icon-container"><BrainCircuit size={20} /></div>
        <div className="min-w-0 flex-1">
          <Eyebrow>Pokee · whole-production reasoning</Eyebrow>
          <h3 className="type-title-md mt-1">Production Brain</h3>
          <p className="type-body-sm mt-1 text-white/55">Reasons across the approved script, scenes, schedule, call sheets, staffing, tasks, locations, reports, hiring, budget, and workflow history—limited by your production authority.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Analysis mode">
        {modes.map(item => <Chip key={item.id} interactive selected={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</Chip>)}
      </div>
      {(mode === 'ASK' || mode === 'DAY_PLAN') && (
        <Textarea label={mode === 'ASK' ? 'Ask about this production' : 'Optional shoot-day focus'} rows={3} value={question} onChange={event => setQuestion(event.target.value)} placeholder="What could stop Day 3 from making its schedule?" />
      )}
      <Actions>
        <Button variant="primary" icon={<BrainCircuit />} loading={busy} disabled={!prod || (mode === 'ASK' && !question.trim())} onClick={run}>Reason over production</Button>
      </Actions>
      {error && <p className="type-body-sm" style={{ color: 'var(--pj-danger)' }} role="alert">{error}</p>}
      {result && (
        <div className="space-y-5" aria-live="polite">
          <Surface level={1}>
            <Eyebrow>Assessment</Eyebrow>
            <p className="type-body-md mt-2 whitespace-pre-wrap">{result.answer}</p>
          </Surface>
          {result.risks.length > 0 && (
            <div>
              <Eyebrow>Risks</Eyebrow>
              <div className="grid gap-2 mt-2">
                {result.risks.map((risk, index) => (
                  <Surface key={`${risk.title}-${index}`} level={1} className="flex items-start gap-3">
                    <AlertTriangle size={16} className={risk.severity === 'high' ? 'text-red-400' : risk.severity === 'medium' ? 'text-amber-400' : 'text-white/40'} />
                    <div><p className="type-label-lg">{risk.title}</p><p className="type-body-sm mt-1 text-white/55">{risk.detail}</p></div>
                  </Surface>
                ))}
              </div>
            </div>
          )}
          {result.nextActions.length > 0 && (
            <div>
              <Eyebrow>Role-owned next actions</Eyebrow>
              <div className="grid gap-2 mt-2">
                {result.nextActions.map((item, index) => (
                  <Surface key={`${item.action}-${index}`} level={1}>
                    <Chip brand>{item.ownerRole}</Chip>
                    <p className="type-label-lg mt-2">{item.action}</p>
                    <p className="type-body-sm mt-1 text-white/55">{item.reason}</p>
                  </Surface>
                ))}
              </div>
            </div>
          )}
          {result.evidence.length > 0 && (
            <details>
              <summary className="type-label-lg cursor-pointer">Evidence used ({result.evidence.length})</summary>
              <div className="space-y-2 mt-2">{result.evidence.map((item, index) => <p key={`${item.source}-${index}`} className="type-body-sm text-white/55"><strong className="text-white/75">{item.source}:</strong> {item.detail}</p>)}</div>
            </details>
          )}
          {(result.missingInformation.length > 0 || result.redactions.length > 0) && (
            <details>
              <summary className="type-label-lg cursor-pointer">Context limits</summary>
              <ul className="type-body-sm mt-2 space-y-1 text-white/50">
                {result.missingInformation.map(item => <li key={item}>Missing: {item}</li>)}
                {result.redactions.map(item => <li key={item}>{item}</li>)}
              </ul>
            </details>
          )}
          <p className="type-body-sm text-white/35">Pokee used {result.inputTokens.toLocaleString()} input and {result.outputTokens.toLocaleString()} output tokens · ${result.costUsd.toFixed(4)} · {(result.elapsedMs / 1000).toFixed(1)}s</p>
        </div>
      )}
    </Surface>
  );
};

const CloudDot = () => <span className="inline-block w-2 h-2 rounded-full bg-sky-400/60" />;

const MiniStat: React.FC<{ icon: React.ReactNode; label: string; value: number | string; sub: string; color: string; onClick?: () => void }> = ({ icon, label, value, sub, color, onClick }) => (
  <button onClick={onClick} className={`${card} p-4 text-left hover:border-white/15 transition-all`}>
    <div className="flex items-center gap-2 mb-1.5"><span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, color }}>{icon}</span></div>
    <p className="text-xl font-black text-white leading-none">{value}</p>
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">{label} · {sub}</p>
  </button>
);

// ─── Task board (dashboard of tasks by role) ─────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = { URGENT: 'text-red-400 bg-red-500/15', HIGH: 'text-orange-400 bg-orange-500/15', MED: 'text-yellow-400 bg-yellow-500/10', LOW: 'text-white/40 bg-white/5' };

const TaskBoard: React.FC = () => {
  const { prod, tasks, members, me, can } = useProd();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', dept: 'PRODUCTION' as DeptKey, priority: 'MED' as ProdTask['priority'], assigneeMemberId: '' });
  const save = async () => {
    if (!prod || !form.title.trim()) return;
    const assignee = members.find(m => m.id === form.assigneeMemberId);
    const t: ProdTask = { id: FP.uid8(), title: form.title.trim(), dept: form.dept, priority: form.priority, status: 'TODO', assigneeMemberId: form.assigneeMemberId || undefined, assigneeName: assignee?.name, createdAt: Date.now() };
    await putTaskWithAction(prod.id, t, FP.currentUid() || '', me?.name || prod.title);
    setForm({ title: '', dept: 'PRODUCTION', priority: 'MED', assigneeMemberId: '' }); setAdding(false);
  };
  const cols: { key: ProdTask['status']; label: string }[] = [{ key: 'TODO', label: 'To Do' }, { key: 'DOING', label: 'In Progress' }, { key: 'DONE', label: 'Done' }];
  const cycle = (t: ProdTask) => { if (!can('MANAGE_TASKS')) return; const next = t.status === 'TODO' ? 'DOING' : t.status === 'DOING' ? 'DONE' : 'TODO'; FP.patchTask(prod!.id, t.id, { status: next }); };
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/40">Production Task Board</p>
        {can('MANAGE_TASKS') && <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-widest hover:bg-violet-500/25"><Plus size={11} /> Task</button>}
      </div>
      {adding && (
        <div className="mb-4 p-4 bg-white/[0.03] border border-violet-500/20 rounded-xl space-y-2">
          <input autoFocus className={inputCls} placeholder="Task (e.g. Confirm generator delivery)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} onKeyDown={e => e.key === 'Enter' && save()} />
          <div className="grid grid-cols-3 gap-2">
            <select className={inputCls} value={form.dept} onChange={e => setForm(f => ({ ...f, dept: e.target.value as DeptKey }))}>{DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
            <select className={inputCls} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))}>{['LOW', 'MED', 'HIGH', 'URGENT'].map(p => <option key={p} value={p}>{p}</option>)}</select>
            <select className={inputCls} value={form.assigneeMemberId} onChange={e => setForm(f => ({ ...f, assigneeMemberId: e.target.value }))}><option value="">Unassigned</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
          <button onClick={save} className="w-full py-2 rounded-xl bg-violet-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-violet-400">Add Task</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cols.map(col => {
          const items = tasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 px-1">{col.label} · {items.length}</p>
              {items.length === 0 && <p className="text-[10px] text-white/15 px-1 py-3">—</p>}
              {items.map(t => (
                <button key={t.id} onClick={() => cycle(t)} className="w-full text-left p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
                  <div className="flex items-start gap-2">
                    {t.status === 'DONE' ? <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 shrink-0" /> : t.status === 'DOING' ? <CircleDot size={13} className="text-yellow-400 mt-0.5 shrink-0" /> : <Circle size={13} className="text-white/30 mt-0.5 shrink-0" />}
                    <span className={`text-[11px] flex-1 ${t.status === 'DONE' ? 'text-white/30 line-through' : 'text-white/80'}`}>{t.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 pl-5 flex-wrap">
                    {t.dept && <span className="text-[8px]" style={{ color: deptMeta(t.dept).color }}>{deptMeta(t.dept).emoji} {deptMeta(t.dept).label}</span>}
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                    {t.assigneeName && <span className="text-[8px] text-white/30">· {t.assigneeName}</span>}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Call Sheets tab ─────────────────────────────────────────────────────────

export const CallSheetsTab: React.FC = () => {
  const { prod, scenes, members, callSheets, activeSheetId, setActiveSheetId, can } = useProd();
  const canManage = can('MANAGE_CALL_SHEETS');
  const sorted = [...callSheets].sort((a, b) => a.shootDay - b.shootDay);
  const cs = callSheets.find(c => c.id === activeSheetId) || sorted[0] || null;

  const generate = () => {
    if (!prod) return;
    const day = (callSheets.length ? Math.max(...callSheets.map(c => c.shootDay)) : 0) + 1;
    const gen = generateCallSheet(prod, scenes, members, day, { date: '' });
    FP.putCallSheet(prod.id, gen);
    setActiveSheetId(gen.id);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          {sorted.map(c => (
            <button key={c.id} onClick={() => setActiveSheetId(c.id)} className={pill(c.id === cs?.id)}>Day {c.shootDay}{c.status === 'PUBLISHED' ? ' ●' : ''}</button>
          ))}
        </div>
        {canManage && <button onClick={generate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 shrink-0"><Wand2 size={13} /> Auto-Generate</button>}
      </div>
      {!cs ? (
        <div className={`${card} p-10 text-center`}>
          <p className="text-sm font-black text-white/50 mb-2">No call sheets</p>
          <p className="text-xs text-white/30 mb-5">Generate one from your scheduled scenes — call times, cast pickups, meals and walkie channels fill in automatically.</p>
          {canManage && <button onClick={generate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400"><Wand2 size={14} /> Generate First Call Sheet</button>}
        </div>
      ) : (
        <CallSheetEditor key={cs.id} cs={cs} editable={canManage} />
      )}
    </motion.div>
  );
};

const CallSheetEditor: React.FC<{ cs: CallSheet; editable: boolean }> = ({ cs, editable }) => {
  const { prod, members, deliveries, callSheetTemplates } = useProd();
  const [draft, setDraft] = useState<CallSheet>(cs);
  const [publishMessage, setPublishMessage] = useState('');
  const [templateName, setTemplateName] = useState('');
  useEffect(() => setDraft(cs), [cs.id, cs.version, cs.updatedAt]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cs);
  const set = (patch: Partial<CallSheet>) => setDraft(d => ({ ...d, ...patch }));
  const saveDraft = () => prod && FP.putCallSheet(prod.id, { ...draft, updatedAt: Date.now() });
  const publish = async () => {
    if (!prod) return;
    const saved = { ...draft, updatedAt: Date.now() };
    const delta = cs.status === 'PUBLISHED' ? 'Revised call sheet: review updated schedule, calls, and notes.' : 'Initial call sheet published.';
    try {
      const count = await Schedule.publishCallSheetPackets(prod.id, saved, members, FP.currentUid() || '', delta);
      setPublishMessage(`Published personalized packets to ${count} recipients.`);
    } catch (error) { setPublishMessage(error instanceof Error ? error.message : 'Could not publish packets.'); }
  };
  const currentDeliveries = deliveries.filter(row => row.callSheetId === draft.id && row.callSheetVersion === draft.version);
  const confirmedCount = currentDeliveries.filter(row => row.status === 'CONFIRMED').length;
  const expected = currentDeliveries.length || draft.deptCalls.length + draft.castRows.length;
  const fieldRow = 'flex items-center gap-2 text-[11px]';
  const saveTemplate = async () => {
    if (!prod || !templateName.trim()) return;
    await Schedule.putCallSheetTemplate(prod.id, Schedule.callSheetTemplateFromSheet(prod.id, draft, FP.currentUid() || '', templateName));
    setPublishMessage(`${templateName.trim()} template saved.`); setTemplateName('');
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className={`${card} p-4 flex items-center justify-between flex-wrap gap-3`}>
        <div>
          <p className="text-sm font-black text-white">Day {draft.dayOf} of {draft.totalDays} {draft.status === 'PUBLISHED' ? <span className="text-emerald-400 text-[9px]">● PUBLISHED v{draft.version}</span> : <span className="text-white/30 text-[9px]">DRAFT</span>}</p>
          <p className="text-[10px] text-white/40">{confirmedCount}/{expected} confirmed{draft.publishedAt ? ` · sent ${new Date(draft.publishedAt).toLocaleString()}` : ''}</p>
          {publishMessage && <p className="type-body-sm mt-1 text-white/55" role="status">{publishMessage}</p>}
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            {dirty && <button onClick={saveDraft} className="px-4 py-2 rounded-xl bg-white/5 text-white/60 text-[11px] font-black uppercase tracking-widest hover:bg-white/10">Save Draft</button>}
            <button onClick={publish} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/90 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-400"><Send size={12} /> {draft.status === 'PUBLISHED' ? 'Re-publish' : 'Publish to Crew'}</button>
          </div>
        )}
      </div>

      {editable && <Surface level={1} className="flex flex-wrap items-end gap-3"><label className="type-label-lg">Apply template<select className="pj-input mt-2" defaultValue="" onChange={event => { const template = callSheetTemplates.find(row => row.id === event.target.value); if (template) setDraft(current => Schedule.applyCallSheetTemplate(current, template)); event.currentTarget.value = ''; }}><option value="">Choose saved defaults…</option>{callSheetTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><Input label="New template name" placeholder="e.g. Main unit stage day" value={templateName} onChange={event => setTemplateName(event.target.value)} /><Button variant="secondary" icon={<Save />} disabled={!templateName.trim()} onClick={saveTemplate}>Save current as template</Button></Surface>}

      {currentDeliveries.length > 0 && <Surface level={1} className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><Eyebrow>Recipient delivery</Eyebrow><p className="type-title-sm mt-1">Version {draft.version} acknowledgement</p></div><div className="flex flex-wrap gap-2">{(['DELIVERED','VIEWED','CONFIRMED','PROBLEM'] as const).map(status => <Chip key={status} brand={status === 'PROBLEM'}>{status} · {currentDeliveries.filter(row => row.status === status).length}</Chip>)}</div></div><div className="grid gap-2 md:grid-cols-2">{currentDeliveries.map(row => <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.025] p-3"><div className="min-w-0"><p className="truncate type-label-lg">{row.memberName} · {row.role}</p><p className="type-body-sm text-white/35">Call {fmtCall(row.packet.yourCall)}{row.deltaSummary ? ` · ${row.deltaSummary}` : ''}</p>{row.problemNote && <p className="type-body-sm mt-1 text-red-300">Problem: {row.problemNote}</p>}</div><Chip brand={row.status === 'PROBLEM'}>{row.status}</Chip></div>)}</div></Surface>}

      {/* Header block */}
      <div className={`${card} p-5 grid grid-cols-2 md:grid-cols-4 gap-4`}>
        <Field label="Date" value={draft.date} type="date" editable={editable} onChange={v => set({ date: v })} />
        <Field label="General Call" value={draft.generalCall} type="time" editable={editable} onChange={v => set({ generalCall: v })} />
        <Field label="Shooting Call" value={draft.shootingCall || ''} type="time" editable={editable} onChange={v => set({ shootingCall: v })} />
        <Field label="Est. Wrap" value={draft.estWrap || ''} type="time" editable={editable} onChange={v => set({ estWrap: v })} />
        <Field label="Location" value={draft.locationName} editable={editable} onChange={v => set({ locationName: v })} />
        <Field label="Address" value={draft.locationAddress || ''} editable={editable} onChange={v => set({ locationAddress: v })} className="md:col-span-3" />
      </div>

      {/* Environment & safety */}
      <div className={`${card} p-5 space-y-3`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Environment & Safety</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Sunrise" value={draft.weather?.sunrise || ''} type="time" editable={editable} onChange={v => set({ weather: { ...(draft.weather || { summary: '' }), sunrise: v } })} />
          <Field label="Sunset" value={draft.weather?.sunset || ''} type="time" editable={editable} onChange={v => set({ weather: { ...(draft.weather || { summary: '' }), sunset: v } })} />
          <Field label="Weather" value={draft.weather?.summary || ''} editable={editable} onChange={v => set({ weather: { ...(draft.weather || {}), summary: v } })} />
          <Field label="Nearest Hospital" value={draft.nearestHospital || ''} editable={editable} onChange={v => set({ nearestHospital: v })} />
        </div>
        <Field label="Safety Notes" value={draft.safetyNotes || ''} editable={editable} onChange={v => set({ safetyNotes: v })} textarea />
        {editable && <button onClick={() => askAria(`Act as my 1st AD / safety officer. Draft concise safety notes for a shoot day with these scenes: ${draft.sceneRows.map(s => `${s.intExt} ${s.set} (${s.dayNight})`).join('; ')}. Flag stunts, weapons, night driving, weather, and minors as relevant. Keep it to a tight bulleted call-sheet block.`)} className="flex items-center gap-1.5 text-violet-400 text-[10px] font-black uppercase tracking-widest hover:text-violet-300"><Sparkles size={11} /> Draft safety notes with Aria</button>}
      </div>

      {/* Scenes */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3 bg-violet-500/10 border-b border-white/[0.06]"><p className="text-[11px] font-black uppercase tracking-widest text-violet-400">Scenes — {draft.sceneRows.length} · {pagesToEighths(draft.sceneRows.reduce((s, r) => s + r.pages, 0))} pages</p></div>
        <div className="divide-y divide-white/[0.04]">
          {draft.sceneRows.map((s, i) => (
            <div key={i} className={fieldRow + ' px-5 py-3'}>
              <span className="text-xs font-black text-violet-400 w-8">#{s.sceneNum}</span>
              <span className="text-[9px] text-white/30 font-black w-20">{s.intExt} · {s.dayNight}</span>
              <span className="flex-1 text-white/70 truncate">{s.set} — {s.synopsis}</span>
              <span className="text-[9px] text-white/40 w-10 text-right">{pagesToEighths(s.pages)}</span>
            </div>
          ))}
          {draft.sceneRows.length === 0 && <p className="px-5 py-4 text-[11px] text-white/25">No scenes scheduled for this day. Add scenes with this shoot day in the Roster/Script.</p>}
        </div>
      </div>

      {/* Cast */}
      {draft.castRows.length > 0 && (
        <div className={`${card} overflow-hidden`}>
          <div className="px-5 py-3 bg-amber-500/10 border-b border-white/[0.06]"><p className="text-[11px] font-black uppercase tracking-widest text-amber-400">Cast</p></div>
          <div className="divide-y divide-white/[0.04]">
            {draft.castRows.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3 flex-wrap text-[11px]">
                <span className="font-black text-white w-32 truncate">{r.character}</span>
                <span className="text-white/40 w-28 truncate">{r.actor}</span>
                <span className="text-white/50">P/U {fmtCall(r.pickup)} · MU {fmtCall(r.makeup)} · W {fmtCall(r.wardrobe)} · Set {fmtCall(r.onSet)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Department calls + walkie */}
      <div className={`${card} p-5 space-y-3`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Department Calls & Walkie Channels</p>
        <div className="flex flex-wrap gap-2">{draft.deptCalls.map(dc => <DeptChip key={dc.dept} dept={dc.dept} time={dc.callTime} />)}</div>
        {draft.walkie && Object.keys(draft.walkie).length > 0 && (
          <p className="text-[10px] text-white/40">📻 {Object.entries(draft.walkie).map(([d, ch]) => `Ch ${ch}: ${d}`).join('  ·  ')}</p>
        )}
      </div>

      {/* Meals */}
      <div className={`${card} p-5 space-y-2`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Meals</p>
        {draft.meals.map((m, i) => (
          <div key={i} className="flex items-center gap-3 text-[11px]"><Soup size={13} className="text-teal-400" /><span className="font-black text-white w-24">{m.label}</span><span className="text-violet-400 font-black">{fmtCall(m.time)}</span><span className="text-white/40">{m.note}</span></div>
        ))}
      </div>

      {/* Notes + advance */}
      <div className={`${card} p-5 grid md:grid-cols-2 gap-4`}>
        <Field label="Notes / Special Instructions" value={draft.notes || ''} editable={editable} onChange={v => set({ notes: v })} textarea />
        <Field label="Advance Schedule (Tomorrow)" value={draft.advanceNote || ''} editable={editable} onChange={v => set({ advanceNote: v })} textarea />
      </div>

      {/* Change log */}
      {draft.changeLog && draft.changeLog.length > 0 && (
        <div className={`${card} p-4`}>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Revision History</p>
          {draft.changeLog.slice().reverse().map((c, i) => <p key={i} className="text-[10px] text-white/40">• {c.summary} <span className="text-white/20">— {new Date(c.at).toLocaleString()}</span></p>)}
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange?: (v: string) => void; editable?: boolean; type?: string; textarea?: boolean; className?: string }> = ({ label, value, onChange, editable, type = 'text', textarea, className = '' }) => (
  <div className={className}>
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{label}</p>
    {editable && onChange ? (
      textarea
        ? <textarea className={inputCls + ' resize-none'} rows={3} value={value} onChange={e => onChange(e.target.value)} />
        : <input className={inputCls} type={type} value={value} onChange={e => onChange(e.target.value)} />
    ) : (
      <p className="text-[12px] text-white/80 font-semibold">{type === 'time' ? fmtCall(value) : (value || '—')}</p>
    )}
  </div>
);

// ─── Roster tab ──────────────────────────────────────────────────────────────

export const RosterTab: React.FC = () => {
  const { prod, members, isOwner, can } = useProd();
  const [adding, setAdding] = useState(false);
  const [deptFilter, setDeptFilter] = useState<DeptKey | 'ALL'>('ALL');
  const [form, setForm] = useState({ name: '', role: '', roleKey: 'CREW' as ProductionRoleKey, linkedUid: '', dept: 'CAMERA' as DeptKey, email: '', phone: '', character: '', dietary: '' });
  const [authorityError, setAuthorityError] = useState('');
  const save = async () => {
    if (!prod || !form.name.trim()) return;
    setAuthorityError('');
    const isCast = form.dept === 'CAST';
    const m: ProductionMember = {
      id: FP.uid8(), name: form.name.trim(), role: form.role.trim() || deptMeta(form.dept).label, dept: form.dept,
      uid: form.linkedUid.trim() || undefined, roleKey: form.roleKey,
      email: form.email || undefined, phone: form.phone || undefined, isCast, character: isCast ? (form.character || form.role) : undefined,
      dietary: form.dietary ? form.dietary.split(',').map(s => s.trim()).filter(Boolean) : undefined, status: 'ACTIVE', createdAt: Date.now(),
    };
    try {
      if (m.uid) await FP.assignProductionAuthority(prod.id, m, form.roleKey);
      else await FP.putMember(prod.id, m);
      setForm({ name: '', role: '', roleKey: 'CREW', linkedUid: '', dept: 'CAMERA', email: '', phone: '', character: '', dietary: '' });
      setAdding(false);
    } catch (e) { setAuthorityError((e as Error).message || 'Could not assign this role.'); }
  };
  const byDept = deptFilter === 'ALL' ? members : members.filter(m => m.dept === deptFilter);
  const grouped = DEPARTMENTS.map(d => ({ d, list: byDept.filter(m => m.dept === d.key) })).filter(g => g.list.length);
  const removeRosterMember = async (member: ProductionMember) => {
    if (!prod) return;
    try {
      if (member.uid) await FP.revokeProductionAuthority(prod.id, member);
      await FP.removeMember(prod.id, member.id);
    } catch (e) { setAuthorityError((e as Error).message || 'Could not remove this roster member.'); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setDeptFilter('ALL')} className={pill(deptFilter === 'ALL')}>All</button>
          {DEPARTMENTS.filter(d => members.some(m => m.dept === d.key)).map(d => <button key={d.key} onClick={() => setDeptFilter(d.key)} className={pill(deptFilter === d.key)}>{d.emoji} {d.label}</button>)}
        </div>
        {can('MANAGE_ROSTER') && <button onClick={() => setAdding(a => !a)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 shrink-0"><Plus size={12} /> Add</button>}
      </div>
      {adding && (
        <div className={`${card} p-5 space-y-3 border-violet-500/20`}>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className={inputCls} placeholder="Role / job title" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} value={form.dept} onChange={e => setForm(f => ({ ...f, dept: e.target.value as DeptKey }))}>{DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
            {form.dept === 'CAST' && <input className={inputCls} placeholder="Character name" value={form.character} onChange={e => setForm(f => ({ ...f, character: e.target.value }))} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} value={form.roleKey} onChange={e => setForm(f => ({ ...f, roleKey: e.target.value as ProductionRoleKey }))} disabled={!isOwner}>
              {FP.PRODUCTION_ROLE_TEMPLATES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <input className={inputCls} placeholder="Plajah user ID (enables access)" value={form.linkedUid} onChange={e => setForm(f => ({ ...f, linkedUid: e.target.value }))} disabled={!isOwner} />
          </div>
          <p className="text-[10px] text-white/35">{FP.PRODUCTION_ROLE_TEMPLATES.find(r => r.key === form.roleKey)?.description} Only the production owner can grant authority.</p>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className={inputCls} placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <input className={inputCls} placeholder="Dietary flags (comma-separated: vegan, nut-allergy…)" value={form.dietary} onChange={e => setForm(f => ({ ...f, dietary: e.target.value }))} />
          {authorityError && <p className="text-[10px] text-red-400">{authorityError}</p>}
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400">Add to Roster</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10">Cancel</button>
          </div>
        </div>
      )}
      {grouped.map(({ d, list }) => (
        <div key={d.key} className={`${card} overflow-hidden`}>
          <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-2" style={{ background: `${d.color}12` }}>
            <span>{d.emoji}</span><p className="text-[11px] font-black uppercase tracking-widest" style={{ color: d.color }}>{d.label}</p>
            <span className="text-[10px] text-white/30 ml-1">Ch {d.channel} · call {d.callOffset === 0 ? 'general' : `${d.callOffset > 0 ? '+' : ''}${d.callOffset}m`}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {list.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-black text-xs" style={{ background: `${d.color}22`, color: d.color }}>{m.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">{m.name} {m.uid && <span title="Linked Plajah account — receives their brief"><CheckCheck size={11} className="inline text-emerald-400" /></span>}</p>
                  <p className="text-[10px] text-white/40">{m.character ? `${m.character} · ` : ''}{m.role}</p>
                </div>
                {m.dietary && m.dietary.length > 0 && (
                  <div className="flex gap-1 flex-wrap justify-end">{m.dietary.map(dt => <span key={dt} className="text-[8px] font-black px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300">{dt}</span>)}</div>
                )}
                {can('MANAGE_ROSTER') && (!m.uid || isOwner) && <button onClick={() => removeRosterMember(m)} className="text-white/20 hover:text-red-400 shrink-0"><X size={13} /></button>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
};

// ─── My Daily Brief tab ──────────────────────────────────────────────────────

export const DailyBriefTab: React.FC = () => {
  const { members, me, activeSheet, prod } = useProd();
  const [viewAs, setViewAs] = useState<string>('');
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemNote, setProblemNote] = useState('');
  const member = members.find(m => m.id === viewAs) || me || members[0] || null;
  const isOwnBrief = !!me && !!member && me.id === member.id;
  useEffect(() => {
    if (prod && activeSheet?.status === 'PUBLISHED' && member && isOwnBrief) Schedule.markRecipientDeliveryViewed(prod.id, activeSheet.id, activeSheet.version, member).catch(() => undefined);
  }, [prod?.id, activeSheet?.id, activeSheet?.version, activeSheet?.status, member?.id, isOwnBrief]);

  if (!activeSheet) {
    return <div className={`${card} p-10 text-center`}><Bell size={26} className="text-white/20 mx-auto mb-3" /><p className="text-sm font-black text-white/50">No brief yet</p><p className="text-xs text-white/30 mt-1">Publish a call sheet and each crew member's personalized brief appears here.</p></div>;
  }
  if (!member) return <div className="text-white/40 text-sm">Add crew to the roster to generate briefs.</div>;

  const brief = buildDailyBrief(activeSheet, member);
  const confirm = () => prod && isOwnBrief && Schedule.acknowledgeRecipientDelivery(prod.id, activeSheet.id, activeSheet.version, member);
  const reportProblem = async () => {
    if (!prod || !isOwnBrief || !problemNote.trim()) return;
    await Schedule.acknowledgeRecipientDelivery(prod.id, activeSheet.id, activeSheet.version, member, problemNote.trim());
    setProblemOpen(false); setProblemNote('');
  };
  const locationStr = brief.location + (brief.locationAddress ? ` · ${brief.locationAddress}` : '');
  const weatherStr = brief.weather
    ? [
        brief.weather.sunrise ? `↑${fmtCall(brief.weather.sunrise)}` : '',
        brief.weather.sunset ? `↓${fmtCall(brief.weather.sunset)}` : '',
        brief.weather.summary || '',
      ].filter(Boolean).join(' ').trim() || '—'
    : '—';
  const mealStr = brief.meals.map(m => `${m.label} ${fmtCall(m.time)}`).join(' · ');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* View-as selector (producers preview any role) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Daily brief for</span>
        <select className={inputCls + ' max-w-[220px]'} value={member.id} onChange={e => setViewAs(e.target.value)}>
          {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
        </select>
      </div>

      {/* Hero brief card */}
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: `${brief.dept.color}40` }}>
        <div className="px-5 py-4" style={{ background: `linear-gradient(135deg, ${brief.dept.color}30, ${brief.dept.color}08)` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: brief.dept.color }}>{brief.dept.emoji} {brief.dept.label}</p>
              <h2 className="text-xl font-black text-white mt-0.5">{member.name}</h2>
              <p className="text-[11px] text-white/50">{member.character ? `${member.character} · ` : ''}{member.role}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Your Call</p>
              <p className="text-3xl font-black text-white leading-none">{fmtCall(brief.yourCall)}</p>
              <p className="text-[10px] text-white/40 mt-1">Day {activeSheet.dayOf} of {activeSheet.totalDays}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#0d0d0d] p-5 space-y-4">
          {/* Staggered cast calls */}
          {brief.callBreakdown && (
            <div className="flex gap-2 flex-wrap">
              {brief.callBreakdown.map(b => <span key={b.label} className="px-3 py-1.5 rounded-xl bg-white/5 text-[10px] font-black text-white/70"><span className="text-white/30 uppercase tracking-widest">{b.label}</span> {fmtCall(b.time)}</span>)}
            </div>
          )}
          {/* Location + weather */}
          <div className="grid md:grid-cols-2 gap-3">
            <InfoRow icon={<MapPin size={14} className="text-red-400" />} label="Location" value={locationStr} />
            {brief.weather && <InfoRow icon={<Sun size={14} className="text-amber-400" />} label="Sun / Weather" value={weatherStr} />}
          </div>
          {/* Your focus checklist */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">What you need today</p>
            <div className="grid md:grid-cols-2 gap-1.5">
              {brief.focus.map(f => <div key={f} className="flex items-center gap-2 text-[11px] text-white/70"><CheckCircle2 size={13} style={{ color: brief.dept.color }} />{f}</div>)}
            </div>
          </div>
          {/* Scenes */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">{member.isCast ? 'Your scenes' : "Today's scenes"}</p>
            <div className="space-y-1.5">
              {brief.scenes.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] text-[11px]">
                  <span className="font-black text-violet-400 w-8">#{s.sceneNum}</span>
                  <span className="text-white/30 w-16 text-[9px] font-black">{s.intExt}·{s.dayNight}</span>
                  <span className="flex-1 text-white/70 truncate">{s.set} — {s.synopsis}</span>
                  <span className="text-white/30 text-[9px]">{pagesToEighths(s.pages)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Meals + walkie + safety */}
          <div className="grid md:grid-cols-3 gap-3">
            <InfoRow icon={<Soup size={14} className="text-teal-400" />} label="Meals" value={mealStr} />
            <InfoRow icon={<Radio size={14} className="text-sky-400" />} label="Walkie" value={`Channel ${brief.channel}`} />
            {(brief.safetyNotes || brief.nearestHospital) && <InfoRow icon={<ShieldAlert size={14} className="text-orange-400" />} label="Safety" value={brief.safetyNotes || brief.nearestHospital || ''} />}
          </div>
          {/* Confirm */}
          <button onClick={confirm} disabled={brief.confirmed || !isOwnBrief} className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${brief.confirmed ? 'bg-emerald-500/20 text-emerald-400 cursor-default' : !isOwnBrief ? 'bg-white/5 text-white/30 cursor-default' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}>
            {brief.confirmed ? <span className="flex items-center justify-center gap-2"><CheckCheck size={14} /> Confirmed — see you on set</span> : isOwnBrief ? 'Confirm receipt & call time' : 'Preview only — recipient confirms their own packet'}
          </button>
          {isOwnBrief && !brief.confirmed && <Button variant="danger-quiet" fullWidth onClick={() => setProblemOpen(current => !current)}>I have a call-time or availability problem</Button>}
          {problemOpen && isOwnBrief && <Surface level={1} className="space-y-3"><Textarea label="Tell production what conflicts" value={problemNote} maxLength={500} onChange={event => setProblemNote(event.target.value)} /><Actions><Button variant="ghost" onClick={() => setProblemOpen(false)}>Cancel</Button><Button variant="danger" disabled={!problemNote.trim()} onClick={reportProblem}>Send problem to production</Button></Actions></Surface>}
        </div>
      </div>
    </motion.div>
  );
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03]">
    <span className="mt-0.5 shrink-0">{icon}</span>
    <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-widest text-white/30">{label}</p><p className="text-[11px] text-white/70 break-words">{value || '—'}</p></div>
  </div>
);

// ─── Craft Services tab ──────────────────────────────────────────────────────

const ORDER_FLOW: Record<string, { next?: FP.OrderStatus; label: string; color: string }> = {
  REQUESTED: { next: 'PREPPING', label: 'Requested', color: 'text-yellow-400 bg-yellow-500/15' },
  PREPPING: { next: 'READY', label: 'Prepping', color: 'text-blue-400 bg-blue-500/15' },
  READY: { next: 'DELIVERED', label: 'Ready', color: 'text-emerald-400 bg-emerald-500/15' },
  DELIVERED: { label: 'Delivered', color: 'text-white/30 bg-white/5' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-400/60 bg-red-500/10' },
};
const CAT_META: Record<FP.CraftCategory, { label: string; icon: React.ReactNode }> = {
  MEAL: { label: 'Meals', icon: <Utensils size={13} /> }, SNACK: { label: 'Snacks', icon: <Soup size={13} /> },
  DRINK: { label: 'Drinks', icon: <Circle size={13} /> }, COFFEE: { label: 'Coffee', icon: <Coffee size={13} /> }, SPECIAL: { label: 'Dietary', icon: <ShieldAlert size={13} /> },
};

export const CraftServicesTab: React.FC = () => {
  const { prod, menu, orders, members, me, can } = useProd();
  const canManage = can('MANAGE_CRAFT');
  const [tab, setTab] = useState<'order' | 'queue' | 'manage'>('order');
  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', category: 'SNACK' as FP.CraftCategory, desc: '', dietaryTags: '' });

  const order = (item: CraftItem) => {
    if (!prod) return;
    const who = me || null;
    const o: CraftOrder = {
      id: FP.uid8(), itemId: item.id, itemName: item.name, qty: 1,
      forMemberId: who?.id, requestedByUid: FP.currentUid(), requestedByName: who?.name || 'Crew',
      dept: who?.dept, dietary: who?.dietary, status: 'REQUESTED', createdAt: Date.now(), updatedAt: Date.now(),
    };
    FP.putCraftOrder(prod.id, o);
    setTab('queue');
  };
  const advance = (o: CraftOrder) => { const n = ORDER_FLOW[o.status].next; if (prod && n) FP.patchCraftOrder(prod.id, o.id, { status: n }); };
  const cancel = (o: CraftOrder) => prod && FP.patchCraftOrder(prod.id, o.id, { status: 'CANCELLED' });
  const saveItem = () => {
    if (!prod || !itemForm.name.trim()) return;
    FP.putCraftItem(prod.id, { id: FP.uid8(), name: itemForm.name.trim(), category: itemForm.category, desc: itemForm.desc, dietaryTags: itemForm.dietaryTags ? itemForm.dietaryTags.split(',').map(s => s.trim()).filter(Boolean) : [], available: true, createdAt: Date.now() });
    setItemForm({ name: '', category: 'SNACK', desc: '', dietaryTags: '' }); setAddingItem(false);
  };

  const activeQueue = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').sort((a, b) => a.createdAt - b.createdAt);
  const dietaryManifest = members.filter(m => m.dietary && m.dietary.length).reduce((acc, m) => { m.dietary!.forEach(d => acc[d] = (acc[d] || 0) + 1); return acc; }, {} as Record<string, number>);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center gap-2">
        {(['order', 'queue', 'manage'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={pill(tab === t)}>{t === 'order' ? '🍽️ Menu' : t === 'queue' ? `📋 Queue (${activeQueue.length})` : '⚙️ Manage'}</button>)}
      </div>

      {tab === 'order' && (
        <>
          <p className="text-[11px] text-white/40">On-set concierge — tap to request. Your dietary flags travel with the order automatically.</p>
          {(['MEAL', 'SPECIAL', 'SNACK', 'COFFEE', 'DRINK'] as FP.CraftCategory[]).map(catKey => {
            const items = menu.filter(i => i.category === catKey && i.available);
            if (!items.length) return null;
            return (
              <div key={catKey}>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">{CAT_META[catKey].icon} {CAT_META[catKey].label}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {items.map(i => (
                    <div key={i.id} className={`${card} p-4 flex items-center gap-3`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-white">{i.name}</p>
                        {i.desc && <p className="text-[10px] text-white/40">{i.desc}</p>}
                        {i.dietaryTags && i.dietaryTags.length > 0 && <div className="flex gap-1 mt-1 flex-wrap">{i.dietaryTags.map(t => <span key={t} className="text-[8px] font-black px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300">{t}</span>)}</div>}
                      </div>
                      <button onClick={() => order(i)} className="px-3 py-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-black uppercase tracking-widest hover:bg-teal-500/25 shrink-0">Request</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'queue' && (
        <div className="space-y-2">
          {activeQueue.length === 0 && <p className="text-[11px] text-white/25 py-6 text-center">No open requests. The concierge queue is clear. ☕</p>}
          {activeQueue.map(o => (
            <div key={o.id} className={`${card} p-4 flex items-center gap-3`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">{o.qty}× {o.itemName}</p>
                <p className="text-[10px] text-white/40">{o.requestedByName}{o.dept ? ` · ${deptMeta(o.dept).label}` : ''}{o.dietary && o.dietary.length ? ` · ⚠ ${o.dietary.join(', ')}` : ''}</p>
              </div>
              <span className={`text-[9px] font-black px-2 py-1 rounded-full ${ORDER_FLOW[o.status].color}`}>{ORDER_FLOW[o.status].label}</span>
              {canManage && ORDER_FLOW[o.status].next && <button onClick={() => advance(o)} className="px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/10">→ {ORDER_FLOW[ORDER_FLOW[o.status].next!].label}</button>}
              {canManage && <button onClick={() => cancel(o)} className="text-white/20 hover:text-red-400"><X size={13} /></button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'manage' && (
        <div className="space-y-4">
          {/* Dietary manifest — auto-rolled from persistent crew profiles */}
          <div className={`${card} p-5`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Dietary Manifest (from roster)</p>
            {Object.keys(dietaryManifest).length === 0 ? <p className="text-[11px] text-white/25">No dietary flags set. Add them per crew member in the Roster.</p> : (
              <div className="flex flex-wrap gap-2">{Object.entries(dietaryManifest).map(([d, n]) => <span key={d} className="px-3 py-1.5 rounded-xl bg-teal-500/15 text-teal-300 text-[11px] font-black">{n}× {d}</span>)}</div>
            )}
          </div>
          {canManage && (
            <div className={`${card} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Menu Items</p>
                <button onClick={() => setAddingItem(a => !a)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-black uppercase tracking-widest hover:bg-teal-500/25"><Plus size={11} /> Item</button>
              </div>
              {addingItem && (
                <div className="p-4 bg-white/[0.03] border border-teal-500/20 rounded-xl space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Item name" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
                    <select className={inputCls} value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value as FP.CraftCategory }))}>{Object.entries(CAT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                  </div>
                  <input className={inputCls} placeholder="Description" value={itemForm.desc} onChange={e => setItemForm(f => ({ ...f, desc: e.target.value }))} />
                  <input className={inputCls} placeholder="Dietary tags (vegan, gluten-free…)" value={itemForm.dietaryTags} onChange={e => setItemForm(f => ({ ...f, dietaryTags: e.target.value }))} />
                  <button onClick={saveItem} className="w-full py-2 rounded-xl bg-teal-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-teal-400">Add Item</button>
                </div>
              )}
              <div className="space-y-1.5">
                {menu.map(i => (
                  <div key={i.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] text-[11px]">
                    <span className="flex-1 text-white/70">{i.name} <span className="text-white/25">· {CAT_META[i.category].label}</span></span>
                    <button onClick={() => prod && FP.removeCraftItem(prod.id, i.id)} className="text-white/20 hover:text-red-400"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

// ─── Reports: Sides + Daily Production Report ────────────────────────────────

function printDoc(title: string, inner: string) {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Georgia,'Times New Roman',serif;color:#111;padding:40px;max-width:760px;margin:0 auto;line-height:1.4}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#444;border-bottom:1px solid #000;padding-bottom:3px;margin:22px 0 8px}
    .muted{color:#666;font-size:12px;margin-bottom:20px}
    .slug{font-weight:bold;text-transform:uppercase;font-size:13px}
    .scene{margin-bottom:26px;page-break-inside:avoid;border-left:3px solid #ccc;padding-left:12px}
    .chars{font-size:11px;color:#666;margin:2px 0 8px}
    pre{white-space:pre-wrap;font-family:inherit;font-size:13px;margin:0}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px} td,th{border:1px solid #bbb;padding:4px 7px;text-align:left} th{background:#f0f0f0}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 24px;font-size:12px;margin-bottom:12px}
  </style></head><body>${inner}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 350);
}

const useActiveSheet = () => {
  const { callSheets, activeSheetId, setActiveSheetId } = useProd();
  const sorted = [...callSheets].sort((a, b) => a.shootDay - b.shootDay);
  const cs = callSheets.find(c => c.id === activeSheetId) || sorted[0] || null;
  return { cs, sorted, setActiveSheetId };
};

export const ReportsTab: React.FC = () => {
  const [mode, setMode] = useState<'sides' | 'dpr'>('sides');
  const { cs, sorted, setActiveSheetId } = useActiveSheet();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <button onClick={() => setMode('sides')} className={pill(mode === 'sides')}>📄 Sides</button>
          <button onClick={() => setMode('dpr')} className={pill(mode === 'dpr')}>📊 Daily Report</button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {sorted.map(c => <button key={c.id} onClick={() => setActiveSheetId(c.id)} className={pill(c.id === cs?.id)}>Day {c.shootDay}</button>)}
        </div>
      </div>
      {!cs ? (
        <div className={`${card} p-10 text-center`}>
          <p className="text-sm font-black text-white/50 mb-1">No shoot days yet</p>
          <p className="text-xs text-white/30">Generate a call sheet first — sides and the daily report build from it.</p>
        </div>
      ) : mode === 'sides' ? <SidesView cs={cs} /> : <DprView cs={cs} />}
    </motion.div>
  );
};

const SidesView: React.FC<{ cs: CallSheet }> = ({ cs }) => {
  const { prod, isOwner } = useProd();
  const [scripts, setScripts] = useState<WritingProject[]>([]);
  const [blocks, setBlocks] = useState<{ heading: string; text: string }[]>([]);
  useEffect(() => { if (prod?.ownerUid) listWritingProjects(prod.ownerUid).then(r => setScripts(r.projects.filter(p => p.kind === 'SCRIPT'))).catch(() => {}); }, [prod?.ownerUid]);
  useEffect(() => {
    // Sides must reflect the LOCKED greenlit revision, not the writer's live edits.
    // Read the current script draft's blocks; fall back to the live script only when no draft exists.
    if (prod?.currentDraftId) {
      FP.fetchDraftBlocks(prod.id, prod.currentDraftId)
        .then(blocks => { if (blocks.length) setBlocks(blocks); else if (prod.linkedScriptId) fetchScriptScenes(prod.linkedScriptId).then(setBlocks).catch(() => setBlocks([])); else setBlocks([]); })
        .catch(() => { if (prod.linkedScriptId) fetchScriptScenes(prod.linkedScriptId).then(setBlocks).catch(() => setBlocks([])); else setBlocks([]); });
    } else if (prod?.linkedScriptId) fetchScriptScenes(prod.linkedScriptId).then(setBlocks).catch(() => setBlocks([]));
    else setBlocks([]);
  }, [prod?.currentDraftId, prod?.linkedScriptId, prod?.id]);

  const sides = buildSides(cs, blocks);
  const linked = scripts.find(s => s.id === prod?.linkedScriptId);
  const print = () => {
    const inner = `<h1>Sides — Day ${cs.shootDay}</h1><div class="muted">${prod?.title || 'Production'} · ${cs.date || ''} · ${cs.locationName}${linked ? ` · from “${linked.title}”` : ''}</div>` +
      sides.map(s => `<div class="scene"><div class="slug">Sc. ${s.sceneNum} — ${s.slug} (${pagesToEighths(s.pages)} pg)</div><div class="chars">${s.characters.join(', ')}</div><pre>${(s.body || '').replace(/</g, '&lt;')}</pre></div>`).join('');
    printDoc(`Sides — Day ${cs.shootDay}`, inner);
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex items-center justify-between gap-3 flex-wrap`}>
        <div>
          <p className="text-sm font-black text-white">Sides — Day {cs.shootDay}</p>
          <p className="text-[10px] text-white/40">{sides.length} scene{sides.length !== 1 ? 's' : ''} · {pagesToEighths(sides.reduce((s, x) => s + x.pages, 0))} pages{linked ? ` · pulling pages from “${linked.title}”` : ' · from scene synopses'}</p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && scripts.length > 0 && (
            <select value={prod?.linkedScriptId || ''} onChange={e => prod && FP.updateProduction(prod.id, { linkedScriptId: e.target.value || undefined })} className={inputCls + ' max-w-[200px]'}>
              <option value="">No linked script</option>
              {scripts.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          <button onClick={print} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 shrink-0"><Printer size={13} /> Print</button>
        </div>
      </div>
      {sides.map(s => (
        <div key={s.sceneNum} className={`${card} overflow-hidden`}>
          <div className="px-5 py-2.5 bg-white/[0.04] border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-[11px] font-black text-white uppercase tracking-wide">Sc. {s.sceneNum} — {s.slug}</p>
            <span className="text-[9px] text-white/30 font-black">{pagesToEighths(s.pages)} pg</span>
          </div>
          <div className="p-5">
            {s.characters.length > 0 && <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">{s.characters.join(' · ')}</p>}
            <pre className="text-[12px] text-white/75 whitespace-pre-wrap font-sans leading-relaxed">{s.body}</pre>
          </div>
        </div>
      ))}
    </div>
  );
};

const WORK_CODES: CastWorkCode[] = ['SW', 'W', 'WF', 'SWF', 'H', 'T', 'R'];
const SCENE_STATUS: SceneShootStatus[] = ['NOT_SHOT', 'COMPLETED', 'PARTIAL', 'OMITTED'];
const STATUS_STYLE: Record<SceneShootStatus, string> = {
  COMPLETED: 'text-emerald-400 bg-emerald-500/15', PARTIAL: 'text-yellow-400 bg-yellow-500/15',
  NOT_SHOT: 'text-white/40 bg-white/5', OMITTED: 'text-white/25 bg-white/5',
};

const DprView: React.FC<{ cs: CallSheet }> = ({ cs }) => {
  const { prod, dprs, scenes, can, me } = useProd();
  const canManage = can('MANAGE_REPORTS');
  const existing = dprs.find(d => d.callSheetId === cs.id) || dprs.find(d => d.shootDay === cs.shootDay) || null;

  const generate = () => { if (prod) FP.putDpr(prod.id, generateDPR(prod, cs, me?.name)); };

  if (!existing) {
    return (
      <div className={`${card} p-10 text-center`}>
        <ClipboardList size={26} className="text-white/20 mx-auto mb-3" />
        <p className="text-sm font-black text-white/60 mb-1">No report for Day {cs.shootDay}</p>
        <p className="text-xs text-white/30 mb-5 max-w-sm mx-auto">Generate the Daily Production Report from this call sheet — scenes, cast, and scheduled times are prefilled; you fill in the day's actuals.</p>
        {canManage
          ? <button onClick={generate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400"><Wand2 size={14} /> Generate DPR</button>
          : <p className="text-[11px] text-white/30">The production office generates the report.</p>}
      </div>
    );
  }
  return <DprEditor key={existing.id} dpr={existing} cs={cs} allDprs={dprs} totalScenes={scenes.length} totalPages={scenes.reduce((s, x) => s + x.pages, 0)} editable={canManage} />;
};

const DprEditor: React.FC<{ dpr: DailyProductionReport; cs: CallSheet; allDprs: DailyProductionReport[]; totalScenes: number; totalPages: number; editable: boolean }> = ({ dpr, cs, allDprs, totalScenes, totalPages, editable }) => {
  const { prod } = useProd();
  const [d, setD] = useState<DailyProductionReport>(dpr);
  useEffect(() => setD(dpr), [dpr.id]);
  const dirty = JSON.stringify(d) !== JSON.stringify(dpr);
  const set = (p: Partial<DailyProductionReport>) => setD(x => ({ ...x, ...p }));
  const setScene = (i: number, p: Partial<DprSceneRow>) => setD(x => ({ ...x, sceneRows: x.sceneRows.map((r, j) => j === i ? { ...r, ...p } : r) }));
  const setCast = (i: number, p: Partial<{ work: CastWorkCode }>) => setD(x => ({ ...x, castRows: x.castRows.map((r, j) => j === i ? { ...r, ...p } : r) }));
  const save = () => prod && FP.putDpr(prod.id, { ...d, updatedAt: Date.now() });
  const finalize = () => { if (!prod) return; const f = { ...d, status: 'FINAL' as const, finalizedAt: Date.now(), updatedAt: Date.now() }; setD(f); FP.putDpr(prod.id, f); };

  const totals = dprDayTotals(d);
  // Cumulative across all FINAL reports (+ this one if final).
  const finals = allDprs.filter(x => x.status === 'FINAL' && x.id !== d.id).concat(d.status === 'FINAL' ? [d] : []);
  const cum = finals.reduce((acc, x) => { const t = dprDayTotals(x); acc.scenes += t.scenesShot; acc.pages += t.pagesShot; return acc; }, { scenes: 0, pages: 0 });

  const print = () => {
    const times = `<div class="grid"><div><b>Crew call:</b> sched ${fmtCall(d.crewCallSched)} / actual ${fmtCall(d.crewCallActual)}</div><div><b>First shot:</b> ${fmtCall(d.firstShotActual)}</div><div><b>Lunch:</b> ${fmtCall(d.lunchOut)}–${fmtCall(d.lunchIn)}</div><div><b>Wrap:</b> sched ${fmtCall(d.wrapSched)} / actual ${fmtCall(d.wrapActual)}</div></div>`;
    const sceneTbl = `<h2>Scenes</h2><table><tr><th>Sc</th><th>Set</th><th>Status</th><th>Pages</th><th>Setups</th><th>Takes</th></tr>${d.sceneRows.map(s => `<tr><td>${s.sceneNum}</td><td>${s.set}</td><td>${s.status}</td><td>${pagesToEighths(s.pagesShot)}/${pagesToEighths(s.scheduledPages)}</td><td>${s.setups}</td><td>${s.takes}</td></tr>`).join('')}</table>`;
    const castTbl = `<h2>Cast</h2><table><tr><th>Character</th><th>Actor</th><th>Work</th></tr>${d.castRows.map(c => `<tr><td>${c.character}</td><td>${c.actor || ''}</td><td>${c.work}</td></tr>`).join('')}</table>`;
    const summary = `<h2>Day Summary</h2><div class="grid"><div><b>Scenes:</b> ${totals.scenesShot}/${totals.scenesScheduled}</div><div><b>Pages:</b> ${pagesToEighths(totals.pagesShot)}/${pagesToEighths(totals.pagesScheduled)}</div><div><b>Setups:</b> ${totals.setups}</div><div><b>BG:</b> ${d.bgCount || 0}</div></div>${d.delays ? `<p><b>Delays:</b> ${d.delays}</p>` : ''}${d.accidents ? `<p><b>Accidents/Safety:</b> ${d.accidents}</p>` : ''}${d.generalNotes ? `<p><b>Notes:</b> ${d.generalNotes}</p>` : ''}`;
    printDoc(`DPR — Day ${d.shootDay}`, `<h1>Daily Production Report — Day ${d.shootDay}</h1><div class="muted">${prod?.title || 'Production'} · ${d.date || ''} · ${cs.locationName} · Weather: ${d.weather || 'n/a'}${d.preparedBy ? ` · Prepared by ${d.preparedBy}` : ''}</div>${times}${summary}${sceneTbl}${castTbl}`);
  };

  const numCls = inputCls + ' text-center';
  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex items-center justify-between flex-wrap gap-3`}>
        <div>
          <p className="text-sm font-black text-white">DPR — Day {d.shootDay} {d.status === 'FINAL' ? <span className="text-emerald-400 text-[9px]">● FINAL</span> : <span className="text-white/30 text-[9px]">DRAFT</span>}</p>
          <p className="text-[10px] text-white/40">{totals.scenesShot}/{totals.scenesScheduled} scenes · {pagesToEighths(totals.pagesShot)}/{pagesToEighths(totals.pagesScheduled)} pages · {totals.setups} setups</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={print} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/60 text-[11px] font-black uppercase tracking-widest hover:bg-white/10"><Printer size={12} /> Print</button>
          {editable && dirty && <button onClick={save} className="px-4 py-2 rounded-xl bg-white/5 text-white/60 text-[11px] font-black uppercase tracking-widest hover:bg-white/10">Save</button>}
          {editable && d.status !== 'FINAL' && <button onClick={finalize} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/90 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-400"><CheckCheck size={12} /> Finalize</button>}
        </div>
      </div>

      {/* Cumulative progress vs schedule */}
      <div className={`${card} p-5`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Production Progress (finalized days)</p>
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-[9px] text-white/30 uppercase tracking-widest">Scenes shot</p><p className="text-lg font-black text-white">{cum.scenes}<span className="text-white/30 text-sm"> / {totalScenes}</span></p><div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${totalScenes ? Math.min(100, (cum.scenes / totalScenes) * 100) : 0}%` }} /></div></div>
          <div><p className="text-[9px] text-white/30 uppercase tracking-widest">Pages shot</p><p className="text-lg font-black text-white">{pagesToEighths(cum.pages)}<span className="text-white/30 text-sm"> / {pagesToEighths(totalPages)}</span></p><div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalPages ? Math.min(100, (cum.pages / totalPages) * 100) : 0}%` }} /></div></div>
        </div>
      </div>

      {/* Actual times */}
      <div className={`${card} p-5`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Actual Times</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <TimeField label="Crew Call" sched={d.crewCallSched} value={d.crewCallActual} editable={editable} onChange={v => set({ crewCallActual: v })} />
          <TimeField label="First Shot" value={d.firstShotActual} editable={editable} onChange={v => set({ firstShotActual: v })} />
          <TimeField label="Lunch Out" value={d.lunchOut} editable={editable} onChange={v => set({ lunchOut: v })} />
          <TimeField label="Lunch In" value={d.lunchIn} editable={editable} onChange={v => set({ lunchIn: v })} />
          <TimeField label="2nd Meal Out" value={d.secondMealOut} editable={editable} onChange={v => set({ secondMealOut: v })} />
          <TimeField label="2nd Meal In" value={d.secondMealIn} editable={editable} onChange={v => set({ secondMealIn: v })} />
          <TimeField label="Camera Wrap" value={d.cameraWrap} editable={editable} onChange={v => set({ cameraWrap: v })} />
          <TimeField label="Wrap" sched={d.wrapSched} value={d.wrapActual} editable={editable} onChange={v => set({ wrapActual: v })} />
        </div>
      </div>

      {/* Scene coverage */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3 bg-violet-500/10 border-b border-white/[0.06]"><p className="text-[11px] font-black uppercase tracking-widest text-violet-400">Scene Coverage</p></div>
        <div className="divide-y divide-white/[0.04]">
          {d.sceneRows.map((s, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-2 flex-wrap text-[11px]">
              <span className="font-black text-violet-400 w-8">#{s.sceneNum}</span>
              <span className="text-white/50 flex-1 min-w-[100px] truncate">{s.set}</span>
              {editable ? (
                <select value={s.status} onChange={e => setScene(i, { status: e.target.value as SceneShootStatus })} className={`${inputCls} w-28`}>{SCENE_STATUS.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}</select>
              ) : <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status]}`}>{s.status.replace('_', ' ')}</span>}
              <label className="text-[9px] text-white/30">pg{editable ? <input type="number" step="0.125" value={s.pagesShot} onChange={e => setScene(i, { pagesShot: parseFloat(e.target.value) || 0 })} className={`${numCls} w-16 ml-1 inline-block`} /> : <b className="text-white/60 ml-1">{pagesToEighths(s.pagesShot)}</b>}</label>
              <label className="text-[9px] text-white/30">setups{editable ? <input type="number" value={s.setups} onChange={e => setScene(i, { setups: parseInt(e.target.value) || 0 })} className={`${numCls} w-14 ml-1 inline-block`} /> : <b className="text-white/60 ml-1">{s.setups}</b>}</label>
              <label className="text-[9px] text-white/30">takes{editable ? <input type="number" value={s.takes} onChange={e => setScene(i, { takes: parseInt(e.target.value) || 0 })} className={`${numCls} w-14 ml-1 inline-block`} /> : <b className="text-white/60 ml-1">{s.takes}</b>}</label>
            </div>
          ))}
        </div>
      </div>

      {/* Cast worked */}
      {d.castRows.length > 0 && (
        <div className={`${card} overflow-hidden`}>
          <div className="px-5 py-3 bg-amber-500/10 border-b border-white/[0.06]"><p className="text-[11px] font-black uppercase tracking-widest text-amber-400">Cast — Work Status (SW/W/WF/H/T/R)</p></div>
          <div className="divide-y divide-white/[0.04]">
            {d.castRows.map((c, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-[11px]">
                <span className="font-black text-white w-32 truncate">{c.character}</span>
                <span className="text-white/40 flex-1 truncate">{c.actor}</span>
                {editable ? <select value={c.work} onChange={e => setCast(i, { work: e.target.value as CastWorkCode })} className={`${inputCls} w-20`}>{WORK_CODES.map(w => <option key={w} value={w}>{w}</option>)}</select>
                  : <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{c.work}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className={`${card} p-5 grid md:grid-cols-2 gap-4`}>
        <NoteField label="Delays / Lost Time (& reasons)" value={d.delays} editable={editable} onChange={v => set({ delays: v })} />
        <NoteField label="Accidents / Safety Incidents" value={d.accidents} editable={editable} onChange={v => set({ accidents: v })} />
        <NoteField label="Weather" value={d.weather} editable={editable} onChange={v => set({ weather: v })} single />
        <NoteField label="Background / Extras Count" value={String(d.bgCount ?? '')} editable={editable} onChange={v => set({ bgCount: parseInt(v) || 0 })} single number />
        <div className="md:col-span-2"><NoteField label="General Notes" value={d.generalNotes} editable={editable} onChange={v => set({ generalNotes: v })} /></div>
      </div>
    </div>
  );
};

const TimeField: React.FC<{ label: string; value?: string; sched?: string; editable: boolean; onChange: (v: string) => void }> = ({ label, value, sched, editable, onChange }) => (
  <div>
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{label}{sched ? <span className="text-white/20"> · sched {fmtCall(sched)}</span> : ''}</p>
    {editable ? <input type="time" value={value || ''} onChange={e => onChange(e.target.value)} className={inputCls} /> : <p className="text-[12px] text-white/80 font-semibold">{fmtCall(value)}</p>}
  </div>
);

const NoteField: React.FC<{ label: string; value?: string; editable: boolean; onChange: (v: string) => void; single?: boolean; number?: boolean }> = ({ label, value, editable, onChange, single, number }) => (
  <div>
    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{label}</p>
    {editable
      ? (single ? <input type={number ? 'number' : 'text'} value={value || ''} onChange={e => onChange(e.target.value)} className={inputCls} /> : <textarea rows={2} value={value || ''} onChange={e => onChange(e.target.value)} className={inputCls + ' resize-none'} />)
      : <p className="text-[12px] text-white/70">{value || '—'}</p>}
  </div>
);

// ─── Private producer broadcast (Reello live, isPrivate) ─────────────────────

const ProducerBroadcast: React.FC<{ prodId: string; onClose: () => void }> = ({ prodId, onClose }) => (
  <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm">
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
      <Radio size={12} /> Private Producer Stream — offsite eyes only
    </div>
    <LiveStudio clubId={`prod:${prodId}`} isPrivate onClose={onClose} />
  </div>
);
