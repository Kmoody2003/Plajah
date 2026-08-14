// NKS content browser (tier 3). Index a Komplete/NKS folder, browse by tag/bank/vendor,
// audition the preview render. Honest scope, stated in the UI: a browser cannot host a VST or
// Kontakt, so the preset's SOUND can't be loaded — what you get is the library's metadata,
// its macro names, and the preview audio (which you can drop on a pad as a sample).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderSearch, RefreshCw, Play, Info, Plug } from 'lucide-react';
import {
  nksSupported, pickNksLibrary, reconnectNksLibrary, scanNksLibrary, loadNksIndex, loadNksPreview,
} from '../../../../services/melos/beats/nks/nksIndex';
import type { NksIndexState, NksItem } from '../../../../services/melos/beats/nks/types';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { PLAYHEAD, SELECT } from '../theme';

interface NksBrowserProps {
  onUsePreviewAsSample: (item: NksItem, file: File) => void;
  onMacroNames: (names: string[]) => void;
}

export const NksBrowser: React.FC<NksBrowserProps> = ({ onUsePreviewAsSample, onMacroNames }) => {
  const [index, setIndex] = useState<NksIndexState | null>(null);
  const [handle, setHandle] = useState<unknown>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<NksItem | null>(null);

  useEffect(() => { void loadNksIndex().then(setIndex); }, []);

  const doPick = useCallback(async () => {
    const h = await pickNksLibrary();
    if (!h) return;
    setHandle(h);
    setScanning('Scanning…');
    const state = await scanNksLibrary(h, (n, cur) => setScanning(`${n} presets — ${cur}`));
    setIndex(state);
    setScanning(null);
  }, []);

  const doReconnect = useCallback(async () => {
    const h = await reconnectNksLibrary();
    if (h) setHandle(h);
  }, []);

  const filtered = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    if (!q) return index.items.slice(0, 300);
    return index.items.filter((i) =>
      i.name.toLowerCase().includes(q)
      || i.vendor.toLowerCase().includes(q)
      || i.bankchain.some((b) => b.toLowerCase().includes(q))
      || i.types.some((t) => t.some((x) => x.toLowerCase().includes(q)))
    ).slice(0, 300);
  }, [index, query]);

  const audition = useCallback(async (item: NksItem) => {
    setSelected(item);
    onMacroNames(item.macros || []);
    if (!item.previewPath || !handle) return;
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const buf = await loadNksPreview(handle as never, item.previewPath, ctx);
    if (!buf) return;
    // Play the preview straight to the destination — auditioning shouldn't touch the mix buses.
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }, [handle, onMacroNames]);

  const useAsSample = useCallback(async (item: NksItem) => {
    if (!item.previewPath || !handle) return;
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const buf = await loadNksPreview(handle as never, item.previewPath, ctx);
    if (!buf) return;
    // Re-encode the decoded preview as a WAV File so it flows through the normal ingest path.
    const { encodeWav } = await import('../../../../services/audio/wavEncode');
    const blob = encodeWav(buf, 16);
    onUsePreviewAsSample(item, new File([blob], `${item.name}.wav`, { type: 'audio/wav' }));
  }, [handle, onUsePreviewAsSample]);

  if (!nksSupported()) {
    return (
      <div className="text-[10px] text-white/30 leading-relaxed">
        NKS browsing needs the File System Access API — available in Chrome, Edge and other
        Chromium browsers.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-1.5">
        <button onClick={() => void doPick()} className="h-7 px-2 rounded-lg border border-white/15 text-[10px] text-white/60 hover:text-white flex items-center gap-1.5">
          <FolderSearch size={11} /> {index ? 'Change library' : 'Pick NKS library'}
        </button>
        {index && !handle && (
          <button onClick={() => void doReconnect()} title="Browsers require a click to re-grant folder access each session" className="h-7 px-2 rounded-lg border border-[#FF8C00]/40 text-[10px] text-[#FF8C00] flex items-center gap-1.5">
            <Plug size={11} /> Reconnect
          </button>
        )}
        {index && handle && (
          <button onClick={async () => { setScanning('Rescanning…'); setIndex(await scanNksLibrary(handle as never, (n, c) => setScanning(`${n} — ${c}`))); setScanning(null); }} aria-label="Rescan" className="h-7 w-7 grid place-items-center rounded-lg border border-white/15 text-white/40 hover:text-white">
            <RefreshCw size={11} />
          </button>
        )}
      </div>

      {scanning && <p className="text-[10px] text-[#00DAF3] truncate">{scanning}</p>}

      {index && (
        <>
          <p className="text-[9px] text-white/25">
            {index.items.length} presets · {index.rootName}{index.skipped ? ` · ${index.skipped} unreadable` : ''}
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, bank, vendor, tag"
            className="h-7 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none focus:border-white/30"
          />
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 max-h-52">
            {filtered.map((item) => (
              <button
                key={item.path}
                onClick={() => void audition(item)}
                className="text-left px-2 py-1 rounded-lg text-[11px] group"
                style={selected?.path === item.path ? { background: `${SELECT}26`, color: '#fff' } : { color: 'rgba(255,255,255,0.55)' }}
              >
                <span className="flex items-center gap-1.5">
                  {item.previewPath && <Play size={9} className="flex-none" style={{ color: PLAYHEAD }} />}
                  <span className="truncate flex-1">{item.name}</span>
                </span>
                <span className="block text-[9px] text-white/25 truncate">{item.bankchain.join(' › ') || item.vendor}</span>
              </button>
            ))}
            {!filtered.length && <p className="text-[10px] text-white/25 px-2 py-3">No presets match.</p>}
          </div>
        </>
      )}

      {selected && (
        <div className="flex-none border-t border-white/10 pt-2">
          <p className="text-[11px] text-white font-medium truncate">{selected.name}</p>
          <p className="text-[9px] text-white/35 truncate">{[selected.vendor, selected.author].filter(Boolean).join(' · ')}</p>
          {!!selected.types.length && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {selected.types.flat().slice(0, 6).map((t, i) => (
                <span key={i} className="text-[8.5px] px-1.5 py-0.5 rounded border border-white/10 text-white/40">{t}</span>
              ))}
            </div>
          )}
          {!!selected.macros.filter(Boolean).length && (
            <p className="text-[9px] text-white/30 mt-1.5">Macros: {selected.macros.filter(Boolean).join(', ')}</p>
          )}
          <button
            onClick={() => void useAsSample(selected)}
            disabled={!selected.previewPath || !handle}
            className="w-full h-7 mt-2 rounded-lg border border-[#00DAF3]/40 text-[10px] text-[#00DAF3] hover:bg-[#00DAF3]/10 disabled:opacity-30"
          >Load preview onto pad</button>
          <p className="mt-1.5 text-[9px] text-white/25 leading-relaxed flex gap-1">
            <Info size={9} className="flex-none mt-0.5" />
            NKS presets are plugin state — the instrument itself needs a desktop host. Beats reads
            the library's tags, macros and preview audio.
          </p>
        </div>
      )}
    </div>
  );
};
