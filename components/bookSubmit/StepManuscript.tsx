import React, { useCallback, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Loader2, Merge, Scissors, UploadCloud, Wand2 } from 'lucide-react';
import type { BookDraft, Finding } from '../../services/bookmeta/types';
import { ingestManuscript, mergeChapters, splitChapter, chapterReviewFindings, MANUSCRIPT_ACCEPT, type IngestResult } from '../../services/bookmeta/manuscript';
import { readImage, uploadCover, sniffImageMime } from '../../services/bookmeta/coverUpload';
import { FindingList, Card, btnGhost, inputCls } from './ui';

interface Props {
  draft: BookDraft;
  update: (patch: Partial<BookDraft> | ((d: BookDraft) => Partial<BookDraft>)) => void;
  onNext: () => void;
}

const KINDS: { id: 'chapter' | 'front' | 'back' | 'toc'; label: string }[] = [
  { id: 'chapter', label: 'Chapter' }, { id: 'front', label: 'Front matter' }, { id: 'back', label: 'Back matter' }, { id: 'toc', label: 'Contents (skip)' },
];

export default function StepManuscript({ draft, update, onNext }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ms = draft.manuscript;

  const apply = useCallback(async (file: File, r: IngestResult) => {
    const meta = draft.metadata;
    const authorName = r.detected.author;
    const contributors = meta.contributors.length || !authorName ? meta.contributors : [{ name: authorName, role: 'author' as const }];
    const em = r.epub?.metadata;
    update(d => ({
      manuscript: { fileName: file.name, ext: file.name.split('.').pop()!.toLowerCase(), sizeBytes: file.size, source: r.source, chapters: r.chapters },
      epubFindings: r.source === 'epub' ? r.findings : [],
      a11yBase: r.epub ? { imageCount: r.epub.accessibility.imageCount, imagesWithAlt: r.epub.accessibility.imagesWithAlt, features: r.epub.accessibility.features, summary: r.epub.accessibility.summary, hasNav: r.epub.hasNav } : undefined,
      metadata: {
        ...d.metadata,
        title: d.metadata.title || r.detected.title,
        contributors: d.metadata.contributors.length ? d.metadata.contributors : contributors,
        copyrightHolder: d.metadata.copyrightHolder || authorName,
        language: r.language ? r.language.split('-')[0].toLowerCase() : d.metadata.language,
        description: d.metadata.description || (em?.description ? `<p>${em.description.replace(/</g, '&lt;')}</p>` : ''),
        keywords: d.metadata.keywords.length ? d.metadata.keywords : (em?.subjects ?? []).slice(0, 7),
      },
    }));
    // Embedded EPUB cover -> offer as the cover automatically.
    if (r.epub?.coverBytes && !draft.cover) {
      try {
        const blob = new Blob([r.epub.coverBytes as BlobPart], { type: r.epub.coverMime || 'image/jpeg' });
        const mime = await sniffImageMime(blob);
        const img = await readImage(blob); URL.revokeObjectURL(img.url);
        const info = await uploadCover(new Blob([blob], { type: mime }), 'cover-from-epub', draft.ownerId, draft.id, img);
        update({ cover: info });
        setNote('We also pulled the cover out of your EPUB. You can replace it on the Cover step.');
      } catch { /* the Cover step lets them upload manually */ }
    }
  }, [draft, update]);

  const handle = useCallback(async (file?: File) => {
    if (!file) return;
    setError(null); setNote(null); setBusy(`Reading ${file.name}…`);
    try {
      const r = await ingestManuscript(file);
      await apply(file, r);
    } catch (e: any) {
      setError(e?.message || 'Could not read that file.');
    } finally { setBusy(null); }
  }, [apply]);

  const setChapters = (chapters: NonNullable<BookDraft['manuscript']>['chapters']) =>
    update(d => d.manuscript ? { manuscript: { ...d.manuscript, chapters } } : {});
  const patchCh = (i: number, p: Partial<NonNullable<BookDraft['manuscript']>['chapters'][number]>) =>
    ms && setChapters(ms.chapters.map((c, k) => k === i ? { ...c, ...p } : c));
  const move = (i: number, dir: -1 | 1) => {
    if (!ms) return; const j = i + dir; if (j < 0 || j >= ms.chapters.length) return;
    const a = [...ms.chapters]; [a[i], a[j]] = [a[j], a[i]]; setChapters(a);
  };

  const total = ms?.chapters.filter(c => c.included && (c.kind ?? 'chapter') === 'chapter').reduce((s, c) => s + c.wordCount, 0) ?? 0;
  const reviewFindings: Finding[] = ms ? chapterReviewFindings(ms.chapters) : [];

  return (
    <div className="space-y-5">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files?.[0]); }}
        className={`rounded-[2rem] border-2 border-dashed p-8 text-center transition-all ${drag ? 'border-amber-400 bg-amber-400/[0.08]' : 'border-white/15 bg-white/[0.02]'}`}>
        {busy ? (
          <div className="flex flex-col items-center gap-3 py-4" role="status"><Loader2 className="animate-spin text-amber-400" /><p className="text-sm text-white/70">{busy}</p></div>
        ) : (
          <>
            <UploadCloud className="mx-auto text-amber-400" size={34} />
            <p className="mt-3 text-base font-black text-white">{ms ? 'Drop a new file to replace your manuscript' : 'Drop your manuscript here'}</p>
            <p className="mt-1 text-xs text-white/45">EPUB, Word (.docx), PDF, Markdown or plain text. Up to 100 MB. We read it in your browser first; nothing is published.</p>
            <button type="button" onClick={() => input.current?.click()} className={`${btnGhost} mt-4`}><FileText size={14} /> Choose a file</button>
            <input ref={input} type="file" accept={MANUSCRIPT_ACCEPT} className="hidden" onChange={e => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
            <p className="mt-4 text-[11px] text-white/30">Google Docs or Pages? Use File &gt; Download &gt; .docx (or .epub) and drop that here.</p>
          </>
        )}
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-3 text-sm text-red-200">{error}</div>}
      {note && <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.05] p-3 text-sm text-emerald-200">{note}</div>}

      {ms && (
        <>
          <Card title="What we found" subtitle={<>
            <b className="text-white/80">{ms.fileName}</b> · {(ms.sizeBytes / 1048576).toFixed(1)} MB · {ms.chapters.filter(c => c.included).length} sections · <b className="text-white/80">{total.toLocaleString()} words</b> (about {Math.max(1, Math.round(total / 250))} pages)
          </>}>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-white/40">Title (detected)</span>
                <input className={`${inputCls} mt-1`} value={draft.metadata.title} onChange={e => update(d => ({ metadata: { ...d.metadata, title: e.target.value } }))} /></label>
              <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-white/40">Author (detected)</span>
                <input className={`${inputCls} mt-1`} value={draft.metadata.contributors.find(c => c.role === 'author')?.name ?? ''}
                  onChange={e => update(d => {
                    const rest = d.metadata.contributors.filter(c => c.role !== 'author');
                    return { metadata: { ...d.metadata, contributors: e.target.value ? [{ name: e.target.value, role: 'author' as const }, ...rest] : rest } };
                  })} /></label>
            </div>
            {draft.epubFindings.length > 0 && <FindingList findings={draft.epubFindings.filter(f => f.severity !== 'info')} />}
            <FindingList findings={reviewFindings} />
          </Card>

          <Card title="Review your chapters" subtitle="Rename, reorder, merge, split, or untick anything that is not part of the book. Changes save automatically.">
            <ol className="space-y-2">
              {ms.chapters.map((c, i) => (
                <li key={c.id} className={`rounded-2xl border p-3 ${c.included ? 'border-white/10 bg-white/[0.02]' : 'border-white/5 opacity-50'}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" aria-label={`Include ${c.title}`} checked={c.included} onChange={e => patchCh(i, { included: e.target.checked })} className="accent-amber-400 w-4 h-4 flex-shrink-0" />
                    <input className="flex-1 min-w-0 bg-transparent text-sm text-white font-bold outline-none border-b border-transparent focus:border-amber-400/50 py-1" value={c.title} onChange={e => patchCh(i, { title: e.target.value })} aria-label="Chapter title" />
                    <span className="text-[11px] text-white/35 tabular-nums flex-shrink-0">{c.wordCount.toLocaleString()}w</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <select aria-label="Section type" value={c.kind ?? 'chapter'} onChange={e => patchCh(i, { kind: e.target.value as any, included: e.target.value === 'toc' ? false : c.included })}
                      className="bg-white/5 border border-white/10 rounded-xl text-[11px] text-white/70 px-2 py-1.5 outline-none">
                      {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                    </select>
                    <button type="button" className={`${btnGhost} !px-2.5 !py-1.5 !min-h-[36px]`} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={12} /></button>
                    <button type="button" className={`${btnGhost} !px-2.5 !py-1.5 !min-h-[36px]`} onClick={() => move(i, 1)} disabled={i === ms.chapters.length - 1} aria-label="Move down"><ArrowDown size={12} /></button>
                    <button type="button" className={`${btnGhost} !px-2.5 !py-1.5 !min-h-[36px]`} onClick={() => setChapters(mergeChapters(ms.chapters, i))} disabled={i === ms.chapters.length - 1}><Merge size={12} /> Merge next</button>
                    <button type="button" className={`${btnGhost} !px-2.5 !py-1.5 !min-h-[36px]`} onClick={() => setChapters(splitChapter(ms.chapters, i))}><Scissors size={12} /> Split</button>
                    {c.autoSplit && <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 inline-flex items-center gap-1"><Wand2 size={11} /> auto-split</span>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <div className="flex justify-end"><button type="button" className="px-6 py-3 min-h-[44px] rounded-2xl text-[11px] font-black uppercase tracking-widest bg-amber-400 text-black" onClick={onNext}>Looks right, continue</button></div>
        </>
      )}

      {!ms && (
        <p className="text-center text-xs text-white/35">No manuscript yet? You can <button type="button" className="underline text-white/60 hover:text-white"
          onClick={() => update({ manuscript: { fileName: 'blank', ext: 'txt', sizeBytes: 0, source: 'blank', chapters: [] } })}>continue with details first</button> and add it later.</p>
      )}
    </div>
  );
}
