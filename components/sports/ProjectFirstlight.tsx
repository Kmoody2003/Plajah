import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from '../ui/Button';
import { newDrive, nextPlay, snap, stepDrive, throwPass } from '../../services/firstlightGame';
import './projectFirstlight.css';

export default function ProjectFirstlight() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef(newDrive());
  const movement = useRef(0);
  const paused = useRef(false);
  const [isPaused, setPaused] = useState(false);
  const [hud, setHud] = useState({ ...game.current });
  const [error, setError] = useState('');
  const publish = () => setHud({ ...game.current });
  const action = (name: string) => {
    if (paused.current) return;
    if (name === 'snap') snap(game.current);
    else if (name === 'next') game.current = nextPlay(game.current);
    else if (name === 'reset') game.current = newDrive();
    else throwPass(game.current, Number(name));
    publish();
  };
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError('This device could not start 3D graphics. Try a browser with WebGL enabled.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '3D passing field. Purple receivers face cyan defenders. Use the controls below.');
    renderer.domElement.setAttribute('role', 'img');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#101326');
    scene.fog = new THREE.Fog('#101326', 120, 230);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    scene.add(new THREE.HemisphereLight('#d5e9ff', '#263523', 2.2));
    const sun = new THREE.DirectionalLight('#ffe8cc', 3); sun.position.set(-35, 65, 20); scene.add(sun);
    const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
      mesh.position.set(x,y,z); scene.add(mesh); return mesh;
    };
    box(59, 1, 126, '#183d36', 0,-0.7,50);
    for (let z = 0; z < 100; z += 5) box(53.3,0.04,5,z % 10 ? '#23624d' : '#287056',0,-0.15,z+2.5);
    box(53.3,0.05,10,'#6b0099',0,-0.1,-5); box(53.3,0.05,10,'#d40055',0,-0.1,105);
    for (let z=0;z<=100;z+=5) {
      box(53.3,0.05,0.12,'#d9e9d9',0,0,z);
      for (const x of [-5,5]) box(0.12,0.05,1,'#d9e9d9',x,0,z+2);
    }
    for (const x of [-26.65,26.65]) box(0.15,0.05,120,'#ffffff',x,0,50);
    for (const x of [-1,1]) for (let level=0;level<5;level++) box(5,2,125,level%2 ? '#27213e' : '#39304c',x*(34+level*4),level*2,50);
    for (const z of [-9,109]) {
      box(0.35,9,0.35,'#ffcf65',0,4.5,z); box(12,0.3,0.3,'#ffcf65',0,9,z);
      for (const x of [-6,6]) box(0.3,7,0.3,'#ffcf65',x,12.5,z);
    }
    const line = box(53,0.08,0.2,'#ffbf42',0,0.05,30);
    const scrimmage = box(53,0.08,0.15,'#00daf3',0,0.05,20);
    const player = (color: string) => {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.65,1.1,4,8),mat); body.position.y=1.7; group.add(body);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.55,12,8),new THREE.MeshStandardMaterial({ color: '#f4eaff' })); helmet.position.y=3; group.add(helmet);
      for (const x of [-0.35,0.35]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35,0.9,0.4),mat); leg.position.set(x,0.45,0); group.add(leg); }
      scene.add(group); return group;
    };
    const qb = player('#ff8c00'), receivers = [player('#b655ed'),player('#b655ed'),player('#b655ed')], defenders = [player('#00daf3'),player('#00daf3'),player('#00daf3')];
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.38,12,8), new THREE.MeshStandardMaterial({color:'#b76b36'})); ball.scale.set(0.7,0.7,1.4);scene.add(ball);
    const rings = receivers.map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(1.2,1.4,24),new THREE.MeshBasicMaterial({color:'#f0d7ff',side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;scene.add(m);return m; });
    const resize = () => { const w=el.clientWidth,h=el.clientHeight; renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el);resize();
    let frame=0,last=performance.now(),lastHud=0;
    const animate = (now: number) => {
      const dt=(now-last)/1000;last=now;
      const s=game.current;
      if (!paused.current && !document.hidden) stepDrive(s,dt,movement.current);
      qb.position.set(s.qb.x,0,s.qb.z);
      receivers.forEach((m,i)=>{ m.position.set(s.receivers[i].x,0,s.receivers[i].z); rings[i].position.set(s.receivers[i].x,0.12,s.receivers[i].z); });
      defenders.forEach((m,i)=>m.position.set(s.defenders[i].x,0,s.defenders[i].z));
      ball.position.set(s.ball.x,s.ball.y,s.ball.z);line.position.z=s.target;scrimmage.position.z=s.spot;
      camera.position.set(0,39,s.spot-43);camera.lookAt(0,0,s.spot+18);
      renderer.render(scene,camera);
      if(now-lastHud>100){setHud({...s});lastHud=now;}
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    const hide = () => { if(document.hidden) {paused.current=true;setPaused(true);movement.current=0;} };
    document.addEventListener('visibilitychange',hide);
    const lost = (e: Event) => {e.preventDefault();paused.current=true;setPaused(true);setError('Graphics were interrupted. Close and reopen the training field to restart.');};
    renderer.domElement.addEventListener('webglcontextlost',lost);
    return () => {
      cancelAnimationFrame(frame);ro.disconnect();document.removeEventListener('visibilitychange',hide);
      renderer.domElement.removeEventListener('webglcontextlost',lost);
      scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});
      renderer.dispose();renderer.domElement.remove();
    };
  }, []);
  return <section className="firstlight" aria-label="Project Firstlight football game" tabIndex={0}
    onBlur={()=>{movement.current=0;}}
    onKeyDown={e=>{
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if(e.code==='ArrowLeft'||e.code==='KeyA'){e.preventDefault();movement.current=-1;}
      if(e.code==='ArrowRight'||e.code==='KeyD'){e.preventDefault();movement.current=1;}
      if(e.repeat)return;
      if(e.code==='Space'){e.preventDefault();action(hud.phase==='ready'?'snap':'next');}
      if(['Digit1','Digit2','Digit3'].includes(e.code))action(String(Number(e.code.slice(-1))-1));
    }} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code))movement.current=0;}}>
    <header className="firstlight-heading"><div><p className="firstlight-eyebrow">PLAJAH SPORTS / PLAYABLE PROTOTYPE</p><h2>Project Firstlight</h2><p>Your first read. Your next big play.</p></div><span className="firstlight-pill">Original teams · Passing lab</span></header>
    <div className="firstlight-score"><strong>Aurora <span>{hud.score}</span></strong><span>{hud.down} &amp; {Math.max(0,hud.target-hud.spot)} · Ball on {hud.spot}</span><strong>Current <span>0</span></strong></div>
    <div className="firstlight-field" ref={host}/>
    {error && <p role="alert">{error}</p>}
    <div className="firstlight-controls">
      <Button variant="primary" disabled={!!error||isPaused||['live','flight'].includes(hud.phase)} onClick={()=>action(hud.phase==='ready'?'snap':hud.phase==='over'?'reset':'next')}>{hud.phase==='ready'?'Snap the ball':hud.phase==='over'?'New drive':'Next down'}</Button>
      {[0,1,2].map(i=><Button key={i} disabled={hud.phase!=='live'||isPaused||!!error} onClick={()=>action(String(i))}>Pass {i+1} · {['Left','Middle','Right'][i]}</Button>)}
      <Button onClick={()=>{paused.current=!paused.current;setPaused(paused.current);movement.current=0;}}>{isPaused?'Resume':'Pause'}</Button>
    </div>
    <div className="firstlight-controls">
      {[-1,1].map(dir=><Button key={dir} aria-label={dir<0?'Move quarterback left':'Move quarterback right'} disabled={isPaused||hud.phase!=='live'} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);movement.current=dir;}} onPointerUp={()=>{movement.current=0;}} onPointerCancel={()=>{movement.current=0;}} onLostPointerCapture={()=>{movement.current=0;}}>{dir<0?'← Move left':'Move right →'}</Button>)}
      <span>Pocket time: {Math.max(0,7-hud.time).toFixed(1)}s</span>
    </div>
    <p className="firstlight-message" role="status">{isPaused?'Paused. Take your time.':hud.message}</p>
    <details><summary>Learn the play &amp; controls</summary><p>Advance ten yards in four downs. Purple players receive; cyan players defend. Wait for a receiver to create space, then pass. The gold line is your first-down target. A catch ends this simplified play immediately.</p><p>Click the field to focus. A/D or arrow keys move your quarterback; 1/2/3 pass left/middle/right. Space snaps or continues. Touch controls work below the field.</p></details>
    <p className="firstlight-note">Local practice only. Simplified 3-on-3 passing, not full football rules. No accounts, rewards, licensed teams or real-game data. Original procedural art; no downloads required.</p>
  </section>;
}
