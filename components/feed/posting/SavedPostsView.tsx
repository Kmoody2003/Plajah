/**
 * SavedPostsView — the viewer's bookmarks with collections.
 *
 * Props:
 *   onOpenPost?(postId)    open a post (lead routes to the post/permalink view)
 *   onVisitUser?(uid)
 *   renderPost?(post)      optional: render the FULL post with the lead's PostCard. When omitted,
 *                          a light snippet row is shown (zero extra reads).
 *   onBack?()              shows a back arrow in the header
 *
 * Collections: create / rename / delete (bookmarks survive a collection delete),
 * and move a saved post between collections from the row menu.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, FolderPlus, Pencil, Trash2, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import type { Post } from '../../../types';
import { useBookmarks } from './useBookmarks';
import {
  createCollection, renameCollection, deleteCollection, moveBookmark, removeBookmark, type BookmarkDoc,
} from '../../../services/bookmarkService';

export interface SavedPostsViewProps {
  onOpenPost?: (postId: string) => void;
  onVisitUser?: (uid: string) => void;
  renderPost?: (post: Post) => React.ReactNode;
  onBack?: () => void;
}

const PAGE = 20;

const FullPost: React.FC<{ b: BookmarkDoc; render: (p: Post) => React.ReactNode; fallback: React.ReactNode }> = ({ b, render, fallback }) => {
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, b.source === 'feed' ? 'feed' : 'posts', b.postId))
      .then(s => { if (alive) setPost(s.exists() ? ({ id: s.id, ...(s.data() as any), sourceCollection: b.source } as Post) : null); })
      .catch(() => { if (alive) setPost(null); });
    return () => { alive = false; };
  }, [b.postId, b.source]);
  if (post === undefined) return <div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />;
  if (!post) return <>{fallback}</>;
  return <>{render(post)}</>;
};

const SavedPostsView: React.FC<SavedPostsViewProps> = ({ onOpenPost, onVisitUser, renderPost, onBack }) => {
  const { bookmarks, collections, loading, uid } = useBookmarks();
  const [active, setActive] = useState<string | 'ALL'>('ALL');
  const [shown, setShown] = useState(PAGE);
  const [naming, setNaming] = useState<null | { id?: string; name: string }>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const list = useMemo(
    () => bookmarks.filter(b => active === 'ALL' || b.collectionId === active),
    [bookmarks, active],
  );

  useEffect(() => { setShown(PAGE); }, [active]);
  // If the active collection was deleted, fall back to All.
  useEffect(() => {
    if (active !== 'ALL' && !collections.some(c => c.id === active)) setActive('ALL');
  }, [collections, active]);

  if (!uid) return <div className="p-8 text-center text-sm text-white/40">Sign in to see your saved posts.</div>;

  const saveName = async () => {
    if (!naming || !naming.name.trim()) { setNaming(null); return; }
    if (naming.id) await renameCollection(uid, naming.id, naming.name); else setActive(await createCollection(uid, naming.name));
    setNaming(null);
  };

  const Row: React.FC<{ b: BookmarkDoc }> = ({ b }) => (
    <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex gap-3">
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpenPost?.(b.postId)}>
        <div className="flex items-center gap-2 mb-1" onClick={onVisitUser ? (e) => { e.stopPropagation(); onVisitUser(b.authorId); } : undefined}>
          <img src={b.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${b.authorId}`} className="w-5 h-5 rounded-full object-cover" alt="" loading="lazy" referrerPolicy="no-referrer" />
          <span className="text-xs font-black truncate">{b.authorName || 'Someone'}</span>
        </div>
        <p className="text-sm text-white/75 line-clamp-3 break-words">{b.snippet || 'Media post'}</p>
      </div>
      {b.thumb && <img src={b.thumb} alt="" loading="lazy" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-white/10" />}
      <button onClick={() => setMenuFor(menuFor === b.postId ? null : b.postId)} className="text-white/30 hover:text-white self-start p-1" title="Options">
        <Pencil size={13} />
      </button>
      {menuFor === b.postId && (
        <div className="absolute right-2 top-9 z-20 w-48 rounded-2xl bg-[#101010] border border-white/10 shadow-2xl py-1 text-xs">
          <p className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white/30">Move to</p>
          <button className="w-full text-left px-3 py-1.5 hover:bg-white/5" onClick={() => { void moveBookmark(uid, b.postId, null); setMenuFor(null); }}>All saved</button>
          {collections.map(c => (
            <button key={c.id} className="w-full text-left px-3 py-1.5 hover:bg-white/5 truncate" onClick={() => { void moveBookmark(uid, b.postId, c.id); setMenuFor(null); }}>{c.name}</button>
          ))}
          <button className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-red-300 border-t border-white/5 mt-1" onClick={() => { void removeBookmark(uid, b.postId); setMenuFor(null); }}>Remove</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      <div className="flex items-center gap-2">
        {onBack && <button onClick={onBack} className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/8"><ArrowLeft size={16} /></button>}
        <Bookmark size={16} className="text-small-orange" />
        <h2 className="text-sm font-black uppercase tracking-widest">Saved</h2>
        <span className="text-[10px] text-white/30">{bookmarks.length}</span>
      </div>

      {/* Collection chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(['ALL', ...collections.map(c => c.id)] as string[]).map(id => {
          const c = collections.find(x => x.id === id);
          return (
            <button key={id} onClick={() => setActive(id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${active === id ? 'bg-small-orange text-black' : 'bg-white/5 text-white/45 hover:bg-white/10'}`}>
              {c ? c.name : 'All saved'}
            </button>
          );
        })}
        <button onClick={() => setNaming({ name: '' })} className="shrink-0 p-1.5 rounded-full bg-white/5 text-white/50 hover:text-white hover:bg-white/10" title="New collection">
          <FolderPlus size={14} />
        </button>
      </div>

      {naming && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          <input
            autoFocus value={naming.name} maxLength={40} placeholder="Collection name"
            onChange={e => setNaming({ ...naming, name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setNaming(null); }}
            className="flex-1 bg-transparent text-sm outline-none px-2"
          />
          <button onClick={() => void saveName()} className="px-3 py-1 rounded-full bg-small-orange text-black text-[10px] font-black uppercase">Save</button>
          <button onClick={() => setNaming(null)} className="p-1 text-white/40 hover:text-white"><X size={14} /></button>
        </div>
      )}

      {active !== 'ALL' && (
        <div className="flex gap-3 text-[10px] font-black uppercase tracking-widest text-white/35">
          <button className="hover:text-white flex items-center gap-1" onClick={() => setNaming({ id: active, name: collections.find(c => c.id === active)?.name || '' })}><Pencil size={11} />Rename</button>
          <button className="hover:text-red-300 flex items-center gap-1" onClick={() => { if (confirm('Delete this collection? Saved posts are kept.')) void deleteCollection(uid, active); }}><Trash2 size={11} />Delete</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-white/[0.03] animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <div className="py-14 text-center text-white/35 text-sm">
          <Bookmark size={26} className="mx-auto mb-2 opacity-60" />
          {active === 'ALL' ? 'Nothing saved yet. Tap the bookmark on a post to keep it here.' : 'This collection is empty.'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.slice(0, shown).map(b => renderPost
            ? <FullPost key={b.postId} b={b} render={renderPost} fallback={<Row b={b} />} />
            : <Row key={b.postId} b={b} />)}
          {list.length > shown && (
            <button onClick={() => setShown(n => n + PAGE)} className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Show more</button>
          )}
        </div>
      )}
    </div>
  );
};

export default SavedPostsView;
