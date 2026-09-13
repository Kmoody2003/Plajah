// MeterBridge — the mastering-engineer meter suite, shared by Melos and Fabula.
// Reads the live master bus through the shared MeterAnalyser and renders loudness
// (LUFS M/S/I), true peak, spectrum, loudness history, stereo field and dynamics,
// with switchable loudness standards (incl. the K-System), a live Mix Doctor that
// flags trouble and prescribes the fix, and hover insights carrying engineer
// knowledge. Give it a `tap` that returns the master AudioNode to meter.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MeterAnalyser, type MeterFrame } from '../../services/shared/meterAnalyser';

export interface MeterTap { ctx: BaseAudioContext; node: AudioNode; }
interface Props { tap: () => MeterTap | null; running?: boolean; }

interface Std { g: string; id: string; name: string; lufs: number; tp: number; scale?: boolean; ref?: number; }
const STANDARDS: Std[] = [
  { g: 'Streaming', id: 'spotify', name: 'Spotify · -14', lufs: -14, tp: -1 },
  { g: 'Streaming', id: 'youtube', name: 'YouTube · -14', lufs: -14, tp: -1 },
  { g: 'Streaming', id: 'apple', name: 'Apple Music · -16', lufs: -16, tp: -1 },
  { g: 'Streaming', id: 'tidal', name: 'Tidal / Amazon · -14', lufs: -14, tp: -1 },
  { g: 'Streaming', id: 'deezer', name: 'Deezer · -15', lufs: -15, tp: -1 },
  { g: 'Broadcast / Film', id: 'r128', name: 'EBU R128 · -23', lufs: -23, tp: -1, scale: true },
  { g: 'Broadcast / Film', id: 'atsc', name: 'ATSC A/85 · -24', lufs: -24, tp: -2, scale: true },
  { g: 'Broadcast / Film', id: 'netflix', name: 'Netflix · -27 LKFS', lufs: -27, tp: -2, scale: true },
  { g: 'Broadcast / Film', id: 'cinema', name: 'Theatrical / Dolby · -27', lufs: -27, tp: -2, scale: true },
  { g: 'K-System (Bob Katz)', id: 'k20', name: 'K-20 · orchestral/film', lufs: -20, tp: -1, scale: true, ref: 20 },
  { g: 'K-System (Bob Katz)', id: 'k14', name: 'K-14 · pop/rock master', lufs: -14, tp: -1, scale: true, ref: 14 },
  { g: 'K-System (Bob Katz)', id: 'k12', name: 'K-12 · broadcast/loud', lufs: -12, tp: -0.5, scale: true, ref: 12 },
  { g: 'Loud', id: 'club', name: 'Club / DJ · -8', lufs: -8, tp: -0.3 },
  { g: 'Loud', id: 'cd', name: 'CD master · -9', lufs: -9, tp: -0.1 },
];

interface Insight { c: string; t: string; d: string; w?: (s: Std) => string; }
const INSIGHTS: Record<string, Insight> = {
  loudness: { c: '#00DAF3', t: 'Loudness (LUFS)', d: 'Integrated LUFS is the whole-program loudness a platform reads to decide how much to turn you up or down. Momentary (400ms) and short-term (3s) show how it moves.', w: s => `Target: ${s.lufs} LUFS` },
  integrated: { c: '#00DAF3', t: 'Integrated LUFS', d: 'The single delivery number — gated average across the whole track. This is what gets normalised.', w: s => `Land within ±0.5 LU of ${s.lufs}` },
  momentary: { c: '#00DAF3', t: 'Momentary · 400ms', d: 'The closest meter to "how loud right now" — catches a chorus that jumps out or a verse that vanishes.' },
  short: { c: '#00DAF3', t: 'Short-term · 3s', d: 'How loud a section feels. Balance verse vs chorus and keep no section past target.' },
  lra: { c: '#D0BCFF', t: 'Loudness Range (LRA)', d: 'The spread between quiet and loud sections, in LU — how much dynamic life the master keeps.', w: () => 'Lively: 6–12 LU; under 4 reads flat' },
  truepeak: { c: '#D40055', t: 'True Peak (dBTP)', d: 'Catches inter-sample peaks that appear on playback and clip lossy codecs. Oversampled so your master survives AAC/MP3/Opus.', w: s => `Ceiling at ${s.tp} dBTP` },
  clip: { c: '#EF4444', t: 'Overs / clip', d: 'Every time true peak crosses the ceiling. Even one over can distort after the codec re-expands. Zero on a final master.', w: () => 'Final master: 0 overs' },
  spectrum: { c: '#D0BCFF', t: 'Spectrum & tonal balance', d: 'Live FFT of the master. Full-range music tilts gently down from lows to highs. Watch 200–500 Hz for mud and 2–5 kHz for harshness.' },
  history: { c: '#00DAF3', t: 'Loudness history', d: 'Momentary (purple), short (cyan) and integrated (orange) over time — the iZotope-Insight view. A flat line at one level is a red flag for over-limiting.', w: s => `Dashed = ${s.lufs} LUFS target` },
  stereo: { c: '#06D6A0', t: 'Stereo field', d: 'The goniometer draws L vs R — a round cloud is a healthy stereo image, a vertical smear is mono, a horizontal smear warns of phase problems.' },
  correlation: { c: '#06D6A0', t: 'Phase correlation', d: '+1 is mono, 0 is wide, below 0 the channels fight and cancel in mono (phones, clubs, Bluetooth). Keep bass near +1.' },
  dynamics: { c: '#F59E0B', t: 'Dynamics', d: 'PLR (true peak − integrated) is your headroom and how hard you are limiting. Crest is peak vs RMS punch. Streaming masters breathe around 9–13 PLR.' },
  doctor: { c: '#FF8C00', t: 'Mix Doctor', d: 'Compares every meter against your standard and flags what a mastering engineer would — with the fix. Colour = severity.' },
  ksystem: { c: '#06D6A0', t: 'K-System (Bob Katz)', d: 'Ties meter 0 to a calibrated reference (K-20 film, K-14 pop, K-12 broadcast). You mix to the reference and let dynamics live above it, instead of chasing the ceiling.' },
};

const CSS = `
.mbridge{--o:#FF8C00;--cy:#00DAF3;--mg:#D40055;--pu:#D0BCFF;--gd:#06D6A0;--wn:#F59E0B;--cr:#EF4444;--pnl:#17101F;--ln:rgba(255,255,255,.08);--ln2:rgba(255,255,255,.14);--ink:#EDE7F5;--mut:rgba(237,231,245,.56);--dim:rgba(237,231,245,.32);color:var(--ink);font-family:"Barlow",system-ui,sans-serif}
.mbridge .mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.mbridge .lbl{font-family:"Barlow Semi Condensed","Barlow",sans-serif;text-transform:uppercase;letter-spacing:.13em}
.mbridge .mtop{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.mbridge select{font-family:"Barlow Semi Condensed",sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:12px;color:var(--ink);background:var(--pnl);border:1px solid var(--ln2);border-radius:10px;padding:8px 11px;cursor:pointer;outline:none}
.mbridge select:focus-visible{border-color:var(--o)}
.mbridge .grid{display:grid;grid-template-columns:1.15fr 1fr;gap:12px}
@media(max-width:820px){.mbridge .grid{grid-template-columns:1fr}}
.mbridge .col{display:flex;flex-direction:column;gap:12px}
.mbridge .mod{background:linear-gradient(180deg,var(--pnl),#120C1B);border:1px solid var(--ln);border-radius:15px;padding:13px 14px}
.mbridge .mh{display:flex;align-items:center;gap:8px;margin-bottom:11px}
.mbridge .mh .tag{width:6px;height:15px;border-radius:2px}
.mbridge .mh h3{font-family:"Barlow Semi Condensed",sans-serif;font-weight:700;font-size:12.5px;letter-spacing:.1em;margin:0;flex:1;text-transform:uppercase}
.mbridge .q{width:16px;height:16px;border-radius:50%;border:1px solid var(--ln2);color:var(--dim);font-size:10px;display:grid;place-items:center;cursor:help}
.mbridge .st{font-size:10px;font-weight:700;letter-spacing:.09em;padding:3px 7px;border-radius:20px;font-family:"Barlow Semi Condensed",sans-serif;text-transform:uppercase}
.mbridge .g0{color:var(--gd);background:rgba(6,214,160,.12)} .mbridge .w0{color:var(--wn);background:rgba(245,158,11,.13)} .mbridge .c0{color:var(--cr);background:rgba(239,68,68,.14)}
.mbridge .loud{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center}
.mbridge .big{text-align:center}.mbridge .big .v{font-family:"IBM Plex Mono",monospace;font-weight:500;font-size:44px;line-height:.9;color:var(--cy)}
.mbridge .big .u{font-size:10px;letter-spacing:.13em;color:var(--dim);margin-top:5px}.mbridge .big .t{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mut);margin-top:7px}
.mbridge .bar{margin-bottom:8px}.mbridge .brow{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.1em;color:var(--mut);margin-bottom:3px}.mbridge .brow .bv{font-family:"IBM Plex Mono",monospace;color:var(--ink)}
.mbridge .trk{height:11px;border-radius:6px;background:#0c0812;border:1px solid var(--ln);position:relative;overflow:hidden}
.mbridge .fill{position:absolute;inset:1px auto 1px 1px;border-radius:5px}
.mbridge .tgt{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--o);box-shadow:0 0 6px var(--o)}
.mbridge canvas{display:block;width:100%;border-radius:9px;background:#0b0712;border:1px solid var(--ln)}
.mbridge .pk{display:grid;grid-template-columns:1fr 1fr auto;gap:14px;align-items:end}
.mbridge .ch{display:flex;flex-direction:column;align-items:center;gap:6px}.mbridge .ch .cl{font-size:10px;letter-spacing:.13em;color:var(--mut)}.mbridge .ch .cv{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--mg)}
.mbridge .vm{display:flex;flex-direction:column-reverse;height:120px;gap:2px;width:16px}.mbridge .vs{height:100%;border-radius:2px;background:#160f20}
.mbridge .clip{text-align:center}.mbridge .clip .n{font-family:"IBM Plex Mono",monospace;font-size:26px;color:var(--cr);line-height:1}.mbridge .clip .l{font-size:9px;letter-spacing:.12em;color:var(--dim);margin-top:2px}
.mbridge .led{height:24px;border-radius:7px;margin-top:8px;display:grid;place-items:center;font-size:10px;font-weight:700;letter-spacing:.13em;border:1px solid var(--ln2);color:var(--dim);font-family:"Barlow Semi Condensed",sans-serif}
.mbridge .led.hot{background:var(--cr);color:#fff;border-color:var(--cr)}
.mbridge .stereo{display:grid;grid-template-columns:130px 1fr;gap:14px;align-items:center}
.mbridge .cbar{height:13px;border-radius:7px;background:linear-gradient(90deg,var(--cr),#3a2a12 42%,#123 50%,#1a3a2a 58%,var(--gd));position:relative;border:1px solid var(--ln)}
.mbridge .cn{position:absolute;top:-4px;bottom:-4px;width:3px;background:#fff;border-radius:2px;box-shadow:0 0 8px #fff}
.mbridge .dyn{display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center}
.mbridge .cell{background:#0e0916;border:1px solid var(--ln);border-radius:10px;padding:11px 6px}.mbridge .cell .cv{font-family:"IBM Plex Mono",monospace;font-size:22px;line-height:1}.mbridge .cell .cl{font-size:9px;letter-spacing:.1em;color:var(--dim);margin-top:5px}
.mbridge .doc .it{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--ln)}.mbridge .doc .it:first-child{border-top:0}
.mbridge .sev{width:4px;border-radius:3px;flex:none}.mbridge .doc h4{font-family:"Barlow Semi Condensed",sans-serif;font-weight:700;font-size:11.5px;letter-spacing:.04em;margin:0 0 2px}.mbridge .doc p{margin:0;font-size:12px;color:var(--mut);line-height:1.4}.mbridge .doc .fx{margin-top:4px;font-size:11.5px;color:var(--ink)}.mbridge .doc .fx b{color:var(--o);font-family:"Barlow Semi Condensed",sans-serif;font-size:10px;letter-spacing:.06em}
.mbridge .ok{text-align:center;padding:16px 0;color:var(--gd);font-family:"Barlow Semi Condensed",sans-serif;letter-spacing:.09em;font-weight:600;font-size:12px}
.mbridge .tip{position:fixed;z-index:6000;max-width:290px;background:#0a0710;border:1px solid var(--ln2);border-radius:11px;padding:11px 12px;box-shadow:0 18px 50px rgba(0,0,0,.6);pointer-events:none;opacity:0;transition:opacity .12s}
.mbridge .tip.on{opacity:1}.mbridge .tip .tt{font-family:"Barlow Semi Condensed",sans-serif;font-weight:700;font-size:11px;letter-spacing:.09em;margin-bottom:5px;display:flex;align-items:center;gap:6px}.mbridge .tip .sw{width:8px;height:8px;border-radius:2px}
.mbridge .tip .td{font-size:12px;color:var(--mut);line-height:1.45}.mbridge .tip .tw{font-size:11px;color:var(--gd);margin-top:7px;padding-top:6px;border-top:1px solid var(--ln)}
`;

const SEV = { crit: 'var(--cr)', warn: 'var(--wn)', good: 'var(--gd)' } as const;

export default function MeterBridge({ tap, running = true }: Props) {
  const [stdId, setStdId] = useState('spotify');
  const [retry, setRetry] = useState(0);  // the master bus is built lazily on first play
  const std = useMemo(() => STANDARDS.find(s => s.id === stdId) || STANDARDS[0], [stdId]);
  const stdRef = useRef(std); stdRef.current = std;
  const [docItems, setDocItems] = useState<{ s: keyof typeof SEV; h: string; p: string; fx: string }[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const R = (id: string) => rootRef.current?.querySelector<HTMLElement>('#mb-' + id) || null;

  // meter lifecycle + rAF loop
  useEffect(() => {
    const src = tap();
    if (!src) { const id = setTimeout(() => setRetry(r => r + 1), 700); return () => clearTimeout(id); }
    let analyser: MeterAnalyser | null = null;
    try { analyser = new MeterAnalyser(src.ctx, src.node); } catch { return; }
    const spec = R('spec') as HTMLCanvasElement | null, hist = R('hist') as HTMLCanvasElement | null, scope = R('scope') as HTMLCanvasElement | null;
    const sg = spec?.getContext('2d'), hgc = hist?.getContext('2d'), cg = scope?.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const cv of [spec, hist, scope]) { if (cv) { const r = cv.getBoundingClientRect(); cv.width = Math.max(2, r.width) * dpr; cv.height = Math.max(2, r.height) * dpr; } }
    let overs = 0, prevOver = false, raf = 0, docT = 0;
    const H: { m: number; s: number; i: number }[] = [];
    const dots: { x: number; y: number; l: number }[] = [];
    const set = (id: string, v: string) => { const el = R(id); if (el) el.textContent = v; };
    const width = (id: string, pct: number) => { const el = R(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };
    const pct = (l: number, lo: number, hi: number) => (l - lo) / (hi - lo) * 100;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!analyser) return;
      const f: MeterFrame = analyser.read();
      const S = stdRef.current;
      const dI = f.lufsI <= -100 ? 0 : f.lufsI - S.lufs;
      // loudness
      set('lufsi', f.lufsI <= -100 ? '—' : f.lufsI.toFixed(1));
      set('lufstgt', `target ${S.lufs} · Δ ${dI >= 0 ? '+' : ''}${dI.toFixed(1)} LU`);
      set('mval', f.lufsM <= -100 ? '—' : f.lufsM.toFixed(1)); set('sval', f.lufsS <= -100 ? '—' : f.lufsS.toFixed(1));
      set('lraval', f.lra.toFixed(1) + ' LU');
      width('mfill', pct(f.lufsM, -40, 0)); width('sfill', pct(f.lufsS, -40, 0)); width('lrafill', Math.min(100, f.lra / 16 * 100));
      const tp = Math.max(f.tpL, f.tpR); const overNow = tp > S.tp; if (overNow && !prevOver) overs++; prevOver = overNow;
      // true peak
      set('tpl', (f.tpL >= 0 ? '+' : '') + f.tpL.toFixed(1)); set('tpr', (f.tpR >= 0 ? '+' : '') + f.tpR.toFixed(1));
      set('overs', String(overs)); const led = R('led'); if (led) { led.textContent = overNow ? 'CLIP' : 'No clip'; led.classList.toggle('hot', overNow); }
      paintVM('mbvL', f.tpL); paintVM('mbvR', f.tpR);
      // correlation
      set('corrv', (f.corr >= 0 ? '+' : '') + f.corr.toFixed(2)); const cn = R('corrn'); if (cn) cn.style.left = ((f.corr + 1) / 2 * 100) + '%';
      // dynamics
      const plr = f.lufsI <= -100 ? 0 : Math.max(0, tp - f.lufsI); set('plr', plr.toFixed(1)); set('crest', Math.max(0, tp - f.rms).toFixed(1));
      // status pills
      pill('loudst', Math.abs(dI) <= 1 ? 'good' : Math.abs(dI) <= 3 ? 'warn' : 'crit', Math.abs(dI) <= 1 ? 'On target' : dI > 0 ? 'Too loud' : 'Too quiet');
      pill('tpst', tp > S.tp ? 'crit' : tp > S.tp - 1 ? 'warn' : 'good', tp > S.tp ? 'Over' : 'Safe');
      pill('crst', f.corr > 0.2 ? 'good' : f.corr > -0.05 ? 'warn' : 'crit', f.corr > 0.2 ? 'Wide' : f.corr > -0.05 ? 'Narrow' : 'Phase!');
      pill('dyst', plr > 8 ? 'good' : plr > 5 ? 'warn' : 'crit', plr > 8 ? 'Dynamic' : plr > 5 ? 'Tight' : 'Squashed');
      // canvases
      if (sg && spec) drawSpectrum(sg, spec, f.spectrum, analyser.nbands, dpr);
      H.push({ m: f.lufsM, s: f.lufsS, i: f.lufsI }); if (H.length > 200) H.shift();
      if (hgc && hist) drawHistory(hgc, hist, H, S.lufs, dpr);
      if (cg && scope) drawScope(cg, scope, f.corr, dots, dpr);
      // mix doctor (throttled ~5Hz)
      if (performance.now() - docT > 200) { docT = performance.now(); setDocItems(diagnose(f, tp, plr, S)); }
    };
    const paintVM = (id: string, db: number) => { const m = R(id); if (!m) return; const lit = (db + 54) / 54; const segs = m.children; for (let i = 0; i < segs.length; i++) { const frac = i / segs.length; const dbAt = -54 + frac * 54; (segs[i] as HTMLElement).style.background = frac < lit ? (dbAt > -1 ? 'var(--cr)' : dbAt > -6 ? 'var(--wn)' : dbAt > -18 ? 'var(--gd)' : '#0a8f6e') : '#160f20'; } };
    const pill = (id: string, s: 'good' | 'warn' | 'crit', t: string) => { const el = R(id); if (el) { el.textContent = t; el.className = 'st ' + (s === 'good' ? 'g0' : s === 'warn' ? 'w0' : 'c0'); } };
    if (running) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); analyser?.dispose(); };
  }, [tap, running, retry]);

  // hover tips
  const onEnter = (k: string, e: React.PointerEvent) => { const i = INSIGHTS[k]; const tip = tipRef.current; if (!i || !tip) return;
    tip.querySelector('.tt')!.innerHTML = `<span class="sw" style="background:${i.c}"></span>${i.t}`;
    tip.querySelector('.td')!.textContent = i.d; const w = i.w ? i.w(std) : ''; const tw = tip.querySelector('.tw') as HTMLElement; tw.innerHTML = w; tw.style.display = w ? 'block' : 'none';
    tip.classList.add('on'); move(e); };
  const move = (e: React.PointerEvent) => { const tip = tipRef.current; if (!tip) return; const r = tip.getBoundingClientRect(); let x = e.clientX + 14, y = e.clientY + 14; if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14; if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14; tip.style.left = x + 'px'; tip.style.top = y + 'px'; };
  const leave = () => tipRef.current?.classList.remove('on');
  const hov = (k: string) => ({ onPointerEnter: (e: React.PointerEvent) => onEnter(k, e), onPointerMove: move, onPointerLeave: leave });

  const grouped = useMemo(() => { const g: Record<string, Std[]> = {}; STANDARDS.forEach(s => (g[s.g] ||= []).push(s)); return g; }, []);

  return (
    <div className="mbridge" ref={rootRef}>
      <style>{CSS}</style>
      <div className="mtop">
        <span className="lbl" style={{ fontWeight: 700, letterSpacing: '.06em', fontSize: 15 }}>Meter Bridge</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>master bus · live</span>
        <span style={{ flex: 1 }} />
        <select value={stdId} onChange={e => setStdId(e.target.value)} aria-label="Loudness target">
          {Object.entries(grouped).map(([g, list]) => <optgroup key={g} label={g}>{list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
        </select>
      </div>

      <div className="grid">
        <div className="col">
          <div className="mod" {...hov('loudness')}>
            <div className="mh"><span className="tag" style={{ background: 'var(--cy)' }} /><h3>Loudness · LUFS</h3><span className="q" {...hov(std.scale ? 'ksystem' : 'loudness')}>?</span><span className="st g0" id="mb-loudst">—</span></div>
            <div className="loud">
              <div className="big" {...hov('integrated')}><div className="v mono" id="mb-lufsi">—</div><div className="u lbl">Integrated LUFS</div><div className="t" id="mb-lufstgt">target</div></div>
              <div>
                <div className="bar" {...hov('momentary')}><div className="brow lbl"><span>Momentary · 400ms</span><span className="bv" id="mb-mval">—</span></div><div className="trk"><div className="fill" id="mb-mfill" style={{ background: 'var(--cy)' }} /><div className="tgt" id="mb-mtgt" /></div></div>
                <div className="bar" {...hov('short')}><div className="brow lbl"><span>Short-term · 3s</span><span className="bv" id="mb-sval">—</span></div><div className="trk"><div className="fill" id="mb-sfill" style={{ background: 'var(--cy)' }} /><div className="tgt" id="mb-stgt" /></div></div>
                <div className="bar" {...hov('lra')}><div className="brow lbl"><span>Range · LRA</span><span className="bv" id="mb-lraval">—</span></div><div className="trk"><div className="fill" id="mb-lrafill" style={{ background: 'linear-gradient(90deg,var(--pu),var(--cy))' }} /></div></div>
              </div>
            </div>
          </div>
          <div className="mod" {...hov('truepeak')}>
            <div className="mh"><span className="tag" style={{ background: 'var(--mg)' }} /><h3>True Peak · dBTP</h3><span className="q" {...hov('truepeak')}>?</span><span className="st g0" id="mb-tpst">—</span></div>
            <div className="pk">
              <div className="ch"><span className="cl lbl">Left</span><div className="vm" id="mb-mbvL" /><span className="cv mono" id="mb-tpl">—</span></div>
              <div className="ch"><span className="cl lbl">Right</span><div className="vm" id="mb-mbvR" /><span className="cv mono" id="mb-tpr">—</span></div>
              <div className="clip" {...hov('clip')}><div className="n mono" id="mb-overs">0</div><div className="l lbl">Overs</div><div className="led lbl" id="mb-led">No clip</div></div>
            </div>
          </div>
          <div className="mod" {...hov('spectrum')}><div className="mh"><span className="tag" style={{ background: 'var(--pu)' }} /><h3>Spectrum</h3><span className="q" {...hov('spectrum')}>?</span></div><canvas id="mb-spec" style={{ height: 130 }} /></div>
          <div className="mod" {...hov('history')}><div className="mh"><span className="tag" style={{ background: 'linear-gradient(var(--cy),var(--o))' }} /><h3>Loudness history</h3><span className="q" {...hov('history')}>?</span><span className="lbl" style={{ fontSize: 9, color: 'var(--dim)' }}>M <i style={{ color: 'var(--pu)', fontStyle: 'normal' }}>▬</i>  S <i style={{ color: 'var(--cy)', fontStyle: 'normal' }}>▬</i>  I <i style={{ color: 'var(--o)', fontStyle: 'normal' }}>▬</i></span></div><canvas id="mb-hist" style={{ height: 104 }} /></div>
        </div>

        <div className="col">
          <div className="mod doc"><div className="mh"><span className="tag" style={{ background: 'var(--o)' }} /><h3>Mix Doctor</h3><span className="q" {...hov('doctor')}>?</span><span className={'st ' + (docItems.some(i => i.s === 'crit') ? 'c0' : docItems.length ? 'w0' : 'g0')}>{docItems.length ? docItems.length + ' notes' : 'Clean'}</span></div>
            {docItems.length ? docItems.map((it, i) => <div className="it" key={i}><div className="sev" style={{ background: SEV[it.s] }} /><div><h4 style={{ color: SEV[it.s] }}>{it.h}</h4><p>{it.p}</p><div className="fx"><b>Fix</b> — {it.fx}</div></div></div>) : <div className="ok">✓ In spec — nothing a mastering engineer would flag.</div>}
          </div>
          <div className="mod" {...hov('stereo')}><div className="mh"><span className="tag" style={{ background: 'var(--gd)' }} /><h3>Stereo field</h3><span className="q" {...hov('stereo')}>?</span><span className="st g0" id="mb-crst">—</span></div>
            <div className="stereo"><canvas id="mb-scope" style={{ aspectRatio: '1', height: 130 }} />
              <div {...hov('correlation')}><div className="brow lbl" style={{ marginBottom: 5 }}><span>Correlation</span><span className="bv mono" id="mb-corrv">—</span></div><div className="cbar"><div className="cn" id="mb-corrn" style={{ left: '75%' }} /></div><p style={{ fontSize: 11, color: 'var(--mut)', lineHeight: 1.4, margin: '10px 0 0' }}>Aim +0.3…+0.8. Below 0, parts cancel in mono — keep bass near +1.</p></div></div>
          </div>
          <div className="mod" {...hov('dynamics')}><div className="mh"><span className="tag" style={{ background: 'var(--wn)' }} /><h3>Dynamics</h3><span className="q" {...hov('dynamics')}>?</span><span className="st g0" id="mb-dyst">—</span></div>
            <div className="dyn"><div className="cell"><div className="cv mono" id="mb-plr" style={{ color: 'var(--wn)' }}>—</div><div className="cl lbl">PLR · headroom</div></div><div className="cell"><div className="cv mono" id="mb-crest" style={{ color: 'var(--cy)' }}>—</div><div className="cl lbl">Crest · punch</div></div></div>
          </div>
        </div>
      </div>
      <div className="tip" ref={tipRef}><div className="tt" /><div className="td" /><div className="tw" /></div>
    </div>
  );
}

// ── canvas painters ──
function drawSpectrum(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, bands: Float32Array, n: number, dpr: number) {
  const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.05)'; [-6, -12, -24, -36].forEach(db => { const y = (-db / 48) * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); });
  const bw = W / n;
  for (let i = 0; i < n; i++) { const db = Math.max(-60, bands[i]); const h = Math.max(1, ((db + 60) / 60) * H); const grd = g.createLinearGradient(0, H, 0, H - h); grd.addColorStop(0, '#00DAF3'); grd.addColorStop(.6, '#8B5CFF'); grd.addColorStop(1, '#D40055'); g.fillStyle = grd; g.fillRect(i * bw + bw * .12, H - h, bw * .76, h); }
}
function drawHistory(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, H: { m: number; s: number; i: number }[], tgt: number, dpr: number) {
  const W = cv.width, Ht = cv.height; g.clearRect(0, 0, W, Ht); const top = -5, bot = -40, y = (db: number) => Ht - ((db - bot) / (top - bot)) * Ht;
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.fillStyle = 'rgba(237,231,245,.26)'; g.font = `${9 * dpr}px "IBM Plex Mono"`;
  [-9, -14, -23, -36].forEach(db => { const yy = y(db); g.beginPath(); g.moveTo(22 * dpr, yy); g.lineTo(W, yy); g.stroke(); g.fillText(String(db), 3 * dpr, yy - 2 * dpr); });
  g.setLineDash([5 * dpr, 4 * dpr]); g.strokeStyle = 'rgba(255,140,0,.55)'; g.beginPath(); g.moveTo(22 * dpr, y(tgt)); g.lineTo(W, y(tgt)); g.stroke(); g.setLineDash([]);
  if (H.length < 2) return; const line = (k: 'm' | 's' | 'i', c: string, w: number) => { g.strokeStyle = c; g.lineWidth = w * dpr; g.beginPath(); H.forEach((h, i) => { const x = 22 * dpr + (i / (200 - 1)) * (W - 22 * dpr); const v = h[k] <= -100 ? bot : Math.max(bot, Math.min(top, h[k])); i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); }); g.stroke(); };
  line('m', 'rgba(208,188,255,.5)', 1.3); line('s', 'rgba(0,218,243,.85)', 1.6); line('i', '#FF8C00', 2.1);
}
function drawScope(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, corr: number, dots: { x: number; y: number; l: number }[], dpr: number) {
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2; g.fillStyle = 'rgba(11,7,18,.22)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(cx, 6); g.lineTo(cx, H - 6); g.moveTo(6, cy); g.lineTo(W - 6, cy); g.stroke();
  const wide = (1 - Math.abs(corr)) * .9 + .1, vert = (corr + 1) / 2;
  for (let k = 0; k < 9; k++) { const a = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), .5) * H * .42; let px = Math.cos(a) * rr * wide, py = Math.sin(a) * rr * (.35 + vert * .9); if (corr < 0) { const s = px; px = (px + py) * .7; py = (s - py) * .7; } dots.push({ x: cx + px, y: cy + py, l: 1 }); }
  for (let i = dots.length - 1; i >= 0; i--) { dots[i].l -= .03; if (dots[i].l <= 0) { dots.splice(i, 1); continue; } g.fillStyle = `rgba(6,214,160,${dots[i].l * .8})`; g.fillRect(dots[i].x, dots[i].y, 2 * dpr, 2 * dpr); }
}
function diagnose(f: MeterFrame, tp: number, plr: number, S: Std) {
  const out: { s: 'good' | 'warn' | 'crit'; h: string; p: string; fx: string }[] = [];
  if (f.silent) return out;
  if (tp > S.tp) out.push({ s: 'crit', h: 'True-peak over ceiling', p: `Peaks hit ${tp.toFixed(1)} dBTP, above ${S.tp}. Lossy encoding will clip and distort.`, fx: `Pull the limiter ceiling to ${S.tp} dBTP or lower.` });
  const dI = f.lufsI <= -100 ? 0 : f.lufsI - S.lufs;
  if (dI > 1.5) out.push({ s: 'warn', h: 'Louder than target', p: `Integrated is ${f.lufsI.toFixed(1)} LUFS, ${dI.toFixed(1)} LU over. The platform will turn you down — you're crushing dynamics for nothing.`, fx: `Back off the limiter to near ${S.lufs} LUFS.` });
  else if (dI < -2 && f.lufsI > -100) out.push({ s: 'warn', h: 'Quieter than target', p: `Integrated is ${f.lufsI.toFixed(1)} LUFS, ${(-dI).toFixed(1)} LU under. You may land quieter than peers.`, fx: `Raise level toward ${S.lufs} LUFS, keeping true peak under ${S.tp}.` });
  if (f.lra > 0 && f.lra < 4 && plr > 0) out.push({ s: 'warn', h: 'Over-limited — low range', p: `LRA is ${f.lra.toFixed(1)} LU and PLR ${plr.toFixed(0)} dB — flat and fatiguing.`, fx: `Ease the limiter / bus comp; aim for PLR 8–12.` });
  if (f.corr < 0.1 && !f.silent) out.push({ s: 'crit', h: 'Phase / mono risk', p: `Correlation is ${f.corr >= 0 ? '+' : ''}${f.corr.toFixed(2)} — parts cancel and will vanish on mono systems.`, fx: `Mono-check the low end; keep bass near +1.` });
  return out;
}
