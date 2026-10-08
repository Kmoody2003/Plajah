import FastImage from '../ui/FastImage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleDot,
  CloudUpload,
  Columns3,
  Cuboid,
  Filter,
  Grid3X3,
  HardDrive,
  Image as ImageIcon,
  List,
  Loader2,
  Scan,
  Search,
  Sparkles,
  Upload,
  View,
  FolderOpen,
  Maximize2,
  Film,
  ExternalLink,
  Monitor
} from 'lucide-react';
import type { Photo } from '../../types';
import SpatialMedia from '../SpatialMedia';
import DepthAnalyzer from '../DepthAnalyzer';
import { GaussianSplatFileViewer } from '../AlbumArt3DViewer';
import { loadSpatialProjects, newSpatialProject, reconstructionManifest, saveSpatialProject, uploadSpatialSplat, type SpatialPhotoProject } from '../../services/spatialPhotoProjects';
import { showInExplorer, isWindowsApp } from '../../services/windowsBridgeService';

type WorkspaceView = 'catalog' | 'spatial';

export interface PhotoCatalogWorkspaceProps {
  photos: Photo[];
  initialView?: WorkspaceView;
  onEdit: (photo: Photo) => void;
  folderPath?: string;
  folderName?: string;
  subfolders?: string[];
  activeSubfolder?: string | null;
  onSelectSubfolder?: (sub: string | null) => void;
  onPickFolder?: () => void;
  onOpenViewer?: (photo: Photo) => void;
}

export default function PhotoCatalogWorkspace({
  photos,
  initialView = 'catalog',
  onEdit,
  folderPath,
  folderName,
  subfolders = [],
  activeSubfolder = null,
  onSelectSubfolder,
  onPickFolder,
  onOpenViewer,
}: PhotoCatalogWorkspaceProps) {
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

  // Keep selected photo valid if photos change
  useEffect(() => {
    if (selected && !photos.some(p => p.id === selected.id)) {
      setSelected(photos[0] || null);
    } else if (!selected && photos.length > 0) {
      setSelected(photos[0]);
    }
  }, [photos, selected]);

  const visible = useMemo(() => {
    return photos.filter(photo => {
      const matchQuery = !query || `${photo.title || ''} ${photo.description || ''} ${(photo.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase());
      return matchQuery;
    });
  }, [photos, query]);

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

  const handleRevealExplorer = () => {
    if (selected?.id && (selected.id.includes(':\\') || selected.id.includes('/'))) {
      showInExplorer(selected.id);
    } else if (folderPath) {
      showInExplorer(folderPath);
    }
  };

  return <div className="min-h-[calc(100dvh-8rem)] grid grid-cols-[240px_minmax(0,1fr)_310px] bg-[#090a0d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
    {/* ── Left Aside: Library Navigation & Windows Mirrored Folder ── */}
    <aside className="border-r border-white/10 bg-[#0d0f13] p-3 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
      {/* Windows Mirrored Folder Card */}
      {(folderPath || folderName || onPickFolder) && (
        <div className="p-3 mb-2 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen size={14} className="text-[#FF8C00]" />
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-[#FF8C00]">Mirrored Folder</p>
            </div>
            {isWindowsApp() && <span className="text-[8px] font-bold text-white/40 uppercase">Windows</span>}
          </div>
          <h4 className="text-xs font-black truncate mt-1 text-white" title={folderPath || folderName}>
            {folderName || 'Pictures Library'}
          </h4>
          {folderPath && (
            <p className="text-[8px] text-white/40 font-mono truncate mt-0.5" title={folderPath}>
              {folderPath}
            </p>
          )}
          {onPickFolder && (
            <button
              onClick={onPickFolder}
              className="mt-2.5 w-full py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-bold text-white/70 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <FolderOpen size={11} className="text-amber-400" />
              Change Folder…
            </button>
          )}

          {/* Subfolders list */}
          {subfolders.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30 px-1">Subdirectories</p>
              <button
                onClick={() => onSelectSubfolder?.(null)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-bold truncate transition-colors ${
                  activeSubfolder === null ? 'bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/30' : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                All items ({photos.length})
              </button>
              {subfolders.map(sub => (
                <button
                  key={sub}
                  onClick={() => onSelectSubfolder?.(sub)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-bold truncate transition-colors ${
                    activeSubfolder === sub ? 'bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/30' : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                  title={sub}
                >
                  📁 {sub}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2 mb-1">
        <p className="text-[9px] font-black uppercase tracking-[.24em] text-cyan-300">Photo Library</p>
        <p className="text-xs text-white/35 mt-0.5">{photos.length} photos loaded</p>
      </div>

      {[
        ['All photographs', ImageIcon, photos.length],
        ['Recent imports', CloudUpload, Math.min(photos.length, 18)],
        ['Edited', Sparkles, 0],
        ['Spatial projects', Cuboid, 0],
        ['Favorites', CircleDot, 0]
      ].map(([label, Icon, count]) => (
        <button key={String(label)} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/55 hover:text-white hover:bg-white/5 text-left transition-colors">
          <Icon size={14}/>
          <span className="flex-1 truncate">{String(label)}</span>
          <span className="text-[9px] text-white/25">{String(count)}</span>
        </button>
      ))}

      <div className="h-px bg-white/10 my-2"/>
      <p className="px-3 text-[8px] font-black uppercase tracking-[.2em] text-white/25">Collections</p>
      {['Portfolio selects','Unsorted','XR candidates','Client delivery'].map(name => (
        <button key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white transition-colors">
          <Columns3 size={12}/>{name}
        </button>
      ))}
      <button className="mt-auto flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 text-[10px] font-bold text-white/50 hover:text-white transition-colors">
        <HardDrive size={14}/> Storage & originals
      </button>
    </aside>

    {/* ── Center: Workspace Header & Catalog/Spatial Grid ── */}
    <section className="min-w-0 flex flex-col">
      <header className="h-14 shrink-0 px-4 border-b border-white/10 flex items-center gap-3 bg-[#101217]">
        <div className="flex bg-white/5 rounded-xl p-1">
          <button
            onClick={() => setView('catalog')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
              view === 'catalog' ? 'bg-white text-black shadow-md' : 'text-white/40 hover:text-white'
            }`}
          >
            Catalog
          </button>
          <button
            onClick={() => setView('spatial')}
            disabled={!selected}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
              view === 'spatial' ? 'bg-gradient-to-r from-cyan-300 to-violet-400 text-black shadow-md' : 'text-white/40 hover:text-white disabled:opacity-30'
            }`}
          >
            Spatial Lab
          </button>
        </div>

        <div className="flex-1 max-w-md h-9 rounded-xl border border-white/10 bg-black/20 flex items-center gap-2 px-3">
          <Search size={13} className="text-white/30"/>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search title, tag, camera…"
            className="bg-transparent outline-none w-full text-xs placeholder:text-white/25"
          />
        </div>

        {onOpenViewer && selected && (
          <button
            onClick={() => onOpenViewer(selected)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white text-[9px] font-black uppercase tracking-widest shadow-md hover:scale-105 transition-transform"
            title="Launch Fullscreen Viewer"
          >
            <Maximize2 size={12} /> Launch Viewer
          </button>
        )}

        <button className="p-2 rounded-lg hover:bg-white/10 text-white/40"><Filter size={15}/></button>

        <div className="flex bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setLayout('grid')}
            className={`p-1.5 rounded ${layout === 'grid' ? 'bg-white/10 text-white' : 'text-white/30'}`}
          >
            <Grid3X3 size={14}/>
          </button>
          <button
            onClick={() => setLayout('list')}
            className={`p-1.5 rounded ${layout === 'list' ? 'bg-white/10 text-white' : 'text-white/30'}`}
          >
            <List size={14}/>
          </button>
        </div>
      </header>

      {view === 'catalog' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-lg">
                {folderName ? `${folderName}` : 'All photographs'}
              </h3>
              <p className="text-[10px] text-white/30">Originals, renditions, metadata and spatial readiness</p>
            </div>
            <div className="flex items-center gap-2">
              {onPickFolder && (
                <button
                  onClick={onPickFolder}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                >
                  <FolderOpen size={13} className="text-amber-400" /> Browse Folder
                </button>
              )}
            </div>
          </div>

          {layout === 'grid' ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {visible.map(photo => {
                const isVideo = photo.mediaType === 'VIDEO' || /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(photo.url || photo.title || '');
                const isChosen = selected?.id === photo.id;
                return (
                  <button
                    key={photo.id}
                    onClick={() => setSelected(photo)}
                    onDoubleClick={() => (onOpenViewer ? onOpenViewer(photo) : onEdit(photo))}
                    className={`group text-left rounded-xl overflow-hidden border bg-[#121419] transition-all relative ${
                      isChosen ? 'border-[#FF8C00] ring-2 ring-[#FF8C00]/30 shadow-lg' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="aspect-[4/3] bg-black overflow-hidden relative">
                      <FastImage item={photo} className="group-hover:scale-105 transition-transform" />
                      <span className="absolute top-2 right-2 px-1.5 py-1 rounded bg-black/60 text-[7px] font-black flex items-center gap-1">
                        {isVideo ? <><Film size={9} className="text-amber-400"/> VIDEO</> : '2D'}
                      </span>
                      {onOpenViewer && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenViewer(photo);
                          }}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                        >
                          <span className="px-3 py-1.5 rounded-full bg-white/90 text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                            <Maximize2 size={11}/> View
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-[11px] font-bold truncate">{photo.title || 'Untitled'}</p>
                      <p className="text-[8px] text-white/30 mt-1">
                        {new Date(photo.timestamp).toLocaleDateString()} · {isVideo ? 'Video' : 'Original'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {visible.map(photo => {
                const isVideo = photo.mediaType === 'VIDEO' || /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(photo.url || photo.title || '');
                return (
                  <button
                    key={photo.id}
                    onClick={() => setSelected(photo)}
                    onDoubleClick={() => (onOpenViewer ? onOpenViewer(photo) : onEdit(photo))}
                    className={`w-full grid grid-cols-[48px_1fr_120px_80px_60px] gap-3 items-center p-2 rounded-xl text-left transition-colors ${
                      selected?.id === photo.id ? 'bg-[#FF8C00]/15 border border-[#FF8C00]/30' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="relative w-12 h-10 rounded-lg overflow-hidden shrink-0"><FastImage item={photo} width={128} /></span>
                    <span className="text-xs font-bold truncate">{photo.title || 'Untitled'}</span>
                    <span className="text-[9px] text-white/35">{new Date(photo.timestamp).toLocaleDateString()}</span>
                    <span className="text-[8px] text-white/30">{isVideo ? 'Video' : 'Original'}</span>
                    {onOpenViewer && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onOpenViewer(photo); }}
                        className="text-[9px] font-bold text-[#FF8C00] hover:underline"
                      >
                        View ↗
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : selected && (
        <div className="flex-1 min-h-0 grid grid-rows-[minmax(280px,1fr)_auto]">
          <div className="relative bg-[radial-gradient(circle_at_center,#172333,#07080b_70%)] p-6 flex items-center justify-center overflow-hidden">
            {splatUrl ? (
              <div className="w-full h-full rounded-2xl overflow-hidden border border-violet-400/25">
                <GaussianSplatFileViewer splatUrl={splatUrl}/>
              </div>
            ) : (
              <SpatialMedia
                url={selected.url || ''}
                alt={selected.title || ''}
                forceDepth
                className="w-full h-full max-w-4xl max-h-[58vh]"
                roundedClassName="rounded-2xl"
              />
            )}
            <div className="absolute top-4 left-4 px-3 py-2 rounded-full bg-black/60 border border-cyan-300/20 text-[8px] font-black uppercase tracking-widest text-cyan-200">
              {splatUrl ? 'Gaussian scene · drag to orbit' : 'XR parallax preview · move pointer'}
            </div>
          </div>
          <div className="p-4 border-t border-white/10 bg-[#0f1116] grid grid-cols-4 gap-3">
            {[
              ['1','Depth map','Estimate monocular depth'],
              ['2','Segment','Separate scene layers'],
              ['3','Spatialize','Tune parallax comfort'],
              ['4','Deliver','XR card or splat scene']
            ].map(([n,title,note],i)=>(
              <div key={n} className={`p-3 rounded-xl border ${i <= (depthReady ? 2 : 0) ? 'border-cyan-300/25 bg-cyan-300/5' : 'border-white/10 bg-white/[.02]'}`}>
                <span className="text-[8px] text-cyan-300 font-black">0{n}</span>
                <p className="text-[10px] font-black mt-1">{title}</p>
                <p className="text-[8px] text-white/30 mt-1">{note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>

    {/* ── Right Aside: Inspector & Studio Launchpad ── */}
    <aside className="border-l border-white/10 bg-[#101217] p-4 overflow-y-auto custom-scrollbar">
      {selected ? (
        view === 'catalog' ? (
          <>
            <div className="aspect-square rounded-xl overflow-hidden bg-black mb-4 relative group">
              <img src={selected.url || ''} alt="" className="w-full h-full object-cover"/>
              {onOpenViewer && (
                <button
                  onClick={() => onOpenViewer(selected)}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider text-white"
                >
                  <Maximize2 size={16}/> Full Viewer
                </button>
              )}
            </div>
            <h4 className="font-black text-sm truncate" title={selected.title}>{selected.title || 'Untitled'}</h4>
            <p className="text-[9px] text-white/30 mt-1">{new Date(selected.timestamp).toLocaleString()}</p>

            <div className="grid grid-cols-2 gap-2 mt-4">
              {[
                ['Kind', selected.mediaType === 'VIDEO' ? 'Video' : 'Original'],
                ['Spatial', project?.status || 'Draft'],
                ['Rights', 'Owned'],
                ['Tags', String(selected.tags?.length || 0)]
              ].map(([k,v]) => (
                <div key={k} className="p-2.5 rounded-xl bg-white/5">
                  <p className="text-[7px] uppercase tracking-widest text-white/25">{k}</p>
                  <p className="text-[10px] font-bold mt-1 truncate">{v}</p>
                </div>
              ))}
            </div>

            {/* Viewer & Studio Launch Actions */}
            <div className="space-y-2 mt-5">
              {onOpenViewer && (
                <button
                  onClick={() => onOpenViewer(selected)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white text-[9px] font-black uppercase tracking-widest shadow-lg hover:brightness-110 flex items-center justify-center gap-2 transition-all"
                >
                  <Maximize2 size={13}/> Launch Full Viewer
                </button>
              )}

              <button
                onClick={() => onEdit(selected)}
                className="w-full py-2.5 rounded-xl bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-white/90 transition-colors"
              >
                Develop photo
              </button>

              <button
                onClick={() => setView('spatial')}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 text-black text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Cuboid size={14}/> Open Spatial Lab
              </button>

              {isWindowsApp() && (
                <button
                  onClick={handleRevealExplorer}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-bold text-white/60 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink size={12} /> Show in File Explorer
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Scene Intelligence</p>
              <h4 className="font-black mt-1">Depth & segmentation</h4>
            </div>
            <DepthAnalyzer imageUrl={selected.url || ''}/>
            {processing && (
              <div className="p-3 rounded-xl bg-cyan-400/10 border border-cyan-300/20">
                <div className="flex items-center gap-2 text-[9px] text-cyan-200">
                  <Loader2 size={12} className="animate-spin"/>{processing}
                </div>
                <div className="mt-2 h-1 rounded bg-white/5">
                  <div className="h-full bg-cyan-300 rounded" style={{width:`${progress}%`}}/>
                </div>
              </div>
            )}
            {error && <p className="p-3 rounded-xl bg-red-500/10 border border-red-400/20 text-[9px] text-red-300">{error}</p>}
            <div className="p-3 rounded-2xl border border-white/10 bg-white/[.025]">
              <div className="flex gap-1 mb-3">
                {(['subject','planes','materials'] as const).map(mode => (
                  <button key={mode} onClick={() => setSegmentMode(mode)} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase ${segmentMode === mode ? 'bg-cyan-300 text-black' : 'bg-white/5 text-white/35'}`}>{mode}</button>
                ))}
              </div>
              {maskPreview ? (
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                  <img src={maskPreview} alt="Segmented subject" className="w-full h-full object-contain"/>
                  <span className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-[7px] font-black">LOCAL MASK · {Math.round((project?.segmentation?.confidence || 0)*100)}%</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {['Foreground','Subject','Background'].map((name,i)=>(
                    <div key={name} className="aspect-square rounded-lg grid place-items-end p-2 text-[7px] font-black uppercase" style={{background:`linear-gradient(145deg,${['#ff8c00','#00daf3','#6b0099'][i]}aa,#101117)`}}>{name}</div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={runSegmentation} disabled={!!processing} className="py-2.5 rounded-xl border border-cyan-300/25 text-cyan-200 text-[8px] font-black uppercase disabled:opacity-40">Run local segmentation</button>
                <button onClick={buildDepth} className="py-2.5 rounded-xl bg-white text-black text-[8px] font-black uppercase">Build depth stack</button>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-400/20">
              <div className="flex items-center gap-2">
                <Cuboid size={15} className="text-violet-300"/>
                <p className="text-[9px] font-black uppercase tracking-widest">Gaussian Splat Studio</p>
              </div>
              <p className="text-[9px] leading-relaxed text-white/40 mt-2">Capture an orbit of overlapping photographs, export a reconstruction job, then inspect and publish its .splat or .ply result.</p>
              <input ref={captureInput} type="file" accept="image/*" multiple className="hidden" onChange={e => setCaptureFiles(Array.from(e.target.files || []))}/>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => captureInput.current?.click()} className="py-2 rounded-lg bg-white/5 text-[8px] font-black uppercase">{captureFiles.length ? `${captureFiles.length} capture views` : 'Add capture orbit'}</button>
                <button onClick={downloadManifest} disabled={!captureFiles.length} className="py-2 rounded-lg bg-white/5 text-[8px] font-black uppercase disabled:opacity-30">Export recon job</button>
              </div>
              <input ref={splatInput} type="file" accept=".splat,.ply" className="hidden" onChange={e => chooseSplat(e.target.files?.[0] || null)}/>
              <button onClick={() => splatInput.current?.click()} className="mt-2 w-full py-2.5 rounded-xl border border-violet-300/30 text-violet-200 text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Upload size={12}/>{splatFile ? splatFile.name : 'Open .splat / .ply locally'}</button>
              {splatFile && <button onClick={persistSplat} disabled={!!processing} className="mt-2 w-full py-2.5 rounded-xl bg-violet-300 text-black text-[8px] font-black uppercase disabled:opacity-40">Upload & attach to project</button>}
            </div>
            <button disabled={!depthReady && !splatUrl} className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 text-black disabled:opacity-30 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><View size={14}/> Preview for XR headset</button>
          </div>
        )
      ) : (
        <div className="h-full grid place-items-center text-center text-white/25">
          <div>
            <Scan size={28} className="mx-auto mb-3"/>
            <p className="text-xs">Select a photograph to inspect it.</p>
          </div>
        </div>
      )}
    </aside>
  </div>;
}
