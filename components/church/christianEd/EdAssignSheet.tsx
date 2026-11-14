import React, { useMemo, useState } from 'react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import { assignUnitToClassroomDesk, type DeskAssignmentToolsConfig } from '../../../services/universalStudentDeskService';
import { announceWorkChanged, fmtDay, isWritten, nextWeekday, scheduleWeekday } from './edWork';

const TOOLS: Array<[keyof DeskAssignmentToolsConfig, string]> = [
  ['allowSelfCheckBeforeTurnIn', 'Check my work'],
  ['allowHandRaiseQuestion', 'Ask the teacher'],
  ['allowScratchpadNotes', 'Scratchpad'],
  ['allowSacredLibraryAndReferences', 'Sacred Library'],
];

/** Assign one lesson/worksheet to this class's desks: who (the class), when, and which desk tools. */
const EdAssignSheet: React.FC<{
  orgId: string;
  orgName: string;
  program: ChurchProgram;
  unit: IngestedCurriculumUnit;
  teacher: { uid: string; name: string };
  onClose: () => void;
  onAssigned?: () => void;
}> = ({ orgId, orgName, program, unit, teacher, onClose, onAssigned }) => {
  const day = scheduleWeekday(program.meetingSchedule);
  const options = useMemo(() => {
    const first = day >= 0 ? nextWeekday(day) : new Date(Date.now() + 2 * 86400_000);
    const second = new Date(first.getTime() + 7 * 86400_000);
    return [
      { id: 'next', label: day >= 0 ? `Next class · ${fmtDay(first)}` : `In 2 days · ${fmtDay(first)}`, at: first },
      { id: 'after', label: `A week later · ${fmtDay(second)}`, at: second },
    ];
  }, [day]);
  const [due, setDue] = useState<string>('next');
  const [pick, setPick] = useState('');
  const [tools, setTools] = useState<Record<keyof DeskAssignmentToolsConfig, boolean>>({
    allowSelfCheckBeforeTurnIn: true,
    allowHandRaiseQuestion: true,
    allowScratchpadNotes: false,
    allowSacredLibraryAndReferences: true,
  });
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const withAccounts = (program.students || []).filter(s => s.uid).length;
  const written = unit.questions.filter(isWritten).length;

  const send = () => {
    const at = due === 'pick' && pick ? new Date(`${pick}T09:00`) : options.find(o => o.id === due)!.at;
    assignUnitToClassroomDesk({
      unit,
      domain: 'CHRISTIAN_EDUCATION',
      orgId,
      orgName,
      classroomId: program.id,
      classroomName: program.name,
      dueAt: at.getTime(),
      dueLabel: `Due ${fmtDay(at)}`,
      instructions: note,
      assignedByUid: teacher.uid,
      assignedByName: teacher.name,
      toolsConfig: tools,
    });
    setDone(true);
    announceWorkChanged();
    onAssigned?.();
  };

  if (done) {
    return (
      <div className="sheet" role="dialog" aria-label="Assigned">
        <h3>Sent to {withAccounts} desk{withAccounts === 1 ? '' : 's'}</h3>
        <p className="dim" style={{ fontSize: '.86rem' }}>
          “{unit.title}” is on the Work channel. You’ll see turn-ins there and in Today.
        </p>
        <button type="button" className="btn p" style={{ justifySelf: 'start' }} onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="sheet" role="dialog" aria-label={`Assign ${unit.title}`}>
      <div className="row">
        <h3 className="grow">Assign: {unit.title}</h3>
        <button type="button" className="btn sm" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="small">
        {unit.questions.length} questions · {unit.questions.length - written} auto-graded
        {written > 0 ? ` · ${written} you’ll review` : ''}
      </div>

      <div className="stack">
        <div className="small">Who</div>
        <div className="chips">
          <button type="button" className="chip" aria-pressed="true">
            {program.name} · {withAccounts} with accounts
          </button>
        </div>
        {withAccounts === 0 && (
          <div className="err">Nobody in this class has a Plajah account yet. Add students in People first, or print it for paper work.</div>
        )}
      </div>

      <div className="stack">
        <div className="small">Due</div>
        <div className="chips">
          {options.map(o => (
            <button key={o.id} type="button" className="chip" aria-pressed={due === o.id} onClick={() => setDue(o.id)}>
              {o.label}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={due === 'pick'} onClick={() => setDue('pick')}>
            Pick a date
          </button>
        </div>
        {due === 'pick' && (
          <input id="ed-assign-date" type="date" className="field" style={{ maxWidth: 220 }} value={pick} onChange={e => setPick(e.target.value)} />
        )}
      </div>

      <div className="stack">
        <div className="small">Desk tools</div>
        <div className="chips">
          {TOOLS.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={tools[k]} onClick={() => setTools(t => ({ ...t, [k]: !t[k] }))}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="lbl">
        Note to students (optional)
        <textarea id="ed-assign-note" className="field" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Read Luke 15 first, then answer each question." />
      </label>

      <button type="button" className="btn p" style={{ justifySelf: 'start' }} onClick={send} disabled={due === 'pick' && !pick}>
        Send to {withAccounts} desk{withAccounts === 1 ? '' : 's'}
      </button>
    </div>
  );
};

export default EdAssignSheet;
