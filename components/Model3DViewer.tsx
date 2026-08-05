import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, ExternalLink, Boxes, RotateCcw } from 'lucide-react';

// On-platform 3D viewer overlay. Embeds a museum's 3D model viewer (Smithsonian
// Voyager, Sketchfab, provider viewers…) in an iframe so the user never leaves
// Plajah. Some hosts block framing (X-Frame-Options); a load-timeout surfaces a
// clear "open in new tab" fallback so the model is always reachable.

interface Props { url: string; title?: string; accent?: string; onClose: () => void; }

const Model3DViewer: React.FC<Props> = ({ url, title, accent = '#D4A017', onClose }) => {
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // If the frame hasn't loaded in a few seconds it's almost certainly blocked.
  React.useEffect(() => {
    const t = setTimeout(() => { if (!loaded) setBlocked(true); }, 6000);
    return () => clearTimeout(t);
  }, [loaded]);

  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] bg-black/95 backdrop-blur-sm flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <Boxes size={16} style={{ color: accent }} />
          <p className="text-[11px] font-black uppercase tracking-widest text-white/70 truncate">{title || '3D Scan'}</p>
          <span className="hidden sm:inline text-[8px] font-black uppercase tracking-widest text-white/25 px-2 py-0.5 rounded-full border border-white/10">Interactive · drag to rotate</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
            Open source <ExternalLink size={11} />
          </a>
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
            style={{ background: `${accent}22`, border: `1px solid ${accent}44`, color: accent }}>
            <X size={13} /> Exit
          </button>
        </div>
      </div>

      {/* Frame */}
      <div className="relative flex-1 min-h-0" onClick={e => e.stopPropagation()}>
        {!loaded && !blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <RotateCcw size={28} className="animate-spin" style={{ color: accent }} />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Loading the 3D scan…</p>
          </div>
        )}
        {blocked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
            <Boxes size={40} className="text-white/15" />
            <div>
              <p className="text-sm font-black text-white/70">This museum viewer can’t be embedded here</p>
              <p className="text-[11px] text-white/35 mt-1">Its host blocks in-page framing. Open it in a new tab to explore the 3D scan.</p>
            </div>
            <a href={url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest"
              style={{ background: accent, color: '#000' }}>
              Open 3D scan <ExternalLink size={13} />
            </a>
          </div>
        ) : (
          <iframe
            title={title || '3D scan'}
            src={url}
            className="w-full h-full border-0 bg-black"
            allow="autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer"
            allowFullScreen
            onLoad={() => setLoaded(true)}
          />
        )}
      </div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

export default Model3DViewer;
