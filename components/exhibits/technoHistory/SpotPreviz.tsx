// Room 6: the edit bay. Pre-visualizes the 90-second social spots as animatics in 16:9 and 9:16 side by
// side, with burned-in captions, 9:16 UI safe zones, a scratch bed from the exhibit's own synth and a
// scratch VO from the browser's speech voice. Each frame is a pure function of time, so a capture tool
// can step it: window.__txPreviz.seek(seconds).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, Volume2, VolumeX, Mic, MicOff, Copy, Check } from 'lucide-react';
import { TX_SPOTS, type TxShot, type TxSpot, spotDuration, spotWordCount } from '../../../data/technoExhibit/spots';
import { MachineFunk, berlinPattern, defaultPattern } from './machineFunk';

type Aspect = 'wide' | 'tall' | 'both';
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (k: number) => 1 - Math.pow(1 - clamp(k), 3);
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const tc = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 24)).padStart(2, '0')}`;

function Silhouette({ ink, label }: { ink: string; label: string }) {
  return (
    <div className="tx-paste" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="tx-halftone" style={{ flex: 1, position: 'relative', background: `linear-gradient(170deg, ${ink}, #111 90%)`, overflow: 'hidden' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <circle cx="50" cy="44" r="17" fill="rgba(0,0,0,.75)" /><path d="M14 100 C18 72 34 64 50 64 C66 64 82 72 86 100Z" fill="rgba(0,0,0,.75)" />
        </svg>
      </div>
      <div className="tx-poster" style={{ color: '#111', fontSize: '3.6cqmin', padding: '1.2cqmin 1.6cqmin', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  );
}

function ShotFrame({ shot, t, aspect, spot }: { shot: TxShot; t: number; aspect: 'wide' | 'tall'; spot: TxSpot }) {
  const tall = aspect === 'tall';
  const local = t - shot.t0; const dur = shot.t1 - shot.t0; const p = clamp(local / dur);
  const beat = (t * spot.bpm) / 60; const pulse = Math.pow(1 - (beat % 1), 4);
  const ink = shot.ink;
  const supSize = tall ? '13cqw' : '9cqh';
  const big = (txt: string, style: React.CSSProperties = {}) => (
    <div className="tx-stencil tx-spray" style={{ color: ink, fontSize: supSize, textAlign: 'center', ...style }}>{txt}</div>
  );
  const sub = shot.sub && <div className="tx-type" style={{ color: '#e9e4d6', fontSize: tall ? '4.2cqw' : '2.9cqh', textAlign: 'center', marginTop: '2cqmin', opacity: ease((p - 0.15) * 4) }}>{shot.sub}</div>;
  const center: React.CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: tall ? '16cqh 6cqw 32cqh' : '8cqh 8cqw 16cqh' };
  let body: React.ReactNode;

  switch (shot.comp) {
    case 'stamp': {
      const n = Math.ceil(shot.sup.length * clamp(p * 2.2));
      const words = tall ? shot.sup.split(/\s+/) : [shot.sup];
      let used = 0;
      body = (<div style={center}>
        {words.map((w, i) => { const s = w.slice(0, Math.max(0, n - used)); used += w.length + 1; return <div key={i}>{big(s || ' ', { fontSize: tall ? '22cqw' : '16cqh', transform: `translate(${(hash(Math.floor(t * 12)) - 0.5) * 4}px,0)` })}</div>; })}
        {sub}
      </div>);
      break;
    }
    case 'factory': {
      const pop = 1.85 - 0.65 * ease(p);
      body = (<>
        <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(${tall ? 90 : 0}deg, #1b1b1d 0 6cqmin, #232326 6cqmin 12cqmin)`, backgroundPosition: `${tall ? 0 : -t * 120}px ${tall ? t * 120 : 0}px`, filter: 'grayscale(1)' }} />
        {Array.from({ length: 22 }, (_, i) => { const on = hash(i + Math.floor(t * 10)) > 0.55; return on && <div key={i} style={{ position: 'absolute', left: `${hash(i * 3.1) * 100}%`, top: `${30 + hash(i * 7.7) * 40}%`, width: '1cqmin', height: '1cqmin', background: '#ffb300', boxShadow: '0 0 12px #ff7a00', borderRadius: '50%' }} />; })}
        <div style={center}>{big(shot.sup)}<div className="tx-stencil" style={{ color: '#e9e4d6', fontSize: tall ? '16cqw' : '12cqh', marginTop: '2cqmin' }}>{pop.toFixed(2)}M</div>{sub}</div>
      </>);
      break;
    }
    case 'radio': {
      const names = (shot.sub || '').split('▸').map((s) => s.trim()).filter(Boolean);
      const idx = Math.min(names.length - 1, Math.floor(p * names.length * 1.2));
      body = (<div style={center}>
        <div style={{ position: 'relative', width: tall ? '80cqw' : '70cqw', height: tall ? '9cqw' : '9cqh', border: '0.5cqmin solid #e9e4d6', background: 'repeating-linear-gradient(90deg,#e9e4d6 0 2px,transparent 2px 4cqmin)', backgroundColor: '#111' }}>
          <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '0.8cqmin', background: ink, left: `${8 + 84 * ease(p * 1.4)}%`, boxShadow: `0 0 14px ${ink}` }} />
        </div>
        <div style={{ height: '5cqmin' }} />
        {big(shot.sup, { fontSize: tall ? '11cqw' : '8cqh' })}
        <div className="tx-poster" style={{ color: '#e9e4d6', fontSize: tall ? '8cqw' : '6cqh', marginTop: '3cqmin', opacity: 0.4 + pulse * 0.6 }}>{names[Math.max(0, idx)]}</div>
      </div>);
      break;
    }
    case 'portrait':
    case 'trio': {
      const names = shot.names || [shot.sup];
      const n = names.length;
      body = (<div style={center}>
        <div style={{ display: 'flex', flexDirection: tall && n > 1 ? 'column' : 'row', gap: '3cqmin', width: tall ? '70cqw' : `${Math.min(80, 28 * n)}cqw`, height: tall ? (n > 1 ? '40cqh' : '36cqh') : '58cqh' }}>
          {names.map((nm, i) => { const k = ease((p - i * 0.12) * 5); return (
            <div key={nm} style={{ flex: 1, minHeight: 0, opacity: k, transform: `translateY(${(1 - k) * -40}px) rotate(${(hash(i + 3) - 0.5) * 6}deg) scale(${1 + (1 - k) * 0.3})` }}><Silhouette ink={ink} label={nm} /></div>); })}
        </div>
        {shot.comp === 'trio' || n > 1 ? big(shot.sup, { fontSize: tall ? '9cqw' : '7cqh', marginTop: '3cqmin' }) : big(shot.sup, { fontSize: tall ? '10cqw' : '7cqh', marginTop: '3cqmin' })}
        {sub}
      </div>);
      break;
    }
    case 'word': {
      const k = ease(p * 6);
      body = (<div style={center}>
        <div className="tx-stencil tx-spray tx-drip" style={{ color: ink, fontSize: tall ? '30cqh' : '26cqh', transform: `scale(${1.8 - 0.8 * k}) rotate(${tall ? -90 : -3}deg)`, opacity: k, whiteSpace: 'nowrap' }}>{shot.sup}</div>
        {!tall && sub}
        {tall && <div style={{ position: 'absolute', bottom: '28cqh', left: 0, right: 0 }}>{sub}</div>}
      </div>);
      break;
    }
    case 'records': {
      const parts = (shot.sub || shot.sup).split(/·/).map((s) => s.trim());
      body = (<>
        {Array.from({ length: 7 }, (_, i) => { const off = ((t * 0.35 + i / 7) % 1) * 140 - 20; return (
          <div key={i} style={{ position: 'absolute', width: tall ? '34cqw' : '22cqh', aspectRatio: '1', background: i % 2 ? '#111' : ink, border: '0.4cqmin solid #e9e4d6', boxShadow: '1cqmin 1cqmin 0 #000', left: tall ? `${10 + (i % 2) * 48}%` : `${off}%`, top: tall ? `${off}%` : `${18 + (i % 2) * 46}%`, opacity: 0.35, display: 'grid', placeItems: 'center' }}>
            <span className="tx-stencil" style={{ color: i % 2 ? ink : '#111', fontSize: '4cqmin' }}>{String(i + 1).padStart(3, '0')}</span></div>); })}
        <div style={center}>{big(shot.sup, { background: '#0b0b0c', padding: '1cqmin 3cqmin' })}{parts.length > 1 && <div className="tx-gaffer tx-type" style={{ fontSize: tall ? '4cqw' : '3cqh', marginTop: '2cqmin' }}>{shot.sub}</div>}</div>
      </>);
      break;
    }
    case 'wall': {
      const gap = ease((p - 0.25) * 2) * (tall ? 30 : 22);
      body = (<>
        <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.25 + 0.75 * ease((p - 0.25) * 2) }} />
        {[-1, 1].map((s) => <div key={s} className="tx-wall" style={{ position: 'absolute', top: 0, bottom: 0, width: '50%', [s < 0 ? 'left' : 'right']: 0, transform: `translateX(${s * gap}cqw)`, background: '#8d8a84', backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,transparent 2px 12cqmin)', boxShadow: 'inset 0 0 40px rgba(0,0,0,.6)', clipPath: s < 0 ? 'polygon(0 0,100% 0,96% 18%,100% 34%,95% 52%,99% 70%,94% 86%,100% 100%,0 100%)' : 'polygon(4% 0,100% 0,100% 100%,0 100%,6% 86%,1% 70%,5% 52%,0 34%,4% 18%,0 0)' }} />)}
        <div style={{ ...center, justifyContent: tall ? 'flex-start' : 'center' }}>{big(shot.sup, { color: '#111', textShadow: 'none', fontSize: tall ? '14cqw' : '12cqh' })}<div className="tx-type" style={{ color: '#111', fontSize: tall ? '5cqw' : '3.4cqh' }}>{shot.sub}</div></div>
      </>);
      break;
    }
    case 'vault': {
      const open = ease((p - 0.1) * 2.2);
      const strobe = open > 0.6 && pulse > 0.6;
      body = (<>
        <div style={{ position: 'absolute', inset: 0, background: strobe ? '#fff' : '#050505', transition: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: tall ? '86cqw' : '70cqh', aspectRatio: '1', marginLeft: tall ? '-43cqw' : '-35cqh', marginTop: tall ? '-43cqw' : '-35cqh', borderRadius: '50%', background: 'radial-gradient(circle,#9a9a9a 0 18%,#555 19% 22%,#7d7d7d 23% 60%,#3a3a3a 61% 64%,#6f6f6f 65%)', boxShadow: 'inset 0 0 0 1.4cqmin #2a2a2a, 0 0 0 2cqmin #1a1a1a', transform: `perspective(800px) rotateY(${-75 * open}deg) rotate(${open * 200}deg)`, transformOrigin: 'left center', opacity: 1 - open * 0.3 }}>
          {Array.from({ length: 6 }, (_, i) => <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: '36%', height: '2.6%', background: '#cfcfcf', transformOrigin: '0 50%', transform: `rotate(${i * 60}deg)` }} />)}
        </div>
        <div style={center}>{big(shot.sup, { opacity: open, color: strobe ? '#111' : '#fff', fontSize: tall ? '20cqw' : '16cqh' })}<div className="tx-type" style={{ color: strobe ? '#111' : '#e9e4d6', fontSize: tall ? '4.4cqw' : '3cqh', opacity: open }}>{shot.sub}</div></div>
      </>);
      break;
    }
    case 'map': {
      const d = tall ? 'M30 170 Q10 90 70 20' : 'M20 75 Q100 5 180 55';
      body = (<>
        <svg viewBox={tall ? '0 0 100 200' : '0 0 200 100'} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: tall ? '14cqh 4cqw 30cqh' : '6cqh 6cqw 20cqh', width: tall ? '92cqw' : '88cqw', height: tall ? '56cqh' : '74cqh' }}>
          <path d={d} fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - ease(p * 1.6)} />
          {tall ? <><circle cx="30" cy="170" r="3.4" fill="#ff5a1f" /><circle cx="70" cy="20" r="3.4" fill="#fff" /><text x="30" y="186" fill="#ff5a1f" textAnchor="middle" className="tx-stencil" style={{ fontSize: 11 }}>DETROIT</text><text x="70" y="12" fill="#fff" textAnchor="middle" className="tx-stencil" style={{ fontSize: 11 }}>BERLIN</text></>
            : <><circle cx="20" cy="75" r="3" fill="#ff5a1f" /><circle cx="180" cy="55" r="3" fill="#fff" /><text x="20" y="90" fill="#ff5a1f" textAnchor="middle" className="tx-stencil" style={{ fontSize: 10 }}>DETROIT</text><text x="180" y="70" fill="#fff" textAnchor="middle" className="tx-stencil" style={{ fontSize: 10 }}>BERLIN</text></>}
        </svg>
        <div style={{ ...center, justifyContent: 'flex-end', paddingBottom: tall ? '30cqh' : '18cqh' }}>{big(shot.sup, { fontSize: tall ? '10cqw' : '7cqh' })}{sub}</div>
      </>);
      break;
    }
    case 'quote': {
      const txt = shot.sub || '';
      const shown = txt.slice(0, Math.ceil(txt.length * clamp(p * 1.8)));
      body = (<div style={center}>
        {big(shot.sup, { fontSize: tall ? '10cqw' : '7.5cqh' })}
        <div className="tx-paste tx-type" style={{ marginTop: '4cqmin', padding: '2cqmin 3cqmin', fontSize: tall ? '5cqw' : '3.6cqh', color: '#111', maxWidth: '90%', transform: 'rotate(-1.2deg)', minHeight: '1.4em' }}>{shown}<span style={{ opacity: Math.floor(t * 3) % 2 }}>▌</span></div>
      </div>);
      break;
    }
    case 'grid': {
      const frozen = /THANK/.test(shot.sup);
      const s16 = Math.floor(beat * 4) % 16;
      const lit = (i: number) => frozen ? [0, 1, 2, 3, 6, 10, 13, 14, 8, 12, 15, 11].includes(i) : i <= Math.floor(p * 16 * 1.2) && hash(i * 9.3) > 0.35;
      body = (<div style={center}>
        <div style={{ display: 'grid', gridTemplateColumns: tall ? 'repeat(4,1fr)' : 'repeat(16,1fr)', gap: '1cqmin', width: tall ? '64cqw' : '84cqw' }}>
          {Array.from({ length: 16 }, (_, i) => <div key={i} style={{ aspectRatio: '1', border: '0.3cqmin solid #1d3a40', background: lit(i) ? (i === s16 && !frozen ? '#ffd400' : ink) : '#0b1416', boxShadow: lit(i) ? `0 0 2cqmin ${ink}` : 'none' }} />)}
        </div>
        {big(shot.sup, { marginTop: '5cqmin', fontSize: tall ? '10cqw' : '8cqh' })}
      </div>);
      break;
    }
    case 'end':
    default: {
      const k = ease(p * 3);
      body = (<div style={{ ...center, background: 'radial-gradient(ellipse at center, rgba(166,59,230,.25), transparent 70%)' }}>
        <div className="tx-stencil" style={{ fontSize: tall ? '15cqw' : '13cqh', textAlign: 'center', background: 'linear-gradient(90deg,#A63BE6,#D40055,#FF8C00)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', transform: `scale(${1.3 - 0.3 * k})`, opacity: k }}>{shot.sup}</div>
        <div className="tx-btn" style={{ marginTop: '4cqmin', fontSize: tall ? '3.6cqw' : '2.6cqh', opacity: ease((p - 0.25) * 4), pointerEvents: 'none' }}>{shot.sub}</div>
      </div>);
    }
  }

  const words = shot.vo.split(/\s+/);
  const wordsShown = Math.ceil(words.length * clamp(p * 1.15));
  return (
    <>
      <div className="tx-brick" style={{ position: 'absolute', inset: 0, opacity: 0.55 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.75))' }} />
      {body}
      <div style={{ position: 'absolute', left: tall ? '6cqw' : '10cqw', right: tall ? '6cqw' : '10cqw', bottom: tall ? '20cqh' : '6cqh', textAlign: 'center' }}>
        <span style={{ background: 'rgba(0,0,0,.78)', color: '#fff', font: `600 ${tall ? '3.8cqw' : '2.8cqh'}/1.35 'IBM Plex Mono',monospace`, padding: '0.3em 0.6em', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{words.slice(0, wordsShown).join(' ')}</span>
      </div>
    </>
  );
}

function Stage({ spot, t, aspect, safe }: { spot: TxSpot; t: number; aspect: 'wide' | 'tall'; safe: boolean }) {
  const shot = spot.shots.find((s) => t >= s.t0 && t < s.t1) || spot.shots[spot.shots.length - 1];
  return (
    <div style={{ position: 'relative', aspectRatio: aspect === 'wide' ? '16 / 9' : '9 / 16', width: '100%', containerType: 'size', overflow: 'hidden', background: '#0b0b0c', border: '2px solid #333' } as React.CSSProperties}>
      <ShotFrame shot={shot} t={t} aspect={aspect} spot={spot} />
      <div className="tx-scan" style={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none' }} />
      {safe && aspect === 'tall' && (<>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '12%', background: 'rgba(255,0,80,.14)', borderBottom: '1px dashed rgba(255,0,80,.7)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '18%', background: 'rgba(255,0,80,.14)', borderTop: '1px dashed rgba(255,0,80,.7)' }} />
        <div style={{ position: 'absolute', right: 0, top: '40%', bottom: '18%', width: '14%', background: 'rgba(255,0,80,.14)', borderLeft: '1px dashed rgba(255,0,80,.7)' }} />
      </>)}
      {safe && aspect === 'wide' && <div style={{ position: 'absolute', inset: '5%', border: '1px dashed rgba(255,0,80,.6)', pointerEvents: 'none' }} />}
      <div style={{ position: 'absolute', left: 6, top: 6, font: "600 10px/1 'IBM Plex Mono',monospace", background: 'rgba(0,0,0,.7)', color: '#ffd400', padding: '3px 5px' }}>{aspect === 'wide' ? '16:9' : '9:16'} · {tc(t)}</div>
    </div>
  );
}

function scriptMarkdown(s: TxSpot) {
  const lines = [`# ${s.title} (${spotDuration(s)}s)`, '', `_${s.logline}_`, '', `**Bed (${s.bpm} BPM, original):** ${s.bed}`, '', `VO words: ${spotWordCount(s)}`, '', '| Time | On screen | VO | Visual | 16:9 | 9:16 | Sound |', '|---|---|---|---|---|---|---|'];
  for (const sh of s.shots) lines.push(`| ${tc(sh.t0).slice(0, 4)}–${tc(sh.t1).slice(0, 4)} | **${sh.sup}**${sh.sub ? `<br>${sh.sub}` : ''} | ${sh.vo} | ${sh.visual} | ${sh.wide} | ${sh.tall} | ${sh.sound} |`);
  return lines.join('\n');
}

export default function SpotPreviz() {
  const [spotId, setSpotId] = useState(TX_SPOTS[0].id);
  const spot = useMemo(() => TX_SPOTS.find((s) => s.id === spotId)!, [spotId]);
  const dur = spotDuration(spot);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aspect, setAspect] = useState<Aspect>('both');
  const [safe, setSafe] = useState(true);
  const [bedOn, setBedOn] = useState(true);
  const [voOn, setVoOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const tRef = useRef(0); tRef.current = t;
  const engine = useRef<MachineFunk | null>(null);
  const lastShot = useRef(-1);

  const shotIdx = spot.shots.findIndex((s) => t >= s.t0 && t < s.t1);
  const shot = spot.shots[shotIdx < 0 ? spot.shots.length - 1 : shotIdx];

  useEffect(() => () => { engine.current?.dispose(); window.speechSynthesis?.cancel(); }, []);

  // clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const nt = tRef.current + dt;
      if (nt >= dur) { setT(dur); setPlaying(false); return; }
      setT(nt); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);

  // scratch bed: Detroit electro, Berlin four-floor for wall/vault/map shots, silent on end card
  useEffect(() => {
    if (!playing || !bedOn) { engine.current?.stop(); return; }
    if (!engine.current) engine.current = new MachineFunk();
    const e = engine.current; e.bpm = spot.bpm;
    const berlin = ['vault', 'map'].includes(shot.comp);
    e.pattern = berlin ? berlinPattern() : shot.comp === 'wall' ? { ...berlinPattern(), clap: Array(16).fill(false), hat: Array(16).fill(false), bass: Array(16).fill(false) } : defaultPattern();
    if (shot.comp === 'end' && t > shot.t0 + 2) e.stop(); else if (!e.playing) e.start();
  }, [playing, bedOn, shot, spot.bpm, t]);

  // scratch VO
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    if (!playing || !voOn) { synth.cancel(); lastShot.current = -1; return; }
    if (shotIdx === lastShot.current) return;
    lastShot.current = shotIdx;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(shot.vo);
    const words = shot.vo.split(/\s+/).length; const avail = shot.t1 - Math.max(shot.t0, t);
    u.rate = clamp(words / Math.max(1, avail) / 2.5, 0.9, 1.5); u.pitch = 0.85;
    synth.speak(u);
  }, [playing, voOn, shotIdx, shot, t]);

  const seek = useCallback((s: number) => { setT(clamp(s, 0, dur)); lastShot.current = -1; }, [dur]);
  useEffect(() => { (window as unknown as { __txPreviz?: unknown }).__txPreviz = { seek, duration: dur, spot: spotId }; }, [seek, dur, spotId]);

  const copy = async () => { try { await navigator.clipboard.writeText(scriptMarkdown(spot)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };

  return (
    <section id="tx-spots" className="tx-wall" style={{ padding: '80px 16px 100px', background: '#0d0d0f' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div className="tx-gaffer tx-type" style={{ fontSize: 13, marginBottom: 12 }}>ROOM 06 · THE EDIT BAY</div>
        <h2 className="tx-stencil tx-spray" style={{ margin: 0, fontSize: 'clamp(44px,8vw,110px)', color: 'var(--tx-acid)' }}>90 SECONDS</h2>
        <p className="tx-type" style={{ color: 'var(--tx-paper)', fontSize: 15, maxWidth: 720, lineHeight: 1.6 }}>Three spots for Plajah Social, scripted shot by shot and pre-visualized in 16:9 and 9:16. The beat is a scratch bed from the exhibit's own synth and the voice is your browser's, both stand-ins for the final mix. Pink zones mark where the phone UI covers the 9:16 frame.</p>

        <div role="tablist" aria-label="Spots" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '22px 0 16px' }}>
          {TX_SPOTS.map((s) => <button key={s.id} type="button" role="tab" aria-selected={s.id === spotId} className="tx-chip" aria-pressed={s.id === spotId} onClick={() => { setSpotId(s.id); setPlaying(false); seek(0); }}>{s.title}</button>)}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <button type="button" className="tx-btn" onClick={() => { if (t >= dur) seek(0); setPlaying((v) => !v); }}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : 'Play'}</button>
          <button type="button" className="tx-btn ghost" onClick={() => seek(0)} aria-label="Back to start"><SkipBack size={14} /></button>
          {(['both', 'wide', 'tall'] as Aspect[]).map((a) => <button key={a} type="button" className="tx-chip" aria-pressed={aspect === a} onClick={() => setAspect(a)}>{a === 'both' ? 'Both' : a === 'wide' ? '16:9' : '9:16'}</button>)}
          <button type="button" className="tx-chip" aria-pressed={safe} onClick={() => setSafe((v) => !v)}>Safe zones</button>
          <button type="button" className="tx-chip" aria-pressed={bedOn} onClick={() => setBedOn((v) => !v)}>{bedOn ? <Volume2 size={11} /> : <VolumeX size={11} />} Bed</button>
          <button type="button" className="tx-chip" aria-pressed={voOn} onClick={() => setVoOn((v) => !v)}>{voOn ? <Mic size={11} /> : <MicOff size={11} />} Scratch VO</button>
          <button type="button" className="tx-chip" onClick={copy}>{copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy script'}</button>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: aspect === 'both' ? 'minmax(0,1fr) minmax(0,0.316fr)' : '1fr', alignItems: 'start', maxWidth: aspect === 'tall' ? 420 : undefined, margin: aspect === 'tall' ? '0 auto' : undefined }} className="txs-stages">
          {aspect !== 'tall' && <Stage spot={spot} t={t} aspect="wide" safe={safe} />}
          {aspect !== 'wide' && <Stage spot={spot} t={t} aspect="tall" safe={safe} />}
        </div>

        <div style={{ position: 'relative', marginTop: 14 }}>
          <div style={{ display: 'flex', height: 26, border: '2px solid #333' }}>
            {spot.shots.map((s, i) => (
              <button key={i} type="button" onClick={() => seek(s.t0)} title={`${tc(s.t0).slice(0, 4)} ${s.sup}`} style={{ flex: s.t1 - s.t0, border: 0, borderRight: '1px solid #000', background: i === shotIdx ? s.ink : `color-mix(in srgb, ${s.ink} 30%, #111)`, cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
          <input type="range" min={0} max={dur} step={1 / 24} value={t} onChange={(e) => seek(+e.target.value)} aria-label="Scrub" style={{ width: '100%', accentColor: '#ffd400', marginTop: 6 }} />
        </div>

        <div className="tx-paste" style={{ marginTop: 16, padding: '16px 18px', display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          <div><div className="txs-k">Shot {shotIdx + 1} · {tc(shot.t0).slice(0, 4)}–{tc(shot.t1).slice(0, 4)}</div><div className="tx-poster" style={{ fontSize: 24, color: '#111' }}>{shot.sup}</div><div className="tx-type" style={{ color: '#333' }}>{shot.sub}</div></div>
          <div><div className="txs-k">VO</div><div className="tx-type" style={{ color: '#111', fontSize: 15 }}>{shot.vo}</div></div>
          <div><div className="txs-k">Visual</div><div className="tx-type" style={{ color: '#222', fontSize: 13 }}>{shot.visual}</div></div>
          <div><div className="txs-k">16:9 / 9:16</div><div className="tx-type" style={{ color: '#222', fontSize: 13 }}>{shot.wide}<br />{shot.tall}</div><div className="txs-k" style={{ marginTop: 6 }}>Sound</div><div className="tx-type" style={{ color: '#222', fontSize: 13 }}>{shot.sound}</div></div>
        </div>
        <div className="tx-type" style={{ color: 'var(--tx-muted)', fontSize: 13, marginTop: 12 }}>{spot.logline} · {spotWordCount(spot)} VO words · {spot.bpm} BPM · Bed: {spot.bed}</div>
      </div>
      <style>{`.txs-k{font:600 10px/1 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:#7a6f55;margin-bottom:4px}@media (max-width:760px){.txs-stages{grid-template-columns:1fr !important}}`}</style>
    </section>
  );
}
