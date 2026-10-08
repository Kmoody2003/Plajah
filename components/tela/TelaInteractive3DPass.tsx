import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type Interactive3DTicketConfig,
  generateTicketSecurityProof,
  renderTicketFrontCanvas,
  renderTicketBackCanvas,
} from '../../services/tela/interactive3dTicketService';
import {
  generateInteractivePassShareUrl,
  buildStandalone3DPassHtml,
} from '../../services/tela/ticketShareExportService';
import {
  RotateCcw, Sparkles, CheckCircle2, Share2, Download,
  ExternalLink, Smartphone, Volume2, ShieldCheck
} from 'lucide-react';

export interface TelaInteractive3DPassProps {
  config: Interactive3DTicketConfig;
  onOpenStudioProject?: (projectId: string) => void;
  onCheckIn?: (ticketNumber: string) => void;
  className?: string;
  allowExport?: boolean;
}

export const TelaInteractive3DPass: React.FC<TelaInteractive3DPassProps> = ({
  config,
  onOpenStudioProject,
  onCheckIn,
  className = '',
  allowExport = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(config.status === 'CHECKED_IN');
  const [gyroActive, setGyroActive] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // References for Three.js objects
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    ticketGroup: THREE.Group;
    frontTexture: THREE.CanvasTexture;
    backTexture: THREE.CanvasTexture;
    spotLight: THREE.PointLight;
    reqId: number;
    targetRotX: number;
    targetRotY: number;
    curRotX: number;
    curRotY: number;
  } | null>(null);

  // Setup Three.js Scene
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 0.2, 5.0);

    // Lights
    const amb = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(amb);

    const dirKey = new THREE.DirectionalLight(0xffffff, 2.0);
    dirKey.position.set(3, 4, 4);
    dirKey.castShadow = true;
    scene.add(dirKey);

    const spotLight = new THREE.PointLight(0xffffff, 2.5, 9);
    spotLight.position.set(0, 0, 3.2);
    scene.add(spotLight);

    // Dynamic Textures
    const proof = generateTicketSecurityProof(config);
    const fCv = document.createElement('canvas'); fCv.width = 1024; fCv.height = 512;
    const fCtx = fCv.getContext('2d')!;
    renderTicketFrontCanvas(fCtx, 1024, 512, config, proof);
    const frontTexture = new THREE.CanvasTexture(fCv);
    frontTexture.anisotropy = 8;

    const bCv = document.createElement('canvas'); bCv.width = 1024; bCv.height = 512;
    const bCtx = bCv.getContext('2d')!;
    renderTicketBackCanvas(bCtx, 1024, 512, config, proof);
    const backTexture = new THREE.CanvasTexture(bCv);
    backTexture.anisotropy = 8;

    // Ticket Geometry & Materials
    const aspect = config.mode === 'evite' ? (600 / 800) : (900 / 420);
    const w = 3.6, h = w / aspect, d = 0.06;
    const geo = new THREE.BoxGeometry(w, h, d);

    const edgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.palette[1] || '#00ffaa'),
      metalness: 0.95,
      roughness: 0.1,
    });
    const frontMat = new THREE.MeshPhysicalMaterial({
      map: frontTexture,
      metalness: 0.35,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      map: backTexture,
      metalness: 0.7,
      roughness: 0.22,
      clearcoat: 0.8,
    });

    const ticketMesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    ticketMesh.castShadow = true;
    ticketMesh.receiveShadow = true;

    const ticketGroup = new THREE.Group();
    ticketGroup.add(ticketMesh);
    scene.add(ticketGroup);

    const state = {
      renderer,
      scene,
      camera,
      ticketGroup,
      frontTexture,
      backTexture,
      spotLight,
      reqId: 0,
      targetRotX: 0,
      targetRotY: 0,
      curRotX: 0,
      curRotY: 0,
    };
    sceneRef.current = state;

    // Render loop
    let lastTime = 0;
    const loop = (time: number) => {
      state.reqId = requestAnimationFrame(loop);
      const delta = (time - lastTime) * 0.001;
      lastTime = time;

      state.curRotX += (state.targetRotX - state.curRotX) * 0.08;
      state.curRotY += (state.targetRotY - state.curRotY) * 0.08;
      ticketGroup.rotation.x = state.curRotX;
      ticketGroup.rotation.y = state.curRotY;

      // Gentle levitation float
      ticketGroup.position.y = Math.sin(time * 0.002) * 0.06;

      renderer.render(scene, camera);
    };
    state.reqId = requestAnimationFrame(loop);

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!container) return;
      const nw = container.clientWidth || 800;
      const nh = container.clientHeight || 500;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(state.reqId);
      ro.disconnect();
      geo.dispose();
      frontMat.dispose();
      backMat.dispose();
      edgeMat.dispose();
      frontTexture.dispose();
      backTexture.dispose();
      renderer.dispose();
    };
  }, [config.themeId, config.mode]);

  // Flip 3D pass
  const handleFlip = () => {
    const s = sceneRef.current;
    if (!s) return;
    const nextFlipped = !isFlipped;
    setIsFlipped(nextFlipped);
    s.targetRotY = nextFlipped ? Math.PI : 0;
    s.targetRotX = 0;
  };

  // Pointer dragging and hover tilt
  const isDragging = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastPtr.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    const container = containerRef.current;
    if (!s || !container) return;

    const rect = container.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    // Move spotlight to follow pointer
    s.spotLight.position.x = ndcX * 3.5;
    s.spotLight.position.y = ndcY * 2.5;

    if (isDragging.current) {
      const dx = e.clientX - lastPtr.current.x;
      const dy = e.clientY - lastPtr.current.y;
      s.targetRotY += dx * 0.008;
      s.targetRotX += dy * 0.008;
      s.targetRotX = Math.max(-0.6, Math.min(0.6, s.targetRotX));
      lastPtr.current = { x: e.clientX, y: e.clientY };
    } else if (!isFlipped && !gyroActive) {
      s.targetRotX = -ndcY * 0.22;
      s.targetRotY = ndcX * 0.35;
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  // Device Gyroscope Hookup
  const requestGyro = async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          bindOrientationListener();
        }
      } catch (err) {
        console.warn('Gyroscope permission denied:', err);
      }
    } else {
      bindOrientationListener();
    }
  };

  const bindOrientationListener = () => {
    setGyroActive(true);
    const onOrientation = (e: DeviceOrientationEvent) => {
      const s = sceneRef.current;
      if (!s || isDragging.current || e.gamma === null || e.beta === null) return;
      const tiltX = e.gamma / 45; // -1 .. +1
      const tiltY = (e.beta - 45) / 45;
      s.targetRotY = (isFlipped ? Math.PI : 0) + tiltX * 0.55;
      s.targetRotX = tiltY * 0.35;
    };
    window.addEventListener('deviceorientation', onOrientation);
  };

  // Check-In Action
  const triggerCheckIn = () => {
    setIsCheckedIn(true);
    onCheckIn?.(config.ticketNumber);

    // Celebration light burst
    const s = sceneRef.current;
    if (s) {
      s.spotLight.intensity = 7.0;
      setTimeout(() => { if (s) s.spotLight.intensity = 2.5; }, 500);

      // Re-render front canvas with checked-in watermark
      const proof = generateTicketSecurityProof(config);
      const canvas = s.frontTexture.image as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        renderTicketFrontCanvas(ctx, 1024, 512, { ...config, status: 'CHECKED_IN' }, proof);
        s.frontTexture.needsUpdate = true;
      }
    }
  };

  // Share Link Action
  const handleShare = () => {
    const url = generateInteractivePassShareUrl(config);
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  // Standalone HTML Export Action
  const handleDownloadStandalone = () => {
    const html = buildStandalone3DPassHtml(config);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${config.ticketNumber}-interactive-pass.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[520px] rounded-2xl overflow-hidden bg-[#05060a] border border-white/10 select-none ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing block" />

      {/* Top Floating HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none z-10">
        <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15 pointer-events-auto">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200">
            {config.ticketNumber}
          </span>
          <span className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-md ${
            isCheckedIn ? 'bg-emerald-500/30 text-emerald-300' : 'bg-cyan-500/20 text-cyan-300'
          }`}>
            {isCheckedIn ? 'CHECKED IN' : 'ACTIVE'}
          </span>
        </div>

        {/* Studio Project Link */}
        {config.projectId && (
          <button
            onClick={() => onOpenStudioProject?.(config.projectId)}
            className="flex items-center gap-2 bg-slate-900/80 hover:bg-slate-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15 text-slate-200 pointer-events-auto transition shadow-sm"
          >
            <span>Linked Project: {config.projectTitle}</span>
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        )}
      </div>

      {/* Bottom Floating Control Deck */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-10 bg-slate-950/85 backdrop-blur-xl px-4 py-2.5 rounded-full border border-white/15 shadow-2xl">
        <button
          onClick={handleFlip}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition"
          title="Flip 3D Pass"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isFlipped ? 'Front View' : 'Back (Security & QR)'}</span>
        </button>

        {!gyroActive && (
          <button
            onClick={requestGyro}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 hover:bg-white/15 text-xs font-semibold text-slate-300 transition"
            title="Enable Device Gyroscope"
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Tilt Gyro</span>
          </button>
        )}

        {!isCheckedIn && (
          <button
            onClick={triggerCheckIn}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Check In</span>
          </button>
        )}

        {allowExport && (
          <>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 hover:bg-white/15 text-xs font-semibold text-slate-300 transition"
              title="Copy 3D Share Link"
            >
              <Share2 className="w-3.5 h-3.5 text-purple-400" />
              <span>{copyFeedback ? 'Copied Link!' : 'Share'}</span>
            </button>

            <button
              onClick={handleDownloadStandalone}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 hover:bg-white/15 text-xs font-semibold text-slate-300 transition"
              title="Export Standalone 3D Pass (.html)"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Export HTML</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default TelaInteractive3DPass;
