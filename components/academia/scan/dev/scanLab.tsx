// Worksheet scanner lab (no sign-in). ?view=teacher (Scan Worksheet) · ?view=student (assignment) ·
// ?view=scan (Scan school paper). window.scanLab.e2e() runs the full paper loop on synthetic photos:
// render a worksheet → teacher digitize (+auto key) → render a student's filled copy at a different
// framing → read it back → self-check. Results land on window.scanLab.last.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../../index.css';
import TeacherToolsView from '../../../TeacherToolsView';
import StudentAssignmentView from '../../../StudentAssignmentView';
import ScanAnythingView from '../ScanAnythingView';
import { normalizeWorksheetPage, readPageOnDevice } from '../../../../services/worksheetLocalVision';
import { digitizeWorksheetDetailed, readCompletedWorksheet, autoGradeWorksheet } from '../../../../services/worksheetDigitizer';
import { selfCheckWorksheet, classifyScan, parseFlyer, pickHeadline } from '../../../../services/worksheetScanCore';

const PROBLEMS = [['7 + 6', '13'], ['8 + 9', '17'], ['12 - 5', '7'], ['6 x 7', '42'], ['48 ÷ 6', '8'], ['15 + 27', '42']];

/** Draw a letter-size worksheet; `answers` writes student work into the blanks; `tf` jitters the photo. */
function drawSheet(answers: string[] | null, tf = { scale: 1, dx: 0, dy: 0, rot: 0 }): string {
  const W = 1275, H = 1650; // 150 dpi letter
  const page = document.createElement('canvas'); page.width = W; page.height = H;
  const g = page.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#111';
  g.font = 'bold 54px Arial'; g.fillText('Addition Practice', 120, 150);
  g.font = '30px Arial'; g.fillText('Name: ____________   Date: ________', 120, 230);
  g.fillText('Directions: Solve each problem. Show your work.', 120, 300);
  g.font = '40px Arial';
  PROBLEMS.forEach(([p], i) => {
    const y = 420 + i * 170;
    g.fillText(`${i + 1}.  ${p} = ________`, 140, y);
    if (answers?.[i]) { g.save(); g.fillStyle = '#1d3fbf'; g.font = 'italic 46px "Comic Sans MS", cursive'; g.fillText(answers[i], 140 + g.measureText(`${i + 1}.  ${p} = `).width + 40, y - 6); g.restore(); }
  });
  // "Photo": desk background, the page scaled/shifted/rotated onto it.
  const photo = document.createElement('canvas'); photo.width = 1400; photo.height = 1800;
  const p = photo.getContext('2d')!;
  p.fillStyle = '#6b5a48'; p.fillRect(0, 0, photo.width, photo.height);
  p.translate(photo.width / 2 + tf.dx, photo.height / 2 + tf.dy); p.rotate(tf.rot * Math.PI / 180); p.scale(tf.scale, tf.scale);
  p.drawImage(page, -W / 2, -H / 2);
  return photo.toDataURL('image/jpeg', .92);
}

async function e2e() {
  const t0 = performance.now();
  const blank = drawSheet(null, { scale: 1, dx: 0, dy: 0, rot: 0 });
  const page = await normalizeWorksheetPage(blank);
  const t1 = performance.now();
  const dig = await digitizeWorksheetDetailed(page.dataUrl.split(',')[1], 'image/jpeg', 'lab-teacher');
  const t2 = performance.now();
  const sheet = dig.sheet!;
  const student = drawSheet(['13', '16', '7', '42', '8', '42'], { scale: .86, dx: 40, dy: -30, rot: 2.5 });
  const read = await readCompletedWorksheet(student.split(',')[1], 'image/jpeg', sheet, { handwriting: 'skip' });
  const t3 = performance.now();
  const check = selfCheckWorksheet(sheet, read.answers, read.confidence);
  const grade = autoGradeWorksheet(sheet, read.answers);
  const flyerPage = await readPageOnDevice(drawFlyer());
  const t4 = performance.now();
  const last = {
    timingsMs: { normalize: Math.round(t1 - t0), digitize: Math.round(t2 - t1), studentRead: Math.round(t3 - t2), flyerRead: Math.round(t4 - t3) },
    fields: sheet.fields.map(f => ({ id: f.id, label: f.label, key: f.correctAnswer, keySource: f.keySource, read: read.answers[f.id], conf: read.confidence[f.id] && +read.confidence[f.id].toFixed(2), check: check.perField[f.id]?.status })),
    registration: read.registration, grade: { score: grade.score, max: grade.maxScore }, checkSummary: check.summary,
    flyer: { kind: classifyScan(flyerPage.text).kind, parsed: parseFlyer(flyerPage.text, new Date(), pickHeadline(flyerPage.local.lines)).events.map(e => ({ title: e.title, start: new Date(e.start).toString(), allDay: e.allDay, kind: e.kind, location: e.location })) },
    worksheetKind: classifyScan(dig.sheet!.segments?.map(s => s.text).join('\n') || '').kind,
  };
  (window as any).scanLab.last = last;
  return last;
}

function drawFlyer(): string {
  const c = document.createElement('canvas'); c.width = 1275; c.height = 1650;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff8e8'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#222';
  g.font = 'bold 44px Arial'; g.fillText('Maple Elementary PTA', 140, 180);
  g.font = 'bold 90px Arial'; g.fillText('FALL FESTIVAL', 140, 340);
  g.font = '48px Arial';
  ['Friday, November 6th', '6:00 - 8:00 PM', 'Location: School Gym', 'Bring a canned food item', 'Permission slips due Oct 30', 'Questions? pta@maple.org'].forEach((l, i) => g.fillText(l, 140, 520 + i * 110));
  return c.toDataURL('image/jpeg', .92);
}

(window as any).scanLab = { e2e, drawSheet, drawFlyer, last: null };

const view = new URLSearchParams(location.search).get('view') || 'teacher';
const labUser = { uid: '', displayName: 'Lab' };
createRoot(document.getElementById('root')!).render(
  view === 'student' ? <StudentAssignmentView user={labUser} />
  : view === 'scan' ? <ScanAnythingView user={labUser} profile={{ accountType: 'STUDENT' }} />
  : <TeacherToolsView user={labUser} />,
);
