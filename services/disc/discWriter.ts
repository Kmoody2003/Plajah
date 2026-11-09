// Make the disc on the desktop: encode → menu clips → mux every clip → navigation with real clip
// lengths → UDF 2.50 ISO → burn (+ verify). Runs in the Plajah desktop app: ffmpeg and IMAPI2 are
// native; muxing streams files through local-media fetch and native append.
import { writeIndex, writeMovieObjects, writeMpls } from './bdmv';
import { buildPackage, type Raster } from './build';
import { muxClip, type ClipIO } from './clipMux';
import { menuBackgroundArgs, planEncodes, type MenuOverlay } from './encode';
import { compile, MENU_PL_BASE } from './navigation';
import type { DiscProject } from './project';
import { effectiveRates, mediumById } from './spec';

export type StepId = 'encode' | 'menus' | 'mux' | 'navigation' | 'image' | 'burn';
export interface StepUpdate { step: StepId; label: string; progress: number; detail?: string }
export interface Native {
  invoke: <T = any>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  runFfmpeg: (args: string[], outputPath: string, durationSec: number, onProgress: (p: number) => void) => Promise<void>;
  readUrl: (path: string) => string;
}
export interface MakeDiscOpts { io?: ClipIO; root: string; until: 'folder' | 'iso' | 'burn'; recorderId?: string; verify?: boolean; raster: Raster; onStep: (s: StepUpdate) => void; signal?: AbortSignal }

const pad5 = (n: number) => String(n).padStart(5, '0');
const win = (p: string) => p.replace(/\//g, '\\');

export function desktopIO(n: Native): ClipIO {
  return {
    async *read(path) {
      const res = await fetch(n.readUrl(path));
      if (!res.ok || !res.body) throw new Error(`Could not read ${path}`);
      const reader = res.body.getReader();
      for (;;) { const { done, value } = await reader.read(); if (done) return; if (value) yield value; }
    },
    async create(path) {
      const r = await n.invoke('crossover_write_text', { path: win(path), text: '' });
      if (!r?.success) throw new Error(r?.error || `Could not create ${path}`);
      const target = r.path || win(path);
      return async (b: Uint8Array) => {
        for (let o = 0; o < b.length; o += 3 << 20) {
          const c = b.subarray(o, o + (3 << 20)); let s = '';
          for (let i = 0; i < c.length; i += 0x8000) s += String.fromCharCode(...c.subarray(i, i + 0x8000));
          const w = await n.invoke('crossover_append_base64', { path: target, data: btoa(s) });
          if (!w?.success) throw new Error(w?.error || `Write failed: ${path}`);
        }
      };
    },
    async writeFile(path, bytes) { const a = await this.create(path); await a(bytes); },
  };
}

export async function makeDisc(p: DiscProject, n: Native, o: MakeDiscOpts) {
  const io = o.io || desktopIO(n);
  const step = o.onStep;
  const root = win(o.root), DISC = `${root}\\DISC`, WORK = `${root}\\WORK`, ES = `${WORK}\\es`;
  const m = mediumById(p.mediumId)!;
  const rate = effectiveRates(p.format, m).systemMbps * 1e6;
  const pkg = buildPackage(p, o.raster, { workDir: root, inputFor: t => t.source.path || t.source.url || '' });
  const missing = p.titles.filter(t => !t.source.path && !t.source.url);
  if (missing.length) throw new Error(`Point these titles at a file or rendered cut first: ${missing.map(t => t.name).join(', ')}`);
  const abort = () => { if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };

  // 1 · Encode
  const jobs = planEncodes(p, t => t.source.path || t.source.url!, ES);
  for (let i = 0; i < jobs.length; i++) {
    abort();
    const j = jobs[i], dur = p.titles.find(t => t.id === j.titleId)?.source.durationSec || 0;
    await n.runFfmpeg(j.args, j.output, dur, f => step({ step: 'encode', label: j.label, progress: (i + f) / jobs.length, detail: `${i + 1} of ${jobs.length}` }));
  }
  // 2 · Menu background clips
  const comp = compile(p);
  const menuPls = comp.playlists.filter(x => x.kind === 'MENU');
  for (let i = 0; i < menuPls.length; i++) {
    abort();
    const menu = p.menus.find(mm => mm.id === menuPls[i].refId)!;
    const src = menu.background.titleId ? p.titles.find(t => t.id === menu.background.titleId) : undefined;
    const out = `${ES}\\${pad5(menuPls[i].id)}_v.ts`;
    const overlay: MenuOverlay = { flicker: menu.motion?.flicker, grain: menu.motion?.grain };
    const artPng = await o.raster.menuArtPng?.(menu.id);
    if (artPng) { overlay.artPng = `${WORK}\\menus\\${pad5(menuPls[i].id)}_art.png`; await io.writeFile(overlay.artPng, artPng); }
    const layerPngs = menu.motion?.layers.length ? (await o.raster.motionPngs?.(menu.id)) || [] : [];
    overlay.layers = [];
    for (let k = 0; k < layerPngs.length; k++) {
      const l = menu.motion!.layers[k], path = `${WORK}\\menus\\${pad5(menuPls[i].id)}_m${k}.png`;
      await io.writeFile(path, layerPngs[k]);
      overlay.layers.push({ png: path, w: l.w, h: l.h, from: l.from, to: l.to, periodSec: l.periodSec, ease: l.ease, opacity: l.opacity });
    }
    await n.runFfmpeg(menuBackgroundArgs(p, menu.background, src?.source.path || src?.source.url, out, overlay), out, menu.background.loopSec || 1, f => step({ step: 'menus', label: `Menu: ${menu.name}`, progress: (i + f) / menuPls.length }));
  }
  // 3 · Mux every clip
  const lengths = new Map<number, number>();
  const clips = comp.playlists;
  const vinfo = { codec: p.video.codec, h: p.video.h, scan: p.video.scan, fps: p.video.fps, dynamic: p.video.dynamic };
  const ig = (key: string) => pkg.files.get(`WORK/ig/${key}.ig`);
  for (let i = 0; i < clips.length; i++) {
    abort();
    const c = clips[i], n5 = pad5(c.id);
    step({ step: 'mux', label: `Muxing clip ${n5}`, progress: i / clips.length });
    const t = c.kind !== 'MENU' ? p.titles.find(x => x.id === c.refId) : undefined;
    const popupIg = t && (t.kind === 'FEATURE' || t.kind === 'EPISODE') && p.popupMenuId ? ig('popup') : undefined;
    const res = await muxClip({
      format: p.format, muxRateBps: rate,
      video: { path: `${ES}\\${n5}_v.ts`, ...vinfo },
      audio: (t?.audio || []).map((a, k) => ({ path: `${ES}\\${n5}_a${k}.ts`, codec: a.codec, channels: a.channels, lang: a.lang })),
      pg: t ? t.subtitles.map((s, k) => ({ sup: pkg.files.get(`WORK/pgs/${n5}_${k}_${s.lang}.sup`)!, lang: s.lang })).filter(x => x.sup) : [],
      ig: c.kind === 'MENU' ? (ig(n5) ? { stream: ig(n5)!, lang: 'eng' } : undefined) : popupIg ? { stream: popupIg, lang: 'eng' } : undefined,
      m2tsPath: `${DISC}\\BDMV\\STREAM\\${n5}.m2ts`, clpiPath: `${DISC}\\BDMV\\CLIPINF\\${n5}.clpi`, clpiBackupPath: `${DISC}\\BDMV\\BACKUP\\CLIPINF\\${n5}.clpi`,
    }, io);
    if (res.underruns) step({ step: 'mux', label: `Clip ${n5}: ${res.underruns} late packets — lower the bitrate`, progress: (i + 1) / clips.length });
    lengths.set(c.id, (res.endPts - res.startPts) / 90000);
  }
  // 4 · Navigation with the real clip lengths
  step({ step: 'navigation', label: 'Writing disc navigation', progress: 0 });
  const nav: [string, Uint8Array][] = [['index.bdmv', writeIndex(comp.index)], ['MovieObject.bdmv', writeMovieObjects(p.format, comp.objects.map(x => x.obj))]];
  for (const c of clips) {
    const len = lengths.get(c.id) ?? c.pl.items[0].outSec;
    nav.push([`PLAYLIST\\${pad5(c.id)}.mpls`, writeMpls({ ...c.pl, items: c.pl.items.map(it => ({ ...it, inSec: 0, outSec: len, still: c.id >= MENU_PL_BASE && len <= 1.5 ? 'infinite' : it.still })) })]);
  }
  for (const [rel, b] of nav) { await io.writeFile(`${DISC}\\BDMV\\${rel}`, b); await io.writeFile(`${DISC}\\BDMV\\BACKUP\\${rel}`, b); }
  for (const [k, v] of pkg.files) if (k.startsWith('WORK/') && !k.startsWith('WORK/ig/') && !k.startsWith('WORK/pgs/')) await io.writeFile(`${root}\\${win(k)}`, v);
  step({ step: 'navigation', label: 'Disc folder ready', progress: 1, detail: DISC });
  if (o.until === 'folder') return { folder: DISC };

  // 5 · ISO
  const iso = `${root}\\${p.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'DISC'}.iso`;
  const volume = p.name.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 32) || 'PLAJAH_DISC';
  step({ step: 'image', label: 'Building UDF 2.50 image', progress: 0 });
  const poll = setInterval(async () => { const s = await n.invoke('disc_status'); if (s?.phase === 'imaging') step({ step: 'image', label: 'Building UDF 2.50 image', progress: s.progress || 0 }); }, 1000);
  const r = await n.invoke('disc_make_iso', { folder: DISC, isoPath: iso, volumeName: volume, capacityBytes: m.bytes }).finally(() => clearInterval(poll));
  if (!r?.success) throw new Error(r?.error || 'Image failed');
  step({ step: 'image', label: 'Image ready', progress: 1, detail: iso });
  if (o.until === 'iso') return { folder: DISC, iso };

  // 6 · Burn
  if (!o.recorderId) throw new Error('Choose a Blu-ray burner.');
  step({ step: 'burn', label: 'Burning', progress: -1 });
  const poll2 = setInterval(async () => { const s = await n.invoke('disc_status'); if (s?.phase) step({ step: 'burn', label: s.phase === 'verifying' ? 'Verifying' : 'Burning', progress: s.progress ?? -1 }); }, 1500);
  const b = await n.invoke('disc_burn', { recorderId: o.recorderId, source: DISC, volumeName: volume, verify: o.verify !== false }).finally(() => clearInterval(poll2));
  if (!b?.success) throw new Error(b?.error || 'Burn failed');
  step({ step: 'burn', label: b.verified ? 'Burned and verified' : 'Burned', progress: 1 });
  return { folder: DISC, iso, burned: true };
}
