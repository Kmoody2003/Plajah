import React from 'react';
import { Box, Dna, Download, File, FileArchive, FileType2, Music2, Ruler } from 'lucide-react';
import type { TelaMediaDevice } from '../../types';

const shell: React.CSSProperties = { width: '100%', height: '100%', minHeight: 180, display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#111018', color: '#fff' };

export default function TelaMedia({ device, readOnly }: { device: TelaMediaDevice; readOnly?: boolean }) {
  const common = { src: device.src, title: device.name };
  if (device.bio) {
    const b = device.bio;
    const reopen = () => window.dispatchEvent(new CustomEvent('tela:open-bio', { detail: { structure: b } }));
    return <div style={{ ...shell, position: 'relative', minHeight: device.height, background: 'radial-gradient(circle,#1a2026,#08090b 72%)' }}>
      {React.createElement('model-viewer', { src: device.src, alt: b.title, 'camera-controls': true, 'auto-rotate': true, style: { width: '100%', height: '100%', background: 'transparent' } })}
      <div style={{ position: 'absolute', left: 10, bottom: 8, right: 10, display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, opacity: .8, flexWrap: 'wrap' }}><Dna size={13}/><strong>{b.id}</strong><span>{b.stats.residues} residues · {b.stats.chains} chain{b.stats.chains === 1 ? '' : 's'}</span><span style={{ opacity: .75 }}>{b.credit} · {b.licence}</span></div>
      {!readOnly && <button onClick={reopen} style={{ position: 'absolute', right: 10, top: 10, padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)', fontWeight: 700, fontSize: 12 }}>Open in Biology Lab</button>}
    </div>;
  }
  if (device.cad) {
    const c = device.cad; const big = Math.max(...c.stats.sizeMm) >= 5000;
    const size = c.stats.sizeMm.slice(0, c.role === 'DRAFT_2D' ? 2 : 3).map(v => big ? `${(v / 1000).toFixed(2)} m` : `${Math.round(v)} mm`).join(' × ');
    const reopen = () => window.dispatchEvent(new CustomEvent('tela:open-cad', { detail: { deviceId: device.id, cad: c } }));
    return <div style={{ ...shell, position: 'relative', minHeight: device.height, background: c.role === 'DRAFT_2D' ? '#0b0b10' : 'radial-gradient(circle,#232a36,#0d0f14 70%)' }}>
      {c.role === 'DRAFT_2D'
        ? <img src={device.src} alt={device.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>
        : React.createElement('model-viewer', { src: device.src, alt: device.name, 'camera-controls': true, 'shadow-intensity': '0.6', style: { width: '100%', height: '100%', background: 'transparent' } })}
      <div style={{ position: 'absolute', left: 10, bottom: 8, display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, opacity: .75 }}><Ruler size={13}/>{device.name} · {c.format.toUpperCase()} · {size}{c.stats.elements ? ` · ${c.stats.elements} elements` : ''}</div>
      {!readOnly && <button onClick={reopen} style={{ position: 'absolute', right: 10, top: 10, padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', fontWeight: 700, fontSize: 12 }}>Open in CAD</button>}
    </div>;
  }
  if (device.kind === 'IMAGE') return <div style={shell}><img {...common} alt={device.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>;
  if (device.kind === 'AUDIO') return <div style={{ ...shell, padding: 28, background: 'radial-gradient(circle at 50% 20%,#312044,#111018 62%)' }}><div style={{ width: 'min(560px,90%)', textAlign: 'center' }}><Music2 size={48} style={{ margin: '0 auto 18px', color: '#D0BCFF' }}/><strong style={{ display: 'block', marginBottom: 18, overflow: 'hidden', textOverflow: 'ellipsis' }}>{device.name}</strong><audio {...common} controls preload="metadata" style={{ width: '100%' }}/></div></div>;
  if (device.kind === 'VIDEO') return <div style={shell}><video {...common} controls preload="metadata" playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }}/></div>;
  if (device.kind === 'MODEL_3D' && /\.(glb|gltf)(?:$|[?#])/i.test(device.name)) return <div style={{ ...shell, position: 'relative', minHeight: device.height }}>{React.createElement('model-viewer', { src: device.src, alt: device.name, 'camera-controls': true, 'auto-rotate': true, 'shadow-intensity': '1', style: { width: '100%', height: '100%', background: 'radial-gradient(circle,#30283d,#111018 70%)' } })}<div style={{ position: 'absolute', left: 12, bottom: 10, display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, opacity: .7 }}><Box size={13}/>Drag to orbit · scroll to zoom</div>{device.argillaProjectId && !readOnly && <button onClick={() => window.dispatchEvent(new CustomEvent('tela:open-argilla', { detail: { projectId: device.argillaProjectId } }))} style={{ position: 'absolute', right: 10, top: 10, padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#6B0099,#D40055)', fontWeight: 700, fontSize: 12 }}>Keep sculpting</button>}</div>;
  if (device.kind === 'PDF') return <object data={device.src} type="application/pdf" aria-label={device.name} style={{ width: '100%', height: '100%', minHeight: 420 }}><a href={device.src} download={device.name}>Open {device.name}</a></object>;
  const Icon = device.kind === 'MODEL_3D' ? Box : device.kind === 'ARCHIVE' ? FileArchive : device.kind === 'FONT' ? FileType2 : File;
  return <div style={{ ...shell, padding: 30 }}><div style={{ textAlign: 'center', maxWidth: 420 }}><Icon size={54} style={{ margin: '0 auto 18px', color: '#D0BCFF' }}/><strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{device.name}</strong><span style={{ display: 'block', margin: '8px 0 20px', opacity: .55, fontSize: 12 }}>{device.mimeType || 'File'} · {(device.size / 1048576).toFixed(device.size > 1048576 ? 1 : 2)} MB</span><a href={device.src} download={device.name} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '9px 14px', borderRadius: 9, color: '#fff', background: 'linear-gradient(135deg,#6B0099,#D40055)', textDecoration: 'none', fontWeight: 700, fontSize: 12 }}><Download size={14}/>Download asset</a>{device.sessionOnly && <small style={{ display: 'block', marginTop: 12, color: '#FBBF24' }}>Sign in to keep this asset after this session.</small>}</div></div>;
}
