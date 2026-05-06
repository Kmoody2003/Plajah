import React, { useMemo, useRef, useCallback } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import { IPWorld, Character, LoreEntry, TimelineEvent, Album, Video } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Zap } from 'lucide-react';

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
  isEmbedded = false
}) => {
  const fgRef = useRef<ForceGraphMethods>(null);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];

    // Root World Node
    nodes.push({
      id: world.id,
      name: world.name,
      type: 'WORLD',
      color: '#ff8c00',
      size: 20,
      val: 30
    });

    // Characters
    characters.forEach(char => {
      nodes.push({
        id: char.id,
        name: char.name,
        type: 'CHARACTER',
        color: '#4A90E2',
        size: 10,
        img: char.imageUrl
      });
      links.push({ source: world.id, target: char.id, label: 'INHABITANT' });
    });

    // Lore
    loreEntries.forEach(entry => {
      nodes.push({
        id: entry.id,
        name: entry.title,
        type: 'LORE',
        color: '#9b59b6',
        size: 8
      });
      links.push({ source: world.id, target: entry.id, label: 'KNOWLEDGE' });
    });

    // Timeline
    timelineEvents.forEach(event => {
      nodes.push({
        id: event.id,
        name: event.title,
        type: 'TIMELINE',
        color: '#2ecc71',
        size: 6
      });
      links.push({ source: world.id, target: event.id, label: 'EVENT' });
      
      // Link events to characters if defined
      event.linkedCharacterIds?.forEach(cid => {
        if (characters.find(c => c.id === cid)) {
           links.push({ source: cid, target: event.id, label: 'PARTICIPANT' });
        }
      });

      // Link events to lore if defined
      event.linkedLoreIds?.forEach(lid => {
        if (loreEntries.find(l => l.id === lid)) {
           links.push({ source: lid, target: event.id, label: 'HISTORICAL_CONTEXT' });
        }
      });

      // Link events to assets if defined
      event.linkedAssetIds?.forEach(aid => {
        if (albums.find(a => a.id === aid) || videos.find(v => v.id === aid)) {
           links.push({ source: aid, target: event.id, label: 'MEDIA_REFERENCE' });
        }
      });
    });

    // Assets: Albums
    albums.forEach(album => {
      if (world.assetIds?.includes(album.id)) {
        nodes.push({
          id: album.id,
          name: album.title,
          type: 'ALBUM',
          color: '#f1c40f',
          size: 7
        });
        links.push({ source: world.id, target: album.id, label: 'SOUNDSCAPE' });
      }
    });

    // Assets: Videos
    videos.forEach(video => {
      if (world.assetIds?.includes(video.id)) {
        nodes.push({
          id: video.id,
          name: video.title,
          type: 'VIDEO',
          color: '#e74c3c',
          size: 7
        });
        links.push({ source: world.id, target: video.id, label: 'VISUAL' });
      }
    });

    // Custom links from world data
    world.graphConnections?.forEach(conn => {
       links.push({ 
         source: conn.sourceId, 
         target: conn.targetId, 
         label: conn.relationshipType 
       });
    });

    return { nodes, links };
  }, [world, characters, loreEntries, timelineEvents, albums, videos]);

  const handleNodeClick = useCallback((node: any) => {
    // Aim at node from outside it
    const distance = 40;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new pos
        node, // lookAt title
        3000  // ms transition duration
      );
    }
    
    if (onNodeClick) onNodeClick(node);
  }, [onNodeClick]);

  return (
    <div className={`${isEmbedded ? 'relative h-full w-full' : 'fixed inset-0 z-[2000]'} bg-black`}>
      {!isEmbedded && <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000_100%)] pointer-events-none z-10" />}
      
      {/* UI Overlay */}
      <div className={`absolute top-0 left-0 right-0 p-8 flex items-center justify-between z-20 ${isEmbedded ? 'opacity-0 hover:opacity-100 transition-opacity' : ''}`}>
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
            className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/40 hover:text-white ml-auto"
          >
            <X size={24} />
          </button>
        )}
      </div>

      <div className={`absolute bottom-8 left-8 p-6 glass rounded-2xl border border-white/10 z-20 max-w-xs ${isEmbedded ? 'scale-75 origin-bottom-left' : ''}`}>
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

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#000000"
        nodeLabel="name"
        nodeColor={(node: any) => node.color}
        nodeVal={(node: any) => node.size}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        onNodeClick={handleNodeClick}
        linkLabel="label"
        linkColor={() => 'rgba(255, 255, 255, 0.1)'}
      />
    </div>
  );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
  <div className="flex items-center gap-3">
    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{label}</span>
  </div>
);

export default WorldGraphView;
