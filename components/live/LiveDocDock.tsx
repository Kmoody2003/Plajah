// Drop-in for any live surface: the presenter gets "Present a Tela doc", and whenever a document is on, everyone
// else gets it beside the stream. Separate from screen share: nothing here touches the video.

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { listTelaDocs, loadTelaDoc } from '../../services/telaStore';
import type { TelaDocMeta } from '../../types';
import type { LiveDocMode } from '../../services/liveDocPrepare';
import { useLiveDocSource, type LiveDocSource } from '../../hooks/useLiveDocSource';
import type { LiveDocAudience } from '../../services/liveDocSource';

const LiveDocStage = lazy(() => import('./LiveDocStage'));

const CSS = `
.ldd-pill{position:fixed;z-index:12001;top:12px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 15px;border:1px solid rgba(255,255,255,.25);border-radius:99px;background:rgba(20,12,32,.92);color:#f4f1f7;font:600 13px/1 Outfit,system-ui,sans-serif;cursor:pointer}
.ldd-panel{position:fixed;z-index:12000;top:0;right:0;bottom:0;width:min(620px,52vw);display:flex;flex-direction:column;background:#17121f;border-left:1px solid rgba(255,255,255,.14);box-shadow:-14px 0 40px rgba(0,0,0,.45)}
@media (max-width:760px){.ldd-panel{top:40vh;left:0;width:auto;border-left:0;border-top:1px solid rgba(255,255,255,.14);border-radius:16px 16px 0 0;overflow:hidden}}
.ldd-pick{position:fixed;z-index:12002;inset:0;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.6)}
.ldd-card{width:min(480px,100%);max-height:80vh;display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:18px;background:#1b1029;color:#f4f1f7;border:1px solid rgba(255,255,255,.14);font-family:Inter,system-ui,sans-serif}
.ldd-card h3{margin:0;font:700 18px/1.2 Outfit,sans-serif}
.ldd-card p{margin:0;font-size:13px;color:rgba(244,241,247,.72)}
.ldd-list{flex:1;min-height:80px;overflow-y:auto;display:grid;gap:4px;align-content:start}
.ldd-list button{min-height:44px;padding:8px 12px;border:0;border-radius:10px;background:rgba(255,255,255,.06);color:#f4f1f7;text-align:left;font:500 14px/1.3 Inter,sans-serif;cursor:pointer}
.ldd-list button:hover,.ldd-list button:focus-visible{background:rgba(255,255,255,.14)}
.ldd-modes{display:grid;gap:6px}
.ldd-modes label{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.35;cursor:pointer}
.ldd-modes b{font-weight:600}
`;

const MODE_HELP: Array<[LiveDocMode, string, string]> = [
  ['FOLLOW', 'Follow me', 'Everyone sees your page, and what you do with videos, simulations and models.'],
  ['OWN_COPY', 'Own copy', 'Each person you bring on works privately and can submit forms back to you.'],
  ['TOGETHER', 'Together', 'The people you bring on write on one copy. Everyone sees it change.'],
];

/** The list of the presenter's documents, then which way the audience uses the chosen one. */
export function LiveDocPicker({ src, onClose, onStarted }: { src: LiveDocSource; onClose: () => void; onStarted?: () => void }) {
  const [docs, setDocs] = useState<TelaDocMeta[] | null>(null);
  const [mode, setMode] = useState<LiveDocMode>('FOLLOW');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState('');
  useEffect(() => { void listTelaDocs().then(setDocs).catch(() => setDocs([])); }, []);
  const choose = async (id: string) => {
    setBusy(true);
    setWarn('');
    const d = await loadTelaDoc(id);
    const res = d ? await src.start(d, mode) : null;
    setBusy(false);
    if (!d) { setWarn('That document could not open.'); return; }
    if (!res) return;
    if (res.deadMedia > 0) { setWarn(`${res.deadMedia} file${res.deadMedia === 1 ? '' : 's'} in this document only open on your device, so others won't see them. Save the document in Tela while signed in, then present it again.`); onStarted?.(); return; }
    onStarted?.();
    onClose();
  };
  return (
    <div className="ldd-pick" role="dialog" aria-modal="true" aria-label="Present a Tela document">
      <style>{CSS}</style>
      <div className="ldd-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Present a Tela document</h3>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 40, height: 40, border: 0, borderRadius: '50%', background: 'rgba(255,255,255,.1)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <fieldset className="ldd-modes" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, padding: 0 }}>Everyone watches. Only people you bring on through raise hand can interact.</legend>
          {MODE_HELP.map(([k, label, help]) => (
            <label key={k}><input type="radio" name="ldd-mode" checked={mode === k} onChange={() => setMode(k)} style={{ marginTop: 3, accentColor: '#D40055' }} /><span><b>{label}.</b> {help}</span></label>
          ))}
        </fieldset>
        {(warn || src.error) && <p role="alert" style={{ color: '#ffb066' }}>{warn || src.error}</p>}
        <div className="ldd-list">
          {docs === null && <p>Finding your documents…</p>}
          {docs?.length === 0 && <p>You have no Tela documents on this device yet. Make one in Tela first.</p>}
          {docs?.map(m => <button key={m.id} type="button" disabled={busy} onClick={() => void choose(m.id)}>{m.title || 'Untitled'}</button>)}
        </div>
        {busy && <p>Putting it on the stream…</p>}
      </div>
    </div>
  );
}

export default function LiveDocDock({ sessionKey, canPresent, hostName, audience = 'signedIn', memberUids }: {
  /** The stream or call this document belongs to. */
  sessionKey: string | null | undefined;
  canPresent: boolean;
  hostName: string;
  audience?: LiveDocAudience;
  memberUids?: string[];
}) {
  const src = useLiveDocSource(sessionKey || null, { hostName, audience, memberUids });
  const [picking, setPicking] = useState(false);
  const [hidden, setHidden] = useState(false);
  // A new document opens for everyone, even if they hid the last one.
  const rev = src.active ? src.state?.rev : 0;
  useEffect(() => { if (rev) setHidden(false); }, [rev]);
  if (!sessionKey || typeof document === 'undefined') return null;
  const showPill = (src.active && hidden) || (!src.active && canPresent);
  return createPortal(
    <>
      <style>{CSS}</style>
      {showPill && (
        <button type="button" className="ldd-pill" onClick={() => (src.active ? setHidden(false) : setPicking(true))}>
          <FileText size={15} /> {src.active ? `Open ${src.state?.title || 'the document'}` : 'Present a Tela doc'}
        </button>
      )}
      {src.active && !hidden && (
        <div className="ldd-panel">
          <Suspense fallback={null}><LiveDocStage src={src} onClose={() => setHidden(true)} /></Suspense>
        </div>
      )}
      {picking && <LiveDocPicker src={src} onClose={() => setPicking(false)} />}
    </>,
    document.body,
  );
}
