/**
 * HashtagFeedHeader — header for a "posts tagged #x" view.
 *
 * Props:
 *   tag        raw or normalised tag (with or without #)
 *   onBack?()  shows a back arrow
 *   postCount? override the all-time count (otherwise read from the hashtags/{tag} rollup)
 *
 * The lead renders this above a list built from `fetchPostsByHashtag(tag, cursor)`
 * (services/hashtagService) — see HashtagFeed below for a ready-made paged list.
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Hash } from 'lucide-react';
import { fetchHashtagInfo, fetchPostsByHashtag } from '../../../services/hashtagService';
import { normalizeHashtag } from '../../../services/postingLogic';
import type { Post } from '../../../types';

export interface HashtagFeedHeaderProps { tag: string; onBack?: () => void; postCount?: number }

export const HashtagFeedHeader: React.FC<HashtagFeedHeaderProps> = ({ tag, onBack, postCount }) => {
  const t = normalizeHashtag(tag) ?? tag.replace(/^#/, '');
  const [count, setCount] = useState<number | null>(postCount ?? null);
  useEffect(() => {
    if (postCount !== undefined) { setCount(postCount); return; }
    let alive = true;
    fetchHashtagInfo(t).then(i => { if (alive) setCount(i ? i.count : null); });
    return () => { alive = false; };
  }, [t, postCount]);
  return (
    <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
      {onBack && <button onClick={onBack} className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/8" aria-label="Back"><ArrowLeft size={16} /></button>}
      <div className="w-10 h-10 rounded-2xl bg-small-orange/15 text-small-orange flex items-center justify-center shrink-0"><Hash size={18} /></div>
      <div className="min-w-0">
        <h2 className="text-lg font-black truncate">#{t}</h2>
        {count !== null && <p className="text-[11px] text-white/35">{count.toLocaleString()} post{count === 1 ? '' : 's'}</p>}
      </div>
    </div>
  );
};

/**
 * HashtagFeed — header + paged list. `renderPost` is the lead's PostCard wrapper.
 *   <HashtagFeed tag="jazz" renderPost={p => <PostCard post={p} .../>} onBack={...} />
 */
export const HashtagFeed: React.FC<{
  tag: string; renderPost: (post: Post) => React.ReactNode; onBack?: () => void; isHidden?: (authorId: string) => boolean;
}> = ({ tag, renderPost, onBack, isHidden }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = async (c: number | null, reset = false) => {
    setLoading(true);
    const page = await fetchPostsByHashtag(tag, c).catch(() => ({ posts: [] as Post[], nextCursor: null }));
    setPosts(prev => (reset ? page.posts : [...prev, ...page.posts]));
    setCursor(page.nextCursor); setMore(page.nextCursor !== null); setLoading(false);
  };
  useEffect(() => { setPosts([]); void load(null, true); /* eslint-disable-next-line */ }, [tag]);

  const visible = isHidden ? posts.filter(p => !isHidden(p.authorId)) : posts;
  return (
    <div className="w-full max-w-2xl mx-auto">
      <HashtagFeedHeader tag={tag} onBack={onBack} />
      <div className="space-y-3 p-3">
        {visible.map(p => <React.Fragment key={p.id}>{renderPost(p)}</React.Fragment>)}
        {!loading && visible.length === 0 && <p className="py-12 text-center text-sm text-white/35">No posts with #{tag.replace(/^#/, '')} yet. Be the first.</p>}
        {loading && <div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />}
        {!loading && more && (
          <button onClick={() => void load(cursor)} className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Load more</button>
        )}
      </div>
    </div>
  );
};

export default HashtagFeedHeader;
