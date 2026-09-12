// BreakdownImporter — pick a saved Chora Track Breakdown and score its parts onto new Melos instrument
// tracks (Melody/Harmony/Bass/Accent). Composer P3. Reads the breakdowns Chora already saved to
// localStorage ('plajah_breakdowns_v1') directly, so Melos doesn't pull in the heavy Chora component.
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Music4, ArrowRight } from 'lucide-react';
import type { BreakdownLike } from '../../../../services/melos/composition/breakdownToTracks';

interface StoredBreakdown extends BreakdownLike { trackId: string; savedAt?: number; }

function loadBreakdowns(): StoredBreakdown[] {
  try {
    const all = JSON.parse(localStorage.getItem('plajah_breakdowns_v1') || '{}') as Record<string, StoredBreakdown>;
    return Object.values(all)
      .filter((b) => b?.theory?.notes?.length)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } catch { return []; }
}

interface Props { onImport: (bd: BreakdownLike) => void; onClose: () => void; }

export default function BreakdownImporter({ onImport, onClose }: Props) {
  const items = useMemo(loadBreakdowns, []);
  const [busy, setBusy] = useState<string | null>(null);

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
      <div className="relative w-full max-w-lg max-h-[82vh] flex flex-col bg-[#100e16] border border-white/10 rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/8">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/30">Score from Chora</p>
            <h3 className="text-base font-black tracking-tight text-white">Import a track breakdown</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
          {items.length === 0 ? (
            <div className="py-16 text-center text-white/25">
              <Music4 size={28} className="mx-auto mb-3" />
              <p className="text-[11px] font-black uppercase tracking-widest">No breakdowns yet</p>
              <p className="text-[11px] text-white/30 mt-2 max-w-xs mx-auto">Open a song in Chora and run its Breakdown — it'll show up here to score into Melos.</p>
            </div>
          ) : items.map((b) => {
            const roles = new Set((b.theory?.notes || []).map((n) => n.role));
            return (
              <button key={b.trackId} disabled={!!busy} onClick={() => { setBusy(b.trackId); onImport(b); onClose(); }}
                className="group w-full text-left px-3 py-3 rounded-2xl hover:bg-white/[0.05] border border-transparent hover:border-white/10 transition-colors flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#8B5CFF]/15 border border-[#8B5CFF]/30 grid place-items-center shrink-0"><Music4 size={16} className="text-[#D0BCFF]" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">{b.trackTitle || 'Untitled'}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest truncate">
                    {b.trackArtist || 'Unknown'} · {b.theory?.key || '—'} · {b.theory?.tempo || '—'} BPM · {(b.theory?.notes || []).length} notes
                  </p>
                  <div className="flex gap-1 mt-1">
                    {['MELODY', 'HARMONY', 'BASS', 'ACCENT'].filter((r) => roles.has(r as any)).map((r) => (
                      <span key={r} className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF]/70 bg-[#8B5CFF]/10 border border-[#8B5CFF]/25 rounded-full px-1.5 py-0.5">{r}</span>
                    ))}
                  </div>
                </div>
                <ArrowRight size={16} className="text-white/25 group-hover:text-white shrink-0" />
              </button>
            );
          })}
        </div>
        <div className="px-6 py-2.5 border-t border-white/8 text-center">
          <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest">Creates one instrument track per part · edit freely after</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
