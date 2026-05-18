import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, ChevronRight, Play, Pause, Music2, BookOpen,
  Users, Image as ImageIcon, Box, Heart, Swords, Star, Briefcase,
  UserCheck, UserX, Handshake, GraduationCap, Plus, Maximize2
} from 'lucide-react';
import { Character, Album, Track, CharacterRelationship } from '../types';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface CharacterDetailModalProps {
  character: Character;
  allCharacters: Character[];
  albums: Album[];
  onClose: () => void;
}

const RELATION_META: Record<CharacterRelationship['type'], { label: string; icon: React.ElementType; color: string }> = {
  FAMILY:       { label: 'Family',       icon: Heart,      color: 'text-pink-400' },
  FRIEND:       { label: 'Friend',       icon: UserCheck,  color: 'text-green-400' },
  RIVAL:        { label: 'Rival',        icon: Swords,     color: 'text-yellow-400' },
  ALLY:         { label: 'Ally',         icon: Handshake,  color: 'text-blue-400' },
  ENEMY:        { label: 'Enemy',        icon: UserX,      color: 'text-red-400' },
  ROMANTIC:     { label: 'Romantic',     icon: Heart,      color: 'text-rose-400' },
  COWORKER:     { label: 'Coworker',     icon: Briefcase,  color: 'text-purple-400' },
  ACQUAINTANCE: { label: 'Acquaintance', icon: Users,      color: 'text-white/40' },
  MENTOR:       { label: 'Mentor',       icon: GraduationCap, color: 'text-amber-400' },
  STUDENT:      { label: 'Student',      icon: Star,       color: 'text-cyan-400' },
};

// ── Depth-based 3D portrait (same pipeline as AlbumArt3DViewer) ──────────────
// Simplified inline depth viewer reusing Three.js via canvas
function DepthPortrait({ src }: { src: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderer: any, animFrame: number;

    const run = async () => {
      try {
        const THREE = await import('three');

        const mount = mountRef.current;
        if (!mount || cancelled) return;

        const w = mount.clientWidth || 400;
        const h = mount.clientHeight || 400;

        // Load image and compute simple luminance depth
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); });

        const res = 256;
        const canvas2 = document.createElement('canvas');
        canvas2.width = res; canvas2.height = res;
        const ctx2 = canvas2.getContext('2d')!;
        ctx2.drawImage(img, 0, 0, res, res);
        const data = ctx2.getImageData(0, 0, res, res).data;

        const depth = new Float32Array(res * res);
        for (let i = 0; i < res * res; i++) {
          const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const cx = (i % res) / res - 0.5, cy = Math.floor(i / res) / res - 0.5;
          const center = Math.max(0, 1 - Math.sqrt(cx * cx + cy * cy) * 2);
          depth[i] = sat * 0.4 + center * 0.3 + lum * 0.3;
        }
        // Smooth
        const sm = new Float32Array(res * res);
        for (let y = 1; y < res - 1; y++) for (let x = 1; x < res - 1; x++) {
          sm[y * res + x] = (depth[(y-1)*res+x] + depth[(y+1)*res+x] + depth[y*res+x-1] + depth[y*res+x+1] + depth[y*res+x] * 2) / 6;
        }
        // Gamma
        for (let i = 0; i < sm.length; i++) sm[i] = Math.pow(Math.min(1, sm[i]), 0.65);

        if (cancelled) return;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
        camera.position.set(0, 0, 2.2);

        const geo = new THREE.PlaneGeometry(2, 2, res - 1, res - 1);
        const positions = geo.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          positions.setZ(i, sm[i] * 1.8 - 0.3);
        }
        geo.computeVertexNormals();

        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide });
        const light = new THREE.DirectionalLight(0xffffff, 1.4);
        light.position.set(2, 2, 3);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6), light, new THREE.Mesh(geo, mat));

        let theta = 0, phi = 0;
        let dragging = false, lastX = 0, lastY = 0;
        const el = renderer.domElement;
        const onDown = (e: MouseEvent | TouchEvent) => {
          dragging = true;
          const p = 'touches' in e ? e.touches[0] : e;
          lastX = p.clientX; lastY = p.clientY;
        };
        const onUp = () => { dragging = false; };
        const onMove = (e: MouseEvent | TouchEvent) => {
          if (!dragging) return;
          const p = 'touches' in e ? e.touches[0] : e;
          theta -= (p.clientX - lastX) * 0.008;
          phi = Math.max(-0.8, Math.min(0.8, phi + (p.clientY - lastY) * 0.008));
          lastX = p.clientX; lastY = p.clientY;
        };
        el.addEventListener('mousedown', onDown as any);
        el.addEventListener('touchstart', onDown as any, { passive: true });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        el.addEventListener('mousemove', onMove as any);
        el.addEventListener('touchmove', onMove as any, { passive: true });

        const tick = () => {
          animFrame = requestAnimationFrame(tick);
          if (!dragging) theta += 0.004;
          const r = 2.2;
          camera.position.set(r * Math.sin(theta) * Math.cos(phi), r * Math.sin(phi), r * Math.cos(theta) * Math.cos(phi));
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
        };
        tick();
        setLoading(false);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrame);
      renderer?.dispose();
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [src]);

  return (
    <div ref={mountRef} className="w-full h-full relative">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/20 text-[9px] uppercase tracking-widest">3D unavailable</p>
        </div>
      )}
    </div>
  );
}

// ── Gallery carousel ──────────────────────────────────────────────────────────
function GalleryCarousel({ images, clips = [] }: { images: string[]; clips?: string[] }) {
  const all = [...images, ...clips];
  const [idx, setIdx] = useState(0);
  if (!all.length) return (
    <div className="aspect-[4/3] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
      <p className="text-white/20 text-[9px] uppercase tracking-widest">No gallery images</p>
    </div>
  );
  const current = all[idx];
  const isVideo = clips.includes(current);
  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black">
        {isVideo ? (
          <video src={current} controls className="w-full h-full object-contain" />
        ) : (
          <img src={current} className="w-full h-full object-cover" alt="" />
        )}
        {all.length > 1 && (
          <>
            <button onClick={() => setIdx(i => (i - 1 + all.length) % all.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-black transition-all">
              <ChevronLeft size={16} className="text-white" />
            </button>
            <button onClick={() => setIdx(i => (i + 1) % all.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-black transition-all">
              <ChevronRight size={16} className="text-white" />
            </button>
          </>
        )}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded-lg text-[8px] text-white/60 font-black uppercase tracking-widest">
          {idx + 1} / {all.length}
        </div>
      </div>
      {all.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {all.map((src, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`w-14 h-10 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${i === idx ? 'border-small-orange' : 'border-white/10'}`}>
              {clips.includes(src) ? (
                <div className="w-full h-full bg-white/10 flex items-center justify-center"><Play size={10} className="text-white" /></div>
              ) : (
                <img src={src} className="w-full h-full object-cover" alt="" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
type DetailTab = 'PROFILE' | 'JOURNAL' | 'CONNECTIONS' | 'PLAYLIST' | '3D';

const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character, allCharacters, albums, onClose
}) => {
  const [tab, setTab] = useState<DetailTab>('PROFILE');
  const { playTrack } = useGlobalPlayerState();

  const themeAlbum = albums.find(a => a.id === character.themeAlbumId);
  const playlistAlbums = albums.filter(a => character.playlistAlbumIds?.includes(a.id));
  const allPlaylistTracks: (Track & { albumTitle: string; albumCover: string })[] = playlistAlbums.flatMap(a =>
    a.tracks.map(t => ({ ...t, albumTitle: a.title, albumCover: a.coverImage }))
  ).filter(t => !character.playlistTrackIds?.length || character.playlistTrackIds.includes(t.id));

  const accent = character.accentColor || '#FF8C00';

  const tabs: { id: DetailTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'PROFILE',     label: 'Profile',      icon: ImageIcon },
    { id: 'JOURNAL',     label: 'Journal',      icon: BookOpen },
    { id: 'CONNECTIONS', label: 'Connections',  icon: Users },
    { id: 'PLAYLIST',    label: 'Playlist',     icon: Music2 },
    { id: '3D',          label: '3D Portrait',  icon: Box },
  ];

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full md:max-w-4xl max-h-[95vh] bg-[#0c0c0c] border border-white/10 rounded-t-[2.5rem] md:rounded-[2.5rem] overflow-hidden flex flex-col shadow-[0_0_120px_rgba(0,0,0,0.8)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Accent glow */}
        <div className="absolute top-0 inset-x-0 h-1 rounded-t-full" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

        {/* Header */}
        <div className="relative p-6 md:p-8 flex items-center gap-5 border-b border-white/5 flex-shrink-0">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 flex-shrink-0" style={{ borderColor: accent }}>
            <img src={character.imageUrl || `https://picsum.photos/seed/${character.id}/200/200`}
              className="w-full h-full object-cover" alt={character.name} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.4em] mb-1" style={{ color: accent }}>{character.role}</p>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-white leading-none truncate">{character.name}</h2>
            {character.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {character.tags.slice(0, 4).map(t => (
                  <span key={t} className="px-2 py-0.5 bg-white/5 rounded-full text-[7px] font-black uppercase tracking-widest text-white/30">#{t}</span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-3 rounded-full hover:bg-white/10 transition-all flex-shrink-0">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        {/* Tab row */}
        <div className="flex gap-1 px-4 md:px-6 pt-3 pb-1 border-b border-white/5 overflow-x-auto no-scrollbar flex-shrink-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex-shrink-0 ${tab === id ? 'text-black' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
              style={tab === id ? { backgroundColor: accent } : {}}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 md:p-8 no-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>

              {/* ── PROFILE ── */}
              {tab === 'PROFILE' && (
                <div className="space-y-6">
                  {/* Bio + Physical Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">Biography</h4>
                      <p className="text-sm text-white/70 leading-relaxed">{character.bio || 'No biography provided.'}</p>
                      {character.lore && (
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Lore / Origin</p>
                          <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{character.lore}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">Attributes</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {character.physicalStats && Object.entries(character.physicalStats).filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mb-1">{k}</p>
                            <p className="text-sm font-black text-white">{String(v)}</p>
                          </div>
                        ))}
                        {character.stats && Object.entries(character.stats).map(([k, v]) => (
                          <div key={k} className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mb-1">{k}</p>
                            <p className="text-sm font-black text-white">{String(v)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Gallery */}
                  {((character.gallery?.length ?? 0) > 0 || (character.clips?.length ?? 0) > 0) && (
                    <div className="space-y-3">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">Gallery</h4>
                      <GalleryCarousel images={character.gallery ?? []} clips={character.clips ?? []} />
                    </div>
                  )}
                </div>
              )}

              {/* ── JOURNAL ── */}
              {tab === 'JOURNAL' && (
                <div className="space-y-5">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">{character.name}'s Journal</h4>
                  {(character.journalEntries?.length ?? 0) > 0 ? (
                    <div className="space-y-4">
                      {character.journalEntries!.slice().reverse().map(entry => (
                        <motion.div key={entry.id} whileHover={{ x: 4 }}
                          className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/20">{entry.date}</p>
                            {entry.mood && (
                              <span className="px-2 py-0.5 bg-white/10 rounded-full text-[7px] font-black uppercase tracking-widest text-white/30">{entry.mood}</span>
                            )}
                          </div>
                          <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap italic">"{entry.content}"</p>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center border-2 border-dashed border-white/5 rounded-2xl">
                      <BookOpen className="text-white/10 mx-auto mb-3" size={32} />
                      <p className="text-white/20 text-[9px] uppercase tracking-widest">No journal entries yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── CONNECTIONS ── */}
              {tab === 'CONNECTIONS' && (
                <div className="space-y-5">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">Relationships</h4>
                  {(character.relationships?.length ?? 0) > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {character.relationships!.map((rel, i) => {
                        const meta = RELATION_META[rel.type];
                        const Icon = meta.icon as any;
                        const linked = allCharacters.find(c => c.id === rel.characterId);
                        return (
                          <motion.div key={i} whileHover={{ scale: 1.02 }}
                            className="flex items-center gap-4 p-5 bg-white/5 rounded-2xl border border-white/10 hover:border-white/20 transition-all">
                            <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
                              <img src={linked?.imageUrl || `https://picsum.photos/seed/${rel.characterId}/100/100`}
                                className="w-full h-full object-cover" alt={rel.characterName} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black uppercase tracking-tight text-white truncate">{rel.characterName}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Icon size={10} className={meta.color} />
                                <p className={`text-[8px] font-black uppercase tracking-widest ${meta.color}`}>{meta.label}</p>
                              </div>
                              {rel.note && <p className="text-[9px] text-white/30 mt-1 italic truncate">{rel.note}</p>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-16 text-center border-2 border-dashed border-white/5 rounded-2xl">
                      <Users className="text-white/10 mx-auto mb-3" size={32} />
                      <p className="text-white/20 text-[9px] uppercase tracking-widest">No connections defined</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── PLAYLIST ── */}
              {tab === 'PLAYLIST' && (
                <div className="space-y-5">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">{character.name}'s Soundtrack</h4>
                  {allPlaylistTracks.length > 0 ? (
                    <div className="space-y-2">
                      {allPlaylistTracks.map((track, i) => (
                        <motion.button key={track.id} whileHover={{ x: 4 }}
                          onClick={() => playTrack(track, { id: character.themeAlbumId || '', title: track.albumTitle, artist: '', coverImage: track.albumCover, tracks: allPlaylistTracks, type: 'MUSIC', description: '', themeColor: accent, createdAt: 0 } as any, 'LIBRARY')}
                          className="w-full flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 hover:border-white/20 transition-all text-left group"
                        >
                          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative">
                            <img src={track.albumCover} className="w-full h-full object-cover" alt="" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play size={12} className="text-white" fill="white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black uppercase tracking-tight text-white truncate">{track.title}</p>
                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{track.albumTitle}</p>
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/20">{i + 1}</span>
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center border-2 border-dashed border-white/5 rounded-2xl">
                      <Music2 className="text-white/10 mx-auto mb-3" size={32} />
                      <p className="text-white/20 text-[9px] uppercase tracking-widest">No music linked to this character</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── 3D PORTRAIT ── */}
              {tab === '3D' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">3D Depth Portrait</h4>
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/20 bg-white/5 px-3 py-1 rounded-full border border-white/5">Drag to rotate</span>
                  </div>
                  <div className="aspect-square rounded-2xl overflow-hidden bg-black border border-white/10" style={{ maxHeight: 400 }}>
                    {character.imageUrl ? (
                      <DepthPortrait src={character.imageUrl} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-white/20 text-[9px] uppercase tracking-widest">No portrait image</p>
                      </div>
                    )}
                  </div>
                  {character.modelUrl && (
                    <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">3D Model</p>
                        <p className="text-xs text-white/60 font-bold mt-0.5">Custom GLTF/GLB model available</p>
                      </div>
                      <a href={character.modelUrl} target="_blank" rel="noopener noreferrer"
                        className="px-4 py-2 bg-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all">
                        Open Model
                      </a>
                    </div>
                  )}
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default CharacterDetailModal;
