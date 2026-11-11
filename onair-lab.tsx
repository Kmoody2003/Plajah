import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { OnAirHostCard, HostCaption, useOnAirHost, useHostLine } from './components/radio/OnAirHost';
import OnAirBillboard from './components/ads/OnAirBillboard';

// The real pieces over the real /api/onair router (onair-lab.vite.config.mjs). ?t= sets the station clock.
const t = new URLSearchParams(location.search).get('t');
const TIMES: [string, string][] = [
  ['2026-11-09T12:30:00Z', 'Mon 7:30am · Mari'], ['2026-11-09T16:00:00Z', 'Mon 11am · Kit'], ['2026-11-09T21:00:00Z', 'Mon 4pm · Juno'],
  ['2026-11-10T01:00:00Z', 'Mon 8pm · open'], ['2026-11-10T04:00:00Z', 'Mon 11pm · Dez'], ['2026-11-10T08:00:00Z', 'Tue 3am · Nova'], ['2026-11-08T14:00:00Z', 'Sun 9am · Ray'],
];

const prev = { id: 'p', title: 'Fog Bell', artist: 'Orsolya Wren', plajahCreator: false, isPersonaArtist: true };
const next = { id: 'n', title: 'Quarter in the Machine', artist: 'Remi Lux', isPersonaArtist: true };

const Lab: React.FC = () => {
  const onAir = useOnAirHost();
  const line = useHostLine(onAir.host, { kind: 'between', prev, next });
  const fill = useHostLine(onAir.host, { kind: 'fill-in', next, channelName: 'Plajah Horror Classics', maxSec: 12 });
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-8">
      <nav className="flex flex-wrap gap-2 text-xs">
        {TIMES.map(([iso, label]) => (
          <a key={iso} href={`?t=${iso}`} className={`rounded-full border px-3 py-1 ${iso === t ? 'border-[#FF8C00] text-white' : 'border-white/15 text-white/50'}`}>{label}</a>
        ))}
      </nav>
      <section>
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Plajah FM page</h2>
        <OnAirHostCard host={onAir.host} next={onAir.next} line={line} />
      </section>
      <section>
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">Side pillar</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {['show', 'vyra', 'orsolya', 'remi'].map((f, i) => (
            <div key={f} className="relative w-80 h-[560px] shrink-0 rounded-2xl overflow-hidden border border-white/10">
              <OnAirBillboard focus={f} onListen={() => alert('→ Plajah FM')} dotCount={4} dotIdx={i} />
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-3">TV break filled by Plajah FM</h2>
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-[#22003f] to-black border border-white/10">
          {onAir.host && fill && <HostCaption host={onAir.host} text={fill.text} />}
          {!onAir.host && <p className="absolute inset-0 grid place-items-center text-white/40 text-sm">Unhosted hour: music only, no caption</p>}
        </div>
      </section>
    </div>
  );
};

(async () => {
  if (t) await fetch(`/lab/time?t=${encodeURIComponent(t)}`);
  createRoot(document.getElementById('root')!).render(<Lab />);
})();
