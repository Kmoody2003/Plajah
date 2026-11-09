// Menu page ⇄ Tela. "Design in Tela" opens the menu as a 1920×1080 SCREEN artboard; buttons are
// a hit-area rect labelled "BUTTON:<id>" plus a text labelled "BUTTON_LABEL:<id>". Pulling the
// doc back maps those labels onto the menu's buttons and everything else onto decor.
import type { TelaDoc, TelaVectorDevice, TelaVectorObject } from '../../types';
import { image, rect, text } from '../tela/templateKit';
import { GRAPHICS_PLANE } from './spec';
import { uid, type DiscMenu, type MenuDecor } from './project';
import { toPlane } from './telaArt';

const { w: W, h: H } = GRAPHICS_PLANE;
const ROLE_BTN = 'BUTTON:', ROLE_LABEL = 'BUTTON_LABEL:', ROLE_BG = 'MENU_BACKGROUND';

const textBox = (x: number, align?: string) => (align === 'center' ? { x: x - 900, w: 1800 } : align === 'right' ? { x: x - 1200, w: 1200 } : { x, w: Math.max(200, W - x - 40) });

export function menuToTelaObjects(menu: DiscMenu, bgPreview?: string): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  if (menu.background.kind === 'image' && menu.background.value) out.push(image(0, 0, W, H, menu.background.value, W, H, { label: ROLE_BG, role: 'GROUND' }));
  else if (bgPreview) out.push(image(0, 0, W, H, bgPreview, W, H, { label: `${ROLE_BG} (preview — motion background)`, role: 'GROUND' }));
  else out.push(rect(0, 0, W, H, menu.background.kind === 'color' && menu.background.value !== 'transparent' ? menu.background.value : '#202024', { label: ROLE_BG, role: 'GROUND' }));
  // Council menus: the real Tela art layer, then each button's normal-state art on the plane.
  if (menu.art?.length) out.push(...menu.art.map(o => ({ ...o, objectLabel: o.objectLabel?.startsWith('ART:') ? o.objectLabel : `ART:${o.objectLabel || o.kind}` })));
  for (const d of menu.art?.length ? [] : menu.decor) {
    if (d.kind === 'rect') out.push(rect(d.x, d.y, d.w, d.h, d.fill, { rx: d.radius, opacity: d.opacity, label: `DECOR:${d.id}` }));
    else if (d.kind === 'image') out.push(image(d.x, d.y, d.w, d.h, d.src, d.w, d.h, { opacity: d.opacity, label: `DECOR:${d.id}` }));
    else { const b = textBox(d.x, d.align); out.push(text(b.x, d.y, b.w, d.text, { size: d.size, font: d.font, color: d.color, weight: d.weight, align: d.align, tracking: d.letterSpacing, wrap: false, label: `DECOR:${d.id}` })); }
  }
  for (const b of menu.buttons) {
    if (b.art) {
      out.push(...toPlane(b, b.art.normal).map(o => ({ ...o, objectLabel: `BUTTON_ART:${b.id}` })));
      out.push(rect(b.x, b.y, b.w, b.h, 'rgba(255,255,255,0.001)', { stroke: 'rgba(127,212,255,0.35)', strokeWidth: 1, dash: [6, 6], label: `${ROLE_BTN}${b.id}`, role: 'LABEL' }));
      continue;
    }
    out.push(rect(b.x, b.y, b.w, b.h, b.style.bg || 'rgba(255,255,255,0.04)', { rx: b.style.radius, stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, dash: [6, 6], label: `${ROLE_BTN}${b.id}`, role: 'LABEL' }));
    out.push(text(b.x + 12, b.y + (b.h - b.style.size * 1.2) / 2, b.w - 24, b.label, { size: b.style.size, font: b.style.font, weight: b.style.weight, color: b.style.color, align: b.style.align, wrap: false, label: `${ROLE_LABEL}${b.id}`, role: 'LABEL' }));
  }
  return out;
}

export function menuToTelaDoc(menu: DiscMenu, opts: { ownerId: string; discName: string; bgPreview?: string; id: string }): TelaDoc {
  const now = Date.now();
  const device: TelaVectorDevice = { id: `dev_${now.toString(36)}`, type: 'VECTOR', name: `${opts.discName} · ${menu.name}`, width: W, height: H, objects: menuToTelaObjects(menu, opts.bgPreview) };
  return {
    id: opts.id, ownerId: opts.ownerId, title: `${opts.discName} · ${menu.name} (disc menu)`, createdAt: now, updatedAt: now, bindings: [],
    frames: [{ id: `frame_${now.toString(36)}`, kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: W, h: H, deviceIds: [device.id], label: `${menu.name} · 1920×1080 graphics plane` }],
    devices: { [device.id]: device },
  } as unknown as TelaDoc;
}

/** Pull a Tela design back into the menu: button geometry/labels/colours + all other art as decor. */
export function telaToMenu(doc: TelaDoc, menu: DiscMenu): DiscMenu {
  const devices = Object.values((doc as any).devices || {}) as TelaVectorDevice[];
  const objs: TelaVectorObject[] = devices.flatMap(d => (d.type === 'VECTOR' ? d.objects || [] : []));
  const buttons = menu.buttons.map(b => {
    const hit = objs.find(o => o.objectLabel === `${ROLE_BTN}${b.id}`);
    const lab = objs.find(o => o.objectLabel === `${ROLE_LABEL}${b.id}`);
    return {
      ...b,
      ...(hit ? { x: Math.round(hit.x), y: Math.round(hit.y), w: Math.round(hit.w), h: Math.round(hit.h) } : {}),
      label: lab?.text ?? b.label,
      style: { ...b.style, ...(lab ? { size: lab.fontSize || b.style.size, color: lab.fill || b.style.color, weight: lab.fontWeight ?? b.style.weight, align: (lab.textAlign as any) || b.style.align } : {}),
        ...(hit && hit.fill && !hit.fill.startsWith('rgba(255,255,255,0.04)') ? { bg: hit.fill } : {}) },
    };
  });
  if (menu.art?.length) {
    // Art menus keep full Tela fidelity: everything that isn't a button or the ground is the art layer.
    const art = objs.filter(o => { const l = o.objectLabel || ''; return !l.startsWith(ROLE_BTN) && !l.startsWith(ROLE_LABEL) && !l.startsWith('BUTTON_ART:') && !l.startsWith(ROLE_BG); });
    const moved = menu.buttons.map(b => { const hit = objs.find(o => o.objectLabel === `${ROLE_BTN}${b.id}`); return hit ? { ...b, x: Math.round(hit.x), y: Math.round(hit.y) } : b; });
    return { ...menu, art, buttons: moved, telaDocId: doc.id };
  }
  const decor: MenuDecor[] = [];
  let background = menu.background;
  for (const o of objs) {
    const lbl = o.objectLabel || '';
    if (lbl.startsWith(ROLE_BTN) || lbl.startsWith(ROLE_LABEL)) continue;
    if (lbl.startsWith(ROLE_BG)) {
      if (!lbl.includes('preview')) background = o.kind === 'IMAGE' && (o as any).src ? { kind: 'image', value: (o as any).src } : o.kind === 'RECT' ? { kind: 'color', value: o.fill } : background;
      continue;
    }
    const id = lbl.startsWith('DECOR:') ? lbl.slice(6) : uid('dec');
    if (o.kind === 'TEXT') {
      const align = (o.textAlign as 'left' | 'center' | 'right') || 'left';
      decor.push({ kind: 'text', id, text: o.text || '', x: Math.round(align === 'center' ? o.x + o.w / 2 : align === 'right' ? o.x + o.w : o.x), y: Math.round(o.y), size: o.fontSize || 32, font: (o.fontFamily || 'Inter').split(',')[0].replace(/"/g, ''), color: o.fill, weight: o.fontWeight, align, letterSpacing: o.letterSpacing });
    } else if (o.kind === 'IMAGE' && (o as any).src) decor.push({ kind: 'image', id, x: o.x, y: o.y, w: o.w, h: o.h, src: (o as any).src, opacity: o.opacity });
    else if (o.kind === 'RECT' || o.kind === 'ELLIPSE') decor.push({ kind: 'rect', id, x: o.x, y: o.y, w: o.w, h: o.h, fill: o.fill, radius: o.kind === 'ELLIPSE' ? Math.min(o.w, o.h) / 2 : o.rx, opacity: o.opacity });
  }
  return { ...menu, buttons, decor, background, telaDocId: doc.id };
}
