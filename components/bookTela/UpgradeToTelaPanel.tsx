import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, Undo2, UploadCloud, RefreshCw, Download, PenLine } from 'lucide-react';
import type { BookSource, BookSourceChapter, BookTelaUpgrade, EnhancementInstance, EnhancementType, ExportFormat } from '../../services/bookTela/types';
import { ENHANCEMENTS, ENHANCEMENT_TYPES, defaultConfig, instanceFidelity, newEnhancementId, validateInstance } from '../../services/bookTela/enhancements';
import { canUpgrade, createUpgrade, previewUpgrade, revertUpgrade } from '../../services/bookTela/upgrade';
import { deleteUpgrade, loadUpgrade, publishBookTela, saveUpgrade, syncFromTela, upgradeBook } from '../../services/bookTela/upgradeStore';
import { parseFrameId } from '../../services/bookTela/bookToTela';
import { stripTags } from '../../services/bookTela/html';
import { fidelitySummary } from '../../services/bookTela/model';
import { Card, Field, inputCls, btnGhost, btnPrimary, hintCls } from '../bookSubmit/ui';
import { FidelityBadge, FidelityReport } from './FidelityBadge';
import PageTurnPreview from '../lorea/PageTurnPreview';
import { PAGE_TURNS, PICKABLE_STYLES, defaultStyleForKind, getSpec, inferBookKind, sanitizeAuthorPageTurn, type AuthorPageTurn, type PageTurnId } from '../../services/lorea/pageTransitions';

export interface AlbumCtx { id: string; ownerId: string; price?: number }
interface Props {
  book: BookSource;
  album?: AlbumCtx;
  /** Called with the book's chapters after a revert or a sync from Tela, so the host editor can adopt them. */
  onChaptersChanged?: (chapters: BookSourceChapter[]) => void;
  onOpenExport?: () => void;
}

type FieldDef = { key: string; label: string; kind: 'text' | 'url' | 'area'; hint?: string };
const FIELDS: Record<EnhancementType, FieldDef[]> = {
  AUDIO_SYNC: [{ key: 'src', label: 'Narration audio link', kind: 'url' }],
  VIDEO: [{ key: 'src', label: 'Video link', kind: 'url' }, { key: 'poster', label: 'Poster image link (shown in exports)', kind: 'url' }],
  MOTION: [{ key: 'lottieUrl', label: 'Lottie animation link (.json)', kind: 'url' }, { key: 'poster', label: 'Still frame image link (shown in exports)', kind: 'url' }],
  INTERACTIVE_3D: [{ key: 'modelSrc', label: '3D model link (.glb)', kind: 'url' }, { key: 'poster', label: 'Still picture link (shown in exports)', kind: 'url' }],
  CHART: [{ key: 'title', label: 'Chart title', kind: 'text' }, { key: 'labels', label: 'Labels, comma separated', kind: 'text', hint: 'Mon, Tue, Wed' }, { key: 'values', label: 'Numbers, comma separated', kind: 'text', hint: '1.2, 2.4, 1.9' }, { key: 'seriesName', label: 'What the numbers measure', kind: 'text' }],
  ILLUSTRATED_OPENER: [{ key: 'src', label: 'Illustration link', kind: 'url' }],
  ANIMATED_DROPCAP: [],
  READER_NOTE: [{ key: 'text', label: 'Note', kind: 'area' }],
  GLOSSARY: [{ key: 'term', label: 'Word', kind: 'text' }, { key: 'definition', label: 'Meaning', kind: 'area' }],
  BRANCHING: [{ key: 'prompt', label: 'Question for the reader', kind: 'text' }, { key: 'choicesText', label: 'One choice per line: Choice text => Chapter title', kind: 'area' }],
  LIVE_DATA: [{ key: 'label', label: 'What it measures', kind: 'text' }, { key: 'snapshotValue', label: 'Value today (used in exports)', kind: 'text' }, { key: 'unit', label: 'Unit', kind: 'text' }, { key: 'formula', label: 'Live formula (Tela binding, optional)', kind: 'text', hint: '=SUM(Orders.price)' }],
  COMMENTARY: [{ key: 'text', label: 'Commentary', kind: 'area' }],
};

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: 'EPUB_REFLOW', label: 'EPUB (reflowable)' }, { id: 'EPUB_FIXED', label: 'EPUB (fixed layout)' }, { id: 'PDF_SCREEN', label: 'PDF for screens' }, { id: 'PDF_PRINT', label: 'PDF for print' }, { id: 'MARKDOWN', label: 'Markdown' }, { id: 'HTML', label: 'HTML' },
];

function buildConfig(type: EnhancementType, v: Record<string, string>, chapters: BookSourceChapter[]): Record<string, any> {
  const c = { ...defaultConfig(type) } as Record<string, any>;
  const csv = (s?: string) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  switch (type) {
    case 'CHART': Object.assign(c, { title: v.title || '', labels: csv(v.labels), series: [{ name: v.seriesName || 'Value', values: csv(v.values).map(Number).filter(n => !Number.isNaN(n)) }] }); break;
    case 'MOTION': Object.assign(c, { lottie: v.lottieUrl ? { source: { format: 'json', url: v.lottieUrl }, intrinsicWidth: 800, intrinsicHeight: 600, autoplay: true, loop: true, speed: 1, direction: 'forward', fit: 'contain', posterSrc: v.poster || undefined } : null }); break;
    case 'BRANCHING': {
      const choices = (v.choicesText || '').split('\n').map(l => l.split('=>').map(x => x.trim())).filter(p => p[0]).map(p => ({ label: p[0], targetChapterId: chapters.find(ch => ch.title.toLowerCase() === (p[1] || '').toLowerCase())?.id || '' })).filter(x => x.targetChapterId);
      Object.assign(c, { prompt: v.prompt || '', choices }); break;
    }
    default: for (const f of FIELDS[type]) c[f.key] = v[f.key] ?? c[f.key];
  }
  return c;
}

export default function UpgradeToTelaPanel({ book, album, onChaptersChanged, onOpenExport }: Props) {
  const [upgrade, setUpgrade] = useState<BookTelaUpgrade | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [draftEnh, setDraftEnh] = useState<EnhancementInstance[]>([]);
  const [format, setFormat] = useState<ExportFormat>('EPUB_REFLOW');
  const [adding, setAdding] = useState<EnhancementType | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formChapter, setFormChapter] = useState('');
  const [formAnchor, setFormAnchor] = useState('');
  const [formAlt, setFormAlt] = useState('');
  const [draftTurn, setDraftTurn] = useState<AuthorPageTurn | undefined>(undefined);

  useEffect(() => { let alive = true; loadUpgrade(book.id).then(u => { if (alive) { setUpgrade(u && !u.revertedAt ? u : null); setLoaded(true); } }); return () => { alive = false; }; }, [book.id]);

  const enhancements = upgrade ? upgrade.enhancements : draftEnh;
  const setEnhancements = async (next: EnhancementInstance[]) => {
    if (upgrade) { const u = { ...upgrade, enhancements: next }; setUpgrade(u); await saveUpgrade(u); } else setDraftEnh(next);
  };

  // Page-turn style: stored on the upgrade record, published with the Tela edition, and read by every Lorea reader.
  const pageTurn: AuthorPageTurn | undefined = upgrade ? upgrade.pageTurn : draftTurn;
  const setPageTurn = async (next: AuthorPageTurn | undefined) => {
    const clean = sanitizeAuthorPageTurn(next);
    if (upgrade) { const u = { ...upgrade }; if (clean) u.pageTurn = clean; else delete u.pageTurn; setUpgrade(u); await saveUpgrade(u); } else setDraftTurn(clean);
  };
  const bookKind = inferBookKind({ visualLed: book.visualLed });
  const bookStyle: PageTurnId | 'auto' = pageTurn?.style ?? 'auto';
  const resolvedBookStyle: PageTurnId = bookStyle === 'auto' ? defaultStyleForKind(bookKind) : bookStyle;
  const setBookStyle = (v: PageTurnId | 'auto') => setPageTurn({ ...pageTurn, style: v });
  const setChapterStyle = (cid: string, v: PageTurnId | 'auto') => {
    const per = { ...(pageTurn?.perChapter || {}) }; if (v === 'auto') delete per[cid]; else per[cid] = v;
    setPageTurn({ ...pageTurn, perChapter: Object.keys(per).length ? per : undefined });
  };

  const eligibility = useMemo(() => canUpgrade(book), [book]);
  const preview = useMemo(() => (eligibility.ok ? previewUpgrade(book, { enhancements }, format) : null), [book, enhancements, format, eligibility.ok]);
  const included = book.chapters.filter(c => c.included !== false);

  // blocks of the chosen chapter, for "after this paragraph" anchors
  const anchorOptions = useMemo(() => {
    if (!formChapter || !eligibility.ok) return [] as { id: string; label: string }[];
    const { doc } = createUpgrade(book, {});
    const out: { id: string; label: string }[] = [];
    for (const f of doc.frames) { const r = parseFrameId(doc.id, f.id); if (r.role !== 'writer' || r.chapterId !== formChapter) continue; for (const d of f.deviceIds.map(i => doc.devices[i])) if (d?.type === 'WRITER') for (const b of d.blocks) out.push({ id: b.id, label: stripTags(b.text).slice(0, 56) || '(blank)' }); }
    return out;
  }, [book, formChapter, eligibility.ok]);

  const def = adding ? ENHANCEMENTS[adding] : null;
  const addEnhancement = async () => {
    if (!adding || !def) return;
    const chapterId = formChapter || included[0]?.id; if (!chapterId) return;
    const inst: EnhancementInstance = { id: newEnhancementId(), type: adding, chapterId, config: buildConfig(adding, form, book.chapters), ...(formAlt.trim() ? { alt: formAlt.trim() } : {}), ...(formAnchor ? { afterBlockId: formAnchor as any } : {}) };
    const problems = validateInstance(inst).filter(i => i.severity === 'error');
    if (problems.length) { setMsg({ tone: 'err', text: problems[0].message }); return; }
    await setEnhancements([...enhancements, inst]);
    setAdding(null); setForm({}); setFormAlt(''); setFormAnchor(''); setMsg(null);
  };

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Something went wrong.' }); } finally { setBusy(null); } };

  const doUpgrade = () => run('upgrade', async () => {
    const r = await upgradeBook(book, { enhancements: draftEnh, ownerId: book.ownerId, pageTurn: draftTurn });
    setUpgrade(r.upgrade); setDraftEnh([]);
    setMsg({ tone: 'ok', text: 'Upgraded. Your original chapters are saved, and you can revert at any time.' });
  });
  const doSync = () => run('sync', async () => {
    if (!upgrade) return;
    const r = await syncFromTela(book, upgrade);
    if (!r) throw new Error('The Tela document is not on this device.');
    onChaptersChanged?.(r.chapters);
    setMsg({ tone: 'ok', text: r.warnings.length ? `Text synced. Note: ${r.warnings[0]}` : 'Text from the Tela edition is now in your book.' });
  });
  const doPublish = () => run('publish', async () => {
    if (!upgrade || !album) throw new Error('Publish the book to Lorea first, then publish its Tela edition.');
    const r = await publishBookTela(album, book, upgrade, 'Published from the editor');
    if (!r.ok) throw new Error(r.error || 'Publish failed.');
    setUpgrade({ ...upgrade, publishedVersionId: r.versionId });
    setMsg({ tone: 'ok', text: 'Published. Free readers now see the Tela edition; buyers stay on the version they purchased.' });
  });
  const doRevert = () => run('revert', async () => {
    if (!upgrade) return;
    if (!window.confirm('Go back to the book as it was before the Tela upgrade? Text edits made only in Tela are not copied back unless you synced them first. The Tela document stays on this device.')) return;
    const r = revertUpgrade(upgrade);
    onChaptersChanged?.(r.chapters);
    await deleteUpgrade(book.id);
    if (album) { try { const { disableBookTela } = await import('../../services/bookTela/upgradeStore'); await disableBookTela(album.id); } catch { /* offline: reader falls back when flag is stale? keep message */ } }
    setUpgrade(null); setMsg({ tone: 'ok', text: 'Reverted. The classic book is back exactly as it was.' });
  });

  if (!loaded) return <div className="py-10 text-center text-white/40"><Loader2 className="inline animate-spin" size={16} /></div>;

  return (
    <div className="space-y-4">
      {!upgrade && (
        <Card title="Give this book the full Tela treatment" subtitle="Optional, and you can undo it.">
          <ul className="text-[13px] text-white/65 leading-relaxed list-disc pl-5 space-y-1">
            <li><strong className="text-white/85">In Lorea</strong>, your book can have illustrated chapter openers, narration, motion, 3D, charts, margin notes, glossary popovers and choose-your-path choices.</li>
            <li><strong className="text-white/85">Your words stay real text</strong> for search, screen readers and highlights. Nothing is turned into a picture.</li>
            <li><strong className="text-white/85">When you export</strong>, you still get a normal EPUB or PDF that opens anywhere. Anything interactive turns into the best static version, and we show you exactly what changes before you download.</li>
            <li>Your original chapters are kept. You can revert whenever you like.</li>
          </ul>
        </Card>
      )}

      {!eligibility.ok && <p role="alert" className="text-sm text-amber-200/80">{eligibility.reason}</p>}

      {preview && !upgrade && (
        <Card title="Before and after">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-1">Now</p><p className="text-white/80">{preview.before.chapters} chapters</p><p className="text-white/50">{preview.before.words.toLocaleString()} words, {preview.before.images} pictures</p></div>
            <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-1">With Tela</p><p className="text-white/80">{preview.after.frames} pages, {preview.after.chapters} chapters</p><p className="text-white/50">{preview.after.words.toLocaleString()} words, {preview.after.enhancements} extras</p></div>
          </div>
          <p className={`${hintCls} ${preview.textPreserved ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>{preview.textPreserved ? 'Every word and picture carries over unchanged.' : 'Some formatting is simplified in the upgrade. Review before you continue.'}</p>
          {preview.openerSvgs.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mt-3 pb-1" aria-label="Chapter opener previews">
              {preview.openerSvgs.map(o => <figure key={o.chapterId} className="shrink-0 w-40"><div className="rounded-lg overflow-hidden bg-white [&>svg]:w-full [&>svg]:h-auto" role="img" aria-label={`Opener for ${o.title}`} dangerouslySetInnerHTML={{ __html: o.svg }} /><figcaption className="text-[10px] text-white/40 mt-1 truncate">{o.title}</figcaption></figure>)}
            </div>
          )}
          {preview.warnings.length > 0 && <ul className="mt-2 text-[11px] text-amber-200/70 list-disc pl-4">{preview.warnings.slice(0, 4).map(w => <li key={w}>{w}</li>)}</ul>}
        </Card>
      )}

      <Card title="Tela extras" subtitle="Each one says how it will look in an exported EPUB or PDF.">
        {enhancements.length === 0 && <p className="text-[12px] text-white/40">No extras yet. Your book works fine without them.</p>}
        <ul className="space-y-2">
          {enhancements.map(e => {
            const d = ENHANCEMENTS[e.type]; const f = instanceFidelity(e, format); const issues = validateInstance(e);
            return (
              <li key={e.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">{e.label || d.label}</span>
                  <FidelityBadge fidelity={f.fidelity} />
                  <span className="text-[11px] text-white/35">in {book.chapters.find(c => c.id === e.chapterId)?.title ?? 'a chapter'}</span>
                  <button type="button" className="ml-auto p-2 text-white/30 hover:text-red-300" aria-label={`Remove ${d.label}`} onClick={() => setEnhancements(enhancements.filter(x => x.id !== e.id))}><Trash2 size={14} /></button>
                </div>
                <p className="text-[11px] text-white/45 mt-1 leading-snug">{f.changes.join(' ')}</p>
                {issues.map(i => <p key={i.message} className={`text-[11px] mt-1 ${i.severity === 'error' ? 'text-red-300/80' : 'text-amber-300/80'}`}>{i.message}</p>)}
              </li>
            );
          })}
        </ul>

        {!adding ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ENHANCEMENT_TYPES.map(t => (
              <button key={t} type="button" onClick={() => { setAdding(t); setForm({}); setFormChapter(included[0]?.id || ''); setFormAnchor(''); setFormAlt(''); }}
                className="text-left rounded-xl border border-white/10 hover:border-white/25 p-3 min-h-[44px] transition-colors">
                <span className="flex items-center gap-1.5 text-[12px] font-bold text-white"><Plus size={12} /> {ENHANCEMENTS[t].label}</span>
                <span className="block text-[11px] text-white/40 leading-snug mt-0.5">{ENHANCEMENTS[t].benefit}</span>
              </button>
            ))}
          </div>
        ) : def && (
          <div className="mt-3 rounded-xl border border-amber-400/30 p-3 space-y-3">
            <p className="text-sm font-bold text-white">{def.label}</p>
            <p className="text-[11px] text-white/50">{def.exportSummary}</p>
            <Field label="Chapter">
              <select className={inputCls} value={formChapter} onChange={e => { setFormChapter(e.target.value); setFormAnchor(''); }}>{included.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            </Field>
            {def.placement !== 'chapter' && (
              <Field label={def.placement === 'text' ? 'Attach after' : 'Place after'} hint="Pick a paragraph, or leave it at the end of the chapter.">
                <select className={inputCls} value={formAnchor} onChange={e => setFormAnchor(e.target.value)}>
                  <option value="">End of chapter</option>{def.placement === 'frame' && <option value="start">Start of chapter</option>}
                  {anchorOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </Field>
            )}
            {FIELDS[adding].map(f => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                {f.kind === 'area' ? <textarea className={inputCls} rows={3} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                  : <input className={inputCls} type={f.kind === 'url' ? 'url' : 'text'} inputMode={f.kind === 'url' ? 'url' : undefined} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />}
              </Field>
            ))}
            {def.needsAlt && <Field label="Alt text" hint="Describe what a reader would see. Used by screen readers and in every export."><textarea className={inputCls} rows={2} value={formAlt} onChange={e => setFormAlt(e.target.value)} /></Field>}
            <div className="flex gap-2 flex-wrap"><button type="button" className={btnPrimary} onClick={addEnhancement}>Add</button><button type="button" className={btnGhost} onClick={() => setAdding(null)}>Cancel</button></div>
          </div>
        )}
      </Card>

      <Card title="Page-turn style" subtitle="How pages turn for readers in Lorea. Readers can still switch to reduced motion or off.">
        <div className="flex gap-4 items-start flex-wrap">
          <PageTurnPreview id={resolvedBookStyle} />
          <div className="flex-1 min-w-[200px] space-y-2">
            <Field label="Style for the whole book" hint={bookStyle === 'auto' ? `Auto picks ${getSpec(resolvedBookStyle).label.toLowerCase()} for this kind of book.` : getSpec(resolvedBookStyle).blurb}>
              <select className={inputCls} value={bookStyle} onChange={e => setBookStyle(e.target.value as PageTurnId | 'auto')} aria-label="Page-turn style for the whole book">
                <option value="auto">Auto (recommended)</option>
                {PICKABLE_STYLES.map(id => <option key={id} value={id}>{getSpec(id).label}</option>)}
                <option value="none">None (instant)</option>
              </select>
            </Field>
            <p className="text-[11px] text-white/45 leading-snug">Only in Lorea. EPUB and PDF exports use each reading app's own page turn, and the export report says so.{upgrade?.publishedVersionId ? ' Publish the Tela edition again for readers to see a change.' : ''}</p>
          </div>
        </div>
        {included.length > 1 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-bold text-white/70 min-h-[44px] flex items-center">Choose a style for individual chapters</summary>
            <ul className="space-y-2 mt-2">
              {included.map(c => (
                <li key={c.id} className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-white/70 flex-1 min-w-[120px] truncate">{c.title}</span>
                  <select className={`${inputCls} !w-auto`} aria-label={`Page-turn style for ${c.title}`} value={pageTurn?.perChapter?.[c.id] ?? 'auto'} onChange={e => setChapterStyle(c.id, e.target.value as PageTurnId | 'auto')}>
                    <option value="auto">Same as book</option>
                    {PAGE_TURNS.map(t => <option key={t.id} value={t.id}>{t.id === 'none' ? 'None (instant)' : t.label}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card title="Export fidelity" subtitle="What your book looks like when it leaves Plajah.">
        <div className="flex gap-2 flex-wrap items-center mb-2">
          <label className="sr-only" htmlFor="fid-format">Format</label>
          <select id="fid-format" className={`${inputCls} !w-auto`} value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
          {preview && <FidelityBadge fidelity={fidelitySummary(preview.fidelity.pages).overall} />}
        </div>
        {preview ? <FidelityReport pages={preview.fidelity.pages} /> : <p className="text-[12px] text-white/40">Add text to see the report.</p>}
      </Card>

      {msg && <p role="status" className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}

      <div className="flex gap-2 flex-wrap sticky bottom-0 py-3 bg-[#0e0b14]/90 backdrop-blur">
        {!upgrade ? (
          <button type="button" className={btnPrimary} disabled={!eligibility.ok || !!busy} onClick={doUpgrade}>{busy === 'upgrade' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Upgrade to Tela</button>
        ) : (<>
          <button type="button" className={btnPrimary} disabled={!!busy || !album} onClick={doPublish} title={album ? '' : 'Publish the book to Lorea first'}>{busy === 'publish' ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} Publish Tela edition</button>
          <button type="button" className={btnGhost} onClick={() => window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: upgrade.docId } }))}><PenLine size={14} /> Open in Tela</button>
          {onChaptersChanged && <button type="button" className={btnGhost} disabled={!!busy} onClick={doSync}><RefreshCw size={14} /> Sync text from Tela</button>}
          <button type="button" className={btnGhost} disabled={!!busy} onClick={doRevert}><Undo2 size={14} /> Revert</button>
        </>)}
        {onOpenExport && <button type="button" className={btnGhost} onClick={onOpenExport}><Download size={14} /> Export EPUB / PDF</button>}
      </div>
    </div>
  );
}
