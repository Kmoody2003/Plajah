// ActiveIdentityContext — "operate as" (Part 2, slice 4).
//
// A user can act as themselves OR as one of the organizations they run (like
// Facebook Pages). This holds the currently-selected identity; surfaces that post
// (the feed composer) attribute content to the active org. The post is always
// OWNED by the user's uid (rules/permissions) but presented as the org.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Organization, OrgMembership } from '../types';
import { auth } from '../services/firebase';
import { fetchUserOrganizations, fetchUserMemberships } from '../services/organizationService';

interface ActiveIdentityContextType {
  /** The orgs the signed-in user runs OR is an active employee of. */
  myOrgs: Organization[];
  /** The signed-in user's ACTIVE memberships, keyed for role/employee lookups. */
  myMemberships: OrgMembership[];
  /** null = acting as yourself; otherwise the active org. */
  activeOrg: Organization | null;
  setActiveOrg: (org: Organization | null) => void;
  refreshOrgs: () => void;
}

const ActiveIdentityContext = createContext<ActiveIdentityContextType | undefined>(undefined);
const LS_KEY = 'plajah:activeOrgId';

export const ActiveIdentityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [myOrgs, setMyOrgs] = useState<Organization[]>([]);
  const [myMemberships, setMyMemberships] = useState<OrgMembership[]>([]);
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null);
  const uid = auth.currentUser?.uid;

  const refreshOrgs = useCallback(() => {
    const u = auth.currentUser?.uid;
    if (!u) { setMyOrgs([]); setMyMemberships([]); return; }
    // Orgs the user runs OR is an active employee of, plus the membership rows (for role/badge).
    Promise.all([
      fetchUserOrganizations(u).catch(() => [] as Organization[]),
      fetchUserMemberships(u).catch(() => [] as OrgMembership[]),
    ]).then(([orgs, memberships]) => {
      setMyOrgs(orgs);
      setMyMemberships(memberships.filter(m => m.status === 'ACTIVE'));
      // Restore the persisted active org if it's still one we run.
      const savedId = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();
      if (savedId) {
        const found = orgs.find(o => o.id === savedId);
        setActiveOrgState(found || null);
      }
    }).catch(() => { /* */ });
  }, []);

  useEffect(() => { refreshOrgs(); }, [refreshOrgs, uid]);

  const setActiveOrg = useCallback((org: Organization | null) => {
    setActiveOrgState(org);
    try { org ? localStorage.setItem(LS_KEY, org.id) : localStorage.removeItem(LS_KEY); } catch { /* */ }
  }, []);

  return (
    <ActiveIdentityContext.Provider value={{ myOrgs, myMemberships, activeOrg, setActiveOrg, refreshOrgs }}>
      {children}
    </ActiveIdentityContext.Provider>
  );
};

export function useActiveIdentity(): ActiveIdentityContextType {
  const ctx = useContext(ActiveIdentityContext);
  if (!ctx) throw new Error('useActiveIdentity must be used inside <ActiveIdentityProvider>');
  return ctx;
}

/** Compact "Posting as …" control. Renders nothing if the user runs no orgs. */
export const IdentitySwitcher: React.FC<{ selfName?: string; selfPhoto?: string }> = ({ selfName, selfPhoto }) => {
  const { myOrgs, myMemberships, activeOrg, setActiveOrg } = useActiveIdentity();
  const [open, setOpen] = useState(false);
  const uid = auth.currentUser?.uid;
  if (myOrgs.length === 0) return null;

  const membershipFor = (orgId: string) => myMemberships.find(m => m.orgId === orgId);
  // An "employee identity" = an org you belong to but don't own (you act under a role/badge).
  const isEmployeeIdentity = (o: Organization) => {
    const m = membershipFor(o.id);
    return !!m && (m.isEmployee || (m.role !== 'OWNER' && o.creatorId !== uid));
  };
  const roleLabel = (o: Organization) => {
    const m = membershipFor(o.id);
    if (!m) return o.orgType;
    const def = (o.roleDefs || []).find(r => r.key === m.roleKey);
    return def?.label || m.title || m.role;
  };

  const activeIsEmployee = activeOrg ? isEmployeeIdentity(activeOrg) : false;
  const label = activeOrg ? (activeIsEmployee ? `${activeOrg.name} · ${roleLabel(activeOrg)}` : activeOrg.name) : (selfName || 'You');
  const photo = activeOrg ? activeOrg.logoUrl : selfPhoto;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
        <span className="w-5 h-5 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center text-[8px] font-black">
          {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : (label[0] || '?')}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Posting as {label}</span>
        <span className="text-white/40 text-[8px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 left-0 w-56 bg-[#0c0c0f] border border-white/10 rounded-2xl shadow-2xl p-1.5">
            <button onClick={() => { setActiveOrg(null); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left ${!activeOrg ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <span className="w-6 h-6 rounded-full overflow-hidden bg-white/10 grid place-items-center text-[9px] font-black">{selfPhoto ? <img src={selfPhoto} alt="" className="w-full h-full object-cover" /> : (selfName?.[0] || 'Y')}</span>
              <span className="text-[11px] font-bold text-white">{selfName || 'You'}</span>
            </button>
            {myOrgs.map(o => {
              const employee = isEmployeeIdentity(o);
              return (
                <button key={o.id} onClick={() => { setActiveOrg(o); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left ${activeOrg?.id === o.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                  {/* Employees show a rectangular work-badge avatar with a blue/yellow ring. */}
                  <span
                    className={`${employee ? 'w-6 h-7 rounded-md' : 'w-6 h-6 rounded-full'} overflow-hidden bg-white/10 grid place-items-center text-[9px] font-black shrink-0`}
                    style={employee ? { boxShadow: '0 0 0 1.5px #0070FF, 0 0 0 3px #FFD40055' } : undefined}
                  >
                    {o.logoUrl ? <img src={o.logoUrl} alt="" className="w-full h-full object-cover" /> : o.name[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold text-white truncate">{o.name}</span>
                    {employee && <span className="block text-[8px] font-black uppercase tracking-widest text-[#FFD400]/80 truncate">{roleLabel(o)} · Badge</span>}
                  </span>
                  <span className="ml-auto text-[7px] font-black uppercase tracking-widest text-small-orange/70 shrink-0">{employee ? 'WORK' : o.orgType}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
