// GroupMembershipButton — the one button on a ministry / department / sub-group page:
//   • you're in it           → "Member ✓" (and Leave, unless you hold a role there)
//   • it's public            → Follow / Following (public groups are followed, not joined)
//   • you asked already      → "Requested" (tap to withdraw)
//   • otherwise              → "Request to join" (its leaders approve — routes/elevateGroups.ts)
//   • not in the org yet     → "Join {org} first"
// Leaders also get the group's waiting requests with Approve / Decline (GroupJoinRequests below).
import React, { useEffect, useState } from 'react';
import { Check, UserPlus, Clock, Loader2, X } from 'lucide-react';
import type { Ministry, Organization, OrgMembership } from '../../types';
import { auth } from '../../services/backendService';
import { followMinistry, unfollowMinistry, listenFollowedState } from '../../services/orgFollowService';
import { openElevateGatewayModal } from '../../services/organizationService';
import { isDemoOrg } from '../../services/elevateTruth';
import { isPublicGroup, isInGroup } from '../../services/groupMembership';
import {
  requestToJoinGroup, cancelGroupRequest, leaveGroup, myPendingGroupRequests, pendingGroupRequests, decideGroupRequest,
  type GroupJoinRequestView,
} from '../../services/groupJoinClient';

export { isPublicGroup, isInGroup };

const pill = 'flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest shrink-0 disabled:opacity-40';

export const GroupMembershipButton: React.FC<{ org: Organization; ministry: Ministry; myMembership: OrgMembership | null }> = ({ org, ministry, myMembership }) => {
  const uid = auth.currentUser?.uid;
  const demo = isDemoOrg(org);
  const holdsRole = !!uid && ((ministry.headUids || []).includes(uid) || !!myMembership?.ministryRoles?.some(r => r.ministryId === ministry.id));
  const [member, setMember] = useState(isInGroup(ministry, myMembership, uid));
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const isPublic = isPublicGroup(ministry);
  const orgActive = myMembership?.status === 'ACTIVE';

  useEffect(() => { setMember(isInGroup(ministry, myMembership, uid)); }, [ministry, myMembership, uid]);
  useEffect(() => listenFollowedState(org.id, s => setFollowing(s.ministries.includes(ministry.id))), [org.id, ministry.id]);
  useEffect(() => {
    if (!uid || demo || member || isPublic || !orgActive) return;
    let alive = true;
    myPendingGroupRequests(org.id).then(ids => { if (alive) setPending(ids.includes(ministry.id)); }).catch(() => {});
    return () => { alive = false; };
  }, [uid, demo, member, isPublic, orgActive, org.id, ministry.id]);

  const run = async (fn: () => Promise<void>) => {
    if (!uid) { setMsg('Sign in first.'); return; }
    if (demo) { setMsg('This is a demo church. Create your own to try it.'); return; }
    setBusy(true); setMsg('');
    try { await fn(); } catch (e: any) {
      if (e?.needsOrg) openElevateGatewayModal({ orgKey: org.slug || org.id, mode: 'join' });
      else setMsg(e?.message || 'Something went wrong.');
    } finally { setBusy(false); }
  };

  let button: React.ReactNode;
  if (member) {
    button = (
      <div className="flex items-center gap-2 shrink-0">
        <span className={`${pill} bg-[rgba(127,216,176,0.12)] text-[#7FD8B0]`}><Check size={12} /> Member</span>
        {!holdsRole && (
          <button disabled={busy} onClick={() => run(async () => { await leaveGroup(org.id, ministry.id); setMember(false); })}
            className="text-[11px] font-semibold text-white/45 hover:text-white">Leave</button>
        )}
      </div>
    );
  } else if (isPublic) {
    button = (
      <button disabled={busy} onClick={() => run(async () => { following ? await unfollowMinistry(org.id, ministry.id) : await followMinistry(org.id, ministry.id); })}
        className={`${pill} ${following ? 'bg-white/10 text-white border border-white/15' : 'bg-small-orange text-black'}`}>
        {following ? <><Check size={12} /> Following</> : <><UserPlus size={12} /> Follow</>}
      </button>
    );
  } else if (uid && !orgActive && !demo) {
    button = (
      <button onClick={() => openElevateGatewayModal({ orgKey: org.slug || org.id, mode: 'join' })} className={`${pill} bg-small-orange text-black`}>
        <UserPlus size={12} /> Join {org.name} first
      </button>
    );
  } else if (pending) {
    button = (
      <button disabled={busy} title="Withdraw your request" onClick={() => run(async () => { await cancelGroupRequest(org.id, ministry.id); setPending(false); })}
        className={`${pill} bg-amber-500/10 border border-amber-500/30 text-amber-300`}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />} Requested
      </button>
    );
  } else {
    button = (
      <button disabled={busy} onClick={() => run(async () => { const r = await requestToJoinGroup(org.id, ministry.id); if (r.status === 'member') setMember(true); else setPending(true); })}
        className={`${pill} bg-small-orange text-black`} data-testid="group-request-join">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Request to join
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      {button}
      {msg && <span className="text-[11px] text-white/55 max-w-[220px] text-right">{msg}</span>}
    </div>
  );
};

/** Leaders: this group's waiting requests. Renders nothing when there are none. */
export const GroupJoinRequests: React.FC<{ org: Organization; ministry: Ministry }> = ({ org, ministry }) => {
  const [list, setList] = useState<GroupJoinRequestView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (isDemoOrg(org) || !auth.currentUser) { setList([]); return; }
    let alive = true;
    pendingGroupRequests(org.id, ministry.id).then(r => { if (alive) setList(r); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [org.id, ministry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!list || list.length === 0) return null;
  const decide = async (r: GroupJoinRequestView, approve: boolean) => {
    setBusy(r.uid); setErr('');
    try { await decideGroupRequest(org.id, ministry.id, r.uid, approve); setList(l => (l || []).filter(x => x.uid !== r.uid)); }
    catch (e: any) { setErr(e?.message || 'Could not save that.'); }
    finally { setBusy(null); }
  };
  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Join requests" data-testid="group-join-requests">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Asking to join · {list.length}</p>
      {err && <p className="text-[12px] text-red-300 mb-2">{err}</p>}
      <ul className="space-y-1.5">
        {list.map(r => (
          <li key={r.uid} className="flex items-center gap-3 py-1.5">
            <span className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0">{r.photoUrl ? <img src={r.photoUrl} alt="" className="w-full h-full object-cover" /> : null}</span>
            <span className="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">{r.displayName || 'Member'}</span>
            <button disabled={busy === r.uid} onClick={() => decide(r, true)} className="px-3 h-8 rounded-full bg-[#7FD8B0] text-black text-[11px] font-bold disabled:opacity-40 inline-flex items-center gap-1">
              {busy === r.uid ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Approve
            </button>
            <button disabled={busy === r.uid} onClick={() => decide(r, false)} className="px-3 h-8 rounded-full border border-white/15 text-white/80 text-[11px] font-bold disabled:opacity-40 inline-flex items-center gap-1">
              <X size={11} /> Decline
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default GroupMembershipButton;
