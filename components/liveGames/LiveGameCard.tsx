// A live party game (any of the four) inside a timeline post (post.liveGameEmbed). Scroll past it and you can play right
// there: the drawing is live, the guess box is on the card, and signed-out viewers join as guests in one tap.
// It only listens while it's on screen, so a feed full of games costs nothing off screen.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, X } from 'lucide-react';
import LiveGamePlay, { GAME_EMOJI, GAME_TITLES } from './LiveGamePlay';
import { sanitizeLiveGameEmbed, ensurePlayable } from '../../services/liveGames/client';

export default function LiveGameCard({ embed: raw }: { embed: unknown }) {
  const embed = React.useMemo(() => sanitizeLiveGameEmbed(raw), [raw]);
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [joined, setJoined] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const el = root.current; if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el); return () => io.disconnect();
  }, []);

  if (!embed) return null;
  return (
    <div ref={root} className="mt-3" onClick={e => e.stopPropagation()}>
      {visible || joined ? (
        joined
          ? <LiveGamePlay gid={embed.gid} kind={embed.kind} compact onOpenFull={() => setFull(true)} />
          : (
            <div className="relative">
              <LiveGamePlay gid={embed.gid} kind={embed.kind} compact />
              <button
                onClick={async () => { await ensurePlayable(); setJoined(true); }}
                className="absolute inset-x-6 bottom-5 flex items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-black uppercase tracking-widest text-black shadow-2xl"
              ><Play size={16} fill="currentColor" /> Tap to play</button>
            </div>
          )
      ) : (
        <div className="flex h-48 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#2a1458] to-[#0d1a3a] text-sm font-bold text-white/70"><span aria-hidden>{GAME_EMOJI[embed.kind]}</span> {GAME_TITLES[embed.kind]}</div>
      )}
      {full && createPortal(
        <div className="fixed inset-0 z-[180] overflow-y-auto bg-black/80 p-2 backdrop-blur sm:p-6">
          <div className="mx-auto max-w-5xl">
            <button onClick={() => setFull(false)} className="mb-2 ml-auto flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white"><X size={16} /> Close</button>
            <LiveGamePlay gid={embed.gid} kind={embed.kind} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
