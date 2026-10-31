// DesignImportDialog — progress while a Photoshop or Illustrator file imports, then an honest
// account of what stayed live, what kept its look, what was baked and what did not come across.
import React, { useMemo } from 'react';
import { CheckCircle2, Eye, Layers, Loader2, Package, Sparkles, Type, X, AlertTriangle, Flame } from 'lucide-react';
import type { FeatureRow, FeatureStatus, ImportReport } from '../../../services/tela/import/types';

export interface DesignImportState { name: string; stage?: string; done?: number; total?: number; report?: ImportReport; error?: string }

const STATUS: Record<FeatureStatus, { title: string; hint: string; color: string; icon: React.ReactNode }> = {
  live: { title: 'Fully editable', hint: 'Works in Tela the way it does in the source app.', color: '#34d399', icon: <CheckCircle2 size={13} /> },
  look: { title: 'Exact look, editable on demand', hint: 'Shows the original rendering until you edit it.', color: '#8FF5FF', icon: <Eye size={13} /> },
  approx: { title: 'Close, not identical', hint: 'Editable, with small visual differences.', color: '#f59e0b', icon: <Sparkles size={13} /> },
  baked: { title: 'Baked into pixels or colours', hint: 'The look is kept; the setting itself is not adjustable.', color: '#a78bfa', icon: <Flame size={13} /> },
  dropped: { title: 'Did not come across', hint: 'Still safe in your original file.', color: '#FF8FA8', icon: <AlertTriangle size={13} /> },
};
const FONT_STATUS = { installed: { label: 'Installed', color: '#34d399' }, library: { label: 'Tela library', color: '#8FF5FF' }, substitute: { label: 'Missing', color: '#FF8FA8' } };

interface Props { state: DesignImportState; onClose: () => void; onOpenSmart?: (assetId: string, name: string) => void }

export const DesignImportDialog: React.FC<Props> = ({ state, onClose, onOpenSmart }) => {
  const { report, error } = state; const working = !report && !error;
  const grouped = useMemo(() => {
    const g = new Map<FeatureStatus, FeatureRow[]>();
    for (const f of report?.features || []) { const rows = g.get(f.status) || []; rows.push(f); g.set(f.status, rows); }
    return g;
  }, [report]);
  const pct = state.total ? Math.round((state.done || 0) / state.total * 100) : 0;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Import ${state.name}`} data-testid="design-import-dialog" style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'grid', placeItems: 'center', background: 'rgba(6,4,10,.62)', padding: 16 }} onClick={e => { if (e.target === e.currentTarget && !working) onClose(); }}>
      <div style={{ width: 'min(620px, 100%)', maxHeight: 'min(84vh, 760px)', display: 'flex', flexDirection: 'column', background: '#16121f', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, color: '#fff', overflow: 'hidden' }}>
        <div className="flex items-center gap-2" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          {working ? <Loader2 size={16} className="animate-spin" color="#8FF5FF" /> : error ? <AlertTriangle size={16} color="#FF8FA8" /> : <CheckCircle2 size={16} color="#34d399" />}
          <div className="min-w-0 flex-1">
            <div className="truncate" style={{ fontSize: 13, fontWeight: 800 }}>{working ? `Importing ${state.name}` : error ? 'Import stopped' : `Imported ${state.name}`}</div>
            {report && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{Math.round(report.width)} × {Math.round(report.height)}{report.colorMode ? ` · ${report.colorMode}` : ''}{report.bits ? ` ${report.bits}-bit` : ''} · {report.layers} {report.layers === 1 ? 'layer' : 'layers'}</div>}
          </div>
          {!working && <button aria-label="Close" onClick={onClose} style={{ padding: 4, background: 'none', border: 0, color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}><X size={16} /></button>}
        </div>
        <div style={{ overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {working && <div>
            <div className="truncate" style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginBottom: 8 }}>{state.stage || 'Reading the file'}</div>
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6B0099,#8FF5FF)', transition: 'width .2s' }} /></div>
            {state.total ? <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', marginTop: 6 }}>{state.done} of {state.total}</div> : null}
          </div>}
          {error && <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.85)', margin: 0 }}>{error}</p>}
          {report && <>
            {(['live', 'look', 'approx', 'baked', 'dropped'] as FeatureStatus[]).map(s => {
              const rows = grouped.get(s); if (!rows?.length) return null; const m = STATUS[s];
              return <section key={s}>
                <div className="flex items-center gap-1.5" style={{ color: m.color, fontSize: 11.5, fontWeight: 800 }}>{m.icon}{m.title}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.42)', margin: '2px 0 6px' }}>{m.hint}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {rows.map(r => <div key={r.feature} style={{ fontSize: 12, color: 'rgba(255,255,255,.82)', display: 'flex', gap: 8 }}><span style={{ minWidth: 150 }}>{r.feature}{r.count > 1 ? <span style={{ color: 'rgba(255,255,255,.4)' }}> × {r.count}</span> : null}</span>{r.note && <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>{r.note}</span>}</div>)}
                </div>
              </section>;
            })}
            {!!report.fonts.length && <section>
              <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 800 }}><Type size={13} /> Fonts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {report.fonts.map(f => <div key={f.requested} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'baseline' }}><span className="truncate" style={{ flex: 1, color: 'rgba(255,255,255,.82)' }}>{f.requested}</span><span style={{ fontSize: 10.5, fontWeight: 800, color: FONT_STATUS[f.status].color }}>{FONT_STATUS[f.status].label}</span>{f.status === 'substitute' && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>edits use {f.family}</span>}</div>)}
              </div>
              {report.fonts.some(f => f.status === 'substitute') && <p style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,.5)', margin: '6px 0 0' }}>Install a missing font on this computer and re-import to get live type in it.</p>}
            </section>}
            {!!report.smartObjects.length && <section>
              <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 800 }}><Package size={13} /> Smart object contents</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {report.smartObjects.map(s => <div key={s.assetId} className="flex items-center gap-2" style={{ fontSize: 12 }}><span className="truncate" style={{ flex: 1, color: 'rgba(255,255,255,.82)' }}>{s.layer || s.name} <span style={{ color: 'rgba(255,255,255,.4)' }}>· {s.name}</span></span>{onOpenSmart && <button onClick={() => onOpenSmart(s.assetId, s.name)} className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 7, background: 'rgba(255,255,255,.08)', border: 0, color: '#fff', cursor: 'pointer' }}><Layers size={12} /> Open</button>}</div>)}
              </div>
            </section>}
            {report.warnings.filter(w => !w.startsWith('Font "')).map(w => <p key={w} style={{ fontSize: 11.5, lineHeight: 1.5, color: '#f5c97a', margin: 0 }}>{w}</p>)}
          </>}
        </div>
        {!working && <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', justifyContent: 'flex-end' }}>
          <button data-testid="design-import-done" onClick={onClose} style={{ fontSize: 12, fontWeight: 800, padding: '7px 16px', borderRadius: 8, background: '#6B0099', border: 0, color: '#fff', cursor: 'pointer' }}>{error ? 'Close' : 'Start editing'}</button>
        </div>}
      </div>
    </div>
  );
};

export default DesignImportDialog;
