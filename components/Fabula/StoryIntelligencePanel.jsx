// StoryIntelligencePanel — the editor helping find the story, not just assemble it.
//
// One surface over services/fabula/story:
//   COVERAGE    the script against the cut — what's shot, boarded, an empty slot, or missing — and a
//               board for anything uncovered, generated through the same panel as every other shot
//   CHARACTERS  per cast member: the look references and speech the clips and bins already hold, the
//               character-sheet views still missing, a voice lock, and who they are to each other
//   DIRECTION   the performance and continuity each shot of a scene will carry into generation, plus
//               the score and sound brief built from the same emotional line
//   STORY       the reads that need judgement: critique, what the bins could do, a way across a gap
//
// The deterministic parts (coverage, evidence, direction) are computed live from the production. The
// model-backed reads are run on demand and saved to `prod.storyIntel` so they persist with the project
// and feed back into direction (inferred motivations become each character's objective).

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Sparkles, Loader, Film, Users, Clapperboard, BookOpen, AlertTriangle, Copy, Mic, Eye, Image as ImageIcon } from "lucide-react";
import {
  mapCoverage, planStoryboards, gatherCharacterEvidence, planVoiceLock, planCharacterSheet,
  relationshipEvidence, relationshipsTask, normalizeRelationships, motivationsFrom,
  describeBins, binReasoningTask, normalizeBinSuggestions, gapFillTask, normalizeGapFill,
  critiqueTask, normalizeCritique, directScene, SHEET_VIEWS, continuesFrom, shotRefs,
  characterStateClause, environmentStateClause,
  breakdownForScene, matchProductionScene, planContinuityChecks, toContinuityCheck,
  clipsToWatch, normalizeClipAnalysis, fileClipAnalysis, planVoiceReference, renderVoiceReference, sectionTiming,
} from "../../services/fabula/story";
import { encodeMonoWav } from "../../services/audio/proceduralFoleyEngine";
import { getLocalAceStepUrl, setLocalAceStepUrl, localAceStepAvailable } from "../../services/melos/generation/localAceStep";
import { compareFrames, grabVideoFrame, continuityVerdict } from "../../services/continuityCheck";

const STATUS = {
  shot: { label: "Shot", color: "#34d399" },
  boarded: { label: "Boarded", color: "#60a5fa" },
  placeholder: { label: "Empty slot", color: "#fbbf24" },
  missing: { label: "Not in cut", color: "#fb7185" },
};
const SCENE_STATE = {
  covered: "covered", partial: "partly covered", uncovered: "nothing in the cut",
  unbroken: "written, no shot list", unwritten: "not written",
};
// The floor plan: marks, the line of action, and every camera setup, seen from above. Characters and
// the selected shot's camera can be dragged; the new position is committed on release.
function StageMap({ plan, selected, onSelect, onMove }) {
  const svg = useRef(null);
  const [drag, setDrag] = useState(null);   // { target, x, y }
  const shot = plan.shots.find((s) => s.shotId === selected) || plan.shots[0];
  const at = (e) => {
    const r = svg.current.getBoundingClientRect();
    const c = (v) => Math.max(0.03, Math.min(0.97, v));
    return { x: c((e.clientX - r.left) / r.width), y: c((e.clientY - r.top) / r.height) };
  };
  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => setDrag((d) => (d ? { ...d, ...at(e) } : d));
    const up = (e) => { const p = at(e); onMove(drag.target, { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }); setDrag(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);
  const P = (p) => ({ x: p.x * 100, y: p.y * 100 });
  const live = (key, p) => (drag && (drag.target.mark === key || drag.target.camera === key) ? { x: drag.x, y: drag.y } : p);
  return (
    <svg ref={svg} className="si-stage" viewBox="0 0 100 100" role="img" aria-label="Staging floor plan">
      {plan.axis && <line x1={P(plan.axis.a).x} y1={P(plan.axis.a).y} x2={P(plan.axis.b).x} y2={P(plan.axis.b).y} stroke="#a78bfa" strokeWidth="0.5" strokeDasharray="2 1.5" />}
      {plan.shots.filter((s) => s.shotId !== shot.shotId).map((s) => (
        <g key={s.shotId} className="grab" onClick={() => onSelect(s.shotId)} opacity="0.45">
          <rect x={P(s.camera).x - 2} y={P(s.camera).y - 1.5} width="4" height="3" rx="0.6" fill={s.crossesLine ? "#fb7185" : "#64748b"} />
          <text x={P(s.camera).x + 3} y={P(s.camera).y + 1.2}>{s.slug}</text>
        </g>
      ))}
      {shot.marks.map((m) => {
        const p = P(live(m.name, m));
        return (
          <g key={m.name}>
            {m.from && <line x1={P(m.from).x} y1={P(m.from).y} x2={p.x} y2={p.y} stroke="#fbbf24" strokeWidth="0.6" strokeDasharray="1.2 1" />}
            <circle className="grab" cx={p.x} cy={p.y} r="4.2" fill={m.offstage ? "#334155" : "#7c3aed"} stroke="#ede9fe" strokeWidth="0.5"
              onPointerDown={(e) => { e.preventDefault(); setDrag({ target: { mark: m.name }, ...at(e) }); }} />
            <text x={p.x} y={p.y + 1.4} textAnchor="middle">{m.name.slice(0, 2)}</text>
            <text x={p.x} y={p.y + 8.5} textAnchor="middle" style={{ fontWeight: 500, fontSize: 3.2 }}>{m.name}</text>
          </g>
        );
      })}
      {(() => {
        const c = P(live(shot.shotId, shot.camera)), a = P(shot.camera.aim);
        return (
          <g>
            <line x1={c.x} y1={c.y} x2={a.x} y2={a.y} stroke={shot.crossesLine ? "#fb7185" : "#38bdf8"} strokeWidth="0.5" />
            <rect className="grab" x={c.x - 3} y={c.y - 2.2} width="6" height="4.4" rx="0.8" fill={shot.crossesLine ? "#fb7185" : "#38bdf8"}
              onPointerDown={(e) => { e.preventDefault(); setDrag({ target: { camera: shot.shotId }, ...at(e) }); }} />
            <text x={c.x + 4.5} y={c.y + 1.4}>{shot.slug} cam</text>
          </g>
        );
      })()}
    </svg>
  );
}

const TABS = [["coverage", "COVERAGE", Film], ["characters", "CHARACTERS", Users], ["direction", "DIRECTION", Clapperboard], ["story", "STORY", BookOpen]];

export default function StoryIntelligencePanel({
  prod, clips, sceneId, aspect, callJson, updateProd, onGenerate, onAddSlots, onGotoScene, ping, onClose,
  filmHub, resolveFrame, onLogCheck,
  watchClip, onPlaceSuggestion, onSaveVoiceReference, onSpeakLine, onScoreCue, listScripts, onPullScript, onPushScene,
}) {
  const [watching, setWatching] = useState("");  // progress text while clips are being watched
  const [scripts, setScripts] = useState(null);  // the user's screenplays, loaded on demand
  const [scriptPick, setScriptPick] = useState(prod?.scriptId || "");
  const [scriptMsg, setScriptMsg] = useState("");
  const [stageShot, setStageShot] = useState("");
  const [working, setWorking] = useState("");    // key of a per-item action in flight (voice, score…)
  // The user's own music engine: where it is, and whether it's answering.
  const [engineUrl, setEngineUrl] = useState(() => getLocalAceStepUrl());
  const [engineUp, setEngineUp] = useState(null);   // null = not checked yet
  const checkEngine = async (url) => { setEngineUp(null); setEngineUp(await localAceStepAvailable(url)); };
  const [checks, setChecks] = useState({});      // Continuity Eye results this session, by check key
  const [checking, setChecking] = useState("");
  const [tab, setTab] = useState("coverage");
  useEffect(() => { if (tab === "direction" && onScoreCue) checkEngine(getLocalAceStepUrl()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [dirScene, setDirScene] = useState(sceneId || "");
  const [gapScene, setGapScene] = useState("");
  const [gapAsk, setGapAsk] = useState("");
  const [gapOptions, setGapOptions] = useState(null);

  const intel = prod?.storyIntel || {};
  const acts = prod?.acts || [];
  const flatScenes = useMemo(() => acts.flatMap((a) => (a.scenes || []).map((s) => ({ act: a, scene: s }))), [acts]);
  const coverage = useMemo(() => mapCoverage(acts, clips, prod?.mediaPool || []), [acts, clips, prod?.mediaPool]);
  const motivations = useMemo(() => motivationsFrom(intel.relationships), [intel.relationships]);
  const evidence = useMemo(() => gatherCharacterEvidence(prod, clips), [prod, clips]);
  const edges = useMemo(() => relationshipEvidence(prod), [prod]);

  // The Film Hub side of the same continuity system: this scene's production scene and its breakdown.
  const productionSceneFor = (scene) => matchProductionScene(scene, filmHub?.scenes || [], { clips, pool: prod?.mediaPool });
  const hubBreakdown = (scene) => breakdownForScene(filmHub?.breakdown, productionSceneFor(scene)?.id);

  // Direction for a scene, with continuity carried in from the previous scene when this one continues it.
  const directionFor = (scene) => {
    const i = flatScenes.findIndex((x) => x.scene.id === scene.id);
    const prev = i > 0 ? flatScenes[i - 1].scene : null;
    const carryIn = prev && continuesFrom(scene) ? { characters: directScene(prev, motivations, { breakdown: hubBreakdown(prev) }).ledger.out.characters } : undefined;
    return directScene(scene, motivations, { breakdown: hubBreakdown(scene), ...(carryIn ? { carryIn } : {}) });
  };

  // Continuity Eye — the Film Hub's frame comparison — run on a generated shot. Frames are pulled from
  // the clips on this device; nothing is uploaded. The verdict is logged in the hub's record shape.
  const checkKey = (pl) => `${pl.shotId}:${pl.kind}`;
  const runCheck = async (pl, scene) => {
    if (checking) return;
    setChecking(checkKey(pl)); setErr("");
    try {
      const frameOf = async (f) => { const src = await resolveFrame(f.assetId); return f.type === "video" ? grabVideoFrame(src, f.atSec) : src; };
      const [ref, cur] = [await frameOf(pl.ref), await frameOf(pl.cur)];
      const result = await compareFrames(ref, cur, { scope: pl.scope });
      setChecks((m) => ({ ...m, [checkKey(pl)]: result }));
      const hub = productionSceneFor(scene);
      const row = toContinuityCheck(result, {
        id: `cc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        sceneId: hub?.id || scene.id, sceneNum: hub?.sceneNum || "", label: `Generated · ${pl.label}`,
      });
      updateProd((p) => { p.continuityChecks = [{ ...row, fabulaSceneId: scene.id, shotId: pl.shotId }, ...(p.continuityChecks || [])].slice(0, 200); });
      onLogCheck?.(row);
    } catch (e) { setErr(`Continuity check failed — ${e?.message || e}`); }
    setChecking("");
  };

  const boards = useMemo(
    () => planStoryboards(coverage, acts, { aspect, directionFor: (sc, sh) => directionFor(sc).forShot(sh.id), refsFor: (sc, sh) => shotRefs(sc, sh, prod) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverage, acts, aspect, motivations],
  );

  const run = async (label, fn) => {
    if (busy) return;
    setBusy(label); setErr("");
    try { await fn(); } catch (e) { setErr(`${label} failed — ${e?.message || e}`); }
    setBusy("");
  };
  const saveIntel = (patch) => updateProd((p) => { p.storyIntel = { ...(p.storyIntel || {}), ...patch, at: Date.now() }; });
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); ping?.("Copied."); } catch { /* clipboard unavailable */ } };

  const readRelationships = () => run("Reading relationships", async () => {
    const t = relationshipsTask(prod, edges, coverage);
    const names = (prod.cast || []).map((c) => c.name).filter(Boolean);
    saveIntel({ relationships: normalizeRelationships(await callJson(t.system, t.user), names) });
  });
  const readCritique = () => run("Reading the production", async () => {
    const t = critiqueTask(prod, coverage);
    saveIntel({ critique: normalizeCritique(await callJson(t.system, t.user)) });
  });
  const readBins = () => run("Reasoning over the bins", async () => {
    const bins = describeBins(prod, clips);
    if (!bins.some((b) => !b.inCut)) { setErr("Every clip in the bins is already in the cut — nothing unused to reason over."); return; }
    const t = binReasoningTask(prod, bins, coverage);
    saveIntel({ bins: normalizeBinSuggestions(await callJson(t.system, t.user), bins) });
  });
  const fillGap = () => run("Writing options", async () => {
    if (!gapScene) return;
    const t = gapFillTask(prod, { sceneId: gapScene, ask: gapAsk }, coverage);
    setGapOptions(normalizeGapFill(await callJson(t.system, t.user)).options);
  });
  const applyGapOption = (opt) => {
    updateProd((p) => {
      for (const a of p.acts || []) for (const s of a.scenes || []) {
        if (s.id !== gapScene) continue;
        s.script = opt.script; if (opt.slugline) s.slugline = opt.slugline;
        if (!(s.shots || []).length) {
          s.shots = opt.shots.map((sh, i) => ({
            id: `${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, slug: `${i + 1}`,
            type: sh.type, subject: sh.subject, character: sh.character || "", lines: sh.lines || "", camera: sh.camera || "", purpose: sh.purpose || "",
            still: "", video: "", voice: "", continuity: "", notes: "from Story Intelligence", status: "planned", frameUrl: "",
          }));
        }
      }
    });
    setGapOptions(null);
    ping?.("Scene written into the production — open it in SLATE to build the bible and prompts.");
  };

  // Watch the clips that haven't been seen — what makes bin reasoning, bin look references and
  // bin voice samples real. One clip failing doesn't stop the rest; failures are reported together.
  const unwatched = useMemo(() => clipsToWatch(prod, clips, { max: 24 }), [prod, clips]);
  const watchBins = () => run("Watching clips", async () => {
    const failed = []; let done = 0;
    for (const asset of unwatched) {
      setWatching(`${done + 1}/${unwatched.length} — ${asset.name}`);
      try {
        const analysis = normalizeClipAnalysis(await watchClip(asset));
        if (analysis) updateProd((p) => { fileClipAnalysis(p, asset.id, analysis); });
        else failed.push(`${asset.name}: nothing readable in it`);
      } catch (e) { failed.push(e?.message || String(e)); }
      done++;
    }
    setWatching("");
    if (failed.length) setErr(`${failed.length} of ${unwatched.length} clips couldn't be watched — ${failed.slice(0, 3).join(" · ")}${failed.length > 3 ? " …" : ""}`);
    else ping?.(`Watched ${done} clip${done === 1 ? "" : "s"}.`);
  });
  const act = async (key, fn) => {
    if (working) return;
    setWorking(key); setErr("");
    try { await fn(); } catch (e) { setErr(e?.message || String(e)); }
    setWorking("");
  };
  const buildReference = (lock) => act(`ref:${lock.castId}`, async () => {
    const { cuts } = planVoiceReference(lock);
    const out = await renderVoiceReference(cuts, resolveFrame, encodeMonoWav);
    await onSaveVoiceReference(lock.castId, out.wav, out.seconds);
    if (out.skipped.length) setErr(`${out.skipped.length} sample clip${out.skipped.length === 1 ? "" : "s"} couldn't be decoded here and were left out of the reference.`);
  });
  const loadScripts = () => act("scripts", async () => { setScripts(await listScripts()); });
  const pullScript = () => act("pull", async () => {
    const r = await onPullScript(scriptPick);
    setScriptMsg(`Pulled ${r.total} scene${r.total === 1 ? "" : "s"}: ${r.added} new, ${r.updated} updated, ${r.unchanged} unchanged${r.flagged ? `, ${r.flagged} no longer in the script (kept, flagged)` : ""}.`);
  });
  const pushScene = (id) => act(`push:${id}`, async () => {
    const replaced = await onPushScene(id);
    setScriptMsg(replaced ? "Scene updated in the screenplay." : "Scene added to the screenplay, after the scene before it.");
  });

  const lockVoice = (lock) => {
    updateProd((p) => { const m = (p.cast || []).find((c) => c.id === lock.castId); if (m) m.voiceLock = { ...lock, consent: true, lockedAt: Date.now() }; });
    ping?.(`Voice lock saved for ${lock.name} — ${lock.samples.length} samples, ${lock.totalSec}s.`);
  };

  const sceneTitle = (id) => { const s = flatScenes.find((x) => x.scene.id === id)?.scene; return s ? (s.slugline || s.title || "Scene") : id; };
  const dirSceneObj = flatScenes.find((x) => x.scene.id === dirScene)?.scene || flatScenes.find((x) => (x.scene.shots || []).length)?.scene;
  const dir = dirSceneObj ? directionFor(dirSceneObj) : null;
  const checkPlans = dirSceneObj ? planContinuityChecks(dirSceneObj, clips, prod?.mediaPool || []) : [];
  const dirHubScene = dirSceneObj ? productionSceneFor(dirSceneObj) : null;
  const verdictClass = (score) => (score >= 80 ? "ready" : score >= 60 ? "thin" : "insufficient");

  return (
    <div className="si-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="si-modal">
        <div className="si-head">
          <div className="si-title"><Sparkles size={15} /> STORY INTELLIGENCE <span className="si-sub">{prod?.title}</span></div>
          <button className="si-x" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="si-tabs">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} className={`si-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}><Icon size={12} /> {label}</button>
          ))}
          {busy && <span className="si-busy"><Loader size={12} className="si-spin" /> {busy}…</span>}
        </div>
        {err && <div className="si-err"><AlertTriangle size={12} /> {err}</div>}

        <div className="si-body">
          {/* ── COVERAGE ─────────────────────────────────────────────────────────── */}
          {tab === "coverage" && (
            <>
              {!coverage.totals.shots && !coverage.totals.scenes && <div className="si-empty">No scenes yet. Write or import a script, or build one from the cut, and the coverage map appears here.</div>}
              {!!coverage.totals.scenes && (
                <div className="si-summary">
                  <div className="si-bar">
                    {Object.keys(STATUS).map((k) => coverage.totals[k] > 0 && (
                      <div key={k} style={{ flex: coverage.totals[k], background: STATUS[k].color }} title={`${STATUS[k].label}: ${coverage.totals[k]}`} />
                    ))}
                  </div>
                  <div className="si-legend">
                    {Object.keys(STATUS).map((k) => <span key={k}><i style={{ background: STATUS[k].color }} /> {STATUS[k].label} {coverage.totals[k]}</span>)}
                    <span className="si-dim">{Math.round(coverage.coveredRatio * 100)}% of {coverage.totals.shots} scripted shots have picture</span>
                  </div>
                  <div className="si-actions">
                    {coverage.totals.missing > 0 && (
                      <button className="si-btn" onClick={onAddSlots} title="Adds an empty slot at the end of V1 for each shot the cut doesn't have. Nothing already in the cut moves.">
                        Add slots for {coverage.totals.missing} missing shot{coverage.totals.missing === 1 ? "" : "s"}
                      </button>
                    )}
                    {coverage.unscriptedClipIds.length > 0 && <span className="si-dim">{coverage.unscriptedClipIds.length} clip{coverage.unscriptedClipIds.length === 1 ? "" : "s"} in the cut that the script doesn't account for</span>}
                  </div>
                </div>
              )}
              {coverage.scenes.map((sc) => (
                <div key={sc.sceneId} className="si-scene">
                  <div className="si-scene-head">
                    <button className="si-link" onClick={() => onGotoScene?.(sc.actId, sc.sceneId)}>{sc.title}</button>
                    <span className={`si-state ${sc.state}`}>{SCENE_STATE[sc.state]}</span>
                    {(sc.state === "unwritten" || sc.state === "unbroken") && (
                      <button className="si-btn sm" onClick={() => { setGapScene(sc.sceneId); setGapOptions(null); setTab("story"); }}>
                        {sc.state === "unwritten" ? "Help me write it" : "Offer alternatives"}
                      </button>
                    )}
                  </div>
                  {!!sc.shots.length && (
                    <div className="si-shots">
                      {sc.shots.map((row) => {
                        const board = boards.find((b) => b.shotId === row.shotId);
                        return (
                          <div key={row.shotId} className="si-shot" style={{ borderColor: STATUS[row.status].color }}>
                            <span className="si-slug">{row.slug}</span>
                            <span className="si-type">{row.type}</span>
                            <span className="si-status" style={{ color: STATUS[row.status].color }}>{STATUS[row.status].label}</span>
                            {row.unusedAssetIds.length > 0 && <span className="si-dim" title="Takes for this shot sitting unused in a bin">{row.unusedAssetIds.length} unused take{row.unusedAssetIds.length === 1 ? "" : "s"}</span>}
                            {board && (
                              <button className="si-btn sm" onClick={() => onGenerate?.({ spec: board.spec, kind: "image", title: `${board.slug} · BOARD` })}>
                                <ImageIcon size={10} /> Board
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ── CHARACTERS ───────────────────────────────────────────────────────── */}
          {tab === "characters" && (
            <>
              {!evidence.length && <div className="si-empty">No cast yet. Characters are added when you break down a script or build the production from the cut.</div>}
              {evidence.map((ev) => {
                const member = (prod.cast || []).find((c) => c.id === ev.castId);
                const sheet = planCharacterSheet(ev, member, {});
                const lock = member?.voiceLock || planVoiceLock(ev, member);
                const read = (intel.relationships?.characters || []).find((c) => c.name === ev.name);
                return (
                  <div key={ev.castId} className="si-card">
                    <div className="si-card-head">
                      <b>{ev.name}</b>
                      <span className="si-dim">{ev.sceneIds.length} scene{ev.sceneIds.length === 1 ? "" : "s"} · {ev.shotCount} shot{ev.shotCount === 1 ? "" : "s"} in the cut · {ev.screenSec}s on screen · {ev.lineCount} line{ev.lineCount === 1 ? "" : "s"}</span>
                    </div>
                    {read && (
                      <div className="si-read">
                        {read.want && <div><b>Wants</b> {read.want}</div>}
                        {read.need && <div><b>Needs</b> {read.need}</div>}
                        {read.fear && <div><b>Fears</b> {read.fear}</div>}
                        {read.arc && <div><b>Arc</b> {read.arc}</div>}
                      </div>
                    )}
                    <div className="si-row">
                      <span className="si-lbl"><ImageIcon size={11} /> LOOK</span>
                      <span className="si-dim">{sheet.refs.length} reference{sheet.refs.length === 1 ? "" : "s"} found ({sheet.refs.filter((r) => r.source === "timeline").length} from the cut)</span>
                    </div>
                    <div className="si-views">
                      {member?.sheet?.turnaround
                        ? <span className="si-have">Whole sheet ✓</span>
                        : <button className="si-btn sm" title="One generation: front, three-quarter, profile, back and four expressions on a single page. It files itself onto this character when it comes back." onClick={() => onGenerate?.({ spec: sheet.turnaround, kind: "image", title: `${ev.name} · CHARACTER SHEET` })}><ImageIcon size={10} /> Whole sheet</button>}
                      {SHEET_VIEWS.map((v) => {
                        const req = sheet.requests.find((r) => r.view === v.id);
                        return req
                          ? <button key={v.id} className="si-btn sm" title={`Generate the ${v.label.toLowerCase()} view from the references found`} onClick={() => onGenerate?.({ spec: req.spec, kind: "image", title: `${ev.name} · ${v.label.toUpperCase()}` })}>+ {v.label}</button>
                          : <span key={v.id} className="si-have">{v.label} ✓</span>;
                      })}
                    </div>
                    {sheet.notes.map((n, i) => <div key={i} className="si-note">{n}</div>)}
                    <div className="si-row">
                      <span className="si-lbl"><Mic size={11} /> VOICE</span>
                      <span className={`si-state ${lock.readiness}`}>{member?.voiceLock ? "locked" : lock.readiness}</span>
                      <span className="si-dim">{lock.totalSec}s of speech across {lock.samples.length} sample{lock.samples.length === 1 ? "" : "s"}</span>
                      {!member?.voiceLock && lock.readiness !== "insufficient" && (
                        <button className="si-btn sm" onClick={() => {
                          if (window.confirm(`Lock ${ev.name}'s voice from these ${lock.samples.length} samples?\n\nOnly continue if the performer has agreed to their voice being cloned for this production.`)) lockVoice(lock);
                        }}>Lock voice</button>
                      )}
                    </div>
                    {!member?.voiceLock && lock.notes.map((n, i) => <div key={i} className="si-note">{n}</div>)}
                    {member?.voiceLock && (
                      <div className="si-row">
                        {member.voiceLock.referenceAssetId
                          ? <span className="si-dim">Reference built — {member.voiceLock.referenceSec}s in the Voice Locks bin. Lines can be spoken in this voice from the Direction tab.</span>
                          : <span className="si-dim">Locked. Build the reference file to speak lines in this voice.</span>}
                        <button className="si-btn sm" disabled={!!working} onClick={() => buildReference(member.voiceLock)}>
                          {working === `ref:${ev.castId}` ? <Loader size={10} className="si-spin" /> : <Mic size={10} />} {member.voiceLock.referenceAssetId ? "Rebuild reference" : "Build voice reference"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!!evidence.length && (
                <div className="si-card">
                  <div className="si-card-head">
                    <b>Relationships &amp; motivations</b>
                    <button className="si-btn sm" disabled={!!busy} onClick={readRelationships}>{intel.relationships ? "Read again" : "Read from the story"}</button>
                  </div>
                  {!intel.relationships && edges.slice(0, 6).map((e) => (
                    <div key={`${e.a}-${e.b}`} className="si-dim">{e.a} + {e.b} — {e.sharedScenes} shared scene{e.sharedScenes === 1 ? "" : "s"}, {e.exchanges} exchange{e.exchanges === 1 ? "" : "s"}</div>
                  ))}
                  {(intel.relationships?.relationships || []).map((r, i) => (
                    <div key={i} className="si-rel">
                      <b>{r.a} — {r.b}</b> <span className="si-kind">{r.kind}</span>
                      <div>{r.dynamic}</div>
                      {r.tension && <div className="si-dim">Unresolved: {r.tension}</div>}
                    </div>
                  ))}
                  {intel.relationships && <div className="si-note">What each character wants now drives their direction in every generated shot.</div>}
                </div>
              )}
            </>
          )}

          {/* ── DIRECTION ────────────────────────────────────────────────────────── */}
          {tab === "direction" && (
            <>
              <select className="si-sel" value={dirSceneObj?.id || ""} onChange={(e) => setDirScene(e.target.value)}>
                {flatScenes.filter((x) => (x.scene.shots || []).length).map((x) => <option key={x.scene.id} value={x.scene.id}>{x.act.title} · {x.scene.slugline || x.scene.title}</option>)}
              </select>
              {!dir && <div className="si-empty">No scene has a shot list yet. Run the SLATE breakdown on a scene and its direction appears here.</div>}
              {dir && !dirSceneObj.bible && <div className="si-note">This scene has no bible yet, so there are no character arcs or locks to direct from. Run the SLATE breakdown first.</div>}
              {dir && (
                <div className="si-note">
                  {dir.ledger.fromBreakdown.length
                    ? `Continuity is held from the Film Hub breakdown for Scene ${dirHubScene?.sceneNum || ""} — ${dir.ledger.fromBreakdown.join(", ")}. Changes inside the scene are read from the shots.`
                    : prod?.filmProductionId
                      ? (dirHubScene ? `Scene ${dirHubScene.sceneNum} has no wardrobe, makeup, prop or set-dressing elements in the Film Hub breakdown yet — continuity here is read from the shot text.` : "This scene isn't matched to a scene in the linked production, so its breakdown can't be applied — continuity here is read from the shot text.")
                      : "No Film Hub production is linked to this project — continuity is read from the shot text. Projects sent from the hub's Set-to-Cut use its script breakdown instead."}
                </div>
              )}
              {dir && dir.ledger.issues.map((x, i) => <div key={i} className="si-err"><AlertTriangle size={12} /> {x.slug}: {x.message}</div>)}
              {dir && dir.plan.shots.map((sp, i) => {
                const cont = dir.ledger.shots[i];
                const state = [...(cont?.characters || []).map((c) => characterStateClause(c, { withSide: (cont.characters.length >= 2) })), environmentStateClause(cont?.environment || { dressing: [] })].filter(Boolean);
                return (
                  <div key={sp.shotId} className="si-card">
                    <div className="si-card-head">
                      <b>{sp.slug}</b>
                      <span className="si-meter" title={`Tension ${Math.round(sp.tension * 100)}%`}><i style={{ width: `${Math.round(sp.tension * 100)}%` }} /></span>
                    </div>
                    {sp.beats.map((b) => (
                      <div key={b.character} className="si-beat">
                        <b>{b.character}</b> <span className="si-kind">{b.role}</span> {b.emotion.name}{b.toward && b.toward.name !== b.emotion.name ? ` → ${b.toward.name}` : ""}
                        <div>Plays to {b.tactic}.{b.objective && <span className="si-dim"> Wants: {b.objective}</span>}</div>
                        <div className="si-dim">{b.physical.eyes}; {b.physical.body}; {b.physical.tempo} tempo</div>
                        {(() => {
                          const shot = (dirSceneObj.shots || []).find((x) => x.id === sp.shotId);
                          const member = (prod.cast || []).find((c) => c.name === b.character);
                          if (b.role !== "speaking" || !(shot?.lines || "").trim() || !member?.voiceLock?.referenceAssetId) return null;
                          const k = `say:${sp.shotId}`;
                          return (
                            <button className="si-btn sm" disabled={!!working} title={`Delivery: ${b.vocal.note}`}
                              onClick={() => act(k, () => onSpeakLine({ castId: member.id, text: shot.lines.trim(), beat: b, shotId: sp.shotId }))}>
                              {working === k ? <Loader size={10} className="si-spin" /> : <Mic size={10} />} Speak this line in {b.character}'s voice
                            </button>
                          );
                        })()}
                      </div>
                    ))}
                    {!sp.beats.length && <div className="si-dim">No character in frame.</div>}
                    {!!state.length && <div className="si-cont"><b>Holds</b> {state.join(" · ")}</div>}
                    {!!cont?.changes.length && <div className="si-dim">Changes in this shot: {cont.changes.join("; ")}</div>}
                    {checkPlans.filter((pl) => pl.shotId === sp.shotId).map((pl) => {
                      const r = checks[checkKey(pl)];
                      return (
                        <div key={pl.kind} className="si-check">
                          <div className="si-row">
                            <button className="si-btn sm" disabled={!!checking} onClick={() => runCheck(pl, dirSceneObj)}>
                              {checking === checkKey(pl) ? <Loader size={10} className="si-spin" /> : <Eye size={10} />} {pl.kind === "take" ? "Check against previous take" : pl.kind === "first-frame" ? "Check against start frame" : "Check light against previous shot"}
                            </button>
                            {r && <span className={`si-state ${verdictClass(r.score)}`}>{continuityVerdict(r.score)} · {r.score}</span>}
                            {r && <span className="si-dim">{pl.scope === "same-setup" ? `props/set ${r.propsScore} · ` : ""}lighting {r.lightingScore} · {r.colorTempNote} · {r.lumaDelta > 0 ? "+" : ""}{r.lumaDelta} luma</span>}
                          </div>
                          {r && (
                            <div className="si-frames">
                              <figure><img src={r.refThumb} alt="reference frame" /><figcaption>{pl.ref.name}</figcaption></figure>
                              <figure>
                                <div className="si-frame">
                                  <img src={r.curThumb} alt="frame being checked" />
                                  {r.flags.filter((f) => f.kind === "CHANGE").map((f, k) => (
                                    <i key={k} className={f.severity} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }} title={f.label} />
                                  ))}
                                </div>
                                <figcaption>{pl.cur.name}{r.flags.filter((f) => f.kind === "LIGHT").map((f) => ` — ${f.label}`).join("")}</figcaption>
                              </figure>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {dir && !!dir.staging.shots.length && (
                <div className="si-card">
                  <div className="si-card-head">
                    <b>Staging</b>
                    <span className="si-dim">Drag a character or the camera. Seen from above; the master looks up from the bottom edge.</span>
                    {dirSceneObj.staging && <button className="si-btn sm" onClick={() => updateProd((p) => { for (const a of p.acts || []) for (const sc of a.scenes || []) if (sc.id === dirSceneObj.id) delete sc.staging; })}>Reset</button>}
                  </div>
                  <div className="si-stage-wrap">
                    <StageMap
                      plan={dir.staging} selected={stageShot || dir.staging.shots[0].shotId} onSelect={setStageShot}
                      onMove={(target, point) => updateProd((p) => {
                        for (const a of p.acts || []) for (const sc of a.scenes || []) {
                          if (sc.id !== dirSceneObj.id) continue;
                          sc.staging = sc.staging || {};
                          if (target.camera) { sc.staging.shots = sc.staging.shots || {}; sc.staging.shots[target.camera] = { ...(sc.staging.shots[target.camera] || {}), camera: point }; }
                          else { sc.staging.marks = { ...(sc.staging.marks || {}), [target.mark]: point }; }
                        }
                      })}
                    />
                    <div className="si-stage-side">
                      <div className="si-views">
                        {dir.staging.shots.map((st) => (
                          <button key={st.shotId} className={`si-btn sm ${(stageShot || dir.staging.shots[0].shotId) === st.shotId ? "" : "off"} ${st.crossesLine ? "bad" : ""}`} onClick={() => setStageShot(st.shotId)}>{st.slug} · {st.camera.kind}</button>
                        ))}
                      </div>
                      {dir.staging.issues.map((x, i) => <div key={i} className="si-err"><AlertTriangle size={12} /> {x.slug}: {x.message}</div>)}
                      <div className="si-dim">{dir.forShot(stageShot || dir.staging.shots[0].shotId)?.blocking || "No one in frame."}</div>
                      <div className="si-dim">This blocking is written into the shot's prompt, so the frame is composed the way the plan says.</div>
                    </div>
                  </div>
                </div>
              )}
              {dir && (prod?.continuityChecks || []).some((c) => c.fabulaSceneId === dirSceneObj.id) && (
                <div className="si-card">
                  <div className="si-card-head"><b>Continuity log</b><span className="si-dim">{prod?.filmProductionId ? "Also written to the production's Continuity tab" : "Saved with this project"}</span></div>
                  {(prod.continuityChecks || []).filter((c) => c.fabulaSceneId === dirSceneObj.id).slice(0, 8).map((c) => (
                    <div key={c.id} className="si-row">
                      <span className={`si-state ${verdictClass(c.score)}`}>{continuityVerdict(c.score)} · {c.score}</span>
                      <span>{c.label}</span>
                      <span className="si-dim">{c.colorTempNote} · {c.flagCount} flag{c.flagCount === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
              )}
              {dir && !!dir.score.length && (
                <div className="si-card">
                  <div className="si-card-head"><b>Score &amp; sound brief</b></div>
                  {onScoreCue && (
                    <div className="si-row">
                      <span className={`si-state ${engineUp ? "ready" : engineUp === false ? "insufficient" : ""}`}>{engineUp ? "your music engine is connected" : engineUp === false ? "no music engine found" : "checking…"}</span>
                      <input className="si-sel" style={{ maxWidth: 230, flex: "0 1 230px" }} value={engineUrl} onChange={(e) => setEngineUrl(e.target.value)} aria-label="Address of the music engine on your machine" spellCheck={false} />
                      <button className="si-btn sm" onClick={() => { try { const u = setLocalAceStepUrl(engineUrl); setEngineUrl(u); checkEngine(u); } catch (e) { setErr(e.message); } }}>Use this address</button>
                      <span className="si-dim">Cues generate on an ACE-Step you run yourself — your machine, no platform credits. Hosted engines are admin-only for now.</span>
                    </div>
                  )}
                  {dir.score.map((s, i) => (
                    <div key={i} className="si-beat">
                      <b>{s.fromSlug}{s.toSlug !== s.fromSlug ? `–${s.toSlug}` : ""}</b> {s.cue.prompt}
                      <button className="si-btn sm" onClick={() => copy(s.cue.prompt)}><Copy size={10} /> Copy</button>
                      {(() => {
                        const timing = sectionTiming(s, clips);
                        const k = `score:${i}`;
                        return timing
                          ? <button className="si-btn sm" disabled={!!working} title={`Generates ${Math.round(timing.seconds)}s of underscore and lays it under these shots`} onClick={() => act(k, () => onScoreCue(s, timing, setWatching).finally(() => setWatching("")))}>
                              {working === k ? <Loader size={10} className="si-spin" /> : <Sparkles size={10} />} Generate cue ({Math.round(timing.seconds)}s)
                            </button>
                          : <span className="si-dim"> These shots aren't in the cut yet, so there is nothing to score to.</span>;
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── STORY ────────────────────────────────────────────────────────────── */}
          {tab === "story" && (
            <>
              {listScripts && (
                <div className="si-card">
                  <div className="si-card-head">
                    <b>Screenplay</b>
                    <span className="si-dim">{prod?.scriptId ? `Linked: ${prod.scriptTitle || "screenplay"}` : "Not linked to a screenplay yet"}</span>
                  </div>
                  <div className="si-row">
                    {!scripts
                      ? <button className="si-btn" disabled={!!working} onClick={loadScripts}>{working === "scripts" ? "Loading…" : prod?.scriptId ? "Choose a different screenplay" : "Choose a screenplay"}</button>
                      : (
                        <select className="si-sel" value={scriptPick} onChange={(e) => setScriptPick(e.target.value)}>
                          <option value="">{scripts.length ? "Choose a screenplay…" : "You have no screenplays yet — write one in the script editor"}</option>
                          {scripts.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.scenes} scene{x.scenes === 1 ? "" : "s"}</option>)}
                        </select>
                      )}
                    <button className="si-btn" disabled={!scriptPick || !!working} onClick={pullScript} title="Updates scene text from the screenplay. Shot lists, bibles and footage are kept; nothing is deleted.">
                      {working === "pull" ? "Pulling…" : "Pull the latest script"}
                    </button>
                  </div>
                  {scriptMsg && <div className="si-note">{scriptMsg}</div>}
                  {flatScenes.filter((x) => x.scene.scriptRevisedAt || x.scene.notInScript).slice(0, 8).map((x) => (
                    <div key={x.scene.id} className="si-row">
                      <button className="si-link" onClick={() => onGotoScene?.(x.act.id, x.scene.id)}>{x.scene.slugline || x.scene.title}</button>
                      <span className={`si-state ${x.scene.notInScript ? "insufficient" : "thin"}`}>{x.scene.notInScript ? "no longer in the script" : "rewritten — breakdown is behind"}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="si-card">
                <div className="si-card-head"><b>Stuck on a scene?</b></div>
                <div className="si-row">
                  <select className="si-sel" value={gapScene} onChange={(e) => { setGapScene(e.target.value); setGapOptions(null); }}>
                    <option value="">Choose the scene to work on…</option>
                    {flatScenes.map((x) => <option key={x.scene.id} value={x.scene.id}>{x.act.title} · {x.scene.slugline || x.scene.title}{(x.scene.script || "").trim() ? "" : " — not written"}</option>)}
                  </select>
                  <button className="si-btn" disabled={!gapScene || !!busy} onClick={fillGap}>Offer three ways through</button>
                </div>
                <textarea className="si-ta" rows={2} placeholder="Optional: what you know has to happen, or what isn't working" value={gapAsk} onChange={(e) => setGapAsk(e.target.value)} />
                {(gapOptions || []).map((o, i) => (
                  <div key={i} className="si-opt">
                    <div className="si-card-head"><b>{o.title}</b><button className="si-btn sm" onClick={() => applyGapOption(o)}>Use this</button></div>
                    <div className="si-dim">{o.slugline}</div>
                    <div>{o.premise}</div>
                    <pre className="si-pre">{o.script}</pre>
                    <div className="si-dim">{o.whyItWorks} · {o.shots.length} shots</div>
                  </div>
                ))}
                {gapOptions && !gapOptions.length && <div className="si-note">Nothing usable came back — try again, or add a note about what the scene has to do.</div>}
                {gapScene && prod?.scriptId && (() => {
                  const sc = flatScenes.find((x) => x.scene.id === gapScene)?.scene;
                  return sc && (sc.script || "").trim() ? (
                    <div className="si-row">
                      <button className="si-btn sm" disabled={!!working} onClick={() => pushScene(gapScene)}>{working === `push:${gapScene}` ? "Sending…" : sc.scriptElementId ? "Update this scene in the screenplay" : "Add this scene to the screenplay"}</button>
                      <span className="si-dim">Writes this scene into "{prod.scriptTitle || "the linked screenplay"}" in story position.</span>
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="si-card">
                <div className="si-card-head"><b>Notes on the production</b><button className="si-btn sm" disabled={!!busy} onClick={readCritique}>{intel.critique ? "Read again" : "Give me notes"}</button></div>
                {intel.critique?.summary && <div className="si-lead">{intel.critique.summary}</div>}
                {(intel.critique?.notes || []).map((n, i) => (
                  <div key={i} className={`si-crit ${n.severity}`}>
                    <span className="si-kind">{n.area}</span>
                    {n.sceneId && <button className="si-link" onClick={() => { const x = flatScenes.find((f) => f.scene.id === n.sceneId); if (x) onGotoScene?.(x.act.id, n.sceneId); }}>{sceneTitle(n.sceneId)}</button>}
                    <div>{n.observation}</div>
                    {n.suggestion && <div className="si-dim">→ {n.suggestion}</div>}
                  </div>
                ))}
              </div>

              <div className="si-card">
                <div className="si-card-head"><b>What the bins could do</b><button className="si-btn sm" disabled={!!busy} onClick={readBins}>{intel.bins ? "Look again" : "Look through the bins"}</button></div>
                <div className="si-row">
                  <span className="si-dim">{(prod.mediaPool || []).filter((a) => a.analysis).length} of {(prod.mediaPool || []).filter((a) => ["video", "image", "audio"].includes(a.type) && !a.board).length} clips watched. Watched clips are judged on what is in them; the rest on name, tags and bin.</span>
                  {watchClip && unwatched.length > 0 && (
                    <button className="si-btn sm" disabled={!!busy} onClick={watchBins} title="Runs the vision pass on each clip (unused footage first). Also tags clips to the characters in them and finds their speech for voice locks.">
                      <Eye size={10} /> Watch {unwatched.length} clip{unwatched.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>
                {watching && <div className="si-dim">{watching}</div>}
                {(intel.bins || []).map((s, i) => (
                  <div key={i} className="si-crit note">
                    <span className="si-kind">{s.kind.replace(/_/g, " ")}</span>
                    {s.sceneId && <span className="si-dim">{sceneTitle(s.sceneId)}{s.shotSlug ? ` · ${s.shotSlug}` : ""}</span>}
                    <div>{s.idea}</div>
                    <div className="si-dim">{s.why}</div>
                    <div className="si-row">
                      <span className="si-dim">Clips: {s.assetIds.map((id) => (prod.mediaPool || []).find((a) => a.id === id)?.name || id).join(", ")}</span>
                      {onPlaceSuggestion && <button className="si-btn sm" onClick={() => onPlaceSuggestion(s)} title="An alternate goes into its shot with the previous take muted; anything else is added at the end of V1.">Lay into the cut</button>}
                    </div>
                  </div>
                ))}
                {intel.bins && !intel.bins.length && <div className="si-note">No suggestions — nothing unused in the bins reads as useful for the story as it stands.</div>}
              </div>
            </>
          )}
        </div>

        <style>{`
          .si-backdrop{position:fixed;inset:0;z-index:990;background:rgba(4,4,10,0.72);display:flex;align-items:center;justify-content:center;padding:20px}
          .si-modal{width:min(940px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:#11111a;border:1px solid rgba(139,92,246,0.35);border-radius:16px;color:#e7e5f0;font-size:12.5px;line-height:1.5}
          .si-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
          .si-title{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.08em;font-size:12px;color:#e9d5ff}
          .si-sub{font-weight:500;letter-spacing:0;color:#9d98b3}
          .si-x{background:none;border:0;color:#9d98b3;cursor:pointer;padding:4px}
          .si-tabs{display:flex;align-items:center;gap:6px;padding:0 16px 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-wrap:wrap}
          .si-tab{display:flex;align-items:center;gap:6px;background:none;border:1px solid transparent;color:#9d98b3;font-size:10.5px;font-weight:700;letter-spacing:.08em;padding:6px 10px;border-radius:8px;cursor:pointer}
          .si-tab.on{color:#e9d5ff;border-color:rgba(139,92,246,0.5);background:rgba(139,92,246,0.14)}
          .si-busy{margin-left:auto;display:flex;align-items:center;gap:6px;color:#c4b5fd;font-size:11px}
          .si-spin{animation:si-spin 1s linear infinite}@keyframes si-spin{to{transform:rotate(360deg)}}
          .si-body{overflow:auto;padding:14px 16px 18px;display:flex;flex-direction:column;gap:10px}
          .si-empty{color:#9d98b3;padding:28px 8px;text-align:center}
          .si-err{display:flex;gap:7px;align-items:flex-start;color:#fecdd3;background:rgba(251,113,133,0.1);border:1px solid rgba(251,113,133,0.3);border-radius:9px;padding:8px 10px;margin:8px 16px 0}
          .si-body .si-err{margin:0}
          .si-summary{display:flex;flex-direction:column;gap:8px}
          .si-bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,0.06)}
          .si-legend{display:flex;gap:14px;flex-wrap:wrap;color:#cfcbe0;font-size:11.5px}
          .si-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}
          .si-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
          .si-dim{color:#9d98b3;font-size:11.5px}
          .si-btn{background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.5);color:#ede9fe;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
          .si-btn.sm{padding:3px 8px;font-size:10.5px}
          .si-btn:disabled{opacity:.45;cursor:default}
          .si-scene{border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:9px 11px}
          .si-scene-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
          .si-link{background:none;border:0;color:#e7e5f0;font-weight:700;font-size:12px;cursor:pointer;padding:0;text-align:left}
          .si-link:hover{color:#c4b5fd}
          .si-state{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,0.07);color:#cfcbe0}
          .si-state.covered,.si-state.ready{color:#6ee7b7;background:rgba(52,211,153,0.12)}
          .si-state.partial,.si-state.thin,.si-state.unbroken{color:#fcd34d;background:rgba(251,191,36,0.12)}
          .si-state.uncovered,.si-state.unwritten,.si-state.insufficient{color:#fda4af;background:rgba(251,113,133,0.12)}
          .si-shots{display:flex;flex-direction:column;gap:4px;margin-top:8px}
          .si-shot{display:flex;align-items:center;gap:10px;border-left:3px solid;padding:3px 0 3px 9px;flex-wrap:wrap}
          .si-slug{font-weight:800;min-width:30px}
          .si-type{flex:1;min-width:140px;color:#cfcbe0}
          .si-status{font-size:10.5px;font-weight:700}
          .si-card{border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
          .si-card-head{display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap}
          .si-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
          .si-lbl{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;letter-spacing:.08em;color:#c4b5fd;min-width:58px}
          .si-views{display:flex;gap:6px;flex-wrap:wrap}
          .si-have{font-size:10.5px;color:#6ee7b7;padding:3px 8px}
          .si-note{font-size:11.5px;color:#d7c9a6;background:rgba(180,140,40,0.1);border-radius:7px;padding:6px 9px}
          .si-read{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px 14px}
          .si-read b,.si-cont b{color:#c4b5fd;font-size:10.5px;letter-spacing:.04em;margin-right:5px;text-transform:uppercase}
          .si-rel,.si-beat{border-top:1px solid rgba(255,255,255,0.06);padding-top:6px}
          .si-kind{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a5b4fc;margin:0 6px}
          .si-meter{width:120px;height:5px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden}
          .si-meter i{display:block;height:100%;background:linear-gradient(90deg,#60a5fa,#fb7185)}
          .si-sel{background:#1a1a26;border:1px solid rgba(255,255,255,0.12);color:#e7e5f0;border-radius:8px;padding:6px 8px;font-size:12px;max-width:100%;flex:1;min-width:200px}
          .si-ta{background:#1a1a26;border:1px solid rgba(255,255,255,0.12);color:#e7e5f0;border-radius:8px;padding:7px 9px;font-size:12px;font-family:inherit;resize:vertical}
          .si-opt{border:1px solid rgba(139,92,246,0.25);border-radius:9px;padding:9px 11px;display:flex;flex-direction:column;gap:5px}
          .si-pre{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;background:rgba(0,0,0,0.3);border-radius:7px;padding:8px 10px;margin:0;max-height:220px;overflow:auto}
          .si-lead{font-size:13px;color:#f1eefb}
          .si-crit{border-left:3px solid #a5b4fc;padding:3px 0 3px 9px}
          .si-crit.strength{border-color:#34d399}.si-crit.problem{border-color:#fb7185}
          .si-crit .si-kind{margin-left:0}
          .si-btn.off{background:transparent;border-color:rgba(255,255,255,0.14);color:#b9b4cf}
          .si-btn.bad{border-color:#fb7185;color:#fecdd3}
          .si-stage-wrap{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:12px;align-items:start}
          @media (max-width:640px){.si-stage-wrap{grid-template-columns:1fr}}
          .si-stage-side{display:flex;flex-direction:column;gap:6px;min-width:0}
          .si-stage{width:100%;aspect-ratio:1;background:#0c0c14;border:1px solid rgba(255,255,255,0.12);border-radius:8px;touch-action:none;user-select:none}
          .si-stage text{font:700 4px system-ui,sans-serif;fill:#e7e5f0;pointer-events:none}
          .si-stage .grab{cursor:grab}
          .si-check{border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;display:flex;flex-direction:column;gap:6px}
          .si-frames{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:520px}
          .si-frames figure{margin:0}
          .si-frames img{display:block;width:100%;border-radius:6px;border:1px solid rgba(255,255,255,0.1)}
          .si-frames figcaption{font-size:10.5px;color:#9d98b3;margin-top:3px;overflow-wrap:anywhere}
          .si-frame{position:relative}
          .si-frame i{position:absolute;border:2px dashed #f5b544;border-radius:3px}
          .si-frame i.break{border-color:#ff5a6a}
        `}</style>
      </div>
    </div>
  );
}
