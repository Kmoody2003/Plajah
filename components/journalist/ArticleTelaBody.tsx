import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { doc as fsDoc, onSnapshot } from 'firebase/firestore';
import { AlertOctagon, History, Info, Loader2, PenLine } from 'lucide-react';
import { db } from '../../services/backendService';
import { resolveArticleDoc, type ResolvedArticleDoc } from '../../services/journalist/articleService';
import { NOTICE_LABELS, isRetracted, sortForDisplay } from '../../services/journalist/correctionLog';
import type { Article, TelaDoc } from '../../types';
import type { ArticleNotice } from '../../services/journalist/types';

const TelaEmbed = lazy(() => import('../tela/TelaEmbed'));

/** The article doc, kept live: a correction or new version published elsewhere shows up without a reload. */
export function useLiveArticle(initial: Article): Article {
  const [article, setArticle] = useState<Article>(initial);
  useEffect(() => { setArticle(initial); }, [initial.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!initial.id || initial.id.startsWith('legacy:')) return;
    try {
      return onSnapshot(fsDoc(db, 'articles', initial.id), snap => {
        if (!snap.exists()) return;
        const d = snap.data() as any;
        // Firestore Timestamps must become epoch ms, like fetchArticleById does, or dates render as "Invalid Date".
        const ts = typeof d.timestamp === 'number' ? d.timestamp : d.timestamp?.toMillis?.();
        setArticle(prev => ({ ...prev, ...d, id: snap.id, timestamp: ts ?? prev.timestamp }));
      }, () => undefined);
    } catch { return undefined; }
  }, [initial.id]);
  return article;
}

interface BodyProps {
  article: Article;
  /** Show this specific earlier version instead of the live/pinned one. */
  versionOverride?: string;
}

/** Renders the article through Tela's read-only renderer: one frame per masthead / story segment / media block. */
export const ArticleTelaBody: React.FC<BodyProps> = ({ article, versionOverride }) => {
  const [resolved, setResolved] = useState<ResolvedArticleDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  const versionKey = `${article.id}|${versionOverride || ''}|${article.tela?.mode}|${article.tela?.versionId}|${article.tela?.pinnedVersionId}|${article.blocks?.length}`;

  useEffect(() => {
    let live = true; setFailed(false);
    resolveArticleDoc(article, versionOverride).then(r => { if (live) setResolved(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [versionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, Math.min(760, Math.floor(el.clientWidth)))));
    ro.observe(el); setWidth(Math.max(280, Math.min(760, Math.floor(el.clientWidth || 680))));
    return () => ro.disconnect();
  }, []);

  if (failed) return <p className="text-sm opacity-70">This article could not be displayed.</p>;
  if (!resolved) return <div className="py-16 grid place-items-center"><Loader2 className="animate-spin opacity-60" /></div>;
  const d: TelaDoc = resolved.doc;
  return (
    <div ref={box} className="w-full flex flex-col items-center gap-0" data-tela-article={resolved.legacy ? 'legacy-bridge' : 'tela'}>
      <Suspense fallback={<div className="py-16 grid place-items-center"><Loader2 className="animate-spin opacity-60" /></div>}>
        {d.frames.map(f => (
          <TelaEmbed key={f.id} snapshot={d} docId={d.id} frameId={f.id} mode={resolved.pinned ? 'pinned' : 'follow-latest'} width={width} versionLabel={resolved.versionId ? undefined : 'legacy'} />
        ))}
      </Suspense>
      <p className="mt-3 text-[10px] uppercase tracking-widest opacity-40">
        {resolved.legacy ? 'Rendered from the original article through Tela (read-only)' : resolved.pinned ? 'Archived version' : 'Live article'}
      </p>
    </div>
  );
};

interface NoticeProps {
  notices?: ArticleNotice[];
  currentVersionId?: string;
  viewingVersionId?: string;
  onViewVersion: (versionId?: string) => void;
}

const TONE = { danger: '#FF5C6C', warn: '#FF8C00', info: '#00DAF3' } as const;

/** Public correction log. Retractions pin to the top; each body-changing notice links to the text it replaced. */
export const ArticleNotices: React.FC<NoticeProps> = ({ notices, currentVersionId, viewingVersionId, onViewVersion }) => {
  const list = sortForDisplay(notices);
  if (!list.length) return null;
  const retracted = isRetracted(notices);
  return (
    <section aria-label="Corrections and updates" className="rounded-2xl p-4 mb-8 flex flex-col gap-3" style={{ border: `1px solid ${retracted ? TONE.danger : 'var(--pj-border, rgba(255,255,255,.12))'}`, background: retracted ? 'rgba(255,92,108,.08)' : 'var(--pj-glass-2, rgba(255,255,255,.04))' }}>
      {retracted && <p className="font-black uppercase tracking-widest text-xs flex items-center gap-2" style={{ color: TONE.danger }}><AlertOctagon size={14} /> This article has been retracted</p>}
      <h2 className="text-[11px] font-black uppercase tracking-widest opacity-70 flex items-center gap-2"><PenLine size={12} /> Corrections and updates</h2>
      <ul className="flex flex-col gap-3">
        {list.map(n => {
          const info = NOTICE_LABELS[n.label];
          return (
            <li key={n.id} className="text-sm flex flex-col gap-1">
              <p><strong style={{ color: TONE[info.tone] }}>{info.heading}</strong> <time className="opacity-60 text-xs" dateTime={new Date(n.at).toISOString()}>{new Date(n.at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time> <span className="opacity-60 text-xs">by {n.byName}</span></p>
              <p>{n.text}</p>
              {n.previousVersionId && (
                <button type="button" className="self-start text-xs underline opacity-70 inline-flex items-center gap-1" onClick={() => onViewVersion(n.previousVersionId)}><History size={11} /> Read the version this replaced</button>
              )}
            </li>
          );
        })}
      </ul>
      {viewingVersionId && viewingVersionId !== currentVersionId && (
        <p className="text-xs flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--pj-border, rgba(255,255,255,.12))' }}>
          <Info size={12} /> You are reading an earlier version, kept for the record.
          <button type="button" className="underline" onClick={() => onViewVersion(undefined)}>Back to the current version</button>
        </p>
      )}
    </section>
  );
};
