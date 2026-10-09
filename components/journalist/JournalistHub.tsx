import React, { lazy, Suspense, useState } from 'react';
import { ChevronLeft, Newspaper } from 'lucide-react';
import { Button, ChipRail } from '../ui';
import type { UserProfile } from '../../types';
import { useScope } from './useNewsroom';
import NewsroomDesk from './NewsroomDesk';
import MyArticles from './MyArticles';

const PitchTracker = lazy(() => import('./PitchTracker'));
const SourceManager = lazy(() => import('./SourceManager'));
const InterviewNotes = lazy(() => import('./InterviewNotes'));
const FactCheckBench = lazy(() => import('./FactCheckBench'));
const StyleHeadlinePanel = lazy(() => import('./StyleHeadlinePanel'));
const PublicationManager = lazy(() => import('./PublicationManager'));

type Tab = 'articles' | 'desk' | 'pitches' | 'sources' | 'interviews' | 'facts' | 'style' | 'publications';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'articles', label: 'My articles' }, { id: 'desk', label: 'Story desk' }, { id: 'pitches', label: 'Pitches' }, { id: 'sources', label: 'Sources' },
  { id: 'interviews', label: 'Interviews' }, { id: 'facts', label: 'Fact-check' }, { id: 'style', label: 'Style and headlines' }, { id: 'publications', label: 'Publications' },
];

interface Props {
  user: UserProfile;
  onBack: () => void;
  onNewArticle: () => void;
  onOpenArticle: (articleId: string) => void;
  onViewArticle: (articleId: string) => void;
}

/** The working journalist's home: pipeline, pitches, sources, interviews, fact-check, style, publications. */
export const JournalistHub: React.FC<Props> = ({ user, onBack, onNewArticle, onOpenArticle, onViewArticle }) => {
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('plajah_journalist_tab') as Tab) || 'articles'; } catch { return 'articles'; } });
  const { orgs, orgId, setOrgId, scope } = useScope();
  const pick = (t: string) => { setTab(t as Tab); try { localStorage.setItem('plajah_journalist_tab', t); } catch { /* storage blocked */ } };
  const orgScoped = tab === 'desk' || tab === 'pitches' || tab === 'publications';

  return (
    <div className="min-h-full w-full overflow-y-auto pb-32 text-[var(--text-primary)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        <header className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" iconOnly aria-label="Back" onClick={onBack}><ChevronLeft /></Button>
          <div className="flex-1 min-w-[200px]">
            <h1 className="type-title-lg flex items-center gap-2"><Newspaper size={22} /> Newsroom</h1>
            <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>Reporting, fact-checking and publishing tools for working journalists.</p>
          </div>
          {orgs.length > 0 && orgScoped && (
            <label className="flex items-center gap-2 text-xs">Working as
              <select className="pj-input" style={{ width: 'auto' }} value={orgId} onChange={e => setOrgId(e.target.value)}>
                <option value="">Myself</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
        </header>
        <ChipRail items={TABS} activeId={tab} onSelect={pick} />

        <Suspense fallback={<p className="text-sm opacity-60 py-8">Loading...</p>}>
          {tab === 'articles' && <MyArticles uid={user.uid} onOpenArticle={onOpenArticle} onViewArticle={onViewArticle} onNewArticle={onNewArticle} />}
          {tab === 'desk' && <NewsroomDesk orgId={orgId || undefined} scope={scope} onOpenArticle={onOpenArticle} onNewArticle={onNewArticle} />}
          {tab === 'pitches' && <PitchTracker orgId={orgId || undefined} scope={scope} />}
          {tab === 'sources' && <SourceManager />}
          {tab === 'interviews' && <InterviewNotes />}
          {tab === 'facts' && <FactCheckBench />}
          {tab === 'style' && <StyleHeadlinePanel />}
          {tab === 'publications' && <PublicationManager orgId={orgId || undefined} />}
        </Suspense>
      </div>
    </div>
  );
};

export default JournalistHub;
