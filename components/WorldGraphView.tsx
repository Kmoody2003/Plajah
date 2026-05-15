import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import { IPWorld, Character, LoreEntry, TimelineEvent, Album, Video } from '../types';
import { X, Zap } from 'lucide-react';

interface WorldGraphViewProps {
  world: IPWorld;
  characters: Character[];
  loreEntries: LoreEntry[];
  timelineEvents: TimelineEvent[];
  albums: Album[];
  videos: Video[];
  onClose?: () => void;
  onNodeClick?: (node: any) => void;
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
  isEmbedded = false,
}) => {
  const fgRef = useRef<ForceGraphMethods>(null);
  const nebulaAdded = useRef(false);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];

    nodes.push({
      id: world.id,
      name: world.name,
      type: 'WORLD',
      color: '#ff8c00',
      size: 20,
      val: 30,
      img: world.coverImage,
    });

    characters.forEach(char => {
      nodes.push({ id: char.id, name: char.name, type: 'CHARACTER', color: '#4A90E2', size: 10, img: char.imageUrl });
      links.push({ source: world.id, target: char.id, label: 'INHABITANT' });
    });

    loreEntries.forEach(entry => {
      nodes.push({ id: entry.id, name: entry.title, type: 'LORE', color: '#9b59b6', size: 8 });
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
          size: 7,
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
          size: 7,
          img: video.thumbnailUrl,
          mediaUrl: video.url,
        });
        links.push({ source: world.id, target: video.id, label: 'VISUAL' });
      }
    });

    world.graphConnections?.forEach(conn => {
      links.push({ source: conn.sourceId, target: conn.targetId, label: conn.relationshipType });
    });

    return { nodes, links };
  }, [world, characters, loreEntries, timelineEvents, albums, videos]);

  // Add space nebula to Three.js scene (once, after engine stops)
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
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, transparent: true, opacity: 0.65, sizeAttenuation: false });
    group.add(new THREE.Points(starGeo, starMat));

    // Colored nebula blobs
    const clouds = [
      { color: 0x3d1a8a, x: 350, y: -180, z: -350, r: 360 },
      { color: 0x1a2a7a, x: -380, y: 280, z: 220, r: 300 },
      { color: 0x6a1a3a, x: 180, y: 380, z: -280, r: 330 },
      { color: 0x1a5a4a, x: -280, y: -320, z: 380, r: 260 },
    ];
    clouds.forEach(({ color, x, y, z, r }) => {
      const geo = new THREE.SphereGeometry(r, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.BackSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      group.add(mesh);
    });

    // Dark outer shell (replaces plain black bg)
    const shellGeo = new THREE.SphereGeometry(1600, 32, 32);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x00000d, side: THREE.BackSide });
    group.add(new THREE.Mesh(shellGeo, shellMat));

    scene.add(group);
  }, []);

  // Build a Three.js node object with glowing orb + cover art sprite
  const nodeThreeObject = useCallback((node: any) => {
    const r = (node.size || 6) * 1.8;
    const group = new THREE.Group();

    // Outer glow halo
    const glowGeo = new THREE.SphereGeometry(r * 1.7, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: node.color || '#ffffff',
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
    });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    // Core translucent sphere
    const coreGeo = new THREE.SphereGeometry(r, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: node.color || '#ffffff',
      transparent: true,
      opacity: 0.55,
    });
    group.add(new THREE.Mesh(coreGeo, coreMat));

    // Cover art sprite with radial gradient fade
    if (node.img) {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);

      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        ctx.clearRect(0, 0, size, size);
        // Circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(image, 0, 0, size, size);
        ctx.restore();
        // Radial fade out (destination-out erases toward edges)
        const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        tex.needsUpdate = true;
      };
      image.onerror = () => {};
      image.src = node.img;

      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85 });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(r * 2.5, r * 2.5, 1);
      group.add(sprite);
    }

    return group;
  }, []);

  // Click: smooth camera zoom-to-node center, then call parent handler
  const handleNodeClick = useCallback((node: any) => {
    if (fgRef.current && node.x != null) {
      const dist = 80;
      fgRef.current.cameraPosition(
        { x: node.x, y: node.y, z: (node.z ?? 0) + dist },
        { x: node.x, y: node.y, z: node.z ?? 0 },
        2000,
      );
    }
    onNodeClick?.(node);
  }, [onNodeClick]);

  // Hover: show tooltip, queue song/video preview after 2 s
  const handleNodeHover = useCallback((node: any) => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setHoveredNode(node ?? null);
  }, []);

  // Cleanup hover timer on unmount
  useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);

  return (
    <div
      ref={containerRef}
      className={`${isEmbedded ? 'relative h-full w-full' : 'fixed inset-0 z-[2000]'} bg-[#00000d] overflow-hidden`}
      onMouseMove={e => setHoverPos({ x: e.clientX, y: e.clientY })}
    >
      {/* Header overlay */}
      <div className={`absolute top-0 left-0 right-0 p-8 flex items-center justify-between z-20 pointer-events-none ${isEmbedded ? 'opacity-0 hover:opacity-100 transition-opacity' : ''}`}>
        {!isEmbedded && (
          <div>
            <h2 className="text-3xl font-black uppercase tracking-widest text-primary italic leading-none mb-2">
              Universe Topology
            </h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em]">
              Interactive 3D Connection Mapping: {world.name}
            </p>
          </div>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="pointer-events-auto p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/40 hover:text-white ml-auto"
          >
            <X size={24} />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className={`absolute bottom-8 left-8 p-6 bg-black/50 backdrop-blur-md rounded-2xl border border-white/10 z-20 max-w-xs pointer-events-none ${isEmbedded ? 'scale-75 origin-bottom-left' : ''}`}>
        <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
          <Zap size={14} /> Legend
        </h3>
        <div className="space-y-2">
          <LegendItem color="#ff8c00" label="Cosmic Seed (World)" />
          <LegendItem color="#4A90E2" label="Inhabitants" />
          <LegendItem color="#9b59b6" label="Chronicle (Lore)" />
          <LegendItem color="#2ecc71" label="Nexus (Events)" />
          <LegendItem color="#f1c40f" label="Soundscapes (Albums)" />
          <LegendItem color="#e74c3c" label="Visuals (Videos)" />
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && !isEmbedded && (
        <div
          className="fixed z-30 pointer-events-none bg-black/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 max-w-[220px] shadow-xl"
          style={{ left: hoverPos.x + 18, top: hoverPos.y - 48 }}
        >
          <p className="text-white font-black text-xs uppercase tracking-wider truncate">{hoveredNode.name}</p>
          <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mt-0.5">{hoveredNode.type}</p>
          {(hoveredNode.type === 'ALBUM' || hoveredNode.type === 'VIDEO') && (
            <p className="text-white/25 text-[9px] mt-1.5">Click to navigate · hover 2s to preview</p>
          )}
        </div>
      )}

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#00000d"
        nodeLabel=""
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        linkColor={() => 'rgba(255,255,255,0.12)'}
        linkLabel="label"
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onEngineStop={() => {
          setupNebula();
          fgRef.current?.zoomToFit(500, 80);
        }}
      />
    </div>
  );
};

const LegendItem = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-3">
    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{label}</span>
  </div>
);

export default WorldGraphView;
