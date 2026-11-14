/**
 * SceneRoom.tsx — a built scene you can walk round and rearrange. Click a thing to select it, drag to place it, send
 * it to the clay to sculpt, or swap it for one built from a picture. Common sense is checked live as things move.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ArrowLeft, Check, Clapperboard, Download, Pause, Play, Video, X } from 'lucide-react';
import { checkScene, Scene, SceneObject } from '../../services/argilla/scene/sceneModel';
import type { FinishedObject } from '../../services/argilla/scene/finishObject';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MATERIAL_BY_ID } from '../../services/argilla/understand/materials';
import { CAMERA_MOVES, cameraAt, cameraMove, fitDistance, retime, sceneBounds, setKey, SHOT_LENGTHS, type MoveId, type Shot } from '../../services/argilla/shot/shot';
import { renderShot, RenderCancelled, type RenderedShot } from '../../services/argilla/shot/renderShot';

export interface SceneRoomProps {
  scene: Scene;
  /** The finished object behind each id, when one was built from a picture. */
  finished?: Record<string, FinishedObject>;
  onBack: () => void;
  onSculpt?: (object: SceneObject) => void;
  onReplace?: (object: SceneObject, picture: File) => Promise<void> | void;
  onApi?: (api: unknown) => void;
  /** The shot this stage belongs to: its camera path and length. */
  shot?: Shot;
  onShotChange?: (shot: Shot) => void;
  /** Something in the scene moved, so the saved shot is stale. */
  onSceneChange?: () => void;
  onSendToFabula?: (rendered: RenderedShot) => Promise<void>;
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

export default function SceneRoom({ scene, finished = {}, onBack, onSculpt, onReplace, onApi, shot, onShotChange, onSceneChange, onSendToFabula }: SceneRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [checks, setChecks] = useState(scene.checks);
  const [note, setNote] = useState('');
  const replaceInput = useRef<HTMLInputElement>(null);
  const world = useRef<{ root: THREE.Group; gizmo: TransformControls; meshes: Map<string, THREE.Mesh>; three: THREE.Scene; camera: THREE.PerspectiveCamera; orbit: OrbitControls } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const sceneChanged = useRef(onSceneChange);
  sceneChanged.current = onSceneChange;
  // The render loop reads these every frame; React state only mirrors them for the timeline.
  const drive = useRef({ t: 0, playing: false, throughCamera: false, keys: shot?.camera ?? [], seconds: shot?.seconds ?? 10, lastUi: 0 });
  drive.current.keys = shot?.camera ?? [];
  drive.current.seconds = shot?.seconds ?? 10;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [throughCamera, setThroughCamera] = useState(!!shot?.camera.length);
  drive.current.throughCamera = throughCamera && !!shot?.camera.length;
  const [rendering, setRendering] = useState<null | { done: number; total: number; to: 'file' | 'fabula' }>(null);
  const renderAbort = useRef<AbortController | null>(null);

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
      const bounds = sceneBounds(scene);
      const centre = new THREE.Vector3(...bounds.centre);
      // Fits the narrower of the two views, so a tall window doesn't crop the sides either.
      const fit = fitDistance(bounds.radius, camera.fov, canvas.clientWidth / Math.max(canvas.clientHeight, 1) || 1);
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
      sceneChanged.current?.();
    });
    world.current = { root, gizmo, meshes, three, camera, orbit };

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
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const d = drive.current;
      if (d.playing) {
        d.t += Math.min(0.1, (now - last) / 1000);
        if (d.t >= d.seconds) { d.t = d.seconds; d.playing = false; setPlaying(false); }
      }
      last = now;
      if (d.playing && now - d.lastUi > 60) { d.lastUi = now; setTime(d.t); }
      const at = d.throughCamera ? cameraAt(d.keys, d.t) : null;
      orbit.enabled = !at;
      if (at) {
        camera.position.set(...at.position);
        if (camera.fov !== at.fov) { camera.fov = at.fov; camera.updateProjectionMatrix(); }
        camera.lookAt(...at.target);
        orbit.target.set(...at.target);
      } else orbit.update();
      renderer.render(three, camera);
    };
    raf = requestAnimationFrame(loop);
    onApi?.({ camera, orbit, three, scene, meshes, setSelected, drive });
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

  const updateShot = (patch: Partial<Shot>) => { if (shot) onShotChange?.({ ...shot, ...patch, updatedAt: Date.now() }); };
  const seek = (t: number) => { drive.current.t = t; drive.current.playing = false; setPlaying(false); setTime(t); };
  const togglePlay = () => {
    const d = drive.current;
    if (!d.playing && d.t >= d.seconds - 1e-3) d.t = 0;
    d.playing = !d.playing;
    setPlaying(d.playing);
    setTime(d.t);
  };
  const setLength = (seconds: number) => {
    if (!shot) return;
    updateShot({ seconds, camera: retime(shot.camera, shot.seconds, seconds) });
    if (drive.current.t > seconds) seek(seconds);
  };
  const applyMove = (id: MoveId) => {
    const w = world.current;
    if (!w || !shot) return;
    const p = w.camera.position;
    updateShot({ camera: cameraMove(id, scene, shot.seconds, [p.x, p.y, p.z], 16 / 9, w.camera.fov) });
    setThroughCamera(true);
    seek(0);
  };
  const setCameraHere = () => {
    const w = world.current;
    if (!w || !shot) return;
    const p = w.camera.position, t = w.orbit.target;
    updateShot({ camera: setKey(shot.camera, { t: drive.current.t, position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], fov: w.camera.fov }) });
    setNote(`Camera set at ${drive.current.t.toFixed(1)} s`);
  };
  const render = async (to: 'file' | 'fabula') => {
    const w = world.current;
    if (!w || !shot) return;
    const abort = new AbortController();
    renderAbort.current = abort;
    seek(drive.current.t);
    setRendering({ done: 0, total: Math.round(shot.seconds * shot.fps), to });
    setNote('');
    const helper = w.gizmo.getHelper();
    try {
      const rendered = await renderShot(w.three, shot, {
        signal: abort.signal,
        onProgress: (done, total) => setRendering({ done, total, to }),
        // Gizmos don't belong in the picture.
        prepare: (on) => { helper.visible = !on; },
      });
      if (to === 'file') {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(rendered.blob);
        link.download = `${shot.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 50) || 'shot'}.${rendered.mime === 'video/webm' ? 'webm' : 'mp4'}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
        setNote(`${(rendered.blob.size / 1048576).toFixed(1)} MB, ${rendered.width}×${rendered.height}`);
      } else {
        await onSendToFabula?.(rendered);
        setNote('Sent to Fabula');
      }
    } catch (error) {
      setNote(error instanceof RenderCancelled ? 'Render stopped' : error instanceof Error ? error.message : 'Could not render the shot.');
    } finally {
      setRendering(null);
      renderAbort.current = null;
    }
  };

  const keys = shot?.camera ?? [];
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
      {shot ? (
        <div className="absolute left-3 right-3 md:right-[17.5rem] bottom-3 p-2.5 rounded-xl bg-black/70 backdrop-blur flex flex-col gap-2" data-testid="shot-timeline">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} disabled={!!rendering} aria-label={playing ? 'Pause' : 'Play'} className="p-1.5 rounded-lg bg-white text-black hover:bg-white/85 disabled:opacity-40">{playing ? <Pause size={14}/> : <Play size={14}/>}</button>
            <span className="w-24 tabular-nums text-white/70" aria-live="off">{time.toFixed(1)} / {shot.seconds} s</span>
            <div className="relative flex-1 h-6 flex items-center">
              <input type="range" aria-label="Playhead" min={0} max={shot.seconds} step={1 / shot.fps} value={time} onChange={(e) => seek(+e.target.value)} disabled={!!rendering} className="w-full accent-white"/>
              {keys.map((k) => <span key={k.t} title={`Camera key at ${k.t.toFixed(1)} s`} className="pointer-events-none absolute top-0 w-1.5 h-1.5 -ml-[3px] rotate-45 bg-amber-300" style={{ left: `${(k.t / shot.seconds) * 100}%` }}/>)}
            </div>
            <label className="flex items-center gap-1 text-white/60">Length
              <select value={shot.seconds} onChange={(e) => setLength(+e.target.value)} disabled={!!rendering} className="bg-white/10 rounded px-1 py-0.5 outline-none">
                {[...new Set([...SHOT_LENGTHS, shot.seconds])].sort((a, b) => a - b).map((s) => <option key={s} value={s} className="text-black">{s} s</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select aria-label="Camera move" value="" onChange={(e) => { if (e.target.value) applyMove(e.target.value as MoveId); }} disabled={!!rendering} className="bg-white/10 rounded-lg px-2 py-1 outline-none font-semibold">
              <option value="" className="text-black">Camera move…</option>
              {CAMERA_MOVES.map((m) => <option key={m.id} value={m.id} className="text-black">{m.label}</option>)}
            </select>
            <button onClick={setCameraHere} disabled={!!rendering || (throughCamera && !!keys.length)} title={throughCamera && keys.length ? 'Look freely first, then set the camera' : 'Keep this view at the playhead'} className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold disabled:opacity-40">Set camera here</button>
            <label className={`flex items-center gap-1 px-2 py-1 rounded-lg ${keys.length ? 'bg-white/10' : 'opacity-40'}`}>
              <input type="checkbox" checked={throughCamera && !!keys.length} disabled={!keys.length || !!rendering} onChange={(e) => setThroughCamera(e.target.checked)}/>Look through the shot camera
            </label>
            {!!keys.length && <button onClick={() => { updateShot({ camera: [] }); setThroughCamera(false); }} disabled={!!rendering} className="px-2.5 py-1 rounded-lg text-white/60 hover:text-white disabled:opacity-40">Clear camera</button>}
            <span className="flex-1"/>
            {rendering ? (
              <>
                <span className="tabular-nums text-white/70" role="status">Rendering {Math.round((rendering.done / Math.max(rendering.total, 1)) * 100)}%</span>
                <button onClick={() => renderAbort.current?.abort()} className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold">Stop</button>
              </>
            ) : (
              <>
                <button onClick={() => void render('file')} disabled={!keys.length} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold disabled:opacity-40"><Video size={13}/>Save video</button>
                {onSendToFabula && <button onClick={() => void render('fabula')} disabled={!keys.length} className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055] disabled:opacity-40"><Clapperboard size={13}/>Send to Fabula</button>}
              </>
            )}
          </div>
          {!keys.length && <p className="text-white/45">Pick a camera move, or look around and press Set camera here at different times.</p>}
        </div>
      ) : (
        <span className="absolute bottom-3 left-3 text-[11px] text-white/40">Click a thing to select it · drag the arrows to place it · left drag turns, wheel zooms</span>
      )}
      <input ref={replaceInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && current) void onReplace?.(current, f); e.target.value = ''; }}/>
    </div>
  );
}
