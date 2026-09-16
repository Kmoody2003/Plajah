// lowerThirdToTela — hand a lower third's resting frame to Tela as editable
// vector objects (1920×1080 SCREEN artboard). Used for gallery proofs and the
// "Open design in Tela" action in Fabula's inspector.
import type { TelaVectorObject } from '../../types';
import { applyGraphicRef, evaluateLowerThird, type LowerThirdSpec, type LTGraphicRef, LT_W, LT_H } from './lowerThirds';
import { rect, ellipse, line, path, text } from '../tela/templateKit';
import { newTelaId, saveTelaDoc } from '../telaStore';
import { auth } from '../backendService';
import type { TelaDoc, TelaVectorDevice } from '../../types';

/** Build a Tela document (1920×1080 SCREEN frame) from a lower third and open it in Tela. */
export async function openLowerThirdInTela(spec: LowerThirdSpec, ref?: LTGraphicRef | null, texts?: { title: string; subtitle?: string; tag?: string }, origin?: { x: number; y: number }): Promise<TelaDoc> {
  const objects = lowerThirdToTelaObjects(spec, ref, texts, origin, { ground: '#2A2A2E' });
  const now = Date.now();
  const device: TelaVectorDevice = { id: `dev_${now.toString(36)}`, type: 'VECTOR', name: `${spec.name} · lower third`, width: LT_W, height: LT_H, objects };
  const doc: TelaDoc = {
    id: newTelaId(), ownerId: auth.currentUser?.uid || 'local', title: `${spec.name} · lower third`, createdAt: now, updatedAt: now, bindings: [],
    frames: [{ id: `frame_${now.toString(36)}`, kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: LT_W, h: LT_H, deviceIds: [device.id], label: `${spec.name} · 1920×1080` }],
    devices: { [device.id]: device },
  } as TelaDoc;
  await saveTelaDoc(doc);
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
  return doc;
}

export function lowerThirdToTelaObjects(spec: LowerThirdSpec, ref?: LTGraphicRef | null, texts?: { title: string; subtitle?: string; tag?: string }, origin?: { x: number; y: number }, opts: { ground?: string | null } = {}): TelaVectorObject[] {
  const s = applyGraphicRef(spec, ref);
  const r = evaluateLowerThird(s, 1e6, Infinity, texts || s.defaults, origin);
  const out: TelaVectorObject[] = [];
  const ground = opts.ground === undefined ? '#2A2A2E' : opts.ground;
  if (ground) out.push(rect(0, 0, LT_W, LT_H, ground, { label: 'Video frame (preview ground)', role: 'GROUND' }));
  for (const l of r.layers) {
    const common = { opacity: l.opacity, rotation: l.rotation, label: l.layer.label, stroke: l.stroke, strokeWidth: l.layer.strokeWidth, rx: l.layer.rx, dash: l.layer.dash, gradient: l.gradient ? { kind: 'LINEAR' as const, angle: l.gradient.angle, stops: [{ offset: 0, color: l.gradient.from }, { offset: 1, color: l.gradient.to }] } : undefined };
    if (l.layer.kind === 'rect') out.push(rect(l.x, l.y, l.w, l.h, l.fill, common));
    else if (l.layer.kind === 'ellipse') out.push(ellipse(l.x, l.y, l.w, l.h, l.fill, common));
    else if (l.layer.kind === 'line') out.push(line(l.x, l.y, l.x + l.w, l.y + l.h, l.stroke || l.fill, l.layer.strokeWidth || 2, { label: l.layer.label, dash: l.layer.dash }));
    else if (l.layer.kind === 'path' && l.layer.path) out.push(path(l.x, l.y, l.w, l.h, l.layer.path, l.fill, common));
  }
  for (const tx of [r.tag, r.title, r.subtitle]) {
    if (!tx) continue;
    const role = tx.role;
    out.push(text(tx.x, tx.y, tx.w, tx.text, { size: role.size, font: role.font, weight: role.weight, color: tx.color, align: role.align, tracking: role.tracking, leading: role.lineHeight ?? 1.12, italic: role.italic, rotation: role.rotation, transform: role.upper ? 'uppercase' : 'none', wrap: true, label: tx === r.title ? 'Title' : tx === r.subtitle ? 'Subtitle' : 'Tag', role: tx === r.title ? 'HEADLINE' : tx === r.subtitle ? 'DECK' : 'LABEL', shadow: role.shadow ? { x: 0, y: 2, blur: 6, color: 'rgba(0,0,0,.5)' } : undefined }));
  }
  return out;
}
