import type { TelaDoc, TelaFrame, TelaVectorDevice, TelaVectorObject } from '../types';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
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

function objectSvg(object: TelaVectorObject): string {
  const transform = object.rotation ? ` transform="rotate(${object.rotation} ${object.x + object.w / 2} ${object.y + object.h / 2})"` : '';
  const paint = `fill="${esc(object.fill)}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}"${transform}`;
  if (object.kind === 'RECT') return `<rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" rx="2" ${paint}/>`;
  if (object.kind === 'ELLIPSE') return `<ellipse cx="${object.x + object.w / 2}" cy="${object.y + object.h / 2}" rx="${object.w / 2}" ry="${object.h / 2}" ${paint}/>`;
  if (object.kind === 'LINE' && object.points) return `<line x1="${object.points[0]}" y1="${object.points[1]}" x2="${object.points[2]}" y2="${object.points[3]}" ${paint}/>`;
  if (object.kind === 'PATH' && object.svgPathData) return `<path d="${esc(object.svgPathData)}" ${paint}/>`;
  if (object.kind === 'PATH' && object.points) return `<${object.pathClosed ? 'polygon' : 'polyline'} points="${object.points.reduce((rows: string[], value, index) => index % 2 ? rows : [...rows, `${value},${object.points![index + 1]}`], []).join(' ')}" ${paint}/>`;
  if (object.kind === 'IMAGE' && object.sourceImageSrc) return `<image href="${esc(object.sourceImageSrc)}" x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" opacity="${object.opacity}"${transform}/>`;
  if (object.kind === 'TEXT') return `<text x="${object.x}" y="${object.y + (object.fontSize || 24)}" fill="${esc(object.fill)}" opacity="${object.opacity}" font-size="${object.fontSize || 24}" font-family="${esc(object.fontFamily || 'system-ui,sans-serif')}" font-weight="${object.fontWeight || 400}"${transform}>${esc(object.text || '')}</text>`;
  return '';
}

export function telaVectorSvg(device: TelaVectorDevice): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${device.width}" height="${device.height}" viewBox="0 0 ${device.width} ${device.height}"><rect width="100%" height="100%" fill="#fff"/>${device.objects.map(objectSvg).join('')}</svg>`;
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
