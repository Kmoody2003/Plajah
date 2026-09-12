// GeneratePanel — the one generation surface in Fabula, opened from three doors: the SLATE shot card,
// the media pool, and a right-clicked timeline clip. All three build the same ShotSpec; this panel just
// decides how it gets executed.
//
// Two modes, and the distinction is about MONEY, not convenience:
//   CONNECTED — our cloud agent runs the job on the user's linked developer account. Only available
//               where the provider has a real public API.
//   HAND OFF  — Fabula compiles the prompt + reference pack, the user runs it in their own browser on
//               their own subscription, and the watch folder catches the download into the bin.
// Handoff is the only path that spends the consumer credits users already pay for, and for Dreamina /
// Google Flow it is the only path at all. See docs/fabula/GEN_HANDOFF_PLAN.md.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, X, Link2, Loader, CheckCircle2, AlertTriangle, Film,
  Image as ImageIcon, Wand2, ExternalLink, Copy, Wallet,
} from "lucide-react";
import {
  listConnectors, listJobs, submitJob, pollJob, connectAccount, health,
  assetTypeForMime, compileHandoff, refsForConnector, saveProviderKey, revokeProvider,
} from "../../services/fabula/genAgent";

const WALLET_LABEL = {
  shared: "Draws your plan credits",
  separate: "Separate developer balance",
  none: "No API — hand off only",
};

export default function GeneratePanel({ projectId, bins = [], defaultBin, onClose, importResults, context }) {
  const [healthy, setHealthy] = useState(null);        // null=checking, true/false
  const [connectors, setConnectors] = useState([]);
  const [provider, setProvider] = useState(context?.provider || "");
  const [mode, setMode] = useState("connected");        // connected | handoff
  const [prompt, setPrompt] = useState(context?.spec?.prompt || "");
  const [aspect, setAspect] = useState(context?.spec?.aspect || "16:9");
  const [bin, setBin] = useState(defaultBin || "");
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [keyChallenge, setKeyChallenge] = useState(null);  // { provider, keyUrl, keyLabel, keyHelp }
  const [keyValue, setKeyValue] = useState("");
  const [keyErr, setKeyErr] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const imported = useRef(new Set());                   // jobIds whose results we've already added

  const conn = connectors.find((c) => c.id === provider);
  const kind = conn?.kind || context?.kind || "video";
  const canConnect = !!conn?.modes?.includes("connected");

  // The spec being generated: the caller's (SLATE shot, timeline clip) with live prompt/aspect edits
  // layered on, or a bare prompt when opened from the media pool.
  const spec = useMemo(() => ({
    ...(context?.spec || { refs: [] }),
    prompt,
    aspect,
  }), [context?.spec, prompt, aspect]);

  const handoff = useMemo(
    () => (conn ? compileHandoff(spec, conn) : null),
    [spec, conn],
  );
  const refSplit = useMemo(
    () => (conn ? refsForConnector(spec, conn) : { used: [], dropped: [] }),
    [spec, conn],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const h = await health(); if (alive) setHealthy(h);
      const cs = await listConnectors(); if (!alive) return;
      setConnectors(cs);
      if (!provider && cs[0]) setProvider(context?.provider || cs[0].id);
      setJobs(await listJobs(projectId));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // A provider with no public API can only be handed off — never leave the UI offering a Generate
  // button that would just error.
  useEffect(() => {
    if (conn && !canConnect) setMode("handoff");
  }, [conn, canConnect]);

  // Poll active jobs; import results into their target bin the moment they finish.
  useEffect(() => {
    const active = jobs.some((j) => j.status === "queued" || j.status === "running");
    if (!active) return undefined;
    const t = setInterval(async () => {
      const updated = await Promise.all(jobs.map(async (j) => {
        if (j.status !== "queued" && j.status !== "running") return j;
        const fresh = await pollJob(projectId, j.id);
        return fresh ? { ...j, ...fresh } : j;
      }));
      updated.forEach((j) => {
        if (j.status === "done" && j.results?.length && !imported.current.has(j.id)) {
          imported.current.add(j.id);
          // The job goes with the results: its spec carries the shotId, which is how a finished
          // generation finds the placeholder clip it should fill in the cut.
          importResults?.(j.results.map((r) => ({ ...r, type: assetTypeForMime(r.mime) })), j.bin, j);
        }
      });
      setJobs(updated);
    }, 4000);
    return () => clearInterval(t);
  }, [jobs, projectId, importResults]);

  const doConnect = async (pid) => {
    setKeyErr("");
    try {
      const r = await connectAccount(pid);
      if (r.needsKey) { setKeyValue(""); setKeyChallenge({ provider: pid, ...r }); }
      else if (r.authUrl) window.open(r.authUrl, "_blank", "noopener");
      else if (r.connected) setConnectors((cs) => cs.map((c) => (c.id === pid ? { ...c, connected: true } : c)));
    } catch (e) { setKeyErr(e?.message || "Couldn't start linking that account."); }
  };

  // The key goes straight to the server, which verifies it against the provider before storing it
  // encrypted. It is never held in component state after this, and never comes back from the server.
  const submitKey = async () => {
    if (!keyChallenge || !keyValue.trim()) return;
    setKeyBusy(true); setKeyErr("");
    try {
      const r = await saveProviderKey(keyChallenge.provider, keyValue.trim());
      setConnectors((cs) => cs.map((c) => (c.id === keyChallenge.provider ? { ...c, connected: true, hint: r.hint } : c)));
      setKeyChallenge(null); setKeyValue("");
    } catch (e) { setKeyErr(e?.message || "That key was rejected."); }
    finally { setKeyBusy(false); }
  };

  const doRevoke = async (pid) => {
    if (!window.confirm(`Unlink ${connectors.find((c) => c.id === pid)?.name || pid}? The stored key is deleted.`)) return;
    if (await revokeProvider(pid)) {
      setConnectors((cs) => cs.map((c) => (c.id === pid ? { ...c, connected: false, hint: undefined } : c)));
    }
  };

  const generate = async () => {
    if (!provider || !prompt.trim()) return;
    setBusy(true);
    try {
      const job = await submitJob({
        provider, kind, prompt: prompt.trim(), spec,
        params: kind === "video" ? { aspect } : {},
        projectId, bin: bin || "Generated",
      });
      setJobs((js) => [job, ...js.filter((j) => j.id !== job.id)]);
      if (job.status !== "backend-offline") setPrompt("");
    } finally { setBusy(false); }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
  };

  const statusPill = (j) => {
    if (j.status === "done") return <span className="gp-pill ok"><CheckCircle2 size={11} /> done</span>;
    if (j.status === "error") return <span className="gp-pill err"><AlertTriangle size={11} /> {j.error || "error"}</span>;
    if (j.status === "backend-offline") return <span className="gp-pill err"><AlertTriangle size={11} /> agent offline</span>;
    return <span className="gp-pill run"><Loader size={11} className="gp-spin" /> {j.status}{j.progress ? ` ${Math.round(j.progress * 100)}%` : ""}</span>;
  };

  return (
    <div className="gp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="gp-modal glass-dark">
        <div className="gp-head">
          <div className="gp-title">
            <Sparkles size={15} /> GENERATE
            {context?.title && <span className="gp-ctx">{context.title}</span>}
          </div>
          <button className="gp-x" onClick={onClose}><X size={16} /></button>
        </div>

        {healthy === false && mode === "connected" && (
          <div className="gp-note">
            The generation agent isn’t connected yet. You can still queue jobs — they’ll run once the
            cloud agent is live. Or switch to <b>Hand off</b> and run this on your own account right now.
          </div>
        )}

        {/* connectors + account linking */}
        <div className="gp-conns">
          {connectors.map((c) => (
            <button key={c.id} className={`gp-conn ${provider === c.id ? "on" : ""}`} onClick={() => setProvider(c.id)} title={c.blurb}>
              <div className="gp-conn-top">
                {c.kind === "video" ? <Film size={13} /> : c.kind === "upscale" ? <Wand2 size={13} /> : <ImageIcon size={13} />}
                <span className="gp-conn-name">{c.name}</span>
                {!c.modes?.includes("connected")
                  ? <span className="gp-handoffonly">hand off</span>
                  : c.connected
                    ? (
                      <span className="gp-linked" title={c.hint ? `Key ${c.hint}` : "linked"}
                        onClick={(e) => { e.stopPropagation(); doRevoke(c.id); }}>
                        <CheckCircle2 size={11} /> {c.hint || "linked"}
                      </span>
                    )
                    : <span className="gp-link" onClick={(e) => { e.stopPropagation(); doConnect(c.id); }}><Link2 size={11} /> connect</span>}
              </div>
              <div className="gp-conn-blurb">{c.blurb}</div>
            </button>
          ))}
        </div>

        {keyErr && !keyChallenge && <div className="gp-note err"><AlertTriangle size={12} /> {keyErr}</div>}

        {/* API-key link form. Magnific authenticates with a key rather than OAuth, so there is nothing
            to redirect to — the user pastes it, the server verifies it against Magnific and stores it
            encrypted, and it never comes back to the browser. */}
        {keyChallenge && (
          <div className="gp-keybox">
            <div className="gp-keyhead">
              <span className="gp-hlbl">LINK {(connectors.find((c) => c.id === keyChallenge.provider)?.name || keyChallenge.provider).toUpperCase()}</span>
              {keyChallenge.keyUrl && (
                <a className="gp-hbtn" href={keyChallenge.keyUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={11} /> Get a key
                </a>
              )}
              <button className="gp-x" onClick={() => { setKeyChallenge(null); setKeyValue(""); setKeyErr(""); }}><X size={14} /></button>
            </div>
            {keyChallenge.keyHelp && <div className="gp-keyhelp">{keyChallenge.keyHelp}</div>}
            <div className="gp-keyrow">
              <input className="gp-keyin" type="password" autoComplete="off" spellCheck={false}
                placeholder={keyChallenge.keyLabel || "Paste your API key"}
                value={keyValue} onChange={(e) => setKeyValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitKey(); }} />
              <button className="gp-go" disabled={keyBusy || !keyValue.trim()} onClick={submitKey}>
                {keyBusy ? "Verifying…" : "Link"}
              </button>
            </div>
            {keyErr && <div className="gp-keyerr"><AlertTriangle size={11} /> {keyErr}</div>}
          </div>
        )}

        {/* mode toggle — the honest one. Connected is hidden entirely when there's no API to connect to. */}
        {conn && (
          <div className="gp-modes">
            <button className={`gp-mode ${mode === "connected" ? "on" : ""}`} disabled={!canConnect}
              onClick={() => setMode("connected")}
              title={canConnect ? "Our agent runs it on your linked developer account" : `${conn.name} has no public API`}>
              <Sparkles size={12} /> Connected
            </button>
            <button className={`gp-mode ${mode === "handoff" ? "on" : ""}`} onClick={() => setMode("handoff")}
              title="Compile the prompt + references and run it yourself on your own subscription">
              <ExternalLink size={12} /> Hand off
            </button>
            <span className={`gp-wallet ${conn.walletModel}`}>
              <Wallet size={11} /> {mode === "handoff" ? "Spends your subscription" : WALLET_LABEL[conn.walletModel]}
            </span>
          </div>
        )}
        {conn?.walletNote && mode === "connected" && (
          <div className="gp-walletnote">{conn.walletNote}</div>
        )}

        {/* prompt */}
        <textarea className="gp-prompt" rows={context?.spec ? 5 : 3}
          placeholder={`Describe what ${conn?.name || "the service"} should ${kind === "video" ? "generate as a shot" : "create"}…`}
          value={prompt} onChange={(e) => setPrompt(e.target.value)} />

        {/* references carried from the scene bible / pool */}
        {!!spec.refs?.length && (
          <div className="gp-refs">
            {spec.refs.map((r, i) => {
              const dropped = refSplit.dropped.includes(r);
              return (
                <span key={i} className={`gp-ref ${dropped ? "off" : ""}`} title={r.lock || r.name || r.role}>
                  <b>{r.role.replace(/_/g, " ")}</b>
                  {r.name ? ` · ${r.name}` : ""}
                  {dropped && <em> — not supported here</em>}
                </span>
              );
            })}
          </div>
        )}

        {mode === "connected" ? (
          <div className="gp-controls">
            {(kind === "video" || conn?.caps?.aspects) && (
              <select className="gp-sel" value={aspect} onChange={(e) => setAspect(e.target.value)} title="Aspect ratio">
                {(conn?.caps?.aspects || ["16:9", "9:16", "1:1", "21:9", "4:5", "2.39:1"]).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            <select className="gp-sel" value={bin} onChange={(e) => setBin(e.target.value)} title="Results land in this bin">
              <option value="">Generated/{conn?.name || "…"}</option>
              {bins.filter((b) => b && b !== "all").map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <button className="gp-go" disabled={busy || !prompt.trim() || !provider} onClick={generate}>
              <Sparkles size={13} /> {busy ? "Queuing…" : "Generate"}
            </button>
          </div>
        ) : (
          /* ── HAND OFF ─────────────────────────────────────────────────────────── */
          <div className="gp-handoff">
            <div className="gp-hrow">
              <span className="gp-hlbl">COMPILED FOR {conn?.name?.toUpperCase()}</span>
              <button className="gp-hbtn" onClick={() => copy(handoff?.prompt || "")}><Copy size={11} /> Copy prompt</button>
              {conn?.handoffUrl && (
                <a className="gp-hbtn go" href={conn.handoffUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={11} /> Open {conn.name}
                </a>
              )}
            </div>
            <pre className="gp-hprompt">{handoff?.prompt || "—"}</pre>
            {!!handoff?.notes?.length && (
              <ol className="gp-hnotes">
                {handoff.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ol>
            )}
          </div>
        )}

        {/* jobs */}
        <div className="gp-jobs">
          {jobs.length === 0 && <div className="gp-empty">No jobs yet. Your generations show up here and land in the chosen bin when they finish.</div>}
          {jobs.map((j) => (
            <div key={j.id} className="gp-job">
              <div className="gp-job-main">
                <div className="gp-job-prov">
                  {(connectors.find((c) => c.id === j.provider)?.name || j.provider)} · <span className="gp-job-bin">{j.bin}</span>
                  {j.spec?.slug && <span className="gp-job-slug"> · {j.spec.slug}</span>}
                </div>
                <div className="gp-job-prompt">{j.prompt}</div>
                {j.note && <div className="gp-job-note"><AlertTriangle size={10} /> {j.note}</div>}
              </div>
              <div className="gp-job-side">
                {statusPill(j)}
                {j.results?.length ? <div className="gp-thumbs">{j.results.slice(0, 4).map((r, i) => (
                  r.mime?.startsWith("image") ? <img key={i} src={r.url} alt="" className="gp-thumb" /> : <span key={i} className="gp-thumb vid"><Film size={12} /></span>
                ))}</div> : null}
              </div>
            </div>
          ))}
        </div>

        <style>{`
          .gp-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(4,4,8,0.62);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px}
          .gp-modal{width:min(680px,94vw);max-height:88vh;overflow:auto;border-radius:16px;border:1px solid rgba(255,255,255,0.1);padding:18px 18px 20px;box-shadow:0 24px 80px rgba(0,0,0,0.6)}
          .gp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
          .gp-title{display:flex;align-items:center;gap:8px;font-weight:900;letter-spacing:.14em;font-size:12px;color:#fff}
          .gp-ctx{font-weight:700;letter-spacing:.04em;color:#f0913f;background:rgba(240,145,63,0.12);border:1px solid rgba(240,145,63,0.3);border-radius:999px;padding:2px 9px;font-size:10.5px}
          .gp-x{background:none;border:none;color:var(--w40,#9a96a8);cursor:pointer;padding:4px;border-radius:6px}
          .gp-x:hover{color:#fff;background:rgba(255,255,255,0.08)}
          .gp-note{font-size:12px;line-height:1.5;color:#d7c9a6;background:rgba(180,140,40,0.12);border:1px solid rgba(200,160,60,0.28);border-radius:10px;padding:9px 11px;margin-bottom:12px}
          .gp-conns{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:13px}
          @media(max-width:520px){.gp-conns{grid-template-columns:1fr}}
          .gp-conn{text-align:left;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.09);border-radius:11px;padding:10px 11px;cursor:pointer;color:#cfcbdb}
          .gp-conn.on{border-color:rgba(224,69,155,0.6);background:linear-gradient(120deg,rgba(124,58,237,0.18),rgba(249,115,22,0.12))}
          .gp-conn-top{display:flex;align-items:center;gap:7px}
          .gp-conn-name{font-weight:800;color:#fff;letter-spacing:.02em}
          .gp-linked{margin-left:auto;display:flex;align-items:center;gap:3px;font-size:10px;color:#6ee7a8}
          .gp-handoffonly{margin-left:auto;font-size:10px;color:#c8a2ff;border:1px solid rgba(180,140,255,0.3);border-radius:999px;padding:2px 7px}
          .gp-link{margin-left:auto;display:flex;align-items:center;gap:3px;font-size:10px;color:#7db6ff;padding:2px 6px;border:1px solid rgba(120,180,255,0.3);border-radius:999px}
          .gp-link:hover{background:rgba(120,180,255,0.14)}
          .gp-conn-blurb{font-size:11px;color:var(--w40,#918da0);margin-top:4px}
          .gp-modes{display:flex;align-items:center;gap:7px;margin-bottom:9px}
          .gp-mode{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);color:#cfcbdb;border-radius:999px;padding:6px 13px;font-size:11.5px;font-weight:700;cursor:pointer}
          .gp-mode.on{color:#fff;border-color:rgba(224,69,155,0.6);background:linear-gradient(120deg,rgba(124,58,237,0.28),rgba(249,115,22,0.18))}
          .gp-mode:disabled{opacity:.38;cursor:not-allowed}
          .gp-wallet{margin-left:auto;display:flex;align-items:center;gap:4px;font-size:10.5px;color:#9c98aa}
          .gp-wallet.separate{color:#f0b35f}
          .gp-wallet.none{color:#c8a2ff}
          .gp-walletnote{font-size:11.5px;line-height:1.5;color:#c2bcd0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:8px 10px;margin-bottom:10px}
          .gp-prompt{width:100%;box-sizing:border-box;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit}
          .gp-prompt:focus{outline:none;border-color:rgba(224,69,155,0.55)}
          .gp-refs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
          .gp-ref{font-size:10.5px;color:#cfcbdb;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:999px;padding:3px 9px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .gp-ref b{color:#6ee7a8;font-weight:800;text-transform:uppercase;letter-spacing:.05em;font-size:9.5px}
          .gp-ref.off{opacity:.5}
          .gp-ref.off b{color:#fb7185}
          .gp-ref em{color:#fb7185;font-style:normal}
          .gp-controls{display:flex;gap:8px;margin-top:9px;align-items:center;flex-wrap:wrap}
          .gp-sel{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.14);color:#eee;border-radius:8px;padding:8px 10px;font-size:12px}
          .gp-go{margin-left:auto;display:flex;align-items:center;gap:6px;background:linear-gradient(120deg,#7c3aed,#e0459b 55%,#f97316);color:#fff;border:none;border-radius:9px;padding:9px 16px;font-weight:800;font-size:12.5px;letter-spacing:.03em;cursor:pointer}
          .gp-go:disabled{opacity:.5;cursor:default}
          .gp-handoff{margin-top:10px;background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.1);border-radius:11px;padding:11px 12px}
          .gp-hrow{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
          .gp-hlbl{font-size:10px;font-weight:800;letter-spacing:.09em;color:#918da0}
          .gp-hbtn{margin-left:0;display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#dcd8e6;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none}
          .gp-hbtn:hover{background:rgba(255,255,255,0.1)}
          .gp-hbtn.go{margin-left:auto;color:#fff;border-color:rgba(224,69,155,0.5);background:linear-gradient(120deg,rgba(124,58,237,0.35),rgba(249,115,22,0.25))}
          .gp-hprompt{margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.6;color:#e3dff0;max-height:220px;overflow:auto}
          .gp-hnotes{margin:10px 0 0;padding-left:18px;font-size:11.5px;line-height:1.7;color:#b9b4c8}
          .gp-note.err{color:#fecdd3;background:rgba(251,113,133,0.12);border-color:rgba(251,113,133,0.32);display:flex;align-items:center;gap:7px}
          .gp-keybox{background:rgba(0,0,0,0.3);border:1px solid rgba(120,180,255,0.28);border-radius:11px;padding:11px 12px;margin-bottom:12px}
          .gp-keyhead{display:flex;align-items:center;gap:8px;margin-bottom:7px}
          .gp-keyhelp{font-size:11.5px;line-height:1.55;color:#a9a4b8;margin-bottom:9px}
          .gp-keyrow{display:flex;gap:8px;align-items:center}
          .gp-keyin{flex:1;min-width:0;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.16);border-radius:8px;color:#fff;padding:9px 11px;font-size:12.5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
          .gp-keyin:focus{outline:none;border-color:rgba(120,180,255,0.6)}
          .gp-keyerr{display:flex;align-items:center;gap:5px;margin-top:8px;font-size:11px;color:#fb7185}
          .gp-job-note{display:flex;align-items:flex-start;gap:5px;margin-top:4px;font-size:10.5px;line-height:1.45;color:#f0b35f;max-width:360px}
          .gp-jobs{margin-top:15px;display:flex;flex-direction:column;gap:7px}
          .gp-empty{font-size:12px;color:var(--w40,#8b8799);text-align:center;padding:18px 8px}
          .gp-job{display:flex;gap:10px;justify-content:space-between;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:9px 11px}
          .gp-job-main{min-width:0}
          .gp-job-prov{font-size:10.5px;font-weight:800;letter-spacing:.05em;color:#c9c4d8;text-transform:uppercase}
          .gp-job-bin{color:#f0913f}
          .gp-job-slug{color:#7db6ff}
          .gp-job-prompt{font-size:12px;color:#b9b4c8;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}
          .gp-job-side{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
          .gp-pill{display:flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
          .gp-pill.ok{color:#6ee7a8;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.3)}
          .gp-pill.err{color:#fb7185;background:rgba(251,113,133,0.12);border:1px solid rgba(251,113,133,0.3)}
          .gp-pill.run{color:#7db6ff;background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.3)}
          .gp-spin{animation:gp-rot 1s linear infinite}
          @keyframes gp-rot{to{transform:rotate(360deg)}}
          @media (prefers-reduced-motion: reduce){.gp-spin{animation:none}}
          .gp-thumbs{display:flex;gap:4px}
          .gp-thumb{width:34px;height:22px;object-fit:cover;border-radius:4px;border:1px solid rgba(255,255,255,0.15)}
          .gp-thumb.vid{display:flex;align-items:center;justify-content:center;color:#9aa;background:rgba(255,255,255,0.06)}
        `}</style>
      </div>
    </div>
  );
}
