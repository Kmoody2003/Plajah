'use client';
import React, { useState } from 'react';
import { X } from 'lucide-react';

/**
 * BodyChemistryPanel — the biochemical "makeup" layer of the Human Body module: blood composition,
 * body fluids, electrolytes/minerals, cell types, and the endocrine glands + their hormones.
 * Data + presentation only (no 3D). Opened from the Human Body experience. Plajah dark-glass design.
 */

type Tab = 'blood' | 'fluids' | 'electrolytes' | 'cells' | 'glands';

const BLOOD = {
  intro: 'About 5 litres — roughly 8% of body weight. A living tissue that carries oxygen, nutrients, heat, hormones and immune cells, and clots to seal wounds.',
  parts: [
    { name: 'Plasma', pct: 55, color: '#F5D76E', detail: '~90% water plus proteins (albumin, clotting factors, antibodies), electrolytes, glucose, hormones and wastes. The straw-coloured fluid everything else floats in.' },
    { name: 'Red blood cells', pct: 44, color: '#D40055', detail: 'Erythrocytes — carry oxygen on haemoglobin (iron-based). ~25 trillion cells, ~5 million per µL, no nucleus, live ~120 days. Made in red bone marrow.' },
    { name: 'White blood cells', pct: 0.7, color: '#E8ECF4', detail: 'Leukocytes — the immune force: neutrophils, lymphocytes (B & T), monocytes, eosinophils, basophils. 4,000–11,000 per µL.' },
    { name: 'Platelets', pct: 0.3, color: '#00DAF3', detail: 'Thrombocytes — cell fragments that plug leaks and trigger clotting cascades. 150,000–400,000 per µL.' },
  ],
};

const FLUIDS = [
  { name: 'Intracellular fluid', color: '#8B5CF6', detail: 'Fluid inside cells — ~⅔ of all body water (~28 L). Rich in potassium, phosphate and proteins.' },
  { name: 'Interstitial fluid', color: '#06D6A0', detail: 'Bathes the cells between blood and tissue; delivers nutrients and carries waste to lymph and blood.' },
  { name: 'Blood plasma', color: '#F5D76E', detail: 'The fluid portion of blood — the transport highway (see the Blood tab).' },
  { name: 'Lymph', color: '#00DAF3', detail: 'Excess interstitial fluid returned to the blood via lymph vessels; carries immune cells and fats from the gut.' },
  { name: 'Cerebrospinal fluid', color: '#A78BFA', detail: 'Cushions and feeds the brain and spinal cord; ~150 mL, fully replaced ~4× a day.' },
  { name: 'Synovial fluid', color: '#FF8C00', detail: 'Egg-white-like lubricant in joints — reduces friction and nourishes cartilage.' },
];

const ELECTROLYTES = [
  { sym: 'Na⁺', name: 'Sodium', color: '#00DAF3', range: '135–145 mmol/L', role: 'Fluid balance, nerve impulses, muscle contraction. The main ion outside cells.' },
  { sym: 'K⁺', name: 'Potassium', color: '#8B5CF6', range: '3.5–5.0 mmol/L', role: 'Heart rhythm and nerve/muscle signalling. The main ion inside cells.' },
  { sym: 'Ca²⁺', name: 'Calcium', color: '#E8ECF4', range: '2.2–2.6 mmol/L', role: 'Bone and teeth, muscle contraction, clotting, neurotransmitter release.' },
  { sym: 'Cl⁻', name: 'Chloride', color: '#06D6A0', range: '96–106 mmol/L', role: 'Fluid balance and stomach acid (HCl); partners with sodium.' },
  { sym: 'Mg²⁺', name: 'Magnesium', color: '#FF8C00', range: '0.7–1.0 mmol/L', role: 'Cofactor for 300+ enzymes, energy (ATP), nerve and muscle function.' },
  { sym: 'PO₄³⁻', name: 'Phosphate', color: '#D40055', range: '0.8–1.5 mmol/L', role: 'Bone, DNA/RNA backbone, ATP energy currency, cell membranes.' },
  { sym: 'HCO₃⁻', name: 'Bicarbonate', color: '#F5D76E', range: '22–29 mmol/L', role: 'The blood’s main pH buffer — keeps you near pH 7.4.' },
];

const CELLS = [
  { name: 'Epithelial', color: '#00DAF3', detail: 'Sheets that line and cover surfaces — skin, gut, airways, glands. Protection, absorption, secretion.' },
  { name: 'Connective', color: '#F5D76E', detail: 'Support and bind — bone, cartilage, fat, tendon, and blood. Cells scattered in a matrix.' },
  { name: 'Muscle', color: '#D40055', detail: 'Contract to move: skeletal (voluntary), cardiac (the heart), smooth (organs/vessels).' },
  { name: 'Nerve', color: '#A78BFA', detail: 'Neurons carry electrical signals; glia support them. The body’s wiring and control.' },
  { name: 'Blood', color: '#EF4444', detail: 'Red cells (oxygen), white cells (defence), platelets (clotting) — a fluid tissue.' },
  { name: 'Stem cells', color: '#06D6A0', detail: 'Unspecialised cells that renew tissue and can become other cell types.' },
];

const GLANDS = [
  { name: 'Pituitary', color: '#8B5CF6', hormones: 'GH, TSH, ACTH, FSH/LH, prolactin, ADH, oxytocin', role: 'The "master gland" at the brain’s base — directs other glands.' },
  { name: 'Thyroid', color: '#00DAF3', hormones: 'T3, T4, calcitonin', role: 'Sets metabolic rate; regulates energy, temperature and growth.' },
  { name: 'Parathyroid', color: '#06D6A0', hormones: 'PTH', role: 'Raises blood calcium — pulls it from bone when needed.' },
  { name: 'Adrenal', color: '#FF8C00', hormones: 'Cortisol, aldosterone, adrenaline', role: 'Stress response, salt/water balance, fight-or-flight.' },
  { name: 'Pancreas', color: '#F5D76E', hormones: 'Insulin, glucagon', role: 'Controls blood sugar; also makes digestive enzymes.' },
  { name: 'Gonads', color: '#D40055', hormones: 'Oestrogen/progesterone, testosterone', role: 'Reproduction and secondary sex characteristics.' },
  { name: 'Pineal', color: '#A78BFA', hormones: 'Melatonin', role: 'Sets the sleep–wake clock in response to light.' },
  { name: 'Thymus', color: '#E8ECF4', hormones: 'Thymosins', role: 'Trains T-cells for the immune system (most active in childhood).' },
];

const TABS: { id: Tab; label: string }[] = [
  { id: 'blood', label: 'Blood' }, { id: 'fluids', label: 'Fluids' },
  { id: 'electrolytes', label: 'Electrolytes' }, { id: 'cells', label: 'Cell Types' }, { id: 'glands', label: 'Glands' },
];

const BodyChemistryPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('blood');
  return (
    <div className="pj-chem" onClick={onClose}>
      <style>{CHEM_CSS}</style>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="chd">
          <div>
            <div className="eyebrow">Body chemistry</div>
            <h2>What you’re made of</h2>
          </div>
          <button className="xbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        <div className="body">
          {tab === 'blood' && (
            <>
              <p className="intro">{BLOOD.intro}</p>
              <div className="bar">
                {BLOOD.parts.map(p => <span key={p.name} title={`${p.name} ${p.pct}%`} style={{ width: `${p.pct}%`, background: p.color }} />)}
              </div>
              <div className="grid">
                {BLOOD.parts.map(p => (
                  <div className="card" key={p.name} style={{ borderColor: `${p.color}44` }}>
                    <div className="ctop"><span className="dot" style={{ background: p.color }} /><span className="cname">{p.name}</span><span className="pct">{p.pct}%</span></div>
                    <p>{p.detail}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'fluids' && (
            <>
              <p className="intro">The body is ~60% water, held in distinct compartments that constantly exchange.</p>
              <div className="grid">
                {FLUIDS.map(f => (
                  <div className="card" key={f.name} style={{ borderColor: `${f.color}44` }}>
                    <div className="ctop"><span className="dot" style={{ background: f.color }} /><span className="cname">{f.name}</span></div>
                    <p>{f.detail}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'electrolytes' && (
            <>
              <p className="intro">Charged minerals dissolved in body fluids — they run nerves and muscles, balance water, and buffer pH.</p>
              <div className="grid">
                {ELECTROLYTES.map(e => (
                  <div className="card" key={e.sym} style={{ borderColor: `${e.color}44` }}>
                    <div className="ctop"><span className="sym" style={{ color: e.color }}>{e.sym}</span><span className="cname">{e.name}</span><span className="range">{e.range}</span></div>
                    <p>{e.role}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'cells' && (
            <>
              <p className="intro">~37 trillion cells in four main tissue families, plus the stem cells that renew them.</p>
              <div className="grid">
                {CELLS.map(c => (
                  <div className="card" key={c.name} style={{ borderColor: `${c.color}44` }}>
                    <div className="ctop"><span className="dot" style={{ background: c.color }} /><span className="cname">{c.name}</span></div>
                    <p>{c.detail}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'glands' && (
            <>
              <p className="intro">The endocrine system — glands that release hormones into the blood to coordinate the whole body.</p>
              <div className="grid">
                {GLANDS.map(g => (
                  <div className="card" key={g.name} style={{ borderColor: `${g.color}44` }}>
                    <div className="ctop"><span className="dot" style={{ background: g.color }} /><span className="cname">{g.name}</span></div>
                    <div className="horm" style={{ color: g.color }}>{g.hormones}</div>
                    <p>{g.role}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const CHEM_CSS = `
.pj-chem{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:clamp(12px,3vw,32px);
  background:rgba(2,4,10,0.72);backdrop-filter:blur(8px);font-family:"Inter",system-ui,sans-serif}
.pj-chem *{box-sizing:border-box}
.pj-chem .sheet{width:100%;max-width:860px;max-height:88vh;display:flex;flex-direction:column;border-radius:24px;overflow:hidden;
  background:linear-gradient(160deg,#12101c,#0a0910);border:1px solid rgba(255,255,255,0.14);box-shadow:0 30px 70px rgba(0,0,0,0.6)}
.pj-chem .chd{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 22px 14px}
.pj-chem .eyebrow{font-family:"Outfit",sans-serif;font-weight:800;font-size:.62rem;letter-spacing:.28em;text-transform:uppercase;color:#00DAF3}
.pj-chem h2{font-family:"Outfit",sans-serif;font-weight:900;font-style:italic;text-transform:uppercase;font-size:1.7rem;color:#fff;margin-top:6px;letter-spacing:-.01em}
.pj-chem .xbtn{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);cursor:pointer;display:grid;place-items:center}
.pj-chem .xbtn:hover{background:rgba(255,255,255,0.1);color:#fff}
.pj-chem .tabs{display:flex;gap:4px;padding:0 22px 14px;flex-wrap:wrap}
.pj-chem .tabs button{appearance:none;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.55);cursor:pointer;
  font-family:"Outfit",sans-serif;font-weight:700;font-size:.74rem;height:32px;padding:0 14px;border-radius:99px;transition:.15s}
.pj-chem .tabs button[aria-selected="true"]{background:linear-gradient(135deg,#6B0099,#D40055);color:#fff;border-color:transparent}
.pj-chem .body{overflow-y:auto;padding:4px 22px 24px}
.pj-chem .intro{color:rgba(255,255,255,0.6);font-size:.9rem;line-height:1.55;max-width:62ch;margin-bottom:16px}
.pj-chem .bar{display:flex;height:16px;border-radius:99px;overflow:hidden;margin-bottom:18px;border:1px solid rgba(255,255,255,0.1)}
.pj-chem .bar span{height:100%}
.pj-chem .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.pj-chem .card{border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);border-radius:16px;padding:14px}
.pj-chem .ctop{display:flex;align-items:center;gap:9px;margin-bottom:8px;flex-wrap:wrap}
.pj-chem .dot{width:12px;height:12px;border-radius:99px;flex-shrink:0}
.pj-chem .sym{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:1rem}
.pj-chem .cname{font-family:"Outfit",sans-serif;font-weight:800;font-size:.94rem;color:#fff}
.pj-chem .pct{margin-left:auto;font-family:"JetBrains Mono",monospace;font-size:.8rem;color:rgba(255,255,255,0.5)}
.pj-chem .range{margin-left:auto;font-family:"JetBrains Mono",monospace;font-size:.7rem;color:rgba(255,255,255,0.45)}
.pj-chem .horm{font-size:.72rem;font-weight:700;margin-bottom:6px;font-family:"Outfit",sans-serif}
.pj-chem .card p{color:rgba(255,255,255,0.6);font-size:.82rem;line-height:1.5}
@media(prefers-reduced-motion:reduce){.pj-chem{backdrop-filter:none}}
`;

export default BodyChemistryPanel;
