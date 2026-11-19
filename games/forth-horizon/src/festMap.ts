// The designed world map (the "navigation map" concept in racer/mountain pass and canyon): a flat, drawn map of the real region rather than the 3D world from above.
// Drawn once from the game's own data: a dark topographic base from the height grid (hillshade, 10 m contours, every 50 m bolder; lakes with depth rings; towns
// tinted from the buildings), the roads by class (freeway and highways orange, scenic roads and circuits in their festival colours, streets white, tracks dashed),
// place names. On top, live: Chora Fest sites (open / closed), the PR stunts, the player; a legend with filters; wheel to zoom, drag to pan; click a site to fast
// travel or open it with a Stage Pass. Esc or M closes it.
export interface MapRoad { xz: number[][]; kind: 'freeway' | 'highway' | 'scenic' | 'circuit' | 'street' | 'country' | 'dirt'; name?: string; color?: string }
export interface MapSite { id: string; name: string; kind: 'main' | 'outpost'; x: number; z: number }
export interface MapStunt { kind: 'trap' | 'zone' | 'drift' | 'danger'; name: string; x: number; z: number; stars: number }

export interface FestMapOpts {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  height: (x: number, z: number) => number;
  roads: () => MapRoad[];
  buildings: () => [number, number][];
  places: [string, number, number][];
  sites: () => (MapSite & { open: boolean; canOpen: boolean })[];
  stunts: () => MapStunt[];
  player: () => { x: number; z: number; yaw: number } | null;
  fp: () => string;
  travel: (id: string) => void;
  openSite: (id: string) => boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

const MPP = 8;              // base image resolution, metres per pixel
const FILTERS = [['roads', 'Roads', '#ffffff'], ['sites', 'Festival sites', '#ff2d9a'], ['trap', 'Speed traps', '#ff8c00'], ['zone', 'Speed zones', '#ffd166'], ['drift', 'Drift zones', '#00e5ff'], ['danger', 'Danger signs', '#ffc400']] as const;

export function createFestMap(o: FestMapOpts): { open(): void; close(): void; toggle(): void; isOpen(): boolean } {
  const W = Math.ceil((o.bounds.maxX - o.bounds.minX) / MPP), H = Math.ceil((o.bounds.maxZ - o.bounds.minZ) / MPP);
  let base: HTMLCanvasElement | null = null;
  const toPx = (x: number, z: number): [number, number] => [(x - o.bounds.minX) / MPP, (z - o.bounds.minZ) / MPP];

  function buildBase(): HTMLCanvasElement {
    const roads = o.roads();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H), d = img.data;
    const hs = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hs[j * W + i] = o.height(o.bounds.minX + (i + 0.5) * MPP, o.bounds.minZ + (j + 0.5) * MPP);
    // towns: building density on a 32 m grid, blurred a little
    const TC = 4, tw = Math.ceil(W / TC), th = Math.ceil(H / TC), town = new Float32Array(tw * th);
    for (const [x, z] of o.buildings()) { const [px, pz] = toPx(x, z); const i = Math.floor(px / TC), j = Math.floor(pz / TC); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = (j + b) * tw + i + a; if (i + a >= 0 && i + a < tw && j + b >= 0 && j + b < th) town[k] += a === 0 && b === 0 ? 1 : 0.35; } }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, h = hs[k], q = k * 4;
      const hx = hs[k + (i < W - 1 ? 1 : 0)] - hs[k - (i > 0 ? 1 : 0)], hz = hs[k + (j < H - 1 ? W : 0)] - hs[k - (j > 0 ? W : 0)];
      let r: number, gg: number, b: number;
      if (h < 2.5) {
        // water: deeper is darker, with depth rings every 8 m
        const dep = Math.min(1, (2.5 - h) / 60), ring = Math.floor((2.5 - h) / 8) !== Math.floor((2.5 - hs[k + (i < W - 1 ? 1 : 0)]) / 8);
        r = 38 - dep * 22; gg = 70 - dep * 30; b = 92 - dep * 30;
        if (ring) { r += 14; gg += 18; b += 22; }
      } else {
        // land: deep green, lighter with height, lit from the north-west
        const shade = Math.max(-1, Math.min(1, (-hx - hz) / (MPP * 1.6)));
        const alt = Math.min(1, h / 500);
        r = 30 + alt * 34 + shade * 16; gg = 52 + alt * 26 + shade * 20; b = 40 + alt * 22 + shade * 14;
        const t = Math.min(1, town[Math.floor(j / TC) * tw + Math.floor(i / TC)] / 6);
        r += (64 - r) * t * 0.7; gg += (66 - gg) * t * 0.7; b += (70 - b) * t * 0.7;
        // contours: 10 m, every fifth bolder
        const c0 = Math.floor(h / 10), cx = Math.floor(hs[k + (i < W - 1 ? 1 : 0)] / 10), cz = Math.floor(hs[k + (j < H - 1 ? W : 0)] / 10);
        if (c0 !== cx || c0 !== cz) { const major = Math.max(c0, cx, cz) % 5 === 0; const add = major ? 34 : 15; r += add; gg += add + 4; b += add; }
        if (h < 4.5) { r += 10; gg += 8; b += 2; }                          // the shore
      }
      d[q] = r; d[q + 1] = gg; d[q + 2] = b; d[q + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // roads, smallest first
    const style: Record<MapRoad['kind'], [string, number, number[]]> = {
      dirt: ['rgba(214,170,120,.55)', 1.0, [3, 3]], street: ['rgba(235,235,235,.55)', 0.9, []], country: ['rgba(240,240,240,.75)', 1.3, []],
      highway: ['#f2a03a', 2.6, []], freeway: ['#ffb43c', 3.4, []], scenic: ['#ffffff', 2.4, []], circuit: ['#ffffff', 2.6, []],
    };
    for (const kind of ['dirt', 'street', 'country', 'highway', 'freeway', 'scenic', 'circuit'] as const) {
      for (const r of roads) {
        if (r.kind !== kind || r.xz.length < 2) continue;
        const [col, wdt, dash] = style[kind];
        g.beginPath(); r.xz.forEach(([x, z], n) => { const [px, pz] = toPx(x, z); if (n) g.lineTo(px, pz); else g.moveTo(px, pz); });
        if (kind === 'scenic' || kind === 'circuit') { g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = wdt + 2; g.setLineDash([]); g.stroke(); }
        g.strokeStyle = r.color ?? col; g.lineWidth = wdt; g.setLineDash(dash); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
      }
    }
    g.setLineDash([]);
    // place names, and the names of the designed roads along them
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [name, x, z] of o.places) {
      const [px, pz] = toPx(x, z);
      g.font = '600 26px Outfit, Inter, sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(name.toUpperCase(), px + 1.5, pz + 1.5); g.fillStyle = 'rgba(230,240,235,.85)'; g.fillText(name.toUpperCase(), px, pz);
    }
    for (const r of roads) {
      if (!r.name || r.xz.length < 4) continue;
      const m = Math.floor(r.xz.length / 2), a = r.xz[m - 1], b2 = r.xz[m + 1], [px, pz] = toPx(r.xz[m][0], r.xz[m][1]);
      let ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      g.save(); g.translate(px, pz); g.rotate(ang); g.font = 'italic 600 15px Inter, sans-serif'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(r.name, 1, -9); g.fillStyle = r.color ?? '#fff'; g.fillText(r.name, 0, -10); g.restore();
    }
    return c;
  }

  // ---- the overlay ----
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;background:#0b1410;font-family:Inter,sans-serif;color:#fff;user-select:none';
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:grab';
  root.appendChild(cv);
  root.insertAdjacentHTML('beforeend', `
    <div style="position:absolute;left:28px;top:22px;pointer-events:none"><div style="font:800 34px Outfit,sans-serif;letter-spacing:.02em">NAVIGATION MAP</div><div id="fmSub" style="font:500 13px Inter,sans-serif;letter-spacing:.16em;color:rgba(255,255,255,.65);text-transform:uppercase">Chora Fest · Ironport and the Great Lakes coast</div></div>
    <div id="fmLegend" style="position:absolute;right:24px;top:22px;padding:12px 14px;border-radius:18px;background:rgba(10,20,16,.82);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(8px);min-width:190px"><div style="font:600 11px Outfit,sans-serif;letter-spacing:.24em;color:#9fe8c8;margin-bottom:6px">MAP LEGEND</div></div>
    <div id="fmPop" style="position:absolute;display:none;padding:12px 14px;border-radius:16px;background:rgba(20,0,28,.9);border:1px solid #ff2d9a;min-width:200px"></div>
    <div style="position:absolute;left:0;right:0;bottom:16px;text-align:center;font:600 11px Outfit,sans-serif;letter-spacing:.2em;color:rgba(255,255,255,.55);pointer-events:none">WHEEL ZOOM · DRAG PAN · CLICK A SITE TO TRAVEL · M OR ESC CLOSE · THE DRIVE IS PAUSED WHILE THE MAP IS OPEN</div>
    <button id="fmClose" style="position:absolute;left:28px;bottom:16px;height:38px;padding:0 20px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font:600 11px Outfit,sans-serif;letter-spacing:.18em;cursor:pointer">CLOSE</button>`);
  document.body.appendChild(root);
  const legend = root.querySelector('#fmLegend') as HTMLElement, pop = root.querySelector('#fmPop') as HTMLElement;
  const on: Record<string, boolean> = Object.fromEntries(FILTERS.map(([k]) => [k, true]));
  for (const [k, label, col] of FILTERS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;justify-content:space-between;margin:5px 0;font:500 12px Inter,sans-serif;cursor:pointer';
    row.innerHTML = `<span style="display:flex;align-items:center;gap:8px"><i style="width:10px;height:10px;border-radius:50%;background:${col};box-shadow:0 0 8px ${col}"></i>${label}</span><input type="checkbox" checked>`;
    (row.querySelector('input') as HTMLInputElement).onchange = (e) => { on[k] = (e.target as HTMLInputElement).checked; draw(); };
    legend.appendChild(row);
  }
  // view: scale (screen px per base px) and the base pixel at the screen centre
  let sc = 1, cx = W / 2, cz = H / 2;
  const fit = (): void => { sc = Math.min(cv.width / W, cv.height / H) * 0.95; cx = W / 2; cz = H / 2; };
  const scr = (px: number, pz: number): [number, number] => [(px - cx) * sc + cv.width / 2, (pz - cz) * sc + cv.height / 2];
  const hits: { x: number; y: number; r: number; site?: MapSite & { open: boolean; canOpen: boolean } }[] = [];
  function icon(g: CanvasRenderingContext2D, x: number, y: number, kind: string, col: string, size: number, glyph: string): void {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(1.5, 1.5, size, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath();
    if (kind === 'diamond') { g.moveTo(0, -size); g.lineTo(size, 0); g.lineTo(0, size); g.lineTo(-size, 0); g.closePath(); } else g.arc(0, 0, size, 0, Math.PI * 2);
    g.fill(); g.fillStyle = '#14001c'; g.font = `700 ${Math.round(size * 1.1)}px Outfit, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 0, 1);
    g.restore();
  }
  function draw(): void {
    if (!base) return;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#0b1410'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    const [x0, y0] = scr(0, 0);
    g.drawImage(base, x0, y0, W * sc, H * sc);
    hits.length = 0;
    const kz = Math.min(1.6, Math.max(0.7, sc * 0.9));
    if (on.trap || on.zone || on.drift || on.danger) for (const s of o.stunts()) {
      if (!on[s.kind]) continue;
      const [x, y] = scr(...toPx(s.x, s.z));
      if (x < -20 || y < -20 || x > cv.width + 20 || y > cv.height + 20) continue;
      const col = { trap: '#ff8c00', zone: '#ffd166', drift: '#00e5ff', danger: '#ffc400' }[s.kind];
      icon(g, x, y, s.kind === 'danger' ? 'diamond' : 'circle', col, 7 * kz, s.kind === 'trap' ? 'S' : s.kind === 'zone' ? 'Z' : s.kind === 'drift' ? 'D' : '!');
      if (s.stars) { g.fillStyle = '#ffd166'; g.font = `600 ${Math.round(9 * kz)}px Inter`; g.textAlign = 'center'; g.fillText('★'.repeat(s.stars), x, y + 13 * kz); }
      if (sc > 1.4) { g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '500 11px Inter'; g.textAlign = 'left'; g.fillText(s.name, x + 10 * kz, y); }
    }
    if (on.sites) for (const s of o.sites()) {
      const [x, y] = scr(...toPx(s.x, s.z));
      const col = s.open ? '#ff2d9a' : '#6b5f72';
      g.save(); g.translate(x, y);
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(-11 * kz, -18 * kz); g.arc(0, -22 * kz, 13 * kz, Math.PI * 0.8, Math.PI * 0.2); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.font = `700 ${Math.round(12 * kz)}px Outfit`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.kind === 'main' ? '★' : '♪', 0, -22 * kz);
      g.font = `700 ${Math.round(13 * kz)}px Outfit`; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(s.name, 1, -44 * kz + 1); g.fillStyle = s.open ? '#fff' : 'rgba(255,255,255,.6)'; g.fillText(s.name, 0, -44 * kz);
      if (!s.open) { g.font = `600 ${Math.round(9 * kz)}px Inter`; g.fillStyle = s.canOpen ? '#ffd166' : 'rgba(255,255,255,.5)'; g.fillText(s.canOpen ? 'PASS READY' : 'CLOSED', 0, -56 * kz); }
      g.restore();
      hits.push({ x, y: y - 22 * kz, r: 16 * kz, site: s });
    }
    const p = o.player();
    if (p) {
      const [x, y] = scr(...toPx(p.x, p.z));
      g.save(); g.translate(x, y); g.rotate(Math.PI - p.yaw);
      g.fillStyle = '#7ff7ff'; g.shadowColor = '#7ff7ff'; g.shadowBlur = 12; g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 4); g.lineTo(-10, 10); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = 'rgba(10,20,16,.85)'; g.fillRect(x + 16, y - 11, 96, 20); g.fillStyle = '#fff'; g.font = '600 10px Outfit'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('YOU ARE HERE', x + 22, y);
    }
    // a grid with letters and numbers along the edges, every 2 km
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.font = '600 10px Outfit'; g.fillStyle = 'rgba(255,255,255,.45)';
    for (let m = Math.ceil(o.bounds.minX / 2000) * 2000; m <= o.bounds.maxX; m += 2000) { const [x] = scr(...toPx(m, 0)); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); g.textAlign = 'center'; g.fillText(String.fromCharCode(65 + Math.round((m - o.bounds.minX) / 2000)), x, cv.height - 34); }
    for (let m = Math.ceil(o.bounds.minZ / 2000) * 2000; m <= o.bounds.maxZ; m += 2000) { const [, y] = scr(...toPx(0, m)); g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); g.textAlign = 'left'; g.fillText(String(1 + Math.round((m - o.bounds.minZ) / 2000)), 8, y - 4); }
    (root.querySelector('#fmSub') as HTMLElement).textContent = `Chora Fest · ${o.fp()}`;
  }
  const resize = (): void => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; draw(); };
  // pan and zoom
  let drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx, cz, moved: false }; cv.style.cursor = 'grabbing'; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; cx = drag.cx - (dx * devicePixelRatio) / sc; cz = drag.cz - (dy * devicePixelRatio) / sc; draw(); });
  cv.addEventListener('pointerup', (e) => {
    cv.style.cursor = 'grab';
    const d = drag; drag = null;
    if (d && !d.moved) {
      const x = e.clientX * devicePixelRatio, y = e.clientY * devicePixelRatio;
      const h = hits.find((q) => Math.hypot(q.x - x, q.y - y) < q.r + 6);
      if (h?.site) showPop(h.site, e.clientX, e.clientY); else pop.style.display = 'none';
    }
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const mx = e.clientX * devicePixelRatio, my = e.clientY * devicePixelRatio;
    const bx = (mx - cv.width / 2) / sc + cx, bz = (my - cv.height / 2) / sc + cz;          // keep the point under the cursor still
    sc = Math.max(0.2, Math.min(4, sc * Math.exp(-e.deltaY * 0.0015)));
    cx = bx - (mx - cv.width / 2) / sc; cz = bz - (my - cv.height / 2) / sc; draw();
  }, { passive: false });
  function showPop(s: MapSite & { open: boolean; canOpen: boolean }, x: number, y: number): void {
    pop.innerHTML = `<div style="font:600 10px Outfit;letter-spacing:.22em;color:#ff7ab8">${s.kind === 'main' ? 'MAIN SITE' : 'OUTPOST'}</div><div style="font:700 17px Outfit;margin:2px 0 8px">${s.name}</div>` +
      (s.open ? '<button data-a="go">FAST TRAVEL</button>' : s.canOpen ? '<button data-a="open">OPEN · 1 STAGE PASS</button>' : '<div style="font:400 12px Inter;color:rgba(255,255,255,.65)">Closed: earn a Stage Pass with Fest Points.</div>');
    pop.querySelectorAll('button').forEach((b) => { b.setAttribute('style', 'height:32px;padding:0 14px;border-radius:999px;border:1px solid #ff2d9a;background:rgba(255,45,154,.2);color:#fff;font:600 11px Outfit;letter-spacing:.12em;cursor:pointer'); b.onclick = () => { if (b.dataset.a === 'go') { close(); o.travel(s.id); } else { o.openSite(s.id); pop.style.display = 'none'; draw(); } }; });
    pop.style.left = Math.min(innerWidth - 240, x + 14) + 'px'; pop.style.top = Math.min(innerHeight - 140, y - 10) + 'px'; pop.style.display = 'block';
  }
  const key = (e: KeyboardEvent): void => { if (root.style.display === 'none') return; if (e.code === 'Escape' || e.code === 'KeyM') { e.stopPropagation(); e.preventDefault(); close(); } };
  addEventListener('keydown', key, true);
  (root.querySelector('#fmClose') as HTMLElement).onclick = () => close();
  function open(): void {
    if (!base) base = buildBase();
    root.style.display = 'block'; pop.style.display = 'none';
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; fit();
    const p = o.player(); if (p) { const [px, pz] = toPx(p.x, p.z); cx = px; cz = pz; sc = Math.max(sc, 1.2); }
    draw(); addEventListener('resize', resize);
    o.onOpen?.();
  }
  function close(): void { if (root.style.display === 'none') return; root.style.display = 'none'; removeEventListener('resize', resize); o.onClose?.(); }
  return { open, close, toggle: () => (root.style.display === 'none' ? open() : close()), isOpen: () => root.style.display !== 'none' };
}
