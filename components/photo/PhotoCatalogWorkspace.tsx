import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, CloudUpload, Columns3, Cuboid, Filter, Grid3X3, HardDrive, Image as ImageIcon, List, Loader2, Scan, Search, Sparkles, Upload, View } from 'lucide-react';
import type { Photo } from '../../types';
import SpatialMedia from '../SpatialMedia';
import DepthAnalyzer from '../DepthAnalyzer';
import { GaussianSplatFileViewer } from '../AlbumArt3DViewer';
import { loadSpatialProjects, newSpatialProject, reconstructionManifest, saveSpatialProject, uploadSpatialSplat, type SpatialPhotoProject } from '../../services/spatialPhotoProjects';

type WorkspaceView = 'catalog' | 'spatial';

export default function PhotoCatalogWorkspace({ photos, initialView = 'catalog', onEdit }: { photos: Photo[]; initialView?: WorkspaceView; onEdit: (photo: Photo) => void }) {
  const [view, setView] = useState<WorkspaceView>(initialView);
  const [selected, setSelected] = useState<Photo | null>(photos[0] || null);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [depthReady, setDepthReady] = useState(false);
  const [segmentMode, setSegmentMode] = useState<'subject' | 'planes' | 'materials'>('planes');
  const [splatFile, setSplatFile] = useState<File | null>(null);
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [project, setProject] = useState<SpatialPhotoProject | null>(null);
  const [maskPreview, setMaskPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [captureFiles, setCaptureFiles] = useState<File[]>([]);
  const splatInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => photos.filter(photo => !query || `${photo.title || ''} ${photo.description || ''} ${(photo.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [photos, query]);

  useEffect(() => {
    if (!selected) { setProject(null); return; }
    const owner = selected.ownerId || 'local';
    const existing = loadSpatialProjects(owner).find(row => row.photoId === selected.id);
    const next = existing || saveSpatialProject(newSpatialProject(selected.id, selected.url || '', selected.title || 'Untitled spatial scene'));
    setProject(next); setDepthReady(Boolean(next.depth)); setSplatUrl(next.splat?.url || null);
  }, [selected]);

  useEffect(() => () => { if (splatUrl?.startsWith('blob:')) URL.revokeObjectURL(splatUrl); }, [splatUrl]);

  const runSegmentation = async () => {
    if (!selected?.url || !project) return;
    setProcessing('Loading on-device SlimSAM…'); setError(null);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = reject; img.src = selected.url || ''; });
      const { refineDocumentRegionMask } = await import('../../services/telaDocumentIntelligence');
      const result = await refineDocumentRegionMask(selected.url, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight, sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight }, event => { setProcessing(event.message); setProgress(Math.round((event.progress || 0) * 100)); });
      setMaskPreview(result.src); const next = saveSpatialProject({ ...project, status: 'SEGMENTED', segmentation: { confidence: result.confidence, engine: 'SlimSAM local' } }); setProject(next);
    } catch (cause: any) { setError(cause?.message || 'Segmentation could not complete.'); }
    finally { setProcessing(null); }
  };

  const buildDepth = () => {
    if (!project) return; setDepthReady(true);
    setProject(saveSpatialProject({ ...project, status: project.status === 'SEGMENTED' ? 'SEGMENTED' : 'DEPTH_READY', depth: { layers: 5, strength: 2.6, engine: 'Plajah edge-aware depth' } }));
  };

  const chooseSplat = (file: File | null) => {
    if (!file) return; if (splatUrl?.startsWith('blob:')) URL.revokeObjectURL(splatUrl);
    setSplatFile(file); setSplatUrl(URL.createObjectURL(file)); setError(null);
  };

  const persistSplat = async () => {
    if (!project || !splatFile) return; setProcessing('Uploading volumetric scene…'); setProgress(0);
    try { const next = await uploadSpatialSplat(project, splatFile, setProgress); setProject(next); setSplatUrl(next.splat?.url || splatUrl); }
    catch (cause: any) { setError(cause?.message || 'Splat upload failed. Local preview remains available.'); }
    finally { setProcessing(null); }
  };

  const downloadManifest = () => {
    if (!project || !captureFiles.length) return; const blob = new Blob([JSON.stringify(reconstructionManifest(project, captureFiles), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${project.id}-reconstruction.json`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="min-h-[calc(100dvh-8rem)] grid grid-cols-[210px_minmax(0,1fr)_300px] bg-[#090a0d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
    <aside className="border-r border-white/10 bg-[#0d0f13] p-3 flex flex-col gap-1">
      <div className="px-3 py-3 mb-2"><p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Photo Library</p><p className="text-xs text-white/35 mt-1">{photos.length} platform originals</p></div>
      {[
        ['All photographs', ImageIcon, photos.length], ['Recent imports', CloudUpload, Math.min(photos.length, 18)], ['Edited', Sparkles, 0], ['Spatial projects', Cuboid, 0], ['Favorites', CircleDot, 0]
      ].map(([label, Icon, count]) => <button key={String(label)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-white/55 hover:text-white hover:bg-white/5 text-left"><Icon size={14}/><span className="flex-1">{String(label)}</span><span className="text-[9px] text-white/25">{String(count)}</span></button>)}
      <div className="h-px bg-white/10 my-3"/>
      <p className="px-3 text-[8px] font-black uppercase tracking-[.2em] text-white/25">Collections</p>
      {['Portfolio selects','Unsorted','XR candidates','Client delivery'].map(name => <button key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-white/40 hover:text-white"><Columns3 size={12}/>{name}</button>)}
      <button className="mt-auto flex items-center gap-2 px-3 py-3 rounded-xl bg-white/5 text-[10px] font-bold text-white/50"><HardDrive size={14}/> Storage & originals</button>
    </aside>

    <section className="min-w-0 flex flex-col">
      <header className="h-14 shrink-0 px-4 border-b border-white/10 flex items-center gap-3 bg-[#101217]">
        <div className="flex bg-white/5 rounded-xl p-1">
          <button onClick={() => setView('catalog')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${view === 'catalog' ? 'bg-white text-black' : 'text-white/40'}`}>Catalog</button>
          <button onClick={() => setView('spatial')} disabled={!selected} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${view === 'spatial' ? 'bg-gradient-to-r from-cyan-300 to-violet-400 text-black' : 'text-white/40'}`}>Spatial Lab</button>
        </div>
        <div className="flex-1 max-w-md h-9 rounded-xl border border-white/10 bg-black/20 flex items-center gap-2 px-3"><Search size={13} className="text-white/30"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, tag, camera…" className="bg-transparent outline-none w-full text-xs placeholder:text-white/25"/></div>
        <button className="p-2 rounded-lg hover:bg-white/10 text-white/40"><Filter size={15}/></button>
        <div className="flex bg-white/5 rounded-lg p-1"><button onClick={() => setLayout('grid')} className={`p-1.5 rounded ${layout === 'grid' ? 'bg-white/10 text-white' : 'text-white/30'}`}><Grid3X3 size={14}/></button><button onClick={() => setLayout('list')} className={`p-1.5 rounded ${layout === 'list' ? 'bg-white/10 text-white' : 'text-white/30'}`}><List size={14}/></button></div>
      </header>

      {view === 'catalog' ? <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="flex items-center justify-between mb-4"><div><h3 className="font-black text-lg">All photographs</h3><p className="text-[10px] text-white/30">Originals, renditions, metadata and spatial readiness</p></div><button className="px-4 py-2 rounded-xl bg-white text-black text-[9px] font-black uppercase tracking-widest flex gap-2"><Upload size={13}/> Import</button></div>
        {layout === 'grid' ? <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">{visible.map(photo => <button key={photo.id} onClick={() => setSelected(photo)} onDoubleClick={() => onEdit(photo)} className={`group text-left rounded-xl overflow-hidden border bg-[#121419] ${selected?.id === photo.id ? 'border-cyan-300 ring-2 ring-cyan-300/20' : 'border-white/10 hover:border-white/30'}`}><div className="aspect-[4/3] bg-black overflow-hidden relative"><img src={photo.url || ''} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform"/><span className="absolute top-2 right-2 px-1.5 py-1 rounded bg-black/60 text-[7px] font-black">2D</span></div><div className="p-2.5"><p className="text-[11px] font-bold truncate">{photo.title || 'Untitled'}</p><p className="text-[8px] text-white/30 mt-1">{new Date(photo.timestamp).toLocaleDateString()} · Original</p></div></button>)}</div> : <div className="space-y-1">{visible.map(photo => <button key={photo.id} onClick={() => setSelected(photo)} className={`w-full grid grid-cols-[48px_1fr_120px_80px] gap-3 items-center p-2 rounded-xl text-left ${selected?.id === photo.id ? 'bg-cyan-400/10' : 'hover:bg-white/5'}`}><img src={photo.url || ''} alt="" className="w-12 h-10 object-cover rounded-lg"/><span className="text-xs font-bold truncate">{photo.title || 'Untitled'}</span><span className="text-[9px] text-white/35">{new Date(photo.timestamp).toLocaleDateString()}</span><span className="text-[8px] text-white/30">Original</span></button>)}</div>}
      </div> : selected && <div className="flex-1 min-h-0 grid grid-rows-[minmax(280px,1fr)_auto]">
        <div className="relative bg-[radial-gradient(circle_at_center,#172333,#07080b_70%)] p-6 flex items-center justify-center overflow-hidden">{splatUrl ? <div className="w-full h-full rounded-2xl overflow-hidden border border-violet-400/25"><GaussianSplatFileViewer splatUrl={splatUrl}/></div> : <SpatialMedia url={selected.url || ''} alt={selected.title || ''} forceDepth className="w-full h-full max-w-4xl max-h-[58vh]" roundedClassName="rounded-2xl"/>}<div className="absolute top-4 left-4 px-3 py-2 rounded-full bg-black/60 border border-cyan-300/20 text-[8px] font-black uppercase tracking-widest text-cyan-200">{splatUrl ? 'Gaussian scene · drag to orbit' : 'XR parallax preview · move pointer'}</div></div>
        <div className="p-4 border-t border-white/10 bg-[#0f1116] grid grid-cols-4 gap-3">
          {[['1','Depth map','Estimate monocular depth'],['2','Segment','Separate scene layers'],['3','Spatialize','Tune parallax comfort'],['4','Deliver','XR card or splat scene']].map(([n,title,note],i)=><div key={n} className={`p-3 rounded-xl border ${i <= (depthReady ? 2 : 0) ? 'border-cyan-300/25 bg-cyan-300/5' : 'border-white/10 bg-white/[.02]'}`}><span className="text-[8px] text-cyan-300 font-black">0{n}</span><p className="text-[10px] font-black mt-1">{title}</p><p className="text-[8px] text-white/30 mt-1">{note}</p></div>)}
        </div>
      </div>}
    </section>

    <aside className="border-l border-white/10 bg-[#101217] p-4 overflow-y-auto custom-scrollbar">
      {selected ? view === 'catalog' ? <><div className="aspect-square rounded-xl overflow-hidden bg-black mb-4"><img src={selected.url || ''} alt="" className="w-full h-full object-cover"/></div><h4 className="font-black">{selected.title || 'Untitled'}</h4><p className="text-[9px] text-white/30 mt-1">{new Date(selected.timestamp).toLocaleString()}</p><div className="grid grid-cols-2 gap-2 mt-4">{[['Kind','Original'],['Spatial',project?.status || 'Draft'],['Rights','Owned'],['Tags',String(selected.tags?.length || 0)]].map(([k,v])=><div key={k} className="p-2.5 rounded-xl bg-white/5"><p className="text-[7px] uppercase tracking-widest text-white/25">{k}</p><p className="text-[10px] font-bold mt-1">{v}</p></div>)}</div><button onClick={() => onEdit(selected)} className="mt-4 w-full py-3 rounded-xl bg-white text-black text-[9px] font-black uppercase tracking-widest">Develop photo</button><button onClick={() => setView('spatial')} className="mt-2 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 text-black text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Cuboid size={14}/> Open Spatial Lab</button></> : <div className="space-y-4"><div><p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Scene Intelligence</p><h4 className="font-black mt-1">Depth & segmentation</h4></div><DepthAnalyzer imageUrl={selected.url || ''}/>{processing && <div className="p-3 rounded-xl bg-cyan-400/10 border border-cyan-300/20"><div className="flex items-center gap-2 text-[9px] text-cyan-200"><Loader2 size={12} className="animate-spin"/>{processing}</div><div className="mt-2 h-1 rounded bg-white/5"><div className="h-full bg-cyan-300 rounded" style={{width:`${progress}%`}}/></div></div>}{error && <p className="p-3 rounded-xl bg-red-500/10 border border-red-400/20 text-[9px] text-red-300">{error}</p>}<div className="p-3 rounded-2xl border border-white/10 bg-white/[.025]"><div className="flex gap-1 mb-3">{(['subject','planes','materials'] as const).map(mode=><button key={mode} onClick={()=>setSegmentMode(mode)} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase ${segmentMode === mode ? 'bg-cyan-300 text-black' : 'bg-white/5 text-white/35'}`}>{mode}</button>)}</div>{maskPreview ? <div className="relative aspect-video rounded-xl overflow-hidden bg-black"><img src={maskPreview} alt="Segmented subject" className="w-full h-full object-contain"/><span className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-[7px] font-black">LOCAL MASK · {Math.round((project?.segmentation?.confidence || 0)*100)}%</span></div> : <div className="grid grid-cols-3 gap-2">{['Foreground','Subject','Background'].map((name,i)=><div key={name} className="aspect-square rounded-lg grid place-items-end p-2 text-[7px] font-black uppercase" style={{background:`linear-gradient(145deg,${['#ff8c00','#00daf3','#6b0099'][i]}aa,#101117)`}}>{name}</div>)}</div>}<div className="grid grid-cols-2 gap-2 mt-3"><button onClick={runSegmentation} disabled={!!processing} className="py-2.5 rounded-xl border border-cyan-300/25 text-cyan-200 text-[8px] font-black uppercase disabled:opacity-40">Run local segmentation</button><button onClick={buildDepth} className="py-2.5 rounded-xl bg-white text-black text-[8px] font-black uppercase">Build depth stack</button></div></div><div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-400/20"><div className="flex items-center gap-2"><Cuboid size={15} className="text-violet-300"/><p className="text-[9px] font-black uppercase tracking-widest">Gaussian Splat Studio</p></div><p className="text-[9px] leading-relaxed text-white/40 mt-2">Capture an orbit of overlapping photographs, export a reconstruction job, then inspect and publish its .splat or .ply result.</p><input ref={captureInput} type="file" accept="image/*" multiple className="hidden" onChange={e=>setCaptureFiles(Array.from(e.target.files || []))}/><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={()=>captureInput.current?.click()} className="py-2 rounded-lg bg-white/5 text-[8px] font-black uppercase">{captureFiles.length ? `${captureFiles.length} capture views` : 'Add capture orbit'}</button><button onClick={downloadManifest} disabled={!captureFiles.length} className="py-2 rounded-lg bg-white/5 text-[8px] font-black uppercase disabled:opacity-30">Export recon job</button></div><input ref={splatInput} type="file" accept=".splat,.ply" className="hidden" onChange={e=>chooseSplat(e.target.files?.[0] || null)}/><button onClick={()=>splatInput.current?.click()} className="mt-2 w-full py-2.5 rounded-xl border border-violet-300/30 text-violet-200 text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Upload size={12}/>{splatFile ? splatFile.name : 'Open .splat / .ply locally'}</button>{splatFile && <button onClick={persistSplat} disabled={!!processing} className="mt-2 w-full py-2.5 rounded-xl bg-violet-300 text-black text-[8px] font-black uppercase disabled:opacity-40">Upload & attach to project</button>}</div><button disabled={!depthReady && !splatUrl} className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 text-black disabled:opacity-30 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><View size={14}/> Preview for XR headset</button></div> : <div className="h-full grid place-items-center text-center text-white/25"><div><Scan size={28} className="mx-auto mb-3"/><p className="text-xs">Select a photograph to inspect it.</p></div></div>}
    </aside>
  </div>;
}
