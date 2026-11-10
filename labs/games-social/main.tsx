// Games in Social lab: a mock Social timeline (post chrome only) around the real GameEmbedCard, plus a tiny
// notification tray wired to the real `game-challenge:` / `game-match:` deep links.
//   npx vite --config games-social-lab.vite.config.mjs  ->  http://127.0.0.1:3241/?as=alice
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import GameEmbedCard from '../../components/games/social/GameEmbedCard';
import { ChallengeButton } from '../../components/games/social/ChallengeButton';
import { postPlayableGame, openGameLink } from '../../services/gamerNet/socialClient';

interface LabPost { id: string; authorId: string; authorName: string; text: string; timestamp: number; gameEmbed?: unknown }
interface LabNotice { title: string; message: string; link: string }
const me = new URLSearchParams(location.search).get('as');

function Lab() {
  const [posts, setPosts] = useState<LabPost[]>([]);
  const [notices, setNotices] = useState<LabNotice[]>([]);
  const load = () => fetch('/lab/posts').then(r => r.json()).then(j => setPosts(j.posts));
  useEffect(() => { void load(); const h = setInterval(load, 4000); return () => clearInterval(h); }, []);
  useEffect(() => {
    if (!me) return;
    const h = setInterval(() => fetch(`/lab/notices?uid=${me}`).then(r => r.json()).then(j => setNotices(j.notices)), 2000);
    return () => clearInterval(h);
  }, []);
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 12px 80px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <b style={{ fontSize: 18 }}>Social</b>
        <span style={{ opacity: 0.5, fontSize: 12 }}>{me ? `signed in as ${me}` : 'signed out (add ?as=alice)'}</span>
        <span style={{ flex: 1 }} />
        {me && <button onClick={async () => { await postPlayableGame('ttt'); void load(); }} style={{ padding: '8px 12px', borderRadius: 999, background: '#fff', color: '#000', fontWeight: 800, fontSize: 12 }}>Post a game</button>}
      </header>
      {notices.length > 0 && (
        <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
          {notices.slice(-3).reverse().map((n, i) => (
            <button key={i} onClick={() => openGameLink(n.link)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 14, background: 'rgba(255,160,0,.12)', border: '1px solid rgba(255,160,0,.35)', fontSize: 13 }}>
              🔔 <b>{n.title}</b> — {n.message}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {posts.map(p => (
          <article key={p.id} style={{ padding: 14, borderRadius: 20, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#333', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{p.authorName[0]}</span>
              <div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{p.authorName}</b><div style={{ fontSize: 11, opacity: 0.45 }}>{new Date(p.timestamp).toLocaleTimeString()}</div></div>
              {me && p.authorId !== me && <ChallengeButton uid={p.authorId} name={p.authorName} source="profile" className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-fuchsia-400/30 text-fuchsia-200 inline-flex items-center gap-1" />}
            </div>
            <p style={{ fontSize: 14, opacity: 0.8, margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{p.text}</p>
            {!!p.gameEmbed && <GameEmbedCard embed={p.gameEmbed} postId={p.id} authorId={p.authorId} authorName={p.authorName} />}
          </article>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
