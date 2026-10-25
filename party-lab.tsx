// Lab: the listening-party room visuals with demo data (no Firebase session needed).
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import PartyEnergyGraph from './components/party/PartyEnergyGraph';
import { PartyPollCard, PartyPollComposer } from './components/party/PartyPolls';
import { AudienceSentimentAlbum, AudienceSentimentTrack } from './components/chora/musicIntel/AudienceSentiment';
import { summarizeParty, mergeAudience, buildAudienceCards, albumEnergySeries } from './services/musicIntel/audience';
import { buildAutoPoll } from './services/partyEngagement';
import ReleaseAnalyticsView from './components/music/ReleaseAnalyticsView';

const tracks = [
  { id: 't1', title: 'Moonbreaker', durationSec: 214 },
  { id: 't2', title: 'Low Tide Hymn', durationSec: 187 },
  { id: 't3', title: 'Glass Cathedral', durationSec: 251 },
];
const rnd = (seed: number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const r = rnd(7);
const chat: any[] = [], reactions: any[] = [];
const burst = (trackId: string, at: number, n: number, emoji: string) => { for (let i = 0; i < n; i++) reactions.push({ uid: `u${i % 9}`, emoji, atSec: at + r() * 6, trackId }); };
burst('t1', 62, 22, '🔥'); burst('t1', 150, 9, '😍'); burst('t2', 95, 6, '❤️'); burst('t3', 31, 5, '👏'); burst('t3', 180, 31, '🎉'); burst('t3', 205, 12, '🔥');
chat.push(
  { uid: 'u1', name: 'Ana Ruiz', text: 'that bass drop at 1:02 is unreal', atSec: 63, trackId: 't1' },
  { uid: 'u2', name: 'Ben Okafor', text: 'chills. every time.', atSec: 151, trackId: 't1' },
  { uid: 'u3', name: 'Cy', kind: 'gif', gifUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', text: 'GIF', atSec: 64, trackId: 't1' },
  { uid: 'u4', name: 'Dee Marsh', text: 'this one made me cry a little', atSec: 96, trackId: 't2' },
  { uid: 'u1', name: 'Ana Ruiz', text: 'the key change!!!', atSec: 182, trackId: 't3' },
);
const polls: any[] = [
  { id: 'auto_t1', kind: 'rating', question: 'Rate Moonbreaker', auto: true, trackId: 't1', createdBy: 'h', createdAt: 0 },
  { id: 'auto_t2', kind: 'choice', question: 'How did Low Tide Hymn make you feel?', auto: true, trackId: 't2', createdBy: 'h', createdAt: 0, options: [{ id: 'hyped', label: '🔥 Hyped' }, { id: 'calm', label: '🌙 Calm' }, { id: 'nostalgic', label: '🥹 Nostalgic' }, { id: 'moved', label: '💜 Moved' }] },
];
const votes: any = {
  auto_t1: [5, 5, 4, 5, 4, 5, 3, 5].map((v, i) => ({ uid: `u${i}`, value: v, atSec: 200, trackId: 't1' })),
  auto_t2: ['moved', 'moved', 'calm', 'nostalgic', 'moved', 'calm'].map((v, i) => ({ uid: `u${i}`, value: v })),
};
const recap = (id: string) => summarizeParty({ partyId: id, albumId: 'lab', hostId: 'h', startedAt: 1, endedAt: 2, tracks, chat, reactions, polls, votes, listeners: 11 });
const aud = mergeAudience([recap('p1'), recap('p2')]);
const order = tracks.map(t => t.id);
const bundle: any = { audience: aud, cards: buildAudienceCards(aud, order), energy: albumEnergySeries(aud, order) };

const demoPoll = buildAutoPoll({ id: 't3', title: 'Glass Cathedral' }, 2, null, 'h', 230);

// ?view=creator → the release analytics page, with the creator endpoint stubbed from the same demo data
const creatorBundle: any = {
  album: { id: 'lab', title: 'Moonbreaker (lab)', artist: 'Lab', cover: '', tracks },
  sessions: [recap('p1'), recap('p2')], liveParties: ['p2'],
  audience: aud, energy: bundle.energy, cards: bundle.cards,
};
const realFetch = window.fetch.bind(window);
window.fetch = ((input: any, init?: any) => String(input).includes('/audience/lab/creator')
  ? Promise.resolve(new Response(JSON.stringify(creatorBundle), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  : realFetch(input, init)) as typeof fetch;

const Lab = () => (
  <div style={{ maxWidth: 980, margin: '0 auto', padding: 24 }} className="space-y-10 normal-case">
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-white/60 mb-3">Live room energy (party panel)</h2>
      <div style={{ maxWidth: 340 }}>
        <PartyEnergyGraph songs={bundle.energy} currentTrackId="t3" currentSec={190} height={64} />
      </div>
    </section>
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-white/60 mb-3">Poll card · composer (host)</h2>
      <div className="grid gap-4 md:grid-cols-2" style={{ maxWidth: 740 }}>
        <PartyPollCard partyId="lab" poll={demoPoll} canHost={false} getMoment={() => ({})} />
        <PartyPollComposer partyId="lab" getMoment={() => ({})} onClose={() => {}} />
      </div>
    </section>
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-white/60 mb-3">Music Intelligence → Audience sentiment (everyone, no party needed)</h2>
      <AudienceSentimentAlbum data={bundle} onPlayAt={(id, s) => console.log('play', id, s)} />
      <div className="mt-8"><AudienceSentimentTrack data={bundle} trackId="t3" onPlayAt={(id, s) => console.log('play', id, s)} /></div>
    </section>
  </div>
);

const creator = new URLSearchParams(location.search).get('view') === 'creator';
createRoot(document.getElementById('root')!).render(creator ? <ReleaseAnalyticsView albumId="lab" onBack={() => {}} /> : <Lab />);
