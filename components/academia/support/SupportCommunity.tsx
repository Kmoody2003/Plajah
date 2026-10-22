import React, { useEffect, useMemo, useState } from 'react';
import { Newspaper } from 'lucide-react';
import type { Post } from '../../../types';
import PostCard from '../../PostCard';
import UniversalPostComposer from '../../UniversalPostComposer';
import { resolveComposerMedia } from '../../FeedView';
import { createPost, postFieldsForAssetEmbed, listenToEduFeed } from '../../../services/backendService';
import { filterPostsForViewer } from '../../../services/contentSafety';

/**
 * News & community for learning support: the school-community feed (same `posts`, same safety filter as EduFeedPanel),
 * narrowed to posts tagged with inclusion topics. Parents and teachers post updates, wins, events and questions with a
 * tag; nothing here is written by Plajah, so an empty feed says so honestly.
 */
export const SUPPORT_TAGS = ['Inclusion', 'IEP', '504', 'Neurodiversity', 'Autism', 'ADHD', 'Dyslexia', 'SpecialEducation', 'AAC', 'Sensory'];
const TAG_RE = new RegExp(`#(${SUPPORT_TAGS.join('|')})\\b`, 'i');

interface Props { currentUser: any; profile?: any; eduRole: NonNullable<Post['eduRole']> }

const SupportCommunity: React.FC<Props> = ({ currentUser, profile, eduRole }) => {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [tag, setTag] = useState<string>('all');
  const [composeTag, setComposeTag] = useState('Inclusion');
  const [composerKey, setComposerKey] = useState(0);
  useEffect(() => {
    const unsub = listenToEduFeed(p => setPosts(p));
    return () => { try { unsub && unsub(); } catch { /* non-fatal */ } };
  }, []);
  const isChild = !!(profile?.isChild || profile?.accountType === 'CHILD');
  const tagged = useMemo(() => (posts ? (filterPostsForViewer(posts as any, profile) as unknown as Post[]).filter(p => TAG_RE.test(p.text || '')) : null), [posts, profile]);
  const visible = tagged ? (tag === 'all' ? tagged : tagged.filter(p => new RegExp(`#${tag}\\b`, 'i').test(p.text || ''))).slice(0, 30) : null;

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by tag">
        {['all', ...SUPPORT_TAGS].map(t => (
          <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(t)}
            className={`min-h-[38px] px-3 rounded-full border text-[12.5px] font-semibold ${tag === t ? 'bg-white text-black border-white' : 'border-white/15 text-white/70 hover:border-white/35'}`}>{t === 'all' ? 'Everything' : `#${t}`}</button>
        ))}
      </div>

      {currentUser && !isChild && (
        <div className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[13px] font-bold mb-2">Share news, an event, a win or a question</p>
          <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label="Tag your post">
            {SUPPORT_TAGS.map(t => <button key={t} type="button" role="radio" aria-checked={composeTag === t} onClick={() => { setComposeTag(t); setComposerKey(k => k + 1); }} className={`min-h-[32px] px-2.5 rounded-full border text-[12px] font-semibold ${composeTag === t ? 'border-[#00DAF3] text-[#00DAF3] bg-[#00DAF3]/10' : 'border-white/12 text-white/60'}`}>#{t}</button>)}
          </div>
          <UniversalPostComposer
            key={composerKey}
            currentUser={currentUser}
            initialText={`#${composeTag} `}
            placeholder="A resource that helped, a meeting tip, a school event, a classroom idea…"
            avatarUrl={currentUser.photoURL || undefined}
            onPost={async (data: any) => {
              const text = TAG_RE.test(data.text || '') ? data.text : `${data.text} #${composeTag}`;
              const media = await resolveComposerMedia(data.attachments || [], currentUser.uid);
              const embed = await postFieldsForAssetEmbed(data.assetEmbed);
              await createPost({ text, isPublic: true, eduRole, ...(media.length ? { media } : {}), ...embed } as any);
            }}
          />
          <p className="text-[11.5px] text-white/45 mt-2">Posts are public to the school community. Please don't share a child's plan, diagnosis or name without their family's permission.</p>
        </div>
      )}

      {visible === null && <p className="text-sm text-white/45">Loading…</p>}
      {visible && visible.length === 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <Newspaper className="mx-auto mb-2 text-white/30" />
          <p className="font-black text-white/80">No posts {tag === 'all' ? 'here' : `tagged #${tag}`} yet</p>
          <p className="text-[13px] text-white/50 mt-1">When parents and teachers share news, events and ideas with an inclusion tag, they appear here.</p>
        </div>
      )}
      <div className="space-y-4">{(visible || []).map(p => <PostCard key={p.id} post={p} />)}</div>
    </div>
  );
};
export default SupportCommunity;
