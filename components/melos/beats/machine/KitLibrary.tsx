// MEKA's Library — the Maschine browser for the kits people already own. Point it at folders
// (Native Instruments content, MPC expansions, Ableton User Library, Studio One sound sets, Splice
// packs…); it indexes every kit file and one-shot it can read. Three tabs:
//   Groups — kits: Maschine Groups, Battery, MPC programs, Drum Racks, Impact, Bitwig Drum
//            Machine, SFZ, Hydrogen, Decent Sampler, SoundFont, mixed one-shot folders. Loading
//            one replaces the 16 pads of the current Group (or a new one), like Maschine.
//   Sounds — one-shots by type (Kick, Snare, Hat…), click to hear, load onto the selected pad.
//   Mine   — Groups saved from MEKA ("Save Group").

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus, RefreshCw, Plug, Play, X, Layers, Music2, Star, Trash2, Info } from 'lucide-react';
import type { GrooveDoc, SampleRef } from '../../../../services/melos/beats/grooveDoc';
import { BANK_LETTERS, bankCount } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample, backupToLocker, hydrateSample } from '../../../../services/melos/beats/sampleStore';
import {
  addLibraryFolder, buildLookup, deleteUserKit, grantRoots, kitLibrarySupported, loadKitIndex, loadRoots, loadUserKits,
  openKit, readKitSample, readLibrarySample, removeLibraryFolder, scanKitLibrary, fileAt, type FsHandle,
} from '../../../../services/melos/beats/kits/kitLibrary';
import { applyKitToGroup, applyUserKit, groupLabel, type UserKit } from '../../../../services/melos/beats/kits/applyKit';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../../../../services/melos/beats/kits/drumClassify';
import { KIT_FORMAT_LABEL, type KitFormat, type KitLibraryIndex, type KitSpec, type LibraryKit, type LibrarySample, type SampleCategory } from '../../../../services/melos/beats/kits/types';
import { PLAYHEAD, SELECT } from '../theme';

type Tab = 'groups' | 'sounds' | 'mine';

interface Props {
  doc: GrooveDoc;
  selectedPad: number;
  /** The Group (bank of 16) showing in the pad grid — kits load here by default. */
  bank: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onLoadSampleFile: (padIdx: number, file: File) => void;
  onSelectPad: (i: number) => void;
}

const CATS: SampleCategory[] = ['kick', 'snare', 'clap', 'hat-closed', 'hat-open', 'hat', 'cymbal', 'tom', 'perc', 'bass', 'fx', 'vocal', 'loop', 'other'];
const LIST_CAP = 400;

async function playPreview(file: File | Blob): Promise<void> {
  const engine = BeatsEngine.get();
  await engine.init();
  const ctx = engine.getContext();
  if (!ctx) return;
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    // Previews go straight to the output — auditioning shouldn't touch the mix.
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start();
  } catch { /* undecodable preview */ }
}

export const KitLibrary: React.FC<Props> = ({ doc, selectedPad, bank, onMutate, onLoadSampleFile, onSelectPad }) => {
  const [roots, setRoots] = useState<FsHandle[]>([]);
  const [granted, setGranted] = useState<boolean[]>([]);
  const [index, setIndex] = useState<KitLibraryIndex | null>(null);
  const [userKits, setUserKits] = useState<UserKit[]>([]);
  const [tab, setTab] = useState<Tab>('groups');
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState('');
  const [format, setFormat] = useState<KitFormat | ''>('');
  const [cat, setCat] = useState<SampleCategory | ''>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sel, setSel] = useState<LibraryKit | null>(null);
  const [spec, setSpec] = useState<KitSpec | null>(null);
  const [selSound, setSelSound] = useState<LibrarySample | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await loadRoots();
      setRoots(r);
      setGranted(await grantRoots(r, false));
      setIndex(await loadKitIndex());
      setUserKits(await loadUserKits());
    })();
  }, []);
  // "Save Group" in the Group menu writes here — refresh when it does.
  useEffect(() => {
    const on = () => { void loadUserKits().then(setUserKits); };
    window.addEventListener('meka:user-kits', on);
    return () => window.removeEventListener('meka:user-kits', on);
  }, []);

  const lookup = useMemo(() => (index ? buildLookup(index) : null), [index]);
  const allGranted = roots.length > 0 && granted.length === roots.length && granted.every(Boolean);

  const rescan = useCallback(async (r: FsHandle[]) => {
    const ok = await grantRoots(r, true);
    setGranted(ok);
    if (!ok.every(Boolean)) { setStatus('Folder access wasn’t granted.'); return; }
    setBusy('Scanning…');
    try { setIndex(await scanKitLibrary(r, (m) => setBusy(m))); setStatus(null); }
    finally { setBusy(null); }
  }, []);

  const addFolder = useCallback(async () => {
    const r = await addLibraryFolder();
    if (!r) return;
    setRoots(r);
    await rescan(r);
  }, [rescan]);

  const reconnect = useCallback(async () => { setGranted(await grantRoots(roots, true)); }, [roots]);

  const products = useMemo(() => {
    const set = new Set<string>();
    for (const k of index?.kits ?? []) set.add(k.product);
    if (tab === 'sounds') for (const s of index?.samples ?? []) set.add(s.product);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [index, tab]);
  const formats = useMemo(() => [...new Set((index?.kits ?? []).map((k) => k.format))], [index]);

  const q = query.trim().toLowerCase();
  const kits = useMemo(() => (index?.kits ?? []).filter((k) =>
    (!product || k.product === product) && (!format || k.format === format)
    && (!q || k.name.toLowerCase().includes(q) || k.product.toLowerCase().includes(q))).slice(0, LIST_CAP), [index, product, format, q]);
  const sounds = useMemo(() => (index?.samples ?? []).filter((s) =>
    (!product || s.product === product) && (!cat || s.category === cat)
    && (!q || s.name.toLowerCase().includes(q) || s.path.toLowerCase().includes(q))).slice(0, LIST_CAP), [index, product, cat, q]);

  // Opening a kit parses it (cheap) so its pads show before you commit to loading it.
  const pick = useCallback(async (k: LibraryKit) => {
    setSel(k); setSpec(null); setStatus(null);
    if (!allGranted || !index) return;
    try { setSpec(await openKit(roots, index, k)); } catch (e) { setStatus(`Couldn’t read this kit (${(e as Error).message || 'error'}).`); }
    if (k.previewPath) { const f = await fileAt(roots[k.root], k.previewPath); if (f) void playPreview(f); }
  }, [allGranted, index, roots]);

  const loadKit = useCallback(async (k: LibraryKit, targetBank: number) => {
    if (!index || !lookup) return;
    setBusy(`Loading ${k.name}…`);
    try {
      const kit = spec && sel?.id === k.id ? spec : await openKit(roots, index, k);
      if (!kit) { setStatus('Couldn’t open this kit.'); return; }
      const engine = BeatsEngine.get();
      await engine.init();
      const ctx = engine.getContext();
      if (!ctx) return;
      const refs = new Map<number, SampleRef>();
      let n = 0;
      for (const pad of kit.pads) {
        if (!pad.sample) continue;
        setBusy(`Loading ${k.name} — ${++n}/${kit.pads.length}`);
        const got = await readKitSample(roots, lookup, k, pad.sample);
        if (!got) continue;
        const res = await ingestSample(got.file, pad.name, ctx);
        if (!res) continue;
        engine.setSampleBuffer(res.ref.key, res.buffer);
        refs.set(pad.slot, res.ref);
      }
      let result: ReturnType<typeof applyKitToGroup> | null = null;
      onMutate((d) => { result = applyKitToGroup(d, targetBank, kit, refs); });
      engine.syncInstruments(); // replaced instrument pads drop their tracks
      onSelectPad(targetBank * 16);
      const r = result as ReturnType<typeof applyKitToGroup> | null;
      const miss = r?.missing.length ? ` · ${r.missing.length} sample${r.missing.length > 1 ? 's' : ''} not found — add the folder that holds them` : '';
      setStatus(`${kit.name} → ${r ? r.banks.map((b) => BANK_LETTERS[b]).join(', ') : ''} · ${refs.size} pads${miss}`);
      for (const ref of refs.values()) void backupToLocker(ref);
    } finally { setBusy(null); }
  }, [index, lookup, roots, spec, sel, onMutate, onSelectPad]);

  const loadSound = useCallback(async (s: LibrarySample) => {
    const f = await readLibrarySample(roots, s);
    if (f) onLoadSampleFile(selectedPad, f);
  }, [roots, selectedPad, onLoadSampleFile]);

  const loadUser = useCallback(async (k: UserKit, targetBank: number) => {
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (ctx) for (const p of k.pads) if (p?.sample) { const b = await hydrateSample(p.sample, ctx); if (b) engine.setSampleBuffer(p.sample.key, b); }
    onMutate((d) => applyUserKit(d, targetBank, k));
    engine.syncInstruments();
    onSelectPad(targetBank * 16);
    setStatus(`${k.name} → Group ${BANK_LETTERS[targetBank]}`);
  }, [onMutate, onSelectPad]);

  if (!kitLibrarySupported()) {
    return <p className="text-[10px] text-white/30 leading-relaxed">The Library reads kit folders through the File System Access API — use Chrome, Edge or the Plajah desktop app.</p>;
  }

  const newBank = bankCount(doc.kit);
  const chip = (on: boolean) => on ? { color: '#fff', borderColor: `${SELECT}80`, background: `${SELECT}22` } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.1)' };

  return (
    <div className="flex flex-col gap-2 min-h-0 h-full">
      {/* Library folders */}
      <div className="flex items-center gap-1.5 flex-none">
        <button onClick={() => void addFolder()} className="h-7 px-2 rounded-lg border border-white/15 text-[10px] text-white/60 hover:text-white flex items-center gap-1.5" title="Add a folder: Native Instruments content, MPC expansions, sample packs…">
          <FolderPlus size={11} /> Add folder
        </button>
        {roots.length > 0 && !allGranted && (
          <button onClick={() => void reconnect()} className="h-7 px-2 rounded-lg border border-[#FF8C00]/40 text-[10px] text-[#FF8C00] flex items-center gap-1.5" title="Browsers ask again for folder access each session">
            <Plug size={11} /> Reconnect
          </button>
        )}
        {roots.length > 0 && (
          <button onClick={() => void rescan(roots)} aria-label="Rescan library" title="Rescan" className="h-7 w-7 grid place-items-center rounded-lg border border-white/15 text-white/40 hover:text-white">
            <RefreshCw size={11} />
          </button>
        )}
      </div>
      {roots.length > 0 && (
        <div className="flex flex-wrap gap-1 flex-none">
          {roots.map((r, i) => (
            <span key={r.name + i} className="inline-flex items-center gap-1 h-5 pl-1.5 pr-0.5 rounded border border-white/10 text-[9px] text-white/45" title={granted[i] ? 'Connected' : 'Needs Reconnect'}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: granted[i] ? '#6FE3A1' : '#FF8C00' }} />
              <span className="max-w-[110px] truncate">{r.name}</span>
              <button aria-label={`Remove ${r.name}`} onClick={async () => { const next = await removeLibraryFolder(i); setRoots(next); setGranted(await grantRoots(next, false)); }} className="w-4 h-4 grid place-items-center text-white/30 hover:text-white"><X size={9} /></button>
            </span>
          ))}
        </div>
      )}
      {busy && <p className="text-[10px] truncate flex-none" style={{ color: PLAYHEAD }}>{busy}</p>}
      {status && !busy && <p className="text-[10px] text-white/55 leading-snug flex-none">{status}</p>}

      {!roots.length && (
        <div className="text-[10px] text-white/35 leading-relaxed flex flex-col gap-1.5">
          <p>Bring your kits: add the folders where they live and MEKA reads them onto its pads.</p>
          <p className="text-white/25">Maschine Groups &amp; Sounds · Battery · MPC / Force programs · Ableton Drum Racks · Studio One Impact · Bitwig Drum Machine · SFZ · Hydrogen · Decent Sampler · SoundFont · any folder of one-shots.</p>
          <p className="text-white/25">Tip: NI expansions live under your Native Instruments content folder (Native Access → Preferences → Content location).</p>
        </div>
      )}

      {index && (
        <>
          <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5 flex-none">
            {([['groups', Layers, `Groups ${index.kits.length}`], ['sounds', Music2, `Sounds ${index.samples.length}`], ['mine', Star, `Mine ${userKits.length}`]] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => { setTab(t); setProduct(''); }} className={`flex-1 h-6 rounded-md text-[9.5px] flex items-center justify-center gap-1 ${tab === t ? 'bg-white/15 text-white font-semibold' : 'text-white/40 hover:text-white'}`}>
                <Icon size={10} /> {label}
              </button>
            ))}
          </div>
          {tab !== 'mine' && (
            <div className="flex flex-col gap-1.5 flex-none">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === 'groups' ? 'Search kits' : 'Search sounds'}
                className="h-7 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none focus:border-white/30" aria-label="Search the library" />
              <div className="flex gap-1">
                <select value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Product"
                  className="flex-1 min-w-0 h-6 rounded-md bg-black/40 border border-white/10 text-[10px] text-white/70 px-1 outline-none">
                  <option value="">All products</option>
                  {products.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {tab === 'groups' && (
                  <select value={format} onChange={(e) => setFormat(e.target.value as KitFormat | '')} aria-label="Format"
                    className="flex-1 min-w-0 h-6 rounded-md bg-black/40 border border-white/10 text-[10px] text-white/70 px-1 outline-none">
                    <option value="">All formats</option>
                    {formats.map((f) => <option key={f} value={f}>{KIT_FORMAT_LABEL[f]}</option>)}
                  </select>
                )}
              </div>
              {tab === 'sounds' && (
                <div className="flex flex-wrap gap-1">
                  {CATS.map((c) => (
                    <button key={c} onClick={() => setCat(cat === c ? '' : c)} className="h-5 px-1.5 rounded border text-[9px] flex items-center gap-1" style={chip(cat === c)}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_COLOR[c] }} />{CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-[120px] overflow-y-auto flex flex-col gap-0.5 pr-0.5">
            {tab === 'groups' && kits.map((k) => (
              <button key={k.id} onClick={() => void pick(k)} onDoubleClick={() => void loadKit(k, bank)}
                className="text-left px-2 py-1 rounded-lg" title="Click to open · double-click to load into this Group"
                style={sel?.id === k.id ? { background: `${SELECT}26`, color: '#fff' } : { color: 'rgba(255,255,255,0.6)' }}>
                <span className="flex items-center gap-1.5 text-[11px]">
                  {k.previewPath && <Play size={8} className="flex-none" style={{ color: PLAYHEAD }} />}
                  <span className="truncate flex-1">{k.name}</span>
                  <span className="text-[8px] font-mono text-white/30 flex-none">{KIT_FORMAT_LABEL[k.format]}</span>
                </span>
                <span className="block text-[9px] text-white/25 truncate">{k.product}</span>
              </button>
            ))}
            {tab === 'sounds' && sounds.map((s) => (
              <button key={`${s.root}:${s.path}`}
                onClick={async () => { setSelSound(s); const f = await readLibrarySample(roots, s); if (f) void playPreview(f); }}
                onDoubleClick={() => void loadSound(s)}
                className="text-left px-2 py-1 rounded-lg text-[11px] flex items-center gap-1.5" title={`Click to hear · double-click to load onto pad ${selectedPad + 1}`}
                style={selSound === s ? { background: `${SELECT}26`, color: '#fff' } : { color: 'rgba(255,255,255,0.6)' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: CATEGORY_COLOR[s.category] }} />
                <span className="truncate flex-1">{s.name}</span>
              </button>
            ))}
            {tab === 'mine' && userKits.map((k) => (
              <div key={k.id} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5">
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: k.color || SELECT }} />
                <button onClick={() => void loadUser(k, bank)} className="flex-1 min-w-0 text-left text-[11px] text-white/70 truncate" title={`Load into ${groupLabel(doc, bank)}`}>{k.name}</button>
                <span className="text-[8.5px] text-white/25">{k.pads.filter(Boolean).length}</span>
                <button aria-label={`Delete ${k.name}`} onClick={async () => setUserKits(await deleteUserKit(k.id))} className="w-5 h-5 grid place-items-center text-white/25 hover:text-white"><Trash2 size={10} /></button>
              </div>
            ))}
            {tab === 'groups' && !kits.length && <p className="text-[10px] text-white/25 px-2 py-3">No kits match.</p>}
            {tab === 'sounds' && !sounds.length && <p className="text-[10px] text-white/25 px-2 py-3">No sounds match.</p>}
            {tab === 'mine' && !userKits.length && <p className="text-[10px] text-white/25 px-2 py-3">Right-click a Group letter → Save Group to keep a kit here.</p>}
          </div>

          {tab === 'groups' && sel && (
            <div className="flex-none border-t border-white/10 pt-2 flex flex-col gap-1.5">
              <p className="text-[11px] text-white font-medium truncate">{sel.name}</p>
              <p className="text-[9px] text-white/35 truncate">{KIT_FORMAT_LABEL[sel.format]} · {sel.product}</p>
              {!allGranted && <p className="text-[9px] text-[#FF8C00]">Reconnect the library to open kits.</p>}
              {spec && (
                <>
                  {/* The kit's first Group as it will land — Maschine order, pad 1 bottom-left. */}
                  <div className="grid grid-cols-4 gap-0.5">
                    {Array.from({ length: 16 }, (_, cell) => {
                      const slot = (3 - Math.floor(cell / 4)) * 4 + (cell % 4);
                      const p = spec.pads.find((x) => x.slot === slot);
                      return (
                        <div key={cell} className="h-7 rounded px-1 text-[7.5px] leading-tight text-white/70 overflow-hidden border"
                          style={{ borderColor: p ? `${p.color || '#ffffff'}55` : 'rgba(255,255,255,0.06)', background: p ? `${p.color || '#ffffff'}14` : 'transparent', opacity: p?.sample || p?.drumSynth ? 1 : 0.4 }}
                          title={p ? (p.drumSynth ? `${p.name} — Drum Synth${p.drumSynth.from ? ` (from ${p.drumSynth.from})` : ''}` : p.name) : `Pad ${slot + 1} empty`}>{p?.drumSynth && '◆ '}{p?.name}</div>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-white/30">{spec.pads.filter((p) => p.sample || p.drumSynth).length} sounds{spec.pads.some((p) => p.drumSynth) ? ` (${spec.pads.filter((p) => p.drumSynth).length} drum synth)` : ''}{spec.pads.some((p) => p.slot > 15) ? ` · fills ${Math.floor(Math.max(...spec.pads.map((p) => p.slot)) / 16) + 1} Groups` : ''}</p>
                  {spec.notes.map((n, i) => (
                    <p key={i} className="text-[9px] text-white/30 leading-snug flex gap-1"><Info size={9} className="flex-none mt-0.5" />{n}</p>
                  ))}
                </>
              )}
              <div className="flex gap-1">
                <button disabled={!allGranted || !!busy} onClick={() => void loadKit(sel, bank)}
                  className="flex-1 h-7 rounded-lg border text-[10px] disabled:opacity-30" style={{ borderColor: `${PLAYHEAD}66`, color: PLAYHEAD }}>
                  Load into {BANK_LETTERS[bank]}
                </button>
                <button disabled={!allGranted || !!busy} onClick={() => void loadKit(sel, newBank)}
                  className="flex-1 h-7 rounded-lg border border-white/15 text-[10px] text-white/60 hover:text-white disabled:opacity-30">
                  New Group {BANK_LETTERS[newBank] ?? ''}
                </button>
              </div>
            </div>
          )}
          {tab === 'sounds' && selSound && (
            <div className="flex-none border-t border-white/10 pt-2">
              <p className="text-[11px] text-white truncate">{selSound.name}</p>
              <p className="text-[9px] text-white/30 truncate">{selSound.path}</p>
              <button disabled={!allGranted} onClick={() => void loadSound(selSound)} className="w-full h-7 mt-1.5 rounded-lg border text-[10px] disabled:opacity-30" style={{ borderColor: `${PLAYHEAD}66`, color: PLAYHEAD }}>
                Load onto pad {selectedPad + 1}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
