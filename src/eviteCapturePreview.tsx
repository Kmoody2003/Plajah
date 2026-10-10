// Dev-only: record an invitation's motion as frames (pop-up reveal, then a slow tilt) for clips and reviews.
//   /evite-capture.html?plate=era/brutalist&h=Concrete%20%26%20Champagne&sub=...&venue=...
// window.__capture({ post: 'http://127.0.0.1:3199/frame?name=x' }) renders deterministic frames with the stage's
// snapshot(t, tilt) (art + light + parallax), crossfades the card's live text in on the reveal's headline curve, and
// POSTs each JPEG frame to `post` (&i=<n>). Frames are exact, so a hidden or throttled tab still records smoothly.
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import EviteCard from '../components/evite/EviteCard';
import type { EviteStageHandle } from '../components/evite/EviteStage';
import { paintCard, loadPlate } from '../services/evite/evitePrintRender';
import { ogCardLayout } from '../services/evite/eviteOg';
import { revealCurves, recipeFor } from '../services/evite/motionRecipes';
import { plateUrls } from '../services/evite/plateCatalog';
import { isEraId } from '../services/evite/eraIds';
import { cleanFields } from '../services/evite/eviteCore';

const q = new URLSearchParams(location.search);
const plateId = q.get('plate') || 'kids_boy/dino';
const fields = cleanFields({ headline: q.get('h') || 'You’re Invited', subline: q.get('sub') || '', venueName: q.get('venue') || '', startsAt: Date.UTC(2026, 10, 14, 0), timezone: 'America/New_York' });
const WIDTH = Number(q.get('w')) || 420;

function App() {
  const stage = useRef<EviteStageHandle>(null);
  (window as any).__stage = stage;
  return <div style={{ width: WIDTH, margin: 20 }}><EviteCard ref={stage} plateId={plateId} fields={fields} ctaLabel="RSVP" /></div>;
}
createRoot(document.getElementById('root')!).render(<App />);

async function look() {
  if (!isEraId(plateId)) return undefined;
  const era = await import('../services/evite/eraArt');
  const ev = era.eraEvite(plateId)!; await era.eraFontReady(ev.id);
  return { voice: era.eraVoice(ev.id), light: ev.light };
}
const revealMsOf = () => { const u = plateUrls(plateId); return u ? recipeFor(u.collection, u.subject).revealMs : 1800; };

(window as any).__capture = async (o: { post: string; fps?: number; tiltMs?: number; holdMs?: number; tilt?: number }) => {
  const s = (window as any).__stage.current as EviteStageHandle;
  const fps = o.fps || 30, revealMs = revealMsOf(), tiltMs = o.tiltMs ?? 3600, holdMs = o.holdMs ?? 500, amp = o.tilt ?? 0.8;
  const lk = await look();
  const accent = '#E8B923';
  const total = Math.round((revealMs + tiltMs + holdMs) / 1000 * fps);
  let cv: HTMLCanvasElement | null = null, full: HTMLCanvasElement | null = null;
  for (let i = 0; i < total; i++) {
    const t = i / fps * 1000;
    const tt = Math.max(0, t - revealMs) / tiltMs;            // 0..1 through the tilt sweep (a lazy figure eight)
    const ramp = Math.min(1, tt * 4) * Math.min(1, Math.max(0, (1 - tt) * 4));
    const tx = t < revealMs || tt > 1 ? 0 : Math.sin(tt * Math.PI * 2) * amp * ramp;
    const ty = t < revealMs || tt > 1 ? 0 : Math.sin(tt * Math.PI * 4) * amp * 0.45 * ramp;
    const url = s.snapshot(t, tx, ty);
    if (!url) throw new Error('stage not ready');
    const img = await loadPlate(url);
    if (!cv) { cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; full = document.createElement('canvas'); full.width = img.width; full.height = img.height; }
    const ctx = cv.getContext('2d')!, fctx = full!.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    paintCard(fctx, ogCardLayout(full!.width, full!.height), img, { inviteFields: fields, plateId, product: null as any, accent }, lk);
    ctx.globalAlpha = revealCurves(t, revealMs).headline; ctx.drawImage(full!, 0, 0); ctx.globalAlpha = 1;
    const blob = await new Promise<Blob>(r => cv!.toBlob(b => r(b!), 'image/jpeg', 0.88));
    await fetch(`${o.post}&i=${String(i).padStart(4, '0')}`, { method: 'POST', body: blob });
  }
  return { frames: total, fps, w: cv?.width, h: cv?.height };
};
