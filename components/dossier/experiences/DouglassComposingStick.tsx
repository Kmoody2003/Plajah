/**
 * Douglass: "Set his words". A teaching toy: a case of sorts (capitals, comma, full stop, exclamation mark) and a
 * press panel. Press a letter, or type on the keyboard, and the type lands on the page with a short thud. "Set the line"
 * composes one of three sentences from Douglass's 5 July 1852 Rochester address; each is checked word for word against
 * the 1852 pamphlet (services/dossier/composingStick.ts). It is NOT a facsimile of a printing office, and the page says so.
 * Lazy-loaded by DossierHall. Reduced motion: no thud, "Set the line" sets the whole line at once.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  STICK_LETTERS, STICK_LINES, STICK_MARKS, STICK_MAX, STICK_SPEECH, asSorts, matchedPrefix, setSort, sortForKey, stickMatches, takeOut,
} from '../../../services/dossier/composingStick';

const CSS = `
.dcs{--dcs-line:rgba(255,255,255,.14);--dcs-gold:var(--dh-a,#d9b36a);color:#f4efe6;font-family:'Inter',system-ui,sans-serif;container-type:inline-size}
.dcs-box{border:1px solid var(--dcs-line);border-radius:14px;background:#14110d;padding:clamp(14px,3cqw,26px);display:grid;gap:18px}
.dcs-pick{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dcs-pick>span{font-size:14px;color:#b4ac9f;margin-right:4px}
.dcs-chip{border:1.5px solid rgba(217,179,106,.45);background:transparent;color:#e7dcc4;border-radius:999px;padding:7px 14px;font-size:15px;font-weight:600;cursor:pointer;min-height:40px}
.dcs-chip:hover,.dcs-chip:focus-visible{border-color:var(--dcs-gold);outline:none}
.dcs-chip[aria-pressed=true]{background:var(--dcs-gold);border-color:var(--dcs-gold);color:var(--dh-a-ink,#14110d)}
.dcs-grid{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:clamp(16px,3cqw,28px);align-items:start}
@container (max-width:700px){.dcs-grid{grid-template-columns:1fr}}
.dcs-case{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;padding:12px;background:#1d1812;border:1px solid var(--dcs-line);border-radius:10px}
.dcs-case button{aspect-ratio:1;min-height:44px;font:400 clamp(20px,5.2cqw,27px) var(--dh-font-d,'Abril Fatface'),Georgia,serif;background:#2b241a;color:var(--dcs-gold);border:0;border-bottom:3px solid #0d0a06;border-radius:4px;cursor:pointer;padding:0;transition:transform .08s,background .12s}
.dcs-case button:hover{background:var(--dcs-gold);color:#14110d;transform:translateY(-2px)}
.dcs-case button:active{transform:translateY(1px);border-bottom-width:1px}
.dcs-case button:focus-visible{outline:2px solid #fff;outline-offset:1px}
.dcs-case .wide{grid-column:span 2;aspect-ratio:auto;font:600 14px 'Inter',system-ui,sans-serif;letter-spacing:.04em}
.dcs-press{background:#e9dfc9;color:#1a140c;border-radius:6px;padding:clamp(18px,4cqw,32px);min-height:260px;box-shadow:0 30px 70px rgba(0,0,0,.6),inset 0 0 90px rgba(120,90,40,.25);display:flex;flex-direction:column;outline:none}
.dcs-press:focus-visible{box-shadow:0 0 0 3px var(--dcs-gold),0 30px 70px rgba(0,0,0,.6),inset 0 0 90px rgba(120,90,40,.25)}
.dcs-hd{font:600 12px/1.3 'Inter',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#6b5a3c;border-bottom:1px solid #b8a67f;padding-bottom:8px;margin-bottom:16px}
.dcs-set{font:400 clamp(26px,6cqw,56px)/1.05 var(--dh-font-d,'Abril Fatface'),Georgia,serif;text-transform:uppercase;min-height:3.2em;flex:1;overflow-wrap:break-word;word-break:normal}
.dcs-set span{display:inline;white-space:pre-wrap}
.dcs-set span.new{display:inline-block;animation:dcsThud .28s ease-out}
.dcs-set .cur{display:inline-block;width:.07em;height:.9em;background:#8a6a2a;vertical-align:-.08em;margin-left:2px;animation:dcsBlink 1.1s steps(2) infinite}
@keyframes dcsThud{from{transform:translateY(-14px) scale(1.15);opacity:0}}
@keyframes dcsBlink{50%{opacity:0}}
.dcs-hint{font-size:15px;line-height:1.5;color:#5a4a30;margin:14px 0 0}
.dcs-hint b{color:#1a140c}
.dcs-done{margin-top:14px;padding:10px 12px;border-left:4px solid #8a6a2a;background:rgba(138,106,42,.12);font-size:15px;line-height:1.5;color:#1a140c}
.dcs-ctl{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.dcs-btn{font:600 15px 'Inter',system-ui,sans-serif;padding:9px 18px;border-radius:999px;border:1.5px solid #1a140c;background:transparent;color:#1a140c;cursor:pointer;min-height:44px}
.dcs-btn.go{background:#1a140c;color:#e9dfc9}
.dcs-btn:hover,.dcs-btn:focus-visible{background:#8a6a2a;border-color:#8a6a2a;color:#fff;outline:none}
.dcs-btn:disabled{opacity:.45;cursor:default}
.dcs-cite{font-size:14px;line-height:1.6;color:#b4ac9f;max-width:78ch}
.dcs-cite b{color:#f4efe6;font-weight:600}
.dcs-cite a{color:var(--dcs-gold);text-underline-offset:3px}
.dcs-cite a:focus-visible{outline:2px solid #fff;outline-offset:2px}
.dcs-note{margin:0;font-size:15px;line-height:1.55;color:#b4ac9f;max-width:78ch}
.dcs-note b{color:#f1c27a;font-weight:600}
.dcs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.dcs-set span.new{animation:none}.dcs-set .cur{animation:none}.dcs-case button{transition:none}}
`;

interface Sort { n: number; ch: string }

export default function DouglassComposingStick() {
  const [lineId, setLineId] = useState(STICK_LINES[0].id);
  const [stick, setStick] = useState('');
  const [fresh, setFresh] = useState(-1); // index of the sort that just landed (the only one that thuds)
  const [live, setLiveRaw] = useState('');
  const flip = useRef(false);
  /** Same message twice in a row still gets read: alternate an invisible character. */
  const setLive = (m: string) => { flip.current = !flip.current; setLiveRaw(m ? m + (flip.current ? '​' : '') : ''); };
  const [autoRun, setAutoRun] = useState(false);
  const timer = useRef<number | null>(null);
  const stickRef = useRef('');
  const line = STICK_LINES.find(l => l.id === lineId) ?? STICK_LINES[0];
  const done = stickMatches(stick, line);
  const target = asSorts(line.text);

  const stopAuto = useCallback(() => {
    if (timer.current != null) { window.clearInterval(timer.current); timer.current = null; }
    setAutoRun(false);
  }, []);
  useEffect(() => () => { if (timer.current != null) window.clearInterval(timer.current); }, []);

  const apply = (next: string, announce?: string) => {
    stickRef.current = next;
    setStick(next);
    setFresh(next.length - 1);
    if (announce !== undefined) setLive(announce);
  };

  const press = useCallback((sort: string) => {
    stopAuto();
    const next = setSort(stickRef.current, sort);
    if (next === stickRef.current) {
      setLive(next.length >= STICK_MAX ? 'The stick is full. Take one out or clear it.' : '');
      return;
    }
    apply(next, sort === ' ' ? 'Space' : `Set ${sort}`);
  }, [stopAuto]);

  const back = useCallback(() => {
    stopAuto();
    const next = takeOut(stickRef.current);
    apply(next, next ? `Took one out. The stick reads: ${next.toLowerCase()}` : 'The stick is empty.');
  }, [stopAuto]);

  const clear = () => { stopAuto(); apply('', 'The stick is clear.'); setFresh(-1); };

  const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finishMsg = (l: typeof line) => `The stick reads: ${l.text} Frederick Douglass, Rochester, 5 July 1852.`;

  const setTheLine = () => {
    stopAuto();
    const t = asSorts(line.text);
    if (reduced()) { apply(t, finishMsg(line)); setFresh(-1); return; }
    apply('', ''); let i = 0; setAutoRun(true);
    timer.current = window.setInterval(() => {
      if (i >= t.length) {
        if (timer.current != null) window.clearInterval(timer.current);
        timer.current = null; setAutoRun(false); setLive(finishMsg(line)); return;
      }
      apply(t.slice(0, ++i));
    }, 85);
  };

  const pickLine = (id: string) => { stopAuto(); setLineId(id); apply('', 'The stick is clear.'); setFresh(-1); };

  // Real keyboard: letters, comma, full stop, "!" and space set type; Backspace takes one out. Buttons keep Enter and Space.
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
    if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
    if (e.key === ' ' && (el.tagName === 'BUTTON' || el.tagName === 'A')) return;
    if (e.key === 'Enter') return;
    const s = sortForKey(e.key);
    if (s) { e.preventDefault(); press(s); }
  };

  const sorts: Sort[] = stick.split('').map((ch, n) => ({ n, ch }));
  const onTrack = matchedPrefix(stick, line);

  return (
    <div className="dcs" onKeyDown={onKey}>
      <style>{CSS}</style>
      <div className="dcs-box" role="group" aria-label="Set his words: a composing stick teaching toy">
        <div className="dcs-pick" role="group" aria-label="Choose a line from the 1852 address">
          <span>His words:</span>
          {STICK_LINES.map((l, i) => (
            <button key={l.id} type="button" className="dcs-chip" aria-pressed={l.id === lineId} onClick={() => pickLine(l.id)}>{i + 1}. {l.label}</button>
          ))}
        </div>

        <div className="dcs-grid">
          <div className="dcs-case" role="group" aria-label="The case of type">
            {STICK_LETTERS.map(c => <button key={c} type="button" aria-label={`Set ${c}`} onClick={() => press(c)}>{c}</button>)}
            {STICK_MARKS.map(c => (
              <button key={c} type="button" aria-label={`Set ${c === ',' ? 'comma' : c === '.' ? 'full stop' : 'exclamation mark'}`} onClick={() => press(c)}>{c}</button>
            ))}
            <button type="button" className="wide" aria-label="Set a space" onClick={() => press(' ')}>SPACE</button>
            <button type="button" className="wide" aria-label="Take the last letter out" onClick={back} disabled={!stick}>TAKE OUT</button>
          </div>

          <div className="dcs-press" tabIndex={0} role="group" aria-label="The press. Click here, then type on your keyboard to set letters; Backspace takes one out.">
            <div className="dcs-hd">The North Star · Rochester · set by you</div>
            <div className="dcs-set" aria-hidden="true">
              {sorts.map(s => <span key={s.n} className={s.n === fresh ? 'new' : undefined}>{s.ch}</span>)}
              <i className="cur" />
            </div>
            <p className="dcs-hint">
              {stick === '' && <>Press the letters, or click here and type. <b>Set the line</b> shows you the whole sentence.</>}
              {stick !== '' && !done && (onTrack === stick.length
                ? <>Good, that is his line so far. Keep going: {stick.length} of {target.length} letters.</>
                : <>Your own words. Pick a line above and match it, or just play.</>)}
              {done && <>That is his sentence, letter for letter.</>}
            </p>
            {done && (
              <div className="dcs-done">
                <b>Frederick Douglass</b>, Rochester, 5 July 1852. {STICK_SPEECH.rights}
              </div>
            )}
            <div className="dcs-ctl">
              <button type="button" className="dcs-btn go" onClick={setTheLine} disabled={autoRun}>{autoRun ? 'Setting…' : 'Set the line'}</button>
              <button type="button" className="dcs-btn" onClick={clear} disabled={!stick && !autoRun}>Clear</button>
            </div>
          </div>
        </div>

        <p className="dcs-cite">
          <b>The line:</b> &ldquo;{line.text}&rdquo; {STICK_SPEECH.speaker}, {STICK_SPEECH.place}, {STICK_SPEECH.date}. Source: <i>{STICK_SPEECH.title}</i>,{' '}
          {STICK_SPEECH.edition}. Checked word for word against two scans of the 1852 pamphlet and a transcription:{' '}
          {STICK_SPEECH.sources.map((s, i) => (
            <React.Fragment key={s.url}>{i > 0 && ', '}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></React.Fragment>
          ))}. {STICK_SPEECH.rights}
        </p>
      </div>

      <p className="dcs-sr" role="status" aria-live="polite" aria-atomic="true">{live}</p>

      <p className="dcs-note" style={{ marginTop: 12 }}>
        <b>A teaching toy, not a facsimile.</b> Real type is set upside down in a metal stick, one piece at a time, in mixed upper and lower case; here the
        letters are capitals, right way up, in a display face, so a phone can read them. The first sentence is printed in the 1852 pamphlet as &ldquo;This Fourth July&rdquo;;
        later books print &ldquo;Fourth [of] July&rdquo; and we keep the pamphlet&rsquo;s own wording. Nothing here claims that Douglass set type himself.
      </p>
    </div>
  );
}
