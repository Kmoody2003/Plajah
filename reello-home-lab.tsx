// Lab for the Reello home top: sample videos / live feeds, no Firebase.
//   ?live=0 → nobody live    ?shorts=0 → no vertical masters (fallback lane)
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ReelloHomeTop from './components/reello/ReelloHomeTop';

const q = new URLSearchParams(location.search);
const now = Date.now();
const pic = (s: string, w = 1280, h = 720) => `https://picsum.photos/seed/${s}/${w}/${h}`;
const SAMPLE = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const videos: any[] = Array.from({ length: 12 }, (_, i) => {
  const vertical = q.get('shorts') !== '0' && i % 2 === 1;
  return {
    id: `v${i}`, title: vertical ? `Short ${i} — late night loop` : `Long form ${i}: the making of a record`,
    artist: ['Nova Ray', 'Kite Lane', 'Mara Voss', 'Delta Hymn'][i % 4], ownerId: `u${i % 4}`, ownerName: ['Nova Ray', 'Kite Lane', 'Mara Voss', 'Delta Hymn'][i % 4],
    ownerPhoto: pic(`face${i % 4}`, 120, 120), thumbnailUrl: vertical ? pic(`s${i}`, 720, 1280) : pic(`l${i}`),
    url: SAMPLE, verticalVideoUrl: vertical ? SAMPLE : undefined,
    timestamp: now - i * 3600_000, likesCount: 900 - i * 50, commentsCount: 40 + i, playsCount: 12000 - i * 700,
  };
});
const liveFeeds: any[] = q.get('live') === '0' ? [] : [
  { id: 'f1', ownerId: 'u0', ownerName: 'Nova Ray', ownerPhoto: pic('face0', 120, 120), title: 'Late set + Q&A', url: 'livestream:abc', timestamp: now, status: 'LIVE', viewerCount: 1840 },
  { id: 'f2', ownerId: 'u2', ownerName: 'Mara Voss', ownerPhoto: pic('face2', 120, 120), title: 'Speedpaint a poster', url: 'livestream:def', timestamp: now, status: 'LIVE' },
];

const Lab = () => {
  const [log, setLog] = useState('');
  const say = (s: string) => setLog(s);
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <ReelloHomeTop
        videos={videos} liveFeeds={liveFeeds} followedIds={new Set(['u1'])}
        onPlay={v => say(`play ${v.title}`)} onOpenShort={v => say(`short ${v.title}`)}
        onOpenLive={f => say(`live ${f.title}`)} onSetFormat={f => say(`format ${f}`)}
        onVisitUser={u => say(`visit ${u}`)} onGoLive={() => say('go live')}
      />
      <p id="log" style={{ opacity: 0.5, fontSize: 12 }}>{log}</p>
    </div>
  );
};
createRoot(document.getElementById('root')!).render(<Lab />);
