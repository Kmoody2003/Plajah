import React from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import type { BookDraft, Finding } from '../../services/bookmeta/types';
import type { PreflightResult } from '../../services/bookmeta/preflight';
import { Card, FindingList } from './ui';
import DevicePreview from './DevicePreview';
import EditorialCouncilPanel from '../editorial/council/EditorialCouncilPanel';
import { bookDraftToManuscript } from '../../services/editorial/council/editorialAdapters';

export type StepId = 'IMPORT' | 'COVER' | 'DETAILS' | 'RIGHTS' | 'PRICING' | 'PRINT' | 'PREFLIGHT' | 'REVIEW';
const AREA_STEP: Record<Finding['area'], StepId> = { manuscript: 'IMPORT', epub: 'IMPORT', cover: 'COVER', metadata: 'DETAILS', rights: 'RIGHTS', accessibility: 'RIGHTS', pricing: 'PRICING' };
export const stepForFinding = (f: Finding): StepId => AREA_STEP[f.area];

export function ScoreRing({ score, ready }: { score: number; ready: boolean }) {
  const c = 2 * Math.PI * 38, color = ready ? (score >= 85 ? '#34d399' : '#f59e0b') : '#f87171';
  return (
    <div className="relative w-24 h-24 flex-shrink-0" role="img" aria-label={`Ready to publish score ${score} out of 100`}>
      <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90"><circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle cx="48" cy="48" r="38" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset .5s' }} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-black text-white tabular-nums">{score}</span><span className="text-[8px] uppercase tracking-widest text-white/35">/ 100</span></div>
    </div>
  );
}

export default function StepPreflight({ draft, preflight, goTo }: { draft: BookDraft; preflight: PreflightResult; goTo: (s: StepId) => void }) {
  const r = preflight;
  return (
    <div className="space-y-5">
      <Card tone={r.ready ? 'default' : 'danger'}>
        <div className="flex items-center gap-5">
          <ScoreRing score={r.score} ready={r.ready} />
          <div className="min-w-0">
            <h3 className="text-base font-black text-white flex items-center gap-2">{r.ready ? <><CheckCircle2 size={18} className="text-emerald-400" /> Ready to publish</> : <><ShieldAlert size={18} className="text-red-400" /> Not ready yet</>}</h3>
            <p className="text-sm text-white/55 mt-1 leading-snug">{r.ready
              ? (r.warnings.length ? `No blockers. ${r.warnings.length} suggestion${r.warnings.length > 1 ? 's' : ''} would polish it.` : 'Everything checks out.')
              : `${r.blocking.length} thing${r.blocking.length > 1 ? 's' : ''} must be fixed before you can submit.`}</p>
            <p className="text-[11px] text-white/30 mt-1">{r.stats.chapters} chapters · {r.stats.words.toLocaleString()} words. This mirrors common rejection reasons; each store still does its own review.</p>
          </div>
        </div>
      </Card>

      {r.blocking.length > 0 && <Card title={`Must fix (${r.blocking.length})`} tone="danger"><FindingList findings={r.blocking} onFix={f => goTo(stepForFinding(f))} /></Card>}
      {r.warnings.length > 0 && <Card title={`Should fix (${r.warnings.length})`}><FindingList findings={r.warnings} onFix={f => goTo(stepForFinding(f))} /></Card>}
      {r.infos.length > 0 && <details><summary className="text-[11px] font-black uppercase tracking-widest text-white/40 cursor-pointer min-h-[36px]">{r.infos.length} notes</summary><div className="mt-2"><FindingList findings={r.infos} /></div></details>}

      <Card title="Ask the editors (optional)" subtitle="A publisher's-eye read of your manuscript: what is working, what to look at, and the rights questions. Guidance you can accept, adapt or decline.">
        <EditorialCouncilPanel getManuscript={() => bookDraftToManuscript(draft)} />
      </Card>

      <Card title="See how it reads" subtitle="Your first pages on a phone, a tablet and an e-ink screen.">
        <DevicePreview draft={draft} />
      </Card>
    </div>
  );
}
