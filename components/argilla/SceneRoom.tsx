/**
 * SceneRoom.tsx — a built scene you can walk round and rearrange. Click a thing to select it, drag to place it, send
 * it to the clay to sculpt, or swap it for one built from a picture. Common sense is checked live as things move.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ArrowLeft, Check, Download, X } from 'lucide-react';
import { checkScene, Scene, SceneObject } from '../../services/argilla/scene/sceneModel';
import type { FinishedObject } from '../../services/argilla/scene/finishObject';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MATERIAL_BY_ID } from '../../services/argilla/understand/materials';

export interface SceneRoomProps {
  scene: Scene;
  /** The finished object behind each id, when one was built from a picture. */
  finished?: Record<string, FinishedObject>;
  onBack: () => void;
  onSculpt?: (object: SceneObject) => void;
  onReplace?: (object: SceneObject, picture: File) => Promise<void> | void;
  onApi?: (api: unknown) => void;
}

const dataTexture = (rgba: Uint8ClampedArray, size: number, srgb: boolean) => {
  const tex = new THREE.DataTexture(rgba as unknown as Uint8Array, size, size, THREE.RGBAFormat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

/** A copy for export with each object split into its named parts, so another tool sees a shirt and a badge, not one lump. */
function exportable(root: THREE.Group, scene: Scene, finished: Record<string, FinishedObject>) {
  const out = new THREE.Group();
  for (const child of root.children as THREE.Mesh[]) {
    const object = scene.objects.find((o) => o.id === child.userData.id);
    const made = object && finished[object.id];
    if (!object?.parts?.length || !made?.triangleParts) { out.add(child.clone()); continue; }
    const group = new THREE.Group();
    group.name = object.label;
    group.position.copy(child.position);
    group.rotation.copy(child.rotation);
    const byPart = new Map<number, number[]>();
    const indices = made.mesh.indices;
    made.triangleParts.forEach((label, t) => {
      let list = byPart.get(label);
      if (!list) byPart.set(label, list = []);
      list.push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]);
    });
    const source = child.geometry;
    for (const [label, list] of byPart) {
      const part = object.parts.find((p) => p.id === label);
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) g.setAttribute(name, source.getAttribute(name));
      g.setIndex(list);
      const material = (child.material as THREE.MeshStandardMaterial).clone();
      material.name = part ? (MATERIAL_BY_ID.get(part.material)?.label ?? part.material) : 'Body';
      const mesh = new THREE.Mesh(g, material);
      mesh.name = part?.name ?? 'body';
      if (part) mesh.userData = { material: part.material, behaviour: part.behaviour, evidence: part.evidence };
      group.add(mesh);
    }
    out.add(group);
  }
  return out;
}

export default function SceneRoom({ scene, finished = {}, onBack, onSculpt, onReplace, onApi }: SceneRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [checks, setChecks] = useState(scene.checks);
  const [note, setNote] = useState('');
  const replaceInput = useRef<HTMLInputElement>(null);
  const world = useRef<{ root: THREE.Group; gizmo: TransformControls; meshes: Map<string, THREE.Mesh> } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const three = new THREE.Scene();
    three.background = new THREE.Color('#14131a');
    const reach = Math.max(scene.extent, 2);
    const camera = new THREE.PerspectiveCamera(scene.backdrop ? 45 : 38, 1, reach * 0.01, reach * 20);
    const orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true;
    // A picture scene opens from where the picture was taken, stepped back so all of it fits in this window.
    if (scene.backdrop) { camera.position.set(0, 0, reach * 0.22); orbit.target.set(0, 0, -reach * 0.5); } else {
      // Otherwise it opens on everything, aimed at its middle: aimed near the ground, a standing figure lost its head.
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const o of scene.objects) {
        const [x, y, z] = o.position, [w, h, d] = o.size;
        lo[0] = Math.min(lo[0], x - w / 2); hi[0] = Math.max(hi[0], x + w / 2);
        lo[1] = Math.min(lo[1], y); hi[1] = Math.max(hi[1], y + h);
        lo[2] = Math.min(lo[2], z - d / 2); hi[2] = Math.max(hi[2], z + d / 2);
      }
      const centre = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      const radius = Number.isFinite(lo[0]) ? Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 : reach * 0.3;
      // Fits the narrower of the two views, so a tall window doesn't crop the sides either.
      const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1) || 1;
      const fit = (radius / Math.sin(Math.min(vertical, Math.atan(Math.tan(vertical) * aspect)))) * 1.1;
      orbit.target.copy(centre);
      camera.position.copy(centre).addScaledVector(new THREE.Vector3(0.35, 0.3, 0.55).normalize(), fit);
    }
    three.add(new THREE.HemisphereLight('#e2e6f2', '#4a443c', scene.backdrop ? 1.6 : 1.1));
    // Metal shows only what it reflects: without a room around it, a brass badge renders black.
    const reflections = new THREE.PMREMGenerator(renderer);
    const roomMap = reflections.fromScene(new RoomEnvironment(), 0.04).texture;
    reflections.dispose();
    three.environment = roomMap;
    three.environmentIntensity = 0.6;
    const sun = new THREE.DirectionalLight('#fff1dd', 2.6);
    sun.position.set(reach * 0.5, reach, reach * 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: reach * 4 });
    sun.shadow.bias = -0.0008;
    three.add(sun);
    const root = new THREE.Group();
    three.add(root);

    const disposable: { dispose: () => void }[] = [roomMap];
    if (scene.backdrop) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(scene.backdrop.positions, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(scene.backdrop.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(scene.backdrop.indices, 1));
      g.computeVertexNormals();
      const tex = new THREE.TextureLoader().load(scene.pictureUrl ?? '');
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
      m.name = 'Backdrop';
      three.add(m);
      disposable.push(g, tex);
    } else {
      const ground = new THREE.Mesh(new THREE.CircleGeometry(reach * 1.6, 64), new THREE.MeshStandardMaterial({ color: scene.groundColor, roughness: 0.95 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      three.add(ground);
      disposable.push(ground.geometry);
    }

    const meshes = new Map<string, THREE.Mesh>();
    for (const object of scene.objects) {
      const made = finished[object.id];
      const source = made?.mesh ?? object.mesh;
      if (!source) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(source.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(source.normals, 3));
      g.setIndex(new THREE.BufferAttribute(source.indices, 1));
      if (made) g.setAttribute('uv', new THREE.BufferAttribute(made.uvs, 2));
      const surface = made?.surface ? dataTexture(made.surface, made.textureSize, false) : null;
      const material = made
        ? new THREE.MeshStandardMaterial({ map: dataTexture(made.texture, made.textureSize, true), normalMap: dataTexture(made.normalMap, made.normalSize, false), roughness: surface ? 1 : 0.7, metalness: surface ? 1 : 0, roughnessMap: surface, metalnessMap: surface })
        : new THREE.MeshStandardMaterial({ color: object.color, roughness: 0.75 });
      const mesh = new THREE.Mesh(g, material);
      mesh.name = object.label;
      mesh.userData.id = object.id;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.set(...object.position);
      mesh.rotation.y = object.rotationY;
      root.add(mesh);
      meshes.set(object.id, mesh);
      disposable.push(g, material);
    }

    const gizmo = new TransformControls(camera, canvas);
    gizmo.setSize(0.8);
    three.add(gizmo.getHelper());
    gizmo.addEventListener('dragging-changed', (event) => { orbit.enabled = !event.value; });
    gizmo.addEventListener('objectChange', () => {
      const id = selectedRef.current;
      const object = scene.objects.find((o) => o.id === id);
      const mesh = id ? meshes.get(id) : null;
      if (!object || !mesh) return;
      object.position = [mesh.position.x, mesh.position.y, mesh.position.z];
      object.rotationY = mesh.rotation.y;
      if (!scene.backdrop) setChecks(checkScene(scene));
    });
    world.current = { root, gizmo, meshes };

    const raycaster = new THREE.Raycaster();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { if (e.button === 0 && !gizmo.axis) down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return; }
      down = null;
      const r = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2), camera);
      const hit = raycaster.intersectObjects(root.children, false)[0];
      setSelected(hit ? hit.object.userData.id : null);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    const size = () => {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(r.height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(size);
    observer.observe(canvas);
    size();
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); orbit.update(); renderer.render(three, camera); };
    loop();
    onApi?.({ camera, orbit, three, scene, meshes, setSelected });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      gizmo.dispose(); orbit.dispose();
      disposable.forEach((d) => d.dispose());
      renderer.dispose();
      world.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, finished]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const mesh = selected ? w.meshes.get(selected) : null;
    if (mesh) w.gizmo.attach(mesh); else w.gizmo.detach();
  }, [selected]);

  const exportGlb = async () => {
    const w = world.current;
    if (!w) return;
    setNote('Packing the scene…');
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const result = await new GLTFExporter().parseAsync(exportable(w.root, scene, finished), { binary: true });
    const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${scene.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 50) || 'scene'}.glb`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
    setNote(`${(blob.size / 1048576).toFixed(1)} MB${scene.backdrop ? ', without the backdrop' : ''}`);
  };

  const current = scene.objects.find((o) => o.id === selected) ?? null;
  return (
    <div className="absolute inset-0 z-30 bg-[#14131a] text-white text-xs" data-testid="scene-room">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none"/>
      <button onClick={onBack} className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 font-semibold hover:bg-black/80"><ArrowLeft size={14}/>Back</button>
      <aside className="absolute top-3 right-3 w-64 max-h-[calc(100%-24px)] overflow-y-auto p-3 rounded-xl bg-black/70 backdrop-blur flex flex-col gap-2.5">
        <div className="text-sm font-bold leading-snug">{scene.title}</div>
        <p className="text-white/45">{scene.source}</p>
        <div className="flex flex-col gap-1" role="list" aria-label="What it checked">
          {checks.map((c) => (
            <div key={c.id} role="listitem" className="flex gap-1.5 leading-snug">
              {c.pass ? <Check size={13} className="shrink-0 text-emerald-400"/> : <X size={13} className="shrink-0 text-amber-400"/>}
              <span>{c.label}<span className="block text-white/45">{c.detail}</span></span>
            </div>
          ))}
        </div>
        {!!scene.corrections.length && <ul className="text-white/55 leading-snug list-disc pl-3.5">{scene.corrections.map((c) => <li key={c}>{c}</li>)}</ul>}
        <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
          {scene.objects.map((o) => (
            <button key={o.id} aria-pressed={selected === o.id} onClick={() => setSelected(o.id)} className={`flex justify-between px-2 py-1 rounded-md text-left ${selected === o.id ? 'bg-white text-black' : 'bg-white/[.06] hover:bg-white/15'}`}>
              <span className="capitalize">{o.label}</span>
              <span className={selected === o.id ? 'text-black/50' : 'text-white/35'}>{o.size[1] >= 1 ? `${o.size[1].toFixed(1)} m` : `${Math.round(o.size[1] * 100)} cm`}</span>
            </button>
          ))}
        </div>
        {current && (
          <div className="flex flex-col gap-1">
            {onSculpt && <button onClick={() => onSculpt(current)} className="py-1.5 rounded-lg font-semibold bg-white/10 hover:bg-white/20">Sculpt this one</button>}
            {onReplace && <button onClick={() => replaceInput.current?.click()} className="py-1.5 rounded-lg font-semibold bg-white/10 hover:bg-white/20">Build it from a picture</button>}
          </div>
        )}
        <button onClick={exportGlb} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055]"><Download size={13}/>Export GLB</button>
        {!!note && <p role="status" className="text-white/60">{note}</p>}
      </aside>
      <span className="absolute bottom-3 left-3 text-[11px] text-white/40">Click a thing to select it · drag the arrows to place it · left drag turns, wheel zooms</span>
      <input ref={replaceInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && current) void onReplace?.(current, f); e.target.value = ''; }}/>
    </div>
  );
}
