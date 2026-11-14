// cgToTela — hand a CG graphic's resting frame to Tela as editable vector objects
// on a 1920×1080 SCREEN artboard (same contract as lowerThirdToTela). Tela is the
// design surface behind Fabula CG: fonts, palettes and type pairings come from
// Tela, and any graphic can be opened there for print/social spin-offs.
import type { TelaVectorObject, TelaDoc, TelaVectorDevice } from '../../../types';
import { rect, ellipse, line, path, text } from '../../tela/templateKit';
import { newTelaId, saveTelaDoc } from '../../telaStore';
import { auth } from '../../backendService';
import { evaluateCg, resolveCgColor } from './cgEvaluate';
import { CG_W, CG_H, type CgGraphic, type CgGraphicRef } from './cgTypes';

export function cgToTelaObjects(g: CgGraphic, ref?: CgGraphicRef | null, opts: { ground?: string | null } = {}): TelaVectorObject[] {
  const f = evaluateCg(g, 1e5, Infinity, ref, { now: Date.now() });
  const out: TelaVectorObject[] = [];
  const ground = opts.ground === undefined ? '#2A2A2E' : opts.ground;
  if (ground) out.push(rect(0, 0, CG_W, CG_H, ground, { label: 'Video frame (preview ground)', role: 'GROUND' }));
  for (const r of f.layers) {
    const l = r.layer, pal = f.palette;
    const fill = resolveCgColor(l.fill || 'accent', pal);
    const grad = l.gradient && l.gradient.type === 'linear' ? { kind: 'LINEAR' as const, angle: l.gradient.angle ?? 90, stops: l.gradient.stops.map(([o, c]) => ({ offset: o, color: resolveCgColor(c, pal) })) } : undefined;
    const common = { opacity: r.opacity, rotation: r.rotation, label: l.name, stroke: l.stroke ? resolveCgColor(l.stroke, pal) : undefined, strokeWidth: l.strokeWidth, rx: l.radius, dash: l.dash, gradient: grad };
    switch (l.kind) {
      case 'rect': case 'grid': case 'bars': case 'glow': case 'image': out.push(rect(r.x, r.y, r.w, r.h, l.kind === 'image' ? resolveCgColor('shade', pal) : fill, common)); break;
      case 'ellipse': out.push(ellipse(r.x, r.y, r.w, r.h, fill, common)); break;
      case 'line': out.push(line(r.x, r.y, r.x + r.w, r.y + r.h, resolveCgColor(l.stroke || l.fill || 'accent', pal), l.strokeWidth || 2, { label: l.name, dash: l.dash })); break;
      case 'path': if (l.path) out.push(path(r.x, r.y, r.w, r.h, l.path, fill, common)); break;
      case 'text': case 'clock': case 'ticker': {
        const st = l.style; if (!st) break;
        const content = r.text ?? (r.items || []).join('  •  ');
        if (!content) break;
        out.push(text(r.x, r.y, r.w, content, {
          size: st.size, font: st.font, weight: st.weight, color: resolveCgColor(st.color, pal), align: st.align,
          tracking: st.tracking, leading: st.lineHeight ?? 1.15, italic: st.italic, transform: st.upper ? 'uppercase' : 'none', wrap: true, label: l.name,
          shadow: st.shadow ? { x: st.shadow.x || 0, y: st.shadow.y ?? 2, blur: st.shadow.blur, color: resolveCgColor(st.shadow.color, pal) } : undefined,
        } as never));
        break;
      }
    }
  }
  return out;
}

export async function openCgInTela(g: CgGraphic, ref?: CgGraphicRef | null): Promise<TelaDoc> {
  const objects = cgToTelaObjects(g, ref);
  const now = Date.now();
  const device: TelaVectorDevice = { id: `dev_${now.toString(36)}`, type: 'VECTOR', name: g.name, width: CG_W, height: CG_H, objects };
  const doc = {
    id: newTelaId(), ownerId: auth.currentUser?.uid || 'local', title: `${g.name} · Fabula CG`, createdAt: now, updatedAt: now, bindings: [],
    frames: [{ id: `frame_${now.toString(36)}`, kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: CG_W, h: CG_H, deviceIds: [device.id], label: `${g.name} · 1920×1080` }],
    devices: { [device.id]: device },
  } as unknown as TelaDoc;
  await saveTelaDoc(doc);
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
  return doc;
}
