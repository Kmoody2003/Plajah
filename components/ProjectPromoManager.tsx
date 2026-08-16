/**
 * ProjectPromoManager — the "Project Promo" section of the content uploader.
 *
 * A promo-kit folder for any of the creator's projects: every promotion surface
 * on the platform is a named slot with its exact spec (resolution, aspect,
 * format, caps), so creators know precisely what to tailor. Filled slots power
 * the landing page's hover-unmute panes via the fallback chain
 * (teaser → trailer → audio sample over key art → cover art).
 *
 * Assets upload to albums/{albumId}/promo/ and save onto the album doc as
 * `promoKit` (merge write; removals store '' so re-publish overwrites survive).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Upload, Trash2, Check, Loader2, Megaphone } from 'lucide-react';
import type { Album, PromoKit } from '../types';
import { auth, fetchUserAlbums, updateAlbum, uploadFile } from '../services/backendService';

type SlotKey = keyof Omit<PromoKit, 'updatedAt'>;

interface SlotDef {
  key: SlotKey;
  label: string;
  where: string;
  spec: string;
  accept: string;
  kind: 'video' | 'audio' | 'image';
  ratio: string;      // CSS aspect-ratio for the shape swatch
  maxBytes: number;
}

const SLOTS: SlotDef[] = [
  { key: 'teaserLoopUrl', label: 'Teaser Loop', where: 'Landing panorama columns · story tease', spec: '1080 × 1920 · 9:16 · MP4/WebM · ≤ 30 s', accept: 'video/*,.mp4,.m4v,.mov,.webm', kind: 'video', ratio: '9 / 16', maxBytes: 40 * 1024 * 1024 },
  { key: 'trailerUrl', label: 'Trailer', where: 'Marquee hero · Taleo page · TV apps', spec: '1920 × 1080 · 16:9 · MP4 H.264 · ≤ 90 s', accept: 'video/*,.mp4,.m4v,.mov,.webm', kind: 'video', ratio: '16 / 9', maxBytes: 120 * 1024 * 1024 },
  { key: 'audioSampleUrl', label: 'Audio Sample', where: 'Chora hover · rails · listening parties', spec: '48 kHz stereo · AAC/MP3 · ~30 s loop', accept: 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg', kind: 'audio', ratio: '5 / 2', maxBytes: 12 * 1024 * 1024 },
  { key: 'keyArtUrl', label: 'Key Art', where: 'Archive tiles · rails · search', spec: '1500 × 1500 · 1:1 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '1 / 1', maxBytes: 8 * 1024 * 1024 },
  { key: 'posterUrl', label: 'Poster', where: 'Taleo & Lorea poster surfaces', spec: '1000 × 1500 · 2:3 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '2 / 3', maxBytes: 8 * 1024 * 1024 },
  { key: 'wideBannerUrl', label: 'Wide Banner', where: 'Rail headers · profile & org headers', spec: '2560 × 720 · 32:9 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '32 / 9', maxBytes: 10 * 1024 * 1024 },
  { key: 'shareCardUrl', label: 'Share Card', where: 'Link previews (OG) · social shares', spec: '1200 × 630 · 1.91:1 · PNG/JPG', accept: 'image/*', kind: 'image', ratio: '1.91 / 1', maxBytes: 5 * 1024 * 1024 },
  { key: 'tvBillboardUrl', label: 'TV Billboard', where: 'Android TV · Fire TV · FAST channels', spec: '1920 × 1080 · 16:9 · JPG · 5% title-safe margin', accept: 'image/*', kind: 'image', ratio: '16 / 9', maxBytes: 8 * 1024 * 1024 },
];

const ProjectPromoManager: React.FC<{ onBack: () => void; preselectedAlbum?: Album }> = ({ onBack, preselectedAlbum }) => {
  const [projects, setProjects] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Album | null>(preselectedAlbum || null);
  const [kit, setKit] = useState<PromoKit>(preselectedAlbum?.promoKit || {});
  const [uploading, setUploading] = useState<Partial<Record<SlotKey, number>>>({});
  const [errors, setErrors] = useState<Partial<Record<SlotKey, string>>>({});
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    fetchUserAlbums(uid).then(list => { setProjects(list); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filledCount = useMemo(() => SLOTS.filter(s => kit[s.key]).length, [kit]);

  const persist = async (next: PromoKit) => {
    if (!selected) return;
    const stamped: PromoKit = { ...next, updatedAt: Date.now() };
    setKit(stamped);
    await updateAlbum(selected.id, { promoKit: stamped });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleFile = async (slot: SlotDef, file: File) => {
    if (!selected) return;
    setErrors(e => ({ ...e, [slot.key]: undefined }));
    if (file.size > slot.maxBytes) {
      setErrors(e => ({ ...e, [slot.key]: `Too large — keep it under ${Math.round(slot.maxBytes / 1024 / 1024)} MB.` }));
      return;
    }
    setUploading(u => ({ ...u, [slot.key]: 0 }));
    try {
      const url = await uploadFile(
        `albums/${selected.id}/promo/${slot.key}_${Date.now()}_${file.name}`,
        file,
        (p: number) => setUploading(u => ({ ...u, [slot.key]: p })),
      );
      await persist({ ...kit, [slot.key]: url });
    } catch {
      setErrors(e => ({ ...e, [slot.key]: 'Upload failed — try again.' }));
    } finally {
      setUploading(u => { const n = { ...u }; delete n[slot.key]; return n; });
    }
  };

  // '' (not undefined) so the merge write actually clears the slot and the
  // cleared state survives a later full-overwrite republish.
  const clearSlot = (slot: SlotDef) => persist({ ...kit, [slot.key]: '' });

  /* ── project picker ── */
  if (!selected) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-start gap-4">
          <button type="button" onClick={onBack} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 transition-colors shrink-0" aria-label="Back">
            <ChevronLeft size={18} />
          </button>
          <div>
            <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2 flex items-center gap-3"><Megaphone size={26} className="text-small-orange" /> Project Promo</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Pick a project to build its promo kit</p>
          </div>
        </div>
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-white/30" size={28} /></div>
        ) : projects.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-white/40">No projects yet</p>
            <p className="text-[11px] text-white/30 max-w-sm mx-auto">Publish a project first — then come back here to give it a promo kit that powers the landing page showcases.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setSelected(p); setKit(p.promoKit || {}); }}
                className="group text-left rounded-2xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25 transition-all"
              >
                <div className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${p.coverThumb || p.coverImage})` }} />
                <div className="p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-white leading-tight line-clamp-1">{p.title}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-0.5">
                    {p.type || 'MUSIC'}{p.promoKit && Object.values(p.promoKit).some(v => typeof v === 'string' && v) ? ' · Kit started' : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── kit folder ── */
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start gap-4">
        <button type="button" onClick={() => (preselectedAlbum ? onBack() : setSelected(null))} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 transition-colors shrink-0" aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-display font-black tracking-tight uppercase leading-tight line-clamp-1">{selected.title}</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mt-1">
            Promo kit · {filledCount}/{SLOTS.length} slots filled
            {savedFlash && <span className="ml-3 text-[#06D6A0] tracking-widest inline-flex items-center gap-1"><Check size={11} /> Saved</span>}
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-cover bg-center border border-white/10 shrink-0" style={{ backgroundImage: `url(${selected.coverThumb || selected.coverImage})` }} />
      </div>

      <div className="space-y-3">
        {SLOTS.map(slot => {
          const url = kit[slot.key];
          const progress = uploading[slot.key];
          const err = errors[slot.key];
          return (
            <div key={slot.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-4">
                {/* shape swatch drawn at true aspect ratio */}
                <div className="h-9 rounded-md shrink-0" style={{ aspectRatio: slot.ratio, background: url ? 'linear-gradient(135deg,#06D6A0,#00DAF3)' : 'linear-gradient(135deg,#6B0099,#D40055)', opacity: url ? 0.9 : 0.5 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-widest text-white">{slot.label}</p>
                  <p className="text-[10px] text-white/40 truncate">{slot.where}</p>
                  <p className="text-[10px] font-mono text-white/30 mt-0.5">{slot.spec}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {progress !== undefined ? (
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-2">
                      <Loader2 size={13} className="animate-spin" /> {Math.round(progress)}%
                    </span>
                  ) : (
                    <>
                      <label className="cursor-pointer px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white">
                        <Upload size={11} /> {url ? 'Replace' : 'Upload'}
                        <input
                          type="file"
                          accept={slot.accept}
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(slot, f); e.target.value = ''; }}
                        />
                      </label>
                      {url && (
                        <button type="button" onClick={() => clearSlot(slot)} className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors" aria-label={`Remove ${slot.label}`}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {err && <p className="mt-2 text-[10px] font-bold text-red-400">{err}</p>}
              {url && (
                <div className="mt-3">
                  {slot.kind === 'image' && <img src={url} alt={slot.label} className="max-h-28 rounded-lg border border-white/10" />}
                  {slot.kind === 'video' && <video src={url} controls muted playsInline className="max-h-36 rounded-lg border border-white/10" />}
                  {slot.kind === 'audio' && <audio src={url} controls className="w-full max-w-sm" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 border-l-2 border-l-small-orange">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-small-orange mb-1.5">How the archive uses this kit</p>
        <p className="text-[11px] text-white/50 leading-relaxed">
          Hover panes on the landing page play down the chain: <span className="text-white/80 font-bold">Teaser Loop → Trailer → Audio Sample over Key Art → your cover art</span>.
          A project with nothing extra still looks good — a project with a full kit owns the front page. Fill what fits your work; every slot is optional.
        </p>
      </div>
    </div>
  );
};

export default ProjectPromoManager;
