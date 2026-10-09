// Emote lab — live stream simulator. A fake stream, a bot audience, the real EmoteStage / tray /
// picker / chorus detector / Crowd Light. No Firebase.
//   ?view=live&viewers=120&rate=3      bot audience size + emotes per second
//   ?wave=core.fire                    preselect the emote for "Start a chorus"
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EmoteOverlay, type EmoteOverlayHandle } from '../components/emotes/EmoteOverlay';
import { EmoteTray } from '../components/emotes/EmoteTray';
import { EmotePicker } from '../components/emotes/EmotePicker';
import { EmoteChatText } from '../components/emotes/EmoteChatText';
import { EmoteGlyph } from '../components/emotes/EmoteGlyph';
import { ALL_EMOTES, emoteById } from '../services/emotes/emoteLibrary';
import { ChorusDetector, CrowdLight } from '../services/emotes/emoteEngine';
import type { EmoteDef } from '../services/emotes/emoteTypes';
import { preloadEmotes } from '../services/emotes/emoteAssets';

const qs = new URLSearchParams(location.search);
const NAMES = ['mira', 'kofi', 'jun', 'ana', 'theo', 'zara', 'li', 'omar', 'sven', 'priya', 'diego', 'yuki', 'ama', 'noor', 'leo'];
const CHAT = ['this is so good :fire:', 'LMAO :lol:', ':heart: :heart:', 'gg :gg:', 'wait what :wow:', ':kaijuhype:', 'lets gooo :letsgo:', 'chat is wild :skull:', ':purpleheart:', 'the lighting tho :sparkles:'];

/** A "camera" — slow moving gradients + a silhouette, so the overlay is judged over real-looking motion. */
function FakeStream() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = (now: number) => {
      const c = ref.current; if (!c) return;
      const w = (c.width = c.clientWidth), h = (c.height = c.clientHeight), g = c.getContext('2d')!, t = now / 1000;
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, `hsl(${210 + Math.sin(t * 0.2) * 20},40%,28%)`); bg.addColorStop(0.5, `hsl(${30 + Math.sin(t * 0.3) * 10},45%,48%)`); bg.addColorStop(1, '#1b1525');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(255,220,180,${0.05 + i * 0.01})`; g.beginPath(); g.arc(w * (0.15 + i * 0.18), h * 0.25 + Math.sin(t + i) * 8, 26 + i * 4, 0, 7); g.fill(); }
      // creator silhouette
      const cx = w / 2 + Math.sin(t * 0.7) * 12, cy = h * 0.58;
      g.fillStyle = '#2a1f2f';
      g.beginPath(); g.ellipse(cx, cy - h * 0.14, h * 0.085, h * 0.1, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(cx, cy + h * 0.2, h * 0.2, h * 0.22, 0, Math.PI, 0); g.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

export default function Live() {
  const overlay = useRef<EmoteOverlayHandle>(null);
  const crowd = useMemo(() => new CrowdLight(), []);
  const chorus = useMemo(() => new ChorusDetector(), []);
  const [viewers, setViewers] = useState(Number(qs.get('viewers')) || 120);
  const [rate, setRate] = useState(Number(qs.get('rate')) || 2.5);
  const [wave, setWave] = useState(qs.get('wave') || 'core.fire');
  const [picker, setPicker] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [chat, setChat] = useState<{ id: number; who: string; text: string }[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const all = useMemo(() => ALL_EMOTES(), []);
  chorus.audience = viewers;

  useEffect(() => { preloadEmotes(all.filter(e => e.art.kind === 'svg'), 96); }, [all]);
  useEffect(() => { if (overlay.current) overlay.current.stage.reducedMotion = reduced; }, [reduced]);

  const receive = (def: EmoteDef, n: number, uid: string) => {
    crowd.add(def.gel, n);
    overlay.current?.spawn(def, n);
    const hit = chorus.add(def.id, uid);
    if (hit) { overlay.current?.chorus(def, hit.tier, hit.count); setLog(l => [`${new Date().toLocaleTimeString()} · tier ${hit.tier} · :${def.code}: ×${hit.count}`, ...l].slice(0, 8)); }
  };

  // ambient bot audience
  useEffect(() => {
    if (!rate) return;
    const pool = all.filter(e => e.pack === 'core' || e.pack === 'kaiju');
    const t = setInterval(() => {
      if (Math.random() > rate / 5) return;
      const def = pool[(Math.random() * pool.length) | 0];
      receive(def, Math.random() < 0.2 ? 1 + ((Math.random() * 8) | 0) : 1, `bot${(Math.random() * viewers) | 0}`);
      if (Math.random() < 0.15) setChat(c => [...c.slice(-7), { id: Date.now(), who: NAMES[(Math.random() * NAMES.length) | 0], text: CHAT[(Math.random() * CHAT.length) | 0] }]);
    }, 200);
    return () => clearInterval(t);
  }, [rate, viewers, all]);

  /** A wave of distinct people sending the same emote — walks the chorus tiers. */
  const startWave = (people: number) => {
    const def = emoteById(wave); if (!def) return;
    for (let i = 0; i < people; i++) setTimeout(() => receive(def, 1 + ((Math.random() * 3) | 0), `wave${Date.now()}_${i}`), i * (2600 / people));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b0712', color: '#f3eefa', fontFamily: 'system-ui,sans-serif', display: 'flex', gap: 16, padding: 16, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 'min(420px, 100%)', aspectRatio: '9 / 16', borderRadius: 24, overflow: 'hidden', background: '#000', flex: 'none' }}>
        <FakeStream />
        <EmoteOverlay ref={overlay} onFrame={dt => overlay.current?.setCrowdLight(crowd.step(dt))} />
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 84, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, textShadow: '0 1px 3px #000' }}>
          {chat.map(m => <div key={m.id}><b style={{ color: '#ffae5c' }}>{m.who}</b> <EmoteChatText text={m.text} size={20} /></div>)}
        </div>
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 16 }}>
          <EmoteTray onSend={(e, n) => receive(e, n, 'me')} onOpenPicker={() => setPicker(true)} />
        </div>
        {picker && <div style={{ position: 'absolute', inset: 0 }} onClick={() => setPicker(false)}>
          <EmotePicker onClose={() => setPicker(false)} onPick={e => receive(e, 1, 'me')} />
        </div>}
      </div>

      <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <b style={{ fontSize: 18 }}>Live simulator</b>
        <label>Audience {viewers} <input type="range" min={5} max={3000} value={viewers} onChange={e => setViewers(+e.target.value)} /></label>
        <label>Background emotes/sec {rate} <input type="range" min={0} max={5} step={0.5} value={rate} onChange={e => setRate(+e.target.value)} /></label>
        <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> Reduced motion (no flashes, rings or shake)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>Chorus emote</span>
          <select value={wave} onChange={e => setWave(e.target.value)} style={{ background: '#1d1426', color: '#fff', borderRadius: 8, padding: 4 }}>
            {all.map(e => <option key={e.id} value={e.id}>{e.pack} · :{e.code}:{e.evolution ? ` → ${e.evolution}` : ''}</option>)}
          </select>
          {emoteById(wave) && <EmoteGlyph def={emoteById(wave)!} size={32} animate />}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['Small (tier 1)', chorus.thresholds()[0]], ['Medium (tier 2)', chorus.thresholds()[1]], ['Full chorus (tier 3)', chorus.thresholds()[2] + 2]].map(([label, n]) => (
            <button key={label as string} onClick={() => startWave(n as number)} style={{ padding: '8px 12px', borderRadius: 99, border: 'none', background: 'linear-gradient(90deg,#6B0099,#D40055)', color: '#fff', fontWeight: 700 }}>{label} · {n} people</button>
          ))}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Thresholds at this audience: {chorus.thresholds().join(' / ')} distinct senders within 5 s.</div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.8 }}>{log.map((l, i) => <div key={i}>{l}</div>)}</div>
        <a href="?" style={{ color: '#d0bcff' }}>← gallery</a>
      </div>
    </div>
  );
}
