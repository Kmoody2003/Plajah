/**
 * The Learning Support resource center: plain-language guides for parents, teachers and learners on IEPs, 504 plans,
 * autism, ADHD, dyslexia, sensory needs, communication and regulation.
 *
 * Writing rules:
 *  - Neurodiversity-affirming and strengths-first. Supports are about access and wellbeing, never about making a learner
 *    look less autistic, less ADHD, less themselves.
 *  - General information, not legal or medical advice. Legal points are US federal law (IDEA, Section 504); states and
 *    other countries differ, and each guide says so where it matters.
 *  - Every guide ends with sources the reader can check: the law itself, national parent centers, and organisations
 *    run by or with disabled people.
 */
export type ResourceAudience = 'parent' | 'teacher' | 'learner';
export type ResourceTopic = 'plans' | 'rights' | 'autism' | 'adhd' | 'reading' | 'sensory' | 'communication' | 'regulation' | 'classroom' | 'self-advocacy';

export const RESOURCE_TOPICS: Array<{ id: ResourceTopic; label: string; color: string }> = [
  { id: 'plans', label: 'IEP & 504', color: '#00DAF3' },
  { id: 'rights', label: 'Rights', color: '#F5B83D' },
  { id: 'autism', label: 'Autism', color: '#FF6FA8' },
  { id: 'adhd', label: 'ADHD', color: '#FFB266' },
  { id: 'reading', label: 'Dyslexia & reading', color: '#c4b5fd' },
  { id: 'sensory', label: 'Sensory', color: '#06D6A0' },
  { id: 'communication', label: 'Communication & AAC', color: '#60A5FA' },
  { id: 'regulation', label: 'Regulation', color: '#5ff0c6' },
  { id: 'classroom', label: 'Classroom practice', color: '#a78bfa' },
  { id: 'self-advocacy', label: 'Self-advocacy', color: '#e9e4da' },
];

export interface ResourceSection { heading: string; body?: string[]; bullets?: string[] }
export interface SupportResource {
  id: string;
  title: string;
  summary: string;
  audience: ResourceAudience[];
  topic: ResourceTopic;
  minutes: number;
  sections: ResourceSection[];
  sources: Array<{ label: string; url: string }>;
}

const IDEA = { label: 'IDEA: the law and regulations (U.S. Dept. of Education)', url: 'https://sites.ed.gov/idea/' };
const CPIR = { label: 'Center for Parent Information & Resources (find your state Parent Center)', url: 'https://www.parentcenterhub.org/' };
const WRIGHTS = { label: 'Wrightslaw: special education law and advocacy', url: 'https://www.wrightslaw.com/' };
const UNDERSTOOD = { label: 'Understood.org: learning and thinking differences', url: 'https://www.understood.org/' };
const ASAN = { label: 'Autistic Self Advocacy Network', url: 'https://autisticadvocacy.org/' };
const CHADD = { label: 'CHADD: the national ADHD organisation', url: 'https://chadd.org/' };
const IDA = { label: 'International Dyslexia Association', url: 'https://dyslexiaida.org/' };
const CAST = { label: 'CAST: Universal Design for Learning guidelines', url: 'https://udlguidelines.cast.org/' };
const ASHA = { label: 'ASHA: augmentative and alternative communication', url: 'https://www.asha.org/' };
const CDC = { label: 'CDC: autism information', url: 'https://www.cdc.gov/autism/' };

const LAW_NOTE = 'This is general information about US federal law, not legal advice. States add their own rules and timelines, and other countries use different systems (for example EHC plans in England, or IEPs and IPPs that vary by province or state in Canada and Australia). Your state Parent Center can help for free.';

export const SUPPORT_RESOURCES: SupportResource[] = [
  {
    id: 'iep-vs-504', topic: 'plans', audience: ['parent', 'teacher'], minutes: 5,
    title: 'IEP or 504 plan: what is the difference?',
    summary: 'Two US routes to support at school. One changes how a learner accesses learning; the other can also change what and how they are taught.',
    sections: [
      { heading: 'The short version', body: [
        'A 504 plan gives accommodations so a learner with a disability can access school on equal terms: extra time, a quiet room, read-aloud, breaks, preferential seating. It comes from Section 504 of the Rehabilitation Act, a civil rights law.',
        'An IEP (Individualized Education Program) comes from IDEA, a special education law. It can include the same accommodations, and it adds specially designed instruction, related services (speech, occupational therapy, counselling) and measurable annual goals with progress reports.',
      ] },
      { heading: 'Who qualifies', bullets: [
        'IEP: the learner has a disability in one of IDEA’s categories (autism, specific learning disability such as dyslexia, other health impairment which often covers ADHD, speech or language impairment, and others) AND, because of it, needs specially designed instruction.',
        '504: the learner has a physical or mental impairment that substantially limits a major life activity. Learning, reading, concentrating, thinking and communicating all count.',
        'A learner can be doing well on grades and still qualify. Eligibility is about the impact of the disability, not only test scores.',
      ] },
      { heading: 'Which one to ask for', body: [
        'If accommodations alone would let your child access learning, a 504 may fit. If they need direct teaching in a skill (reading instruction, social communication, executive function coaching) or therapy services, ask for an evaluation for an IEP. You can ask for the evaluation and let the results guide the decision.',
      ] },
      { heading: 'Good to know', body: [LAW_NOTE] },
    ],
    sources: [IDEA, CPIR, UNDERSTOOD],
  },
  {
    id: 'request-evaluation', topic: 'rights', audience: ['parent'], minutes: 4,
    title: 'How to request a special education evaluation',
    summary: 'You can ask the school to evaluate your child at any time, and you should do it in writing.',
    sections: [
      { heading: 'Put it in writing', body: [
        'Email or write to the school principal and special education coordinator. Say you are requesting a full evaluation for special education and related services, describe what you are seeing at home and school, and keep a dated copy.',
        'Schools also have a duty called Child Find: to identify and evaluate children who may have a disability, including children in private schools and homeschools in their area.',
      ] },
      { heading: 'What happens next', bullets: [
        'The school must either ask for your written consent to evaluate, or explain in writing why it is refusing (this is called Prior Written Notice).',
        'Once you consent, IDEA sets a 60-day limit to complete the initial evaluation unless your state sets its own timeline.',
        'The evaluation should look at every area of suspected need: academics, communication, sensory and motor, social-emotional, attention and behaviour.',
        'If you disagree with the school’s evaluation, you can ask for an Independent Educational Evaluation (IEE) at public expense.',
      ] },
      { heading: 'A simple letter', body: [
        '“I am writing to request a comprehensive evaluation of my child, [name], for special education and related services. I am concerned about [reading / attention / communication / ...] because [examples]. Please send me the consent form and a copy of my procedural safeguards. Thank you.”',
      ] },
      { heading: 'Good to know', body: [LAW_NOTE] },
    ],
    sources: [IDEA, CPIR, WRIGHTS],
  },
  {
    id: 'iep-meeting-prep', topic: 'plans', audience: ['parent'], minutes: 6,
    title: 'Getting ready for an IEP meeting',
    summary: 'You are an equal member of the team. A little preparation makes you a stronger one.',
    sections: [
      { heading: 'Before the meeting', bullets: [
        'Ask for evaluation reports and any draft goals a few days ahead so you can read them calmly.',
        'Write a one-page profile of your child: strengths, interests, what helps, what is hard, how they communicate. The “All about me” page in Support Center prints one.',
        'List your top three concerns and the outcome you would like for each.',
        'Bring examples: work samples, notes from home, messages from teachers.',
        'You can bring someone with you: a partner, a friend, an advocate or someone from your Parent Center. Let the school know ahead.',
      ] },
      { heading: 'In the meeting', bullets: [
        'Start with strengths. Plans built on interests and strengths work better.',
        'For each goal, ask: how will it be measured, who will teach it, how often, and how will I hear about progress?',
        'Ask what the accommodations will look like in each class, and in tests.',
        'It is fine to say “I need time to think about this.” You do not have to sign anything at the meeting.',
      ] },
      { heading: 'Afterwards', bullets: [
        'Read the final IEP and check it matches what was agreed.',
        'Note the review date. IEPs are reviewed at least once a year, and the learner is re-evaluated at least every three years.',
        'Share the plan with the teachers who need it. In Plajah you choose exactly which teachers see your child’s supports.',
      ] },
      { heading: 'Good to know', body: [LAW_NOTE] },
    ],
    sources: [CPIR, WRIGHTS, UNDERSTOOD],
  },
  {
    id: 'your-rights', topic: 'rights', audience: ['parent', 'teacher'], minutes: 5,
    title: 'Parent rights in special education, in plain words',
    summary: 'The procedural safeguards that come with IDEA, and what to do when you disagree.',
    sections: [
      { heading: 'The core rights', bullets: [
        'FAPE: a free appropriate public education, designed to meet your child’s individual needs.',
        'LRE: the least restrictive environment, meaning learning alongside non-disabled peers as much as appropriate, with supports.',
        'Participation: you are a member of the team for every decision about evaluation, eligibility, the IEP and placement.',
        'Consent: the school needs your informed written consent before the first evaluation and before first providing services.',
        'Notice: the school must tell you in writing before it proposes or refuses a change (Prior Written Notice), and give you a copy of your procedural safeguards.',
        'Records: you can see your child’s education records.',
      ] },
      { heading: 'When you disagree', bullets: [
        'Ask for another meeting and put your concerns in writing.',
        'Mediation: a free, voluntary meeting with a neutral mediator.',
        'State complaint: a written complaint to your state education agency.',
        'Due process: a formal hearing. During a dispute, the current placement usually stays in place (“stay put”).',
      ] },
      { heading: 'Good to know', body: [LAW_NOTE] },
    ],
    sources: [IDEA, CPIR, WRIGHTS],
  },
  {
    id: 'transition-planning', topic: 'plans', audience: ['parent', 'teacher', 'learner'], minutes: 4,
    title: 'Transition planning: life after school starts in the IEP',
    summary: 'From age 16 at the latest (earlier in many states), the IEP must plan for what comes next.',
    sections: [
      { heading: 'What it includes', bullets: [
        'Goals the learner chooses for after school: further education, training, work, and independent living where relevant.',
        'Transition services and the courses that lead there.',
        'The learner is invited to the meeting. Their voice should lead.',
        'Before the age of majority in your state, the learner must be told which rights will transfer to them.',
      ] },
      { heading: 'Start early', body: [
        'Self-advocacy is the most useful transition skill. A learner who can say what helps them and ask for it will carry their supports into college and work, where nobody writes a plan for them. The learner guide “Knowing what helps you” is a good first step.',
      ] },
      { heading: 'Good to know', body: [LAW_NOTE] },
    ],
    sources: [IDEA, CPIR],
  },
  {
    id: 'autism-affirming', topic: 'autism', audience: ['parent', 'teacher'], minutes: 6,
    title: 'Supporting autistic learners: an affirming approach',
    summary: 'Autism is a different way of experiencing the world, with its own strengths and needs. Support should make learning possible, not make a learner look less autistic.',
    sections: [
      { heading: 'Start from these beliefs', bullets: [
        'Presume competence. A learner who does not speak, or does not show understanding the expected way, may understand a great deal.',
        'Behaviour is communication. Distress usually means a need is not being met: sensory overload, uncertainty, hunger, pain, or demands that are too much.',
        'Stimming (rocking, flapping, humming, fidgeting) helps regulation and focus. Leave harmless stims alone.',
        'Deep interests are a gift and a doorway. Teach through them.',
        'Ask how the learner wants to be described. Many autistic people prefer identity-first language (“autistic learner”); some prefer person-first. Follow the person.',
      ] },
      { heading: 'In the classroom', bullets: [
        'Predictability: a visual schedule, warnings before changes, and a clear end to every task.',
        'Say what you mean. Literal, specific directions work better than hints or sarcasm.',
        'Processing time: wait after a question. Ten seconds can feel long to you and be exactly what is needed.',
        'Offer ways to answer that are not speaking: typing, pointing, choosing, drawing, AAC.',
        'A quiet place to go, chosen in advance, not used as punishment.',
        'Group work with clear roles beats “find a partner”.',
      ] },
      { heading: 'Meltdowns and shutdowns', body: [
        'A meltdown or shutdown is a stress response, not a choice or a tantrum. In the moment, reduce talking and demands, lower sensory input, keep everyone safe, and wait. Talk about it later, when everyone is calm, and look for what built up beforehand.',
      ] },
    ],
    sources: [ASAN, CDC, UNDERSTOOD],
  },
  {
    id: 'adhd-executive', topic: 'adhd', audience: ['parent', 'teacher'], minutes: 5,
    title: 'ADHD and executive function: make the invisible visible',
    summary: 'ADHD is not a lack of knowing what to do; it is difficulty doing it at the right time. Put time, steps and goals outside the head.',
    sections: [
      { heading: 'What helps most', bullets: [
        'Show time: visual timers and clocks, not “in a bit”.',
        'Break work into small steps with a visible checklist; celebrate each finished step.',
        'Short, frequent feedback beats one grade at the end.',
        'Movement is a tool: standing desks, fidgets, errands, movement breaks.',
        'Interest and novelty switch attention on. Choice, challenge and urgency help.',
        'Body doubling: working alongside someone, even quietly on a video call, makes starting easier.',
        'Keep recess. Taking away movement to punish inattention makes the next hour harder.',
      ] },
      { heading: 'In Plajah', body: [
        'Turn on break reminders, “one part at a time” and the “first, then” plan in Support Center. Each lesson then shows a short plan and a single part at a time, with a gentle nudge to move.',
      ] },
    ],
    sources: [CHADD, UNDERSTOOD],
  },
  {
    id: 'dyslexia-structured-literacy', topic: 'reading', audience: ['parent', 'teacher'], minutes: 5,
    title: 'Dyslexia: teach reading directly, and do not wait',
    summary: 'Dyslexia is a common, language-based difference in learning to read and spell. Explicit, systematic teaching works, and listening counts as reading.',
    sections: [
      { heading: 'What works', bullets: [
        'Structured literacy: explicit, systematic, cumulative teaching of phonemic awareness, phonics, spelling patterns, morphology, fluency, vocabulary and comprehension.',
        'Early help is easier help, but it is never too late to teach reading.',
        'Audiobooks and text-to-speech give access to ideas while decoding catches up. That is reading too.',
      ] },
      { heading: 'Classroom accommodations', bullets: [
        'Never ask a dyslexic learner to read aloud cold in front of others.',
        'Grade ideas separately from spelling.',
        'Clear fonts, larger text, more spacing, and a reading guide or ruler.',
        'Extra time, read-aloud on tests (unless decoding itself is what is being tested), and speech-to-text for writing.',
      ] },
      { heading: 'In Plajah', body: [
        'Easier to read, Listen buttons, the reading ruler and larger text are all one tap away in the Supports dock on every learning screen.',
      ] },
    ],
    sources: [IDA, UNDERSTOOD],
  },
  {
    id: 'sensory-needs', topic: 'sensory', audience: ['parent', 'teacher'], minutes: 4,
    title: 'Sensory needs: more than five senses',
    summary: 'Some learners feel sound, light, touch or movement far more or far less than others. Matching the environment to the learner frees up attention for learning.',
    sections: [
      { heading: 'The senses that matter here', bullets: [
        'Sight, sound, touch, taste and smell.',
        'Vestibular: balance and movement.',
        'Proprioception: knowing where your body is and how hard you are pushing.',
        'Interoception: noticing hunger, thirst, needing the bathroom, or feeling anxious.',
      ] },
      { heading: 'Seeking and avoiding', body: [
        'A learner might avoid some input (covering ears, refusing certain clothes) and seek others (spinning, crashing, chewing). An occupational therapist can help build a “sensory diet”: planned activities through the day that keep the body regulated.',
      ] },
      { heading: 'Easy changes', bullets: [
        'Headphones or ear defenders, and a quiet corner.',
        'Dim or natural lighting; avoid flicker.',
        'Heavy work breaks: carrying books, wall push-ups.',
        'Chewable or fidget tools, and seating that allows movement.',
        'In Plajah: Calm visuals, softer colour and quieter media.',
      ] },
    ],
    sources: [UNDERSTOOD, ASAN],
  },
  {
    id: 'aac-basics', topic: 'communication', audience: ['parent', 'teacher'], minutes: 5,
    title: 'AAC: every learner has something to say',
    summary: 'Augmentative and alternative communication (AAC) includes sign, picture boards, letter boards and speech-generating apps. There are no prerequisites to using it.',
    sections: [
      { heading: 'Myths and facts', bullets: [
        'AAC does not stop a child learning to talk. Research has found it does not hold speech back, and it may help.',
        'There are no prerequisites. A learner does not need to “earn” AAC with other skills first.',
        'AAC is a voice, not a toy. Keep it available all day, everywhere.',
      ] },
      { heading: 'How to help', bullets: [
        'Model: point to words on the device as you speak (often called aided language input). Learners learn AAC the way children learn speech: by seeing it used.',
        'Wait. Give time for a response, and accept it as a full answer.',
        'Offer real choices and real conversation, not only requests.',
        'Talk to a speech-language pathologist about the right system.',
      ] },
    ],
    sources: [ASHA, ASAN],
  },
  {
    id: 'co-regulation', topic: 'regulation', audience: ['parent', 'teacher'], minutes: 4,
    title: 'Co-regulation comes before self-regulation',
    summary: 'Children learn to calm themselves by being calmed by someone else, many times. Your calm is the strategy.',
    sections: [
      { heading: 'In the hard moment', bullets: [
        'Lower your voice and slow down. Fewer words.',
        'Reduce demands and sensory input.',
        'Offer, do not force: water, a quiet space, breathing together, a familiar object.',
        'Safety first; the lesson can wait.',
      ] },
      { heading: 'Build skills when calm', bullets: [
        'Name feelings together, using pictures or colours if words are hard.',
        'Practise calming tools when nobody needs them yet: breathing, movement, squeezing a ball.',
        'Make a plan together: what are my early signs, what helps, where can I go?',
        'In Plajah, the Breathe button in the Supports dock gives a calm, steady breathing pace.',
      ] },
    ],
    sources: [UNDERSTOOD, CPIR],
  },
  {
    id: 'udl-classroom', topic: 'classroom', audience: ['teacher'], minutes: 5,
    title: 'Universal Design for Learning: plan for every learner first',
    summary: 'Design lessons with flexibility built in, so fewer learners need something special added afterwards.',
    sections: [
      { heading: 'Three questions for every lesson', bullets: [
        'Engagement: why would a learner care, and can they make choices?',
        'Representation: can they get the information more than one way: text, audio, video, diagram, hands-on?',
        'Action and expression: can they show what they know more than one way: writing, speaking, drawing, building, recording?',
      ] },
      { heading: 'Accommodation or modification?', body: [
        'An accommodation changes how a learner learns or shows learning (read-aloud, extra time, typing instead of handwriting); the expectation stays the same. A modification changes what is expected (fewer problems, different grade-level content). Both can be right; be clear which one you are using, because it affects grading and records.',
      ] },
      { heading: 'In Plajah', body: [
        'Every lesson in Academia already offers read-aloud, easier-to-read type, calm visuals and chunking to any learner who wants them. When a family shares a plan with you, Support Center lists exactly what to do in your class.',
      ] },
    ],
    sources: [CAST, UNDERSTOOD],
  },
  {
    id: 'measurable-goals', topic: 'classroom', audience: ['teacher', 'parent'], minutes: 5,
    title: 'Writing goals you can actually measure',
    summary: 'A good IEP goal says under what conditions, what the learner will do, and how well, so anyone can tell whether it is working.',
    sections: [
      { heading: 'The three parts', bullets: [
        'Condition: “Given a grade-level passage and a choice of read-aloud or print…”',
        'Behaviour: “…Maya will retell the main idea and two supporting details…”',
        'Criterion: “…in 4 of 5 opportunities across two weeks.”',
      ] },
      { heading: 'Keep it humane', bullets: [
        'Build goals from strengths and the learner’s own aims.',
        'Goals should build skills and independence, not demand that a learner hide who they are (for example, “will make eye contact” is not a meaningful learning goal for many autistic learners).',
        'Log progress little and often. In Support Center, the team can add a data point in seconds and everyone sees the trend.',
      ] },
    ],
    sources: [CPIR, WRIGHTS],
  },
  {
    id: 'data-collection', topic: 'classroom', audience: ['teacher'], minutes: 3,
    title: 'Progress monitoring without drowning in paperwork',
    summary: 'Short, regular data points beat a big test at the end of the year.',
    sections: [
      { heading: 'A simple routine', bullets: [
        'Pick one or two goals per week to check.',
        'Use the same task type each time so the numbers compare.',
        'Write one line of context with each data point: what support was used, how the learner was feeling.',
        'Look at the trend every few weeks. Flat for a month means change the teaching, not the learner.',
        'Share the trend with families before the review meeting, not at it.',
      ] },
    ],
    sources: [CPIR, UNDERSTOOD],
  },
  {
    id: 'knowing-what-helps', topic: 'self-advocacy', audience: ['learner'], minutes: 3,
    title: 'Knowing what helps you, and asking for it',
    summary: 'Your brain works in its own way. Knowing what helps you learn is a real skill, and asking for it is allowed.',
    sections: [
      { heading: 'Find out what helps', bullets: [
        'Try the supports in the dock: Easier to read, Listen, the reading ruler, Calm visuals, breaks.',
        'Notice when learning feels easier. What was different? Quieter? Shorter parts? Listening instead of reading?',
        'Write it on your “All about me” page so the people who help you know too.',
      ] },
      { heading: 'Ways to ask', bullets: [
        '“Can I listen to this instead of reading it?”',
        '“Can I have a minute to think before I answer?”',
        '“It’s too loud for me. Can I use headphones?”',
        '“Can I type my answer?”',
        '“I need a break. Can I come back in five minutes?”',
      ] },
      { heading: 'Remember', body: ['Needing help with some things does not mean you are not smart. Everyone learns differently, and your differences come with strengths too.'] },
    ],
    sources: [UNDERSTOOD, ASAN],
  },
  {
    id: 'one-page-profile', topic: 'self-advocacy', audience: ['parent', 'learner', 'teacher'], minutes: 3,
    title: 'The one-page profile: introduce the learner, not the label',
    summary: 'A single page that tells a new teacher who this learner is, what they love, and exactly what helps.',
    sections: [
      { heading: 'What to include', bullets: [
        'What people like and admire about me.',
        'What I love and am interested in.',
        'What helps me learn, and what makes it harder.',
        'How I communicate, and how to communicate with me.',
        'What helps me feel calm.',
      ] },
      { heading: 'Make one', body: ['Fill in “All about me” in Support Center and press Print. Write it with the learner, in their words where possible.'] },
    ],
    sources: [CPIR, UNDERSTOOD],
  },
];

export const resourcesFor = (audience: ResourceAudience | 'all', topic: ResourceTopic | 'all') =>
  SUPPORT_RESOURCES.filter(r => (audience === 'all' || r.audience.includes(audience)) && (topic === 'all' || r.topic === topic));
