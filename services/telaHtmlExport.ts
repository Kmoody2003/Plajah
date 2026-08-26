import type { TelaBaseDevice, TelaDoc, TelaFrame, TelaImageDevice, TelaVectorDevice, TelaVectorObject } from '../types';

const esc = (value: unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const safeCss = (value: string) => value.replace(/[{};<>]/g, '');

function vectorObject(o: TelaVectorObject) {
  const rotate = o.rotation ? ` transform="rotate(${o.rotation} ${o.x + o.w / 2} ${o.y + o.h / 2})"` : '';
  const paint = `fill="${esc(o.fill)}" stroke="${esc(o.stroke)}" stroke-width="${o.strokeWidth}" opacity="${o.opacity}"${rotate}`;
  if (o.kind === 'TEXT') return `<text x="${o.x}" y="${o.y + (o.fontSize || 16)}" font-family="${esc(o.fontFamily || 'system-ui')}" font-size="${o.fontSize || 16}" font-weight="${o.fontWeight || 400}" fill="${esc(o.fill)}" opacity="${o.opacity}"${rotate}>${esc(o.text)}</text>`;
  if (o.kind === 'RECT') return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="2" ${paint}/>`;
  if (o.kind === 'ELLIPSE') return `<ellipse cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${o.w / 2}" ry="${o.h / 2}" ${paint}/>`;
  if (o.kind === 'LINE' && o.points) return `<line x1="${o.points[0]}" y1="${o.points[1]}" x2="${o.points[2]}" y2="${o.points[3]}" ${paint}/>`;
  if (o.kind === 'PATH' && o.svgPathData) { const ox=o.pathOriginX??o.x, oy=o.pathOriginY??o.y, sx=o.w/Math.max(1,o.pathOriginW??o.w), sy=o.h/Math.max(1,o.pathOriginH??o.h); return `<path d="${esc(o.svgPathData)}" ${paint} transform="translate(${o.x} ${o.y}) scale(${sx} ${sy}) translate(${-ox} ${-oy})"/>`; }
  if (o.kind === 'PATH' && o.points) return `<${o.pathClosed ? 'polygon':'polyline'} points="${o.points.reduce((out,value,index) => index%2 ? out : `${out}${out?' ':''}${value},${o.points![index+1]}`,'')}" ${paint}/>`;
  if (o.kind === 'IMAGE' && o.sourceImageSrc && o.sourceCrop) { const c=o.sourceCrop; return `<svg x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" viewBox="${c.x} ${c.y} ${c.width} ${c.height}" preserveAspectRatio="none"${rotate}><image href="${esc(o.sourceImageSrc)}" width="${c.sourceWidth}" height="${c.sourceHeight}"/></svg>`; }
  return '';
}

function renderVector(device: TelaVectorDevice) { return `<svg class="tela-page-layer" viewBox="0 0 ${device.width} ${device.height}" aria-label="${esc(device.name || 'Tela design')}">${device.objects.map(vectorObject).join('')}</svg>`; }

function renderImage(device: TelaImageDevice) {
  return `<div class="tela-page-layer">${device.layers.filter(layer => layer.visible).map(layer => `<img alt="${esc(layer.name || '')}" src="${esc(layer.src)}" style="position:absolute;left:${layer.x}px;top:${layer.y}px;transform-origin:0 0;transform:rotate(${layer.rotation || 0}deg) scale(${layer.scale});opacity:${layer.opacity};mix-blend-mode:${safeCss(layer.blend)};filter:brightness(${layer.adjust.brightness}) contrast(${layer.adjust.contrast}) saturate(${layer.adjust.saturate}) blur(${layer.adjust.blur}px)"/>`).join('')}</div>`;
}

function renderForm(base: TelaBaseDevice | null) {
  if (!base) return '';
  return `<form class="tela-form-layer" onsubmit="event.preventDefault();this.querySelector('[data-done]').hidden=false">${base.fields.filter(field => field.layout).map(field => { const b=field.layout!; const style=`left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%`;
    if (field.type === 'SELECT') return `<select aria-label="${esc(field.name)}" name="${esc(field.id)}" style="${style}"><option value="">Choose…</option>${(field.options || []).map(option => `<option>${esc(option)}</option>`).join('')}</select>`;
    if (field.type === 'CHECKBOX') return `<input aria-label="${esc(field.name)}" name="${esc(field.id)}" type="checkbox" style="${style}"/>`;
    return b.h > 6 ? `<textarea aria-label="${esc(field.name)}" name="${esc(field.id)}" style="${style}"></textarea>` : `<input aria-label="${esc(field.name)}" name="${esc(field.id)}" ${field.type === 'NUMBER' ? 'inputmode="decimal"':''} style="${style}">`;
  }).join('')}<button class="tela-submit">Submit</button><output data-done hidden>Submitted ✓</output></form>`;
}

function chooseFrame(doc: TelaDoc, frameId?: string): TelaFrame { const frame=(frameId && doc.frames.find(item => item.id === frameId)) || doc.frames[0]; if (!frame) throw new Error('This Tela document has no frame to export.'); return frame; }

export function telaDocumentToHtml(doc: TelaDoc, frameId?: string) {
  const frame=chooseFrame(doc,frameId); let page=''; let form='';
  for (const id of frame.deviceIds) { const device=doc.devices[id]; if (!device) continue; if (device.type==='VECTOR') page+=renderVector(device); else if (device.type==='IMAGE') page+=renderImage(device); else if (device.type==='WRITER') page+=`<article class="tela-writer">${device.blocks.map(block => `<${block.kind === 'p' ? 'p' : block.kind === 'li' ? 'li' : block.kind} data-semantic="${esc(block.textRole || '')}">${block.text}</${block.kind === 'p' ? 'p' : block.kind === 'li' ? 'li' : block.kind}>`).join('')}</article>`; else if (device.type==='NOTES') page+=`<section class="tela-notes"><header><strong>${esc(device.name || 'Tela Notes')}</strong><span>${device.entries.length} entries</span></header>${device.entries.map(entry => `<article><small>${esc(entry.kind.replace('_',' '))}</small><h2>${esc(entry.title)}</h2>${entry.blocks.map(block => `<p>${block.text}</p>`).join('')}${entry.tags.length ? `<footer>${entry.tags.map(tag => `<span>#${esc(tag)}</span>`).join('')}</footer>`:''}</article>`).join('')}</section>`; else if (device.type==='FORM') { const base=device.baseDeviceId ? doc.devices[device.baseDeviceId] : null; form=renderForm(base?.type==='BASE' ? base:null); } }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141318;font-family:Inter,system-ui,sans-serif}.tela-page{position:relative;width:min(calc(100vw - 24px),${frame.w}px);aspect-ratio:${frame.w}/${frame.h};overflow:auto;background:#fff;box-shadow:0 24px 70px #0008}.tela-page-layer,.tela-form-layer{position:absolute;inset:0;width:100%;height:100%}.tela-form-layer input,.tela-form-layer textarea,.tela-form-layer select{position:absolute;border:1.5px solid #00a8bc;border-radius:7px;background:#ffffffe8;padding:4px 7px;font:inherit}.tela-submit{position:absolute;right:2%;bottom:2%;border:0;border-radius:999px;padding:10px 18px;color:#fff;font-weight:800;background:linear-gradient(135deg,#6b0099,#d40055)}output{position:absolute;right:2%;bottom:8%;color:#16815c;font-weight:800}.tela-writer{padding:7%;color:#1b1523}.tela-writer h1{font-size:clamp(2rem,7vw,5rem)}.tela-writer [data-semantic=LYRIC]{border-left:3px solid #ff8c0066;padding-left:12px}.tela-writer [data-semantic=POETRY]{border-left:3px solid #d4005566;padding-left:12px}.tela-notes{padding:5%;color:#1b1523}.tela-notes>header{display:flex;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid #e7e0ea}.tela-notes article{padding:20px 0;border-bottom:1px solid #eee}.tela-notes small{color:#6b0099;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.tela-notes h2{margin:.35rem 0}.tela-notes footer{display:flex;gap:6px}.tela-notes footer span{font-size:.75rem;background:#eee6f1;padding:4px 8px;border-radius:999px}</style></head><body><main class="tela-page">${page}${form}</main></body></html>`;
}

export function downloadTelaHtml(doc: TelaDoc, frameId?: string) { const blob=new Blob([telaDocumentToHtml(doc,frameId)],{ type:'text/html' }); const url=URL.createObjectURL(blob); const anchor=document.createElement('a'); anchor.href=url; anchor.download=`${(doc.title || 'Tela document').replace(/[^\w\-]+/g,'_')}.html`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
