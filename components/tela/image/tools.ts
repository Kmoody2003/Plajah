// tools — the Image Studio tool registry and its keyboard state machine (Photoshop posture).
//
// Pure so the conventions are pinned by tests: single-letter group keys, Shift+letter
// cycles a group, groups remember their last tool, spring-loaded tools (hold a letter, use
// the tool, release → back), momentary Space = Hand (Ctrl+Space zoom in, Alt+Space zoom
// out), Alt = Eyedropper for painting tools, Ctrl = Move. `[` `]` brush size steps, Shift+[ ]
// hardness, digit keys = opacity (two quick digits = exact %, Shift = flow).

export type ToolId =
  | 'move'
  | 'marquee-rect' | 'marquee-ellipse' | 'marquee-row' | 'marquee-col'
  | 'lasso' | 'lasso-poly' | 'lasso-magnetic'
  | 'object-select' | 'quick-select' | 'magic-wand'
  | 'crop' | 'crop-perspective'
  | 'eyedropper'
  | 'spot-heal' | 'heal' | 'patch' | 'red-eye'
  | 'brush' | 'pencil' | 'color-replace'
  | 'clone' | 'history-brush'
  | 'eraser'
  | 'gradient' | 'bucket'
  | 'dodge' | 'burn' | 'sponge'
  | 'blur' | 'sharpen' | 'smudge'
  | 'pen' | 'path-select' | 'direct-select'
  | 'type'
  | 'shape-rect' | 'shape-ellipse' | 'shape-line' | 'shape-polygon'
  | 'hand' | 'rotate-view' | 'zoom';

export interface ToolGroup { id: string; key?: string; tools: ToolId[]; /** subset Shift+key cycles through (PS leaves single row/col out) */ cycle?: ToolId[] }

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'move', key: 'v', tools: ['move'] },
  { id: 'marquee', key: 'm', tools: ['marquee-rect', 'marquee-ellipse', 'marquee-row', 'marquee-col'], cycle: ['marquee-rect', 'marquee-ellipse'] },
  { id: 'lasso', key: 'l', tools: ['lasso', 'lasso-poly', 'lasso-magnetic'] },
  { id: 'select', key: 'w', tools: ['object-select', 'quick-select', 'magic-wand'] },
  { id: 'crop', key: 'c', tools: ['crop', 'crop-perspective'] },
  { id: 'eyedropper', key: 'i', tools: ['eyedropper'] },
  { id: 'heal', key: 'j', tools: ['spot-heal', 'heal', 'patch', 'red-eye'] },
  { id: 'brush', key: 'b', tools: ['brush', 'pencil', 'color-replace'] },
  { id: 'clone', key: 's', tools: ['clone'] },
  { id: 'history', key: 'y', tools: ['history-brush'] },
  { id: 'eraser', key: 'e', tools: ['eraser'] },
  { id: 'fill', key: 'g', tools: ['gradient', 'bucket'] },
  { id: 'tone', key: 'o', tools: ['dodge', 'burn', 'sponge'] },
  { id: 'focus', tools: ['blur', 'sharpen', 'smudge'] },
  { id: 'pen', key: 'p', tools: ['pen'] },
  { id: 'pathsel', key: 'a', tools: ['path-select', 'direct-select'] },
  { id: 'type', key: 't', tools: ['type'] },
  { id: 'shape', key: 'u', tools: ['shape-rect', 'shape-ellipse', 'shape-line', 'shape-polygon'] },
  { id: 'hand', key: 'h', tools: ['hand'] },
  { id: 'rotate', key: 'r', tools: ['rotate-view'] },
  { id: 'zoom', key: 'z', tools: ['zoom'] },
];

export const TOOL_LABELS: Record<ToolId, string> = {
  move: 'Move', 'marquee-rect': 'Rectangular Marquee', 'marquee-ellipse': 'Elliptical Marquee', 'marquee-row': 'Single Row Marquee', 'marquee-col': 'Single Column Marquee',
  lasso: 'Lasso', 'lasso-poly': 'Polygonal Lasso', 'lasso-magnetic': 'Magnetic Lasso',
  'object-select': 'Object Selection', 'quick-select': 'Quick Selection', 'magic-wand': 'Magic Wand',
  crop: 'Crop', 'crop-perspective': 'Perspective Crop', eyedropper: 'Eyedropper',
  'spot-heal': 'Spot Healing Brush', heal: 'Healing Brush', patch: 'Patch', 'red-eye': 'Red Eye',
  brush: 'Brush', pencil: 'Pencil', 'color-replace': 'Color Replacement', clone: 'Clone Stamp', 'history-brush': 'History Brush',
  eraser: 'Eraser', gradient: 'Gradient', bucket: 'Paint Bucket', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge',
  blur: 'Blur', sharpen: 'Sharpen', smudge: 'Smudge', pen: 'Pen', 'path-select': 'Path Selection', 'direct-select': 'Direct Selection',
  type: 'Horizontal Type', 'shape-rect': 'Rectangle', 'shape-ellipse': 'Ellipse', 'shape-line': 'Line', 'shape-polygon': 'Polygon',
  hand: 'Hand', 'rotate-view': 'Rotate View', zoom: 'Zoom',
};

/** Tools that lay down pixels with a brush tip (cursor = brush outline, [ ] resize). */
export const BRUSH_TOOLS = new Set<ToolId>(['brush', 'pencil', 'color-replace', 'eraser', 'clone', 'history-brush', 'heal', 'spot-heal', 'dodge', 'burn', 'sponge', 'blur', 'sharpen', 'smudge', 'quick-select']);
/** Alt turns these into the Eyedropper while held (clone/heal use Alt to set the source instead). */
export const ALT_EYEDROPPER_TOOLS = new Set<ToolId>(['brush', 'pencil', 'color-replace', 'bucket', 'gradient', 'shape-rect', 'shape-ellipse', 'shape-line', 'shape-polygon', 'type']);
/** Digit keys set the TOOL opacity for these; otherwise they set the active layer's opacity. */
export const OPACITY_TOOLS = new Set<ToolId>(['brush', 'pencil', 'color-replace', 'eraser', 'clone', 'history-brush', 'gradient', 'bucket']);

export const groupOf = (t: ToolId) => TOOL_GROUPS.find(g => g.tools.includes(t))!;
export const groupForKey = (key: string) => TOOL_GROUPS.find(g => g.key === key.toLowerCase());

export type Momentary = 'hand' | 'zoom-in' | 'zoom-out' | 'eyedropper' | 'move' | null;
export interface ToolState {
  tool: ToolId;
  /** Last tool used in each group (the rail shows it; the group key selects it). */
  last: Record<string, ToolId>;
  /** A letter held down: released after use or a long hold → back to `restore`. */
  spring: { key: string; restore: ToolId; at: number; used: boolean } | null;
  momentary: Momentary;
  /** Modifier/space state that produced `momentary`. */
  held: { space: boolean; alt: boolean; ctrl: boolean };
}
export type ToolEvent =
  | { type: 'select'; tool: ToolId }
  | { type: 'keydown'; key: string; shift?: boolean; at: number; repeat?: boolean }
  | { type: 'keyup'; key: string; at: number }
  | { type: 'modifiers'; space: boolean; alt: boolean; ctrl: boolean }
  | { type: 'used' };

export const SPRING_HOLD_MS = 350;

export function initialToolState(tool: ToolId = 'move'): ToolState {
  const last: Record<string, ToolId> = {}; for (const g of TOOL_GROUPS) last[g.id] = g.tools[0];
  last[groupOf(tool).id] = tool;
  return { tool, last, spring: null, momentary: null, held: { space: false, alt: false, ctrl: false } };
}

function momentaryFor(tool: ToolId, h: ToolState['held']): Momentary {
  if (h.space) return h.ctrl ? 'zoom-in' : h.alt ? 'zoom-out' : 'hand';
  if (h.ctrl && tool !== 'move' && tool !== 'type' && tool !== 'pen' && tool !== 'path-select' && tool !== 'direct-select' && tool !== 'hand' && tool !== 'zoom') return 'move';
  if (h.alt && ALT_EYEDROPPER_TOOLS.has(tool)) return 'eyedropper';
  return null;
}

export function toolReducer(s: ToolState, e: ToolEvent): ToolState {
  switch (e.type) {
    case 'select': { const g = groupOf(e.tool); return { ...s, tool: e.tool, last: { ...s.last, [g.id]: e.tool }, spring: null, momentary: momentaryFor(e.tool, s.held) }; }
    case 'keydown': {
      if (e.repeat) return s;
      const g = groupForKey(e.key); if (!g) return s;
      const cur = groupOf(s.tool);
      let tool: ToolId;
      if (e.shift && cur.id === g.id) { const cyc = g.cycle || g.tools; const i = cyc.indexOf(s.tool); tool = cyc[(i + 1) % cyc.length]; }
      else tool = s.last[g.id] || g.tools[0];
      const spring = s.spring && s.spring.key === e.key ? s.spring : { key: e.key.toLowerCase(), restore: s.tool, at: e.at, used: false };
      return { ...s, tool, last: { ...s.last, [g.id]: tool }, spring: tool === spring.restore ? null : spring, momentary: momentaryFor(tool, s.held) };
    }
    case 'keyup': {
      const sp = s.spring; if (!sp || sp.key !== e.key.toLowerCase()) return s;
      if (sp.used || e.at - sp.at >= SPRING_HOLD_MS) { const t = sp.restore; return { ...s, tool: t, spring: null, momentary: momentaryFor(t, s.held) }; }
      return { ...s, spring: null };
    }
    case 'modifiers': { const held = { space: e.space, alt: e.alt, ctrl: e.ctrl }; return { ...s, held, momentary: momentaryFor(s.tool, held) }; }
    case 'used': return s.spring && !s.spring.used ? { ...s, spring: { ...s.spring, used: true } } : s;
  }
}

/** The tool a pointer gesture uses right now. */
export function effectiveTool(s: ToolState): ToolId {
  switch (s.momentary) {
    case 'hand': return 'hand';
    case 'zoom-in': case 'zoom-out': return 'zoom';
    case 'eyedropper': return 'eyedropper';
    case 'move': return 'move';
    default: return s.tool;
  }
}

// ── Brush size / hardness / opacity keys ──────────────────────────────────────────────────
/** Photoshop's `[` / `]` steps: finer at small sizes. */
export function nextBrushSize(size: number, dir: 1 | -1): number {
  const step = size < 10 || (dir < 0 && size <= 10) ? 1 : size < 50 || (dir < 0 && size <= 50) ? 5 : size < 100 || (dir < 0 && size <= 100) ? 10 : size < 200 || (dir < 0 && size <= 200) ? 25 : size < 500 || (dir < 0 && size <= 500) ? 50 : 100;
  const next = dir > 0 ? Math.floor(size / step) * step + step : Math.ceil(size / step) * step - step;
  return Math.max(1, Math.min(5000, next));
}
export const nextHardness = (h: number, dir: 1 | -1) => Math.max(0, Math.min(1, Math.round((h + dir * 0.25) * 4) / 4));

/** Digit typing: "5" → 50 %, "0" → 100 %, "4","5" within 600 ms → 45 %. */
export function opacityFromDigits(prev: { digit: string; at: number } | null, digit: string, at: number): { value: number; memo: { digit: string; at: number } | null } {
  if (prev && at - prev.at < 600) return { value: Math.max(1, Number(prev.digit + digit)) / 100, memo: null };
  return { value: digit === '0' ? 1 : Number(digit) / 10, memo: { digit, at } };
}

export type RGB255 = [number, number, number];
export interface Colors { fg: RGB255; bg: RGB255 }
export const DEFAULT_COLORS: Colors = { fg: [0, 0, 0], bg: [255, 255, 255] };
export const swapColors = (c: Colors): Colors => ({ fg: c.bg, bg: c.fg });
