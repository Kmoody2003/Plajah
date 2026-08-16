// LessonBodyEditor — the part of a template a teacher actually rewrites.
//
// The seed gives them a real lesson rather than a blank form, so this is built for EDITING an
// existing plan, not authoring from nothing: steps reorder in place, the rubric arrives as a
// four-level scale they adjust rather than construct, and differentiation is two fields that are
// already filled in. "Approve and tweak" is the whole design intent of the template library — a
// blank rubric builder would put the work straight back on the teacher.

import React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Clock, Scale, Users2 } from 'lucide-react';
import type { TemplateStructure, Rubric, RubricCriterion } from '../../data/assignmentTemplates';
import { T, cardStyle, btn } from './integrityTheme';

const field: React.CSSProperties = {
  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.ink,
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', width: '100%',
};

const Head: React.FC<{ icon: React.ElementType; title: string; hint?: string }> = ({ icon: Icon, title, hint }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Icon size={15} color={T.orange} />
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900 }}>{title}</h3>
    </div>
    {hint && <p style={{ margin: '5px 0 0', fontSize: 11.5, color: T.faint, lineHeight: 1.6 }}>{hint}</p>}
  </div>
);

const LEVEL_LABELS = ['Beginning', 'Developing', 'Proficient', 'Advanced'];

const LessonBodyEditor: React.FC<{
  structure: TemplateStructure;
  onChange: (s: TemplateStructure) => void;
}> = ({ structure, onChange }) => {
  const patch = (p: Partial<TemplateStructure>) => onChange({ ...structure, ...p });

  // ── Steps ──
  const setStep = (i: number, value: string) =>
    patch({ steps: structure.steps.map((s, idx) => (idx === i ? value : s)) });

  const moveStep = (i: number, delta: -1 | 1) => {
    const target = i + delta;
    if (target < 0 || target >= structure.steps.length) return;
    const steps = [...structure.steps];
    [steps[i], steps[target]] = [steps[target], steps[i]];
    patch({ steps });
  };

  const addStep = () => patch({ steps: [...structure.steps, ''] });
  const removeStep = (i: number) => patch({ steps: structure.steps.filter((_, idx) => idx !== i) });

  // ── Rubric ──
  const setCriterion = (ci: number, next: RubricCriterion) =>
    patch({ rubric: { criteria: structure.rubric.criteria.map((c, i) => (i === ci ? next : c)) } });

  const addCriterion = () => {
    const blank: RubricCriterion = {
      name: '',
      // Points stay 1–4 and fixed: the scale is what makes rubrics comparable across templates,
      // and a teacher re-weighting one criterion silently would break that comparison.
      levels: LEVEL_LABELS.map((label, i) => ({ label, descriptor: '', points: i + 1 })),
    };
    patch({ rubric: { criteria: [...structure.rubric.criteria, blank] } });
  };

  const removeCriterion = (ci: number) =>
    patch({ rubric: { criteria: structure.rubric.criteria.filter((_, i) => i !== ci) } });

  return (
    <>
      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
        <Head icon={Clock} title="Lesson steps" hint="What happens, in order. Timings in the text are fine — teachers read these as a sequence, not a schedule." />
        {structure.steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8 }}>
            <span style={{
              width: 22, height: 22, flexShrink: 0, marginTop: 7, borderRadius: 6,
              background: T.cardAlt, border: `1px solid ${T.border}`, color: T.muted,
              fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center',
            }}>
              {i + 1}
            </span>
            <textarea
              value={step}
              onChange={e => setStep(i, e.target.value)}
              rows={2}
              style={{ ...field, resize: 'vertical' }}
              aria-label={`Step ${i + 1}`}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button onClick={() => moveStep(i, -1)} disabled={i === 0}
                style={{ ...btn('ghost', T.muted), padding: 4, opacity: i === 0 ? 0.3 : 1 }}
                aria-label={`Move step ${i + 1} up`}><ArrowUp size={13} /></button>
              <button onClick={() => moveStep(i, 1)} disabled={i === structure.steps.length - 1}
                style={{ ...btn('ghost', T.muted), padding: 4, opacity: i === structure.steps.length - 1 ? 0.3 : 1 }}
                aria-label={`Move step ${i + 1} down`}><ArrowDown size={13} /></button>
              <button onClick={() => removeStep(i)}
                style={{ ...btn('ghost', T.danger), padding: 4 }}
                aria-label={`Remove step ${i + 1}`}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button onClick={addStep} style={btn('outline', T.cyan)}><Plus size={13} /> Add step</button>
          <label style={{ fontSize: 11.5, color: T.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Estimated minutes
            <input
              type="number" min={5} max={600} step={5}
              value={structure.estimatedMinutes}
              onChange={e => patch({ estimatedMinutes: Number(e.target.value) || 0 })}
              style={{ ...field, width: 82 }}
            />
          </label>
        </div>
      </section>

      {/* ── Differentiation ───────────────────────────────────────────────── */}
      <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
        <Head icon={Users2} title="Differentiation" hint="Pre-filled from the seed. These are the two the teacher will actually be asked for by an administrator." />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 5 }}>
            Support
            <textarea
              value={structure.differentiation.support}
              onChange={e => patch({ differentiation: { ...structure.differentiation, support: e.target.value } })}
              rows={3}
              style={{ ...field, resize: 'vertical' }}
            />
          </label>
          <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 5 }}>
            Extension
            <textarea
              value={structure.differentiation.extension}
              onChange={e => patch({ differentiation: { ...structure.differentiation, extension: e.target.value } })}
              rows={3}
              style={{ ...field, resize: 'vertical' }}
            />
          </label>
        </div>
      </section>

      {/* ── Rubric ────────────────────────────────────────────────────────── */}
      <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
        <Head icon={Scale} title="Rubric" hint="Four levels, 1–4 points, fixed. Keeping the scale constant is what lets mastery from different templates land on the same ledger." />
        {structure.rubric.criteria.map((c, ci) => (
          <div key={ci} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: ci < structure.rubric.criteria.length - 1 ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                value={c.name}
                onChange={e => setCriterion(ci, { ...c, name: e.target.value })}
                placeholder="Criterion name — e.g. Ratio reasoning"
                style={{ ...field, fontWeight: 800 }}
                aria-label={`Criterion ${ci + 1} name`}
              />
              <button onClick={() => removeCriterion(ci)} style={{ ...btn('ghost', T.danger), padding: 7 }}
                aria-label={`Remove criterion ${ci + 1}`}><Trash2 size={14} /></button>
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              {c.levels.map((lv, li) => (
                <label key={li} style={{ fontSize: 11, color: T.muted, display: 'grid', gap: 4 }}>
                  <span style={{ fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 9.5 }}>
                    {lv.label} · {lv.points} pt{lv.points === 1 ? '' : 's'}
                  </span>
                  <textarea
                    value={lv.descriptor}
                    onChange={e => setCriterion(ci, {
                      ...c,
                      levels: c.levels.map((l, i) => (i === li ? { ...l, descriptor: e.target.value } : l)),
                    })}
                    rows={2}
                    style={{ ...field, resize: 'vertical', fontSize: 12 }}
                    aria-label={`${c.name || `Criterion ${ci + 1}`} — ${lv.label}`}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button onClick={addCriterion} style={btn('outline', T.cyan)}><Plus size={13} /> Add criterion</button>
      </section>
    </>
  );
};

export default LessonBodyEditor;
