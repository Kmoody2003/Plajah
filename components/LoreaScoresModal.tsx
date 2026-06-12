// ─── Lorea Scores — library + viewer for transcribed sheet music ──────────────
// Opens on the global 'OPEN_LOREA_SCORES' event. Lists the user's saved scores
// and renders the selected one as real engraved notation (SheetMusic), with a
// one-click MusicXML download for MuseScore / Finale / Sibelius.

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Music2, FileMusic, ChevronLeft } from 'lucide-react';
import SheetMusic from './SheetMusic';
import { listScores, downloadMusicXml, type LoreaScore } from '../services/loreaScoreService';

const LoreaScoresModal: React.FC<{ onClose: () => void; initialTrackId?: string }> = ({ onClose, initialTrackId }) => {
  const [scores, setScores] = useState<LoreaScore[] | null>(null);
  const [selected, setSelected] = useState<LoreaScore | null>(null);
  const [showListOnMobile, setShowListOnMobile] = useState(true);

  useEffect(() => {
    let alive = true;
    listScores().then(s => {
      if (!alive) return;
      setScores(s);
      const pick = (initialTrackId && s.find(x => x.trackId === initialTrackId)) || s[0] || null;
      setSelected(pick);
      if (pick) setShowListOnMobile(false);
    });
    return () => { alive = false; };
  }, [initialTrackId]);

  const pick = (s: LoreaScore) => { setSelected(s); setShowListOnMobile(false); };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9997] bg-black/92 backdrop-blur-xl flex flex-col"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
            <FileMusic size={16} className="text-purple-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-purple-300/70">Lorea · Scores</p>
            <p className="text-sm font-black text-white">Your transcribed sheet music</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/12 flex items-center justify-center transition-colors shrink-0">
            <X size={14} className="text-white/50" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* List */}
          <div className={`${showListOnMobile ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-72 lg:w-80 border-r border-white/[0.06] overflow-y-auto custom-scrollbar shrink-0`}>
            {scores === null ? (
              <p className="text-[10px] text-white/30 p-5">Loading…</p>
            ) : scores.length === 0 ? (
              <div className="p-6 text-center">
                <Music2 size={22} className="text-white/15 mx-auto mb-2" />
                <p className="text-[11px] text-white/40">No scores yet.</p>
                <p className="text-[9px] text-white/25 mt-1">Open any track's Breakdown and tap “Export notation to Lorea.”</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {scores.map(s => (
                  <button key={s.id} onClick={() => pick(s)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${selected?.id === s.id ? 'bg-purple-500/15 border border-purple-500/25' : 'hover:bg-white/[0.04] border border-transparent'}`}>
                    <p className="text-[11px] font-black text-white truncate">{s.title.replace(/ — Score$/, '')}</p>
                    <p className="text-[9px] text-white/40 truncate">{s.artist}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {s.key && <span className="text-[7px] font-black uppercase tracking-wider text-purple-300/70 bg-purple-500/10 rounded px-1.5 py-0.5">{s.scale || s.key}</span>}
                      {s.tempo > 0 && <span className="text-[7px] font-black uppercase tracking-wider text-white/40 bg-white/[0.05] rounded px-1.5 py-0.5">{s.tempo} BPM</span>}
                      <span className="text-[7px] font-black uppercase tracking-wider text-white/30 bg-white/[0.05] rounded px-1.5 py-0.5">{s.timeSignature}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Viewer */}
          <div className={`${showListOnMobile ? 'hidden' : 'flex'} md:flex flex-col flex-1 min-w-0 overflow-y-auto custom-scrollbar`}>
            {selected ? (
              <div className="p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => setShowListOnMobile(true)} className="md:hidden w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
                    <ChevronLeft size={14} className="text-white/60" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-white truncate">{selected.title.replace(/ — Score$/, '')}</p>
                    <p className="text-[10px] text-white/40 truncate">
                      {selected.artist} · {selected.scale || selected.key} · {selected.tempo} BPM · {selected.timeSignature}
                      {selected.backend ? ` · ${selected.backend}` : ''}
                    </p>
                  </div>
                  {selected.musicXml && (
                    <button onClick={() => downloadMusicXml(selected)}
                      className="flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 hover:bg-emerald-500/25 px-3 py-2 transition-colors shrink-0">
                      <Download size={13} className="text-emerald-300" />
                      <span className="text-[10px] font-black text-emerald-200">MusicXML</span>
                    </button>
                  )}
                </div>

                {selected.notation ? (
                  <div className="bg-[#0b0b0b] border border-white/[0.06] rounded-2xl p-3 sm:p-4 overflow-x-auto custom-scrollbar">
                    <SheetMusic notation={selected.notation} color="#e5e7eb" measuresPerSystem={4} />
                  </div>
                ) : selected.imageDataUrl ? (
                  <img src={selected.imageDataUrl} alt="score" className="w-full rounded-2xl border border-white/[0.06]" />
                ) : (
                  <p className="text-[11px] text-white/30 italic">This score has no rendered notation — download the MusicXML to open it.</p>
                )}

                <p className="text-[8px] text-white/20 mt-3">
                  Notation transcribed from the recording (melody + bass). Inner harmony is approximate — open the MusicXML in a notation editor to refine.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[11px] text-white/30">Select a score to view its notation.</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/** Mount once near the app root. Opens on window 'OPEN_LOREA_SCORES'
 *  (detail.trackId optional) and shows a brief toast on 'LOREA_SCORE_SAVED'. */
export const LoreaScoresController: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [trackId, setTrackId] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const openHandler = (e: Event) => {
      setTrackId((e as CustomEvent<{ trackId?: string }>).detail?.trackId);
      setOpen(true);
    };
    const savedHandler = (e: Event) => {
      const title = (e as CustomEvent<{ title?: string }>).detail?.title ?? 'Score';
      setToast(`${title.replace(/ — Score$/, '')} saved to Lorea`);
      setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener('OPEN_LOREA_SCORES', openHandler);
    window.addEventListener('LOREA_SCORE_SAVED', savedHandler);
    return () => {
      window.removeEventListener('OPEN_LOREA_SCORES', openHandler);
      window.removeEventListener('LOREA_SCORE_SAVED', savedHandler);
    };
  }, []);

  return (
    <>
      {open && <LoreaScoresModal initialTrackId={trackId} onClose={() => setOpen(false)} />}
      <AnimatePresence>
        {toast && (
          <motion.button
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            onClick={() => { setToast(null); window.dispatchEvent(new CustomEvent('OPEN_LOREA_SCORES')); }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-black px-4 py-2.5 shadow-xl">
            <FileMusic size={14} />
            <span className="text-[11px] font-black">{toast} · View</span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
};

export default LoreaScoresModal;
