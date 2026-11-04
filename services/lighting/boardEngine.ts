// The running board: clock, cue stack, programmer, submasters, DMX and smart-light output. One
// instance per app, so the lights keep running when the operator flips between Simple and Pro.

import { useEffect, useReducer } from 'react';
import { smartLightingService } from '../smartLightingService';
import { ldBridge } from '../ldBridge';
import type { DmxOutput } from './dmxOutput';
import { BUILTIN_PROFILES, hasAttr, type Attr, type FixtureProfile } from './fixtureProfiles';
import { lookFromPreset, type LookPreset } from './looks';
import { HOLIDAY_RUNS, type VenueSpec } from './venues';
import {
  SCENE_RECIPES, applyEffects, applyMaster, applySubmaster, autoPatch, addFixtures, colorLevels, emptyShow, fadeProgress,
  hexToRgb, lerpLook, overlay, parseCommand, profileOf, renderUniverses, syncSmartFixtures, uid, wash,
  type BoardShow, type Cue, type Effect, type EffectKind, type Look, type LevelMap, type PatchedFixture, type Scene,
} from './boardCore';

const STORE_KEY = 'plajah.lightboard.v1';
const TICK_MS = 25;
const SMART_PUSH_MS = 250;       // cloud-connected bulbs rate limit hard
const CLOUD_KIND = 'lightboard';
const CLOUD_ID = 'default';

/** Timers on a hidden page crawl to once a second; a worker's don't, and a show must keep running. */
function startClock(onTick: () => void): () => void {
  try {
    const src = `setInterval(()=>postMessage(0),${TICK_MS})`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    return () => { worker.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(onTick, TICK_MS);
    return () => clearInterval(id);
  }
}

class BoardEngine {
  show: BoardShow = emptyShow();

  grandMaster = 1;
  blackout = false;
  /** Audio-reactive colour and level from ldBridge, over everything but the programmer. */
  followMusic = false;

  /** Effects a preset look brought with it; replaced when the next look plays. */
  lookEffects: Effect[] = [];
  activeLookId: string | null = null;

  /** Current stage state before the programmer: where the last GO or scene tap landed. */
  private fadeFrom: Look = {};
  private fadeTo: Look = {};
  private fadeStart = 0;
  private fadeLength = 0;
  private followAt: number | null = null;

  activeCueId: string | null = null;
  activeSceneId: string | null = null;
  /** Submaster levels by scene id. */
  submasters: Record<string, number> = {};
  /** Scene ids held by a flash button. */
  flashes = new Set<string>();

  selection: string[] = [];
  programmer: Look = {};

  /** The final look that went out on the last tick, for tiles and meters. */
  liveLook: Look = {};
  universes = new Map<number, Uint8Array>();
  outputs: DmxOutput[] = [];
  commandMessage = '';

  private stopClock: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private lastNotify = 0;
  private lastSmartPush = 0;
  private smartSent = new Map<string, string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private epoch = performance.now();

  constructor() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.loadShow(JSON.parse(raw), false);
    } catch { /* first run, or storage blocked */ }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    if (!this.stopClock) this.stopClock = startClock(() => this.tick());
  }

  /** Clock keeps running with live DMX outputs, so leaving this screen never drops the rig. */
  release() {
    if (this.outputs.some((o) => o.status === 'live')) return;
    this.stopClock?.();
    this.stopClock = null;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private changed() {
    this.lastNotify = performance.now();
    this.listeners.forEach((fn) => fn());
  }

  /** Change to the show document: repaint and save. */
  private edit(next: BoardShow) {
    this.show = next;
    this.scheduleSave();
    this.changed();
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const json = JSON.stringify(this.show);
      try {
        localStorage.setItem(STORE_KEY, json);
        localStorage.setItem(`${STORE_KEY}.at`, String(Date.now()));
      } catch { /* full or blocked */ }
      void import('../creativeCloud/cloudStore')
        .then((m) => m.scheduleCreativeSync({ kind: CLOUD_KIND, localId: CLOUD_ID, title: this.show.name, json }))
        .catch(() => { /* signed out or offline: the local copy stands */ });
    }, 800);
  }

  /** Bring in a newer copy from another device, if there is one. Quiet when signed out. */
  async pullFromCloud() {
    try {
      const m = await import('../creativeCloud/cloudStore');
      const head = await m.getCloudHead(CLOUD_KIND, CLOUD_ID);
      const local = Number(localStorage.getItem(`${STORE_KEY}.at`) || 0);
      if (!m.isCloudNewer(head, local)) return;
      const copy = await m.loadCloudProject(CLOUD_KIND, CLOUD_ID);
      if (copy) this.loadShow(JSON.parse(copy.json), false);
    } catch { /* signed out or offline */ }
  }

  loadShow(raw: any, save = true) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.fixtures)) throw new Error('That is not a Plajah lighting show file.');
    const show = { ...emptyShow(), ...raw } as BoardShow;
    if (save) this.edit(show);
    else { this.show = show; this.changed(); }
  }

  // ── Clock ─────────────────────────────────────────────────────────────────

  private tick() {
    const now = performance.now();

    if (this.followAt != null && now >= this.followAt) {
      this.followAt = null;
      this.go();
    }

    const t = fadeProgress(now - this.fadeStart, this.fadeLength);
    let look = lerpLook(this.fadeFrom, this.fadeTo, t);

    for (const scene of this.show.scenes) {
      const level = this.flashes.has(scene.id) ? 1 : this.submasters[scene.id] ?? 0;
      if (level > 0) look = applySubmaster(look, scene.look, level);
    }

    const seconds = (now - this.epoch) / 1000;
    look = applyEffects(look, this.lookEffects, this.show.fixtures, this.show.customProfiles, seconds);
    look = applyEffects(look, this.show.effects, this.show.fixtures, this.show.customProfiles, seconds);
    if (this.followMusic) look = this.applyMusic(look);
    look = overlay(look, this.programmer);
    look = applyMaster(look, this.show.fixtures, this.show.customProfiles, this.grandMaster, this.blackout);

    this.liveLook = look;
    renderUniverses(look, this.show.fixtures, this.show.customProfiles, this.universes);

    for (const output of this.outputs) {
      const data = this.universes.get(output.config.universe);
      if (data) output.send(data);
    }
    if (now - this.lastSmartPush >= SMART_PUSH_MS) {
      this.lastSmartPush = now;
      this.pushSmart(look);
    }
    // Faders and tiles repaint at ~10 Hz; the DMX itself runs at the full clock.
    if (now - this.lastNotify > 100) this.changed();
  }

  private applyMusic(base: Look): Look {
    const state = ldBridge.state.fixtureStates.get('*');
    if (!state) return base;
    const [r, g, b] = ldBridge.getCurrentColorRGB();
    const out: Look = { ...base };
    for (const f of this.show.fixtures) {
      const profile = profileOf(f, this.show.customProfiles);
      if (profile.category === 'fog') continue;
      const entry: LevelMap = { ...(out[f.id] ?? {}), ...colorLevels(profile, { r: r / 255, g: g / 255, b: b / 255 }) };
      if (hasAttr(profile, 'dimmer')) entry.dimmer = state.intensity;
      else for (const a of ['red', 'green', 'blue', 'white'] as Attr[]) if (entry[a] != null) entry[a] = entry[a]! * state.intensity;
      out[f.id] = entry;
    }
    return out;
  }

  private pushSmart(look: Look) {
    // While following music ldBridge already drives the bulbs directly.
    if (this.followMusic) return;
    for (const f of this.show.fixtures) {
      if (!f.smartId) continue;
      const l = look[f.id];
      if (!l) continue;
      const dim = l.dimmer ?? 0;
      const rgb: [number, number, number] = [Math.round((l.red ?? 1) * 255), Math.round((l.green ?? 1) * 255), Math.round((l.blue ?? 1) * 255)];
      const key = `${rgb.join()}|${Math.round(dim * 100)}`;
      if (this.smartSent.get(f.smartId) === key) continue;
      this.smartSent.set(f.smartId, key);
      const light = smartLightingService.lights.find((x) => x.id === f.smartId);
      if (!light) continue;
      if (dim <= 0) {
        if (light.on) void smartLightingService.toggleLight(f.smartId, false).catch(() => {});
      } else {
        if (!light.on) void smartLightingService.toggleLight(f.smartId, true).catch(() => {});
        void smartLightingService.setLightColor(f.smartId, rgb, dim).catch(() => {});
      }
    }
  }

  // ── Stage ─────────────────────────────────────────────────────────────────

  /** What's on stage right now before the programmer, frozen, so a new fade starts from it. */
  private frozenStage(): Look {
    return lerpLook(this.fadeFrom, this.fadeTo, fadeProgress(performance.now() - this.fadeStart, this.fadeLength));
  }

  fadeToLook(look: Look, seconds: number) {
    this.fadeFrom = this.frozenStage();
    this.fadeTo = look;
    this.fadeStart = performance.now();
    this.fadeLength = Math.max(0, seconds) * 1000;
    this.changed();
  }

  setGrandMaster(v: number) { this.grandMaster = v; this.changed(); }
  setBlackout(on: boolean) { this.blackout = on; this.changed(); }

  setFollowMusic(on: boolean) {
    this.followMusic = on;
    this.changed();
  }

  /** Simple tile: rebuild the recipe against the rig as it stands today. */
  playRecipe(id: string) {
    const recipe = SCENE_RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    this.blackout = false;
    this.followMusic = false;
    this.activeSceneId = id;
    this.activeLookId = null;
    this.activeCueId = null;
    this.lookEffects = [];
    this.programmer = {};
    this.fadeToLook(wash(this.show.fixtures, this.show.customProfiles, recipe.pick, recipe.level ?? 1), recipe.fade);
  }

  /** A preset from the looks gallery, baked against the rig as it stands. */
  playLook(preset: LookPreset) {
    const { look, effects } = lookFromPreset(preset, this.show.fixtures, this.show.customProfiles);
    this.blackout = false;
    this.followMusic = false;
    this.activeLookId = preset.id;
    this.activeSceneId = null;
    this.activeCueId = null;
    this.programmer = {};
    this.lookEffects = effects;
    this.fadeToLook(look, preset.fade);
  }

  playScene(scene: Scene) {
    this.blackout = false;
    this.followMusic = false;
    this.activeSceneId = scene.id;
    this.activeCueId = null;
    this.fadeToLook(scene.look, scene.fade);
  }

  /** One light from the Simple list: goes straight through the programmer so it sticks over scenes. */
  setFixtureLevels(id: string, levels: LevelMap) {
    this.programmer = { ...this.programmer, [id]: { ...(this.programmer[id] ?? {}), ...levels } };
    this.changed();
  }

  /** Simple's tap on a light: dark if it's lit, back to the scene if it was tapped dark. */
  toggleFixture(id: string) {
    if (this.programmer[id]) {
      const { [id]: _gone, ...rest } = this.programmer;
      this.programmer = rest;
    } else {
      this.programmer = { ...this.programmer, [id]: { dimmer: 0, red: 0, green: 0, blue: 0, white: 0, amber: 0, uv: 0 } };
    }
    this.changed();
  }

  /** Full white on one unit, to find it in the rig and prove its address. Tap again to release. */
  identify(id: string) {
    if (this.programmer[id]?.dimmer === 1 && this.programmer[id]?.white === 1) {
      const { [id]: _gone, ...rest } = this.programmer;
      this.programmer = rest;
    } else {
      this.programmer = { ...this.programmer, [id]: { dimmer: 1, red: 1, green: 1, blue: 1, white: 1, amber: 0, uv: 0 } };
    }
    this.changed();
  }

  // ── Programmer ────────────────────────────────────────────────────────────

  setSelection(ids: string[]) { this.selection = ids; this.changed(); }

  toggleSelected(id: string) {
    this.setSelection(this.selection.includes(id) ? this.selection.filter((x) => x !== id) : [...this.selection, id]);
  }

  /** Write an attribute into the programmer for everything selected that actually has it. */
  setAttr(attr: Attr, value: number) {
    const next = { ...this.programmer };
    for (const id of this.selection) {
      const f = this.show.fixtures.find((x) => x.id === id);
      if (!f || !hasAttr(profileOf(f, this.show.customProfiles), attr)) continue;
      next[id] = { ...(next[id] ?? {}), [attr]: value };
    }
    this.programmer = next;
    this.changed();
  }

  setColor(hex: string) {
    const rgb = hexToRgb(hex);
    const next = { ...this.programmer };
    for (const id of this.selection) {
      const f = this.show.fixtures.find((x) => x.id === id);
      if (!f) continue;
      const profile = profileOf(f, this.show.customProfiles);
      next[id] = { ...(next[id] ?? {}), ...colorLevels(profile, rgb) };
    }
    this.programmer = next;
    this.changed();
  }

  /** Level for selected fixtures, faking a dimmer with the colour mix on fixtures that have none. */
  setLevel(value: number) {
    const next = { ...this.programmer };
    for (const id of this.selection) {
      const f = this.show.fixtures.find((x) => x.id === id);
      if (!f) continue;
      const profile = profileOf(f, this.show.customProfiles);
      if (hasAttr(profile, 'dimmer')) next[id] = { ...(next[id] ?? {}), dimmer: value };
      else if (hasAttr(profile, 'red')) {
        const current = next[id] ?? this.liveLook[id] ?? {};
        const peak = Math.max(current.red ?? 0, current.green ?? 0, current.blue ?? 0, current.white ?? 0);
        const entry: LevelMap = peak > 0
          ? Object.fromEntries((['red', 'green', 'blue', 'white', 'amber', 'uv'] as Attr[]).filter((a) => current[a] != null).map((a) => [a, (current[a]! / peak) * value]))
          : { red: value, green: value, blue: value };
        next[id] = { ...(next[id] ?? {}), ...entry };
      }
    }
    this.programmer = next;
    this.changed();
  }

  clearProgrammer() {
    this.programmer = {};
    this.selection = [];
    this.changed();
  }

  /** Runs the command line and leaves a status message for it. Returns true when it worked. */
  runCommand(text: string): boolean {
    const cmd = parseCommand(text);
    const say = (m: string) => { this.commandMessage = m; this.changed(); };
    switch (cmd.kind) {
      case 'error': say(cmd.message); return false;
      case 'clear': this.clearProgrammer(); say('Programmer cleared'); return true;
      case 'go': this.go(); say('GO'); return true;
      case 'record': this.recordCue(cmd.number); say('Recorded'); return true;
      case 'select': {
        const fids = new Set(cmd.fids);
        const ids = this.show.fixtures.filter((f) => fids.has(f.fid)).map((f) => f.id);
        if (!ids.length) { say(`No fixture numbered ${cmd.fids.join(', ')}`); return false; }
        this.selection = ids;
        if (cmd.level != null) this.setLevel(cmd.level);
        say(`${ids.length} selected${cmd.level != null ? ` at ${Math.round(cmd.level * 100)}%` : ''}`);
        return true;
      }
    }
  }

  // ── Cues ──────────────────────────────────────────────────────────────────

  /** Stage + programmer as one look, for recording. */
  private snapshot(): Look {
    return overlay(this.frozenStage(), this.programmer);
  }

  recordCue(number?: number) {
    const cues = this.show.cues;
    const n = number ?? (cues.length ? Math.floor(Math.max(...cues.map((c) => c.number))) + 1 : 1);
    const look = this.snapshot();
    const existing = cues.find((c) => c.number === n);
    const next = existing
      ? cues.map((c) => (c.id === existing.id ? { ...c, look } : c))
      : [...cues, { id: uid('cue'), number: n, label: `Cue ${n}`, look, fade: 3, follow: null } as Cue].sort((a, b) => a.number - b.number);
    this.programmer = {};
    this.selection = [];
    const landed = existing?.id ?? next.find((c) => c.number === n)!.id;
    this.fadeFrom = look; this.fadeTo = look; this.fadeLength = 0;
    this.activeCueId = landed;
    this.edit({ ...this.show, cues: next });
  }

  updateCue(id: string, patch: Partial<Cue>) {
    const cues = this.show.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort((a, b) => a.number - b.number);
    this.edit({ ...this.show, cues });
  }

  deleteCue(id: string) {
    if (this.activeCueId === id) this.activeCueId = null;
    this.edit({ ...this.show, cues: this.show.cues.filter((c) => c.id !== id) });
  }

  private runCue(cue: Cue, fade = cue.fade) {
    this.activeCueId = cue.id;
    this.activeSceneId = null;
    this.blackout = false;
    this.fadeToLook(cue.look, fade);
    this.followAt = cue.follow != null ? performance.now() + (Math.max(0, fade) + cue.follow) * 1000 : null;
  }

  go() {
    const cues = this.show.cues;
    if (!cues.length) return;
    const at = cues.findIndex((c) => c.id === this.activeCueId);
    const next = cues[at + 1];
    if (next) this.runCue(next);
    else this.followAt = null;
  }

  back() {
    const cues = this.show.cues;
    const at = cues.findIndex((c) => c.id === this.activeCueId);
    this.followAt = null;
    if (at > 0) this.runCue(cues[at - 1], 1);
  }

  gotoCue(id: string) {
    const cue = this.show.cues.find((c) => c.id === id);
    if (cue) this.runCue(cue);
  }

  // ── Scenes as submasters ──────────────────────────────────────────────────

  recordScene(name: string, color: string) {
    const scene: Scene = { id: uid('scn'), name: name.trim() || `Scene ${this.show.scenes.length + 1}`, color, look: this.snapshot(), fade: 2 };
    this.programmer = {};
    this.selection = [];
    this.edit({ ...this.show, scenes: [...this.show.scenes, scene] });
    return scene;
  }

  renameScene(id: string, name: string) {
    this.edit({ ...this.show, scenes: this.show.scenes.map((s) => (s.id === id ? { ...s, name } : s)) });
  }

  deleteScene(id: string) {
    const { [id]: _gone, ...rest } = this.submasters;
    this.submasters = rest;
    this.edit({ ...this.show, scenes: this.show.scenes.filter((s) => s.id !== id) });
  }

  setSubmaster(id: string, level: number) {
    this.submasters = { ...this.submasters, [id]: level };
    this.changed();
  }

  setFlash(id: string, held: boolean) {
    if (held) this.flashes.add(id); else this.flashes.delete(id);
    this.changed();
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  addEffect(kind: EffectKind) {
    const effect: Effect = { id: uid('fx'), kind, fixtureIds: [...this.selection], rate: 60, size: 1, spread: 1, on: true, palette: kind === 'colorwave' ? ['#0a58ff', '#18d0e0', '#a020ff'] : undefined };
    this.edit({ ...this.show, effects: [...this.show.effects, effect] });
  }
  updateEffect(id: string, patch: Partial<Effect>) {
    this.edit({ ...this.show, effects: this.show.effects.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }
  deleteEffect(id: string) {
    this.edit({ ...this.show, effects: this.show.effects.filter((e) => e.id !== id) });
  }

  // ── Patch ─────────────────────────────────────────────────────────────────

  allProfiles(): FixtureProfile[] { return [...BUILTIN_PROFILES, ...this.show.customProfiles]; }

  addFixtures(profile: FixtureProfile, count: number, name?: string, universe = 1) {
    const customProfiles = BUILTIN_PROFILES.some((p) => p.id === profile.id) || this.show.customProfiles.some((p) => p.id === profile.id)
      ? this.show.customProfiles
      : [...this.show.customProfiles, profile];
    this.edit(addFixtures({ ...this.show, customProfiles }, profile, count, name, universe));
  }

  addProfiles(profiles: FixtureProfile[]) {
    const seen = new Set(this.show.customProfiles.map((p) => p.id));
    this.edit({ ...this.show, customProfiles: [...this.show.customProfiles, ...profiles.filter((p) => !seen.has(p.id))] });
  }

  autoPatch() { this.edit(autoPatch(this.show)); }

  /** Patch a venue's suggested rig, skipping nothing already there. */
  loadVenueRig(venue: VenueSpec) {
    let show = this.show;
    for (const r of venue.rig) {
      const profile = this.allProfiles().find((p) => p.id === r.profileId);
      if (profile) show = addFixtures(show, profile, r.count, r.name);
    }
    this.edit(show);
  }

  /** Turn a Christmas run on or off, adding the fixture that drives it the first time. */
  setHolidayRun(id: string, patch: { on?: boolean; bulb?: 'c9' | 'mini' | 'pixel'; pattern?: 'steady' | 'twinkle' | 'chase' }) {
    const def = HOLIDAY_RUNS.find((r) => r.id === id);
    if (!def) return;
    const holiday = { ...(this.show.holiday ?? {}), [id]: { on: false, ...(this.show.holiday?.[id] ?? {}), ...patch } };
    let show: BoardShow = { ...this.show, holiday };
    if (holiday[id].on && !show.fixtures.some((f) => f.run === id)) {
      const profile = BUILTIN_PROFILES.find((p) => p.id === 'string-rgb-3')!;
      show = addFixtures(show, profile, 1, def.name);
      const added = show.fixtures[show.fixtures.length - 1];
      show = { ...show, fixtures: show.fixtures.map((f) => (f.id === added.id ? { ...f, name: def.name, run: id } : f)) };
    }
    this.edit(show);
  }

  updateFixture(id: string, patch: Partial<PatchedFixture>) {
    this.edit({ ...this.show, fixtures: this.show.fixtures.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  }

  removeFixture(id: string) {
    const { [id]: _gone, ...programmer } = this.programmer;
    this.programmer = programmer;
    this.selection = this.selection.filter((x) => x !== id);
    this.edit({
      ...this.show,
      fixtures: this.show.fixtures.filter((f) => f.id !== id),
      effects: this.show.effects.map((e) => ({ ...e, fixtureIds: e.fixtureIds.filter((x) => x !== id) })),
      groups: this.show.groups.map((g) => ({ ...g, fixtureIds: g.fixtureIds.filter((x) => x !== id) })),
    });
  }

  addGroup(name: string) {
    if (!this.selection.length) return;
    this.edit({ ...this.show, groups: [...this.show.groups, { id: uid('grp'), name: name.trim() || `Group ${this.show.groups.length + 1}`, fixtureIds: [...this.selection] }] });
  }
  deleteGroup(id: string) {
    this.edit({ ...this.show, groups: this.show.groups.filter((g) => g.id !== id) });
  }

  syncSmartLights() {
    const next = syncSmartFixtures(this.show, smartLightingService.lights);
    if (next !== this.show) this.edit(next);
  }

  // ── Outputs ───────────────────────────────────────────────────────────────

  addOutput(output: DmxOutput) {
    this.outputs = [...this.outputs, output];
    this.start();
    this.changed();
  }
  removeOutput(id: string) {
    this.outputs.find((o) => o.config.id === id)?.close();
    this.outputs = this.outputs.filter((o) => o.config.id !== id);
    this.changed();
  }
}

export const boardEngine = new BoardEngine();

export function useBoard() {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => boardEngine.subscribe(tick), []);
  return boardEngine;
}
