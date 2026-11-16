import * as THREE from 'three';
import { segIntersect } from './sim/geom';

/**
 * The map editor: a developer tool for drawing the world the sim runs on. Press F2 (or the MAP EDIT button) in the region view.
 * Pick a tool, click on the terrain to add points, double-click or Enter to finish.
 * Everything is saved to region/user_map.json (dev server) and to this browser. The game draws roads, rails and the airport and the sim reads all of it:
 *  - roads in a hierarchy (highway, avenue, collector, street, service, ramp, dirt), optionally one-way or with a lane count
 *  - zones (residential, dense, commercial, industrial, ...), which have demand and grow
 *  - rail lines (single or double track), stations and halts; level crossings appear wherever a rail meets a road
 *  - airport parts: runway (two points), taxiway, apron, terminal, hangars
 *  - service buildings (fire, police, school, clinic) whose coverage raises land value
 * See docs/apex-elohim/sim-layer.md.
 */
export type RoadKind = 'street' | 'avenue' | 'highway' | 'collector' | 'service' | 'ramp' | 'dirt' | 'creek';
export type ZoneKind = 'residential' | 'dense' | 'commercial' | 'industrial' | 'waterfront' | 'farmland' | 'parkland' | 'civic';
export type RailKind = 'single' | 'double';
export type StationKind = 'station' | 'halt' | 'freight';
export type AirportKind = 'runway' | 'taxiway' | 'apron' | 'terminal' | 'hangar';
export type ServiceKind = 'fire' | 'police' | 'school' | 'clinic';
export type FeatureType = 'road' | 'zone' | 'rail' | 'station' | 'airport' | 'service';
export interface Feature {
  id: string; type: FeatureType; kind: string; name: string; note: string; pts: number[][];
  oneway?: boolean; lanes?: number; service?: 'passenger' | 'freight' | 'mixed';
}
export interface UserMap { version: 1; features: Feature[] }

export const ROAD_STYLE: Record<RoadKind, { color: string; label: string; half: number }> = {
  highway: { color: '#ff5d73', label: 'Highway', half: 8.0 },
  avenue: { color: '#ff9f43', label: 'Avenue', half: 5.2 },
  collector: { color: '#ffc15e', label: 'Collector', half: 4.3 },
  street: { color: '#ffd166', label: 'Street', half: 3.4 },
  service: { color: '#d9c7a0', label: 'Service lane', half: 3.0 },
  ramp: { color: '#ff7ab6', label: 'Ramp (one way)', half: 4.2 },
  dirt: { color: '#c8a26a', label: 'Dirt road', half: 2.6 },
  creek: { color: '#4cc9f0', label: 'Creek / stream', half: 6 },
};
export const ZONE_STYLE: Record<ZoneKind, { color: string; label: string }> = {
  residential: { color: '#7bd88f', label: 'Residential (houses)' },
  dense: { color: '#ff7ab6', label: 'Dense city (towers, blocks)' },
  commercial: { color: '#ffb84d', label: 'Commercial (shops, strip)' },
  industrial: { color: '#a0a0c8', label: 'Industrial (yards, works)' },
  waterfront: { color: '#4cc9f0', label: 'Waterfront (docks, marina)' },
  farmland: { color: '#c9d86a', label: 'Farmland (farms)' },
  parkland: { color: '#3aa86b', label: 'Park / forest' },
  civic: { color: '#b388ff', label: 'Civic (school, church, hall)' },
};
export const RAIL_STYLE: Record<RailKind, { color: string; label: string }> = {
  single: { color: '#ff4d4d', label: 'Rail, single track' },
  double: { color: '#e03131', label: 'Rail, double track' },
};
export const STATION_STYLE: Record<StationKind, { color: string; label: string }> = {
  station: { color: '#ffe066', label: 'Station' },
  halt: { color: '#fff3bf', label: 'Halt (small stop)' },
  freight: { color: '#ffa94d', label: 'Freight depot' },
};
export const AIRPORT_STYLE: Record<AirportKind, { color: string; label: string }> = {
  runway: { color: '#66d9e8', label: 'Runway (2 points)' },
  taxiway: { color: '#99e9f2', label: 'Taxiway' },
  apron: { color: '#3bc9db', label: 'Apron' },
  terminal: { color: '#74c0fc', label: 'Terminal' },
  hangar: { color: '#4dabf7', label: 'Hangar' },
};
export const SERVICE_STYLE: Record<ServiceKind, { color: string; label: string }> = {
  fire: { color: '#ff6b6b', label: 'Fire station' },
  police: { color: '#4c6ef5', label: 'Police' },
  school: { color: '#fab005', label: 'School' },
  clinic: { color: '#20c997', label: 'Clinic' },
};
const STYLES: Record<FeatureType, Record<string, { color: string; label: string }>> = {
  road: ROAD_STYLE, zone: ZONE_STYLE, rail: RAIL_STYLE, station: STATION_STYLE, airport: AIRPORT_STYLE, service: SERVICE_STYLE,
};
const POLYGON = (t: FeatureType, kind: string): boolean => t === 'zone' || (t === 'airport' && (kind === 'apron' || kind === 'terminal' || kind === 'hangar'));
const POINTS = (t: FeatureType): number => (t === 'station' || t === 'service' ? 1 : 0);

/** what the running sim can tell the editor */
export interface SimInfo {
  hour: number; cars: number; trains: number; planes: number;
  demand: { R: number; C: number; I: number };
  pop: number; jobs: number;
  zone: (id: string) => { level: number; pop: number; jobs: number; landValue: number; access: number } | null;
}

export interface MapEditorOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  dom: HTMLElement;
  /** the terrain, to click on */
  terrain: () => THREE.Object3D;
  ground: (x: number, z: number) => number;
  /** put the camera straight above the middle of the screen's target */
  topView?: () => void;
  onChange?: (map: UserMap) => void;
  sim?: () => SimInfo | null;
  /** show or hide the traffic flow overlay in the world */
  toggleFlow?: () => boolean;
}

const LS = 'apex.userMap';

type Tool = { type: 'select' } | { type: FeatureType; kind: string };

export function createMapEditor(o: MapEditorOptions): { open: () => void; close: () => void; toggle: () => void; isOpen: () => boolean; load: (m: UserMap) => void; map: () => UserMap } {
  let features: Feature[] = [];
  let sel: string | null = null;
  let tool: Tool = { type: 'select' };
  let draft: number[][] = [];
  let openState = false, showAll = true, flowOn = false;
  const group = new THREE.Group(); group.name = 'map-editor'; group.renderOrder = 999; o.scene.add(group);
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const uid = (): string => 'f' + Math.random().toString(36).slice(2, 8);

  // ---------- panel ----------
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:12px;top:70px;width:292px;max-height:calc(100vh - 90px);overflow:auto;z-index:60;display:none;font:500 12px Inter,sans-serif;color:#fff;background:rgba(14,6,24,.92);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:12px;backdrop-filter:blur(10px)';
  document.body.appendChild(panel);
  const btn = (label: string, id: string, color = '#444'): string => `<button data-act="${id}" style="padding:5px 9px;margin:2px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:${color};color:#fff;font:600 11px Inter,sans-serif;cursor:pointer">${label}</button>`;
  const group2 = (title: string, type: FeatureType, hint: string): string => `<div style="margin:8px 0 2px;opacity:.7">${title}: ${hint}</div>` +
    Object.keys(STYLES[type]).map((k) => `<button data-tool="${type}:${k}" style="${toolStyle(type, k, STYLES[type][k].color)}">${STYLES[type][k].label}</button>`).join('');
  const bar = (v: number, color: string): string => `<span style="display:inline-block;width:70px;height:8px;background:rgba(255,255,255,.12);border-radius:4px;vertical-align:middle"><span style="display:block;width:${Math.round((Math.abs(v) * 50 + 50) / 100 * 70)}px;height:8px;border-radius:4px;background:${color};opacity:${v >= 0 ? 1 : 0.55}"></span></span>`;
  function simBlock(): string {
    const s = o.sim?.(); if (!s) return '';
    const h = Math.floor(s.hour), m = Math.floor((s.hour - h) * 60);
    return `<div style="margin:8px 0;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.07)"><div style="opacity:.7">SIM &nbsp;${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} &nbsp;· ${s.cars} cars · ${s.trains} trains · ${s.planes} planes</div>
      <div>Homes ${bar(s.demand.R, '#7bd88f')} &nbsp;Shops ${bar(s.demand.C, '#ffb84d')} &nbsp;Works ${bar(s.demand.I, '#a0a0c8')}</div>
      <div style="opacity:.7">${Math.round(s.pop).toLocaleString()} people · ${Math.round(s.jobs).toLocaleString()} jobs</div></div>`;
  }
  function render(): void {
    const f = features.find((x) => x.id === sel);
    const zs = f?.type === 'zone' ? o.sim?.()?.zone(f.id) : null;
    panel.innerHTML = `<div style="font:700 11px Outfit,sans-serif;letter-spacing:.2em;color:#FF8C00;margin-bottom:6px">MAP EDIT &nbsp;<span style="opacity:.6;letter-spacing:.05em;font-weight:500">F2 closes</span></div>
      <div><button data-tool="select" style="${toolStyle('select', '', '#d0bcff')}">Select / edit</button></div>
      ${group2('ROADS', 'road', 'click points, double-click to finish')}
      ${group2('RAIL', 'rail', 'lines; level crossings appear where they meet roads')}
      ${group2('STATIONS', 'station', 'one click, snaps to the nearest rail')}
      ${group2('AIRPORT', 'airport', 'runway = two clicks; apron, terminal, hangar = corners')}
      ${group2('ZONES', 'zone', 'click the corners, double-click to close')}
      ${group2('SERVICES', 'service', 'one click; coverage raises land value')}
      <div style="margin:8px 0 4px">${btn('Finish (Enter)', 'finish', '#2e7d32')}${btn('Undo point (Bksp)', 'undo')}${btn('Cancel (Esc)', 'cancel')}</div>
      <div style="margin:4px 0">${btn('Top view', 'top')}${btn(showAll ? 'Hide overlay' : 'Show overlay', 'toggle')}${o.toggleFlow ? btn(flowOn ? 'Hide traffic flow' : 'Show traffic flow', 'flow') : ''}${btn('Save', 'save', '#1565c0')}${btn('Download', 'download')}</div>
      <div id="meStatus" style="opacity:.75;min-height:16px;margin:4px 0">${draft.length ? draft.length + ' points. ' : ''}${features.length} drawn.</div>
      <div id="meSim">${simBlock()}</div>
      ${f ? `<div style="border-top:1px solid rgba(255,255,255,.15);margin-top:6px;padding-top:6px"><div style="opacity:.7">SELECTED: ${f.type} / ${f.kind}</div>
        <input data-field="name" value="${esc(f.name)}" placeholder="name (optional)" style="width:100%;margin:4px 0;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,.2);background:#1a1030;color:#fff">
        ${f.type === 'road' && f.kind !== 'creek' ? `<div>${btn(f.oneway ? 'One way: on' : 'One way: off', 'oneway', f.oneway ? '#7b2cbf' : '#444')}${btn('Lanes: ' + (f.lanes ?? 'auto'), 'lanes')}</div>` : ''}
        ${f.type === 'rail' ? `<div>${btn('Service: ' + (f.service ?? 'mixed'), 'service')}</div>` : ''}
        ${zs ? `<div style="opacity:.8;margin:4px 0">built ${Math.round(zs.level * 100)}% · ${Math.round(zs.pop)} people · ${Math.round(zs.jobs)} jobs · land value ${zs.landValue.toFixed(2)}${zs.access ? '' : ' · <b style="color:#ff8787">no road access: will not grow</b>'}</div>` : ''}
        <textarea data-field="note" placeholder="notes for Claude: what should be here, style, landmarks…" style="width:100%;height:64px;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,.2);background:#1a1030;color:#fff">${esc(f.note)}</textarea>
        <div>${btn('Delete (Del)', 'delete', '#a32630')}${btn('Change kind', 'kind')}</div></div>` : ''}
      <div style="opacity:.55;margin-top:8px;line-height:1.4">Drag orbits, wheel zooms, a click places a point. The sim reacts at once to roads and zones; the ground under new rail and airport is graded on reload.</div>`;
  }
  const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  function toolStyle(type: string, kind: string, color: string): string {
    const on = tool.type === type && (tool.type === 'select' || (tool as { kind: string }).kind === kind);
    return `margin:2px;padding:5px 8px;border-radius:9px;border:2px solid ${on ? '#fff' : 'transparent'};background:${color}${on ? '' : '99'};color:#111;font:700 11px Inter,sans-serif;cursor:pointer`;
  }
  const status = (t: string): void => { const e = panel.querySelector('#meStatus'); if (e) e.textContent = t; };
  // the sim block refreshes on its own (the clock moves) without rebuilding the panel under the user's cursor
  const simTimer = setInterval(() => { if (!openState) return; const e = panel.querySelector('#meSim'); if (e) e.innerHTML = simBlock(); }, 1000);
  void simTimer;

  // ---------- drawing ----------
  const mats = new Map<string, THREE.LineBasicMaterial>();
  const lineMat = (c: string): THREE.LineBasicMaterial => { let m = mats.get(c); if (!m) { m = new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true }); mats.set(c, m); } return m; };
  function sprite(text: string, x: number, y: number, z: number, color: string): THREE.Sprite {
    const c = document.createElement('canvas'); c.width = 384; c.height = 72; const g = c.getContext('2d')!;
    g.font = '700 30px Outfit, sans-serif'; g.fillStyle = 'rgba(14,6,24,.82)'; const w = Math.min(372, g.measureText(text).width + 24); g.fillRect(192 - w / 2, 12, w, 48);
    g.fillStyle = color; g.textAlign = 'center'; g.fillText(text, 192, 46);
    const t = new THREE.CanvasTexture(c); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.position.set(x, y, z); s.scale.set(120, 22.5, 1); s.renderOrder = 1000; return s;
  }
  function pathLine(pts: number[][], color: string, closed: boolean, lift = 4, side = 0): THREE.Line {
    const out: number[] = [];
    const n = pts.length + (closed ? 1 : 0);
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i % pts.length], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.max(1, Math.ceil(len / 30));
      const nx = (-(b[1] - a[1]) / len) * side, nz = ((b[0] - a[0]) / len) * side;
      for (let j = 0; j <= k; j++) { const t = j / k, x = a[0] + (b[0] - a[0]) * t + nx, z = a[1] + (b[1] - a[1]) * t + nz; out.push(x, o.ground(x, z) + lift, z); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    const l = new THREE.Line(g, lineMat(color)); l.renderOrder = 999; return l;
  }
  /** where drawn rails meet drawn roads, for the level crossing marks */
  function crossings(): [number, number, string][] {
    const out: [number, number, string][] = [];
    const rails = features.filter((f) => f.type === 'rail'), roads = features.filter((f) => f.type === 'road' && f.kind !== 'creek');
    for (const r of rails) for (const d of roads) {
      for (let i = 0; i < r.pts.length - 1; i++) for (let j = 0; j < d.pts.length - 1; j++) {
        const h = segIntersect([r.pts[i][0], r.pts[i][1]], [r.pts[i + 1][0], r.pts[i + 1][1]], [d.pts[j][0], d.pts[j][1]], [d.pts[j + 1][0], d.pts[j + 1][1]]);
        if (h) out.push([r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * h.t, r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * h.t, d.kind === 'highway' || d.kind === 'ramp' ? 'over' : 'level']);
      }
    }
    return out;
  }
  const dot = (x: number, z: number, r: number, color: string, lift: number, order = 1001): THREE.Mesh => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color, depthTest: false })); d.position.set(x, o.ground(x, z) + lift, z); d.renderOrder = order; return d;
  };
  function redraw(): void {
    group.clear();
    group.visible = openState && showAll;
    for (const f of features) {
      const style = STYLES[f.type]?.[f.kind]; if (!style) continue;
      const color = style.color, isSel = f.id === sel, poly = POLYGON(f.type, f.kind);
      if (f.type === 'rail' && f.kind === 'double') { group.add(pathLine(f.pts, isSel ? '#ffffff' : color, false, isSel ? 7 : 4, 6)); group.add(pathLine(f.pts, isSel ? '#ffffff' : color, false, isSel ? 7 : 4, -6)); }
      else if (f.pts.length > 1) group.add(pathLine(f.pts, isSel ? '#ffffff' : color, poly, isSel ? 7 : 4));
      if (f.type === 'airport' && f.kind === 'runway' && f.pts.length >= 2) { group.add(pathLine(f.pts, isSel ? '#ffffff' : color, false, 6, 22)); group.add(pathLine(f.pts, isSel ? '#ffffff' : color, false, 6, -22)); }
      if (poly && f.pts.length >= 3) {
        const contour = f.pts.map((p) => new THREE.Vector2(p[0], p[1]));
        const tri = THREE.ShapeUtils.triangulateShape(contour, []);
        const pos: number[] = []; for (const p of f.pts) pos.push(p[0], o.ground(p[0], p[1]) + 3, p[1]);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(tri.flat());
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isSel ? 0.42 : 0.26, depthTest: false, side: THREE.DoubleSide })); m.renderOrder = 998; group.add(m);
      }
      const c = f.pts.reduce((a, p) => [a[0] + p[0] / f.pts.length, a[1] + p[1] / f.pts.length], [0, 0]);
      const zi = f.type === 'zone' ? o.sim?.()?.zone(f.id) : null;
      group.add(sprite((f.name || style.label) + (zi ? ` · ${Math.round(zi.level * 100)}%` : '') + (f.oneway ? ' →' : ''), c[0], o.ground(c[0], c[1]) + 40, c[1], color));
      if (f.type === 'station' || f.type === 'service') { group.add(dot(f.pts[0][0], f.pts[0][1], isSel ? 16 : 11, isSel ? '#fff' : color, 12)); continue; }
      for (const p of f.pts) group.add(dot(p[0], p[1], isSel ? 9 : 5, isSel ? '#fff' : color, 5));
    }
    for (const [x, z, kind] of crossings()) group.add(dot(x, z, kind === 'level' ? 12 : 7, kind === 'level' ? '#ffe600' : '#adb5bd', 10, 1003));
    if (draft.length) {
      const col = tool.type === 'select' ? '#fff' : STYLES[tool.type][tool.kind].color;
      if (draft.length > 1) group.add(pathLine(draft, '#ffffff', false, 8));
      for (const p of draft) group.add(dot(p[0], p[1], 8, col, 8, 1002));
    }
  }
  function changed(persist = true): void {
    redraw(); render();
    if (persist) { try { localStorage.setItem(LS, JSON.stringify(map())); } catch { /* storage blocked */ } }
    o.onChange?.(map());
  }
  const map = (): UserMap => ({ version: 1, features });

  function pick(ev: PointerEvent | MouseEvent): THREE.Vector3 | null {
    const r = o.dom.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, o.camera);
    const hit = ray.intersectObject(o.terrain(), true)[0];
    return hit ? hit.point : null;
  }
  /** points needed to finish the tool's feature */
  const needed = (t: FeatureType, kind: string): number => (POINTS(t) ? 1 : POLYGON(t, kind) ? 3 : 2);
  function finish(): void {
    if (tool.type === 'select') return;
    const need = needed(tool.type, tool.kind);
    if (draft.length < need) { status(`Need at least ${need} point${need > 1 ? 's' : ''}.`); return; }
    const f: Feature = { id: uid(), type: tool.type, kind: tool.kind, name: '', note: '', pts: draft.map((p) => [Math.round(p[0]), Math.round(p[1])]) };
    // a runway is exactly two points: the threshold it lands at and the far end
    if (f.type === 'airport' && f.kind === 'runway') f.pts = [f.pts[0], f.pts[f.pts.length - 1]];
    if (f.type === 'road' && f.kind === 'ramp') f.oneway = true;
    features.push(f); sel = f.id; draft = []; changed();
  }
  function selectAt(p: THREE.Vector3): void {
    let best: string | null = null, bd = 60;
    for (const f of features) {
      let d = 1e9;
      if (POLYGON(f.type, f.kind) && f.pts.length >= 3) {
        let inside = false;
        for (let i = 0, j = f.pts.length - 1; i < f.pts.length; j = i++) { const a = f.pts[i], b = f.pts[j]; if ((a[1] > p.z) !== (b[1] > p.z) && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside; }
        if (inside) d = 20;
      }
      if (f.pts.length === 1) d = Math.hypot(f.pts[0][0] - p.x, f.pts[0][1] - p.z);
      for (let i = 0; i < f.pts.length - 1 + (POLYGON(f.type, f.kind) ? 1 : 0); i++) {
        const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / l2)); d = Math.min(d, Math.hypot(a[0] + dx * t - p.x, a[1] + dz * t - p.z));
      }
      if (d < bd) { bd = d; best = f.id; }
    }
    sel = best; changed(false);
  }

  // click vs drag: only a click (no movement) places a point, so orbiting still works
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent): void => { if (!openState || e.button !== 0) return; down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent): void => {
    if (!openState || !down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 5 || (e.target as HTMLElement).closest?.('div[style*="z-index:60"]')) return;
    const p = pick(e); if (!p) return;
    if (tool.type === 'select') { selectAt(p); return; }
    draft.push([p.x, p.z]); changed(false);
    // single-point features and runways finish by themselves
    if (POINTS(tool.type) || (tool.type === 'airport' && tool.kind === 'runway' && draft.length === 2)) finish();
  };
  const onDbl = (e: MouseEvent): void => { if (!openState || tool.type === 'select') return; if (draft.length > 1 && !POINTS(tool.type)) draft.pop(); finish(); e.preventDefault(); };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'F2') { e.preventDefault(); toggle(); return; }
    if (!openState || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    if (e.key === 'Enter') finish();
    else if (e.key === 'Escape') { draft = []; changed(false); }
    else if (e.key === 'Backspace') { draft.pop(); changed(false); e.preventDefault(); }
    else if (e.key === 'Delete' && sel) { features = features.filter((f) => f.id !== sel); sel = null; changed(); }
  };
  o.dom.addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); o.dom.addEventListener('dblclick', onDbl); addEventListener('keydown', onKey, true);

  panel.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    const t = b.getAttribute('data-tool'), act = b.getAttribute('data-act');
    if (t) {
      draft = [];
      if (t === 'select') tool = { type: 'select' }; else { const [ty, k] = t.split(':'); tool = { type: ty as FeatureType, kind: k }; sel = null; }
      changed(false); return;
    }
    const f = features.find((x) => x.id === sel);
    if (act === 'finish') finish();
    else if (act === 'undo') { draft.pop(); changed(false); }
    else if (act === 'cancel') { draft = []; changed(false); }
    else if (act === 'top') o.topView?.();
    else if (act === 'toggle') { showAll = !showAll; changed(false); }
    else if (act === 'flow') { flowOn = o.toggleFlow?.() ?? false; render(); }
    else if (act === 'delete' && f) { features = features.filter((x) => x.id !== f.id); sel = null; changed(); }
    else if (act === 'kind' && f) { const ks = Object.keys(STYLES[f.type]); f.kind = ks[(ks.indexOf(f.kind) + 1) % ks.length]; if (f.type === 'road' && f.kind === 'ramp') f.oneway = true; changed(); }
    else if (act === 'oneway' && f) { f.oneway = !f.oneway; changed(); }
    else if (act === 'lanes' && f) { const order = [undefined, 1, 2, 3]; f.lanes = order[(order.indexOf(f.lanes) + 1) % order.length]; if (f.lanes === undefined) delete f.lanes; changed(); }
    else if (act === 'service' && f) { const order = ['mixed', 'passenger', 'freight'] as const; f.service = order[(order.indexOf(f.service ?? 'mixed') + 1) % order.length]; changed(); }
    else if (act === 'download') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(map(), null, 1)], { type: 'application/json' })); a.download = 'user_map.json'; a.click(); }
    else if (act === 'save') {
      try {
        const r = await fetch('/__dev/user-map', { method: 'POST', body: JSON.stringify(map()) });
        status(r.ok ? `Saved ${features.length} features to region/user_map.json` : 'Save failed: ' + (await r.text()));
      } catch { status('Could not reach the dev server; use Download.'); }
      try { localStorage.setItem(LS, JSON.stringify(map())); } catch { /* storage blocked */ }
    }
  });
  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement, f = features.find((x) => x.id === sel); if (!f) return;
    const k = t.getAttribute('data-field'); if (k === 'name' || k === 'note') { f[k] = t.value; try { localStorage.setItem(LS, JSON.stringify(map())); } catch { /* storage blocked */ } if (k === 'name') redraw(); }
  });

  function open(): void { openState = true; panel.style.display = 'block'; render(); redraw(); }
  function close(): void { openState = false; panel.style.display = 'none'; draft = []; redraw(); }
  function toggle(): void { if (openState) close(); else open(); }
  function load(m: UserMap): void {
    // the saved file wins; a newer unsaved draft in this browser is kept only if the file is empty
    features = m.features ?? [];
    if (!features.length) { try { const d = JSON.parse(localStorage.getItem(LS) ?? 'null') as UserMap | null; if (d?.features) features = d.features; } catch { /* storage blocked */ } }
    redraw();
  }
  return { open, close, toggle, isOpen: () => openState, load, map };
}
