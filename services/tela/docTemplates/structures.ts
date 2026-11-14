// docTemplates/structures — the STRUCTURE half of a template: page setup and the pages themselves,
// written as prompts a person replaces with their own words. No design here; a structure is
// dressed by a theme (themes.ts) to make a library template (library.ts).
import type { ParaAttrs } from '../../text/model';
import type { DocStructure } from './types';

const IN = 96;
/** A right-aligned tab at the end of a `width`-inch measure, with a leader ("Hymn ····· Choir"). */
const rightTab = (width: number, leader?: string): ParaAttrs => ({ tabs: [{ position: width * IN - 1, align: 'right', leader }], indentFirst: 0, align: 'start' });
/** A block of a letter (address, greeting, sign-off): flush left with air above, whatever the theme does to body text. */
const block: ParaAttrs = { indentFirst: 0, align: 'start', spaceBefore: 11 };
const nextColumn: ParaAttrs = { startOn: 'next-column' };
const T = '\t';

export const DOC_STRUCTURES: DocStructure[] = [
  // ── Letters & minutes ───────────────────────────────────────────────────────────────────
  {
    id: 'letter', name: 'Letter on letterhead', family: 'formal', blurb: 'Letterhead, date, greeting, three paragraphs and a signature block.',
    pages: [{ label: 'Letter', margins: { top: 1, left: 1.1, right: 1.1, bottom: 1 }, body: [
      ['kicker', 'Organization name'],
      ['meta', '1234 Street Address · Detroit, MI 48201 · (313) 555-0100 · hello@yourorg.org'],
      ['meta', 'Month 0, 2026'],
      ['body', 'Recipient Name Title, Organization Street Address City, State ZIP', block],
      ['body', 'Dear Recipient Name,', block],
      ['body', 'Open with why you are writing. One or two sentences is enough: the reader should know the purpose of this letter before the end of the first paragraph.', { indentFirst: 0, spaceBefore: 11 }],
      ['body', 'Use the middle of the letter for what the reader needs to know. Give the facts, the dates and the amounts plainly, and keep each paragraph to one idea.'],
      ['body', 'Close with what happens next: what you are asking for, by when, and how to reach you.'],
      ['body', 'Sincerely,', { ...block, spaceAfter: 22 }],
      ['byline', 'Your Name'],
      ['meta', 'Your title · Organization name'],
    ] }],
  },
  {
    id: 'memo', name: 'Memo', family: 'formal', blurb: 'To / From / Date / Re block, then summary, background and next steps.',
    pages: [{ label: 'Memo', body: [
      ['kicker', 'Memorandum'],
      ['title', 'Subject of this memo'],
      ['meta', `To${T}Names or team`, { tabs: [{ position: 0.9 * IN }] }],
      ['meta', `From${T}Your name, title`, { tabs: [{ position: 0.9 * IN }] }],
      ['meta', `Date${T}Month 0, 2026`, { tabs: [{ position: 0.9 * IN }] }],
      ['h2', 'Summary'],
      ['lead', 'State the decision or the request in two or three sentences. Someone who reads only this paragraph should know what you need from them.'],
      ['h2', 'Background'],
      ['body', 'Give the context the reader needs to agree with you: what changed, what it costs, what was tried before.'],
      ['h2', 'Next steps'],
      ['list', 'First action, who owns it, and the date'],
      ['list', 'Second action, who owns it, and the date'],
      ['list', 'When we will look at this again'],
    ] }],
  },
  {
    id: 'minutes', name: 'Meeting minutes', family: 'formal', blurb: 'Call to order, attendance, reports, motions with votes, action items.',
    pages: [{ label: 'Minutes', body: [
      ['kicker', 'Board of Directors'],
      ['title', 'Minutes of the regular meeting'],
      ['meta', 'Month 0, 2026 · 6:30 PM · Fellowship Hall'],
      ['h2', 'Call to order'],
      ['body', 'The meeting was called to order at 6:32 PM by the chair, Name. A quorum was present.'],
      ['h2', 'Attendance'],
      ['body', 'Present: Name, Name, Name, Name. Absent: Name. Guests: Name.'],
      ['h2', 'Approval of minutes'],
      ['body', 'Motion to approve the minutes of the previous meeting as distributed. Moved by Name, seconded by Name. Carried, 6–0.'],
      ['h2', 'Reports'],
      ['h3', 'Treasurer'],
      ['body', 'Summarise the balance, income and expenses since the last meeting, and anything the board must decide.'],
      ['h3', 'Committees'],
      ['body', 'One short paragraph per committee that reported.'],
      ['h2', 'New business'],
      ['body', 'Record each motion in full, who moved and seconded it, and the vote.'],
      ['h2', 'Action items'],
      ['list', 'What will be done — Name, by date'],
      ['list', 'What will be done — Name, by date'],
      ['h2', 'Adjournment'],
      ['body', 'The meeting adjourned at 8:05 PM. The next meeting is Month 0 at 6:30 PM.'],
      ['meta', 'Respectfully submitted, Name, Secretary'],
    ] }],
  },
  {
    id: 'report', name: 'Report', family: 'formal', blurb: 'Cover page, then summary, findings and recommendations.',
    pages: [
      { label: 'Cover', margins: { top: 2.6, left: 1.25, right: 1.25 }, body: [
        ['kicker', 'Organization name'],
        ['title', 'Title of the report'],
        ['subtitle', 'A one-line description of what this report covers'],
        ['meta', 'Prepared by Your Name · Month 2026'],
      ] },
      { label: 'Report', body: [
        ['h1', 'Summary'],
        ['lead', 'Start with the answer. In one paragraph, say what you looked at, what you found and what you recommend.'],
        ['h1', 'What we found'],
        ['h2', 'First finding'],
        ['body', 'Explain the finding and the evidence for it. Name your sources, and give numbers with their dates.'],
        ['pull', 'Lift the one sentence a busy reader must not miss.'],
        ['h2', 'Second finding'],
        ['body', 'Keep each finding to its own section so a reader can go straight to the part they need.'],
        ['h1', 'Recommendations'],
        ['list-number', 'The first thing to do, and who should do it'],
        ['list-number', 'The second thing to do, and what it will cost'],
        ['list-number', 'How we will know it worked'],
      ] },
    ],
  },

  // ── Worship ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'sermon', name: 'Sermon manuscript', family: 'worship', blurb: 'Title, text, big idea and movements, set large enough to preach from.',
    pages: [{ label: 'Sermon', margins: { left: 1.2, right: 1.2 }, body: [
      ['kicker', 'Series name · Week 0'],
      ['title', 'Sermon title'],
      ['subtitle', 'Book 0:0–00'],
      ['meta', 'Preached at Church Name · Month 0, 2026'],
      ['quote', 'Set the Scripture reading here, as you will read it aloud.'],
      ['h2', 'The big idea'],
      ['lead', 'Say the one thing this sermon says, in a sentence you could repeat at the door.'],
      ['h2', 'First movement'],
      ['body', 'Write as you speak. Short sentences. Leave a line where you will breathe.'],
      ['h2', 'Second movement'],
      ['body', 'Bring the text to the people in the room: a story, a name, a street they know.'],
      ['pull', 'The line you want them to carry home.'],
      ['h2', 'Invitation'],
      ['body', 'Close with what you are asking the congregation to do, and pray.'],
    ] }],
  },
  {
    id: 'order-of-service', name: 'Order of service', family: 'worship', blurb: 'The whole service down one page, with dotted leaders to who leads each part.',
    pages: [{ label: 'Order of service', margins: { left: 1.25, right: 1.25 }, body: [
      ['kicker', 'Church Name'],
      ['title', 'Order of Worship'],
      ['subtitle', 'Sunday, Month 0, 2026 · 11:00 AM'],
      ['h2', 'We gather'],
      ['body', `Prelude${T}Musician`, rightTab(6, '.')],
      ['body', `Call to worship${T}Worship leader`, rightTab(6, '.')],
      ['body', `Hymn of praise${T}Congregation`, rightTab(6, '.')],
      ['body', `Invocation${T}Deacon`, rightTab(6, '.')],
      ['h2', 'We hear the Word'],
      ['body', `Scripture reading${T}Reader`, rightTab(6, '.')],
      ['body', `Selection${T}Choir`, rightTab(6, '.')],
      ['body', `Sermon${T}Pastor`, rightTab(6, '.')],
      ['h2', 'We respond'],
      ['body', `Invitation to discipleship${T}Pastor`, rightTab(6, '.')],
      ['body', `Tithes and offerings${T}Ushers`, rightTab(6, '.')],
      ['body', `Announcements${T}Clerk`, rightTab(6, '.')],
      ['h2', 'We are sent'],
      ['body', `Benediction${T}Pastor`, rightTab(6, '.')],
      ['caption', 'Please stand as you are able where the service calls for it.'],
    ] }],
  },
  {
    id: 'bulletin', name: 'Sunday bulletin', family: 'worship', blurb: 'Two columns: welcome, this week, prayer list and giving.',
    pages: [{ label: 'Bulletin', margins: { top: 0.9, left: 0.8, right: 0.8, bottom: 0.9 }, columns: 2, gutter: 0.4, body: [
      ['kicker', 'Church Name'],
      ['title', 'This Sunday'],
      ['meta', 'Month 0, 2026'],
      ['h2', 'Welcome'],
      ['lead', 'A short word from the pastor to everyone here, and especially to anyone visiting for the first time.'],
      ['h2', 'This week'],
      ['list', 'Tuesday 6:30 PM — Bible study, Fellowship Hall'],
      ['list', 'Wednesday 12 PM — Noon prayer'],
      ['list', 'Saturday 9 AM — Food pantry, volunteers welcome'],
      ['h2', 'Coming up', nextColumn],
      ['body', 'Tell people about the next event in two sentences: what it is, when, and how to sign up.'],
      ['h2', 'Prayer list'],
      ['body', 'Names of those we are holding in prayer this week.'],
      ['h2', 'Giving'],
      ['body', 'How to give: in the plate, by mail, or online at yourchurch.org/give.'],
      ['pull', 'A verse for the week.'],
      ['caption', 'Book 0:00'],
    ] }],
  },
  {
    id: 'devotional', name: 'Devotional', family: 'worship', blurb: 'Scripture, reflection, prayer and a question to carry through the day.',
    pages: [{ label: 'Devotional', margins: { left: 1.5, right: 1.5, top: 1.2 }, body: [
      ['kicker', 'Day 0'],
      ['title', 'Title for today'],
      ['quote', 'Set today’s verse here.'],
      ['caption', 'Book 0:00'],
      ['lead', 'Begin the reflection with something seen or heard this week, and let it open onto the verse.'],
      ['body', 'Stay with one idea. Three short paragraphs is plenty for a morning.'],
      ['h3', 'Prayer'],
      ['body', 'A prayer of three or four lines, in plain words.'],
      ['h3', 'Carry this'],
      ['body', 'One question to take into the day.'],
    ] }],
  },

  // ── Newsletters & reports ───────────────────────────────────────────────────────────────
  {
    id: 'newsletter', name: 'Newsletter', family: 'editorial', blurb: 'Masthead, a lead story and short items in two columns.',
    pages: [{ label: 'Newsletter', margins: { top: 0.9, left: 0.8, right: 0.8, bottom: 0.9 }, columns: 2, gutter: 0.38, body: [
      ['kicker', 'Vol. 0 · No. 0 · Month 2026'],
      ['title', 'The Courier'],
      ['subtitle', 'News from Organization Name'],
      ['h1', 'Headline of the lead story'],
      ['byline', 'By Your Name'],
      ['lead', 'Open with what happened and why it matters to the people reading. The first paragraph carries the story.'],
      ['body', 'Follow with the details: who was there, what was said, what it cost, what comes next. Quote someone by name.'],
      ['pull', '“A quote from someone in the story, in their own words.”'],
      ['body', 'End with how a reader can take part.'],
      ['h2', 'In brief', nextColumn],
      ['h3', 'First short item'],
      ['body', 'Two or three sentences.'],
      ['h3', 'Second short item'],
      ['body', 'Two or three sentences.'],
      ['h2', 'Dates to keep'],
      ['list', 'Month 0 — Event name'],
      ['list', 'Month 0 — Event name'],
      ['caption', 'Organization Name · address · yourorg.org'],
    ] }],
  },
  {
    id: 'article', name: 'Feature article', family: 'editorial', blurb: 'Kicker, headline, deck and byline, a drop-cap opening and a pull quote.',
    pages: [{ label: 'Article', margins: { left: 1.35, right: 1.35 }, body: [
      ['kicker', 'Section'],
      ['title', 'A headline that tells the story'],
      ['subtitle', 'A deck: one sentence that says why this is worth the reader’s time'],
      ['byline', 'By Your Name · Month 0, 2026'],
      ['lead', 'Open on a scene, a person or a fact that puts the reader inside the story before they know it has started.'],
      ['body', 'Then step back and say what the story is about. Give the reader the map before the journey.'],
      ['h2', 'A subhead every few paragraphs'],
      ['body', 'Subheads let a skimming reader find their way back in. Keep paragraphs short; one idea each.'],
      ['pull', 'Pull out the sentence that would make someone stop turning pages.'],
      ['body', 'Close by returning to where you began, changed by what the reader now knows.'],
      ['caption', 'Your Name writes about a subject for Publication.'],
    ] }],
  },
  {
    id: 'impact-report', name: 'Impact report', family: 'editorial', blurb: 'Cover, a letter from the director, the year in numbers and stories.',
    pages: [
      { label: 'Cover', margins: { top: 3, left: 1.2, right: 1.2 }, body: [
        ['kicker', 'Annual impact report'],
        ['title', 'Organization Name 2026'],
        ['subtitle', 'What your support made possible this year'],
      ] },
      { label: 'The year', body: [
        ['h1', 'A letter from our director'],
        ['lead', 'Thank the people who made the year happen, and tell them one thing that would not exist without them.'],
        ['body', 'Name what was hard, too. Funders trust an organisation that tells the truth about its year.'],
        ['byline', 'Name, Executive Director'],
        ['h1', 'The year in numbers'],
        ['list', '0,000 meals served'],
        ['list', '000 families housed'],
        ['list', '00 volunteers, 0,000 hours'],
        ['h1', 'One story'],
        ['body', 'Tell the story of one person, with their permission, in their words where you can.'],
        ['pull', '“What they said about it.”'],
        ['h1', 'Where the money went'],
        ['body', `Programs${T}00%`, rightTab(6.5, '.')],
        ['body', `Operations${T}00%`, rightTab(6.5, '.')],
        ['body', `Fundraising${T}00%`, rightTab(6.5, '.')],
      ] },
    ],
  },

  // ── Study & grants ──────────────────────────────────────────────────────────────────────
  {
    id: 'essay', name: 'Essay', family: 'scholarly', blurb: 'Heading block, title, thesis-first paragraphs and works cited.',
    pages: [{ label: 'Essay', body: [
      ['meta', 'Your Name Instructor Name Course Month 0, 2026'],
      ['title', 'Essay title'],
      ['body', 'Begin with the question your essay answers, and end the first paragraph with your thesis: the claim you will prove.'],
      ['body', 'Give each body paragraph one point. Open with the point, bring the evidence, then say how the evidence proves it.'],
      ['quote', 'Set a long quotation off like this, and say where it comes from.'],
      ['body', 'Answer the strongest objection to your claim before you conclude.'],
      ['body', 'In the conclusion, do more than repeat the thesis: say what follows from it.'],
      ['h2', 'Works cited'],
      ['body', 'Author Last, First. Title of Work. Publisher, Year.', { indentStart: 0.5 * IN, indentFirst: -0.5 * IN }],
      ['body', 'Author Last, First. “Title of Article.” Journal, vol. 0, no. 0, Year, pp. 00–00.', { indentStart: 0.5 * IN, indentFirst: -0.5 * IN }],
    ] }],
  },
  {
    id: 'lesson-plan', name: 'Lesson plan', family: 'scholarly', blurb: 'Objectives, materials, a timed sequence and how you will check understanding.',
    pages: [{ label: 'Lesson plan', body: [
      ['kicker', 'Subject · Grade 0 · 00 minutes'],
      ['title', 'Lesson title'],
      ['meta', 'Teacher Name · Unit 0, Lesson 0 · Standard code'],
      ['h2', 'Students will be able to'],
      ['list', 'First objective, written as something you can see a student do'],
      ['list', 'Second objective'],
      ['h2', 'Materials'],
      ['body', 'What you need in the room, and what students need at their desks.'],
      ['h2', 'Sequence'],
      ['body', `Warm-up${T}5 min`, rightTab(6.5, '.')],
      ['body', `Mini-lesson${T}10 min`, rightTab(6.5, '.')],
      ['body', `Guided practice${T}15 min`, rightTab(6.5, '.')],
      ['body', `Independent work${T}15 min`, rightTab(6.5, '.')],
      ['body', `Exit ticket${T}5 min`, rightTab(6.5, '.')],
      ['h2', 'Checking for understanding'],
      ['body', 'The question you will ask, and what a strong answer sounds like.'],
      ['h2', 'Supports and extensions'],
      ['body', 'How you will support students who need more time, and stretch those who are ready.'],
    ] }],
  },
  {
    id: 'study-guide', name: 'Study guide', family: 'scholarly', blurb: 'Key ideas, terms, worked example and practice questions.',
    pages: [{ label: 'Study guide', body: [
      ['kicker', 'Course · Unit 0'],
      ['title', 'Study guide: topic'],
      ['h2', 'The big ideas'],
      ['list-number', 'First idea in one sentence'],
      ['list-number', 'Second idea in one sentence'],
      ['list-number', 'Third idea in one sentence'],
      ['h2', 'Words to know'],
      ['body', `Term${T}What it means, in your own words`, { tabs: [{ position: 1.6 * IN }], indentStart: 1.6 * IN, indentFirst: -1.6 * IN }],
      ['body', `Term${T}What it means, in your own words`, { tabs: [{ position: 1.6 * IN }], indentStart: 1.6 * IN, indentFirst: -1.6 * IN }],
      ['h2', 'Worked example'],
      ['body', 'Walk through one problem or passage step by step, saying why at each step.'],
      ['pull', 'The one thing to remember.'],
      ['h2', 'Practice'],
      ['list-number', 'A question that checks the first idea'],
      ['list-number', 'A question that checks the second idea'],
      ['list-number', 'A question that asks you to use both'],
    ] }],
  },
  {
    id: 'grant-narrative', name: 'Grant narrative', family: 'scholarly', blurb: 'Need, project, outcomes, budget story and capacity, in the order reviewers score.',
    pages: [{ label: 'Narrative', body: [
      ['kicker', 'Funder name · Program name'],
      ['title', 'Project title'],
      ['meta', 'Organization Name · EIN 00-0000000 · Amount requested $00,000'],
      ['h2', 'Statement of need'],
      ['lead', 'Describe the problem with a number, a source and a date, then say who it falls on in your neighbourhood.'],
      ['h2', 'What we will do'],
      ['body', 'Describe the project so a stranger could picture a week of it: who does what, where, how often.'],
      ['h2', 'Outcomes and how we will measure them'],
      ['list', 'Outcome, the measure, and the target'],
      ['list', 'Outcome, the measure, and the target'],
      ['h2', 'Budget narrative'],
      ['body', 'Explain the largest lines of the budget and why each is needed.'],
      ['h2', 'Why us'],
      ['body', 'Your track record, your people and your partners.'],
    ] }],
  },

  // ── Résumés & programs ──────────────────────────────────────────────────────────────────
  {
    id: 'resume', name: 'Résumé', family: 'personal', blurb: 'Name, contact line, experience with dates on the right, education and skills.',
    pages: [{ label: 'Résumé', margins: { top: 0.9, left: 1, right: 1, bottom: 0.9 }, body: [
      ['title', 'Your Name'],
      ['meta', 'City, State · (313) 555-0100 · you@email.com · yoursite.com'],
      ['lead', 'Two lines on what you do and what you are looking for.'],
      ['h2', 'Experience'],
      ['h3', `Job title, Employer${T}2023 – present`, rightTab(6.5)],
      ['list', 'What you did, with a number: grew, cut, built, led'],
      ['list', 'A second result someone could check'],
      ['h3', `Job title, Employer${T}2020 – 2023`, rightTab(6.5)],
      ['list', 'What you did, with a number'],
      ['list', 'A second result'],
      ['h2', 'Education'],
      ['h3', `Degree, School${T}2020`, rightTab(6.5)],
      ['h2', 'Skills'],
      ['body', 'Skill, skill, skill, skill, skill'],
    ] }],
  },
  {
    id: 'cover-letter', name: 'Cover letter', family: 'personal', blurb: 'Your name as letterhead, then three paragraphs: why them, why you, what next.',
    pages: [{ label: 'Cover letter', margins: { left: 1.2, right: 1.2 }, body: [
      ['title', 'Your Name'],
      ['meta', 'City, State · (313) 555-0100 · you@email.com'],
      ['meta', 'Month 0, 2026'],
      ['body', 'Hiring Manager Name Company Street Address City, State ZIP', block],
      ['body', 'Dear Hiring Manager Name,', block],
      ['body', 'Say which role you are applying for and the one reason you want this job at this place.', { indentFirst: 0, spaceBefore: 11 }],
      ['body', 'Tell one story from your work that shows you can do what the posting asks. Use a number.'],
      ['body', 'Close by saying you would welcome a conversation, and when you are available.'],
      ['body', 'Sincerely,', { ...block, spaceAfter: 22 }],
      ['byline', 'Your Name'],
    ] }],
  },
  {
    id: 'event-program', name: 'Event program', family: 'personal', blurb: 'A centred program: occasion, order of events with leaders, acknowledgements.',
    pages: [{ label: 'Program', margins: { top: 1.3, left: 1.5, right: 1.5, bottom: 1.2 }, body: [
      ['kicker', 'Organization name presents'],
      ['title', 'Name of the occasion'],
      ['subtitle', 'Saturday, Month 0, 2026 · Venue'],
      ['h2', 'Program'],
      ['body', `Welcome${T}Host name`, rightTab(5.5, '.')],
      ['body', `Invocation${T}Name`, rightTab(5.5, '.')],
      ['body', `Musical selection${T}Name`, rightTab(5.5, '.')],
      ['body', `Introduction of the speaker${T}Name`, rightTab(5.5, '.')],
      ['body', `Keynote${T}Speaker name`, rightTab(5.5, '.')],
      ['body', `Presentation of awards${T}Name`, rightTab(5.5, '.')],
      ['body', `Closing remarks${T}Name`, rightTab(5.5, '.')],
      ['h2', 'With thanks'],
      ['caption', 'The committee, our sponsors, and everyone who gave their time.'],
    ] }],
  },

  // ── Chapters & poems ────────────────────────────────────────────────────────────────────
  {
    id: 'chapter', name: 'Book chapter', family: 'literary', blurb: 'Chapter opener with a drop cap, book margins and a scene break.',
    pages: [{ label: 'Chapter', margins: { top: 1.5, left: 1.5, right: 1.5, bottom: 1.3 }, body: [
      ['kicker', 'Chapter One'],
      ['title', 'Chapter title'],
      ['lead', 'Begin the chapter here. The first paragraph opens with a drop cap, the way a printed book does, and runs the full width of the page. Give it three or four lines so the capital has room to sit, then let the story take over from there.'],
      ['body', 'Carry on with the story. Paragraphs after the first follow the theme’s own rhythm.'],
      ['body', 'When the scene changes, leave a break.'],
      ['h3', '* * *'],
      ['body', 'Then pick up in the new place or time.'],
    ] }],
  },
  {
    id: 'poem', name: 'Poem', family: 'literary', blurb: 'A poem set to the left of centre with room to breathe.',
    pages: [{ label: 'Poem', margins: { top: 1.8, left: 2.1, right: 1.4, bottom: 1.4 }, body: [
      ['title', 'Title of the poem'],
      ['byline', 'Your Name'],
      ['body', 'First line of the first stanza second line, where the breath falls third line', { align: 'start', indentFirst: 0 }],
      ['body', 'First line of the second stanza second line third line', { align: 'start', indentFirst: 0, spaceBefore: 12 }],
      ['body', 'A last stanza that lands', { align: 'start', indentFirst: 0, spaceBefore: 12 }],
      ['caption', 'Place, Month 2026'],
    ] }],
  },
  {
    id: 'journal', name: 'Journal entry', family: 'literary', blurb: 'Date, a title if you want one, and a page to write on.',
    pages: [{ label: 'Journal', margins: { left: 1.4, right: 1.2 }, body: [
      ['meta', 'Weekday, Month 0, 2026'],
      ['title', 'Today'],
      ['body', 'Start anywhere. What happened, what you noticed, what you are still thinking about.'],
      ['body', ''],
    ] }],
  },
  {
    id: 'short-story', name: 'Short story', family: 'literary', blurb: 'Title page line, byline, and manuscript pages ready to share.',
    pages: [{ label: 'Story', margins: { top: 1.4, left: 1.35, right: 1.35 }, body: [
      ['title', 'Story title'],
      ['byline', 'by Your Name'],
      ['lead', 'Open the story. Put a person in a place wanting something, and you have begun. Stay close to them for the first few lines: what they see, what they are carrying, what they would rather not say out loud.'],
      ['body', 'Keep going. Dialogue takes a new paragraph each time the speaker changes.'],
      ['body', '“Like this,” she said.'],
      ['body', '“And then like this.”'],
      ['h3', '* * *'],
      ['body', 'A break marks a jump in time or place.'],
    ] }],
  },
];

export const structureById = (id: string) => DOC_STRUCTURES.find(s => s.id === id);
