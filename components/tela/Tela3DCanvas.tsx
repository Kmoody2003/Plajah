/**
 * Tela3DCanvas.tsx — Desktop-Grade 3D Sculpt & Mesh Paint Canvas for Tela.
 *
 * Implements a "Light ZBrush" digital clay sculpting and 3D surface painting
 * surface directly on the document canvas:
 * - Dynamic vertex manipulation via Tela3DSculptSession
 * - Full desktop brush suite: Clay, Grab/Move, Standard Draw, Smooth, Inflate, Pinch, Flatten, Paint 3D
 * - Desktop shortcuts: Shift to smooth, Alt to invert (carve), Ctrl+Z / Ctrl+Y for mesh undo/redo
 * - MatCap rendering (ZBrush Red Wax, Grey Clay, Pearl, Chrome)
 * - X-Axis Symmetry
 */

import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Tela3DSculptSession,
  SculptBrushSettings,
  SculptHit,
  SculptBrushType,
  MatCapPreset,
} from '../../services/tela/tela3dSculptEngine';
import { RotateCcw, Download, Sparkles, Undo2, Redo2, Box } from 'lucide-react';

export interface Tela3DCanvasProps {
  width: number;
  height: number;
  modelUrl?: string;
  brushType: SculptBrushType;
  brushRadius: number;
  brushIntensity: number;
  matcap: MatCapPreset;
  symmetryX: boolean;
  wireframe?: boolean;
  onSaveMesh?: (blob: Blob) => void;
  className?: string;
}

export const Tela3DCanvas: React.FC<Tela3DCanvasProps> = ({
  width,
  height,
  modelUrl,
  brushType,
  brushRadius,
  brushIntensity,
  matcap,
  symmetryX,
  wireframe = false,
  onSaveMesh,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [vertexCount, setVertexCount] = useState<number>(0);

  const sceneState = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    mesh: THREE.Mesh;
    session: Tela3DSculptSession;
    raycaster: THREE.Raycaster;
    cursorMesh: THREE.Mesh;
    isPointerDown: boolean;
    lastPointerPos: { x: number; y: number };
    shiftDown: boolean;
    altDown: boolean;
    reqId: number;
  } | null>(null);

  // Setup Three.js scene & sculpt session
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.2);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.8);
    dir.position.set(3, 4, 5);
    scene.add(dir);

    // Default digital clay sculpt geometry (subdivided icosphere / sphere)
    const geometry = new THREE.SphereGeometry(1.0, 72, 72);
    const material = Tela3DSculptSession.getMatCapMaterial(matcap, wireframe);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const session = new Tela3DSculptSession(mesh);
    setVertexCount(geometry.attributes.position.count);

    // Brush cursor indicator ring
    const cursorGeo = new THREE.RingGeometry(0.9, 1.0, 32);
    const cursorMat = new THREE.MeshBasicMaterial({
      color: 0x00daf3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    cursorMesh.visible = false;
    scene.add(cursorMesh);

    const raycaster = new THREE.Raycaster();

    const state = {
      renderer,
      scene,
      camera,
      mesh,
      session,
      raycaster,
      cursorMesh,
      isPointerDown: false,
      lastPointerPos: { x: 0, y: 0 },
      shiftDown: false,
      altDown: false,
      reqId: 0,
    };
    sceneState.current = state;

    // Render loop
    const animate = () => {
      state.renderer.render(state.scene, state.camera);
      state.reqId = requestAnimationFrame(animate);
    };
    state.reqId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(state.reqId);
      renderer.dispose();
      geometry.dispose();
      cursorGeo.dispose();
    };
  }, [width, height]);

  // Update MatCap material on change
  useEffect(() => {
    if (sceneState.current) {
      sceneState.current.mesh.material = Tela3DSculptSession.getMatCapMaterial(matcap, wireframe);
    }
  }, [matcap, wireframe]);

  // Pointer event handlers for sculpting
  const getSculptHit = useCallback((clientX: number, clientY: number): SculptHit | null => {
    const s = sceneState.current;
    if (!s || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);

    s.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), s.camera);
    const hits = s.raycaster.intersectObject(s.mesh, false);

    if (hits.length > 0 && hits[0].point && hits[0].face) {
      return {
        point: hits[0].point,
        normal: hits[0].face.normal,
        faceIndex: hits[0].faceIndex,
      };
    }
    return null;
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    const s = sceneState.current;
    if (!s) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    s.isPointerDown = true;
    s.lastPointerPos = { x: e.clientX, y: e.clientY };

    const hit = getSculptHit(e.clientX, e.clientY);
    if (hit) {
      const effectiveBrush = s.shiftDown ? 'SMOOTH' : brushType;
      const settings: SculptBrushSettings = {
        type: effectiveBrush,
        radius: brushRadius,
        intensity: brushIntensity * (e.pressure ? Math.max(0.2, e.pressure) : 1),
        invert: s.altDown,
        symmetryX,
        wireframe,
        matcap,
        paintColor: '#6B0099',
        paintRoughness: 0.5,
      };
      s.session.startStroke(hit, settings);
      s.session.applyStroke(hit, settings, { x: 0, y: 0 }, s.camera);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = sceneState.current;
    if (!s) return;

    const hit = getSculptHit(e.clientX, e.clientY);
    if (hit) {
      s.cursorMesh.position.copy(hit.point);
      s.cursorMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
      s.cursorMesh.scale.set(brushRadius, brushRadius, 1);
      s.cursorMesh.visible = true;

      if (s.isPointerDown) {
        const deltaX = e.clientX - s.lastPointerPos.x;
        const deltaY = e.clientY - s.lastPointerPos.y;
        s.lastPointerPos = { x: e.clientX, y: e.clientY };

        const effectiveBrush = s.shiftDown ? 'SMOOTH' : brushType;
        const settings: SculptBrushSettings = {
          type: effectiveBrush,
          radius: brushRadius,
          intensity: brushIntensity * (e.pressure ? Math.max(0.2, e.pressure) : 1),
          invert: s.altDown,
          symmetryX,
          wireframe,
          matcap,
          paintColor: '#6B0099',
          paintRoughness: 0.5,
        };
        s.session.applyStroke(hit, settings, { x: deltaX, y: deltaY }, s.camera);
      }
    } else {
      s.cursorMesh.visible = false;
    }
  };

  const handlePointerUp = () => {
    const s = sceneState.current;
    if (!s || !s.isPointerDown) return;
    s.isPointerDown = false;
    s.session.endStroke();
    setCanUndo(true);
  };

  // Keyboard modifiers for desktop workflow (Shift = smooth, Alt = invert carve)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && sceneState.current) sceneState.current.shiftDown = true;
      if (e.key === 'Alt' && sceneState.current) sceneState.current.altDown = true;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          sceneState.current?.session.redo();
        } else {
          sceneState.current?.session.undo();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && sceneState.current) sceneState.current.shiftDown = false;
      if (e.key === 'Alt' && sceneState.current) sceneState.current.altDown = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const triggerUndo = () => {
    if (sceneState.current?.session.undo()) {
      setCanUndo(true);
    }
  };

  const triggerRedo = () => {
    if (sceneState.current?.session.redo()) {
      setCanRedo(true);
    }
  };

  return (
    <div
      ref={mountRef}
      className={`relative select-none overflow-hidden rounded-[16px] bg-[#121017] border border-white/10 ${className}`}
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Viewport Floating Info & Undo/Redo Controls */}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-[#0c0a10]/80 backdrop-blur-md px-3 py-1.5 rounded-[10px] border border-white/10 text-[.7rem] text-white/70">
        <Box size={14} className="text-orange-400" />
        <span className="font-bold text-white/90">Light ZBrush Sculpt</span>
        <span className="text-white/30">|</span>
        <span>{vertexCount.toLocaleString()} vertices</span>
        <span className="text-white/30">|</span>
        <span className="text-white/50 italic">Shift=Smooth · Alt=Carve</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#0c0a10]/80 backdrop-blur-md px-2 py-1 rounded-[10px] border border-white/10">
        <button
          onClick={triggerUndo}
          title="Undo Mesh Stroke (Ctrl+Z)"
          className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={triggerRedo}
          title="Redo Mesh Stroke (Ctrl+Shift+Z)"
          className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Redo2 size={15} />
        </button>
      </div>
    </div>
  );
};

export default Tela3DCanvas;
