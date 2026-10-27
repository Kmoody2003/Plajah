// IdentityEditor — Live WYSIWYG Hero Cover & Logo Studio matching the Plajah Elevate landing page
// and Vellum design language. Uses updateOrgIdentity so a linked account's profile photo / cover
// stay synced, and uploads via uploads/organizations/<orgId>/... so Firebase Storage rules accept
// every image format cleanly.

import React, { useState } from 'react';
import { Camera, Check, Image as ImageIcon, Loader2, Sparkles, Upload } from 'lucide-react';
import type { Organization } from '../../types';
import { updateOrgIdentity } from '../../services/elevateService';
import { uploadFile } from '../../services/backendService';

export const ELEVATE_COVER_PRESETS: { id: string; label: string; url: string }[] = [
  {
    id: 'sanctuary-light',
    label: 'Sanctuary Light',
    url: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=1800&auto=format&fit=crop&q=80',
  },
  {
    id: 'cathedral-arch',
    label: 'Sacred Architecture',
    url: 'https://images.unsplash.com/photo-1519491050282-cf00c82424b4?w=1800&auto=format&fit=crop&q=80',
  },
  {
    id: 'community-fellowship',
    label: 'Fellowship & Gathering',
    url: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1800&auto=format&fit=crop&q=80',
  },
  {
    id: 'cultural-hall',
    label: 'Heritage & Gallery',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1800&auto=format&fit=crop&q=80',
  },
];

export function getOrgPillarAccent(orgType?: Organization['orgType']): string {
  switch (orgType) {
    case 'CHURCH':
      return '#8B5CF6';
    case 'RELIGIOUS':
      return '#00DAF3';
    case 'NONPROFIT':
      return '#06D6A0';
    case 'CULTURAL':
      return '#FF8C00';
    default:
      return '#D40055';
  }
}

/** Normalize an uploaded image file name and upload to `uploads/organizations/<orgId>/...`. */
export async function uploadOrgImageAsset(
  orgId: string,
  kind: 'logo' | 'cover' | 'roster',
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const validExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp']);
  const ext = validExts.has(rawExt) ? rawExt : 'jpg';
  const path = `uploads/organizations/${orgId}/${kind}_${Date.now()}.${ext}`;
  return await uploadFile(path, file, onProgress);
}

const IdentityEditor: React.FC<{
  org: Organization;
  onSaved: (o: Organization) => void;
  liveName?: string;
  liveTagline?: string;
  liveCategory?: string;
}> = ({ org, onSaved, liveName, liveTagline, liveCategory }) => {
  const [busy, setBusy] = useState<'logo' | 'cover' | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const accent = getOrgPillarAccent(org.orgType);
  const displayName = (liveName ?? org.name) || 'Organization';
  const displayTagline = (liveTagline ?? org.tagline) || `${displayName}. Welcome home.`;
  const displayBadge = (liveCategory ?? org.denomination ?? org.orgKindLabel ?? org.orgType) || 'ELEVATE';

  const swapFile = async (kind: 'logo' | 'cover', file: File) => {
    setBusy(kind);
    setProgress(0);
    setErrorMsg(null);
    setSavedNotice(null);
    try {
      const url = await uploadOrgImageAsset(org.id, kind, file, pct => setProgress(Math.round(pct)));
      const patch = kind === 'logo' ? { logoUrl: url } : { coverUrl: url };
      await updateOrgIdentity(org.id, patch);
      onSaved({ ...org, ...patch });
      setSavedNotice(kind === 'cover' ? 'Cover image updated & published!' : 'Logo updated & published!');
      setTimeout(() => setSavedNotice(null), 3500);
    } catch (e: any) {
      console.error('[IdentityEditor] image update failed:', e);
      setErrorMsg(e?.message || 'Could not update the image. Please try another JPG, PNG, or WebP file.');
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const applyPresetCover = async (presetUrl: string, label: string) => {
    setBusy('cover');
    setErrorMsg(null);
    setSavedNotice(null);
    try {
      await updateOrgIdentity(org.id, { coverUrl: presetUrl });
      onSaved({ ...org, coverUrl: presetUrl });
      setSavedNotice(`Applied "${label}" cover plate!`);
      setShowPresets(false);
      setTimeout(() => setSavedNotice(null), 3500);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Could not apply preset cover.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Live Hero Cover & Logo Studio Card (Matches PlajahElevate & ElevateTypeTabs) */}
      <div
        className="rounded-[28px] p-px transition-all duration-300 shadow-2xl"
        style={{
          background: `linear-gradient(165deg, ${accent}d9, rgba(255,255,255,0.08) 38%, rgba(212,0,85,0.45) 100%)`,
        }}
      >
        <div className="rounded-[27px] overflow-hidden bg-[#110a1b]">
          <div className="relative h-56 sm:h-72 overflow-hidden group">
            {org.coverUrl ? (
              <img
                src={org.coverUrl}
                alt={`${displayName} cover`}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              />
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center p-6 text-center"
                style={{
                  background: `radial-gradient(circle at 25% 20%, ${accent}44, transparent 55%), linear-gradient(135deg, #1b0c2e 0%, #0b0214 100%)`,
                }}
              >
                <ImageIcon size={32} className="text-white/30 mb-2" />
                <p className="text-sm font-bold text-white/75">No cover image uploaded yet</p>
                <p className="text-xs text-white/45 mt-0.5">Upload a high-resolution cover banner or pick an Elevate cover plate</p>
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#110a1b] via-[#110a1b]/35 to-black/25 pointer-events-none" />

            {/* Top-left live sync badge */}
            <div className="absolute top-3.5 left-3.5 flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-bold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#06D6A0]" />
                Live Hero Canvas{org.accountUid ? ' · Synced to Account' : ''}
              </span>
              {savedNotice && (
                <span className="px-3 py-1 rounded-full bg-[#06D6A0]/20 backdrop-blur-md border border-[#06D6A0]/45 text-xs font-bold text-[#06D6A0] flex items-center gap-1">
                  <Check size={12} /> {savedNotice}
                </span>
              )}
            </div>

            {/* Top-right cover controls */}
            <div className="absolute top-3.5 right-3.5 flex flex-wrap items-center gap-2 z-10">
              <button
                type="button"
                onClick={() => setShowPresets(v => !v)}
                disabled={!!busy}
                className="px-3.5 py-2 rounded-2xl bg-black/65 hover:bg-black/80 backdrop-blur-md border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 transition-all"
              >
                <Sparkles size={13} style={{ color: accent }} />
                <span>Preset Cover Plates</span>
              </button>

              <label
                className="cursor-pointer px-4 py-2 rounded-2xl text-xs font-black text-white flex items-center gap-1.5 shadow-lg hover:brightness-110 transition-all"
                style={{
                  background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                  fontFamily: 'Outfit, sans-serif',
                }}
              >
                {busy === 'cover' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Uploading{progress > 0 ? ` ${progress}%` : '…'}</span>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>Upload Cover Image</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!!busy}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) swapFile('cover', f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {/* Bottom overlay: overlapping Logo + live headline */}
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-end gap-4 min-w-0 flex-1">
                <label
                  className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl overflow-hidden border-2 border-[#110a1b] shadow-2xl cursor-pointer group/logo shrink-0 bg-[#18141F] grid place-items-center"
                  title="Click to upload organization logo"
                >
                  {org.logoUrl ? (
                    <img src={org.logoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-black text-white/75" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/logo:opacity-100 flex flex-col items-center justify-center transition-opacity">
                    {busy === 'logo' ? (
                      <Loader2 size={18} className="animate-spin text-white" />
                    ) : (
                      <>
                        <Camera size={18} className="text-white" />
                        <span className="text-[11px] font-bold text-white mt-0.5">Swap Logo</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!!busy}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) swapFile('logo', f);
                      e.target.value = '';
                    }}
                  />
                </label>

                <div className="min-w-0 flex-1 pb-0.5">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className="text-[11px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                      style={{
                        color: accent,
                        background: `${accent}26`,
                        border: `1px solid ${accent}66`,
                      }}
                    >
                      {displayBadge}
                    </span>
                    {org.location?.city && (
                      <span className="text-xs text-white/60">{org.location.city}</span>
                    )}
                  </div>
                  <h2 className="ev-display text-2xl sm:text-3xl font-bold text-white truncate m-0">
                    {displayTagline}
                  </h2>
                  <p className="text-xs text-white/55 truncate mt-0.5 m-0">{displayName}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Preset Cover Plate Picker */}
          {showPresets && (
            <div className="p-4 border-t border-white/10 bg-[#0d0716] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white/75">Choose a Curated Elevate Cover Plate</span>
                <button
                  type="button"
                  onClick={() => setShowPresets(false)}
                  className="text-xs text-white/45 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {ELEVATE_COVER_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!!busy}
                    onClick={() => applyPresetCover(p.url, p.label)}
                    className="group relative h-20 rounded-2xl overflow-hidden border border-white/15 hover:border-white/50 text-left transition-all"
                  >
                    <img src={p.url} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2">
                      <span className="text-xs font-bold text-white truncate">{p.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-red-200">
          {errorMsg}
        </div>
      )}
    </div>
  );
};

export default IdentityEditor;
