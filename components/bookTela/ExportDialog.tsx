import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, ShieldCheck, X } from 'lucide-react';
import type { TelaDoc } from '../../types';
import type { BookSource, EnhancementInstance, ExportFormat } from '../../services/bookTela/types';
import { downloadFiles, exportBook, fidelityFor, type ExportOutcome } from '../../services/bookTela/export';
import type { RightsDecision } from '../../services/bookTela/export/rights';
import { TRIM_SIZES } from '../../services/pod/printSpec';
import { loadUpgrade } from '../../services/bookTela/upgradeStore';
import { Card, Choice, FindingList, Toggle, btnGhost, btnPrimary, hintCls } from '../bookSubmit/ui';
import { FidelityBadge, FidelityReport } from './FidelityBadge';
import { browserFontLoader, browserResolver, ebGaramondForEpub } from './browserFonts';

export interface ExportSource { doc: TelaDoc; enhancements: EnhancementInstance[]; versionId?: string }
interface Props {
  book: BookSource;
  /** Pinned or published version to export from (buyers). Authors omit it and export their working doc. */
  source?: ExportSource;
  rights: RightsDecision;
  onClose: () => void;
}

const LABEL: Record<ExportFormat, { title: string; sub: string }> = {
  EPUB_REFLOW: { title: 'EPUB, reflowable', sub: 'Best for text. Readers resize text; works with screen readers.' },
  EPUB_FIXED: { title: 'EPUB, fixed layout', sub: 'Best for picture books and comics. Pages keep their design.' },
  PDF_SCREEN: { title: 'PDF for screens', sub: 'Bookmarks and links. Good for tablets and sharing.' },
  PDF_PRINT: { title: 'PDF for print', sub: 'Trim and bleed set. Text-only books use the print pipeline.' },
  MARKDOWN: { title: 'Markdown', sub: 'Plain text with images, in a zip. Easy to move anywhere.' },
  HTML: { title: 'HTML', sub: 'A web page with images, in a zip.' },
};

export default function ExportDialog({ book, source, rights, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('EPUB_REFLOW');
  const [colophon, setColophon] = useState(true);
  const [commentary, setCommentary] = useState(true);
  const [embedFont, setEmbedFont] = useState(false);
  const [trimId, setTrimId] = useState('5.5x8.5');
  const [work, setWork] = useState<{ doc?: TelaDoc; enhancements: EnhancementInstance[]; note?: string }>({ enhancements: source?.enhancements ?? [] });
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ExportOutcome | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    if (source) { setWork({ doc: source.doc, enhancements: source.enhancements }); return; }
    (async () => {
      const u = await loadUpgrade(book.id);
      let doc: TelaDoc | undefined;
      if (u && !u.revertedAt) { try { const { loadTelaDoc } = await import('../../services/telaStore'); doc = (await loadTelaDoc(u.docId)) ?? undefined; } catch { /* no doc on this device */ } }
      if (alive) setWork({ doc, enhancements: u && !u.revertedAt ? u.enhancements : [], note: u && !u.revertedAt && !doc ? 'The Tela edition is not on this device, so this export uses the plain chapters (no extras).' : undefined });
    })();
    return () => { alive = false; };
  }, [book.id, source]);

  const input = useMemo(() => ({ book, doc: work.doc, upgrade: { enhancements: work.doc ? work.enhancements : [] } }), [book, work]);
  const fid = useMemo(() => { try { return fidelityFor(input, format); } catch { return null; } }, [input, format]);
  useEffect(() => { if (fid && fid.recommended.layout === 'FIXED' && format === 'EPUB_REFLOW') { /* recommendation only, never auto-switch */ } }, [fid, format]);
  useEffect(() => { setOut(null); setErr(''); }, [format, colophon, commentary, embedFont, trimId]);

  const allowed = (f: ExportFormat) => rights.allowed && rights.formats.includes(f);

  const build = async () => {
    setBusy(true); setErr(''); setOut(null);
    try {
      const fonts = embedFont && (format === 'EPUB_REFLOW' || format === 'EPUB_FIXED') ? await ebGaramondForEpub() : undefined;
      const r = await exportBook({
        ...input, format, rights,
        options: { includeColophon: colophon, includeCommentary: commentary, resolveAsset: browserResolver, fontLoader: browserFontLoader, fonts, trimId: format === 'PDF_PRINT' ? trimId : undefined, sourceVersionId: source?.versionId, now: new Date() },
      });
      setOut(r);
    } catch (e) { setErr(e instanceof Error ? e.message : 'The export failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Export {book.title}</h3>
          <p className={hintCls}>DRM-free files in open formats. You own them.{rights.scope === 'buyer' ? ' This is the version you bought.' : ''}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-white/40 hover:text-white"><X size={16} /></button>
      </div>

      {!rights.allowed && <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{rights.reason}</p>}
      {work.note && <p className="text-[12px] text-amber-200/80">{work.note}</p>}

      <Card title="Format">
        <div role="radiogroup" aria-label="Export format" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(LABEL) as ExportFormat[]).map(f => (
            <button key={f} type="button" role="radio" aria-checked={format === f} disabled={!allowed(f)} onClick={() => setFormat(f)}
              className={`text-left rounded-xl border p-3 min-h-[44px] transition-colors disabled:opacity-30 ${format === f ? 'border-amber-400/60 bg-amber-400/10' : 'border-white/10 hover:border-white/25'}`}>
              <span className="block text-[12px] font-bold text-white">{LABEL[f].title}{fid && fid.recommended.layout === (f === 'EPUB_FIXED' ? 'FIXED' : f === 'EPUB_REFLOW' ? 'REFLOW' : '') ? <span className="ml-2 text-[10px] text-emerald-300 uppercase tracking-widest">Recommended</span> : null}</span>
              <span className="block text-[11px] text-white/40 leading-snug">{LABEL[f].sub}</span>
            </button>
          ))}
        </div>
        {fid && (format === 'EPUB_REFLOW' || format === 'EPUB_FIXED') && <p className={hintCls}>{fid.recommended.reason}</p>}
      </Card>

      <Card title="Options">
        <div className="space-y-2">
          <Toggle on={colophon} onChange={setColophon} label={'Include the "Exported from Plajah" page'} sub="You can remove it. It lists anything that could not travel into the file." />
          {work.enhancements.some(e => e.type === 'COMMENTARY') && <Toggle on={commentary} onChange={setCommentary} label="Include author commentary as endnotes" />}
          {(format === 'EPUB_REFLOW' || format === 'EPUB_FIXED') && <Toggle on={embedFont} onChange={setEmbedFont} label="Embed a book font (EB Garamond)" sub="Open licence (SIL OFL), safe to embed. Off by default: readers can use their own font." />}
          {format === 'PDF_PRINT' && <Choice value={trimId} onChange={setTrimId} options={TRIM_SIZES.map(t => ({ id: t.id, label: t.label, sub: t.common }))} />}
        </div>
      </Card>

      <Card title="Export fidelity" subtitle="Per page, for the format you picked.">
        {fid ? (<><div className="mb-2"><FidelityBadge fidelity={fid.summary.overall} /></div><FidelityReport pages={fid.pages} /></>) : <p className="text-[12px] text-white/40">Calculating.</p>}
      </Card>

      {(err || out) && (
        <Card title={out?.ok ? 'Ready' : 'Result'} tone={out?.ok ? 'default' : 'danger'}>
          {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
          {out?.blockedReason && <p role="alert" className="text-sm text-red-300">{out.blockedReason}</p>}
          {out && out.findings.length > 0 && <FindingList findings={out.findings} />}
          {out?.ok && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm text-emerald-300"><ShieldCheck size={14} /> {format.startsWith('EPUB') ? 'Passed the Plajah EPUB checker with no errors.' : 'Built.'}</p>
              {out.report && out.report.warnings.length > 0 && <ul className="text-[11px] text-white/50 list-disc pl-4">{out.report.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
              {out.report && out.report.omitted.length > 0 && <p className="text-[11px] text-amber-200/70">Left out: {out.report.omitted.map(o => o.label).join('; ')}.</p>}
              {format.startsWith('EPUB') && <p className={hintCls}>This checker covers the structure stores reject. Before sending to a strict store, also run the official epubcheck.</p>}
              <button type="button" className={btnPrimary} onClick={() => downloadFiles(out.files)}><Download size={14} /> Download {out.files[0]?.name}</button>
            </div>
          )}
        </Card>
      )}

      <div className="flex gap-2 flex-wrap sticky bottom-0 py-3 bg-[#0e0b14]/90 backdrop-blur">
        <button type="button" className={btnPrimary} disabled={busy || !allowed(format)} onClick={build}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Build {LABEL[format].title}</button>
        <button type="button" className={btnGhost} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
