/**
 * components/Fabula/anima/AnimaStudio.tsx
 *
 * Plajah Fabula — 2D/3D Unified Animation & Living Media Suite ("Anima")
 * Powered by Aria Creative Intelligence & The Motion Director Council
 *
 * Unified Cross-Platform Engine for:
 * 1. 📖 Storybooks & Living Books (Interactive Lorea reader pages, tap triggers, fireflies, idle breathing)
 * 2. 💥 Comics & Manga / Graphic Novels (Panels, motion comics, elastic speech balloons, speed lines)
 * 3. 🎨 Living Canvas (Animate still Midjourney/Flux images & Runway/Kling video plates with effect compositing)
 * 4. 🎬 Film, NLE & Broadcast Graphics (Lower thirds, titles, camera choreography)
 *
 * Design Philosophy:
 * - Progressive Disclosure: UI is clean, intuitive, and welcoming. Complexity stays out of the way.
 * - Aria as Co-Pilot: Natural language leads the interaction, translating creative intent into deep systems math.
 * - Deep Pro Mode: Full exposure sheet (X-Sheet), curve editor, bone rigger, and physics parameters when needed.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Sparkles, Layers,
  Camera, Eye, EyeOff, Sliders, Activity, Wind, Spline,
  Flame, Droplets, Zap, ShieldAlert, Grid, RefreshCw,
  Plus, Trash2, ChevronRight, Wand2, Download, Video,
  Clock, Disc, PenTool, Move, RotateCcw, BookOpen,
  MessageSquare, ChevronDown, ChevronUp, Bot, Image as ImageIcon
} from 'lucide-react';
import type {
  AnimaProject,
  AnimaLayer,
  DrawingCel,
  DrawingStroke,
  OnionSkinConfig,
} from '../../../services/anima/types';
import { evaluateProjectAtFrame } from '../../../services/anima/evaluator';
import {
  ParticleSystem,
  HairSystem,
  SoftBodySystem,
  DEFAULT_FORCES,
  fracturePolygonAtImpact,
  type FracturePiece,
  type ParticleEmitterConfig,
} from '../../../services/anima/physics';
import { FluidSimulator } from '../../../services/anima/fluids';
import {
  synthesizeProceduralCanvas,
  ProceduralGeometryEngine,
  type ProceduralTextureKind,
} from '../../../services/anima/procedural';
import {
  AriaMotionAgent,
  type CreativeMedium,
  type AriaMotionProposal,
} from '../../../services/anima/ariaMotionAgent';
import {
  AnimaMediaCompositor,
  type ImportedMediaPlate,
} from './AnimaMediaCompositor';
import { AnimaTimeline } from './AnimaTimeline';
import { CLASSIC_CHARACTERS } from '../../../services/anima/classicCharacters';
import { PLAJAH_MASCOTS } from '../../../services/anima/plajahMascots';

// Plajah Theme Palette
const THEME = {
  bg: '#0f0e13',
  panel: 'rgba(25, 23, 33, 0.88)',
  border: 'rgba(255, 255, 255, 0.08)',
  purple: '#6B0099',
  magenta: '#D40055',
  cyan: '#00DAF3',
  orange: '#FF8C00',
  lilac: '#D0BCFF',
  success: '#06D6A0',
};

const createInitialProject = (): AnimaProject => ({
  id: 'proj_anime_01',
  name: 'Plajah Living Story Beat',
  fps: 24,
  durationFrames: 72,
  width: 1280,
  height: 720,
  currentFrame: 1,
  drawingBank: {
    cel_01: {
      id: 'cel_01',
      name: 'Key A',
      strokes: [
        {
          id: 's1',
          points: [
            { x: 380, y: 320 },
            { x: 420, y: 300 },
            { x: 460, y: 320 },
            { x: 440, y: 370 },
            { x: 390, y: 370 },
          ],
          color: '#D0BCFF',
          width: 5,
          opacity: 1,
          fill: 'rgba(107, 0, 153, 0.25)',
        },
      ],
      width: 1280,
      height: 720,
      createdAt: Date.now(),
    },
  },
  layers: [
    {
      id: 'l_hero',
      name: 'Focal Artwork Layer',
      type: 'cel',
      visible: true,
      locked: false,
      opacity: 1,
      parentId: null,
      transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      channels: {
        'transform.x': {
          id: 'ch_x',
          name: 'Position X',
          targetProperty: 'transform.x',
          defaultValue: 0,
          keyframes: [
            { id: 'kf_x_1', t: 0, v: 0, ease: 'smooth' },
            { id: 'kf_x_2', t: 1.0, v: 48, ease: 'smooth' },
            { id: 'kf_x_3', t: 2.0, v: -32, ease: 'smooth' },
            { id: 'kf_x_4', t: 2.95, v: 0, ease: 'smooth' },
          ],
        },
        'transform.y': {
          id: 'ch_y',
          name: 'Position Y',
          targetProperty: 'transform.y',
          defaultValue: 0,
          keyframes: [
            { id: 'kf_y_1', t: 0, v: 0, ease: 'smooth' },
            { id: 'kf_y_2', t: 0.5, v: -22, ease: 'smooth' },
            { id: 'kf_y_3', t: 1.5, v: -18, ease: 'smooth' },
            { id: 'kf_y_4', t: 2.95, v: 0, ease: 'smooth' },
          ],
        },
        'transform.rotationZ': {
          id: 'ch_rot',
          name: 'Rotation Z',
          targetProperty: 'transform.rotationZ',
          defaultValue: 0,
          keyframes: [
            { id: 'kf_rot_1', t: 0, v: 0, ease: 'smooth' },
            { id: 'kf_rot_2', t: 1.0, v: 5.2, ease: 'smooth' },
            { id: 'kf_rot_3', t: 2.0, v: -4.1, ease: 'smooth' },
            { id: 'kf_rot_4', t: 2.95, v: 0, ease: 'smooth' },
          ],
        },
        'opacity': {
          id: 'ch_op',
          name: 'Opacity',
          targetProperty: 'opacity',
          defaultValue: 1,
          keyframes: [
            { id: 'kf_op_1', t: 0, v: 1, ease: 'linear' },
            { id: 'kf_op_2', t: 2.95, v: 1, ease: 'linear' },
          ],
        },
      },
      celTrack: {
        id: 't_cel_01',
        name: 'Main Exposure',
        layerId: 'l_hero',
        stepRate: 2,
        exposures: [{ startFrame: 1, durationFrames: 72, drawingId: 'cel_01' }],
      },
    },
    {
      id: 'l_mascot',
      name: 'Kaiju Mascot Rig Track',
      type: 'character',
      visible: true,
      locked: false,
      opacity: 1,
      parentId: null,
      transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      channels: {
        'transform.x': {
          id: 'ch_m_x',
          name: 'Mascot Walk X',
          targetProperty: 'transform.x',
          defaultValue: 0,
          keyframes: [
            { id: 'km_1', t: 0, v: -80, ease: 'smooth' },
            { id: 'km_2', t: 1.5, v: 0, ease: 'smooth' },
            { id: 'km_3', t: 2.95, v: 80, ease: 'smooth' },
          ],
        },
        'transform.y': {
          id: 'ch_m_y',
          name: 'Bounce Bob (On 2s)',
          targetProperty: 'transform.y',
          defaultValue: 0,
          keyframes: [
            { id: 'km_4', t: 0, v: 0, ease: 'smooth' },
            { id: 'km_5', t: 0.75, v: -16, ease: 'smooth' },
            { id: 'km_6', t: 1.5, v: 0, ease: 'smooth' },
            { id: 'km_7', t: 2.25, v: -16, ease: 'smooth' },
            { id: 'km_8', t: 2.95, v: 0, ease: 'smooth' },
          ],
        },
      },
    },
  ],
  onionSkin: {
    enabled: true,
    prevFrames: 2,
    nextFrames: 1,
    prevColor: 'rgba(0, 218, 243, 0.45)',
    nextColor: 'rgba(212, 0, 85, 0.45)',
    opacityFalloff: 0.5,
  },
  camera: { x: 0, y: 0, z: 1000, zoom: 1, rotation: 0 },
  selectedLayerId: 'l_hero',
  selectedBoneId: null,
});

export const AnimaStudio: React.FC<{ onBackToEdit?: () => void }> = ({ onBackToEdit }) => {
  const [project, setProject] = useState<AnimaProject>(createInitialProject);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeMedium, setActiveMedium] = useState<CreativeMedium>('living_canvas');

  // Progressive Disclosure: Simple vs Pro Studio
  const [isProModeOpen, setIsProModeOpen] = useState(false);
  const [proTab, setProTab] = useState<'timeline' | 'xsheet' | 'curves' | 'physics' | 'procedural'>('timeline');

  // Aria Conversation & Intelligence
  const [ariaPrompt, setAriaPrompt] = useState('');
  const [ariaProposal, setAriaProposal] = useState<AriaMotionProposal | null>(null);
  const [isAriaThinking, setIsAriaThinking] = useState(false);

  // Active Ingested Media Plate (Still Image or Video)
  const [activePlate, setActivePlate] = useState<ImportedMediaPlate | null>({
    id: 'sample_default',
    type: 'image',
    name: 'Midjourney · Cyberpunk Wanderer',
    url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&q=80',
    width: 1280,
    height: 720,
  });

  // Stop-motion webcam tethering
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plateImgRef = useRef<HTMLImageElement | null>(null);

  // Physics & Simulation Subsystems
  const particleSystemRef = useRef(new ParticleSystem());
  const hairSystemRef = useRef(new HairSystem());
  const softBodySystemRef = useRef(new SoftBodySystem());
  const fluidSimRef = useRef(new FluidSimulator({ gridResolution: 64 }));
  const [activeSim, setActiveSim] = useState<'none' | 'particles' | 'hair' | 'soft_body' | 'fluid' | 'fracture'>('none');
  const [fracturePieces, setFracturePieces] = useState<FracturePiece[]>([]);
  const [speedLinesActive, setSpeedLinesActive] = useState(false);
  const [speechBalloon, setSpeechBalloon] = useState<{ text: string; x: number; y: number } | null>(null);

  // Active Rigged Character or Kaiju Mascot
  const [activeRigId, setActiveRigId] = useState<'none' | 'rello' | 'chora' | 'steamboat_willie' | 'felix_the_cat' | 'fleischer_flapper' | 'oswald_rabbit'>('rello');

  // Load plate image
  useEffect(() => {
    if (activePlate?.type === 'image' && activePlate.url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = activePlate.url;
      img.onload = () => {
        plateImgRef.current = img;
      };
    } else {
      plateImgRef.current = null;
    }
  }, [activePlate]);

  // Handle Aria Command
  const handleAriaDirect = (customText?: string) => {
    const text = customText || ariaPrompt;
    if (!text.trim()) return;

    setIsAriaThinking(true);

    const lower = text.toLowerCase();
    if (lower.includes('rello') || lower.includes('lumi') || lower.includes('film kaiju') || lower.includes('camera')) {
      setTimeout(() => {
        setActiveRigId('rello');
        setAriaProposal({
          lens: 'Kith Mascot Rig',
          headline: 'Reello (Lumi) — The Film & Vision Mascot',
          actionSummary: 'Kith Style Bible: Navy speckled body, bright orange bandit eye patches, white face mask, orange/peach belly with flame mark, rangefinder camera on 2s',
          channels: {},
        });
        setIsAriaThinking(false);
      }, 150);
      return;
    }
    if (lower.includes('chora') || lower.includes('lorik') || lower.includes('sonic kaiju') || lower.includes('music')) {
      setTimeout(() => {
        setActiveRigId('chora');
        setAriaProposal({
          lens: 'Kith Mascot Rig',
          headline: 'Chora (Lorik) — The Sonic & Music Mascot',
          actionSummary: 'Kith Style Bible: Purple speckled body, purple bandit eye patches, white face mask, segmented magenta belly with golden notes, LORIK music book on 2s',
          channels: {},
        });
        setIsAriaThinking(false);
      }, 150);
      return;
    }
    if (lower.includes('willie') || lower.includes('steamboat') || lower.includes('mickey')) {
      setTimeout(() => {
        setActiveRigId('steamboat_willie');
        setAriaProposal({
          lens: 'Historic Disney / Ub Iwerks',
          headline: 'Steamboat Willie Rubber-Hose Active',
          actionSummary: '1928 pilot rig on 2s with bouncy whistling mouth and noodle limb physics',
          channels: {},
        });
        setIsAriaThinking(false);
      }, 150);
      return;
    }
    if (lower.includes('felix') || lower.includes('pacing cat')) {
      setTimeout(() => {
        setActiveRigId('felix_the_cat');
        setAriaProposal({
          lens: 'Silent Era Pioneer 1919',
          headline: 'Felix the Cat Pacing Walk Active',
          actionSummary: 'Hands behind back, hunched contemplative stride, question-mark tail on 2s',
          channels: {},
        });
        setIsAriaThinking(false);
      }, 150);
      return;
    }
    if (lower.includes('flapper') || lower.includes('fleischer')) {
      setTimeout(() => {
        setActiveRigId('fleischer_flapper');
        setAriaProposal({
          lens: 'Fleischer Studios 1930',
          headline: 'Jazz Flapper 2-Beat Shimmy Active',
          actionSummary: 'Syncopated jazz bounce, head curls, inkwell boiling line aesthetic on 2s',
          channels: {},
        });
        setIsAriaThinking(false);
      }, 150);
      return;
    }
    if (lower.includes('oswald') || lower.includes('rabbit')) {
      setTimeout(() => {
        setActiveRigId('oswald_rabbit');
        setAriaProposal({
          lens: 'Universal / Disney 1927',
          headline: 'Oswald the Lucky Rabbit Stride Active',
          actionSummary: 'Springy high-stepping stride, floppy ears with secondary overlap drag on 2s',
          channels: {},
        });
        setIsAriaThinking(false);
      }, 150);
      return;
    }

    setTimeout(() => {
      const proposal = AriaMotionAgent.interpret(text, activeMedium, 3.0);
      setAriaProposal(proposal);
      setIsAriaThinking(false);

      // Apply channels to selected layer
      setProject((prev) => {
        const nextLayers = prev.layers.map((l) => {
          if (l.id === prev.selectedLayerId || l.id === 'l_hero') {
            return {
              ...l,
              channels: { ...l.channels, ...proposal.channels } as any,
              celTrack: proposal.suggestedStepRate && l.celTrack ? { ...l.celTrack, stepRate: proposal.suggestedStepRate } : l.celTrack,
            };
          }
          return l;
        });
        return { ...prev, layers: nextLayers };
      });


      // Handle specific compositing layers
      if (proposal.compositingLayer) {
        if (proposal.compositingLayer.kind === 'particles') {
          const cfg = proposal.compositingLayer.config;
          const emitter: ParticleEmitterConfig = {
            id: 'em_aria',
            name: 'Aria Emitter',
            enabled: true,
            type: cfg.type || 'box',
            position: { x: 640, y: 100, z: 0 },
            ratePerSecond: cfg.ratePerSecond || 50,
            lifespan: cfg.lifespan || 2.0,
            speed: cfg.speed || 150,
            spreadAngle: 45,
            directionAngle: cfg.directionAngle || 90,
            startSize: 5,
            endSize: 1,
            color: cfg.color || THEME.cyan,
            colorFade: THEME.magenta,
            bounceElasticity: 0.5,
          };
          (particleSystemRef.current as any).defaultEmitter = emitter;
          setActiveSim('particles');
        } else if (proposal.compositingLayer.kind === 'fluid') {
          setActiveSim('fluid');
        } else if (proposal.compositingLayer.kind === 'speed_lines') {
          setSpeedLinesActive(true);
        } else if (proposal.compositingLayer.kind === 'speech_balloon') {
          setSpeechBalloon({ text: proposal.compositingLayer.config.text || 'HELLO!', x: 640, y: 260 });
        }
      }
    }, 280);
  };

  // Quick Compositing Action Dispatcher
  const handleQuickCompositing = (type: string) => {
    switch (type) {
      case 'weather_rain':
        handleAriaDirect('cinematic wind-blown rain atmosphere');
        break;
      case 'fireflies':
        handleAriaDirect('ambient starlight fireflies gently floating');
        break;
      case 'camera_drift':
        handleAriaDirect('2.5D handheld parallax camera drift');
        break;
      case 'hair_flutter':
        hairSystemRef.current.createStrand({ x: 580, y: 220, z: 0 }, 140, 7, THEME.cyan, 0.88);
        hairSystemRef.current.createStrand({ x: 610, y: 220, z: 0 }, 160, 8, THEME.lilac, 0.9);
        setActiveSim('hair');
        break;
      case 'fluid_aura':
        handleAriaDirect('swirling fluid magic aura');
        break;
      case 'speed_lines':
        handleAriaDirect('radial manga action speed lines');
        break;
    }
  };

  // WebCam Stop-Motion toggle
  const toggleCamera = async () => {
    if (isCameraActive) {
      cameraStream?.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
      setIsCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        setCameraStream(stream);
        setIsCameraActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.warn('Unable to access camera for stop-motion:', e);
      }
    }
  };

  // Capture frame from camera
  const captureStopMotionFrame = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const off = document.createElement('canvas');
    off.width = 1280;
    off.height = 720;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, 1280, 720);
    const dataUrl = off.toDataURL('image/webp', 0.85);

    const celId = `cel_sm_${Date.now()}`;
    const newCel: DrawingCel = {
      id: celId,
      name: `Capture Frame ${project.currentFrame}`,
      strokes: [],
      rasterDataUrl: dataUrl,
      width: 1280,
      height: 720,
      createdAt: Date.now(),
    };

    setProject((prev) => ({
      ...prev,
      drawingBank: { ...prev.drawingBank, [celId]: newCel },
      currentFrame: Math.min(prev.durationFrames, prev.currentFrame + 2),
    }));
  };

  // Interactive Tap Trigger on Canvas
  const handleCanvasTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tapX = ((e.clientX - rect.left) / rect.width) * 1280;
    const tapY = ((e.clientY - rect.top) / rect.height) * 720;

    if (activeMedium === 'storybook') {
      // Tap-to-bloom particle burst
      const ps = particleSystemRef.current;
      const em: ParticleEmitterConfig = {
        id: 'em_tap',
        name: 'Tap Sparkles',
        enabled: true,
        type: 'point',
        position: { x: tapX, y: tapY, z: 0 },
        ratePerSecond: 100,
        lifespan: 1.0,
        speed: 180,
        spreadAngle: 360,
        directionAngle: 0,
        startSize: 6,
        endSize: 1,
        color: '#FFD700',
        colorFade: '#D0BCFF',
        bounceElasticity: 0.6,
      };
      (ps as any).defaultEmitter = em;
      setActiveSim('particles');
    }
  };

  // Playback Loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProject((p) => ({
        ...p,
        currentFrame: p.currentFrame >= p.durationFrames ? 1 : p.currentFrame + 1,
      }));
    }, 1000 / project.fps);
    return () => clearInterval(interval);
  }, [isPlaying, project.fps, project.durationFrames]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Render Ingested Background Plate (Still Image or Video)
      if (plateImgRef.current) {
        ctx.drawImage(plateImgRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        // Fallback dark gradient
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#13111a');
        grad.addColorStop(1, '#09080c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Camera view if active (Stop-motion tether overlay)
      if (isCameraActive && videoRef.current) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // 2. Evaluated Animation Layer Tracks
      const evaluated = evaluateProjectAtFrame(project, project.currentFrame);

      for (const layerState of evaluated) {
        if (!layerState.visible) continue;
        ctx.save();
        ctx.globalAlpha = layerState.opacity;
        ctx.translate(layerState.transform.x, layerState.transform.y);
        ctx.rotate((layerState.transform.rotationZ * Math.PI) / 180);
        ctx.scale(layerState.transform.scaleX, layerState.transform.scaleY);

        // Vector Cel strokes
        if (layerState.activeDrawingId && project.drawingBank[layerState.activeDrawingId]) {
          const cel = project.drawingBank[layerState.activeDrawingId];
          for (const stroke of cel.strokes) {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width;
            ctx.beginPath();
            stroke.points.forEach((pt, idx) => {
              if (idx === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            if (stroke.fill) {
              ctx.fillStyle = stroke.fill;
              ctx.fill();
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 2.5 Articulated Mascot & Classic Character Rig Rendering
      if (activeRigId === 'rello') {
        ctx.save();
        ctx.translate(640, 520);
        PLAJAH_MASCOTS.rello.drawRoutine(ctx, (now / 1000) * 0.75, project.currentFrame, 1.3);
        ctx.restore();
      } else if (activeRigId === 'chora') {
        ctx.save();
        ctx.translate(640, 520);
        PLAJAH_MASCOTS.chora.drawRoutine(ctx, (now / 1000) * 0.85, project.currentFrame, 1.3);
        ctx.restore();
      } else if (CLASSIC_CHARACTERS[activeRigId]) {
        ctx.save();
        ctx.translate(640, 440);
        CLASSIC_CHARACTERS[activeRigId].rig.drawRoutine(ctx, (now / 1000) * 0.8, project.currentFrame, 1.1);
        ctx.restore();
      }

      // 3. Manga Radial Speed Lines Overlay

      if (speedLinesActive) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2;
        const cx = 640;
        const cy = 360;
        for (let a = 0; a < Math.PI * 2; a += 0.08) {
          const r1 = 280 + Math.random() * 40;
          const r2 = 680;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Comic Speech Balloon Overlay
      if (speechBalloon) {
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(speechBalloon.x - 120, speechBalloon.y - 45, 240, 70, 20);
        ctx.fill();
        ctx.stroke();

        // Balloon tail
        ctx.beginPath();
        ctx.moveTo(speechBalloon.x, speechBalloon.y + 25);
        ctx.lineTo(speechBalloon.x - 20, speechBalloon.y + 55);
        ctx.lineTo(speechBalloon.x + 10, speechBalloon.y + 25);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = '900 16px "Comic Sans MS", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(speechBalloon.text, speechBalloon.x, speechBalloon.y);
        ctx.restore();
      }

      // 5. Physics & Dynamic Subsystems
      if (activeSim === 'particles') {
        const ps = particleSystemRef.current;
        const em = (ps as any).defaultEmitter;
        if (em) {
          ps.step(dt, em, DEFAULT_FORCES, now / 1000, { w: canvas.width, h: canvas.height });
          for (const p of ps.particles) {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      } else if (activeSim === 'hair') {
        const hs = hairSystemRef.current;
        hs.step(dt, DEFAULT_FORCES, now / 1000);
        for (const s of hs.strands) {
          ctx.save();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          s.points.forEach((p, idx) => {
            if (idx === 0) ctx.moveTo(p.pos.x, p.pos.y);
            else ctx.lineTo(p.pos.x, p.pos.y);
          });
          ctx.stroke();
          ctx.restore();
        }
      } else if (activeSim === 'fluid') {
        const fl = fluidSimRef.current;
        fl.addVelocity(0.5, 0.8, (Math.random() - 0.5) * 8, -6);
        fl.addDye(0.5, 0.8, 0.8, 0.2, 0.9, 3);
        fl.step(dt);
        fl.paintToCanvas(ctx, canvas.width, canvas.height);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [project, isCameraActive, activeSim, speedLinesActive, speechBalloon, activeRigId]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: THEME.bg,
      color: '#e8e6ee',
      fontFamily: 'Inter, sans-serif',
      userSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* ── 1. STUDIO HEADER WITH CREATIVE MEDIUM SWITCHER ── */}
      <header style={{
        height: 48,
        backgroundColor: THEME.panel,
        borderBottom: `1px solid ${THEME.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        backdropFilter: 'blur(20px)',
        zIndex: 20,
      }}>
        {/* Brand Lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 900,
            fontSize: 13,
            color: '#fff',
            boxShadow: '0 0 16px rgba(212, 0, 85, 0.45)',
          }}>
            AN
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ANIMA UNIFIED MOTION
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
              Aria Co-Pilot · Storybooks, Comics & Living Plates
            </div>
          </div>
        </div>

        {/* Medium Selector */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.5)', padding: 3, borderRadius: 8 }}>
          {[
            { id: 'living_canvas', label: 'Living Canvas (Stills & Video)', icon: ImageIcon },
            { id: 'storybook', label: 'Storybook & Lorea', icon: BookOpen },
            { id: 'comic', label: 'Comic & Graphic Novel', icon: MessageSquare },
            { id: 'film_vfx', label: 'Film & Broadcast', icon: Video },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveMedium(id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 11px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                background: activeMedium === id ? 'linear-gradient(135deg, #6B0099, #D40055)' : 'transparent',
                color: activeMedium === id ? '#ffffff' : 'rgba(255,255,255,0.6)',
              }}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Pro Mode Toggle & NLE Return */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setIsProModeOpen(!isProModeOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: isProModeOpen ? 'rgba(0, 218, 243, 0.16)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isProModeOpen ? THEME.cyan : 'rgba(255,255,255,0.12)'}`,
              color: isProModeOpen ? THEME.cyan : '#fff',
              fontSize: 10,
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <Sliders size={12} />
            {isProModeOpen ? 'HIDE PRO STUDIO' : 'EXPAND PRO STUDIO'}
            {isProModeOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>

          {onBackToEdit && (
            <button
              onClick={onBackToEdit}
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              RETURN TO NLE
            </button>
          )}
        </div>
      </header>

      {/* ── 2. ARIA MOTION CO-PILOT BAR (NATURAL LANGUAGE FORWARD) ── */}
      <div style={{
        backgroundColor: 'rgba(18, 16, 24, 0.98)',
        borderBottom: `1px solid ${THEME.border}`,
        padding: '10px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'linear-gradient(135deg, rgba(212, 0, 85, 0.2), rgba(107, 0, 153, 0.2))',
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid rgba(212, 0, 85, 0.4)',
            color: THEME.magenta,
            fontSize: 10,
            fontWeight: 900,
          }}>
            <Bot size={13} />
            ARIA CO-PILOT
          </div>

          <input
            type="text"
            value={ariaPrompt}
            onChange={(e) => setAriaPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAriaDirect()}
            placeholder={`Tell Aria what to animate in this ${activeMedium.replace('_', ' ')} (e.g. 'cinematic rain streaks with slow push-in', 'bouncy speech balloon', 'fireflies with breathing idle')...`}
            style={{
              flex: 1,
              height: 32,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 8,
              padding: '0 12px',
              color: '#fff',
              fontSize: 11,
              outline: 'none',
            }}
          />

          <button
            onClick={() => handleAriaDirect()}
            style={{
              height: 32,
              padding: '0 14px',
              background: 'linear-gradient(135deg, #D40055, #FF8C00)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 0 16px rgba(212, 0, 85, 0.35)',
            }}
          >
            <Sparkles size={13} />
            {isAriaThinking ? 'DIRECTING…' : 'DIRECT MOTION'}
          </button>
        </div>

        {/* Aria Quick Suggestions per Medium */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            Aria Ideas:
          </span>
          {AriaMotionAgent.getQuickPrompts(activeMedium).map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleAriaDirect(qp.prompt)}
              style={{
                flex: 'none',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: '3px 10px',
                fontSize: 10,
                color: 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
              }}
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Mascot Kaijus & Public Domain Cartoon Rigs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingTop: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: THEME.orange, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🦖</span> MASCOTS & RIGS:
          </span>

          {/* Reello (Lumi) */}
          <button
            onClick={() => handleAriaDirect('rello lumi film mascot')}
            style={{
              flex: 'none',
              background: activeRigId === 'rello' ? 'rgba(242, 98, 28, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${activeRigId === 'rello' ? '#F2621C' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: 14,
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 800,
              color: activeRigId === 'rello' ? '#F2621C' : 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>📷</span> Reello (Lumi) · Film
          </button>

          {/* Chora (Lorik) */}
          <button
            onClick={() => handleAriaDirect('chora lorik music mascot')}
            style={{
              flex: 'none',
              background: activeRigId === 'chora' ? 'rgba(122, 102, 188, 0.28)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${activeRigId === 'chora' ? '#7A66BC' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: 14,
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 800,
              color: activeRigId === 'chora' ? '#D0BCFF' : 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>🎵</span> Chora (Lorik) · Music
          </button>

          {/* Steamboat Willie */}
          <button
            onClick={() => handleAriaDirect('steamboat willie 1928')}
            style={{
              flex: 'none',
              background: activeRigId === 'steamboat_willie' ? 'rgba(212, 0, 85, 0.22)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${activeRigId === 'steamboat_willie' ? THEME.magenta : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: 14,
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 800,
              color: activeRigId === 'steamboat_willie' ? THEME.magenta : 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>🚢</span> Willie (1928 Rig)
          </button>

          {/* Felix */}
          <button
            onClick={() => handleAriaDirect('felix the cat 1919')}
            style={{
              flex: 'none',
              background: activeRigId === 'felix_the_cat' ? 'rgba(208, 188, 255, 0.22)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${activeRigId === 'felix_the_cat' ? THEME.lilac : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: 14,
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 800,
              color: activeRigId === 'felix_the_cat' ? THEME.lilac : 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>🐱</span> Felix (1919)
          </button>

          {/* Clear / Stage Only */}
          {activeRigId !== 'none' && (
            <button
              onClick={() => setActiveRigId('none')}
              style={{
                flex: 'none',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: 10,
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              ✕ Clear Rig
            </button>
          )}
        </div>

        {/* Aria Rationale / Council Card */}

        {ariaProposal && (
          <div style={{
            background: 'rgba(107, 0, 153, 0.18)',
            border: '1px solid rgba(107, 0, 153, 0.35)',
            borderRadius: 8,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 900, color: THEME.cyan }}>
                [{ariaProposal.lens}]:
              </span>
              <span style={{ color: '#fff' }}>
                {ariaProposal.headline}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                — {ariaProposal.actionSummary}
              </span>
            </div>
            <button
              onClick={() => setAriaProposal(null)}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11 }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── 3. WORKSPACE BODY: STAGE + MEDIA INGESTION ── */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Main Viewport Stage */}
        <div style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09080c',
        }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            onClick={handleCanvasTap}
            style={{
              width: '94%',
              height: '94%',
              objectFit: 'contain',
              borderRadius: 10,
              border: `1px solid ${THEME.border}`,
              boxShadow: '0 16px 64px rgba(0, 0, 0, 0.85)',
              cursor: activeMedium === 'storybook' ? 'pointer' : 'default',
            }}
          />

          {/* Quick Floating Controls (Camera / Play / Onion Skin) */}
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20, 18, 26, 0.88)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${THEME.border}`,
            borderRadius: 30,
            padding: '6px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            {/* Play/Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                background: isPlaying ? THEME.orange : THEME.cyan,
                border: 'none',
                color: '#000',
                borderRadius: 20,
                cursor: 'pointer',
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 900,
                fontSize: 10,
              }}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>

            {/* Stop Motion Webcam Tether */}
            <button
              onClick={toggleCamera}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: isCameraActive ? 'rgba(212, 0, 85, 0.25)' : 'transparent',
                color: isCameraActive ? THEME.magenta : 'rgba(255,255,255,0.5)',
                border: `1px solid ${isCameraActive ? THEME.magenta : 'transparent'}`,
                borderRadius: 16,
                padding: '4px 10px',
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Camera size={13} />
              {isCameraActive ? 'STOP-MOTION LIVE' : 'CAMERA TETHER'}
            </button>

            {isCameraActive && (
              <button
                onClick={captureStopMotionFrame}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'linear-gradient(135deg, #00DAF3, #6B0099)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 16,
                  padding: '4px 12px',
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                <Disc size={13} />
                CAPTURE FRAME
              </button>
            )}

            {/* Timecode badge */}
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>
              Frame {project.currentFrame} / {project.durationFrames}
            </span>
          </div>
        </div>

        {/* Right Sidebar: Media Plate Ingestion & Effect Compositing */}
        <div style={{
          width: 340,
          backgroundColor: THEME.panel,
          borderLeft: `1px solid ${THEME.border}`,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <AnimaMediaCompositor
            medium={activeMedium}
            activePlate={activePlate}
            onSelectPlate={(plate) => setActivePlate(plate)}
            onApplyCompositingEffect={handleQuickCompositing}
          />
        </div>
      </div>

      {/* ── 4. UNIFIED MULTI-TRACK TIMELINE & KEYFRAME SYSTEM (ALWAYS DOCKED & VISIBLE) ── */}
      <div style={{
        height: isProModeOpen ? 300 : 240,
        backgroundColor: '#121018',
        borderTop: `1px solid ${THEME.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 15,
      }}>
        {/* Pro Mode Sub-Tab Header if expanded */}
        {isProModeOpen && (
          <div style={{
            height: 32,
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderBottom: `1px solid ${THEME.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {[
                { id: 'timeline', label: 'Timeline & Keyframes', icon: Clock },
                { id: 'xsheet', label: 'X-Sheet Exposure', icon: Grid },
                { id: 'curves', label: 'Bézier Splines', icon: Spline },
                { id: 'physics', label: 'Physics & Forces', icon: Activity },
                { id: 'procedural', label: 'Procedural Texture', icon: Wand2 },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setProTab(id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: proTab === id ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: proTab === id ? THEME.cyan : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
              O(log N) Spline Binary Search · Diamond Keyframes (◆)
            </div>
          </div>
        )}

        {/* Pro Sub-Panels (if not timeline) or Full AnimaTimeline */}
        {isProModeOpen && proTab === 'xsheet' ? (
          <div style={{ flex: 1, padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>
                HOLD CADENCE:
              </div>
              {[1, 2, 3, 4].map((rate) => (
                <button
                  key={rate}
                  onClick={() => {
                    setProject((p) => {
                      const hero = p.layers.find((l) => l.id === 'l_hero');
                      if (hero && hero.celTrack) hero.celTrack.stepRate = rate as any;
                      return { ...p };
                    });
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ON {rate}s ({Math.floor(24 / rate)} FPS)
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              Cel Timing Sheet: Active drawings exposed on hold intervals with instant onion-skin registration.
            </div>
          </div>
        ) : isProModeOpen && proTab === 'physics' ? (
          <div style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['particles', 'hair', 'soft_body', 'fluid'].map((sim) => (
                <button
                  key={sim}
                  onClick={() => setActiveSim(sim as any)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: activeSim === sim ? THEME.orange : 'rgba(255,255,255,0.05)',
                    border: 'none',
                    color: activeSim === sim ? '#000' : '#fff',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  RUN {sim.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ) : isProModeOpen && proTab === 'curves' ? (
          <div style={{ flex: 1, padding: 12, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontWeight: 800, color: THEME.cyan, marginBottom: 6 }}>Bézier Tangents & Spline Interpolation:</div>
            Hermite cubic tangents evaluated per keyframe with binary search. Adjust in/out ease vectors dynamically on any diamond keyframe.
          </div>
        ) : isProModeOpen && proTab === 'procedural' ? (
          <div style={{ flex: 1, padding: 12, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontWeight: 800, color: THEME.lilac, marginBottom: 6 }}>Procedural Shader & Noise Engine:</div>
            Perlin / Simplex fractal turbulence synthesizer for organic background textures, water refractions, and atmosphere.
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            <AnimaTimeline
              project={project}
              onUpdateProject={setProject}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AnimaStudio;
