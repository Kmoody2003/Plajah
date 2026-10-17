// ElevateGateway — the purple door into Plajah Elevate (churches, ministries, nonprofits, cultural orgs).
//
// Opened from the landing page ("Plajah Elevate" card), an org's join link / QR (?elevateJoin=<org>), or a
// printed claim card (?elevateJoin=<org>&claim=1&member=GC-48213). Three paths:
//   CLAIM  — the org already pre-provisioned a Plajah account for me: member ID + last name, or my email.
//   JOIN   — find a ministry and join / request to join as a new member (or claim once I've found it).
//   CREATE — set up a ministry / organization (staff): hands off to the Elevate setup wizard.
// Signing in / creating a Plajah account is step zero for every path; the modal keeps its state across it.
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ArrowRight, Check, Church, KeyRound, Loader2, LogIn, Search, Sparkles, UserPlus, X } from 'lucide-react';
import type { Organization } from '../../types';
import { auth, fetchUserProfile } from '../../services/backendService';
import { fetchPublicOrganizations, joinOrganization, fetchUserMemberships } from '../../services/organizationService';
import { isElevateOrg } from '../../services/elevateTemplates';
import { lookupProvisionedSeat, claimProvisionedSeat, resolveJoinTarget, type SeatLookup } from '../../services/elevateAccounts';
import AuthExperience from '../AuthExperience';

export type GatewayMode = 'home' | 'claim' | 'join' | 'create';
export interface ElevateGatewayProps {
  /** Org id / @handle from a join link; the claim + join paths are pre-targeted at it. */
  orgKey?: string;
  initialMode?: GatewayMode;
  initialMemberNumber?: string;
  signedIn: boolean;
  onClose: () => void;
  /** Open the org (after a claim / join). */
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
  // claim
  const [memberNumber, setMemberNumber] = useState(initialMemberNumber || '');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [via, setVia] = useState<'member' | 'email'>('member');
  const [lookup, setLookup] = useState<SeatLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [claimed, setClaimed] = useState<{ orgId: string; orgName: string; roleLabel: string } | null>(null);
  // join
  const [q, setQ] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [joined, setJoined] = useState<{ orgId: string; orgName: string; pending: boolean } | null>(null);
  const [myOrgIds, setMyOrgIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!orgKey) return;
    let live = true;
    resolveJoinTarget(orgKey).then(o => { if (live) { setOrg(o); if (!o) setErr('We could not find that organization. Check the link with whoever shared it.'); } }).finally(() => live && setOrgLoading(false));
    return () => { live = false; };
  }, [orgKey]);
  useEffect(() => {
    if (mode !== 'join' || orgs.length) return;
    setOrgsLoading(true);
    Promise.all((['CHURCH', 'RELIGIOUS', 'NONPROFIT', 'CULTURAL', 'OTHER'] as const).map(t => fetchPublicOrganizations(t).catch(() => [] as Organization[])))
      .then(lists => setOrgs(lists.flat().filter(o => isElevateOrg(o.orgType))))
      .finally(() => setOrgsLoading(false));
  }, [mode, orgs.length]);
  useEffect(() => {
    const u = auth.currentUser;
    if (!signedIn || !u) return;
    fetchUserMemberships(u.uid).then(ms => setMyOrgIds(new Set(ms.map(m => m.orgId)))).catch(() => {});
    if (!email) fetchUserProfile(u.uid).then(p => { if (p?.email || u.email) setEmail((p?.email || u.email || '').toLowerCase()); }).catch(() => {});
  }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = org;
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? orgs.filter(o => `${o.name} ${o.tagline || ''} ${o.denomination || ''} ${o.location?.city || ''} ${(o.tags || []).join(' ')}`.toLowerCase().includes(needle)) : orgs;
    return list.slice(0, 12);
  }, [orgs, q]);

  const claimInput = () => ({ org: target?.handle || target?.id || '', ...(via === 'member' ? { memberNumber: memberNumber.trim(), lastName: lastName.trim() } : { email: email.trim() }) });
  const doLookup = async () => {
    if (!target) return;
    setBusy(true); setErr(''); setLookup(null);
    try { setLookup(await lookupProvisionedSeat(claimInput())); } catch (e: any) { setErr(e?.message || 'Could not look that up.'); }
    setBusy(false);
  };
  const doClaim = async () => {
    setBusy(true); setErr('');
    try { setClaimed(await claimProvisionedSeat(claimInput())); } catch (e: any) { setErr(e?.message || 'Could not claim.'); }
    setBusy(false);
  };
  const doJoin = async (o: Organization) => {
    setBusy(true); setErr('');
    try {
      const pending = (o.joinProcess && o.joinProcess !== 'AUTO') || !!o.isPrivate;
      const m = await joinOrganization(o.id, { status: pending ? 'PENDING' : 'ACTIVE' });
      if (!m) throw new Error('Sign in first.');
      setJoined({ orgId: o.id, orgName: o.name, pending });
    } catch (e: any) { setErr(e?.message || 'Could not join.'); }
    setBusy(false);
  };

  const needSignIn = (
    <div className="space-y-3">
      <p className="text-sm text-white/60">First, sign in to Plajah — or create your free account. Your organization's seat attaches to it.</p>
      <button onClick={() => setAuthMode('REGISTER')} className={primary}><UserPlus size={15} /> Create my Plajah account</button>
      <button onClick={() => setAuthMode('SIGN_IN')} className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/10 flex items-center justify-center gap-2"><LogIn size={14} /> I already have one</button>
    </div>
  );

  const Head: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
    <div className="mb-5">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C4B5FD] flex items-center gap-2"><Church size={13} /> Plajah Elevate</p>
      <h2 className="text-2xl font-black text-white mt-1 leading-tight">{title}</h2>
      {sub && <p className="text-sm text-white/50 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[320] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-lg bg-[#0b0712] border border-[#8B5CF6]/30 rounded-[2rem] p-6 sm:p-8 text-white shadow-[0_30px_80px_rgba(107,0,153,0.35)]">
        <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-br from-[#8B5CF6]/25 via-transparent to-[#6B0099]/20 pointer-events-none" />
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white z-10" aria-label="Close"><X size={18} /></button>
        <div className="relative">
          {orgLoading ? <div className="py-14 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div> : (
            <>
              {/* ── HOME ── */}
              {mode === 'home' && (
                <>
                  <Head title="Welcome" sub="For churches, ministries, nonprofits and cultural institutions — and the people in them." />
                  <div className="space-y-2.5">
                    <button onClick={() => setMode('claim')} className="w-full text-left p-4 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/25 transition-all flex items-center gap-4">
                      <KeyRound className="text-[#C4B5FD] shrink-0" size={20} />
                      <span className="flex-1"><span className="block text-sm font-black">Claim your account</span><span className="block text-[11px] text-white/50">Your organization already set one up for you — claim it with your member ID or email.</span></span>
                      <ArrowRight size={16} className="text-white/40" />
                    </button>
                    <button onClick={() => setMode('join')} className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-4">
                      <Search className="text-white/60 shrink-0" size={20} />
                      <span className="flex-1"><span className="block text-sm font-black">Find &amp; join a ministry</span><span className="block text-[11px] text-white/50">New here? Search for your church or organization and join.</span></span>
                      <ArrowRight size={16} className="text-white/40" />
                    </button>
                    <button onClick={() => setMode('create')} className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-4">
                      <Sparkles className="text-white/60 shrink-0" size={20} />
                      <span className="flex-1"><span className="block text-sm font-black">Set up a ministry</span><span className="block text-[11px] text-white/50">Staff: create your organization — departments, chat, feeds and giving are configured for you.</span></span>
                      <ArrowRight size={16} className="text-white/40" />
                    </button>
                  </div>
                  {!signedIn && <p className="text-[10px] text-white/30 mt-4 text-center">You'll sign in or create a free Plajah account along the way.</p>}
                </>
              )}

              {/* ── CLAIM ── */}
              {mode === 'claim' && (
                <>
                  <Head title={target ? `Claim your ${target.name} account` : 'Claim your account'} sub={target ? undefined : 'Open the link or QR code your organization shared, or find it below.'} />
                  {claimed ? (
                    <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-[#8B5CF6]/25 grid place-items-center mx-auto"><Check className="text-[#C4B5FD]" /></div>
                      <h3 className="text-xl font-black">Welcome to {claimed.orgName}</h3>
                      <p className="text-sm text-white/55">You're in as <span className="text-white font-bold">{claimed.roleLabel}</span>. Your department feeds, chat rooms and profile are ready.</p>
                      <button onClick={() => onOpenOrg(claimed.orgId)} className={primary}>Open {claimed.orgName} <ArrowRight size={14} /></button>
                    </div>
                  ) : !target ? (
                    <div className="space-y-3">
                      <button onClick={() => setMode('join')} className={primary}><Search size={14} /> Find my organization</button>
                      <button onClick={() => setMode('home')} className={ghost}>Back</button>
                    </div>
                  ) : !signedIn ? needSignIn : (
                    <div className="space-y-3">
                      {target.logoUrl && <img src={target.logoUrl} alt="" className="w-14 h-14 rounded-2xl object-cover" />}
                      <div className="flex gap-1.5">
                        {([['member', 'Member ID'], ['email', 'My email']] as const).map(([k, l]) => (
                          <button key={k} onClick={() => { setVia(k); setLookup(null); setErr(''); }} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${via === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{l}</button>
                        ))}
                      </div>
                      {via === 'member' ? (
                        <div className="grid grid-cols-2 gap-2">
                          <input className={field} placeholder="Member ID (e.g. GC-48213)" value={memberNumber} onChange={e => setMemberNumber(e.target.value.toUpperCase())} autoFocus />
                          <input className={field} placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
                        </div>
                      ) : (
                        <div>
                          <input className={field} type="email" placeholder="Email your organization has on file" value={email} onChange={e => setEmail(e.target.value)} />
                          <p className="text-[10px] text-white/35 mt-1.5">It must be the email you're signed in to Plajah with.</p>
                        </div>
                      )}
                      {lookup && !lookup.found && <p className="text-xs text-amber-300">{lookup.reason}</p>}
                      {lookup?.found && (
                        <div className="p-4 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#C4B5FD]">We found your account</p>
                          <p className="text-sm font-bold">{lookup.maskedName} · {lookup.roleLabel}</p>
                          {!!lookup.departments?.length && <p className="text-[11px] text-white/50">{lookup.departments.join(' · ')}</p>}
                        </div>
                      )}
                      {err && <p className="text-xs text-red-300">{err}</p>}
                      {lookup?.found
                        ? <button onClick={doClaim} disabled={busy} className={primary}>{busy && <Loader2 size={13} className="animate-spin" />} Yes, that's me — claim it</button>
                        : <button onClick={doLookup} disabled={busy || (via === 'member' ? !memberNumber.trim() || !lastName.trim() : !email.trim())} className={primary}>{busy && <Loader2 size={13} className="animate-spin" />} Find my account</button>}
                      <div className="flex justify-between items-center pt-1">
                        <button onClick={() => { setMode('join'); setErr(''); }} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">No account yet? Join as a new member</button>
                        {!orgKey && <button onClick={() => setMode('home')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Back</button>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── JOIN ── */}
              {mode === 'join' && (
                <>
                  <Head title={target ? `Join ${target.name}` : 'Find your ministry'} sub={target ? target.tagline : 'Search churches, ministries, nonprofits and cultural institutions on Plajah.'} />
                  {joined ? (
                    <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-emerald-500/20 grid place-items-center mx-auto"><Check className="text-emerald-300" /></div>
                      <h3 className="text-xl font-black">{joined.pending ? 'Request sent' : `Welcome to ${joined.orgName}`}</h3>
                      <p className="text-sm text-white/55">{joined.pending ? `A leader at ${joined.orgName} will approve you.` : 'You are now a member.'}</p>
                      <button onClick={() => onOpenOrg(joined.orgId)} className={primary}>Open {joined.orgName} <ArrowRight size={14} /></button>
                    </div>
                  ) : !signedIn ? needSignIn : target ? (
                    <div className="space-y-3">
                      {myOrgIds.has(target.id)
                        ? <button onClick={() => onOpenOrg(target.id)} className={primary}>You're already a member — open {target.name}</button>
                        : <button onClick={() => doJoin(target)} disabled={busy} className={primary}>{busy && <Loader2 size={13} className="animate-spin" />} {(target.joinProcess && target.joinProcess !== 'AUTO') || target.isPrivate ? 'Request to join' : 'Join as a member'}</button>}
                      <button onClick={() => { setMode('claim'); setErr(''); }} className="w-full text-[10px] font-black uppercase tracking-widest text-[#C4B5FD] hover:text-white flex items-center justify-center gap-1.5"><KeyRound size={12} /> I already have a member ID — claim my account instead</button>
                      {err && <p className="text-xs text-red-300">{err}</p>}
                      {!orgKey && <button onClick={() => setOrg(null)} className={ghost}>Search again</button>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative"><Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" /><input autoFocus className={field + ' pl-11'} placeholder="Church, ministry or organization name, city…" value={q} onChange={e => setQ(e.target.value)} /></div>
                      <div className="max-h-72 overflow-y-auto space-y-1.5">
                        {orgsLoading && <p className="text-xs text-white/40 flex items-center gap-2 py-4 justify-center"><Loader2 size={13} className="animate-spin" /> Loading…</p>}
                        {!orgsLoading && results.map(o => (
                          <button key={o.id} onClick={() => setOrg(o)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left">
                            <span className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 shrink-0 grid place-items-center">{o.logoUrl ? <img src={o.logoUrl} alt="" className="w-full h-full object-cover" /> : <Church size={16} className="text-white/40" />}</span>
                            <span className="min-w-0 flex-1"><span className="block text-sm font-bold truncate">{o.name}</span><span className="block text-[11px] text-white/45 truncate">{[o.denomination || o.orgKindLabel, o.location?.city].filter(Boolean).join(' · ') || o.tagline || ''}</span></span>
                            {myOrgIds.has(o.id) && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Member</span>}
                          </button>
                        ))}
                        {!orgsLoading && !results.length && <p className="text-xs text-white/40 py-4 text-center">Nothing matches yet. Ask your organization for its join link — or set it up below.</p>}
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <button onClick={() => setMode('create')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Can't find it? Set it up</button>
                        <button onClick={() => setMode('home')} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Back</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── CREATE ── */}
              {mode === 'create' && (
                <>
                  <Head title="Set up your ministry" sub="For pastors, directors and staff. Takes about two minutes." />
                  <ul className="text-sm text-white/60 space-y-1.5 mb-5">
                    {['Departments & ministries seeded for your kind of organization', 'Chat configured: announcements, general, a space per department with rooms', 'A social feed for every department — public for public-facing ministries', 'Import people from Servant Keeper, Planning Center, Breeze, CCB or payroll — accounts pre-provisioned', 'Giving, sermons, media, store and roles'].map(t => <li key={t} className="flex items-start gap-2"><Check size={14} className="text-[#C4B5FD] mt-0.5 shrink-0" /> {t}</li>)}
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
