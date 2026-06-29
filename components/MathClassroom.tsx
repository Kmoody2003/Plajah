import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Star, RefreshCw, Check, X, Share2, Flag,
  ChevronRight, ChevronLeft, Sparkles, Zap, Trophy,
  AlertTriangle, Settings, Plus, Trash2, Edit3,
} from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { appendRecord, loadProficiency } from '../services/learningLedgerService';
import { addPoints } from '../services/pointsService';
import { mathStandardForGrade, bandFor } from '../data/educationStandards';

interface Props {
  onBack: () => void;
  user: any;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface MathProblem {
  id: string;
  grade: number;
  topic: string;
  question: string;
  answer: string;
  choices: string[];
  hint?: string;
  isCustom?: boolean;
  flaggedCount?: number;
  flaggedByUsers?: string[];
  source?: string; // Firestore doc ID if it came from DB
}

interface QuizResult {
  correct: number;
  total: number;
  grade: number;
  topic: string;
  timeSeconds: number;
}

// ── Grade curriculum structure ────────────────────────────────────────────────
const GRADE_TOPICS: Record<number, string[]> = {
  1: ['Counting & Numbers', 'Addition (0–10)', 'Subtraction (0–10)', 'Shapes'],
  2: ['Addition (0–100)', 'Subtraction (0–100)', 'Place Value', 'Measurement', 'Clocks & Time'],
  3: ['Multiplication (1–10)', 'Division Intro', 'Fractions Intro', 'Area & Perimeter'],
  4: ['Multi-digit Multiplication', 'Long Division', 'Fractions', 'Decimals Intro', 'Angles'],
  5: ['Fraction Operations', 'Decimal Operations', 'Percentages Intro', 'Coordinate Grid', 'Volume'],
  6: ['Ratios & Rates', 'Percent Problems', 'Intro to Variables', 'Statistics', 'Area of Polygons'],
  7: ['Linear Equations', 'Inequalities', 'Probability', 'Scale & Proportion', 'Geometry Proofs'],
  8: ['Systems of Equations', 'Pythagorean Theorem', 'Linear Functions', 'Exponents & Roots', 'Statistics & Scatter Plots'],
};

// ── Procedural problem generators ─────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateProblem(grade: number, topic: string): Omit<MathProblem, 'id'> {
  const makeChoices = (correct: string, min: number, max: number, isInt = true): string[] => {
    const pool = new Set([correct]);
    let attempts = 0;
    while (pool.size < 4 && attempts < 30) {
      const delta = rand(-5, 5);
      if (delta === 0) { attempts++; continue; }
      const val = isInt ? (parseInt(correct) + delta).toString() : (parseFloat(correct) + delta * 0.1).toFixed(1);
      if (parseInt(val) >= min) pool.add(val);
      attempts++;
    }
    while (pool.size < 4) pool.add((parseInt(correct) + pool.size).toString());
    return shuffle([...pool]).slice(0, 4);
  };

  if (grade === 1) {
    if (topic.includes('Addition') || topic.includes('Counting')) {
      const a = rand(0, 9), b = rand(0, 9 - a);
      const ans = (a + b).toString();
      return { grade, topic, question: `What is ${a} + ${b}?`, answer: ans, choices: makeChoices(ans, 0, 18), hint: `Count up ${b} from ${a}` };
    }
    if (topic.includes('Subtraction')) {
      const a = rand(1, 10), b = rand(0, a);
      const ans = (a - b).toString();
      return { grade, topic, question: `What is ${a} − ${b}?`, answer: ans, choices: makeChoices(ans, 0, 10), hint: `Start at ${a} and count back ${b}` };
    }
    const shapes = [{ q: 'How many sides does a triangle have?', a: '3' }, { q: 'How many sides does a square have?', a: '4' }, { q: 'How many sides does a hexagon have?', a: '6' }];
    const s = shapes[rand(0, shapes.length - 1)];
    return { grade, topic: 'Shapes', question: s.q, answer: s.a, choices: ['3', '4', '5', '6'] };
  }

  if (grade === 2) {
    if (topic.includes('Addition')) {
      const a = rand(10, 90), b = rand(1, 99 - a);
      const ans = (a + b).toString();
      return { grade, topic, question: `${a} + ${b} = ?`, answer: ans, choices: makeChoices(ans, 0, 200), hint: `Add the ones first, then the tens` };
    }
    if (topic.includes('Subtraction')) {
      const a = rand(20, 100), b = rand(1, a - 1);
      const ans = (a - b).toString();
      return { grade, topic, question: `${a} − ${b} = ?`, answer: ans, choices: makeChoices(ans, 0, 100) };
    }
    if (topic.includes('Place')) {
      const n = rand(10, 99);
      const tens = Math.floor(n / 10), ones = n % 10;
      return { grade, topic, question: `What is the tens digit in ${n}?`, answer: tens.toString(), choices: shuffle([tens.toString(), ones.toString(), (tens + 1).toString(), (tens - 1 < 0 ? tens + 2 : tens - 1).toString()]) };
    }
    const a = rand(1, 11), b = rand(1, 11);
    const ans = (a + b).toString();
    return { grade, topic, question: `${a} + ${b} = ?`, answer: ans, choices: makeChoices(ans, 0, 24) };
  }

  if (grade === 3) {
    if (topic.includes('Multiplication')) {
      const a = rand(2, 9), b = rand(2, 9);
      const ans = (a * b).toString();
      return { grade, topic, question: `${a} × ${b} = ?`, answer: ans, choices: makeChoices(ans, 1, 100), hint: `${a} groups of ${b}` };
    }
    if (topic.includes('Division')) {
      const b = rand(2, 9), ans = rand(2, 9);
      const a = b * ans;
      return { grade, topic, question: `${a} ÷ ${b} = ?`, answer: ans.toString(), choices: makeChoices(ans.toString(), 1, 81) };
    }
    if (topic.includes('Fraction')) {
      const denoms = [2, 3, 4, 6, 8];
      const d = denoms[rand(0, denoms.length - 1)];
      const n = rand(1, d - 1);
      const bigger = n > d / 2 ? 'more than half' : n === d / 2 ? 'exactly half' : 'less than half';
      return { grade, topic, question: `Is the fraction ${n}/${d} less than, equal to, or more than half?`, answer: bigger, choices: shuffle(['less than half', 'exactly half', 'more than half', 'equal to one']) };
    }
    const a = rand(3, 9), b = rand(3, 9);
    return { grade, topic, question: `What is the perimeter of a rectangle with sides ${a} and ${b}?`, answer: (2 * (a + b)).toString(), choices: makeChoices((2 * (a + b)).toString(), 10, 80) };
  }

  if (grade === 4) {
    if (topic.includes('Multiplication')) {
      const a = rand(12, 99), b = rand(2, 9);
      const ans = (a * b).toString();
      return { grade, topic, question: `${a} × ${b} = ?`, answer: ans, choices: makeChoices(ans, 10, 900) };
    }
    if (topic.includes('Division')) {
      const b = rand(2, 9), ans = rand(10, 20);
      const a = b * ans;
      return { grade, topic, question: `${a} ÷ ${b} = ?`, answer: ans.toString(), choices: makeChoices(ans.toString(), 1, 100) };
    }
    if (topic.includes('Fraction')) {
      const d = rand(2, 8), n1 = rand(1, d - 1), n2 = rand(1, d - 1);
      const sum = n1 + n2;
      return { grade, topic, question: `${n1}/${d} + ${n2}/${d} = ?`, answer: `${sum}/${d}`, choices: shuffle([`${sum}/${d}`, `${sum + 1}/${d}`, `${sum - 1}/${d}`, `${n1 * n2}/${d}`]) };
    }
    const n = rand(10, 99);
    return { grade, topic, question: `What are all the factors of ${n}?`, answer: factors(n).join(', '), choices: shuffle([factors(n).join(', '), factors(n + 1).join(', '), factors(n - 1).join(', '), factors(n + 2).join(', ')]) };
  }

  if (grade === 5) {
    if (topic.includes('Decimal')) {
      const a = rand(10, 99) / 10, b = rand(10, 99) / 10;
      const ans = (Math.round((a + b) * 10) / 10).toString();
      return { grade, topic, question: `${a.toFixed(1)} + ${b.toFixed(1)} = ?`, answer: ans, choices: [ans, (parseFloat(ans) + 0.1).toFixed(1), (parseFloat(ans) - 0.1).toFixed(1), (parseFloat(ans) + 0.2).toFixed(1)] };
    }
    if (topic.includes('Percent')) {
      const pcts = [10, 20, 25, 50];
      const pct = pcts[rand(0, pcts.length - 1)];
      const base = rand(2, 20) * 10;
      const ans = ((pct / 100) * base).toString();
      return { grade, topic, question: `What is ${pct}% of ${base}?`, answer: ans, choices: makeChoices(ans, 0, 200) };
    }
    const length = rand(3, 8), width = rand(3, 8), height = rand(3, 8);
    const vol = length * width * height;
    return { grade, topic, question: `Volume of a box: length=${length}, width=${width}, height=${height}. Volume = ?`, answer: vol.toString(), choices: makeChoices(vol.toString(), 10, 600) };
  }

  if (grade === 6) {
    if (topic.includes('Ratio')) {
      const a = rand(2, 6), b = rand(2, 6), mult = rand(2, 5);
      return { grade, topic, question: `The ratio of apples to oranges is ${a}:${b}. If there are ${a * mult} apples, how many oranges?`, answer: (b * mult).toString(), choices: makeChoices((b * mult).toString(), 1, 50) };
    }
    if (topic.includes('Percent')) {
      const sale = rand(10, 50) * 2;
      const off = [10, 20, 25, 50][rand(0, 3)];
      const saving = sale * off / 100;
      const final = sale - saving;
      return { grade, topic, question: `A jacket costs $${sale}. It's ${off}% off. What's the sale price?`, answer: `$${final}`, choices: [`$${final}`, `$${final + 5}`, `$${final - 5}`, `$${saving}`] };
    }
    const x = rand(2, 10);
    const rhs = x * rand(2, 5) + rand(1, 10);
    const coeff = rand(2, 5);
    const ans = rand(2, 10);
    return { grade, topic, question: `If ${coeff}x = ${coeff * ans}, what is x?`, answer: ans.toString(), choices: makeChoices(ans.toString(), 1, 20) };
  }

  if (grade === 7) {
    if (topic.includes('Linear')) {
      const m = rand(1, 5), b = rand(-5, 5);
      const x = rand(1, 8);
      const y = m * x + b;
      return { grade, topic, question: `y = ${m}x + ${b}. When x = ${x}, y = ?`, answer: y.toString(), choices: makeChoices(y.toString(), -20, 50) };
    }
    if (topic.includes('Probability')) {
      const colors = rand(2, 5), blue = rand(1, colors - 1);
      const fraction = `${blue}/${colors}`;
      return { grade, topic, question: `A bag has ${colors} marbles. ${blue} are blue. If you pick one at random, what is the probability of picking blue?`, answer: fraction, choices: shuffle([fraction, `${blue + 1}/${colors}`, `${blue}/${colors + 1}`, `${colors - blue}/${colors}`]) };
    }
    const a = rand(3, 12), b = rand(3, 12), c = rand(3, 12);
    const ans = Math.round(Math.sqrt(a * a + b * b) * 10) / 10;
    return { grade, topic, question: `In a right triangle with legs ${a} and ${b}, find the hypotenuse (round to 1 decimal).`, answer: ans.toFixed(1), choices: [ans.toFixed(1), (ans + 0.5).toFixed(1), (ans - 0.5).toFixed(1), (ans + 1).toFixed(1)] };
  }

  if (grade === 8) {
    if (topic.includes('Pythagorean')) {
      const legs = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10]];
      const [a, b, c] = legs[rand(0, legs.length - 1)];
      return { grade, topic, question: `A right triangle has legs ${a} and ${b}. What is the hypotenuse?`, answer: c.toString(), choices: makeChoices(c.toString(), 1, 30) };
    }
    if (topic.includes('Exponent')) {
      const base = rand(2, 5), exp = rand(2, 4);
      const ans = Math.pow(base, exp);
      return { grade, topic, question: `${base}^${exp} = ?`, answer: ans.toString(), choices: makeChoices(ans.toString(), 1, 200) };
    }
    if (topic.includes('Linear Function')) {
      const m = rand(1, 4), b = rand(-5, 5);
      return { grade, topic, question: `What is the slope of the line y = ${m}x + ${b}?`, answer: m.toString(), choices: shuffle([m.toString(), b.toString(), (m + 1).toString(), (m - 1).toString()]) };
    }
    const x1 = rand(1, 5), y1 = rand(1, 8), x2 = rand(6, 10), y2 = rand(1, 8);
    const dist = Math.round(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) * 10) / 10;
    return { grade, topic, question: `Distance between (${x1}, ${y1}) and (${x2}, ${y2})? (Round to 1 decimal)`, answer: dist.toFixed(1), choices: [dist.toFixed(1), (dist + 0.5).toFixed(1), (dist - 0.5).toFixed(1), (dist + 1).toFixed(1)] };
  }

  // Fallback
  const a = rand(10, 50), b = rand(10, 50);
  const ans = (a + b).toString();
  return { grade, topic, question: `${a} + ${b} = ?`, answer: ans, choices: makeChoices(ans, 10, 110) };
}

function factors(n: number): number[] {
  const result = [];
  for (let i = 1; i <= n; i++) {
    if (n % i === 0) result.push(i);
  }
  return result;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// ── Flash Card ─────────────────────────────────────────────────────────────────
const FlashCard: React.FC<{ problem: MathProblem; onFlag: () => void }> = ({ problem, onFlag }) => {
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => { setFlipped(false); setShowHint(false); }, [problem.id]);

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        className="w-full max-w-sm cursor-pointer"
        onClick={() => setFlipped(f => !f)}
        style={{ perspective: 1000 }}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.45, type: 'spring', stiffness: 300, damping: 30 }}
          style={{ transformStyle: 'preserve-3d', position: 'relative', height: 220 }}
        >
          {/* Front */}
          <div style={{ backfaceVisibility: 'hidden' }} className="absolute inset-0 bg-gradient-to-br from-violet-900/60 to-purple-800/40 border border-purple-500/30 rounded-[2rem] flex flex-col items-center justify-center p-6 shadow-2xl">
            <span className="text-[9px] font-black uppercase tracking-widest text-purple-300/60 mb-4">Question</span>
            <p className="text-2xl font-black text-white text-center leading-snug">{problem.question}</p>
            <p className="text-[9px] text-white/30 mt-6">Tap to reveal answer</p>
          </div>
          {/* Back */}
          <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} className="absolute inset-0 bg-gradient-to-br from-green-900/60 to-emerald-800/40 border border-green-500/30 rounded-[2rem] flex flex-col items-center justify-center p-6 shadow-2xl">
            <span className="text-[9px] font-black uppercase tracking-widest text-green-300/60 mb-4">Answer</span>
            <p className="text-3xl font-black text-white text-center">{problem.answer}</p>
            {problem.hint && <p className="text-xs text-white/50 mt-4 text-center">💡 {problem.hint}</p>}
          </div>
        </motion.div>
      </motion.div>

      <div className="flex items-center gap-2">
        {!showHint && problem.hint && (
          <button onClick={() => setShowHint(true)} className="px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full text-[9px] font-black uppercase tracking-widest text-amber-400">
            💡 Hint
          </button>
        )}
        {showHint && problem.hint && <p className="text-xs text-amber-300/70 italic">{problem.hint}</p>}
        <button onClick={onFlag} className="flex items-center gap-1 px-3 py-1.5 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-orange-400 transition-all">
          <Flag size={10} /> Report
        </button>
      </div>
    </div>
  );
};

// ── Quiz Mode ──────────────────────────────────────────────────────────────────
const QuizMode: React.FC<{
  problems: MathProblem[];
  onComplete: (result: QuizResult) => void;
}> = ({ problems, onComplete }) => {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const startRef = useRef(Date.now());
  const problem = problems[index];

  const handleSelect = (choice: string) => {
    if (selected) return;
    setSelected(choice);
    if (choice === problem.answer) setCorrect(c => c + 1);
    setTimeout(() => {
      if (index + 1 < problems.length) {
        setIndex(i => i + 1);
        setSelected(null);
      } else {
        onComplete({
          correct: correct + (choice === problem.answer ? 1 : 0),
          total: problems.length,
          grade: problem.grade,
          topic: problem.topic,
          timeSeconds: Math.round((Date.now() - startRef.current) / 1000),
        });
      }
    }, 900);
  };

  const progress = (index / problems.length) * 100;

  return (
    <div className="flex flex-col gap-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div className="h-full bg-purple-500" animate={{ width: `${progress}%` }} />
        </div>
        <span className="text-[9px] font-black text-white/40">{index + 1}/{problems.length}</span>
      </div>

      <div className="bg-white/[0.04] border border-white/[0.08] rounded-[1.5rem] p-6">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Grade {problem.grade} · {problem.topic}</p>
        <p className="text-xl font-black text-white leading-snug">{problem.question}</p>
        {problem.hint && <p className="text-xs text-amber-300/60 mt-2">💡 {problem.hint}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {problem.choices.map(choice => {
          const isCorrect = choice === problem.answer;
          const isSelected = selected === choice;
          let cls = 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]';
          if (isSelected && isCorrect) cls = 'bg-green-600/40 border border-green-500/60';
          else if (isSelected && !isCorrect) cls = 'bg-red-600/40 border border-red-500/60';
          else if (selected && isCorrect) cls = 'bg-green-600/20 border border-green-500/30';
          return (
            <motion.button
              key={choice}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleSelect(choice)}
              disabled={!!selected}
              className={`${cls} rounded-2xl p-4 text-sm font-bold text-white text-center transition-all`}
            >
              {choice}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

// ── Share Quiz Modal ───────────────────────────────────────────────────────────
const ShareModal: React.FC<{ result: QuizResult; problems: MathProblem[]; onClose: () => void }> = ({ result, problems, onClose }) => {
  const [copied, setCopied] = useState(false);
  const pct = Math.round((result.correct / result.total) * 100);
  const emoji = pct === 100 ? '🏆' : pct >= 80 ? '⭐' : pct >= 60 ? '✅' : '📚';
  const shareText = `${emoji} I scored ${result.correct}/${result.total} (${pct}%) on a Grade ${result.grade} Math quiz — ${result.topic}! Try it on Plajah Classrooms!`;

  const copy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const shareNative = () => navigator.share?.({ title: 'Plajah Math Quiz', text: shareText, url: window.location.href });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.85, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#12101a] border border-white/10 rounded-[2rem] p-6 w-full max-w-sm text-center"
      >
        <div className="text-5xl mb-3">{emoji}</div>
        <h2 className="text-2xl font-black text-white">{result.correct}/{result.total}</h2>
        <p className="text-white/50 text-sm mb-1">{pct}% correct · {result.timeSeconds}s</p>
        <p className="text-xs text-white/30 mb-6">Grade {result.grade} · {result.topic}</p>

        {/* Score bar */}
        <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-6">
          <motion.div
            className={`h-full rounded-full ${pct === 100 ? 'bg-amber-400' : pct >= 70 ? 'bg-green-500' : 'bg-purple-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8 }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={shareNative || copy} className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
            <Share2 size={13} /> Share Score
          </button>
          <button onClick={copy} className="w-full py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
            {copied ? <Check size={13} className="text-green-400" /> : null}
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
          <button onClick={onClose} className="text-white/30 text-xs py-2 hover:text-white/60 transition-colors">Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Admin Panel ────────────────────────────────────────────────────────────────
const AdminPanel: React.FC<{ user: any; onClose: () => void }> = ({ user, onClose }) => {
  const [flagged, setFlagged] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, 'math_flagged'), orderBy('count', 'desc')))
      .then(snap => setFlagged(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#12101a] border border-white/10 rounded-[2rem] p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-black text-white">Math Admin Panel</h2>
            <p className="text-xs text-white/40">Flagged problems from the community</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X size={14} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
        ) : flagged.length === 0 ? (
          <p className="text-center text-white/30 py-10">No flagged problems yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {flagged.map((f: any) => (
              <div key={f.id} className="p-4 bg-orange-900/20 border border-orange-500/20 rounded-xl">
                <p className="text-xs font-bold text-white mb-1">{f.question}</p>
                <p className="text-[9px] text-orange-300">Flagged {f.count || 1} time(s)</p>
                <p className="text-[9px] text-white/40 mt-1">Reason: {f.reason || 'Possibly incorrect'}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => deleteDoc(doc(db, 'math_flagged', f.id)).then(() => setFlagged(prev => prev.filter(x => x.id !== f.id)))}
                    className="flex items-center gap-1 px-2 py-1 bg-green-600/20 border border-green-500/30 rounded-lg text-[9px] font-black text-green-400"
                  >
                    <Check size={9} /> Resolved
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const GRADE_COLORS: Record<number, string> = {
  1: 'from-pink-600 to-rose-500',
  2: 'from-orange-600 to-amber-500',
  3: 'from-yellow-600 to-lime-500',
  4: 'from-green-600 to-emerald-500',
  5: 'from-teal-600 to-cyan-500',
  6: 'from-blue-600 to-indigo-500',
  7: 'from-indigo-600 to-violet-500',
  8: 'from-violet-600 to-purple-500',
};

const GRADE_EMOJI: Record<number, string> = { 1: '🌱', 2: '⭐', 3: '🚀', 4: '🎯', 5: '🔭', 6: '🔬', 7: '🧮', 8: '🏆' };

const MathClassroom: React.FC<Props> = ({ onBack, user }) => {
  const [grade, setGrade] = useState(3);
  const [topic, setTopic] = useState(GRADE_TOPICS[3][0]);
  const [mode, setMode] = useState<'flash' | 'quiz'>('flash');
  const [problem, setProblem] = useState<MathProblem>(() => ({ id: `gen_${Date.now()}`, ...generateProblem(3, GRADE_TOPICS[3][0]) }));
  const [quizProblems, setQuizProblems] = useState<MathProblem[]>([]);
  const [quizActive, setQuizActive] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [mathProf, setMathProf] = useState<Record<string, number>>({}); // standardId → mastery (signed-in)

  // Load the signed-in learner's saved math proficiency for before→after ledger deltas.
  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    loadProficiency(user.uid).then(p => { if (alive && p) setMathProf(p.byStandard || {}); });
    return () => { alive = false; };
  }, [user?.uid]);

  // Quiz finished → show result + write the standards-aligned Learner Ledger + award real points.
  const handleQuizComplete = (r: QuizResult) => {
    setQuizResult(r); setQuizActive(false); setShowShare(true);
    const score = Math.round((r.correct / r.total) * 100);
    const std = mathStandardForGrade(r.grade);
    if (std && user?.uid) {
      const before = mathProf[std.id] ?? 0;
      const after = mathProf[std.id] == null ? score : Math.round(before * 0.4 + score * 0.6); // EWMA, one quiz won't tank mastery
      setMathProf(m => ({ ...m, [std.id]: after }));
      appendRecord({ studentId: user.uid, standardId: std.id, framework: 'CCSS_MATH', source: 'math-classroom', masteryBefore: before, masteryAfter: after });
      if (r.correct > 0) addPoints(user.uid, r.correct * 2, 'DAILY_ACTIVITY', 'math-classroom', `${r.grade}-${r.topic}`).catch(() => {});
    }
  };
  const [showShare, setShowShare] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [flashIndex, setFlashIndex] = useState(0);
  const [flashDeck, setFlashDeck] = useState<MathProblem[]>([]);

  const isAdmin = user?.email?.includes('@plajah') || false;

  // Build flash deck
  useEffect(() => {
    const deck = Array.from({ length: 10 }, (_, i) => ({
      id: `flash_${grade}_${topic}_${i}_${Date.now()}`,
      ...generateProblem(grade, topic),
    }));
    setFlashDeck(deck);
    setFlashIndex(0);
  }, [grade, topic]);

  const currentFlash = flashDeck[flashIndex] || problem;

  const nextFlash = () => {
    if (flashIndex < flashDeck.length - 1) setFlashIndex(i => i + 1);
    else {
      const deck = Array.from({ length: 10 }, (_, i) => ({ id: `flash_${Date.now()}_${i}`, ...generateProblem(grade, topic) }));
      setFlashDeck(deck);
      setFlashIndex(0);
    }
  };

  const prevFlash = () => setFlashIndex(i => Math.max(0, i - 1));

  const startQuiz = () => {
    const probs = Array.from({ length: 8 }, (_, i) => ({ id: `quiz_${Date.now()}_${i}`, ...generateProblem(grade, topic) }));
    setQuizProblems(probs);
    setQuizActive(true);
    setQuizResult(null);
  };

  const handleFlag = async (prob: MathProblem) => {
    try {
      await addDoc(collection(db, 'math_flagged'), {
        question: prob.question,
        answer: prob.answer,
        grade: prob.grade,
        topic: prob.topic,
        count: 1,
        reason: 'Possibly incorrect',
        reportedAt: Date.now(),
        reportedBy: user?.uid || 'anonymous',
      });
    } catch { /* silently fail */ }
  };

  const handleGradeChange = (g: number) => {
    setGrade(g);
    const firstTopic = GRADE_TOPICS[g][0];
    setTopic(firstTopic);
    setQuizActive(false);
    setQuizResult(null);
  };

  return (
    <div className="min-h-screen bg-black/60 backdrop-blur-sm text-white">
      {/* ── BETA Banner ── */}
      <div className="bg-amber-950/50 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 backdrop-blur-sm">
        <AlertTriangle size={13} className="text-amber-400 shrink-0" />
        <p className="text-[9px] font-bold text-amber-200/80">
          <span className="font-black text-amber-400">BETA — Math Classroom</span> · Problems are procedurally generated and may occasionally contain errors. This is a demo/vision feature. Community members can flag incorrect problems using the report button. Admins can review and resolve flags.
        </p>
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/65 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-white">Math Classroom</h1>
                <span className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded text-[7px] font-black uppercase tracking-widest text-amber-400">BETA</span>
              </div>
              <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Grades 1–8 · Plajah Classrooms</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setShowAdmin(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/80 transition-all">
                <Settings size={11} /> Admin
              </button>
            )}
          </div>
        </div>

        {/* Grade selector */}
        <div className="overflow-x-auto custom-scrollbar -mx-2 px-2">
          <div className="flex gap-2 pb-2 min-w-max">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(g => (
              <button
                key={g}
                onClick={() => handleGradeChange(g)}
                className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${grade === g ? `bg-gradient-to-r ${GRADE_COLORS[g]} text-white shadow-lg` : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
              >
                {GRADE_EMOJI[g]} Grade {g}
              </button>
            ))}
          </div>
        </div>

        {/* Topic selector */}
        <div className="overflow-x-auto custom-scrollbar -mx-2 px-2 mt-1">
          <div className="flex gap-2 pb-1 min-w-max">
            {GRADE_TOPICS[grade].map(t => (
              <button
                key={t}
                onClick={() => { setTopic(t); setQuizActive(false); setQuizResult(null); }}
                className={`shrink-0 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${topic === t ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mt-2">
          {([['flash', '🃏 Flash Cards'], ['quiz', '⚡ Quiz Mode']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setQuizActive(false); setQuizResult(null); }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-lg mx-auto px-4 pt-6 pb-20">

        {mode === 'flash' && (
          <div className="flex flex-col gap-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={flashIndex}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              >
                <FlashCard problem={currentFlash} onFlag={() => handleFlag(currentFlash)} />
              </motion.div>
            </AnimatePresence>

            {/* Flash nav */}
            <div className="flex items-center justify-between px-4">
              <button onClick={prevFlash} disabled={flashIndex === 0} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/10 transition-all">
                <ChevronLeft size={18} />
              </button>
              <span className="text-[10px] font-black text-white/40">{flashIndex + 1} / {flashDeck.length}</span>
              <button onClick={nextFlash} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                <ChevronRight size={18} />
              </button>
            </div>

            <button
              onClick={() => {
                const deck = Array.from({ length: 10 }, (_, i) => ({ id: `flash_${Date.now()}_${i}`, ...generateProblem(grade, topic) }));
                setFlashDeck(deck);
                setFlashIndex(0);
              }}
              className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              <RefreshCw size={13} /> New Deck
            </button>
          </div>
        )}

        {mode === 'quiz' && !quizActive && !quizResult && (
          <div className="flex flex-col items-center gap-6 pt-8 text-center">
            <div className={`w-24 h-24 rounded-[2rem] bg-gradient-to-br ${GRADE_COLORS[grade]} flex items-center justify-center text-4xl shadow-2xl`}>
              {GRADE_EMOJI[grade]}
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Grade {grade} Quiz</h2>
              <p className="text-white/50 text-sm mt-1">{topic}</p>
              <p className="text-white/30 text-xs mt-2">8 questions · Timed</p>
            </div>
            <button
              onClick={startQuiz}
              className={`flex items-center gap-2 px-8 py-4 bg-gradient-to-r ${GRADE_COLORS[grade]} rounded-[2rem] text-sm font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all`}
            >
              <Zap size={16} /> Start Quiz
            </button>
          </div>
        )}

        {mode === 'quiz' && quizActive && (
          <QuizMode
            problems={quizProblems}
            onComplete={handleQuizComplete}
          />
        )}

        {mode === 'quiz' && quizResult && !quizActive && (
          <div className="flex flex-col items-center gap-6 pt-8 text-center">
            <p className="text-5xl">{quizResult.correct === quizResult.total ? '🏆' : '⭐'}</p>
            <div>
              <h2 className="text-3xl font-black text-white">{quizResult.correct}/{quizResult.total}</h2>
              <p className="text-white/40 text-sm mt-1">{Math.round(quizResult.correct / quizResult.total * 100)}% correct in {quizResult.timeSeconds}s</p>
            </div>
            {(() => {
              const pct = Math.round(quizResult.correct / quizResult.total * 100);
              const std = mathStandardForGrade(quizResult.grade);
              const after = std ? mathProf[std.id] : undefined;
              return (
                <div className="flex flex-col items-center gap-2">
                  {std && typeof after === 'number' && (() => { const b = bandFor(after); return (
                    <div className="text-xs font-black" style={{ color: b.color }}>{std.code} proficiency · {b.label} · {after}%</div>
                  ); })()}
                  {user?.uid && <div className="text-[10px] text-white/30 uppercase tracking-widest">Saved to your Learner Ledger</div>}
                  {pct >= 90 && (
                    <div className="mt-1 px-4 py-2 rounded-xl text-[11px] font-black" style={{ background: 'rgba(255,140,0,0.14)', color: '#FF8C00', border: '1px solid rgba(255,140,0,0.4)' }}>
                      ⚡ Turbo — you're ready for Grade {Math.min(8, quizResult.grade + 1)}!
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex gap-3">
              <button onClick={startQuiz} className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
                <RefreshCw size={13} /> Try Again
              </button>
              <button onClick={() => setShowShare(true)} className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
                <Share2 size={13} /> Share
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showShare && quizResult && (
          <ShareModal result={quizResult} problems={quizProblems} onClose={() => setShowShare(false)} />
        )}
        {showAdmin && (
          <AdminPanel user={user} onClose={() => setShowAdmin(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MathClassroom;
