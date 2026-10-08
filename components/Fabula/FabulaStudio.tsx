/**
 * Fabula Studio — The Hollywood Studio OS for Plajah
 * Complete full-lifecycle film production operating system across 5 stages:
 *
 * 1. DEVELOPMENT: Scriptwriting, Revision Ladder, Story Intel, Coverage
 * 2. PRE-PRODUCTION: Script Breakdown (DOOD), Stripboard Scheduling, Crew Staffing, Locations, Clearances, Budget
 * 3. PRODUCTION (ON SET): Master Clock, Daily Call Sheets, Sides, Take Logger ("Set-to-Cut"), Continuity Eye, DPRs, Comms
 * 4. POST-PRODUCTION: Full Fabula NLE Suite (Media, Edit, VFX, Color, Audio, Deliver)
 * 5. RELEASE: Deliverables Binder, Festival & Laurel Tracker, Plajah Premiere & Box Office
 */

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clapperboard, Calendar, Layers, DollarSign, Users, MapPin, Shield,
  Scissors, Eye, Package, Award, LayoutDashboard, FileText, Briefcase,
  UserCheck, Utensils, ClipboardList, MessageSquare, ArrowLeft, ArrowRight,
  Sparkles, CheckCircle2, ChevronRight, Music2, BookOpen, Clock, Smartphone
} from 'lucide-react';
import { UserProfile } from '../../types';
import '../../styles/fabula-studio.css';
import { Button } from '../ui';
import SetToCutAssembly from './SetToCutAssembly';
import {
  FilmProductionProvider,
  ProductionHubTab,
  CallSheetsTab,
  RosterTab,
  DailyBriefTab,
  CraftServicesTab,
  ReportsTab,
  useProd
} from '../film/FilmProductionSuite';
import { FilmBreakdownTab } from '../film/FilmBreakdownTab';
import { FilmStaffingTab } from '../film/FilmStaffingTab';
import { FilmScheduleTab as ProductionScheduleTab } from '../film/FilmScheduleTab';
import ProductionChatWorkspace from '../film/ProductionChatWorkspace';
import {
  FilmOverviewTab,
  FilmScriptTab,
  FilmBudgetTab,
  FilmCrewTab,
  FilmLocationsTab,
  FilmClearancesTab,
  FilmDeliverablesTab,
  FilmContinuityTab,
  FilmEditTab,
  FilmDistroTab,
  PMTab
} from '../ArtistProjectManager';

// Lazy-load the heavy post-production NLE suite when Phase 4 opens
const FabulaNLE = React.lazy(() => import('./Fabula'));

const FIRST_TAB: Record<string, string> = { dev: 'script', pre: 'breakdown', prod: 'hub', post: 'nle', release: 'deliverables' };

export type StudioStage = 'dev' | 'pre' | 'prod' | 'post' | 'release';

interface StageMeta {
  id: StudioStage;
  number: string;
  label: string;
  subtitle: string;
  icon: string;
  color: string;
}

const STAGES: StageMeta[] = [
  { id: 'dev',     number: '01', label: 'Development',     subtitle: 'Script & Story Intel',       icon: '📝', color: 'var(--pj-lilac)' },
  { id: 'pre',     number: '02', label: 'Pre-Production',  subtitle: 'Breakdown, Crew & Schedule', icon: '📋', color: 'var(--pj-cyan)' },
  { id: 'prod',    number: '03', label: 'Production',      subtitle: 'On-Set Hub & Take Logger',   icon: '🎬', color: 'var(--pj-magenta)' },
  { id: 'post',    number: '04', label: 'Post-Production', subtitle: 'Fabula 6-Room NLE',          icon: '✂️', color: 'var(--pj-orange)' },
  { id: 'release', number: '05', label: 'Release',          subtitle: 'Festivals & Deliverables',   icon: '🚀', color: 'var(--pj-success)' },
];

interface Props {
  /** Provided by the shell's own provider chrome (see FilmProductionProvider `chrome`). */
  bar?: React.ReactNode;
  clock?: React.ReactNode;
  emptyState?: React.ReactNode;
  currentUser?: UserProfile | null;
  initialStage?: StudioStage;
  initialTab?: PMTab;
  onOpenChoraManager?: () => void;
  onOpenWritersDesk?: () => void;
  onBack?: () => void;
  /** Hosted as the Film Production tab inside the Fabula editor. */
  embedded?: boolean;
  /** When embedded, Post-Production › NLE hands back to the host editor instead of nesting one. */
  onOpenEditor?: () => void;
}

export const FabulaStudio: React.FC<Props> = ({
  currentUser,
  initialStage = 'prod',
  initialTab,
  onOpenChoraManager,
  onOpenWritersDesk,
  onBack,
  embedded,
  onOpenEditor,
}) => {
  return (
    <FilmProductionProvider
      currentUser={currentUser}
      onGoTab={() => {}}
      chrome={({ bar, clock, content, hasProd }) => (
        <FabulaStudioInner
          currentUser={currentUser}
          initialStage={initialStage}
          initialTab={initialTab}
          onOpenChoraManager={onOpenChoraManager}
          onOpenWritersDesk={onOpenWritersDesk}
          onBack={onBack}
          embedded={embedded}
          onOpenEditor={onOpenEditor}
          bar={bar}
          clock={clock}
          emptyState={hasProd ? null : content}
        />
      )}
    />
  );
};

const FabulaStudioInner: React.FC<Props> = ({
  currentUser,
  initialStage = 'prod',
  bar,
  clock,
  emptyState,
  onOpenChoraManager,
  onOpenWritersDesk,
  onBack,
  embedded,
  onOpenEditor,
}) => {
  const { prod, scenes } = useProd();
  const [currentStage, setCurrentStage] = useState<StudioStage>(initialStage);
  // Embedded, the NLE tab only jumps back to the host editor — so Post opens on Set-to-Cut.
  const [activeSubtab, setActiveSubtab] = useState<string>(
    onOpenEditor && initialStage === 'post' ? 'edit_bridge' : FIRST_TAB[initialStage]);
  // Calculate shoot progress
  const shootDays = useMemo(() => {
    return scenes.length > 0 ? Math.max(...scenes.map(s => s.shootDay)) : 0;
  }, [scenes]);
  const scenesShot = useMemo(() => scenes.filter(s => s.status === 'SHOT').length, [scenes]);

  // Stage sub-tabs definition
  const subtabsByStage = useMemo(() => ({
    dev: [
      { id: 'script', label: 'Screenplay & Revisions', icon: <Clapperboard size={13} /> },
      { id: 'overview', label: 'Story & Project Overview', icon: <FileText size={13} /> },
    ],
    pre: [
      { id: 'breakdown', label: 'Script Breakdown (DOOD)', icon: <Layers size={13} /> },
      { id: 'schedule', label: 'Stripboard Schedule', icon: <Calendar size={13} /> },
      { id: 'staffing', label: 'Staffing & Hiring', icon: <Briefcase size={13} /> },
      { id: 'crew', label: 'Crew & Roster', icon: <Users size={13} /> },
      { id: 'locations', label: 'Locations & Permits', icon: <MapPin size={13} /> },
      { id: 'clearances', label: 'Clearances & Releases', icon: <Shield size={13} /> },
      { id: 'budget', label: 'Master Budget & POs', icon: <DollarSign size={13} /> },
    ],
    prod: [
      { id: 'hub', label: 'On-Set Hub', icon: <LayoutDashboard size={13} /> },
      { id: 'callsheets', label: 'Call Sheets', icon: <FileText size={13} /> },
      { id: 'brief', label: 'Daily Sides & Brief', icon: <UserCheck size={13} /> },
      { id: 'edit', label: 'Take Logger & Rough Cut', icon: <Scissors size={13} /> },
      { id: 'continuity', label: 'Continuity Eye (CV)', icon: <Eye size={13} /> },
      { id: 'reports', label: 'Daily Production Report (DPR)', icon: <ClipboardList size={13} /> },
      { id: 'chat', label: 'Production Comms', icon: <MessageSquare size={13} /> },
      { id: 'craft', label: 'Craft Services', icon: <Utensils size={13} /> },
    ],
    post: [
      { id: 'nle', label: 'Fabula NLE Finishing Suite', icon: <Scissors size={13} /> },
      { id: 'edit_bridge', label: 'Set-to-Cut Assembly', icon: <Layers size={13} /> },
    ],
    release: [
      { id: 'deliverables', label: 'Master Deliverables Binder', icon: <Package size={13} /> },
      { id: 'distro', label: 'Festivals & Laurel Tracker', icon: <Award size={13} /> },
    ],
  }), []);

  // "Assemble in Fabula" (Take Logger → filmEditBridge) stashes the rough-cut project then fires
  // OPEN_FABULA. We're already mounted, so App's setView is a no-op — jump to the NLE ourselves, and
  // remount it (nonce key) so its boot consumer re-reads the freshly stashed project.
  const [nleNonce, setNleNonce] = useState(0);
  useEffect(() => {
    if (embedded) return; // the host editor consumes the handoff itself
    const onOpen = () => { setCurrentStage('post'); setActiveSubtab('nle'); setNleNonce((n) => n + 1); };
    window.addEventListener('OPEN_FABULA', onOpen);
    return () => window.removeEventListener('OPEN_FABULA', onOpen);
  }, [embedded]);

  // Sync active subtab when switching stage
  const switchStage = (s: StudioStage) => {
    setCurrentStage(s);
    // Embedded in the editor, the NLE tab is a jump back to it — land on Set-to-Cut instead.
    const tabs = (subtabsByStage[s] || []).filter(t => !(onOpenEditor && t.id === 'nle'));
    if (tabs.length > 0) {
      setActiveSubtab(tabs[0].id);
    }
  };

  const stageMeta = STAGES.find(st => st.id === currentStage)!;
  const isNle = currentStage === 'post' && activeSubtab === 'nle';

  const renderActiveSurface = () => {
    if (isNle) {
      return (
        <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: 360, opacity: 0.6, fontSize: 13 }}>Booting Fabula NLE…</div>}>
          <div className="fs-bleed-host">
            <FabulaNLE key={nleNonce} />
          </div>
        </Suspense>
      );
    }

    switch (activeSubtab) {
      // Stage 1: Development
      case 'script':        return <FilmScriptTab />;
      case 'overview':      return <FilmOverviewTab />;

      // Stage 2: Pre-Production
      case 'breakdown':     return <FilmBreakdownTab />;
      case 'schedule':      return <ProductionScheduleTab />;
      case 'staffing':      return <FilmStaffingTab />;
      case 'crew':          return <FilmCrewTab />;
      case 'locations':     return <FilmLocationsTab />;
      case 'clearances':    return <FilmClearancesTab />;
      case 'budget':        return <FilmBudgetTab />;

      // Stage 3: Production (On Set)
      case 'hub':           return <ProductionHubTab />;
      case 'callsheets':    return <CallSheetsTab />;
      case 'brief':         return <DailyBriefTab />;
      case 'edit':          return <FilmEditTab />;
      case 'continuity':    return <FilmContinuityTab />;
      case 'reports':       return <ReportsTab />;
      case 'chat':          return <ProductionChatWorkspace />;
      case 'craft':         return <CraftServicesTab />;

      // Stage 4: Post-Production
      case 'edit_bridge':   return <SetToCutAssembly onGoTab={(id) => { setCurrentStage('prod'); setActiveSubtab(id); }} />;

      // Stage 5: Release
      case 'deliverables':  return <FilmDeliverablesTab />;
      case 'distro':        return <FilmDistroTab />;

      default:              return <ProductionHubTab />;
    }
  };

  return (
    <div className="fs-root">
      <header className="fs-hdr">
        <div className="fs-brand">
          {onBack && <Button variant="ghost" size="xs" iconOnly aria-label="Back" icon={<ArrowLeft size={14} />} onClick={onBack} />}
          <div className="fs-mark" aria-hidden>F</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="fs-title">{prod?.title || 'Fabula Studio'}</h1>
              <span className="fs-pill"><i />{scenesShot}/{scenes.length} shot{shootDays > 0 ? ` · ${shootDays}d` : ''}</span>
            </div>
            <div className="fs-sub-title">Script to Screen · the end-to-end studio</div>
          </div>
        </div>

        <nav className="fs-pipeline" aria-label="Studio stages">
          {STAGES.map(stage => (
            <button key={stage.id} type="button" className="fs-stage" style={{ ['--stage' as any]: stage.color }}
              aria-current={currentStage === stage.id} onClick={() => switchStage(stage.id)} title={stage.subtitle}>
              <b>{stage.number}</b><span>{stage.label}</span>
            </button>
          ))}
        </nav>

        <div className="fs-hdr-right">
          {onOpenChoraManager && <Button variant="secondary" size="xs" icon={<Music2 size={12} />} onClick={onOpenChoraManager} title="Open Music Artist Manager in Chora"><span className="fs-label">Chora Manager</span></Button>}
          {onOpenWritersDesk && <Button variant="secondary" size="xs" icon={<BookOpen size={12} />} onClick={onOpenWritersDesk} title="Open The Writer's Desk in Lorea"><span className="fs-label">Writer's Desk</span></Button>}
        </div>
      </header>

      <div className="fs-subbar" style={{ ['--stage' as any]: stageMeta.color }}>
        <div className="fs-tabs" role="tablist" aria-label={`${stageMeta.label} tools`}>
          {(subtabsByStage[currentStage] || []).map(tab => (
            <button key={tab.id} type="button" role="tab" className="fs-tab" style={{ ['--stage' as any]: stageMeta.color }}
              aria-selected={activeSubtab === tab.id} onClick={() => (tab.id === 'nle' && onOpenEditor ? onOpenEditor() : setActiveSubtab(tab.id))}>
              {tab.icon}<span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="fs-tab-hint" style={{ ['--stage' as any]: stageMeta.color }}>{stageMeta.subtitle}</div>
      </div>

      <main className={isNle && !emptyState ? 'fs-main fs-main--bleed' : 'fs-main'}>
        {emptyState ? emptyState : (
          <>
            {!isNle && <div className="fs-workspace">{bar}{clock}</div>}
            <AnimatePresence mode="wait">
              <motion.div key={`${currentStage}_${activeSubtab}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} style={isNle ? { flex: 1, display: 'flex', flexDirection: 'column' } : undefined}>
                {renderActiveSurface()}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </main>
    </div>
  );
};

export default FabulaStudio;
