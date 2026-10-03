import React, { useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, ScanLine, Trash2 } from 'lucide-react';
import {
  addWindowsVstDirectory,
  isWindowsApp,
  listWindowsVstDirectories,
  removeWindowsVstDirectory,
  scanWindowsVst3,
  type WindowsVstPlugin,
} from '../../../../services/windowsBridgeService';

export const WindowsVstBrowser: React.FC = () => {
  const [directories, setDirectories] = useState<string[]>([]);
  const [plugins, setPlugins] = useState<WindowsVstPlugin[]>([]);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isWindowsApp()) return;
    void listWindowsVstDirectories().then(setDirectories).catch(() => setMessage('Could not read VST3 directories.'));
  }, []);

  if (!isWindowsApp()) return null;

  const scan = async () => {
    setBusy(true); setMessage('Scanning VST3 bundles...');
    try {
      setPlugins(await scanWindowsVst3());
      setMessage('Scan complete. Native plugin hosting is the next Windows audio layer.');
    } catch { setMessage('VST3 scan failed.'); }
    finally { setBusy(false); }
  };

  const add = async () => {
    if (!path.trim()) return;
    setBusy(true);
    try { setDirectories(await addWindowsVstDirectory(path.trim())); setPath(''); setMessage('Directory added.'); }
    catch { setMessage('That directory does not exist or cannot be read.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3">
      <div className="flex items-center gap-2">
        <ScanLine size={14} className="text-cyan-300" />
        <span className="text-[11px] font-semibold text-white">Windows VST3</span>
        <button onClick={() => void scan()} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[9px] text-white/65 hover:text-white disabled:opacity-40">
          <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Scan
        </button>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-white/40">Installed plugins are discovered here. DSP hosting will run in the native audio process, never inside WebView2.</p>
      <div className="mt-2 flex gap-1.5">
        <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:\\VST3\\Custom" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-white outline-none" />
        <button onClick={() => void add()} disabled={busy || !path.trim()} aria-label="Add VST3 directory" className="rounded-md border border-white/10 px-2 text-white/60 hover:text-white disabled:opacity-40"><FolderOpen size={13} /></button>
      </div>
      {directories.length > 0 && <div className="mt-2 space-y-1">{directories.map((directory) => <div key={directory} className="flex items-center gap-2 text-[9px] text-white/40"><span className="min-w-0 flex-1 truncate">{directory}</span><button onClick={() => void removeWindowsVstDirectory(directory).then(setDirectories)} aria-label={`Remove ${directory}`}><Trash2 size={11} /></button></div>)}</div>}
      {plugins.length > 0 && <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-white/10 pt-2">{plugins.map((plugin) => <div key={plugin.path} className="truncate text-[10px] text-cyan-100/75" title={plugin.path}>{plugin.name}</div>)}</div>}
      {message && <div className="mt-2 text-[9px] text-white/35">{message}</div>}
    </section>
  );
};
