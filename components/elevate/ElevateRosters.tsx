// ElevateRosters — PUBLIC "Meet our Pastors / Leadership / Staff" sections + MinistryLeaders helper.
import React, { useEffect, useState } from 'react';
import type { Organization, OrgMembership, Ministry } from '../../types';
import { fetchOrgMembers } from '../../services/organizationService';
import { getElevateRole, ELEVATE_ROLES } from '../../services/elevateRoles';
import { rosterFor } from '../../services/elevateService';

export interface ElevateRostersProps {
  org: Organization;
  onVisitUser?: (uid: string) => void;
}

const isPublicRole = (m: OrgMembership) => {
  const def = getElevateRole(m.roleKey);
  return def ? !!def.isPublic : !!m.isSenior;
};

const PersonCard: React.FC<{ m: OrgMembership; large?: boolean; onVisitUser?: (uid: string) => void }> = ({ m, large, onVisitUser }) => {
  const [open, setOpen] = useState(false);
  const photo = m.orgPhotoUrl || m.photoUrl;
  const about = m.aboutInOrg || '';
  const long = about.length > 140;
  return (
    <div className={`bg-white/[0.03] border border-white/10 rounded-[1.75rem] ${large ? 'p-5 sm:p-6 sm:flex gap-6' : 'p-4'} `}>
      <div className={`${large ? 'w-32 h-32 sm:w-44 sm:h-44 rounded-[1.5rem] mx-auto sm:mx-0' : 'w-16 h-16 rounded-2xl'} overflow-hidden bg-white/10 shrink-0 grid place-items-center text-2xl font-black text-white/40`}>
        {photo ? <img src={photo} alt={m.displayName} className="w-full h-full object-cover" loading="lazy" /> : m.displayName.charAt(0)}
      </div>
      <div className={`min-w-0 ${large ? 'mt-4 sm:mt-0 text-center sm:text-left' : 'mt-3'}`}>
        <button onClick={() => onVisitUser?.(m.userId)} disabled={!onVisitUser} className={`${large ? 'text-2xl' : 'text-base'} font-black text-white hover:text-small-orange transition-colors text-left disabled:hover:text-white`}>{m.displayName}</button>
        <p className="text-[11px] font-black uppercase tracking-widest text-small-orange mt-0.5">{m.title || getElevateRole(m.roleKey)?.label}</p>
        {about && (
          <>
            <p className={`text-sm text-white/60 leading-relaxed mt-2 whitespace-pre-line ${open || !long ? '' : 'line-clamp-3'}`}>{about}</p>
            {long && <button onClick={() => setOpen(o => !o)} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white mt-1">{open ? 'Less' : 'Read more'}</button>}
          </>
        )}
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; people: OrgMembership[]; onVisitUser?: (uid: string) => void; featureFirst?: boolean }> = ({ title, people, onVisitUser, featureFirst }) => {
  if (!people.length) return null;
  const first = featureFirst && people[0].isSenior ? people[0] : null;
  const rest = first ? people.slice(1) : people;
  return (
    <section className="space-y-4">
      <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/45">{title}</h3>
      {first && <PersonCard m={first} large onVisitUser={onVisitUser} />}
      {rest.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rest.map(m => <PersonCard key={m.id} m={m} onVisitUser={onVisitUser} />)}</div>}
    </section>
  );
};

const ElevateRosters: React.FC<ElevateRostersProps> = ({ org, onVisitUser }) => {
  const [members, setMembers] = useState<OrgMembership[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchOrgMembers(org.id).then(m => { if (alive) setMembers(m); }).catch(() => { if (alive) setMembers([]); });
    return () => { alive = false; };
  }, [org.id]);
  if (!members) return null;
  const pub = members.filter(m => m.status === 'ACTIVE' && isPublicRole(m));
  const pastoral = rosterFor(pub, 'PASTORAL');
  const leadership = rosterFor(pub, 'LEADERSHIP');
  const staff = rosterFor(pub, 'STAFF');
  if (!pastoral.length && !leadership.length && !staff.length) return null;
  return (
    <div className="space-y-10">
      <Section title={pastoral.length > 1 ? 'Meet our Pastors' : 'Meet our Pastor'} people={pastoral} onVisitUser={onVisitUser} featureFirst />
      <Section title="Leadership" people={leadership} onVisitUser={onVisitUser} />
      <Section title="Staff" people={staff} onVisitUser={onVisitUser} />
    </div>
  );
};

/** Compact leader chips for a ministry card (headUids + legacy leaderName). Fetches members unless `members` is supplied. */
export const MinistryLeaders: React.FC<{ ministry: Ministry; orgId: string; members?: OrgMembership[]; onVisitUser?: (uid: string) => void }> = ({ ministry, orgId, members, onVisitUser }) => {
  const [loaded, setLoaded] = useState<OrgMembership[] | null>(members || null);
  useEffect(() => {
    if (members) { setLoaded(members); return; }
    if (!ministry.headUids?.length) return;
    let alive = true;
    fetchOrgMembers(orgId).then(m => { if (alive) setLoaded(m); }).catch(() => {});
    return () => { alive = false; };
  }, [orgId, members, ministry.headUids]);
  const heads = (ministry.headUids || []).map(uid => loaded?.find(m => m.userId === uid && m.status === 'ACTIVE')).filter(Boolean) as OrgMembership[];
  if (!heads.length) return ministry.leaderName ? <p className="text-[11px] text-white/45">Led by {ministry.leaderName}</p> : null;
  return (
    <div className="flex flex-wrap gap-2">
      {heads.map(h => (
        <button key={h.id} onClick={() => onVisitUser?.(h.userId)} className="flex items-center gap-1.5 pl-1 pr-3 py-1 bg-white/5 border border-white/10 rounded-full hover:bg-white/10">
          <span className="w-6 h-6 rounded-full overflow-hidden bg-white/10 grid place-items-center text-[10px] font-black text-white/50">
            {(h.orgPhotoUrl || h.photoUrl) ? <img src={h.orgPhotoUrl || h.photoUrl} alt="" className="w-full h-full object-cover" /> : h.displayName.charAt(0)}
          </span>
          <span className="text-[11px] font-bold text-white">{h.displayName}</span>
          <span className="text-[9px] text-white/40">{h.ministryRoles?.find(r => r.ministryId === ministry.id)?.title || 'Head'}</span>
        </button>
      ))}
    </div>
  );
};

void ELEVATE_ROLES;
export default ElevateRosters;
