import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Check, Hash, Users, Landmark } from 'lucide-react';
import { auth } from '../services/firebase';
import { createPost, createClubPost, fetchUserClubs } from '../services/backendService';
import { Club } from '../types';
import UniversalPostComposer, { ComposerPostData } from './UniversalPostComposer';
import {
  academicPrefillText, academicPrefillAttachments, type AcademicAsset,
} from '../services/academicSocial';

// Full-screen share flow for academic / Plajah Labs assets. Opens the Universal
// Post Composer with the asset prepopulated (interactive 3D scan when available,
// otherwise the image) and editable text, then lets the author choose where it
// lands: the source discipline's feed or the Plajah social feed, plus a searchable
// dropdown to cross-post to other disciplines and their clubs.

// ── Discipline registry (mirrors services/labsApiService LabsDisciplineId) ──────
const DISCIPLINES: { id: string; label: string }[] = [
  { id: 'astronomy', label: 'Astronomy' }, { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' }, { id: 'biology', label: 'Biology' },
  { id: 'cs', label: 'Computer Science' }, { id: 'engineering', label: 'Engineering' },
  { id: 'mathematics', label: 'Mathematics' }, { id: 'neuroscience', label: 'Neuroscience' },
  { id: 'earth', label: 'Earth Science' }, { id: 'data', label: 'Data Science' },
  { id: 'environment', label: 'Environment' }, { id: 'medicine', label: 'Medicine' },
  { id: 'networks', label: 'Networks' }, { id: 'archaeology', label: 'Archaeology' },
  { id: 'linguistics', label: 'Linguistics' }, { id: 'history', label: 'World History' },
  { id: 'architecture', label: 'Architecture' },
];

// asset.discipline arrives as a human label ("Archaeology", "World History") — resolve
// it back to a LabsDisciplineId so the post reaches that discipline's feed.
function resolveDisciplineId(name?: string): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'history': 'history', 'world history': 'history',
    'comp sci': 'cs', 'computer science': 'cs',
    'earth science': 'earth', 'data science': 'data',
  };
  if (aliases[n]) return aliases[n];
  const hit = DISCIPLINES.find(d => d.label.toLowerCase() === n || d.id === n);
  return hit ? hit.id : null;
}

type ExtraTarget =
  | { kind: 'discipline'; id: string; label: string }
  | { kind: 'club'; id: string; label: string };

interface Props {
  asset: AcademicAsset;
  accent?: string;
  onClose: () => void;
  onPosted?: () => void;
}

const ShareToPlajahComposer: React.FC<Props> = ({ asset, accent = '#C9A55C', onClose, onPosted }) => {
  const disciplineId = resolveDisciplineId(asset.discipline);
  const [primary, setPrimary] = useState<'discipline' | 'social'>(disciplineId ? 'discipline' : 'social');
  const [extra, setExtra] = useState<ExtraTarget[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [done, setDone] = useState(false);

  const initialText = useMemo(() => academicPrefillText(asset), [asset]);
  const initialAttachments = useMemo(
    () => academicPrefillAttachments(asset) as any,
    [asset]
  );

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) fetchUserClubs(uid).then(setClubs).catch(() => {});
  }, []);

  // Combined, searchable destination list (disciplines + the user's clubs),
  // excluding whatever is already the primary target or already selected.
  const options: ExtraTarget[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(extra.map(e => `${e.kind}:${e.id}`));
    const discs: ExtraTarget[] = DISCIPLINES
      .filter(d => !(primary === 'discipline' && d.id === disciplineId))
      .map(d => ({ kind: 'discipline' as const, id: d.id, label: d.label }));
    const clubOpts: ExtraTarget[] = clubs.map(c => ({ kind: 'club' as const, id: c.id, label: c.name }));
    return [...discs, ...clubOpts]
      .filter(o => !chosen.has(`${o.kind}:${o.id}`))
      .filter(o => !q || o.label.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, extra, clubs, primary, disciplineId]);

  const addTarget = (t: ExtraTarget) => { setExtra(prev => [...prev, t]); setQuery(''); };
  const removeTarget = (t: ExtraTarget) => setExtra(prev => prev.filter(e => !(e.kind === t.kind && e.id === t.id)));

  const handlePost = async (data: ComposerPostData) => {
    const media = (data.attachments || []).map(a =>
      a.type === 'MODEL3D'
        ? { type: 'MODEL3D' as const, url: a.url, title: a.title, thumbnail: (a as any).thumbnail }
        : { type: a.type as any, url: a.url, title: a.title }
    );

    // Discipline feeds match on the LabsDisciplineId in tags; the human label +
    // kind ride along for general discovery without leaking into a feed.
    const disciplineIds = new Set<string>();
    if (primary === 'discipline' && disciplineId) disciplineIds.add(disciplineId);
    extra.filter(e => e.kind === 'discipline').forEach(e => disciplineIds.add(e.id));

    const tags = [
      ...disciplineIds,
      ...(asset.discipline ? [asset.discipline] : []),
      asset.kind,
    ].filter(Boolean) as string[];

    await createPost({
      text: data.text,
      isPublic: true,
      tags,
      ...(media.length ? { media } : {}),
    } as any);

    // Cross-post to selected clubs (separate collection / feed).
    const clubTargets = extra.filter(e => e.kind === 'club');
    if (clubTargets.length) {
      const clubAttachments = (data.attachments || []).map(a => ({
        type: a.type,
        url: a.url,
        title: a.title,
        thumbnailUrl: (a as any).thumbnail,
      }));
      await Promise.all(clubTargets.map(c => createClubPost({
        clubId: c.id,
        content: data.text,
        type: 'POST',
        attachments: clubAttachments.length ? clubAttachments : undefined,
      })));
    }

    setDone(true);
    onPosted?.();
    setTimeout(onClose, 900);
  };

  const pill = (active: boolean) =>
    `flex-1 px-4 py-3 rounded-2xl border text-left transition-all ${
      active ? 'bg-white/[0.09] border-white/25' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
    }`;

  const destinationSlot = (
    <div className="space-y-3">
      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">Post to</p>
      <div className="flex gap-2">
        {disciplineId && (
          <button type="button" onClick={() => setPrimary('discipline')} className={pill(primary === 'discipline')}>
            <div className="flex items-center gap-2">
              <Landmark size={13} style={{ color: accent }} />
              <span className="text-[11px] font-black uppercase tracking-widest text-white truncate">
                {asset.discipline} feed
              </span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">Discipline community</p>
          </button>
        )}
        <button type="button" onClick={() => setPrimary('social')} className={pill(primary === 'social')}>
          <div className="flex items-center gap-2">
            <Users size={13} className="text-small-orange" />
            <span className="text-[11px] font-black uppercase tracking-widest text-white">Plajah social</span>
          </div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">Your main timeline</p>
        </button>
      </div>

      {/* Also share to — searchable multi-destination */}
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.03] border border-white/10 focus-within:border-white/25 transition-all">
          <Search size={13} className="text-white/30 shrink-0" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setDropOpen(true); }}
            onFocus={() => setDropOpen(true)}
            placeholder="Also share to a discipline, club…"
            className="flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-white/25 min-w-0"
          />
        </div>
        <AnimatePresence>
          {dropOpen && options.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute z-40 mt-1.5 w-full max-h-56 overflow-y-auto p-1.5 bg-[#141419] border border-white/12 rounded-2xl shadow-2xl scrollbar-hide"
            >
              {options.map(o => (
                <button
                  key={`${o.kind}:${o.id}`}
                  type="button"
                  onClick={() => addTarget(o)}
                  className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl hover:bg-white/[0.06] transition-all"
                >
                  {o.kind === 'club' ? <Users size={12} className="text-white/40 shrink-0" /> : <Hash size={12} className="text-white/40 shrink-0" />}
                  <span className="text-[12px] font-bold text-white/80 truncate flex-1">{o.label}</span>
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/25">{o.kind}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {extra.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extra.map(t => (
            <span key={`${t.kind}:${t.id}`} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-bold text-white/70">
              {t.kind === 'club' ? <Users size={10} /> : <Hash size={10} />}
              {t.label}
              <button type="button" onClick={() => removeTarget(t)} className="w-4 h-4 rounded-full hover:bg-white/15 flex items-center justify-center">
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const overlay = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-8"
      onMouseDown={e => { if (e.target === e.currentTarget) setDropOpen(false); }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-xl my-auto"
        onClick={() => setDropOpen(false)}
      >
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-[13px] font-black uppercase tracking-[0.2em] text-white">Share to Plajah</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/12 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-10 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${accent}22`, color: accent }}>
              <Check size={22} />
            </div>
            <p className="text-[12px] font-black uppercase tracking-widest text-white">Shared</p>
          </div>
        ) : (
          <div onClick={e => e.stopPropagation()}>
            <UniversalPostComposer
              currentUser={auth.currentUser}
              autoExpand
              initialText={initialText}
              initialAttachments={initialAttachments}
              destinationSlot={destinationSlot}
              postLabel="Share"
              placeholder="Add your take…"
              onPost={handlePost}
            />
          </div>
        )}
      </motion.div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

export default ShareToPlajahComposer;
