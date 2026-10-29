// Desk view — how a lesson, worksheet or exam opens for a teacher: the lesson's own living template, in
// read mode, exactly as students will get it. Nothing is filled in and nothing changes here; the full Tela
// document is only for editing (Edit in Tela). The original and the answer key (teachers only) sit beside
// it, as does the Sacred Library background ("Dig deeper") — none of it inside the assignment.

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, KeyRound, PenLine, X } from 'lucide-react';
import type { IngestedCurriculumUnit } from '../../services/curriculumIngestionService';
import { getDefaultLivingTemplateForUnit, getLivingTemplateById } from '../../services/council/livingDocumentTemplates';
import { LivingTemplateBespokeRenderer } from './LivingTemplateBespokeRenderer';

type Side = 'none' | 'original' | 'key' | 'deeper';

const DESK_CSS = `
.dv-scrim{position:fixed;inset:0;z-index:220;background:rgba(0,0,0,.66)}
.dv{position:fixed;z-index:221;inset:12px;max-width:1280px;margin:0 auto;display:flex;flex-direction:column;background:#0f0c18;border:1px solid rgba(255,255,255,.12);border-radius:22px;overflow:hidden;color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.dv-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
.dv-h .t{font:900 1rem/1.2 system-ui;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dv-h .s{font-size:.72rem;color:rgba(255,255,255,.5)}
.dv-b{appearance:none;height:34px;padding:0 12px;border-radius:99px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;font:700 .76rem/1 system-ui;display:inline-flex;gap:6px;align-items:center;cursor:pointer}
.dv-b[aria-pressed="true"]{background:#fff;color:#14101c}
.dv-b.p{background:linear-gradient(135deg,#6B0099,#D40055);border-color:transparent}
.dv-body{flex:1;min-height:0;display:flex}
.dv-main{flex:1;min-width:0;overflow-y:auto;padding:18px}
.dv-side{width:min(380px,40vw);border-left:1px solid rgba(255,255,255,.1);overflow-y:auto;padding:16px;display:grid;gap:10px;align-content:start;font-size:.84rem}
.dv-side pre{white-space:pre-wrap;font:500 .8rem/1.6 ui-monospace,monospace;color:rgba(255,255,255,.75);margin:0}
.dv-card{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;display:grid;gap:4px;background:rgba(255,255,255,.03)}
@media(max-width:760px){.dv{inset:0;border-radius:0}.dv-body{flex-direction:column}.dv-side{width:auto;border-left:0;border-top:1px solid rgba(255,255,255,.1);max-height:45vh}}
`;

export default function DeskView({ unit, onClose, canViewAnswerKey = false, onEdit }: {
  unit: IngestedCurriculumUnit;
  onClose: () => void;
  /** Course teachers, department heads/admins, pastors/owners. */
  canViewAnswerKey?: boolean;
  /** Present when this viewer may change the lesson: opens the full Tela document. */
  onEdit?: () => void;
}) {
  const [side, setSide] = useState<Side>('none');
  const templateId = useMemo(() => unit.livingTemplateId || getDefaultLivingTemplateForUnit(unit).id, [unit]);
  const template = getLivingTemplateById(templateId);
  const hasKey = canViewAnswerKey && (unit.questions.some(q => q.correctAnswer) || !!unit.rawAnswerKeyText);
  const supplements = unit.sacredLibrarySupplements || [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (s: Side) => setSide(cur => (cur === s ? 'none' : s));

  return (
    <>
      <style>{DESK_CSS}</style>
      <div className="dv-scrim" onClick={onClose} />
      <div className="dv" role="dialog" aria-modal="true" aria-label={unit.title}>
        <div className="dv-h">
          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
            <div className="t">{unit.title}</div>
            <div className="s">Desk view · {template.name} · read only</div>
          </div>
          {(unit.sourceUrl || unit.rawCurriculumText) && <button type="button" className="dv-b" aria-pressed={side === 'original'} onClick={() => toggle('original')}>Original</button>}
          {hasKey && <button type="button" className="dv-b" aria-pressed={side === 'key'} onClick={() => toggle('key')}><KeyRound size={13} /> Answer key</button>}
          {supplements.length > 0 && <button type="button" className="dv-b" aria-pressed={side === 'deeper'} onClick={() => toggle('deeper')}>Dig deeper</button>}
          {onEdit && <button type="button" className="dv-b p" onClick={onEdit}><PenLine size={13} /> Edit in Tela</button>}
          <button type="button" className="dv-b" onClick={onClose} aria-label="Close" autoFocus><X size={15} /></button>
        </div>
        <div className="dv-body">
          <div className="dv-main">
            <LivingTemplateBespokeRenderer
              templateId={templateId}
              unit={unit}
              answers={{}}
              onUpdateAnswer={() => {}}
              supplements={[]}
              readOnly
              showAnswerKey={side === 'key'}
            />
          </div>
          {side !== 'none' && (
            <aside className="dv-side" aria-label={side === 'original' ? 'Original' : side === 'key' ? 'Answer key' : 'Dig deeper'}>
              {side === 'original' && (
                <>
                  <strong>{unit.sourceLabel || 'Original'}</strong>
                  {unit.readByOcr && <span className="s">A scan, read from its page images: check it against the original.</span>}
                  {unit.sourceUrl && <a className="dv-b" style={{ justifySelf: 'start', textDecoration: 'none' }} href={unit.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open the original</a>}
                  {unit.rawCurriculumText && <pre>{unit.rawCurriculumText}</pre>}
                </>
              )}
              {side === 'key' && (
                <>
                  {unit.rawAnswerKeyText && <pre>{unit.rawAnswerKeyText}</pre>}
                  {unit.questions.map(q => (
                    <div key={q.id} className="dv-card">
                      <strong>{q.label || q.number}. {q.prompt}</strong>
                      <span style={{ color: '#5be49b' }}>✓ {q.correctAnswer || 'Teacher-graded (written answer)'}</span>
                    </div>
                  ))}
                </>
              )}
              {side === 'deeper' && (
                <>
                  <span className="s">Background from the Sacred Library. It isn’t part of the assignment.</span>
                  {supplements.map((sup, i) => (
                    <div key={i} className="dv-card">
                      <span className="s">{sup.categoryBadge} · {sup.era}</span>
                      <strong>{sup.title}</strong>
                      <span>{sup.summary}</span>
                    </div>
                  ))}
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
