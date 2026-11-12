// One entry point for every live party game: picks the right play screen by kind, provides the host's
// controls (start / next / end), and the program overlay that burns the game into the live video.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Play, SkipForward } from 'lucide-react';
import SketchRushPlay from './SketchRushPlay';
import PartyPlay from './PartyPlay';
import { paintStrokes } from './sketchPaint';
import { subscribeLiveGame } from '../../services/liveGames/realtime';
import { liveGame, liveParty, failed, type AnyLiveKind } from '../../services/liveGames/client';
import { CANVAS_H, CANVAS_W, foldStrokes, type LiveGameDoc, type StrokeBatch } from '../../services/liveGames/core';
import { PARTY_TITLES, type PartyGameDoc } from '../../services/liveGames/party';

export const GAME_TITLES: Record<AnyLiveKind, string> = { sketch: 'Sketch Rush', ...PARTY_TITLES };
export const GAME_BLURBS: Record<AnyLiveKind, string> = {
  sketch: 'You draw, they guess. Faster guesses score more.',
  trivia: 'Rapid-fire trivia. Right and fast wins.',
  crowd: 'Answer like the crowd. The room’s answers make the board.',
  impostor: 'Everyone knows the word but the impostor. Clue, argue, vote.',
};
export const GAME_EMOJI: Record<AnyLiveKind, string> = { sketch: '🎨', trivia: '🧠', crowd: '📊', impostor: '🕵️' };

export default function LiveGamePlay({ gid, kind, compact, onOpenFull }: { gid: string; kind: AnyLiveKind; compact?: boolean; onOpenFull?: () => void }) {
  return kind === 'sketch' ? <SketchRushPlay gid={gid} compact={compact} onOpenFull={onOpenFull} /> : <PartyPlay gid={gid} compact={compact} onOpenFull={onOpenFull} />;
}

type AnyDoc = (LiveGameDoc | PartyGameDoc) & { kind: AnyLiveKind };

/** Live game doc + strokes for host-side UI (controls, overlay). */
export function useLiveDoc(gid: string | null) {
  const [game, setGame] = useState<AnyDoc | null>(null);
  const [strokes, setStrokes] = useState<StrokeBatch[]>([]);
  useEffect(() => { if (!gid) return; return subscribeLiveGame(gid, s => { setGame(s.game as AnyDoc | null); setStrokes(s.strokes); }); }, [gid]);
  return { game, strokes };
}

/** Start / next / end for the host. Sketch Rush rounds advance on their own; "Next" ends the current round early. */
export function HostControls({ gid, kind, onEnded, compact }: { gid: string; kind: AnyLiveKind; onEnded?: () => void; compact?: boolean }) {
  const { game } = useLiveDoc(gid);
  const [msg, setMsg] = useState('');
  const api = kind === 'sketch' ? liveGame : liveParty;
  const act = async (fn: () => Promise<any>) => { const r = await fn(); setMsg(failed(r) ? r.error : ''); };
  if (!game) return null;
  const btn = `flex items-center gap-1.5 rounded-xl font-bold ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {game.status === 'lobby' && <button onClick={() => act(() => api.start(gid))} className={`${btn} bg-white text-black`}><Play size={14} fill="currentColor" /> Start</button>}
      {game.status !== 'lobby' && game.status !== 'ended' && <button onClick={() => act(() => api.skip(gid))} className={`${btn} bg-white/15`}><SkipForward size={14} /> Next</button>}
      {game.status !== 'ended'
        ? <button onClick={() => { if (confirm('End the game for everyone?')) void act(() => api.end(gid)); }} className={`${btn} bg-white/15`}><Flag size={14} /> End</button>
        : onEnded && <button onClick={onEnded} className={`${btn} bg-white text-black`}>Done</button>}
      {msg && <span className="text-xs text-rose-300">{msg}</span>}
    </div>
  );
}

/** A program-overlay painter that reads the latest game state from a ref (the composer calls it every frame). */
export function useProgramOverlay(gid: string | null) {
  const { game, strokes } = useLiveDoc(gid);
  const ref = useRef<{ game: AnyDoc | null; strokes: StrokeBatch[] }>({ game: null, strokes: [] });
  ref.current = { game, strokes };
  return useMemo(() => (gid ? makeOverlay(() => ref.current) : null), [gid]);
}

function makeOverlay(get: () => { game: AnyDoc | null; strokes: StrokeBatch[] }) {
  return (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const { game, strokes } = get(); if (!game) return;
    const secs = game.status !== 'lobby' && game.status !== 'ended' ? Math.max(0, Math.ceil((game.phaseEndsAt - Date.now()) / 1000)) : 0;
    const portrait = H > W;
    const bw = portrait ? W * 0.92 : W * 0.46, bh = (bw * CANVAS_H) / CANVAS_W;
    const x = portrait ? (W - bw) / 2 : W - bw - W * 0.03, y = portrait ? H * 0.16 : (H - bh) / 2;
    const pad = Math.round(bw * 0.012), fs = Math.round(bh * 0.09);
    ctx.save();
    ctx.fillStyle = 'rgba(14,10,40,0.85)';
    ctx.fillRect(x - pad, y - bh * 0.16 - pad, bw + pad * 2, bh * 1.32 + pad * 2);
    ctx.textBaseline = 'middle';
    const title = GAME_TITLES[game.kind].toUpperCase();
    let head = title;
    if (game.kind === 'sketch') {
      const g = game as LiveGameDoc;
      paintStrokes(ctx, foldStrokes(strokes), x, y, bw, bh);
      head = g.status === 'drawing' ? g.hint.split('').join(' ') : g.status === 'reveal' ? g.revealWord.toUpperCase() : g.status === 'ended' ? 'GAME OVER' : title;
    } else {
      const g = game as PartyGameDoc;
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.font = `800 ${Math.round(fs * 0.85)}px system-ui, sans-serif`;
      const lines = wrap(ctx, g.status === 'lobby' ? 'Join from the post in your feed!' : g.status === 'ended' ? 'Thanks for playing!' : g.kind === 'impostor' ? `Category: ${g.prompt}` : g.prompt, bw - pad * 4).slice(0, 3);
      lines.forEach((l, i) => ctx.fillText(l, x + pad * 2, y + fs + i * fs * 1.05));
      const top = y + fs * 4.2;
      ctx.font = `700 ${Math.round(fs * 0.62)}px system-ui, sans-serif`;
      if (g.kind === 'trivia' && g.options.length) {
        const cols = ['#e11d48', '#0284c7', '#f59e0b', '#059669'];
        g.options.forEach((o, i) => {
          const cx = x + pad * 2 + (i % 2) * (bw / 2 - pad), cy = top + Math.floor(i / 2) * fs * 1.4, cw = bw / 2 - pad * 3;
          const lit = g.status !== 'reveal' || g.reveal?.correct === i;
          ctx.globalAlpha = lit ? 1 : 0.3; ctx.fillStyle = cols[i]; ctx.fillRect(cx, cy - fs * 0.55, cw, fs * 1.1);
          ctx.fillStyle = '#fff'; ctx.fillText(`${'ABCD'[i]}  ${o}`.slice(0, 30), cx + pad, cy); ctx.globalAlpha = 1;
        });
      } else if (g.status === 'reveal' && g.kind === 'crowd' && g.reveal?.board) {
        g.reveal.board.slice(0, 5).forEach((b, i) => { ctx.fillStyle = '#fff'; ctx.fillText(`${i + 1}. ${b.text}  ·  ${b.count}`, x + pad * 2, top + i * fs * 0.8); });
      } else if (g.status === 'reveal' && g.kind === 'impostor' && g.reveal) {
        ctx.fillStyle = g.reveal.caught ? '#6ee7b7' : '#fda4af';
        ctx.fillText(g.reveal.caught ? 'CAUGHT!' : 'THE IMPOSTOR ESCAPED!', x + pad * 2, top);
        ctx.fillStyle = '#fff'; ctx.fillText(`${g.reveal.impostors?.map(i => i.name).join(', ')} · word: ${g.reveal.word}`, x + pad * 2, top + fs * 0.9);
      } else if (g.status === 'vote') {
        g.clues.slice(0, 6).forEach((c, i) => { ctx.fillStyle = '#fff'; ctx.fillText(`${c.name}: “${c.text}”`.slice(0, 34), x + pad * 2 + (i % 2) * bw / 2, top + Math.floor(i / 2) * fs * 0.85); });
      } else if (g.status === 'answer') {
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(`${g.answered} answered · play from the feed post`, x + pad * 2, top);
      }
    }
    ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(head, x, y - bh * 0.08);
    if (secs > 0) { ctx.textAlign = 'right'; ctx.fillStyle = secs <= 5 ? '#ff5252' : '#fff'; ctx.fillText(`${secs}s`, x + bw, y - bh * 0.08); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffd54f'; ctx.font = `800 ${Math.round(fs * 0.7)}px system-ui, sans-serif`;
    const top3 = game.top.slice(0, 3).map((t, i) => `${i + 1}. ${t.name} ${t.score}`).join('   ');
    ctx.fillText(top3 || 'Play from the post in your feed to score!', x, y + bh + bh * 0.08);
    ctx.restore();
  };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
