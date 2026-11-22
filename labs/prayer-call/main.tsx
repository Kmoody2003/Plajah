// Prayer Call lab — a mock ministry page over the real /api/elevate/prayer-call route (in-memory, see
// prayer-call-lab.vite.config.mjs). Switch who you are, start a call as a leader, join as a member,
// add simulated people, and jump the server clock to the 5-minute warning or the 60-minute end.
//   ?as=pastor|deacon|staff|ruth|joe|ana|tim   ?org=gf|shop   ?ministry=pray|youth
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PrayerCallCard from '../../components/elevate/prayerCall/PrayerCallCard';
import { configurePrayerCallClient } from '../../services/elevate/prayerCallClient';

const q = new URLSearchParams(location.search);
const as = q.get('as') || 'pastor';
const orgId = q.get('org') || 'gf';
const ministryId = q.get('ministry') || 'pray';
configurePrayerCallClient({ base: '/api/elevate/prayer-call', headers: async () => ({ 'x-lab-uid': as }), uid: () => as });

const PEOPLE: Array<{ uid: string; label: string }> = [
  { uid: 'pastor', label: 'Pastor Grace (pastor)' },
  { uid: 'deacon', label: 'Deacon Sam (ministry head)' },
  { uid: 'staff', label: 'Mia (staff in ministry)' },
  { uid: 'ruth', label: 'Ruth (member)' },
  { uid: 'joe', label: 'Joe (prayer warrior)' },
  { uid: 'tim', label: 'Tim (youth only: outsider)' },
];
const ORG = orgId === 'shop' ? { id: 'shop', name: 'Corner Bookshop', orgType: 'BRAND' as const } : { id: 'gf', name: 'Great Faith Church', orgType: 'CHURCH' as const };
const MINISTRY = ministryId === 'youth' ? { id: 'youth', name: 'Youth Ministry', emoji: '🔥' } : { id: 'pray', name: 'Intercessory Prayer', emoji: '🙏' };

const link = (patch: Record<string, string>) => { const n = new URLSearchParams(location.search); Object.entries(patch).forEach(([k, v]) => n.set(k, v)); return `?${n}`; };
const asUser = (uid: string, path: string, init?: RequestInit) =>
  fetch(`/api/elevate/prayer-call${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'x-lab-uid': uid } }).then(r => r.json());
const clock = (body: object) => fetch('/__lab/clock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function Lab() {
  const [info, setInfo] = useState<{ livekit: boolean } | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { void fetch('/__lab/info').then(r => r.json()).then(setInfo); }, []);

  const addPeople = async () => {
    for (const uid of ['ruth', 'joe', 'ana', 'deacon']) if (uid !== as) await asUser(uid, `/?orgId=${orgId}&ministryId=${ministryId}&here=1`);
    await asUser('joe', '/requests', { method: 'POST', body: JSON.stringify({ orgId, ministryId, op: 'add', text: 'Strength for my brother starting chemo this week.' }) });
    await asUser('ruth', '/requests', { method: 'POST', body: JSON.stringify({ orgId, ministryId, op: 'add', text: 'Traveling mercies for the mission team.' }) });
    setNote('Ruth, Joe, Ana and Deacon Sam checked in; two prayer requests added. The room shows them on its next poll (≤10 s).');
  };

  return (
    <div className="min-h-[100dvh] text-white">
      <div className="sticky top-0 z-[110] bg-[#15131f]/95 backdrop-blur border-b border-white/10 px-3 py-2 text-[12px] flex flex-wrap items-center gap-2" data-testid="lab-bar">
        <b className="text-amber-200 mr-1">Prayer Call lab</b>
        <span className="text-white/45">You are:</span>
        {PEOPLE.map(p => (
          <a key={p.uid} href={link({ as: p.uid })} className={`px-2 h-7 inline-flex items-center rounded-full ${p.uid === as ? 'bg-amber-300 text-black font-bold' : 'bg-white/10 text-white/75'}`}>{p.label}</a>
        ))}
        <a href={link({ org: orgId === 'shop' ? 'gf' : 'shop' })} className="px-2 h-7 inline-flex items-center rounded-full bg-white/10 text-white/75">{orgId === 'shop' ? 'Back to church' : 'Try a business org'}</a>
        <span className="w-full sm:w-auto sm:ml-auto flex flex-wrap gap-2">
          <button onClick={addPeople} className="px-2 h-7 rounded-full bg-white/10">+ Simulate members</button>
          <button onClick={() => clock({ leftMs: 5 * 60_000 + 3000 })} className="px-2 h-7 rounded-full bg-white/10">Jump to 5 min left</button>
          <button onClick={() => clock({ leftMs: 50_000 })} className="px-2 h-7 rounded-full bg-white/10">Jump to 50 s left</button>
          <button onClick={() => clock({ leftMs: -1000 })} className="px-2 h-7 rounded-full bg-white/10">Jump past the end</button>
          <button onClick={() => clock({ reset: true }).then(() => location.reload())} className="px-2 h-7 rounded-full bg-white/10">Reset</button>
          <span className="text-white/40 self-center">media: {info ? (info.livekit ? 'LiveKit' : 'local preview (no LiveKit)') : '…'}</span>
        </span>
        {note && <div className="w-full text-white/55">{note}</div>}
      </div>

      {/* Stand-in for MinistryPage's header, with the real card below it. */}
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-6">← {ORG.name}</div>
        <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>{MINISTRY.emoji} {MINISTRY.name}</h1>
        <p className="text-sm text-white/60 mb-6">Tuesdays 7:00 PM · Led by Deacon Sam Reed</p>
        <PrayerCallCard org={ORG} ministry={MINISTRY} pollMs={3000} />
        <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Department Thread</h2>
        <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5 text-white/40 text-sm">(thread)</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
