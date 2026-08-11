// EducationSocialView — the Academia school-community social feed. For educators & students (and
// participating parents), the "Social" tab shows a feed of schools, teachers, and students from
// across Plajah instead of the general feed. Parents can post too, and get a "From your children"
// lens showing their own kids' activity (they have visibility into their children by design).
//
// Content is run through the same content-safety filter as the rest of the platform so the school
// feed stays kid-appropriate. Posts here are the normal `posts` docs, auto-tagged `isEduPost` by
// createPost when the author is an education account — so posting from anywhere lands here.

import React, { useEffect, useState } from 'react';
import { GraduationCap, Users2, School, Baby, Sparkles } from 'lucide-react';
import type { Post } from '../types';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';
import { resolveComposerMedia } from './FeedView';
import { createPost, postFieldsForAssetEmbed, listenToEduFeed, listenToChildrenPosts } from '../services/backendService';
import { filterPostsForViewer } from '../services/contentSafety';

const ROLE_BADGE: Record<NonNullable<Post['eduRole']>, { label: string; color: string; icon: React.ElementType }> = {
  SCHOOL:  { label: 'School',  color: '#FF8C00', icon: School },
  TEACHER: { label: 'Teacher', color: '#3FB98E', icon: GraduationCap },
  STUDENT: { label: 'Student', color: '#36c5f0', icon: Users2 },
  PARENT:  { label: 'Parent',  color: '#7a2bd6', icon: Baby },
};

const RoleChip: React.FC<{ role?: Post['eduRole'] }> = ({ role }) => {
  if (!role) return null;
  const m = ROLE_BADGE[role]; if (!m) return null;
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 mb-1"
      style={{ background: `${m.color}22`, color: m.color }}>
      <Icon size={10} /> {m.label}
    </span>
  );
};

const EducationSocialView: React.FC<{
  currentUser: any;
  profile?: any;
  onVisitUser?: (uid: string) => void;
}> = ({ currentUser, profile, onVisitUser }) => {
  const childUids: string[] = (profile?.childUids || []).filter(Boolean);
  const isParent = (profile?.accountType === 'PARENT') && childUids.length > 0;

  const [tab, setTab] = useState<'community' | 'children'>('community');
  const [eduPosts, setEduPosts] = useState<Post[]>([]);
  const [childPosts, setChildPosts] = useState<Post[]>([]);

  useEffect(() => {
    const unsub = listenToEduFeed(setEduPosts);
    return () => { try { unsub && unsub(); } catch { /* */ } };
  }, []);

  useEffect(() => {
    if (!isParent) { setChildPosts([]); return; }
    const unsub = listenToChildrenPosts(childUids, setChildPosts);
    return () => { try { unsub && unsub(); } catch { /* */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, childUids.join(',')]);

  // Kid-safe: filter the community feed for the current viewer.
  const community = filterPostsForViewer(eduPosts as any, profile) as unknown as Post[];

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-2 text-[#3FB98E] mb-1"><GraduationCap size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Academia · Social</span></div>
        <h1 className="text-2xl font-black tracking-tight">School community</h1>
        <p className="text-white/50 text-[13px] mt-1 mb-5">Schools, teachers and students across Plajah — a safe, ad-free feed.</p>

        {/* Parent tabs */}
        {isParent && (
          <div className="flex gap-2 mb-4">
            {([['community', 'Community'], ['children', 'From your children']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3.5 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors ${tab === id ? 'bg-[#3FB98E] text-black' : 'bg-white/5 text-white/55 hover:bg-white/10'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Composer (posts auto-tag into the school feed) */}
        {currentUser && tab === 'community' && (
          <div className="mb-5">
            <UniversalPostComposer
              currentUser={currentUser}
              placeholder="Share with your school community…"
              avatarUrl={currentUser.photoURL || undefined}
              onPost={async (data: any) => {
                const resolvedMedia = await resolveComposerMedia(data.attachments || [], currentUser.uid);
                const embedFields = await postFieldsForAssetEmbed(data.assetEmbed);
                await createPost({
                  text: data.text,
                  isPublic: true,
                  ...(resolvedMedia.length > 0 ? { media: resolvedMedia } : {}),
                  ...embedFields,
                } as any);
              }}
            />
          </div>
        )}

        {/* Feeds */}
        {tab === 'children' ? (
          childPosts.length === 0 ? (
            <EmptyState icon={Baby} title="No activity yet" sub="When your children post, it shows up here for you." />
          ) : (
            <div className="space-y-4">
              {childPosts.map(p => (
                <div key={p.id}><RoleChip role="STUDENT" /><PostCard post={p} onVisitUser={onVisitUser} /></div>
              ))}
            </div>
          )
        ) : community.length === 0 ? (
          <EmptyState icon={Sparkles} title="The school feed is just getting started" sub="Posts from schools, teachers and students will appear here. Be the first to share." />
        ) : (
          <div className="space-y-4">
            {community.map(p => (
              <div key={p.id}><RoleChip role={p.eduRole} /><PostCard post={p} onVisitUser={onVisitUser} /></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ElementType; title: string; sub: string }> = ({ icon: Icon, title, sub }) => (
  <div className="py-16 text-center">
    <Icon size={40} className="mx-auto text-white/15 mb-4" />
    <p className="text-white/70 font-black">{title}</p>
    <p className="text-white/40 text-[13px] mt-1 max-w-sm mx-auto leading-relaxed">{sub}</p>
  </div>
);

export default EducationSocialView;
