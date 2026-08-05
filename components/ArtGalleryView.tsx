import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, X, ExternalLink, Palette, Frame, Loader2, ImageOff } from 'lucide-react';
import MuseumHall from './MuseumHall';
import { ART_MASTER_HALLS, ART_MASTER_FIGURES } from '../data/artMasters';
import {
  MOVEMENTS,
  fetchArtworksByMovement,
  type ArtWork,
  type MovementDef,
} from '../services/artMuseumService';

// ─────────────────────────────────────────────────────────────────────────────
// ArtGalleryView — the digital art museum.
//
//   Gallery  — public-domain works browsed by movement (Art Institute of Chicago
//              + The Met Open Access), a masonry wall → a lightbox with the full
//              high-res image and a link back to the source museum.
//   Masters  — the MuseumHall engine seeded with the art masters (task 3).
//
// Elegant, high-end aesthetic: lots of black, thin borders, generous spacing,
// uppercase tracking. Accent is a refined gold.
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = '#C9A55C';

type Tab = 'GALLERY' | 'MASTERS';

interface ArtGalleryViewProps {
  onBack: () => void;
  currentUser?: any;
}

// ── Lightbox ────────────────────────────────────────────────────────────────
const ArtLightbox: React.FC<{ work: ArtWork; onClose: () => void }> = ({ work, onClose }) => {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const overlay = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] bg-black/95 backdrop-blur-sm flex flex-col lg:flex-row"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/5 border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-all"
      >
        <X size={18} />
      </button>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16 min-h-0" onClick={e => e.stopPropagation()}>
        {!errored ? (
          <>
            {!loaded && <Loader2 size={30} className="animate-spin text-white/30 absolute" />}
            <motion.img
              key={work.id}
              src={work.imageUrl}
              alt={work.title}
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 0.97 }}
              transition={{ duration: 0.3 }}
              className="max-w-full max-h-full object-contain select-none shadow-2xl"
            />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/30">
            <ImageOff size={40} />
            <p className="text-[10px] font-black uppercase tracking-widest">Image unavailable</p>
          </div>
        )}
      </div>

      {/* Wall text */}
      <div
        className="w-full lg:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 p-8 lg:p-10 flex flex-col gap-6 overflow-y-auto scrollbar-hide bg-black/40"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: GOLD }}>
            {work.source === 'artic' ? 'Art Institute of Chicago' : 'The Metropolitan Museum'}
          </p>
          <h2 className="text-2xl font-black uppercase tracking-tight leading-tight mt-2">{work.title}</h2>
        </div>

        <div className="space-y-3 text-sm">
          {work.artist && (
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Artist</p>
              <p className="text-white/80 mt-1">{work.artist}</p>
            </div>
          )}
          {work.date && (
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Date</p>
              <p className="text-white/70 mt-1">{work.date}</p>
            </div>
          )}
          {work.medium && (
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Medium</p>
              <p className="text-white/60 mt-1 leading-relaxed">{work.medium}</p>
            </div>
          )}
        </div>

        <div className="mt-auto pt-6 border-t border-white/10 space-y-3">
          <span
            className="inline-block px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"
            style={{ background: `${GOLD}1f`, border: `1px solid ${GOLD}44`, color: GOLD }}
          >
            Public Domain
          </span>
          <a
            href={work.sourceUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all"
          >
            View at the museum <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

// ── Gallery tab (browse by movement) ─────────────────────────────────────────
const GalleryBrowser: React.FC = () => {
  const [movement, setMovement] = useState<MovementDef>(MOVEMENTS[2]); // Impressionism opens well
  const [works, setWorks] = useState<ArtWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ArtWork | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setWorks([]);
    fetchArtworksByMovement(movement.id, { limit: 30 }).then(w => {
      if (alive) { setWorks(w); setLoading(false); }
    });
    return () => { alive = false; };
  }, [movement.id]);

  return (
    <div className="space-y-6">
      {/* Movement chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {MOVEMENTS.map(m => {
          const active = m.id === movement.id;
          return (
            <button
              key={m.id}
              onClick={() => setMovement(m)}
              className="shrink-0 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
              style={active
                ? { background: GOLD, color: '#000', borderColor: 'transparent' }
                : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="text-[12px] text-white/40 leading-relaxed max-w-2xl">{movement.blurb}</p>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center gap-4">
          <Loader2 size={28} className="animate-spin" style={{ color: GOLD }} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Hanging the {movement.label} wing…</p>
        </div>
      ) : works.length === 0 ? (
        <div className="py-24 text-center rounded-3xl border border-white/8 bg-white/[0.02]">
          <Frame size={30} className="mx-auto text-white/10 mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">No works returned — the museum API may be resting. Try another wing.</p>
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
          {works.map(w => (
            <motion.button
              key={w.id}
              layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => setOpen(w)}
              className="group mb-3 w-full block break-inside-avoid rounded-xl overflow-hidden border border-white/8 bg-white/[0.02] relative text-left transition-all"
              onMouseEnter={e => (e.currentTarget.style.borderColor = `${GOLD}55`)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            >
              <img
                src={w.thumbUrl}
                alt={w.title}
                loading="lazy"
                className="w-full h-auto object-cover group-hover:scale-[1.03] transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                <p className="text-[10px] font-black uppercase tracking-tight leading-tight line-clamp-2">{w.title}</p>
                <p className="text-[8px] font-bold uppercase tracking-widest mt-1 line-clamp-1" style={{ color: GOLD }}>{w.artist}</p>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && <ArtLightbox work={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
};

// ── Shell ─────────────────────────────────────────────────────────────────────
const ArtGalleryView: React.FC<ArtGalleryViewProps> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('GALLERY');

  const tabs = useMemo(() => ([
    { id: 'GALLERY' as Tab, label: 'Gallery', icon: Frame },
    { id: 'MASTERS' as Tab, label: 'Masters', icon: Palette },
  ]), []);

  return (
    <div className="flex-1 bg-transparent text-theme-content overflow-y-auto custom-scrollbar pb-40">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-10">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.5em]" style={{ color: GOLD }}>The Plajah Gallery</p>
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-0.5">Museum of Art</h1>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10">
            {tabs.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                  style={active
                    ? { background: GOLD, color: '#000' }
                    : { color: 'rgba(255,255,255,0.45)' }}
                >
                  <t.icon size={13} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'GALLERY' && (
          <>
            <p className="text-sm text-white/40 italic max-w-2xl mb-8 leading-relaxed">
              A living collection of public-domain masterworks, drawn in real time from the open archives of the
              Art Institute of Chicago and The Metropolitan Museum of Art. Browse by movement; click any work to
              study it at full resolution.
            </p>
            <GalleryBrowser />
          </>
        )}

        {tab === 'MASTERS' && (
          <MuseumHall
            eyebrow="The Masters"
            title="Hands That Shaped Seeing"
            intro="Painters, photographers, architects, and sculptors across the eras. Portraits and biographies load live from Wikipedia; the curated notes are ours."
            halls={ART_MASTER_HALLS}
            figures={ART_MASTER_FIGURES}
            accent={GOLD}
            icon={Palette}
            shareDiscipline="Art"
          />
        )}
      </div>
    </div>
  );
};

export default ArtGalleryView;
