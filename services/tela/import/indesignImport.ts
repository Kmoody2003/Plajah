// import/indesignImport — Adobe InDesign (.idml, .inx, .indd) → editable Tela vector pages.
//
// .idml files are ZIP archives containing designmap.xml, Resources/Graphic.xml, Resources/Fonts.xml,
// Spreads/Spread_*.xml and Stories/Story_*.xml. Parsed in pure TypeScript with fflate so imports run
// quickly without blocking and work identically in browser workers and Node tests.
import { unzipSync, strFromU8 } from 'fflate';
import type { TelaBlock, TelaVectorObject } from '../../../types';
import { cmykToRgb8 } from './psdChannels';
import { ReportBuilder, type ImportEnv, type ImportedDocument, type ImportedPage, type ResolvedFont } from './types';
import type { StudioGroup } from '../studio/model';

const PT_TO_PX = 96 / 72;
const yieldTick = () => new Promise<void>(r => setTimeout(r, 0));

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&amp;/g, '&');
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const len = xml.length;
  while (i < len) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      stack[stack.length - 1].text += decodeXmlEntities(xml.slice(i));
      break;
    }
    if (lt > i) {
      stack[stack.length - 1].text += decodeXmlEntities(xml.slice(i, lt));
    }
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      i = end < 0 ? len : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      i = end < 0 ? len : end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      const chunk = end < 0 ? xml.slice(lt + 9) : xml.slice(lt + 9, end);
      stack[stack.length - 1].text += chunk;
      i = end < 0 ? len : end + 3;
      continue;
    }
    const gt = xml.indexOf('>', lt + 1);
    if (gt < 0) break;
    const raw = xml.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (!raw) continue;
    if (raw[0] === '/') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1).trim() : raw;
    const spaceIdx = body.search(/[\s\r\n\t]/);
    const rawTag = spaceIdx < 0 ? body : body.slice(0, spaceIdx);
    const tag = rawTag.startsWith('idPkg:') ? rawTag : rawTag.replace(/^.*:/, '');
    const attrs: Record<string, string> = {};
    if (spaceIdx >= 0) {
      const attrStr = body.slice(spaceIdx + 1);
      const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let am: RegExpExecArray | null;
      while ((am = attrRe.exec(attrStr))) {
        attrs[am[1]] = decodeXmlEntities(am[2] ?? am[3] ?? '');
      }
    }
    const node: XmlNode = { tag, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

function findAll(node: XmlNode, tag: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (child.tag === tag) out.push(child);
    findAll(child, tag, out);
  }
  return out;
}

function findFirst(node: XmlNode, tag: string): XmlNode | undefined {
  for (const child of node.children) {
    if (child.tag === tag) return child;
    const nested = findFirst(child, tag);
    if (nested) return nested;
  }
  return undefined;
}

function collectText(node: XmlNode): string {
  let out = '';
  if (node.tag === 'Br') return '\n';
  if (node.tag === 'Content') out += node.text;
  for (const child of node.children) out += collectText(child);
  return out;
}

type Mat = [number, number, number, number, number, number];
const ID_MAT: Mat = [1, 0, 0, 1, 0, 0];
const mulMat = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const applyMat = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function parseTransform(attr: string | undefined): Mat {
  if (!attr) return ID_MAT;
  const nums = attr.trim().split(/\s+/).map(Number);
  if (nums.length !== 6 || nums.some(n => !Number.isFinite(n))) return ID_MAT;
  return nums as Mat;
}
function parsePair(attr: string | undefined): [number, number] | null {
  if (!attr) return null;
  const [x, y] = attr.trim().split(/\s+/).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

function parseSwatches(graphicXml: string | undefined): Map<string, string> {
  const map = new Map<string, string>([
    ['Swatch/None', 'none'],
    ['Color/None', 'none'],
    ['n', 'none'],
    ['Color/Paper', '#ffffff'],
    ['Color/Black', '#000000'],
    ['Color/Registration', '#000000'],
  ]);
  if (!graphicXml) return map;
  const doc = parseXml(graphicXml);
  for (const col of findAll(doc, 'Color')) {
    const self = col.attrs.Self;
    const space = col.attrs.Space;
    const vals = (col.attrs.ColorValue || '').trim().split(/\s+/).map(Number);
    if (!self || vals.some(v => !Number.isFinite(v))) continue;
    if (space === 'RGB' && vals.length >= 3) {
      map.set(self, toHex(vals[0], vals[1], vals[2]));
    } else if (space === 'CMYK' && vals.length >= 4) {
      const out = [0, 0, 0];
      cmykToRgb8((vals[0] / 100) * 255, (vals[1] / 100) * 255, (vals[2] / 100) * 255, (vals[3] / 100) * 255, out);
      map.set(self, toHex(out[0], out[1], out[2]));
    } else if (space === 'LAB' && vals.length >= 3) {
      const L = Math.max(0, Math.min(255, vals[0] * 2.55));
      map.set(self, toHex(L, L, L));
    }
  }
  return map;
}

interface ParsedStory {
  text: string;
  blocks: TelaBlock[];
  fontName?: string;
  fontSize: number;
  fillRef?: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
}

function parseStories(files: Record<string, Uint8Array>): Map<string, ParsedStory> {
  const map = new Map<string, ParsedStory>();
  for (const [path, bytes] of Object.entries(files)) {
    if (!/(^|\/)Stories\/Story_[^/]+\.xml$/i.test(path)) continue;
    const doc = parseXml(strFromU8(bytes));
    const story = findFirst(doc, 'Story');
    if (!story?.attrs.Self) continue;
    const paraRanges = findAll(story, 'ParagraphStyleRange');
    const charRanges = findAll(story, 'CharacterStyleRange');
    const firstChar = charRanges[0];
    const firstPara = paraRanges[0];
    const appliedFont = findFirst(firstChar || story, 'AppliedFont')?.text.trim() || firstChar?.attrs.AppliedFont;
    const fontSize = Math.max(6, parseFloat(firstChar?.attrs.PointSize || '12') * PT_TO_PX);
    const fontStyleAttr = (firstChar?.attrs.FontStyle || '').toLowerCase();
    const just = (firstPara?.attrs.Justification || '').toLowerCase();
    const align: 'left' | 'center' | 'right' = just.includes('center') ? 'center' : just.includes('right') ? 'right' : 'left';
    const rawText = collectText(story).replace(/\r\n?/g, '\n');
    const lines = rawText.split('\n');
    const blocks: TelaBlock[] = (lines.length ? lines : ['']).map((line, idx) => ({ id: `idml_b_${idx}`, kind: 'p', text: line }));
    map.set(story.attrs.Self, {
      text: rawText,
      blocks,
      fontName: appliedFont,
      fontSize,
      fillRef: firstChar?.attrs.FillColor,
      align,
      bold: fontStyleAttr.includes('bold') || fontStyleAttr.includes('black'),
      italic: fontStyleAttr.includes('italic') || fontStyleAttr.includes('oblique'),
    });
  }
  return map;
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function pathGeometryToSvgAndBounds(
  node: XmlNode,
  worldMat: Mat,
  offsetX: number,
  offsetY: number,
): { svgPath: string; x: number; y: number; w: number; h: number } | null {
  const geom = findFirst(node, 'PathGeometry');
  if (!geom) return null;
  const subpaths = findAll(geom, 'GeometryPathType');
  if (!subpaths.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const parts: string[] = [];
  const toPagePt = (pt: [number, number]): [number, number] => {
    const [wx, wy] = applyMat(worldMat, pt[0], pt[1]);
    const px = (wx - offsetX) * PT_TO_PX;
    const py = (wy - offsetY) * PT_TO_PX;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    return [px, py];
  };

  for (const sp of subpaths) {
    const closed = sp.attrs.PathOpen !== 'true';
    const pts = findAll(sp, 'PathPointType');
    if (pts.length < 2) continue;
    const mapped = pts.map(p => ({
      a: toPagePt(parsePair(p.attrs.Anchor) || [0, 0]),
      l: toPagePt(parsePair(p.attrs.LeftDirection) || parsePair(p.attrs.Anchor) || [0, 0]),
      r: toPagePt(parsePair(p.attrs.RightDirection) || parsePair(p.attrs.Anchor) || [0, 0]),
    }));
    const d: string[] = [`M ${mapped[0].a[0].toFixed(2)} ${mapped[0].a[1].toFixed(2)}`];
    for (let k = 1; k < mapped.length; k++) {
      const prev = mapped[k - 1], cur = mapped[k];
      d.push(`C ${prev.r[0].toFixed(2)} ${prev.r[1].toFixed(2)}, ${cur.l[0].toFixed(2)} ${cur.l[1].toFixed(2)}, ${cur.a[0].toFixed(2)} ${cur.a[1].toFixed(2)}`);
    }
    if (closed) {
      const prev = mapped[mapped.length - 1], cur = mapped[0];
      d.push(`C ${prev.r[0].toFixed(2)} ${prev.r[1].toFixed(2)}, ${cur.l[0].toFixed(2)} ${cur.l[1].toFixed(2)}, ${cur.a[0].toFixed(2)} ${cur.a[1].toFixed(2)} Z`);
    }
    parts.push(d.join(' '));
  }
  if (!parts.length || !Number.isFinite(minX)) return null;
  const x = minX, y = minY, w = Math.max(4, maxX - minX), h = Math.max(4, maxY - minY);
  // Shift SVG path into object-local (0,0) coordinates to match TelaVector
  const localPts: string[] = [];
  for (const sp of subpaths) {
    const closed = sp.attrs.PathOpen !== 'true';
    const pts = findAll(sp, 'PathPointType');
    if (pts.length < 2) continue;
    const local = (rawPt: [number, number]): [number, number] => {
      const [wx, wy] = applyMat(worldMat, rawPt[0], rawPt[1]);
      return [(wx - offsetX) * PT_TO_PX - x, (wy - offsetY) * PT_TO_PX - y];
    };
    const mapped = pts.map(p => ({
      a: local(parsePair(p.attrs.Anchor) || [0, 0]),
      l: local(parsePair(p.attrs.LeftDirection) || parsePair(p.attrs.Anchor) || [0, 0]),
      r: local(parsePair(p.attrs.RightDirection) || parsePair(p.attrs.Anchor) || [0, 0]),
    }));
    const d: string[] = [`M ${mapped[0].a[0].toFixed(2)} ${mapped[0].a[1].toFixed(2)}`];
    for (let k = 1; k < mapped.length; k++) {
      const prev = mapped[k - 1], cur = mapped[k];
      d.push(`C ${prev.r[0].toFixed(2)} ${prev.r[1].toFixed(2)}, ${cur.l[0].toFixed(2)} ${cur.l[1].toFixed(2)}, ${cur.a[0].toFixed(2)} ${cur.a[1].toFixed(2)}`);
    }
    if (closed) {
      const prev = mapped[mapped.length - 1], cur = mapped[0];
      d.push(`C ${prev.r[0].toFixed(2)} ${prev.r[1].toFixed(2)}, ${cur.l[0].toFixed(2)} ${cur.l[1].toFixed(2)}, ${cur.a[0].toFixed(2)} ${cur.a[1].toFixed(2)} Z`);
    }
    localPts.push(d.join(' '));
  }
  return { svgPath: localPts.join(' '), x, y, w, h };
}

function importInddBinary(bytes: Uint8Array, fileName: string): ImportedDocument {
  const report = new ReportBuilder();
  // Read UTF-8 XMP metadata block embedded inside binary .indd files
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 24_000_000)));
  const xmpStart = raw.indexOf('<x:xmpmeta');
  const xmpEnd = xmpStart >= 0 ? raw.indexOf('</x:xmpmeta>', xmpStart) : -1;
  const xmp = xmpStart >= 0 && xmpEnd > xmpStart ? raw.slice(xmpStart, xmpEnd + 12) : '';

  const numPagesMatch = /<xmpTPg:NPages>(\d+)<\/xmpTPg:NPages>/.exec(xmp);
  const wMatch = /<stDim:w>([\d.]+)<\/stDim:w>/.exec(xmp);
  const hMatch = /<stDim:h>([\d.]+)<\/stDim:h>/.exec(xmp);
  const unitMatch = /<stDim:unit>([^<]+)<\/stDim:unit>/.exec(xmp);

  const unit = (unitMatch?.[1] || 'Points').toLowerCase();
  const toPx = (v: number) => unit.includes('inch') ? v * 96 : unit.includes('millimeter') ? (v / 25.4) * 96 : unit.includes('centimeter') ? (v / 2.54) * 96 : unit.includes('pica') ? v * 16 : v * PT_TO_PX;
  const width = Math.max(120, Math.round(toPx(parseFloat(wMatch?.[1] || '612'))));
  const height = Math.max(120, Math.round(toPx(parseFloat(hMatch?.[1] || '792'))));

  const thumbs: Array<{ w: number; h: number; fmt: string; b64: string }> = [];
  const imgRe = /<xmpGImg:image>([\s\S]*?)<\/xmpGImg:image>|<xapGImg:image>([\s\S]*?)<\/xapGImg:image>/g;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(xmp))) {
    const clean = (im[1] || im[2] || '').replace(/&#xA;/gi, '\n').replace(/\s+/g, '');
    if (clean.length > 64) thumbs.push({ w: width, h: height, fmt: 'jpeg', b64: clean });
  }

  if (!thumbs.length) {
    throw new Error(`${fileName} is a proprietary binary .indd saved without embedded page previews. In InDesign, choose File → Export → InDesign Markup (.idml) or Adobe PDF (Print) so Tela can import every editable frame, layer, and font cleanly.`);
  }

  const baseName = fileName.replace(/\.[^.]+$/, '');
  const pages: ImportedPage[] = thumbs.map((th, idx) => {
    const src = `data:image/${th.fmt};base64,${th.b64}`;
    const obj: TelaVectorObject = {
      id: nextId('indd_img'),
      kind: 'IMAGE',
      x: 0,
      y: 0,
      w: width,
      h: height,
      fill: 'none',
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 1,
      sourceImageSrc: src,
      objectLabel: `${baseName} Preview ${idx + 1}`,
      semanticRole: 'ARTWORK',
    };
    return { name: thumbs.length > 1 ? `${baseName} · ${idx + 1}` : baseName, width, height, objects: [obj], studio: { v: 1 } };
  });

  report.note('InDesign binary preview', 'look', 'imported embedded XMP preview pages; export .idml from InDesign for live editable text frames and vector paths', pages.length);
  if (numPagesMatch && Number(numPagesMatch[1]) > pages.length) {
    report.warn(`${fileName} declares ${numPagesMatch[1]} pages, with ${pages.length} embedded preview image(s). Export as .idml to import every page as live text and shapes.`);
  }

  return {
    pages,
    report: {
      fileName,
      format: 'indd',
      width,
      height,
      layers: pages.length,
      features: report.features(),
      fonts: [],
      warnings: report.warnings,
      smartObjects: [],
    },
  };
}

export async function importIndesignDocument(
  bytes: Uint8Array,
  o: { fileName: string; env: ImportEnv },
): Promise<ImportedDocument> {
  const { fileName, env } = o;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.indd')) {
    env.progress?.('Reading InDesign metadata', 0, 1);
    return importInddBinary(bytes, fileName);
  }

  env.progress?.('Unpacking InDesign markup', 0, 1);
  let files: Record<string, Uint8Array>;
  if (lower.endsWith('.inx')) {
    files = { 'Spreads/Spread_inx.xml': bytes };
  } else {
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error(`${fileName} could not be unpacked as an .idml archive.`);
    }
  }

  const swatches = parseSwatches(files['Resources/Graphic.xml'] ? strFromU8(files['Resources/Graphic.xml']) : undefined);
  const stories = parseStories(files);
  const spreadPaths = Object.keys(files)
    .filter(p => /(^|\/)Spreads\/Spread_[^/]+\.xml$/i.test(p))
    .sort();
  if (!spreadPaths.length) {
    throw new Error(`${fileName} contains no InDesign spreads to import.`);
  }

  const report = new ReportBuilder();
  const pages: ImportedPage[] = [];
  const requestedFonts = new Set<string>();
  const pendingTexts: Array<{ obj: TelaVectorObject; font: string }> = [];
  let totalLayers = 0;

  const colorOf = (ref: string | undefined, fallback = 'none'): string => {
    if (!ref) return fallback;
    if (swatches.has(ref)) return swatches.get(ref)!;
    if (/^#[0-9a-f]{3,8}$/i.test(ref)) return ref;
    return fallback;
  };

  const baseName = fileName.replace(/\.[^.]+$/, '');
  for (let si = 0; si < spreadPaths.length; si++) {
    env.progress?.(`Reading spread ${si + 1}`, si, spreadPaths.length);
    if ((si & 3) === 3) await yieldTick();
    const doc = parseXml(strFromU8(files[spreadPaths[si]]));
    const spread = findFirst(doc, 'Spread') || doc;
    const spreadPages = findAll(spread, 'Page');
    if (!spreadPages.length) continue;

    // Group items spread-wide onto their overlapping page (by center point)
    const parsedPages = spreadPages.map(p => {
      const m = parseTransform(p.attrs.ItemTransform);
      const gb = (p.attrs.GeometricBounds || '0 0 792 612').trim().split(/\s+/).map(Number);
      const [y1, x1, y2, x2] = gb.length >= 4 ? gb : [0, 0, 792, 612];
      const [ax, ay] = applyMat(m, x1, y1);
      const [bx, by] = applyMat(m, x2, y2);
      const minX = Math.min(ax, bx), minY = Math.min(ay, by);
      const wPt = Math.max(20, Math.abs(bx - ax)), hPt = Math.max(20, Math.abs(by - ay));
      return {
        node: p,
        name: p.attrs.Name || `${baseName} · ${pages.length + 1}`,
        minX,
        minY,
        wPt,
        hPt,
        wPx: Math.round(wPt * PT_TO_PX),
        hPx: Math.round(hPt * PT_TO_PX),
        objects: [] as TelaVectorObject[],
        groups: {} as Record<string, StudioGroup>,
      };
    });

    const pickPage = (cx: number, cy: number) => {
      for (const pg of parsedPages) {
        if (cx >= pg.minX - 16 && cx <= pg.minX + pg.wPt + 16 && cy >= pg.minY - 16 && cy <= pg.minY + pg.hPt + 16) return pg;
      }
      return parsedPages[0];
    };

    const walkItem = (node: XmlNode, parentMat: Mat, groupId?: string) => {
      const itemMat = mulMat(parentMat, parseTransform(node.attrs.ItemTransform));
      if (node.tag === 'Group') {
        const gid = nextId('idml_g');
        for (const pg of parsedPages) pg.groups[gid] = { id: gid, name: node.attrs.Name || 'Group', parent: groupId };
        for (const ch of node.children) walkItem(ch, itemMat, gid);
        report.note('Groups', 'live');
        return;
      }

      if (node.tag === 'TextFrame' || node.tag === 'Rectangle' || node.tag === 'Oval' || node.tag === 'Polygon' || node.tag === 'GraphicLine') {
        totalLayers++;
        const geom = findFirst(node, 'PathGeometry');
        let boundsPt: { x: number; y: number; w: number; h: number } | null = null;
        if (geom) {
          const pts = findAll(geom, 'PathPointType').map(p => parsePair(p.attrs.Anchor)).filter(Boolean) as Array<[number, number]>;
          if (pts.length) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const [px, py] of pts) {
              const [wx, wy] = applyMat(itemMat, px, py);
              x0 = Math.min(x0, wx); y0 = Math.min(y0, wy); x1 = Math.max(x1, wx); y1 = Math.max(y1, wy);
            }
            boundsPt = { x: x0, y: y0, w: Math.max(4, x1 - x0), h: Math.max(4, y1 - y0) };
          }
        }
        if (boundsPt) {
          const targetPage = pickPage(boundsPt.x + boundsPt.w / 2, boundsPt.y + boundsPt.h / 2);
          const geo = pathGeometryToSvgAndBounds(node, itemMat, targetPage.minX, targetPage.minY);
          if (geo) {
            const fill = colorOf(node.attrs.FillColor, node.tag === 'TextFrame' ? 'none' : '#e2e8f0');
            const stroke = colorOf(node.attrs.StrokeColor, 'none');
            const strokeWidth = stroke !== 'none' ? Math.max(0.5, parseFloat(node.attrs.StrokeWeight || '1') * PT_TO_PX) : 0;

            if (node.tag === 'TextFrame') {
              const storyId = node.attrs.ParentStory;
              const story = storyId ? stories.get(storyId) : undefined;
              const textFill = colorOf(story?.fillRef, '#111827');
              if (story?.fontName) requestedFonts.add(story.fontName);
              const obj: TelaVectorObject = {
                id: nextId('idml_txt'),
                kind: 'TEXT',
                x: geo.x,
                y: geo.y,
                w: geo.w,
                h: geo.h,
                fill: textFill === 'none' ? '#111827' : textFill,
                stroke: 'none',
                strokeWidth: 0,
                rotation: 0,
                opacity: 1,
                text: story?.text || '',
                blocks: story?.blocks,
                fontSize: story?.fontSize || 14,
                fontFamily: story?.fontName || 'Inter, sans-serif',
                fontWeight: story?.bold ? 700 : 400,
                fontStyle: story?.italic ? 'italic' : 'normal',
                textAlign: story?.align || 'left',
                lineHeight: 1.25,
                wrap: true,
                padding: 4,
                textRole: 'BOX',
                groupId,
                objectLabel: node.attrs.Name || (story?.text || 'Text frame').slice(0, 36),
                templateRole: 'BODY',
              };
              if (story?.fontName) pendingTexts.push({ obj, font: story.fontName });
              targetPage.objects.push(obj);
              report.note('Text frames', 'live', 'editable InDesign stories');
            } else {
              const obj: TelaVectorObject = {
                id: nextId('idml_shp'),
                kind: node.tag === 'Oval' ? 'ELLIPSE' : 'PATH',
                x: geo.x,
                y: geo.y,
                w: geo.w,
                h: geo.h,
                fill,
                stroke,
                strokeWidth,
                rotation: 0,
                opacity: 1,
                svgPathData: node.tag === 'Oval' ? undefined : geo.svgPath,
                groupId,
                objectLabel: node.attrs.Name || node.tag,
                semanticRole: 'ARTWORK',
              };
              targetPage.objects.push(obj);
              report.note('Vector frames & shapes', 'live');
            }
          }
        }
      }
      for (const ch of node.children) {
        if (ch.tag !== 'Page') walkItem(ch, itemMat, groupId);
      }
    };

    for (const ch of spread.children) {
      if (ch.tag !== 'Page' && ch.tag !== 'Properties') walkItem(ch, ID_MAT);
    }

    for (const pg of parsedPages) {
      pages.push({
        name: pg.name,
        width: pg.wPx,
        height: pg.hPx,
        objects: pg.objects,
        studio: { v: 1, groups: Object.keys(pg.groups).length ? pg.groups : undefined },
      });
    }
  }

  const resolvedFonts: Record<string, ResolvedFont> = requestedFonts.size && env.resolveFonts ? await env.resolveFonts([...requestedFonts]) : {};
  for (const t of pendingTexts) {
    const f = resolvedFonts[t.font];
    if (f) {
      t.obj.fontFamily = f.css;
      t.obj.fontWeight = Math.max(t.obj.fontWeight || 400, f.weight);
      if (f.italic) t.obj.fontStyle = 'italic';
    }
  }

  return {
    pages,
    report: {
      fileName,
      format: lower.endsWith('.inx') ? 'inx' : 'idml',
      width: pages[0]?.width ?? 816,
      height: pages[0]?.height ?? 1056,
      layers: totalLayers,
      features: report.features(),
      fonts: Object.values(resolvedFonts),
      warnings: report.warnings,
      smartObjects: [],
    },
  };
}
