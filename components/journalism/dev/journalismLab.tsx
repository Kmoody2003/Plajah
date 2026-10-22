// Dev lab for the School of Journalism — the landing, Student Newsroom and Press Room without
// booting the app. npx vite --config journalism-lab.vite.config.mjs → http://127.0.0.1:3145/journalism-lab.html
// ?child=1 renders as a child account, ?tab=… opens a tab, ?view=teacher shows a teacher's
// review of a turned-in story (sample data, nothing is written).
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './journalismLab.css';
import JournalismSchoolView from '../../JournalismSchoolView';
import NewsroomStoryReview from '../../academia/NewsroomStoryReview';
import { openJournalismSchool, type JournalismTab } from '../../../services/journalismSchool/newsroomStore';
import { kitById } from '../../../services/journalismSchool/storyKits';
import { newSource, newStory, toSnapshot } from '../../../services/journalismSchool/studentDesk';
import type { TemplateSubmission } from '../../../services/assignmentTemplateService';

const q = new URLSearchParams(location.search);
const child = q.get('child') === '1';
const profile = { uid: child ? 'lab-child' : 'lab-adult', displayName: child ? 'Ava (age 7)' : 'Sam Reporter', isChild: child, accountType: child ? 'CHILD' : undefined };

function sampleSubmission(): TemplateSubmission {
  const story = {
    ...newStory(kitById('kit-news-story')!, 'middle', { id: 'kid-1', name: 'Ava' }),
    headline: 'Robotics team takes second at regionals',
    lede: 'Our robotics team placed second of 14 schools at Saturday’s regional tournament.',
    body: 'Coach Lee said the robot’s arm broke in the semifinal. Call 555-123-4567 for team shirts.',
    sources: [{ ...newSource(), name: 'Maya Lopez', role: 'team captain', isMinor: true, consent: true }],
  };
  return {
    id: 'sub-lab', assignmentId: 'as-lab', templateId: 'tpl-lab', studentId: 'kid-1', studentName: 'Ava', classId: 'c', teacherUid: 't',
    stepsDone: [], reflection: '', selfScores: {}, submittedAt: Date.now(), status: 'submitted', grade: null, newsroom: toSnapshot(story), review: null,
  };
}

function Lab() {
  useEffect(() => { const t = q.get('tab') as JournalismTab | null; if (t) openJournalismSchool({ tab: t }); }, []);
  if (q.get('view') === 'teacher') {
    return (
      <div style={{ background: '#0a0a10', minHeight: '100vh', padding: 24, color: '#fff', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <NewsroomStoryReview submission={sampleSubmission()} teacher={{ uid: 't', name: 'Ms. Ana' }} onReturned={async () => console.log('[lab] returned')} />
        </div>
      </div>
    );
  }
  return <JournalismSchoolView onBack={() => console.log('[lab] back')} onNavigate={v => console.log('[lab] navigate', v)} user={{ uid: profile.uid }} profile={profile} />;
}

createRoot(document.getElementById('root')!).render(<Lab />);
