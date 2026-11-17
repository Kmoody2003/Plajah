export interface HudTelemetry {
  speed: number; rpm: number; redline: number; gear: number; gears: number; shift: boolean;
  x: number; z: number; yaw: number; throttle: number; brake: number;
  rain: number; wetness: number; hydro: number; drift: boolean; collision: boolean; assist: boolean;
  lapHtml: string; mode: string; touch: boolean;
}
type Route = { x: number; z: number }[];
const TAU = Math.PI * 2;
const clamp = (n: number): number => Math.max(0, Math.min(1, n));

/** Fixed DOM and two small canvases; telemetry never rebuilds the HUD every frame. */
export class RacingHud {
  private map: HTMLCanvasElement;
  private dial: HTMLCanvasElement;
  private status: HTMLElement;
  private lap: HTMLElement;
  private hint: HTMLElement;
  private route: Route = [];
  private roads: { points: Route; minX: number; minZ: number; maxX: number; maxZ: number }[] = [];
  private routeName = '';
  private time = 0;
  private sampleFrames = 0;
  private sampleStart = performance.now();
  constructor(readonly root: HTMLElement) {
    root.className = 'race-hud';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;z-index:12;color:#f2f6f8';
    root.innerHTML = `<section class="race-map"><div class="race-eyebrow">APEX ELOHIM <span>LIVE</span></div><canvas class="race-map-canvas" width="420" height="420" aria-label="Heading-up route minimap"></canvas><div class="race-location"></div></section><div class="race-lap"></div><div class="race-status" role="status"></div><section class="race-instruments"><canvas width="680" height="520" aria-label="Speedometer, tachometer, gear and pedal gauges"></canvas></section><div class="race-hint"></div>`;
    this.map = root.querySelector('.race-map-canvas')!;
    this.dial = root.querySelector('.race-instruments canvas')!;
    this.status = root.querySelector('.race-status')!;
    this.lap = root.querySelector('.race-lap')!;
    this.hint = root.querySelector('.race-hint')!;
  }
  configure(name: string, route: Route, roads: Route[]): void {
    this.routeName = name; this.route = route;
    this.roads = roads.filter((points) => points.length).map((points) => ({ points, minX: Math.min(...points.map((p) => p.x)), minZ: Math.min(...points.map((p) => p.z)), maxX: Math.max(...points.map((p) => p.x)), maxZ: Math.max(...points.map((p) => p.z)) }));
    this.root.querySelector('.race-location')!.textContent = name;
    this.time = 0;
  }
  update(dt: number, data: HudTelemetry): void {
    this.sampleFrames++;
    const now = performance.now();
    if (now - this.sampleStart >= 1000) {
      this.root.dataset.frameRate = (this.sampleFrames * 1000 / (now - this.sampleStart)).toFixed(1);
      this.sampleFrames = 0; this.sampleStart = now;
    }
    this.time += dt;
    // Keep GPU time for the road: instruments redraw at 30 Hz, including on 120 Hz displays.
    if (this.time < 1 / 30) return;
    this.time %= 1 / 30;
    this.root.classList.toggle('race-touch', data.touch);
    this.drawMap(data); this.drawDial(data);
    const alert = data.collision ? 'CONTACT' : data.hydro > 0.3 ? 'AQUAPLANING · EASE THROTTLE' : data.drift ? 'TRACTION LIMIT' : data.assist ? 'BRAKE ASSIST' : data.wetness > 0.2 ? 'WET SURFACE' : '';
    this.status.textContent = alert;
    this.status.dataset.severity = data.hydro > 0.3 || data.collision ? 'warning' : 'info';
    const lapHtml = data.lapHtml || `<span class="race-eyebrow">${this.routeName ? 'ON COURSE' : 'FREE ROAM'}</span>`;
    if (this.lap.innerHTML !== lapHtml) this.lap.innerHTML = lapHtml;
    this.hint.textContent = data.touch ? '' : data.mode + '  ·  C CAMERA  ·  P REPLAY  ·  ESC EXIT';
  }
  private drawMap(data: HudTelemetry): void {
    const c = this.map.getContext('2d')!, size = 210, cx = 105, cy = 128;
    c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, size, size);
    c.fillStyle = 'rgba(8,16,24,.86)'; c.fillRect(0, 0, size, size);
    const range = 250 + Math.min(300, Math.abs(data.speed) * 5), scale = 180 / range;
    const sn = Math.sin(data.yaw), cs = Math.cos(data.yaw);
    const project = (p: { x: number; z: number }): [number, number] => { const x = p.x - data.x, z = p.z - data.z; return [cx + (x * cs - z * sn) * scale, cy - (x * sn + z * cs) * scale]; };
    const line = (route: Route, color: string, width: number): void => {
      if (!route.length) return;
      c.beginPath(); let pen = false;
      for (const p of route) { const [x, y] = project(p); if (Math.abs(x - cx) > 450 || Math.abs(y - cy) > 450) { pen = false; continue; } if (pen) c.lineTo(x, y); else c.moveTo(x, y); pen = true; }
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
    };
    c.save(); c.beginPath(); c.rect(5, 5, 200, 200); c.clip();
    for (const road of this.roads) {
      if (road.maxX < data.x - range * 1.5 || road.minX > data.x + range * 1.5 || road.maxZ < data.z - range * 1.5 || road.minZ > data.z + range * 1.5) continue;
      line(road.points, '#3e5262', 3);
    }
    line(this.route, '#111d26', 8); line(this.route, '#68dbe4', 3.5);
    const start = this.route[0];
    if (start) { const [x, y] = project(start); c.fillStyle = '#f4f6ee'; c.fillRect(x - 3, y - 3, 6, 6); }
    c.restore();
    c.fillStyle = '#fff'; c.strokeStyle = '#102430'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx + 6, cy + 7); c.lineTo(cx, cy + 3); c.lineTo(cx - 6, cy + 7); c.closePath(); c.fill(); c.stroke();
    const north = project({ x: data.x, z: data.z - 100 });
    const angle = Math.atan2(north[1] - cy, north[0] - cx);
    c.fillStyle = '#d0dbe1'; c.font = '700 10px Inter,sans-serif'; c.textAlign = 'center';
    c.fillText('N', cx + Math.cos(angle) * 78, 100 + Math.sin(angle) * 78);
    c.font = '10px JetBrains Mono,monospace'; c.textAlign = 'left'; c.fillText(`${Math.round(range)} m`, 10, 199);
    c.strokeStyle = '#9dabb5'; c.lineWidth = 1; c.beginPath(); c.moveTo(156, 193); c.lineTo(198, 193); c.stroke();
  }
  private drawDial(data: HudTelemetry): void {
    const c = this.dial.getContext('2d')!;
    c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 340, 260);
    const x = 205, y = 140, radius = 93, start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    c.fillStyle = 'rgba(8,15,23,.78)'; c.beginPath(); c.arc(x, y, 112, 0, TAU); c.fill();
    const arc = (r: number, from: number, to: number, color: string, width: number): void => { c.beginPath(); c.arc(x, y, r, from, to); c.strokeStyle = color; c.lineWidth = width; c.stroke(); };
    arc(radius + 11, start, start + sweep, 'rgba(194,210,222,.18)', 6);
    arc(radius + 11, start, start + sweep * clamp(data.rpm / data.redline), data.rpm > data.redline * 0.9 ? '#ff654f' : '#6edce7', 6);
    arc(radius + 11, start + sweep * 0.9, start + sweep, '#f35b49', 2);
    for (let speed = 0; speed <= 320; speed += 10) {
      const angle = start + sweep * speed / 320, major = speed % 40 === 0;
      c.strokeStyle = major ? '#d4dfe6' : '#6c7b88'; c.lineWidth = major ? 1.7 : 1;
      c.beginPath(); c.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius); c.lineTo(x + Math.cos(angle) * (radius - (major ? 10 : 5)), y + Math.sin(angle) * (radius - (major ? 10 : 5))); c.stroke();
      if (major) { c.fillStyle = '#c0cdd6'; c.font = '10px JetBrains Mono,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(speed), x + Math.cos(angle) * 72, y + Math.sin(angle) * 72); }
    }
    const speed = Math.abs(data.speed) * 3.6, angle = start + sweep * clamp(speed / 320);
    c.strokeStyle = '#ff8650'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x - Math.cos(angle) * 13, y - Math.sin(angle) * 13); c.lineTo(x + Math.cos(angle) * 84, y + Math.sin(angle) * 84); c.stroke();
    c.fillStyle = '#f4f7fa'; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.font = '700 42px Outfit,sans-serif'; c.textAlign = 'center'; c.fillText(String(Math.round(speed)).padStart(3, '0'), x, y + 31);
    c.fillStyle = '#a4b5c2'; c.font = '10px Inter,sans-serif'; c.fillText('KM/H', x, y + 57);
    c.font = '10px JetBrains Mono,monospace'; c.fillText(`${Math.round(data.rpm)} RPM`, x, 244);
    for (let i = 0; i < 10; i++) { c.fillStyle = data.rpm / data.redline > 0.45 + i * 0.052 ? (i > 7 ? '#ff6652' : i > 4 ? '#f9cb67' : '#70e3bb') : '#25333c'; c.fillRect(141 + i * 13, 10, 9, 4); }
    c.fillStyle = 'rgba(8,15,23,.9)'; c.fillRect(14, 105, 64, 76);
    c.fillStyle = '#9caebd'; c.font = '9px Inter,sans-serif'; c.fillText('GEAR', 46, 116);
    c.fillStyle = data.shift ? '#ffbf6b' : '#fff'; c.font = '700 44px Outfit,sans-serif'; c.fillText(data.gear < 0 ? 'R' : data.gear === 0 ? 'N' : String(data.gear), 46, 153);
    // Sequential transmission ladder, driven by the actual selected gear.
    const count = Math.max(1, data.gears);
    for (let i = 1; i <= count; i++) { const gx = 20 + (i - 1) * 12; c.fillStyle = data.gear === i ? '#69dce5' : '#51616d'; c.fillRect(gx, 190, 9, data.gear === i ? 16 : 8); c.font = '8px JetBrains Mono,monospace'; c.fillText(String(i), gx + 4, 216); }
    for (const [offset, amount, color, label] of [[0, data.throttle, '#6fdcb0', 'T'], [1, data.brake, '#f47766', 'B']] as const) {
      c.fillStyle = '#24323c'; c.fillRect(17 + offset * 15, 35, 7, 48); c.fillStyle = color; c.fillRect(17 + offset * 15, 83 - clamp(amount) * 48, 7, clamp(amount) * 48); c.font = '8px Inter,sans-serif'; c.fillText(label, 20 + offset * 15, 94);
    }
  }
}
