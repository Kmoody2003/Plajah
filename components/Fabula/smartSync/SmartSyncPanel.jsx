// Smart Sync — one click from a pile of cameras and recorders to a synced, segmented, flagged and pre-cut
// program, reviewed in one place and applied as ordinary, editable timeline clips.
//
//   SETUP     program type, lead editor, what to run, your direction → ✦ SYNC & PRE-CUT
//   SYNC      every angle's lock: method, confidence, the alternatives, ±frame nudges, re-sync one angle
//   GRAPHICS  scripture / name / giving / announcement flags: accept, reject, edit, jump
//   PROGRAM   the program's sections (welcome · worship · sermon …) — become timeline markers
//   CUT       the council's pre-cut: why each shot, approve as you watch, swap an angle (= your lock), re-cut
//
// The editor stays in charge: an angle you pick or a segment you lock is never moved by a re-cut or by the
// council, and Apply goes through the timeline's undo history.

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Sparkles, Loader, RefreshCw, Check, Lock, Unlock, Play, ChevronLeft, ChevronRight, Eye, Wand2, AlertTriangle, Users } from "lucide-react";
import { runSmartSync, newState, defaultOptions, offsetsOf, setManualOffset, chooseCandidate, clearManual, STAGES, STAGE_LABEL, pickMaster } from "../../../services/fabula/smartSync/pipeline";
import { browserIO } from "../../../services/fabula/smartSync/browserIO";
import { EDITOR_COUNCIL, leadFor, member } from "../../../services/fabula/smartSync/editorCouncil";
import { sectionLabel } from "../../../services/fabula/smartSync/segment";
import { LOWER_THIRDS } from "../../../services/fabula/lowerThirdRegistry";

const PROGRAMS = [
  ["church", "Church service"], ["conference", "Conference / talk"], ["interview", "Interview / podcast"], ["news", "TV news"],
  ["sports", "Sports"], ["concert", "Concert / music"], ["drama", "Drama scene"], ["documentary", "Documentary"], ["general", "General"],
];
const SECTION_KINDS = ["welcome", "worship", "prayer", "scripture", "sermon", "announcements", "offering", "altar", "benediction", "intro", "talk", "qa", "interview", "performance", "report", "action", "scene", "break", "outro", "other"];
const STATUS_COLOR = { locked: "#22c55e", master: "#00A3FF", manual: "#a855f7", review: "#f59e0b", failed: "#ef4444" };
const CAT_ICON = { scripture: "✝", name: "👤", giving: "♥", contact: "☎", announcement: "📣", section: "§", song: "♪" };
const mmss = (t) => { const s = Math.max(0, t); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ":" : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };

// Transcripts are large — kept in memory per multicam rather than in the project document.
const wordCache = new Map();

function defaultLt(kind) {
  const find = (re) => LOWER_THIRDS.find((s) => re.test(`${s.name} ${s.group} ${s.tagline || ""}`));
  if (kind === "scripture") return (find(/scripture|verse|worship|church|sacred|faith/i) || find(/documentary|editorial|serif/i) || LOWER_THIRDS[0])?.id;
  return (find(/documentary|editorial/i) || LOWER_THIRDS[0])?.id;
}

export default function SmartSyncPanel({ angles, mcAsset, fps, vision, llm, onSave, onApply, onSeek, ping, onClose, makeIO }) {
  const saved = mcAsset?.smartSync;
  const [opts, setOpts] = useState(() => defaultOptions({ ...(saved?.options || {}), fps }));
  const [state, setState] = useState(() => saved ? { ...saved, angles, words: wordCache.get(mcAsset.id) || [] } : null);
  const [tab, setTab] = useState(saved ? "sync" : "setup");
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState({});
  const [verseTr, setVerseTr] = useState("kjv");
  const [lt, setLt] = useState(() => ({ scripture: defaultLt("scripture"), name: defaultLt("name"), other: defaultLt("name") }));
  const [includeSuggested, setIncludeSuggested] = useState(true);
  const cancel = useRef(false);
  const [masterId, setMasterId] = useState(() => saved?.masterId || pickMaster(angles));

  const commit = (s) => { setState(s); if (s?.words?.length && mcAsset?.id) wordCache.set(mcAsset.id, s.words); onSave?.(s); };

  // `makeIO` lets a lab or test harness swap the recogniser / media layer; Fabula uses the browser one.
  const io = useMemo(() => (makeIO || browserIO)({
    vision, llm,
    onProgress: (stage, frac, msg) => setProg((p) => ({ ...p, [stage]: { frac, msg } })),
    isCancelled: () => cancel.current,
  }), [vision, llm]);

  const run = async (ro = {}, baseOverride) => {
    if (running) return;
    cancel.current = false; setRunning(true); setProg({});
    const o = { ...opts, masterId, fps };
    let base = baseOverride || state;
    if (!base || !ro.from || ro.from === "ingest") base = newState(angles, o, state);
    else base = { ...base, options: o, angles };
    try {
      const out = await runSmartSync(base, io, ro);
      commit(out);
      const errs = Object.entries(out.errors || {});
      if (errs.length) ping?.(`Smart Sync finished with notes: ${errs.map(([k, v]) => `${STAGE_LABEL[k]} — ${v}`).join("; ")}`);
      else if (!ro.from || ro.from === "ingest") ping?.("Smart Sync done — review the locks, graphics and pre-cut, then Apply.");
      if (!ro.from || ro.from === "ingest") setTab("sync");
    } catch (e) {
      ping?.(e?.message === "cancelled" ? "Smart Sync stopped." : `Smart Sync failed — ${e?.message || e}`);
    }
    setRunning(false);
  };

  const offsets = state ? offsetsOf(state) : {};
  const counts = state ? {
    locked: state.sync.filter((s) => s.status === "locked" || s.status === "master" || s.status === "manual").length,
    review: state.sync.filter((s) => s.status === "review" || s.status === "failed").length,
    flags: state.flags.filter((f) => f.status !== "rejected").length,
    cuts: state.cut.length, approved: state.cut.filter((c) => c.approved || c.locked).length,
  } : null;

  const patch = (fn) => { if (!state) return; commit(fn(state)); };
  const setFlag = (id, p) => patch((s) => ({ ...s, flags: s.flags.map((f) => (f.id === id ? { ...f, ...p } : f)) }));
  const setCut = (i, p) => patch((s) => ({ ...s, cut: s.cut.map((c, k) => (k === i ? { ...c, ...p } : c)) }));
  const setSection = (id, p) => patch((s) => ({ ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...p, label: p.kind ? sectionLabel(p.kind) : x.label } : x)) }));

  const apply = async () => {
    if (!state) return;
    // Verse text for scripture graphics, from the offline-safe Bible library.
    const verseText = {};
    const sc = state.flags.filter((f) => f.category === "scripture" && f.ref && f.status !== "rejected");
    if (sc.length) {
      try {
        const { cuesForRef } = await import("../../../services/ambo/autoScripture");
        for (const f of sc) {
          try { const cues = await cuesForRef(f.ref, verseTr, 99); if (cues.length) verseText[f.id] = cues.flatMap((c) => c.lines).join(" "); } catch { /* verse lookup offline */ }
        }
      } catch { /* scripture library unavailable */ }
    }
    onApply?.(state, { ltSpec: lt, verseText, includeSuggested });
  };

  const stageRows = STAGES.filter((s) => (s !== "vision" || opts.vision) && (s !== "flags" || opts.flags) && ((s !== "precut" && s !== "council") || opts.precut) && (s !== "council" || opts.council));

  return (
    <div className="ss-wrap" onMouseDown={(e) => e.stopPropagation()}>
      <style>{CSS}</style>
      <div className="ss-head">
        <Sparkles size={14} />
        <b>SMART SYNC</b>
        <span className="ss-dim">{angles.length} angles{mcAsset ? ` · ${mcAsset.name}` : ""}</span>
        {counts && <span className="ss-sum">{counts.locked}/{state.sync.length} locked{counts.review ? ` · ${counts.review} to review` : ""} · {counts.flags} graphics · {counts.cuts} shots</span>}
        <button className="ss-x" onClick={onClose} title="Close (your results are kept on the multicam)"><X size={14} /></button>
      </div>
      <div className="ss-tabs">
        {[["setup", "Setup"], ["sync", "Sync"], ["graphics", "Graphics"], ["program", "Program"], ["cut", "Cut & Council"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} disabled={k !== "setup" && !state} onClick={() => setTab(k)}>{l}{k === "sync" && counts?.review ? <span className="ss-badge">{counts.review}</span> : null}</button>
        ))}
      </div>

      {running && (
        <div className="ss-prog">
          {stageRows.map((s) => {
            const p = prog[s];
            return (
              <div key={s} className={`ss-stage ${p ? (p.frac >= 1 ? "done" : "on") : ""}`}>
                {p && p.frac < 1 ? <Loader size={11} className="ss-spin" /> : p ? <Check size={11} /> : <span className="ss-dot" />}
                <span>{STAGE_LABEL[s]}</span>
                {p && p.frac < 1 && <span className="ss-dim ss-msg">{p.msg}</span>}
              </div>
            );
          })}
          <button className="ss-btn ghost" onClick={() => { cancel.current = true; }}>Stop</button>
        </div>
      )}

      <div className="ss-body">
        {tab === "setup" && (
          <div className="ss-setup">
            <label>Program</label>
            <select value={opts.programType} onChange={(e) => setOpts((o) => ({ ...o, programType: e.target.value, lead: leadFor(e.target.value) }))}>
              {PROGRAMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label>Master sound</label>
            <select value={masterId} onChange={(e) => setMasterId(e.target.value)}>
              {angles.map((a) => <option key={a.assetId} value={a.assetId}>{a.kind === "audio" ? "♪ " : "🎥 "}{a.name}</option>)}
            </select>
            <div className="ss-hint">Every angle locks to this clock and its sound plays under the whole cut. Pick the board feed or best recorder.</div>
            <label>Lead editor</label>
            <select value={opts.lead} onChange={(e) => setOpts((o) => ({ ...o, lead: e.target.value }))}>
              {EDITOR_COUNCIL.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.tradition}</option>)}
            </select>
            <div className="ss-hint"><i>“{member(opts.lead).epithet}.”</i> {member(opts.lead).conviction}</div>
            <div className="ss-checks">
              <label><input type="checkbox" checked={opts.vision} onChange={(e) => setOpts((o) => ({ ...o, vision: e.target.checked }))} /> Vision lock <span className="ss-dim">— look at the pictures to confirm each sync, fix camera A/V latency, label shots</span></label>
              <label><input type="checkbox" checked={opts.flags} onChange={(e) => setOpts((o) => ({ ...o, flags: e.target.checked }))} /> Flag graphics <span className="ss-dim">— scripture, names, giving, announcements</span></label>
              <label><input type="checkbox" checked={opts.precut} onChange={(e) => setOpts((o) => ({ ...o, precut: e.target.checked }))} /> Pre-cut the show</label>
              <label className={opts.precut ? "" : "ss-off"}><input type="checkbox" disabled={!opts.precut} checked={opts.council} onChange={(e) => setOpts((o) => ({ ...o, council: e.target.checked }))} /> Editor Council review <span className="ss-dim">— the masters shape the cut; they never override yours</span></label>
            </div>
            <label>Your direction <span className="ss-dim">(optional)</span></label>
            <textarea rows={3} value={opts.intent} placeholder="e.g. Keep it calm and reverent. Feature the choir in worship. Stay close on the pastor during the altar call."
              onChange={(e) => setOpts((o) => ({ ...o, intent: e.target.value }))} />
            <div className="ss-angles">
              {angles.map((a) => <div key={a.assetId} className="ss-angle-chip">{a.kind === "audio" ? "♪" : "🎥"} {a.name} <span className="ss-dim">{mmss(a.duration)}{a.tcStart != null ? " · TC" : ""}</span></div>)}
            </div>
            <button className="ss-go" disabled={running || angles.length < 2} onClick={() => run()}>
              {running ? <Loader size={14} className="ss-spin" /> : <Wand2 size={14} />} {state ? "RE-RUN SYNC & PRE-CUT" : "SYNC & PRE-CUT"}
            </button>
            <div className="ss-hint">Audio waveform + timecode + transcript anchors{opts.vision ? " + vision" : ""}. Speech recognition runs on this machine. Everything stays editable — redo any step from its tab.</div>
          </div>
        )}

        {tab === "sync" && state && (
          <div>
            <div className="ss-row-actions">
              <button className="ss-btn" disabled={running} onClick={() => run({ from: "audio", to: "vision" })}><RefreshCw size={11} /> Re-sync all</button>
              <button className="ss-btn ghost" disabled={running} onClick={() => run({ from: "segment" })} title="Keep the locks; redo sections, graphics and the cut">Redo after sync</button>
            </div>
            {state.angles.map((a, idx) => {
              const s = state.sync.find((x) => x.assetId === a.assetId);
              if (!s) return null;
              const off = offsets[a.assetId] ?? 0;
              const fr = 1 / (fps || 30);
              const look = state.looks.find((l) => l.assetId === a.assetId);
              return (
                <div key={a.assetId} className="ss-card">
                  <div className="ss-card-top">
                    <span className="ss-idx">{idx + 1}</span>
                    <b className="ss-name">{a.kind === "audio" ? "♪ " : ""}{a.name}</b>
                    <span className="ss-chip" style={{ background: STATUS_COLOR[s.status] + "22", color: STATUS_COLOR[s.status], borderColor: STATUS_COLOR[s.status] + "66" }}>{s.status}</span>
                    {s.status !== "master" && <span className="ss-conf"><span style={{ width: `${Math.round(s.confidence * 100)}%`, background: STATUS_COLOR[s.status] }} /></span>}
                  </div>
                  {s.status !== "master" && (
                    <div className="ss-offset">
                      <span className="ss-dim">offset</span>
                      <button onClick={() => commit(setManualOffset(state, a.assetId, off - fr))} title="−1 frame"><ChevronLeft size={11} /></button>
                      <input type="number" step="0.001" value={off.toFixed(3)} onChange={(e) => commit(setManualOffset(state, a.assetId, parseFloat(e.target.value) || 0))} />
                      <button onClick={() => commit(setManualOffset(state, a.assetId, off + fr))} title="+1 frame"><ChevronRight size={11} /></button>
                      <span className="ss-dim">s · by {s.method}</span>
                      <button className="ss-btn ghost sm" disabled={running} onClick={() => run({ from: "audio", to: "vision", angleIds: [a.assetId] }, clearManual(state, a.assetId))}><RefreshCw size={10} /> Re-sync</button>
                    </div>
                  )}
                  {s.candidates?.length > 0 && s.status !== "master" && (
                    <div className="ss-cands">
                      {s.candidates.map((c) => (
                        <button key={c.method} className={`ss-cand ${Math.abs(c.lag - s.lag) < 0.05 ? "on" : ""}`} title={c.note || ""} onClick={() => commit(chooseCandidate(state, a.assetId, c.method))}>
                          {c.method} {c.lag >= 0 ? "+" : ""}{c.lag.toFixed(2)}s · {Math.round(c.confidence * 100)}%
                        </button>
                      ))}
                    </div>
                  )}
                  {look && look.size !== "unknown" && <div className="ss-dim ss-look"><Eye size={10} /> {look.size}{look.subject ? ` · ${look.subject}` : ""}{look.tags?.length ? ` · ${look.tags.join(", ")}` : ""}</div>}
                  {s.notes?.map((n, i) => <div key={i} className="ss-note">{/review|check|drift|don't/i.test(n) ? <AlertTriangle size={10} /> : null} {n}</div>)}
                  {s.status !== "master" && <button className="ss-link" onClick={() => onSeek?.(Math.max(0, (s.lag - state.mcZero) + 5))}>▶ check at this angle's start</button>}
                </div>
              );
            })}
          </div>
        )}

        {tab === "graphics" && state && (
          <div>
            <div className="ss-row-actions">
              <button className="ss-btn" onClick={() => patch((s) => ({ ...s, flags: s.flags.map((f) => (f.category === "scripture" && f.status === "suggested" ? { ...f, status: "accepted" } : f)) }))}>Accept all scripture</button>
              <button className="ss-btn ghost" onClick={() => patch((s) => ({ ...s, flags: s.flags.map((f) => (f.status === "suggested" ? { ...f, status: "accepted" } : f)) }))}>Accept all</button>
              <button className="ss-btn ghost" disabled={running} onClick={() => run({ from: "flags", to: "flags" })}><RefreshCw size={11} /> Re-detect</button>
            </div>
            {!state.flags.length && <div className="ss-empty">Nothing flagged. {state.words.length ? "No scripture, names or giving details were heard." : "No transcript yet — re-run sync."}</div>}
            {state.flags.map((f) => (
              <div key={f.id} className={`ss-flag ${f.status}`}>
                <span className="ss-ico">{CAT_ICON[f.category] || "•"}</span>
                <button className="ss-time" onClick={() => onSeek?.(f.at)}>{mmss(f.at)}</button>
                <div className="ss-flag-main">
                  <input value={f.title} onChange={(e) => setFlag(f.id, { title: e.target.value })} />
                  <input className="ss-sub" value={f.subtitle} placeholder={f.category === "scripture" ? "verse text fills on Apply" : "subtitle"} onChange={(e) => setFlag(f.id, { subtitle: e.target.value })} />
                  <div className="ss-dim">{f.kind === "fullPage" ? "Full page" : "Lower third"} · {f.duration}s · heard “{f.heard}”</div>
                </div>
                <div className="ss-flag-btns">
                  <button className={f.status === "accepted" ? "on ok" : ""} onClick={() => setFlag(f.id, { status: f.status === "accepted" ? "suggested" : "accepted" })} title="Accept"><Check size={11} /></button>
                  <button className={f.status === "rejected" ? "on no" : ""} onClick={() => setFlag(f.id, { status: f.status === "rejected" ? "suggested" : "rejected" })} title="Reject"><X size={11} /></button>
                </div>
              </div>
            ))}
            <div className="ss-setup ss-tight">
              <label>Scripture lower third</label>
              <select value={lt.scripture || ""} onChange={(e) => setLt((x) => ({ ...x, scripture: e.target.value }))}>{LOWER_THIRDS.map((s) => <option key={s.id} value={s.id}>{s.group} · {s.name}</option>)}</select>
              <label>Name lower third</label>
              <select value={lt.name || ""} onChange={(e) => setLt((x) => ({ ...x, name: e.target.value, other: e.target.value }))}>{LOWER_THIRDS.map((s) => <option key={s.id} value={s.id}>{s.group} · {s.name}</option>)}</select>
              <label>Bible translation for verse text</label>
              <select value={verseTr} onChange={(e) => setVerseTr(e.target.value)}>{["kjv", "web", "asv", "ylt", "bbe"].map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select>
              <label className="ss-inline"><input type="checkbox" checked={includeSuggested} onChange={(e) => setIncludeSuggested(e.target.checked)} /> Place un-reviewed suggestions too (marked ✦)</label>
            </div>
          </div>
        )}

        {tab === "program" && state && (
          <div>
            <div className="ss-row-actions">
              <button className="ss-btn ghost" disabled={running} onClick={() => run({ from: "segment", to: "segment" })}><RefreshCw size={11} /> Re-segment</button>
              <span className="ss-dim">Sections become timeline markers and drive the cut's pacing.</span>
            </div>
            {state.sections.map((x) => (
              <div key={x.id} className="ss-sec">
                <button className="ss-time" onClick={() => onSeek?.(x.start)}>{mmss(x.start)}</button>
                <select value={x.kind} onChange={(e) => setSection(x.id, { kind: e.target.value })}>{SECTION_KINDS.map((k) => <option key={k} value={k}>{sectionLabel(k)}</option>)}</select>
                <span className="ss-dim">{mmss(x.end - x.start)} · {Math.round(x.confidence * 100)}%</span>
              </div>
            ))}
            {!state.sections.length && <div className="ss-empty">No sections yet.</div>}
          </div>
        )}

        {tab === "cut" && state && (
          <div>
            {state.council && (
              <div className="ss-council">
                <div className="ss-council-h"><Users size={12} /> EDITOR COUNCIL · lead {member(state.council.lead).name}</div>
                {state.council.summary && <div className="ss-council-sum">{state.council.summary}</div>}
                {state.council.notes.map((n, i) => <div key={i} className="ss-cnote"><b>{member(n.member).name}</b> {n.note}</div>)}
                {state.council.adjustments.filter((a) => a.note).map((a, i) => <div key={i} className="ss-dim ss-adj">↳ {a.note}{a.pace ? ` (pace ×${a.pace})` : ""}</div>)}
              </div>
            )}
            <div className="ss-row-actions">
              <button className="ss-btn" disabled={running} onClick={() => run({ from: "precut", to: opts.council ? "council" : "precut" })}><RefreshCw size={11} /> Re-cut</button>
              <button className="ss-btn ghost" onClick={() => patch((s) => ({ ...s, cut: s.cut.map((c) => ({ ...c, approved: true })) }))}><Check size={11} /> Approve all</button>
              <span className="ss-dim">{counts.approved}/{counts.cuts} approved · re-cuts keep approved + locked shots</span>
            </div>
            {!state.cut.length && <div className="ss-empty">No pre-cut — turn on “Pre-cut the show” in Setup.</div>}
            <div className="ss-cuts">
              {state.cut.map((c, i) => (
                <div key={i} className={`ss-cut ${c.approved ? "ok" : ""} ${c.locked ? "lk" : ""}`}>
                  <button className="ss-time" onClick={() => onSeek?.(c.start)} title="Watch from here"><Play size={9} /> {mmss(c.start)}</button>
                  <select value={c.angle} onChange={(e) => setCut(i, { angle: +e.target.value, locked: true, reason: "Your pick", by: "YOU" })}>
                    {state.angles.map((a, k) => a.kind === "video" && <option key={k} value={k}>{k + 1}. {a.name}</option>)}
                  </select>
                  <span className="ss-len">{(c.end - c.start).toFixed(1)}s</span>
                  <span className="ss-why" title={c.reason}>{c.by !== "YOU" ? `${member(c.by).name.replace(/^The /, "")}: ` : ""}{c.reason}</span>
                  <button className={c.approved ? "on ok" : ""} onClick={() => setCut(i, { approved: !c.approved })} title="Approve this shot"><Check size={11} /></button>
                  <button className={c.locked ? "on lk" : ""} onClick={() => setCut(i, { locked: !c.locked })} title={c.locked ? "Unlock" : "Lock — re-cuts and the council will never touch it"}>{c.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {state && (
        <div className="ss-foot">
          <button className="ss-go" disabled={running} onClick={apply}><Sparkles size={13} /> APPLY TO TIMELINE</button>
          <span className="ss-dim">Re-applying replaces the previous Smart Sync clips · one Ctrl+Z undoes it</span>
        </div>
      )}
    </div>
  );
}

const CSS = `
.ss-wrap{position:fixed;top:64px;right:12px;bottom:12px;width:min(520px,calc(100vw - 24px));z-index:80;background:var(--panel,#1c1c23);border:1px solid var(--line-hi,rgba(255,255,255,.22));border-radius:10px;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.55);color:#e7e7ee;font-size:12px}
.ss-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,rgba(255,255,255,.13));color:#c4b5fd}
.ss-head b{letter-spacing:.08em;color:#fff}
.ss-sum{margin-left:auto;color:#a1a1aa;font-size:11px}
.ss-x{background:none;border:0;color:#aaa;cursor:pointer;padding:2px;margin-left:6px}
.ss-dim{color:#8b8b97;font-size:11px}
.ss-tabs{display:flex;gap:2px;padding:6px 8px;border-bottom:1px solid var(--line-2,rgba(255,255,255,.08))}
.ss-tabs button{background:none;border:0;color:#a1a1aa;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;position:relative}
.ss-tabs button.on{background:rgba(168,85,247,.18);color:#fff}
.ss-tabs button:disabled{opacity:.35;cursor:default}
.ss-badge{background:#f59e0b;color:#111;border-radius:8px;font-size:9px;padding:0 5px;margin-left:5px;font-weight:700}
.ss-prog{padding:8px 12px;border-bottom:1px solid var(--line-2,rgba(255,255,255,.08));display:grid;gap:3px}
.ss-stage{display:flex;align-items:center;gap:7px;color:#71717a}
.ss-stage.on{color:#fff}.ss-stage.done{color:#86efac}
.ss-msg{margin-left:auto;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-dot{width:7px;height:7px;border-radius:50%;border:1px solid #555;display:inline-block;margin:0 2px}
.ss-spin{animation:ssspin 1s linear infinite}@keyframes ssspin{to{transform:rotate(360deg)}}
.ss-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:10px 12px}
.ss-setup{display:grid;gap:6px}
.ss-setup label{color:#a1a1aa;font-size:11px;margin-top:4px}
.ss-setup select,.ss-setup textarea,.ss-flag input,.ss-sec select,.ss-cut select,.ss-offset input{background:var(--bg2,#16161c);border:1px solid var(--line,rgba(255,255,255,.13));color:#eee;border-radius:6px;padding:6px 8px;font:inherit}
.ss-setup textarea{resize:vertical}
.ss-hint{color:#8b8b97;font-size:11px;line-height:1.45}
.ss-checks{display:grid;gap:5px;margin-top:6px}
.ss-checks label,.ss-inline{color:#ddd !important;font-size:12px !important;display:block;line-height:1.5}
.ss-checks input,.ss-inline input{margin:0 6px 0 0;vertical-align:-2px}
.ss-off{opacity:.45}
.ss-angles{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}
.ss-angle-chip{background:var(--bg2,#16161c);border:1px solid var(--line-2,rgba(255,255,255,.08));border-radius:12px;padding:3px 9px}
.ss-go{display:flex;align-items:center;justify-content:center;gap:7px;background:linear-gradient(90deg,#7c3aed,#a855f7);border:0;color:#fff;font-weight:700;letter-spacing:.06em;padding:10px 14px;border-radius:8px;cursor:pointer}
.ss-go:disabled{opacity:.5;cursor:default}
.ss-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(168,85,247,.16);border:1px solid rgba(168,85,247,.45);color:#e9d5ff;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:11px}
.ss-btn.ghost{background:none;border-color:var(--line,rgba(255,255,255,.13));color:#ccc}
.ss-btn.sm{padding:3px 7px;margin-left:auto}
.ss-btn:disabled{opacity:.45}
.ss-row-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.ss-card{border:1px solid var(--line-2,rgba(255,255,255,.08));background:var(--panel2,#22222b);border-radius:8px;padding:8px 10px;margin-bottom:7px}
.ss-card-top{display:flex;align-items:center;gap:7px}
.ss-idx{width:18px;height:18px;border-radius:4px;background:#333;display:grid;place-items:center;font-size:10px;font-weight:700}
.ss-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-chip{border:1px solid;border-radius:10px;padding:1px 7px;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
.ss-conf{width:60px;height:5px;border-radius:3px;background:#333;overflow:hidden}.ss-conf span{display:block;height:100%}
.ss-offset{display:flex;align-items:center;gap:4px;margin-top:7px}
.ss-offset input{width:92px;padding:3px 6px;font-family:ui-monospace,monospace}
.ss-offset > button:not(.ss-btn){background:#2a2a33;border:1px solid #3a3a44;color:#ddd;border-radius:4px;padding:2px 3px;cursor:pointer;display:grid}
.ss-cands{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.ss-cand{background:none;border:1px dashed #444;color:#aaa;border-radius:10px;padding:2px 8px;font-size:10px;cursor:pointer}
.ss-cand.on{border-style:solid;border-color:#22c55e;color:#86efac}
.ss-look{margin-top:5px;display:flex;gap:4px;align-items:center}
.ss-note{color:#d4d4d8;font-size:11px;margin-top:4px;display:flex;gap:4px;align-items:baseline}
.ss-link{background:none;border:0;color:#a78bfa;font-size:11px;cursor:pointer;padding:0;margin-top:5px}
.ss-empty{color:#8b8b97;padding:20px 0;text-align:center}
.ss-flag{display:flex;gap:7px;align-items:flex-start;border:1px solid var(--line-2,rgba(255,255,255,.08));border-radius:8px;padding:7px 8px;margin-bottom:6px;background:var(--panel2,#22222b)}
.ss-flag.accepted{border-color:rgba(34,197,94,.5)}.ss-flag.rejected{opacity:.45}
.ss-ico{width:18px;text-align:center;font-size:13px}
.ss-time{background:#2a2a33;border:0;color:#c4b5fd;border-radius:4px;padding:3px 6px;font-family:ui-monospace,monospace;font-size:10px;cursor:pointer;white-space:nowrap;display:inline-flex;gap:3px;align-items:center}
.ss-flag-main{flex:1;display:grid;gap:3px;min-width:0}
.ss-flag-main input{padding:3px 6px}.ss-flag-main .ss-sub{font-size:11px;color:#bbb}
.ss-flag-btns,.ss-cut{display:flex;gap:3px}
.ss-flag-btns button,.ss-cut > button:not(.ss-time){background:#2a2a33;border:1px solid #3a3a44;color:#999;border-radius:5px;padding:4px;cursor:pointer;display:grid;place-items:center}
button.on.ok{background:rgba(34,197,94,.2);border-color:#22c55e;color:#86efac}
button.on.no{background:rgba(239,68,68,.2);border-color:#ef4444;color:#fca5a5}
button.on.lk{background:rgba(168,85,247,.2);border-color:#a855f7;color:#e9d5ff}
.ss-tight{margin-top:10px;border-top:1px solid var(--line-2,rgba(255,255,255,.08));padding-top:8px}
.ss-sec{display:flex;gap:8px;align-items:center;margin-bottom:5px}
.ss-council{border:1px solid rgba(168,85,247,.35);background:rgba(168,85,247,.07);border-radius:8px;padding:8px 10px;margin-bottom:8px}
.ss-council-h{font-size:10px;letter-spacing:.08em;color:#c4b5fd;display:flex;gap:5px;align-items:center;margin-bottom:5px}
.ss-council-sum{color:#eee;margin-bottom:6px;line-height:1.45}
.ss-cnote{color:#d4d4d8;font-size:11px;margin:3px 0;line-height:1.4}.ss-cnote b{color:#e9d5ff;margin-right:4px}
.ss-adj{margin-left:6px}
.ss-cuts{display:grid;gap:3px}
.ss-cut{align-items:center;padding:3px 4px;border-radius:6px;border:1px solid transparent;min-width:0}
.ss-cut.ok{border-color:rgba(34,197,94,.35)}.ss-cut.lk{background:rgba(168,85,247,.08)}
.ss-cut select{padding:2px 4px;font-size:11px;width:118px;flex:none}
.ss-len{font-family:ui-monospace,monospace;font-size:10px;color:#a1a1aa;width:38px;text-align:right}
.ss-why{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#bbb;font-size:11px}
.ss-foot{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid var(--line,rgba(255,255,255,.13))}
`;
