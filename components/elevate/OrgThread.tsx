// OrgThread — the social thread for an org (org-wide) or one ministry/department.
//
// Uses UniversalPostComposer (the same composer as CommentSection & FeedView) with OrgAudienceToggle
// so organizations and authorized members can post to Public, Members, Members-Only (Internal),
// specific Departments, and specific Sub-Groups, and share any post via ShareButton.

import { UserAvatar } from '../avatar/UserAvatar';
import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Trash2, Lock, Globe, Users, UserPlus, Layers } from 'lucide-react';
import type { Organization, OrgMembership, Ministry, Post } from '../../types';
import {
  listenToOrgThread,
  listenToOrgInternal,
  createOrgPost,
  togglePostLike,
  deletePost,
  subscribeToPostComments,
  postFieldsForAssetEmbed,
  auth,
} from '../../services/backendService';
import { updateOrganization } from '../../services/organizationService';
import { saveMinistries } from '../../services/elevateService';
import { elevateCan } from '../../services/elevateRoles';
import { listenFollowedState, followOrg } from '../../services/orgFollowService';
import CommentSection from '../CommentSection';
import UniversalPostComposer, { type ComposerSubmitData } from '../UniversalPostComposer';
import { resolveComposerMedia } from '../FeedView';
import OrgAudienceToggle, {
  type OrgPostTarget,
  orgTargetToPostFields,
  canViewerSeeOrgPost,
  extractOrgDepartmentsAndGroups,
} from './OrgAudienceToggle';
import ShareButton from '../ShareButton';

type Audience = 'DEPARTMENT' | 'ORG' | 'PUBLIC';

// The org feed blends two streams. Members-only (INTERNAL) posts are violet; public posts stay neutral grey-white.
type FeedView = 'BLEND' | 'PUBLIC' | 'MEMBERS';
const VIOLET = '#D0BCFF';
const TONE = {
  internal: { bg: 'rgba(122,31,192,0.13)', border: 'rgba(208,188,255,0.30)', ink: VIOLET, divider: 'rgba(208,188,255,0.18)' },
  public: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.10)', ink: 'rgba(255,255,255,0.55)', divider: 'rgba(255,255,255,0.08)' },
};
const VIEW_KEY = (orgId: string) => `plajah_orgfeed_view_${orgId}_v1`;

const AUDIENCES: { key: Audience; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: 'PUBLIC', label: 'Public', icon: <Globe size={11} />, hint: 'Public timeline · anyone can comment' },
  { key: 'ORG', label: 'Org', icon: <Users size={11} />, hint: 'Anyone can read · members & followers comment' },
  { key: 'DEPARTMENT', label: 'Department', icon: <Lock size={11} />, hint: 'Department members only' },
];

export function isDepartmentMember(m: OrgMembership | null | undefined, org: Organization, ministry?: Ministry): boolean {
  if (!m || m.status !== 'ACTIVE' || !ministry) return false;
  return !!ministry.headUids?.includes(m.userId) || !!m.ministryRoles?.some(r => r.ministryId === ministry.id) ||
    elevateCan(m, org, 'MANAGE_MINISTRIES') || elevateCan(m, org, 'MODERATE_THREADS');
}

const ReadOnlyComments: React.FC<{ postId: string }> = ({ postId }) => {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => subscribeToPostComments(postId, setItems), [postId]);
  if (!items.length) return <p className="text-[10px] text-white/30 uppercase tracking-widest py-2">No comments yet</p>;
  return (
    <div className="space-y-2 py-2">
      {items.map(c => (
        <div key={c.id} className="text-xs text-white/70"><span className="font-black text-white">{c.authorName || c.author}</span> {c.text}</div>
      ))}
    </div>
  );
};

interface Props {
  org: Organization;
  myMembership: OrgMembership | null;
  /** Omit for the org-wide thread. */
  ministry?: Ministry;
  onVisitUser?: (uid: string) => void;
  onOrgChange?: (o: Organization) => void;
  /** Hide the composer (e.g. embedded public preview). */
  readOnly?: boolean;
}

const OrgThread: React.FC<Props> = ({ org, myMembership, ministry, onVisitUser, onOrgChange, readOnly }) => {
  const uid = auth.currentUser?.uid;
  const audience: Audience = ministry ? (ministry.threadAudience || 'ORG') : (org.threadAudience || 'ORG');
  const [posts, setPosts] = useState<Post[]>([]);
  const [denied, setDenied] = useState(false);
  const [internalPosts, setInternalPosts] = useState<Post[]>([]);
  const [viewPref, setView] = useState<FeedView>(() => { try { return (localStorage.getItem(VIEW_KEY(org.id)) as FeedView) || 'BLEND'; } catch { return 'BLEND'; } });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [followed, setFollowed] = useState({ org: false, ministries: [] as string[] });
  const [feedDeptFilter, setFeedDeptFilter] = useState<string>('ALL');

  // Target selection for UniversalPostComposer
  const [postTarget, setPostTarget] = useState<OrgPostTarget>(() =>
    ministry
      ? { scope: 'DEPARTMENTS', departmentIds: [ministry.id], subGroupIds: [], rosterGroups: [], targetLabels: [ministry.name] }
      : { scope: audience === 'PUBLIC' ? 'PUBLIC' : 'MEMBERS', departmentIds: [], subGroupIds: [], rosterGroups: [], targetLabels: [] }
  );

  useEffect(() => listenFollowedState(org.id, setFollowed), [org.id, uid]);
  useEffect(() => {
    if (ministry) {
      setPostTarget({ scope: 'DEPARTMENTS', departmentIds: [ministry.id], subGroupIds: [], rosterGroups: [], targetLabels: [ministry.name] });
    } else {
      setPostTarget(prev => ({ ...prev, scope: audience === 'PUBLIC' ? 'PUBLIC' : 'MEMBERS' }));
    }
  }, [audience, ministry?.id]);

  const isMember = myMembership?.status === 'ACTIVE';
  const orgFeed = !ministry;
  const inDept = ministry ? isDepartmentMember(myMembership, org, ministry) || elevateCan(myMembership, org, 'MODERATE_THREADS') : false;
  const canModerate = elevateCan(myMembership, org, 'MODERATE_THREADS', { ministryId: ministry?.id });
  const canPost = !readOnly && elevateCan(myMembership, org, 'POST_AS_ORG', { ministryId: ministry?.id });

  const canRead = audience !== 'DEPARTMENT' || inDept;
  const canSeeInternal = orgFeed && !!uid && (isMember || canModerate);
  const view: FeedView = !canSeeInternal && viewPref === 'MEMBERS' ? 'BLEND' : viewPref;

  useEffect(() => {
    if (!canRead) { setPosts([]); return; }
    setDenied(false);
    return listenToOrgThread(org.id, { departmentId: ministry?.id, audience }, setPosts, () => setDenied(true));
  }, [org.id, ministry?.id, audience, canRead]);

  useEffect(() => {
    if (!canSeeInternal) { setInternalPosts([]); return; }
    return listenToOrgInternal(org.id, setInternalPosts, () => setInternalPosts([]));
  }, [org.id, canSeeInternal]);

  useEffect(() => {
    if (!ministry) {
      setPostTarget(prev => ({
        ...prev,
        scope: view === 'MEMBERS' && canSeeInternal ? 'INTERNAL' : prev.scope === 'INTERNAL' && view === 'PUBLIC' ? 'PUBLIC' : prev.scope,
      }));
    }
  }, [view, canSeeInternal, ministry]);

  const chooseView = (v: FeedView) => { setView(v); try { localStorage.setItem(VIEW_KEY(org.id), v); } catch { /* private mode */ } };

  const { departments } = useMemo(() => extractOrgDepartmentsAndGroups(org), [org]);

  const publicPosts = useMemo(() => posts.filter(p => p.orgAudience !== 'INTERNAL'), [posts]);
  const shown = useMemo(() => {
    const base = !orgFeed
      ? posts
      : [
          ...(view === 'MEMBERS' ? [] : publicPosts),
          ...(view === 'PUBLIC' || !canSeeInternal ? [] : internalPosts),
        ];

    const byId = new Map<string, Post>();
    for (const p of base) byId.set(p.id, p);

    return Array.from(byId.values())
      .filter(p => canViewerSeeOrgPost(p, org, myMembership, canModerate))
      .filter(p => {
        if (feedDeptFilter === 'ALL') return true;
        return (
          p.orgDepartmentId === feedDeptFilter ||
          (p.orgDepartmentIds || []).includes(feedDeptFilter) ||
          (p.orgGroupIds || []).includes(feedDeptFilter)
        );
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [orgFeed, view, posts, publicPosts, internalPosts, canSeeInternal, org, myMembership, canModerate, feedDeptFilter]);

  const handleUniversalPublish = async (data: ComposerSubmitData) => {
    const resolvedMedia = await resolveComposerMedia(data.attachments || [], uid || org.creatorId || org.id);
    const embedFields = await postFieldsForAssetEmbed(data.assetEmbed);
    const targetFields = orgTargetToPostFields(
      ministry && postTarget.scope !== 'DEPARTMENTS' && postTarget.scope !== 'SUBGROUPS'
        ? { ...postTarget, departmentIds: [ministry.id], targetLabels: [ministry.name] }
        : postTarget,
      org
    );

    await createOrgPost(org.id, org.name, org.logoUrl || '', {
      text: (data.text || '').trim(),
      ...targetFields,
      ...(ministry && !targetFields.orgDepartmentId ? { orgDepartmentId: ministry.id } : {}),
      ...(resolvedMedia.length ? { media: resolvedMedia } : {}),
      ...(data.poll ? { poll: data.poll } : {}),
      ...(data.quotedPost ? { quotedPost: data.quotedPost } : {}),
      ...(data.taggedUsers?.length ? { taggedUsers: data.taggedUsers } : {}),
      ...embedFields,
    } as Partial<Post>);
  };

  const setThreadAudience = async (a: Audience) => {
    if (ministry) {
      const ms = (org.ministries || []).map(m => m.id === ministry.id ? { ...m, threadAudience: a } : m);
      await saveMinistries(org.id, ms);
      onOrgChange?.({ ...org, ministries: ms });
    } else if (a !== 'DEPARTMENT') {
      await updateOrganization(org.id, { threadAudience: a });
      onOrgChange?.({ ...org, threadAudience: a });
    }
  };

  const available = useMemo(() => AUDIENCES.filter(a => ministry ? true : a.key !== 'DEPARTMENT'), [ministry]);

  if (!canRead) {
    return (
      <div className="rounded-2xl p-6 bg-white/[0.03] border border-white/10 text-center">
        <Lock size={20} className="mx-auto text-white/30 mb-2" />
        <p className="text-xs font-bold text-white/60">This thread is private to {ministry?.name || 'the department'} members.</p>
      </div>
    );
  }

  return (
    <div>
      {canModerate && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Who can see &amp; comment</span>
          {available.map(a => (
            <button key={a.key} onClick={() => setThreadAudience(a.key)} title={a.hint}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${audience === a.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
      <p className="text-[9px] text-white/30 mb-3">{AUDIENCES.find(a => a.key === audience)?.hint}</p>

      {orgFeed && (
        <div className="space-y-2 mb-4">
          <div role="tablist" aria-label="Feed view" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[0.05] border border-white/10">
            {([
              ['BLEND', 'Everything', canSeeInternal ? publicPosts.length + internalPosts.length : publicPosts.length],
              ['PUBLIC', 'Public', publicPosts.length],
              ['MEMBERS', 'Members & Depts', internalPosts.length],
            ] as const).map(([k, l, n]) => {
              const locked = k === 'MEMBERS' && !canSeeInternal;
              const on = view === k;
              return (
                <button key={k} role="tab" aria-selected={on} disabled={locked} onClick={() => chooseView(k)}
                  title={locked ? 'Members-only posts are visible to members of this organization' : undefined}
                  className={`h-11 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all disabled:opacity-35 ${on ? 'text-black' : 'text-white/55'}`}
                  style={on ? { background: k === 'MEMBERS' ? VIOLET : k === 'PUBLIC' ? '#E7E5EA' : '#fff' } : undefined}>
                  {k === 'MEMBERS' ? <Lock size={11} /> : k === 'PUBLIC' ? <Globe size={11} /> : null}
                  {l}<span className="tabular-nums opacity-60">{locked ? '' : n}</span>
                </button>
              );
            })}
          </div>

          {/* Department / Sub-Group Feed Filter Bar */}
          {departments.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
              <button
                type="button"
                onClick={() => setFeedDeptFilter('ALL')}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border transition ${
                  feedDeptFilter === 'ALL'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
                }`}
              >
                All Feeds
              </button>
              {departments.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setFeedDeptFilter(feedDeptFilter === d.id ? 'ALL' : d.id)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 border transition ${
                    feedDeptFilter === d.id
                      ? 'bg-[#8B5CF6] text-white border-[#D0BCFF]'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  {d.emoji ? `${d.emoji} ` : ''}{d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Universal Post Composer (Same as CommentSection.tsx & FeedView.tsx) with OrgAudienceToggle */}
      {canPost && (
        <div className="mb-4">
          <UniversalPostComposer
            currentUser={auth.currentUser}
            compact
            avatarUrl={org.logoUrl || auth.currentUser?.photoURL || undefined}
            placeholder={
              postTarget.scope === 'INTERNAL'
                ? `Members-only post to ${org.name}…`
                : postTarget.scope === 'DEPARTMENTS' || postTarget.scope === 'SUBGROUPS'
                ? `Post to ${postTarget.targetLabels?.join(', ') || ministry?.name || 'selected departments/groups'}…`
                : `Post to ${ministry?.name || org.name} as ${org.name}…`
            }
            submitLabel="Publish"
            destinationSlot={
              <OrgAudienceToggle
                org={org}
                target={postTarget}
                onTargetChange={setPostTarget}
                compact
              />
            }
            onPost={handleUniversalPublish}
          />
        </div>
      )}

      {denied ? (
        <p className="text-[10px] text-white/30 uppercase tracking-widest text-center py-6">This thread isn't available to you.</p>
      ) : shown.length === 0 ? (
        <p className="text-[10px] text-white/30 uppercase tracking-widest text-center py-6">{view === 'MEMBERS' ? 'No members-only posts yet' : 'Nothing posted yet'}</p>
      ) : (
        <div className="space-y-3">
          {shown.map(p => {
            const liked = !!uid && p.likedBy?.includes(uid);
            const internal = p.orgAudience === 'INTERNAL' || p.orgAudience === 'DEPARTMENT';
            const memberOnly = p.orgAudience === 'MEMBERS';
            const tone = internal ? TONE.internal : TONE.public;
            const postCanComment = !!uid && (
              internal ? (isMember || canModerate) : !p.orgAudience || p.orgAudience === 'PUBLIC' ? true : memberOnly ? (isMember || followed.org || canModerate) : inDept);
            return (
              <div key={p.id} className="rounded-2xl p-4 border" data-audience={internal ? 'internal' : 'public'} style={{ background: tone.bg, borderColor: tone.border }}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <UserAvatar uid={p.authorId} src={p.authorPhoto || org.logoUrl || ''} className="w-8 h-8 rounded-full border border-white/10 object-cover" alt="" />
                  <p className="text-sm font-black text-white flex-1 min-w-0 truncate">{p.authorName || org.name}
                    <span className="text-white/30 font-bold text-[9px]"> · {new Date(p.timestamp).toLocaleDateString()}</span></p>
                  {p.orgTargetLabels && p.orgTargetLabels.length > 0 && (
                    <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/25 border border-purple-400/35 text-purple-200">
                      <Layers size={9} /> {p.orgTargetLabels.join(' · ')}
                    </span>
                  )}
                  {orgFeed && (internal
                    ? <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 px-2 py-1 rounded-full" style={{ color: VIOLET, background: 'rgba(122,31,192,0.28)' }}><Lock size={9} /> {p.orgAudience === 'DEPARTMENT' ? 'Department' : 'Members only'}</span>
                    : <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: TONE.public.ink }}><Globe size={9} /> Public</span>)}
                  {!orgFeed && memberOnly && <span className="text-[8px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1"><Users size={9} /> Members</span>}
                  {p.orgAudience === 'DEPARTMENT' && !orgFeed && <span className="text-[8px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1"><Lock size={9} /> Dept</span>}
                  {(canModerate || p.authorId === uid) && (
                    <button onClick={() => window.confirm('Remove this post?') && deletePost(p.id)} className="text-white/25 hover:text-rose-400"><Trash2 size={13} /></button>
                  )}
                </div>
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap mb-3">{p.text}</p>
                {p.media?.[0]?.url && p.media[0].type === 'PHOTO' && <img src={p.media[0].url} className="rounded-xl border border-white/10 max-h-72 w-full object-cover mb-3" alt="" />}
                <div className="flex items-center gap-4">
                  <button onClick={() => uid ? togglePostLike(p.id) : alert('Sign in to react.')}
                    className="h-10 -my-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest" style={{ color: liked ? '#FF8C00' : internal ? 'rgba(208,188,255,0.7)' : 'rgba(255,255,255,0.4)' }}>
                    <Heart size={12} fill={liked ? '#FF8C00' : 'none'} /> {p.likesCount || 0}
                  </button>
                  <button onClick={() => setOpen(o => ({ ...o, [p.id]: !o[p.id] }))}
                    className="h-10 -my-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest hover:text-white" style={{ color: internal ? 'rgba(208,188,255,0.7)' : 'rgba(255,255,255,0.4)' }}>
                    <MessageCircle size={12} /> {p.commentsCount || 0}
                  </button>
                  <ShareButton
                    url={`${window.location.origin}/?org=${org.id}&post=${p.id}`}
                    title={`${p.authorName || org.name} on Plajah Elevate`}
                    description={p.text?.slice(0, 140)}
                    contentId={p.id}
                    contentType="post"
                    compact
                  />
                </div>
                {open[p.id] && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: tone.divider }}>
                    {internal && <p className="mb-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: VIOLET }}><Lock size={10} /> Members-only conversation</p>}
                    {postCanComment ? (
                      <CommentSection postId={p.id} postAuthorId={p.authorId} initialCount={p.commentsCount || 0} onVisitUser={onVisitUser} />
                    ) : (
                      <>
                        <ReadOnlyComments postId={p.id} />
                        <div className="flex items-center justify-between gap-3 mt-2 p-3 rounded-xl bg-white/[0.04] border border-white/10">
                          <p className="text-[10px] text-white/50">{!uid ? 'Sign in to join the conversation.' : 'Only members and followers can comment on this thread.'}</p>
                          {uid && !followed.org && (
                            <button onClick={() => followOrg(org.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-small-orange text-black text-[9px] font-black uppercase tracking-widest shrink-0">
                              <UserPlus size={11} /> Follow
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OrgThread;
