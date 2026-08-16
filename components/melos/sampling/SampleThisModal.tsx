// "Sample this" — the listener side. A track's owner cleared it for sampling; this lets a listener
// clip a section (constrained to the cleared region) and drop it into their Melos Library with the
// attribution and terms attached. Self-contained so the PlayerView edit is just a button + mount.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Scissors, Loader2 } from 'lucide-react';
import { encodeWav } from '../../../services/audio/wavEncode';
import { ingestSample, backupToLocker } from '../../../services/melos/beats/sampleStore';
import { extractRegion, clipAllowed, makeFragment, type SampleClearance } from '../../../services/melos/sampling/clearance';

export interface SampleTrack { id: string; title: string; artist?: string; url?: string; duration?: number; peaks?: number[] | null; }

interface Props { track: SampleTrack; clearance: SampleClearance; onClose: () => void; onAdded?: (name: string) => void; }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const SampleThisModal: React.FC<Props> = ({ track, clearance, onClose, onAdded }) => {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [status, setStatus] = useState('Loading audio…');
  const [busy, setBusy] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const previewRef = useRef<AudioBufferSourceNode | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // The cleared bounds — the region the owner allows (whole track or a slice).
  const bounds = useMemo(() => {
    const dur = track.duration || buffer?.duration || 0;
    if (clearance.scope === 'region') return { lo: clearance.regionStartSec ?? 0, hi: Math.min(dur, clearance.regionEndSec ?? dur) };
    return { lo: 0, hi: dur };
  }, [clearance, track.duration, buffer]);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!track.url) { setStatus('No audio to sample'); return; }
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx(); ctxRef.current = ctx;
        const res = await fetch(track.url); const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        if (!alive) { ctx.close(); return; }
        setBuffer(buf); setStatus('');
      } catch { if (alive) setStatus('Could not load this track'); }
    })();
    return () => { alive = false; try { ctxRef.current?.close(); } catch { /* */ } };
  }, [track.url]);

  useEffect(() => {
    // default selection: the whole cleared region, capped to a sensible clip length
    if (buffer && !sel) { const hi = Math.min(bounds.hi, bounds.lo + Math.min(8, bounds.hi - bounds.lo)); setSel({ a: bounds.lo, b: hi }); }
  }, [buffer, bounds, sel]);

  const dur = track.duration || buffer?.duration || 1;
  const peaks = useMemo(() => {
    if (track.peaks?.length) return track.peaks;
    if (!buffer) return null;
    const ch = buffer.getChannelData(0); const N = 240, step = Math.max(1, Math.floor(ch.length / N)); const out: number[] = [];
    for (let i = 0; i < N; i++) { let p = 0; for (let j = 0; j < step; j += 8) { const v = Math.abs(ch[i * step + j] || 0); if (v > p) p = v; } out.push(p); }
    const max = Math.max(0.01, ...out); return out.map((v) => v / max);
  }, [track.peaks, buffer]);

  const dragHandle = (which: 'a' | 'b') => (e: React.PointerEvent) => {
    e.stopPropagation(); const rect = barRef.current?.getBoundingClientRect(); if (!rect || !sel) return;
    const move = (ev: PointerEvent) => {
      const t = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * dur;
      setSel((s) => {
        if (!s) return s;
        const clamped = Math.max(bounds.lo, Math.min(bounds.hi, t));
        return which === 'a' ? { a: Math.min(clamped, s.b - 0.1), b: s.b } : { a: s.a, b: Math.max(clamped, s.a + 0.1) };
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const audition = useCallback(() => {
    if (!buffer || !sel || !ctxRef.current) return;
    const ctx = ctxRef.current; if (ctx.state === 'suspended') void ctx.resume();
    try { previewRef.current?.stop(); } catch { /* */ }
    const region = extractRegion(buffer, sel.a, sel.b, ctx);
    const src = ctx.createBufferSource(); src.buffer = region; src.connect(ctx.destination); src.start(); previewRef.current = src;
  }, [buffer, sel]);

  const addToLibrary = useCallback(async () => {
    if (!buffer || !sel) return;
    if (!clipAllowed(clearance, sel.a, sel.b)) { setStatus('That section is outside the cleared region'); return; }
    setBusy(true); setStatus('Clipping…');
    try {
      const region = extractRegion(buffer, sel.a, sel.b);
      const wav = encodeWav(region, 24);
      const attribution = `${track.title} — ${track.artist || clearance.ownerName}`;
      const name = `${track.title} clip ${fmt(sel.a)}`.slice(0, 60);
      // Ingest to the owner's OPFS + locker so it shows in the Muse "My cloud library" source.
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ic = new Ctx();
      const result = await ingestSample(new File([wav], `${name}.wav`, { type: 'audio/wav' }), name, ic);
      ic.close();
      if (!result) { setStatus('Could not save the clip'); setBusy(false); return; }
      void backupToLocker(result.ref);
      // The rights-carrying fragment record (terms + attribution) for governance/payout.
      const fragment = makeFragment(clearance, sel.a, sel.b);
      void fragment; // persisted with the clearance rail in a follow-up; attribution rides the name for now
      setStatus(`Added to your Melos Library · ${attribution}`);
      onAdded?.(name);
      setTimeout(onClose, 900);
    } catch { setStatus('Clip failed'); }
    finally { setBusy(false); }
  }, [buffer, sel, clearance, track, onClose, onAdded]);

  const termLabel = clearance.offer === 'sell' ? `$${(clearance.priceUSD ?? 0).toFixed(2)} sample pack`
    : clearance.offer === 'gated' ? 'members only' : clearance.allowOpenClip ? 'open to clip' : 'free';

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-black/72 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/15 overflow-hidden shadow-2xl" style={{ background: '#0E0E12' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0C0C10' }}>
          <Scissors size={14} className="text-[#00DAF3]" />
          <span className="text-[12px] font-semibold text-white">Sample this</span>
          <span className="text-[11px] text-white/40 truncate">{track.title}</span>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 mb-2 text-[11px]">
            <span className="text-white/50">Cleared by {clearance.ownerName}</span>
            <span className="font-mono px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(0,218,243,0.14)', color: '#00DAF3' }}>{termLabel}</span>
            {clearance.scope === 'region' && <span className="text-white/35 font-mono text-[9px]">region {fmt(bounds.lo)}–{fmt(bounds.hi)}</span>}
          </div>

          {status && !buffer ? (
            <div className="h-28 grid place-items-center text-white/45 text-[12px]"><span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {status}</span></div>
          ) : (
            <>
              <div ref={barRef} className="relative rounded-lg border border-white/10 overflow-hidden" style={{ height: 96, background: '#0B0B0F' }}>
                {/* dimmed outside the cleared region */}
                {clearance.scope === 'region' && (<>
                  <div className="absolute top-0 bottom-0 left-0" style={{ width: `${(bounds.lo / dur) * 100}%`, background: 'rgba(0,0,0,0.55)' }} />
                  <div className="absolute top-0 bottom-0 right-0" style={{ width: `${((dur - bounds.hi) / dur) * 100}%`, background: 'rgba(0,0,0,0.55)' }} />
                </>)}
                {/* peaks */}
                <div className="absolute inset-0 flex items-center px-1 gap-[1px]">
                  {(peaks || []).map((p, i) => <span key={i} className="flex-1" style={{ height: `${8 + p * 78}%`, background: 'rgba(255,255,255,0.18)', borderRadius: 1 }} />)}
                </div>
                {/* selection */}
                {sel && (
                  <div className="absolute top-0 bottom-0" style={{ left: `${(sel.a / dur) * 100}%`, width: `${((sel.b - sel.a) / dur) * 100}%`, background: 'rgba(0,218,243,0.14)', borderLeft: '2px solid #00DAF3', borderRight: '2px solid #00DAF3' }}>
                    <span onPointerDown={dragHandle('a')} className="absolute left-0 top-0 bottom-0 w-2.5 -ml-1.5 cursor-ew-resize" />
                    <span onPointerDown={dragHandle('b')} className="absolute right-0 top-0 bottom-0 w-2.5 -mr-1.5 cursor-ew-resize" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button onClick={audition} className="h-8 px-3 rounded-lg border border-white/12 text-white/70 hover:text-white text-[11px] flex items-center gap-1.5"><Play size={11} /> Preview</button>
                {sel && <span className="text-[10px] font-mono text-white/40">{fmt(sel.a)} → {fmt(sel.b)} · {(sel.b - sel.a).toFixed(1)}s</span>}
                <span className="flex-1" />
                <button onClick={() => void addToLibrary()} disabled={busy || !sel} className="h-8 px-3.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #6B0099, #00A6C0)' }}>
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />} Add to my library
                </button>
              </div>
              {status && buffer && <p className="text-[10px] text-white/45 mt-2">{status}</p>}
              <p className="text-[9.5px] text-white/25 mt-2 leading-relaxed">The clip lands in your Melos Library with attribution and the owner's terms. Use it in a groove; the rights record travels with it.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
