// GeneratePanel — the prompt box + UI in Fabula for the generation agent. Pick a service (your linked
// Kling / Magnific account), write a prompt, choose a bin; the cloud agent runs the job on that service
// and the results drop into the bin automatically (the watch-folder way). Jobs keep their status across
// reloads (mirrored in idb by genAgent). Degrades to a clear "connect the agent" message when the
// backend service isn't reachable yet.

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Link2, Loader, CheckCircle2, AlertTriangle, Film, Image as ImageIcon } from "lucide-react";
import { listConnectors, listJobs, submitJob, pollJob, connectAccount, health, assetTypeForMime } from "../../services/fabula/genAgent";

export default function GeneratePanel({ projectId, bins = [], defaultBin, onClose, importResults }) {
  const [healthy, setHealthy] = useState(null);        // null=checking, true/false
  const [connectors, setConnectors] = useState([]);
  const [provider, setProvider] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [bin, setBin] = useState(defaultBin || "");
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const imported = useRef(new Set());                   // jobIds whose results we've already added

  const conn = connectors.find((c) => c.id === provider);
  const kind = conn?.kind || "video";

  useEffect(() => {
    let alive = true;
    (async () => {
      const h = await health(); if (alive) setHealthy(h);
      const cs = await listConnectors(); if (!alive) return;
      setConnectors(cs); if (!provider && cs[0]) setProvider(cs[0].id);
      setJobs(await listJobs(projectId));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
          importResults?.(j.results.map((r) => ({ ...r, type: assetTypeForMime(r.mime) })), j.bin);
        }
      });
      setJobs(updated);
    }, 4000);
    return () => clearInterval(t);
  }, [jobs, projectId, importResults]);

  const doConnect = async (pid) => {
    try {
      const r = await connectAccount(pid);
      if (r.authUrl) window.open(r.authUrl, "_blank", "noopener");
      else if (r.connected) setConnectors((cs) => cs.map((c) => (c.id === pid ? { ...c, connected: true } : c)));
    } catch (e) { alert(e?.message || "Couldn't start linking that account."); }
  };

  const generate = async () => {
    if (!provider || !prompt.trim()) return;
    setBusy(true);
    try {
      const params = kind === "video" ? { aspect } : {};
      const job = await submitJob({ provider, kind, prompt: prompt.trim(), params, projectId, bin: bin || "Generated" });
      setJobs((js) => [job, ...js.filter((j) => j.id !== job.id)]);
      if (job.status !== "backend-offline") setPrompt("");
    } finally { setBusy(false); }
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
          <div className="gp-title"><Sparkles size={15} /> GENERATE — AGENT</div>
          <button className="gp-x" onClick={onClose}><X size={16} /></button>
        </div>

        {healthy === false && (
          <div className="gp-note">
            The generation agent isn’t connected yet. You can still queue jobs — they’ll run once the
            cloud agent is live. Link your accounts below so it can act as you.
          </div>
        )}

        {/* connectors + account linking */}
        <div className="gp-conns">
          {connectors.map((c) => (
            <button key={c.id} className={`gp-conn ${provider === c.id ? "on" : ""}`} onClick={() => setProvider(c.id)} title={c.blurb}>
              <div className="gp-conn-top">
                {c.kind === "video" ? <Film size={13} /> : <ImageIcon size={13} />}
                <span className="gp-conn-name">{c.name}</span>
                {c.connected
                  ? <span className="gp-linked"><CheckCircle2 size={11} /> linked</span>
                  : <span className="gp-link" onClick={(e) => { e.stopPropagation(); doConnect(c.id); }}><Link2 size={11} /> connect</span>}
              </div>
              <div className="gp-conn-blurb">{c.blurb}</div>
            </button>
          ))}
        </div>

        {/* prompt + controls */}
        <textarea className="gp-prompt" rows={3} placeholder={`Describe what ${conn?.name || "the service"} should ${kind === "video" ? "generate as a shot" : "create"}…`}
          value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="gp-controls">
          {kind === "video" && (
            <select className="gp-sel" value={aspect} onChange={(e) => setAspect(e.target.value)} title="Aspect ratio">
              {["16:9", "9:16", "1:1", "21:9", "4:5"].map((a) => <option key={a} value={a}>{a}</option>)}
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

        {/* jobs */}
        <div className="gp-jobs">
          {jobs.length === 0 && <div className="gp-empty">No jobs yet. Your generations show up here and land in the chosen bin when they finish.</div>}
          {jobs.map((j) => (
            <div key={j.id} className="gp-job">
              <div className="gp-job-main">
                <div className="gp-job-prov">{(connectors.find((c) => c.id === j.provider)?.name || j.provider)} · <span className="gp-job-bin">{j.bin}</span></div>
                <div className="gp-job-prompt">{j.prompt}</div>
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
          .gp-link{margin-left:auto;display:flex;align-items:center;gap:3px;font-size:10px;color:#7db6ff;padding:2px 6px;border:1px solid rgba(120,180,255,0.3);border-radius:999px}
          .gp-link:hover{background:rgba(120,180,255,0.14)}
          .gp-conn-blurb{font-size:11px;color:var(--w40,#918da0);margin-top:4px}
          .gp-prompt{width:100%;box-sizing:border-box;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit}
          .gp-prompt:focus{outline:none;border-color:rgba(224,69,155,0.55)}
          .gp-controls{display:flex;gap:8px;margin-top:9px;align-items:center;flex-wrap:wrap}
          .gp-sel{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.14);color:#eee;border-radius:8px;padding:8px 10px;font-size:12px}
          .gp-go{margin-left:auto;display:flex;align-items:center;gap:6px;background:linear-gradient(120deg,#7c3aed,#e0459b 55%,#f97316);color:#fff;border:none;border-radius:9px;padding:9px 16px;font-weight:800;font-size:12.5px;letter-spacing:.03em;cursor:pointer}
          .gp-go:disabled{opacity:.5;cursor:default}
          .gp-jobs{margin-top:15px;display:flex;flex-direction:column;gap:7px}
          .gp-empty{font-size:12px;color:var(--w40,#8b8799);text-align:center;padding:18px 8px}
          .gp-job{display:flex;gap:10px;justify-content:space-between;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:9px 11px}
          .gp-job-main{min-width:0}
          .gp-job-prov{font-size:10.5px;font-weight:800;letter-spacing:.05em;color:#c9c4d8;text-transform:uppercase}
          .gp-job-bin{color:#f0913f}
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
