/**
 * GoLiveChecklist — "Go live in 15 minutes". Presentational: the caller computes `progress` with
 * computeChecklist(pack, snapshot) so it renders in the dev preview without Firebase.
 * Steps are auto-detected from business data; the owner can also tick one by hand.
 */
import React from 'react';
import { Check, Circle, Lock, ChevronRight, Rocket, Trash2, RefreshCw } from 'lucide-react';
import type { ChecklistProgress, StepProgress } from '../../services/verticalPacks/checklist';
import type { VerticalPack, VerticalTab } from '../../services/verticalPacks';
import { ReadinessBadge, PACK_ICONS } from './PackPicker';

interface Props {
  pack: VerticalPack;
  progress: ChecklistProgress;
  sampleCount?: number;
  onGoTab?: (tab: VerticalTab) => void;
  onToggleManual?: (stepId: string, done: boolean) => void;
  onChangePack?: () => void;
  onClearSamples?: () => void;
  busy?: boolean;
}

const GoLiveChecklist: React.FC<Props> = ({ pack, progress, sampleCount = 0, onGoTab, onToggleManual, onChangePack, onClearSamples, busy }) => {
  const Icon = PACK_ICONS[pack.icon] || Rocket;
  const { live, percent, requiredDone, requiredTotal, minutesLeft } = progress;
  const accent = live ? '#06D6A0' : '#FF8C00';

  return (
    <div className="bg-white/[0.04] border border-white/[0.07] rounded-3xl p-6 relative overflow-hidden">
      <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: accent }} />
      <div className="relative flex items-start gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: `${pack.color}24`, color: pack.color }}><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl text-white leading-none" style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontStyle: 'italic' }}>
            {live ? 'You are live' : 'Go live in 15 minutes'}
          </h3>
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35 mt-1.5 flex items-center gap-2 flex-wrap">
            <span>{pack.label}</span><ReadinessBadge pack={pack} compact />
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black text-white leading-none">{percent}<span className="text-sm text-white/40">%</span></p>
          <p className="text-[8px] font-black uppercase tracking-widest text-white/35 mt-1">{live ? 'all set' : `~${minutesLeft} min left`}</p>
        </div>
      </div>

      <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden mb-4" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: live ? '#06D6A0' : 'linear-gradient(90deg,#FF8C00,#D40055)' }} />
      </div>

      <ol className="relative space-y-1.5">
        {progress.steps.map(step => (
          <Row key={step.id} step={step} isNext={progress.next?.id === step.id} onGoTab={onGoTab} onToggleManual={onToggleManual} />
        ))}
      </ol>

      <div className="relative flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-white/[0.06]">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/30 mr-auto">{requiredDone}/{requiredTotal} required steps</span>
        {sampleCount > 0 && onClearSamples && (
          <button onClick={onClearSamples} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-40">
            <Trash2 size={11} /> Delete {sampleCount} samples
          </button>
        )}
        {onChangePack && (
          <button onClick={onChangePack} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white">
            <RefreshCw size={11} /> Change type
          </button>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ step: StepProgress; isNext: boolean; onGoTab?: (t: VerticalTab) => void; onToggleManual?: (id: string, done: boolean) => void }> = ({ step, isNext, onGoTab, onToggleManual }) => {
  const done = step.state === 'done';
  const soon = step.state === 'soon';
  // Anything not auto-detected can be ticked by hand; auto-detected-but-unconfirmed steps (hours, catalog) too.
  const tickable = !soon && step.source !== 'auto' && Boolean(onToggleManual);
  return (
    <li className={`flex items-start gap-3 p-3 rounded-2xl border transition-all ${isNext ? 'bg-[#FF8C00]/[0.07] border-[#FF8C00]/30' : 'bg-white/[0.02] border-white/[0.05]'} ${soon ? 'opacity-55' : ''}`}>
      <button
        type="button"
        disabled={!tickable}
        onClick={() => tickable && onToggleManual!(step.id, !done)}
        aria-label={done ? `Mark ${step.label} not done` : `Mark ${step.label} done`}
        className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 border ${done ? 'bg-[#06D6A0] border-[#06D6A0] text-black' : soon ? 'border-white/15 text-white/30' : 'border-white/25 text-transparent hover:border-white/50'} ${tickable ? 'cursor-pointer' : 'cursor-default'}`}>
        {done ? <Check size={12} strokeWidth={3} /> : soon ? <Lock size={10} /> : <Circle size={10} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-black leading-snug ${done ? 'text-white/45 line-through decoration-white/20' : 'text-white'}`}>
          {step.label}
          {step.optional && <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-white/30 no-underline">optional</span>}
          {soon && <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-[#FF8C00]">coming soon</span>}
        </p>
        {!done && <p className="text-[10.5px] text-white/40 leading-snug mt-0.5">{step.detail}</p>}
        {done && step.source && <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mt-0.5">{step.source === 'auto' ? 'Detected automatically' : 'Marked done by you'}</p>}
      </div>
      {!done && !soon && step.tab && onGoTab && (
        <button onClick={() => onGoTab(step.tab!)} className="shrink-0 flex items-center gap-0.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:border-white/25">
          {step.minutes > 0 ? `${step.minutes} min` : 'Open'}<ChevronRight size={11} />
        </button>
      )}
    </li>
  );
};

export default GoLiveChecklist;
