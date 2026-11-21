// Themed Shows inside Tela.
//
//   TelaShowDevice  — a show placed on a canvas (MEDIA device with `show`): plays live with
//                     ShowPlayer; the owner can reopen it in the studio ("Edit show").
//   TelaPresenter   — full-screen presenting of a document, frame by frame. A frame that holds
//                     a show presents shot by shot (→ / Space / PageDown / click advance, ← back),
//                     and moves to the next frame after the last shot. Other frames show as pages.
//   makeShowDoc     — a new PRESENTATION document whose only frame is the show (Tela → New → Photo show).
//
// One source of truth: the device stores only a TelaShowRef; the show lives in the owner's
// account and its published copy (services/slideshow/cloudShows).

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Pencil, Play, X } from 'lucide-react';
import { Button, IconButton } from '../ui';
import type { TelaDevice, TelaDoc, TelaFrame, TelaMediaDevice, TelaShowRef } from '../../types';
import type { ShowPlayerHandle } from '../photo/show/ShowPlayer';
import type { ShowRef } from '../../services/slideshow/cloudShows';

const ShowPlayer = lazy(() => import('../photo/show/ShowPlayer'));

export const TELA_EDIT_SHOW = 'tela:edit-show';

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export function telaShowRef(r: ShowRef, prev?: TelaShowRef): TelaShowRef {
  return { owner: r.owner, id: r.id, title: r.title, cover: r.cover, publishedAt: r.publishedAt || Date.now(), ...(prev?.mode ? { mode: prev.mode } : {}) };
}

/** A MEDIA device that plays a show (kind IMAGE + cover src as the fallback for other surfaces). */
export function showDevice(r: ShowRef, width = 1920, height = 1080): TelaMediaDevice {
  return {
    id: uid('dev'), type: 'MEDIA', kind: 'IMAGE', name: r.title || 'Photo show', src: r.cover || '', mimeType: 'image/jpeg', size: 0,
    width, height, show: telaShowRef(r),
  };
}

/** Tela → New → Photo show: a presentation document of the show. */
export function makeShowDoc(r: ShowRef, ownerId: string, id: string): TelaDoc {
  const now = Date.now();
  const device = showDevice(r);
  const frame: TelaFrame = { id: uid('frame'), kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: 1920, h: 1080, deviceIds: [device.id], label: r.title || 'Photo show' };
  return { id, ownerId, title: r.title || 'Photo show', docType: 'PRESENTATION', frames: [frame], devices: { [device.id]: device }, bindings: [], createdAt: now, updatedAt: now };
}

export const docHasShow = (doc: TelaDoc | null | undefined) => !!doc && Object.values(doc.devices).some((d) => d.type === 'MEDIA' && !!d.show);

const loading = <div className="w-full aspect-video grid place-items-center bg-black"><Loader2 className="animate-spin" size={20} /></div>;

export function TelaShowDevice({ device, readOnly }: { device: TelaMediaDevice; readOnly?: boolean }) {
  const r = device.show!;
  const [viewer, setViewer] = useState<string | null>(null);
  useEffect(() => { void import('../../services/slideshow/cloudShows').then((m) => setViewer(m.signedInUid())); }, []);
  const canEdit = !readOnly && viewer === r.owner;
  return (
    <div className="relative w-full h-full flex flex-col justify-center bg-black" onPointerDown={(e) => e.stopPropagation()} data-testid="tela-show">
      <Suspense fallback={loading}>
        <ShowPlayer showRef={r} mode={r.mode || 'timeline'} controls="full" />
      </Suspense>
      {canEdit && (
        <div className="absolute right-2 top-2 z-[2]">
          <Button size="sm" variant="primary" icon={<Pencil />} data-testid="tela-edit-show"
            onClick={() => window.dispatchEvent(new CustomEvent(TELA_EDIT_SHOW, { detail: { deviceId: device.id, show: r } }))}>Edit show</Button>
        </div>
      )}
    </div>
  );
}

// --- presenting ------------------------------------------------------------------------

type Renderer = (device: TelaDevice) => React.ReactNode;

export function TelaPresenter({ doc, startFrameId, render, onExit }: { doc: TelaDoc; startFrameId?: string | null; render: Renderer; onExit: () => void }) {
  const frames = doc.frames;
  const [i, setI] = useState(() => Math.max(0, frames.findIndex((f) => f.id === startFrameId)));
  const frame = frames[Math.min(i, frames.length - 1)];
  const boxRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ShowPlayerHandle>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  const showDev = useMemo(() => frame?.deviceIds.map((id) => doc.devices[id]).find((d): d is TelaMediaDevice => d?.type === 'MEDIA' && !!d.show), [frame, doc.devices]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && !document.fullscreenElement) void el.requestFullscreen?.().catch(() => {});
    const onFs = () => { if (!document.fullscreenElement) onExit(); };
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('resize', onResize);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((dir: 1 | -1) => {
    const p = playerRef.current;
    if (showDev && p && p.duration > 0) {
      // shot by shot inside the show, then on to the next frame
      const before = p.time;
      const atEnd = dir > 0 ? before >= p.duration - 0.6 : before <= 0.6;
      if (!atEnd) { if (dir > 0) p.next(); else p.prev(); return; }
    }
    setI((k) => Math.max(0, Math.min(frames.length - 1, k + dir)));
  }, [showDev, frames.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onExit(); return; }
      if (['ArrowRight', 'PageDown', 'ArrowDown'].includes(e.key)) { e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === ' ') { e.preventDefault(); if (showDev && playerRef.current) playerRef.current.toggle(); else go(1); }
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(frames.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onExit, showDev, frames.length]);

  if (!frame) return null;
  // fit the frame (or a 16:9 stage for a show) inside the screen
  const fw = showDev ? 16 : frame.w, fh = showDev ? 9 : frame.h;
  const k = Math.min(vp.w / fw, vp.h / fh);
  const w = fw * k;
  const pageScale = Math.min(vp.w / frame.w, vp.h / frame.h);

  return (
    <div ref={boxRef} className="fixed inset-0 z-[500] bg-black flex items-center justify-center select-none" data-testid="tela-presenter">
      {showDev ? (
        <div style={{ width: w }}>
          <Suspense fallback={loading}>
            <ShowPlayer key={showDev.id} ref={playerRef} showRef={showDev.show!} mode={showDev.show!.mode || 'timeline'} controls="none" autoPlay allowModeSwitch={false} />
          </Suspense>
        </div>
      ) : (
        <div onClick={() => go(1)} style={{ width: frame.w * pageScale, height: frame.h * pageScale, overflow: 'hidden', background: frame.kind === 'PAPER' ? '#fff' : '#111' }}>
          <div style={{ width: frame.w, height: frame.h, transform: `scale(${pageScale})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
            {frame.deviceIds.map((id) => doc.devices[id]).filter(Boolean).map((d) => <div key={d.id} style={{ width: '100%', height: '100%' }}>{render(d)}</div>)}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity pj-surface pj-surface--3 rounded-full px-2 py-1">
        <IconButton size="sm" variant="ghost" aria-label="Back" onClick={() => go(-1)}><ChevronLeft /></IconButton>
        {showDev && <IconButton size="sm" variant="ghost" aria-label="Play or pause" onClick={() => playerRef.current?.toggle()}><Play /></IconButton>}
        <span className="type-body-sm tabular-nums px-1">{i + 1} / {frames.length}</span>
        <IconButton size="sm" variant="ghost" aria-label="Next" onClick={() => go(1)}><ChevronRight /></IconButton>
        <IconButton size="sm" variant="ghost" aria-label="Stop presenting" onClick={onExit}><X /></IconButton>
      </div>
    </div>
  );
}
