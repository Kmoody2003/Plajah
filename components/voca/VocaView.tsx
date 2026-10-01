import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Mascot2D, { type Mascot2DHandle, type Mood2D } from '../mascots/Mascot2D';
import { VOCA_LEVELS, levelInfo, passagesForLevel, type VocaPassage } from '../../data/vocaPassages';
import { createAlign, feedWord, judge, markHelped, moveOn, summarize, syllabify, type AlignEvent, type AlignState, type ReadingSummary } from '../../services/voca/vocaAlign';
import { applySession, defaultProgress, dueReview, nextPassage, reviewResult, starsFor, startLevelFor, loadLocal, saveLocal, ZONE, type LevelChange, type VocaProgress, type VocaSession } from '../../services/voca/vocaProgress';
import { loadCloud, saveCloud, pickNewer, recordToLedger } from '../../services/voca/vocaCloud';
import { MicMeter, createRecognizer, listeningAvailable, isEmbeddedWebView, type Recognizer, type RecError, type RecState } from '../../services/voca/vocaSpeech';
import { initVoice, speak, modelWord, cancelSpeech, ttsSupported } from '../../services/voca/vocaVoice';

/**
 * Voca — read-aloud game. Chora listens while the child reads; each word lights up when it is read right,
 * shakes and gets coached when it is not; levels advance on accuracy + understanding (see vocaProgress.ts).
 *
 * Audio contract (vocaSpeech.ts): recognition is suspended whenever Chora speaks, restarted automatically
 * when the browser drops it, watched by a voice-activity watchdog, and degrades to Listener mode (an adult
 * taps ✓/✗, no audio processed) when the browser cannot listen or a guardian has not allowed it.
 */

interface Props { onBack?: () => void; user?: any; profile?: any }
type Screen = 'home' | 'check' | 'read' | 'question' | 'summary';
type Mode = 'voice' | 'listener';

const CSS = `
.vx{--bg:#09070e;--g1:rgba(255,255,255,.035);--g2:rgba(255,255,255,.065);--g3:rgba(255,255,255,.1);--bd:rgba(255,255,255,.1);
  --ink:#f6f1f5;--dim:rgba(246,241,245,.68);--faint:rgba(246,241,245,.44);--purple:#6B0099;--magenta:#D40055;--orange:#FF8C00;--cyan:#00DAF3;
  --ok:#06D6A0;--miss:#FF5A6E;--coach:#FFB35C;--grad:linear-gradient(135deg,#6B0099,#D40055);--warm:linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00);
  --fd:"Outfit","Space Grotesk",system-ui,sans-serif;--fb:"Inter",system-ui,sans-serif;--fm:"JetBrains Mono",ui-monospace,monospace;--fr:"Atkinson Hyperlegible","Inter",system-ui,sans-serif;
  min-height:100%;background:var(--bg);color:var(--ink);font-family:var(--fb);padding:16px 16px 48px}
.vx *{box-sizing:border-box}
.vx button{font:inherit;color:inherit}
.vx .wrap{max-width:1120px;margin:0 auto;display:grid;gap:16px}
.vx .top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.vx .back{appearance:none;border:1px solid var(--bd);background:var(--g2);height:36px;padding:0 14px;border-radius:99px;font-family:var(--fd);font-weight:800;font-size:.8rem;color:var(--dim);cursor:pointer}
.vx .mark{font-family:var(--fd);font-weight:900;font-style:italic;font-size:1.5rem;text-transform:uppercase;letter-spacing:-.01em;background:var(--warm);-webkit-background-clip:text;background-clip:text;color:transparent}
.vx .eyebrow{font-family:var(--fd);font-weight:800;font-size:.66rem;letter-spacing:.24em;text-transform:uppercase;color:var(--faint)}
.vx .seg{display:flex;gap:3px;padding:4px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);margin-left:auto}
.vx .pill{appearance:none;border:0;background:transparent;cursor:pointer;height:32px;padding:0 13px;border-radius:99px;font-family:var(--fd);font-weight:800;font-size:.76rem;color:var(--dim)}
.vx .pill[aria-pressed="true"]{background:#fff;color:#12091b}
.vx .pill:disabled{opacity:.4;cursor:not-allowed}
.vx .card{background:var(--g1);border:1px solid var(--bd);border-radius:24px;padding:18px;min-width:0}
.vx h1,.vx h2,.vx h3{font-family:var(--fd);margin:0}
.vx .h1{font-weight:900;font-style:italic;text-transform:uppercase;font-size:clamp(1.5rem,4vw,2.3rem);line-height:1}
.vx .h2{font-weight:900;font-style:italic;text-transform:uppercase;font-size:1rem}
.vx .muted{color:var(--dim);font-size:.9rem}
.vx .btn{appearance:none;cursor:pointer;height:46px;padding:0 22px;border-radius:99px;border:0;background:var(--grad);color:#fff;font-family:var(--fd);font-weight:800;font-size:.9rem;display:inline-flex;align-items:center;gap:8px;justify-content:center}
.vx .btn.ghost{background:var(--g2);border:1px solid var(--bd);color:var(--ink)}
.vx .btn.ok{background:#0e3b31;border:1px solid rgba(6,214,160,.5);color:#7ff0cf}
.vx .btn.no{background:#3b0e18;border:1px solid rgba(255,90,110,.5);color:#ff9eab}
.vx .btn:disabled{opacity:.5;cursor:not-allowed}
.vx .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.vx .hero{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;border-radius:28px;padding:18px 22px;
  background:radial-gradient(120% 140% at 0% 0%,rgba(212,0,85,.26),transparent 60%),radial-gradient(120% 140% at 100% 100%,rgba(107,0,153,.34),transparent 60%),var(--g1);border:1px solid var(--bd)}
.vx .bar{height:10px;border-radius:99px;background:var(--g3);overflow:hidden}
.vx .bar i{display:block;height:100%;border-radius:99px;background:var(--warm);transition:width .4s}
.vx .grid2{display:grid;grid-template-columns:1.4fr 1fr;gap:16px}
.vx .plist{display:grid;gap:8px}
.vx .pitem{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px 14px;border-radius:16px;background:var(--g2);border:1px solid transparent;cursor:pointer;text-align:left}
.vx .pitem:hover{border-color:var(--bd)}
.vx .pitem b{font-family:var(--fd);font-weight:800;display:block}
.vx .pitem small{color:var(--faint);font-size:.74rem}
.vx .stars{font-size:.9rem;letter-spacing:1px;color:#ffd24a;white-space:nowrap}
.vx .chip{font-family:var(--fd);font-weight:700;font-size:.74rem;padding:5px 11px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);color:var(--dim);white-space:nowrap}
.vx .chip.hot{background:rgba(255,140,0,.12);border-color:rgba(255,140,0,.35);color:#ffb35c}
.vx .chip.ok{background:rgba(6,214,160,.1);border-color:rgba(6,214,160,.35);color:#5ff0c6}
.vx .notice{border-left:3px solid var(--cyan);background:rgba(0,218,243,.06);border-radius:0 12px 12px 0;padding:10px 14px;color:var(--dim);font-size:.88rem}
.vx .notice.warn{border-color:var(--orange);background:rgba(255,140,0,.08)}
.vx .reader{display:grid;grid-template-columns:1fr 230px;gap:16px;align-items:start}
.vx .stage{border-radius:28px;border:1px solid var(--bd);padding:24px 26px 20px;min-width:0;
  background:radial-gradient(90% 70% at 100% 0%,rgba(0,218,243,.08),transparent 60%),radial-gradient(90% 80% at 0% 100%,rgba(107,0,153,.28),transparent 60%),#0d0915}
.vx .passage{font-family:var(--fr);font-size:clamp(1.3rem,2.6vw,1.9rem);line-height:2;letter-spacing:.01em;word-spacing:.14em;margin:14px 0 6px}
.vx .w{display:inline-block;position:relative;padding:0 .1em;border-radius:8px;transition:background .2s,color .2s;color:rgba(246,241,245,.86)}
.vx .w.cur{box-shadow:inset 0 -3px 0 var(--cyan);color:#fff}
.vx .w.good{color:#fff;background:linear-gradient(transparent 58%,rgba(6,214,160,.42) 58%)}
.vx .w.miss{color:#fff;background:rgba(255,90,110,.24);text-decoration:underline wavy var(--miss) 2px;text-underline-offset:6px}
.vx .w.coached{color:#fff;background:linear-gradient(transparent 58%,rgba(255,140,0,.45) 58%)}
.vx .w.shake{animation:vxshake .42s cubic-bezier(.36,.07,.19,.97)}
.vx .w .syl{position:absolute;left:50%;top:-1.2em;transform:translateX(-50%);font-family:var(--fm);font-size:.48em;white-space:nowrap;color:var(--coach);letter-spacing:.05em}
@keyframes vxshake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(3px)}30%,50%,70%{transform:translateX(-5px)}40%,60%{transform:translateX(5px)}}
.vx .side{display:grid;gap:12px;justify-items:center;position:sticky;top:16px}
.vx .bubble{background:#fff;color:#1a0f24;border-radius:18px 18px 18px 6px;padding:10px 14px;font-size:.92rem;font-weight:600;min-height:44px;width:100%}
.vx .status{display:flex;align-items:center;gap:8px;font-family:var(--fm);font-size:.72rem;color:var(--dim)}
.vx .dot{width:9px;height:9px;border-radius:50%;background:var(--faint)}
.vx .dot.live{background:#ff4d6d;box-shadow:0 0 0 0 rgba(255,77,109,.6);animation:vxpulse 1.2s infinite}
.vx .dot.pause{background:var(--coach)}
@keyframes vxpulse{to{box-shadow:0 0 0 9px rgba(255,77,109,0)}}
.vx .meter{flex:1;height:8px;border-radius:99px;background:var(--g3);overflow:hidden;min-width:80px}
.vx .meter i{display:block;height:100%;background:linear-gradient(90deg,var(--ok),var(--cyan));transition:width .08s}
.vx .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.vx .kpi{background:var(--g1);border:1px solid var(--bd);border-radius:18px;padding:14px}
.vx .kpi .l{font-family:var(--fd);font-weight:800;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.vx .kpi .v{font-family:var(--fd);font-weight:900;font-size:1.9rem;font-variant-numeric:tabular-nums;line-height:1.1;margin-top:4px}
.vx .kpi .v small{font-size:.85rem;color:var(--faint)}
.vx .choices{display:grid;gap:10px}
.vx .choice{appearance:none;cursor:pointer;text-align:left;padding:16px 18px;border-radius:18px;background:var(--g2);border:1px solid var(--bd);font-family:var(--fr);font-size:1.1rem}
.vx .choice:hover{background:var(--g3)}
.vx .choice.right{border-color:rgba(6,214,160,.6);background:rgba(6,214,160,.12)}
.vx .choice.wrong{border-color:rgba(255,90,110,.6);background:rgba(255,90,110,.1)}
.vx .wordchips{display:flex;flex-wrap:wrap;gap:8px}
.vx .wordchip{appearance:none;cursor:pointer;font-family:var(--fr);font-size:1rem;padding:8px 14px;border-radius:12px;background:var(--g2);border:1px solid var(--bd)}
.vx select{background:#15101f;color:var(--ink);border:1px solid var(--bd);border-radius:10px;height:34px;padding:0 10px;font-family:var(--fd);font-weight:700}
.vx :focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
@media (max-width:860px){.vx .grid2,.vx .reader{grid-template-columns:1fr}.vx .side{position:static;grid-template-columns:auto 1fr;justify-items:start;align-items:center}.vx .kpis{grid-template-columns:1fr 1fr}}
@media (prefers-reduced-motion:reduce){.vx .w.shake,.vx .dot.live{animation:none}}
`;

function useFonts() {
  useEffect(() => {
    if (document.getElementById('voca-fonts')) return;
    const l = document.createElement('link'); l.id = 'voca-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Outfit:ital,wght@0,700;0,800;0,900;1,900&display=swap';
    document.head.appendChild(l);
  }, []);
}

const isChildAccount = (p: any) => !!(p?.isChild || p?.accountType === 'CHILD');
const voiceConsent = (p: any) => !isChildAccount(p) || p?.parentalControls?.speechRecognition === true;
const STAR = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ======================================================================= main
const VocaView: React.FC<Props> = ({ onBack, user, profile }) => {
  useFonts();
  const uid: string | null = user?.uid ?? null;
  const [progress, setProgress] = useState<VocaProgress>(() => loadLocal(uid) ?? defaultProgress(startLevelFor(profile)));
  const [screen, setScreen] = useState<Screen>('home');
  const canListen = listeningAvailable();
  const consent = voiceConsent(profile);
  const [mode, setMode] = useState<Mode>(canListen && consent ? 'voice' : 'listener');
  const [checked, setChecked] = useState(false);
  const [passage, setPassage] = useState<VocaPassage>(() => nextPassage(progress));
  const [warmup, setWarmup] = useState<string[] | null>(null);
  const [result, setResult] = useState<{ sum: ReadingSummary; session: VocaSession; level: LevelChange; levelBefore: number } | null>(null);
  const [pendingSum, setPendingSum] = useState<ReadingSummary | null>(null);

  useEffect(() => { initVoice(); }, []);
  // merge cloud progress once (newer wins)
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    loadCloud(uid).then(c => { if (!alive) return; const n = pickNewer(loadLocal(uid), c); if (n) { setProgress(n); setPassage(nextPassage(n)); } });
    return () => { alive = false; };
  }, [uid]);

  const persist = useCallback((p: VocaProgress) => { setProgress(p); saveLocal(p, uid); if (uid) saveCloud(uid, p); }, [uid]);

  const begin = (p: VocaPassage, words?: string[]) => {
    setPassage(p); setWarmup(words ?? null);
    setScreen(mode === 'voice' && !checked ? 'check' : 'read');
  };

  const onReadDone = (sum: ReadingSummary) => {
    if (warmup) {
      // warm-up: update spaced review, then straight to the day's story
      let p = progress;
      const reached = new Set(sum.practice);
      for (const w of warmup) p = reviewResult(p, w, !reached.has(w));
      persist(p); setWarmup(null); setPassage(nextPassage(p)); setScreen('read');
      return;
    }
    setPendingSum(sum); setScreen('question');
  };

  const onAnswered = (understood: boolean | null) => {
    const sum = pendingSum!; const levelBefore = progress.level;
    const session: VocaSession = { passageId: passage.id, level: passage.level, accuracy: sum.accuracy, wcpm: sum.wcpm, comebacks: sum.comebacks.length, words: sum.correct, understood, noisy: sum.noisy, at: Date.now(), seconds: Math.round(sum.seconds) };
    // only reads AT the reader's level move the level; practice on easier passages still earns stars + review
    const atLevel = passage.level === progress.level;
    const r = applySession(atLevel ? progress : { ...progress, level: passage.level }, session, { practice: sum.practice, comebacks: sum.comebacks });
    const next = atLevel ? r.progress : { ...r.progress, level: progress.level };
    persist(next);
    if (uid) recordToLedger(uid, session);
    setResult({ sum, session, level: atLevel ? r.level : { change: 'stay', reason: 'Practice read. Your level stays the same.' }, levelBefore });
    setScreen('summary');
  };

  const review = dueReview(progress);
  const warmupPassage = (words: string[]): VocaPassage => ({ id: 'warmup', level: progress.level, title: 'Warm-up words', kind: 'story', source: 'Your practice words', text: words.join(' '), question: { prompt: '', choices: ['', '', ''] as any, answer: 0 } });

  return (
    <div className="vx">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="top">
          <button className="back" type="button" onClick={() => { cancelSpeech(); screen === 'home' ? onBack?.() : setScreen('home'); }}>← {screen === 'home' ? 'Back' : 'Trail'}</button>
          <span className="mark">Voca</span>
          <span className="eyebrow">Read aloud with Chora</span>
          <div className="seg" role="group" aria-label="Listening mode">
            <button className="pill" type="button" aria-pressed={mode === 'voice'} disabled={!canListen || !consent} onClick={() => setMode('voice')} title={!canListen ? 'This browser cannot listen' : !consent ? 'A grown-up needs to allow reading voice' : ''}>🎙️ Voice</button>
            <button className="pill" type="button" aria-pressed={mode === 'listener'} onClick={() => setMode('listener')}>👂 Listener</button>
          </div>
        </div>

        {screen === 'home' && (
          <Home progress={progress} canListen={canListen} consent={consent} child={isChildAccount(profile)} mode={mode} review={review}
            onStart={p => begin(p)} onWarmup={() => begin(warmupPassage(review), review)}
            onSetLevel={lv => { const p = { ...progress, level: lv }; persist(p); setPassage(nextPassage(p, lv)); }} />
        )}
        {screen === 'check' && (
          <MicCheck onPass={() => { setChecked(true); setScreen('read'); }} onListener={() => { setMode('listener'); setScreen('read'); }} />
        )}
        {screen === 'read' && (
          <Reader key={passage.id + (warmup ? ':w' : '')} passage={warmup ? warmupPassage(warmup) : passage} mode={mode} warmup={!!warmup}
            onDone={onReadDone} onFallback={() => setMode('listener')} />
        )}
        {screen === 'question' && pendingSum && (
          <Question passage={passage} onAnswer={onAnswered} />
        )}
        {screen === 'summary' && result && (
          <Summary result={result} passage={passage} progress={progress}
            onNext={() => { const p = nextPassage(progress); begin(p); }} onAgain={() => begin(passage)} onHome={() => setScreen('home')} />
        )}
      </div>
    </div>
  );
};
export default VocaView;

// ======================================================================= home / trail
const Home: React.FC<{ progress: VocaProgress; canListen: boolean; consent: boolean; child: boolean; mode: Mode; review: string[];
  onStart: (p: VocaPassage) => void; onWarmup: () => void; onSetLevel: (lv: number) => void }> = ({ progress, canListen, consent, child, mode, review, onStart, onWarmup, onSetLevel }) => {
  const info = levelInfo(progress.level);
  const list = passagesForLevel(progress.level);
  const today = nextPassage(progress);
  const atLevel = progress.sessions.filter(s => s.level === progress.level && !s.noisy).slice(-3);
  const zone = atLevel.filter(s => s.accuracy >= ZONE.learning).length;
  const coach = useRef<Mascot2DHandle>(null);
  useEffect(() => { const t = setTimeout(() => coach.current?.react('wave'), 400); return () => clearTimeout(t); }, []);
  return (
    <>
      <div className="hero">
        <div style={{ width: 150 }}><Mascot2D ref={coach} who="chora" mood="idle" size={150} followPointer /></div>
        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          <span className="eyebrow">Level {info.level} · {info.grades} · {info.isced}</span>
          <h1 className="h1">{info.name}</h1>
          <div className="row">
            <span className="chip hot">🔥 {progress.streak.count}-day streak</span>
            <span className="chip ok">{progress.totals.words} words read</span>
            <span className="chip">{progress.totals.comebacks} comeback words</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div className="bar"><i style={{ width: `${Math.min(100, zone / 3 * 100)}%` }} /></div>
            <span className="muted" style={{ fontSize: '.8rem' }}>{zone}/3 strong reads toward the next level (93%+ accuracy, story understood)</span>
          </div>
        </div>
      </div>

      {!canListen && <div className="notice warn">{isEmbeddedWebView() ? <>Update the Plajah app so Chora can listen. Until then, Voca runs in <b>Listener mode</b>: a grown-up taps ✓ or ✗ for each word.</> : <>This browser can't listen yet. Voca will run in <b>Listener mode</b>: a grown-up taps ✓ or ✗ for each word. Chrome, Edge or Safari can listen, and so can the Plajah Android and Windows apps.</>}</div>}
      {canListen && !consent && child && <div className="notice">Your grown-up chose to read along with you, so tap through in Listener mode together. They can let Chora listen anytime in Parental controls (Voca reading voice).</div>}

      <div className="grid2">
        <div className="card" style={{ display: 'grid', gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 className="h2">Today's story</h2><span className="chip">{mode === 'voice' ? '🎙️ Chora listens' : '👂 Grown-up taps along'}</span></div>
          <div>
            <div className="eyebrow">{today.kind} · {today.source}</div>
            <h3 style={{ fontWeight: 900, fontSize: '1.4rem', margin: '6px 0' }}>{today.title}</h3>
            <p className="muted" style={{ fontFamily: 'var(--fr)', fontSize: '1rem', margin: 0 }}>{today.text.split(' ').slice(0, 18).join(' ')}…</p>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => onStart(today)}>▶ Start reading</button>
            {review.length > 0 && <button className="btn ghost" type="button" onClick={onWarmup}>Warm up · {review.length} practice word{review.length === 1 ? '' : 's'}</button>}
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="h2">Level {info.level} stories</h2>
            <select aria-label="Choose level" value={progress.level} onChange={e => onSetLevel(+e.target.value)}>
              {VOCA_LEVELS.map(l => <option key={l.level} value={l.level}>L{l.level} · {l.grades}</option>)}
            </select>
          </div>
          <div className="plist">
            {list.map(p => (
              <button key={p.id} className="pitem" type="button" onClick={() => onStart(p)}>
                <span><b>{p.title}</b><small>{p.kind} · {p.text.split(/\s+/).length} words</small></span>
                <span className="stars" aria-label={`${progress.completed[p.id]?.stars ?? 0} of 3 stars`}>{STAR(progress.completed[p.id]?.stars ?? 0)}</span>
              </button>
            ))}
          </div>
          <span className="muted" style={{ fontSize: '.76rem' }}>Teachers and parents can set the level. Readers move up on their own after strong reads.</span>
        </div>
      </div>
    </>
  );
};

// ======================================================================= mic check
const CHECK_LINE = 'Hi Chora, I am ready to read';
const MicCheck: React.FC<{ onPass: () => void; onListener: () => void }> = ({ onPass, onListener }) => {
  const [attempt, setAttempt] = useState(0);
  const [lvl, setLvl] = useState(0);
  const [heard, setHeard] = useState<string[]>([]);
  const [err, setErr] = useState<RecError | null>(null);
  const [state, setState] = useState<RecState>('idle');
  const [voiceSeen, setVoiceSeen] = useState(false);
  const recRef = useRef<Recognizer | null>(null);
  const meterRef = useRef<MicMeter | null>(null);
  const target = useMemo(() => new Set(['hi', 'chora', 'i', 'am', 'ready', 'to', 'read', 'cora', 'kora', 'im', 'ready']), []);
  const hits = heard.filter(w => target.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length;
  const passed = hits >= 3;

  useEffect(() => {
    let alive = true;
    const meter = new MicMeter(); meterRef.current = meter;
    const rec = createRecognizer({ vocabulary: CHECK_LINE.toLowerCase().split(' ').concat(['im', 'chora']) }); recRef.current = rec;
    const level = (l: number, sp: boolean) => { if (!alive) return; setLvl(l); if (sp) { setVoiceSeen(true); rec.noteVoiceActivity(); } };
    meter.onLevel = level; rec.onLevel = level;
    rec.onState = (s, e) => { if (!alive) return; setState(s); if (e) setErr(e); };
    rec.onWords = ws => alive && setHeard(h => [...h, ...ws.map(w => w.text)].slice(-20));
    (async () => {
      // native engines meter themselves; opening a second mic stream would compete with them
      if (!rec.providesLevel) { const e = await meter.start(); if (!alive) return; if (e) { setErr(e); return; } }
      await speak('Say: ' + CHECK_LINE + '!'); if (!alive) return;
      rec.start();
    })();
    return () => { alive = false; rec.stop(); meter.stop(); cancelSpeech(); };
  }, [attempt]);
  useEffect(() => { if (passed) { const t = setTimeout(onPass, 900); return () => clearTimeout(t); } }, [passed, onPass]);

  return (
    <div className="card" style={{ display: 'grid', gap: 16, justifyItems: 'center', textAlign: 'center', padding: 28 }}>
      <div style={{ width: 170 }}><Mascot2D who="chora" mood={passed ? 'excited' : 'listen'} size={170} /></div>
      <span className="eyebrow">Microphone check</span>
      <h1 className="h1" style={{ fontSize: '1.6rem' }}>Say: “Hi Chora, I'm ready to read!”</h1>
      {err ? (
        <>
          <div className="notice warn" style={{ textAlign: 'left', maxWidth: 520 }}>{err.message}</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" type="button" onClick={() => { setErr(null); setHeard([]); setAttempt(a => a + 1); }}>Try again</button>
            <button className="btn ghost" type="button" onClick={onListener}>Use Listener mode</button>
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ width: 'min(420px,100%)' }}>
            <span className={`dot ${state === 'listening' ? 'live' : ''}`} />
            <div className="meter"><i style={{ width: `${Math.min(100, lvl * 900)}%` }} /></div>
            <span className="status">{passed ? 'got it!' : state === 'listening' ? 'listening' : 'starting'}</span>
          </div>
          <p className="muted" style={{ minHeight: '1.4em', fontFamily: 'var(--fr)', fontSize: '1.1rem' }}>{heard.slice(-8).join(' ') || (voiceSeen ? 'I can hear you…' : 'Waiting for your voice…')}</p>
          {!voiceSeen && state === 'listening' && <span className="muted" style={{ fontSize: '.8rem' }}>Can't see the bar move? Check the microphone is on and not muted.</span>}
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn ghost" type="button" onClick={onPass}>Skip check</button>
            <button className="btn ghost" type="button" onClick={onListener}>Use Listener mode</button>
          </div>
        </>
      )}
    </div>
  );
};

// ======================================================================= reader
const LINES = {
  try1: ['So close! Try that one again.', 'Almost! One more try.', 'Nice try. Say it again.'],
  comeback: ['You got it!', 'Yes! That one was tricky.', 'There it is!'],
  moveOn: ["We'll practice that one later.", "Let's keep going. We'll come back to it."],
  stuck: ['Take your time. You can do it.', 'Need help? Tap "Hear it".'],
};
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

const Reader: React.FC<{ passage: VocaPassage; mode: Mode; warmup: boolean; onDone: (s: ReadingSummary) => void; onFallback: () => void }> = ({ passage, mode, warmup, onDone, onFallback }) => {
  const align = useRef<AlignState>(createAlign(passage.text, passage.level));
  const [, force] = useState(0); const rerender = () => force(x => x + 1);
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const [sylIdx, setSylIdx] = useState<number | null>(null);
  const [line, setLine] = useState(warmup ? 'Warm-up! Read each word out loud.' : 'Read it out loud, nice and clear.');
  const [mood, setMood] = useState<Mood2D>('listen');
  const [energy, setEnergy] = useState(0);
  const [recState, setRecState] = useState<RecState>('idle');
  const [recErr, setRecErr] = useState<RecError | null>(null);
  const [lvl, setLvl] = useState(0);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState(1);
  const coach = useRef<Mascot2DHandle>(null);
  const recRef = useRef<Recognizer | null>(null);
  const meterRef = useRef<MicMeter | null>(null);
  const speaking = useRef(false);
  const pausedMs = useRef(0); const pauseStart = useRef<number | null>(null);
  const lastProgressAt = useRef(Date.now()); const lastIdx = useRef(0);
  const streak = useRef(0); const lastVoiceAt = useRef(0);
  const recent = useRef<boolean[]>([]);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone;

  const s = align.current;
  const cur = s.words[s.i];

  /** Chora speaks with the listener suspended, so she is never heard as the reader. */
  const say = useCallback(async (text: string, fn?: () => Promise<void>) => {
    speaking.current = true; recRef.current?.suspend();
    const t0 = Date.now();
    setLine(text);
    if (fn) await fn(); else await speak(text);
    pausedMs.current += Date.now() - t0;
    speaking.current = false;
    if (!doneRef.current && !pauseStart.current) recRef.current?.resume();
    lastProgressAt.current = Date.now();
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return; doneRef.current = true;
    recRef.current?.stop(); meterRef.current?.stop();
    const sum = summarize(align.current, pausedMs.current);
    setMood('excited'); coach.current?.react('cheer');
    setTimeout(() => onDoneRef.current(sum), 1400);
  }, []);

  const handle = useCallback((evs: AlignEvent[]) => {
    for (const e of evs) {
      if (e.type === 'noise') { recent.current = [...recent.current, false].slice(-20); continue; }
      recent.current = [...recent.current, true].slice(-20);
      if (e.type === 'good') {
        lastProgressAt.current = Date.now(); setSylIdx(null);
        const w = s.words[e.index];
        streak.current = w.attempts === 0 && !w.helped ? streak.current + 1 : 0;
        setEnergy(Math.min(1, streak.current / 12));
        if (e.comeback) { coach.current?.react('nod_yes'); setMood('listen'); void say(pick(LINES.comeback)); }
        else if (streak.current > 0 && streak.current % 8 === 0) coach.current?.react('nod_yes');
      } else if (e.type === 'attempt') {
        const w = s.words[e.index]; streak.current = 0; setEnergy(0);
        setShakeIdx(e.index); setTimeout(() => setShakeIdx(null), 450);
        if (e.attempt === 1) { coach.current?.react('almost'); void say(pick(LINES.try1)); }
        else if (e.attempt === 2) { setSylIdx(e.index); setMood('encourage'); const syl = syllabify(w.display, passage.syllables); void say(syl.length > 1 ? 'Break it up.' : 'Look at each sound.', () => speak(syl.length > 1 ? syl.join(' … ') : w.display.replace(/[^\w']/g, ''), { rate: 0.6 })); }
        else if (e.attempt === 3) { markHelped(s); setMood('encourage'); void say('Listen…', () => modelWord(w.display.replace(/[^\w'-]/g, ''), syllabify(w.display, passage.syllables))); }
        else { setSylIdx(null); setMood('listen'); void say(pick(LINES.moveOn)); }
      } else if (e.type === 'done') { finish(); }
    }
    const q = recent.current.length ? recent.current.filter(Boolean).length / recent.current.length : 1;
    setQuality(q);
    rerender();
  }, [finish, passage.syllables, s, say]);

  // ---- voice mode: recogniser + meter lifecycle
  useEffect(() => {
    if (mode !== 'voice') return;
    let alive = true;
    const rec = createRecognizer({ vocabulary: align.current.words.map(w => w.norm) }); recRef.current = rec;
    const meter = new MicMeter(); meterRef.current = meter;
    rec.onState = (st, e) => { if (!alive) return; setRecState(st); if (e) { setRecErr(e); if (e.code === 'network' || e.code === 'not-allowed' || e.code === 'no-mic' || e.code === 'unsupported') setLine(e.message); } };
    rec.onWords = ws => { if (!alive || speaking.current || doneRef.current) return; for (const w of ws) handle(feedWord(align.current, w.text, w.alts)); };
    const level = (l: number, sp: boolean) => { if (!alive) return; setLvl(l); if (sp && !speaking.current) { rec.noteVoiceActivity(); lastVoiceAt.current = Date.now(); if (align.current.startedAt === null) align.current.startedAt = Date.now(); } };
    meter.onLevel = level; rec.onLevel = level;
    (async () => {
      if (!rec.providesLevel) { const e = await meter.start(); if (!alive) return; if (e) { setRecErr(e); setLine(e.message); return; } }
      rec.start();
    })();
    const onVis = () => { if (document.hidden) rec.suspend(); else if (!pauseStart.current && !speaking.current) rec.resume(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); rec.stop(); meter.stop(); cancelSpeech(); };
  }, [mode, handle]);

  // ---- stuck helper: long silence on the same word → encourage, then model it (counts as help)
  useEffect(() => {
    const t = setInterval(() => {
      if (doneRef.current || speaking.current || pauseStart.current || mode !== 'voice') return;
      const a = align.current; if (a.startedAt === null) return;
      if (a.i !== lastIdx.current) { lastIdx.current = a.i; lastProgressAt.current = Date.now(); return; }
      const idle = Date.now() - lastProgressAt.current;
      const w = a.words[a.i]; if (!w) return;
      if (idle > 14000) { markHelped(a); lastProgressAt.current = Date.now(); void say('This word is…', () => modelWord(w.display.replace(/[^\w'-]/g, ''), syllabify(w.display, passage.syllables))); }
      else if (idle > 8000 && idle < 9100) setLine(pick(LINES.stuck));
    }, 1000);
    return () => clearInterval(t);
  }, [mode, passage.syllables, say]);

  const togglePause = () => {
    if (pauseStart.current) { pausedMs.current += Date.now() - pauseStart.current; pauseStart.current = null; setPaused(false); recRef.current?.resume(); lastProgressAt.current = Date.now(); }
    else { pauseStart.current = Date.now(); setPaused(true); recRef.current?.suspend(); }
  };
  const hearIt = () => { if (!cur) return; markHelped(s); void say('Listen…', () => modelWord(cur.display.replace(/[^\w'-]/g, ''), syllabify(cur.display, passage.syllables))); };
  const skip = () => { const ev = moveOn(s); setSylIdx(null); handle(ev); };
  const tap = (ok: boolean) => { if (s.startedAt === null) s.startedAt = Date.now(); handle(judge(s, ok)); };

  // listener-mode keyboard: → / Enter = right, X = needs help, H = hear it
  useEffect(() => {
    if (mode !== 'listener') return;
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === 'Enter') tap(true); else if (e.key.toLowerCase() === 'x') tap(false); else if (e.key.toLowerCase() === 'h') hearIt(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const live = mode === 'voice' && recState === 'listening' && !paused;
  const status = mode === 'listener' ? 'Listener mode' : recErr ? 'mic problem' : paused ? 'paused' : speaking.current || recState === 'suspended' ? 'Chora is talking' : recState === 'listening' ? 'listening' : 'starting…';
  const quiet = live && s.startedAt === null && Date.now() - (lastVoiceAt.current || Date.now()) > 6000;

  return (
    <div className="reader">
      <div className="stage">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><span className="eyebrow">{warmup ? 'Warm-up' : `Level ${passage.level} · ${passage.kind}`}</span><h2 className="h2" style={{ fontSize: '1.15rem', marginTop: 4 }}>{passage.title}</h2></div>
          <div className="status" style={{ minWidth: 180 }}>
            <span className={`dot ${live ? 'live' : paused ? 'pause' : ''}`} />
            {mode === 'voice' && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, lvl * 900)}%` }} /></div>}
            <span>{status}</span>
          </div>
        </div>
        <div className="passage" aria-live="polite">
          {s.words.map((w, k) => {
            const cls = ['w', k === s.i ? 'cur' : '', w.status === 'good' ? 'good' : w.status === 'miss' ? 'miss' : w.status === 'coached' ? 'coached' : '', shakeIdx === k ? 'shake' : ''].join(' ');
            return (
              <React.Fragment key={k}>
                <span className={cls}>{w.display}{sylIdx === k && <span className="syl">{syllabify(w.display, passage.syllables).join('·')}</span>}</span>
                {w.display.endsWith('-') ? '' : ' '}
              </React.Fragment>
            );
          })}
        </div>
        {recErr && mode === 'voice' && (
          <div className="notice warn" style={{ marginTop: 8 }}>{recErr.message} <button className="pill" type="button" style={{ background: '#fff', color: '#12091b', marginLeft: 6 }} onClick={onFallback}>Switch to Listener mode</button></div>
        )}
        {quiet && <div className="notice" style={{ marginTop: 8 }}>I can't hear you yet. Check the microphone, or come a little closer.</div>}
        {mode === 'voice' && quality < 0.6 && s.tokens > 10 && <div className="notice" style={{ marginTop: 8 }}>It's noisy here. Other voices won't count against you, but a quieter spot or a headset helps.</div>}
        <div className="row" style={{ marginTop: 14 }}>
          {mode === 'listener' ? (
            <>
              <button className="btn ok" type="button" onClick={() => tap(true)} disabled={!cur}>✓ Read it right</button>
              <button className="btn no" type="button" onClick={() => tap(false)} disabled={!cur}>✗ Needs help</button>
              <button className="btn ghost" type="button" onClick={hearIt} disabled={!cur}>🔊 Hear it</button>
              <span className="muted" style={{ fontSize: '.75rem' }}>Keys: → right · X help · H hear</span>
            </>
          ) : (
            <>
              <button className="btn ghost" type="button" onClick={togglePause}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
              <button className="btn ghost" type="button" onClick={hearIt} disabled={!cur}>🔊 Hear it</button>
              <button className="btn ghost" type="button" onClick={skip} disabled={!cur}>Skip word</button>
            </>
          )}
        </div>
      </div>
      <div className="side">
        <div style={{ width: 200 }}><Mascot2D ref={coach} who="chora" mood={mood} energy={energy} size={200} prop="book" /></div>
        <div className="bubble" role="status">{line}</div>
        <div className="muted" style={{ fontSize: '.78rem', textAlign: 'center' }}>{s.words.filter(w => w.status !== 'pending').length} / {s.words.length} words</div>
      </div>
    </div>
  );
};

// ======================================================================= comprehension
const Question: React.FC<{ passage: VocaPassage; onAnswer: (understood: boolean | null) => void }> = ({ passage, onAnswer }) => {
  const [picked, setPicked] = useState<number | null>(null);
  const q = passage.question;
  useEffect(() => { if (ttsSupported()) void speak(q.prompt); return () => cancelSpeech(); }, [q.prompt]);
  const choose = (i: number) => {
    if (picked !== null) return; setPicked(i);
    const right = i === q.answer;
    void speak(right ? 'Yes! Great thinking.' : `Good try. The answer is: ${q.choices[q.answer]}.`);
    setTimeout(() => onAnswer(right), right ? 1300 : 2600);
  };
  return (
    <div className="card" style={{ display: 'grid', gap: 16, maxWidth: 720, justifySelf: 'center', width: '100%' }}>
      <div className="row"><div style={{ width: 110 }}><Mascot2D who="chora" mood="think" size={110} /></div><div><span className="eyebrow">Think about it</span><h2 className="h1" style={{ fontSize: '1.4rem', marginTop: 6 }}>{q.prompt}</h2></div></div>
      <div className="choices">
        {q.choices.map((c, i) => (
          <button key={i} type="button" className={`choice ${picked !== null && i === q.answer ? 'right' : ''} ${picked === i && i !== q.answer ? 'wrong' : ''}`} onClick={() => choose(i)}>{c}</button>
        ))}
      </div>
      <button className="pill" type="button" style={{ justifySelf: 'start' }} onClick={() => speak(q.prompt + '. ' + q.choices.join('. '))}>🔊 Read it to me</button>
    </div>
  );
};

// ======================================================================= summary
const Summary: React.FC<{ result: { sum: ReadingSummary; session: VocaSession; level: LevelChange; levelBefore: number }; passage: VocaPassage; progress: VocaProgress;
  onNext: () => void; onAgain: () => void; onHome: () => void }> = ({ result, passage, progress, onNext, onAgain, onHome }) => {
  const { sum, session, level } = result;
  const info = levelInfo(session.level);
  const stars = starsFor(session);
  const coach = useRef<Mascot2DHandle>(null);
  useEffect(() => {
    const t = setTimeout(() => { coach.current?.react(level.change === 'up' ? 'cheer' : 'nod_yes'); }, 300);
    void speak(level.change === 'up' ? 'You leveled up! Amazing reading.' : stars === 3 ? 'Wonderful reading!' : 'Nice reading! Every story makes you stronger.');
    return () => { clearTimeout(t); cancelSpeech(); };
  }, [level.change, stars]);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="hero">
        <div style={{ width: 150 }}><Mascot2D ref={coach} who="chora" mood={level.change === 'up' ? 'excited' : 'idle'} size={150} /></div>
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="eyebrow">{passage.title} · {sum.noisy ? 'noisy room (counts for effort)' : 'finished'}</span>
          <h1 className="h1">{level.change === 'up' ? `Level ${result.levelBefore + 1} unlocked!` : stars === 3 ? 'Superstar read!' : 'Story complete!'}</h1>
          <span className="stars" style={{ fontSize: '1.6rem' }}>{STAR(stars)}</span>
          <p className="muted" style={{ margin: 0 }}>{level.reason}</p>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">Accuracy</div><div className="v">{Math.round(sum.accuracy * 100)}<small>%</small></div></div>
        <div className="kpi"><div className="l">Words / min</div><div className="v">{sum.wcpm}</div>{info.targetWcpm && <div className="muted" style={{ fontSize: '.72rem' }}>level goal ~{info.targetWcpm}</div>}</div>
        <div className="kpi"><div className="l">Comeback words</div><div className="v">{sum.comebacks.length}</div></div>
        <div className="kpi"><div className="l">Understood</div><div className="v">{session.understood ? '✓' : '·'}</div></div>
      </div>
      {sum.practice.length > 0 && (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <h2 className="h2">Words to practice</h2>
          <span className="muted" style={{ fontSize: '.85rem' }}>Tap a word to hear it. These come back in your next warm-up.</span>
          <div className="wordchips">{sum.practice.slice(0, 12).map(w => <button key={w} className="wordchip" type="button" onClick={() => modelWord(w, syllabify(w, passage.syllables))}>{w}</button>)}</div>
        </div>
      )}
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Comeback Sigil: {Math.min(progress.totals.comebacks, 10)}/10 · Streak {progress.streak.count} day{progress.streak.count === 1 ? '' : 's'}</span>
        <div className="row">
          <button className="btn ghost" type="button" onClick={onHome}>Trail</button>
          <button className="btn ghost" type="button" onClick={onAgain}>Read again</button>
          <button className="btn" type="button" onClick={onNext}>Next story →</button>
        </div>
      </div>
    </div>
  );
};
