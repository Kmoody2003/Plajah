import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Upload, Download, Music2, Image as ImageIcon, Film, Loader2, Check, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { transcodeToProxy, canTranscode } from './plajahPixels/engine/core/proxyTranscoder';

// ── Media Converter Lite ──────────────────────────────────────────────────────
// A browser-only converter surfaced on the Apps page. It is deliberately the LITE
// sibling of the desktop Crossover app: everything runs client-side with no server
// and no ffmpeg.wasm. That bounds what's honestly possible —
//   • Audio  → decode anything the browser can, re-encode losslessly to WAV (16/24-bit),
//              optional resample / channel fold via OfflineAudioContext.
//   • Image  → canvas re-encode to PNG / JPEG / WebP, optional resize.
//   • Video  → H.264 MP4 proxy via WebCodecs (Chromium; reuses the Pixels transcoder).
// Lossy audio (MP3/AAC) and arbitrary container/codec transcodes need the desktop app.

type Tab = 'AUDIO' | 'IMAGE' | 'VIDEO';
type Status = 'idle' | 'working' | 'done' | 'error';

const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

// ── WAV encoder (PCM 16- or 24-bit, interleaved) ──────────────────────────────
function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24): Blob {
  const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, bytesPer = bitDepth / 8;
  const frames = buffer.length;
  const dataLen = frames * numCh * bytesPer;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPer, true); view.setUint16(32, numCh * bytesPer, true); view.setUint16(34, bitDepth, true);
  ws(36, 'data'); view.setUint32(40, dataLen, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      if (bitDepth === 16) { view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
      else { const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); view.setUint8(off, v & 0xff); view.setUint8(off + 1, (v >> 8) & 0xff); view.setUint8(off + 2, (v >> 16) & 0xff); off += 3; }
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

async function convertAudio(file: File, opts: { bitDepth: 16 | 24; sampleRate: number | 'keep'; channels: 'keep' | 1 | 2 }): Promise<Blob> {
  const AC = (window.AudioContext || (window as any).webkitAudioContext);
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  ctx.close();
  const targetSr = opts.sampleRate === 'keep' ? decoded.sampleRate : opts.sampleRate;
  const targetCh = opts.channels === 'keep' ? decoded.numberOfChannels : opts.channels;
  // Resample / channel-map through an OfflineAudioContext when anything differs.
  if (targetSr !== decoded.sampleRate || targetCh !== decoded.numberOfChannels) {
    const frames = Math.ceil(decoded.duration * targetSr);
    const off = new OfflineAudioContext(targetCh, frames, targetSr);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start(0);
    return encodeWav(await off.startRendering(), opts.bitDepth);
  }
  return encodeWav(decoded, opts.bitDepth);
}

async function convertImage(file: File, opts: { format: 'png' | 'jpeg' | 'webp'; quality: number; maxDim: number | 'keep' }): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image decode failed')); i.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    if (opts.maxDim !== 'keep') { const s = Math.min(1, opts.maxDim / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s); }
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d')!;
    if (opts.format === 'jpeg') { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); } // JPEG has no alpha
    c.drawImage(img, 0, 0, w, h);
    const mime = `image/${opts.format}`;
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, mime, opts.quality));
    if (!blob) throw new Error('encode failed (format may be unsupported here)');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

interface Item { id: string; file: File; kind: Tab; status: Status; outUrl?: string; outName?: string; outSize?: number; error?: string; }

const SEG: React.FC<{ options: (string | number)[]; value: string | number; onChange: (v: any) => void; labels?: Record<string, string> }> = ({ options, value, onChange, labels }) => (
  <div className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5">
    {options.map(o => (
      <button key={String(o)} onClick={() => onChange(o)}
        className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors ${value === o ? 'bg-[#FF8C00] text-black' : 'text-white/50 hover:text-white'}`}>
        {labels?.[String(o)] ?? o}
      </button>
    ))}
  </div>
);

const MediaConverter: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('AUDIO');
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Audio opts
  const [aBits, setABits] = useState<16 | 24>(16);
  const [aSr, setASr] = useState<number | 'keep'>('keep');
  const [aCh, setACh] = useState<'keep' | 1 | 2>('keep');
  // Image opts
  const [iFmt, setIFmt] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [iQual, setIQual] = useState(0.92);
  const [iMax, setIMax] = useState<number | 'keep'>('keep');
  // Video opts
  const [vMax, setVMax] = useState(1080);
  const [vFps, setVFps] = useState(30);
  const [webcodecs] = useState(() => typeof (window as any).VideoEncoder !== 'undefined');

  const kindOf = (f: File): Tab => f.type.startsWith('video') ? 'VIDEO' : f.type.startsWith('image') ? 'IMAGE' : 'AUDIO';

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files).map(f => ({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, file: f, kind: kindOf(f), status: 'idle' as Status }));
    setItems(prev => [...prev, ...next]);
  }, []);

  const runOne = async (it: Item) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'working', error: undefined } : x));
    try {
      let blob: Blob; let ext: string;
      if (it.kind === 'AUDIO') { blob = await convertAudio(it.file, { bitDepth: aBits, sampleRate: aSr, channels: aCh }); ext = 'wav'; }
      else if (it.kind === 'IMAGE') { blob = await convertImage(it.file, { format: iFmt, quality: iQual, maxDim: iMax }); ext = iFmt === 'jpeg' ? 'jpg' : iFmt; }
      else {
        const out = await transcodeToProxy(it.file, { maxW: vMax === 1080 ? 1920 : vMax === 720 ? 1280 : 854, maxH: vMax, fps: vFps });
        if (!out) throw new Error(webcodecs ? 'Transcode failed (clip may be too long — 180s cap — or unreadable).' : 'Video encode needs a Chromium browser (Chrome/Edge).');
        blob = out; ext = 'mp4';
      }
      const outName = it.file.name.replace(/\.[^/.]+$/, '') + `.${ext}`;
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'done', outUrl: URL.createObjectURL(blob), outName, outSize: blob.size } : x));
    } catch (e: any) {
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'error', error: e?.message || 'Conversion failed' } : x));
    }
  };

  const runAll = () => { items.filter(i => i.status === 'idle' || i.status === 'error').forEach(runOne); };
  const clearDone = () => setItems(prev => prev.filter(i => i.status !== 'done'));

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'AUDIO', label: 'Audio', icon: <Music2 size={13} /> },
    { id: 'IMAGE', label: 'Image', icon: <ImageIcon size={13} /> },
    { id: 'VIDEO', label: 'Video', icon: <Film size={13} /> },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[300] bg-[#050507] flex flex-col" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8 shrink-0">
        <RefreshCw size={18} className="text-[#FF8C00]" />
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">Media Converter</p>
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">Lite · runs in your browser</p>
        </div>
        <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-5">
        {/* Tabs */}
        <div className="flex items-center gap-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-[#FF8C00] text-black' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Options */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Output settings</p>
          {tab === 'AUDIO' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Format</span><span className="text-[10px] font-black text-white">WAV (lossless PCM)</span></div>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Bit depth</span><SEG options={[16, 24]} value={aBits} onChange={setABits} labels={{ 16: '16-bit', 24: '24-bit' }} /></div>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Sample rate</span><SEG options={['keep', 44100, 48000, 22050]} value={aSr} onChange={setASr} labels={{ keep: 'Keep', 44100: '44.1k', 48000: '48k', 22050: '22k' }} /></div>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Channels</span><SEG options={['keep', 2, 1]} value={aCh} onChange={setACh} labels={{ keep: 'Keep', 2: 'Stereo', 1: 'Mono' }} /></div>
              <p className="text-[9px] text-white/30 leading-relaxed">Decodes any format your browser supports (FLAC, AIFF, ALAC, 24/32-bit WAV, MP3, Ogg…) and re-encodes losslessly to WAV. MP3/AAC export needs the desktop Crossover app.</p>
            </div>
          )}
          {tab === 'IMAGE' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Format</span><SEG options={['png', 'jpeg', 'webp']} value={iFmt} onChange={setIFmt} labels={{ png: 'PNG', jpeg: 'JPEG', webp: 'WebP' }} /></div>
              {iFmt !== 'png' && (
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-white/60">Quality</span>
                  <div className="flex items-center gap-2 flex-1 max-w-[220px]"><input type="range" min={0.4} max={1} step={0.01} value={iQual} onChange={e => setIQual(parseFloat(e.target.value))} className="w-full accent-[#FF8C00] h-1" /><span className="text-[9px] font-black text-white/60 tabular-nums w-8">{Math.round(iQual * 100)}%</span></div>
                </div>
              )}
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Max dimension</span><SEG options={['keep', 3840, 1920, 1280, 640]} value={iMax} onChange={setIMax} labels={{ keep: 'Keep', 3840: '4K', 1920: '1080', 1280: '720', 640: '640' }} /></div>
            </div>
          )}
          {tab === 'VIDEO' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Format</span><span className="text-[10px] font-black text-white">MP4 · H.264 (instant-seek proxy)</span></div>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Max resolution</span><SEG options={[1080, 720, 480]} value={vMax} onChange={setVMax} labels={{ 1080: '1080p', 720: '720p', 480: '480p' }} /></div>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-white/60">Frame rate</span><SEG options={[30, 24, 60]} value={vFps} onChange={setVFps} labels={{ 30: '30fps', 24: '24fps', 60: '60fps' }} /></div>
              {!webcodecs
                ? <p className="text-[9px] text-amber-400/80 flex items-center gap-1.5"><AlertTriangle size={11} /> Video encode needs a Chromium browser (Chrome/Edge). Audio & image work everywhere.</p>
                : <p className="text-[9px] text-white/30 leading-relaxed">Re-encodes to a universally-playable H.264 MP4 optimized for instant seek. Clips are capped at 180s and 1080p. Full codec/container control lives in the desktop Crossover app.</p>}
            </div>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${drag ? 'border-[#FF8C00] bg-[#FF8C00]/5' : 'border-white/12 hover:border-white/25'}`}>
          <Upload size={26} className="mx-auto text-white/40 mb-3" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white/60">Drop files or click to browse</p>
          <p className="text-[9px] text-white/25 mt-1">Audio · images · video — everything converts locally, nothing is uploaded</p>
          <input ref={fileRef} type="file" multiple accept="audio/*,image/*,video/*" className="hidden" onChange={e => e.target.files && addFiles(e.target.files)} />
        </div>

        {/* Queue */}
        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={runAll} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FF8C00] text-black text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/90"><RefreshCw size={12} /> Convert all</button>
              <button onClick={clearDone} className="px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white">Clear done</button>
              <button onClick={() => setItems([])} className="px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white">Clear all</button>
            </div>
            {items.map(it => (
              <div key={it.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                <div className="text-white/40">{it.kind === 'AUDIO' ? <Music2 size={16} /> : it.kind === 'IMAGE' ? <ImageIcon size={16} /> : <Film size={16} />}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white truncate">{it.file.name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">{fmtBytes(it.file.size)}{it.outSize != null && <span className="text-[#FF8C00]"> → {fmtBytes(it.outSize)}</span>}{it.error && <span className="text-rose-400"> · {it.error}</span>}</p>
                </div>
                {it.status === 'working' && <Loader2 size={16} className="text-[#FF8C00] animate-spin" />}
                {it.status === 'error' && <AlertTriangle size={16} className="text-rose-400" />}
                {it.status === 'idle' && <button onClick={() => runOne(it)} className="px-3 py-1.5 rounded-full bg-white/8 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white">Convert</button>}
                {it.status === 'done' && it.outUrl && (
                  <a href={it.outUrl} download={it.outName} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#22D3AA] text-black text-[9px] font-black uppercase tracking-widest"><Check size={12} /> Download</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MediaConverter;
