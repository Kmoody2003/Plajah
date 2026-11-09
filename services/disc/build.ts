// Assemble the authoring package: BDMV navigation (index, movie objects, playlists), the IG menu
// streams, PGS subtitle streams, encode plan and the destination manifest. Graphics come in
// already rasterised (menuRaster in the browser; tests pass synthetic bitmaps).
import { writeIndex, writeMovieObjects, writeMpls } from './bdmv';
import { buildManifest, manifestText } from './destination';
import { planEncodes } from './encode';
import { buildIg, type IgButtonIn, type Rgba } from './ig';
import { compile } from './navigation';
import { buildSup, type Cue } from './pgs';
import type { DiscProject, DiscTitle } from './project';
import { GRAPHICS_PLANE } from './spec';
import { validate, summarize } from './validate';

export interface ButtonArt { normal: Rgba; selected: Rgba; activated: Rgba }
export interface Raster {
  /** Bitmaps for every button, by MenuButton.id. */
  buttons: (menuId: string, buttonId: string) => ButtonArt;
  /** Pop-up panel art (decor flattened), by menu id. */
  panel?: (menuId: string) => { x: number; y: number; img: Rgba } | undefined;
  /** Subtitle cues rendered to bitmaps, by title + track index. */
  cues?: (title: DiscTitle, trackIndex: number) => Cue[];
  /** The menu's static Tela art as a PNG, baked into its background clip. */
  menuArtPng?: (menuId: string) => Promise<Uint8Array | undefined>;
  /** Each motion layer's Tela art as a PNG, in recipe order. */
  motionPngs?: (menuId: string) => Promise<Uint8Array[]>;
}

export interface DiscPackage { files: Map<string, Uint8Array>; encodeJobs: ReturnType<typeof planEncodes>; ready: boolean; errors: number; warnings: number }

const enc = new TextEncoder();
const pl5 = (n: number) => String(n).padStart(5, '0');

export function buildPackage(p: DiscProject, raster: Raster, opts: { workDir: string; inputFor: (t: DiscTitle) => string }): DiscPackage {
  const issues = validate(p);
  const sum = summarize(issues);
  const c = compile(p);
  const files = new Map<string, Uint8Array>();
  files.set('BDMV/index.bdmv', writeIndex(c.index));
  files.set('BDMV/MovieObject.bdmv', writeMovieObjects(p.format, c.objects.map(o => o.obj)));
  for (const pl of c.playlists) files.set(`BDMV/PLAYLIST/${pl5(pl.id)}.mpls`, writeMpls(pl.pl));
  // Backup copies, as the spec requires.
  for (const [k, v] of [...files]) files.set(k.replace('BDMV/', 'BDMV/BACKUP/'), v);

  // Menus → IG streams (muxed into the menu clip, or into each feature clip for the pop-up).
  for (const cm of c.menus) {
    const menu = p.menus.find(m => m.id === cm.menuId)!;
    const btns: IgButtonIn[] = cm.buttons.map(b => {
      const src = menu.buttons.find(x => x.id === b.ref)!;
      const art = raster.buttons(menu.id, b.ref);
      return { id: b.id, x: src.x, y: src.y, ...art, nav: b.nav, commands: b.commands, autoAction: b.autoAction };
    });
    const ig = buildIg({ video: { ...GRAPHICS_PLANE, fps: p.video.fps }, popup: cm.popup, pages: [{ id: 0, buttons: btns, defaultButton: cm.defaultButton, panel: cm.popup ? raster.panel?.(menu.id) : undefined }] });
    files.set(`WORK/ig/${cm.popup ? 'popup' : pl5(cm.playlistId)}.ig`, ig.stream);
  }
  // Subtitles → .sup per title/track.
  p.titles.forEach((t, i) => t.subtitles.forEach((s, k) => {
    const cues = raster.cues?.(t, k) || [];
    if (cues.length) files.set(`WORK/pgs/${pl5(i + 1)}_${k}_${s.lang}.sup`, buildSup(cues, p.format === 'UHD' ? { ...GRAPHICS_PLANE, fps: p.video.fps } : { w: p.video.w, h: p.video.h, fps: p.video.fps }));
  }));
  const manifest = buildManifest(p);
  files.set('WORK/manifest.json', enc.encode(JSON.stringify(manifest, null, 2)));
  files.set(`WORK/${manifest.kind === 'press' ? 'PRESS_PACKAGE' : 'BURN_JOB_SHEET'}.txt`, enc.encode(manifestText(manifest)));
  files.set('WORK/compliance.json', enc.encode(JSON.stringify(issues, null, 2)));
  files.set('WORK/navigation.txt', enc.encode(c.objects.map((o, i) => `#${i} ${o.name}`).join('\n')));
  files.set('WORK/project.json', enc.encode(JSON.stringify(p, null, 2)));
  return { files, encodeJobs: planEncodes(p, opts.inputFor, `${opts.workDir}/WORK/es`), ready: sum.ready, errors: sum.errors, warnings: sum.warnings };
}
