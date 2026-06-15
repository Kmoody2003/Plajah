
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { VisualizationConfig, VisualizerMode } from '../types';

interface AudioVisualizerProps {
  analyser: AnalyserNode;
  config: VisualizationConfig;
  isPlaying: boolean;
  hasBackground: boolean;
  backgroundMediaRef?: React.RefObject<HTMLDivElement | null>;
}

// Shard Type for Mosaic
interface Shard {
  originalPoints: { x: number; y: number }[];
  projectedPoints: { x: number; y: number }[]; // Pre-allocated to avoid GC
  center: { x: number; y: number };
  // 3D Properties
  rotX: number;
  rotY: number;
  rotZ: number;
  z: number;
  // Animation state
  phaseOffset: number;
  rotationSpeed: { x: number; y: number; z: number };
}

// Particle Object Definition for Pooling
interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    life: number;
    initialLife: number;
    active: boolean;
}

// 3D Cloud Particle for Storm Mode
interface CloudParticle {
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
    rotationSpeed: number;
    opacity: number;
    textureIndex: number;
}

// Rain and Ripple Interfaces
interface RainDrop {
    x: number;
    y: number;
    z: number;
    speed: number;
    length: number;
}

interface Ripple {
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    opacity: number;
    lineWidth: number;
}

// --- STAGE GEOMETRY LAYOUTS ---

// 1. Chevrons (Original)
const LAYOUT_CHEVRONS = [
    // Towers & Chevrons (14 panels)
    { points: [{x:0,y:0.4}, {x:0.12,y:0.4}, {x:0.12,y:0.9}, {x:0,y:0.8}], freqIdx: 0 },
    { points: [{x:0,y:0.2}, {x:0.12,y:0.2}, {x:0.12,y:0.38}, {x:0,y:0.38}], freqIdx: 1 },
    { points: [{x:0.15,y:0.5}, {x:0.25,y:0.4}, {x:0.35,y:0.5}, {x:0.25,y:0.6}], freqIdx: 3 },
    { points: [{x:0.15,y:0.65}, {x:0.25,y:0.55}, {x:0.35,y:0.65}, {x:0.25,y:0.75}], freqIdx: 5 },
    { points: [{x:0.15,y:0.8}, {x:0.25,y:0.7}, {x:0.35,y:0.8}, {x:0.25,y:0.9}], freqIdx: 7 },
    { points: [{x:0.38,y:0.3}, {x:0.5,y:0.55}, {x:0.5,y:0.9}, {x:0.38,y:0.8}], freqIdx: 10 },
    { points: [{x:0.62,y:0.3}, {x:0.5,y:0.55}, {x:0.5,y:0.9}, {x:0.62,y:0.8}], freqIdx: 10 },
    { points: [{x:0.65,y:0.5}, {x:0.75,y:0.4}, {x:0.85,y:0.5}, {x:0.75,y:0.6}], freqIdx: 7 },
    { points: [{x:0.65,y:0.65}, {x:0.75,y:0.55}, {x:0.85,y:0.65}, {x:0.75,y:0.75}], freqIdx: 5 },
    { points: [{x:0.65,y:0.8}, {x:0.75,y:0.7}, {x:0.85,y:0.8}, {x:0.75,y:0.9}], freqIdx: 3 },
    { points: [{x:0.88,y:0.4}, {x:1,y:0.4}, {x:1,y:0.8}, {x:0.88,y:0.9}], freqIdx: 1 },
    { points: [{x:0.88,y:0.2}, {x:1,y:0.2}, {x:1,y:0.38}, {x:0.88,y:0.38}], freqIdx: 0 },
    { points: [{x:0.2,y:0.1}, {x:0.3,y:0.05}, {x:0.4,y:0.1}, {x:0.3,y:0.25}], freqIdx: 15 },
    { points: [{x:0.6,y:0.1}, {x:0.7,y:0.05}, {x:0.8,y:0.1}, {x:0.7,y:0.25}], freqIdx: 15 },
];

// 2. Diamond Grid
const LAYOUT_DIAMONDS = Array.from({length: 14}).map((_, i) => {
    // 2 rows of 7
    const row = Math.floor(i / 7);
    const col = i % 7;
    const cx = 0.1 + col * 0.13;
    const cy = 0.3 + row * 0.4;
    const w = 0.06;
    const h = 0.15;
    return {
        points: [
            {x: cx, y: cy - h},     // Top
            {x: cx + w, y: cy},     // Right
            {x: cx, y: cy + h},     // Bottom
            {x: cx - w, y: cy}      // Left
        ],
        freqIdx: i % 10
    };
});

// 3. Radial Shards
const LAYOUT_RADIAL = Array.from({length: 14}).map((_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const innerR = 0.15;
    const outerR = 0.45;
    const cx = 0.5;
    const cy = 0.5;
    const width = 0.1; 
    
    // Create wedge/shard shapes
    return {
        points: [
            {x: cx + Math.cos(angle - width) * innerR, y: cy + Math.sin(angle - width) * innerR},
            {x: cx + Math.cos(angle - width/2) * outerR, y: cy + Math.sin(angle - width/2) * outerR},
            {x: cx + Math.cos(angle + width/2) * outerR, y: cy + Math.sin(angle + width/2) * outerR},
            {x: cx + Math.cos(angle + width) * innerR, y: cy + Math.sin(angle + width) * innerR}
        ],
        freqIdx: (i * 2) % 20
    };
});

const STAGE_LAYOUTS = [LAYOUT_CHEVRONS, LAYOUT_DIAMONDS, LAYOUT_RADIAL];

const AudioVisualizer = forwardRef<HTMLCanvasElement, AudioVisualizerProps>(({ analyser, config, isPlaying, hasBackground, backgroundMediaRef }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  
  // Frame Rate Control
  const lastFrameTimeRef = useRef<number>(0);

  // Object Pooling for Particles
  const MAX_PARTICLES = 300;
  const particlePoolRef = useRef<Particle[]>([]);
  
  const shardsRef = useRef<Shard[]>([]);
  
  // Cached DOM reference for background element (Layer 1 - Content)
  const cachedLayer1Ref = useRef<CanvasImageSource | null>(null);

  // Storm Mode Refs
  const cloudParticlesRef = useRef<CloudParticle[]>([]);
  const cloudSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const stormBufferRef = useRef<HTMLCanvasElement | null>(null);
  const rainRef = useRef<RainDrop[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);

  // Luminance Mode Refs
  const lumBufferRef = useRef<HTMLCanvasElement | null>(null);

  // Stage Morphing State
  const stageStateRef = useRef({
      layoutIdx: 0,
      nextLayoutIdx: 1,
      morphT: 0, // 0 to 1
      lastBeatTime: 0,
      beatCount: 0,
      rotation: 0
  });

  // Beat Detection State for Shake Effect
  const shakeStateRef = useRef({
      beatCount: 0,
      lastBeatTime: 0,
      currentShake: 0
  });

  // --- MIDI Visual Effect Refs ---
  const midiShockwavesRef = useRef<Array<{
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    color: string;
    opacity: number;
  }>>([]);

  const midiKeyClustersRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    life: number;
    maxLife: number;
  }>>([]);

  const midiFlashRef = useRef<{
    label: string;
    value: string | number;
    opacity: number;
  } | null>(null);

  // Maschine Jam 8x8 active cells map
  const activeJamCellsRef = useRef<Map<number, {
    row: number;
    col: number;
    hue: number;
    active: boolean;
    opacity: number;
  }>>(new Map());

  // Cosmic Starfield coordinate structures
  const cosmicStarsRef = useRef<Array<{
    x: number;
    y: number;
    z: number;
    color: string;
  }>>([]);

  // Expose the canvas element to the parent via ref
  useImperativeHandle(ref, () => canvasRef.current!);

  // --- MIDI Event High-Speed Listeners ---
  useEffect(() => {
    const handleNoteOn = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const { note, velocity, deviceName } = detail;
      const lowerName = (deviceName || '').toLowerCase();

      // Determine controller family
      // Standard MPC/NI pad ranges or name detection
      const isMaschineStudio = lowerName.includes('maschine studio') || (note >= 60 && note <= 75);
      const isKompleteKontrol = lowerName.includes('komplete kontrol') || lowerName.includes('komplete_kontrol') || (note >= 36 && note <= 84 && !isMaschineStudio);
      const isMaschineJam = lowerName.includes('maschine jam') || (note >= 0 && note <= 63 && !isMaschineStudio && !isKompleteKontrol);

      if (isMaschineStudio && note >= 60 && note <= 75) {
        // Pad hits: radial ripple/shockwave
        const padIndex = note - 60;
        const col = padIndex % 4;
        const row = 3 - Math.floor(padIndex / 4); // Standard bottom-to-top pad grid
        const canEl = canvasRef.current;
        if (canEl) {
          const width = canEl.width;
          const height = canEl.height;
          const px = (col + 0.5) / 4;
          const py = (row + 0.5) / 4;
          const hue = padIndex * 22.5; 
          midiShockwavesRef.current.push({
            x: px * width,
            y: py * height,
            radius: 10,
            maxRadius: (velocity / 127) * 220 + 120,
            color: `hsla(${hue}, 100%, 65%, 0.85)`,
            opacity: 1.0
          });
        }
      } else if (isKompleteKontrol && note >= 36 && note <= 84) {
        // Key press (Kontrol): spawn a cluster of particles at X=(note-36)/48, Y=0.5
        const canEl = canvasRef.current;
        if (canEl) {
          const width = canEl.width;
          const height = canEl.height;
          const xPercent = (note - 36) / 48;
          const cx = Math.max(0.05, Math.min(0.95, xPercent)) * width;
          const cy = 0.5 * height;
          const noteHue = ((note - 36) / 48) * 360;
          const color = `hsla(${noteHue}, 100%, 60%, 1.0)`;

          // Spawn a dense, vibrant cluster
          const clusterSize = Math.round((velocity / 127) * 15 + 8);
          for (let i = 0; i < clusterSize; i++) {
            const angle = Math.random() * Math.PI * 2;
            const velocityPower = (velocity / 127) * 350 + 100;
            const speed = Math.random() * velocityPower;
            midiKeyClustersRef.current.push({
              x: cx,
              y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: (velocity / 127) * 14 + 4,
              color,
              life: 1.0,
              maxLife: 1.0
            });
          }
        }
      } else if (isMaschineJam && note >= 0 && note <= 63) {
        // Jam 8x8 Pad Matrix - cell layout trigger with hue spectrum
        const row = Math.floor(note / 8);
        const col = note % 8;
        const hue = row * 45; // Hue cycle by row
        activeJamCellsRef.current.set(note, {
          row,
          col,
          hue,
          active: true,
          opacity: 1.0
        });

        // Spawn beautiful particles at cell's center coordinates on canvas
        const canEl = canvasRef.current;
        if (canEl) {
          const width = canEl.width;
          const height = canEl.height;
          const cx = ((col + 0.5) / 8) * width;
          const cy = ((row + 0.5) / 8) * height;
          const jamCol = `hsla(${hue}, 100%, 60%, 1.0)`;

          const clusterSize = Math.round((velocity / 127) * 10 + 6);
          for (let i = 0; i < clusterSize; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 240 + 60;
            midiKeyClustersRef.current.push({
              x: cx,
              y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: (velocity / 127) * 10 + 3,
              color: jamCol,
              life: 1.0,
              maxLife: 1.0
            });
          }
        }
      }
    };

    const handleNoteOff = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const { note } = detail;
      if (note >= 0 && note <= 63) {
        const cell = activeJamCellsRef.current.get(note);
        if (cell) {
          cell.active = false; // Fade out triggered
        }
      }
    };

    const handleFlash = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        midiFlashRef.current = {
          label: detail.label,
          value: detail.value,
          opacity: 1.0
        };
      }
    };

    window.addEventListener('plajah-midi-note-on', handleNoteOn);
    window.addEventListener('plajah-midi-note-off', handleNoteOff);
    window.addEventListener('plajah-midi-flash', handleFlash);

    return () => {
      window.removeEventListener('plajah-midi-note-on', handleNoteOn);
      window.removeEventListener('plajah-midi-note-off', handleNoteOff);
      window.removeEventListener('plajah-midi-flash', handleFlash);
    };
  }, []);
  
  // Initialize Pool once
  useEffect(() => {
      if (particlePoolRef.current.length === 0) {
          for (let i = 0; i < MAX_PARTICLES; i++) {
              particlePoolRef.current.push({
                  x: 0, y: 0, vx: 0, vy: 0, size: 0, color: '#fff', life: 0, initialLife: 0, active: false
              });
          }
      }
      // Pre-render cloud texture
      if (!cloudSpriteRef.current) {
          createCloudSprite();
      }
  }, []);

  const createCloudSprite = () => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      
      // Draw a fluffy radial gradient
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(128, 128, 128, 0, Math.PI * 2);
      ctx.fill();

      // Add some noise clumps
      for(let i=0; i<5; i++) {
          const x = 64 + Math.random() * 128;
          const y = 64 + Math.random() * 128;
          const r = 30 + Math.random() * 50;
          const grad2 = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad2.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
          grad2.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = grad2;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
      }

      cloudSpriteRef.current = c;
  };

  // Update Cached BG Element when background changes
  useEffect(() => {
      const updateCache = () => {
          if (backgroundMediaRef?.current) {
              // We look for the hidden source elements which are now managed by BackgroundLayer
              // We specifically look for "layer-1" which contains the VIDEO CONTENT for masks
              // Layer 2 is the environment, which we don't need here (it's drawn by BackgroundLayer behind us)
              const el1 = backgroundMediaRef.current.querySelector('.layer-1');
              if (el1) {
                  cachedLayer1Ref.current = el1 as CanvasImageSource;
              } else {
                  // Fallback to finding any video if class logic fails
                  const anyVid = backgroundMediaRef.current.querySelector('video') || backgroundMediaRef.current.querySelector('img');
                  if (anyVid) cachedLayer1Ref.current = anyVid as CanvasImageSource;
              }
          }
      };
      // Check immediately and on interval (in case of rotation)
      updateCache();
      const interval = setInterval(updateCache, 1000); 
      return () => clearInterval(interval);
  }, [hasBackground, backgroundMediaRef]);
  
  // Initialize shards or clouds if mode changes
  useEffect(() => {
    if (config.enableMosaic) {
        generateShards();
    }
    if (config.mode === VisualizerMode.Storm) {
        initStorm();
    }
  }, [config.mode, config.enableMosaic, config.mosaicIntensity]);

  const initStorm = () => {
      cloudParticlesRef.current = [];
      const count = 60; // Enough for volume without killing CPU
      for(let i=0; i<count; i++) {
          cloudParticlesRef.current.push({
              x: (Math.random() - 0.5) * 4000,
              y: (Math.random() - 0.5) * 1000 - 500, // Bias upwards slightly
              z: Math.random() * 2000 + 500,
              scale: 2 + Math.random() * 3,
              rotation: Math.random() * Math.PI * 2,
              rotationSpeed: (Math.random() - 0.5) * 0.005,
              opacity: 0.2 + Math.random() * 0.4,
              textureIndex: 0
          });
      }

      // Init Rain
      rainRef.current = [];
      const rainCount = 400; // Heavy rain
      for(let i=0; i<rainCount; i++) {
          rainRef.current.push({
              x: (Math.random() - 0.5) * window.innerWidth * 2,
              y: Math.random() * window.innerHeight * 2 - window.innerHeight,
              z: Math.random() * 1000,
              speed: 25 + Math.random() * 15,
              length: 15 + Math.random() * 15
          });
      }

      ripplesRef.current = [];
  };

  const generateShards = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const shards: Shard[] = [];
      
      const cols = Math.floor(6 * config.mosaicIntensity);
      const rows = Math.floor(4 * config.mosaicIntensity);
      const cellW = width / cols;
      const cellH = height / rows;

      for(let r=0; r<rows; r++) {
          for(let c=0; c<cols; c++) {
              const x1 = c * cellW;
              const y1 = r * cellH;
              const x2 = x1 + cellW;
              const y2 = y1 + cellH;
              
              const cx = x1 + cellW/2 + (Math.random()-0.5) * cellW * 0.4;
              const cy = y1 + cellH/2 + (Math.random()-0.5) * cellH * 0.4;
              
              const createShard = (points: {x: number, y: number}[], centerX: number, centerY: number) => {
                  shards.push({
                      originalPoints: points.map(p => ({x: p.x - centerX, y: p.y - centerY})),
                      projectedPoints: points.map(() => ({ x: 0, y: 0 })), 
                      center: {x: centerX, y: centerY},
                      rotX: (Math.random() - 0.5) * 0.5,
                      rotY: (Math.random() - 0.5) * 0.5,
                      rotZ: (Math.random() - 0.5) * 0.2,
                      z: 0,
                      phaseOffset: Math.random() * Math.PI * 2,
                      rotationSpeed: {
                          x: (Math.random() - 0.5) * 0.02,
                          y: (Math.random() - 0.5) * 0.02,
                          z: (Math.random() - 0.5) * 0.01
                      }
                  });
              };

              createShard([{x: x1, y: y1}, {x: x2, y: y1}, {x: cx, y: cy}], cx, (y1 + cy)/2);
              createShard([{x: x2, y: y1}, {x: x2, y: y2}, {x: cx, y: cy}], (x2 + cx)/2, cy);
              createShard([{x: x2, y: y2}, {x: x1, y: y2}, {x: cx, y: cy}], cx, (y2 + cy)/2);
              createShard([{x: x1, y: y2}, {x: x1, y: y1}, {x: cx, y: cy}], (x1 + cx)/2, cy);
          }
      }
      shardsRef.current = shards;
  };

  const drawMosaic = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array, deltaTime: number) => {
      const bgElement = cachedLayer1Ref.current;
      const isVideo = bgElement instanceof HTMLVideoElement;
      const isReady = bgElement && (!isVideo || (bgElement as HTMLVideoElement).readyState >= 2);

      let bassSum = 0;
      for(let i = 0; i < 5; i++) bassSum += data[i];
      const bassAvg = bassSum / 5;
      const kick = Math.pow(bassAvg / 255, 3);
      const kickImpulse = kick * config.mosaicIntensity; 
      
      const shiftIntensity = config.mosaicShiftIntensity || 0;
      const time = performance.now() * 0.001 * config.speed;
      const screenCx = width / 2;
      const screenCy = height / 2;
      const projectionScale = 1000;

      let bgScale = 1.05;
      if (config.backgroundPulseIntensity > 0) {
           const pulseFactor = (bassAvg / 255) * (config.backgroundPulseIntensity * 0.15);
           bgScale += pulseFactor;
      }

      ctx.save();
      
      const shards = shardsRef.current;
      for (let s = 0; s < shards.length; s++) {
          const shard = shards[s];
          
          const rotSpeedMult = (1 + kickImpulse * 5) * deltaTime;
          shard.rotX += shard.rotationSpeed.x * rotSpeedMult;
          shard.rotY += shard.rotationSpeed.y * rotSpeedMult;
          shard.rotZ += shard.rotationSpeed.z * rotSpeedMult;

          const zPop = kickImpulse * 150; 
          const zFloat = Math.sin(time + shard.phaseOffset) * 20;
          const currentZ = zFloat - zPop; 

          let shiftX = 0;
          let shiftY = 0;

          if (shiftIntensity > 0) {
              const dx = shard.center.x - screenCx;
              const dy = shard.center.y - screenCy;
              const dist = Math.sqrt(dx*dx + dy*dy) || 1;
              const dirX = dx / dist;
              const dirY = dy / dist;

              const pushDist = kick * shiftIntensity * 200; 
              shiftX += dirX * pushDist;
              shiftY += dirY * pushDist;

              const jitterStrength = kick * shiftIntensity * 50;
              shiftX += Math.sin(time * 10 + shard.phaseOffset) * jitterStrength;
              shiftY += Math.cos(time * 10 + shard.phaseOffset * 2) * jitterStrength;
          }

          const effectiveCx = shard.center.x + shiftX;
          const effectiveCy = shard.center.y + shiftY;

          // Inlined 3D Transform
          const cosX = Math.cos(shard.rotX);
          const sinX = Math.sin(shard.rotX);
          const cosY = Math.cos(shard.rotY);
          const sinY = Math.sin(shard.rotY);
          const cosZ = Math.cos(shard.rotZ);
          const sinZ = Math.sin(shard.rotZ);

          for (let p = 0; p < shard.originalPoints.length; p++) {
              const pt = shard.originalPoints[p];
              const y1 = pt.y * cosX;
              const z1 = pt.y * sinX;
              const x2 = pt.x * cosY + z1 * sinY;
              const z2 = -pt.x * sinY + z1 * cosY;
              const x3 = x2 * cosZ - y1 * sinZ;
              const y3 = x2 * sinZ + y1 * cosZ;
              const finalZ = z2 + currentZ;

              const depth = projectionScale / (projectionScale + finalZ);
              shard.projectedPoints[p].x = effectiveCx + x3 * depth;
              shard.projectedPoints[p].y = effectiveCy + y3 * depth;
          }

          ctx.beginPath();
          for (let p = 0; p < shard.projectedPoints.length; p++) {
              const pt = shard.projectedPoints[p];
              if (p === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
          }
          ctx.closePath();

          ctx.save();
          ctx.clip();

          if (isReady && hasBackground) {
              const refractScale = 0.5 + (kickImpulse * 0.5);
              const offX = Math.sin(shard.rotY) * 100 * refractScale;
              const offY = -Math.sin(shard.rotX) * 100 * refractScale;
              
              const dw = width * bgScale;
              const dh = height * bgScale;
              const dx = (width - dw) / 2 + offX;
              const dy = (height - dh) / 2 + offY;
              
              try {
                ctx.drawImage(bgElement!, dx, dy, dw, dh);
              } catch (e) {
                // Ignore draw errors
              }
              
              ctx.fillStyle = `rgba(0, 0, 0, 0.2)`; 
              ctx.fill();
          } else {
              ctx.fillStyle = config.colorPalette[0] || '#333';
              ctx.fill();
          }

          const lightAngle = (shard.rotY + shard.rotX) + time; 
          const sheenOpacity = 0.1 + Math.max(0, Math.sin(lightAngle * 3)) * 0.4 + (kickImpulse * 0.5);
          ctx.fillStyle = `rgba(255,255,255,${sheenOpacity})`;
          ctx.fill();

          ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + kickImpulse * 0.7})`;
          ctx.lineWidth = 1 + kickImpulse * 2;
          ctx.stroke();

          ctx.restore(); 
      }
      
      ctx.restore();
  };

  const drawStage = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array, deltaTime: number) => {
      const bgElement = cachedLayer1Ref.current; // Layer 1 is the video content
      const isVideo = bgElement instanceof HTMLVideoElement;
      const isReady = bgElement && (!isVideo || (bgElement as HTMLVideoElement).readyState >= 2);

      // Global Intensity
      let bassSum = 0;
      for(let i=0; i<10; i++) bassSum += data[i];
      const bassLevel = (bassSum / 10) / 255;
      
      const now = performance.now();
      const state = stageStateRef.current;

      // 1. Beat Detection for Morphing & Rotation Kick
      // Trigger new shape every X bars if enabled, or just periodic
      const beatThreshold = 180;
      const beatVal = bassLevel * 255 * config.sensitivity;
      
      let isBeat = false;
      if (beatVal > beatThreshold && now - state.lastBeatTime > 300) {
          state.lastBeatTime = now;
          state.beatCount++;
          isBeat = true;

          // Automation for Morph
          if (config.enableSliceAutomation) { // Reuse slice automation setting for stage morphing
              const interval = config.sliceAutomationInterval || 4;
              if (state.beatCount % (interval * 4) === 0) {
                  // Trigger Morph
                  state.layoutIdx = state.nextLayoutIdx;
                  state.nextLayoutIdx = (state.nextLayoutIdx + 1) % STAGE_LAYOUTS.length;
                  state.morphT = 0;
              }
          }
      }

      // 2. Update Morph Progress
      if (state.morphT < 1) {
          state.morphT += 1.0 * deltaTime * 0.02 * config.speed;
          if (state.morphT > 1) state.morphT = 1;
      }

      // 3. Update Global Rotation
      // Rotate slowly over time, plus kick impulse
      state.rotation += 0.002 * deltaTime * config.speed; 
      if (isBeat) {
           state.rotation += 0.02 * (Math.random() > 0.5 ? 1 : -1);
      }
      
      // Interpolation Function (Smoothstep)
      const t = state.morphT * state.morphT * (3 - 2 * state.morphT);
      
      const currentLayout = STAGE_LAYOUTS[state.layoutIdx];
      const nextLayout = STAGE_LAYOUTS[state.nextLayoutIdx];

      // Draw Loop
      ctx.save();
      
      // Global Stage Transform (Center Screen)
      const cx = width / 2;
      const cy = height / 2;
      ctx.translate(cx, cy);
      
      // Swaying Rotation
      const sway = Math.sin(state.rotation) * 0.1; // +/- ~6 degrees
      ctx.rotate(sway);
      
      // Breathing Scale
      const breathe = 1.0 + (bassLevel * 0.1 * config.sensitivity);
      ctx.scale(breathe, breathe);

      ctx.translate(-cx, -cy);

      // Draw Panels
      currentLayout.forEach((panel, i) => {
          const nextPanel = nextLayout[i % nextLayout.length];
          
          // Calculate intensity
          const bin = panel.freqIdx * 5 + 5; 
          const level = (data[bin] / 255) * config.sensitivity;
          const active = level > 0.4;
          const opacity = active ? level : 0.0;
          const color = config.colorPalette[panel.freqIdx % config.colorPalette.length] || '#fff';

          ctx.save();
          ctx.beginPath();
          
          // Vertex Interpolation
          for(let ptIdx = 0; ptIdx < 4; ptIdx++) {
              const p1 = panel.points[ptIdx];
              const p2 = nextPanel.points[ptIdx];
              
              // Lerp
              const x = p1.x + (p2.x - p1.x) * t;
              const y = p1.y + (p2.y - p1.y) * t;
              
              const px = x * width;
              const py = y * height;
              
              if (ptIdx === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
          }
          ctx.closePath();
          
          // Draw Black Background (Off state)
          ctx.fillStyle = '#000';
          ctx.fill();
          
          ctx.clip();
          
          // Draw Video Content
          if (hasBackground && isReady) {
              const bgW = width * 1.1;
              const bgH = height * 1.1;
              const dx = (width - bgW) / 2;
              const dy = (height - bgH) / 2;
              
              if (active) {
                  try {
                      ctx.drawImage(bgElement, dx, dy, bgW, bgH);
                  } catch(e) {}
                  
                  ctx.globalCompositeOperation = 'hard-light';
                  ctx.fillStyle = color;
                  ctx.globalAlpha = opacity * 0.8; 
                  ctx.fillRect(0, 0, width, height);
              }
          } else {
              if (active) {
                  ctx.fillStyle = color;
                  ctx.globalAlpha = opacity;
                  ctx.fillRect(0, 0, width, height);
              }
          }
          
          if (active) {
              ctx.globalCompositeOperation = 'screen';
              ctx.fillStyle = 'rgba(255,255,255,0.2)';
              ctx.fillRect(0,0,width,height);
          }

          ctx.restore();
          
          // Stroke Frame
          ctx.beginPath();
          // Re-calculate points for stroke (since we didn't save transformed path)
          for(let ptIdx = 0; ptIdx < 4; ptIdx++) {
              const p1 = panel.points[ptIdx];
              const p2 = nextPanel.points[ptIdx];
              const x = p1.x + (p2.x - p1.x) * t;
              const y = p1.y + (p2.y - p1.y) * t;
              const px = x * width;
              const py = y * height;
              if (ptIdx === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 2;
          ctx.stroke();
      });

      // Global Stage Light Wash
      if (config.enableLighting && bassLevel > 0.6) {
          const lightOp = (bassLevel - 0.6) * config.lightingIntensity;
          const grad = ctx.createLinearGradient(0, 0, 0, height);
          grad.addColorStop(0, `rgba(255, 255, 255, ${lightOp})`);
          grad.addColorStop(0.5, `rgba(255, 255, 255, 0)`);
          
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
      }
      
      ctx.restore();
  };

  const drawLuminance = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      const bgElement = cachedLayer1Ref.current;
      const isVideo = bgElement instanceof HTMLVideoElement;
      const isReady = bgElement && (!isVideo || (bgElement as HTMLVideoElement).readyState >= 2);

      if (!hasBackground || !isReady) return;

      // Init Offscreen Buffer for High Pass Filter
      if (!lumBufferRef.current) {
          lumBufferRef.current = document.createElement('canvas');
      }
      const buf = lumBufferRef.current;
      if (buf.width !== width || buf.height !== height) {
          buf.width = width;
          buf.height = height;
      }
      const bufCtx = buf.getContext('2d');
      if (!bufCtx) return;

      // Audio Analysis
      // Bass -> Brightness Pulse
      let bassSum = 0;
      for(let i=0; i<5; i++) bassSum += data[i];
      const bass = (bassSum / 5) / 255;
      
      // Mid -> Color Hue Shift
      let midSum = 0;
      for(let i=20; i<60; i++) midSum += data[i];
      const mid = (midSum / 40) / 255;

      // Treble -> Flicker
      let trebSum = 0;
      for(let i=100; i<150; i++) trebSum += data[i];
      const treb = (trebSum / 50) / 255;
      
      const sensitivity = config.sensitivity || 1.0;

      // 1. Isolate Bright Spots (Luminance Key)
      // We draw the video to the buffer with a high contrast filter to crush blacks and boost whites
      const threshold = config.luminanceThreshold || 0.5;
      const contrast = 100 + (threshold * 200); // 100% to 300%
      const brightness = -20 - (threshold * 80); // -20% to -100%

      bufCtx.clearRect(0, 0, width, height);
      bufCtx.filter = `contrast(${contrast}%) brightness(${brightness}%) grayscale(100%)`;
      try {
          bufCtx.drawImage(bgElement, 0, 0, width, height);
      } catch(e) {}
      bufCtx.filter = 'none';

      // 2. Composite Highlights back onto Main Canvas (which currently has background due to transparency/BackgroundLayer)
      // Actually, since we are in AudioVisualizer, the canvas is on TOP of BackgroundLayer.
      // So we just draw the "lights" over the existing background.

      ctx.save();
      
      // Apply Audio Modulation
      const bassBright = 1 + (bass * sensitivity * (config.lumBassBrightness || 1.0));
      const hueShift = mid * sensitivity * (config.lumMidColorCycle || 1.0) * 360;
      
      // Flicker Logic
      let flicker = 1.0;
      if ((config.lumTrebleFlicker || 0) > 0.1) {
           const trebVal = treb * sensitivity;
           if (trebVal > 0.4) {
               // Chaos factor
               flicker = 1.0 - (Math.random() * (config.lumTrebleFlicker || 1.0) * trebVal);
           }
      }

      ctx.globalCompositeOperation = 'screen'; // Additive blending for lights
      
      // Apply color and brightness to the white parts of the buffer
      ctx.filter = `brightness(${bassBright * flicker}) hue-rotate(${hueShift}deg) saturate(200%)`;
      
      // If user wants colored lights, we can tint the buffer
      // Draw buffer
      ctx.drawImage(buf, 0, 0);

      // Add Glow
      if (config.glowIntensity > 0) {
          ctx.filter = `blur(${config.glowIntensity}px) brightness(${bassBright})`;
          ctx.drawImage(buf, 0, 0);
      }

      ctx.restore();
  };

  const drawParticles = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array, deltaTime: number) => {
     let bassSum = 0;
     const sampleSize = 20;
     for(let i = 0; i < sampleSize; i++) bassSum += data[i];
     const bassLevel = bassSum / sampleSize; 
     
     const isBeat = (bassLevel * config.sensitivity) > 150;
     const spawnCount = isBeat ? Math.floor(config.particleCount / 5) : Math.max(1, Math.floor(deltaTime)); 

     let spawned = 0;
     const pool = particlePoolRef.current;
     
     let activeCount = 0;
     for(let i=0; i<MAX_PARTICLES; i++) if (pool[i].active) activeCount++;
     
     if (activeCount < config.particleCount) {
        for(let i=0; i<MAX_PARTICLES && spawned < spawnCount; i++) {
            if (!pool[i].active) {
                const emitters = config.emitters && config.emitters.length > 0 ? config.emitters : [{x: 0.5, y: 0.5}];
                const emitter = emitters[Math.floor(Math.random() * emitters.length)];
                
                const startX = emitter.x * width;
                const startY = emitter.y * height;
                const angle = Math.random() * Math.PI * 2;
                const velocity = (Math.random() * 5 + 2) * config.speed;
                const life = 1.0 + (Math.random() * 0.5);

                pool[i].x = startX;
                pool[i].y = startY;
                pool[i].vx = Math.cos(angle) * velocity;
                pool[i].vy = Math.sin(angle) * velocity;
                pool[i].size = Math.random() * 4 + 1;
                pool[i].color = config.colorPalette[Math.floor(Math.random() * config.colorPalette.length)];
                pool[i].life = life;
                pool[i].initialLife = life;
                pool[i].active = true;
                
                spawned++;
            }
        }
     }

     if (config.particleGlow > 0) {
         ctx.shadowBlur = config.particleGlow;
         ctx.shadowColor = config.colorPalette[0]; 
     } else {
         ctx.shadowBlur = 0;
     }

     const turbulence = config.particleTurbulence || 0;

     for (let i = 0; i < MAX_PARTICLES; i++) {
         const p = pool[i];
         if (!p.active) continue;
         
         p.x += p.vx * deltaTime;
         p.y += p.vy * deltaTime;

         if (turbulence > 0) {
             p.vx += (Math.random() - 0.5) * turbulence * deltaTime;
             p.vy += (Math.random() - 0.5) * turbulence * deltaTime;
             p.vx *= 0.99;
             p.vy *= 0.99;
         }
         
         p.life -= (0.01 / config.particleLifespan) * deltaTime;
         
         if(p.life <= 0) {
             p.active = false;
         } else {
             const lifePercent = p.life / p.initialLife;
             ctx.globalAlpha = Math.max(0, lifePercent);
             
             if (config.particleGlow > 10) {
                 ctx.shadowColor = p.color;
             }

             ctx.fillStyle = p.color;
             ctx.beginPath();
             ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
             ctx.fill();
         }
     }
     
     ctx.globalAlpha = 1.0;
     ctx.shadowBlur = 0;
  };

  const drawSpectrum = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 3.5;
    const barCount = data.length / 4; 
    const step = (Math.PI * 2) / barCount;
    
    if (config.glowIntensity > 2) {
        ctx.shadowBlur = config.glowIntensity;
        ctx.shadowColor = config.colorPalette[0];
    }
    
    for (let i = 0; i < barCount; i++) {
        const value = data[i] * config.sensitivity;
        const percent = value / 255;
        const barHeight = Math.max(0, (percent * radius * 1.5));
        
        const colorIndex = Math.floor(percent * (config.colorPalette.length - 1));
        const color = config.colorPalette[colorIndex] || config.colorPalette[0];

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(i * step);
        ctx.fillStyle = color;
        ctx.fillRect(-2, radius, 4, barHeight);
        ctx.restore();
    }
    ctx.shadowBlur = 0;
  };

  const drawWaveform = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array, bufferLength: number) => {
    ctx.lineWidth = 4;
    const sliceWidth = width * 1.0 / bufferLength;
    let x = 0;

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    config.colorPalette.forEach((c, i) => {
        gradient.addColorStop(i / (config.colorPalette.length - 1), c);
    });
    ctx.strokeStyle = gradient;
    
    if (config.glowIntensity > 2) {
        ctx.shadowBlur = config.glowIntensity;
        ctx.shadowColor = config.colorPalette[0];
    }

    ctx.beginPath();
    for(let i = 0; i < bufferLength; i++) {
        const v = (data[i] / 128.0) * config.sensitivity; 
        const y = v * height / 2; 

        if(i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  };
  
  const drawNebula = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      const time = performance.now() * 0.001 * config.speed;
      const step = 20; 
      
      const low = data[10] / 255;
      const mid = data[100] / 255;
      const high = data[200] / 255;

      ctx.globalCompositeOperation = 'lighter'; 
      
      for(let i = 0; i < config.colorPalette.length; i++) {
          ctx.beginPath();
          ctx.strokeStyle = config.colorPalette[i];
          ctx.lineWidth = 2;
          
          for(let x = 0; x < width; x+= step) {
              const scaledX = x * 0.01;
              const y = height/2 
                + Math.sin(scaledX + time + i) * (100 * (1 + low)) 
                + Math.cos(scaledX * 0.5 - time) * (50 * (1 + mid))
                + Math.sin(scaledX * 2 + time * 2) * (20 * (1 + high * 2));
              
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          if (config.glowIntensity > 0) {
            ctx.shadowBlur = config.glowIntensity * 2;
            ctx.shadowColor = config.colorPalette[i];
          }
          ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
  };

  const drawTunnel = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      const time = performance.now() * 0.001 * config.speed;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
      const ringCount = 15;
      
      const lyrics = config.enableLyricsVisualDrive && (window as any).__sonicLyricsState && (window as any).__sonicLyricsState.active
          ? (window as any).__sonicLyricsState
          : null;
      const vowelExt = lyrics ? lyrics.vowelScore * 10 : 0;
      const consExt = lyrics ? lyrics.consonantScore * 0.15 : 0;

      const bass = data[5] / 255;
      const treble = data[150] / 255;

      ctx.save();
      ctx.lineWidth = 1.5 + treble * 4;
      
      for (let i = 0; i < ringCount; i++) {
          const progress = ((i / ringCount) + (time * 0.12)) % 1;
          const radius = progress * maxRadius;
          
          if (radius <= 0) continue;
          
          const opacity = (1 - progress) * (0.2 + bass * 0.8);
          const paletteIndex = i % config.colorPalette.length;
          const baseColor = config.colorPalette[paletteIndex];
          
          ctx.strokeStyle = baseColor;
          ctx.globalAlpha = opacity;
          
          ctx.beginPath();
          const segments = 6 + Math.floor(vowelExt) + (config.enableSlicing ? 4 : 0);
          const rotationOffset = time * 0.2 + consExt;

          for (let s = 0; s <= segments; s++) {
              const angle = (s / segments) * Math.PI * 2 + rotationOffset;
              const rOffset = (data[Math.floor((s / segments) * 30)] / 255) * 45 * (bass + 0.1);
              const r = radius + rOffset;
              const x = centerX + Math.cos(angle) * r;
              const y = centerY + Math.sin(angle) * r;
              
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          
          ctx.closePath();
          if (config.glowIntensity > 0) {
              ctx.shadowBlur = config.glowIntensity * 1.5;
              ctx.shadowColor = baseColor;
          }
          ctx.stroke();
      }
      ctx.restore();
  };

  const drawVortex = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      const time = performance.now() * 0.001 * config.speed;
      const centerX = width / 2;
      const centerY = height / 2;
      const numPoints = 170;
      
      const lyrics = config.enableLyricsVisualDrive && (window as any).__sonicLyricsState && (window as any).__sonicLyricsState.active
          ? (window as any).__sonicLyricsState
          : null;
      const vowelExt = lyrics ? lyrics.vowelScore * 120 : 0;
      const consExt = lyrics ? lyrics.consonantScore * 0.2 : 0;

      const bass = data[2] / 255;
      const mids = data[60] / 255;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      
      for (let arm = 0; arm < 3; arm++) {
          const color = config.colorPalette[arm % config.colorPalette.length];
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2 + mids * 3;

          for (let i = 0; i < numPoints; i++) {
              const t = i / numPoints;
              const angle = t * Math.PI * 11 + time * (1 + arm * 0.4) + (arm * Math.PI * 2 / 3) + consExt;
              const rawFreq = data[Math.floor(t * (data.length * 0.4))] || 0;
              const freqFactor = rawFreq / 255;
              
              const r = t * (Math.min(width, height) * 0.6) * (1 + bass * 0.3) + freqFactor * (35 + vowelExt);
              const x = centerX + Math.cos(angle) * r;
              const y = centerY + Math.sin(angle) * r;

              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }

          if (config.glowIntensity > 0) {
              ctx.shadowBlur = config.glowIntensity * 2;
              ctx.shadowColor = color;
          }
          ctx.stroke();
      }
      ctx.restore();
  };

  const drawLiquid = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      const time = performance.now() * 0.001 * config.speed;
      const centerX = width / 2;
      const centerY = height / 2;
      
      const lyrics = config.enableLyricsVisualDrive && (window as any).__sonicLyricsState && (window as any).__sonicLyricsState.active
          ? (window as any).__sonicLyricsState
          : null;
      const vowelExt = lyrics ? lyrics.vowelScore * 95 : 0;
      const consExt = lyrics ? lyrics.consonantScore * 50 : 0;

      const bass = data[4] / 255;
      const mids = data[50] / 255;
      const treble = data[150] / 255;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      
      const numBlobs = 5;
      for (let i = 0; i < numBlobs; i++) {
          const color = config.colorPalette[i % config.colorPalette.length];
          
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.15 + (bass * 0.18);

          const offsetX = Math.sin(time + i * 1.6) * (110 * (1 + mids)) + consExt * Math.sin(i);
          const offsetY = Math.cos(time * 0.82 + i * 2.2) * (90 * (1 + mids)) + consExt * Math.cos(i);
          
          const r = (110 + i * 35) * (1 + bass * 0.45) + vowelExt + treble * 25;
          
          const segments = 38;
          for (let s = 0; s <= segments; s++) {
              const angle = (s / segments) * Math.PI * 2;
              const wave = Math.sin(angle * (4 + i) + time * 3.5) * (12 * (1 + bass * 1.8));
              const currentR = r + wave;
              
              const x = centerX + offsetX + Math.cos(angle) * currentR;
              const y = centerY + offsetY + Math.sin(angle) * currentR;
              
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          
          ctx.closePath();
          ctx.fill();
          
          if (config.glowIntensity > 0) {
              ctx.shadowBlur = config.glowIntensity * 2.5;
              ctx.shadowColor = color;
              ctx.strokeStyle = color;
              ctx.lineWidth = 1.0;
              ctx.stroke();
          }
      }
      ctx.restore();
  };

  const drawKaleidoscope = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      const time = performance.now() * 0.001 * config.speed;
      const centerX = width / 2;
      const centerY = height / 2;
      
      const lyrics = config.enableLyricsVisualDrive && (window as any).__sonicLyricsState && (window as any).__sonicLyricsState.active
          ? (window as any).__sonicLyricsState
          : null;
      const vowelExt = lyrics ? lyrics.vowelScore * 12 : 0;
      const consExt = lyrics ? lyrics.consonantScore * 0.45 : 0;

      const bass = data[1] / 255;
      const treble = data[180] / 255;
      
      const segments = Math.max(4, 8 + Math.floor(vowelExt) + (config.enableSlicing ? 4 : 0)); 
      const angleStep = (Math.PI * 2) / segments;
      
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(time * 0.12 + consExt);
      
      for (let s = 0; s < segments; s++) {
          ctx.rotate(angleStep);
          
          const color = config.colorPalette[s % config.colorPalette.length];
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 + bass * 3.5;
          ctx.beginPath();
          
          const radiusLimit = Math.min(width, height) * 0.42 * (1 + bass * 0.22);
          
          for (let i = 0; i < 35; i += 2) {
              const f = data[i] / 255;
              const r = (i / 35) * radiusLimit + f * (45 + treble * 90);
              const theta = (i / 35) * angleStep * 0.5;
              
              const x = Math.cos(theta) * r;
              const y = Math.sin(theta) * r;
              
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          
          if (config.glowIntensity > 0) {
              ctx.shadowBlur = config.glowIntensity * 1.5;
              ctx.shadowColor = color;
          }
          ctx.stroke();
          
          ctx.scale(1, -1);
          ctx.beginPath();
          for (let i = 0; i < 35; i += 2) {
              const f = data[i] / 255;
              const r = (i / 35) * radiusLimit + f * (45 + treble * 90);
              const theta = (i / 35) * angleStep * 0.5;
              
              const x = Math.cos(theta) * r;
              const y = Math.sin(theta) * r;
              
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.scale(1, -1);
      }
      ctx.restore();
  };

  const drawCosmic = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array, deltaTime: number) => {
      const centerX = width / 2;
      const centerY = height / 2;
      
      const lyrics = config.enableLyricsVisualDrive && (window as any).__sonicLyricsState && (window as any).__sonicLyricsState.active
          ? (window as any).__sonicLyricsState
          : null;
      const vowelExt = lyrics ? lyrics.vowelScore * 12 : 0;
      const consExt = lyrics ? lyrics.consonantScore * 650 : 0;

      const bass = data[2] / 255;
      const treble = data[150] / 255;
      
      if (!cosmicStarsRef.current || cosmicStarsRef.current.length === 0) {
          const arr = [];
          for (let i = 0; i < 200; i++) {
              arr.push({
                  x: (Math.random() - 0.5) * 1000,
                  y: (Math.random() - 0.5) * 1000,
                  z: Math.random() * 1000,
                  color: config.colorPalette[i % config.colorPalette.length]
              });
          }
          cosmicStarsRef.current = arr;
      }
      
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      
      const warpSpeed = (90 + bass * 700 + consExt + config.speed * 110) * deltaTime;
      
      cosmicStarsRef.current.forEach((star: any) => {
          star.z -= warpSpeed;
          if (star.z <= 0) {
              star.z = 1000;
              star.x = (Math.random() - 0.5) * 1000;
              star.y = (Math.random() - 0.5) * 1000;
          }
          
          const k = 450 / star.z;
          const px = star.x * k + centerX;
          const py = star.y * k + centerY;
          
          if (px >= 0 && px <= width && py >= 0 && py <= height) {
              const size = (1 - star.z / 1000) * (4 + treble * 11 + vowelExt);
              
              const prevK = 450 / (star.z + warpSpeed * 1.6);
              const tailX = star.x * prevK + centerX;
              const tailY = star.y * prevK + centerY;
              
              ctx.beginPath();
              ctx.strokeStyle = star.color;
              ctx.lineWidth = size * 0.45;
              ctx.moveTo(px, py);
              ctx.lineTo(tailX, tailY);
              ctx.stroke();
              
              ctx.beginPath();
              ctx.fillStyle = '#ffffff';
              ctx.arc(px, py, size * 0.35, 0, Math.PI * 2);
              ctx.fill();
          }
      });
      ctx.restore();
  };

  const drawRetroGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array, deltaTime: number) => {
      const time = performance.now() * 0.001 * config.speed;
      const centerX = width / 2;
      const horizon = height * 0.46;
      
      const lyrics = config.enableLyricsVisualDrive && (window as any).__sonicLyricsState && (window as any).__sonicLyricsState.active
          ? (window as any).__sonicLyricsState
          : null;
      const vowelExt = lyrics ? lyrics.vowelScore * 120 : 0;
      const consExt = lyrics ? lyrics.consonantScore * 55 : 0;

      const bass = data[1] / 255;

      ctx.save();
      
      const colorGrid = config.colorPalette[0] || '#ec4899';
      const colorSky = config.colorPalette[1] || '#8b5cf6';
      
      ctx.strokeStyle = colorGrid;
      ctx.lineWidth = 1.5;
      
      if (config.glowIntensity > 0) {
          ctx.shadowBlur = config.glowIntensity * 1.5;
          ctx.shadowColor = colorGrid;
      }
      
      const linesCount = 28;
      for (let i = 0; i <= linesCount; i++) {
          const xOffset = (i / linesCount) * width;
          ctx.beginPath();
          ctx.moveTo(centerX + (xOffset - centerX) * 0.02, horizon);
          ctx.lineTo(xOffset, height);
          ctx.stroke();
      }
      
      const hLinesCount = 9;
      const speed = 0.4 + bass * 1.6 + vowelExt * 0.015;
      const gridYOffset = (time * speed) % 1;
      
      for (let i = 0; i < hLinesCount; i++) {
          const progress = (i + gridYOffset) / hLinesCount;
          const mappedY = horizon + Math.pow(progress, 2.6) * (height - horizon);
          
          ctx.beginPath();
          ctx.lineWidth = 0.8 + progress * 2.8;
          ctx.moveTo(0, mappedY);
          ctx.lineTo(width, mappedY);
          ctx.stroke();
      }
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#06011a';
      ctx.strokeStyle = colorSky;
      ctx.lineWidth = 2.0;
      
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      const mPoints = 48;
      for (let i = 0; i <= mPoints; i++) {
          const x = (i / mPoints) * width;
          const freqIndex = Math.floor((i / mPoints) * 90);
          const amp = (data[freqIndex] / 255) * (120 + consExt);
          const y = horizon - amp - Math.abs(Math.sin(i * 0.22)) * 25;
          ctx.lineTo(x, y);
      }
      ctx.lineTo(width, horizon);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      ctx.restore();
  };

  const drawLightningBolt = (ctx: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number, depth: number) => {
        if (depth <= 0) return;
        
        const endX = x + Math.cos(angle) * length;
        const endY = y + Math.sin(angle) * length;
        
        ctx.lineWidth = depth * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        const branchCount = Math.random() < 0.6 ? 2 : 1;
        
        for (let i = 0; i < branchCount; i++) {
            const nextLen = length * 0.7;
            const deviation = (Math.random() - 0.5) * 0.8; 
            drawLightningBolt(ctx, endX, endY, nextLen, angle + deviation, depth - 1);
        }
  };

  const drawStorm = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array, deltaTime: number) => {
      // Audio Data
      let bassSum = 0;
      let trebSum = 0;
      for(let i = 0; i < 5; i++) bassSum += data[i];
      for(let i = 100; i < 120; i++) trebSum += data[i];
      const bassAvg = (bassSum / 5) / 255; // 0-1
      const trebAvg = (trebSum / 20) / 255; // 0-1
      
      const bgElement = cachedLayer1Ref.current;
      const isVideo = bgElement instanceof HTMLVideoElement;
      const isReady = bgElement && (!isVideo || (bgElement as HTMLVideoElement).readyState >= 2);

      const time = performance.now() * 0.001 * config.speed;
      const horizonY = height * 0.65; // Floor horizon line

      // Setup Cloud Buffer for Masking
      if (!stormBufferRef.current) {
          stormBufferRef.current = document.createElement('canvas');
      }
      const buf = stormBufferRef.current;
      if (buf.width !== width || buf.height !== height) {
          buf.width = width;
          buf.height = height;
      }
      const bufCtx = buf.getContext('2d');
      if (!bufCtx) return;

      // Clear Buffer
      bufCtx.clearRect(0, 0, width, height);

      // 1. Draw Clouds into Buffer (White)
      const cx = width / 2;
      const cy = height / 2;
      const fov = 500;
      
      cloudParticlesRef.current.sort((a, b) => b.z - a.z); // Painter's algo

      if (cloudSpriteRef.current) {
          for (let p of cloudParticlesRef.current) {
               // Move clouds
               p.z -= 2 * config.speed * deltaTime;
               p.rotation += p.rotationSpeed * deltaTime;
               
               // Reset if passed camera
               if (p.z < 1) p.z += 2500;
               
               // Billow on bass
               const beatScale = 1.0 + (bassAvg * 0.5);
               
               // Projection
               const scale = fov / (fov + p.z);
               const x2d = cx + p.x * scale;
               const y2d = cy + p.y * scale;
               const size = 256 * p.scale * scale * beatScale;

               // Fog/Depth opacity
               const depthAlpha = Math.min(1, p.z / 2000); // Fade out at distance
               const nearAlpha = Math.min(1, Math.max(0, p.z - 50) / 200); // Fade in at camera
               const finalAlpha = p.opacity * (1 - depthAlpha) * nearAlpha;
               
               if (finalAlpha > 0.01) {
                   bufCtx.save();
                   bufCtx.translate(x2d, y2d);
                   bufCtx.rotate(p.rotation);
                   bufCtx.globalAlpha = finalAlpha;
                   // Use Source Over to accumulate cloud mass opacity
                   bufCtx.globalCompositeOperation = 'source-over'; 
                   bufCtx.drawImage(cloudSpriteRef.current, -size/2, -size/2, size, size);
                   bufCtx.restore();
               }
          }
      }

      // 2. Composite Video into Clouds (Source In)
      // This keeps the Video pixels ONLY where the Cloud pixels are active
      bufCtx.globalCompositeOperation = 'source-in';
      
      if (hasBackground && isReady) {
          // Scale video slightly to cover movement and pulse
          const scale = 1.0 + (bassAvg * 0.1 * config.backgroundPulseIntensity);
          bufCtx.save();
          bufCtx.translate(width/2, height/2);
          bufCtx.scale(scale, scale);
          bufCtx.translate(-width/2, -height/2);
          try {
              bufCtx.drawImage(bgElement, 0, 0, width, height);
          } catch(e) {}
          bufCtx.restore();
      } else {
          // Fallback to palette color if no video
          bufCtx.fillStyle = config.colorPalette[0] || '#444';
          bufCtx.fillRect(0, 0, width, height);
      }
      
      bufCtx.globalCompositeOperation = 'source-over'; // Reset

      // 3. Draw Background (Dark Sky) on Main Canvas
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#020205'); // Deep night
      grad.addColorStop(1, '#0a0a1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Lightning Logic
      const isLightning = trebAvg > 0.6 && Math.random() < 0.15;
      
      if (isLightning) {
          // Flash background
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3})`;
          ctx.fillRect(0, 0, width, height);
          
          // Draw Branching Bolt
          ctx.strokeStyle = '#fff';
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#fff';
          
          const boltX = Math.random() * width;
          const boltY = -50;
          const boltAngle = Math.PI * 0.5 + (Math.random() - 0.5) * 0.5; // Downwards +/- deviation
          
          drawLightningBolt(ctx, boltX, boltY, 100, boltAngle, 6);
          
          ctx.shadowBlur = 0;
      }

      // 4. Draw The Video-Masked Clouds from Buffer
      ctx.drawImage(buf, 0, 0);

      // 5. Water Reflection (The Lake Surface)
      const reflectHeight = height - horizonY;
      
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizonY, width, reflectHeight);
      ctx.clip(); // Only draw in water area

      // Flip vertically around horizon
      ctx.translate(0, horizonY * 2); 
      ctx.scale(1, -1);
      
      ctx.filter = 'blur(4px)'; // Blur the reflection
      try {
        // Reflects everything currently on canvas (Dark Sky + Video Clouds)
        ctx.drawImage(ctx.canvas, 0, 0); 
      } catch(e) {}
      ctx.filter = 'none';
      
      // Darken the water
      const waterGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      waterGrad.addColorStop(0, 'rgba(0, 10, 20, 0.5)');
      waterGrad.addColorStop(1, 'rgba(0, 5, 10, 0.9)');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, horizonY, width, reflectHeight);

      // --- RIPPLES ON WATER ---
      const ripples = ripplesRef.current;
      ctx.scale(1, -1); // Unflip for drawing ripples directly
      ctx.translate(0, -horizonY * 2);
      
      // Spawn new ripples on bass beat or random
      if (bassAvg > 0.6 && Math.random() < 0.3) {
           ripples.push({
               x: Math.random() * width,
               y: horizonY + Math.random() * reflectHeight,
               radius: 1,
               maxRadius: 50 + bassAvg * 100,
               opacity: 0.8,
               lineWidth: 2 + bassAvg * 3
           });
      }

      ctx.lineWidth = 2;
      for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i];
          r.radius += (2 + bassAvg * 5) * deltaTime;
          r.opacity -= 0.02 * deltaTime;
          
          if (r.opacity <= 0) {
              ripples.splice(i, 1);
          } else {
              // Draw Ripple Ellipse (perspective)
              ctx.strokeStyle = `rgba(200, 220, 255, ${r.opacity})`;
              ctx.lineWidth = r.lineWidth;
              ctx.beginPath();
              // Flatten ellipse based on y position to simulate perspective
              const perspectiveY = (r.y - horizonY) / reflectHeight;
              const scaleY = 0.1 + perspectiveY * 0.3;
              
              ctx.ellipse(r.x, r.y, r.radius, r.radius * scaleY, 0, 0, Math.PI * 2);
              ctx.stroke();
          }
      }

      ctx.restore();

      // 6. Rain System (Overlay)
      const rain = rainRef.current;
      ctx.strokeStyle = `rgba(200, 200, 255, ${isLightning ? 0.8 : 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      
      for(let i=0; i < rain.length; i++) {
          const r = rain[i];
          r.y += r.speed * deltaTime;
          r.x += (bassAvg * 2 - 1) * deltaTime; // Light wind on bass

          // 3D projection for rain falling
          const scale = fov / (fov + r.z);
          const x2d = cx + (r.x - cx) * scale;
          const y2d = cy + (r.y - cy) * scale;
          const len = r.length * scale;

          ctx.moveTo(x2d, y2d);
          ctx.lineTo(x2d, y2d + len);

          // Reset if below screen or hits water
          // If hits water (horizon), spawn small ripple
          const waterHitY = horizonY;
          
          // Check collision with water plane logic approximately
          // Simplified: if y2d crosses horizon and z is somewhat close
          if (y2d > waterHitY && y2d < waterHitY + 50 && r.z < 2000) {
               if (Math.random() < 0.3) { // Not every drop makes a visible ripple
                   ripplesRef.current.push({
                       x: x2d,
                       y: waterHitY + Math.random() * (height - waterHitY) * (1 - r.z/2000), // Approximate perspective landing
                       radius: 1,
                       maxRadius: 10 + Math.random() * 20,
                       opacity: 0.5,
                       lineWidth: 1
                   });
               }
               // Reset
               r.y = -500;
               r.x = Math.random() * width * 3 - width;
               r.z = Math.random() * 2000;
          } else if (y2d > height) {
              r.y = -500;
              r.x = Math.random() * width * 3 - width;
              r.z = Math.random() * 2000;
          }
      }
      ctx.stroke();

      // Flash overlay for lightning
      if (isLightning) {
          ctx.fillStyle = `rgba(255, 255, 255, 0.1)`;
          ctx.fillRect(0, 0, width, height);
      }
  };

  const drawMidiVisualEffects = (ctx: CanvasRenderingContext2D, width: number, height: number, deltaTime: number) => {
    // 1. Draw Shockwaves
    const shockwaves = midiShockwavesRef.current;
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.radius += (sw.maxRadius - sw.radius) * 8 * deltaTime;
      sw.opacity -= 1.8 * deltaTime;

      if (sw.opacity <= 0 || sw.radius >= sw.maxRadius) {
        shockwaves.splice(i, 1);
      } else {
        ctx.save();
        ctx.strokeStyle = sw.color.replace('0.85', sw.opacity.toFixed(2));
        ctx.lineWidth = 4 * sw.opacity;
        ctx.shadowColor = sw.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Draw Key Particle Clusters
    const clusters = midiKeyClustersRef.current;
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i];
      c.x += c.vx * deltaTime;
      c.y += c.vy * deltaTime;
      c.life -= 1.5 * deltaTime; // Fade over lifespan

      if (c.life <= 0) {
        clusters.splice(i, 1);
      } else {
        ctx.save();
        ctx.fillStyle = c.color;
        ctx.globalAlpha = c.life;
        ctx.shadowColor = c.color;
        ctx.shadowBlur = c.size;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.size * c.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. Draw 8x8 Grid Overlay for Maschine Jam - each cell lights up a cell in an 8x8 grid overlay on the canvas
    const jamCells = activeJamCellsRef.current;
    let anyJamActive = false;
    
    // Check if any jam cells are active or fading
    jamCells.forEach((c) => {
      if (c.opacity > 0.01) anyJamActive = true;
    });

    if (anyJamActive) {
      ctx.save();
      
      // Draw grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const x = (i / 8) * width;
        const y = (i / 8) * height;
        
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw light-up cells
      jamCells.forEach((cell, note) => {
        // Fade opacity
        if (!cell.active) {
          cell.opacity -= 2.0 * deltaTime;
        } else {
          cell.opacity = Math.min(1.0, cell.opacity + 5 * deltaTime);
        }

        if (cell.opacity > 0) {
          const cellWidth = width / 8;
          const cellHeight = height / 8;
          const x = cell.col * cellWidth;
          const y = cell.row * cellHeight;

          ctx.fillStyle = `hsla(${cell.hue}, 100%, 65%, ${cell.opacity * 0.35})`;
          ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);

          ctx.strokeStyle = `hsla(${cell.hue}, 100%, 75%, ${cell.opacity * 0.8})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
        }
      });
      ctx.restore();
    }

    // 4. Draw Parameter Flash Overlay (Knob Turn Overlay) - brief parameter flash overlay showing the parameter name and value
    const flash = midiFlashRef.current;
    if (flash) {
      flash.opacity -= 1.0 * deltaTime; // Fade after 1 second
      if (flash.opacity <= 0) {
        midiFlashRef.current = null;
      } else {
        ctx.save();
        ctx.font = 'bold 24px "JetBrains Mono", "Fira Code", monospace';
        ctx.fillStyle = `rgba(255, 255, 255, ${flash.opacity})`;
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        
        // Render at bottom quarter
        ctx.fillText(`${flash.label.toUpperCase()}: ${flash.value}`, width / 2, height - 150);
        ctx.restore();
      }
    }
  };

  const render = useCallback((time: number) => {
    // Throttling logic
    const fpsInterval = 1000 / (config.targetFrameRate || 60);
    const elapsed = time - lastFrameTimeRef.current;
    
    // If not enough time has passed, skip this frame
    if (elapsed < fpsInterval) {
        if (isPlaying) requestRef.current = requestAnimationFrame(render);
        return;
    }

    // Calculate normalized delta time factor (based on 60fps)
    const deltaTime = elapsed / 16.667; 

    lastFrameTimeRef.current = time - (elapsed % fpsInterval);

    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const desiredWidth = rect.width * dpr;
    const desiredHeight = rect.height * dpr;
    
    if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
        canvas.width = desiredWidth;
        canvas.height = desiredHeight;
        ctx.scale(dpr, dpr);
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // --- Bass Shake Logic ---
    if (config.enableBassShake) {
        let bassSum = 0;
        for (let i = 0; i < 5; i++) bassSum += dataArray[i];
        const bassLevel = bassSum / 5;
        const now = performance.now();
        const threshold = 180;
        const intervalBars = config.bassShakeInterval || 4;
        const beatsPerInterval = intervalBars * 4; 
        
        shakeStateRef.current.currentShake *= 0.9;

        if (bassLevel * config.sensitivity > threshold && now - shakeStateRef.current.lastBeatTime > 250) {
            shakeStateRef.current.lastBeatTime = now;
            shakeStateRef.current.beatCount++;
            
            if (shakeStateRef.current.beatCount % beatsPerInterval === 0) {
                shakeStateRef.current.currentShake = 1.0;
            }
        }
    } else {
        shakeStateRef.current.currentShake = 0;
    }
    
    // Clear Canvas
    if (config.enableBlur && config.mode !== VisualizerMode.Storm && config.mode !== VisualizerMode.Stage && config.mode !== VisualizerMode.Luminance) { 
        const opacity = Math.max(0.05, 1 - config.blurStrength);

        if (hasBackground) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`; 
            ctx.fillRect(0, 0, rect.width, rect.height);
            ctx.globalCompositeOperation = 'source-over';
        } else {
            ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
            ctx.fillRect(0, 0, rect.width, rect.height);
        }
    } else if (config.mode !== VisualizerMode.Storm && config.mode !== VisualizerMode.Stage && config.mode !== VisualizerMode.Luminance) {
        ctx.clearRect(0, 0, rect.width, rect.height);
        if (!hasBackground) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, rect.width, rect.height);
        }
    } else if (config.mode === VisualizerMode.Stage || config.mode === VisualizerMode.Luminance) {
        // Clear fully for complex compositing modes
        ctx.clearRect(0, 0, rect.width, rect.height);
    }

    ctx.save();
    
    if (config.enableBassShake && shakeStateRef.current.currentShake > 0.01) {
        const shakeVal = shakeStateRef.current.currentShake * config.bassShakeIntensity;
        const blurAmount = shakeVal * 5; 
        ctx.filter = `blur(${blurAmount}px)`;
        
        if (config.bassShakeIntensity > 0.5) {
             const maxShake = (config.bassShakeIntensity - 0.5) * 30;
             const dx = (Math.random() - 0.5) * maxShake * shakeStateRef.current.currentShake;
             const dy = (Math.random() - 0.5) * maxShake * shakeStateRef.current.currentShake;
             ctx.translate(dx, dy);
        }
    }

    // Reactivity helpers for post-processing effects
    let averageLevel = 0;
    let bassAudioLevel = 0;
    let midsAudioLevel = 0;
    let trebleAudioLevel = 0;
    if (dataArray && dataArray.length > 0) {
        let sum = 0;
        let bassSum = 0;
        let midsSum = 0;
        let trebleSum = 0;
        for (let idx = 0; idx < dataArray.length; idx++) {
            const val = dataArray[idx];
            sum += val;
            if (idx < 20) bassSum += val;
            else if (idx >= 20 && idx < 130) midsSum += val;
            else trebleSum += val;
        }
        averageLevel = sum / dataArray.length / 255;
        bassAudioLevel = (bassSum / 20) / 255;
        midsAudioLevel = (midsSum / 110) / 255;
        trebleAudioLevel = (trebleSum / Math.max(1, dataArray.length - 130)) / 255;
    }

    try {
        if (config.mode === VisualizerMode.Waveform) {
            analyser.getByteTimeDomainData(dataArray);
            drawWaveform(ctx, rect.width, rect.height, dataArray, bufferLength);
        } else if (config.mode === VisualizerMode.Storm) {
            drawStorm(ctx, rect.width, rect.height, dataArray, deltaTime);
        } else if (config.mode === VisualizerMode.Stage) {
            drawStage(ctx, rect.width, rect.height, dataArray, deltaTime);
        } else if (config.mode === VisualizerMode.Luminance) {
            drawLuminance(ctx, rect.width, rect.height, dataArray);
        } else if (config.mode === VisualizerMode.Tunnel) {
            drawTunnel(ctx, rect.width, rect.height, dataArray);
        } else if (config.mode === VisualizerMode.Vortex) {
            drawVortex(ctx, rect.width, rect.height, dataArray);
        } else if (config.mode === VisualizerMode.Liquid) {
            drawLiquid(ctx, rect.width, rect.height, dataArray);
        } else if (config.mode === VisualizerMode.Kaleidoscope) {
            drawKaleidoscope(ctx, rect.width, rect.height, dataArray);
        } else if (config.mode === VisualizerMode.Cosmic) {
            drawCosmic(ctx, rect.width, rect.height, dataArray, deltaTime);
        } else if (config.mode === VisualizerMode.RetroGrid) {
            drawRetroGrid(ctx, rect.width, rect.height, dataArray, deltaTime);
        } else {
            if (config.enableMosaic) {
                drawMosaic(ctx, rect.width, rect.height, dataArray, deltaTime);
            }

            if (config.mode === VisualizerMode.Spectrum) {
                drawSpectrum(ctx, rect.width, rect.height, dataArray);
            } else if (config.mode === VisualizerMode.Particles) {
                drawParticles(ctx, rect.width, rect.height, dataArray, deltaTime);
            } else if (config.mode === VisualizerMode.Nebula) {
                drawNebula(ctx, rect.width, rect.height, dataArray);
            }
        }
    } catch (e) {
        console.warn("Render error:", e);
    }

    // --- 12 Post-Processing Visual Reactive FX Pipeline ---
    if (canvas) {
        const width = rect.width;
        const height = rect.height;

        // 1. Chromatic Aberration RGB Splitting
        if (config.enableChroma) {
            const strength = (config.chromaAmount || 10) * (0.3 + bassAudioLevel * 0.7);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.5;
            ctx.drawImage(canvas, -strength, 0);
            ctx.drawImage(canvas, strength, 0);
            ctx.restore();
        }

        // 2. VGA Jitter / H-Sync Glitch
        if (config.enableGlitch) {
            const intensity = (config.glitchIntensity || 0.5) * (trebleAudioLevel + 0.1);
            const numGlitches = Math.floor(intensity * 11);
            ctx.save();
            for (let i = 0; i < numGlitches; i++) {
                const sy = Math.random() * height;
                const sh = Math.random() * (height * 0.12) + 10;
                const sx = (Math.random() - 0.5) * intensity * 55;
                ctx.drawImage(canvas, 0, sy, width, sh, sx, sy, width, sh);
            }
            ctx.restore();
        }

        // 3. VHS Distortion Line Scanlines
        if (config.enableVhs) {
            const intensity = (config.vhsIntensity || 0.4) * (1 + midsAudioLevel);
            ctx.save();
            ctx.fillStyle = `rgba(0,0,0,${intensity * 0.14})`;
            for (let y = 0; y < height; y += 4) {
                ctx.fillRect(0, y, width, 1.5);
            }
            const staticY = (performance.now() * 0.08) % height;
            ctx.fillStyle = `rgba(255,255,255, ${intensity * 0.06})`;
            ctx.fillRect(0, staticY, width, 14);
            ctx.restore();
        }

        // 4. Radial Zoom Bloom Blur
        if (config.enableZoomBlur) {
            const intensity = (config.zoomBlurIntensity || 0.5) * bassAudioLevel;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.28 * intensity;
            ctx.drawImage(canvas, -intensity * 15, -intensity * 15, width + intensity * 30, height + intensity * 30);
            ctx.restore();
        }

        // 5. Inversion Strobe Flasher
        if (config.enableInvertStrobe && bassAudioLevel > 0.85) {
            ctx.save();
            ctx.globalCompositeOperation = 'difference';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        // 6. Vintage Film Noise Grain
        if (config.enableNoise) {
            const intensity = (config.noiseIntensity || 0.3) * (1 + trebleAudioLevel);
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.05})`;
            for (let i = 0; i < 4; i++) {
                const sx = Math.random() * width;
                const sy = Math.random() * height;
                ctx.fillRect(sx, sy, Math.random() * 3 + 1, Math.random() * 3 + 1);
            }
            ctx.restore();
        }

        // 7. Thermal Heat-map Remapping
        if (config.enableThermal) {
            ctx.save();
            ctx.globalCompositeOperation = 'difference';
            ctx.fillStyle = 'rgba(255, 45, 0, 0.22)';
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'color-dodge';
            ctx.fillStyle = 'rgba(0, 95, 250, 0.35)';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        // 8. Sinusoidal Wave Warp
        if (config.enableWaveWarp) {
            const warp = (config.waveWarpIntensity || 0.5) * (1 + midsAudioLevel);
            ctx.save();
            for (let y = 0; y < height; y += 16) {
                const sx = Math.sin(y * 0.005 + performance.now() * 0.004) * warp * 22;
                ctx.drawImage(canvas, 0, y, width, 16, sx, y, width, 16);
            }
            ctx.restore();
        }

        // 9. Radiant Neon Outline
        if (config.enableNeon) {
            const neonVal = (config.neonContourIntensity || 0.5) * bassAudioLevel;
            ctx.save();
            ctx.globalCompositeOperation = 'color-dodge';
            ctx.globalAlpha = 0.45 * neonVal;
            ctx.drawImage(canvas, -2, -2);
            ctx.drawImage(canvas, 2, 2);
            ctx.restore();
        }

        // 10. Mirror Dynamic Multi-Reflections
        if (config.enableMirror) {
            const mCount = config.mirrorCount || 2;
            ctx.save();
            if (mCount >= 2) {
                ctx.scale(-1, 1);
                ctx.drawImage(canvas, -width, 0, width, height, 0, 0, width, height);
                ctx.scale(-1, 1);
            }
            if (mCount >= 4) {
                ctx.scale(1, -1);
                ctx.drawImage(canvas, 0, -height, width, height, 0, 0, width, height);
                ctx.scale(1, -1);
            }
            ctx.restore();
        }
    }
    
    // Draw overlay real-time MIDI shockwaves, key clusters, Jam grids, and flashes
    drawMidiVisualEffects(ctx, rect.width, rect.height, deltaTime);
    
    ctx.restore(); 

    if (isPlaying) {
        requestRef.current = requestAnimationFrame(render);
    }
  }, [analyser, config, isPlaying, hasBackground]);

  useEffect(() => {
    if (isPlaying) {
        requestRef.current = requestAnimationFrame(render);
    } else {
        if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    }
    return () => {
        if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, render]);

  useEffect(() => {
      if (analyser) {
          analyser.smoothingTimeConstant = config.smoothingTimeConstant;
          analyser.minDecibels = config.minDecibels;
          analyser.maxDecibels = config.maxDecibels;
          analyser.fftSize = config.fftSize;
      }
  }, [analyser, config]);

  return (
    <canvas 
        ref={canvasRef} 
        style={{ mixBlendMode: config.blendMode as any, willChange: 'contents' }}
        className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
    />
  );
});

export default AudioVisualizer;
