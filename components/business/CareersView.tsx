import React, { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, HeartHandshake, MapPin, Loader2, Share2 } from 'lucide-react';
import { fetchOrgPostings } from '../../services/hiringService';
import ApplyModal from './ApplyModal';
import type { Organization, JobPosting } from '../../types';

// A dedicated, shareable public careers / get-involved page for an org.
const CareersView: React.FC<{ org: Organization; onBack?: () => void }> = ({ org, onBack }) => {
  const isVolunteerOrg = org.orgType === 'CHURCH' || org.orgType === 'NONPROFIT' || org.orgType === 'CULTURAL';
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyFor, setApplyFor] = useState<JobPosting | null>(null);

  useEffect(() => {
    fetchOrgPostings(org.id).then(ps => setPostings(ps.filter(p => p.status === 'OPEN'))).catch(() => {}).finally(() => setLoading(false));
  }, [org.id]);

  const share = async () => {
    const url = `${window.location.origin}/org/${encodeURIComponent(org.handle || org.id)}`;
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: `${org.name} — ${isVolunteerOrg ? 'Get Involved' : 'Careers'}`, url });
      else { await navigator.clipboard.writeText(url); }
    } catch { /* cancelled */ }
  };

  const jobs = postings.filter(p => p.postingType === 'JOB');
  const vols = postings.filter(p => p.postingType === 'VOLUNTEER');

  const Card: React.FC<{ p: JobPosting }> = ({ p }) => (
    <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/8">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-black text-white">{p.title}</h3>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1 flex flex-wrap items-center gap-x-2">
            <span>{p.postingType === 'VOLUNTEER' ? 'Volunteer' : (p.employmentType || 'Paid')}</span>
            {p.location && <span className="flex items-center gap-1"><MapPin size={10} /> {p.location}</span>}
            {p.isRemote && <span>Remote</span>}
            {p.compRange && <span>· {p.compRange}</span>}
          </p>
          {p.description && <p className="text-sm text-white/60 mt-3 leading-relaxed whitespace-pre-wrap">{p.description}</p>}
          {p.shiftNeeds && <p className="text-[11px] text-white/40 mt-2">Shifts: {p.shiftNeeds}</p>}
        </div>
        <button onClick={() => setApplyFor(p)} className="px-5 py-2.5 rounded-full text-black text-[10px] font-black uppercase tracking-widest shrink-0" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>
          {p.postingType === 'VOLUNTEER' ? 'Sign up' : 'Apply'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-[#050505]">
      {/* Hero */}
      <div className="relative h-40 lg:h-56 overflow-hidden" style={{ background: `linear-gradient(135deg, ${org.accentColor || '#0070FF'}, #FFD40033)` }}>
        {org.coverUrl && <img src={org.coverUrl} alt="" className="w-full h-full object-cover opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent" />
        {onBack && <button onClick={onBack} className="absolute top-5 left-5 flex items-center gap-2 px-3 py-2 bg-black/50 backdrop-blur rounded-full text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest"><ArrowLeft size={13} /> Back</button>}
        <button onClick={share} className="absolute top-5 right-5 flex items-center gap-2 px-3 py-2 bg-black/50 backdrop-blur rounded-full text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest"><Share2 size={13} /> Share</button>
      </div>

      <div className="px-6 lg:px-12 max-w-3xl mx-auto -mt-10 relative pb-16">
        <div className="flex items-center gap-3">
          {isVolunteerOrg ? <HeartHandshake size={26} className="text-[#FFD400]" /> : <Briefcase size={26} className="text-[#FFD400]" />}
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">{isVolunteerOrg ? 'Get Involved' : 'Careers'}</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{org.name}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-white/40" /></div>
        ) : postings.length === 0 ? (
          <p className="text-center text-white/30 text-sm py-16">No open positions right now — check back soon.</p>
        ) : (
          <div className="mt-8 space-y-8">
            {jobs.length > 0 && (
              <div className="space-y-3">
                {vols.length > 0 && <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Open Roles</h2>}
                {jobs.map(p => <Card key={p.id} p={p} />)}
              </div>
            )}
            {vols.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Volunteer</h2>
                {vols.map(p => <Card key={p.id} p={p} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {applyFor && <ApplyModal posting={applyFor} orgName={org.name} onClose={() => setApplyFor(null)} />}
    </div>
  );
};

export default CareersView;
