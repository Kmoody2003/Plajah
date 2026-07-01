import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, Church, HeartHandshake, Sparkles, Search, MapPin, BadgeCheck, Users, Plus, ArrowRight } from 'lucide-react';
import { fetchPublicOrganizations } from '../services/organizationService';
import { Organization, OrgType } from '../types';

interface PlajahElevateProps {
  /** Open an institution's public hub. */
  onOpenOrg: (orgId: string) => void;
  /** List / create a new institution (start the org onboarding flow). */
  onCreate: () => void;
  isSignedIn: boolean;
}

/** A category in the directory — maps a human section to an OrgType. */
const SECTIONS: { key: string; orgType: OrgType; title: string; blurb: string; icon: any; accent: string }[] = [
  {
    key: 'spiritual',
    orgType: 'CHURCH',
    title: 'Spiritual Institutions',
    blurb: 'Churches, ministries, temples, mosques & congregations',
    icon: Church,
    accent: '#8B5CF6',
  },
  {
    key: 'cultural',
    orgType: 'CULTURAL',
    title: 'Cultural Institutions',
    blurb: 'Museums, cultural centers, heritage & the arts',
    icon: Landmark,
    accent: '#F59E0B',
  },
  {
    key: 'nonprofit',
    orgType: 'NONPROFIT',
    title: 'Nonprofits & Causes',
    blurb: 'Charities, foundations & community organizations',
    icon: HeartHandshake,
    accent: '#10B981',
  },
];

const OrgCard: React.FC<{ org: Organization; accent: string; onOpen: () => void }> = ({ org, accent, onOpen }) => {
  const city = org.location?.city || org.campuses?.[0]?.location;
  return (
    <button
      onClick={onOpen}
      className="group relative flex flex-col text-left rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 hover:border-white/25 hover:bg-white/[0.07] transition-all"
    >
      {/* Cover / accent band */}
      <div className="h-20 w-full relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }}>
        {org.coverUrl && <img src={org.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />}
      </div>
      <div className="px-4 pb-4 -mt-8 relative">
        <div className="w-14 h-14 rounded-2xl border-2 border-black/40 overflow-hidden bg-white/10 flex items-center justify-center shadow-lg">
          {org.logoUrl
            ? <img src={org.logoUrl} alt="" className="w-full h-full object-cover" />
            : <span className="text-lg font-black text-white/70">{org.name?.[0]?.toUpperCase() || '?'}</span>}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <p className="text-[13px] font-black text-white leading-tight line-clamp-1">{org.name}</p>
          {org.isVerified && <BadgeCheck size={13} className="shrink-0" style={{ color: accent }} />}
        </div>
        {org.tagline && <p className="text-[10px] text-white/45 leading-snug line-clamp-2 mt-0.5">{org.tagline}</p>}
        <div className="mt-2.5 flex items-center gap-3 text-white/35">
          {city && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider">
              <MapPin size={10} /> {city}
            </span>
          )}
          {typeof org.followerCount === 'number' && org.followerCount > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider">
              <Users size={10} /> {org.followerCount.toLocaleString()}
            </span>
          )}
          {org.denomination && (
            <span className="text-[9px] font-bold uppercase tracking-wider truncate">{org.denomination}</span>
          )}
        </div>
      </div>
    </button>
  );
};

const PlajahElevate: React.FC<PlajahElevateProps> = ({ onOpenOrg, onCreate, isSignedIn }) => {
  const [orgsByType, setOrgsByType] = useState<Record<string, Organization[]>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(SECTIONS.map(s => fetchPublicOrganizations(s.orgType).catch(() => [] as Organization[])));
      if (cancelled) return;
      const map: Record<string, Organization[]> = {};
      SECTIONS.forEach((s, i) => { map[s.key] = results[i]; });
      setOrgsByType(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleSections = activeSection === 'all' ? SECTIONS : SECTIONS.filter(s => s.key === activeSection);

  const filter = (list: Organization[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(o =>
      o.name?.toLowerCase().includes(q) ||
      o.tagline?.toLowerCase().includes(q) ||
      o.denomination?.toLowerCase().includes(q) ||
      o.location?.city?.toLowerCase().includes(q) ||
      o.tags?.some(t => t.toLowerCase().includes(q)));
  };

  const totalCount = useMemo(() => Object.values(orgsByType).reduce((n, l) => n + l.length, 0), [orgsByType]);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-black text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(120% 100% at 50% 0%, rgba(139,92,246,0.25), rgba(245,158,11,0.12) 45%, transparent 70%)' }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-8">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
              <Landmark size={18} className="text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Plajah Elevate</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight max-w-2xl">
            The home for faith, culture &amp; community on Plajah.
          </h1>
          <p className="text-white/50 text-sm mt-3 max-w-xl leading-relaxed">
            A living directory of churches, religious organizations, cultural institutions and nonprofits —
            find a community near you, follow their work, and give directly.
          </p>

          {/* Search + CTA */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-white/[0.06] border border-white/12 rounded-2xl px-4 py-3 focus-within:border-white/30 transition-colors">
              <Search size={15} className="text-white/40 shrink-0" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search institutions, cities, causes…"
                className="bg-transparent outline-none text-sm text-white placeholder:text-white/30 w-full"
              />
            </div>
            <button
              onClick={onCreate}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white text-black font-black text-[11px] uppercase tracking-widest hover:bg-white/90 transition-all shrink-0"
            >
              <Plus size={14} /> {isSignedIn ? 'List your institution' : 'Sign in to list'}
            </button>
          </div>

          {/* Section pills */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveSection('all')}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'all' ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50 hover:text-white border border-white/10'}`}
            >
              All ({totalCount})
            </button>
            {SECTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === s.key ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50 hover:text-white border border-white/10'}`}
              >
                <s.icon size={12} /> {s.title.split(' ')[0]} ({(orgsByType[s.key] || []).length})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-12">
        {loading ? (
          <div className="flex flex-col items-center gap-4 text-white/40 py-24">
            <div className="w-9 h-9 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-[9px] font-black uppercase tracking-widest">Gathering institutions…</p>
          </div>
        ) : (
          visibleSections.map(section => {
            const list = filter(orgsByType[section.key] || []);
            return (
              <section key={section.key}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${section.accent}22`, border: `1px solid ${section.accent}44` }}>
                    <section.icon size={15} style={{ color: section.accent }} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white leading-tight">{section.title}</h2>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">{section.blurb}</p>
                  </div>
                </div>

                {list.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 px-6 py-10 flex flex-col items-center gap-3 text-center">
                    <Sparkles size={18} className="text-white/25" />
                    <p className="text-[11px] text-white/40 max-w-sm leading-relaxed">
                      {query ? 'No matches here yet — try another search.' : `No ${section.title.toLowerCase()} listed yet. Be the first to join Plajah Elevate.`}
                    </p>
                    {!query && (
                      <button onClick={onCreate} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-colors">
                        List one <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {list.map(org => (
                      <OrgCard key={org.id} org={org} accent={section.accent} onOpen={() => onOpenOrg(org.id)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PlajahElevate;
