// "Watch with others now" — public parties whose host is live right now (active + public + fresh
// heartbeat). Tapping one joins in-app (same resolver/entitlement path as a ?party= link).
// Query: parties where isActive==true && visibility=='public' orderBy hostHeartbeat desc
// → composite index (isActive ASC, visibility ASC, hostHeartbeat DESC) in firestore.indexes.json.

import React, { useEffect, useState } from 'react';
import { Users, Play, BookOpen, Headphones } from 'lucide-react';
import { Party, listenToPublicParties, isPartyDiscoverable, tsToMs, openPartyInApp } from '../../services/partyService';
import { usePresence } from '../../hooks/usePresence';

const KIND_META: Record<string, { label: string; Icon: React.ComponentType<{ size?: number }> }> = {
  WATCH: { label: 'Watch party', Icon: Play },
  READ: { label: 'Read-along', Icon: BookOpen },
  LISTEN: { label: 'Listening party', Icon: Headphones },
};

const PartyCard: React.FC<{ p: Party }> = ({ p }) => {
  const { count } = usePresence(`party_${p.id}`, { publishSelf: false });
  const meta = KIND_META[p.kind] || KIND_META.WATCH;
  return (
    <button
      onClick={() => openPartyInApp(p.id)}
      className="group shrink-0 w-56 text-left rounded-2xl overflow-hidden bg-white/5 hover:bg-white/10 transition-colors"
      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="relative aspect-video bg-black/40">
        {p.content?.thumbnail && <img src={p.content.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy" />}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white"
          style={{ background: 'var(--pj-grad-brand)' }}>
          <meta.Icon size={10} /> {meta.label}
        </span>
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 text-[10px] font-bold text-white">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--pj-success)' }} />
          <Users size={10} /> {count}
        </span>
      </div>
      <div className="p-3">
        <div className="text-sm font-bold text-white truncate">{p.content?.title || 'Untitled'}</div>
        <div className="text-[11px] text-white/60 truncate">with {p.hostName || 'a host'}</div>
      </div>
    </button>
  );
};

const PublicPartiesRow: React.FC<{ className?: string }> = ({ className }) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => listenToPublicParties(setParties), []);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 15_000); return () => clearInterval(iv); }, []);

  const now = Date.now();
  const live = parties.filter(p => isPartyDiscoverable({ isActive: p.isActive, visibility: p.visibility, hostHeartbeatMs: tsToMs(p.hostHeartbeat) }, now));
  if (!live.length) return null;
  return (
    <section className={className} aria-label="Watch with others now">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--pj-magenta)' }} />
        <h2 className="text-sm font-black uppercase tracking-widest text-white">Watch with others now</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {live.map(p => <PartyCard key={p.id} p={p} />)}
      </div>
    </section>
  );
};

export default PublicPartiesRow;
