// Living Books audio lab: audition everything the engine can make. Standalone (see living-audio-lab.vite.config.mjs).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBookAudio, type BookAudioEx } from './services/living/audio/engine';
import { SFX_CATALOG, type SfxCategory } from './services/living/audio/sfxCatalog';
import { INSTRUMENTS, resolveInstrument } from './services/living/audio/instruments';
import { AMBIENCE_BEDS } from './services/living/audio/ambience';
import { DEMO_SCORES } from './services/living/audio/demoScores';
import { makeScore, parseNotation, track } from './services/living/audio/compose';
import { splitWords, VoiceRecorder, playTake, exportTake, TapTimer, type RecordedTake } from './services/living/audio/narration';
import { analyse, downsample2, encodeWav16 } from './services/living/audio/analysis';
import { renderNote, renderScore, renderSfx } from './services/living/audio/render';
import { midiToName } from './services/living/audio/notes';

const css = `
  .lab{max-width:1100px;margin:0 auto;padding:16px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #333;padding-bottom:4px}
  .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
  button{background:#2a2733;color:#eee;border:1px solid #444;border-radius:6px;padding:6px 10px;cursor:pointer;font:inherit}
  button:hover{background:#3a3548} button.on{background:#6b46c1;border-color:#9f7aea} button.big{background:#2f855a;border-color:#48bb78;font-weight:600}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
  .cat{margin:10px 0 4px;color:#9a93a8;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
  input[type=range]{width:170px} textarea{width:100%;min-height:70px;background:#201d28;color:#eee;border:1px solid #444;border-radius:6px;padding:8px;font:inherit;box-sizing:border-box}
  select{background:#201d28;color:#eee;border:1px solid #444;border-radius:6px;padding:5px}
  .keys{display:flex;user-select:none;touch-action:none} .key{width:38px;height:120px;border:1px solid #222;background:#f5f2ee;color:#222;display:flex;align-items:flex-end;justify-content:center;font-size:10px;padding-bottom:4px;box-sizing:border-box}
  .key.black{background:#222;color:#eee;height:78px;width:26px;margin:0 -13px;z-index:1;position:relative} .key.down{background:#9f7aea;color:#fff}
  .words span{padding:1px 3px;border-radius:3px} .words span.hit{background:#f6ad55;color:#111}
  .muted{color:#9a93a8;font-size:12px} pre{background:#201d28;padding:8px;border-radius:6px;overflow:auto;font-size:12px}
`;

function useAudio() {
  const ref = useRef<BookAudioEx | null>(null);
  if (!ref.current) ref.current = createBookAudio();
  useEffect(() => () => { ref.current?.dispose(); ref.current = null; }, []);
  return ref.current as BookAudioEx;
}

const NOTE_ROWS = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];
const BLACK_AFTER = new Set([60, 62, 65, 67, 69, 72, 74, 77]);
const KEYMAP = 'awsedftgyhujkolp'.split('');

function Lab() {
  const audio = useAudio();
  const [unlocked, setUnlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [gains, setGains] = useState({ music: 0.7, sfx: 1 });
  const [depth, setDepth] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [variation, setVariation] = useState(0.25);
  const [dscale, setDscale] = useState(1);
  const [inst, setInst] = useState('musicbox');
  const [bed, setBed] = useState<string | null>(null);
  const [cue, setCue] = useState<string | null>(null);
  const [down, setDown] = useState<Record<number, boolean>>({});
  const [text, setText] = useState('Bramble the bear was sleepy, and the moon was bright. Goodnight, little one.');
  const [hit, setHit] = useState(-1);
  const [mode, setMode] = useState('');
  const [notation, setNotation] = useState('E5:1 D5:1 C5:2 | E5:1 D5:1 C5:2 | G5:.5 G5:.5 G5:.5 G5:.5 E5:1 D5:1 | C5:4');
  const [report, setReport] = useState<string>('');
  const [spec, setSpec] = useState<string>('');
  const voices = useRef<Record<number, { setPitch(n: number, g?: number): void; stop(r?: number): void } | null>>({});
  const [take, setTake] = useState<RecordedTake | null>(null);
  const [recState, setRecState] = useState<'idle' | 'recording'>('idle');
  const rec = useRef<VoiceRecorder | null>(null);
  const taps = useRef<TapTimer | null>(null);
  const [tapped, setTapped] = useState<number[]>([]);

  useEffect(() => { audio.registerScores(DEMO_SCORES); }, [audio]);
  const unlock = async () => { await audio.unlock(); setUnlocked(audio.state.unlocked); };
  const sInst = resolveInstrument(inst);

  const cats = useMemo(() => {
    const m = new Map<SfxCategory, typeof SFX_CATALOG[number][]>();
    for (const d of SFX_CATALOG) { const l = m.get(d.category) ?? []; l.push(d); m.set(d.category, l); }
    return [...m.entries()];
  }, []);

  const keyDown = (midi: number) => {
    if (down[midi]) return;
    setDown((d) => ({ ...d, [midi]: true }));
    if (sInst?.sustained) voices.current[midi] = audio.voice(inst, midi) as any;
    else audio.note(inst, midi, { durationMs: 700 });
  };
  const keyUp = (midi: number) => {
    setDown((d) => ({ ...d, [midi]: false }));
    voices.current[midi]?.stop(); voices.current[midi] = null;
  };
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.repeat || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return; const i = KEYMAP.indexOf(e.key); if (i >= 0) keyDown(60 + i); };
    const up = (e: KeyboardEvent) => { const i = KEYMAP.indexOf(e.key); if (i >= 0) keyUp(60 + i); };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  });

  const speak = () => {
    const words = splitWords(text); setHit(-1);
    audio.speak(text, { onWord: setHit });
    setTimeout(() => setMode(audio.narrator.lastMode ?? ''), 300);
    void words;
  };

  const measure = async (kind: 'sfx' | 'note' | 'cue', id: string) => {
    const r = kind === 'sfx' ? await renderSfx(id, { seconds: 4, raw: false, pitch, durationScale: dscale, variation })
      : kind === 'note' ? await renderNote(id, 'C4', { seconds: 4 }) : await renderScore(DEMO_SCORES[id], { seconds: 10 });
    const st = analyse(r.samples, r.sampleRate);
    setReport(`${kind}:${id}  peak ${st.peak.toFixed(2)}  loudness ${st.rmsActiveDb.toFixed(1)} dBFS  length ${st.durationSec.toFixed(2)} s  centroid ${Math.round(st.centroidHz)} Hz  NaN ${st.hasNaN}`);
    const end = Math.min(r.samples.length, Math.ceil((st.durationSec + 0.08) * r.sampleRate));
    const wav = encodeWav16(downsample2(r.samples.subarray(0, end)), r.sampleRate / 2);
    setSpec(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
  };

  const playNotation = () => {
    try {
      const p = parseNotation(notation);
      const sc = makeScore({ id: 'scratch', tempo: 100, lengthBeats: p.lengthBeats, tracks: [track(inst, p.notes)] });
      audio.registerScores({ scratch: sc }); audio.playCue('scratch', { fadeMs: 50 }); setCue('scratch');
      setReport(`parsed ${p.notes.length} notes, ${p.lengthBeats} beats, bars at ${p.bars.join(', ')}`);
    } catch (e) { setReport(String((e as Error).message)); }
  };

  const startRec = async () => {
    try { rec.current = new VoiceRecorder(); await rec.current.start(); setRecState('recording'); taps.current = new TapTimer(splitWords(text).length); taps.current.start(); setTapped([]); }
    catch (e) { setReport(`Could not record: ${(e as Error).message}`); }
  };
  const stopRec = async () => { if (!rec.current) return; const t = await rec.current.stop(); setTake(t); setRecState('idle'); };
  const download = () => { if (!take) return; const f = exportTake(take, 'page-narration'); const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.filename; a.click(); };

  const Btn = (p: { id: string; on?: boolean; children: React.ReactNode; click: () => void }) => <button className={p.on ? 'on' : ''} onClick={p.click} disabled={!unlocked && !p.id.startsWith('unlock')}>{p.children}</button>;

  return (
    <div className="lab">
      <style>{css}</style>
      <h1>Living Audio Lab</h1>
      <div className="muted">Everything here is synthesised in the browser (no audio files). Click <b>Unlock sound</b> first. Offline measurements live in tests/livingAudio.render.test.ts.</div>

      <div className="row">
        <button className="big" onClick={unlock}>{unlocked ? 'Sound unlocked' : 'Unlock sound'}</button>
        <Btn id="mute" on={muted} click={() => { setMuted(!muted); audio.setMuted(!muted); }}>{muted ? 'Unmute' : 'Mute'}</Btn>
        <Btn id="reduced" on={reduced} click={() => { setReduced(!reduced); audio.setReducedSound(!reduced); }}>Reduced sound {reduced ? 'ON' : 'off'}</Btn>
        <label>music <input type="range" min={0} max={1} step={0.05} value={gains.music} onChange={(e) => { const v = +e.target.value; setGains({ ...gains, music: v }); audio.setGains({ music: v }); }} /></label>
        <label>sfx <input type="range" min={0} max={1} step={0.05} value={gains.sfx} onChange={(e) => { const v = +e.target.value; setGains({ ...gains, sfx: v }); audio.setGains({ sfx: v }); }} /></label>
      </div>
      <div className="row">
        <label>depth {depth.toFixed(2)} <input type="range" min={0} max={1} step={0.01} value={depth} onChange={(e) => { const v = +e.target.value; setDepth(v); audio.setDepth(v); }} /></label>
        <Btn id="duck" click={() => audio.duck(0.8, 1500)}>Duck 1.5 s</Btn>
        <label>tempo x{tempo.toFixed(2)} <input type="range" min={0.4} max={1.6} step={0.05} value={tempo} onChange={(e) => { const v = +e.target.value; setTempo(v); audio.setTempoScale(v, 0); }} /></label>
        <Btn id="ramp" click={() => { setTempo(0.5); audio.setTempoScale(0.5, 8000); }}>Slow to 0.5 over 8 s</Btn>
        <Btn id="reset" click={() => { setTempo(1); audio.setTempoScale(1, 500); }}>Tempo 1.0</Btn>
      </div>

      <h2>Music cues</h2>
      <div className="row">
        {Object.keys(DEMO_SCORES).map((id) => <Btn key={id} id={id} on={cue === id} click={() => { audio.playCue(id, { fadeMs: 800 }); setCue(id); }}>{id}</Btn>)}
        <Btn id="stopmusic" click={() => { audio.stopMusic({ fadeMs: 800 }); setCue(null); }}>Stop music</Btn>
        <Btn id="stopall" click={() => { audio.stopAll(); setCue(null); setBed(null); }}>Stop all</Btn>
        {Object.keys(DEMO_SCORES).map((id) => <button key={'m' + id} onClick={() => measure('cue', id)}>measure {id}</button>)}
      </div>

      <h2>Ambience beds</h2>
      <div className="row">
        {AMBIENCE_BEDS.map((b) => <Btn key={b.id} id={b.id} on={bed === b.id} click={() => { audio.setAmbience(b.id, { gain: 0.6, fadeMs: 1000 }); setBed(b.id); }}>{b.label}</Btn>)}
        <Btn id="bedoff" click={() => { audio.setAmbience(null); setBed(null); }}>Off</Btn>
      </div>

      <h2>Sound effects ({SFX_CATALOG.length})</h2>
      <div className="row">
        <label>pitch {pitch > 0 ? '+' : ''}{pitch} st <input type="range" min={-12} max={12} step={1} value={pitch} onChange={(e) => setPitch(+e.target.value)} /></label>
        <label>variation {variation.toFixed(2)} <input type="range" min={0} max={1} step={0.05} value={variation} onChange={(e) => setVariation(+e.target.value)} /></label>
        <label>length x{dscale.toFixed(2)} <input type="range" min={0.5} max={3} step={0.25} value={dscale} onChange={(e) => setDscale(+e.target.value)} /></label>
      </div>
      {cats.map(([cat, list]) => (
        <div key={cat}><div className="cat">{cat}</div>
          <div className="grid">{list.map((d) => <div key={d.id} style={{ display: 'flex', gap: 2 }}>
            <Btn id={d.id} click={() => audio.sfx(d.id, { pitch, variation, durationScale: dscale, pan: 'auto', x01: Math.random() })}>{d.label}</Btn>
            <button title="measure offline" onClick={() => measure('sfx', d.id)}>m</button></div>)}</div></div>
      ))}

      <h2>Instruments</h2>
      <div className="row">
        <select value={inst} onChange={(e) => setInst(e.target.value)}>{INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.label}{i.sustained ? ' (hold)' : ''}</option>)}</select>
        <span className="muted">click keys, or use your keyboard: a w s e d f t g y h u j k o l p. {sInst?.sustained ? 'Held voice: stays on while pressed.' : ''}</span>
        <button onClick={() => measure('note', inst)}>measure C4</button>
      </div>
      <div className="keys">
        {NOTE_ROWS.map((m) => (
          <React.Fragment key={m}>
            <div className={`key${down[m] ? ' down' : ''}`} onPointerDown={() => keyDown(m)} onPointerUp={() => keyUp(m)} onPointerLeave={() => down[m] && keyUp(m)}>{midiToName(m)}</div>
            {BLACK_AFTER.has(m) && <div className={`key black${down[m + 1] ? ' down' : ''}`} onPointerDown={() => keyDown(m + 1)} onPointerUp={() => keyUp(m + 1)} onPointerLeave={() => down[m + 1] && keyUp(m + 1)}>{midiToName(m + 1)}</div>}
          </React.Fragment>
        ))}
      </div>
      <div className="row"><span className="muted">Pitch-bend a held voice (kazoo / whale / hum):</span>
        <input type="range" min={-12} max={12} step={0.1} defaultValue={0} onChange={(e) => { const semis = +e.target.value; for (const [m, v] of Object.entries(voices.current)) v?.setPitch(+m + semis, 40); }} /></div>

      <h2>Write a cue (compact notation)</h2>
      <textarea value={notation} onChange={(e) => setNotation(e.target.value)} />
      <div className="row"><Btn id="playnotation" click={playNotation}>Play with the selected instrument</Btn><span className="muted">C4:1 E4:.5 | rest:1 [C4,E4,G4]:2 | x:.5*4</span></div>

      <h2>Narration</h2>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button onClick={speak}>Read aloud</button><button onClick={() => audio.pauseSpeech()}>Pause</button><button onClick={() => audio.resumeSpeech()}>Resume</button><button onClick={() => { audio.stopTransient(); setHit(-1); }}>Cancel</button>
        <span className="muted">voice path: {mode || '-'} (Aria proxy is only used by getBookAudio() in the app; the lab uses browser speech)</span>
      </div>
      <div className="words">{splitWords(text).map((w, i) => <span key={i} className={i === hit ? 'hit' : ''}>{w} </span>)}</div>
      <h2>Record your own voice (author helper)</h2>
      <div className="row">
        {!VoiceRecorder.isSupported() && <span className="muted">This browser cannot record audio.</span>}
        {recState === 'idle' ? <button onClick={startRec} disabled={!VoiceRecorder.isSupported()}>Record (asks for the microphone)</button> : <button className="on" onClick={stopRec}>Stop</button>}
        {recState === 'recording' && <button onClick={() => { const i = taps.current?.tap() ?? 0; setTapped([...(taps.current?.taps ?? [])]); void i; }}>Tap at each word ({tapped.length}/{splitWords(text).length})</button>}
        {take && <><button onClick={() => { setHit(-1); playTake(take, text, setHit, taps.current?.complete ? taps.current.taps : undefined); }}>Play take</button><button onClick={download}>Export {take.mime}</button><span className="muted">{(take.durationMs / 1000).toFixed(1)} s</span></>}
      </div>

      <h2>Offline measurement</h2>
      <pre>{report || 'Press "m" next to a sound, or "measure" on a cue / instrument.'}</pre>
      {spec && <audio controls src={spec} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
