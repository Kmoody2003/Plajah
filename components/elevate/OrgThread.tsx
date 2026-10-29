// OrgThread — the social thread for an org (org-wide) or one ministry/department.
//
// Every thread has two feeds, colour-coded and filterable (Everything / Public / Members):
//   • Public       — grey-white; anyone can read. Comments: anyone (PUBLIC) or members + followers (MEMBERS).
//   • Members-only — violet. Org-wide: orgAudience 'INTERNAL' (active org members + leaders).
//                    Department: orgAudience 'DEPARTMENT' + orgDepartmentId (that department's members + org leaders).
// Both are enforced in firestore.rules (posts read/create/like, orgThreadCommentOk/ReadOk), keyed on the
// server-maintained orgMemberIndex marker — this component only decides which streams to open.
// The org feed's Members view blends org-wide members-only posts with the department feeds the viewer belongs to.

import { UserAvatar } from '../avatar/UserAvatar';
import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Trash2, Lock, Globe, Users, UserPlus, Layers } from 'lucide-react';
import type { Organization, OrgMembership, Ministry, Post } from '../../types';
import {
  listenToOrgThread,
  listenToOrgInternal,
  listenToOrgDepartmentInternal,
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
import UniversalPostComposer, { type ComposerPostData } from '../UniversalPostComposer';
import { resolveComposerMedia } from '../FeedView';
import OrgAudienceToggle, {
  type OrgPostTarget,
  type OrgPostAudience,
  defaultOrgPostTarget,
  orgTargetToPostFieldsList,
  canViewerSeeOrgPost,
  extractOrgDepartmentsAndGroups,
  getMemberMinistryIdSet,
  isOrgFeedAdminOrLeader,
} from './OrgAudienceToggle';
import ShareButton from '../ShareButton';

type Audience = 'DEPARTMENT' | 'ORG' | 'PUBLIC';

type FeedView = 'BLEND' | 'PUBLIC' | 'MEMBERS';
const VIOLET = '#D0BCFF';
const TONE = {
  internal: { bg: 'rgba(122,31,192,0.13)', border: 'rgba(208,188,255,0.30)', ink: VIOLET, divider: 'rgba(208,188,255,0.18)' },
  public: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.10)', ink: 'rgba(255,255,255,0.55)', divider: 'rgba(255,255,255,0.08)' },
};
const VIEW_KEY = (orgId: string, deptId?: string) => `plajah_orgfeed_view_${orgId}${deptId ? `_${deptId}` : ''}_v1`;

// Leaders set the thread's comment policy (org) or the default feed new posts go to (department).
const AUDIENCES: { key: Audience; label: string; icon: React.ReactNode; hint: string; deptHint: string }[] = [
  { key: 'PUBLIC', label: 'Public', icon: <Globe size={11} />, hint: 'Public posts · anyone can comment', deptHint: 'New posts default to Public · anyone can comment' },
  { key: 'ORG', label: 'Org', icon: <Users size={11} />, hint: 'Public posts · members & followers comment', deptHint: 'New posts default to Public · members & followers comment' },
  { key: 'DEPARTMENT', label: 'Members', icon: <Lock size={11} />, hint: '', deptHint: 'New posts default to department members only' },
];

export function isDepartmentMember(m: OrgMembership | null | undefined, org: Organization, ministry?: Ministry): boolean {
  if (!m || m.status !== 'ACTIVE' || !ministry) return false;
  return !!ministry.headUids?.includes(m.userId) || !!m.ministryIds?.includes(ministry.id) || !!m.ministryRoles?.some(r => r.ministryId === ministry.id) ||
    elevateCan(m, org, 'MANAGE_MINISTRIES') || elevateCan(m, org, 'MODERATE_THREADS');
}

const isMembersOnly = (p: Post) => p.orgAudience === 'INTERNAL' || p.orgAudience === 'DEPARTMENT';

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
  const orgFeed = !ministry;
  const audience: Audience = ministry ? (ministry.threadAudience || 'ORG') : (org.threadAudience === 'PUBLIC' ? 'PUBLIC' : 'ORG');
  const [publicPosts, setPublicPosts] = useState<Post[]>([]);
  const [internalPosts, setInternalPosts] = useState<Post[]>([]);
  const [deptPosts, setDeptPosts] = useState<Record<string, Post[]>>({});
  const [viewPref, setView] = useState<FeedView>(() => { try { return (localStorage.getItem(VIEW_KEY(org.id, ministry?.id)) as FeedView) || 'BLEND'; } catch { return 'BLEND'; } });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [followed, setFollowed] = useState({ org: false, ministries: [] as string[] });
  const [feedDeptFilter, setFeedDeptFilter] = useState<string>('ALL');

  const isMember = myMembership?.status === 'ACTIVE';
  const isLeader = isOrgFeedAdminOrLeader(myMembership, org, uid);
  const canModerate = elevateCan(myMembership, org, 'MODERATE_THREADS', { ministryId: ministry?.id });
  const canPost = !readOnly && elevateCan(myMembership, org, 'POST_AS_ORG', { ministryId: ministry?.id });
  const inDept = ministry ? isDepartmentMember(myMembership, org, ministry) || isLeader : false;

  const { departments } = useMemo(() => extractOrgDepartmentsAndGroups(org), [org]);
  // Department feeds this viewer may open: their own departments, or all of them for org leaders.
  const myDeptIds = useMemo(() => {
    if (!uid) return [] as string[];
    if (ministry) return inDept ? [ministry.id] : [];
    if (isLeader) return (org.ministries || []).map(m => m.id);
    if (!isMember) return [];
    const mine = getMemberMinistryIdSet(myMembership, org, uid);
    return (org.ministries || []).map(m => m.id).filter(id => mine.has(id));
  }, [uid, ministry?.id, inDept, isLeader, isMember, myMembership, org]);
  const myDeptKey = myDeptIds.join(',');

  const canSeeInternal = !!uid && (orgFeed ? isMember || isLeader || canModerate : inDept);
  const view: FeedView = !canSeeInternal && viewPref === 'MEMBERS' ? 'BLEND' : viewPref;

  // Public stream (org-wide, or this department's public posts).
  useEffect(() => listenToOrgThread(org.id, { departmentId: ministry?.id, audience: 'ORG' }, setPublicPosts, () => setPublicPosts([])),
    [org.id, ministry?.id]);

  // Org-wide members-only stream (org feed only).
  useEffect(() => {
    if (!orgFeed || !canSeeInternal) { setInternalPosts([]); return; }
    return listenToOrgInternal(org.id, setInternalPosts, () => setInternalPosts([]));
  }, [org.id, orgFeed, canSeeInternal]);

  // Department members-only streams — one listener per department (rules check one department per query).
  useEffect(() => {
    setDeptPosts({});
    const ids = myDeptKey ? myDeptKey.split(',') : [];
    const unsubs = ids.map(id => listenToOrgDepartmentInternal(org.id, id,
      items => setDeptPosts(prev => ({ ...prev, [id]: items })),
      () => setDeptPosts(prev => ({ ...prev, [id]: [] }))));
    return () => unsubs.forEach(u => u());
  }, [org.id, myDeptKey]);

  const chooseView = (v: FeedView) => { setView(v); try { localStorage.setItem(VIEW_KEY(org.id, ministry?.id), v); } catch { /* private mode */ } };

  const membersPosts = useMemo(() => [...internalPosts, ...Object.values(deptPosts).flat()], [internalPosts, deptPosts]);
  const visiblePublic = useMemo(() => publicPosts.filter(p => !isMembersOnly(p)), [publicPosts]);

  const shown = useMemo(() => {
    const base = [
      ...(view === 'MEMBERS' ? [] : visiblePublic),
      ...(view === 'PUBLIC' || !canSeeInternal ? [] : membersPosts),
    ];
    // One post aimed at several departments is stored once per department — show it once.
    const seen = new Set<string>();
    const out: Post[] = [];
    for (const p of base.sort((a, b) => b.timestamp - a.timestamp)) {
      const key = p.orgPostGroupId || p.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out
      .filter(p => canViewerSeeOrgPost(p, uid, myMembership, org))
      .filter(p => feedDeptFilter === 'ALL' ||
        p.orgDepartmentId === feedDeptFilter ||
        (p.orgDepartmentIds || []).includes(feedDeptFilter) ||
        (p.orgGroupIds || []).includes(feedDeptFilter));
  }, [view, visiblePublic, membersPosts, canSeeInternal, uid, myMembership, org, feedDeptFilter]);

  // ── Composer target ─────────────────────────────────────────────────────────
  const [orgTarget, setOrgTarget] = useState<OrgPostTarget>(() => defaultOrgPostTarget(audience === 'PUBLIC' ? 'PUBLIC' : 'MEMBERS'));
  const [deptMembersOnly, setDeptMembersOnly] = useState(audience === 'DEPARTMENT');
  useEffect(() => { setDeptMembersOnly(audience === 'DEPARTMENT'); }, [audience, ministry?.id]);
  // Picking the Members view points the composer at the members-only feed.
  useEffect(() => {
    if (!canSeeInternal) return;
    if (ministry) { if (view !== 'BLEND') setDeptMembersOnly(view === 'MEMBERS'); return; }
    if (view === 'MEMBERS') setOrgTarget(defaultOrgPostTarget('INTERNAL'));
    else if (view === 'PUBLIC') setOrgTarget(defaultOrgPostTarget(audience === 'PUBLIC' ? 'PUBLIC' : 'MEMBERS'));
  }, [view, canSeeInternal, ministry?.id]);

  const postFieldsList = (): Partial<Post>[] => {
    if (!ministry) return orgTargetToPostFieldsList(orgTarget, org);
    return [deptMembersOnly
      ? { isPublic: false, orgAudience: 'DEPARTMENT', orgDepartmentId: ministry.id, orgTargetLabels: [ministry.name] }
      : { isPublic: true, orgAudience: audience === 'PUBLIC' ? 'PUBLIC' : 'MEMBERS', orgDepartmentId: ministry.id, orgTargetLabels: [ministry.name] }];
  };

  const handlePublish = async (data: ComposerPostData) => {
    const resolvedMedia = await resolveComposerMedia(data.attachments || [], uid || org.creatorId || org.id);
    const embedFields = await postFieldsForAssetEmbed(data.assetEmbed);
    for (const targetFields of postFieldsList()) {
      await createOrgPost(org.id, org.name, org.logoUrl || '', {
        text: (data.text || '').trim(),
        ...targetFields,
        ...(resolvedMedia.length ? { media: resolvedMedia } : {}),
        ...(data.poll ? { poll: data.poll } : {}),
        ...embedFields,
      } as Partial<Post>);
    }
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
  const membersLabel = ministry ? `${ministry.name} members` : 'Members & Depts';
  const composerMembersOnly = ministry ? deptMembersOnly : orgTarget.mode !== 'PUBLIC' && orgTarget.mode !== 'MEMBERS';

  return (
    <div>
      {canModerate && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{ministry ? 'Default feed' : 'Who can comment'}</span>
          {available.map(a => (
            <button key={a.key} onClick={() => setThreadAudience(a.key)} title={ministry ? a.deptHint : a.hint}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${audience === a.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
      <p className="text-[9px] text-white/30 mb-3">{ministry ? AUDIENCES.find(a => a.key === audience)?.deptHint : AUDIENCES.find(a => a.key === audience)?.hint}</p>

      <div className="space-y-2 mb-4">
        <div role="tablist" aria-label="Feed view" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[0.05] border border-white/10">
          {([
            ['BLEND', 'Everything', canSeeInternal ? visiblePublic.length + membersPosts.length : visiblePublic.length],
            ['PUBLIC', 'Public', visiblePublic.length],
            ['MEMBERS', membersLabel, membersPosts.length],
          ] as const).map(([k, l, n]) => {
            const locked = k === 'MEMBERS' && !canSeeInternal;
            const on = view === k;
            return (
              <button key={k} role="tab" aria-selected={on} disabled={locked} onClick={() => chooseView(k)}
                title={locked ? (ministry ? `Members-only posts are visible to ${ministry.name} members` : 'Members-only posts are visible to members of this organization') : undefined}
                className={`h-11 min-w-0 px-1 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all disabled:opacity-35 ${on ? 'text-black' : 'text-white/55'}`}
                style={on ? { background: k === 'MEMBERS' ? VIOLET : k === 'PUBLIC' ? '#E7E5EA' : '#fff' } : undefined}>
                {k === 'MEMBERS' ? <Lock size={11} className="shrink-0" /> : k === 'PUBLIC' ? <Globe size={11} className="shrink-0" /> : null}
                <span className="truncate">{l}</span><span className="tabular-nums opacity-60">{locked ? '' : n}</span>
              </button>
            );
          })}
        </div>

        {orgFeed && departments.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            <button type="button" onClick={() => setFeedDeptFilter('ALL')}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border transition ${feedDeptFilter === 'ALL' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/55 hover:text-white'}`}>
              All Feeds
            </button>
            {departments.map(d => (
              <button key={d.id} type="button" onClick={() => setFeedDeptFilter(feedDeptFilter === d.id ? 'ALL' : d.id)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 border transition ${feedDeptFilter === d.id ? 'bg-[#8B5CF6] text-white border-[#D0BCFF]' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}>
                {d.iconEmoji ? `${d.iconEmoji} ` : ''}{d.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {canPost && (
        <div className="mb-4">
          <UniversalPostComposer
            currentUser={auth.currentUser}
            compact
            avatarUrl={org.logoUrl || auth.currentUser?.photoURL || undefined}
            placeholder={composerMembersOnly
              ? `Members-only post to ${ministry?.name || orgTarget.targetLabels.join(', ') || org.name}…`
              : `Post to ${ministry?.name || org.name} as ${org.name}…`}
            postLabel="Publish"
            destinationSlot={ministry ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mr-1">Post to</span>
                <button type="button" onClick={() => setDeptMembersOnly(false)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${!deptMembersOnly ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/55 hover:text-white'}`}>
                  <Globe size={10} /> Public
                </button>
                <button type="button" disabled={!inDept} onClick={() => setDeptMembersOnly(true)}
                  title={inDept ? `Only ${ministry.name} members and org leaders can see it` : `Only ${ministry.name} members can post here`}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all disabled:opacity-35 ${deptMembersOnly ? 'bg-[#7A1FC0] text-white border-[#D0BCFF]/60' : 'bg-white/5 border-white/10 text-white/55 hover:text-white'}`}>
                  <Lock size={10} /> {ministry.name} members
                </button>
              </div>
            ) : (
              <OrgAudienceToggle org={org} value={orgTarget.orgAudience} onChange={(_: OrgPostAudience) => {}} target={orgTarget} onTargetChange={setOrgTarget} onOrgUpdated={onOrgChange} />
            )}
            onPost={handlePublish}
          />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-[10px] text-white/30 uppercase tracking-widest text-center py-6">{view === 'MEMBERS' ? 'No members-only posts yet' : 'Nothing posted yet'}</p>
      ) : (
        <div className="space-y-3">
          {shown.map(p => {
            const liked = !!uid && p.likedBy?.includes(uid);
            const internal = isMembersOnly(p);
            const memberComment = p.orgAudience === 'MEMBERS';
            const tone = internal ? TONE.internal : TONE.public;
            const postInDept = p.orgAudience === 'DEPARTMENT' && !!p.orgDepartmentId && myDeptIds.includes(p.orgDepartmentId);
            const postCanComment = !!uid && (
              p.orgAudience === 'DEPARTMENT' ? postInDept || isLeader
                : p.orgAudience === 'INTERNAL' ? isMember || isLeader || canModerate
                : memberComment ? isMember || followed.org || canModerate : true);
            const badge = p.orgAudience === 'DEPARTMENT'
              ? `${(org.ministries || []).find(m => m.id === p.orgDepartmentId)?.name || 'Department'} only`
              : 'Members only';
            return (
              <div key={p.id} className="rounded-2xl p-4 border" data-audience={internal ? 'internal' : 'public'} style={{ background: tone.bg, borderColor: tone.border }}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <UserAvatar uid={p.authorId} src={p.authorPhoto || org.logoUrl || ''} className="w-8 h-8 rounded-full border border-white/10 object-cover" alt="" />
                  <p className="text-sm font-black text-white flex-1 min-w-0 truncate">{p.authorName || org.name}
                    <span className="text-white/30 font-bold text-[9px]"> · {new Date(p.timestamp).toLocaleDateString()}</span></p>
                  {orgFeed && p.orgTargetLabels && p.orgTargetLabels.length > 0 && (
                    <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/25 border border-purple-400/35 text-purple-200">
                      <Layers size={9} /> {p.orgTargetLabels.join(' · ')}
                    </span>
                  )}
                  {internal
                    ? <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 px-2 py-1 rounded-full" style={{ color: VIOLET, background: 'rgba(122,31,192,0.28)' }}><Lock size={9} /> {badge}</span>
                    : <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: TONE.public.ink }}><Globe size={9} /> Public</span>}
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
                  {!internal && (
                    <ShareButton
                      url={`${window.location.origin}/?org=${org.id}&post=${p.id}`}
                      title={`${p.authorName || org.name} on Plajah Elevate`}
                      text={p.text?.slice(0, 140) || ''}
                    />
                  )}
                </div>
                {open[p.id] && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: tone.divider }}>
                    {internal && <p className="mb-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: VIOLET }}><Lock size={10} /> {p.orgAudience === 'DEPARTMENT' ? 'Department-only conversation' : 'Members-only conversation'}</p>}
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
