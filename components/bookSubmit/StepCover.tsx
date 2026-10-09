import React, { useMemo, useRef, useState } from 'react';
import { Crop, ImagePlus, Loader2, Palette, Trash2 } from 'lucide-react';
import type { BookDraft } from '../../services/bookmeta/types';
import { evaluateCover, COVER_IDEAL } from '../../services/bookmeta/cover';
import { cropToRatio, readImage, sniffImageMime, uploadCover } from '../../services/bookmeta/coverUpload';
import { Card, FindingList, btnGhost } from './ui';

interface Props {
  draft: BookDraft;
  update: (patch: Partial<BookDraft>) => void;
  flush: () => Promise<void>;
}

export default function StepCover({ draft, update, flush }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lastBlob = useRef<Blob | null>(null); // avoids a CORS-prone re-download when cropping what was just uploaded
  const cover = draft.cover;
  const report = useMemo(() => cover ? evaluateCover(cover) : null, [cover]);

  const take = async (file?: File, cropFirst = false) => {
    if (!file) return;
    setError(null); setBusy(true);
    try {
      const mime = await sniffImageMime(file);
      let blob: Blob = file.type === mime ? file : new Blob([file], { type: mime });
      const img = await readImage(blob); URL.revokeObjectURL(img.url);
      let dims = { width: img.width, height: img.height };
      if (cropFirst) { const c = await cropToRatio(blob); blob = c.blob; dims = { width: c.width, height: c.height }; }
      lastBlob.current = blob;
      update({ cover: await uploadCover(blob, file.name, draft.ownerId, draft.id, dims) });
    } catch (e: any) { setError(e?.message || 'Could not use that image. Check you are signed in and online, then try again.'); }
    finally { setBusy(false); }
  };

  const cropCurrent = async () => {
    if (!cover?.url) return;
    setBusy(true); setError(null);
    try {
      const blob = lastBlob.current ?? await (await fetch(cover.url)).blob();
      const c = await cropToRatio(new Blob([blob], { type: cover.mime }));
      lastBlob.current = c.blob;
      update({ cover: await uploadCover(c.blob, cover.fileName || 'cover', draft.ownerId, draft.id, c) });
    } catch (e: any) { setError(e?.message || 'Crop failed.'); } finally { setBusy(false); }
  };

  const openTela = async () => {
    await flush(); // the wizard unmounts when Tela opens: make sure the draft is safe first
    window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { purpose: 'book-cover', width: COVER_IDEAL.width, height: COVER_IDEAL.height, title: draft.metadata.title } }));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files?.[0]); }}
            className={`relative aspect-[1/1.6] w-full max-w-[220px] mx-auto rounded-2xl overflow-hidden border-2 ${drag ? 'border-amber-400 bg-amber-400/10' : 'border-dashed border-white/15 bg-white/[0.03]'} flex items-center justify-center`}>
            {cover?.url ? <img src={cover.url} alt="Book cover preview" className="w-full h-full object-cover" /> : (
              <button type="button" onClick={() => input.current?.click()} className="flex flex-col items-center gap-2 text-white/40 p-4 text-center"><ImagePlus size={28} /><span className="text-xs">Drop a cover or click to choose</span></button>
            )}
            {busy && <div className="absolute inset-0 bg-black/60 flex items-center justify-center" role="status"><Loader2 className="animate-spin text-amber-400" /></div>}
          </div>
          {cover?.url && (
            <div className="mt-3 flex items-center justify-center gap-3" aria-label="Thumbnail test">
              <img src={cover.url} alt="" width={80} className="rounded shadow" style={{ aspectRatio: '1/1.6', objectFit: 'cover' }} />
              <img src={cover.url} alt="" width={40} className="rounded shadow" style={{ aspectRatio: '1/1.6', objectFit: 'cover' }} />
              <p className="text-[10px] text-white/35 max-w-[90px] leading-tight">Can you still read the title at this size?</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Cover requirements" subtitle={<>JPG or PNG, up to 50 MB. Ideal is <b className="text-white/70">1600 x 2560 px</b> (ratio 1.6). Minimum 625 x 1000.</>}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnGhost} onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={14} /> {cover ? 'Replace cover' : 'Upload cover'}</button>
              <button type="button" className={btnGhost} onClick={cropCurrent} disabled={busy || !cover}><Crop size={14} /> Crop to 1.6 : 1</button>
              <button type="button" className={btnGhost} onClick={openTela}><Palette size={14} /> Make a cover in Tela</button>
              {cover && <button type="button" className={btnGhost} onClick={() => update({ cover: null })}><Trash2 size={14} /> Remove</button>}
            </div>
            <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />
            <p className="text-[11px] text-white/35 leading-snug">Making one in Tela saves your draft first. Export it at 1600 x 2560, then come back through "My Books" and upload it here.</p>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          </Card>
          {cover && report && (
            <Card title={`${cover.width} x ${cover.height}px · ${(cover.bytes / 1048576).toFixed(1)} MB · ratio ${report.ratio.toFixed(2)}`}>
              <FindingList findings={report.findings} empty="Cover looks great." />
              <p className="text-[11px] text-white/30">We cannot read the text on your cover, so make sure the title and author name on it match the details you enter next.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
