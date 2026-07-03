import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Search, Boxes, RefreshCw, Landmark } from 'lucide-react';
import {
  searchArtifacts, fetchArtifactsByCollection,
  type Artifact, type ArtifactCollection, type ArtifactSource,
} from '../services/artifactsService';

// A reusable, live artifact wall over the free/keyless museum & archaeology APIs.
// Shared by the Archaeology and World History studios. Give it a set of curated
// collections; users can also free-search. Click any object for a full lightbox.

interface Props {
  collections: ArtifactCollection[];
  accent?: string;
  sources?: ArtifactSource[];
  intro?: string;
}

const ArtifactCard: React.FC<{ a: Artifact; accent: string; onOpen: () => void }> = ({ a, accent, onOpen }) => (
  <button onClick={onOpen} className="group text-left rounded-2xl overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all"
    onMouseEnter={e => (e.currentTarget.style.borderColor = `${accent}55`)} onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
    <div className="aspect-square bg-black/40 relative overflow-hidden">
      <img src={a.thumbUrl} alt={a.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
    <div className="p-2.5">
      <p className="text-[11px] font-bold text-white leading-tight line-clamp-1">{a.title}</p>
      <p className="text-[9px] text-white/40 mt-0.5 line-clamp-1">{a.culture}{a.date ? ` · ${a.date}` : ''}</p>
    </div>
  </button>
);

const ArtifactModal: React.FC<{ a: Artifact; accent: string; onClose: () => void }> = ({ a, accent, onClose }) => {
  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-3xl rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[90vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 border border-white/15 flex items-center justify-center hover:bg-black/80"><X size={15} /></button>
        <div className="bg-black flex items-center justify-center max-h-[60vh] overflow-hidden">
          <img src={a.imageUrl} alt={a.title} className="max-h-[60vh] w-auto object-contain" />
        </div>
        <div className="p-5">
          <h2 className="text-xl font-black leading-tight">{a.title}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            {a.culture && <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase" style={{ background: `${accent}22`, border: `1px solid ${accent}44`, color: accent }}>{a.culture}</span>}
            {a.date && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{a.date}</span>}
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/40">{a.source}</span>
          </div>
          {a.medium && <p className="mt-3 text-[13px] text-white/60">{a.medium}</p>}
          {a.provenance && <p className="mt-1 text-[11px] text-white/35">Provenance: {a.provenance}</p>}
          <div className="mt-4 flex gap-2 flex-wrap">
            <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white">
              View at museum <ExternalLink size={11} />
            </a>
            {a.model3dUrl && (
              <a href={a.model3dUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest" style={{ borderColor: `${accent}55`, color: accent }}>
                3D model <Boxes size={11} />
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

const ArtifactBrowser: React.FC<Props> = ({ collections, accent = '#C9A55C', sources, intro }) => {
  const [active, setActive] = useState<string>(collections[0]?.id ?? '');
  const [items, setItems] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Artifact | null>(null);

  const load = useCallback(async (collectionId: string, query?: string) => {
    setLoading(true);
    setItems([]);
    try {
      if (query && query.trim()) {
        setItems(await searchArtifacts(query.trim(), { sources, limit: 36 }));
      } else {
        const c = collections.find(x => x.id === collectionId) ?? collections[0];
        if (c) setItems(await fetchArtifactsByCollection(c, { sources, limit: 36 }));
      }
    } finally { setLoading(false); }
  }, [collections, sources]);

  useEffect(() => { if (active) load(active); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {intro && <p className="text-[12px] text-white/45 leading-relaxed">{intro}</p>}

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); load(active, q); }} className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" size={16} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search artifacts — 'bronze', 'Maya', 'amphora'…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/25" />
      </form>

      {/* Collection chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {collections.map(c => {
          const isOn = active === c.id && !q;
          return (
            <button key={c.id} onClick={() => { setQ(''); setActive(c.id); }}
              className="shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border"
              style={isOn ? { background: accent, color: '#000', borderColor: 'transparent' } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
              {c.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="py-16 text-center">
          <RefreshCw size={26} className="mx-auto animate-spin" style={{ color: accent }} />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mt-3">Excavating the collections…</p>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="py-16 text-center rounded-3xl border border-white/8 bg-white/[0.02]">
          <Landmark size={30} className="mx-auto text-white/10 mb-3" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white/30">No objects found — try another search or collection</p>
          <p className="text-[10px] text-white/15 mt-1">Live from The Met, Art Institute of Chicago & Cleveland Museum of Art</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {items.map(a => <ArtifactCard key={a.id} a={a} accent={accent} onOpen={() => setOpen(a)} />)}
      </div>

      <AnimatePresence>
        {open && <ArtifactModal a={open} accent={accent} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default ArtifactBrowser;
