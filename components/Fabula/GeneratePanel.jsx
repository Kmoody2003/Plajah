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
  assetTypeForMime, compileHandoff, compileShotPrompt, refsForConnector, saveProviderKey, revokeProvider,
} from "../../services/fabula/genAgent";
import { openGenCloud } from "../../services/genCloud/open";
import { canRetry, correctedSpec, MAX_ATTEMPTS } from "../../services/fabula/story/reviewTake";

const WALLET_LABEL = {
  shared: "Draws your plan credits",
  separate: "Separate developer balance",
  none: "No API — hand off only",
  free_local: "100% Free · Runs on Local GPU",
};

export default function GeneratePanel({ projectId, bins = [], defaultBin, onClose, importResults, context, reviewTake, autoRetry = false, onAutoRetry, gallery = null }) {
  // Review of finished takes against their direction: jobId → "running" | TakeReview | { error }.
  const [reviews, setReviews] = useState({});
  const autoRetryRef = useRef(autoRetry);
  autoRetryRef.current = autoRetry;
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

  // Story Intelligence direction riding on the spec (performance + continuity). It is compiled per
  // model, so what a connected job sends is the same text the hand-off view shows.
  const direction = spec.direction;
  const directed = useMemo(
    () => (conn && direction ? compileShotPrompt(spec, conn) : null),
    [spec, conn, direction],
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
          const assets = importResults?.(j.results.map((r) => ({ ...r, type: assetTypeForMime(r.mime) })), j.bin, j);
          reviewJob(j, assets);
        }
      });
      setJobs(updated);
    }, 4000);
    return () => clearInterval(t);
  }, [jobs, projectId, importResults]);

  // Submit the same shot again with what the last take got wrong stated up front.
  const retryJob = async (j, review) => {
    const c = connectors.find((x) => x.id === j.provider);
    if (!c || !j.spec) return;
    const next = correctedSpec(j.spec, review);
    const compiled = compileShotPrompt(next, c);
    const job = await submitJob({
      provider: j.provider, kind: j.kind, prompt: compiled.prompt, spec: next,
      params: { ...(j.params || {}), ...(compiled.negative ? { negative: compiled.negative } : {}) },
      projectId, bin: j.bin,
    });
    setJobs((js) => [job, ...js.filter((x) => x.id !== job.id)]);
  };

  // Look at a finished take against the direction it was made from. Only directed shots are reviewed
  // (a character sheet or a bare prompt has nothing to check against). A failed review can retry by
  // itself when the user has turned that on — each retry is a new paid generation, so it is opt-in.
  const reviewJob = async (j, assets) => {
    if (!reviewTake || !j.spec?.direction || j.spec.sheet || !assets?.length) return;
    setReviews((m) => ({ ...m, [j.id]: "running" }));
    try {
      const review = await reviewTake({ job: j, assets });
      setReviews((m) => ({ ...m, [j.id]: review }));
      if (autoRetryRef.current && canRetry(review)) await retryJob(j, review);
    } catch (e) {
      setReviews((m) => ({ ...m, [j.id]: { error: e?.message || "The take couldn't be reviewed." } }));
    }
  };

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
        provider, kind, prompt: directed?.prompt || prompt.trim(), spec,
        params: { ...(kind === "video" ? { aspect } : {}), ...(directed?.negative ? { negative: directed.negative } : {}) },
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
      <div className={`gp-modal glass-dark ${gallery ? "gp-studio" : ""}`}>
       <div className="gp-main">
        <div className="gp-head">
          <div className="gp-title">
            <Sparkles size={15} /> GENERATE
            {context?.title && <span className="gp-ctx">{context.title}</span>}
          </div>
          <button className="gp-hbtn gp-cloud" title="Generate on Plajah's own engines, paid with your Plajah credits"
            onClick={() => openGenCloud({
              source: "fabula", kinds: kind === "image" ? ["image", "video", "voice"] : ["video", "image", "voice"],
              prompt, aspect: ["1:1", "16:9", "9:16", "4:3", "3:4"].includes(aspect) ? aspect : "16:9", useLabel: "Add to bin",
              onUse: (outs) => importResults?.(
                outs.map((o, i) => ({ url: o.url, mime: o.mime, name: `plajah-cloud-${i + 1}`, type: assetTypeForMime(o.mime) })),
                bin || defaultBin, { spec },
              ),
            })}>
            <Sparkles size={11} /> Plajah Cloud
          </button>
          <button className="gp-x" onClick={onClose}><X size={16} /></button>
        </div>

        {healthy === false && mode === "connected" && conn?.walletModel !== "free_local" && (
          <div className="gp-note">
            The generation agent isn’t connected yet. You can still queue jobs — they’ll run once the
            cloud agent is live. Or switch to <b>Hand off</b> and run this on your own account right now.
          </div>
        )}

        {/* connectors + account linking */}
        {[
          ["On your GPU — free", connectors.filter((c) => c.walletModel === "free_local")],
          ["Your connected accounts", connectors.filter((c) => c.walletModel !== "free_local" && c.modes?.includes("connected"))],
          ["Hand off — runs on your own subscription", connectors.filter((c) => !c.modes?.includes("connected"))],
        ].filter(([, list]) => list.length).map(([label, list]) => (
          <div key={label} className="gp-group">
            <div className="gp-hlbl">{label.toUpperCase()}</div>
            <div className="gp-conns">
              {list.map((c) => (
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
          </div>
        ))}
        {conn && (
          <div className="gp-caps" aria-label={`What ${conn.name} can take`}>
            <span>{conn.kind === "video" ? "Video" : conn.kind === "upscale" ? "Stills + upscale" : "Stills"}</span>
            {conn.caps?.refRoles?.length > 0 && <span>takes {conn.caps.refRoles.map((r) => r.replace(/_/g, " ")).join(", ")} · up to {conn.caps.maxRefs} image{conn.caps.maxRefs === 1 ? "" : "s"}</span>}
            {conn.caps?.durations && <span>{conn.caps.durations.join(" or ")}s</span>}
            <span>{conn.caps?.supportsNegative ? "negative prompt" : "no negative prompt"}</span>
            {conn.caps?.supportsSeed && <span>repeatable seed</span>}
          </div>
        )}

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

        {/* direction from Story Intelligence — what gets added so this shot matches its neighbours */}
        {direction && (
          <div className="gp-direction">
            <div className="gp-hlbl">DIRECTED BY STORY INTELLIGENCE</div>
            {(direction.performance || []).map((b) => (
              <div key={b.character} className="gp-dline">
                <b>{b.character}</b> {b.emotion.name}{b.toward && b.toward.name !== b.emotion.name ? ` → ${b.toward.name}` : ""} · plays to {b.tactic}
              </div>
            ))}
            {(direction.continuity?.characters || []).filter((c) => c.props.length || c.marks.length || c.wardrobe.length).map((c) => (
              <div key={`k-${c.name}`} className="gp-dline">
                <b>{c.name}</b> holds: {[...c.props, ...c.wardrobe, ...c.marks].join(", ")}
              </div>
            ))}
            {direction.boardStyle && <div className="gp-dline">Storyboard frame — drawn, not photographic.</div>}
            {mode === "connected" && directed && (
              <details className="gp-dmore">
                <summary>What {conn?.name} will be sent</summary>
                <pre className="gp-hprompt">{directed.prompt}</pre>
                {directed.negative && <div className="gp-dline">Negative: {directed.negative}</div>}
                {directed.notes.map((n, i) => <div key={i} className="gp-dline warn">{n}</div>)}
              </details>
            )}
          </div>
        )}

        {reviewTake && direction && mode === "connected" && (
          <label className="gp-autoretry">
            <input type="checkbox" checked={!!autoRetry} onChange={(e) => onAutoRetry?.(e.target.checked)} />
            Every take is checked against this direction. Retry automatically when it doesn't match (up to {MAX_ATTEMPTS} tries — {conn?.walletModel === "free_local" ? "free on your own GPU" : "each retry is a new generation on your account"}).
          </label>
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
            {handoff?.refs?.some((r) => r.previewUrl || r.url) && (
              <div className="gp-refpack">
                <span className="gp-hlbl">REFERENCE PACK</span>
                {handoff.refs.filter((r) => r.previewUrl || r.url).map((r, i) => (
                  <a key={i} className="gp-refimg" href={r.previewUrl || r.url} download={`${(r.name || r.role).replace(/[^a-z0-9]+/gi, "_")}.png`} title={`Download — attach as ${r.role.replace(/_/g, " ")}`}>
                    <img src={r.previewUrl || r.url} alt="" /><span>{r.name || r.role}</span>
                  </a>
                ))}
              </div>
            )}
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
                {(j.spec?.attempt || 1) > 1 && <div className="gp-job-note">Attempt {j.spec.attempt} of {MAX_ATTEMPTS} — retried with corrections.</div>}
                {(() => {
                  const r = reviews[j.id];
                  if (!r) return null;
                  if (r === "running") return <div className="gp-review"><Loader size={10} className="gp-spin" /> Checking the take against its direction…</div>;
                  if (r.error) return <div className="gp-review warn"><AlertTriangle size={10} /> Not reviewed — {r.error}</div>;
                  return (
                    <div className={`gp-review ${r.verdict}`}>
                      <div><b>{r.verdict === "pass" ? "Matches its direction" : r.verdict === "retry" ? "Doesn't match" : "Worth a look"}</b> · {r.score}/100{r.unknown ? ` · ${r.unknown} couldn't be judged` : ""}</div>
                      {[...r.failed, ...r.warnings].slice(0, 5).map((c) => (
                        <div key={c.id} className="gp-rline">{c.must ? "✕" : "!"} {c.question}{c.observed ? ` — saw: ${c.observed}` : ""}</div>
                      ))}
                      {canRetry(r) && connectors.find((x) => x.id === j.provider)?.modes?.includes("connected") && (
                        <button className="gp-hbtn" onClick={() => retryJob(j, r)}>Retry with these corrections</button>
                      )}
                      {r.verdict === "retry" && !canRetry(r) && <div className="gp-rline">That was the last automatic attempt — this one needs your eye.</div>}
                    </div>
                  );
                })()}
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

       </div>
       {gallery && <aside className="gp-gallery" aria-label="Generated work">{gallery}</aside>}
        <style>{`
          .gp-studio{width:min(1320px,96vw) !important;display:grid;grid-template-columns:minmax(380px,560px) minmax(0,1fr);gap:18px;align-items:start}
          .gp-studio .gp-main{min-width:0}
          .gp-gallery{min-width:0;position:sticky;top:0;max-height:calc(88vh - 40px);overflow:auto;border-left:1px solid rgba(255,255,255,0.08);padding-left:18px}
          @media(max-width:900px){.gp-studio{grid-template-columns:1fr}.gp-gallery{position:static;max-height:none;border-left:0;padding-left:0;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px}}
          .gp-group{margin-bottom:4px}
          .gp-group>.gp-hlbl{margin:0 0 6px}
          .gp-caps{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
          .gp-caps span{font-size:10.5px;color:#b9b4cf;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:999px;padding:3px 8px}
          .gp-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(4,4,8,0.62);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px}
          .gp-modal{width:min(680px,94vw);max-height:88vh;overflow:auto;border-radius:16px;border:1px solid rgba(255,255,255,0.1);padding:18px 18px 20px;box-shadow:0 24px 80px rgba(0,0,0,0.6)}
          .gp-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}.gp-head .gp-title{margin-right:auto}.gp-cloud{white-space:nowrap}
          .gp-title{display:flex;align-items:center;gap:8px;font-weight:900;letter-spacing:.14em;font-size:12px;color:#fff}
          .gp-ctx{font-weight:700;letter-spacing:.04em;color:#f0913f;background:rgba(240,145,63,0.12);border:1px solid rgba(240,145,63,0.3);border-radius:999px;padding:2px 9px;font-size:10.5px}
          .gp-x{background:none;border:none;color:var(--w40,#9a96a8);cursor:pointer;padding:4px;border-radius:6px}
          .gp-x:hover{color:#fff;background:rgba(255,255,255,0.08)}
          .gp-review{margin-top:6px;font-size:11px;line-height:1.45;color:#cfcbe0;border-left:3px solid #64748b;padding:2px 0 2px 8px;display:flex;flex-direction:column;gap:3px;max-width:420px}
          .gp-review.pass{border-color:#34d399}.gp-review.retry{border-color:#fb7185}.gp-review.review,.gp-review.warn{border-color:#fbbf24}
          .gp-review b{color:#f1eefb}
          .gp-rline{color:#b9b4cf}
          .gp-review .gp-hbtn{align-self:flex-start;margin-top:2px}
          .gp-refpack{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
          .gp-refimg{display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:#b9b4cf;font-size:10px;max-width:84px}
          .gp-refimg img{width:72px;height:54px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.14)}
          .gp-autoretry{display:flex;align-items:center;gap:6px;font-size:11px;color:#b9b4cf;margin:0 0 10px}
          .gp-direction{border:1px solid rgba(139,92,246,0.3);background:rgba(139,92,246,0.08);border-radius:10px;padding:9px 11px;margin:0 0 12px;display:flex;flex-direction:column;gap:4px}
          .gp-dline{font-size:11.5px;line-height:1.45;color:#d8d2ea}
          .gp-dline b{color:#e9d5ff;font-weight:700;margin-right:4px}
          .gp-dline.warn{color:#fcd34d}
          .gp-dmore summary{font-size:11px;color:#c4b5fd;cursor:pointer;margin-top:4px}
          .gp-dmore .gp-hprompt{margin-top:6px}
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
