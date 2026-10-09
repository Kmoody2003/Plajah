// showcaseFit — exact line-breaking for the showcase picture books. The Tela text estimator in Node (tests, gallery SVG) under-measures real fonts,
// so a paragraph that "fits" in Node can overflow in Chrome. These tables are Chrome canvas advance widths (hundredths of an em, measured at 100px)
// for the body faces of Beep Block Street (Rubik 600) and The Golden Thread (Andika 700). Lines are broken HERE with explicit newlines, so the
// SVG proof, the editor and print all show the same line breaks, and every box is sized from the real text height.
import type { TelaVectorObject } from '../../../../types';
import { text } from '../../templateKit';
import type { Role } from '../../templateKit';

const RUBIK600: Record<string, number> = {"0":67,"1":48,"2":63,"3":64,"4":67,"5":63,"6":64,"7":56,"8":67,"9":63," ":22,"!":28,"\"":43,"#":69,"$":66,"%":80,"&":73,"'":24,"(":37,")":37,"*":45,"+":61,",":27,"-":48,".":28,"/":52,":":28,";":29,"<":51,"=":57,">":51,"?":58,"@":84,"A":70,"B":70,"C":69,"D":71,"E":63,"F":61,"G":71,"H":74,"I":31,"J":66,"K":65,"L":59,"M":82,"N":71,"O":70,"P":67,"Q":70,"R":68,"S":65,"T":62,"U":72,"V":68,"W":82,"X":68,"Y":67,"Z":64,"[":37,"\\":52,"]":37,"^":46,"_":74,"`":38,"a":58,"b":62,"c":58,"d":62,"e":59,"f":43,"g":63,"h":64,"i":27,"j":29,"k":57,"l":28,"m":91,"n":63,"o":60,"p":62,"q":62,"r":44,"s":54,"t":45,"u":63,"v":58,"w":83,"x":58,"y":59,"z":54,"{":41,"|":26,"}":41,"~":56,"’":26,"‘":26,"“":47,"”":46,"–":57,"—":76,"…":71,"·":33};
const RUBIK700: Record<string, number> = {"0":68,"1":50,"2":65,"3":66,"4":68,"5":65,"6":65,"7":57,"8":68,"9":64," ":21,"!":29,"\"":45,"#":69,"$":67,"%":81,"&":74,"'":24,"(":38,")":38,"*":45,"+":61,",":28,"-":48,".":28,"/":53,":":29,";":30,"<":52,"=":57,">":52,"?":60,"@":85,"A":72,"B":70,"C":70,"D":72,"E":64,"F":62,"G":72,"H":75,"I":32,"J":67,"K":66,"L":60,"M":83,"N":72,"O":71,"P":68,"Q":71,"R":69,"S":66,"T":63,"U":73,"V":69,"W":83,"X":69,"Y":68,"Z":65,"[":38,"\\":53,"]":38,"^":46,"_":74,"`":40,"a":59,"b":63,"c":59,"d":63,"e":59,"f":44,"g":63,"h":65,"i":29,"j":30,"k":58,"l":29,"m":92,"n":64,"o":61,"p":63,"q":63,"r":45,"s":55,"t":47,"u":64,"v":60,"w":84,"x":59,"y":60,"z":55,"{":43,"|":27,"}":43,"~":55,"’":26,"‘":27,"“":49,"”":48,"–":57,"—":76,"…":74,"·":33};
const ANDIKA700: Record<string, number> = {"0":61,"1":61,"2":61,"3":61,"4":61,"5":61,"6":61,"7":61,"8":61,"9":61," ":27,"!":38,"\"":53,"#":61,"$":61,"%":76,"&":66,"'":31,"(":42,")":42,"*":51,"+":59,",":32,"-":44,".":35,"/":53,":":35,";":35,"<":59,"=":59,">":59,"?":53,"@":85,"A":73,"B":68,"C":68,"D":73,"E":59,"F":59,"G":72,"H":74,"I":51,"J":50,"K":70,"L":55,"M":91,"N":75,"O":73,"P":62,"Q":75,"R":67,"S":61,"T":62,"U":73,"V":72,"W":104,"X":67,"Y":67,"Z":61,"[":42,"\\":53,"]":42,"^":43,"_":63,"`":31,"a":61,"b":59,"c":50,"d":62,"e":54,"f":39,"g":58,"h":60,"i":31,"j":33,"k":56,"l":31,"m":86,"n":61,"o":57,"p":60,"q":59,"r":49,"s":51,"t":43,"u":61,"v":54,"w":77,"x":58,"y":54,"z":52,"{":51,"|":34,"}":51,"~":54,"’":38,"‘":37,"“":64,"”":62,"–":54,"—":87,"…":81,"·":37};

/** Straight quotes to typographic ones (the story data keeps plain ASCII so remixers can edit it). */
export function smart(s: string): string { return s.replace(/(^|[\s(—])"/g, '$1“').replace(/"/g, '”').replace(/'/g, '’'); }

export type FitFace = 'rubik600' | 'rubik700' | 'andika700';
const TABLES: Record<FitFace, Record<string, number>> = { rubik600: RUBIK600, rubik700: RUBIK700, andika700: ANDIKA700 };
const FONT_OF: Record<FitFace, { font: 'rubik' | 'andika'; weight: number }> = { rubik600: { font: 'rubik', weight: 600 }, rubik700: { font: 'rubik', weight: 700 }, andika700: { font: 'andika', weight: 700 } };
/** Width of a string in px (sum of advances; kerning only ever makes the real text narrower, so this is conservative). */
export function fitWidth(str: string, face: FitFace, size: number): number {
  const t = TABLES[face]; let w = 0; for (const ch of str) w += (t[ch] ?? 55) / 100 * size; return w;
}
/** Safety so a line that measures exactly the box width still clears it in a real browser. */
const SAFETY = .975;
function greedy(para: string, face: FitFace, size: number, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const word of para.split(/\s+/).filter(Boolean)) {
    const probe = line ? line + ' ' + word : word;
    if (line && fitWidth(probe, face, size) > max) { out.push(line); line = word; } else line = probe;
  }
  out.push(line); return out;
}
/** Word-wrap; honours a newline as hard paragraph/line breaks. Each paragraph is wrapped greedily, then re-wrapped at the narrowest width that keeps the same line count, so lines come out even (no one-word last lines). */
export function wrapFit(str: string, face: FitFace, size: number, width: number, balance = true): string[] {
  const out: string[] = []; const max = width * SAFETY;
  for (const para of str.split(/\n/)) {
    let lines = greedy(para, face, size, max);
    if (balance && lines.length > 1) {
      let lo = max * .5, hi = max;
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (greedy(para, face, size, mid).length <= lines.length) hi = mid; else lo = mid; }
      const bal = greedy(para, face, size, hi); if (bal.length === lines.length) lines = bal;
    }
    out.push(...lines);
  }
  return out;
}
export interface FitOpts { face: FitFace; max: number; min?: number; leading?: number; color: string; align?: 'left' | 'center' | 'right'; rotation?: number; label?: string; role?: Role; stroke?: string; strokeWidth?: number; maxH?: number; /** Shrink the box to the widest line and centre that block in the given width (left-aligned text then sits centred in its panel). */ centerBlock?: boolean }
export interface FitResult { obj: TelaVectorObject; size: number; lines: string[]; h: number; textW: number }
/** Largest size in [min,max] whose wrapped block fits maxH (when given); throws when even `min` does not fit, so a build never silently overflows. */
export function fitText(x: number, y: number, w: number, str: string, o: FitOpts): FitResult {
  const leading = o.leading ?? 1.38; const min = o.min ?? 20; str = smart(str);
  let size = o.max; let lines = wrapFit(str, o.face, size, w);
  const hOf = (n: number, s: number) => Math.ceil(s + (n - 1) * s * leading);
  while (o.maxH !== undefined && hOf(lines.length, size) > o.maxH && size > min) { size -= 1; lines = wrapFit(str, o.face, size, w); }
  const h = hOf(lines.length, size);
  if (o.maxH !== undefined && h > o.maxH) throw new Error(`showcaseFit: "${str.slice(0, 40)}…" needs ${h}px at ${size}px but only ${o.maxH}px is available (box ${w}px wide)`);
  const f = FONT_OF[o.face];
  const textW = Math.min(w, Math.ceil(Math.max(...lines.map(l => fitWidth(l, o.face, size)))) + 8);
  const blk = !!o.centerBlock && (o.align ?? 'left') === 'left';
  const obj = text(blk ? x + (w - textW) / 2 : x, y, blk ? textW : w, lines.join('\n'), { size, font: f.font, weight: f.weight, color: o.color, leading, align: o.align ?? 'left', rotation: o.rotation, label: o.label || 'Read-aloud text', role: o.role || 'BODY', h, stroke: o.stroke, strokeWidth: o.strokeWidth });
  return { obj, size, lines, h, textW };
}
