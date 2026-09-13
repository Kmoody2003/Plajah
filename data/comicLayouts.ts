// Preset comic & manga page layouts — the "templates" a Clip Studio / Procreate-style
// comic tool ships with. Each layout is a list of panel rects in page-percent space
// {x,y,width,height}. `shape` supports the angled manga cuts ComicPanelBuilder renders.

export interface LayoutPanelSpec {
  x: number; y: number; width: number; height: number;
  shape?: 'rect' | 'diag-left' | 'diag-right';
}
export interface ComicLayout {
  id: string;
  name: string;
  category: 'comic' | 'manga' | 'webtoon';
  panels: LayoutPanelSpec[];
}

const grid = (cols: number, rows: number): LayoutPanelSpec[] => {
  const out: LayoutPanelSpec[] = [];
  const w = 100 / cols, h = 100 / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: c * w, y: r * h, width: w, height: h });
  return out;
};
const rows = (n: number): LayoutPanelSpec[] => Array.from({ length: n }, (_, i) => ({ x: 0, y: (100 / n) * i, width: 100, height: 100 / n }));

export const COMIC_LAYOUTS: ComicLayout[] = [
  // ── Western comic ──
  { id: 'splash', name: 'Splash', category: 'comic', panels: [{ x: 0, y: 0, width: 100, height: 100 }] },
  { id: 'two-h', name: '2 · Stacked', category: 'comic', panels: rows(2) },
  { id: 'two-v', name: '2 · Side', category: 'comic', panels: [{ x: 0, y: 0, width: 50, height: 100 }, { x: 50, y: 0, width: 50, height: 100 }] },
  { id: 'three-tier', name: '3 · Tiers', category: 'comic', panels: rows(3) },
  { id: 'grid-4', name: '4 · Grid', category: 'comic', panels: grid(2, 2) },
  { id: 'grid-6', name: '6 · Grid', category: 'comic', panels: grid(2, 3) },
  { id: 'grid-9', name: '9 · Grid', category: 'comic', panels: grid(3, 3) },
  {
    id: 'classic', name: 'Classic', category: 'comic', panels: [
      { x: 0, y: 0, width: 100, height: 30 },
      { x: 0, y: 30, width: 50, height: 35 }, { x: 50, y: 30, width: 50, height: 35 },
      { x: 0, y: 65, width: 100, height: 35 },
    ],
  },
  {
    id: 'hero-strip', name: 'Hero + Strip', category: 'comic', panels: [
      { x: 0, y: 0, width: 100, height: 55 },
      { x: 0, y: 55, width: 33.33, height: 45 }, { x: 33.33, y: 55, width: 33.34, height: 45 }, { x: 66.67, y: 55, width: 33.33, height: 45 },
    ],
  },
  { id:'cinematic-5',name:'Cinematic · 5',category:'comic',panels:[{x:0,y:0,width:100,height:24},{x:0,y:24,width:38,height:44},{x:38,y:24,width:62,height:44},{x:0,y:68,width:64,height:32},{x:64,y:68,width:36,height:32}] },
  { id:'inset-reveal',name:'Inset Reveal',category:'comic',panels:[{x:0,y:0,width:100,height:100},{x:5,y:6,width:31,height:25},{x:64,y:69,width:31,height:25}] },
  { id:'action-diagonal',name:'Action Diagonal',category:'comic',panels:[{x:0,y:0,width:62,height:58,shape:'diag-right'},{x:62,y:0,width:38,height:34},{x:62,y:34,width:38,height:24},{x:0,y:58,width:45,height:42},{x:45,y:58,width:55,height:42,shape:'diag-left'}] },
  { id:'kids-open-4',name:'Kids · Open 4',category:'comic',panels:[{x:0,y:0,width:100,height:38},{x:0,y:38,width:50,height:30},{x:50,y:38,width:50,height:30},{x:0,y:68,width:100,height:32}] },
  // ── Manga (dynamic / angled) ──
  {
    id: 'manga-action', name: 'Action', category: 'manga', panels: [
      { x: 0, y: 0, width: 100, height: 42, shape: 'diag-right' },
      { x: 0, y: 42, width: 55, height: 33 }, { x: 55, y: 42, width: 45, height: 33, shape: 'diag-left' },
      { x: 0, y: 75, width: 100, height: 25 },
    ],
  },
  {
    id: 'manga-dynamic', name: 'Dynamic', category: 'manga', panels: [
      { x: 0, y: 0, width: 60, height: 50 }, { x: 60, y: 0, width: 40, height: 30 },
      { x: 60, y: 30, width: 40, height: 20 },
      { x: 0, y: 50, width: 40, height: 50 }, { x: 40, y: 50, width: 60, height: 50, shape: 'diag-right' },
    ],
  },
  {
    id: 'manga-4', name: 'Manga · 4', category: 'manga', panels: [
      { x: 0, y: 0, width: 100, height: 28 },
      { x: 0, y: 28, width: 48, height: 40 }, { x: 48, y: 28, width: 52, height: 40 },
      { x: 0, y: 68, width: 100, height: 32 },
    ],
  },
  { id:'manga-silence',name:'Manga · Silence',category:'manga',panels:[{x:0,y:0,width:100,height:48},{x:0,y:48,width:35,height:24},{x:35,y:48,width:65,height:24},{x:0,y:72,width:100,height:28}] },
  { id:'manga-reaction',name:'Manga · Reaction',category:'manga',panels:[{x:0,y:0,width:56,height:62},{x:56,y:0,width:44,height:31},{x:56,y:31,width:44,height:31},{x:0,y:62,width:33,height:38},{x:33,y:62,width:67,height:38,shape:'diag-left'}] },
  { id:'manga-romance',name:'Manga · Romance',category:'manga',panels:[{x:0,y:0,width:100,height:58},{x:0,y:58,width:42,height:42},{x:42,y:58,width:58,height:42}] },
  // ── Webtoon (vertical scroll strips) ──
  { id: 'webtoon-4', name: 'Webtoon · 4', category: 'webtoon', panels: rows(4) },
  { id: 'webtoon-5', name: 'Webtoon · 5', category: 'webtoon', panels: rows(5) },
  { id:'webtoon-reveal',name:'Webtoon · Reveal',category:'webtoon',panels:[{x:0,y:0,width:100,height:18},{x:0,y:28,width:100,height:18},{x:0,y:60,width:100,height:40}] },
];

export const layoutsFor = (isManga: boolean): ComicLayout[] =>
  isManga
    ? COMIC_LAYOUTS.filter(l => l.category !== 'comic').concat(COMIC_LAYOUTS.filter(l => l.category === 'comic'))
    : COMIC_LAYOUTS;
