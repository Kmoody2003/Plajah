/**
 * MathSchoolView — The Mathematics Discipline Landing Page.
 *
 * Dedicated landing page for Mathematics across all grade bands (PreK → University).
 *
 * Replaces the previous behavior where clicking Math jumped directly into the grade 1-8
 * quiz generator without educational overview, active coursework, or broader curriculum exploration.
 *
 * Key Features:
 *  - "My Math Desk": First section at the top displays the student's active math coursework,
 *    pending homework/worksheets, Time Attack high scores, and quiz streaks.
 *  - Full Grade Band Exploration: Elementary (1–5), Middle School (6–8), High School & College
 *    (Algebra, Geometry, Trigonometry, Calculus, Statistics).
 *  - Quests & Interactive Drills: Deep links to Math Classroom (Quiz Practice, Time Attack, Daily Challenge).
 *  - Open Textbooks: OpenStax Algebra & Trig, Calculus, and Statistics.
 *  - Touch-First Mobile: Grade-band selector pills, swipeable cards, and sticky mobile action bar.
 */
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Calculator, Sparkles, BookOpen, Trophy, Zap, Clock,
  ChevronRight, CheckCircle2, ShieldCheck, Play, Award, Layers,
  Compass, BarChart3, HelpCircle, Binary, LineChart
} from 'lucide-react';
import { fetchStudentDueWork, type DueItem } from '../services/assignmentTemplateService';

interface Props {
  onBack: () => void;
  onNavigate: (view: string) => void;
  user?: any;
  profile?: any;
}

type GradeBand = 'g12' | 'g35' | 'g68' | 'hs' | 'col';
type Tab = 'CURRICULUM' | 'QUESTS' | 'TEXTBOOKS' | 'APPLIED';

interface MathStrand {
  id: string;
  title: string;
  gradeLabel: string;
  blurb: string;
  standard: string;
  accent: string;
  topics: { name: string; lessons: string; practiceType: string }[];
}

const MATH_STRANDS: Record<GradeBand, MathStrand[]> = {
  g12: [
    {
      id: 'num-sense-early',
      title: 'Counting & Number Sense',
      gradeLabel: 'Grades 1–2',
      blurb: 'Foundational one-to-one correspondence, number patterns, comparing quantities, and place value (tens and ones).',
      standard: 'CCSS.MATH.1.NBT',
      accent: '#3B82F6',
      topics: [
        { name: 'Counting up to 120', lessons: '6 Lessons', practiceType: 'Interactive counters' },
        { name: 'Tens and Ones Place Value', lessons: '5 Lessons', practiceType: 'Base-10 block puzzles' },
        { name: 'Comparing Two-Digit Numbers', lessons: '4 Lessons', practiceType: 'Greater than / less than' },
      ],
    },
    {
      id: 'operations-early',
      title: 'Addition & Subtraction Foundations',
      gradeLabel: 'Grades 1–2',
      blurb: 'Fact families, number lines, adding within 20, and two-digit addition without and with regrouping.',
      standard: 'CCSS.MATH.1.OA & 2.OA',
      accent: '#06D6A0',
      topics: [
        { name: 'Fact Families to 10 & 20', lessons: '8 Lessons', practiceType: 'Drill flashcards' },
        { name: 'Number Line Navigation', lessons: '4 Lessons', practiceType: 'Hop-along line sim' },
        { name: 'Word Problems & Real Context', lessons: '6 Lessons', practiceType: 'Visual word prompts' },
      ],
    },
    {
      id: 'geometry-early',
      title: 'Shapes, Measurement & Clocks',
      gradeLabel: 'Grades 1–2',
      blurb: '2D and 3D shapes, identifying attributes, measuring lengths with non-standard units, and reading analog clocks.',
      standard: 'CCSS.MATH.2.MD & 2.G',
      accent: '#F59E0B',
      topics: [
        { name: '2D Shapes & Attributes', lessons: '4 Lessons', practiceType: 'Sides & vertices matching' },
        { name: 'Telling Time: Hour & Half-Hour', lessons: '5 Lessons', practiceType: 'Clock face interactive' },
        { name: 'Money: Pennies, Nickels, Dimes, Quarters', lessons: '5 Lessons', practiceType: 'Coin sum challenges' },
      ],
    },
  ],
  g35: [
    {
      id: 'multiplication-div',
      title: 'Multiplication & Division Mastery',
      gradeLabel: 'Grades 3–4',
      blurb: 'Arrays, equal groups, times tables 1–12, properties of multiplication, and multi-digit long division.',
      standard: 'CCSS.MATH.3.OA & 4.NBT',
      accent: '#8B5CF6',
      topics: [
        { name: 'Times Tables 1–12 Fluency', lessons: '12 Lessons', practiceType: 'Speed sprint drills' },
        { name: 'Arrays & Area Models', lessons: '5 Lessons', practiceType: 'Visual grid multiplication' },
        { name: 'Division as Sharing & Grouping', lessons: '6 Lessons', practiceType: 'Remainder simulations' },
        { name: 'Multi-Digit Long Division', lessons: '8 Lessons', practiceType: 'Step-by-step algorithms' },
      ],
    },
    {
      id: 'fractions-intro',
      title: 'Fractions & Decimals',
      gradeLabel: 'Grades 3–5',
      blurb: 'Parts of a whole, equivalent fractions, comparing fractions, fraction arithmetic, and decimal notation.',
      standard: 'CCSS.MATH.4.NF & 5.NF',
      accent: '#00DAF3',
      topics: [
        { name: 'Fraction Visuals & Number Lines', lessons: '7 Lessons', practiceType: 'Pie & bar slicing' },
        { name: 'Equivalent Fractions & Simplifying', lessons: '6 Lessons', practiceType: 'Common factor search' },
        { name: 'Adding & Subtracting Fractions', lessons: '8 Lessons', practiceType: 'Common denominator builder' },
        { name: 'Decimals as Tenths & Hundredths', lessons: '6 Lessons', practiceType: 'Money & metric mapping' },
      ],
    },
    {
      id: 'measurement-data',
      title: 'Area, Perimeter & Volume',
      gradeLabel: 'Grades 4–5',
      blurb: 'Geometric measurement, calculating perimeter of polygons, area formulas, and 3D unit cube volume.',
      standard: 'CCSS.MATH.4.MD & 5.MD',
      accent: '#D40055',
      topics: [
        { name: 'Perimeter vs Area Concepts', lessons: '5 Lessons', practiceType: 'Fence vs lawn sandbox' },
        { name: 'Volume of Rectangular Prisms', lessons: '6 Lessons', practiceType: '3D cube stacking' },
        { name: 'Line Plots & Interpreting Data', lessons: '4 Lessons', practiceType: 'Interactive charts' },
      ],
    },
  ],
  g68: [
    {
      id: 'ratios-proportions',
      title: 'Ratios, Rates & Percentages',
      gradeLabel: 'Grades 6–7',
      blurb: 'Ratio reasoning, unit rates, proportional relationships on graphs, percent increase/decrease, and scale drawings.',
      standard: 'CCSS.MATH.6.RP & 7.RP',
      accent: '#3B82F6',
      topics: [
        { name: 'Understanding Ratios & Equivalence', lessons: '6 Lessons', practiceType: 'Recipe & speed scaling' },
        { name: 'Unit Rates & Constant of Proportionality', lessons: '7 Lessons', practiceType: 'Graph & table analysis' },
        { name: 'Tax, Tip, Discount & Markups', lessons: '5 Lessons', practiceType: 'Real-world store prompts' },
      ],
    },
    {
      id: 'linear-equations',
      title: 'Pre-Algebra & Linear Equations',
      gradeLabel: 'Grades 7–8',
      blurb: 'Variables, two-step equations, inequalities, slope-intercept form (y = mx + b), and systems of linear equations.',
      standard: 'CCSS.MATH.7.EE & 8.EE',
      accent: '#06D6A0',
      topics: [
        { name: 'Solving Two-Step Linear Equations', lessons: '8 Lessons', practiceType: 'Algebra balance scale' },
        { name: 'Slope, Rise over Run & Intercepts', lessons: '7 Lessons', practiceType: 'Coordinate line plotter' },
        { name: 'Systems of Equations by Graphing & Substitution', lessons: '8 Lessons', practiceType: 'Intersection finder' },
      ],
    },
    {
      id: 'geometry-8',
      title: 'Pythagorean Theorem & Geometry',
      gradeLabel: 'Grade 8',
      blurb: 'Geometric transformations (rotations, reflections), the Pythagorean Theorem on right triangles, and volume of cylinders/cones.',
      standard: 'CCSS.MATH.8.G',
      accent: '#F59E0B',
      topics: [
        { name: 'The Pythagorean Theorem (a² + b² = c²)', lessons: '7 Lessons', practiceType: 'Geometric square proof' },
        { name: 'Distance Formula in 2D Space', lessons: '5 Lessons', practiceType: 'Map navigation drill' },
        { name: 'Cylinders, Cones & Spheres Volume', lessons: '6 Lessons', practiceType: 'Liquid capacity sim' },
      ],
    },
  ],
  hs: [
    {
      id: 'algebra-1-2',
      title: 'Algebra I & Algebra II',
      gradeLabel: 'High School',
      blurb: 'Quadratic functions, factoring, polynomials, rational expressions, logarithms, and exponential models.',
      standard: 'CCSS.MATH.HSA & HSF',
      accent: '#8B5CF6',
      topics: [
        { name: 'Quadratic Equations & The Quadratic Formula', lessons: '10 Lessons', practiceType: 'Parabola graphing' },
        { name: 'Polynomial Arithmetic & Factoring', lessons: '8 Lessons', practiceType: 'Synthetic division' },
        { name: 'Logarithmic & Exponential Functions', lessons: '8 Lessons', practiceType: 'Compound growth models' },
      ],
    },
    {
      id: 'geometry-trig',
      title: 'Formal Geometry & Trigonometry',
      gradeLabel: 'High School',
      blurb: 'Two-column deductive proofs, congruence, similarity, right triangle trigonometry (SOH CAH TOA), and the unit circle.',
      standard: 'CCSS.MATH.HSG',
      accent: '#00DAF3',
      topics: [
        { name: 'Axioms, Postulates & Deductive Proofs', lessons: '9 Lessons', practiceType: 'Proof step builder' },
        { name: 'Trigonometric Ratios & Right Triangles', lessons: '8 Lessons', practiceType: 'Triangle solver' },
        { name: 'The Unit Circle & Radian Measure', lessons: '7 Lessons', practiceType: 'Interactive unit circle' },
      ],
    },
    {
      id: 'stats-probability',
      title: 'AP Statistics & Probability',
      gradeLabel: 'High School',
      blurb: 'Exploring data, normal distribution, correlation vs causation, confidence intervals, and hypothesis testing.',
      standard: 'CCSS.MATH.HSS',
      accent: '#D40055',
      topics: [
        { name: 'Normal Curves & Z-Scores', lessons: '7 Lessons', practiceType: 'Bell curve area calculator' },
        { name: 'Linear Regression & Residuals', lessons: '6 Lessons', practiceType: 'Scatter plot trend fit' },
        { name: 'Hypothesis Testing & P-Values', lessons: '8 Lessons', practiceType: 'Significance tests' },
      ],
    },
  ],
  col: [
    {
      id: 'calculus-sequence',
      title: 'Calculus I & II (Single Variable)',
      gradeLabel: 'College / AP',
      blurb: 'Limits, continuity, derivatives, optimization, related rates, Riemann sums, the Fundamental Theorem, and series.',
      standard: 'AP Calc AB/BC & College Level',
      accent: '#3B82F6',
      topics: [
        { name: 'Limits & Derivatives from First Principles', lessons: '12 Lessons', practiceType: 'Tangent line interactive' },
        { name: 'Techniques of Integration & U-Substitution', lessons: '10 Lessons', practiceType: 'Area under curves' },
        { name: 'Taylor & Maclaurin Power Series', lessons: '8 Lessons', practiceType: 'Approximation visualizer' },
      ],
    },
    {
      id: 'linear-algebra',
      title: 'Linear Algebra & Vectors',
      gradeLabel: 'Undergraduate',
      blurb: 'Vector spaces, matrices, Gaussian elimination, eigenvalues, eigenvectors, and linear transformations.',
      standard: 'University STEM Spine',
      accent: '#06D6A0',
      topics: [
        { name: 'Matrix Multiplication & Inverses', lessons: '8 Lessons', practiceType: 'Matrix arithmetic tool' },
        { name: 'Vector Spaces & Subspaces', lessons: '7 Lessons', practiceType: '3D coordinate projection' },
        { name: 'Eigenvalues & Diagonalization', lessons: '8 Lessons', practiceType: 'Transformation visualizer' },
      ],
    },
  ],
};

const MATH_QUESTS = [
  {
    id: 'time-attack',
    title: 'Math Classroom: Time Attack',
    desc: 'Answer as many procedural questions as you can in 60 seconds. Climb the global leaderboard.',
    accent: '#3B82F6',
    emoji: '⚡',
    route: 'MATH_CLASSROOM',
    points: '100+ pts',
  },
  {
    id: 'grade-quiz',
    title: 'Adaptive Grade Assessment',
    desc: 'Targeted quizzes across CCSS standards for Grades 1 through 8. Instant feedback and hints.',
    accent: '#06D6A0',
    emoji: '🎯',
    route: 'MATH_CLASSROOM',
    points: '150 pts',
  },
  {
    id: 'structural-math',
    title: 'Architecture: Structural Math Lab',
    desc: 'Calculate load bearing, bending moments, and structural integrity formulas on 3D blueprints.',
    accent: '#F59E0B',
    emoji: '🏗️',
    route: 'PLAJAH_LABS',
    points: '200 pts',
  },
  {
    id: 'finance-math',
    title: 'Compound Interest & CFO Math',
    desc: 'Model exponential growth, discount cash flows, and amortization schedules on real dollars.',
    accent: '#8B5CF6',
    emoji: '💰',
    route: 'MONEY_SCHOOL',
    points: '150 pts',
  },
];

const MathSchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [band, setBand] = useState<GradeBand>('g68');
  const [tab, setTab] = useState<Tab>('CURRICULUM');
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [loadingDue, setLoadingDue] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      setLoadingDue(true);
      fetchStudentDueWork(user.uid)
        .then(items => {
          setDueItems(items);
          setLoadingDue(false);
        })
        .catch(() => setLoadingDue(false));
    }
  }, [user?.uid]);

  const strands = MATH_STRANDS[band] || MATH_STRANDS.g68;

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-24 selection:bg-[#3B82F6]/30">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Back Nav & School Badge */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all min-h-[44px]"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#60A5FA]">
              <Calculator size={13} /> Mathematics
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              CCSS Aligned · Grades 1–University
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(15,34,70,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#60A5FA] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>Discipline Center</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Mathematics
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              Explore mathematics by understanding the patterns, logic, and proofs beneath reality.
              From early number sense and fractions to linear equations, calculus, and open textbooks.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate('MATH_CLASSROOM')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3B82F6] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:bg-[#4b93ff] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px]"
              >
                <Zap size={18} /> Open Math Practice & Drills ▶
              </button>
              <button
                onClick={() => setTab('TEXTBOOKS')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all min-h-[48px]"
              >
                <BookOpen size={16} /> Free OpenStax Textbooks
              </button>
            </div>
          </div>

          <div
            aria-hidden
            className="absolute -right-12 -bottom-16 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-30"
            style={{ background: 'radial-gradient(circle, #3B82F6, transparent)' }}
          />
        </div>

        {/* ── [MY DESK]: Personalized Signed-In Context ─────────────────────── */}
        <section className="mb-8" aria-label="My Math Desk">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA]">
                  <Award size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">My Math Desk</h2>
                  <p className="text-xs text-white/50">Your active math coursework, assignments & drills</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white/40">Status:</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-500/40 bg-green-500/10 text-green-400">
                  {user ? 'Enrolled / Active' : 'Exploring as Guest'}
                </span>
              </div>
            </div>

            {/* Context Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Active Math Assignment or Due Work */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Work Due</span>
                    <span className="text-[#3B82F6] uppercase font-black tracking-wider">
                      {dueItems.length > 0 ? `${dueItems.length} Pending` : 'All Caught Up'}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white truncate">
                    {dueItems.length > 0 ? dueItems[0].title : 'Practice: Linear Equations'}
                  </h3>
                  <p className="text-xs text-white/60 mt-1 line-clamp-2">
                    {dueItems.length > 0
                      ? 'Submit your worksheet to earn points and update your Academic Passport.'
                      : 'Test your speed and accuracy in the 60-second procedural challenge.'}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">
                    {dueItems.length > 0 ? 'Due soon' : 'Grade 7–8 Track'}
                  </span>
                  <button
                    onClick={() => onNavigate('MATH_CLASSROOM')}
                    className="text-xs font-black uppercase tracking-wider text-[#60A5FA] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Start Now <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 2: Speed Drill & Quest */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Quick Quest</span>
                    <span className="text-[#F59E0B] font-bold">100 XP</span>
                  </div>
                  <h3 className="text-base font-black text-white">Time Attack Speed Drill</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Solve procedural problems against the clock. Builds automaticity in number operations.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">1 Min Drill</span>
                  <button
                    onClick={() => onNavigate('MATH_CLASSROOM')}
                    className="text-xs font-black uppercase tracking-wider text-[#F59E0B] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Play Time Attack <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 3: Standards Proficiency & Ledger */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Learner Record</span>
                    <span className="text-[#06D6A0] font-bold">CCSS Benchmark</span>
                  </div>
                  <h3 className="text-base font-black text-white">My Academic Passport</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Every problem solved writes verifiable proficiency to your portable learning ledger.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Portable Credential</span>
                  <button
                    onClick={() => onNavigate('LEARNER_LEDGER')}
                    className="text-xs font-black uppercase tracking-wider text-[#06D6A0] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    View Ledger <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Navigation Tabs (Touch-First Pills) ───────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {[
            { key: 'CURRICULUM', label: 'Curriculum & Strands', icon: BookOpen },
            { key: 'QUESTS', label: 'Quests & Time Attack', icon: Zap },
            { key: 'TEXTBOOKS', label: 'Open Textbooks', icon: BookOpen },
            { key: 'APPLIED', label: 'Applied Math in Action', icon: Compass },
          ].map(t => {
            const Icon = t.icon;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as Tab)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all min-h-[48px] ${
                  on
                    ? 'bg-white text-black shadow-lg shadow-white/10 scale-[1.02]'
                    : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white border border-white/10'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: CURRICULUM BY GRADE BAND ──────────────────────────────── */}
        {tab === 'CURRICULUM' && (
          <div className="space-y-6">
            {/* Grade Band Selector (Touch-friendly pills) */}
            <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                <span className="text-xs font-bold text-white/40 uppercase tracking-wider mr-1">Level:</span>
                {[
                  { key: 'g12', label: 'Grades 1–2' },
                  { key: 'g35', label: 'Grades 3–5' },
                  { key: 'g68', label: 'Grades 6–8' },
                  { key: 'hs', label: 'High School' },
                  { key: 'col', label: 'College / STEM' },
                ].map(b => (
                  <button
                    key={b.key}
                    onClick={() => setBand(b.key as GradeBand)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all min-h-[40px] ${
                      band === b.key
                        ? 'bg-[#3B82F6] text-white shadow-md shadow-[#3B82F6]/30'
                        : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-white/40 font-mono">Standards: CCSS & AP Aligned</span>
            </div>

            {/* Strands Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {strands.map(strand => (
                <div
                  key={strand.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                        style={{
                          borderColor: `${strand.accent}55`,
                          backgroundColor: `${strand.accent}15`,
                          color: strand.accent,
                        }}
                      >
                        {strand.gradeLabel}
                      </span>
                      <span className="text-[10px] font-mono text-white/30">{strand.standard}</span>
                    </div>

                    <h3 className="text-lg font-black text-white mb-2 leading-tight">{strand.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-5">{strand.blurb}</p>

                    <div className="space-y-2.5 pt-4 border-t border-white/5">
                      {strand.topics.map(topic => (
                        <div key={topic.name} className="group/item">
                          <div className="flex items-center justify-between text-xs font-bold text-white/85 group-hover/item:text-white">
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: strand.accent }} />
                              {topic.name}
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">{topic.lessons}</span>
                          </div>
                          <p className="text-[11px] text-white/40 ml-3 mt-0.5">{topic.practiceType}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('MATH_CLASSROOM')}
                    className="mt-6 w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white/80 hover:text-white transition-all min-h-[44px]"
                  >
                    Open Practice Problems →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 2: QUESTS & TIME ATTACK ───────────────────────────────────── */}
        {tab === 'QUESTS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Math Quests & Challenges</h2>
                <p className="text-xs text-white/50">Rapid-fire drills, applied challenges, and leaderboard competitions</p>
              </div>
              <span className="text-xs text-white/40">4 Featured Quests</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {MATH_QUESTS.map(quest => (
                <div
                  key={quest.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="text-3xl">{quest.emoji}</span>
                      <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-white/60">
                        {quest.points}
                      </span>
                    </div>

                    <h3 className="text-lg font-black text-white mb-1.5">{quest.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-4">{quest.desc}</p>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-xs text-white/40">Instant Feedback</span>
                    <button
                      onClick={() => onNavigate(quest.route)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
                      style={{ backgroundColor: quest.accent }}
                    >
                      Start Quest ▶
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: OPEN TEXTBOOKS ─────────────────────────────────────────── */}
        {tab === 'TEXTBOOKS' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider text-white">Peer-Reviewed Open Textbooks</h2>
              <p className="text-xs text-white/50">Free, full-length college and high-school texts from OpenStax</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  title: 'Algebra & Trigonometry',
                  authors: 'OpenStax · Jay Abramson et al.',
                  desc: 'Comprehensive coverage of linear equations, inequalities, polynomial and rational functions, exponential & logarithmic models, and trigonometry.',
                  badge: 'G8–12 & College',
                  accent: '#3B82F6',
                },
                {
                  title: 'Calculus (Volume 1 & 2)',
                  authors: 'OpenStax · Edwin Herman et al.',
                  desc: 'Functions, limits, derivatives, integration, and applications with detailed proofs, step-by-step examples, and conceptual problem sets.',
                  badge: 'AP / College STEM',
                  accent: '#06D6A0',
                },
                {
                  title: 'Introductory Statistics',
                  authors: 'OpenStax · Barbara Illowsky et al.',
                  desc: 'Sampling, descriptive statistics, probability topics, normal distribution, central limit theorem, and hypothesis testing with one and two samples.',
                  badge: 'AP / University',
                  accent: '#F59E0B',
                },
              ].map(book => (
                <div
                  key={book.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:bg-white/[0.05] transition-all"
                >
                  <div>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border mb-3 inline-block"
                      style={{
                        borderColor: `${book.accent}55`,
                        backgroundColor: `${book.accent}15`,
                        color: book.accent,
                      }}
                    >
                      {book.badge}
                    </span>
                    <h3 className="text-lg font-black text-white mb-1">{book.title}</h3>
                    <p className="text-[11px] text-white/40 mb-3">{book.authors}</p>
                    <p className="text-xs text-white/60 leading-relaxed">{book.desc}</p>
                  </div>

                  <button
                    onClick={() => onNavigate('ACADEMIA_COURSES')}
                    className="mt-6 w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white transition-all min-h-[44px]"
                  >
                    Open in Book Reader →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 4: APPLIED MATH IN ACTION ─────────────────────────────────── */}
        {tab === 'APPLIED' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider text-white">Applied Math Across Plajah</h2>
              <p className="text-xs text-white/50">Mathematics powers architecture, space flight, economics, and music</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                {
                  title: 'Orbital Mechanics & Keplerian Physics',
                  desc: 'Calculate orbital periods, velocities, and gravitational transfer windows inside the 3D Solar System simulation.',
                  accent: '#3B82F6',
                  action: () => onNavigate('SOLAR_SYSTEM'),
                },
                {
                  title: 'Structural Engineering & Bending Stress',
                  desc: 'Apply static equilibrium, shear diagrams, and load calculations inside the Architecture studio.',
                  accent: '#F59E0B',
                  action: () => onNavigate('ARCHITECTURE'),
                },
                {
                  title: 'Music Ratios, Harmonics & Overtones',
                  desc: 'Explore frequency ratios, equal temperament tuning, and wave interference inside the Chora Conservatory.',
                  accent: '#00DAF3',
                  action: () => onNavigate('CHORA_CONSERVATORY'),
                },
                {
                  title: 'Financial Unit Economics & Valuation',
                  desc: 'Calculate net present value, internal rate of return, and cap table dilution inside Praxis and School of Money.',
                  accent: '#8B5CF6',
                  action: () => onNavigate('BUSINESS_SCHOOL'),
                },
              ].map(app => (
                <div
                  key={app.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <h3 className="text-base font-black text-white mb-2">{app.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed">{app.desc}</p>
                  </div>
                  <button
                    onClick={app.action}
                    className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#60A5FA] hover:text-white min-h-[36px]"
                  >
                    Explore Discipline Connection <ChevronRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Touch-First Sticky Quick Action Bar ──────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-30 p-3 bg-black/80 backdrop-blur-xl border-t border-white/10 sm:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('MATH_CLASSROOM')}
            className="flex-1 py-3.5 px-4 rounded-2xl bg-[#3B82F6] text-white text-xs font-black uppercase tracking-wider text-center shadow-lg shadow-[#3B82F6]/30 flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Zap size={16} /> Open Math Classroom Drills
          </button>
          <button
            onClick={onBack}
            className="px-4 py-3.5 rounded-2xl border border-white/15 bg-white/5 text-white/70 text-xs font-bold min-h-[48px]"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default MathSchoolView;
