import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, Check, Link2, Plus, Type, Image as ImageIcon, Video, Square, Zap, Eye, EyeOff, Lock, Unlock, AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Italic, Underline, Strikethrough, ChevronDown, ChevronUp, Layers, MousePointer2 } from 'lucide-react';
import type { Slide } from '../../services/ambo/showModel';
import { slideToTela, telaToSlide } from '../../services/ambo/telaSlide';
import { FONTS, FontKey, ensureFontsLoaded, fontCss } from '../../services/tela/telaFonts';
import { applyTelaOp, TelaOp } from '../../components/tela/telaOps';
import { getAvailableFonts, loadFont, AvailableFont } from '../../services/systemFonts';
import type { TelaDoc, TelaDevice, TelaWriterDevice, TelaBlock, TelaImageDevice, TelaVectorDevice } from '../../types';

interface AmboSlideEditorProps {
  slide: Slide;
  boundRef?: string | null;
  onSave: (text: string) => void;
  onClose: () => void;
}

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const CYAN = '#00DAF3';
const LILAC = '#D0BCFF';
const line = 'rgba(255,255,255,0.09)';
const line2 = 'rgba(255,255,255,0.15)';
const glass = 'rgba(255,255,255,0.04)';

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
];

export default function AmboSlideEditor({ slide, boundRef, onSave, onClose }: AmboSlideEditorProps) {
  const [doc, setDoc] = useState<TelaDoc>(() => slideToTela(slide));
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<AvailableFont[]>([]);
  const [scriptureFont, setScriptureFont] = useState('Palatino Linotype');
  const [referenceFont, setReferenceFont] = useState('Inter');
  
  const frame = doc.frames[0];
  const frameId = frame?.id;

  useEffect(() => {
    setFonts(getAvailableFonts());
  }, []);

  const dispatch = (op: TelaOp) => {
    setDoc(prev => applyTelaOp(prev, op));
  };

  const save = () => {
    const text = doc.frames[0]?.deviceIds
      .map(id => doc.devices[id])
      .filter(d => d?.type === 'WRITER')
      .map(d => (d as TelaWriterDevice).blocks.map(b => b.text).join('\n'))
      .join('\n') || '';
    onSave(text);
    onClose();
  };

  // Layers in reverse order for the panel (top visually is last in array)
  const layerDevices = useMemo(() => {
    if (!frame) return [];
    return frame.deviceIds.map(id => doc.devices[id]).filter(Boolean).reverse();
  }, [doc, frame]);

  const selectedDevice = selectedDeviceId ? doc.devices[selectedDeviceId] : null;

  const addDevice = (type: 'WRITER' | 'IMAGE' | 'VECTOR') => {
    if (!frameId) return;
    const newId = `dev_${Math.random().toString(36).slice(2, 9)}`;
    let device: TelaDevice;
    if (type === 'WRITER') {
      device = { id: newId, type: 'WRITER', blocks: [{ id: 'b1', kind: 'p', text: 'New Text' }], mode: 'DOCUMENT' } as TelaWriterDevice;
    } else if (type === 'IMAGE') {
      device = { id: newId, type: 'IMAGE', layers: [], width: 1920, height: 1080 } as TelaImageDevice;
    } else {
      device = { id: newId, type: 'VECTOR', objects: [], width: 1920, height: 1080 } as TelaVectorDevice;
    }
    dispatch({ type: 'ADD_DEVICES_TO_FRAME', frameId, devices: [device] });
    setSelectedDeviceId(newId);
  };

  const updateSelectedWriter = (blocks: TelaBlock[]) => {
    if (!selectedDeviceId) return;
    dispatch({ type: 'SET_WRITER_BLOCKS', deviceId: selectedDeviceId, blocks });
  };

  return (
    <div className="fixed inset-0 z-[130] flex flex-col text-white" style={{ background: '#08060f' }}>
      {/* TOOLBAR */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b backdrop-blur-xl flex-none" style={{ borderColor: line, background: 'rgba(10,7,17,0.72)' }}>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors">
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-px h-4" style={{ background: line }} />
        
        <div className="flex items-center gap-1">
          <button onClick={() => addDevice('WRITER')} className="p-2 rounded hover:bg-white/10" title="Add Text"><Type size={16} /></button>
          <button onClick={() => addDevice('IMAGE')} className="p-2 rounded hover:bg-white/10" title="Add Image"><ImageIcon size={16} /></button>
          <button onClick={() => addDevice('VECTOR')} className="p-2 rounded hover:bg-white/10" title="Add Shape"><Square size={16} /></button>
        </div>

        <div className="w-px h-4 mx-2" style={{ background: line }} />

        {selectedDevice?.type === 'WRITER' && (
          <div className="flex items-center gap-1">
            <select className="bg-transparent border outline-none rounded px-2 py-1 text-sm" style={{ borderColor: line }}>
              {fonts.slice(0, 50).map(f => (
                <option key={f.family} value={f.family} style={{ fontFamily: fontCss(f.family) }}>{f.family}</option>
              ))}
            </select>
            <input type="number" defaultValue={54} className="w-16 bg-transparent border rounded px-2 py-1 outline-none text-sm" style={{ borderColor: line }} />
            <button className="p-1.5 rounded hover:bg-white/10"><Bold size={14} /></button>
            <button className="p-1.5 rounded hover:bg-white/10"><Italic size={14} /></button>
            <button className="p-1.5 rounded hover:bg-white/10"><Underline size={14} /></button>
            <button className="p-1.5 rounded hover:bg-white/10"><Strikethrough size={14} /></button>
            <div className="w-px h-4 mx-1" style={{ background: line }} />
            <button className="p-1.5 rounded hover:bg-white/10"><AlignLeft size={14} /></button>
            <button className="p-1.5 rounded hover:bg-white/10"><AlignCenter size={14} /></button>
            <button className="p-1.5 rounded hover:bg-white/10"><AlignRight size={14} /></button>
            <button className="p-1.5 rounded hover:bg-white/10"><AlignJustify size={14} /></button>
          </div>
        )}

        <div className="flex-1" />
        <button onClick={save} className="h-9 px-5 rounded-lg text-white font-bold text-[13px]" style={{ background: BRAND, boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}>
          <span className="inline-flex items-center gap-1.5"><Check size={15} /> Done</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* LEFT PANEL: LAYERS */}
        <aside className="w-64 border-r flex flex-col" style={{ borderColor: line, background: 'rgba(0,0,0,0.16)' }}>
          <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-wider text-white/50" style={{ borderColor: line }}>Layers</div>
          <div className="flex-1 overflow-y-auto p-2">
            {layerDevices.map(dev => {
              const isSelected = selectedDeviceId === dev.id;
              return (
                <div key={dev.id} 
                     onClick={() => setSelectedDeviceId(dev.id)}
                     className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer mb-1 ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                  {dev.type === 'WRITER' ? <Type size={14} className="text-white/40" /> : dev.type === 'IMAGE' ? <ImageIcon size={14} className="text-white/40" /> : <Square size={14} className="text-white/40" />}
                  <span className="text-sm flex-1 truncate">{dev.type === 'WRITER' ? ((dev as TelaWriterDevice).blocks[0]?.text || 'Text Layer') : dev.type}</span>
                  <Eye size={14} className="text-white/40 hover:text-white" />
                  <Unlock size={14} className="text-white/40 hover:text-white" />
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER: CANVAS */}
        <main className="flex-1 relative overflow-hidden grid place-items-center p-8" style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.014) 0 13px, transparent 13px 26px), #08060f' }}>
          <div className="relative w-full max-w-[960px] bg-black" style={{ aspectRatio: '16 / 9', borderRadius: 8, boxShadow: '0 22px 52px rgba(0,0,0,0.55)', border: `1px solid ${line2}` }}>
            {frame?.deviceIds.map(id => {
              const dev = doc.devices[id];
              if (!dev) return null;
              if (dev.type === 'WRITER') {
                return (
                  <div key={id} className={`absolute inset-0 flex flex-col items-center justify-center p-[10%] ${selectedDeviceId === id ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setSelectedDeviceId(id)}>
                    {(dev as TelaWriterDevice).blocks.map((b, i) => (
                      <div key={i} className="text-center w-full" style={{ fontFamily: 'Inter', fontSize: 40, fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                        {selectedDeviceId === id ? (
                           <input type="text" value={b.text} onChange={e => {
                             const newBlocks = [...(dev as TelaWriterDevice).blocks];
                             newBlocks[i] = { ...b, text: e.target.value };
                             updateSelectedWriter(newBlocks);
                           }} className="bg-transparent text-center outline-none w-full" />
                        ) : (
                          b.text
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })}
            {boundRef && (
              <span className="absolute right-4 bottom-4 z-20 font-mono text-xs font-bold px-2 py-1 rounded" style={{ color: '#04222a', background: CYAN }}>
                🔗 {boundRef}
              </span>
            )}
          </div>
        </main>

        {/* RIGHT PANEL: PROPERTIES */}
        <aside className="w-80 border-l flex flex-col" style={{ borderColor: line, background: 'rgba(0,0,0,0.16)' }}>
          <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-wider text-white/50" style={{ borderColor: line }}>Properties</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {!selectedDevice && <div className="text-sm text-white/40 text-center mt-10">Select a layer to edit properties</div>}
            
            {selectedDevice && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-2">Blend Mode</label>
                  <select className="w-full bg-white/5 border outline-none rounded p-2 text-sm text-white" style={{ borderColor: line }}>
                    {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-2">Opacity</label>
                  <input type="range" min="0" max="100" defaultValue="100" className="w-full" />
                </div>
              </div>
            )}

            {selectedDevice?.type === 'WRITER' && (
              <div className="space-y-4 pt-4 border-t" style={{ borderColor: line }}>
                <div className="text-xs font-bold text-white/40 uppercase tracking-wider">Typography</div>
                <div>
                  <label className="text-[10px] text-white/40 uppercase block mb-1">Font Family</label>
                  <select className="w-full bg-white/5 border outline-none rounded p-2 text-sm text-white" style={{ borderColor: line }}>
                    {fonts.slice(0, 50).map(f => <option key={f.family} value={f.family}>{f.family}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-white/40 uppercase block mb-1">Size</label>
                    <input type="number" defaultValue="40" className="w-full bg-white/5 border outline-none rounded p-2 text-sm text-white" style={{ borderColor: line }} />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 uppercase block mb-1">Color</label>
                    <input type="color" defaultValue="#ffffff" className="w-full h-[38px] bg-white/5 border outline-none rounded p-1" style={{ borderColor: line }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-white/40 uppercase block mb-1">Line Height</label>
                    <input type="number" step="0.1" defaultValue="1.2" className="w-full bg-white/5 border outline-none rounded p-2 text-sm text-white" style={{ borderColor: line }} />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 uppercase block mb-1">Letter Spacing</label>
                    <input type="number" defaultValue="0" className="w-full bg-white/5 border outline-none rounded p-2 text-sm text-white" style={{ borderColor: line }} />
                  </div>
                </div>
              </div>
            )}

            {boundRef && (
              <div className="pt-4 border-t space-y-4" style={{ borderColor: line }}>
                <div className="text-xs font-bold text-cyan-400 flex items-center gap-2"><Link2 size={14} /> Scripture Style</div>
                <div>
                  <label className="text-[10px] text-white/40 uppercase block mb-1">Verse Font</label>
                  <select value={scriptureFont} onChange={e => setScriptureFont(e.target.value)} className="w-full bg-white/5 border outline-none rounded p-2 text-sm text-white" style={{ borderColor: line }}>
                    {fonts.filter(f => f.category === 'serif').slice(0, 20).map(f => <option key={f.family} value={f.family}>{f.family}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-white/40 uppercase block mb-1">Reference Font</label>
                  <select value={referenceFont} onChange={e => setReferenceFont(e.target.value)} className="w-full bg-white/5 border outline-none rounded p-2 text-sm text-white" style={{ borderColor: line }}>
                    {fonts.filter(f => f.category === 'sans-serif').slice(0, 20).map(f => <option key={f.family} value={f.family}>{f.family}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
