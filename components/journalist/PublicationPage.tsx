import React, { useEffect, useState } from 'react';
import { collection, doc as fsDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ChevronLeft, Rss } from 'lucide-react';
import { db } from '../../services/backendService';
import { hasActiveSubscription } from '../../services/subscriptionService';
import { readerAccess } from '../../services/journalist/publicationLogic';
import type { Article, UserProfile } from '../../types';
import type { Publication } from '../../services/journalist/types';
import PlajahPlusPill from '../PlajahPlusPill';
import ArticleBadges from './ArticleBadges';

interface Props {
  publicationId: string;
  currentUser: UserProfile | null;
  onBack: () => void;
  onSelectArticle: (a: Article) => void;
}

/** Public masthead page: name, tagline, sections, editors, corrections policy, feed links, article list. */
export const PublicationPage: React.FC<Props> = ({ publicationId, currentUser, onBack, onSelectArticle }) => {
  const [pub, setPub] = useState<Publication | null | undefined>(undefined);
  const [articles, setArticles] = useState<Article[]>([]);
  const [section, setSection] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await getDoc(fsDoc(db, 'publications', publicationId));
        if (!live) return;
        if (!s.exists()) { setPub(null); return; }
        const p = { ...(s.data() as any), id: s.id } as Publication;
        setPub(p);
        const snap = await getDocs(query(collection(db, 'articles'), where('publicationId', '==', p.id), where('isPublic', '==', true)));
        if (!live) return;
        const ms = (v: any) => (typeof v === 'number' ? v : v?.toMillis?.() ?? 0);
        setArticles(snap.docs.map(d => ({ ...(d.data() as any), id: d.id, timestamp: ms((d.data() as any).timestamp) }) as Article).sort((a, b) => (b.publishedAt || b.timestamp) - (a.publishedAt || a.timestamp)));
      } catch { if (live) setPub(null); }
    })();
    return () => { live = false; };
  }, [publicationId]);

  useEffect(() => { if (currentUser?.uid) hasActiveSubscription(currentUser.uid).then(setSubscribed).catch(() => setSubscribed(false)); }, [currentUser?.uid]);

  if (pub === undefined) return <div className="p-10 text-sm opacity-60">Loading...</div>;
  if (pub === null) return <div className="p-10"><button onClick={onBack} className="underline">Back</button><p className="mt-4">This publication could not be found.</p></div>;
  const origin = window.location.origin;
  const shown = articles.filter(a => !section || a.section === section);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--bg-color)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-8">
        <button onClick={onBack} className="self-start flex items-center gap-1 text-xs uppercase tracking-widest opacity-60 hover:opacity-100"><ChevronLeft size={14} /> Back</button>
        <header className="flex flex-col gap-2 border-b border-white/10 pb-6">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>{pub.name}</h1>
          {pub.tagline && <p className="text-lg opacity-70 italic">{pub.tagline}</p>}
          <div className="flex flex-wrap gap-3 items-center mt-2">
            <a href={`${origin}/feeds/publication/${pub.slug}.rss`} className="text-xs underline inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer"><Rss size={12} /> RSS</a>
            <a href={`${origin}/feeds/publication/${pub.slug}.atom`} className="text-xs underline" target="_blank" rel="noopener noreferrer">Atom</a>
            {pub.access === 'SUBSCRIBERS' && !subscribed && <PlajahPlusPill creatorId={pub.ownerId} creatorName={pub.name} />}
            {pub.access === 'SUBSCRIBERS' && subscribed && <span className="text-[10px] uppercase tracking-widest" style={{ color: '#06D6A0' }}>Subscriber</span>}
          </div>
        </header>

        {pub.sections.length > 1 && (
          <nav aria-label="Sections" className="flex flex-wrap gap-2">
            <button onClick={() => setSection('')} className={`pj-chip ${!section ? 'pj-chip--selected' : ''}`}>All</button>
            {pub.sections.map(s => <button key={s} onClick={() => setSection(s)} className={`pj-chip ${section === s ? 'pj-chip--selected' : ''}`}>{s}</button>)}
          </nav>
        )}

        <ul className="flex flex-col gap-6">
          {shown.map(a => {
            const locked = readerAccess(a.access ?? (pub.access === 'SUBSCRIBERS' ? 'SUBSCRIBERS' : 'FREE'), { uid: currentUser?.uid, isAuthor: currentUser?.uid === a.authorId, subscribed }) === 'SUMMARY_ONLY';
            return (
              <li key={a.id}>
                <button type="button" onClick={() => onSelectArticle(a)} className="text-left w-full group">
                  {a.section && <p className="text-[10px] uppercase tracking-widest opacity-50">{a.section}</p>}
                  <h2 className="text-2xl font-bold group-hover:underline" style={{ fontFamily: 'Georgia, serif' }}>{a.title}</h2>
                  {a.subtitle && <p className="opacity-70 mt-1">{a.subtitle}</p>}
                  <p className="text-xs opacity-50 mt-2">{a.authorName} · {new Date(a.publishedAt || a.timestamp).toLocaleDateString()}{locked ? ' · subscribers' : ''}</p>
                  <ArticleBadges article={a} />
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="text-sm opacity-60">Nothing published here yet.</li>}
        </ul>

        <footer className="border-t border-white/10 pt-6 text-sm flex flex-col gap-3">
          {pub.editors.length > 0 && <div><p className="pj-eyebrow">Masthead</p><ul>{pub.editors.map((e, i) => <li key={i}>{e.name}{e.title ? <span className="opacity-60">, {e.title}</span> : null}</li>)}</ul></div>}
          {pub.correctionsPolicy && <div><p className="pj-eyebrow">Corrections policy</p><p className="opacity-80">{pub.correctionsPolicy}</p></div>}
          {pub.ethicsUrl && /^https?:\/\//.test(pub.ethicsUrl) && <a className="underline" href={pub.ethicsUrl} target="_blank" rel="noopener noreferrer">Ethics and standards</a>}
        </footer>
      </div>
    </div>
  );
};

export default PublicationPage;
