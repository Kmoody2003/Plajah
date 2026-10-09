import React, { useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2, UserRound } from 'lucide-react';
import { Button, Chip, Input, Surface } from '../ui';
import { newStory } from '../../services/journalist/newsroomStore';
import { canMoveTo, deadlineState, nextStage } from '../../services/journalist/deskLogic';
import { STORY_STAGES, type NewsroomStory, type StoryStage } from '../../services/journalist/types';
import { auth } from '../../services/backendService';
import { useNewsroomList, type Scope } from './useNewsroom';

const STAGE_COLOR: Record<StoryStage, string> = {
  PITCH: '#9C96B4', ASSIGNED: '#00DAF3', REPORTING: '#06B6D4', DRAFT: '#D0BCFF', EDIT: '#A855F7', LEGAL: '#FF8C00', SCHEDULED: '#F59E0B', PUBLISHED: '#06D6A0',
};

interface Props {
  orgId?: string;
  scope: Scope;
  onOpenArticle?: (articleId: string) => void;
  onNewArticle?: () => void;
}

export const NewsroomDesk: React.FC<Props> = ({ orgId, scope, onOpenArticle, onNewArticle }) => {
  const { items, loading, error, save, remove } = useNewsroomList<NewsroomStory>('newsroom_stories', orgId);
  const [slug, setSlug] = useState('');
  const [deadline, setDeadline] = useState('');
  const [section, setSection] = useState('');
  const me = auth.currentUser;

  const byStage = useMemo(() => {
    const m = new Map<StoryStage, NewsroomStory[]>(STORY_STAGES.map(s => [s, []]));
    for (const s of items) (m.get(s.stage) || m.get('PITCH')!).push(s);
    for (const list of m.values()) list.sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity));
    return m;
  }, [items]);

  const add = () => {
    if (!slug.trim()) return;
    void save(newStory(slug.trim(), 'PITCH', { orgId: orgId || undefined, section: section.trim() || undefined, deadline: deadline ? new Date(deadline).getTime() : undefined, assigneeId: me?.uid, assigneeName: me?.displayName || undefined }));
    setSlug(''); setDeadline(''); setSection('');
  };
  const [moveError, setMoveError] = useState('');
  const move = (s: NewsroomStory, dir: 1 | -1) => {
    const to = nextStage(s.stage, dir);
    if (!to) return;
    const ok = canMoveTo(s.stage, to);
    if (!ok.ok) { setMoveError(ok.reason || ''); return; }
    setMoveError('');
    void save({ ...s, stage: to });
  };

  const overdue = items.filter(s => deadlineState(s.deadline, s.stage) === 'overdue').length;
  const soon = items.filter(s => deadlineState(s.deadline, s.stage) === 'soon').length;

  return (
    <div className="flex flex-col gap-4">
      <Surface level={2} className="flex flex-wrap items-end gap-3">
        <Input label="Story slug" placeholder="eastside-library-closure" value={slug} onChange={e => setSlug(e.target.value)} className="flex-1 min-w-[200px]" />
        <Input label="Section" placeholder="Local" value={section} onChange={e => setSection(e.target.value)} className="w-32" />
        <Input label="Deadline" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-52" />
        <Button variant="primary" icon={<Plus />} onClick={add} disabled={!slug.trim() || !scope.canManage}>Add to desk</Button>
        {onNewArticle && <Button variant="secondary" onClick={onNewArticle}>Write an article</Button>}
      </Surface>
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip>{items.length} stories</Chip>
        {overdue > 0 && <Chip style={{ color: 'var(--pj-danger)' }}>{overdue} overdue</Chip>}
        {soon > 0 && <Chip style={{ color: '#FF8C00' }}>{soon} due within 24h</Chip>}
        {scope.org && !scope.canManage && <Chip>View only in {scope.org.name}: you need the content permission to move stories</Chip>}
      </div>
      {moveError && <p role="status" className="text-sm" style={{ color: '#FF8C00' }}>{moveError}</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--pj-danger)' }}>{error}</p>}
      {loading && <p className="text-sm opacity-60">Loading the desk...</p>}

      <div className="flex gap-3 overflow-x-auto pb-3 snap-x" aria-label="Story pipeline">
        {STORY_STAGES.map(stage => {
          const list = byStage.get(stage) || [];
          return (
            <section key={stage} className="snap-start shrink-0 w-[260px] flex flex-col gap-2" aria-label={`${stage} column`}>
              <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />{stage}<span className="opacity-50">{list.length}</span>
              </h3>
              {list.map(s => {
                const st = deadlineState(s.deadline, s.stage);
                return (
                  <Surface key={s.id} level={1} className="flex flex-col gap-2 !p-3" style={{ borderLeft: `3px solid ${STAGE_COLOR[stage]}` }}>
                    <p className="font-semibold text-sm break-words">{s.slug}</p>
                    <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>
                      {s.section && <span>{s.section}</span>}
                      {s.assigneeName && <span className="flex items-center gap-1"><UserRound size={11} />{s.assigneeName}</span>}
                      {s.deadline && (
                        <span className="flex items-center gap-1" style={{ color: st === 'overdue' ? 'var(--pj-danger)' : st === 'soon' ? '#FF8C00' : undefined }}>
                          <CalendarClock size={11} />{new Date(s.deadline).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{st === 'overdue' ? ' overdue' : ''}
                        </span>
                      )}
                    </div>
                    {scope.org && (
                      <select aria-label="Assign to" className="pj-input" value={s.assigneeId || ''} disabled={!scope.canManage}
                        onChange={e => { const m = scope.members.find(x => x.userId === e.target.value); void save({ ...s, assigneeId: e.target.value || undefined, assigneeName: m?.displayName || undefined, stage: s.stage === 'PITCH' && e.target.value ? 'ASSIGNED' : s.stage }); }}>
                        <option value="">Unassigned</option>
                        {scope.members.filter(m => m.status === 'ACTIVE').map(m => <option key={m.userId} value={m.userId}>{m.displayName || m.userId}</option>)}
                      </select>
                    )}
                    <div className="flex items-center gap-1">
                      <Button size="xs" variant="ghost" iconOnly aria-label="Move back" disabled={!scope.canManage || stage === STORY_STAGES[0]} onClick={() => move(s, -1)}><ChevronLeft /></Button>
                      <Button size="xs" variant="ghost" iconOnly aria-label="Move forward" disabled={!scope.canManage || stage === 'PUBLISHED'} onClick={() => move(s, 1)}><ChevronRight /></Button>
                      {s.articleId && onOpenArticle && <Button size="xs" variant="ghost" iconOnly aria-label="Open article" onClick={() => onOpenArticle(s.articleId!)}><ExternalLink /></Button>}
                      <Button size="xs" variant="danger-quiet" iconOnly aria-label="Delete story" className="ml-auto" disabled={!scope.canManage} onClick={() => { if (window.confirm(`Delete "${s.slug}" from the desk?`)) void remove(s.id); }}><Trash2 /></Button>
                    </div>
                  </Surface>
                );
              })}
              {list.length === 0 && <p className="text-[11px] opacity-40 px-1">Empty</p>}
            </section>
          );
        })}
      </div>
      <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>Moving a story does not publish it. Publishing happens from the article editor, where the pre-publish checks run.</p>
    </div>
  );
};

export default NewsroomDesk;
