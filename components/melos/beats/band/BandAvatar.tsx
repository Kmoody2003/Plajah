// A session player's portrait: their photo (public/band/<id>.webp, made by
// scripts/band/generateBandPortraits.mjs) or, until it exists, their colour and a silhouette — with
// their instrument on a badge and a ring that lights while they're sounding.

import React from 'react';
import { AudioWaveform, Church, Drum, Guitar, Hand, Megaphone, Music2, Music3, Music4, Piano, Users, Wind } from 'lucide-react';
import type { BandPlayer, BandRole } from '../../../../services/melos/beats/band/roster';

const ICON: Record<BandRole, React.FC<{ size?: number; className?: string }>> = {
  drums: Drum, percussion: Hand, bass: Music3, guitar: Guitar, piano: Piano, organ: Church, synth: AudioWaveform,
  cello: Music2, violin: Music2, trumpet: Megaphone, sax: Music4, woodwinds: Wind, orchestra: Users,
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const BandAvatar: React.FC<{ player: BandPlayer; size?: number; lit?: boolean; dim?: boolean }> = ({ player, size = 44, lit, dim }) => {
  const Icon = ICON[player.role];
  const h = hash(player.id);
  const hair = h % 4;
  const initials = player.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
  const gid = `bav-${player.id}`;
  const [photo, setPhoto] = React.useState(true);
  const ring = lit ? `0 0 0 2px ${player.color}, 0 0 14px ${player.color}aa` : '0 0 0 1px rgba(255,255,255,0.12)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, opacity: dim ? 0.45 : 1 }} aria-hidden>
      {photo && (
        <img src={`/band/${player.id}.webp`} alt="" width={size} height={size} loading="lazy" onError={() => setPhoto(false)}
          className="rounded-full block object-cover absolute inset-0" style={{ width: size, height: size, zIndex: 1, boxShadow: ring, transition: 'box-shadow 120ms' }} />
      )}
      <svg viewBox="0 0 48 48" width={size} height={size} className="rounded-full block" style={{ boxShadow: ring, transition: 'box-shadow 120ms' }}>
        <defs>
          <radialGradient id={gid} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor={player.color} stopOpacity="0.95" />
            <stop offset="100%" stopColor="#1A1024" />
          </radialGradient>
        </defs>
        <circle cx="24" cy="24" r="24" fill={`url(#${gid})`} />
        {/* shoulders + head */}
        <path d="M6 48c2-10 9-14 18-14s16 4 18 14z" fill="#140C1C" opacity="0.85" />
        <circle cx="24" cy="21" r="9" fill="#140C1C" opacity="0.85" />
        {hair === 0 && <path d="M15 19c1-7 6-10 9-10s8 3 9 10c-2-3-5-5-9-5s-7 2-9 5z" fill="#0B0710" />}
        {hair === 1 && <circle cx="24" cy="15" r="7" fill="#0B0710" />}
        {hair === 2 && <path d="M14 22c-1-9 5-14 10-14s11 5 10 14l-2-4c-2-3-5-4-8-4s-6 1-8 4z" fill="#0B0710" />}
        {hair === 3 && <path d="M16 16c3-5 13-5 16 0z" fill="#0B0710" />}
        <text x="24" y="44" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" opacity="0.75" fontFamily="system-ui">{initials}</text>
      </svg>
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center border border-black/40" style={{ width: size * 0.42, height: size * 0.42, background: player.color, zIndex: 2 }}>
        <Icon size={Math.round(size * 0.26)} className="text-black/80" />
      </span>
    </div>
  );
};
