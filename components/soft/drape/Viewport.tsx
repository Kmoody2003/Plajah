// three.js viewport for the 3D fit room: the avatar (surface-nets mesh of the same field the cloth
// collides with), the cloth (positions streamed from the solver each frame, vertex colours for the
// fabric or a fit map), an optional print decal layer, picking on body or cloth, PNG snapshots and
// a turntable recording.

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { materialFor, TILE_MM } from './fabricTextures';
import { encodeWebm } from './webm';
import type { TriMesh } from '../../../services/soft/drape/avatar';
import type { ClothModel } from '../../../services/soft/drape/cloth';
import { vertexNormals } from '../../../services/soft/drape/cloth';

export interface ViewportHandle {
  setAvatar(m: TriMesh | null): void;
  setCloth(m: ClothModel | null): void;
  updateCloth(colors?: Float32Array): void;
  setDecal(tris: { positions: Float32Array; uvs: Float32Array } | null, image?: HTMLImageElement | HTMLCanvasElement | null): void;
  setMarkers(pts: Array<[number, number, number]>, closed?: boolean): void;
  frame(target?: 'body' | 'plush'): void;
  snapshot(w?: number, h?: number): string;
  turntable(seconds: number, onDone: (blob: Blob | null) => void): void;
  /** A grid of `n` views round the garment (PNG data URL), rendered off-screen: works with the pane hidden. */
  turntableSheet(n?: number, size?: number): string;
  setQuality(q: 'draft' | 'product'): void;
  /** Buttons riding on cloth vertices. */
  setButtons(list: Array<{ vertex: number; diameterMm: number }>): void;
}
export interface PickHit { point: [number, number, number]; normal: [number, number, number]; on: 'body' | 'cloth'; vertex?: number }

const Viewport = forwardRef<ViewportHandle, { onPick?: (h: PickHit) => void; className?: string }>(function Viewport({ onPick, className }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const W = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; orbit: OrbitControls; avatar?: THREE.Mesh; cloth?: THREE.Mesh; model?: ClothModel | null; decal?: THREE.Mesh; markers?: THREE.Group; spin?: number; nrm?: Float32Array; composer?: EffectComposer; key?: THREE.DirectionalLight; seams?: THREE.LineSegments; seamIdx?: Uint32Array; quality: 'draft' | 'product'; buttons?: Array<{ vertex: number; mesh: THREE.Mesh }> } | null>(null);
  const pickRef = useRef(onPick); pickRef.current = onPick;

  useEffect(() => {
    const el = host.current!; const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setClearColor(0x15131b); el.appendChild(renderer.domElement); renderer.domElement.style.display = 'block';
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('data-testid', 'drape-canvas');
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(32, 1, 10, 20000); camera.position.set(900, 1300, 3200);
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 1000, 0); orbit.enableDamping = true; orbit.update();
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35;
    scene.add(new THREE.HemisphereLight(0xf3eefc, 0x2a2633, 0.9)); const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1200, 2400, 1800); scene.add(key);
    // Soft shadows from the key light; the shadow camera frames a person-sized volume.
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4; key.shadow.bias = -0.0004; key.shadow.normalBias = 2; const sc = key.shadow.camera; sc.left = -1100; sc.right = 1100; sc.top = 2100; sc.bottom = -300; sc.near = 100; sc.far = 6000; key.target.position.set(0, 900, 0); scene.add(key.target);
    const rim = new THREE.DirectionalLight(0xb8a6ff, 1.1); rim.position.set(-1500, 1200, -1800); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshStandardMaterial({ color: 0x1d1a24, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.PolarGridHelper(1400, 8, 6, 64, 0x2c2836, 0x2c2836); grid.position.y = 0.5; scene.add(grid);
    // Ambient occlusion (GTAO) darkens folds, armpits and where cloth meets cloth, the cue that makes wrinkles read.
    const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); const ao = new GTAOPass(scene, camera, 1, 1); ao.updateGtaoMaterial({ radius: 60, distanceExponent: 1.2, thickness: 6, scale: 1.2 }); composer.addPass(ao); composer.addPass(new OutputPass());
    W.current = { renderer, scene, camera, orbit, composer, key, quality: 'product' };
    const resize = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h, false); composer.setSize(w, h); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); const w = W.current!; if (w.spin != null) { const r = Math.hypot(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z); const a = Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z) + w.spin; camera.position.x = orbit.target.x + r * Math.sin(a); camera.position.z = orbit.target.z + r * Math.cos(a); camera.lookAt(orbit.target); } orbit.update(); draw(); };
    const draw = () => { const w = W.current!; if (w.quality === 'product') w.composer!.render(); else renderer.render(scene, camera); }; (W.current as unknown as { draw: () => void }).draw = draw;
    loop();
    // Click (not drag) to pick.
    let down: [number, number] | null = null; const ray = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !pickRef.current) return; const w = W.current!; const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hits = ray.intersectObjects([w.cloth, w.avatar].filter(Boolean) as THREE.Object3D[], false); const h = hits[0]; if (!h) return;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
      const on = h.object === w.cloth ? 'cloth' : 'body'; let vertex: number | undefined;
      if (on === 'cloth' && h.face) { const pos = (h.object as THREE.Mesh).geometry.getAttribute('position'); let bd = Infinity; for (const vi of [h.face.a, h.face.b, h.face.c]) { const d = h.point.distanceTo(new THREE.Vector3().fromBufferAttribute(pos, vi)); if (d < bd) { bd = d; vertex = vi; } } }
      pickRef.current({ point: [h.point.x, h.point.y, h.point.z], normal: [n.x, n.y, n.z], on, vertex });
    };
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); orbit.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); W.current = null; };
  }, []);

  useImperativeHandle(ref, () => ({
    setAvatar(m) {
      const w = W.current; if (!w) return; if (w.avatar) { w.scene.remove(w.avatar); w.avatar.geometry.dispose(); w.avatar = undefined; } if (!m) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      w.avatar = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0xd9cfc4, roughness: 0.55, metalness: 0, sheen: 0.2, sheenRoughness: 0.8 })); w.avatar.castShadow = true; w.avatar.receiveShadow = true; w.scene.add(w.avatar);
    },
    setCloth(m) {
      const w = W.current; if (!w) return; if (w.cloth) { w.scene.remove(w.cloth); w.cloth.geometry.dispose(); w.cloth = undefined; } if (w.seams) { w.scene.remove(w.seams); w.seams.geometry.dispose(); w.seams = undefined; } w.model = m; if (!m) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); w.nrm = vertexNormals(m); g.setAttribute('normal', new THREE.BufferAttribute(w.nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * m.n).fill(0.8), 3)); g.setIndex(new THREE.BufferAttribute(m.tris, 1));
      // Texture coordinates are flat pattern millimetres, so the weave runs along each piece's grain.
      const uv = new Float32Array(2 * m.n); const mats: THREE.Material[] = []; const matOf = new Map<string, number>();
      m.pieces.forEach(p => { const fin = p.fabric.finish ?? (p.fabric.knit ? 'knit' : 'plain'); const tile = TILE_MM[fin]; const c = Math.cos(-p.grainAngle + Math.PI / 2), sn = Math.sin(-p.grainAngle + Math.PI / 2);
        for (let i = p.v0; i < p.v0 + p.vn; i++) { const x = m.rest2[2 * i], y = m.rest2[2 * i + 1]; uv[2 * i] = (x * c - y * sn) / tile; uv[2 * i + 1] = (x * sn + y * c) / tile; }
        let mi = matOf.get(fin); if (mi == null) { mi = mats.length; matOf.set(fin, mi); mats.push(materialFor(fin)); } g.addGroup(p.t0 * 3, p.tn * 3, mi); });
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      w.cloth = new THREE.Mesh(g, mats); w.cloth.castShadow = true; w.cloth.receiveShadow = true; w.scene.add(w.cloth);
      // Seams and hems: a stitch line along every piece edge, 2.5 mm in from the edge.
      const idx: number[] = []; for (const p of m.pieces) { const B = p.boundary; for (let k = 0; k < B.length; k++) idx.push(B[k], B[(k + 1) % B.length]); }
      w.seamIdx = new Uint32Array(idx); const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(idx.length * 3), 3));
      w.seams = new THREE.LineSegments(sg, new THREE.LineDashedMaterial({ color: 0xf5f0e8, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.55 })); w.scene.add(w.seams); this.updateCloth();
    },
    updateCloth(colors) {
      const w = W.current; if (!w?.cloth || !w.model) return; const g = w.cloth.geometry; const p = g.getAttribute('position') as THREE.BufferAttribute; p.array = w.model.pos; p.needsUpdate = true;
      vertexNormals(w.model, w.nrm); (g.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
      // Colours arrive in sRGB (swatches, the map ramp); the renderer works in linear light.
      if (colors) { const c = g.getAttribute('color') as THREE.BufferAttribute; const A = c.array as Float32Array; for (let k = 0; k < colors.length; k++) { const v = colors[k]; A[k] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } c.needsUpdate = true; }
      g.computeBoundingSphere();
      for (const b of w.buttons ?? []) { const i = b.vertex, nn = w.nrm!; const n = new THREE.Vector3(nn[3 * i], nn[3 * i + 1], nn[3 * i + 2]); b.mesh.position.set(w.model.pos[3 * i], w.model.pos[3 * i + 1], w.model.pos[3 * i + 2]).addScaledVector(n, 2); b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); }
      if (w.seams && w.seamIdx) { const P = w.seams.geometry.getAttribute('position') as THREE.BufferAttribute; const A = P.array as Float32Array; const X = w.model.pos, nn = w.nrm!; const I = w.seamIdx;
        for (let k = 0; k < I.length; k += 2) { const a = I[k], b = I[k + 1]; // nudge toward the piece interior: average of neighbour direction is not stored, so lift off the surface instead
          for (const [o, i] of [[k, a], [k + 1, b]] as const) { A[3 * o] = X[3 * i] + nn[3 * i] * 1.2; A[3 * o + 1] = X[3 * i + 1] + nn[3 * i + 1] * 1.2; A[3 * o + 2] = X[3 * i + 2] + nn[3 * i + 2] * 1.2; } }
        P.needsUpdate = true; w.seams.computeLineDistances(); w.seams.geometry.computeBoundingSphere(); }
      if (w.decal) { /* decal follows the cloth through its own vertex indices */ const d = w.decal.geometry; const idx = (d.userData.src as Uint32Array); const pos = d.getAttribute('position') as THREE.BufferAttribute; const arr = pos.array as Float32Array; const nn = w.nrm!;
        for (let k = 0; k < idx.length; k++) { const i = idx[k]; arr[3 * k] = w.model.pos[3 * i] + nn[3 * i] * 1.2; arr[3 * k + 1] = w.model.pos[3 * i + 1] + nn[3 * i + 1] * 1.2; arr[3 * k + 2] = w.model.pos[3 * i + 2] + nn[3 * i + 2] * 1.2; } pos.needsUpdate = true; d.computeBoundingSphere(); }
    },
    setDecal(tris, image) {
      const w = W.current; if (!w) return; if (w.decal) { w.scene.remove(w.decal); w.decal.geometry.dispose(); w.decal = undefined; } if (!tris || !image) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(tris.positions.slice(), 3)); g.setAttribute('uv', new THREE.BufferAttribute(tris.uvs, 2));
      g.userData.src = (tris as unknown as { src: Uint32Array }).src;
      const tex = new THREE.Texture(image); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace;
      w.decal = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false })); w.scene.add(w.decal);
    },
    setMarkers(pts, closed) {
      const w = W.current; if (!w) return; if (w.markers) { w.scene.remove(w.markers); w.markers = undefined; } if (!pts.length) return; const gp = new THREE.Group();
      for (const p of pts) { const s = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf472b6 })); s.position.set(...p); gp.add(s); }
      if (pts.length > 1) { const line = new THREE.BufferGeometry().setFromPoints([...pts, ...(closed ? [pts[0]] : [])].map(p => new THREE.Vector3(...p))); gp.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color: 0xf472b6, depthTest: false }))); }
      w.markers = gp; w.scene.add(gp);
    },
    frame(target) {
      const w = W.current; if (!w) return; const obj = target === 'plush' ? w.cloth : (w.avatar ?? w.cloth); if (!obj) return; obj.geometry.computeBoundingBox(); const b = obj.geometry.boundingBox!; const c = b.getCenter(new THREE.Vector3()); const sz = b.getSize(new THREE.Vector3());
      const dist = Math.max(sz.y, sz.x) * 1.9 + 200; w.orbit.target.copy(c); w.camera.position.set(c.x + dist * 0.35, c.y + sz.y * 0.12, c.z + dist); w.camera.near = dist / 100; w.camera.updateProjectionMatrix(); w.orbit.update();
    },
    snapshot(wd, ht) {
      const w = W.current!; const old = w.renderer.getSize(new THREE.Vector2()); if (wd && ht) { w.renderer.setSize(wd, ht, false); w.camera.aspect = wd / ht; w.camera.updateProjectionMatrix(); }
      if (wd && ht) w.composer!.setSize(wd, ht); (W.current as unknown as { draw: () => void }).draw(); const url = w.renderer.domElement.toDataURL('image/png'); if (wd && ht) w.composer!.setSize(old.x, old.y);
      if (wd && ht) { w.renderer.setSize(old.x, old.y, false); w.camera.aspect = old.x / old.y; w.camera.updateProjectionMatrix(); } return url;
    },
    turntable(seconds, onDone) {
      // WebCodecs first: we render each frame ourselves and encode it, so it records with the
      // window hidden or occluded; MediaRecorder (paced by a timer) is the fallback.
      const w = W.current!; const canvas = w.renderer.domElement as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream };
      const cam = w.camera, tg = w.orbit.target; const r = Math.hypot(cam.position.x - tg.x, cam.position.z - tg.z); const a0 = Math.atan2(cam.position.x - tg.x, cam.position.z - tg.z); const total = Math.round(seconds * 30);
      const draw = (W.current as unknown as { draw: () => void }).draw; const at = (k: number) => { const a = a0 + (k / total) * Math.PI * 2; cam.position.x = tg.x + r * Math.sin(a); cam.position.z = tg.z + r * Math.cos(a); cam.lookAt(tg); draw(); };
      const viaRecorder = () => {
        if (!canvas.captureStream || typeof MediaRecorder === 'undefined') { onDone(null); return; }
        const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']; const type = types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
        const stream = canvas.captureStream(0); const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
        const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined); const chunks: Blob[] = [];
        rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; rec.onstop = () => onDone(chunks.length ? new Blob(chunks, { type: type || 'video/webm' }) : null);
        let k = 0; rec.start(); const step = () => { if (k > total) { rec.stop(); return; } at(k); track.requestFrame?.(); k++; setTimeout(step, 1000 / 30); }; step();
      };
      encodeWebm(canvas, total + 1, 30, at).then(b => { at(0); if (b && b.size > 1000) onDone(b); else { console.warn('[drape] WebCodecs turntable unavailable; using MediaRecorder', b?.size); viaRecorder(); } }).catch(e => { console.warn('[drape] WebCodecs turntable failed; using MediaRecorder', e); viaRecorder(); });
    },
    turntableSheet(n = 8, size = 480) {
      const w = W.current!; const cam = w.camera, tg = w.orbit.target; const r = Math.hypot(cam.position.x - tg.x, cam.position.z - tg.z); const a0 = Math.atan2(cam.position.x - tg.x, cam.position.z - tg.z); const y0 = cam.position.y;
      const old = w.renderer.getSize(new THREE.Vector2()); const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols); w.renderer.setSize(size, Math.round(size * 1.25), false); w.composer!.setSize(size, Math.round(size * 1.25)); cam.aspect = 0.8; cam.updateProjectionMatrix();
      const out = document.createElement('canvas'); out.width = cols * size; out.height = rows * Math.round(size * 1.25); const g = out.getContext('2d')!; const draw = (W.current as unknown as { draw: () => void }).draw;
      for (let k = 0; k < n; k++) { const a = a0 + (k / n) * Math.PI * 2; cam.position.set(tg.x + r * Math.sin(a), y0, tg.z + r * Math.cos(a)); cam.lookAt(tg); draw(); g.drawImage(w.renderer.domElement, (k % cols) * size, Math.floor(k / cols) * Math.round(size * 1.25)); }
      cam.position.set(tg.x + r * Math.sin(a0), y0, tg.z + r * Math.cos(a0)); cam.lookAt(tg); w.renderer.setSize(old.x, old.y, false); w.composer!.setSize(old.x, old.y); cam.aspect = old.x / old.y; cam.updateProjectionMatrix(); draw();
      return out.toDataURL('image/png');
    },
    setQuality(q) { const w = W.current; if (w) w.quality = q; },
    setButtons(list) {
      const w = W.current; if (!w) return; for (const b of w.buttons ?? []) { w.scene.remove(b.mesh); b.mesh.geometry.dispose(); }
      w.buttons = list.map(b => { const r = b.diameterMm / 2; const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, Math.max(2, r * 0.3), 24), new THREE.MeshPhysicalMaterial({ color: 0xe8e1d4, roughness: 0.35, clearcoat: 0.6 })); mesh.castShadow = true; w.scene.add(mesh); return { vertex: b.vertex, mesh }; });
      this.updateCloth();
    },
  }), []);

  return <div ref={host} className={className ?? 'w-full h-full'} style={{ minHeight: 300, touchAction: 'none' }}/>;
});
export default Viewport;
