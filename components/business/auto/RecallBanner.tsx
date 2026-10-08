// RecallBanner - open NHTSA recalls for a vehicle (by make/model/year). Recall work is FREE to the owner and done
// by a dealer; the shop only informs, so the optional "add line" creates a $0 informational line, never a charge.
import React from 'react';
import { RECALL_DISCLAIMER } from '../../../services/nhtsaCore';
import type { RecallInfo } from '../../../services/vehicleCore';

interface Props { recalls: RecallInfo[]; stale?: boolean; note?: string; hint?: string; onAddLine?: (r: RecallInfo) => void; busy?: boolean; added?: Set<string> }
export default function RecallBanner({ recalls, stale, note, hint, onAddLine, busy, added }: Props) {
  if (!recalls.length) return <div className="text-xs text-emerald-300 font-bold" role="status">No open NHTSA recalls listed for this make/model/year{stale ? ' (last saved list)' : ''}. Confirm by VIN with the manufacturer.</div>;
  return (
    <div role="alert" className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 space-y-2" data-testid="recall-banner">
      <div className="text-sm font-black uppercase tracking-wide text-amber-200">{recalls.length} open recall{recalls.length > 1 ? 's' : ''} may apply</div>
      {note && <div className="text-xs text-amber-200/80">{note}</div>}
      {recalls.slice(0, 6).map(r => (
        <div key={r.campaign} className="rounded-lg bg-black/25 p-2 space-y-1">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0"><div className="text-xs font-black text-white">{r.component || 'Recall'} <span className="text-white/40 font-mono">{r.campaign}</span>{r.parkIt && <span className="ml-2 text-[#ff7aa8] uppercase">do not drive</span>}</div>
              {r.summary && <div className="text-[11px] text-white/60 line-clamp-3">{r.summary}</div>}
              {r.remedy && <div className="text-[11px] text-emerald-300/80">Remedy: {r.remedy}</div>}</div>
            {onAddLine && <button disabled={busy || added?.has(r.campaign)} onClick={() => onAddLine(r)} className="shrink-0 min-h-[40px] px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase disabled:opacity-40">{added?.has(r.campaign) ? 'Added' : 'Add recall line'}</button>}
          </div>
        </div>
      ))}
      {recalls.length > 6 && <div className="text-[11px] text-white/50">+ {recalls.length - 6} more at nhtsa.gov/recalls</div>}
      <div className="text-[11px] text-white/60">The recall line only informs the customer; we do not bill for it. {hint}</div>
      <div className="text-[10px] text-white/40">{RECALL_DISCLAIMER}</div>
    </div>
  );
}
