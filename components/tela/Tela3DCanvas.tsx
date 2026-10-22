/**
 * Tela3DCanvas.tsx — Desktop-Grade 3D Sculpt & Mesh Paint Canvas for Tela.
 *
 * Implements a "Light ZBrush" digital clay sculpting and 3D surface painting
 * surface directly on the document canvas:
 * - Dynamic vertex manipulation via Tela3DSculptSession
 * - Full desktop brush suite: Clay, Grab/Move, Standard Draw, Smooth, Inflate, Pinch, Flatten, Paint 3D
 * - Desktop shortcuts: Shift to smooth, Alt to invert (carve), Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y for mesh undo/redo
 * - MatCap rendering (ZBrush Red Wax, Grey Clay, Pearl, Chrome)
 * - X-Axis Symmetry
 * - Camera: drag off the mesh (or right/middle drag anywhere) to orbit, wheel to zoom
 * - Save: exports the sculpt as a GLB (painted vertex colours included) through onSaveMesh
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
import { Undo2, Redo2, Box, Save } from 'lucide-react';

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
  /** Colour laid down by the Paint 3D brush. */
  paintColor?: string;
  onSaveMesh?: (blob: Blob) => void;
  saveLabel?: string;
  className?: string;
}

/** The sculpt as a binary glTF. Vertex colours are kept only if something was painted. */
export async function exportSculptGLB(mesh: THREE.Mesh): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const geo = mesh.geometry.clone();
  const colors = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  const painted = !!colors && Array.from(colors.array as Float32Array).some((v) => Math.abs(v - 0.92) > 1e-3);
  if (!painted) geo.deleteAttribute('color');
  const out = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, vertexColors: painted }));
  out.name = 'sculpt';
  const result = await new GLTFExporter().parseAsync(out, { binary: true });
  geo.dispose();
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
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
  paintColor = '#6B0099',
  onSaveMesh,
  saveLabel = 'Save mesh',
  className = '',
}) => {
  const [saving, setSaving] = useState(false);
  // Orbit camera around the sculpt (yaw/pitch in radians).
  const orbit = useRef({ yaw: 0, pitch: 0, dist: 3.2 });
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
    isOrbiting: boolean;
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
      isOrbiting: false,
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
      session.geometry.dispose();
      cursorGeo.dispose();
      sceneState.current = null;
    };
    // The scene is built once; size and material changes are applied by the effects below so a
    // resize never throws away the sculpt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = sceneState.current;
    if (!s) return;
    s.renderer.setSize(width, height);
    s.camera.aspect = width / height;
    s.camera.updateProjectionMatrix();
  }, [width, height]);

  // Update MatCap material on change
  useEffect(() => {
    const s = sceneState.current;
    if (s) {
      const old = s.mesh.material as THREE.Material;
      s.mesh.material = Tela3DSculptSession.getMatCapMaterial(matcap, wireframe);
      old.dispose();
    }
  }, [matcap, wireframe]);

  const applyOrbit = () => {
    const s = sceneState.current;
    if (!s) return;
    const o = orbit.current;
    s.camera.position.set(o.dist * Math.cos(o.pitch) * Math.sin(o.yaw), o.dist * Math.sin(o.pitch), o.dist * Math.cos(o.pitch) * Math.cos(o.yaw));
    s.camera.lookAt(0, 0, 0);
  };

  const syncHistory = () => {
    const s = sceneState.current;
    if (!s) return;
    setCanUndo(s.session.canUndo());
    setCanRedo(s.session.canRedo());
  };

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
    s.lastPointerPos = { x: e.clientX, y: e.clientY };

    const hit = e.button === 0 ? getSculptHit(e.clientX, e.clientY) : null;
    if (!hit) {
      s.isOrbiting = true;
      return;
    }
    s.isPointerDown = true;
    {
      const effectiveBrush = s.shiftDown ? 'SMOOTH' : brushType;
      const settings: SculptBrushSettings = {
        type: effectiveBrush,
        radius: brushRadius,
        intensity: brushIntensity * (e.pressure ? Math.max(0.2, e.pressure) : 1),
        invert: s.altDown,
        symmetryX,
        wireframe,
        matcap,
        paintColor,
        paintRoughness: 0.5,
      };
      s.session.startStroke(hit, settings);
      s.session.applyStroke(hit, settings, { x: 0, y: 0 }, s.camera);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = sceneState.current;
    if (!s) return;

    if (s.isOrbiting) {
      const o = orbit.current;
      o.yaw -= (e.clientX - s.lastPointerPos.x) * 0.008;
      o.pitch = Math.max(-1.45, Math.min(1.45, o.pitch + (e.clientY - s.lastPointerPos.y) * 0.008));
      s.lastPointerPos = { x: e.clientX, y: e.clientY };
      applyOrbit();
      return;
    }

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
          paintColor,
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
    if (!s) return;
    s.isOrbiting = false;
    if (!s.isPointerDown) return;
    s.isPointerDown = false;
    s.session.endStroke();
    syncHistory();
  };

  const handleWheel = (e: React.WheelEvent) => {
    const o = orbit.current;
    o.dist = Math.max(1.4, Math.min(9, o.dist * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
    applyOrbit();
  };

  const handleSave = async () => {
    const s = sceneState.current;
    if (!s || !onSaveMesh) return;
    setSaving(true);
    try {
      onSaveMesh(await exportSculptGLB(s.mesh));
    } finally {
      setSaving(false);
    }
  };

  // Keyboard modifiers for desktop workflow (Shift = smooth, Alt = invert carve)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && sceneState.current) sceneState.current.shiftDown = true;
      if (e.key === 'Alt' && sceneState.current) sceneState.current.altDown = true;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (e.shiftKey || key === 'y') {
          sceneState.current?.session.redo();
        } else {
          sceneState.current?.session.undo();
        }
        syncHistory();
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
    sceneState.current?.session.undo();
    syncHistory();
  };

  const triggerRedo = () => {
    sceneState.current?.session.redo();
    syncHistory();
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
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Viewport Floating Info & Undo/Redo Controls */}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-[#0c0a10]/80 backdrop-blur-md px-3 py-1.5 rounded-[10px] border border-white/10 text-[.7rem] text-white/70">
        <Box size={14} className="text-orange-400" />
        <span className="font-bold text-white/90">Light ZBrush Sculpt</span>
        <span className="text-white/30">|</span>
        <span>{vertexCount.toLocaleString()} vertices</span>
        <span className="text-white/30">|</span>
        <span className="text-white/50 italic">Shift=Smooth · Alt=Carve · drag off-mesh to orbit</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#0c0a10]/80 backdrop-blur-md px-2 py-1 rounded-[10px] border border-white/10">
        <button
          onClick={triggerUndo}
          disabled={!canUndo}
          title="Undo Mesh Stroke (Ctrl+Z)"
          className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={triggerRedo}
          disabled={!canRedo}
          title="Redo Mesh Stroke (Ctrl+Shift+Z)"
          className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          <Redo2 size={15} />
        </button>
        {onSaveMesh && (
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            title="Export the sculpt as GLB"
            className="ml-1 flex items-center gap-1 px-2 py-1 rounded text-[.7rem] font-bold text-white bg-orange-500/80 hover:bg-orange-500 transition-colors disabled:opacity-50"
          >
            <Save size={13} /> {saving ? 'Saving…' : saveLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default Tela3DCanvas;
