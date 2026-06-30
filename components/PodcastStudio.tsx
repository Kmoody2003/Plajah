// PodcastStudio — the live-radio production console. Host mic + channel meters/faders, a soundboard,
// record→produce an episode, and panels for ad-roll + callers (Comrex-style). Built on the MixEngine
// (one mixed master → recorder + live publish) and the Soundboard. Opened from content-upload
// "Produce", or to review a recording saved from a live session.
//
// Functional now: mic, meters, mute/fader, record→Blob (onFinish), soundboard. Ad-roll pulls a pool
// (brand deals / radio station) and rolls audio/copy; callers + go-live are the next phases.

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Circle, Square, Radio, Megaphone, PhoneCall, X, Loader2, Sliders } from 'lucide-react';
import { MixEngine } from '../services/podcastStudio/mixEngine';
import { Soundboard, DEFAULT_PADS, type SoundPad } from '../services/podcastStudio/soundboard';
import { CallLine, type StudioCaller } from '../services/podcastStudio/callLine';
import { AdRoll, loadAdLibrary, saveAdLibrary, type AdCreative } from '../services/podcastStudio/adRoll';

const T = { bg: '#0b0b10', panel: '#13131c', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', violet: '#8166e6', red: '#e23b3b', green: '#5fd17f', font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };

const miniBtn = (color: string): React.CSSProperties => ({ padding: '5px 9px', borderRadius: 7, border: `1px solid ${color}`, background: 'transparent', color, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer' });
const adInput: React.CSSProperties = { background: '#0c0c12', color: '#fff', border: '1px solid #23232f', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', width: '100%' };

const Meter: React.FC<{ level: number }> = ({ level }) => (
  <div style={{ height: 6, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.round(level * 100)}%`, background: level > 0.85 ? T.red : level > 0.6 ? T.orange : T.green, transition: 'width 60ms linear' }} />
  </div>
);

const PodcastStudio: React.FC<{ selfUid?: string; albumId?: string; onFinish?: (blob: Blob, durationMs: number) => void; onClose?: () => void }> = ({ selfUid, onFinish, onClose }) => {
  const mixRef = useRef<MixEngine | null>(null);
  const boardRef = useRef<Soundboard | null>(null);
  const startRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [meters, setMeters] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [hostMuted, setHostMuted] = useState(false);
  const [hostGain, setHostGain] = useState(1);
  const [adRolling, setAdRolling] = useState(false);
  const callRef = useRef<CallLine | null>(null);
  const [showId] = useState(() => 'show_' + Math.random().toString(36).slice(2, 9));
  const [callInOn, setCallInOn] = useState(false);
  const [callers, setCallers] = useState<StudioCaller[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const callInUrl = `${location.origin}/?callin=${showId}`;
  const adRollRef = useRef<AdRoll | null>(null);
  const [adLib, setAdLib] = useState<AdCreative[]>([]);
  const [teleprompter, setTeleprompter] = useState<AdCreative | null>(null);
  const [addingAd, setAddingAd] = useState(false);
  const [newAd, setNewAd] = useState({ sponsor: '', copy: '', audioUrl: '' });

  // init engine
  useEffect(() => {
    const mix = new MixEngine();
    mixRef.current = mix;
    boardRef.current = new Soundboard(mix);
    mix.addChannel('ads', 'Ads', { duckable: false });
    adRollRef.current = new AdRoll(mix);
    if (selfUid) loadAdLibrary(selfUid).then(setAdLib).catch(() => {});
    setReady(true);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m: Record<string, number> = {};
      for (const ch of mix.listChannels()) m[ch.id] = mix.meter(ch.id);
      setMeters(m);
      if (mix.isRecording) setElapsed(Date.now() - startRef.current);
    };
    tick();
    return () => { cancelAnimationFrame(raf); callRef.current?.dispose(); callRef.current = null; mix.dispose(); };
  }, []);

  const enableMic = async () => {
    const mix = mixRef.current; if (!mix) return;
    setStatus('Opening mic…');
    try { await mix.resume(); await mix.addMic(); setMicOn(true); setStatus(''); }
    catch { setStatus('Mic blocked'); }
  };

  const toggleRec = async () => {
    const mix = mixRef.current; if (!mix) return;
    if (!recording) {
      if (!micOn) await enableMic();
      startRef.current = Date.now();
      mix.startRecording(); setRecording(true); setStatus('● Recording');
    } else {
      setStatus('Finalizing…');
      const blob = await mix.stopRecording();
      const dur = Date.now() - startRef.current;
      setRecording(false); setStatus(blob.size ? 'Episode ready' : '');
      if (blob.size) onFinish?.(blob, dur);
    }
  };

  const firePad = (pad: SoundPad) => boardRef.current?.fire(pad);

  // Ad-roll placeholder: ducks + plays a cue into the ads bus. Phase 2 pulls real creatives from
  // the user's brand deals / radio station (audio + read copy on a teleprompter).
  const rollCreative = async (c: AdCreative) => {
    if (!adRollRef.current || adRolling) return;
    setAdRolling(true);
    const play = await adRollRef.current.roll(c);
    if (play.mode === 'read') setTeleprompter(c);
    setTimeout(() => setAdRolling(false), c.audioUrl ? 300 : 600);
  };
  const rollAd = async () => {
    if (adLib.length) { rollCreative(adLib[0]); return; }       // roll first spot if any
    const mix = mixRef.current; if (!mix || adRolling) return;   // else a placeholder cue
    setAdRolling(true); mix.duck(true);
    await boardRef.current?.fire({ id: 'ad_sting', label: 'Ad', builtin: 'riser' });
    setTimeout(() => { mix.duck(false); setAdRolling(false); }, 1400);
  };
  const addAdRead = () => {
    if (!newAd.sponsor.trim()) return;
    const c: AdCreative = { id: 'ad_' + Math.random().toString(36).slice(2, 8), sponsor: newAd.sponsor.trim(), label: newAd.sponsor.trim(), copy: newAd.copy.trim() || undefined, audioUrl: newAd.audioUrl.trim() || undefined, source: 'manual' };
    const next = [...adLib, c]; setAdLib(next); setNewAd({ sponsor: '', copy: '', audioUrl: '' }); setAddingAd(false);
    if (selfUid) saveAdLibrary(selfUid, next);
  };

  const startCallIn = async () => {
    if (!selfUid || !mixRef.current || callRef.current) return;
    const cl = new CallLine(showId, selfUid, 'Host', mixRef.current, setCallers);
    callRef.current = cl;
    try { await cl.start(); setCallInOn(true); } catch (e) { console.warn('[studio] call-in failed', e); }
  };
  const copyLink = () => { navigator.clipboard?.writeText(callInUrl).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); }).catch(() => {}); };

  const setGain = (v: number) => { setHostGain(v); mixRef.current?.setGain('host', v); };
  const toggleHostMute = () => { const m = !hostMuted; setHostMuted(m); mixRef.current?.setMute('host', m); };
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: '18px 16px 40px', fontFamily: T.font }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#FF8C00,#8166e6)', display: 'grid', placeItems: 'center' }}><Radio size={20} /></div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Podcast Studio</h1>
            <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12 }}>Record, produce, and broadcast — a live radio station in your browser.</p>
          </div>
          {recording && <span style={{ color: T.red, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>● {fmt(elapsed)}</span>}
          {status && !recording && <span style={{ color: T.muted, fontSize: 12 }}>{status}</span>}
          {onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer' }}><X size={20} /></button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16 }}>
          {/* LEFT: mixer + transport + soundboard */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* channels */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800 }}><Sliders size={13} /> MIXER</div>
              {/* host */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <button onClick={micOn ? toggleHostMute : enableMic} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${micOn && !hostMuted ? T.green : T.border}`, background: 'transparent', color: micOn && !hostMuted ? T.green : T.muted, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  {micOn && !hostMuted ? <Mic size={17} /> : <MicOff size={17} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Host Mic {!micOn && <span style={{ color: T.muted, fontWeight: 400 }}>· tap to enable</span>}</div>
                  <Meter level={meters.host || 0} />
                </div>
                <input type="range" min={0} max={1.5} step={0.01} value={hostGain} onChange={e => setGain(parseFloat(e.target.value))} style={{ width: 90 }} />
              </div>
              {/* soundboard + ads buses (read-only meters) */}
              {['soundboard', 'ads'].map(id => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', opacity: 0.85 }}>
                  <div style={{ width: 38, textAlign: 'center', color: T.muted }}>{id === 'ads' ? <Megaphone size={15} /> : <Circle size={13} />}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 5, textTransform: 'capitalize', color: T.muted }}>{id}</div>
                    <Meter level={meters[id] || 0} />
                  </div>
                  <div style={{ width: 90 }} />
                </div>
              ))}
            </div>

            {/* transport */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={toggleRec} disabled={!ready} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', background: recording ? T.red : T.orange, color: recording ? '#fff' : '#1a1a1a' }}>
                {recording ? <><Square size={15} /> Stop &amp; Save</> : <><Circle size={15} fill="currentColor" /> Record</>}
              </button>
              <button onClick={rollAd} disabled={adRolling} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 10, border: `1px solid ${T.violet}`, background: 'transparent', color: T.violet, cursor: 'pointer', fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }}>
                {adRolling ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} />} Roll Ad
              </button>
            </div>

            {/* soundboard */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800, marginBottom: 12 }}>SOUNDBOARD</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 10 }}>
                {DEFAULT_PADS.map(pad => (
                  <button key={pad.id} onClick={() => firePad(pad)} style={{ aspectRatio: '1', borderRadius: 12, border: `1px solid ${pad.color || T.border}`, background: `${pad.color || T.violet}1a`, color: pad.color || T.ink, cursor: 'pointer', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{pad.label}</button>
                ))}
                <div style={{ aspectRatio: '1', borderRadius: 12, border: `1px dashed ${T.border}`, display: 'grid', placeItems: 'center', color: T.muted, fontSize: 10, textAlign: 'center', padding: 6 }}>+ Upload cue</div>
              </div>
            </div>
          </div>

          {/* RIGHT: ad-roll pool + callers (next phases) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800 }}><Megaphone size={13} /> AD-ROLL</div>
                <button onClick={() => setAddingAd(a => !a)} style={{ background: 'transparent', border: 'none', color: T.violet, fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>{addingAd ? 'Cancel' : '+ Add'}</button>
              </div>
              {teleprompter && (
                <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: 'rgba(255,140,0,0.1)', border: `1px solid ${T.orange}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: T.orange, letterSpacing: 1 }}>LIVE READ · {teleprompter.sponsor}</span>
                    <button onClick={() => setTeleprompter(null)} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer' }}><X size={13} /></button>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>{teleprompter.copy || '(no copy)'}</p>
                </div>
              )}
              {addingAd && (
                <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input value={newAd.sponsor} onChange={e => setNewAd({ ...newAd, sponsor: e.target.value })} placeholder="Sponsor" style={adInput} />
                  <textarea value={newAd.copy} onChange={e => setNewAd({ ...newAd, copy: e.target.value })} placeholder="Ad read copy (optional)" rows={3} style={adInput} />
                  <input value={newAd.audioUrl} onChange={e => setNewAd({ ...newAd, audioUrl: e.target.value })} placeholder="Audio spot URL (optional)" style={adInput} />
                  <button onClick={addAdRead} style={{ padding: '8px 0', borderRadius: 8, border: 'none', background: T.violet, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Save spot</button>
                </div>
              )}
              {adLib.length === 0 && !addingAd && <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, margin: 0 }}>Add brand-deal reads + audio spots. An audio spot ducks the show; a live read shows the copy here to read on air. Each roll logs an ad marker.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {adLib.map(c => (
                  <button key={c.id} onClick={() => rollCreative(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: '#1a1620', color: T.ink, cursor: 'pointer', textAlign: 'left' }}>
                    <Megaphone size={13} color={T.violet} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sponsor}</span>
                    <span style={{ fontSize: 8, color: T.muted, fontWeight: 800 }}>{c.audioUrl ? 'SPOT' : 'READ'}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: 2, color: T.muted, fontWeight: 800, marginBottom: 10 }}><PhoneCall size={13} /> CALLERS</div>
              {!callInOn ? (
                <>
                  <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, margin: '0 0 10px' }}>Open a Comrex-style line: screen callers in cue, put them on air, drop. Signed-in users or <b style={{ color: T.ink }}>guests</b> (name + a temporary session) can call in.</p>
                  <button onClick={startCallIn} disabled={!selfUid} style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: 'none', background: selfUid ? T.green : T.border, color: '#102015', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', cursor: selfUid ? 'pointer' : 'not-allowed' }}>{selfUid ? 'Open call-in line' : 'Sign in to take callers'}</button>
                </>
              ) : (
                <>
                  <button onClick={copyLink} style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: '#0c0c12', color: linkCopied ? T.green : T.ink, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{linkCopied ? '✓ Link copied' : `Copy call-in link · /?callin=${showId.slice(-6)}`}</button>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {callers.length === 0 && <span style={{ fontSize: 11, color: T.muted, fontStyle: 'italic' }}>No callers yet — share the link.</span>}
                    {callers.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1a1620', border: `1px solid ${c.state === 'onair' ? T.red : T.border}`, borderRadius: 9, padding: '7px 9px' }}>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}{c.state === 'onair' && <span style={{ color: T.red, marginLeft: 6, fontSize: 9 }}>● ON AIR</span>}</span>
                        {c.state === 'onair'
                          ? <button onClick={() => callRef.current?.screen(c.id)} style={miniBtn(T.muted)}>Cue</button>
                          : <button onClick={() => callRef.current?.air(c.id)} style={miniBtn(T.red)}>Air</button>}
                        <button onClick={() => callRef.current?.drop(c.id)} style={miniBtn(T.muted)}>Drop</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PodcastStudio;
