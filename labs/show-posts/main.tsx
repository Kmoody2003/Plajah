// Show Posts lab — a Themed Show shared to a Plajah social post, no render.
//   node node_modules/vite/bin/vite.js --config show-posts-lab.vite.config.mjs  ->  http://127.0.0.1:3302/
// Studio tab: the real ThemedShowStudio (Share → "Post to Plajah"). It publishes (to the lab server)
// and fires the same NAVIGATE FEED + plajah:composePost the app uses. Feed tab: the real
// UniversalPostComposer prefilled from that event, and a timeline of real PostCards whose show plays
// in the card. ?show=<owner>/<id>[&mode=live] opens the real ShowViewerPage.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import ThemedShowStudio, { type ShowSourcePhoto } from '../../components/photo/ThemedShowStudio';
import UniversalPostComposer, { type ComposerPostData } from '../../components/UniversalPostComposer';
import PostCard from '../../components/PostCard';
import ShowViewerPage from '../../components/photo/show/ShowViewerPage';
import { Chip } from '../../components/ui';
import { parseShowLink, COMPOSE_EVENT, type ComposePrefill } from '../../services/slideshow/showPosts';
import type { Post } from '../../types';
import { FediverseProvider } from '../../contexts/FediverseContext';
import { ActiveIdentityProvider } from '../../contexts/ActiveIdentityContext';
import { UploadProvider } from '../../contexts/UploadContext';
import { PublishQueueProvider } from '../../contexts/PublishQueueContext';
import { GlobalPlayerProvider } from '../../contexts/GlobalPlayerContext';

/** The providers the feed composer and PostCard read, as App mounts them. */
const Providers = ({ children }: { children: React.ReactNode }) => (
  <GlobalPlayerProvider><FediverseProvider><UploadProvider><PublishQueueProvider><ActiveIdentityProvider>{children}</ActiveIdentityProvider></PublishQueueProvider></UploadProvider></FediverseProvider></GlobalPlayerProvider>
);

const LIB: ShowSourcePhoto[] = ['open-crane', 'open-drone', 'open-high', 'soft-a', 'soft-b', 'soft-c', 'soft-d', 'soft-e', 'soft-f', 'close-sky-a', 'close-sky-b']
  .map((id, i) => ({ id: `real_${id}`, url: `/slideshow/backyard/${id}.jpg`, title: id, takenAt: Date.UTC(1980 + i * 3, 6, 4), timeSource: 'user' as const }));

const fakeUser = { uid: 'lab-owner', displayName: 'Lab Owner', photoURL: '', isAnonymous: false } as any;

function Feed({ prefill, signal, posts, onPost }: { prefill: ComposePrefill | null; signal: number; posts: Post[]; onPost: (d: ComposerPostData) => Promise<void> }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 12px 80px', display: 'grid', gap: 14 }}>
      <UniversalPostComposer key={`c-${signal}`} currentUser={fakeUser} autoExpand={signal > 0}
        initialText={prefill?.text} initialAttachments={prefill?.attachments as any} initialAssetEmbed={prefill?.assetEmbed as any}
        placeholder="What's on your mind?" onPost={onPost} />
      {posts.map((p) => <PostCard key={p.id} post={p} />)}
      {!posts.length && <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>No posts yet. Open Studio → Share → Post to Plajah.</p>}
    </div>
  );
}

function Lab() {
  const [tab, setTab] = useState<'studio' | 'feed'>('studio');
  const [prefill, setPrefill] = useState<ComposePrefill | null>(null);
  const [signal, setSignal] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    const nav = (e: any) => { if (e.detail?.target === 'FEED') setTab('feed'); };
    const compose = (e: any) => { const p = e.detail ?? (window as any).__composePostPending; (window as any).__composePostPending = false; setPrefill(p && typeof p === 'object' ? p : null); setSignal((n) => n + 1); setTab('feed'); };
    window.addEventListener('NAVIGATE', nav);
    window.addEventListener(COMPOSE_EVENT, compose);
    return () => { window.removeEventListener('NAVIGATE', nav); window.removeEventListener(COMPOSE_EVENT, compose); };
  }, []);
  const onPost = async (d: ComposerPostData) => {
    const media = d.attachments.map((a) => ({ type: a.type as any, url: a.url, title: a.title }));
    const post: Post = {
      id: `p${Date.now()}`, authorId: 'lab-owner', authorName: 'Lab Owner', authorPhoto: '', text: d.text,
      likesCount: 0, commentsCount: 0, timestamp: Date.now(), isPublic: true,
      ...(media.length ? { media } : {}), ...(d.assetEmbed ? { assetEmbed: d.assetEmbed } : {}),
      ...(d.audienceSpec ? { audienceSpec: d.audienceSpec } : {}),
    } as any;
    setPosts((ps) => [post, ...ps]);
    setPrefill(null);
    (window as any).showPostsLab.lastPost = post;
  };
  (window as any).showPostsLab.posts = posts;
  return (
    <div>
      <nav style={{ display: 'flex', gap: 6, padding: 12, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <Chip interactive selected={tab === 'studio'} onClick={() => setTab('studio')}>Studio</Chip>
        <Chip interactive selected={tab === 'feed'} onClick={() => setTab('feed')}>Feed ({posts.length})</Chip>
      </nav>
      <div style={{ display: tab === 'studio' ? 'block' : 'none', padding: 20 }}><ThemedShowStudio library={LIB} initial={LIB.slice(0, 6)} /></div>
      {tab === 'feed' && <Feed prefill={prefill} signal={signal} posts={posts} onPost={onPost} />}
    </div>
  );
}

(window as any).showPostsLab = {};
const root = createRoot(document.getElementById('root')!);
root.render(parseShowLink(location.search) ? <ShowViewerPage /> : <Providers><Lab /></Providers>);
