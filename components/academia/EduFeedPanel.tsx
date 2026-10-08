import React, { useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import type { Post } from '../../types';
import PostCard from '../PostCard';
import UniversalPostComposer from '../UniversalPostComposer';
import { resolveComposerMedia } from '../FeedView';
import { createPost, postFieldsForAssetEmbed, listenToEduFeed } from '../../services/backendService';
import { filterPostsForViewer } from '../../services/contentSafety';

/**
 * The school-community feed, embedded in each Academia hub. It is the SAME feed as the Social tab
 * (EDU_SOCIAL): normal platform `posts`, auto-tagged isEduPost by createPost, same PostCard and
 * composer, same kid-safety filter. This panel is a window onto it with a role-specific prompt, so
 * the community is part of the home screen rather than a tab people have to find.
 *
 * `eduRole` is passed explicitly so an admin viewing through the role lens posts AS that role
 * (createPost would otherwise tag from the stored profile, which for an admin is "nothing").
 */
interface Props {
  currentUser: any;
  profile?: any;
  eduRole: NonNullable<Post['eduRole']>;
  onOpenFeed: () => void;
  limit?: number;
}

const PROMPT: Record<NonNullable<Post['eduRole']>, { title: string; placeholder: string }> = {
  TEACHER: { title: 'Teachers & classrooms', placeholder: 'Share a classroom win, a resource, or a question for other teachers…' },
  PARENT: { title: 'School community', placeholder: 'Say thanks, share a moment, or ask the community…' },
  STUDENT: { title: 'Your school', placeholder: 'Share something you made or learned…' },
  SCHOOL: { title: 'School community', placeholder: 'Share news with your school community…' },
};

const EduFeedPanel: React.FC<Props> = ({ currentUser, profile, eduRole, onOpenFeed, limit = 3 }) => {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    const unsub = listenToEduFeed(p => setPosts(p));
    return () => { try { unsub && unsub(); } catch { /* non-fatal */ } };
  }, []);

  const isChild = !!(profile?.isChild || profile?.accountType === 'CHILD');
  const visible = posts ? (filterPostsForViewer(posts as any, profile) as unknown as Post[]).slice(0, limit) : null;
  const copy = PROMPT[eduRole];

  return (
    <section className="mb-9" aria-label="School community feed">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 flex items-center gap-1.5"><MessagesSquare size={12} /> Community</p>
          <h2 className="text-lg font-black">{copy.title}</h2>
          <p className="text-[12px] text-white/50">A safe, ad-free feed of schools, teachers, students and parents.</p>
        </div>
        <button type="button" onClick={onOpenFeed} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10 whitespace-nowrap">Open full feed →</button>
      </div>

      {currentUser && !isChild && (
        <div className="mb-4">
          <UniversalPostComposer
            currentUser={currentUser}
            placeholder={copy.placeholder}
            avatarUrl={currentUser.photoURL || undefined}
            onPost={async (data: any) => {
              const media = await resolveComposerMedia(data.attachments || [], currentUser.uid);
              const embed = await postFieldsForAssetEmbed(data.assetEmbed);
              await createPost({ text: data.text, isPublic: true, eduRole, ...(media.length ? { media } : {}), ...embed } as any);
            }}
          />
        </div>
      )}
      {isChild && <p className="text-[12px] text-white/45 mb-3">Ask a grown-up if you'd like to share something with the school feed.</p>}

      {visible === null && <p className="text-sm text-white/45">Loading the feed…</p>}
      {visible && visible.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="font-black text-white/80">The school feed is just getting started</p>
          <p className="text-[12px] text-white/45 mt-1">Be the first to share something with your school community.</p>
        </div>
      )}
      <div className="space-y-4">{(visible || []).map(p => <PostCard key={p.id} post={p} />)}</div>
    </section>
  );
};

export default EduFeedPanel;
