// ElevateGateway — the purple door into Plajah Elevate (churches, ministries, nonprofits, cultural orgs, and org accounts).
//
// Opened from the landing page ("Plajah Elevate" card), an account's Org/Elevate banner, an org's header,
// an org's join link / QR (?elevateJoin=<org>), or a printed claim card (?elevateJoin=<org>&claim=1&member=GC-48213).
//
// Key distinction:
//   FOLLOW — Public updates, streams, and announcements (no approval needed).
//   CLAIM  — The org already has me on file (pre-provisioned seat): claim with Member ID + last name, or email.
//   JOIN   — Membership Request + Church/Org Member Onboarding for real people who belong to the org.
//            Doubles as onboarding onto the org/church membership AND creates/links their Plajah account.
//            Always requires approval from the organization's leadership.
//   CREATE — Set up a ministry / organization (staff): hands off to the Elevate setup wizard.
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ArrowRight, Bell, Check, Church, Clock, HeartHandshake, KeyRound, Loader2, LogIn, Search, ShieldCheck, Sparkles, UserCheck, UserPlus, X } from 'lucide-react';
import type { Organization, OrgMembership } from '../../types';
import { auth, fetchUserProfile, updateUserProfile } from '../../services/backendService';
import { fetchPublicOrganizations, requestOrgMembership, fetchUserMemberships } from '../../services/organizationService';
import { followOrg, unfollowOrg, isFollowing } from '../../services/orgFollowService';
import { isElevateOrg } from '../../services/elevateTemplates';
import { lookupProvisionedSeat, claimProvisionedSeat, resolveJoinTarget, type SeatLookup } from '../../services/elevateAccounts';
import AuthExperience from '../AuthExperience';

export type GatewayMode = 'home' | 'claim' | 'join' | 'create';
export interface ElevateGatewayProps {
  /** Org id / @handle from a join link or profile card; the claim + join paths are pre-targeted at it. */
  orgKey?: string;
  initialMode?: GatewayMode;
  initialMemberNumber?: string;
  signedIn: boolean;
  onClose: () => void;
  /** Open the org (after a claim / join / follow). */
  onOpenOrg: (orgId: string) => void;
  /** Start the Elevate setup wizard. */
  onCreate: () => void;
}

export const ELEVATE_PURPLE = '#8B5CF6';
const field = 'w-full bg-white/[0.06] border border-white/12 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#8B5CF6]/70 transition-colors';
const primary = 'w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6B0099] to-[#8B5CF6] text-white text-[11px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(139,92,246,0.35)] hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2';
const ghost = 'px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center gap-1.5';

const ElevateGateway: React.FC<ElevateGatewayProps> = ({ orgKey, initialMode, initialMemberNumber, signedIn, onClose, onOpenOrg, onCreate }) => {
  const [mode, setMode] = useState<GatewayMode>(initialMode || (orgKey ? 'claim' : 'home'));
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgLoading, setOrgLoading] = useState(!!orgKey);
  const [authMode, setAuthMode] = useState<'REGISTER' | 'SIGN_IN' | null>(null);

  // Follow state (distinct from Membership)
  const [followingOrg, setFollowingOrg] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // Claim state (ID-free by default: users can claim with Name + Email without knowing Member ID or Employment #)
  const [memberNumber, setMemberNumber] = useState(initialMemberNumber || '');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [via, setVia] = useState<'name_email' | 'member'>(initialMemberNumber ? 'member' : 'name_email');
  const [lookup, setLookup] = useState<SeatLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [claimed, setClaimed] = useState<{ orgId: string; orgName: string; roleLabel: string; memberNumber?: string; employeeNumber?: string } | null>(null);

  // Join / Membership Onboarding state
  const [q, setQ] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [joined, setJoined] = useState<{ orgId: string; orgName: string; pending: boolean } | null>(null);
  const [myMemberships, setMyMemberships] = useState<Map<string, OrgMembership>>(new Map());

  // Onboarding form fields (doubles as church/org ChMS onboarding + private vault + account setup)
  const [firstName, setFirstName] = useState('');
  const [onboardingLastName, setOnboardingLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressRegion, setAddressRegion] = useState('');
  const [addressPostal, setAddressPostal] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [maritalStatus, setMaritalStatus] = useState<'SINGLE' | 'MARRIED' | 'WIDOWED' | 'DIVORCED' | ''>('');
  const [requestedRoleKey, setRequestedRoleKey] = useState('congregation_member');
  const [familyMembers, setFamilyMembers] = useState<Array<{ name: string; relation: 'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'OTHER' }>>([]);
  const [familyDraftName, setFamilyDraftName] = useState('');
  const [familyDraftRelation, setFamilyDraftRelation] = useState<'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'OTHER'>('SPOUSE');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [onboardingMemberId, setOnboardingMemberId] = useState(initialMemberNumber || '');
  const [onboardingEmpId, setOnboardingEmpId] = useState('');
  const [isExistingCongregant, setIsExistingCongregant] = useState(true);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [onboardingNote, setOnboardingNote] = useState('');

  useEffect(() => {
    if (!orgKey) return;
    let live = true;
    resolveJoinTarget(orgKey)
      .then(o => {
        if (live) {
          setOrg(o);
          if (!o) setErr('We could not find that organization. Check the link with whoever shared it.');
        }
      })
      .finally(() => live && setOrgLoading(false));
    return () => { live = false; };
  }, [orgKey]);

  useEffect(() => {
    if (mode !== 'join' || orgs.length) return;
    setOrgsLoading(true);
    Promise.all((['CHURCH', 'RELIGIOUS', 'NONPROFIT', 'CULTURAL', 'BRAND', 'BUSINESS', 'OTHER'] as const).map(t => fetchPublicOrganizations(t as any).catch(() => [] as Organization[])))
      .then(lists => {
        const seen = new Set<string>();
        const merged: Organization[] = [];
        for (const item of lists.flat()) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        setOrgs(merged.sort((a, b) => (Number(isElevateOrg(b.orgType)) - Number(isElevateOrg(a.orgType))) || ((b.followerCount || 0) - (a.followerCount || 0))));
      })
      .finally(() => setOrgsLoading(false));
  }, [mode, orgs.length]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!signedIn || !u) return;
    setAuthMode(null);
    fetchUserMemberships(u.uid)
      .then(ms => {
        const mMap = new Map<string, OrgMembership>();
        ms.forEach(m => mMap.set(m.orgId, m));
        setMyMemberships(mMap);
      })
      .catch(() => {});
    fetchUserProfile(u.uid)
      .then(p => {
        const em = (p?.email || u.email || '').toLowerCase();
        if (em && !email) setEmail(em);
        const dn = (p?.displayName || u.displayName || '').trim();
        if (dn) {
          const parts = dn.split(/\s+/);
          if (!firstName) setFirstName(parts[0] || '');
          if (!onboardingLastName) setOnboardingLastName(parts.slice(1).join(' ') || '');
          if (!lastName && parts.length > 1) setLastName(parts.slice(1).join(' '));
        }
      })
      .catch(() => {});
  }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!org?.id || !signedIn) {
      setFollowingOrg(false);
      return;
    }
    isFollowing(org.id).then(setFollowingOrg).catch(() => setFollowingOrg(false));
  }, [org?.id, signedIn]);

  const target = org;
  const existingMembership = target ? myMemberships.get(target.id) : undefined;

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? orgs.filter(o => `${o.name} ${o.tagline || ''} ${o.denomination || ''} ${o.location?.city || ''} ${(o.tags || []).join(' ')}`.toLowerCase().includes(needle))
      : orgs;
    return list.slice(0, 12);
  }, [orgs, q]);

  const handleToggleFollow = async () => {
    if (!target) return;
    if (!signedIn) {
      setAuthMode('REGISTER');
      return;
    }
    setFollowBusy(true);
    try {
      if (followingOrg) {
        await unfollowOrg(target.id);
        setFollowingOrg(false);
      } else {
        await followOrg(target.id);
        setFollowingOrg(true);
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not update follow status.');
    }
    setFollowBusy(false);
  };

  const claimInput = () => ({
    org: target?.handle || target?.id || '',
    firstName: firstName.trim() || undefined,
    lastName: (lastName.trim() || onboardingLastName.trim()) || undefined,
    email: email.trim() || undefined,
    memberNumber: memberNumber.trim() ? memberNumber.trim().toUpperCase() : undefined,
    employeeNumber: employeeNumber.trim() ? employeeNumber.trim().toUpperCase() : undefined,
  });

  const doLookup = async () => {
    if (!target) return;
    setBusy(true); setErr(''); setLookup(null);
    try {
      setLookup(await lookupProvisionedSeat(claimInput()));
    } catch (e: any) {
      setErr(e?.message || 'Could not look that up.');
    }
    setBusy(false);
  };

  const doClaim = async () => {
    setBusy(true); setErr('');
    try {
      const res = await claimProvisionedSeat(claimInput());
      if (target?.id) followOrg(target.id).catch(() => {});
      setClaimed(res);
    } catch (e: any) {
      setErr(e?.message || 'Could not claim.');
    }
    setBusy(false);
  };

  const toggleMinistry = (ministryId: string) => {
    setSelectedMinistries(prev =>
      prev.includes(ministryId) ? prev.filter(id => id !== ministryId) : [...prev, ministryId],
    );
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill],
    );
  };

  const addFamilyMember = () => {
    if (!familyDraftName.trim()) return;
    setFamilyMembers(prev => [...prev, { name: familyDraftName.trim(), relation: familyDraftRelation }]);
    setFamilyDraftName('');
  };

  const doRequestMembership = async (o: Organization) => {
    const fName = firstName.trim();
    const lName = onboardingLastName.trim() || lastName.trim();
    if (!fName || !lName) {
      setErr('Please enter your first and last name for your membership record.');
      return;
    }
    setBusy(true); setErr('');
    try {
      // 1. Check if a pre-provisioned seat is already waiting for them by ID, email, or name!
      try {
        const seat = await lookupProvisionedSeat({
          org: o.handle || o.id,
          firstName: fName,
          lastName: lName,
          email: email.trim() || undefined,
          memberNumber: (onboardingMemberId.trim() || memberNumber.trim()).toUpperCase() || undefined,
          employeeNumber: (onboardingEmpId.trim() || employeeNumber.trim()).toUpperCase() || undefined,
        });
        if (seat?.found && !seat.alreadyClaimed) {
          const c = await claimProvisionedSeat({
            org: o.handle || o.id,
            firstName: fName,
            lastName: lName,
            email: email.trim() || undefined,
            memberNumber: (onboardingMemberId.trim() || memberNumber.trim()).toUpperCase() || undefined,
            employeeNumber: (onboardingEmpId.trim() || employeeNumber.trim()).toUpperCase() || undefined,
          });
          followOrg(o.id).catch(() => {});
          setClaimed(c);
          setBusy(false);
          return;
        }
      } catch { /* fall through to PENDING membership onboarding request */ }

      // 2. Ensure the user's Plajah profile carries their real name if it was blank/default
      const u = auth.currentUser;
      const fullName = `${fName} ${lName}`.trim();
      if (u && (!u.displayName || u.displayName === 'Member' || u.displayName === 'User')) {
        updateUserProfile(u.uid, { displayName: fullName }).catch(() => {});
      }

      const hasAddress = !!(addressLine1.trim() || addressCity.trim() || addressRegion.trim() || addressPostal.trim());

      // 3. Submit PENDING membership request + private ChMS onboarding vault (Member ID & Employment # auto-populate on backend after approval)
      const m = await requestOrgMembership(o.id, {
        firstName: fName,
        lastName: lName,
        preferredName: preferredName.trim() || undefined,
        email: email.trim() || u?.email || undefined,
        phone: phone.trim() || undefined,
        address: hasAddress
          ? {
              line1: addressLine1.trim() || undefined,
              city: addressCity.trim() || undefined,
              region: addressRegion.trim() || undefined,
              postal: addressPostal.trim() || undefined,
            }
          : undefined,
        birthDate: birthDate.trim() || undefined,
        maritalStatus: maritalStatus || undefined,
        familyMembers: familyMembers.length ? familyMembers : undefined,
        skills: selectedSkills.length ? selectedSkills : undefined,
        requestedRoleKey: requestedRoleKey || 'congregation_member',
        memberNumber: (onboardingMemberId.trim() || memberNumber.trim()).toUpperCase() || undefined,
        employeeNumber: (onboardingEmpId.trim() || employeeNumber.trim()).toUpperCase() || undefined,
        ministryIds: selectedMinistries.length ? selectedMinistries : undefined,
        isExistingCongregant,
        directoryVisible: false,
        note: onboardingNote.trim() || undefined,
      });
      if (!m) throw new Error('Sign in first.');

      // Also follow the org for public updates while membership approval is pending
      followOrg(o.id).catch(() => {});
      setFollowingOrg(true);

      setJoined({ orgId: o.id, orgName: o.name, pending: m.status === 'PENDING' });
    } catch (e: any) {
      setErr(e?.message || 'Could not submit membership request.');
    }
    setBusy(false);
  };

  const needSignIn = (
    <div className="space-y-3 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck size={18} className="text-[#C4B5FD] shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-white">Step 1 · Create or Sign In to Your Plajah Account</p>
          <p className="text-xs text-white/55 mt-1 leading-relaxed">
            {mode === 'claim'
              ? `Create your free Plajah account (or sign in) to claim your existing ${target?.name || 'organization'} membership seat.`
              : `Your membership request doubles as both your ${target?.name || 'organization'} member onboarding and creating your Plajah account.`}
          </p>
        </div>
      </div>
      <button onClick={() => setAuthMode('REGISTER')} className={primary}><UserPlus size={15} /> Create my Plajah account &amp; continue</button>
      <button onClick={() => setAuthMode('SIGN_IN')} className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/10 flex items-center justify-center gap-2"><LogIn size={14} /> I already have a Plajah account</button>
    </div>
  );

  const Head: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#C4B5FD] flex items-center gap-2"><HeartHandshake size={13} /> Plajah Elevate · Organizations Making a Difference</p>
      <h2 className="text-2xl font-black text-white mt-1 leading-tight">{title}</h2>
      {sub && <p className="text-sm text-white/50 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[320] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-lg bg-[#0b0712] border border-[#8B5CF6]/30 rounded-[2rem] p-6 sm:p-8 text-white shadow-[0_30px_80px_rgba(107,0,153,0.35)] my-auto max-h-[92vh] overflow-y-auto">
        <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-br from-[#8B5CF6]/25 via-transparent to-[#6B0099]/20 pointer-events-none" />
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white z-10" aria-label="Close"><X size={18} /></button>
        <div className="relative">
          {orgLoading ? <div className="py-14 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div> : (
            <>
              {/* When targeted at a specific Org, show the Follow vs Membership banner */}
              {target && (mode === 'claim' || mode === 'join') && !claimed && !joined && (
                <div className="mb-5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                  <div className="flex items-center gap-3">
                    {target.logoUrl ? (
                      <img src={target.logoUrl} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white/10" />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 grid place-items-center shrink-0">
                        <HeartHandshake size={18} className="text-[#C4B5FD]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-white truncate">{target.name}</p>
                      <p className="text-[10px] text-white/45 truncate">
                        Following is for public updates · Membership is for staff, volunteers &amp; participants
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleFollow}
                      disabled={followBusy}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 flex items-center gap-1 transition-all ${
                        followingOrg
                          ? 'bg-white/10 text-white border border-white/20'
                          : 'bg-small-orange text-black hover:brightness-110'
                      }`}
                    >
                      <Bell size={10} />
                      {followingOrg ? 'Following' : 'Follow Org'}
                    </button>
                  </div>

                  {/* Mode tabs: Claim Existing Membership vs Request Membership (Onboarding) */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
                    <button
                      type="button"
                      onClick={() => { setMode('claim'); setErr(''); }}
                      className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                        mode === 'claim' ? 'bg-[#8B5CF6] text-white shadow' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      <KeyRound size={12} /> Claim Account
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMode('join'); setErr(''); }}
                      className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                        mode === 'join' ? 'bg-[#8B5CF6] text-white shadow' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      <UserCheck size={12} /> Join &amp; Onboard
                    </button>
                  </div>
                </div>
              )}

              {/* ── HOME ── */}
              {mode === 'home' && (
                <>
                  <Head title="Welcome to Plajah Elevate" sub="For churches, religious communities, charities, cultural institutions & nonprofits — where staff, leaders, volunteers & participants making a difference sign in." />
                  <div className="space-y-2.5">
                    <button onClick={() => setMode('claim')} className="w-full text-left p-4 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/25 transition-all flex items-center gap-4">
                      <KeyRound className="text-[#C4B5FD] shrink-0" size={20} />
                      <span className="flex-1"><span className="block text-sm font-black">Claim my organization account</span><span className="block text-[11px] text-white/50">Already on the roster as staff, member, or participant? Claim your pre-set account with your ID or email.</span></span>
                      <ArrowRight size={16} className="text-white/40" />
                    </button>
                    <button onClick={() => setMode('join')} className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-4">
                      <UserCheck className="text-white/60 shrink-0" size={20} />
                      <span className="flex-1"><span className="block text-sm font-black">Join as staff, volunteer or participant</span><span className="block text-[11px] text-white/50">Find your church, charity, cultural institution, or nonprofit and submit your onboarding for leadership approval.</span></span>
                      <ArrowRight size={16} className="text-white/40" />
                    </button>
                    <button onClick={() => setMode('create')} className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-4">
                      <Sparkles className="text-white/60 shrink-0" size={20} />
                      <span className="flex-1"><span className="block text-sm font-black">Set up an organization</span><span className="block text-[11px] text-white/50">Staff &amp; leadership: launch your nonprofit, charity, cultural institution, church, or community hub.</span></span>
                      <ArrowRight size={16} className="text-white/40" />
                    </button>
                  </div>
                  {!signedIn && <p className="text-[10px] text-white/30 mt-4 text-center">You'll sign in or create a free Plajah account along the way.</p>}
                </>
              )}

              {/* ── CLAIM ── */}
              {mode === 'claim' && (
                <>
                  <Head
                    title={target ? `Claim your ${target.name} membership` : 'Claim your organization membership'}
                    sub={target ? 'Don’t know your Member ID or Employment Number? No problem — claim with your name & email, and your ID numbers auto-populate on the backend upon approval.' : 'Open the link or QR code your organization shared, or find it below.'}
                  />
                  {claimed ? (
                    <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-[#8B5CF6]/25 grid place-items-center mx-auto"><Check className="text-[#C4B5FD]" /></div>
                      <h3 className="text-xl font-black">Welcome to {claimed.orgName}</h3>
                      <p className="text-sm text-white/55">Your membership is claimed and active as <span className="text-white font-bold">{claimed.roleLabel}</span>. Your department feeds, chat rooms and profile are ready.</p>
                      {(claimed.memberNumber || claimed.employeeNumber) && (
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {claimed.memberNumber && (
                            <span className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/15 text-xs font-mono text-white">
                              Member ID: <strong>{claimed.memberNumber}</strong>
                            </span>
                          )}
                          {claimed.employeeNumber && (
                            <span className="px-3 py-1 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-xs font-mono text-[#E0CEFF]">
                              Employment #: <strong>{claimed.employeeNumber}</strong>
                            </span>
                          )}
                        </div>
                      )}
                      <button onClick={() => onOpenOrg(claimed.orgId)} className={primary}>Open {claimed.orgName} <ArrowRight size={14} /></button>
                    </div>
                  ) : joined ? (
                    <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-emerald-500/20 grid place-items-center mx-auto"><Check className="text-emerald-300" /></div>
                      <h3 className="text-xl font-black">Membership Claim Sent for Approval</h3>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Your claim has been submitted to <span className="text-white font-bold">{joined.orgName}</span>. Your <strong>Member ID</strong> and <strong>Employment Number</strong> will auto-populate on your account as soon as leadership approves your seat.
                      </p>
                      <button onClick={() => onOpenOrg(joined.orgId)} className={primary}>Open {joined.orgName} <ArrowRight size={14} /></button>
                    </div>
                  ) : !target ? (
                    <div className="space-y-3">
                      <button onClick={() => setMode('join')} className={primary}><Search size={14} /> Find my organization</button>
                      <button onClick={() => setMode('home')} className={ghost}>Back</button>
                    </div>
                  ) : !signedIn ? needSignIn : (
                    <div className="space-y-3">
                      <div className="p-3 rounded-2xl bg-emerald-500/[0.07] border border-emerald-400/25 flex items-start gap-2.5">
                        <ShieldCheck size={15} className="text-emerald-300 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-white/75 leading-relaxed">
                          <strong className="text-emerald-300">No ID Required Upfront:</strong> Claim with your Name &amp; Email below. If you don't know your Member ID or Employment Number, leave them blank — they automatically populate on the backend after approval.
                        </p>
                      </div>

                      <div className="flex gap-1.5">
                        {([['name_email', 'Name & Email (No ID Needed)'], ['member', 'I Know My Member / Emp ID']] as const).map(([k, l]) => (
                          <button key={k} onClick={() => { setVia(k); setLookup(null); setErr(''); }} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${via === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{l}</button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input className={field} placeholder="First name *" value={firstName} onChange={e => setFirstName(e.target.value)} />
                        <input className={field} placeholder="Last name *" value={lastName} onChange={e => { setLastName(e.target.value); setOnboardingLastName(e.target.value); }} />
                      </div>

                      <div>
                        <input className={field} type="email" placeholder="Your email address *" value={email} onChange={e => setEmail(e.target.value)} />
                      </div>

                      {via === 'member' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input className={field} placeholder="Member ID (optional, e.g. GC-48213)" value={memberNumber} onChange={e => setMemberNumber(e.target.value.toUpperCase())} />
                          <input className={field} placeholder="Employment # (optional, e.g. GC-EMP-1042)" value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value.toUpperCase())} />
                        </div>
                      )}

                      {lookup && !lookup.found && (
                        <div className="p-3.5 rounded-2xl bg-[#8B5CF6]/12 border border-[#8B5CF6]/35 space-y-2.5">
                          <p className="text-xs text-white/85 leading-relaxed">
                            We didn't find a pre-created roster seat under that exact entry yet — you can submit your claim right now and your <strong>Member ID &amp; Employment #</strong> will auto-populate on the backend once approved:
                          </p>
                          <button
                            type="button"
                            onClick={() => doRequestMembership(target)}
                            disabled={busy}
                            className={primary}
                          >
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={14} />}
                            Claim &amp; Submit for Approval (Auto-Assign IDs)
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMode('join'); setLookup(null); setErr(''); }}
                            className="block w-full text-center text-[10px] font-black uppercase tracking-widest text-[#C4B5FD] hover:text-white underline"
                          >
                            Or complete full New Member Church Onboarding →
                          </button>
                        </div>
                      )}
                      {lookup?.found && (
                        <div className="p-4 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#C4B5FD]">We found your membership record</p>
                          <p className="text-sm font-bold">{lookup.maskedName} · {lookup.roleLabel}</p>
                          {!!lookup.departments?.length && <p className="text-[11px] text-white/50">{lookup.departments.join(' · ')}</p>}
                          <p className="text-[10px] text-emerald-300 pt-1">Member ID &amp; Employment # will auto-populate on your account.</p>
                        </div>
                      )}
                      {err && <p className="text-xs text-red-300">{err}</p>}
                      {lookup?.found ? (
                        <button onClick={doClaim} disabled={busy} className={primary}>
                          {busy && <Loader2 size={13} className="animate-spin" />} Yes, that's me — claim my membership
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={doLookup}
                            disabled={busy || (!email.trim() && !lastName.trim() && !memberNumber.trim() && !employeeNumber.trim())}
                            className={primary}
                          >
                            {busy && <Loader2 size={13} className="animate-spin" />} Find my membership record
                          </button>
                          {firstName.trim() && lastName.trim() && (
                            <button
                              type="button"
                              onClick={() => doRequestMembership(target)}
                              disabled={busy}
                              className="w-full py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-[10px] font-black uppercase tracking-widest text-[#E0CEFF] flex items-center justify-center gap-1.5"
                            >
                              <UserCheck size={13} /> Claim Without ID (Auto-Assigns on Approval)
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-1">
                        <button onClick={() => { setMode('join'); setErr(''); }} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">New member? Complete full Church &amp; Org Onboarding →</button>
                        {!orgKey && <button onClick={() => setMode('home')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Back</button>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── JOIN / REQUEST MEMBERSHIP & PRIVATE CHURCH ONBOARDING ── */}
              {mode === 'join' && (
                <>
                  <Head
                    title={target ? `${target.name} · Member & Staff Onboarding` : 'Find your organization'}
                    sub={target
                      ? 'Populates your private church/organization record for leadership approval. Your phone number, email, and home address stay strictly private and are never exposed on the public platform.'
                      : 'Search churches, religious communities, charities, cultural institutions & nonprofits on Plajah.'}
                  />
                  {joined ? (
                    <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-emerald-500/20 grid place-items-center mx-auto"><Check className="text-emerald-300" /></div>
                      <h3 className="text-xl font-black">Private Onboarding Submitted</h3>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Your onboarding record is sealed in the private sanctuary vault for <span className="text-white font-bold">{joined.orgName}</span> leadership approval. Your <strong>Member ID</strong> and <strong>Employment Number</strong> will auto-populate on the backend once approved.
                      </p>
                      <button onClick={() => onOpenOrg(joined.orgId)} className={primary}>Open {joined.orgName} <ArrowRight size={14} /></button>
                    </div>
                  ) : !target ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                        <input autoFocus className={field + ' pl-11'} placeholder="Search church, charity, cultural institution, nonprofit, city…" value={q} onChange={e => setQ(e.target.value)} />
                      </div>
                      <div className="max-h-72 overflow-y-auto space-y-1.5">
                        {orgsLoading && <p className="text-xs text-white/40 flex items-center gap-2 py-4 justify-center"><Loader2 size={13} className="animate-spin" /> Loading…</p>}
                        {!orgsLoading && results.map(o => {
                          const mem = myMemberships.get(o.id);
                          return (
                            <button key={o.id} onClick={() => setOrg(o)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left">
                              <span className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 shrink-0 grid place-items-center">{o.logoUrl ? <img src={o.logoUrl} alt="" className="w-full h-full object-cover" /> : <HeartHandshake size={16} className="text-white/40" />}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold truncate">{o.name}</span>
                                <span className="block text-[11px] text-white/45 truncate">{[o.denomination || o.orgKindLabel || o.orgType, o.location?.city].filter(Boolean).join(' · ') || o.tagline || ''}</span>
                              </span>
                              {mem?.status === 'ACTIVE' && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Member</span>}
                              {mem?.status === 'PENDING' && <span className="text-[9px] font-black uppercase tracking-widest text-amber-300">Pending</span>}
                            </button>
                          );
                        })}
                        {!orgsLoading && !results.length && <p className="text-xs text-white/40 py-4 text-center">Nothing matches yet. Ask your organization for its join link — or set it up below.</p>}
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <button onClick={() => setMode('create')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Can't find it? Set it up</button>
                        <button onClick={() => setMode('home')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Back</button>
                      </div>
                    </div>
                  ) : !signedIn ? needSignIn : existingMembership?.status === 'ACTIVE' ? (
                    <div className="space-y-3 text-center py-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 grid place-items-center mx-auto"><Check className="text-emerald-300" /></div>
                      <p className="text-sm font-bold text-white">You are already an approved member of {target.name}.</p>
                      <button onClick={() => onOpenOrg(target.id)} className={primary}>Open {target.name} <ArrowRight size={14} /></button>
                    </div>
                  ) : existingMembership?.status === 'PENDING' ? (
                    <div className="space-y-3 text-center py-3">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 grid place-items-center mx-auto"><Clock className="text-amber-300" /></div>
                      <p className="text-sm font-bold text-white">Your onboarding request is pending approval</p>
                      <p className="text-xs text-white/55">Leadership at {target.name} is reviewing your onboarding request. Your Member ID &amp; Employment # will auto-populate upon approval.</p>
                      <button onClick={() => onOpenOrg(target.id)} className={primary}>Visit {target.name} Page <ArrowRight size={14} /></button>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {/* Strict Sanctuary Privacy Guarantee Banner */}
                      <div className="p-3 rounded-2xl bg-emerald-500/[0.08] border border-emerald-400/25 flex items-start gap-2.5">
                        <ShieldCheck size={16} className="text-emerald-300 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-white/75 leading-relaxed">
                          <span className="font-black uppercase tracking-wider text-emerald-300 block">Strict Sanctuary Privacy Protection</span>
                          Your phone number, email address, home address, and family details are sealed inside {target.name}’s private vault and <strong>never exposed publicly</strong> on the platform.
                        </div>
                      </div>

                      {/* Name & Connection Role */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">First Name *</label>
                          <input className={field} placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">Last Name *</label>
                          <input className={field} placeholder="Last name" value={onboardingLastName} onChange={e => { setOnboardingLastName(e.target.value); setLastName(e.target.value); }} />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">Preferred Name</label>
                          <input className={field} placeholder="Optional" value={preferredName} onChange={e => setPreferredName(e.target.value)} />
                        </div>
                      </div>

                      {/* Role / Connection Type */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">Joining As</label>
                        <select
                          value={requestedRoleKey}
                          onChange={e => setRequestedRoleKey(e.target.value)}
                          className={field + ' bg-[#120b1d]'}
                        >
                          <option value="congregation_member" className="bg-[#120b1d]">Congregation / Organization Member</option>
                          <option value="volunteer" className="bg-[#120b1d]">Volunteer / Greeter / Servant Team</option>
                          <option value="ministry_member" className="bg-[#120b1d]">Ministry / Choir / Program Participant</option>
                          <option value="staff" className="bg-[#120b1d]">Organization Staff / Employee</option>
                          <option value="deacon" className="bg-[#120b1d]">Deacon / Elder / Trustee / Board</option>
                        </select>
                      </div>

                      {/* Private Email & Phone */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-emerald-300/80 mb-1">🔒 Private Email (Never Public)</label>
                          <input className={field} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-emerald-300/80 mb-1">🔒 Private Phone (Pastoral/Care Only)</label>
                          <input className={field} type="tel" placeholder="(555) 123-4567" value={phone} onChange={e => setPhone(e.target.value)} />
                        </div>
                      </div>

                      {/* Private Home Address (Populates ChMS Household & Tax Statements — Never Public) */}
                      <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-black uppercase tracking-widest text-emerald-300/85">
                            🔒 Private Home Address (For Church Household &amp; Tax Receipts · Never Public)
                          </label>
                        </div>
                        <input
                          className={field + ' !py-2 !text-xs'}
                          placeholder="Street address (e.g. 742 Sanctuary Way, Apt 4B)"
                          value={addressLine1}
                          onChange={e => setAddressLine1(e.target.value)}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            className={field + ' !py-2 !text-xs'}
                            placeholder="City"
                            value={addressCity}
                            onChange={e => setAddressCity(e.target.value)}
                          />
                          <input
                            className={field + ' !py-2 !text-xs'}
                            placeholder="State / Region"
                            value={addressRegion}
                            onChange={e => setAddressRegion(e.target.value)}
                          />
                          <input
                            className={field + ' !py-2 !text-xs'}
                            placeholder="ZIP / Postal"
                            value={addressPostal}
                            onChange={e => setAddressPostal(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Household / Family Members */}
                      <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                        <label className="block text-[9px] font-black uppercase tracking-widest text-white/55">
                          🔒 Household &amp; Family Members (Optional · Private ChMS Household Record)
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            className={field + ' !py-2 !text-xs flex-1'}
                            placeholder="Family member full name"
                            value={familyDraftName}
                            onChange={e => setFamilyDraftName(e.target.value)}
                          />
                          <select
                            value={familyDraftRelation}
                            onChange={e => setFamilyDraftRelation(e.target.value as any)}
                            className="bg-black/40 border border-white/15 rounded-xl px-2.5 text-xs text-white"
                          >
                            <option value="SPOUSE" className="bg-[#120b1d]">Spouse</option>
                            <option value="CHILD" className="bg-[#120b1d]">Child</option>
                            <option value="PARENT" className="bg-[#120b1d]">Parent</option>
                            <option value="SIBLING" className="bg-[#120b1d]">Sibling</option>
                            <option value="OTHER" className="bg-[#120b1d]">Other</option>
                          </select>
                          <button
                            type="button"
                            onClick={addFamilyMember}
                            className="px-3 py-2 rounded-xl bg-[#8B5CF6]/30 border border-[#8B5CF6]/50 text-xs font-black text-white hover:bg-[#8B5CF6]/50"
                          >
                            + Add
                          </button>
                        </div>
                        {familyMembers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {familyMembers.map((fm, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[10px] font-bold text-white">
                                {fm.name} <span className="text-[#C4B5FD]">({fm.relation})</span>
                                <button type="button" onClick={() => setFamilyMembers(prev => prev.filter((_, i) => i !== idx))} className="text-white/50 hover:text-white">×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Optional Birthdate & Marital Status */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">🔒 Birthdate (Optional)</label>
                          <input className={field + ' !py-2 !text-xs'} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">🔒 Marital Status (Optional)</label>
                          <select
                            value={maritalStatus}
                            onChange={e => setMaritalStatus(e.target.value as any)}
                            className={field + ' !py-2 !text-xs bg-[#120b1d]'}
                          >
                            <option value="" className="bg-[#120b1d]">Prefer not to say</option>
                            <option value="SINGLE" className="bg-[#120b1d]">Single</option>
                            <option value="MARRIED" className="bg-[#120b1d]">Married</option>
                            <option value="WIDOWED" className="bg-[#120b1d]">Widowed</option>
                            <option value="DIVORCED" className="bg-[#120b1d]">Divorced</option>
                          </select>
                        </div>
                      </div>

                      {/* Optional Member ID / Employment Number (Auto-populates after approval if blank) */}
                      <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isExistingCongregant}
                            onChange={e => setIsExistingCongregant(e.target.checked)}
                            className="accent-[#8B5CF6]"
                          />
                          <span className="text-xs font-bold text-white/85">I am already a member, volunteer, or staff at {target.name}</span>
                        </label>
                        <p className="text-[10px] text-white/45">
                          Don’t know your Member ID or Employment Number? Leave blank — both auto-populate on the backend after approval.
                        </p>
                        {isExistingCongregant && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              className={field + ' !py-2 !text-xs'}
                              placeholder="Member ID if known (optional — auto-generated)"
                              value={onboardingMemberId}
                              onChange={e => setOnboardingMemberId(e.target.value.toUpperCase())}
                            />
                            <input
                              className={field + ' !py-2 !text-xs'}
                              placeholder="Employment # if staff (optional — auto-generated)"
                              value={onboardingEmpId}
                              onChange={e => setOnboardingEmpId(e.target.value.toUpperCase())}
                            />
                          </div>
                        )}
                      </div>

                      {/* Spiritual Gifts & Serving Skills */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1.5">Gifts, Skills &amp; Areas of Service (Optional)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {['Worship & Music', 'Hospitality & Ushers', 'Youth & NextGen', 'Media & Broadcast', 'Prayer & Care', 'Teaching & Study', 'Outreach & Mercy', 'Finance & Admin'].map(skill => {
                            const active = selectedSkills.includes(skill);
                            return (
                              <button
                                key={skill}
                                type="button"
                                onClick={() => toggleSkill(skill)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                  active
                                    ? 'bg-[#8B5CF6]/30 border-[#8B5CF6] text-white'
                                    : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
                                }`}
                              >
                                {skill}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {!!target.ministries?.filter(m => !m.isInternal).length && (
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1.5">Programs, Departments &amp; Ministries You Belong To (Optional)</label>
                          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                            {target.ministries.filter(m => !m.isInternal).map(m => {
                              const active = selectedMinistries.includes(m.id);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => toggleMinistry(m.id)}
                                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                    active
                                      ? 'bg-[#8B5CF6]/30 border-[#8B5CF6] text-white'
                                      : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
                                  }`}
                                >
                                  {m.iconEmoji ? `${m.iconEmoji} ` : ''}{m.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">Pastoral / Leadership Note (Optional · Private)</label>
                        <textarea
                          rows={2}
                          className={field + ' resize-none !py-2.5 !text-xs'}
                          placeholder={`Anything leadership at ${target.name} should know?`}
                          value={onboardingNote}
                          onChange={e => setOnboardingNote(e.target.value)}
                        />
                      </div>

                      {err && <p className="text-xs text-red-300">{err}</p>}

                      <button onClick={() => doRequestMembership(target)} disabled={busy} className={primary}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                        Submit Private Onboarding for Approval
                      </button>

                      <div className="flex justify-between items-center pt-1">
                        <button onClick={() => { setMode('claim'); setErr(''); }} className="text-[10px] font-black uppercase tracking-widest text-[#C4B5FD] hover:text-white flex items-center gap-1">
                          <KeyRound size={11} /> Claim existing seat instead
                        </button>
                        {!orgKey && <button onClick={() => setOrg(null)} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Search again</button>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── CREATE ── */}
              {mode === 'create' && (
                <>
                  <Head title="Set up your organization" sub="For directors, pastors, founders, and staff of nonprofits, charities, cultural institutions, and churches. Takes about two minutes." />
                  <ul className="text-sm text-white/60 space-y-1.5 mb-5">
                    {['Departments, programs & ministries tailored to your type of organization', 'Chat configured: announcements, general, and spaces per department or program', 'Social feeds for your community — public or internal per program', 'Import staff, volunteers, members & participants from your roster or CRM — accounts pre-provisioned', 'Giving, fundraising, events, media, store, and role permissions'].map(t => <li key={t} className="flex items-start gap-2"><Check size={14} className="text-[#C4B5FD] mt-0.5 shrink-0" /> {t}</li>)}
                  </ul>
                  {!signedIn ? needSignIn : <button onClick={onCreate} className={primary}><Sparkles size={14} /> Start setup</button>}
                  <button onClick={() => setMode('home')} className={`${ghost} mt-3`}>Back</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <AnimatePresence>
        {authMode && <AuthExperience initialMode={authMode} onClose={() => setAuthMode(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default ElevateGateway;
