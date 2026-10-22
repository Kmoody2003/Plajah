/**
 * IssueReader — read a published periodical issue in Lorea: the frozen Tela layout, page by page or
 * as spreads, with a follow button for the publication and the flat (PDF) edition when one was attached.
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Columns2, Download, Loader2, Square, Star } from 'lucide-react';
import TelaEmbed from '../tela/TelaEmbed';
import type { TelaDoc } from '../../types';
import type { PeriodicalIssue } from '../../services/publication/types';
import { formatIssueDate } from '../../services/publication/issueLogic';

const IssueReader: React.FC<{ issueId: string; onBack: () => void }> = ({ issueId, onBack }) => {
  const [data, setData] = useState<{ issue: PeriodicalIssue; doc: TelaDoc | null } | null | 'missing'>(null);
  const [page, setPage] = useState(0);
  const [spread, setSpread] = useState(false);
  const [following, setFollowing] = useState(false);
  const [width, setWidth] = useState(() => Math.min(720, (typeof window !== 'undefined' ? window.innerWidth : 800) - 32));

  useEffect(() => {
    let alive = true;
    import('../../services/publication/periodicalStore').then(async s => {
      const r = await s.loadPublishedIssue(issueId);
      if (!alive) return;
      setData(r || 'missing');
      if (r) setFollowing(await s.isFollowing(r.issue.publicationId));
    }).catch(() => alive && setData('missing'));
    const onResize = () => setWidth(Math.min(720, window.innerWidth - 32));
    window.addEventListener('resize', onResize);
    return () => { alive = false; window.removeEventListener('resize', onResize); };
  }, [issueId]);

  if (data === null) return <div className="flex min-h-[60vh] items-center justify-center text-white/50"><Loader2 size={18} className="mr-2 animate-spin" />Opening the issue…</div>;
  if (data === 'missing' || !data.doc) return <div className="p-6 text-white/60"><button onClick={onBack} className="mb-4 text-white/60"><ArrowLeft size={16} className="mr-1 inline" />Back</button><p>This issue isn’t available.</p></div>;

  const { issue, doc } = data;
  const frames = doc.frames;
  // Spreads: page 1 alone (the cover), then 2–3, 4–5… like a printed paper.
  const view = spread && page > 0 ? [page % 2 === 1 ? page : page - 1, page % 2 === 1 ? page + 1 : page].filter(i => i < frames.length) : [page];
  const step = spread && page > 0 ? 2 : 1;
  const pageW = spread && view.length === 2 ? Math.floor((Math.min(1400, window.innerWidth - 32)) / 2) : width;
  const toggleFollow = async () => {
    const s = await import('../../services/publication/periodicalStore');
    if (await s.setFollowing(issue.publicationId, !following)) setFollowing(!following);
  };

  return (
    <div className="min-h-full bg-[#14110e] pb-24 text-white" data-testid="issue-reader">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#14110e]/95 px-4 py-3 backdrop-blur">
        <button onClick={onBack} aria-label="Back" className="rounded-full p-1.5 hover:bg-white/10"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-bold">{issue.publicationName}</p>
          <p className="text-[11px] text-white/50">Vol. {issue.volume}, No. {issue.number} · {formatIssueDate(issue.date)} · {frames.length} pages{issue.tier === 'student' ? ' · student publication' : ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void toggleFollow()} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${following ? 'bg-amber-400/20 text-amber-200' : 'border border-white/15 text-white/80'}`}><Star size={13} fill={following ? 'currentColor' : 'none'} />{following ? 'Following' : 'Follow'}</button>
          <button onClick={() => setSpread(s => !s)} title={spread ? 'Single pages' : 'Spreads'} className="rounded-full border border-white/15 p-1.5 text-white/70">{spread ? <Square size={14} /> : <Columns2 size={14} />}</button>
          {issue.published?.flatPdfUrl && <a href={issue.published.flatPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-bold text-white/80"><Download size={13} /> PDF edition</a>}
        </div>
      </header>

      <div className="flex flex-col items-center gap-4 px-4 pt-6">
        <div className="flex gap-1 shadow-2xl">
          {view.map(i => (
            <div key={frames[i].id} className="bg-white">
              <TelaEmbed snapshot={doc} docId={doc.id} frameId={frames[i].id} mode="pinned" versionId={issue.published?.versionId} width={pageW} canEdit={false} />
            </div>
          ))}
        </div>
        <nav className="flex items-center gap-3 text-[13px] text-white/70">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - step))} className="rounded-full border border-white/15 p-2 disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={16} /></button>
          <span><BookOpen size={13} className="mr-1 inline" />{view.map(i => i + 1).join('–')} of {frames.length}</span>
          <button disabled={view[view.length - 1] >= frames.length - 1} onClick={() => setPage(p => Math.min(frames.length - 1, (spread && p === 0 ? 1 : p + step)))} className="rounded-full border border-white/15 p-2 disabled:opacity-30" aria-label="Next page"><ChevronRight size={16} /></button>
        </nav>
      </div>
    </div>
  );
};

export default IssueReader;
