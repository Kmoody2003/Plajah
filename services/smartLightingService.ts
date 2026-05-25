// Smart Lighting Service — Razer Chroma, Philips Hue, Nanoleaf, Govee
// All local-device adapters proxy through /api/lights/proxy to avoid browser CORS.
// Razer Chroma uses localhost:54235 directly (Chrome exempts localhost from mixed-content).

import { useEffect, useReducer } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LightPlatform = 'hue' | 'nanoleaf' | 'govee' | 'razer';
export type ReactionMode = 'off' | 'general' | 'paint';

export interface SmartLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number;   // 0-100
  color: [number, number, number]; // RGB 0-255
  roomId?: string;
  platform: LightPlatform;
  model?: string;       // Govee needs model for control
}

export interface SmartRoom {
  id: string;
  name: string;
  lightIds: string[];
  platform: LightPlatform;
}

export interface HueConfig    { accessToken: string; }
export interface NanoleafConfig { ip: string; port: number; token: string; }
export interface GoveeConfig  { apiKey: string; }
export interface PlatformConfigs {
  hue?: HueConfig;
  nanoleaf?: NanoleafConfig;
  govee?: GoveeConfig;
  razer?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

function hslToXy(h: number, s: number, l: number): { x: number; y: number } {
  const [r, g, b] = hslToRgb(h, s, l).map(v => v / 255);
  const toLinear = (c: number) => c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
  const Z = R * 0.000088 + G * 0.072310 + B * 0.986039;
  const sum = X + Y + Z || 1;
  return { x: X / sum, y: Y / sum };
}

// Music reaction: analyser data → color + brightness
function computeMusicColor(data: Uint8Array): { color: [number, number, number]; brightness: number } {
  let bass = 0, mid = 0, treble = 0;
  for (let i = 0; i < 8; i++) bass += data[i];
  for (let i = 8; i < 80; i++) mid += data[i];
  for (let i = 80; i < Math.min(200, data.length); i++) treble += data[i];
  bass = (bass / 8) / 255;
  mid = (mid / 72) / 255;
  treble = (treble / Math.max(1, Math.min(120, data.length - 80))) / 255;
  const r = Math.min(255, Math.round(bass * 255 + treble * 80));
  const g = Math.min(255, Math.round(mid * 200 + treble * 40));
  const b = Math.min(255, Math.round(treble * 255 + bass * 60));
  const brightness = Math.min(1, Math.max(0.08, bass * 0.75 + mid * 0.3 + treble * 0.2));
  return { color: [r, g, b], brightness };
}

// ─── Paint canvas color export ────────────────────────────────────────────────
// PaintPoolVisualizer calls setPaintColor() after each gl.readPixels sample.

export let lastPaintColor: [number, number, number] = [80, 0, 200];
export function setPaintColor(color: [number, number, number]) { lastPaintColor = color; }

// ─── Server proxy helper ──────────────────────────────────────────────────────
// Routes through /api/lights/proxy to bypass browser CORS on local devices.

async function lightProxy(
  targetUrl: string,
  method: string,
  body?: object,
  extraHeaders?: Record<string, string>
): Promise<any> {
  const params = new URLSearchParams({ url: targetUrl, method });
  if (extraHeaders?.['Govee-API-Key']) params.set('goveeKey', extraHeaders['Govee-API-Key']);
  if (extraHeaders?.['Authorization']) params.set('hueToken', extraHeaders['Authorization'].replace('Bearer ', ''));
  const res = await fetch(`/api/lights/proxy?${params}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ targetMethod: method, body }) : undefined,
  });
  return res.ok ? res.json().catch(() => null) : null;
}

// ─── Philips Hue (Remote API — cloud-based, works over internet) ──────────────

class HueAdapter {
  constructor(private cfg: HueConfig) {}

  private hdr() { return { Authorization: `Bearer ${this.cfg.accessToken}` }; }

  async getLights(): Promise<SmartLight[]> {
    const data = await lightProxy('https://api.meethue.com/route/v2/resource/light', 'GET', undefined, this.hdr());
    return (data?.data || []).map((l: any) => ({
      id: `hue:${l.id}`, name: l.metadata?.name || 'Hue Light',
      on: l.on?.on ?? false, brightness: Math.round(l.dimming?.brightness ?? 100),
      color: [255, 200, 100] as [number, number, number], platform: 'hue' as LightPlatform,
    }));
  }

  async getRooms(): Promise<SmartRoom[]> {
    const data = await lightProxy('https://api.meethue.com/route/v2/resource/room', 'GET', undefined, this.hdr());
    return (data?.data || []).map((r: any) => ({
      id: `hue:${r.id}`, name: r.metadata?.name || 'Room', platform: 'hue' as LightPlatform,
      lightIds: (r.children || []).filter((c: any) => c.rtype === 'light').map((c: any) => `hue:${c.rid}`),
    }));
  }

  async setState(rawId: string, on: boolean, brightness?: number, rgb?: [number, number, number]) {
    const id = rawId.replace('hue:', '');
    const body: any = { on: { on } };
    if (brightness !== undefined) body.dimming = { brightness };
    if (rgb) {
      const [h, s, l] = rgbToHsl(...rgb);
      body.color = { xy: hslToXy(h, s, l) };
    }
    await lightProxy(`https://api.meethue.com/route/v2/resource/light/${id}`, 'PUT', body, this.hdr());
  }
}

// ─── Nanoleaf (local REST API — works when server and device share LAN) ───────

class NanoleafAdapter {
  constructor(private cfg: NanoleafConfig) {}

  private base() { return `http://${this.cfg.ip}:${this.cfg.port}/api/v1/${this.cfg.token}`; }

  async getLight(): Promise<SmartLight | null> {
    const data = await lightProxy(this.base(), 'GET');
    if (!data) return null;
    return {
      id: 'nanoleaf:main', name: data.name || 'Nanoleaf', model: undefined,
      on: data.state?.on?.value ?? false, brightness: data.state?.brightness?.value ?? 100,
      color: [150, 100, 255], platform: 'nanoleaf',
    };
  }

  async setState(on: boolean, brightness?: number, hue?: number, sat?: number) {
    const body: any = { on: { value: on } };
    if (brightness !== undefined) body.brightness = { value: Math.round(brightness) };
    if (hue !== undefined) body.hue = { value: Math.round(hue) };
    if (sat !== undefined) body.sat = { value: Math.round(sat) };
    await lightProxy(`${this.base()}/state`, 'PUT', body);
  }

  async setRgb(rgb: [number, number, number], brightness: number) {
    const [h, s] = rgbToHsl(...rgb);
    await this.setState(true, Math.round(brightness * 100), Math.round(h * 360), Math.round(s * 100));
  }
}

// ─── Govee (cloud API) ────────────────────────────────────────────────────────

class GoveeAdapter {
  constructor(private cfg: GoveeConfig) {}

  async getDevices(): Promise<SmartLight[]> {
    const data = await lightProxy('https://developer-api.govee.com/v1/devices', 'GET', undefined, { 'Govee-API-Key': this.cfg.apiKey });
    return (data?.data?.devices || []).map((d: any) => ({
      id: `govee:${d.device}`, name: d.deviceName || 'Govee Light',
      on: true, brightness: 100, color: [255, 255, 255] as [number, number, number],
      platform: 'govee' as LightPlatform, model: d.model,
    }));
  }

  async setColor(device: string, model: string, rgb: [number, number, number], brightness: number) {
    const hdr = { 'Govee-API-Key': this.cfg.apiKey };
    await lightProxy('https://developer-api.govee.com/v1/devices/control', 'PUT',
      { device, model, cmd: { name: 'color', value: { r: rgb[0], g: rgb[1], b: rgb[2] } } }, hdr);
    await lightProxy('https://developer-api.govee.com/v1/devices/control', 'PUT',
      { device, model, cmd: { name: 'brightness', value: Math.round(brightness * 100) } }, hdr);
  }
}

// ─── Razer Chroma (localhost:54235 — requires Synapse 3 running) ──────────────

class RazerAdapter {
  private sessionUrl: string | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<boolean> {
    try {
      const r = await fetch('http://localhost:54235/razer/chromasdk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Plajah', description: 'Plajah Music Visualizer',
          author: { name: 'Plajah', contact: 'plajah.com' },
          device_supported: ['keyboard', 'mouse', 'headset', 'mousepad', 'chromalink'],
          category: 'application',
        }),
      });
      if (!r.ok) return false;
      const d = await r.json();
      this.sessionUrl = d.uri;
      this.heartbeat = setInterval(() => {
        if (this.sessionUrl) fetch(`${this.sessionUrl}/heartbeat`, { method: 'PUT' }).catch(() => {});
      }, 5000);
      return true;
    } catch { return false; }
  }

  async setColor(rgb: [number, number, number]) {
    if (!this.sessionUrl) return;
    // Razer uses BGR integer format
    const color = rgb[2] + rgb[1] * 256 + rgb[0] * 65536;
    const effect = { effect: 'CHROMA_STATIC', param: { color } };
    const devices = ['keyboard', 'mouse', 'mousepad', 'headset', 'chromalink'];
    await Promise.allSettled(devices.map(d =>
      fetch(`${this.sessionUrl}/${d}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(effect),
      }).catch(() => {})
    ));
  }

  disconnect() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.sessionUrl) {
      fetch(this.sessionUrl, { method: 'DELETE' }).catch(() => {});
      this.sessionUrl = null;
    }
  }
}

// ─── Smart Lighting Service (singleton) ───────────────────────────────────────

class SmartLightingServiceClass {
  configs: PlatformConfigs = {};
  lights: SmartLight[] = [];
  rooms: SmartRoom[] = [];
  reactionMode: ReactionMode = 'off';
  analyser: AnalyserNode | null = null;
  connected: Partial<Record<LightPlatform, boolean>> = {};

  private hue?: HueAdapter;
  private nanoleaf?: NanoleafAdapter;
  private govee?: GoveeAdapter;
  private razer?: RazerAdapter;
  private rafId?: number;
  private dataArray?: Uint8Array;
  private lastPush = 0;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private notify() { this.listeners.forEach(fn => fn()); }

  // ── Connect platforms ──────────────────────────────────────────────────────

  async connectHue(cfg: HueConfig) {
    this.configs.hue = cfg;
    this.hue = new HueAdapter(cfg);
    try {
      const [lights, rooms] = await Promise.all([this.hue.getLights(), this.hue.getRooms()]);
      this.lights = [...this.lights.filter(l => l.platform !== 'hue'), ...lights];
      this.rooms = [...this.rooms.filter(r => r.platform !== 'hue'), ...rooms];
      this.connected.hue = true;
    } catch { this.connected.hue = false; }
    this.notify();
  }

  async connectNanoleaf(cfg: NanoleafConfig) {
    this.configs.nanoleaf = cfg;
    this.nanoleaf = new NanoleafAdapter(cfg);
    try {
      const light = await this.nanoleaf.getLight();
      if (light) { this.lights = [...this.lights.filter(l => l.platform !== 'nanoleaf'), light]; }
      this.connected.nanoleaf = true;
    } catch { this.connected.nanoleaf = false; }
    this.notify();
  }

  async connectGovee(cfg: GoveeConfig) {
    this.configs.govee = cfg;
    this.govee = new GoveeAdapter(cfg);
    try {
      const lights = await this.govee.getDevices();
      this.lights = [...this.lights.filter(l => l.platform !== 'govee'), ...lights];
      this.connected.govee = true;
    } catch { this.connected.govee = false; }
    this.notify();
  }

  async connectRazer(): Promise<boolean> {
    this.razer = new RazerAdapter();
    const ok = await this.razer.connect();
    this.connected.razer = ok;
    if (ok) {
      this.lights = [...this.lights.filter(l => l.platform !== 'razer'), {
        id: 'razer:all', name: 'Razer Chroma (All Devices)',
        on: true, brightness: 100, color: [0, 255, 128], platform: 'razer',
      }];
    }
    this.notify();
    return ok;
  }

  // ── Reaction ───────────────────────────────────────────────────────────────

  setReactionMode(mode: ReactionMode, analyser?: AnalyserNode | null) {
    this.reactionMode = mode;
    if (analyser !== undefined) this.analyser = analyser;
    if (mode !== 'off') this.startReaction(); else this.stopReaction();
    this.notify();
  }

  private startReaction() {
    this.stopReaction();
    if (this.analyser) this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const now = Date.now();
      if (now - this.lastPush < 80) return; // ~12fps max for lights
      this.lastPush = now;
      let rgb: [number, number, number], brightness: number;
      if (this.reactionMode === 'paint') {
        rgb = [...lastPaintColor] as [number, number, number];
        brightness = 0.85;
      } else if (this.analyser && this.dataArray) {
        this.analyser.getByteFrequencyData(this.dataArray);
        ({ color: rgb, brightness } = computeMusicColor(this.dataArray));
      } else {
        const h = (Date.now() / 3000) % 1;
        rgb = hslToRgb(h, 0.8, 0.5);
        brightness = 0.6;
      }
      this.pushColor(rgb, brightness).catch(() => {});
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopReaction() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = undefined; }
  }

  private async pushColor(rgb: [number, number, number], brightness: number) {
    const tasks: Promise<any>[] = [];
    if (this.hue) {
      for (const l of this.lights.filter(l => l.platform === 'hue' && l.on))
        tasks.push(this.hue.setState(l.id, true, brightness * 100, rgb).catch(() => {}));
    }
    if (this.nanoleaf) tasks.push(this.nanoleaf.setRgb(rgb, brightness).catch(() => {}));
    if (this.razer)    tasks.push(this.razer.setColor(rgb).catch(() => {}));
    if (this.govee) {
      for (const l of this.lights.filter(l => l.platform === 'govee' && l.on && l.model))
        tasks.push(this.govee.setColor(l.id.replace('govee:', ''), l.model!, rgb, brightness).catch(() => {}));
    }
    await Promise.allSettled(tasks);
  }

  // ── Manual light control ───────────────────────────────────────────────────

  async setLightColor(id: string, rgb: [number, number, number], brightness: number) {
    const light = this.lights.find(l => l.id === id);
    if (!light) return;
    light.color = rgb; light.brightness = Math.round(brightness * 100);
    if (light.platform === 'hue' && this.hue) await this.hue.setState(id, true, brightness * 100, rgb);
    if (light.platform === 'nanoleaf' && this.nanoleaf) await this.nanoleaf.setRgb(rgb, brightness);
    if (light.platform === 'razer' && this.razer) await this.razer.setColor(rgb);
    if (light.platform === 'govee' && this.govee && light.model)
      await this.govee.setColor(id.replace('govee:', ''), light.model, rgb, brightness);
    this.notify();
  }

  async toggleLight(id: string, on: boolean) {
    const light = this.lights.find(l => l.id === id);
    if (!light) return;
    light.on = on;
    if (light.platform === 'hue' && this.hue) await this.hue.setState(id, on);
    if (light.platform === 'nanoleaf' && this.nanoleaf) await this.nanoleaf.setState(on);
    this.notify();
  }

  async setBrightness(id: string, brightness: number) {
    const light = this.lights.find(l => l.id === id);
    if (!light) return;
    light.brightness = brightness;
    if (light.platform === 'hue' && this.hue) await this.hue.setState(id, light.on, brightness);
    if (light.platform === 'nanoleaf' && this.nanoleaf) await this.nanoleaf.setState(light.on, brightness);
    this.notify();
  }

  async setRoomColor(roomId: string, rgb: [number, number, number], brightness: number) {
    const room = this.rooms.find(r => r.id === roomId);
    if (!room) return;
    await Promise.allSettled(room.lightIds.map(lid => this.setLightColor(lid, rgb, brightness)));
  }

  disconnectPlatform(platform: LightPlatform) {
    if (platform === 'razer') this.razer?.disconnect();
    (this as any)[platform] = undefined;
    this.connected[platform] = undefined;
    this.lights = this.lights.filter(l => l.platform !== platform);
    this.rooms  = this.rooms.filter(r => r.platform !== platform);
    this.notify();
  }

  destroy() {
    this.stopReaction();
    this.razer?.disconnect();
  }
}

export const smartLightingService = new SmartLightingServiceClass();

// ─── React hook ───────────────────────────────────────────────────────────────

export function useLightingService() {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => smartLightingService.subscribe(tick), []);
  return smartLightingService;
}
