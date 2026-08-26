'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * StudentIdCard — a flippable card that doubles as a school ID (front) and a stat card (back).
 * Front: photo/monogram, school, student number, scannable QR (resolves to the verifiable Ledger).
 * Back: PISA level, per-subject mastery, streak, credentials — trading-card style, tier foil.
 * Ported from the verified artifact. Scoped styles; real data from profile/ledger with demo fallback.
 * Ties to the Learner Ledger + stat-card framework. Privacy: shows standing/badges, never raw grades.
 */

interface StudentIdCardProps {
  profile?: any;
  /** Optional real ledger snapshot: { level, pisa, streak, credentials, standards, subjects:[{ic,nm,v,c}] } */
  ledger?: any;
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

interface Tier { id: string; name: string; c1: string; c2: string; }
const TIERS: Tier[] = [
  { id: 'bronze', name: 'Bronze', c1: '#CD7F32', c2: '#8a5a24' },
  { id: 'silver', name: 'Silver', c1: '#D6DCE4', c2: '#9aa3b0' },
  { id: 'gold', name: 'Gold', c1: '#FFD24A', c2: '#FF8C00' },
  { id: 'honor', name: 'Honor Roll', c1: '#FFE8A3', c2: '#D40055' },
  { id: 'turbo', name: 'Turbo', c1: '#7CFCD0', c2: '#00DAF3' },
];

const DEMO_SUBJ = [
  { ic: '📖', nm: 'Reading', v: 86, c: '#D40055' }, { ic: '📐', nm: 'Maths', v: 64, c: '#3B82F6' },
  { ic: '🔬', nm: 'Science', v: 72, c: '#8B5CF6' }, { ic: '🗣️', nm: 'Spanish', v: 52, c: '#06D6A0' },
  { ic: '🏛️', nm: 'History', v: 60, c: '#FF8C00' },
];

function initials(name: string) {
  const p = (name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'ST';
}

const StudentIdCard: React.FC<StudentIdCardProps> = ({ profile, ledger, onBack, onNavigate }) => {
  const [flipped, setFlipped] = useState(false);
  const [tier, setTier] = useState<Tier>(TIERS[3]);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const name = profile?.displayName || profile?.username || 'Maya Rivera';
  const school = profile?.schoolName || 'Lincoln High School';
  const grade = profile?.gradeLabel || 'Grade 6 · Room 4B';
  const studentId = profile?.studentId || 'PLJ-8842-6631';
  const classOf = profile?.classOf || '2032';
  const homeroom = profile?.homeroom || 'Ms. Rivera';
  const level = ledger?.level || 'Lv 4';
  const pisa = ledger?.pisa || 'PISA · top ~15%';
  const streak = ledger?.streak ?? 12;
  const credentials = ledger?.credentials ?? 5;
  const standards = ledger?.standards ?? 41;
  const subjects = ledger?.subjects || DEMO_SUBJ;
  const mono = initials(name);

  // deterministic QR-like matrix (decorative; the real card encodes the verify URL)
  useEffect(() => {
    const c = qrRef.current; if (!c) return; const x = c.getContext('2d'); if (!x) return;
    const N = 21; x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); x.fillStyle = '#0b0910';
    let seed = 88426631; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (rnd() > 0.52) x.fillRect(i, j, 1, 1);
    x.fillStyle = '#fff'; x.fillRect(0, 0, 8, 8); x.fillRect(N - 7, 0, 8, 8); x.fillRect(0, N - 7, 8, 8);
    const finder = (ox: number, oy: number) => { x.fillStyle = '#0b0910'; x.fillRect(ox, oy, 7, 7); x.fillStyle = '#fff'; x.fillRect(ox + 1, oy + 1, 5, 5); x.fillStyle = '#0b0910'; x.fillRect(ox + 2, oy + 2, 3, 3); };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  }, []);

  const styleVars = useMemo(() => ({ ['--tier' as any]: tier.c1, ['--tier2' as any]: tier.c2 }), [tier]);

  return (
    <div className="pj-student-id" style={styleVars}>
      <style>{CARD_CSS}</style>
      <div className="wrap">
        {onBack && <button className="idback" onClick={onBack}>← Back</button>}
        <span className="eyebrow">Learner Ledger · one card</span>
        <h1 className="title">The card that’s a <span className="g">school ID and a stat card.</span></h1>
        <p className="lede">Front is a real student ID — scannable for check-in, library and lunch. Flip it and it’s a trading-card of their learning: PISA level, subject mastery, streak and verifiable credentials. Tap the card to flip.</p>

        <div className="stage-grid">
          <div className="stage">
            <div className={`card ${flipped ? 'flipped' : ''}`} role="button" tabIndex={0}
              onClick={() => setFlipped(f => !f)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(f => !f); } }}
              aria-label="Student card — tap to flip between ID and stats">
              {/* FRONT */}
              <div className="face idface">
                <div className="holo-strip" /><div className="foil" />
                <div className="pad">
                  <div className="crestrow"><div className="crest">🎓</div><div className="sn">{school}<small>Student Identification</small></div></div>
                  <div className="idbody">
                    <div className="photo">{mono}</div>
                    <div className="idmeta">
                      <div className="nm">{name}</div>
                      <div className="role">{tier.name}</div>
                      <div className="kv">
                        <div className="r"><span className="k">Grade</span><span className="v">{grade}</span></div>
                        <div className="r"><span className="k">Student ID</span><span className="v mono">{studentId}</span></div>
                        <div className="r"><span className="k">Homeroom</span><span className="v">{homeroom}</span></div>
                        <div className="r"><span className="k">Class of</span><span className="v">{classOf}</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="idfoot">
                    <div className="qr"><canvas ref={qrRef} width={21} height={21} /></div>
                    <div className="ft">
                      <div className="barcode" />
                      <div className="valid"><span>{studentId}</span><span>Valid 26–27</span></div>
                      <div className="verified">Verified learner · scan to confirm</div>
                    </div>
                  </div>
                </div>
              </div>
              {/* BACK */}
              <div className="face back statface">
                <div className="foil" />
                <div className="pad">
                  <div className="st-hd"><div className="nm">{name}</div><div className="tierbadge">{tier.name}</div></div>
                  <div className="bigstat"><div className="lv">{level}</div><div className="cap">Global standing<b>{pisa}</b></div></div>
                  <div className="subjbars">
                    {subjects.map((s: any, i: number) => (
                      <div className="sb" key={i}><span className="ic">{s.ic}</span><span className="nm2">{s.nm}</span><span className="bar"><i style={{ width: `${s.v}%`, background: `linear-gradient(90deg,${s.c},${s.c}aa)` }} /></span><span className="pc">{s.v}</span></div>
                    ))}
                  </div>
                  <div className="st-grid">
                    <div className="c"><div className="v" style={{ color: 'var(--orange)' }}>{streak}</div><div className="l">Day streak</div></div>
                    <div className="c"><div className="v" style={{ color: 'var(--cyan)' }}>{credentials}</div><div className="l">Credentials</div></div>
                    <div className="c"><div className="v" style={{ color: 'var(--success)' }}>{standards}</div><div className="l">Standards</div></div>
                  </div>
                  <div className="st-foot"><span>◈ Learner Ledger</span><span>Verifiable · Open Badges 3.0</span></div>
                </div>
              </div>
            </div>
            <div className="controls">
              <button className="btn primary" onClick={() => setFlipped(f => !f)}>⟲ Flip card</button>
              <button className="btn" onClick={() => onNavigate?.('LEARNER_LEDGER')}>Open my Ledger</button>
            </div>
          </div>

          <div className="explain">
            <h2>One card, two jobs</h2>
            <div className="usecases">
              <div className="uc"><div className="i" style={{ background: 'rgba(255,140,0,.16)', color: 'var(--orange)' }}>🪪</div><div><div className="t">A working school ID</div><div className="d">The QR resolves to the student’s account for campus check-in, library, and lunch line — the same identity that runs their learning.</div></div></div>
              <div className="uc"><div className="i" style={{ background: 'rgba(0,218,243,.14)', color: 'var(--cyan)' }}>🏅</div><div><div className="t">A stat card of their learning</div><div className="d">Flip side reads like a trading card — PISA level, per-subject mastery, streak, and earned credentials. Growth becomes something to be proud of.</div></div></div>
              <div className="uc"><div className="i" style={{ background: 'rgba(6,214,160,.16)', color: 'var(--success)' }}>🔗</div><div><div className="t">Verifiable, and theirs</div><div className="d">Scanning proves the credentials are real — anchored as Open Badges 3.0 on the learner-owned Ledger. It travels between schools with the student.</div></div></div>
              <div className="uc"><div className="i" style={{ background: 'rgba(107,0,153,.28)', color: 'var(--lilac)' }}>🎖️</div><div><div className="t">Tiers earned, not bought</div><div className="d">The foil tier reflects real achievement bands — Bronze to Honor Roll — derived from mastery, never a paid cosmetic.</div></div></div>
            </div>
            <div className="tierpick">
              <div className="lab">Preview achievement tier (foil)</div>
              <div className="tierrow">
                {TIERS.map(t => (
                  <button key={t.id} className="tchip" aria-pressed={tier.id === t.id} onClick={() => setTier(t)}>
                    <span className="sw" style={{ background: `linear-gradient(135deg,${t.c1},${t.c2})` }} />{t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="note"><span style={{ fontSize: '1.1rem' }}>🛡️</span><div className="t"><b>Privacy by design.</b> The public card shows standing and badges, never raw grades or personal data. Children’s cards omit the scannable ID unless a guardian enables it.</div></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CARD_CSS = `
.pj-student-id{
  --purple:#6B0099;--magenta:#D40055;--orange:#FF8C00;--cyan:#00DAF3;--lilac:#D0BCFF;--success:#06D6A0;--warning:#F59E0B;
  --grad-brand:linear-gradient(135deg,#6B0099,#D40055);--grad-warm:linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00);
  --bg:#08070d;--ink:#f4f1f7;--ink-dim:rgba(244,241,247,.64);--ink-faint:rgba(244,241,247,.42);
  --g1:rgba(255,255,255,.04);--g2:rgba(255,255,255,.07);--g3:rgba(255,255,255,.11);
  --bd:rgba(255,255,255,.1);--bd-str:rgba(255,255,255,.17);
  --tier:#FFE8A3;--tier2:#D40055;
  --font-d:"Outfit","Space Grotesk",sans-serif;--font-b:"Inter",system-ui,sans-serif;--font-m:"JetBrains Mono",monospace;
  font-family:var(--font-b);color:var(--ink);background:var(--bg);line-height:1.5;min-height:100%;
  background-image:radial-gradient(100% 60% at 15% -8%,rgba(107,0,153,.3),transparent 55%),radial-gradient(90% 60% at 92% 4%,rgba(0,218,243,.12),transparent 55%),radial-gradient(80% 60% at 55% 118%,rgba(255,140,0,.12),transparent 60%);
}
.pj-student-id *{box-sizing:border-box}
.pj-student-id .wrap{max-width:1080px;margin:0 auto;padding:clamp(20px,4vw,44px) clamp(16px,4vw,36px) 60px}
.pj-student-id .idback{appearance:none;border:1px solid var(--bd);background:var(--g2);color:var(--ink-dim);cursor:pointer;font-family:var(--font-d);font-weight:700;font-size:.8rem;height:34px;padding:0 14px;border-radius:99px;margin-bottom:16px}
.pj-student-id .idback:hover{background:var(--g3);color:var(--ink)}
.pj-student-id .eyebrow{display:block;font-family:var(--font-d);font-weight:800;font-size:.66rem;letter-spacing:.26em;text-transform:uppercase;color:var(--ink-faint)}
.pj-student-id .title{font-family:var(--font-d);font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.02em;line-height:.96;font-size:clamp(1.8rem,4.4vw,2.7rem);margin:10px 0 0;text-wrap:balance}
.pj-student-id .title .g{background:var(--grad-warm);-webkit-background-clip:text;background-clip:text;color:transparent}
.pj-student-id .lede{color:var(--ink-dim);max-width:56ch;margin-top:12px}
.pj-student-id .mono{font-family:var(--font-m);font-variant-numeric:tabular-nums}
.pj-student-id .stage-grid{display:grid;gap:28px;grid-template-columns:1fr;margin-top:30px;align-items:start}
@media(min-width:880px){.pj-student-id .stage-grid{grid-template-columns:360px 1fr}}
.pj-student-id .stage{perspective:1600px;display:flex;flex-direction:column;align-items:center;gap:18px}
.pj-student-id .card{width:330px;height:512px;position:relative;transform-style:preserve-3d;transition:transform .8s cubic-bezier(.2,.7,.2,1);cursor:pointer}
.pj-student-id .card.flipped{transform:rotateY(180deg)}
.pj-student-id .face{position:absolute;inset:0;border-radius:24px;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;border:1px solid var(--bd-str);box-shadow:0 30px 60px -18px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.04) inset}
.pj-student-id .back{transform:rotateY(180deg)}
.pj-student-id .foil{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:.5;background:linear-gradient(115deg,transparent 20%,color-mix(in srgb,var(--tier) 70%,#fff) 42%,var(--tier2) 50%,transparent 62%);background-size:300% 300%;animation:pjSheen 6s linear infinite}
@keyframes pjSheen{0%{background-position:0% 50%}100%{background-position:200% 50%}}
.pj-student-id .holo-strip{height:26px;background:linear-gradient(90deg,#ff5f6d,#ffc371,#3cba92,#0ba29d,#a044ff,#ff5f6d);background-size:200% 100%;animation:pjHolo 5s linear infinite;opacity:.85}
@keyframes pjHolo{to{background-position:200% 0}}
.pj-student-id .idface{background:radial-gradient(120% 80% at 20% 0%,rgba(107,0,153,.6),transparent 55%),radial-gradient(100% 80% at 100% 100%,rgba(212,0,85,.45),transparent 55%),linear-gradient(160deg,#161020,#0c0912)}
.pj-student-id .idface .pad{position:absolute;inset:0;padding:18px;display:flex;flex-direction:column}
.pj-student-id .crestrow{display:flex;align-items:center;gap:10px}
.pj-student-id .crest{width:38px;height:38px;border-radius:10px;background:var(--grad-warm);display:grid;place-items:center;font-size:19px;box-shadow:0 4px 14px rgba(212,0,85,.4)}
.pj-student-id .crestrow .sn{font-family:var(--font-d);font-weight:800;font-size:.86rem;line-height:1.05;text-transform:uppercase;letter-spacing:.02em}
.pj-student-id .crestrow .sn small{display:block;font-weight:700;font-size:.56rem;letter-spacing:.24em;color:var(--tier);margin-top:3px}
.pj-student-id .idbody{display:flex;gap:14px;margin-top:18px;align-items:flex-start}
.pj-student-id .photo{width:96px;height:118px;border-radius:14px;flex-shrink:0;background:linear-gradient(160deg,#3a2a52,#191223);border:1px solid var(--bd-str);display:grid;place-items:center;font-family:var(--font-d);font-weight:900;font-size:2.6rem;color:#fff;position:relative;overflow:hidden}
.pj-student-id .photo::after{content:"";position:absolute;inset:0;background:radial-gradient(80% 60% at 50% 20%,rgba(255,255,255,.14),transparent 60%)}
.pj-student-id .idmeta{flex:1;min-width:0}
.pj-student-id .idmeta .nm{font-family:var(--font-d);font-weight:900;font-size:1.3rem;line-height:1.05;letter-spacing:-.01em}
.pj-student-id .idmeta .role{display:inline-block;margin-top:6px;font-size:.58rem;font-weight:800;font-family:var(--font-d);letter-spacing:.1em;text-transform:uppercase;color:#160b02;background:var(--tier);padding:3px 8px;border-radius:99px}
.pj-student-id .kv{margin-top:10px}
.pj-student-id .kv .r{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.08);font-size:.74rem}
.pj-student-id .kv .r .k{color:var(--ink-faint);text-transform:uppercase;letter-spacing:.08em;font-family:var(--font-d);font-weight:700;font-size:.6rem}
.pj-student-id .kv .r .v{font-weight:600}
.pj-student-id .idfoot{margin-top:auto;display:flex;align-items:flex-end;gap:12px}
.pj-student-id .qr{width:84px;height:84px;border-radius:10px;background:#fff;padding:6px;flex-shrink:0}
.pj-student-id .qr canvas{width:100%;height:100%;display:block;image-rendering:pixelated}
.pj-student-id .idfoot .ft{flex:1;min-width:0}
.pj-student-id .barcode{height:34px;width:100%;border-radius:5px;background:#fff;background-image:repeating-linear-gradient(90deg,#000 0 2px,#fff 2px 3px,#000 3px 4px,#fff 4px 7px,#000 7px 8px,#fff 8px 11px);background-size:11px 100%}
.pj-student-id .idfoot .valid{font-family:var(--font-m);font-size:.62rem;color:var(--ink-dim);margin-top:6px;display:flex;justify-content:space-between}
.pj-student-id .verified{display:inline-flex;align-items:center;gap:5px;font-size:.6rem;font-weight:800;font-family:var(--font-d);color:var(--success);margin-top:6px}
.pj-student-id .verified::before{content:"✓";display:grid;place-items:center;width:14px;height:14px;border-radius:99px;background:rgba(6,214,160,.2)}
.pj-student-id .statface{background:radial-gradient(120% 80% at 80% 0%,rgba(0,218,243,.28),transparent 55%),radial-gradient(100% 80% at 0% 100%,rgba(107,0,153,.5),transparent 55%),linear-gradient(160deg,#141020,#0b0910)}
.pj-student-id .statface .pad{position:absolute;inset:0;padding:18px;display:flex;flex-direction:column}
.pj-student-id .st-hd{display:flex;align-items:center;justify-content:space-between}
.pj-student-id .st-hd .nm{font-family:var(--font-d);font-weight:900;font-size:1.05rem}
.pj-student-id .tierbadge{font-size:.58rem;font-weight:800;font-family:var(--font-d);letter-spacing:.08em;text-transform:uppercase;color:#160b02;background:var(--tier);padding:4px 9px;border-radius:99px;box-shadow:0 4px 12px color-mix(in srgb,var(--tier) 50%,transparent)}
.pj-student-id .bigstat{margin-top:14px;display:flex;align-items:flex-end;gap:12px}
.pj-student-id .bigstat .lv{font-family:var(--font-d);font-weight:900;font-size:3.2rem;line-height:.9;background:var(--grad-warm);-webkit-background-clip:text;background-clip:text;color:transparent}
.pj-student-id .bigstat .cap{font-size:.68rem;color:var(--ink-dim);padding-bottom:6px}
.pj-student-id .bigstat .cap b{color:var(--ink);display:block;font-size:.82rem}
.pj-student-id .subjbars{margin-top:14px;display:flex;flex-direction:column;gap:7px}
.pj-student-id .sb{display:flex;align-items:center;gap:8px}
.pj-student-id .sb .ic{width:20px;text-align:center;font-size:.9rem}
.pj-student-id .sb .nm2{font-size:.68rem;color:var(--ink-dim);width:74px;flex-shrink:0}
.pj-student-id .sb .bar{flex:1;height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.pj-student-id .sb .bar i{display:block;height:100%;border-radius:99px}
.pj-student-id .sb .pc{font-family:var(--font-m);font-size:.64rem;color:var(--ink-dim);width:30px;text-align:right}
.pj-student-id .st-grid{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pj-student-id .st-grid .c{background:var(--g1);border:1px solid var(--bd);border-radius:12px;padding:9px 8px;text-align:center}
.pj-student-id .st-grid .c .v{font-family:var(--font-d);font-weight:900;font-size:1.15rem;line-height:1}
.pj-student-id .st-grid .c .l{font-size:.54rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);font-family:var(--font-d);margin-top:4px}
.pj-student-id .st-foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;font-size:.6rem;color:var(--ink-faint);font-family:var(--font-m);padding-top:12px}
.pj-student-id .controls{display:flex;gap:9px;flex-wrap:wrap;justify-content:center}
.pj-student-id .btn{appearance:none;border:1px solid var(--bd);background:var(--g2);color:var(--ink);cursor:pointer;font-family:var(--font-d);font-weight:700;height:40px;padding:0 16px;border-radius:99px;font-size:.82rem;transition:.16s;display:inline-flex;align-items:center;gap:7px}
.pj-student-id .btn:hover{background:var(--g3)}
.pj-student-id .btn.primary{background-image:var(--grad-warm);border-color:transparent;color:#fff;box-shadow:0 6px 20px rgba(212,0,85,.32)}
.pj-student-id .explain h2{font-family:var(--font-d);font-weight:900;font-style:italic;text-transform:uppercase;font-size:1.3rem;display:flex;align-items:center;gap:10px;letter-spacing:-.01em}
.pj-student-id .explain h2::before{content:"";width:5px;height:22px;border-radius:99px;background:var(--grad-warm)}
.pj-student-id .usecases{display:grid;gap:10px;margin-top:16px}
.pj-student-id .uc{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--bd);background:var(--g1);border-radius:14px}
.pj-student-id .uc .i{width:38px;height:38px;border-radius:11px;flex-shrink:0;display:grid;place-items:center;font-size:18px}
.pj-student-id .uc .t{font-family:var(--font-d);font-weight:800;font-size:.92rem}
.pj-student-id .uc .d{font-size:.82rem;color:var(--ink-dim);margin-top:3px}
.pj-student-id .tierpick{margin-top:20px}
.pj-student-id .tierpick .lab{font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);font-family:var(--font-d);margin-bottom:8px}
.pj-student-id .tierrow{display:flex;gap:8px;flex-wrap:wrap}
.pj-student-id .tchip{appearance:none;border:1px solid var(--bd);background:var(--g1);color:var(--ink-dim);cursor:pointer;font-family:var(--font-d);font-weight:700;font-size:.74rem;height:34px;padding:0 13px;border-radius:99px;display:flex;align-items:center;gap:7px;transition:.15s}
.pj-student-id .tchip .sw{width:12px;height:12px;border-radius:99px}
.pj-student-id .tchip[aria-pressed="true"]{color:var(--ink);border-color:var(--bd-str);background:var(--g3)}
.pj-student-id .note{display:flex;gap:11px;align-items:flex-start;padding:14px;border-radius:14px;background:rgba(6,214,160,.07);border:1px solid rgba(6,214,160,.22);margin-top:18px}
.pj-student-id .note .t{font-size:.82rem;color:var(--ink-dim)}.pj-student-id .note .t b{color:var(--ink)}
@media(prefers-reduced-motion:reduce){.pj-student-id .foil,.pj-student-id .holo-strip{animation:none}.pj-student-id .card{transition:none}}
`;

export default StudentIdCard;
