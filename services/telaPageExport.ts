import type { TelaDoc, TelaFrame, TelaVectorDevice } from '../types';
import { deviceToSvg } from './tela/geometry/serialize';

const safeName = (value: string) => value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'tela';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTelaBoard(doc: TelaDoc) {
  downloadBlob(new Blob([JSON.stringify({ format: 'plajah-tela', version: 1, document: doc }, null, 2)], { type: 'application/vnd.plajah.tela+json' }), `${safeName(doc.title)}.tela`);
}

export function downloadTelaPage(doc: TelaDoc, frame: TelaFrame) {
  const devices = Object.fromEntries(frame.deviceIds.map(id => [id, doc.devices[id]]).filter(([, device]) => !!device));
  downloadBlob(new Blob([JSON.stringify({ format: 'plajah-tela-page', version: 1, title: doc.title, frame, devices }, null, 2)], { type: 'application/vnd.plajah.tela-page+json' }), `${safeName(frame.label || doc.title)}.tela-page.json`);
}

/**
 * The device as SVG, through the canonical serializer (services/tela/geometry/serialize):
 * same drawing as the editor — wrapped text, gradients, filters, blend modes, engine paints and
 * materials — on a white page. Hidden objects are not exported.
 */
export function telaVectorSvg(device: TelaVectorDevice): string {
  return deviceToSvg(device, { background: '#fff' });
}

export function downloadTelaVectorSvg(device: TelaVectorDevice, name: string) {
  downloadBlob(new Blob([telaVectorSvg(device)], { type: 'image/svg+xml' }), `${safeName(name)}.svg`);
}

export async function downloadTelaVectorPng(device: TelaVectorDevice, name: string) {
  const svg = telaVectorSvg(device); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = device.width; canvas.height = device.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas export is unavailable.');
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed.')), 'image/png'));
    downloadBlob(blob, `${safeName(name)}.png`);
  } finally { URL.revokeObjectURL(url); }
}
