// AssignmentTemplateStudio — pick a subject, a grade band and a task type; get a populated,
// standards-aligned template; edit it; then either assign it (District persona, always free) or
// package it into a paid course (Independent persona).
//
// That second branch is where the licence wall shows itself. Flip "package as a paid course" and
// every non-commercial material in the template lights up immediately with the reason — before
// any server round-trip, while the teacher is still deciding. Getting this wrong is real legal
// exposure, so the UI's job is to make it impossible to do by accident, not to catch it later.

import React, { useEffect, useMemo, useState } from 'react';
import { useAriaSurface } from '../../services/aria/useAriaSurface';
import {
  BookOpen, Check, AlertTriangle, ExternalLink, Loader2, Save, Sparkles,
  Scale, Clock, Target, Layers, FolderOpen, Trash2, GitBranch,
} from 'lucide-react';
import {
  TEMPLATE_SEEDS, TASK_TYPE_LABEL, SUBJECT_LABEL, filterSeeds,
  type AssignmentTemplate, type TaskType,
} from '../../data/assignmentTemplates';
import {
  filterLibrary, describeStandard, suggestPisaOverlay,
  type GradeBand, type LibrarySubject, type LibraryItem,
} from '../../data/oerLibrary';
import { LICENSE_LABEL, LICENSE_NOTE } from '../../services/oerLicenseGate';
import {
  templateFromSeed, evaluateLicense, saveTemplate, requestCommercialValidation,
  listMyTemplates, deleteTemplate, resolveHostedBooks, bookLink, type AssignStudent,
} from '../../services/assignmentTemplateService';
import LessonBodyEditor from './LessonBodyEditor';
import AssignTemplatePanel from './AssignTemplatePanel';
import { T, cardStyle, chip, btn, badge } from './integrityTheme';

const SUBJECTS: LibrarySubject[] = ['math', 'ela', 'science', 'socialStudies', 'worldLang', 'arts'];
const BANDS: GradeBand[] = ['K-2', '3-5', '6-8', '9-12'];

const licenseColor = (commercialOk: boolean) => (commercialOk ? T.success : T.warning);

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, color: T.muted, marginBottom: 8 }}>
    {children}
  </div>
);

interface Props {
  uid: string;
  /** The class an assignment would go to. Omit to hide the assign panel entirely. */
  classroom?: {
    classId: string;
    className: string;
    students: AssignStudent[];
    teacher: { uid: string; name: string; photo?: string };
    simulate?: boolean;
  };
}

const AssignmentTemplateStudio: React.FC<Props> = ({ uid, classroom }) => {
  const [mode, setMode] = useState<'browse' | 'mine'>('browse');
  const [subject, setSubject] = useState<LibrarySubject | undefined>();
  const [gradeBand, setGradeBand] = useState<GradeBand | undefined>();
  const [taskType, setTaskType] = useState<TaskType | undefined>();
  const [draft, setDraft] = useState<AssignmentTemplate | null>(null);
  const [mine, setMine] = useState<AssignmentTemplate[] | null>(null);

  const seeds = useMemo(() => filterSeeds({ subject, gradeBand, taskType }), [subject, gradeBand, taskType]);

  // Reload the saved list whenever we land on it, so a template saved in the editor and then
  // backed out of doesn't leave a stale list behind it.
  useEffect(() => {
    if (mode !== 'mine' || draft) return;
    let alive = true;
    setMine(null);
    listMyTemplates(uid).then(t => { if (alive) setMine(t); });
    return () => { alive = false; };
  }, [mode, uid, draft]);

  if (draft) {
    return (
      <TemplateEditor
        template={draft}
        classroom={classroom}
        onClose={() => setDraft(null)}
        onChange={setDraft}
      />
    );
  }

  const modeTabs = (
    <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
      <button onClick={() => setMode('browse')} style={chip(mode === 'browse')}>
        <Sparkles size={12} style={{ verticalAlign: -2, marginRight: 5 }} />Start from a template
      </button>
      <button onClick={() => setMode('mine')} style={chip(mode === 'mine', T.cyan)}>
        <FolderOpen size={12} style={{ verticalAlign: -2, marginRight: 5 }} />My templates
      </button>
    </div>
  );

  if (mode === 'mine') {
    return (
      <div style={{ fontFamily: T.font, color: T.ink }}>
        {modeTabs}
        <MyTemplates
          templates={mine}
          onOpen={setDraft}
          onDelete={async id => {
            await deleteTemplate(id);
            setMine(await listMyTemplates(uid));
          }}
          onBrowse={() => setMode('browse')}
        />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: T.font, color: T.ink }}>
      {modeTabs}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <Eyebrow>Subject</Eyebrow>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUBJECTS.map(s => (
              <button key={s} onClick={() => setSubject(subject === s ? undefined : s)} style={chip(subject === s)}>
                {SUBJECT_LABEL[s].split(' / ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow>Grade band</Eyebrow>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BANDS.map(b => (
              <button key={b} onClick={() => setGradeBand(gradeBand === b ? undefined : b)} style={chip(gradeBand === b, T.cyan)}>{b}</button>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow>Task type</Eyebrow>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map(t => (
              <button key={t} onClick={() => setTaskType(taskType === t ? undefined : t)} style={chip(taskType === t, T.magenta)}>
                {TASK_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {seeds.length === 0 ? (
        <div style={{ ...cardStyle, padding: 20, color: T.muted, fontSize: 13 }}>
          No seed template for that combination yet — {TEMPLATE_SEEDS.length} ship today, across
          all six subjects. Clear a filter, or start from a neighbouring band and re-align it.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
          {seeds.map(seed => {
            const gate = evaluateLicense(seed.structure.materials);
            return (
              <div key={seed.id} style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={badge(T.cyan)}>{seed.gradeBand}</span>
                  <span style={badge(T.magenta)}>{TASK_TYPE_LABEL[seed.taskType]}</span>
                  <span style={badge(licenseColor(gate.allowed))}>
                    {gate.allowed ? 'Paid-course ready' : 'Free tier only'}
                  </span>
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{seed.structure.title}</h4>
                <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                  {seed.structure.objective}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, color: T.faint }}>
                  <span><Clock size={11} style={{ verticalAlign: -1 }} /> {seed.structure.estimatedMinutes} min</span>
                  <span><Layers size={11} style={{ verticalAlign: -1 }} /> {seed.structure.steps.length} steps</span>
                  <span>
                    <Target size={11} style={{ verticalAlign: -1 }} /> {seed.structure.standardsAlignment.length}
                    {seed.structure.standardsAlignment.length === 1 ? ' standard' : ' standards'}
                  </span>
                </div>
                <button
                  onClick={() => setDraft(templateFromSeed(seed, uid, seed.id))}
                  style={{ ...btn('solid', T.orange), marginTop: 'auto', justifyContent: 'center' }}
                >
                  <Sparkles size={14} /> Use this template
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Saved templates ─────────────────────────────────────────────────────────────

const MyTemplates: React.FC<{
  templates: AssignmentTemplate[] | null;
  onOpen: (t: AssignmentTemplate) => void;
  onDelete: (id: string) => Promise<void>;
  onBrowse: () => void;
}> = ({ templates, onOpen, onDelete, onBrowse }) => {
  if (templates === null) {
    return (
      <div style={{ ...cardStyle, padding: 20, color: T.muted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader2 size={14} className="animate-spin" /> Loading your templates…
      </div>
    );
  }
  if (!templates.length) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p style={{ margin: '0 0 12px', color: T.muted, fontSize: 13, lineHeight: 1.6 }}>
          Nothing saved yet. Start from one of the six seed templates — they arrive with steps,
          differentiation and a rubric already written, so the work is editing rather than authoring.
        </p>
        <button onClick={onBrowse} style={btn('outline', T.orange)}>
          <Sparkles size={13} /> Browse templates
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
      {templates.map(t => (
        <div key={t.id} style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={badge(T.cyan)}>{t.gradeBand}</span>
            <span style={badge(T.magenta)}>{TASK_TYPE_LABEL[t.taskType]}</span>
            {t.commercialUse && <span style={badge(T.success)}><Check size={11} /> Paid</span>}
            {t.remixOf && <span style={badge(T.faint)}><GitBranch size={11} /> Remix</span>}
          </div>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{t.structure.title}</h4>
          <p style={{ margin: 0, fontSize: 12, color: T.faint }}>
            Updated {new Date(t.updatedAt).toLocaleDateString()} · {t.structure.estimatedMinutes} min
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button onClick={() => onOpen(t)} style={{ ...btn('solid', T.orange), flex: 1, justifyContent: 'center' }}>
              Open
            </button>
            <button onClick={() => void onDelete(t.id)} style={{ ...btn('ghost', T.danger), padding: 9 }}
              aria-label={`Delete ${t.structure.title}`}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Editor ──────────────────────────────────────────────────────────────────────

const TemplateEditor: React.FC<{
  template: AssignmentTemplate;
  classroom?: Props['classroom'];
  onChange: (t: AssignmentTemplate) => void;
  onClose: () => void;
}> = ({ template, classroom, onChange, onClose }) => {
  const [wantCommercial, setWantCommercial] = useState(template.commercialUse);
  const [busy, setBusy] = useState<'save' | 'validate' | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const gate = useMemo(() => evaluateLicense(template.structure.materials), [template.structure.materials]);
  const candidates = useMemo(
    () => filterLibrary({ subject: template.subject, gradeBand: template.gradeBand }),
    [template.subject, template.gradeBand],
  );

  // Which candidates Plajah actually hosts, so the teacher can see what a student will open.
  const [hostedBooks, setHostedBooks] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    resolveHostedBooks(candidates).then(set => { if (alive) setHostedBooks(set); });
    return () => { alive = false; };
  }, [candidates]);

  const toggleMaterial = (item: LibraryItem) => {
    const has = template.structure.materials.includes(item.id);
    onChange({
      ...template,
      structure: {
        ...template.structure,
        materials: has
          ? template.structure.materials.filter(m => m !== item.id)
          : [...template.structure.materials, item.id],
      },
      // Any material change invalidates prior server approval — it has to be re-earned.
      licenseValidated: false,
      commercialUse: false,
    });
  };

  const save = async () => {
    setBusy('save');
    const ok = await saveTemplate({ ...template, commercialUse: wantCommercial && gate.allowed && template.licenseValidated });
    setBusy(null);
    setStatus(ok
      ? { tone: 'ok', text: 'Saved to your templates.' }
      : { tone: 'err', text: "Couldn't save. Check your connection and try again." });
  };

  const validate = async () => {
    setBusy('validate');
    const ok = await saveTemplate(template);         // the server validates the STORED doc
    if (!ok) { setBusy(null); setStatus({ tone: 'err', text: "Couldn't save before validating." }); return; }
    const result = await requestCommercialValidation(template.id);
    setBusy(null);
    if (result.valid) {
      onChange({ ...template, licenseValidated: true, commercialUse: true, license: result.license ?? template.license });
      setStatus({ tone: 'ok', text: `Cleared for paid use under ${LICENSE_LABEL[result.license ?? template.license]}.` });
    } else {
      setStatus({
        tone: 'warn',
        text: result.blockingLicense
          ? `Blocked: a material is ${LICENSE_LABEL[result.blockingLicense as keyof typeof LICENSE_LABEL] ?? result.blockingLicense}, which can't sit behind a paid offering.`
          : result.error ?? 'Validation failed.',
      });
    }
  };

  const statusColor = status?.tone === 'ok' ? T.success : status?.tone === 'warn' ? T.warning : T.danger;

  // ── Aria lesson-design wiring ────────────────────────────────────────────────
  // Publishes the lesson body and exposes edits Aria can make. Fully controlled,
  // so her edits render live. See services/aria/ariaContext.ts.
  const aiStruct = template.structure;
  const aiPatch = (p: Partial<typeof aiStruct>) => onChange({ ...template, structure: { ...template.structure, ...p } });
  const aiLessonText = [
    aiStruct.objective && `Objective: ${aiStruct.objective}`,
    aiStruct.steps?.length ? `Steps:\n${aiStruct.steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
    aiStruct.differentiation?.support && `Support: ${aiStruct.differentiation.support}`,
    aiStruct.differentiation?.extension && `Extension: ${aiStruct.differentiation.extension}`,
  ].filter(Boolean).join('\n\n');
  const aiToSteps = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x)).filter(Boolean)
      : String(v ?? '').split(/\n{2,}|\n(?=\d+[.)]\s)/).map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);

  useAriaSurface({
    surface: 'lesson-studio',
    domain: 'learning',
    title: `Designing lesson: ${aiStruct.title || 'Untitled'}`,
    summary: `${template.subject || ''} ${template.gradeBand || ''}. ${aiStruct.steps?.length || 0} step(s). Help design the lesson: objective, steps, differentiation (support/extension), and rubric.`,
    documentText: aiLessonText,
    data: {
      title: aiStruct.title,
      subject: template.subject,
      gradeBand: template.gradeBand,
      objective: aiStruct.objective,
      steps: aiStruct.steps,
    },
    actions: [
      { id: 'setTitle', label: 'Set lesson title', description: 'Set or replace the lesson title.', params: { text: 'the title' } },
      { id: 'setObjective', label: 'Set objective', description: 'Set the lesson objective / learning goal.', params: { text: 'the objective' } },
      { id: 'appendStep', label: 'Add step(s)', description: 'Append one or more instructional steps. Separate multiple steps with a blank line.', params: { text: 'the step text (one or more)' } },
      { id: 'rewriteStep', label: 'Rewrite a step', description: 'Replace the text of one step by its 1-based number.', params: { number: 'the step number (1-based)', text: 'the new step text' } },
      { id: 'setSteps', label: 'Set all steps', description: 'Replace the entire list of steps with a new sequence (draft the whole lesson).', params: { steps: 'the full ordered list of steps (blank-line separated, or a JSON array)' } },
      { id: 'setDifferentiation', label: 'Set differentiation', description: 'Set the support and/or extension differentiation notes.', params: { support: 'support note (optional)', extension: 'extension note (optional)' } },
    ],
    handlers: {
      setTitle: ({ text }) => { aiPatch({ title: String(text ?? '') }); return { ok: true, message: 'Set the lesson title.' }; },
      setObjective: ({ text }) => { aiPatch({ objective: String(text ?? '') }); return { ok: true, message: 'Set the objective.' }; },
      appendStep: ({ text }) => {
        const add = aiToSteps(text);
        if (!add.length) return { ok: false, message: 'No step text.' };
        aiPatch({ steps: [...(aiStruct.steps || []), ...add] });
        return { ok: true, message: `Added ${add.length} step${add.length > 1 ? 's' : ''}.` };
      },
      rewriteStep: ({ number, text }) => {
        const i = Math.round(Number(number)) - 1;
        const steps = aiStruct.steps || [];
        if (!(i >= 0 && i < steps.length)) return { ok: false, message: 'No step with that number.' };
        aiPatch({ steps: steps.map((s, idx) => (idx === i ? String(text ?? '') : s)) });
        return { ok: true, message: `Rewrote step ${i + 1}.` };
      },
      setSteps: ({ steps }) => {
        const next = aiToSteps(steps);
        if (!next.length) return { ok: false, message: 'No steps provided.' };
        aiPatch({ steps: next });
        return { ok: true, message: `Set ${next.length} steps.` };
      },
      setDifferentiation: ({ support, extension }) => {
        const d = { ...(aiStruct.differentiation || { support: '', extension: '' }) };
        if (support != null) d.support = String(support);
        if (extension != null) d.extension = String(extension);
        aiPatch({ differentiation: d });
        return { ok: true, message: 'Updated differentiation.' };
      },
    },
  }, [template]);

  return (
    <div style={{ fontFamily: T.font, color: T.ink }}>
      <button onClick={onClose} style={{ ...btn('ghost', T.muted), marginBottom: 14 }}>← Back to templates</button>

      <div style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
        <input
          value={template.structure.title}
          onChange={e => onChange({ ...template, structure: { ...template.structure, title: e.target.value } })}
          style={{
            background: 'transparent', border: 'none', color: T.ink,
            fontSize: 20, fontWeight: 900, width: '100%', fontFamily: 'inherit', marginBottom: 10,
          }}
          aria-label="Template title"
        />
        <textarea
          value={template.structure.objective}
          onChange={e => onChange({ ...template, structure: { ...template.structure, objective: e.target.value } })}
          rows={2}
          style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted,
            padding: '8px 10px', fontSize: 13, width: '100%', fontFamily: 'inherit', resize: 'vertical',
          }}
          aria-label="Learning objective"
        />

        {/* Standards, with the PISA overlay called out as the overlay it is */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
          {template.structure.standardsAlignment.map(ref => {
            const d = describeStandard(ref);
            return (
              <span
                key={ref.code}
                title={d.detail ?? `${d.framework} ${d.display}`}
                style={badge(ref.framework === 'PISA' ? T.lilac : T.cyan)}
              >
                {d.framework} · {d.display}
              </span>
            );
          })}
          {template.structure.standardsAlignment
            .filter(r => r.framework === 'CCSS')
            .map(r => suggestPisaOverlay(r.code))
            .filter((s): s is NonNullable<typeof s> => !!s)
            .filter(s => !template.structure.standardsAlignment.some(a => a.code === s.code))
            .slice(0, 1)
            .map(s => (
              <button
                key={s.code}
                onClick={() => onChange({
                  ...template,
                  structure: { ...template.structure, standardsAlignment: [...template.structure.standardsAlignment, s] },
                })}
                style={{ ...chip(false, T.lilac), fontSize: 11 }}
              >
                + Add {describeStandard(s).display}
              </button>
            ))}
        </div>
      </div>

      {/* ── The lesson itself: steps, differentiation, rubric ────────────────── */}
      <LessonBodyEditor
        structure={template.structure}
        onChange={structure => onChange({ ...template, structure })}
      />

      {/* ── Materials + the licence gate ─────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <BookOpen size={16} color={T.orange} />
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>Materials</h3>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: T.faint, lineHeight: 1.6 }}>
          Every item carries its licence. Public-domain and CC BY material can power a paid
          course; CC BY-NC material — CK-12, EngageNY — is free tier or an outbound link only.
        </p>

        {/* The commercial switch: the gate evaluates the instant it's flipped. */}
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
          background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: '12px 14px', marginBottom: 16,
        }}>
          <input
            type="checkbox"
            checked={wantCommercial}
            onChange={e => setWantCommercial(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong style={{ fontSize: 13 }}>Package this as a paid course</strong>
            <span style={{ display: 'block', fontSize: 12, color: T.faint, marginTop: 3, lineHeight: 1.55 }}>
              Moves this template to your Independent persona. The licence filter applies
              automatically at the wall.
            </span>
          </span>
        </label>

        {wantCommercial && !gate.allowed && (
          <div style={{
            background: `${T.warning}14`, border: `1px solid ${T.warning}40`, borderRadius: 10,
            padding: '12px 14px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, color: T.warning, fontSize: 12.5, fontWeight: 800 }}>
              <AlertTriangle size={13} /> {gate.blocking.length} material{gate.blocking.length === 1 ? '' : 's'} can't be sold
            </div>
            {gate.blocking.map(b => (
              <div key={b.itemId} style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
                <strong style={{ color: T.ink }}>{b.title}</strong> — {b.reason}
              </div>
            ))}
            <p style={{ fontSize: 11.5, color: T.faint, margin: '8px 0 0', lineHeight: 1.6 }}>
              Remove them, or keep this template on the free tier and link out to them instead.
            </p>
          </div>
        )}

        {wantCommercial && gate.allowed && gate.shareAlikeRequired && (
          <p style={{ fontSize: 12, color: T.cyan, lineHeight: 1.6, margin: '0 0 16px' }}>
            <Scale size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
            Share-alike applies: because a material is CC BY-SA, anything you derive from this
            template has to carry CC BY-SA too.
          </p>
        )}

        {candidates.map(item => {
          const selected = template.structure.materials.includes(item.id);
          const blockedHere = wantCommercial && !item.commercialOk;
          return (
            <div key={item.id} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '10px 0', borderTop: `1px solid ${T.border}`,
              opacity: blockedHere && !selected ? 0.5 : 1,
            }}>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleMaterial(item)}
                style={{ marginTop: 3 }}
                aria-label={`Attach ${item.title}`}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>{item.title}</strong>
                  <span style={badge(licenseColor(item.commercialOk))} title={LICENSE_NOTE[item.license]}>
                    {LICENSE_LABEL[item.license]}
                  </span>
                  {item.linkOutOnly && <span style={badge(T.faint)}>Link out only</span>}
                  {item.readerBookId && hostedBooks.has(item.readerBookId) && (
                    <span style={badge(T.success)}>Reads in Plajah</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>
                  {item.source} · {item.gradeBands.join(', ')}
                </div>
                {blockedHere && (
                  <div style={{ fontSize: 11.5, color: T.warning, marginTop: 4 }}>
                    Free tier only — {LICENSE_NOTE[item.license]}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {item.readerBookId && hostedBooks.has(item.readerBookId) && (
                  // Preview what students will actually open, rather than the publisher's site.
                  <a
                    href={bookLink(item.readerBookId)}
                    style={{ color: T.orange }}
                    aria-label={`Read ${item.title} in Plajah`}
                    title="Read in Plajah — free for every account"
                  >
                    <BookOpen size={14} />
                  </a>
                )}
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: T.muted }}
                  aria-label={`Open ${item.title} at source`}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          );
        })}

        {gate.attributions.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <Eyebrow>Attribution — rendered wherever this template appears</Eyebrow>
            {gate.attributions.map(a => (
              <p key={a} style={{ fontSize: 11.5, color: T.faint, margin: '0 0 5px', lineHeight: 1.6 }}>{a}</p>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy !== null} style={{ ...btn('solid', T.orange), opacity: busy ? 0.6 : 1 }}>
          {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save template
        </button>
        {wantCommercial && (
          <button
            onClick={validate}
            disabled={busy !== null || !gate.allowed}
            title={gate.allowed ? undefined : 'Remove the non-commercial materials first.'}
            style={{ ...btn('outline', T.success), opacity: busy || !gate.allowed ? 0.5 : 1 }}
          >
            {busy === 'validate' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Verify for paid use
          </button>
        )}
        {template.licenseValidated && (
          <span style={badge(T.success)}><Check size={11} /> Verified for paid use</span>
        )}
      </div>

      {status && (
        <p role="status" style={{ marginTop: 12, fontSize: 12.5, color: statusColor, lineHeight: 1.6 }}>
          {status.text}
        </p>
      )}

      {/* ── The other branch: assign it, free, to your own class ─────────────── */}
      {classroom && (
        <div style={{ marginTop: 20 }}>
          <AssignTemplatePanel
            template={template}
            classId={classroom.classId}
            className={classroom.className}
            students={classroom.students}
            teacher={classroom.teacher}
            simulate={classroom.simulate}
          />
        </div>
      )}
    </div>
  );
};

export default AssignmentTemplateStudio;
