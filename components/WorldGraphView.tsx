import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import { IPWorld, Character, LoreEntry, TimelineEvent, Album, Video } from '../types';
import { X, Zap, Volume2, VolumeX, RotateCcw, ExternalLink, ChevronRight } from 'lucide-react';

interface WorldGraphViewProps {
  world: IPWorld;
  characters: Character[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  albums: Album[];
  videos: Video[];
  onClose?: () => void;
  onNodeClick?: (node: any) => void;
  onNavigate?: (type: string, id: string) => void;
  isEmbedded?: boolean;
}

const WorldGraphView: React.FC<WorldGraphViewProps> = ({
  world,
  characters,
  loreEntries,
  timelineEvents,
  albums,
  videos,
  onClose,
  onNodeClick,
  onNavigate,
  isEmbedded = false,
}) => {
  const fgRef = useRef<ForceGraphMethods>(null);
  const nebulaAdded = useRef(false);
  const hasExploded = useRef(false);
  const introAnimDone = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [previewNode, setPreviewNode] = useState<any>(null);
  const [clickedNode, setClickedNode] = useState<any>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track real container size so ForceGraph3D reflows on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setDimensions({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Graph data ─────────────────────────────────────────────────────────────
  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];

    nodes.push({
      id: world.id,
      name: world.name,
      type: 'WORLD',
      color: '#ff8c00',
      size: 18,
      val: 30,
      img: world.coverImage,
    });

    characters.forEach(char => {
      nodes.push({ id: char.id, name: char.name, type: 'CHARACTER', color: '#4A90E2', size: 9, img: char.imageUrl, description: char.bio });
      links.push({ source: world.id, target: char.id, label: 'INHABITANT' });
    });

    loreEntries.forEach(entry => {
      nodes.push({ id: entry.id, name: entry.title, type: 'LORE', color: '#9b59b6', size: 7, description: entry.content?.slice(0, 140) });
      links.push({ source: world.id, target: entry.id, label: 'KNOWLEDGE' });
    });

    timelineEvents.forEach(event => {
      nodes.push({ id: event.id, name: event.title, type: 'TIMELINE', color: '#2ecc71', size: 6 });
      links.push({ source: world.id, target: event.id, label: 'EVENT' });
      event.linkedCharacterIds?.forEach(cid => {
        if (characters.find(c => c.id === cid)) links.push({ source: cid, target: event.id, label: 'PARTICIPANT' });
      });
      event.linkedLoreIds?.forEach(lid => {
        if (loreEntries.find(l => l.id === lid)) links.push({ source: lid, target: event.id, label: 'HISTORICAL_CONTEXT' });
      });
      event.linkedAssetIds?.forEach(aid => {
        if (albums.find(a => a.id === aid) || videos.find(v => v.id === aid))
          links.push({ source: aid, target: event.id, label: 'MEDIA_REFERENCE' });
      });
    });

    albums.forEach(album => {
      if (world.assetIds?.includes(album.id)) {
        nodes.push({
          id: album.id,
          name: album.title,
          type: 'ALBUM',
          color: '#f1c40f',
          size: 8,
          img: album.coverImage,
          previewUrl: album.tracks?.[0]?.url,
        });
        links.push({ source: world.id, target: album.id, label: 'SOUNDSCAPE' });
      }
    });

    videos.forEach(video => {
      if (world.assetIds?.includes(video.id)) {
        nodes.push({
          id: video.id,
          name: video.title,
          type: 'VIDEO',
          color: '#e74c3c',
          size: 8,
          img: video.thumbnailUrl,
          mediaUrl: video.url,
          embedUrl: video.embedUrl,
        });
        links.push({ source: world.id, target: video.id, label: 'VISUAL' });
      }
    });

    world.graphConnections?.forEach(conn => {
      links.push({ source: conn.sourceId, target: conn.targetId, label: conn.relationshipType });
    });

    return { nodes, links };
  }, [world, characters, loreEntries, timelineEvents, albums, videos]);

  // ── Force configuration: push nodes far apart ──────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current as any;
      if (!fg) return;
      fg.d3Force('charge')?.strength(-500).distanceMax(600);
      fg.d3Force('link')?.distance(130).strength(0.4);
      fg.d3Force('center')?.strength(0.05);
      fg.d3ReheatSimulation();
    }, 80);
    return () => clearTimeout(t);
  }, [graphData]);

  // Re-center graph whenever the container resizes
  useEffect(() => {
    if (!dimensions.width || !dimensions.height) return;
    const padding = Math.min(dimensions.width, dimensions.height) * 0.08;
    fgRef.current?.zoomToFit(400, padding);
  }, [dimensions]);

  const handleReset = useCallback(() => {
    setClickedNode(null);
    const padding = Math.min(dimensions.width || 400, dimensions.height || 400) * 0.08;
    fgRef.current?.zoomToFit(800, padding);
  }, [dimensions]);

  // ── Nebula background ──────────────────────────────────────────────────────
  const setupNebula = useCallback(() => {
    const fg = fgRef.current as any;
    if (!fg?.scene || nebulaAdded.current) return;
    nebulaAdded.current = true;
    const scene: THREE.Scene = fg.scene();
    const group = new THREE.Group();

    // Star field
    const starCount = 6000;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const radius = 900 + Math.random() * 500;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, transparent: true, opacity: 0.65, sizeAttenuation: false })));

    // Colored nebula blobs
    [
      { color: 0x3d1a8a, x: 350, y: -180, z: -350, r: 360 },
      { color: 0x1a2a7a, x: -380, y: 280, z: 220, r: 300 },
      { color: 0x6a1a3a, x: 180, y: 380, z: -280, r: 330 },
      { color: 0x1a5a4a, x: -280, y: -320, z: 380, r: 260 },
    ].forEach(({ color, x, y, z, r }) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.BackSide }),
      );
      mesh.position.set(x, y, z);
      group.add(mesh);
    });

    // Dark outer shell
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(1600, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x00000d, side: THREE.BackSide }),
    ));

    scene.add(group);
  }, []);

  // ── Node objects: glow halo + canvas sprite (tint baked in) ───────────────
  const nodeThreeObject = useCallback((node: any) => {
    const r = (node.size || 6) * 2;
    const group = new THREE.Group();

    // Always: outer glow halo
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.9, 16, 16),
      new THREE.MeshBasicMaterial({ color: node.color || '#ffffff', transparent: true, opacity: 0.07, side: THREE.BackSide }),
    ));

    if (node.img) {
      // Artwork sprite — color tint baked in, faded at edges
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);

      const drawFallback = () => {
        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = node.color || '#ffffff';
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
        tex.needsUpdate = true;
      };

      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        ctx.clearRect(0, 0, size, size);

        // 1. Draw artwork clipped to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(image, 0, 0, size, size);
        ctx.restore();

        // 2. Color tint overlay at 50% — source-atop paints only over existing pixels
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = node.color || '#ffffff';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // 3. Soft radial fade — destination-out erases toward the rim
        ctx.globalCompositeOperation = 'destination-out';
        const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
        grad.addColorStop(0,   'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(1,   'rgba(0,0,0,1)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';

        tex.needsUpdate = true;
      };
      image.onerror = drawFallback;
      image.src = node.img;

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.92 }));
      sprite.scale.set(r * 3.2, r * 3.2, 1);
      group.add(sprite);
    } else {
      // No artwork: plain colored sphere
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 16),
        new THREE.MeshBasicMaterial({ color: node.color || '#ffffff', transparent: true, opacity: 0.65 }),
      ));
    }

    return group;
  }, []);

  // ── Click: explosion burst on first touch, camera center, info card ─────────
  const handleNodeClick = useCallback((node: any) => {
    const fg = fgRef.current as any;

    // One-time "explode" burst on first interaction
    if (!hasExploded.current && fg) {
      hasExploded.current = true;
      fg.d3Force('charge')?.strength(-1400).distanceMax(800);
      fg.d3ReheatSimulation();
      setTimeout(() => {
        fg.d3Force('charge')?.strength(-450).distanceMax(600);
        fg.d3ReheatSimulation();
      }, 2500);
    }

    // Smooth camera zoom to node
    if (fgRef.current && node.x != null) {
      fgRef.current.cameraPosition(
        { x: node.x, y: node.y, z: (node.z ?? 0) + 90 },
        { x: node.x, y: node.y, z: node.z ?? 0 },
        1200,
      );
    }

    setClickedNode(node);
    onNodeClick?.(node);
  }, [onNodeClick]);

  // ── Hover: tooltip + 2-second preview trigger ──────────────────────────────
  const stopPreview = useCallback(() => {
    setPreviewNode(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setHoveredNode(node ?? null);

    if (!node) { stopPreview(); return; }

    const hasMedia = node.previewUrl || node.mediaUrl;
    if (!hasMedia) return;

    hoverTimerRef.current = setTimeout(() => {
      setPreviewNode(node);

      // Audio preview for albums
      if (node.type === 'ALBUM' && node.previewUrl) {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = node.previewUrl;
        audioRef.current.volume = audioMuted ? 0 : 0.55;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    }, 2000);
  }, [audioMuted, stopPreview]);

  // Toggle mute on the live audio element
  const toggleMute = () => {
    setAudioMuted(m => {
      if (audioRef.current) audioRef.current.volume = m ? 0.55 : 0;
      return !m;
    });
  };

  // Cleanup on unmount
  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const isYouTubeOrVimeo = (url?: string) =>
    !!url && (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com'));

  return (
    <div
      ref={containerRef}
      className={`${isEmbedded ? 'relative h-full w-full' : 'fixed inset-0 z-[2000]'} bg-[#00000d] overflow-hidden`}
      onMouseMove={e => setHoverPos({ x: e.clientX, y: e.clientY })}
    >
      {/* Header */}
      <div className={`absolute top-0 left-0 right-0 p-8 flex items-center justify-between z-20 pointer-events-none ${isEmbedded ? 'opacity-0 hover:opacity-100 transition-opacity' : ''}`}>
        {!isEmbedded && (
          <div>
            <h2 className="text-3xl font-black uppercase tracking-widest text-primary italic leading-none mb-2">Universe Topology</h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em]">Interactive 3D Connection Mapping: {world.name}</p>
          </div>
        )}
        <div className="flex items-center gap-3 ml-auto pointer-events-auto">
          <button
            onClick={handleReset}
            title="Reset view"
            className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/40 hover:text-white"
          >
            <RotateCcw size={18} />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/40 hover:text-white">
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className={`absolute z-20 pointer-events-none bg-black/50 backdrop-blur-md border border-white/10 ${isEmbedded ? 'bottom-3 left-3 p-3 rounded-xl' : 'bottom-8 left-8 p-5 rounded-2xl'}`}>
        <h3 className={`font-black uppercase tracking-widest text-primary flex items-center gap-2 ${isEmbedded ? 'text-[9px] mb-2' : 'text-xs mb-4'}`}><Zap size={isEmbedded ? 10 : 14} /> Legend</h3>
        <div className={isEmbedded ? 'space-y-1' : 'space-y-2'}>
          <LegendItem color="#ff8c00" label="Cosmic Seed (World)" compact={isEmbedded} />
          <LegendItem color="#4A90E2" label="Inhabitants" compact={isEmbedded} />
          <LegendItem color="#9b59b6" label="Chronicle (Lore)" compact={isEmbedded} />
          <LegendItem color="#2ecc71" label="Nexus (Events)" compact={isEmbedded} />
          <LegendItem color="#f1c40f" label="Soundscapes (Albums)" compact={isEmbedded} />
          <LegendItem color="#e74c3c" label="Visuals (Videos)" compact={isEmbedded} />
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && !isEmbedded && (
        <div
          className="fixed z-40 pointer-events-none bg-black/85 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 max-w-[200px] shadow-xl"
          style={{
            left: Math.min(Math.max(hoverPos.x + 18, 8), window.innerWidth - 216),
            top: Math.min(Math.max(hoverPos.y - 56, 8), window.innerHeight - 80),
          }}
        >
          <p className="text-white font-black text-xs uppercase tracking-wider truncate">{hoveredNode.name}</p>
          <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mt-0.5">{hoveredNode.type}</p>
          {(hoveredNode.previewUrl || hoveredNode.mediaUrl) && !previewNode && (
            <p className="text-white/25 text-[9px] mt-1.5 italic">Hold to preview…</p>
          )}
        </div>
      )}

      {/* Video preview panel */}
      {previewNode?.type === 'VIDEO' && previewNode.mediaUrl && !isYouTubeOrVimeo(previewNode.mediaUrl) && (
        <div
          className="fixed z-40 pointer-events-none shadow-2xl rounded-2xl overflow-hidden border border-white/15"
          style={{
            left: Math.min(Math.max(hoverPos.x + 18, 8), window.innerWidth - 216),
            top: Math.min(Math.max(hoverPos.y - 145, 8), window.innerHeight - 160),
            width: Math.min(200, window.innerWidth - 24),
          }}
        >
          <video
            key={previewNode.id}
            src={previewNode.mediaUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-28 object-cover"
          />
          <div className="bg-black/80 px-3 py-2">
            <p className="text-white text-[9px] font-black uppercase tracking-widest truncate">{previewNode.name}</p>
          </div>
        </div>
      )}

      {/* Video thumbnail panel (YouTube/Vimeo or no direct URL) */}
      {previewNode?.type === 'VIDEO' && (previewNode.img && (isYouTubeOrVimeo(previewNode.mediaUrl) || !previewNode.mediaUrl)) && (
        <div
          className="fixed z-40 pointer-events-none shadow-2xl rounded-2xl overflow-hidden border border-white/15"
          style={{
            left: Math.min(Math.max(hoverPos.x + 18, 8), window.innerWidth - 216),
            top: Math.min(Math.max(hoverPos.y - 145, 8), window.innerHeight - 160),
            width: Math.min(200, window.innerWidth - 24),
          }}
        >
          <img src={previewNode.img} alt="" className="w-full h-28 object-cover" />
          <div className="bg-black/80 px-3 py-2">
            <p className="text-white text-[9px] font-black uppercase tracking-widest truncate">{previewNode.name}</p>
          </div>
        </div>
      )}

      {/* Album audio preview indicator */}
      {previewNode?.type === 'ALBUM' && previewNode.previewUrl && (
        <div
          className="fixed z-40 pointer-events-auto shadow-2xl rounded-2xl overflow-hidden border border-white/15 bg-black/80 backdrop-blur-md"
          style={{
            left: Math.min(Math.max(hoverPos.x + 18, 8), window.innerWidth - 216),
            top: Math.min(Math.max(hoverPos.y - 110, 8), window.innerHeight - 130),
            width: Math.min(200, window.innerWidth - 24),
          }}
        >
          {previewNode.img && <img src={previewNode.img} alt="" className="w-full h-20 object-cover" />}
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="flex gap-0.5 items-end h-4">
              {[3, 5, 4, 6, 3, 5].map((h, i) => (
                <div key={i} className="w-1 rounded-full bg-yellow-400" style={{ height: h * 2, animation: `pulse ${0.4 + i * 0.1}s ease-in-out infinite alternate` }} />
              ))}
            </div>
            <p className="text-white text-[9px] font-black uppercase tracking-widest truncate flex-1">{previewNode.name}</p>
            <button onClick={toggleMute} className="text-white/50 hover:text-white shrink-0">
              {audioMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* Node info card */}
      {clickedNode && (
        <div className={`absolute z-30 ${isEmbedded ? 'bottom-4 right-4 max-w-[220px]' : 'bottom-8 right-8 max-w-[280px]'} bg-black/85 backdrop-blur-xl border border-white/15 rounded-2xl overflow-hidden shadow-2xl`}>
          {clickedNode.img && (
            <div className="relative">
              <img src={clickedNode.img} alt="" className="w-full h-28 object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-2 left-3">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full`} style={{ backgroundColor: nodeTypeColor(clickedNode.type) + '33', color: nodeTypeColor(clickedNode.type) }}>
                  {nodeTypeLabel(clickedNode.type)}
                </span>
              </div>
            </div>
          )}
          {!clickedNode.img && (
            <div className="px-4 pt-4 pb-0">
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full`} style={{ backgroundColor: nodeTypeColor(clickedNode.type) + '33', color: nodeTypeColor(clickedNode.type) }}>
                {nodeTypeLabel(clickedNode.type)}
              </span>
            </div>
          )}
          <div className="p-4">
            <h3 className="font-black text-sm leading-tight mb-1">{clickedNode.name}</h3>
            {clickedNode.description && (
              <p className="text-[11px] text-white/50 leading-relaxed mb-3 line-clamp-3">{clickedNode.description}</p>
            )}
            <div className="flex items-center gap-2">
              {onNavigate && (clickedNode.type === 'VIDEO' || clickedNode.type === 'ALBUM') && (
                <button
                  onClick={() => { onNavigate(clickedNode.type, clickedNode.id); setClickedNode(null); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-bold transition-colors"
                >
                  <ExternalLink size={12} />
                  Open
                </button>
              )}
              {onNavigate && (clickedNode.type === 'CHARACTER' || clickedNode.type === 'LORE' || clickedNode.type === 'TIMELINE' || clickedNode.type === 'WORLD') && (
                <button
                  onClick={() => { onNavigate(clickedNode.type, clickedNode.id); setClickedNode(null); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-bold transition-colors"
                >
                  <ChevronRight size={12} />
                  World Page
                </button>
              )}
              <button
                onClick={() => setClickedNode(null)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#00000d"
        width={dimensions.width || undefined}
        height={dimensions.height || undefined}
        nodeLabel=""
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        linkColor={() => 'rgba(255,255,255,0.12)'}
        linkLabel="label"
        warmupTicks={120}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onEngineStop={() => {
          setupNebula();
          const padding = Math.min(dimensions.width || 400, dimensions.height || 400) * 0.08;
          if (!introAnimDone.current) {
            introAnimDone.current = true;
            // Jump camera to a distant position first (the "traveling through space" start)
            const fg = fgRef.current as any;
            if (fg?.camera) {
              const cam = fg.camera();
              cam.position.set(0, 0, 4500);
            }
            // Then smoothly rush in to fit all nodes
            setTimeout(() => {
              fgRef.current?.zoomToFit(2200, padding);
            }, 80);
          } else {
            fgRef.current?.zoomToFit(500, padding);
          }
        }}
      />
    </div>
  );
};

const nodeTypeColor = (type: string) => {
  const map: Record<string, string> = {
    WORLD: '#ff8c00', CHARACTER: '#4A90E2', LORE: '#9b59b6',
    TIMELINE: '#2ecc71', ALBUM: '#f1c40f', VIDEO: '#e74c3c',
  };
  return map[type] || '#ffffff';
};

const nodeTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    WORLD: 'World', CHARACTER: 'Character', LORE: 'Lore',
    TIMELINE: 'Event', ALBUM: 'Album', VIDEO: 'Video',
  };
  return map[type] || type;
};

const LegendItem = ({ color, label, compact }: { color: string; label: string; compact?: boolean }) => (
  <div className="flex items-center gap-3">
    <div className={`${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full shrink-0`} style={{ backgroundColor: color }} />
    <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-bold uppercase tracking-widest opacity-40`}>{label}</span>
  </div>
);

export default WorldGraphView;
