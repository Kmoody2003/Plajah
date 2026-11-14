// components/elevate/LeafPlayer.tsx
// The Leaf — RelloChurchViewer on a phone. A sheet of Vellum lies over the video and the thumb
// decides how much of each to see: Watch, Both or Read. The video fills whatever the paper leaves,
// so the gesture does the job of the desktop split and its Mount/Hide buttons.
//
// Starts as a card in the page and opens over everything. The same DOM moves between the two (see
// `host`), so a playing <video> carries on. Following pauses when the reader scrolls and never
// pulls the page back, the same rule as FollowAlong.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Type, Volume2, VolumeX, X } from 'lucide-react';
import type { BibleVerse } from '../../services/bibleService';
import { formatTC } from '../../services/serviceNotes';
import { EV, EV_FONT } from './vellum';
import '../../styles/elevate-leaf.css';

/** Phones in either orientation; a phone on its side is wider than the 767px mobile breakpoint. */
const PHONE_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)';

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, [query]);
  return on;
}

export const useLeafPhone = () => useMedia(PHONE_QUERY);
export const isLeafPhoneNow = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;

type Detent = 'watch' | 'both' | 'read';
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export interface LeafSkin { id: string; label: string; bg: string; ink: string; muted: string; num: string; mark: string }
export interface LeafSource { id: string; title: string; channel: string; live: boolean }
export interface LeafNote { id: string; timecodeSec: number; verseLabel: string; text: string }

interface LeafPlayerProps {
  /** The stage media, rendered once. Fills its box. */
  media: React.ReactNode;
  /** An embed takes its own touches, so the video box leaves them alone. */
  mediaIsEmbed: boolean;
  background: string;
  title: string;
  isLive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  label: string;
  verse: number;
  excerpt: string;
  verses: BibleVerse[];
  loading: boolean;
  translation: string;
  translations: { slug: string; label: string }[];
  onTranslation: (slug: string) => void;
  skin: LeafSkin;
  skins: readonly LeafSkin[];
  onSkin: (id: string) => void;
  sources: LeafSource[];
  activeSourceId: string;
  onPickSource: (id: string) => void;
  onOpenLiveTv?: () => void;
  inSanctuary: boolean;
  notes: LeafNote[];
  noteDraft: string;
  onNoteDraft: (v: string) => void;
  onAddNote: () => void;
  onJumpTo: (sec: number) => void;
  playheadSec: number;
  /** Move to the previous or next passage in this stream. */
  onStepCue?: (dir: 1 | -1) => void;
  onOpenStudy?: () => void;
}

type Frozen = Pick<LeafPlayerProps, 'label' | 'verse' | 'excerpt' | 'verses' | 'loading'>;

const LeafPlayer: React.FC<LeafPlayerProps> = props => {
  const { media, mediaIsEmbed, background, title, isLive, muted, onToggleMute, skin, playheadSec } = props;
  const land = useMedia(LANDSCAPE_QUERY);
  const [open, setOpen] = useState(false);
  const [det, setDet] = useState<Detent>('both');
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState<null | 'sources' | 'display' | 'notes'>(null);
  const [fit, setFit] = useState(false);
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [slip, setSlip] = useState(false);

  const slotRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const calledRef = useRef<HTMLParagraphElement>(null);
  const insetRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  // One element that moves between the page and <body>. React never remounts what's inside, so
  // the video keeps playing. (A portal whose target changes would remount it.)
  const host = useMemo(() => document.createElement('div'), []);
  useLayoutEffect(() => {
    (open ? document.body : slotRef.current)?.appendChild(host);
  }, [open, host]);
  useEffect(() => () => host.remove(), [host]);

  const shown: Frozen = frozen ?? props;
  const clampText = !open || (det === 'watch' && !dragging);

  const detents = useCallback(() => {
    const root = rootRef.current!;
    const inset = insetRef.current!;
    const H = root.clientHeight;
    const top = inset.offsetHeight;
    return {
      read: top + 78,
      both: Math.round(H * 0.42),
      watch: H - 170,
    } as Record<Detent, number>;
  }, []);

  /** Sheet at `t`; the video takes the space above it, and becomes a corner window at Read. */
  const place = useCallback((t: number) => {
    const root = rootRef.current;
    const v = videoRef.current;
    const paper = paperRef.current;
    const head = headRef.current;
    if (!root || !v || !paper || !head) return;
    const W = root.clientWidth;
    const D = detents();
    const p = clamp((t - D.read) / Math.max(1, D.both - D.read), 0, 1);
    const safeTop = insetRef.current!.offsetHeight;
    paper.style.top = `${t}px`;
    v.style.width = `${lerp(112, W, p)}px`;
    v.style.height = `${t >= D.both ? t + 24 : lerp(63, D.both + 24, p)}px`;
    v.style.left = `${lerp(W - 124, 0, p)}px`;
    v.style.top = `${lerp(safeTop + 8, 0, p)}px`;
    v.style.borderRadius = `${lerp(10, 0, p)}px`;
    head.style.paddingRight = `${lerp(128, 8, p)}px`;
  }, [detents]);

  const layout = useCallback(() => {
    const root = rootRef.current;
    const v = videoRef.current;
    const paper = paperRef.current; // not rendered on its side
    if (!root || !v) return;
    if (!open) {
      const vh = Math.round(root.clientWidth * 9 / 16);
      root.style.height = `${vh + 92}px`;
      if (slotRef.current) slotRef.current.style.minHeight = `${vh + 92}px`;
      Object.assign(v.style, { left: '0', top: '0', width: '100%', height: `${vh}px`, borderRadius: '0' });
      if (paper) paper.style.top = `${vh}px`;
      if (headRef.current) headRef.current.style.paddingRight = '8px';
      return;
    }
    root.style.height = '';
    if (land) {
      Object.assign(v.style, { left: '0', top: '0', width: '100%', height: '100%', borderRadius: '0' });
      if (headRef.current) headRef.current.style.paddingRight = '8px';
      return;
    }
    place(detents()[det]);
  }, [open, land, det, place, detents]);

  useLayoutEffect(layout, [layout]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (!dragRef.current) layout(); });
    ro.observe(root);
    return () => ro.disconnect();
  }, [layout]);

  // The page behind stays put while the Leaf is open.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, [open]);

  // Turning the phone on its side means watching.
  useEffect(() => { if (land) setOpen(true); }, [land]);

  // ── Drag the paper ──
  const dragRef = useRef<null | { offset: number; lastY: number; lastT: number; vel: number; top: number }>(null);
  const onGrabDown = (e: React.PointerEvent) => {
    if (!open || land || (e.target as HTMLElement).closest('button')) return;
    const top = parseFloat(paperRef.current!.style.top) || 0;
    dragRef.current = { offset: e.clientY - top, lastY: e.clientY, lastT: e.timeStamp, vel: 0, top };
    e.currentTarget.setPointerCapture(e.pointerId);
    rootRef.current!.classList.remove('ev-leaf-snap');
    setDragging(true);
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.vel = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const D = detents();
    d.top = clamp(e.clientY - d.offset, D.read, D.watch);
    place(d.top);
  };
  const snapTo = (next: Detent) => {
    rootRef.current?.classList.add('ev-leaf-snap');
    setDet(next);
    if (rootRef.current && !land) place(detents()[next]);
  };
  const onGrabEnd = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDragging(false);
    const D = detents();
    const order: Detent[] = ['read', 'both', 'watch'];
    let next = order.reduce((m, n) => (Math.abs(D[n] - d.top) < Math.abs(D[m] - d.top) ? n : m), 'both' as Detent);
    // A flick carries on to the next stop in its direction; a finger that stopped first doesn't count.
    if (Math.abs(d.vel) > 0.5 && e.timeStamp - d.lastT < 80) {
      next = d.vel > 0
        ? order.find(n => D[n] >= d.top) ?? 'watch'
        : [...order].reverse().find(n => D[n] <= d.top) ?? 'read';
    }
    snapTo(next);
  };

  // ── Following: reading pauses it, and the page never moves under a reading finger ──
  useEffect(() => {
    const b = bodyRef.current;
    const c = calledRef.current;
    if (!b || !c || frozen || clampText) return;
    b.scrollTop = Math.max(0, c.offsetTop - 6);
  }, [shown.label, shown.verse, shown.verses, frozen, clampText, det]);
  const pauseFollowing = () => {
    if (clampText || frozen) return;
    const { label, verse, excerpt, verses, loading } = props;
    setFrozen({ label, verse, excerpt, verses, loading });
  };

  // ── Swipe the paper sideways for the other passages ──
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => { const t = e.touches[0]; swipeRef.current = { x: t.clientX, y: t.clientY }; };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || !props.onStepCue) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 64 && Math.abs(t.clientY - s.y) < 40) {
      setFrozen(null);
      props.onStepCue(dx < 0 ? 1 : -1);
    }
  };

  // On its side the verse arrives as a slip, rests, then settles into a small reference.
  useEffect(() => {
    if (!land || !open) return;
    setSlip(true);
    const t = window.setTimeout(() => setSlip(false), 7000);
    return () => window.clearTimeout(t);
  }, [land, open, props.label]);

  const coverTap = () => {
    if (!open) setOpen(true);
    else if (det === 'read' && !land) snapTo('both');
  };

  useEffect(() => { if (sheet === 'notes') noteRef.current?.focus({ preventScroll: true }); }, [sheet]);

  const calledText = shown.verses.find(v => v.verse === shown.verse)?.text || shown.excerpt;
  const coverActive = !open || !mediaIsEmbed || (det === 'read' && !land);

  const ui = (
    <div
      ref={rootRef}
      className={`ev-scope ev-leaf ${open ? 'ev-leaf-open' : 'ev-leaf-card'} ${fit ? 'ev-leaf-fit' : ''}`}
      style={{ fontFamily: EV_FONT.ui }}
      role="region"
      aria-label={`${title} player`}
    >
      <div ref={insetRef} className="ev-leaf-inset" aria-hidden="true" />

      <div ref={videoRef} className="ev-leaf-video" style={{ background }}>
        {media}
        {coverActive && (
          <button
            type="button"
            className="ev-leaf-cover"
            aria-label={!open ? 'Open the player' : det === 'read' && !land ? 'Make the video bigger' : 'Video'}
            onClick={coverTap}
            onDoubleClick={() => { if (open) setFit(f => !f); }}
          />
        )}
      </div>

      <div ref={headRef} className="ev-leaf-head">
        <span className="ev-leaf-scrim" aria-hidden="true" />
        {open && (
          <button type="button" className="ev-leaf-round" aria-label="Close the player" onClick={() => { setOpen(false); setSheet(null); }}>
            <ChevronDown size={20} />
          </button>
        )}
        <button
          type="button"
          className="ev-leaf-title"
          onClick={() => (open ? setSheet('sources') : setOpen(true))}
          aria-label={open ? `${title}. See what else is on` : `Open ${title}`}
        >
          <span className="ev-leaf-state" style={{ color: isLive ? EV.ember : EV.gold }}>
            {isLive && <span className="ev-live-dot" />}{isLive ? 'Live' : 'Replay'}
          </span>
          <span className="ev-leaf-name">{title}</span>
        </button>
        <button type="button" className="ev-leaf-round" aria-label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {!land && (
        <div ref={paperRef} className="ev-leaf-paper" style={{ background: skin.bg, color: skin.ink }}>
          <div
            className="ev-leaf-grab"
            onPointerDown={onGrabDown}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabEnd}
            onPointerCancel={onGrabEnd}
            onClick={() => { if (!open) setOpen(true); }}
          >
            {open && <span className="ev-leaf-handle" style={{ background: skin.muted }} />}
            <div className="ev-leaf-refrow">
              <span className="ev-leaf-ref" style={{ color: skin.num }}>
                {shown.label} · {props.translation.toUpperCase()}
              </span>
              {open && (
                <span className="ev-leaf-actions" style={{ color: skin.muted }}>
                  <button type="button" aria-label="Reading display" onClick={() => setSheet('display')}><Type size={18} /></button>
                  <button type="button" aria-label="Add a note" onClick={() => setSheet('notes')}><Plus size={20} /></button>
                </span>
              )}
            </div>
          </div>

          <div
            ref={bodyRef}
            className={`ev-leaf-body ${clampText ? 'is-clamped' : ''}`}
            style={{ fontFamily: EV_FONT.scripture }}
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
            onTouchMove={pauseFollowing}
            onWheel={pauseFollowing}
            onClick={() => { if (!open) setOpen(true); }}
          >
            {clampText ? (
              <p className="ev-leaf-called">{calledText || 'Verses appear here as they are read.'}</p>
            ) : shown.verses.length === 0 ? (
              <p ref={calledRef} className="ev-leaf-called">
                {shown.loading ? 'Finding the passage…' : calledText || 'Verses appear here as they are read.'}
              </p>
            ) : (
              shown.verses.map(v => {
                const on = v.verse === shown.verse;
                return (
                  <p
                    key={v.verse}
                    ref={on ? calledRef : undefined}
                    className={on ? 'ev-leaf-called' : 'ev-leaf-verse'}
                    style={on ? { background: skin.mark } : { color: skin.ink }}
                  >
                    <sup style={{ color: skin.num }}>{v.verse}</sup>{v.text}
                  </p>
                );
              })
            )}
            {!clampText && det === 'read' && props.onOpenStudy && (
              <button type="button" className="ev-leaf-study" style={{ color: skin.num }} onClick={() => { setOpen(false); props.onOpenStudy?.(); }}>
                Open in Verse to study
              </button>
            )}
          </div>

          {frozen && (
            <button type="button" className="ev-leaf-jump" onClick={() => setFrozen(null)}>
              {isLive ? 'Back to the live verse' : 'Back to the service'}
            </button>
          )}
        </div>
      )}

      {land && open && (
        slip ? (
          <button type="button" className="ev-leaf-slip" onClick={() => setSlip(false)} aria-label="Hide verse" style={{ fontFamily: EV_FONT.scripture }}>
            <span className="ev-leaf-ref" style={{ color: EV.vellumGold, fontFamily: EV_FONT.ui }}>{props.label}</span>
            <span>{calledText}</span>
          </button>
        ) : (
          <button type="button" className="ev-leaf-chip" onClick={() => setSlip(true)} style={{ fontFamily: EV_FONT.scripture }}>{props.label}</button>
        )
      )}

      {open && sheet && (
        <div className="ev-leaf-sheetwrap">
          <button type="button" className="ev-leaf-backdrop" aria-label="Close" onClick={() => setSheet(null)} />
          <div className="ev-leaf-sheet" role="dialog" aria-modal="true">
            <div className="ev-leaf-sheethead">
              <h3 style={{ fontFamily: EV_FONT.display }}>
                {sheet === 'sources' ? 'Now playing' : sheet === 'display' ? 'Reading display' : `Note at ${formatTC(playheadSec)}`}
              </h3>
              <button type="button" className="ev-leaf-round" aria-label="Close" onClick={() => setSheet(null)}><X size={18} /></button>
            </div>

            {sheet === 'sources' && (
              <div className="ev-leaf-sheetbody">
                {props.sources.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="ev-leaf-row"
                    aria-pressed={s.id === props.activeSourceId}
                    onClick={() => { props.onPickSource(s.id); setSheet(null); setFrozen(null); }}
                  >
                    <span className="ev-leaf-rowtitle">{s.live && <span className="ev-live-dot" />}{s.title}</span>
                    <span className="ev-leaf-rowsub">{s.channel}</span>
                  </button>
                ))}
                {props.onOpenLiveTv && (
                  <button type="button" className="ev-leaf-row" onClick={props.onOpenLiveTv}>
                    <span className="ev-leaf-rowtitle">Watch in Live TV+</span>
                  </button>
                )}
                <p className="ev-leaf-fine">
                  {props.inSanctuary ? 'You’re in the sanctuary. ' : ''}
                  {isLive ? 'Verses follow the service team and the sermon.' : 'Verses follow the recording.'}
                </p>
              </div>
            )}

            {sheet === 'display' && (
              <div className="ev-leaf-sheetbody">
                <div className="ev-leaf-label">Translation</div>
                <div className="ev-leaf-chips">
                  {props.translations.map(t => (
                    <button key={t.slug} type="button" aria-pressed={t.slug === props.translation} onClick={() => props.onTranslation(t.slug)}>{t.label}</button>
                  ))}
                </div>
                <div className="ev-leaf-label">Paper</div>
                <div className="ev-leaf-chips">
                  {props.skins.map(s => (
                    <button key={s.id} type="button" aria-pressed={s.id === skin.id} onClick={() => props.onSkin(s.id)}>
                      <span className="ev-leaf-swatch" style={{ background: s.bg }} />{s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sheet === 'notes' && (
              <div className="ev-leaf-sheetbody">
                <form className="ev-leaf-noteform" onSubmit={e => { e.preventDefault(); props.onAddNote(); }}>
                  <input
                    ref={noteRef}
                    id="ev-leaf-note"
                    value={props.noteDraft}
                    onChange={e => props.onNoteDraft(e.target.value)}
                    placeholder={`A thought on ${props.label}`}
                    aria-label={`Note on ${props.label}`}
                  />
                  <button type="submit" disabled={!props.noteDraft.trim()}>Save</button>
                </form>
                {props.notes.map(n => (
                  <button key={n.id} type="button" className="ev-leaf-row" onClick={() => { props.onJumpTo(n.timecodeSec); setSheet(null); }}>
                    <span className="ev-leaf-rowsub">{formatTC(n.timecodeSec)} · {n.verseLabel}</span>
                    <span className="ev-leaf-rowtext">{n.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return <div ref={slotRef} className="ev-leaf-slot">{createPortal(ui, host)}</div>;
};

export default LeafPlayer;
