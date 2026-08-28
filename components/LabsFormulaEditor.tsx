import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Copy, Check, Download, RefreshCw, BookOpen, ChevronDown } from 'lucide-react';

// ── KaTeX loaded dynamically from CDN ─────────────────────────────────────────

let katexLoaded = false;
let katexLoading = false;
const katexCallbacks: (() => void)[] = [];

function loadKaTeX(): Promise<void> {
  return new Promise(resolve => {
    if (katexLoaded) { resolve(); return; }
    katexCallbacks.push(resolve);
    if (katexLoading) return;
    katexLoading = true;

    // CSS
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);
    }

    // JS
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.onload = () => {
      katexLoaded = true;
      katexCallbacks.forEach(cb => cb());
      katexCallbacks.length = 0;
    };
    script.onerror = () => { katexCallbacks.forEach(cb => cb()); };
    document.head.appendChild(script);
  });
}

function renderKaTeX(latex: string, displayMode: boolean): string {
  try {
    const katex = (window as any).katex;
    if (!katex) return '';
    return katex.renderToString(latex, { displayMode, throwOnError: false, output: 'html' });
  } catch (e: any) {
    return `<span style="color:#f87171;font-family:monospace;font-size:12px">${e.message}</span>`;
  }
}

// ── Formula palette ───────────────────────────────────────────────────────────

interface PaletteSection {
  label: string;
  items: { display: string; latex: string; desc: string }[];
}

const PALETTE: PaletteSection[] = [
  {
    label: 'Greek Letters',
    items: [
      { display: 'α', latex: '\\alpha', desc: 'alpha' },
      { display: 'β', latex: '\\beta', desc: 'beta' },
      { display: 'γ', latex: '\\gamma', desc: 'gamma' },
      { display: 'δ', latex: '\\delta', desc: 'delta' },
      { display: 'ε', latex: '\\varepsilon', desc: 'epsilon' },
      { display: 'ζ', latex: '\\zeta', desc: 'zeta' },
      { display: 'η', latex: '\\eta', desc: 'eta' },
      { display: 'θ', latex: '\\theta', desc: 'theta' },
      { display: 'λ', latex: '\\lambda', desc: 'lambda' },
      { display: 'μ', latex: '\\mu', desc: 'mu' },
      { display: 'ν', latex: '\\nu', desc: 'nu' },
      { display: 'π', latex: '\\pi', desc: 'pi' },
      { display: 'σ', latex: '\\sigma', desc: 'sigma' },
      { display: 'τ', latex: '\\tau', desc: 'tau' },
      { display: 'φ', latex: '\\varphi', desc: 'phi' },
      { display: 'ψ', latex: '\\psi', desc: 'psi' },
      { display: 'ω', latex: '\\omega', desc: 'omega' },
      { display: 'Σ', latex: '\\Sigma', desc: 'Sigma' },
      { display: 'Π', latex: '\\Pi', desc: 'Pi' },
      { display: 'Ω', latex: '\\Omega', desc: 'Omega' },
      { display: 'Δ', latex: '\\Delta', desc: 'Delta' },
      { display: 'Γ', latex: '\\Gamma', desc: 'Gamma' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { display: 'x²', latex: 'x^{2}', desc: 'power' },
      { display: 'xₙ', latex: 'x_{n}', desc: 'subscript' },
      { display: '√', latex: '\\sqrt{x}', desc: 'square root' },
      { display: '∛', latex: '\\sqrt[3]{x}', desc: 'cube root' },
      { display: 'ᵃ/ᵦ', latex: '\\frac{a}{b}', desc: 'fraction' },
      { display: '∑', latex: '\\sum_{i=0}^{n}', desc: 'sum' },
      { display: '∏', latex: '\\prod_{i=1}^{n}', desc: 'product' },
      { display: '∫', latex: '\\int_{a}^{b}', desc: 'integral' },
      { display: '∬', latex: '\\iint', desc: 'double integral' },
      { display: '∮', latex: '\\oint', desc: 'contour integral' },
      { display: '∂', latex: '\\partial', desc: 'partial deriv.' },
      { display: '∇', latex: '\\nabla', desc: 'nabla/del' },
      { display: 'lim', latex: '\\lim_{x \\to \\infty}', desc: 'limit' },
      { display: 'log', latex: '\\log_{b}', desc: 'logarithm' },
      { display: '∞', latex: '\\infty', desc: 'infinity' },
    ],
  },
  {
    label: 'Relations',
    items: [
      { display: '≠', latex: '\\neq', desc: 'not equal' },
      { display: '≤', latex: '\\leq', desc: 'less or equal' },
      { display: '≥', latex: '\\geq', desc: 'greater or equal' },
      { display: '≈', latex: '\\approx', desc: 'approx' },
      { display: '≡', latex: '\\equiv', desc: 'equivalent' },
      { display: '∝', latex: '\\propto', desc: 'proportional' },
      { display: '∈', latex: '\\in', desc: 'element of' },
      { display: '∉', latex: '\\notin', desc: 'not element' },
      { display: '⊂', latex: '\\subset', desc: 'subset' },
      { display: '⊆', latex: '\\subseteq', desc: 'subset or equal' },
      { display: '∪', latex: '\\cup', desc: 'union' },
      { display: '∩', latex: '\\cap', desc: 'intersection' },
      { display: '→', latex: '\\rightarrow', desc: 'arrow' },
      { display: '⟺', latex: '\\iff', desc: 'iff' },
      { display: '∀', latex: '\\forall', desc: 'for all' },
      { display: '∃', latex: '\\exists', desc: 'there exists' },
    ],
  },
  {
    label: 'Templates',
    items: [
      { display: 'Matrix', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', desc: '2×2 matrix' },
      { display: 'System', latex: '\\begin{cases} f(x) & x > 0 \\\\ g(x) & x \\leq 0 \\end{cases}', desc: 'piecewise' },
      { display: 'Binomial', latex: '\\binom{n}{k} = \\frac{n!}{k!(n-k)!}', desc: 'binomial coeff' },
      { display: 'E=mc²', latex: 'E = mc^{2}', desc: 'Einstein' },
      { display: 'Euler', latex: 'e^{i\\pi} + 1 = 0', desc: "Euler's identity" },
      { display: 'Normal', latex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}', desc: 'normal dist.' },
      { display: 'Maxwell', latex: '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}', desc: "Maxwell's eq." },
      { display: 'Schrödinger', latex: 'i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi', desc: 'Schrödinger eq.' },
      { display: 'Taylor', latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n', desc: 'Taylor series' },
      { display: 'Fourier', latex: '\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\,e^{-2\\pi i x\\xi}\\,dx', desc: 'Fourier transform' },
    ],
  },
];

// ── Saved formula ─────────────────────────────────────────────────────────────

interface SavedFormula { id: string; latex: string; label: string; displayMode: boolean; savedAt: number; }
const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ── Main Component ────────────────────────────────────────────────────────────

interface Props { currentUser: any; onBack: () => void; }

const LabsFormulaEditor: React.FC<Props> = ({ currentUser, onBack }) => {
  const [latex, setLatex] = useState('E = mc^{2}');
  const [displayMode, setDisplayMode] = useState(true);
  const [rendered, setRendered] = useState('');
  const [katexReady, setKatexReady] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<SavedFormula[]>([]);
  const [label, setLabel] = useState('');
  const [openSection, setOpenSection] = useState<string | null>('Templates');
  const previewRef = useRef<HTMLDivElement>(null);

  const sKey = `labsFormulas_${currentUser?.uid ?? 'guest'}`;
  useEffect(() => { try { const s = localStorage.getItem(sKey); if (s) setSaved(JSON.parse(s)); } catch {} }, [sKey]);

  // Load KaTeX
  useEffect(() => {
    loadKaTeX().then(() => setKatexReady(true));
  }, []);

  // Re-render on latex/mode/ready change
  useEffect(() => {
    if (!katexReady) { setRendered(''); return; }
    try {
      const html = renderKaTeX(latex, displayMode);
      setRendered(html); setRenderError('');
    } catch (e: any) {
      setRenderError(e.message); setRendered('');
    }
  }, [latex, displayMode, katexReady]);

  const insertAt = useCallback((insert: string) => {
    setLatex(prev => prev + (prev && !prev.endsWith(' ') && !insert.startsWith(' ') ? ' ' : '') + insert);
  }, []);

  const copyLatex = () => { navigator.clipboard.writeText(latex); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyInline = () => { navigator.clipboard.writeText(`$${latex}$`); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyBlock = () => { navigator.clipboard.writeText(`$$\n${latex}\n$$`); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const saveFormula = () => {
    const formula: SavedFormula = { id: uid_short(), latex, label: label || latex.slice(0, 40), displayMode, savedAt: Date.now() };
    const updated = [formula, ...saved];
    setSaved(updated); localStorage.setItem(sKey, JSON.stringify(updated)); setLabel('');
  };

  return (
    <div className="min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
        <button onClick={onBack} className="text-white/30 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">∑</span>
            <h1 className="font-black text-white text-sm">Formula Editor</h1>
          </div>
          <p className="text-[8px] text-white/25 uppercase tracking-widest mt-0.5">LaTeX · KaTeX renderer · Museion</p>
        </div>
        {!katexReady && <span className="flex items-center gap-1.5 text-[9px] text-white/30"><RefreshCw size={10} className="animate-spin" /> Loading KaTeX…</span>}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: Input + palette */}
          <div className="space-y-4">
            {/* LaTeX input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30">LaTeX Input</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setDisplayMode(false)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${!displayMode ? 'bg-white text-black' : 'bg-white/5 text-white/30 hover:text-white'}`}>
                    Inline $…$
                  </button>
                  <button onClick={() => setDisplayMode(true)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${displayMode ? 'bg-white text-black' : 'bg-white/5 text-white/30 hover:text-white'}`}>
                    Display $$…$$
                  </button>
                </div>
              </div>
              <textarea
                value={latex}
                onChange={e => setLatex(e.target.value)}
                rows={5}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-sm text-white font-mono focus:outline-none focus:border-white/25 resize-none leading-relaxed placeholder:text-white/20"
                placeholder="E = mc^{2}"
              />
            </div>

            {/* Copy options */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={copyLatex} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-white/40 hover:text-white transition-all">
                {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />} Copy LaTeX
              </button>
              <button onClick={copyInline} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-white/40 hover:text-white transition-all">
                <Copy size={10} /> Copy Inline ($…$)
              </button>
              <button onClick={copyBlock} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-white/40 hover:text-white transition-all">
                <Copy size={10} /> Copy Block ($$…$$)
              </button>
            </div>

            {/* Save */}
            <div className="flex gap-2">
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)…"
                className="flex-1 px-3 py-2 bg-white/5 border border-white/8 rounded-xl text-xs text-white placeholder:text-white/20 focus:outline-none" />
              <button onClick={saveFormula} className="px-4 py-2 bg-[#6B0099]/20 border border-[#6B0099]/30 text-[#c084fc] rounded-xl text-[9px] font-black uppercase hover:brightness-125 transition-all">Save</button>
            </div>

            {/* Symbol palette */}
            <div className="space-y-2">
              {PALETTE.map(section => (
                <div key={section.label} className="border border-white/8 rounded-2xl overflow-hidden">
                  <button onClick={() => setOpenSection(openSection === section.label ? null : section.label)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.05] transition-all">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{section.label}</span>
                    <ChevronDown size={12} className={`text-white/20 transition-transform ${openSection === section.label ? 'rotate-180' : ''}`} />
                  </button>
                  {openSection === section.label && (
                    <div className="p-3 flex flex-wrap gap-1.5">
                      {section.items.map(item => (
                        <button key={item.latex} onClick={() => insertAt(item.latex)} title={`${item.desc}: ${item.latex}`}
                          className="px-2.5 py-1.5 bg-white/5 border border-white/8 rounded-xl text-sm text-white hover:bg-white/10 hover:border-white/20 transition-all font-mono">
                          {item.display}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Preview + saved */}
          <div className="space-y-4">
            {/* Preview */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Preview</label>
              <div className="min-h-32 p-6 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center justify-center">
                {!katexReady ? (
                  <div className="flex items-center gap-2 text-white/30"><RefreshCw size={14} className="animate-spin" /><span className="text-sm">Loading renderer…</span></div>
                ) : renderError ? (
                  <p className="text-sm text-red-400 font-mono">{renderError}</p>
                ) : (
                  <div ref={previewRef} className="katex-preview text-white" dangerouslySetInnerHTML={{ __html: rendered }} />
                )}
              </div>
              <p className="text-[8px] text-white/15 mt-2 text-center font-mono">Rendered with KaTeX · {displayMode ? 'Display mode' : 'Inline mode'}</p>
            </div>

            {/* Saved formulas */}
            {saved.length > 0 && (
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Saved Formulas</label>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {saved.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/6 rounded-xl group">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-white/70 truncate">{f.label}</p>
                        <p className="text-[8px] text-white/30 font-mono truncate">{f.latex}</p>
                      </div>
                      <button onClick={() => setLatex(f.latex)} className="text-[8px] font-black text-white/30 hover:text-white transition-colors px-2 py-1 bg-white/5 rounded-lg">Use</button>
                      <button onClick={() => { const u = saved.filter(x => x.id !== f.id); setSaved(u); localStorage.setItem(sKey, JSON.stringify(u)); }} className="text-white/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick reference */}
            <div className="p-4 bg-white/[0.02] border border-white/6 rounded-2xl">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-3">Quick Reference</p>
              <div className="grid grid-cols-2 gap-y-1.5">
                {[
                  ['Fraction', '\\frac{a}{b}'], ['Power', 'x^{n}'], ['Subscript', 'x_{i}'],
                  ['Square root', '\\sqrt{x}'], ['Sum', '\\sum_{i}^{n}'], ['Integral', '\\int_{a}^{b}'],
                  ['Bold', '\\mathbf{v}'], ['Hat', '\\hat{x}'], ['Bar', '\\bar{x}'],
                ].map(([name, code]) => (
                  <button key={name} onClick={() => insertAt(code)}
                    className="flex items-start gap-2 text-left hover:bg-white/[0.04] rounded-lg px-2 py-1 transition-all">
                    <span className="text-[8px] text-white/30 shrink-0 w-16">{name}</span>
                    <span className="text-[8px] font-mono text-white/50">{code}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`.katex-preview .katex{font-size:1.4em}.katex-preview .katex-display{margin:0}`}</style>
    </div>
  );
};

export default LabsFormulaEditor;
