// OrgThread — the social thread for an org (org-wide) or one ministry/department.
//
// Behaviour (enforced here AND in firestore.rules):
//   • PUBLIC thread   → posts go on the public timeline; anyone signed in may comment.
//   • ORG thread      → readable by anyone; ONLY members + followers may comment (orgAudience 'MEMBERS').
//   • DEPARTMENT      → readable + commentable by department members only (orgAudience 'DEPARTMENT').
// Leaders (MODERATE_THREADS) switch the audience and remove posts.

import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Trash2, Send, Lock, Globe, Users, Loader2, UserPlus } from 'lucide-react';
import type { Organization, OrgMembership, Ministry, Post } from '../../types';
import { listenToOrgThread, createOrgPost, togglePostLike, deletePost, subscribeToPostComments, auth } from '../../services/backendService';
import { updateOrganization } from '../../services/organizationService';
import { saveMinistries } from '../../services/elevateService';
import { elevateCan } from '../../services/elevateRoles';
import { listenFollowedState, followOrg } from '../../services/orgFollowService';
import CommentSection from '../CommentSection';

type Audience = 'DEPARTMENT' | 'ORG' | 'PUBLIC';

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
  const [text, setText] = useState('');
  const [postAud, setPostAud] = useState<'PUBLIC' | 'MEMBERS'>(audience === 'PUBLIC' ? 'PUBLIC' : 'MEMBERS');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [followed, setFollowed] = useState({ org: false, ministries: [] as string[] });

  useEffect(() => listenFollowedState(org.id, setFollowed), [org.id, uid]);
  useEffect(() => { setPostAud(audience === 'PUBLIC' ? 'PUBLIC' : 'MEMBERS'); }, [audience]);

  const isMember = myMembership?.status === 'ACTIVE';
  const inDept = ministry ? isDepartmentMember(myMembership, org, ministry) || elevateCan(myMembership, org, 'MODERATE_THREADS') : false;
  const canModerate = elevateCan(myMembership, org, 'MODERATE_THREADS', { ministryId: ministry?.id });
  const canPost = !readOnly && elevateCan(myMembership, org, 'POST_AS_ORG', { ministryId: ministry?.id });

  const canRead = audience !== 'DEPARTMENT' || inDept;
  const canComment = !!uid && (
    audience === 'PUBLIC' ||
    (audience === 'ORG' && (isMember || followed.org || canModerate)) ||
    (audience === 'DEPARTMENT' && inDept)
  );

  useEffect(() => {
    if (!canRead) { setPosts([]); return; }
    setDenied(false);
    return listenToOrgThread(org.id, { departmentId: ministry?.id, audience }, setPosts, () => setDenied(true));
  }, [org.id, ministry?.id, audience, canRead]);

  const publish = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const orgAudience = audience === 'DEPARTMENT' ? 'DEPARTMENT' : postAud;
      await createOrgPost(org.id, org.name, org.logoUrl || '', {
        text: text.trim(),
        orgAudience,
        ...(ministry ? { orgDepartmentId: ministry.id } : {}),
      } as Partial<Post>);
      setText('');
    } finally { setBusy(false); }
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
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Who can see & comment</span>
          {available.map(a => (
            <button key={a.key} onClick={() => setThreadAudience(a.key)} title={a.hint}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${audience === a.key ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
      <p className="text-[9px] text-white/30 mb-3">{AUDIENCES.find(a => a.key === audience)?.hint}</p>

      {canPost && (
        <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 mb-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
            placeholder={`Post to ${ministry?.name || org.name} as ${org.name}…`}
            className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-white/25" />
          <div className="flex items-center justify-between pt-2 border-t border-white/8 mt-2">
            {audience === 'DEPARTMENT' ? (
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40"><Lock size={10} /> Department only</span>
            ) : (
              <div className="flex gap-1">
                {(['PUBLIC', 'MEMBERS'] as const).map(a => (
                  <button key={a} onClick={() => setPostAud(a)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${postAud === a ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
                    {a === 'PUBLIC' ? 'Public' : 'Members'}
                  </button>
                ))}
              </div>
            )}
            <button onClick={publish} disabled={!text.trim() || busy}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Post
            </button>
          </div>
        </div>
      )}

      {denied ? (
        <p className="text-[10px] text-white/30 uppercase tracking-widest text-center py-6">This thread isn't available to you.</p>
      ) : posts.length === 0 ? (
        <p className="text-[10px] text-white/30 uppercase tracking-widest text-center py-6">Nothing posted yet</p>
      ) : (
        <div className="space-y-3">
          {posts.map(p => {
            const liked = !!uid && p.likedBy?.includes(uid);
            const memberOnly = p.orgAudience === 'MEMBERS';
            const postCanComment = !!uid && (
              !p.orgAudience || p.orgAudience === 'PUBLIC' ? true : memberOnly ? (isMember || followed.org || canModerate) : inDept);
            return (
              <div key={p.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <img src={p.authorPhoto || org.logoUrl || ''} className="w-8 h-8 rounded-full border border-white/10 object-cover" alt="" />
                  <p className="text-sm font-black text-white flex-1 min-w-0 truncate">{p.authorName || org.name}
                    <span className="text-white/30 font-bold text-[9px]"> · {new Date(p.timestamp).toLocaleDateString()}</span></p>
                  {memberOnly && <span className="text-[8px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1"><Users size={9} /> Members</span>}
                  {p.orgAudience === 'DEPARTMENT' && <span className="text-[8px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1"><Lock size={9} /> Dept</span>}
                  {(canModerate || p.authorId === uid) && (
                    <button onClick={() => window.confirm('Remove this post?') && deletePost(p.id)} className="text-white/25 hover:text-rose-400"><Trash2 size={13} /></button>
                  )}
                </div>
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap mb-3">{p.text}</p>
                {p.media?.[0]?.url && p.media[0].type === 'PHOTO' && <img src={p.media[0].url} className="rounded-xl border border-white/10 max-h-72 w-full object-cover mb-3" alt="" />}
                <div className="flex items-center gap-4">
                  <button onClick={() => uid ? togglePostLike(p.id) : alert('Sign in to react.')}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest" style={{ color: liked ? '#FF8C00' : 'rgba(255,255,255,0.4)' }}>
                    <Heart size={12} fill={liked ? '#FF8C00' : 'none'} /> {p.likesCount || 0}
                  </button>
                  <button onClick={() => setOpen(o => ({ ...o, [p.id]: !o[p.id] }))}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
                    <MessageCircle size={12} /> {p.commentsCount || 0}
                  </button>
                </div>
                {open[p.id] && (
                  <div className="mt-3 pt-3 border-t border-white/8">
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
