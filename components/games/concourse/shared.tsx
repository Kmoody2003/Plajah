// Shared pieces for the Concourse games home + game pages.
import React, { useEffect } from 'react';
import type { PlajahGameEntry, PlajahGameCategory } from '../../../data/plajahGamesCatalog';
import { gamer, isSignedIn } from '../../../services/gamerNet/client';
import './concourse.css';

/** Display face for the games pages only (the app shell does not load Outfit). Added once, never removed. */
export function useConcourseFont() {
  useEffect(() => {
    const id = 'gcx-outfit-font';
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;900&display=swap';
    document.head.appendChild(l);
  }, []);
}

export const SHELVES: { id: string; label: string; note: string; match: (g: PlajahGameEntry) => boolean }[] = [
  { id: 'flagship', label: 'Flagship worlds', note: 'Big 3D worlds', match: g => g.category === 'ADVENTURE_3D' || g.id === 'era-clash-3d' },
  { id: 'kith', label: 'Kith Party', note: 'Couch and phone party games with the Kith', match: g => g.category === 'KITH_PARTY' },
  { id: 'era', label: 'Era Clash', note: '2D fighter and 3D campaign', match: g => g.category === 'ERA_CLASH' },
  { id: 'parlor', label: 'Parlor, board & word', note: 'Host on stream, join from the feed', match: g => g.category === 'PARLOR_BOARD_WORD' },
];

export const CATEGORY_LABEL: Record<PlajahGameCategory, string> = {
  ERA_CLASH: 'Era Clash', ADVENTURE_3D: 'Flagship worlds', KITH_PARTY: 'Kith Party', PARLOR_BOARD_WORD: 'Parlor, board & word',
};

export const FLAGSHIP_IDS = ['ravencrest', 'era-clash-3d', 'era-clash-2d'] as const;

/** Shorter names for tight spots (hero picks, cards). */
export const shortTitle = (g: PlajahGameEntry) => g.title.replace(/^Era Clash: 2D Arcade Fighter$/, 'Era Clash').replace(/ \(3D\)$/, '');

export const inviteUrl = (g: PlajahGameEntry) => `${window.location.origin}/?view=games&game=${encodeURIComponent(g.id)}`;

export async function copyInvite(g: PlajahGameEntry): Promise<string> {
  const url = inviteUrl(g);
  try { await navigator.clipboard.writeText(url); return `Invite link copied for ${g.title}. Send it in any Plajah chat or DM.`; }
  catch { return `Share this link: ${url}`; }
}

/** Record a launch on the player's ledger (LOCAL_PLAY, never scored) so "Jump back in" follows them across devices. */
export function logPlay(g: PlajahGameEntry) {
  if (!isSignedIn()) return;
  void gamer.local(g.id, undefined, 'local');
}

export function GameThumb({ game, shot = 0, alt }: { game: PlajahGameEntry; shot?: number; alt?: string }) {
  if (game.capturePending || !game.thumbnailUrl) {
    return <div className="gcx-cover" style={{ ['--gx-h' as any]: game.accentColor }} aria-hidden><span>{game.coverGlyph ?? '◆'}</span></div>;
  }
  const url = game.screenshots[shot]?.url ?? game.thumbnailUrl;
  return <img src={url} alt={alt ?? `${game.title} gameplay`} loading="lazy" />;
}

export function Avatar({ name, photo, size }: { name?: string; photo?: string; size?: number }) {
  const style = size ? { width: size, height: size } : undefined;
  return <span className="gcx-av" style={style}>{photo ? <img src={photo} alt="" /> : (name || '?').trim().charAt(0).toUpperCase()}</span>;
}
