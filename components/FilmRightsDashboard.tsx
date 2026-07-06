import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Upload, Check, AlertTriangle, X, ChevronDown,
  ChevronUp, FileText, Music2, Captions, Star, Clock,
  Lock, Globe, Plus, Trash2, ExternalLink,
} from 'lucide-react';
import { fetchUserAlbums, auth } from '../services/backendService';
import type { Album } from '../types';

// ── Film & TV insurance provider directory ──────────────────────────────────────
// Real entertainment E&O / production insurers filmmakers can go get covered with.
// Logos via Google's favicon service (reliable, no CSP issues; shield glyph fallback).
interface Insurer { name: string; domain: string; url: string; desc: string; tags: string; }
const FILM_INSURERS: Insurer[] = [
  { name: 'Front Row Insurance', domain: 'frontrowinsurance.com', url: 'https://www.frontrowinsurance.com/', desc: 'Entertainment specialists — E&O, full production packages, and short-shoot (DICE) coverage built for indie film & TV.', tags: 'E&O · Production · DICE' },
  { name: 'Athos Insurance', domain: 'athosinsurance.com', url: 'https://www.athosinsurance.com/', desc: 'Fast online E&O quotes and same-day binding for independent films, documentaries, and shorts.', tags: 'E&O · Instant quote' },
  { name: 'FilmEmporium', domain: 'filmemporium.com', url: 'https://www.filmemporium.com/', desc: 'Production + E&O insurance made for independent filmmakers, with instant certificates of insurance.', tags: 'E&O · Production · COIs' },
  { name: 'HUB Entertainment', domain: 'hubinternational.com', url: 'https://www.hubinternational.com/industries/entertainment-insurance/', desc: 'Global broker with a dedicated entertainment practice covering E&O, cast, and full production risk.', tags: 'E&O · Cast · Global' },
  { name: 'Truman Van Dyke', domain: 'tvdco.com', url: 'https://www.tvdco.com/', desc: 'Long-standing entertainment insurance brokerage serving film, TV, and streaming productions.', tags: 'E&O · Production' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type DocStatus = 'COMPLETE' | 'MISSING' | 'EXPIRING';

interface RightsDoc {
  id: string;
  label: string;
  note?: string;
  fileUrl?: string;
  expiresAt?: number;
  status: DocStatus;
}

interface FilmRights {
  albumId: string;
  albumTitle: string;
  coverImage?: string;
  eoInsurance: RightsDoc;
  chainOfTitle: RightsDoc;
  musicLicenses: RightsDoc[];
  subtitles: RightsDoc;
  contentRating: string;
  ratingNotes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RATING_OPTIONS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];

function statusColor(s: DocStatus) {
  if (s === 'COMPLETE')  return { text: 'text-green-400',  bg: 'bg-green-400/15',  border: 'border-green-400/25' };
  if (s === 'EXPIRING')  return { text: 'text-yellow-400', bg: 'bg-yellow-400/15', border: 'border-yellow-400/25' };
  return                        { text: 'text-red-400',    bg: 'bg-red-400/15',    border: 'border-red-400/25'   };
}

function statusIcon(s: DocStatus) {
  if (s === 'COMPLETE') return <Check size={12} />;
  if (s === 'EXPIRING') return <Clock size={12} />;
  return <AlertTriangle size={12} />;
}

function readinessScore(r: FilmRights): number {
  let score = 0;
  if (r.eoInsurance.status    === 'COMPLETE') score += 25;
  if (r.chainOfTitle.status   === 'COMPLETE') score += 25;
  if (r.subtitles.status      === 'COMPLETE') score += 20;
  if (r.contentRating)                        score += 15;
  if (r.musicLicenses.every(m => m.status === 'COMPLETE') || r.musicLicenses.length === 0) score += 15;
  return score;
}

function emptyRights(albumId: string, albumTitle: string, coverImage?: string): FilmRights {
  return {
    albumId, albumTitle, coverImage,
    eoInsurance: { id: 'eo', label: 'E&O Insurance', status: 'MISSING' },
    chainOfTitle: { id: 'cot', label: 'Chain of Title', status: 'MISSING' },
    musicLicenses: [],
    subtitles: { id: 'subs', label: 'Subtitle / Caption File', status: 'MISSING' },
    contentRating: '',
    ratingNotes: '',
  };
}

// ── Doc row component ─────────────────────────────────────────────────────────

function DocRow({
  doc, onMarkComplete, onClear, onSetExpiry,
}: {
  doc: RightsDoc;
  onMarkComplete: () => void;
  onClear: () => void;
  onSetExpiry: (ts: number) => void;
}) {
  const [showExpiry, setShowExpiry] = useState(false);
  const c = statusColor(doc.status);

  return (
    <div className={`flex items-start gap-4 p-4 rounded-2xl border ${c.border} ${c.bg} transition-all`}>
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${c.text}`}>
        {statusIcon(doc.status)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-black uppercase tracking-widest ${c.text}`}>{doc.label}</p>
        {doc.note && <p className="text-[9px] text-white/25 mt-0.5">{doc.note}</p>}
        {doc.expiresAt && (
          <p className="text-[9px] text-white/30 mt-0.5 flex items-center gap-1">
            <Clock size={9} /> Expires {new Date(doc.expiresAt).toLocaleDateString()}
          </p>
        )}
        {showExpiry && (
          <div className="mt-2">
            <input
              type="date"
              className="bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white outline-none"
              onChange={e => {
                if (e.target.value) onSetExpiry(new Date(e.target.value).getTime());
                setShowExpiry(false);
              }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {doc.status !== 'COMPLETE' ? (
          <>
            <button onClick={onMarkComplete}
              className="px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/8 text-white/50 hover:bg-green-500/15 hover:text-green-400 transition-all">
              Mark Done
            </button>
            <button onClick={() => setShowExpiry(!showExpiry)}
              className="px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/30 hover:text-white transition-all">
              +Expiry
            </button>
          </>
        ) : (
          <button onClick={onClear}
            className="p-1.5 rounded-xl text-white/15 hover:text-red-400 transition-all">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmRightsDashboard() {
  const [filmAlbums, setFilmAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [rightsMap, setRightsMap] = useState<Record<string, FilmRights>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newMusicLabel, setNewMusicLabel] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(albums => {
      const films = albums.filter(a => a.type === 'VIDEO');
      setFilmAlbums(films);
      const map: Record<string, FilmRights> = {};
      films.forEach(f => { map[f.id] = emptyRights(f.id, f.title, f.coverImage); });
      setRightsMap(map);
      if (films.length > 0) setExpandedId(films[0].id);
      setLoading(false);
    });
  }, []);

  const updateDoc = (albumId: string, field: keyof FilmRights, updater: (d: RightsDoc) => RightsDoc) => {
    setRightsMap(prev => {
      const r = { ...prev[albumId] };
      (r[field] as RightsDoc) = updater(r[field] as RightsDoc);
      return { ...prev, [albumId]: r };
    });
  };

  const updateMusicDoc = (albumId: string, docId: string, updater: (d: RightsDoc) => RightsDoc) => {
    setRightsMap(prev => {
      const r = { ...prev[albumId] };
      r.musicLicenses = r.musicLicenses.map(m => m.id === docId ? updater(m) : m);
      return { ...prev, [albumId]: r };
    });
  };

  const addMusicLicense = (albumId: string) => {
    if (!newMusicLabel.trim()) return;
    const id = `ml_${Date.now()}`;
    setRightsMap(prev => ({
      ...prev,
      [albumId]: {
        ...prev[albumId],
        musicLicenses: [...prev[albumId].musicLicenses, { id, label: newMusicLabel.trim(), status: 'MISSING' }],
      },
    }));
    setNewMusicLabel('');
  };

  if (loading) return (
    <div className="py-24 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/15 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Rights &<br />Documents</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Distribution readiness tracker per title</p>
      </div>

      {/* ── Insurance providers directory ── */}
      <section className="rounded-[2rem] border border-white/8 bg-white/[0.02] p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-1.5">
          <Shield size={14} className="text-[#FF8C00]" />
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Get Insured — E&O & Production Insurance</h2>
        </div>
        <p className="text-[11px] text-white/35 leading-relaxed max-w-2xl mb-5">
          Most distributors and platforms require <span className="text-white/55 font-bold">Errors &amp; Omissions (E&amp;O)</span> insurance before they'll carry a title. These vetted entertainment insurers cover film &amp; TV — get a quote, then mark your policy complete above.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FILM_INSURERS.map(ins => (
            <a key={ins.domain} href={ins.url} target="_blank" rel="noopener noreferrer"
              className="group flex flex-col gap-2 p-4 rounded-2xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#FF8C00]/25 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/90 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${ins.domain}&sz=64`}
                    alt={ins.name}
                    className="w-full h-full object-contain p-1.5"
                    loading="lazy"
                    onError={e => {
                      const el = e.currentTarget as HTMLImageElement;
                      el.style.display = 'none';
                      (el.nextElementSibling as HTMLElement)?.style.setProperty('display', 'flex');
                    }}
                  />
                  <div style={{ display: 'none' }} className="w-full h-full items-center justify-center"><Shield size={18} className="text-[#1a1a1a]" /></div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-white truncate group-hover:text-[#FF8C00] transition-colors">{ins.name}</p>
                  <p className="text-[7px] font-black uppercase tracking-widest text-white/25">{ins.tags}</p>
                </div>
                <ExternalLink size={12} className="text-white/20 group-hover:text-[#FF8C00]/60 transition-colors shrink-0" />
              </div>
              <p className="text-[10px] text-white/40 leading-relaxed">{ins.desc}</p>
            </a>
          ))}
        </div>
        <p className="text-[8px] text-white/15 mt-4 uppercase tracking-widest">Directory for convenience — Plajah is not affiliated with and does not endorse these providers. Compare coverage before you buy.</p>
      </section>

      {filmAlbums.length === 0 && (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <Shield size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No film projects yet</p>
          <p className="text-[9px] text-white/12">Upload a film in Film Studio to track its distribution rights here</p>
        </div>
      )}

      {filmAlbums.map(film => {
        const rights = rightsMap[film.id];
        if (!rights) return null;
        const score = readinessScore(rights);
        const isExpanded = expandedId === film.id;

        return (
          <div key={film.id} className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden">
            {/* Film header row */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : film.id)}
              className="w-full flex items-center gap-5 p-7 text-left hover:bg-white/[0.02] transition-all"
            >
              {film.coverImage ? (
                <img src={film.coverImage} alt={film.title} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-white/20" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-black uppercase tracking-widest text-white">{film.title}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{film.genre} · {film.subType || 'VIDEO'}</p>
              </div>
              {/* Readiness score */}
              <div className="flex-shrink-0 text-right mr-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">Readiness</p>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${score}%`,
                        background: score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className={`text-xs font-black ${score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {score}%
                  </span>
                </div>
              </div>
              {isExpanded ? <ChevronUp size={16} className="text-white/30 flex-shrink-0" /> : <ChevronDown size={16} className="text-white/30 flex-shrink-0" />}
            </button>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-7 pb-7 space-y-6 border-t border-white/5 pt-6">
                    {/* E&O Insurance */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3 flex items-center gap-1.5">
                        <Shield size={10} /> E&O Insurance
                      </p>
                      <DocRow
                        doc={rights.eoInsurance}
                        onMarkComplete={() => updateDoc(film.id, 'eoInsurance', d => ({ ...d, status: 'COMPLETE' }))}
                        onClear={() => updateDoc(film.id, 'eoInsurance', d => ({ ...d, status: 'MISSING' }))}
                        onSetExpiry={ts => updateDoc(film.id, 'eoInsurance', d => ({
                          ...d, status: ts < Date.now() + 30 * 86_400_000 ? 'EXPIRING' : 'COMPLETE', expiresAt: ts,
                        }))}
                      />
                    </div>

                    {/* Chain of Title */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3 flex items-center gap-1.5">
                        <FileText size={10} /> Chain of Title
                      </p>
                      <DocRow
                        doc={rights.chainOfTitle}
                        onMarkComplete={() => updateDoc(film.id, 'chainOfTitle', d => ({ ...d, status: 'COMPLETE' }))}
                        onClear={() => updateDoc(film.id, 'chainOfTitle', d => ({ ...d, status: 'MISSING' }))}
                        onSetExpiry={ts => updateDoc(film.id, 'chainOfTitle', d => ({ ...d, expiresAt: ts, status: 'COMPLETE' }))}
                      />
                    </div>

                    {/* Music Licenses */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3 flex items-center gap-1.5">
                        <Music2 size={10} /> Music Licenses
                      </p>
                      <div className="space-y-2">
                        {rights.musicLicenses.map(ml => (
                          <DocRow
                            key={ml.id}
                            doc={ml}
                            onMarkComplete={() => updateMusicDoc(film.id, ml.id, d => ({ ...d, status: 'COMPLETE' }))}
                            onClear={() => setRightsMap(prev => ({
                              ...prev,
                              [film.id]: { ...prev[film.id], musicLicenses: prev[film.id].musicLicenses.filter(m => m.id !== ml.id) },
                            }))}
                            onSetExpiry={ts => updateMusicDoc(film.id, ml.id, d => ({ ...d, expiresAt: ts, status: 'COMPLETE' }))}
                          />
                        ))}
                        <div className="flex gap-2 mt-2">
                          <input
                            value={newMusicLabel}
                            onChange={e => setNewMusicLabel(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addMusicLicense(film.id)}
                            placeholder="e.g. Track 3 — Sync License"
                            className="flex-1 bg-white/5 border border-white/8 rounded-xl px-4 py-2 text-[11px] text-white placeholder:text-white/15 outline-none focus:border-white/20"
                          />
                          <button onClick={() => addMusicLicense(film.id)}
                            className="px-4 py-2 rounded-xl bg-white/8 text-white/40 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest">
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Subtitles */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3 flex items-center gap-1.5">
                        <Globe size={10} /> Subtitles & Captions
                      </p>
                      <DocRow
                        doc={rights.subtitles}
                        onMarkComplete={() => updateDoc(film.id, 'subtitles', d => ({ ...d, status: 'COMPLETE' }))}
                        onClear={() => updateDoc(film.id, 'subtitles', d => ({ ...d, status: 'MISSING' }))}
                        onSetExpiry={() => {}}
                      />
                    </div>

                    {/* Content Rating */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3 flex items-center gap-1.5">
                        <Star size={10} /> Content Rating
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {RATING_OPTIONS.map(r => (
                          <button
                            key={r}
                            onClick={() => setRightsMap(prev => ({ ...prev, [film.id]: { ...prev[film.id], contentRating: r } }))}
                            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            style={{
                              background: rights.contentRating === r ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.04)',
                              color: rights.contentRating === r ? '#FF8C00' : 'rgba(255,255,255,0.3)',
                              border: rights.contentRating === r ? '1px solid rgba(255,140,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      {rights.contentRating && (
                        <textarea
                          value={rights.ratingNotes}
                          onChange={e => setRightsMap(prev => ({ ...prev, [film.id]: { ...prev[film.id], ratingNotes: e.target.value } }))}
                          placeholder="Rating context or advisory notes (optional)…"
                          rows={2}
                          className="w-full mt-3 bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-[11px] text-white placeholder:text-white/15 outline-none focus:border-white/20 resize-none transition-all"
                        />
                      )}
                    </div>

                    {/* Summary banner */}
                    {score < 100 && (
                      <div className="p-4 rounded-2xl bg-yellow-400/6 border border-yellow-400/15">
                        <p className="text-[9px] font-black uppercase tracking-widest text-yellow-400 mb-1">Distribution Readiness: {score}%</p>
                        <p className="text-[9px] text-white/30">
                          {score < 50
                            ? 'Several required documents are missing. Complete them before submitting to aggregators.'
                            : 'Almost ready. Complete the remaining items to reach 100% distribution readiness.'}
                        </p>
                      </div>
                    )}
                    {score === 100 && (
                      <div className="p-4 rounded-2xl bg-green-500/8 border border-green-500/20">
                        <p className="text-[9px] font-black uppercase tracking-widest text-green-400 flex items-center gap-1.5">
                          <Check size={10} /> Ready for Distribution
                        </p>
                        <p className="text-[9px] text-white/30 mt-1">All documentation is in order. This title is cleared for aggregator submission.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}
