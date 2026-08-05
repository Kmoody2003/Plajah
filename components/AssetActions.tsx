import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NotebookPen, Star, Send, Share2, Check, Link2, X } from 'lucide-react';
import {
  saveToNotebook, addToInterests,
  externalShareTargets, openExternalShare, nativeShareOrCopy,
  type AcademicAsset,
} from '../services/academicSocial';
import { auth } from '../services/firebase';
import ShareToPlajahComposer from './ShareToPlajahComposer';

// Reusable "social layer" action bar for any academic item — figures, artifacts,
// styles, sites, civilizations. Drop it into any detail modal with a normalized
// AcademicAsset. Save to notebook · add to interests · post to Plajah · share out.

interface Props { asset: AcademicAsset; accent?: string; }

const AssetActions: React.FC<Props> = ({ asset, accent = '#C9A55C' }) => {
  const [toast, setToast] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [shareOpen, setShareOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const timer = useRef<any>(null);
  const flash = (msg: string) => { setToast(msg); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 2200); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onNotebook = () => { flash(saveToNotebook(asset) ? 'Saved to your notebook' : 'Could not save'); };
  const onInterest = async () => {
    setBusy('interest');
    const r = await addToInterests(asset);
    setBusy('');
    flash(r === 'added' ? 'Added to your interests' : r === 'signin' ? 'Sign in to add interests' : 'Could not add');
  };
  const onPlajah = () => {
    if (!auth.currentUser) { flash('Sign in to share'); return; }
    setComposerOpen(true);
  };
  const onNative = async () => {
    const r = await nativeShareOrCopy(asset);
    if (r === 'copied') flash('Link copied');
    setShareOpen(false);
  };

  const btn = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-40';

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={onNotebook} className={btn} title="Save to your research notebook"><NotebookPen size={12} /> Notebook</button>
        <button onClick={onInterest} disabled={busy === 'interest'} className={btn} title="Add to your interests"><Star size={12} style={{ color: accent }} /> Interest</button>
        <button onClick={onPlajah} className={btn} title="Compose a post to Plajah"><Send size={12} /> Post</button>
        <button onClick={() => setShareOpen(o => !o)} className={btn} title="Share to X, Facebook and more"><Share2 size={12} /> Share</button>
      </div>

      <AnimatePresence>
        {shareOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 mt-2 right-0 w-48 p-2 bg-[#141419] border border-white/12 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between px-1.5 pb-1.5">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/35">Share to</span>
              <button onClick={() => setShareOpen(false)} className="text-white/25 hover:text-white/60"><X size={12} /></button>
            </div>
            {externalShareTargets(asset).map(t => (
              <button key={t.id} onClick={() => { openExternalShare(t); setShareOpen(false); }}
                className="w-full text-left px-2.5 py-2 rounded-xl text-[11px] font-bold text-white/70 hover:bg-white/[0.06] hover:text-white transition-all">
                {t.label}
              </button>
            ))}
            <button onClick={onNative} className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-xl text-[11px] font-bold text-white/70 hover:bg-white/[0.06] hover:text-white transition-all border-t border-white/8 mt-1 pt-2">
              <Link2 size={12} /> Copy link / more…
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold" style={{ color: accent }}>
            <Check size={12} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {composerOpen && (
          <ShareToPlajahComposer
            asset={asset}
            accent={accent}
            onClose={() => setComposerOpen(false)}
            onPosted={() => flash('Shared to Plajah')}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssetActions;
