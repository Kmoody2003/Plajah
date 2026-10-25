/** Capstone studios not owned by another file. */
import type { Course } from './types';

export const THESIS_COURSES: Course[] = [
  {
    code: 'ILL 401', title: 'Illustration Thesis Studio', dept: 'ILL', level: 400, credits: 6, prereq: ['ILL 301', 'ILL 302'], format: 'studio',
    blurb: 'One sustained, self-directed project — a picture book, graphic narrative, editorial series or world-building bible — taken from pitch to finished, professionally presented work.',
    grading: [{ label: 'Proposal & development', pct: 20 }, { label: 'Finished body of work', pct: 45 }, { label: 'Thesis paper', pct: 15 }, { label: 'Defense & exhibition', pct: 20 }], rubric: 'portfolio',
    portfolio: 'A complete illustrated project (minimum 12 finished pieces or 32 pages), a pitch deck, and a process book.',
    units: [
      { id: 'u1', title: 'Pitch and Proposal', weeks: 3, critique: 'lerman',
        teach: 'A project is only real once it can be pitched in one page: audience, format, premise, why you, why now, and a schedule that survives contact with your actual life. Look at how published illustrators describe comparable books and series, and be honest about what is new in yours.',
        outcomes: ['Write a one-page pitch and a schedule', 'Identify comparable titles and an audience', 'Define the scope of finished pieces'],
        studio: { prompt: 'Write the pitch, produce 6 thumbnails, a character or style sheet, and a milestone calendar.', deliverable: 'Pitch deck + calendar', tool: 'PIXELS' },
        study: [{ query: 'picture book illustration original art', sources: ['smithsonian', 'met', 'europeana'], why: 'What does a finished page do that a sketch cannot?' }] },
      { id: 'u2', title: 'Development and Production', weeks: 8, critique: 'design',
        teach: 'Production is repetition with quality control: consistent characters, colour keys, trim and bleed, file naming, backups. Build a pipeline and keep a sketchbook of failed attempts; they are evidence of process for your defense.',
        outcomes: ['Keep consistency across a body of work', 'Prepare art for print or screen delivery', 'Maintain a process record'],
        studio: { prompt: 'Produce at least 70% of the finished pieces. Submit a mid-term review set and revise from the notes.', deliverable: 'Mid-review set + revision memo' } },
      { id: 'u3', title: 'Presentation, Rights and Defense', weeks: 4, critique: 'portfolio',
        teach: 'Know what rights you are licensing and to whom: copyright stays with you unless you sign it away, work-for-hire is different, and publishers want specific rights for specific terms. Present the project as a pitch to a publisher or gallery and defend decisions in the thesis paper.',
        outcomes: ['Explain licensing and work-for-hire in plain language', 'Present a complete project', 'Defend decisions with evidence'],
        studio: { prompt: 'Exhibit or publish the project, write a 2,500-word thesis paper, and defend it in 15 minutes.', deliverable: 'Final project + paper + defense' } },
    ],
  },
];
