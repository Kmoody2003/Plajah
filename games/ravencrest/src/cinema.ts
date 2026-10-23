// The Halloween collection inside Ravencrest: lit roadside billboards on the Cinema Mile
// (the approach road behind the art's frame) and gilt-framed posters in the Grand Hall.
// Every one is interactive — walk up, press E (or tap) for the film card, "Watch" hands the
// film id to the host Plajah page (RavencrestGameFrame), which opens it in the Cinema player.
// Artwork is the Plajah Cinema cover for each film (films.json, scripts/ravencrest/exportFilms.ts).
import * as THREE from 'three/webgpu';
import type { ArrivalWorld } from './arrival';
import type { PaintingSlot } from './grandHall';
import { collide } from './collision';

export interface Film {
  id: string; hero: boolean; title: string; year: string; director: string; runtime: string;
  tagline: string; poster: string; posterFallback?: string;
}

export interface Showing {
  film: Film;
  /** Where to stand: centre of the board/canvas and the side it faces. */
  position: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
  level: 'outside' | 'hall';
  /** The poster surface (look-at lock-on raycasts against it). */
  face: THREE.Mesh;
}

export async function loadFilms(): Promise<Film[]> {
  try {
    const r = await fetch('/games/ravencrest/films.json');
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

const posterCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}
/** The Cinema cover, or the local fallback when the remote copy can't be textured. */
export function poster(f: Film): Promise<HTMLImageElement | null> {
  if (!posterCache.has(f.id)) {
    posterCache.set(f.id, loadImage(f.poster).then((img) => img ?? (f.posterFallback ? loadImage(f.posterFallback) : null)));
  }
  return posterCache.get(f.id)!;
}

/** Draw `img` letterboxed ("contain") into the rect. */
function contain(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) { g.fillText(`${line}…`, x, y + n * lineH); return; }
      g.fillText(line, x, y + n * lineH); n++; line = words[i];
    } else line = test;
  }
  if (line) g.fillText(line, x, y + n * lineH);
}

function canvasTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Billboard face: cover art left, Cinema title block right (2:1). */
function billboardFace(f: Film, img: HTMLImageElement | null): THREE.CanvasTexture {
  const W = 1536, H = 768;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, f.hero ? '#2a0f05' : '#0d0f14'); bg.addColorStop(1, '#030305');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const pw = H * 0.68;
  if (img) {
    // Cover blurred behind itself fills the panel; the sharp cover sits on top.
    g.save(); g.filter = 'blur(18px) brightness(0.45)'; g.drawImage(img, -40, -40, pw + 80, H + 80); g.restore();
    contain(g, img, 24, 24, pw - 48, H - 48);
  }
  const x = pw + 56, maxW = W - x - 56;
  g.fillStyle = f.hero ? '#ff8a2a' : '#e8b26a';
  g.font = '600 26px Georgia, serif';
  g.fillText(f.hero ? 'PLAJAH CINEMA  ·  WORLD PREMIERE' : 'PLAJAH CINEMA  ·  HALLOWEEN COLLECTION', x, 92);
  g.fillStyle = '#f4ead8';
  g.font = `bold ${f.title.length > 22 ? 72 : 92}px Georgia, serif`;
  wrap(g, f.title.toUpperCase(), x, 200, maxW, f.title.length > 22 ? 80 : 98, 2);
  g.fillStyle = '#b9c2cf';
  g.font = 'italic 34px Georgia, serif';
  g.fillText([f.year, f.director, f.runtime].filter(Boolean).join('  ·  '), x, 392);
  g.fillStyle = '#d6d0c4';
  g.font = '28px Georgia, serif';
  wrap(g, f.tagline, x, 462, maxW, 40, 5);
  g.fillStyle = f.hero ? '#ff8a2a' : '#e8b26a';
  g.font = 'bold 30px Georgia, serif';
  g.fillText('NOW SHOWING  ▶  WATCH THE FULL MOVIE', x, H - 52);
  return canvasTexture(c);
}

/** Painted canvas: the cover letterboxed onto a dark oil ground (2:3). */
function paintingFace(f: Film, img: HTMLImageElement | null): THREE.CanvasTexture {
  const W = 640, H = 960;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#120e0a'; g.fillRect(0, 0, W, H);
  if (img) {
    g.save(); g.filter = 'blur(24px) brightness(0.35) sepia(0.4)'; g.drawImage(img, -60, -60, W + 120, H + 120); g.restore();
    contain(g, img, 0, 0, W, H);
  }
  // Varnish: warm vignette so the canvases sit in candlelight, not like screens.
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(40,20,0,0)'); v.addColorStop(1, 'rgba(20,10,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return canvasTexture(c);
}

function faceMaterial(): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: 0x111111, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0 });
}
function applyFace(m: THREE.MeshStandardNodeMaterial, t: THREE.Texture, glow: number) {
  m.map = t; m.emissiveMap = t; m.color.set(0xffffff); m.emissiveIntensity = glow; m.needsUpdate = true;
}

/**
 * Billboards along the Cinema Mile: twelve alternating sides from the spawn toward the art's
 * frame, the Pumpkin Patch premiere board last and largest. Steel posts, catwalk and
 * gooseneck lamps (from the art sheets' roadside billboards) light each face.
 */
export function buildBillboards(road: ArrivalWorld['road'], films: Film[]) {
  const group = new THREE.Group();
  group.name = 'cinemaMile';
  const lights: THREE.PointLight[] = [];
  const showings: Showing[] = [];
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x2a2d31, roughness: 0.55, metalness: 0.85 });
  const backing = new THREE.MeshStandardNodeMaterial({ color: 0x15171a, roughness: 0.8, metalness: 0.4 });
  const lampGlow = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffd29a).multiplyScalar(5) });
  const hero = films.find((f) => f.hero);
  const rest = films.filter((f) => !f.hero);
  const along = new THREE.Vector3(Math.sin(road.yawAlong), 0, Math.cos(road.yawAlong));
  const n = rest.length;
  const order: { f: Film; v: number; side: number; big: boolean }[] = rest.map((f, i) => ({
    f, v: road.vStart + 22 + i * ((-road.vStart - 52) / Math.max(1, n - 1)), side: i % 2 ? 1 : -1, big: false,
  }));
  if (hero) order.push({ f: hero, v: -20, side: -1, big: true });

  for (const { f, v, side, big } of order) {
    const W = big ? 12 : 8, H = big ? 6 : 4, clear = big ? 3.6 : 3.2;
    // Left boards stand at the foot of the bank (it climbs ~6 m); right ones past the guardrail.
    const u = side < 0 ? road.uL - (big ? 4 : 2.6) : road.uR + 4;
    const ground = road.heightAt(u, v);
    const base = road.fromLocal(u, v, ground);
    // Face the road, turned 30° toward oncoming walkers so it reads as you approach.
    const toRoad = road.fromLocal((road.uL + road.uR) / 2, v, ground).sub(base).setY(0).normalize();
    const normal = toRoad.clone().lerp(along.clone().negate(), 0.5).normalize();
    const b = new THREE.Group();
    b.position.copy(base);
    b.rotation.y = Math.atan2(normal.x, normal.z);
    const top = clear + H;
    // Posts: from below grade (banks slope) to the board top.
    for (const px of [-W * 0.32, W * 0.32]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, top + 3, 0.32), steel);
      post.position.set(px, (top + 3) / 2 - 3, -0.3);
      b.add(collide(post));
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.22), backing);
    back.position.set(0, clear + H / 2, -0.14);
    b.add(back);
    const faceM = faceMaterial();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), faceM);
    face.position.set(0, clear + H / 2, 0);
    face.userData.dynamic = true;
    b.add(face);
    // Catwalk + rail under the face.
    const walk = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.8), steel);
    walk.position.set(0, clear - 0.25, 0.3);
    b.add(walk);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.04), steel);
    rail.position.set(0, clear + 0.6, 0.7);
    b.add(rail);
    // Gooseneck lamps over the top edge, arcing out and down onto the face.
    const lamps = big ? 4 : 3;
    for (let i = 0; i < lamps; i++) {
      const lx = (i / (lamps - 1) - 0.5) * W * 0.8;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(lx, top + 0.1, -0.2), new THREE.Vector3(lx, top + 1.3, 0.4), new THREE.Vector3(lx, top + 0.7, 1.4));
      b.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.045, 6), steel));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 10, 1, true), steel);
      head.position.set(lx, top + 0.62, 1.42);
      head.rotation.x = Math.PI * 0.85;
      b.add(head);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lampGlow);
      bulb.position.set(lx, top + 0.55, 1.36);
      b.add(bulb);
    }
    // One pooled light per board (the pool keeps only the nearest few real).
    const light = new THREE.PointLight(0xffc98a, big ? 60 : 34, big ? 16 : 12, 2);
    light.position.set(0, top + 0.2, 2.2);
    b.add(light);
    lights.push(light);
    group.add(b);

    poster(f).then((img) => applyFace(faceM, billboardFace(f, img), 0.55));
    b.updateMatrixWorld(true);
    const centre = face.getWorldPosition(new THREE.Vector3()).setY(ground);
    showings.push({ film: f, position: centre.addScaledVector(normal, 2), normal, radius: big ? 9 : 7, level: 'outside', face });
  }
  return { group, lights, showings };
}

/** Hang the collection in the hall's frames: hero frame = Pumpkin Patch, the rest in order. */
export function hangPaintings(slots: PaintingSlot[], films: Film[]): Showing[] {
  const hero = films.find((f) => f.hero);
  const rest = films.filter((f) => !f.hero);
  let k = 0;
  return slots.map((slot) => {
    const f = slot.hero && hero ? hero : rest[k++ % Math.max(1, rest.length)] ?? hero!;
    const screen = slot.kind === 'screen';
    // The projection room screen glows like a lit screen; canvases sit in candlelight.
    poster(f).then((img) => applyFace(slot.canvas.material as THREE.MeshStandardNodeMaterial, screen ? billboardFace(f, img) : paintingFace(f, img), screen ? 0.9 : slot.hero ? 0.16 : 0.1));
    const floorY = slot.position.y > 4.5 ? slot.position.y - (screen ? 2.6 : 2.3) : 0;
    return { film: f, position: slot.position.clone().addScaledVector(slot.normal, screen ? 5 : 1.6).setY(floorY), normal: slot.normal, radius: screen ? 6 : 3.2, level: 'hall' as const, face: slot.canvas };
  });
}

/** Nearest showing the player is standing in front of. */
export function focusShowing(list: Showing[], level: 'outside' | 'hall', p: THREE.Vector3): Showing | null {
  let best: Showing | null = null, bd = Infinity;
  for (const s of list) {
    if (s.level !== level) continue;
    const dx = p.x - s.position.x, dz = p.z - s.position.z;
    const d = Math.hypot(dx, dz);
    if (d > s.radius || Math.abs(p.y - s.position.y) > 2.5) continue;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** The film card overlay. `watch` posts to the host page. */
export class FilmCard {
  readonly el: HTMLDivElement;
  open: Film | null = null;
  constructor(private onClose: () => void, private onWatch?: (film: Film) => void) {
    const el = document.createElement('div');
    el.id = 'filmCard';
    el.innerHTML = `
      <div class="fc-panel">
        <img class="fc-poster" alt="" />
        <div class="fc-body">
          <div class="fc-kicker"></div>
          <h2 class="fc-title"></h2>
          <div class="fc-meta"></div>
          <p class="fc-tag"></p>
          <div class="fc-actions">
            <button class="fc-watch">▶ Watch full movie <span>Enter</span></button>
            <button class="fc-close">Close <span>E</span></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('.fc-close')!.addEventListener('click', () => this.close());
    el.querySelector('.fc-watch')!.addEventListener('click', () => this.watch());
  }
  show(f: Film) {
    this.open = f;
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    q<HTMLImageElement>('.fc-poster').src = f.poster;
    q<HTMLImageElement>('.fc-poster').onerror = function (this: HTMLImageElement) { if (f.posterFallback && this.src !== location.origin + f.posterFallback) this.src = f.posterFallback; };
    q<HTMLElement>('.fc-kicker').textContent = f.hero ? 'Plajah Cinema · World premiere' : 'Plajah Cinema · Halloween collection';
    q<HTMLElement>('.fc-title').textContent = f.title;
    q<HTMLElement>('.fc-meta').textContent = [f.year, f.director, f.runtime].filter(Boolean).join(' · ');
    q<HTMLElement>('.fc-tag').textContent = f.tagline;
    // A side panel, not a modal: Jack keeps moving and the mouse stays captured.
    this.el.classList.add('on');
  }
  close() {
    if (!this.open) return;
    this.open = null;
    this.el.classList.remove('on');
    this.onClose();
  }
  watch() {
    if (!this.open) return;
    const id = this.open.id;
    if (this.onWatch) { const f = this.open; this.close(); this.onWatch(f); return; }
    // Same-origin host (Plajah) opens the film in its player; standalone, say so.
    if (window.parent !== window) window.parent.postMessage({ type: 'ravencrest:watch', id }, location.origin);
    else console.info('[ravencrest] watch', id, '(standalone: no host page to play it)');
    this.close();
  }
}
