// Room 5: The Originator, a tribute to Juan Atkins. A rotating ring of his aliases around a stencilled
// portrait, his story in seven chapters, a wall of typographic sleeves, and "Machine Funk": a playable
// step sequencer (all sounds synthesized here) so visitors can make machine funk in his honour.
import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
import { ShareButton } from './TechnoShare';
import { ATKINS_ALIASES, ATKINS_CHAPTERS, ATKINS_DEDICATION, ATKINS_SLEEVES } from '../../../data/technoExhibit/atkins';
import { TX_DOCS, trackById } from '../../../data/technoExhibit/history';
import { Reveal, Tape, tilt } from './gritKit';
import { TrackChip, useBooth } from './ListeningBooth';
import { MachineFunk, TX_STEPS, TX_VOICES, type TxPattern, defaultPattern, berlinPattern } from './machineFunk';

const SLEEVE_INKS = ['#00e5ff', '#ff5a1f', '#ffd400', '#ff2d55', '#b8ff00', '#e9e4d6'];

function AliasRing() {
  const text = ATKINS_ALIASES.map((a) => a.toUpperCase()).join(' • ') + ' • ';
  return (
    <div className="txa-ring" aria-hidden>
      <svg viewBox="0 0 400 400">
        <defs><path id="txa-circle" d="M200,200 m-160,0 a160,160 0 1,1 320,0 a160,160 0 1,1 -320,0" /></defs>
        <text className="tx-stencil" style={{ fontSize: 25 }} fill="#00e5ff"><textPath href="#txa-circle" textLength={1000} lengthAdjust="spacing">{text}</textPath></text>
      </svg>
    </div>
  );
}

function Sequencer() {
  const engine = useRef<MachineFunk | null>(null);
  const [pattern, setPattern] = useState<TxPattern>(defaultPattern);
  const [bpm, setBpm] = useState(128);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const e = new MachineFunk(); e.onStep = setStep; engine.current = e;
    return () => e.dispose();
  }, []);
  useEffect(() => { if (engine.current) engine.current.pattern = pattern; }, [pattern]);
  useEffect(() => { if (engine.current) engine.current.bpm = bpm; }, [bpm]);

  const toggle = () => {
    const e = engine.current; if (!e) return;
    if (e.playing) { e.stop(); setPlaying(false); } else { e.start(); setPlaying(true); }
  };
  const flip = (v: keyof TxPattern, i: number) => {
    setPattern((p) => ({ ...p, [v]: p[v].map((on, j) => (j === i ? !on : on)) }));
    if (!pattern[v][i]) engine.current?.trigger(v, undefined, i);
  };

  return (
    <div className="txa-seq">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" className="tx-btn" onClick={toggle} aria-pressed={playing}>{playing ? <Square size={14} /> : <Play size={14} />}{playing ? 'Stop' : 'Play'}</button>
        <button type="button" className="tx-chip" onClick={() => setPattern(defaultPattern())}>Detroit electro</button>
        <button type="button" className="tx-chip" onClick={() => setPattern(berlinPattern())}>Berlin four-floor</button>
        <button type="button" className="tx-chip" onClick={() => setPattern(Object.fromEntries(TX_VOICES.map((v) => [v, Array(TX_STEPS).fill(false)])) as TxPattern)}><RotateCcw size={11} style={{ verticalAlign: -1 }} /> Clear</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', font: "600 11px/1 'IBM Plex Mono',monospace", letterSpacing: '.12em' }}>
          {bpm} BPM
          <input type="range" min={100} max={145} value={bpm} onChange={(e) => setBpm(+e.target.value)} aria-label="Tempo" style={{ accentColor: '#00e5ff' }} />
        </label>
      </div>
      <div className="txa-grid" role="grid" aria-label="Step sequencer">
        {TX_VOICES.map((v) => (
          <div key={v} role="row" className="txa-row">
            <div className="txa-voice">{v}</div>
            {pattern[v].map((on, i) => (
              <button key={i} type="button" role="gridcell" aria-pressed={on} aria-label={`${v} step ${i + 1}`}
                className={`txa-cell${on ? ' on' : ''}${i === step ? ' now' : ''}${i % 4 === 0 ? ' beat' : ''}`}
                onClick={() => flip(v, i)} />
            ))}
          </div>
        ))}
      </div>
      <div className="tx-type" style={{ fontSize: 12, color: 'var(--tx-muted)', marginTop: 10 }}>Every sound here is synthesized in your browser: a kick from a falling sine wave, snares and hats from noise, bass from a filtered square wave. That's the toolkit Detroit started with.</div>
    </div>
  );
}

export default function AtkinsTribute({ onShare }: { onShare?: () => Promise<void> }) {
  const { play } = useBooth();
  const interview = TX_DOCS.find((d) => d.id === 'doc-atkins-interview');
  return (
    <section id="tx-atkins" style={{ position: 'relative', background: 'radial-gradient(ellipse at 50% 0%, #0b2b33, #050607 65%)', padding: '90px 16px 110px', overflow: 'hidden' }}>
      <style>{ATKINS_CSS}</style>
      <div className="tx-scan" style={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto' }}>
        <div className="tx-gaffer tx-type" style={{ fontSize: 13, marginBottom: 12 }}>ROOM 05 · A TRIBUTE</div>

        <div className="txa-hero">
          <div className="txa-portrait">
            <AliasRing />
            <div className="txa-face tx-halftone">
              <span className="tx-stencil tx-flicker" style={{ fontSize: 'clamp(90px,14vw,170px)', color: '#00e5ff', textShadow: '0 0 30px rgba(0,229,255,.55)' }}>JA</span>
            </div>
          </div>
          <div>
            <div style={{ font: "600 12px/1 'IBM Plex Mono',monospace", letterSpacing: '.3em', color: '#00e5ff' }}>B. 12 SEPT 1962 · DETROIT</div>
            <h2 className="tx-stencil tx-spray" style={{ margin: '10px 0 0', fontSize: 'clamp(56px,11vw,150px)', color: '#e9e4d6' }}>THE<br />ORIGINATOR</h2>
            <div className="tx-poster" style={{ fontSize: 'clamp(26px,4vw,44px)', color: '#00e5ff', marginTop: 8 }}>Juan Atkins</div>
            <p className="tx-type" style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--tx-paper)', maxWidth: 560 }}>{ATKINS_DEDICATION}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {interview && <button type="button" className="tx-btn" onClick={() => play(interview)}><Play size={14} /> Hear him tell it</button>}
              {onShare && <ShareButton run={onShare} label="Share the tribute" className="tx-btn ghost" />}
            </div>
          </div>
        </div>

        <div className="txa-chapters">
          {ATKINS_CHAPTERS.map((c, i) => {
            const tracks = (c.trackIds || []).map(trackById).filter(Boolean);
            return (
              <Reveal key={c.id} className="tx-paste" rot={tilt(c.id, 1.4)} style={{ padding: '20px 18px 16px', position: 'relative' }}>
                <Tape style={{ top: -10, left: 20, transform: `rotate(${tilt(c.id, 6)}deg)` }} />
                <div className="tx-stencil" style={{ fontSize: 44, color: 'rgba(0,0,0,.18)', position: 'absolute', right: 12, top: 6 }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ font: "600 11px/1 'IBM Plex Mono',monospace", letterSpacing: '.16em', color: '#0a6b78' }}>{c.years}</div>
                <h3 className="tx-poster" style={{ margin: '6px 0 8px', fontSize: 28, color: '#111' }}>{c.title}</h3>
                <p className="tx-type" style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#222' }}>{c.body}</p>
                {tracks.length > 0 && <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>{tracks.map((t) => <TrackChip key={t!.id} track={t!} compact />)}</div>}
              </Reveal>
            );
          })}
        </div>

        <h3 className="tx-stencil" style={{ margin: '80px 0 8px', fontSize: 'clamp(34px,5vw,60px)', color: '#e9e4d6' }}>THE CRATE</h3>
        <p className="tx-type" style={{ color: 'var(--tx-muted)', margin: '0 0 22px' }}>Fifteen records from four decades. Tap a sleeve to play it.</p>
        <div className="txa-crate">
          {ATKINS_SLEEVES.map((s, i) => {
            const t = s.trackId ? trackById(s.trackId) : undefined;
            const ink = SLEEVE_INKS[i % SLEEVE_INKS.length];
            return (
              <Reveal key={s.title} rot={tilt(s.title, 3)}>
                <button type="button" className="txa-sleeve" disabled={!t} onClick={() => t && play(t)} aria-label={`${s.as}, ${s.title}, ${s.year}${t ? ': play' : ''}`} style={{ ['--ink' as string]: ink }}>
                  <span className="txa-disc" aria-hidden />
                  <span className="txa-sleeve-face tx-halftone">
                    <span style={{ font: "600 9px/1 'IBM Plex Mono',monospace", letterSpacing: '.2em' }}>{s.label.toUpperCase()} · {s.year}</span>
                    <span className="tx-stencil" style={{ fontSize: s.title.length > 14 ? 20 : 28, lineHeight: 0.9 }}>{s.title}</span>
                    <span style={{ font: "600 10px/1.2 'IBM Plex Mono',monospace", textTransform: 'uppercase' }}>{s.as}</span>
                  </span>
                </button>
              </Reveal>
            );
          })}
        </div>

        <h3 className="tx-stencil" style={{ margin: '80px 0 8px', fontSize: 'clamp(34px,5vw,60px)', color: '#00e5ff' }}>MACHINE FUNK</h3>
        <p className="tx-type" style={{ color: 'var(--tx-paper)', margin: '0 0 18px', maxWidth: 640, lineHeight: 1.6 }}>Program a groove the way it started: sixteen steps, a drum machine and a bassline. Tap the squares.</p>
        <Sequencer />
      </div>
    </section>
  );
}

const ATKINS_CSS = `
.txa-hero{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:40px;align-items:center;margin-top:20px}
.txa-portrait{position:relative;aspect-ratio:1}
.txa-ring{position:absolute;inset:0;animation:txa-spin 40s linear infinite}
.txa-ring svg{width:100%;height:100%}
@keyframes txa-spin{to{transform:rotate(360deg)}}
.txa-face{position:absolute;inset:18%;border-radius:50%;display:grid;place-items:center;background-color:#06181c;box-shadow:inset 0 0 0 3px #00e5ff,0 0 60px rgba(0,229,255,.25)}
.txa-chapters{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px;margin-top:70px}
.txa-crate{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:22px}
.txa-sleeve{position:relative;display:block;width:100%;aspect-ratio:1;border:0;padding:0;background:none;cursor:pointer}
.txa-sleeve:disabled{cursor:default}
.txa-sleeve-face{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;justify-content:space-between;padding:12px;text-align:left;background-color:var(--ink);color:#111;box-shadow:4px 4px 0 #000;transition:transform .25s}
.txa-disc{position:absolute;inset:6%;border-radius:50%;background:radial-gradient(circle,#ddd 0 9%,#111 10% 12%,#1b1b1b 13%,#0a0a0a 60%,#222 61%,#0a0a0a 70%);transition:transform .35s cubic-bezier(.2,1.2,.3,1)}
.txa-sleeve:not(:disabled):hover .txa-disc,.txa-sleeve:not(:disabled):focus-visible .txa-disc{transform:translateX(36%) rotate(90deg)}
.txa-sleeve:not(:disabled):hover .txa-sleeve-face{transform:translateX(-6%) rotate(-2deg)}
.txa-seq{border:2px solid #00e5ff;background:#050708;padding:16px;box-shadow:8px 8px 0 #000}
.txa-grid{display:grid;gap:6px;overflow-x:auto}
.txa-row{display:grid;grid-template-columns:56px repeat(16,minmax(16px,1fr));gap:4px;min-width:420px}
.txa-voice{font:600 10px/26px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#7fdbe6}
.txa-cell{height:28px;border:1px solid #1d3a40;background:#0b1416;cursor:pointer;padding:0;transition:background .06s}
.txa-cell.beat{border-color:#2b5a63}
.txa-cell.on{background:#00e5ff;box-shadow:0 0 10px rgba(0,229,255,.6)}
.txa-cell.now{outline:2px solid #ffd400;outline-offset:-2px}
.txa-cell.on.now{background:#ffd400}
@media (max-width:820px){.txa-hero{grid-template-columns:1fr}.txa-portrait{max-width:340px;margin:0 auto;width:100%}}
@media (prefers-reduced-motion:reduce){.txa-ring{animation:none}}
`;
