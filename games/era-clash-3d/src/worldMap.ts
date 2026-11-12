// The map of Otsu-no-ura: drawn from the live world (terrain from heightAt, water from the waterways' surface, every
// building footprint the districts report), with the named places from cityPlaces() on top. One source of truth:
// the same list labels the in-game map (M) and writes docs/era-clash-3d-map.md + .png (eraclash3d.mapDoc() in dev).
// Every new place we build gets an entry in cityPlaces(), so the map grows with the city.
//
// Orientation: seen from above with north (+Z, up the valley) at the top, as the player sees the world, so +X lies
// to the LEFT (the in-game compass puts E on the left when facing N; the map agrees with it).
import * as THREE from 'three/webgpu';
import type { Water } from './waterways';

export type PlaceKind = 'district' | 'landmark' | 'gate' | 'water' | 'travel' | 'quest';
export interface Place {
  id: string; name: string; kind: PlaceKind; x: number; z: number;
  /** One line: what's there. */
  note?: string;
  /** Reference stills (public/games/era-clash/assets/Nov 11 - 02_20/) this place answers. */
  stills?: number[];
  /** Label on the map (districts and landmarks; travel points show as icons only). */
  label?: boolean;
}

/** The map's extent in world metres. */
export const MAP_BOUNDS = { x0: -190, x1: 125, z0: -520, z1: 470 };   // the built city; widen as it grows (the castle keep: z ≈ 260)

const KIND_STYLE: Record<PlaceKind, { color: string; icon: string }> = {
  district: { color: '#f4e6c8', icon: '' },
  landmark: { color: '#f0c46a', icon: '◆' },
  gate: { color: '#e8a35a', icon: '⛩' },
  water: { color: '#9fd3e0', icon: '≈' },
  travel: { color: '#bfe6ef', icon: '▾' },
  quest: { color: '#ff9d6a', icon: '!' },
};

export interface MapLive {
  hero: () => { x: number; z: number; yaw: number };
  rafts: () => { x: number; z: number; yaw: number; riding: boolean }[];
  /** Live quest points: tracked step first. */
  quests: () => { x: number; z: number; title: string; tracked: boolean }[];
}

export class WorldMap {
  open = false;
  private base: HTMLCanvasElement | null = null;
  private readonly S = 2;   // px per metre in the baked base
  private el: HTMLDivElement;
  private view: HTMLCanvasElement;

  constructor(private o: { heightAt: (x: number, z: number) => number; water: Water; footprints: THREE.Box3[]; road: (z: number) => number;
    roadSpan: [number, number]; places: () => Place[]; live: MapLive;
    /** Tree trunks (x, z, crown radius) to draw the woods. */
    trees?: { x: number; z: number; r: number }[];
    /** Other roads as point lists (the castle road). */
    extraRoads?: { x: number; z: number }[][] }) {
    this.el = document.createElement('div');
    this.el.id = 'worldMap';
    this.el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(8,6,4,.86);z-index:40;font-family:inherit;color:#f4e6c8';
    this.view = document.createElement('canvas');
    this.view.style.cssText = 'max-width:96vw;max-height:88vh;border:1px solid #6b5636;box-shadow:0 0 40px #000';
    const foot = document.createElement('div');
    foot.style.cssText = 'margin-top:8px;font-size:12px;opacity:.8;letter-spacing:.06em';
    foot.innerHTML = 'OTSU-NO-URA · <span style="color:#ff9d6a">!</span> task · <span style="color:#f0c46a">◆</span> place · <span style="color:#bfe6ef">▾</span> landing · ▭ raft · M close';
    this.el.append(this.view, foot);
    document.body.appendChild(this.el);
  }

  private px(x: number) { return (MAP_BOUNDS.x1 - x) * this.S; }
  private py(z: number) { return (MAP_BOUNDS.z1 - z) * this.S; }

  /** Bake the ground, water, roads and buildings once (≈0.2 s). */
  bake() {
    const B = MAP_BOUNDS, S = this.S, W = (B.x1 - B.x0) * S, H = (B.z1 - B.z0) * S;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    // terrain + water at 1 m, drawn up to S px per metre
    const nx = B.x1 - B.x0, nz = B.z1 - B.z0, img = g.createImageData(nx, nz), d = img.data;
    const h = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) h[j * (nx + 1) + i] = this.o.heightAt(B.x1 - i, B.z1 - j);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = B.x1 - i - 0.5, z = B.z1 - j - 0.5, y = h[j * (nx + 1) + i];
      const s = this.o.water.surfaceAt(x, z);
      let r: number, gg: number, b: number;
      if ((s !== null && s > y + 0.05) || (s === null && y < -0.2)) {
        const dep = THREE.MathUtils.clamp(((s ?? 0) - y) / 4, 0, 1);
        r = 52 - dep * 34; gg = 92 - dep * 46; b = 104 - dep * 30;
      } else {
        // hillshade from the light in the north-west of the map
        const dx = h[j * (nx + 1) + i + 1] - y, dz = h[(j + 1) * (nx + 1) + i] - y;
        const shade = 1 + THREE.MathUtils.clamp((dx + dz) * 0.12, -0.28, 0.25);
        const k = THREE.MathUtils.clamp(y / 40, 0, 1);
        if (y < 0.9 && z < -430) { r = 168; gg = 150; b = 112; }             // sand (the beach)
        else { r = 92 + k * 52; gg = 104 + k * 22; b = 66 + k * 40; }         // grass to high ground
        r *= shade; gg *= shade; b *= shade;
      }
      const o = (j * nx + i) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = nx; tmp.height = nz; tmp.getContext('2d')!.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, W, H);
    // contour lines every 5 m (only on land)
    g.fillStyle = 'rgba(30,24,14,.22)';
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = h[j * (nx + 1) + i], b2 = h[j * (nx + 1) + i + 1], c2 = h[(j + 1) * (nx + 1) + i];
      if (a < 1) continue;
      if (Math.floor(a / 5) !== Math.floor(b2 / 5) || Math.floor(a / 5) !== Math.floor(c2 / 5)) g.fillRect(i * S, j * S, S, S);
    }
    // the castle avenue / village road
    g.strokeStyle = 'rgba(214,196,150,.75)'; g.lineWidth = 6 * S; g.lineCap = 'round'; g.beginPath();
    for (let z = this.o.roadSpan[0]; z <= this.o.roadSpan[1]; z += 2) { const X = this.px(this.o.road(z)), Y = this.py(z); z === this.o.roadSpan[0] ? g.moveTo(X, Y) : g.lineTo(X, Y); }
    g.stroke();
    for (const line of this.o.extraRoads ?? []) { g.lineWidth = 4.5 * S; g.beginPath(); line.forEach((p, i) => (i ? g.lineTo(this.px(p.x), this.py(p.z)) : g.moveTo(this.px(p.x), this.py(p.z)))); g.stroke(); }
    // the woods: a soft dark crown per tree
    if (this.o.trees) {
      g.fillStyle = 'rgba(28,48,22,.55)';
      for (const t of this.o.trees) { g.beginPath(); g.arc(this.px(t.x), this.py(t.z), t.r * S, 0, Math.PI * 2); g.fill(); }
    }
    // buildings, walls, banks: every footprint the districts report
    g.fillStyle = '#3a2c25'; g.strokeStyle = 'rgba(232,210,170,.35)'; g.lineWidth = 1;
    for (const f of this.o.footprints) {
      const x0 = this.px(f.max.x), y0 = this.py(f.max.z), w = (f.max.x - f.min.x) * S, hh = (f.max.z - f.min.z) * S;
      if (w > 120 * S || hh > 120 * S) continue;   // skip giant guard boxes
      g.fillRect(x0, y0, w, hh); g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
    }
    this.base = c;
    return c;
  }

  /** Base + places + live markers into a canvas (the in-game view, or the doc export with `live` off). */
  render(target: HTMLCanvasElement, live = true) {
    const base = this.base ?? this.bake();
    target.width = base.width; target.height = base.height;
    const g = target.getContext('2d')!, S = this.S;
    g.drawImage(base, 0, 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const places = this.o.places();
    for (const p of places) {
      const st = KIND_STYLE[p.kind], X = this.px(p.x), Y = this.py(p.z);
      if (p.kind === 'district') {
        g.font = `bold ${7 * S}px Georgia, serif`; g.lineWidth = 3 * S; g.strokeStyle = 'rgba(10,8,5,.75)'; g.fillStyle = st.color;
        g.strokeText(p.name.toUpperCase(), X, Y); g.fillText(p.name.toUpperCase(), X, Y);
        continue;
      }
      g.font = `${7 * S}px sans-serif`; g.lineWidth = 2.5 * S; g.strokeStyle = 'rgba(10,8,5,.8)'; g.fillStyle = st.color;
      g.strokeText(st.icon, X, Y); g.fillText(st.icon, X, Y);
      if (p.label) {
        g.font = `${5 * S}px Georgia, serif`; g.textAlign = 'left';
        g.strokeText(p.name, X + 5 * S, Y); g.fillText(p.name, X + 5 * S, Y);
        g.textAlign = 'center';
      }
    }
    // north arrow
    g.fillStyle = '#f4e6c8'; g.font = `bold ${8 * S}px Georgia, serif`; g.fillText('N', 18 * S, 14 * S);
    g.beginPath(); g.moveTo(18 * S, 20 * S); g.lineTo(14 * S, 30 * S); g.lineTo(22 * S, 30 * S); g.closePath(); g.fill();
    // scale bar: 50 m
    g.fillRect(10 * S, base.height - 12 * S, 50 * S, 1.5 * S); g.font = `${5 * S}px sans-serif`; g.fillText('50 m', 35 * S, base.height - 18 * S);
    if (!live) return target;
    for (const r of this.o.live.rafts()) {
      g.save(); g.translate(this.px(r.x), this.py(r.z)); g.rotate(-r.yaw);
      g.fillStyle = r.riding ? '#ffe2a0' : '#c9a46a'; g.fillRect(-0.75 * S, -1.65 * S, 1.5 * S, 3.3 * S); g.restore();
    }
    for (const q of this.o.live.quests()) {
      const X = this.px(q.x), Y = this.py(q.z);
      g.beginPath(); g.arc(X, Y, (q.tracked ? 5 : 3.5) * S, 0, Math.PI * 2);
      g.fillStyle = q.tracked ? '#ff7a3a' : 'rgba(255,157,106,.8)'; g.fill(); g.strokeStyle = '#1a0e06'; g.lineWidth = S; g.stroke();
      if (q.tracked) { g.font = `bold ${5 * S}px Georgia, serif`; g.fillStyle = '#ffd2b0'; g.textAlign = 'left'; g.lineWidth = 3 * S; g.strokeStyle = 'rgba(10,8,5,.85)'; g.strokeText(q.title, X + 7 * S, Y - 7 * S); g.fillText(q.title, X + 7 * S, Y - 7 * S); g.textAlign = 'center'; }
    }
    const hp = this.o.live.hero();
    // facing (sin yaw, cos yaw) in the world is (-sin, -cos) on the mirrored map: the arrow (drawn along +y) turns by π - yaw
    g.save(); g.translate(this.px(hp.x), this.py(hp.z)); g.rotate(Math.PI - hp.yaw);
    g.beginPath(); g.moveTo(0, 6 * S); g.lineTo(-3.5 * S, -3 * S); g.lineTo(0, -1 * S); g.lineTo(3.5 * S, -3 * S); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#a0281e'; g.lineWidth = 1.2 * S; g.stroke(); g.restore();
    return target;
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.style.display = on ? 'flex' : 'none';
    if (on) this.render(this.view);
  }
  /** Redraw the live markers while open (cheap: one blit + a few shapes). */
  update() { if (this.open) this.render(this.view); }

  /** The map as a PNG data URL and the gazetteer as Markdown (docs/era-clash-3d-map.*). */
  exportDoc(extra: { quests: { title: string; where: string }[]; planned: string[] }) {
    const png = this.render(document.createElement('canvas'), false).toDataURL('image/png');
    const places = this.o.places();
    const kinds: [PlaceKind, string][] = [['district', 'Districts'], ['landmark', 'Landmarks'], ['gate', 'Gates and walls'], ['water', 'Waterways'], ['travel', 'Landings and rafts']];
    const f = (n: number) => n.toFixed(0);
    const md = [
      '# Era Clash 3D: map of Otsu-no-ura',
      '',
      `Generated from the running game (\`eraclash3d.mapDoc()\` on the dev server) on ${new Date().toLocaleDateString('en-CA')}. Don't edit by hand: add places to \`cityPlaces()\` in \`games/era-clash-3d/src/places.ts\` and re-export.`,
      '',
      'North (+Z, up the valley) is at the top. As in the game view from above, +X is to the left. Coordinates are metres; sea level is y = 0.',
      '',
      '![Map of Otsu-no-ura](era-clash-3d-map.png)',
      '',
      ...kinds.flatMap(([k, title]) => {
        const rows = places.filter((p) => p.kind === k);
        if (!rows.length) return [];
        return [`## ${title}`, '', '| Place | x | z | Stills | What is there |', '|---|---|---|---|---|',
          ...rows.map((p) => `| ${p.name} | ${f(p.x)} | ${f(p.z)} | ${p.stills?.join(', ') ?? ''} | ${p.note ?? ''} |`), ''];
      }),
      '## Quests', '', '| Quest | Where |', '|---|---|', ...extra.quests.map((q) => `| ${q.title} | ${q.where} |`), '',
      '## Planned, not built yet', '', ...extra.planned.map((p) => `- ${p}`), '',
    ].join('\n');
    return { png, md };
  }
}
