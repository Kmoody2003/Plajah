// KiCad board file (.kicad_pcb, KiCad 7 s-expression format) so a maker can keep editing the
// routed board in KiCad: footprints with their pads and nets, tracks, vias, mounting holes and the
// outline. Generated from our own data; no KiCad library is used.

import type { Board } from './types';

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const n = (v: number) => String(+v.toFixed(4));

export function toKicadPcb(b: Board): string {
  const netIds = new Map<number, number>(); const nets: string[] = ['  (net 0 "")'];
  b.nets.forEach(net => { if (net.nc) return; const id = netIds.size + 1; netIds.set(net.id, id); nets.push(`  (net ${id} ${q(net.name)})`); });
  const netRef = (id: number) => { const k = netIds.get(id); return k ? ` (net ${k} ${q(b.nets[id].name)})` : ''; };
  const out: string[] = [
    '(kicad_pcb (version 20221018) (generator plajah_build)',
    '  (general (thickness 1.6))', '  (paper "A4")',
    '  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user "B.Silkscreen") (37 "F.SilkS" user "F.Silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user "B.Courtyard") (47 "F.CrtYd" user "F.Courtyard") (49 "F.Fab" user))',
    `  (setup (pad_to_mask_clearance 0.05) (pcbplotparams (layerselection 0x00010fc_ffffffff) (outputdirectory "gerbers/")))`,
    ...nets,
  ];
  for (const p of b.parts) {
    const ang = (360 - p.rot * 90) % 360;
    out.push(`  (footprint ${q(`Plajah:${p.fp.id}`)} (layer "F.Cu") (at ${n(p.x)} ${n(p.y)}${ang ? ` ${ang}` : ''})`,
      `    (fp_text reference ${q(p.ref)} (at 0 ${n(p.fp.court[1] - 1)}${ang ? ` ${ang}` : ''}) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`,
      `    (fp_text value ${q(p.value)} (at 0 ${n(p.fp.court[3] + 1)}${ang ? ` ${ang}` : ''}) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`,
      `    (fp_rect (start ${n(p.fp.court[0])} ${n(p.fp.court[1])}) (end ${n(p.fp.court[2])} ${n(p.fp.court[3])}) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))`);
    for (const s of p.fp.silk) out.push(`    (fp_line (start ${n(s[0])} ${n(s[1])}) (end ${n(s[2])} ${n(s[3])}) (stroke (width 0.15) (type solid)) (layer "F.SilkS"))`);
    const pads = b.pads.filter(x => x.part === p.id);
    p.fp.pads.forEach((d, i) => {
      const bp = pads[i]; const num = d.name || '';
      const type = d.drill ? 'thru_hole' : 'smd'; const layers = d.drill ? '"*.Cu" "*.Mask"' : '"F.Cu" "F.Paste" "F.Mask"';
      out.push(`    (pad ${q(num)} ${type} ${d.shape} (at ${n(d.x)} ${n(d.y)}${ang ? ` ${ang}` : ''}) (size ${n(d.w)} ${n(d.h)})${d.drill ? ` (drill ${n(d.drill)})` : ''} (layers ${layers})${bp ? netRef(bp.net) : ''})`);
    });
    for (const h of p.fp.holes ?? []) out.push(`    (pad "" np_thru_hole circle (at ${n(h.x)} ${n(h.y)}) (size ${n(h.d)} ${n(h.d)}) (drill ${n(h.d)}) (layers "*.Cu" "*.Mask"))`);
    out.push('  )');
  }
  b.holes.filter(h => !b.parts.some(p => (p.fp.holes ?? []).some(fh => { const a = (360 - p.rot * 90) % 360 * Math.PI / 180; return Math.hypot(p.x + fh.x * Math.cos(a) + fh.y * Math.sin(a) - h.x, p.y - fh.x * Math.sin(a) + fh.y * Math.cos(a) - h.y) < 0.01; }))).forEach((h, i) => {
    out.push(`  (footprint "Plajah:MountingHole_3.2mm" (layer "F.Cu") (at ${n(h.x)} ${n(h.y)})`, `    (fp_text reference "H${i + 1}" (at 0 -3) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`, `    (fp_text value "M3" (at 0 3) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`,
      `    (pad "" np_thru_hole circle (at 0 0) (size ${n(h.d)} ${n(h.d)}) (drill ${n(h.d)}) (layers "*.Cu" "*.Mask"))`, '  )');
  });
  for (const t of b.tracks) out.push(`  (segment (start ${n(t.a[0])} ${n(t.a[1])}) (end ${n(t.b[0])} ${n(t.b[1])}) (width ${n(t.w)}) (layer ${t.layer === 'top' ? '"F.Cu"' : '"B.Cu"'}) (net ${netIds.get(t.net) ?? 0}))`);
  for (const v of b.vias) out.push(`  (via (at ${n(v.x)} ${n(v.y)}) (size ${n(v.d)}) (drill ${n(v.drill)}) (layers "F.Cu" "B.Cu") (net ${netIds.get(v.net) ?? 0}))`);
  out.push(`  (gr_rect (start 0 0) (end ${n(b.W)} ${n(b.H)}) (stroke (width 0.1) (type solid)) (fill none) (layer "Edge.Cuts"))`, ')', '');
  return out.join('\n');
}
