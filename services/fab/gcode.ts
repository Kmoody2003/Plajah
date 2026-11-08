// Post-processors: neutral toolpaths (cam.ts) to each controller's G-code dialect. G-code itself is
// the public RS-274 / ISO 6983 language; each dialect differs in start-up, on/off and comments.

import type { Job, Move } from './cam';
import type { Dialect } from './machines';

export interface PostOptions { dialect: Dialect; name?: string; nozzleTemp?: number; bedTemp?: number; coolant?: boolean; programNumber?: number; laserMax?: number; units?: 'mm' }

const num = (v: number, d = 3) => { const s = v.toFixed(d).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };

export function post(job: Job, o: PostOptions): string {
  const L: string[] = []; const d = o.dialect; const name = (o.name ?? 'plajah').replace(/[()]/g, '');
  const iso = d === 'iso' || d === 'lathe-iso' || d === 'linuxcnc' || d === 'plasma';
  const c = (t: string) => (iso ? `(${t.replace(/[()]/g, '')})` : `; ${t}`);
  const fdm = job.kind === 'fdm'; const lathe = d === 'lathe-iso'; const laser = d === 'grbl-laser';
  // Header.
  if (d === 'iso' || d === 'lathe-iso') L.push('%', `O${String(o.programNumber ?? 1001).padStart(4, '0')} (${name.toUpperCase().slice(0, 20)})`);
  L.push(c(`${name} — Plajah Build, ${job.process}`), c(`Estimated ${Math.round(job.stats.seconds / 60)} min, cut ${Math.round(job.stats.cutLength)} mm`));
  if (fdm) {
    const nt = o.nozzleTemp ?? 210, bt = o.bedTemp ?? 60;
    if (d === 'klipper') L.push(`PRINT_START EXTRUDER=${nt} BED=${bt}`, c('If your config has no PRINT_START macro, use the Marlin start below'));
    else L.push(`M140 S${bt}`, `M104 S${nt}`, 'G28', `M190 S${bt}`, `M109 S${nt}`, 'G92 E0');
    L.push('G21', 'G90', 'M82', 'G92 E0');
  } else if (lathe) L.push('G18 G21 G90 G40', 'G7 (diameter mode)', 'G54');
  else L.push(`G21 G90 G17${iso ? ' G40 G49 G80' : ''}`, iso ? 'G54' : '');
  // Body.
  let s = 0;
  for (const m of job.moves) {
    switch (m.t) {
      case 'comment': L.push(c(m.text)); break;
      case 'layer': L.push(c(`LAYER ${m.n} Z${num(m.z)}`)); if (d === 'klipper') L.push(`SET_PRINT_STATS_INFO CURRENT_LAYER=${m.n + 1}`); break;
      case 'tool': if (iso && !lathe) L.push(`T${m.n} M6 ${c(`${m.dia} mm tool`)}`, `G43 H${m.n}`); else if (lathe) L.push(`T0${m.n}0${m.n}`); else L.push(c(`Tool ${m.n}: ${m.dia} mm`)); break;
      case 'on':
        s = m.s;
        if (laser) L.push(`M4 S0`); // dynamic power: S rides on each feed move
        else if (d === 'plasma') L.push('M3 $0 S1');
        else if (job.kind === 'cut' && (d === 'iso') && job.process !== 'mill3' && job.process !== 'router') L.push('M3 ' + c('beam / torch on'));
        else L.push(`${lathe ? 'G97 ' : ''}S${Math.round(m.s)} M3`, ...(o.coolant && iso ? ['M8'] : []));
        break;
      case 'off': L.push(laser ? 'M5' : d === 'plasma' ? 'M5 $0' : 'M5', ...(o.coolant && iso && !laser && d !== 'plasma' ? ['M9'] : [])); break;
      case 'dwell': L.push(`G4 P${num(m.s, 2)}`); break; // seconds in GRBL, Marlin and LinuxCNC
      case 'rapid': case 'feed': {
        const parts = [m.t === 'rapid' ? 'G0' : 'G1'];
        if (lathe) { if (m.x !== undefined) parts.push(`X${num(m.x)}`); if (m.z !== undefined) parts.push(`Z${num(m.z)}`); }
        else { if (m.x !== undefined) parts.push(`X${num(m.x)}`); if (m.y !== undefined) parts.push(`Y${num(m.y)}`); if (m.z !== undefined) parts.push(`Z${num(m.z)}`); }
        if (m.t === 'feed' && m.e !== undefined) parts.push(`E${num(m.e, 5)}`);
        if (m.f !== undefined && (m.t === 'feed' || fdm)) parts.push(`F${Math.round(m.f)}`);
        if (laser && m.t === 'feed') parts.push(`S${Math.round((s / 100) * (o.laserMax ?? 1000))}`);
        if (parts.length > 1) L.push(parts.join(' '));
        break;
      }
    }
  }
  // Footer.
  if (fdm) { if (d === 'klipper') L.push('PRINT_END'); else L.push('M104 S0', 'M140 S0', 'G91', 'G1 Z5 F600', 'G90', 'G28 X', 'M84'); }
  else L.push(lathe ? 'G0 X100 Z50' : iso ? 'G0 Z25' : 'G0 X0 Y0', iso ? 'M30' : 'M2');
  if (d === 'iso' || d === 'lathe-iso') L.push('%');
  return L.filter(x => x !== '').join('\n') + '\n';
}

export const fileExtension = (d: Dialect) => (d === 'linuxcnc' || d === 'lathe-iso' || d === 'plasma' ? 'ngc' : d === 'iso' ? 'nc' : 'gcode');

/** Parse G-code back into moves (for preview and tests). */
export function parseGcode(text: string): Array<{ g: 0 | 1; x: number; y: number; z: number; e?: number }> {
  const out: Array<{ g: 0 | 1; x: number; y: number; z: number; e?: number }> = []; let x = 0, y = 0, z = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\(.*?\)|;.*$/g, '').trim().toUpperCase(); const m = /^G0?([01])\b(.*)$/.exec(line); if (!m) continue;
    const w = (k: string) => { const r = new RegExp(`${k}(-?\\d*\\.?\\d+)`).exec(m[2]); return r ? parseFloat(r[1]) : undefined; };
    x = w('X') ?? x; y = w('Y') ?? y; z = w('Z') ?? z; const e = w('E'); out.push({ g: +m[1] as 0 | 1, x, y, z, ...(e !== undefined ? { e } : {}) });
  }
  return out;
}
export type { Move };
