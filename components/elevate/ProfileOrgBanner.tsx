import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, Check, Church, Clock, KeyRound, Loader2, UserCheck } from 'lucide-react';
import type { OrgMembership, UserProfile } from '../../types';
import { auth } from '../../services/backendService';
import {
  fetchProfileOrganizations,
  fetchUserMemberships,
  openElevateGatewayModal,
  type ProfileOrgSummary,
} from '../../services/organizationService';
import { followOrg, unfollowOrg, isFollowing } from '../../services/orgFollowService';

export interface ProfileOrgBannerProps {
  profile: UserProfile;
  isOwnProfile?: boolean;
  isMobile?: boolean;
  onOpenOrg?: (orgId: string) => void;
}

/**
 * Renders on any user/account profile that has an associated Organization or Elevate ministry
 * (`linkedOrgId`, `employerOrgId`, `orgAffiliations`, or owned organization account).
 *
 * Gives visitors three distinct, one-click actions right on the account page:
 *   1. Open the Org / Elevate Page (`onOpenOrg(orgId)`)
 *   2. Follow the Org (`followOrg` / `unfollowOrg` — public updates, no approval required)
 *   3. Claim My Org Membership OR Request Membership (Onboarding + Plajah account creation/claim,
 *      designed for real members of the organization and requiring org approval).
 */
const ProfileOrgBanner: React.FC<ProfileOrgBannerProps> = ({
  profile,
  isMobile = false,
  onOpenOrg,
}) => {
  const [orgs, setOrgs] = useState<ProfileOrgSummary[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [myMemberships, setMyMemberships] = useState<Map<string, OrgMembership>>(new Map());
  const [busyFollowId, setBusyFollowId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchProfileOrganizations(profile)
      .then(async list => {
        if (!alive) return;
        setOrgs(list);
        const viewerUid = auth.currentUser?.uid;
        if (!viewerUid || !list.length) return;
        const [fStates, memberships] = await Promise.all([
          Promise.all(list.map(async o => ({ id: o.orgId, f: await isFollowing(o.orgId).catch(() => false) }))),
          fetchUserMemberships(viewerUid).catch(() => [] as OrgMembership[]),
        ]);
        if (!alive) return;
        setFollowedIds(new Set(fStates.filter(x => x.f).map(x => x.id)));
        const mMap = new Map<string, OrgMembership>();
        memberships.forEach(m => mMap.set(m.orgId, m));
        setMyMemberships(mMap);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [profile.uid, profile.linkedOrgId, (profile as any).employerOrgId, profile.orgAffiliations]);

  useEffect(() => {
    const onClaimed = () => {
      const viewerUid = auth.currentUser?.uid;
      if (!viewerUid) return;
      fetchUserMemberships(viewerUid)
        .then(ms => {
          const mMap = new Map<string, OrgMembership>();
          ms.forEach(m => mMap.set(m.orgId, m));
          setMyMemberships(mMap);
        })
        .catch(() => {});
    };
    window.addEventListener('plajah:elevate-claimed', onClaimed);
    return () => window.removeEventListener('plajah:elevate-claimed', onClaimed);
  }, []);

  if (!orgs.length) return null;

  const handleOpenOrg = (orgId: string) => {
    if (onOpenOrg) {
      onOpenOrg(orgId);
      return;
    }
    window.dispatchEvent(new CustomEvent('plajah:open-elevate-gateway', { detail: { orgKey: orgId, mode: 'join' } }));
  };

  const handleToggleFollow = async (orgId: string) => {
    if (!auth.currentUser) {
      openElevateGatewayModal({ orgKey: orgId, mode: 'join' });
      return;
    }
    setBusyFollowId(orgId);
    try {
      if (followedIds.has(orgId)) {
        await unfollowOrg(orgId);
        setFollowedIds(prev => {
          const next = new Set(prev);
          next.delete(orgId);
          return next;
        });
      } else {
        await followOrg(orgId);
        setFollowedIds(prev => new Set(prev).add(orgId));
      }
    } catch {
      /* ignore */
    } finally {
      setBusyFollowId(null);
    }
  };

  return (
    <div className={`mt-4 space-y-2.5 max-w-2xl ${isMobile ? 'mx-auto text-left' : ''}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#C4B5FD]/80 flex items-center gap-1.5">
        <Church size={11} className="text-[#C4B5FD]" />
        {orgs.some(o => o.isOfficialAccount) ? 'Organization & Elevate Hub' : 'Organization & Ministry Affiliation'}
      </p>

      <div className="space-y-2.5">
        {orgs.map(item => {
          const isFol = followedIds.has(item.orgId);
          const myMem = myMemberships.get(item.orgId);
          const isMember = myMem?.status === 'ACTIVE';
          const isPending = myMem?.status === 'PENDING';

          return (
            <div
              key={item.orgId}
              className="rounded-2xl border border-[#7A1FC0]/30 bg-gradient-to-r from-[#7A1FC0]/15 via-white/[0.03] to-[#7A1FC0]/10 p-3.5 transition-all"
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenOrg(item.orgId)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left group"
                >
                  <span className="w-11 h-11 rounded-xl overflow-hidden bg-white/10 border border-white/15 shrink-0 grid place-items-center text-xs font-black text-white/70">
                    {item.orgLogoUrl ? (
                      <img src={item.orgLogoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Church size={18} className="text-[#C4B5FD]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-black text-white group-hover:text-[#C4B5FD] transition-colors truncate">
                      {item.orgName}
                      <ArrowUpRight size={13} className="text-[#C4B5FD] shrink-0" />
                    </span>
                    <span className="block text-[10px] font-bold text-white/55 truncate">
                      {[item.roleTitle, item.ministryName].filter(Boolean).join(' · ') || item.tagline || 'Open Org / Elevate Page'}
                    </span>
                  </span>
                </button>

                {/* Action buttons: Open Org Page · Follow Org · Claim / Request Membership */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenOrg(item.orgId)}
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-[9px] font-black uppercase tracking-widest text-white flex items-center gap-1 transition-all"
                  >
                    Org / Elevate Page <ArrowUpRight size={11} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleFollow(item.orgId)}
                    disabled={busyFollowId === item.orgId}
                    title="Follow this organization for public updates & streams (no approval needed)"
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${
                      isFol
                        ? 'bg-white/10 text-white border border-white/20'
                        : 'bg-small-orange text-black hover:brightness-110'
                    }`}
                  >
                    {busyFollowId === item.orgId ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : isFol ? (
                      <Check size={10} />
                    ) : (
                      <Bell size={10} />
                    )}
                    {isFol ? 'Following Org' : 'Follow Org'}
                  </button>

                  {isMember ? (
                    <span className="px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <Check size={10} /> Org Member
                    </span>
                  ) : isPending ? (
                    <span
                      title="Your membership onboarding request is awaiting approval from organization leadership"
                      className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[9px] font-black uppercase tracking-widest flex items-center gap-1"
                    >
                      <Clock size={10} /> Membership Pending Approval
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openElevateGatewayModal({ orgKey: item.orgId, mode: 'claim' })}
                        title="Already a member of this organization? Claim your pre-provisioned membership seat or create your account."
                        className="px-3 py-1.5 rounded-full bg-gradient-to-r from-[#7A1FC0] to-[#7A1FC0] text-white text-[9px] font-black uppercase tracking-widest hover:brightness-110 flex items-center gap-1 shadow-[0_4px_14px_rgba(122,31,192,0.3)] transition-all"
                      >
                        <KeyRound size={10} /> Claim My Org Membership
                      </button>
                      <button
                        type="button"
                        onClick={() => openElevateGatewayModal({ orgKey: item.orgId, mode: 'join' })}
                        title="Request organization membership (doubles as member onboarding + Plajah account creation; requires org approval)."
                        className="px-3 py-1.5 rounded-full bg-[#7A1FC0]/15 hover:bg-[#7A1FC0]/25 border border-[#7A1FC0]/40 text-[#C4B5FD] text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all"
                      >
                        <UserCheck size={10} /> Request Membership
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!isMember && (
                <p className="mt-2 pt-2 border-t border-white/5 text-[10px] text-white/40 leading-relaxed">
                  <span className="text-white/60 font-bold">Following vs. Membership:</span> Following gives you public updates.{' '}
                  <span className="text-[#C4B5FD] font-semibold">Org Membership</span> is for real people who belong to {item.orgName}, requires approval from leadership, and doubles as member onboarding + creating or claiming your account.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProfileOrgBanner;
