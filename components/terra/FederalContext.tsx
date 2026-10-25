// FederalContext — what federal datasets say about a parcel's location (Terra Property Passport).
//
// Property-level facts only: flood zone, Opportunity Zone, elevation, county disaster history.
// NO demographics here — fair-housing rule; see services/dataCommons/place.ts.
//
// Honesty rules enforced in the UI: an unavailable layer says "couldn't check" (never "no risk"),
// every row names its agency and links the dataset, and county-wide facts are labelled county-wide.

import React, { useEffect, useState } from 'react';
import { Droplets, Landmark, Mountain, CloudLightning, Info, ExternalLink, Loader2 } from 'lucide-react';
import { fetchPlaceProfile, type FederalPlaceProfile, type Layer } from '../../services/dataCommons/client';

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';
const FED = '#7FA8FF';
const WARN = '#E8B33D';
const GOOD = '#3DD68C';

const Source: React.FC<{ l: Layer<unknown> }> = ({ l }) => (
  <a href={l.source.url} target="_blank" rel="noopener noreferrer"
     className="inline-flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60">
    {l.source.agency} · {l.source.dataset}<ExternalLink size={9} />
  </a>
);

const Row: React.FC<{
  icon: React.ReactNode; tone: string; title: string; body: React.ReactNode; l: Layer<unknown>;
}> = ({ icon, tone, title, body, l }) => (
  <div className="flex items-start gap-3 py-3 border-b border-white/[0.05] last:border-0">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${tone}1F`, color: tone }}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[13px] font-black text-white leading-tight">{title}</p>
      <div className="text-[11px] text-white/55 leading-relaxed mt-1">{body}</div>
      <div className="mt-1"><Source l={l} /></div>
    </div>
  </div>
);

const unavailable = (l: Layer<unknown>) => (
  <>Couldn't check right now ({l.error || 'source unavailable'}). This is <b>not</b> an all-clear.</>
);

export const FederalContext: React.FC<{ lat?: number; lng?: number }> = ({ lat, lng }) => {
  const [p, setP] = useState<FederalPlaceProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let off = false;
    setP(null); setErr(null);
    fetchPlaceProfile(lat, lng).then(r => { if (!off) setP(r); }).catch(e => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [lat, lng]);

  if (lat == null || lng == null) return null;

  return (
    <div>
      <p className={`${label} mb-3 flex items-center gap-1.5`}><Landmark size={11} /> Federal records</p>
      <div className={`${card} p-4`}>
        {!p && !err && <p className="text-[11px] text-white/40 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking FEMA, HUD and USGS…</p>}
        {err && <p className="text-[11px] text-white/50">Federal records are unavailable right now ({err}).</p>}
        {p && (
          <>
            <Row icon={<Droplets size={16} />} l={p.flood}
              tone={p.flood.status !== 'ok' ? WARN : p.flood.data!.inSpecialFloodHazardArea ? WARN : FED}
              title={p.flood.status === 'ok' ? `FEMA flood zone ${p.flood.data!.zone}` : 'FEMA flood zone'}
              body={p.flood.status === 'ok' ? p.flood.data!.plain
                : p.flood.status === 'none' ? 'This location is not on a published FEMA flood map — unmapped does not mean no hazard.'
                : unavailable(p.flood)} />
            <Row icon={<Landmark size={16} />} l={p.opportunityZone}
              tone={p.opportunityZone.status === 'ok' ? GOOD : '#6F7689'}
              title={p.opportunityZone.status === 'ok' ? 'In a federal Opportunity Zone' : 'Opportunity Zone'}
              body={p.opportunityZone.status === 'ok'
                ? <>Census tract {p.opportunityZone.data!.tractGeoid} is a designated Opportunity Zone — eligible investments can defer and reduce capital-gains tax. Confirm current rules with a tax adviser.</>
                : p.opportunityZone.status === 'none' ? 'Not in a designated Opportunity Zone.'
                : unavailable(p.opportunityZone)} />
            <Row icon={<Mountain size={16} />} l={p.elevation} tone={FED}
              title={p.elevation.status === 'ok' ? `${p.elevation.data!.feet.toLocaleString()} ft above sea level` : 'Ground elevation'}
              body={p.elevation.status === 'ok' ? 'Ground elevation at the parcel centre from the USGS 3D Elevation Program. Not an elevation certificate.'
                : p.elevation.status === 'none' ? 'No elevation data at this point.' : unavailable(p.elevation)} />
            <Row icon={<CloudLightning size={16} />} l={p.disasters} tone={p.disasters.status === 'ok' && p.disasters.data!.declarations > 0 ? WARN : FED}
              title={p.disasters.status === 'ok'
                ? `${p.disasters.data!.declarations} federal disaster declaration${p.disasters.data!.declarations === 1 ? '' : 's'} since ${p.disasters.data!.sinceYear}`
                : 'Disaster history'}
              body={p.disasters.status === 'ok'
                ? <>
                    <span className="text-white/40">County-wide ({p.disasters.data!.county}) — says nothing about this parcel specifically.</span>
                    <ul className="mt-1.5 space-y-0.5">
                      {p.disasters.data!.recent.slice(0, 4).map(d => (
                        <li key={d.number}>• {d.title.toLowerCase().replace(/^\w/, c => c.toUpperCase())} <span className="text-white/35">({d.date.slice(0, 4)})</span></li>
                      ))}
                    </ul>
                  </>
                : unavailable(p.disasters)} />
            <p className="mt-3 text-[10px] text-white/30 flex items-start gap-1.5 leading-relaxed">
              <Info size={11} className="shrink-0 mt-0.5" />
              U.S. government datasets, retrieved {new Date(p.generatedAt).toLocaleDateString()}. Guidance only — not a flood determination, appraisal or tax advice.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default FederalContext;
