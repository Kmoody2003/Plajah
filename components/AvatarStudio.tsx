import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Upload, User, Sparkles, Check, Loader2, X, Camera, ShoppingBag, ExternalLink } from 'lucide-react';
import AvatarViewer from './AvatarViewer';
import { uploadFile, updateUserProfile } from '../services/backendService';
import type { AvatarConfig, AvatarStyle, UserProfile } from '../types';

interface AvatarStudioProps {
  userProfile: UserProfile;
  onBack: () => void;
  onSave: (config: AvatarConfig) => void;
}

type Tab = 'RPM' | 'VRM' | 'NONE' | 'WARDROBE';

const WARDROBE_ITEMS: { id: string; name: string; category: string; emoji: string; desc: string; source: string; sourceUrl?: string }[] = [
  { id: 'hat_cap',      name: 'Baseball Cap',    category: 'Hats',    emoji: '🧢', desc: 'Classic flat-brim cap',       source: 'Built-in Procedural' },
  { id: 'hat_beanie',   name: 'Beanie',          category: 'Hats',    emoji: '🎩', desc: 'Cozy knit winter beanie',     source: 'Built-in Procedural' },
  { id: 'hat_crown',    name: 'Crown',           category: 'Hats',    emoji: '👑', desc: 'Regal golden crown',          source: 'Built-in Procedural' },
  { id: 'glasses_round',name: 'Round Glasses',   category: 'Glasses', emoji: '👓', desc: 'Retro circular frames',       source: 'Built-in Procedural' },
  { id: 'glasses_shades',name: 'Shades',         category: 'Glasses', emoji: '🕶️', desc: 'Cool mirrored sunglasses',   source: 'Built-in Procedural' },
  { id: 'cape_hero',    name: 'Hero Cape',       category: 'Outerwear',emoji: '🦸', desc: 'Flowing superhero cape',     source: 'Built-in Procedural' },
  { id: 'scarf',        name: 'Scarf',           category: 'Outerwear',emoji: '🧣', desc: 'Wrapped neck scarf',         source: 'Built-in Procedural' },
  { id: 'wings_angel',  name: 'Angel Wings',     category: 'Special', emoji: '👼', desc: 'Feathered white wings',       source: 'Built-in Procedural' },
  { id: 'wings_dragon', name: 'Dragon Wings',    category: 'Special', emoji: '🐉', desc: 'Dark leathery dragon wings',  source: 'Built-in Procedural' },
  { id: 'halo',         name: 'Halo',            category: 'Special', emoji: '😇', desc: 'Glowing gold halo ring',      source: 'Built-in Procedural' },
  { id: 'vroid_hub',    name: 'VRoid Hub Models',category: 'External',emoji: '🌐', desc: 'Free community VRM avatars',  source: 'VRoid Hub', sourceUrl: 'https://hub.vroid.com' },
  { id: 'booth_pm',     name: 'Booth.pm Assets', category: 'External',emoji: '🛍️', desc: 'Free Japanese avatar items', source: 'Booth.pm', sourceUrl: 'https://booth.pm' },
];

const STYLES: { key: AvatarStyle; label: string; desc: string; emoji: string; preview: string }[] = [
  { key: 'CLAY',       label: 'Clay 3D',    desc: 'Soft clay-like chibi with rounded body proportions',  emoji: '🫧', preview: 'https://images.unsplash.com/photo-1620288627223-53302f4e8c74?w=200&q=80' },
  { key: 'CHIBI',      label: 'Chibi',      desc: 'Oversized head, big eyes, cute toy proportions',       emoji: '🌸', preview: 'https://images.unsplash.com/photo-1636955816868-fcb881e57954?w=200&q=80' },
  { key: 'STREETWEAR', label: 'Streetwear', desc: 'NFT-style streetwear characters with accessories',     emoji: '🧢', preview: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=80' },
  { key: 'URBAN',      label: 'Urban',      desc: 'Street-level stylised with bold outfits',               emoji: '🏙️', preview: 'https://images.unsplash.com/photo-1605792657660-596af9009e82?w=200&q=80' },
  { key: 'REALISTIC',  label: 'Realistic',  desc: 'Diverse high-fidelity 3D characters',                  emoji: '👤', preview: 'https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=200&q=80' },
  { key: 'ANIME',      label: 'Anime',      desc: 'Cel-shaded manga look with expressive features',       emoji: '🎌', preview: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=200&q=80' },
];

const RPM_SUBDOMAIN = 'plajah'; // change to your RPM subdomain if you sign up

const AvatarStudio: React.FC<AvatarStudioProps> = ({ userProfile, onBack, onSave }) => {
  const existing = userProfile.avatar;
  const [tab, setTab] = useState<Tab>(existing?.type ?? 'NONE');
  const [style, setStyle] = useState<AvatarStyle>(existing?.style ?? 'ANIME');
  const [config, setConfig] = useState<AvatarConfig>(
    existing ?? { type: 'NONE', style: 'ANIME', isActive: false }
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [rpmReady, setRpmReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live-update config when style or tab changes (WARDROBE is UI-only, not a model type)
  useEffect(() => {
    if (tab === 'WARDROBE') {
      setConfig(prev => ({ ...prev, style }));
    } else {
      setConfig(prev => ({ ...prev, style, type: tab as 'RPM' | 'VRM' | 'NONE' }));
    }
  }, [style, tab]);

  // Listen for RPM postMessage
  useEffect(() => {
    if (tab !== 'RPM') return;
    const handler = (e: MessageEvent) => {
      const src = e.data?.source ?? '';
      if (src !== 'readyplayerme') return;
      if (e.data.eventName === 'v1.frame.ready') {
        setRpmReady(true);
      }
      if (e.data.eventName === 'v1.avatar.exported') {
        const glbUrl: string = e.data.data?.url ?? '';
        const avatarId: string = glbUrl.match(/\/([^/]+)\.glb/)?.[1] ?? '';
        setConfig(prev => ({
          ...prev,
          type: 'RPM',
          rpmGlbUrl: glbUrl,
          rpmAvatarId: avatarId,
        }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tab]);

  const handleVRMUpload = useCallback(async (file: File) => {
    if (!file.name.match(/\.(vrm|glb)$/i)) {
      alert('Please upload a .vrm or .glb file.');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const path = `avatars/${userProfile.uid}/avatar.vrm`;
      const url = await uploadFile(path, file, (p) => setUploadProgress(p));
      setConfig(prev => ({ ...prev, type: 'VRM', modelUrl: url }));
      setTab('VRM');
    } catch (err) {
      console.error('VRM upload failed', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [userProfile.uid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const final: AvatarConfig = { ...config, isActive: config.type !== 'NONE' };
      await updateUserProfile(userProfile.uid, { avatar: final });
      onSave(final);
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setSaving(true);
    try {
      const off: AvatarConfig = { ...config, isActive: false };
      await updateUserProfile(userProfile.uid, { avatar: off });
      onSave(off);
    } finally {
      setSaving(false);
    }
  };

  const rpmSrc = `https://${RPM_SUBDOMAIN}.readyplayer.me/avatar?frameApi&clearCache`;

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[var(--text-secondary)]" />
          <h1 className="text-lg font-black uppercase tracking-widest">Avatar Studio</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {config.isActive && (
            <button
              onClick={handleDeactivate}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-white/20 text-sm font-bold hover:bg-white/10 transition-colors"
            >
              Deactivate
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || config.type === 'NONE'}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--text-secondary)] text-black text-sm font-black uppercase tracking-widest disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Saving…' : 'Activate Avatar'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: 3D Preview */}
        <div className="flex-1 relative flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30 pointer-events-none z-10" />
          <div className="flex-1" style={{ minHeight: 400 }}>
            <AvatarViewer config={config} autoRotate={false} />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[10px] text-white/40 tracking-widest uppercase">
            Drag to rotate · Scroll to zoom
          </div>
        </div>

        {/* Right: Controls */}
        <div className="w-80 border-l border-white/10 flex flex-col overflow-y-auto">
          {/* Source tabs */}
          <div className="flex border-b border-white/10 overflow-x-auto no-scrollbar">
            {(['RPM', 'VRM', 'NONE', 'WARDROBE'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest transition-colors whitespace-nowrap shrink-0 ${
                  tab === t
                    ? 'text-[var(--text-secondary)] border-b-2 border-[var(--text-secondary)]'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {t === 'RPM' ? 'Ready Player Me' : t === 'VRM' ? 'VRM / VRoid' : t === 'WARDROBE' ? 'Wardrobe' : 'Procedural'}
              </button>
            ))}
          </div>

          <div className="flex-1 p-5 flex flex-col gap-6">
            {/* Style picker */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-3">Avatar Style</p>
              <div className="grid grid-cols-3 gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStyle(s.key)}
                    className={`relative rounded-2xl border overflow-hidden transition-all group ${
                      style === s.key
                        ? 'border-[var(--text-secondary)] ring-2 ring-[var(--text-secondary)]/30 scale-[1.02]'
                        : 'border-white/10 hover:border-white/30 hover:scale-[1.02]'
                    }`}
                  >
                    <div className="aspect-square relative overflow-hidden">
                      <img src={s.preview} alt={s.label} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      {style === s.key && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-[var(--text-secondary)] rounded-full flex items-center justify-center">
                          <Check size={9} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-[9px] font-black uppercase tracking-widest text-white">{s.label}</div>
                      <div className="text-[7px] text-white/40 leading-tight mt-0.5 line-clamp-2">{s.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Source-specific panel */}
            <AnimatePresence mode="wait">
              {tab === 'RPM' && (
                <motion.div
                  key="rpm"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                    Ready Player Me Creator
                  </p>
                  {config.rpmGlbUrl ? (
                    <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <Check size={14} className="text-green-400" />
                      <span className="text-xs text-green-300">Avatar linked!</span>
                      <button
                        onClick={() => setConfig(prev => ({ ...prev, rpmGlbUrl: undefined, rpmAvatarId: undefined }))}
                        className="ml-auto text-white/40 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-white/40 leading-relaxed">
                      Use the creator below. Your avatar exports automatically when finished.
                    </div>
                  )}
                  <div
                    className="w-full rounded-xl overflow-hidden border border-white/10"
                    style={{ height: 340 }}
                  >
                    <iframe
                      ref={iframeRef}
                      src={rpmSrc}
                      title="Ready Player Me Avatar Creator"
                      allow="camera *; microphone *"
                      className="w-full h-full border-0"
                    />
                  </div>
                  <p className="text-[8px] text-white/25 text-center leading-relaxed">
                    Ready Player Me is a free third-party service.
                    Your avatar GLB is stored on their CDN.
                  </p>
                </motion.div>
              )}

              {tab === 'VRM' && (
                <motion.div
                  key="vrm"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                    VRM / VRoid Upload
                  </p>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Export a <strong>.vrm</strong> or <strong>.glb</strong> from VRoid Studio,
                    Blender, or any compatible tool and upload it here.
                  </p>

                  {config.modelUrl ? (
                    <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <Check size={14} className="text-green-400" />
                      <span className="text-xs text-green-300">Model uploaded</span>
                      <button
                        onClick={() => setConfig(prev => ({ ...prev, modelUrl: undefined }))}
                        className="ml-auto text-white/40 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : uploading ? (
                    <div className="flex flex-col gap-2 p-4 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-2 text-xs text-white/60">
                        <Loader2 size={14} className="animate-spin" />
                        Uploading… {uploadProgress}%
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--text-secondary)] rounded-full transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-white/20 rounded-xl hover:border-[var(--text-secondary)]/50 hover:bg-white/5 transition-all"
                    >
                      <Upload size={22} className="text-[var(--text-secondary)]" />
                      <div className="text-xs font-bold">Click to upload .vrm / .glb</div>
                      <div className="text-[9px] text-white/30">Max 50 MB</div>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".vrm,.glb"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleVRMUpload(f);
                    }}
                  />

                  <div className="p-3 bg-white/5 rounded-xl text-[9px] text-white/35 leading-relaxed">
                    <strong className="text-white/60">Where to get VRM files:</strong><br />
                    • VRoid Studio (free, Windows/Mac/iOS)<br />
                    • Blender with VRM addon<br />
                    • Booth.pm community avatars
                  </div>
                </motion.div>
              )}

              {tab === 'NONE' && (
                <motion.div
                  key="none"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                    Procedural Avatar
                  </p>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    A geometric avatar is generated automatically from your style preset.
                    No upload required — select a style and activate.
                  </p>
                  <div className="p-3 bg-[var(--text-secondary)]/5 border border-[var(--text-secondary)]/20 rounded-xl text-[10px] text-white/50 leading-relaxed">
                    You can always upgrade to a VRM or RPM model later without losing your style settings.
                  </div>
                </motion.div>
              )}

              {tab === 'WARDROBE' && (
                <motion.div
                  key="wardrobe"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col gap-4"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                    Accessories & Items
                  </p>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Equip accessories on your procedural avatar. VRM/RPM avatars support full wardrobe via their respective platforms.
                  </p>

                  {/* Group by category */}
                  {['Hats', 'Glasses', 'Outerwear', 'Special', 'External'].map(cat => {
                    const items = WARDROBE_ITEMS.filter(i => i.category === cat);
                    const equipped = config.accessories ?? [];
                    return (
                      <div key={cat}>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">{cat}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {items.map(item => {
                            const isEquipped = equipped.includes(item.id);
                            const isExternal = item.category === 'External';
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  if (isExternal && item.sourceUrl) {
                                    window.open(item.sourceUrl, '_blank', 'noopener');
                                    return;
                                  }
                                  setConfig(prev => ({
                                    ...prev,
                                    accessories: isEquipped
                                      ? (prev.accessories ?? []).filter(a => a !== item.id)
                                      : [...(prev.accessories ?? []), item.id],
                                  }));
                                }}
                                className={`p-2.5 rounded-xl border text-left transition-all ${
                                  isEquipped
                                    ? 'border-[var(--text-secondary)] bg-[var(--text-secondary)]/10'
                                    : 'border-white/10 hover:border-white/30'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{item.emoji}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[9px] font-black truncate">{item.name}</div>
                                    <div className="text-[8px] text-white/30 truncate">{item.source}</div>
                                  </div>
                                  {isExternal && <ExternalLink size={10} className="text-white/30 shrink-0" />}
                                  {isEquipped && !isExternal && <Check size={10} className="text-[var(--text-secondary)] shrink-0" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {(config.accessories ?? []).length > 0 && (
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, accessories: [] }))}
                      className="text-[9px] text-white/30 hover:text-white/60 transition-colors text-center mt-1"
                    >
                      Clear all accessories
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvatarStudio;
