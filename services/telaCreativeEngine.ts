import type { TelaGradientPaint, TelaVectorObject } from '../types';

export type TelaCreativeToolKind = 'SELECT' | 'DIRECT' | 'MARQUEE' | 'BRUSH' | 'PENCIL' | 'INK' | 'MARKER' | 'AIRBRUSH' | 'ERASER' | 'MAGIC_ERASER' | 'SHAPE' | 'TEXT' | 'GRADIENT' | 'MASK' | 'SEGMENT';

export interface TelaBrushPreset {
  id: string; name: string; family: 'PENCIL' | 'INK' | 'PAINT' | 'MARKER' | 'TEXTURE' | 'ERASER';
  size: number; opacity: number; hardness: number; spacing: number; flow: number;
  pressureSize: number; pressureOpacity: number; smoothing: number;
  grain?: 'PAPER' | 'CHALK' | 'CANVAS' | 'HALFTONE' | 'NONE';
}

export const TELA_BRUSH_PRESETS: TelaBrushPreset[] = [
  ['pencil-hb','HB Pencil','PENCIL',3,.8,.92,.08,.75,.82,.18,.72,'PAPER'],
  ['pencil-2b','2B Pencil','PENCIL',5,.72,.72,.1,.7,.88,.22,.68,'PAPER'],
  ['pencil-color','Color Pencil','PENCIL',7,.66,.78,.12,.64,.7,.28,.64,'PAPER'],
  ['ink-tech','Technical Pen','INK',4,1,1,.04,1,.55,0,.88,'NONE'],
  ['ink-comic','Comic Inker','INK',11,1,.9,.05,.95,.92,.08,.82,'NONE'],
  ['ink-brush','Brush Ink','INK',19,.94,.76,.07,.86,1,.22,.72,'PAPER'],
  ['marker-fine','Fine Marker','MARKER',10,.62,.95,.06,.55,.38,.18,.8,'NONE'],
  ['marker-broad','Broad Marker','MARKER',34,.38,.82,.08,.42,.48,.24,.72,'PAPER'],
  ['paint-round','Round Paint','PAINT',28,.82,.62,.1,.68,.9,.34,.6,'CANVAS'],
  ['paint-flat','Flat Paint','PAINT',42,.76,.72,.08,.7,.74,.3,.62,'CANVAS'],
  ['paint-gouache','Gouache','PAINT',54,.68,.58,.12,.64,.82,.42,.54,'PAPER'],
  ['paint-oil','Oil Impasto','PAINT',66,.72,.44,.14,.6,.74,.38,.48,'CANVAS'],
  ['air-soft','Soft Airbrush','PAINT',96,.2,0,.05,.24,.45,.5,.82,'NONE'],
  ['chalk','Chalk','TEXTURE',26,.58,.38,.18,.56,.78,.34,.42,'CHALK'],
  ['halftone','Manga Halftone','TEXTURE',38,.72,.84,.22,.68,.56,.18,.5,'HALFTONE'],
  ['eraser-hard','Hard Eraser','ERASER',28,1,1,.04,1,.7,0,.78,'NONE'],
  ['eraser-soft','Soft Eraser','ERASER',70,.5,.12,.06,.52,.62,.3,.74,'NONE'],
].map(([id,name,family,size,opacity,hardness,spacing,flow,pressureSize,pressureOpacity,smoothing,grain]) => ({ id, name, family, size, opacity, hardness, spacing, flow, pressureSize, pressureOpacity, smoothing, grain } as TelaBrushPreset));

export interface TelaShapePreset { id: string; name: string; category: 'BASIC' | 'ARROWS' | 'CALLOUTS' | 'SYMBOLS' | 'BADGES'; path: string; }

export const TELA_SHAPE_LIBRARY: TelaShapePreset[] = [
  { id:'triangle', name:'Triangle', category:'BASIC', path:'M50 0 L100 100 L0 100 Z' },
  { id:'diamond', name:'Diamond', category:'BASIC', path:'M50 0 L100 50 L50 100 L0 50 Z' },
  { id:'pentagon', name:'Pentagon', category:'BASIC', path:'M50 0 L98 36 L80 100 L20 100 L2 36 Z' },
  { id:'hexagon', name:'Hexagon', category:'BASIC', path:'M25 0 L75 0 L100 50 L75 100 L25 100 L0 50 Z' },
  { id:'octagon', name:'Octagon', category:'BASIC', path:'M30 0 L70 0 L100 30 L100 70 L70 100 L30 100 L0 70 L0 30 Z' },
  { id:'star', name:'Five-point star', category:'BADGES', path:'M50 0 L61 35 L98 35 L68 57 L79 94 L50 72 L21 94 L32 57 L2 35 L39 35 Z' },
  { id:'burst', name:'Burst', category:'BADGES', path:'M50 0 L61 24 L85 15 L76 39 L100 50 L76 61 L85 85 L61 76 L50 100 L39 76 L15 85 L24 61 L0 50 L24 39 L15 15 L39 24 Z' },
  { id:'seal', name:'Seal', category:'BADGES', path:'M50 0 C64 0 70 10 79 14 C89 19 100 23 100 38 C100 48 94 53 94 62 C94 76 86 82 74 85 C65 88 62 100 50 100 C38 100 35 88 26 85 C14 82 6 76 6 62 C6 53 0 48 0 38 C0 23 11 19 21 14 C30 10 36 0 50 0 Z' },
  { id:'arrow-right', name:'Arrow right', category:'ARROWS', path:'M0 30 L60 30 L60 0 L100 50 L60 100 L60 70 L0 70 Z' },
  { id:'arrow-left', name:'Arrow left', category:'ARROWS', path:'M100 30 L40 30 L40 0 L0 50 L40 100 L40 70 L100 70 Z' },
  { id:'arrow-up', name:'Arrow up', category:'ARROWS', path:'M30 100 L30 40 L0 40 L50 0 L100 40 L70 40 L70 100 Z' },
  { id:'chevron', name:'Chevron', category:'ARROWS', path:'M0 0 L55 0 L100 50 L55 100 L0 100 L45 50 Z' },
  { id:'double-chevron', name:'Double chevron', category:'ARROWS', path:'M0 0 L35 0 L75 50 L35 100 L0 100 L40 50 Z M45 0 L65 0 L100 50 L65 100 L45 100 L80 50 Z' },
  { id:'speech', name:'Speech bubble', category:'CALLOUTS', path:'M8 0 L92 0 Q100 0 100 8 L100 70 Q100 78 92 78 L36 78 L18 100 L21 78 L8 78 Q0 78 0 70 L0 8 Q0 0 8 0 Z' },
  { id:'thought', name:'Thought bubble', category:'CALLOUTS', path:'M18 12 C24 0 42 0 50 8 C62 0 81 5 82 18 C99 22 105 39 94 51 C102 66 87 80 72 76 C63 90 41 89 34 77 C17 83 2 70 8 54 C-4 42 2 24 18 22 Z M24 84 A8 8 0 1 0 24 100 A8 8 0 1 0 24 84 Z' },
  { id:'caption', name:'Caption box', category:'CALLOUTS', path:'M0 0 L100 0 L100 76 L62 76 L50 100 L42 76 L0 76 Z' },
  { id:'heart', name:'Heart', category:'SYMBOLS', path:'M50 96 C40 84 4 61 4 30 C4 4 35 -4 50 18 C65 -4 96 4 96 30 C96 61 60 84 50 96 Z' },
  { id:'lightning', name:'Lightning', category:'SYMBOLS', path:'M58 0 L16 56 L45 56 L32 100 L86 39 L56 39 Z' },
  { id:'check', name:'Check', category:'SYMBOLS', path:'M0 53 L18 35 L40 57 L82 8 L100 25 L41 96 Z' },
  { id:'plus', name:'Plus', category:'SYMBOLS', path:'M35 0 L65 0 L65 35 L100 35 L100 65 L65 65 L65 100 L35 100 L35 65 L0 65 L0 35 L35 35 Z' },
  { id:'play', name:'Play', category:'SYMBOLS', path:'M12 0 L92 50 L12 100 Z' },
  { id:'shield', name:'Shield', category:'BADGES', path:'M50 0 L94 15 L90 58 C86 78 69 92 50 100 C31 92 14 78 10 58 L6 15 Z' },
  { id:'ribbon', name:'Ribbon', category:'BADGES', path:'M0 12 L22 12 L22 0 L78 0 L78 12 L100 12 L88 38 L100 64 L72 64 L72 88 L50 76 L28 88 L28 64 L0 64 L12 38 Z' },
  { id:'cloud', name:'Cloud', category:'CALLOUTS', path:'M20 82 C4 82 -3 66 6 54 C0 35 18 23 34 30 C42 5 74 2 84 25 C107 24 111 57 92 65 C90 77 80 82 68 82 Z' },
];

const creativeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

export function makeShapeObject(shape: TelaShapePreset, x = 80, y = 80, w = 220, h = 180): TelaVectorObject {
  return { id: creativeId('shape'), kind:'PATH', x, y, w, h, fill:'#6B0099', stroke:'#17121d', strokeWidth:1.5, rotation:0, opacity:1, svgPathData:shape.path, pathOriginX:0, pathOriginY:0, pathOriginW:100, pathOriginH:100, pathClosed:true, objectLabel:shape.name };
}

export type TelaTemplateCategory = 'POSTER' | 'LOWER_THIRD' | 'MENU' | 'PRESENTATION' | 'SOCIAL' | 'WEB';
export interface TelaCreativeTemplate { id: string; name: string; category: TelaTemplateCategory; width: number; height: number; palette: [string,string,string]; tone: 'BOLD' | 'EDITORIAL' | 'MINIMAL' | 'PLAYFUL'; }

const templateNames: Array<[string,TelaTemplateCategory,number,number,[string,string,string],TelaCreativeTemplate['tone']]> = [
  ['Midnight Premiere','POSTER',816,1056,['#130020','#D40055','#FF8A00'],'BOLD'], ['Museum Editorial','POSTER',816,1056,['#F5F0E8','#1B1523','#6B0099'],'EDITORIAL'], ['Science Field Notes','POSTER',816,1056,['#071B22','#00A8BC','#E8FDFF'],'EDITORIAL'], ['Neighborhood Festival','POSTER',816,1056,['#FFF3D8','#D40055','#6B0099'],'PLAYFUL'], ['Monochrome Type','POSTER',816,1056,['#F7F7F2','#111111','#C7C7C0'],'MINIMAL'],
  ['Signal Bar','LOWER_THIRD',1920,1080,['#08050D','#6B0099','#00DAF3'],'BOLD'], ['Newsline','LOWER_THIRD',1920,1080,['#0A1325','#D40055','#FFFFFF'],'EDITORIAL'], ['Warm Interview','LOWER_THIRD',1920,1080,['#24120A','#FF8A00','#FFF3D8'],'MINIMAL'], ['Sports Velocity','LOWER_THIRD',1920,1080,['#07090D','#D40055','#00DAF3'],'BOLD'], ['Gallery Caption','LOWER_THIRD',1920,1080,['#F6F1E8','#1B1523','#6B0099'],'EDITORIAL'],
  ['Bistro Fold','MENU',816,1056,['#20150E','#FF8A00','#FFF2D6'],'EDITORIAL'], ['Modern Café','MENU',816,1056,['#F8F4EB','#1B1523','#D40055'],'MINIMAL'], ['Night Market','MENU',816,1056,['#0B0712','#6B0099','#FF8A00'],'BOLD'], ['Kids Lunch','MENU',816,1056,['#FFF8D8','#00A8BC','#D40055'],'PLAYFUL'],
  ['Spatial Keynote','PRESENTATION',1920,1080,['#08050D','#6B0099','#00DAF3'],'BOLD'], ['Research Brief','PRESENTATION',1920,1080,['#F7F4EE','#1B1523','#6B0099'],'EDITORIAL'], ['Product Story','PRESENTATION',1920,1080,['#101015','#D40055','#FF8A00'],'BOLD'], ['Classroom Canvas','PRESENTATION',1920,1080,['#FFF9EE','#00A8BC','#6B0099'],'PLAYFUL'], ['Black Type','PRESENTATION',1920,1080,['#0B0B0D','#F5F5EF','#777777'],'MINIMAL'],
  ['Creator Drop','SOCIAL',1080,1080,['#0E0616','#D40055','#FF8A00'],'BOLD'], ['Quote Prism','SOCIAL',1080,1080,['#10001A','#6B0099','#00DAF3'],'EDITORIAL'], ['Album Notice','SOCIAL',1080,1080,['#F1E8DC','#1B1523','#D40055'],'MINIMAL'], ['Learning Card','SOCIAL',1080,1080,['#F6FDFF','#00A8BC','#6B0099'],'PLAYFUL'],
  ['Portfolio Hero','WEB',1440,900,['#0A0710','#6B0099','#D40055'],'BOLD'], ['Editorial Landing','WEB',1440,900,['#F5F1E9','#1B1523','#FF8A00'],'EDITORIAL'], ['Course Launch','WEB',1440,900,['#08171D','#00A8BC','#D40055'],'BOLD'], ['Local Business','WEB',1440,900,['#FFF4E6','#6B0099','#FF8A00'],'PLAYFUL'], ['Quiet Product','WEB',1440,900,['#F8F8F6','#111111','#A2A2A0'],'MINIMAL'],
];

export const TELA_CREATIVE_TEMPLATES: TelaCreativeTemplate[] = templateNames.map(([name,category,width,height,palette,tone], index) => ({ id:`template_${index + 1}`, name, category, width, height, palette, tone }));

export function instantiateTelaTemplate(template: TelaCreativeTemplate): TelaVectorObject[] {
  const [ground, primary, accent] = template.palette;
  const gradient: TelaGradientPaint = { kind:'LINEAR', angle: template.tone === 'BOLD' ? 135 : 90, stops:[{ offset:0, color:ground }, { offset:1, color:primary }] };
  const margin = Math.round(Math.min(template.width, template.height) * .07);
  const isLower = template.category === 'LOWER_THIRD';
  return [
    { id:creativeId('bg'), kind:'RECT', x:0, y:0, w:template.width, h:template.height, fill:ground, gradient, stroke:'none', strokeWidth:0, rotation:0, opacity:1, objectLabel:'Background' },
    { id:creativeId('accent'), kind:'RECT', x:isLower ? margin : 0, y:isLower ? template.height * .72 : 0, w:isLower ? template.width * .52 : Math.max(12, margin * .18), h:isLower ? template.height * .17 : template.height, fill:accent, stroke:'none', strokeWidth:0, rotation:0, opacity:.95, objectLabel:'Accent' },
    { id:creativeId('title'), kind:'TEXT', x:margin, y:isLower ? template.height * .74 : template.height * .58, w:template.width - margin * 2, h:template.height * .14, text:template.name, fill:template.tone === 'MINIMAL' || template.tone === 'EDITORIAL' ? primary : '#FFFFFF', stroke:'none', strokeWidth:0, rotation:0, opacity:1, fontSize:Math.max(34, Math.round(Math.min(template.width,template.height) * (isLower ? .055 : .075))), fontFamily:'var(--font-display,Outfit),system-ui,sans-serif', fontWeight:800, objectLabel:'Title' },
    { id:creativeId('copy'), kind:'TEXT', x:margin, y:isLower ? template.height * .84 : template.height * .74, w:template.width - margin * 2, h:template.height * .08, text:'Replace this copy with your story', fill:template.tone === 'MINIMAL' || template.tone === 'EDITORIAL' ? primary : 'rgba(255,255,255,.78)', stroke:'none', strokeWidth:0, rotation:0, opacity:.82, fontSize:Math.max(18, Math.round(Math.min(template.width,template.height) * .025)), fontFamily:'var(--font-sans,Inter),system-ui,sans-serif', fontWeight:500, objectLabel:'Supporting copy' },
  ];
}

export type TelaGenerativeTask = 'TEXT_TO_IMAGE' | 'INPAINT' | 'OUTPAINT' | 'VECTORIZE' | 'STYLE_TRANSFER' | 'REMOVE_BACKGROUND' | 'GENERATE_LAYOUT';
export interface TelaGenerativeAdapter { id: string; label: string; locality: 'DEVICE' | 'SERVER' | 'API'; tasks: TelaGenerativeTask[]; available: () => boolean | Promise<boolean>; run: (task: TelaGenerativeTask, input: unknown, options?: Record<string,unknown>) => Promise<unknown>; }
const generativeAdapters = new Map<string,TelaGenerativeAdapter>();
export const telaGenerativeRegistry = {
  register(adapter: TelaGenerativeAdapter) { generativeAdapters.set(adapter.id, adapter); },
  remove(id: string) { generativeAdapters.delete(id); },
  list(task?: TelaGenerativeTask) { return [...generativeAdapters.values()].filter(adapter => !task || adapter.tasks.includes(task)); },
  async resolve(task: TelaGenerativeTask, preferDevice = true) { const candidates = [...generativeAdapters.values()].filter(adapter => adapter.tasks.includes(task)).sort((a,b) => Number(preferDevice && b.locality === 'DEVICE') - Number(preferDevice && a.locality === 'DEVICE')); for (const adapter of candidates) if (await adapter.available()) return adapter; return null; },
};

export type TelaAssetKind = 'RASTER' | 'VECTOR' | 'DOCUMENT' | 'LOTTIE' | 'VIDEO' | 'BRUSH' | 'SHAPE' | 'PALETTE' | 'UNKNOWN';
export function classifyTelaAsset(file: File): TelaAssetKind {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['abr'].includes(ext)) return 'BRUSH';
  if (['csh','asl'].includes(ext)) return 'SHAPE';
  if (['ase','aco'].includes(ext)) return 'PALETTE';
  if (['lottie'].includes(ext) || (ext === 'json' && /lottie/i.test(file.name))) return 'LOTTIE';
  if (['svg','ai','eps'].includes(ext)) return 'VECTOR';
  if (['pdf','doc','docx','ppt','pptx','xls','xlsx'].includes(ext)) return 'DOCUMENT';
  if (file.type.startsWith('video/') || ['mp4','webm','mov','m4v'].includes(ext)) return 'VIDEO';
  if (file.type.startsWith('image/') || ['png','jpg','jpeg','webp','avif','gif','bmp','tif','tiff','heic','heif','psd'].includes(ext)) return 'RASTER';
  return 'UNKNOWN';
}
