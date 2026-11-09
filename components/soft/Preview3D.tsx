// 3D preview of the sewn result (three.js): plush panels inflated, garments as simple tubes and
// cones from the finished measurements. Clearly a preview: no drape, stretch or fit simulation.

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Pattern, FabricRole, FormPart } from '../../services/soft/patterns';
import { formOf, inflate } from '../../services/soft/form3d';

const FABRIC_COLOUR: Record<FabricRole, number> = { main: 0xf472b6, contrast: 0x60a5fa, lining: 0xe5e7eb, rib: 0xc084fc, fur: 0xf9a8d4, interfacing: 0xd1d5db };

function meshOf(f: FormPart, mat: (r?: FabricRole) => THREE.Material): THREE.Object3D {
  const k = 1 / 1000; // millimetres → metres
  if (f.kind === 'inflate') {
    const { positions, indices } = inflate(f.outline, f.depth); const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3)); g.setIndex(new THREE.BufferAttribute(indices, 1)); g.scale(k, k, k); g.computeVertexNormals();
    return new THREE.Mesh(g, mat(f.fabric ?? 'fur'));
  }
  if (f.kind === 'box') { const m = new THREE.Mesh(new THREE.BoxGeometry(f.size[0] * k, f.size[1] * k, f.size[2] * k), mat(f.fabric)); m.position.set(f.at[0] * k, f.at[1] * k, f.at[2] * k); return m; }
  if (f.kind === 'ellipsoid') { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat(f.fabric)); m.scale.set(f.r[0] * k, f.r[1] * k, f.r[2] * k); m.position.set(f.at[0] * k, f.at[1] * k, f.at[2] * k); return m; }
  const a = new THREE.Vector3(...f.a).multiplyScalar(k), b = new THREE.Vector3(...f.b).multiplyScalar(k); const dir = b.clone().sub(a); const len = dir.length() || 1e-4;
  const g = new THREE.CylinderGeometry(f.rb * k, f.ra * k, len, 48, 1, true); g.scale(1, 1, f.squash ?? 1);
  const m = new THREE.Mesh(g, mat(f.fabric)); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); return m;
}

export default function Preview3D({ pattern }: { pattern: Pattern }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { el.textContent = 'This browser cannot show 3D (WebGL is off).'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3346, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1.5, 2.5, 2); scene.add(sun);
    const mats = new Map<string, THREE.Material>();
    const mat = (r: FabricRole = 'main') => { if (!mats.has(r)) mats.set(r, new THREE.MeshStandardMaterial({ color: FABRIC_COLOUR[r], roughness: r === 'fur' ? 1 : 0.85, side: THREE.DoubleSide })); return mats.get(r)!; };
    const group = new THREE.Group(); for (const f of formOf(pattern)) group.add(meshOf(f, mat)); scene.add(group);
    const box = new THREE.Box3().setFromObject(group); const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3()); const R = Math.max(size.x, size.y, size.z, 0.05);
    const floor = new THREE.GridHelper(R * 3, 12, 0x555066, 0x2c2836); floor.position.y = box.min.y; scene.add(floor);
    camera.position.set(centre.x + R * 1.1, centre.y + R * 0.5, centre.z + R * 2.1); const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(centre); controls.enableDamping = true; controls.update();
    const fit = () => { const w = el.clientWidth || 400, h = el.clientHeight || 300; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / h; camera.updateProjectionMatrix(); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    let raf = 0; const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick); }; tick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); group.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); mats.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [pattern]);
  return <div className="relative w-full h-full min-h-[320px]" data-testid="sew-3d">
    <div ref={host} className="absolute inset-0"/>
    <div className="absolute left-2 top-2 text-[10.5px] px-2 py-1 rounded-md pointer-events-none" style={{ background: 'rgba(0,0,0,.55)', color: '#fde68a' }} data-testid="sew-3d-label">3D preview: approximate shape only, not a drape or fit simulation. Drag to turn.</div>
  </div>;
}
