import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SLIDE_TEMPLATES, templateById } from '../../services/ambo/slideTemplates/registry';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import { slideToTela, telaToSlide } from '../../services/ambo/telaSlide';
import { saveTelaDoc } from '../../services/telaStore';
import { auth } from '../../services/backendService';
import type { LiveStack, Slide } from '../../services/ambo/showModel';
import type { TelaDoc } from '../../types';
import type { TVStudioEngine } from '../../services/tvStudioEngine';
const TelaView = lazy(() => import('../tela/TelaView'));

/** Dedicated CG controls using Ambo's templates, motion renderer, and native Tela editor. */
export default function AmboCGPanel({ visible, target }: { visible: boolean; target: () => TVStudioEngine | null }) {
  const [templateId, setTemplateId] = useState('welcome');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [onAir, setOnAir] = useState(false);
  const [docId, setDocId] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);
  const engineRef = useRef(target); engineRef.current = target;
  const template = templateById(templateId);
  const slideRef = useRef<Slide>({ id: 'live_cg', label: 'Live CG', layers: [] });
  const apply = (slide: Slide) => {
    slideRef.current = slide;
    const stack: LiveStack = {};
    for (const layer of slide.layers) stack[layer.slot] = { content: layer.content, transform: layer.transform, mask: layer.mask, since: performance.now() / 1000 };
    rendererRef.current?.setStack(stack);
  };
  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new LayerRenderer(canvasRef.current);
    renderer.setOptions({ alpha: true, audioEnabled: false }); renderer.start(); rendererRef.current = renderer;
    return () => { engineRef.current()?.removeOverlay('tela_live_cg'); renderer.dispose(); rendererRef.current = null; };
  }, []);
  useEffect(() => {
    const defaults = Object.fromEntries(template.fields.map(field => [field.key, field.default]));
    apply({ id: 'live_cg', label: 'Live CG', layers: [{ id: 'cg_template', slot: 'slide', content: { kind: 'TELA_TEMPLATE', templateId, fields: { ...defaults, ...fields } } }] });
  }, [templateId, fields]);
  useEffect(() => {
    const engine = target(); if (!engine || !canvasRef.current) return;
    engine.removeOverlay('tela_live_cg');
    if (onAir) engine.addOverlay({ id: 'tela_live_cg', label: `Tela CG · ${template.name}`, type: 'TELA', canvasEl: canvasRef.current, visible: true, opacity: 1 });
  }, [onAir, templateId]);
  const edit = async () => {
    const document = slideToTela(slideRef.current, auth.currentUser?.uid || 'local', Date.now());
    const result = await saveTelaDoc(document);
    if (result.ok) setDocId(document.id); else setError('Could not open this graphic in Tela.');
  };
  const updateDocument = (document: TelaDoc) => {
    try { apply(telaToSlide(document, slideRef.current)); } catch { setError('This document could not be rendered as a graphic.'); }
  };
  return <div className={`${visible ? 'flex' : 'hidden'} shrink-0 gap-4 p-3 rounded-xl border border-white/10 bg-[#14141b]`}>
    <canvas ref={canvasRef} className="w-48 aspect-video object-contain rounded-lg bg-black" />
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex flex-wrap gap-2 items-center"><span className="text-xs font-semibold">Tela / Ambo CG</span><select aria-label="CG template" value={templateId} onChange={e => { setTemplateId(e.target.value); setFields({}); }} className="bg-black text-xs p-2 rounded-lg max-w-48">{SLIDE_TEMPLATES.filter(t => t.fields.length && !['Photo', 'Video', 'Audio'].includes(t.category)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><button onClick={() => setOnAir(v => !v)} className={`p-2 rounded-lg text-xs ${onAir ? 'bg-red-500' : 'bg-white/10'}`}>{onAir ? 'Take CG off air' : 'Take CG to air'}</button><button onClick={() => void edit()} className="p-2 rounded-lg bg-white/10 text-xs">Edit in Tela</button></div>
      <div className="flex flex-wrap gap-2">{template.fields.slice(0, 4).map(field => <input key={field.key} aria-label={field.label} placeholder={field.label} value={fields[field.key] ?? field.default} onChange={e => setFields(prev => ({ ...prev, [field.key]: e.target.value }))} className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs w-40" />)}</div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
    {docId && createPortal(<div className="fixed inset-0 z-[450] bg-[#0a0a10]"><Suspense fallback={<p className="p-8">Opening Tela…</p>}><TelaView initialDocId={docId} onDocumentChange={updateDocument} onBack={() => setDocId('')} /></Suspense></div>, document.body)}
  </div>;
}
