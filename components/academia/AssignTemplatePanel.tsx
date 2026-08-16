// AssignTemplatePanel — hand a template to a class. The free, District-persona branch.
//
// Nothing here is licence-gated, deliberately: giving CK-12 material to your own students is
// precisely the non-commercial use CC BY-NC grants. The wall only stands between a template and
// a PAID offering, so an assign flow that nagged about licences would be teaching teachers the
// wrong rule.

import React, { useState } from 'react';
import { Send, Check, Loader2, Users, CalendarDays, Target } from 'lucide-react';
import { assignTemplate, type AssignResult, type AssignStudent } from '../../services/assignmentTemplateService';
import { ledgerFrameworkFor } from '../../data/oerLibrary';
import type { AssignmentTemplate } from '../../data/assignmentTemplates';
import { T, cardStyle, btn, badge } from './integrityTheme';

const field: React.CSSProperties = {
  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.ink,
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
};

const AssignTemplatePanel: React.FC<{
  template: AssignmentTemplate;
  classId: string;
  className: string;
  students: AssignStudent[];
  teacher: { uid: string; name: string; photo?: string };
  /** The bundled demo class has placeholder uids — notify nothing, but report honest counts. */
  simulate?: boolean;
}> = ({ template, classId, className, students, teacher, simulate }) => {
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssignResult | null>(null);

  const trackable = template.structure.standardsAlignment.filter(r => ledgerFrameworkFor(r) !== null);
  const overlayOnly = template.structure.standardsAlignment.length - trackable.length;

  const send = async () => {
    setBusy(true);
    const out = await assignTemplate({
      template, classId, className, students, teacher, simulate,
      ...(due ? { dueDate: new Date(`${due}T23:59:59`).getTime() } : {}),
    });
    setBusy(false);
    setResult(out);
  };

  if (result?.ok) {
    return (
      <section style={{ ...cardStyle, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <Check size={16} color={T.success} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Assigned to {className}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={badge(T.cyan)}><Users size={11} /> {result.studentsNotified} students</span>
          <span style={badge(T.lilac)}><Target size={11} /> {result.standardsTracked} standards tracked</span>
          {result.simulated && <span style={badge(T.warning)}>Demo — no notifications sent</span>}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: T.faint, lineHeight: 1.6 }}>
          {result.simulated
            ? 'This is the bundled demo class, so the assignment record was written but no student was messaged.'
            : 'Students have been notified, and guardians see it in their feed.'}
        </p>
      </section>
    );
  }

  return (
    <section style={{ ...cardStyle, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Send size={15} color={T.orange} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Assign to {className}</h3>
      </div>
      <p style={{ margin: '5px 0 16px', fontSize: 12, color: T.faint, lineHeight: 1.6 }}>
        Always free, and never licence-gated — handing material to your own class is exactly what
        the non-commercial licences allow.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={badge(T.cyan)}><Users size={11} /> {students.length} students</span>
        <span style={badge(T.lilac)}>
          <Target size={11} /> {trackable.length} to the ledger
          {overlayOnly > 0 ? ` · ${overlayOnly} PISA overlay` : ''}
        </span>
      </div>

      {overlayOnly > 0 && (
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: T.faint, lineHeight: 1.6 }}>
          PISA levels describe how demanding the task is, not something a learner holds mastery
          in — so they label the assignment but never become ledger records.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11.5, color: T.muted, display: 'grid', gap: 5 }}>
          <span><CalendarDays size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Due (optional)</span>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} style={field} />
        </label>
        <button onClick={send} disabled={busy || students.length === 0}
          style={{ ...btn('solid', T.orange), opacity: busy || !students.length ? 0.5 : 1 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Assign
        </button>
      </div>

      {result && !result.ok && (
        <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: T.danger }}>
          Couldn't create the assignment. Check your connection and try again.
        </p>
      )}
    </section>
  );
};

export default AssignTemplatePanel;
