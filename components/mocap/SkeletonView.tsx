// 3D preview of a solved MotionClip: the skeleton as bones and joints on a floor grid, planted feet in green,
// the root path drawn on the floor. Plain WebGL so it runs anywhere the capture room runs (phones included).
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MotionClip } from '../../services/mocap/types';
import { clipFrame, fk } from '../../services/mocap/solve';

interface Props { clip: MotionClip | null; frame: number; className?: string }

export default function SkeletonView({ clip, frame, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    bones: THREE.LineSegments; joints: THREE.InstancedMesh; trail: THREE.Line; target: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x0d0c12);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    camera.position.set(2.2, 1.6, 3.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2));
    const grid = new THREE.GridHelper(20, 40, 0x3a3550, 0x221f2e); scene.add(grid);
    const bones = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe8e2ff }));
    scene.add(bones);
    const joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }), 32);
    joints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(32 * 3), 3);
    scene.add(joints);
    const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x8b6cff, transparent: true, opacity: 0.6 }));
    scene.add(trail);
    const target = new THREE.Vector3(0, 0.9, 0);
    state.current = { renderer, scene, camera, controls, bones, joints, trail, target };
    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // Follow the performer across the floor without fighting the user's orbit.
      const d = target.clone().sub(controls.target).multiplyScalar(0.12);
      controls.target.add(d); camera.position.add(d);
      controls.update(); renderer.render(scene, camera);
    };
    tick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); state.current = null; };
  }, []);

  // Root path on the floor.
  useEffect(() => {
    const s = state.current; if (!s) return;
    const pts: number[] = [];
    if (clip) for (let f = 0; f < clip.frames; f++) pts.push(clip.root[f * 3], 0.005, clip.root[f * 3 + 2]);
    s.trail.geometry.dispose();
    s.trail.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }, [clip]);

  useEffect(() => {
    const s = state.current; if (!s || !clip) { if (s) { s.bones.visible = false; s.joints.count = 0; } return; }
    const f = Math.max(0, Math.min(clip.frames - 1, Math.round(frame)));
    const { local, root } = clipFrame(clip, f);
    const sk = clip.skeleton.joints;
    const { pos, ends } = fk(local, sk, root);
    const seg: number[] = [];
    sk.forEach((j, i) => {
      if (j.parent >= 0) seg.push(...pos[j.parent].toArray(), ...pos[i].toArray());
      if (ends[i]) seg.push(...pos[i].toArray(), ...ends[i]!.toArray());
    });
    s.bones.geometry.dispose();
    s.bones.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    s.bones.visible = true;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const planted = (name: string) => (name === 'lFoot' && clip.contacts.l[f]) || (name === 'rFoot' && clip.contacts.r[f]);
    sk.forEach((j, i) => {
      s.joints.setMatrixAt(i, m.makeTranslation(pos[i].x, pos[i].y, pos[i].z));
      s.joints.setColorAt(i, c.set(planted(j.name) ? 0x3ee08f : j.name.startsWith('l') ? 0x7fb6ff : j.name.startsWith('r') ? 0xff9f7f : 0xffffff));
    });
    s.joints.count = sk.length;
    s.joints.instanceMatrix.needsUpdate = true;
    if (s.joints.instanceColor) s.joints.instanceColor.needsUpdate = true;
    s.target.set(root.x, Math.max(0.6, root.y), root.z);
  }, [clip, frame]);

  return <div ref={host} className={className} style={{ position: 'relative', overflow: 'hidden' }} />;
}
