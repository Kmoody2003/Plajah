// ElevateScopePillar — the top of the left pillar for someone in the Elevate scope (or any active member
// on their org's page): the org, the department(s) they belong to pinned first, and the org's own pages.
// ScopeFooter — the "Show all of Plajah" way out for the Elevate and week-one starter scopes.
import React, { useMemo } from 'react';
import { Pin, Home, Play, Calendar, HandHeart, Gift, ShoppingBag, Users, Compass } from 'lucide-react';
import type { Organization, OrgMembership, OrgType } from '../../types';
import { memberDepartments } from '../../services/memberDepartments';
import { isFaithOrg } from '../../services/elevateTemplates';
import { useMyElevateOrgs, pickHomeOrg } from '../../services/elevateHome';
import OrgSwitcher from './OrgSwitcher';
import { requestOrgPage, setLocalShowAll, type NavScope } from '../../services/experienceScope';

// ── The person's home org when they are not on an org page: the one they used last, else the first joined.

export function useHomeOrg(uid: string | undefined, enabled: boolean): { org: Organization; membership: OrgMembership } | null {
  const { orgs } = useMyElevateOrgs(enabled ? uid : undefined);
  return useMemo(() => (enabled ? pickHomeOrg(uid, orgs) : null), [enabled, uid, orgs]);
}

// ── Org page links, worded for the org type (matches the org page's tabs) ──────────────────────────

function orgLinks(t?: OrgType): { tab: string; label: string; icon: React.ComponentType<{ size?: number }> }[] {
  const faith = isFaithOrg(t);
  const words = faith
    ? { MINISTRIES: 'Ministries', PRAYER: 'Prayer wall', GIVE: 'Give' }
    : t === 'NONPROFIT' ? { MINISTRIES: 'Programs', PRAYER: 'Community wall', GIVE: 'Donate' }
    : t === 'CULTURAL' ? { MINISTRIES: 'Exhibits & programs', PRAYER: 'Patron wall', GIVE: 'Support' }
    : { MINISTRIES: 'Departments', PRAYER: 'Community', GIVE: 'Support' };
  return [
    { tab: 'HOME', label: 'Home', icon: Home },
    { tab: 'WATCH', label: 'Watch', icon: Play },
    { tab: 'EVENTS', label: 'Events', icon: Calendar },
    { tab: 'MINISTRIES', label: words.MINISTRIES, icon: Users },
    { tab: 'PRAYER', label: words.PRAYER, icon: HandHeart },
    { tab: 'GIVE', label: words.GIVE, icon: Gift },
    { tab: 'SHOP', label: t === 'CULTURAL' ? 'Gift shop' : 'Shop', icon: ShoppingBag },
  ];
}

interface PillarProps {
  org: Organization;
  membership: OrgMembership | null;
  uid?: string;
  collapsed?: boolean;
  /** Switch the app to this org's page (App sets ORG_HUB). */
  onOpenOrg: (orgId: string) => void;
  /** Is the org page showing right now (highlights Home). */
  onOrgPage?: boolean;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export const ElevateScopePillar: React.FC<PillarProps> = ({ org, membership, uid, collapsed, onOpenOrg, onOrgPage }) => {
  const depts = useMemo(() => (membership ? memberDepartments(org, membership, uid || '') : []), [org, membership, uid]);
  const go = (t: { tab?: string; ministryId?: string }) => { requestOrgPage({ orgId: org.id, ...t }); onOpenOrg(org.id); };
  const links = orgLinks(org.orgType);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 mb-3">
        <button onClick={() => go({ tab: 'HOME' })} title={org.name} aria-label={org.name}
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-black overflow-hidden" style={{ background: '#7A1FC0' }}>
          {org.logoUrl ? <img src={org.logoUrl} alt="" className="w-full h-full object-cover" /> : initials(org.name)}
        </button>
        {depts.slice(0, 2).map(d => (
          <button key={d.id} onClick={() => go({ ministryId: d.id })} title={d.name} aria-label={d.name}
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-[#E2C27E] bg-white/[0.04] border border-white/10">
            <Pin size={15} />
          </button>
        ))}
      </div>
    );
  }

  const roleFor = (id: string) => membership?.ministryRoles?.find(r => r.ministryId === id)?.title || (membership?.title && depts.length === 1 ? membership.title : '');

  return (
    <div className="flex flex-col gap-4 mb-4" data-testid="elevate-pillar">
      <OrgSwitcher
        uid={uid}
        currentOrgId={org.id}
        currentOrgName={org.name}
        currentLogoUrl={org.logoUrl}
        sub={membership ? `Member${membership.memberNumber ? ` · #${membership.memberNumber}` : ''}` : 'Visiting'}
        onOpenCurrent={() => go({ tab: 'HOME' })}
      />

      {depts.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 flex items-center gap-1.5">
            <Pin size={11} className="text-[#E2C27E] fill-current" /> My {depts.length > 1 ? 'departments' : 'department'}
          </p>
          {depts.map((d, i) => (
            <button key={d.id} onClick={() => go({ ministryId: d.id })}
              className={`text-left rounded-xl px-3 py-2.5 border transition-colors ${i === 0 ? 'bg-[rgba(122,31,192,0.14)] border-[rgba(208,188,255,0.25)] hover:bg-[rgba(122,31,192,0.22)]' : 'bg-transparent border-white/10 hover:bg-white/[0.05]'}`}>
              <span className="block text-[13px] font-bold text-white truncate">{d.name}</span>
              {roleFor(d.id) && <span className="block text-[11px] text-[#D0BCFF] truncate mt-0.5">{roleFor(d.id)}</span>}
            </button>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-0.5">
        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 truncate">{org.name}</p>
        {links.map(l => {
          const Icon = l.icon;
          const active = onOrgPage && l.tab === 'HOME';
          return (
            <button key={l.tab} onClick={() => go({ tab: l.tab })}
              className={`flex items-center gap-2.5 h-9 px-3 rounded-xl text-[13px] font-medium transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:text-white hover:bg-white/[0.05]'}`}>
              <Icon size={15} /> <span className="truncate">{l.label}</span>
            </button>
          );
        })}
      </section>
      <p className="px-1 -mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Pinned · Discover</p>
    </div>
  );
};

export const ScopeFooter: React.FC<{
  scope: NavScope;
  orgName?: string;
  starter?: { day: number; of: number } | null;
  collapsed?: boolean;
  /** Persist the choice on the profile (App writes navScope: 'full'). */
  onShowAll: () => void;
}> = ({ scope, orgName, starter, collapsed, onShowAll }) => {
  if (scope === 'full') return null;
  const showAll = () => { setLocalShowAll(true); onShowAll(); };
  if (collapsed) {
    return (
      <button onClick={showAll} title="Show all of Plajah" aria-label="Show all of Plajah"
        className="mx-auto mt-2 w-12 h-12 rounded-2xl flex items-center justify-center text-[#D0BCFF] border border-dashed border-white/20">
        <Compass size={16} />
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-2xl p-3 border border-dashed border-white/15 text-[12px] leading-snug text-white/55" data-testid="scope-footer">
      {scope === 'starter' && starter ? (
        <>
          <p className="m-0 font-semibold text-white/85">Day {starter.day} of {starter.of}</p>
          <div className="h-1 rounded-full bg-white/10 mt-2"><div className="h-1 rounded-full bg-[#D0BCFF]" style={{ width: `${Math.round((starter.day / starter.of) * 100)}%` }} /></div>
          <p className="m-0 mt-2">More of Plajah opens up after your first week.</p>
        </>
      ) : (
        <p className="m-0">{orgName ? `Just ${orgName} for now.` : 'Just the essentials for now.'}</p>
      )}
      <button onClick={showAll} className="mt-2 font-semibold text-[#D0BCFF] hover:text-white transition-colors">Show all of Plajah →</button>
    </div>
  );
};

export default ElevateScopePillar;
