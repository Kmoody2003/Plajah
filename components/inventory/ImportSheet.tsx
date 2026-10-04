import React, { useMemo, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, AlertTriangle, Check, Download } from 'lucide-react';
import { parseCsv, rowsToDrafts, CSV_TEMPLATE, type ProductDraft, type CsvFormat } from '../../services/inventoryCore';
import { importDrafts } from '../../services/inventoryService';
import { Button, Chip } from '../ui';
import Sheet from './Sheet';

/**
 * Bring a catalog over in one drop. Shopify / Square / Etsy exports are recognised automatically (and any
 * CSV with a title + price column works), variants are grouped, and nothing is written until the seller has
 * seen exactly what will be created. Items without a price arrive as hidden drafts — never live at $0.
 */
const FORMAT_LABEL: Record<CsvFormat, string> = { shopify: 'Shopify export', square: 'Square export', etsy: 'Etsy export', generic: 'CSV file' };

const HOW: { name: string; steps: string }[] = [
  { name: 'Shopify', steps: 'Products → Export → "All products" → CSV for Excel' },
  { name: 'Square', steps: 'Items → Actions → Export Library' },
  { name: 'Etsy', steps: 'Shop Manager → Settings → Options → Download Data' },
];

const ImportSheet: React.FC<{
  who: { sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG' };
  onClose: () => void;
  onDone: (count: number) => void;
}> = ({ who, onClose, onDone }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<{ format: CsvFormat; drafts: ProductDraft[]; warnings: string[] } | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [err, setErr] = useState('');

  const read = async (file?: File | null) => {
    if (!file) return;
    setErr(''); setFileName(file.name);
    try {
      const text = await file.text();
      setParsed(rowsToDrafts(parseCsv(text)));
    } catch { setErr('Could not read that file. Export it as CSV and try again.'); setParsed(null); }
  };

  const stats = useMemo(() => {
    if (!parsed) return null;
    const d = parsed.drafts;
    return {
      products: d.length,
      variants: d.reduce((s, x) => s + (x.variants?.length || 0), 0),
      units: d.reduce((s, x) => s + (x.variants ? x.variants.reduce((a, v) => a + v.stock, 0) : x.stock), 0),
      hidden: d.filter(x => !x.isActive).length,
    };
  }, [parsed]);

  const go = async () => {
    if (!parsed?.drafts.length) return;
    setErr(''); setProgress([0, parsed.drafts.length]);
    try {
      const n = await importDrafts(parsed.drafts, who, (a, b) => setProgress([a, b]));
      onDone(n); onClose();
    } catch (e: any) { setErr(e?.message || 'Import failed part-way — check your connection. Products already added are kept.'); setProgress(null); }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'plajah-products-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Sheet
      title="Import your products" eyebrow="Switching to Plajah?" onClose={onClose} wide
      footer={
        <div className="flex items-center gap-3">
          <p className="type-body-sm flex-1" style={{ color: 'var(--on-surface-variant)' }}>
            {progress ? `Importing ${progress[0]} / ${progress[1]}…` : stats ? `${stats.products} products ready` : 'Nothing is added until you confirm.'}
          </p>
          <Button variant="primary" size="md" icon={<Check />} loading={!!progress} disabled={!parsed?.drafts.length} onClick={go}>
            Import{stats ? ` ${stats.products}` : ''}
          </Button>
        </div>
      }
    >
      {!parsed ? (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files?.[0]); }}
            onClick={() => inputRef.current?.click()}
            className="rounded-3xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors"
            style={{ borderColor: drag ? 'var(--pj-orange)' : 'var(--pj-border-strong)', background: drag ? 'var(--pj-orange-soft)' : 'var(--pj-glass-1)' }}
          >
            <UploadCloud size={34} className="mx-auto mb-3" style={{ color: 'var(--pj-orange)' }} />
            <p className="type-title-md font-bold" style={{ color: 'var(--text-primary)' }}>Drop your product CSV here</p>
            <p className="type-body-md mt-1" style={{ color: 'var(--on-surface-variant)' }}>or tap to choose a file — we'll recognise Shopify, Square and Etsy automatically</p>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => read(e.target.files?.[0])} />
          </div>
          <div className="grid sm:grid-cols-3 gap-2 mt-4">
            {HOW.map(h => (
              <div key={h.name} className="rounded-2xl p-3" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
                <p className="type-label-lg font-bold" style={{ color: 'var(--text-primary)' }}>From {h.name}</p>
                <p className="type-body-sm mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{h.steps}</p>
              </div>
            ))}
          </div>
          <div className="mt-4"><Button variant="ghost" size="sm" icon={<Download />} onClick={downloadTemplate}>Download a blank template</Button></div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Chip brand><FileSpreadsheet size={12} /> {FORMAT_LABEL[parsed.format]}</Chip>
            <span className="type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>{fileName}</span>
            <Button variant="ghost" size="xs" onClick={() => { setParsed(null); setFileName(''); }}>Choose another</Button>
          </div>
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[['Products', stats.products], ['Variants', stats.variants], ['Units in stock', stats.units], ['Hidden drafts', stats.hidden]].map(([k, v]) => (
                <div key={k as string} className="rounded-2xl p-3 text-center" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
                  <p className="type-title-lg font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{v as number}</p>
                  <p className="pj-eyebrow">{k}</p>
                </div>
              ))}
            </div>
          )}
          {parsed.warnings.length > 0 && (
            <div className="rounded-2xl p-3 mb-4 space-y-1" style={{ background: 'var(--pj-warning-soft)', border: '1px solid var(--pj-warning)' }}>
              {parsed.warnings.slice(0, 6).map((w, i) => (
                <p key={i} className="type-body-sm flex items-start gap-2" style={{ color: 'var(--text-primary)' }}><AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--pj-warning)' }} />{w}</p>
              ))}
              {parsed.warnings.length > 6 && <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>…and {parsed.warnings.length - 6} more</p>}
            </div>
          )}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--pj-border)' }}>
            {parsed.drafts.slice(0, 8).map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i ? '1px solid var(--pj-border)' : undefined, background: 'var(--pj-glass-1)' }}>
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--pj-glass-2)' }}>
                  {d.images[0] && <img src={d.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="type-label-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>{d.title}</p>
                  <p className="type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>
                    {d.price > 0 ? `$${d.price.toFixed(2)}` : 'No price'} · {d.variants ? `${d.variants.length} variants` : `${d.stock} in stock`} · {d.category.toLowerCase()}
                  </p>
                </div>
                {!d.isActive && <Chip>Draft</Chip>}
              </div>
            ))}
            {parsed.drafts.length > 8 && <p className="type-body-sm px-3 py-2 text-center" style={{ color: 'var(--on-surface-variant)', borderTop: '1px solid var(--pj-border)' }}>+ {parsed.drafts.length - 8} more</p>}
          </div>
        </>
      )}
      {err && <p className="type-body-sm mt-3" role="alert" style={{ color: 'var(--pj-danger)' }}>{err}</p>}
    </Sheet>
  );
};

export default ImportSheet;
