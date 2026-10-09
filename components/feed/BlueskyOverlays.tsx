// In-app Bluesky screens: profile, thread, search. One host, mounted once; anything opens a screen through
// openBluesky() (services/fediverse/blueskyNav.ts). Screens stack, so tapping a person inside a thread inside a
// profile goes forward and Back walks it in reverse — like the official client, but inside Plajah, using Plajah's
// own post card, so everything reads as part of the platform.
//
// Overlays are portalled to <body>: the feed's animated wrappers carry CSS transforms, which would otherwise
// re-anchor a position:fixed panel to the wrong box (the platform-wide overlay gotcha).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X, Search, UserPlus, UserCheck, MoreHorizontal, VolumeX, Volume2, Ban, ExternalLink, Loader2 } from 'lucide-react';
import ExternalPostCard from './ExternalPostCard';
import { BSKY_OPEN_EVENT, openBluesky, type BskyNav } from '../../services/fediverse/blueskyNav';
import { tokenize } from '../../services/fediverse/blueskyVersion';
import type { FediversePost, FediverseProfile } from '../../services/fediverse/types';
import {
  bskyProfile, bskyAuthorFeed, bskyThread, bskySearchPostsApi, bskySearchPeople, bskyFollowers, bskyFollowing,
  bskySuggestions, bskyFollow, bskyUnfollow, bskyMute, bskyBlock,
  type BskyProfileDetail, type BskyThread, type BskyThreadNode, type AuthorFeedFilter,
} from '../../services/fediverse/blueskyClient';

const BLUE = '#1185fe';

// ── shell ─────────────────────────────────────────────────────────────────────

const Shell: React.FC<{ title: string; canBack: boolean; onBack: () => void; onClose: () => void; children: React.ReactNode }> = ({ title, canBack, onBack, onClose, children }) => (
  <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm flex justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full sm:max-w-xl h-full sm:h-[94vh] sm:my-auto bg-[#0a0a0a] sm:rounded-2xl sm:border border-white/10 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-3 h-12 border-b border-white/10 shrink-0">
        {canBack ? <button onClick={onBack} className="p-2 -ml-1 rounded-full hover:bg-white/10 text-white/70" aria-label="Back"><ArrowLeft size={18} /></button> : <span className="w-2" />}
        <p className="flex-1 text-sm font-black text-white truncate">{title}</p>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50" aria-label="Close"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  </div>
);

const Spinner = () => <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" size={20} /></div>;
const ErrorNote: React.FC<{ msg: string; onRetry?: () => void }> = ({ msg, onRetry }) => (
  <div className="px-4 py-8 text-center"><p className="text-[12px] text-amber-300/90 leading-relaxed">{msg}</p>{onRetry && <button onClick={onRetry} className="mt-3 text-[11px] font-black text-white/60 hover:text-white underline">Try again</button>}</div>
);

/** Text with links / #tags / @mentions made tappable (mentions and tags open Bluesky screens inside Plajah). */
const RichBio: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-[14px] leading-relaxed text-white/80 whitespace-pre-wrap break-words">
    {tokenize(text).map((t, i) => t.kind === 'text' ? <React.Fragment key={i}>{t.text}</React.Fragment>
      : t.kind === 'link' ? <a key={i} href={t.text} target="_blank" rel="noopener noreferrer" style={{ color: BLUE }} className="hover:underline">{t.text.replace(/^https?:\/\//, '')}</a>
      : t.kind === 'mention' ? <button key={i} onClick={() => openBluesky({ kind: 'profile', actor: t.text.slice(1) })} style={{ color: BLUE }} className="hover:underline">{t.text}</button>
      : <button key={i} onClick={() => openBluesky({ kind: 'search', q: t.text })} style={{ color: BLUE }} className="hover:underline">{t.text}</button>)}
  </p>
);

// ── people ────────────────────────────────────────────────────────────────────

const PersonRow: React.FC<{ p: FediverseProfile }> = ({ p }) => (
  <button onClick={() => openBluesky({ kind: 'profile', actor: p.did || p.handle })} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors">
    <div className="w-11 h-11 rounded-full overflow-hidden bg-white/5 shrink-0 border border-white/10">
      {p.avatarUrl && <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[14px] font-bold text-white truncate">{p.displayName}</p>
      <p className="text-[12px] text-white/40 truncate">@{p.handle.replace(/^@/, '')}</p>
      {p.bio && <p className="text-[12px] text-white/55 line-clamp-2 mt-0.5">{p.bio}</p>}
    </div>
  </button>
);

function usePaged<T>(load: (cursor?: string) => Promise<{ items: T[]; cursor?: string }>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([]); const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const alive = useRef(0);
  const fetchPage = useCallback(async (reset: boolean) => {
    const token = ++alive.current; setLoading(true); setError(null);
    try {
      const r = await load(reset ? undefined : cursor);
      if (token !== alive.current) return;
      setItems(prev => reset ? r.items : [...prev, ...r.items]); setCursor(r.cursor);
    } catch (e: any) { if (token === alive.current) setError(e?.message ?? 'Something went wrong'); }
    finally { if (token === alive.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, ...deps]);
  useEffect(() => { setItems([]); setCursor(undefined); fetchPage(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, deps);
  return { items, loading, error, hasMore: !!cursor, more: () => fetchPage(false), retry: () => fetchPage(true) };
}

const MoreButton: React.FC<{ onClick: () => void; loading: boolean }> = ({ onClick, loading }) => (
  <div className="flex justify-center py-4"><button onClick={onClick} disabled={loading} className="px-4 py-2 rounded-full bg-white/5 text-[11px] font-black text-white/60 hover:bg-white/10 disabled:opacity-40">{loading ? 'Loading…' : 'Load more'}</button></div>
);

// ── profile ───────────────────────────────────────────────────────────────────

type ProfileTab = 'posts' | 'replies' | 'media' | 'followers' | 'following';
const TAB_FILTER: Partial<Record<ProfileTab, AuthorFeedFilter>> = { posts: 'posts_no_replies', replies: 'posts_with_replies', media: 'posts_with_media' };

const ProfileScreen: React.FC<{ actor: string; onTitle: (t: string) => void }> = ({ actor, onTitle }) => {
  const [p, setP] = useState<BskyProfileDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { setErr(null); setP(null); bskyProfile(actor).then(r => { setP(r); onTitle(r.displayName || r.handle); }).catch(e => setErr(e?.message ?? 'Could not load this profile')); }, [actor, onTitle]);
  useEffect(() => { load(); }, [load]);

  const feed = usePaged<FediversePost>(async (c) => {
    if (!TAB_FILTER[tab]) return { items: [] };
    const r = await bskyAuthorFeed(actor, TAB_FILTER[tab], c); return { items: r.posts, cursor: r.cursor };
  }, [actor, tab]);
  const people = usePaged<FediverseProfile>(async (c) => {
    if (tab !== 'followers' && tab !== 'following') return { items: [] };
    const r = await (tab === 'followers' ? bskyFollowers : bskyFollowing)(actor, c); return { items: r.profiles, cursor: r.cursor };
  }, [actor, tab]);

  const toggleFollow = async () => {
    if (!p || busy) return; setBusy(true);
    try {
      if (p.isFollowing && p.followRecordUri) { await bskyUnfollow(p.followRecordUri); setP({ ...p, isFollowing: false, followRecordUri: undefined, followersCount: Math.max(0, p.followersCount - 1) }); }
      else { const r = await bskyFollow(p.did!); setP({ ...p, isFollowing: true, followRecordUri: r.followRecordUri, followersCount: p.followersCount + 1 }); }
    } catch (e: any) { setErr(e?.message ?? 'Could not update follow'); } finally { setBusy(false); }
  };
  const toggleMute = async () => { if (!p) return; setMenu(false); try { await bskyMute(p.did!, !p.muted); setP({ ...p, muted: !p.muted }); } catch (e: any) { setErr(e?.message); } };
  const toggleBlock = async () => {
    if (!p) return; setMenu(false);
    if (!p.blocked && !window.confirm(`Block ${p.displayName}? They won't be able to see or interact with your Bluesky posts.`)) return;
    try { const r = await bskyBlock(p.did!, !p.blocked, p.blockUri); setP({ ...p, blocked: !p.blocked, blockUri: r.blockUri }); } catch (e: any) { setErr(e?.message); }
  };

  if (err && !p) return <ErrorNote msg={err} onRetry={load} />;
  if (!p) return <Spinner />;
  const tabs: [ProfileTab, string][] = [['posts', 'Posts'], ['replies', 'Replies'], ['media', 'Media'], ['followers', `${p.followersCount.toLocaleString()} followers`], ['following', `${p.followingCount.toLocaleString()} following`]];
  return (
    <div>
      <div className="h-28 bg-gradient-to-br from-[#1185fe]/30 to-[#0a0a0a] relative">{p.headerUrl && <img src={p.headerUrl} alt="" className="w-full h-full object-cover" />}</div>
      <div className="px-4 -mt-9 relative">
        <div className="flex items-end justify-between">
          <div className="w-[72px] h-[72px] rounded-full overflow-hidden border-4 border-[#0a0a0a] bg-white/5">{p.avatarUrl && <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}</div>
          <div className="flex items-center gap-2 pb-1 relative">
            <button onClick={() => setMenu(m => !m)} className="p-2 rounded-full border border-white/15 text-white/60 hover:text-white" aria-label="More"><MoreHorizontal size={16} /></button>
            {menu && (
              <div className="absolute right-0 top-11 z-10 w-48 rounded-xl bg-[#141414] border border-white/10 shadow-2xl overflow-hidden">
                <button onClick={toggleMute} className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-white/80 hover:bg-white/5">{p.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}{p.muted ? 'Unmute account' : 'Mute account'}</button>
                <button onClick={toggleBlock} className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-red-300 hover:bg-white/5"><Ban size={14} />{p.blocked ? 'Unblock account' : 'Block account'}</button>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] text-white/60 hover:bg-white/5"><ExternalLink size={14} />Open on Bluesky</a>
              </div>
            )}
            {!p.blocked && (
              <button onClick={toggleFollow} disabled={busy} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-black disabled:opacity-50 ${p.isFollowing ? 'bg-white/10 text-white border border-white/15' : 'text-white'}`} style={p.isFollowing ? undefined : { background: BLUE }}>
                {p.isFollowing ? <><UserCheck size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}
              </button>
            )}
          </div>
        </div>
        <h2 className="text-xl font-black text-white mt-2 leading-tight">{p.displayName}</h2>
        <p className="text-[13px] text-white/40">@{p.handle.replace(/^@/, '')}{p.isFollowedBy ? <span className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-white/60">Follows you</span> : null}</p>
        {(p.muted || p.blocked) && <p className="mt-2 text-[11px] font-bold text-amber-300/90">{p.blocked ? 'You blocked this account.' : 'You muted this account — their posts are hidden from your timeline.'}</p>}
        {p.bio && <div className="mt-3"><RichBio text={p.bio} /></div>}
        <p className="mt-3 text-[12px] text-white/40">{p.postsCount.toLocaleString()} posts</p>
        {err && <p className="mt-2 text-[11px] text-red-300/80">{err}</p>}
      </div>

      <div className="flex overflow-x-auto border-b border-white/10 mt-3 px-2">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-3 text-[12px] font-black whitespace-nowrap border-b-2 transition-colors ${tab === id ? 'text-white' : 'text-white/40 border-transparent hover:text-white/70'}`} style={tab === id ? { borderColor: BLUE } : undefined}>{label}</button>
        ))}
      </div>

      {(tab === 'followers' || tab === 'following') ? (
        <div>
          {people.items.map(pr => <PersonRow key={pr.id} p={pr} />)}
          {people.error ? <ErrorNote msg={people.error} onRetry={people.retry} /> : people.loading ? <Spinner /> : people.hasMore ? <MoreButton onClick={people.more} loading={people.loading} /> : !people.items.length ? <p className="text-center text-[12px] text-white/30 py-10">Nobody here yet.</p> : null}
        </div>
      ) : (
        <div className="space-y-2 p-2">
          {feed.items.map(po => <ExternalPostCard key={po.uri} post={po} />)}
          {feed.error ? <ErrorNote msg={feed.error} onRetry={feed.retry} /> : feed.loading ? <Spinner /> : feed.hasMore ? <MoreButton onClick={feed.more} loading={feed.loading} /> : !feed.items.length ? <p className="text-center text-[12px] text-white/30 py-10">No posts to show.</p> : null}
        </div>
      )}
    </div>
  );
};

// ── thread ────────────────────────────────────────────────────────────────────

const ReplyTree: React.FC<{ nodes: BskyThreadNode[]; depth: number }> = ({ nodes, depth }) => (
  <>
    {nodes.map(n => (
      <div key={n.post.uri} className={depth > 0 ? 'ml-4 pl-3 border-l border-white/10' : ''}>
        <ExternalPostCard post={n.post} />
        {n.replies.length > 0 && (depth < 3
          ? <ReplyTree nodes={n.replies} depth={depth + 1} />
          : <button onClick={() => openBluesky({ kind: 'thread', uri: n.post.uri })} className="ml-4 my-1 text-[11px] font-black" style={{ color: BLUE }}>Continue this thread ({n.replies.length}) →</button>)}
      </div>
    ))}
  </>
);

const ThreadScreen: React.FC<{ uri: string }> = ({ uri }) => {
  const [t, setT] = useState<BskyThread | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setErr(null); setT(null); bskyThread(uri).then(setT).catch(e => setErr(e?.message ?? 'Could not load this thread')); }, [uri]);
  useEffect(() => { load(); }, [load]);
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (t) focusRef.current?.scrollIntoView({ block: 'start' }); }, [t]);
  if (err) return <ErrorNote msg={err} onRetry={load} />;
  if (!t) return <Spinner />;
  return (
    <div className="p-2 space-y-2">
      {t.parents.map(pp => <div key={pp.uri} className="opacity-90"><ExternalPostCard post={pp} /></div>)}
      <div ref={focusRef} className="ring-1 rounded-2xl" style={{ ['--tw-ring-color' as string]: `${BLUE}55` }}><ExternalPostCard post={t.post} /></div>
      <p className="px-2 pt-2 text-[10px] font-black uppercase tracking-widest text-white/30">{t.replies.length ? `${t.post.replyCount.toLocaleString()} ${t.post.replyCount === 1 ? 'reply' : 'replies'}` : 'No replies yet'}</p>
      <ReplyTree nodes={t.replies} depth={0} />
    </div>
  );
};

// ── search ────────────────────────────────────────────────────────────────────

const SearchScreen: React.FC<{ initialQ?: string }> = ({ initialQ }) => {
  const [q, setQ] = useState(initialQ ?? ''); const [debounced, setDebounced] = useState(initialQ ?? '');
  const [tab, setTab] = useState<'people' | 'posts'>(initialQ?.startsWith('#') ? 'posts' : 'people');
  const [suggested, setSuggested] = useState<FediverseProfile[]>([]);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { bskySuggestions().then(r => setSuggested(r.profiles)).catch(() => {}); }, []);

  const people = usePaged<FediverseProfile>(async (c) => {
    if (!debounced || tab !== 'people') return { items: [] };
    const r = await bskySearchPeople(debounced, c); return { items: r.profiles, cursor: r.cursor };
  }, [debounced, tab]);
  const posts = usePaged<FediversePost>(async (c) => {
    if (!debounced || tab !== 'posts') return { items: [] };
    const r = await bskySearchPostsApi(debounced, 'top', c); return { items: r.posts, cursor: r.cursor };
  }, [debounced, tab]);

  return (
    <div>
      <div className="p-3 sticky top-0 bg-[#0a0a0a] z-10 border-b border-white/10">
        <div className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3">
          <Search size={15} className="text-white/35" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search Bluesky — people, posts, #tags" className="flex-1 bg-transparent py-2.5 text-[14px] text-white placeholder-white/30 outline-none" />
        </div>
        <div className="flex gap-2 mt-2">
          {(['people', 'posts'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-full text-[11px] font-black ${tab === t ? 'text-white' : 'bg-white/5 text-white/45'}`} style={tab === t ? { background: BLUE } : undefined}>{t === 'people' ? 'People' : 'Posts'}</button>)}
        </div>
      </div>
      {!debounced ? (
        <div className="py-2">
          <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-white/30">Suggested people</p>
          {suggested.length ? suggested.map(s => <PersonRow key={s.id} p={s} />) : <p className="px-4 py-6 text-[12px] text-white/30">Type to search the network.</p>}
        </div>
      ) : tab === 'people' ? (
        <div>
          {people.items.map(pr => <PersonRow key={pr.id} p={pr} />)}
          {people.error ? <ErrorNote msg={people.error} onRetry={people.retry} /> : people.loading ? <Spinner /> : people.hasMore ? <MoreButton onClick={people.more} loading={people.loading} /> : !people.items.length ? <p className="text-center text-[12px] text-white/30 py-10">No people found.</p> : null}
        </div>
      ) : (
        <div className="p-2 space-y-2">
          {posts.items.map(po => <ExternalPostCard key={po.uri} post={po} />)}
          {posts.error ? <ErrorNote msg={posts.error} onRetry={posts.retry} /> : posts.loading ? <Spinner /> : posts.hasMore ? <MoreButton onClick={posts.more} loading={posts.loading} /> : !posts.items.length ? <p className="text-center text-[12px] text-white/30 py-10">No posts found.</p> : null}
        </div>
      )}
    </div>
  );
};

// ── host ──────────────────────────────────────────────────────────────────────

const BlueskyOverlayHost: React.FC = () => {
  const [stack, setStack] = useState<BskyNav[]>([]);
  const [titles, setTitles] = useState<Record<number, string>>({});

  useEffect(() => {
    const onOpen = (e: Event) => setStack(s => [...s, (e as CustomEvent<BskyNav>).detail]);
    window.addEventListener(BSKY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(BSKY_OPEN_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (!stack.length) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStack(s => s.slice(0, -1)); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [stack.length]);

  const top = stack[stack.length - 1];
  const idx = stack.length - 1;
  const setTitle = useCallback((t: string) => setTitles(p => ({ ...p, [idx]: t })), [idx]);
  if (!top || typeof document === 'undefined') return null;

  const title = top.kind === 'search' ? 'Search' : top.kind === 'thread' ? 'Thread' : (titles[idx] || 'Profile');
  return createPortal(
    <Shell title={title} canBack={stack.length > 1} onBack={() => setStack(s => s.slice(0, -1))} onClose={() => setStack([])}>
      {/* key = the nav target, so each stacked screen mounts fresh */}
      {top.kind === 'profile' ? <ProfileScreen key={`p:${top.actor}:${idx}`} actor={top.actor} onTitle={setTitle} />
        : top.kind === 'thread' ? <ThreadScreen key={`t:${top.uri}:${idx}`} uri={top.uri} />
        : <SearchScreen key={`s:${idx}`} initialQ={top.q} />}
    </Shell>,
    document.body,
  );
};

export default BlueskyOverlayHost;
