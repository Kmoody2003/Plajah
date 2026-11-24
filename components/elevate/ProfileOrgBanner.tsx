import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bell, Check, Church, ChevronDown, Clock, KeyRound, Loader2, UserCheck } from 'lucide-react';
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
  const [openOrgId, setOpenOrgId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openOrgId) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenOrgId(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenOrgId(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openOrgId]);

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

  const openItem = orgs.find(o => o.orgId === openOrgId) || null;
  const itemBtn =
    'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[13px] font-bold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00DAF3] transition-colors';
  const iconBox = 'grid h-8 w-8 shrink-0 place-items-center rounded-[10px]';

  return (
    <div
      ref={wrapRef}
      className={`relative mt-4 flex flex-wrap items-center gap-2.5 ${isMobile ? 'justify-center' : ''}`}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">
        {orgs.some(o => o.isOfficialAccount) ? 'Elevate Hub' : 'Affiliations'} &middot; {orgs.length}
      </span>

      {orgs.map((item, i) => {
        const showName = i === 0;
        return (
          <button
            key={item.orgId}
            type="button"
            onClick={() => setOpenOrgId(prev => (prev === item.orgId ? null : item.orgId))}
            aria-haspopup="menu"
            aria-expanded={openOrgId === item.orgId}
            aria-label={item.orgName}
            title={[item.orgName, item.roleTitle].filter(Boolean).join(' · ')}
            className={`inline-flex h-12 items-center gap-2.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00DAF3] ${
              showName ? 'pl-1.5 pr-4' : 'px-1.5'
            }`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 border border-white/15">
              {item.orgLogoUrl ? (
                <img src={item.orgLogoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Church size={16} className="text-[#C4B5FD]" />
              )}
            </span>
            {showName && <span className="max-w-[200px] truncate text-[13px] font-bold text-white">{item.orgName}</span>}
            {showName && <ChevronDown size={12} className="text-white/60" aria-hidden="true" />}
          </button>
        );
      })}

      {openItem && (() => {
        const isFol = followedIds.has(openItem.orgId);
        const myMem = myMemberships.get(openItem.orgId);
        const isMember = myMem?.status === 'ACTIVE';
        const isPending = myMem?.status === 'PENDING';
        return (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-2 w-[340px] max-w-[calc(100vw-32px)] rounded-[22px] border border-white/15 bg-[#0e0b17] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
          >
            <div className="px-3 pt-3 pb-2">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60 truncate">{openItem.orgName}</p>
              <p className="mt-1.5 text-[12px] font-medium text-white/60 truncate">
                {[openItem.roleTitle, openItem.ministryName].filter(Boolean).join(' · ') || openItem.tagline || 'Organization'}
              </p>
            </div>
            <button type="button" role="menuitem" className={itemBtn} onClick={() => { setOpenOrgId(null); handleOpenOrg(openItem.orgId); }}>
              <span className={`${iconBox} bg-white/[0.08]`}><ArrowUpRight size={15} /></span>
              <span>Open Org / Elevate page<span className="block text-[11px] font-medium text-white/60">Their public page</span></span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={itemBtn}
              disabled={busyFollowId === openItem.orgId}
              onClick={() => handleToggleFollow(openItem.orgId)}
            >
              <span className={`${iconBox} ${isFol ? 'bg-white/[0.08]' : 'bg-small-orange text-black'}`}>
                {busyFollowId === openItem.orgId ? <Loader2 size={14} className="animate-spin" /> : isFol ? <Check size={14} /> : <Bell size={14} />}
              </span>
              <span>{isFol ? 'Following org' : 'Follow org'}<span className="block text-[11px] font-medium text-white/60">Public updates, no approval needed</span></span>
            </button>
            {isMember ? (
              <div className={`${itemBtn} cursor-default hover:bg-transparent`}>
                <span className={`${iconBox} bg-emerald-500/20 text-emerald-300`}><UserCheck size={14} /></span>
                <span>You are a member</span>
              </div>
            ) : isPending ? (
              <div className={`${itemBtn} cursor-default hover:bg-transparent`}>
                <span className={`${iconBox} bg-amber-500/20 text-amber-200`}><Clock size={14} /></span>
                <span>Membership pending<span className="block text-[11px] font-medium text-white/60">Awaiting approval from leadership</span></span>
              </div>
            ) : (
              <>
                <button type="button" role="menuitem" className={itemBtn} onClick={() => { setOpenOrgId(null); openElevateGatewayModal({ orgKey: openItem.orgId, mode: 'claim' }); }}>
                  <span className={`${iconBox} bg-[#7A1FC0] text-white`}><KeyRound size={14} /></span>
                  <span>Claim my membership<span className="block text-[11px] font-medium text-white/60">Already a member? Claim your seat or create your account</span></span>
                </button>
                <button type="button" role="menuitem" className={itemBtn} onClick={() => { setOpenOrgId(null); openElevateGatewayModal({ orgKey: openItem.orgId, mode: 'join' }); }}>
                  <span className={`${iconBox} bg-white/[0.08] text-[#C4B5FD]`}><UserCheck size={14} /></span>
                  <span>Request membership<span className="block text-[11px] font-medium text-white/60">For real members. Needs leadership approval.</span></span>
                </button>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default ProfileOrgBanner;
