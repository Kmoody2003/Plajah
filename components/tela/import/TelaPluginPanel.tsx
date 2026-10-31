// TelaPluginPanel — run an installed Photoshop filter plug-in (.8bf) on the selected image.
// Plug-ins are native Windows code, so this works only in the desktop app (services/tela/photoshopPlugins).
import React, { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Loader2, Play, X } from 'lucide-react';
import { addPluginFolder, listPhotoshopPlugins, type PhotoshopPlugin } from '../../../services/tela/photoshopPlugins';

interface Props {
  hasImage: boolean;
  onClose: () => void;
  /** Runs the filter on the selected image; resolves to an error message, or null when it worked. */
  onRun: (plugin: PhotoshopPlugin, showUi: boolean, onProgress: (fraction: number) => void) => Promise<string | null>;
}

export const TelaPluginPanel: React.FC<Props> = ({ hasImage, onClose, onRun }) => {
  const [plugins, setPlugins] = useState<PhotoshopPlugin[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null); const [progress, setProgress] = useState(0);
  const [showUi, setShowUi] = useState(true);
  const load = () => { void listPhotoshopPlugins().then(r => { if (r.ok === false) { setPlugins([]); setMessage(r.reason); } else setPlugins(r.plugins); }); };
  useEffect(load, []);
  // Categories starting with ** are Photoshop's hidden internal filters.
  const groups = useMemo(() => {
    const g = new Map<string, PhotoshopPlugin[]>();
    for (const p of plugins || []) { if (p.category.startsWith('**')) continue; const rows = g.get(p.category) || []; rows.push(p); g.set(p.category, rows); }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [plugins]);
  const run = async (p: PhotoshopPlugin) => {
    setRunning(p.id); setProgress(0); setMessage(null);
    const error = await onRun(p, showUi, setProgress);
    setRunning(null); setMessage(error ?? `${p.name} applied.`);
  };
  return (
    <aside aria-label="Photoshop plug-ins" data-testid="tela-plugins" style={{ position: 'fixed', top: 56, right: 12, bottom: 12, width: 'min(320px, calc(100vw - 24px))', zIndex: 320, display: 'flex', flexDirection: 'column', background: '#16121f', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, color: '#fff', overflow: 'hidden' }}>
      <div className="flex items-center gap-2" style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>Photoshop plug-ins</div>
        <button aria-label="Add a plug-in folder" title="Add a plug-in folder" onClick={() => { void addPluginFolder().then(load); }} style={{ padding: 4, background: 'none', border: 0, color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}><FolderPlus size={15} /></button>
        <button aria-label="Close plug-ins" onClick={onClose} style={{ padding: 4, background: 'none', border: 0, color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}><X size={15} /></button>
      </div>
      <label className="flex items-center gap-2" style={{ padding: '8px 12px', fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}><input type="checkbox" checked={showUi} onChange={e => setShowUi(e.target.checked)} /> Show the plug-in's own dialog</label>
      {!hasImage && <p style={{ margin: '0 12px 8px', fontSize: 11.5, color: '#f5c97a' }}>Select an image on the artboard to filter it.</p>}
      {message && <p role="status" style={{ margin: '0 12px 8px', fontSize: 11.5, lineHeight: 1.45, color: 'rgba(255,255,255,.75)' }}>{message}</p>}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 10px' }}>
        {!plugins && <Loader2 size={16} className="animate-spin" style={{ margin: 16 }} />}
        {plugins && !groups.length && !message && <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', padding: 12 }}>No filter plug-ins found. Add the folder they are installed in.</p>}
        {groups.map(([cat, rows]) => <section key={cat} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.4)', padding: '6px 4px' }}>{cat}</div>
          {rows.map(p => <button key={p.id} disabled={!hasImage || !!running} onClick={() => void run(p)} className="flex items-center gap-2" style={{ width: '100%', textAlign: 'left', fontSize: 12, padding: '6px 8px', borderRadius: 7, border: 0, background: 'transparent', color: hasImage ? '#fff' : 'rgba(255,255,255,.45)', cursor: hasImage ? 'pointer' : 'default' }}>
            {running === p.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}<span className="truncate" style={{ flex: 1 }}>{p.name}</span>{running === p.id && <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.5)' }}>{Math.round(progress * 100)}%</span>}
          </button>)}
        </section>)}
      </div>
    </aside>
  );
};

export default TelaPluginPanel;
