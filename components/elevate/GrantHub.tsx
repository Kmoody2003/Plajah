// GrantHub — Elevate's grants workspace: Find → Apply (with Aria) → Profile → Learn.
//
// Contracts & loans  (businesses only) SBA financing + federal contract opportunities
// Find     the federal matcher (live Grants.gov), with a "Start application" button on every match
// Apply    Aria opens the application: pulls what we know, asks for what is missing, fills PDFs,
//          drafts from your facts, and convenes the Grant Council
// Profile  the answers every application asks for, confirmed once
// Learn    Grant School: a short course on the whole process, with practice

import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BookOpen, Briefcase, FileText, Search, UserCog } from 'lucide-react';
import type { Organization } from '../../types';
import { grantsApi, type Workspace } from '../../services/grants/client';
import GrantMatcher, { type GrantMatch } from './GrantMatcher';
import GrantProfile from './GrantProfile';
import { EV } from './vellum';

const GrantApply = lazy(() => import('./GrantApply'));
const GrantContracts = lazy(() => import('./GrantContracts'));
const SchoolView = lazy(() => import('../school/SchoolView'));

type Tab = 'find' | 'apply' | 'business' | 'profile' | 'learn';
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'find', label: 'Find grants', icon: Search },
  { key: 'apply', label: 'My applications', icon: FileText },
  { key: 'business', label: 'Contracts & loans', icon: Briefcase },
  { key: 'profile', label: 'Profile', icon: UserCog },
  { key: 'learn', label: 'Grant School', icon: BookOpen },
];

const LearnTab: React.FC = () => {
  const [curriculum, setCurriculum] = useState<any>(null);
  useEffect(() => { import('../../data/grantSchoolCurriculum').then(m => setCurriculum(m.GRANT_SCHOOL)); }, []);
  if (!curriculum) return <p className="text-sm" style={{ color: EV.muted }}>Loading Grant School…</p>;
  return <Suspense fallback={null}><SchoolView curriculum={curriculum} embedded /></Suspense>;
};

export const GrantHub: React.FC<{ org: Organization }> = ({ org }) => {
  const [tab, setTab] = useState<Tab>('find');
  const [ws, setWs] = useState<Workspace | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ id: string; title: string } | null>(null);

  const refresh = useCallback(() => grantsApi.workspace(org.id).then(w => { setWs(w); setWsError(null); }).catch(e => setWsError(e?.message || 'Could not load your workspace')), [org.id]);
  useEffect(() => { refresh(); }, [refresh]);

  const start = (m: GrantMatch) => { setCurrent({ id: m.id, title: m.title }); setTab('apply'); };
  const saveAnswer = async (key: string, value: string) => { const r = await grantsApi.saveAnswer(org.id, key, value); setWs(w => (w ? { ...w, profile: r.profile } : w)); };

  const isBusiness = !!ws && ['small-business', 'business'].includes(ws.kind);
  const inProgress = Object.entries(ws?.applications || {}).filter(([, a]) => a.title).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.filter(t => t.key !== 'business' || isBusiness).map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                  className="px-4 py-2 rounded-full text-[12px] font-bold inline-flex items-center gap-2"
                  style={{ background: tab === t.key ? EV.violet : EV.raised, color: tab === t.key ? '#fff' : EV.ink2, border: `1px solid ${tab === t.key ? EV.violet : EV.line}` }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {wsError && tab !== 'find' && tab !== 'learn' && <p role="alert" className="text-sm" style={{ color: EV.warn }}>{wsError}</p>}

      {tab === 'find' && <GrantMatcher org={org} onStart={start} />}

      {tab === 'apply' && (
        <div className="space-y-4">
          {!current && (
            <div className="ev-panel p-5">
              <p className="text-sm font-bold" style={{ color: EV.ink }}>{inProgress.length ? 'Pick up where you left off' : 'No applications yet'}</p>
              {inProgress.length === 0 && <p className="text-[12px] mt-1" style={{ color: EV.muted }}>Find a grant that fits, then choose "Start application with Aria". She will fill in what she already knows and ask for the rest.</p>}
              <ul className="mt-2 space-y-2">
                {inProgress.map(([id, a]) => (
                  <li key={id}>
                    <button onClick={() => setCurrent({ id, title: a.title! })} className="w-full text-left rounded-xl px-4 py-3" style={{ background: EV.raised }}>
                      <span className="text-[13px] font-semibold" style={{ color: EV.ink }}>{a.title}</span>
                      <span className="block text-[10px] mt-0.5" style={{ color: EV.muted }}>Last saved {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={() => setTab('find')} className="mt-3 text-[12px] font-bold" style={{ color: EV.violetText }}>Find a grant →</button>
            </div>
          )}
          {current && (
            <>
              <button onClick={() => setCurrent(null)} className="text-[12px] font-bold" style={{ color: EV.violetText }}>← All applications</button>
              <Suspense fallback={<p className="text-sm" style={{ color: EV.muted }}>Opening…</p>}>
                <GrantApply key={current.id} orgId={org.id} opp={current} onProfile={refresh} />
              </Suspense>
            </>
          )}
        </div>
      )}

      {tab === 'business' && isBusiness && ws && (
        <Suspense fallback={<p className="text-sm" style={{ color: EV.muted }}>Loading…</p>}>
          <GrantContracts orgId={org.id} profile={ws.profile} onGoProfile={() => setTab('profile')} />
        </Suspense>
      )}

      {tab === 'profile' && (ws ? <GrantProfile profile={ws.profile} onSave={saveAnswer} /> : !wsError && <p className="text-sm" style={{ color: EV.muted }}>Loading your profile…</p>)}

      {tab === 'learn' && <LearnTab />}
    </div>
  );
};

export default GrantHub;
