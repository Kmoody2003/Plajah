// Fabula · Deliver — Resolve-style render settings + a BACKGROUND render queue.
//
//   Left   Render Settings: preset, file name, range, then Video / Audio tabs — format, codec,
//          codec profile, resolution (presets or custom), frame rate, quality or a bitrate cap,
//          audio codec / rate / bitrate / channels. MPEG-2 broadcast specs lock what the spec
//          fixes and offer only the frame rates it allows.
//   Right  Render Queue: jobs from ANY sequence, each a frozen snapshot of its timeline, rendering
//          one after another while you keep working anywhere in Fabula (services/fabula/renderQueue).

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_DELIVER, DELIVER_PRESETS, FRAME_RATES, RESOLUTIONS, applyPreset, containerChoices, normalize, planDelivery,
  type DeliverRange, type DeliverSettings, type Quality,
} from '../../../services/fabula/deliver';
import { audioCodecsFor, videoCodecsFor } from '../../../services/crossover/formats';
import { isInterlacedAt, mpeg2Preset, pickRate, rateValue } from '../../../services/fabula/mpeg2';
import { renderQueue, type RenderJob } from '../../../services/fabula/renderQueue';

const LS = 'fabula:deliver:settings';
const loadSettings = (): DeliverSettings => { try { return { ...DEFAULT_DELIVER, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return DEFAULT_DELIVER; } };

export function useRenderQueue() {
  return useSyncExternalStore(renderQueue.subscribe, renderQueue.getSnapshot);
}

const fmtEta = (s?: number) => (s == null || !isFinite(s) ? '' : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const PRORES = [['0', 'Proxy'], ['1', 'LT'], ['2', '422'], ['3', '422 HQ'], ['4', '4444']];
const DNX = [['dnxhr_lb', 'DNxHR LB'], ['dnxhr_sq', 'DNxHR SQ'], ['dnxhr_hq', 'DNxHR HQ'], ['dnxhr_hqx', 'DNxHR HQX 10-bit'], ['dnxhr_444', 'DNxHR 444']];

export interface DeliverPageProps {
  sequence: string;
  timeline: { w: number; h: number; fps: number; drop?: boolean };
  end: number;
  markIn: number | null;
  markOut: number | null;
  markers: { t: number }[];
  clips: any[];
  mediaPool: any[];
  trackSettings: any;
  cubeLut: any;
  palette: string[];
  range: DeliverRange;
  onRange: (r: DeliverRange) => void;
  onPublish: (blob: Blob, name: string) => void;
  onExportFcpxml: () => void;
  onExportEdl: () => void;
  ping: (m: string) => void;
}

export default function DeliverPage(p: DeliverPageProps) {
  const [s, setS] = useState<DeliverSettings>(loadSettings);
  const [tab, setTab] = useState<'video' | 'audio'>('video');
  const [custom, setCustom] = useState({ w: p.timeline.w, h: p.timeline.h });
  const [fileName, setFileName] = useState('');
  const q = useRenderQueue();
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* */ } }, [s]);

  const set = (patch: Partial<DeliverSettings>) => setS((cur) => normalize({ ...cur, ...patch, presetId: 'custom' }));
  const plan = useMemo(() => planDelivery(s, p.timeline, custom), [s, p.timeline, custom]);
  const bp = s.broadcast ? mpeg2Preset(s.broadcast) : null;
  const web = typeof window !== 'undefined' && !(window as any).__plajahMediaEngine;
  const rangeOk = p.range === 'all' || (p.range === 'inout' ? p.markIn != null && p.markOut != null && p.markOut > p.markIn : p.markers.length > 0);
  const groups = useMemo(() => { const m = new Map<string, typeof DELIVER_PRESETS>(); DELIVER_PRESETS.forEach((x) => m.set(x.group, [...(m.get(x.group) || []), x])); return [...m]; }, []);
  const preset = DELIVER_PRESETS.find((x) => x.id === s.presetId);

  const enqueue = (start: boolean) => {
    if (!p.clips.length) { p.ping('Nothing on this timeline to render.'); return; }
    const jobs = renderQueue.add({
      sequence: p.sequence, settings: s, timeline: p.timeline, custom, clips: p.clips, mediaPool: p.mediaPool,
      trackSettings: p.trackSettings, cubeLut: p.cubeLut, palette: p.palette,
      range: p.range, end: p.end, markIn: p.markIn, markOut: p.markOut, markers: p.markers,
      fileName: fileName || p.sequence, presetLabel: preset && preset.id !== 'custom' ? preset.label : 'Custom',
    });
    p.ping(`Queued ${jobs.length} job${jobs.length > 1 ? 's' : ''} · ${plan.summary}${start ? ' — rendering in the background' : ''}`);
    if (start) void renderQueue.start();
  };

  const active = q.jobs.filter((j) => j.status === 'rendering' || j.status === 'encoding');
  const queued = q.jobs.filter((j) => j.status === 'queued').length;
  const vCodecs = videoCodecsFor(s.container);
  const aCodecs = audioCodecsFor(s.container);
  const rateChoices = bp ? FRAME_RATES.filter((r) => r.id !== 'timeline' && bp.rates.some((x) => Math.abs(rateValue(x) - rateValue(r.id)) < 0.02)) : FRAME_RATES;

  return (
    <div className="dvp">
      <style>{CSS}</style>
      <section className="dvp-set" aria-label="Render settings">
        <header className="dvp-h"><b>Render Settings</b><span className="dim">{p.sequence}</span></header>
        <div className="dvp-scroll">
          <label className="dvp-f">Preset
            <select value={s.presetId} onChange={(e) => setS(applyPreset(s, e.target.value))}>
              {groups.map(([g, list]) => <optgroup key={g} label={g}>{list.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}
            </select>
            {preset && <i>{preset.note}</i>}
          </label>
          <div className="dvp-row2">
            <label className="dvp-f">File name<input value={fileName} placeholder={p.sequence} onChange={(e) => setFileName(e.target.value)} /></label>
            <label className="dvp-f">Range
              <div className="dvp-seg">
                {([['all', 'Whole'], ['inout', 'In→Out'], ['markers', 'Markers']] as const).map(([id, l]) => (
                  <button key={id} className={p.range === id ? 'on' : ''} disabled={id === 'inout' ? p.markIn == null || p.markOut == null : id === 'markers' ? !p.markers.length : false} onClick={() => p.onRange(id)}>{l}</button>
                ))}
              </div>
            </label>
          </div>

          <div className="dvp-tabs">
            <button className={tab === 'video' ? 'on' : ''} onClick={() => setTab('video')}>Video</button>
            <button className={tab === 'audio' ? 'on' : ''} onClick={() => setTab('audio')}>Audio</button>
          </div>

          {tab === 'video' && (
            <div className="dvp-grid">
              <label className="dvp-chk"><input type="checkbox" checked={s.kind === 'video'} disabled={!!bp} onChange={(e) => set({ kind: e.target.checked ? 'video' : 'audio' })} /> Export video</label>
              {s.kind === 'video' && <>
                <label className="dvp-f">Format
                  <select value={s.container} disabled={!!bp} onChange={(e) => set({ container: e.target.value })}>
                    {bp && <option value={s.container}>{bp.wrapper === 'mxf' ? 'MXF OP1a' : bp.ext === 'mpg' ? 'MPEG Program Stream' : 'MPEG Transport Stream'}</option>}
                    {!bp && containerChoices('video').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label className="dvp-f">Codec
                  <select value={s.videoCodec} disabled={!!bp} onChange={(e) => set({ videoCodec: e.target.value })}>
                    {bp ? <option value="mpeg2">MPEG-2 {bp.chroma === '422' ? '4:2:2P@HL' : 'MP@HL'}</option> : vCodecs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                {!bp && s.videoCodec === 'prores' && (
                  <label className="dvp-f">Type<select value={s.proresProfile || '3'} onChange={(e) => set({ proresProfile: e.target.value })}>{PRORES.map(([v, l]) => <option key={v} value={v}>ProRes {l}</option>)}</select></label>
                )}
                {!bp && s.videoCodec === 'dnxhr' && (
                  <label className="dvp-f">Type<select value={s.dnxProfile || 'dnxhr_hq'} onChange={(e) => set({ dnxProfile: e.target.value })}>{DNX.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                )}
                <label className="dvp-f">Resolution
                  {bp ? <select disabled><option>{bp.size ? `${bp.size.w}×${bp.size.h}${bp.anamorphic ? ' (anamorphic 16:9)' : ''}` : 'Timeline'}</option></select> : (
                    <select value={s.resolution} onChange={(e) => set({ resolution: e.target.value })}>
                      {RESOLUTIONS.map((r) => <option key={r.id} value={r.id}>{r.id === 'timeline' ? `Timeline · ${p.timeline.w}×${p.timeline.h}` : r.label}</option>)}
                    </select>
                  )}
                </label>
                {!bp && s.resolution === 'custom' && (
                  <div className="dvp-wh">
                    <input type="number" min={16} value={custom.w} onChange={(e) => setCustom({ ...custom, w: +e.target.value })} aria-label="Width" /> ×
                    <input type="number" min={16} value={custom.h} onChange={(e) => setCustom({ ...custom, h: +e.target.value })} aria-label="Height" />
                  </div>
                )}
                <label className="dvp-f">Frame rate
                  <select value={bp ? (rateChoices.find((r) => Math.abs(rateValue(r.id) - plan.render.fps) < 0.02)?.id || s.fps) : s.fps} onChange={(e) => setS((cur) => ({ ...cur, fps: e.target.value, presetId: bp ? cur.presetId : 'custom' }))}>
                    {rateChoices.map((r) => <option key={r.id} value={r.id}>{r.id === 'timeline' ? `Timeline · ${+p.timeline.fps.toFixed(3)}` : r.label}</option>)}
                  </select>
                </label>
                {bp ? (
                  <div className="dvp-spec">
                    <span>{bp.chroma === '422' ? '4:2:2' : '4:2:0'} · {bp.bitrate ? `${bp.bitrate / 1e6} Mb/s ${bp.cbr ? 'CBR' : 'VBR'}` : 'DVD VBR'} · GOP {bp.gop ?? 15}</span>
                    <span>{isInterlacedAt(bp, pickRate(bp, plan.render.fps)) ? 'Interlaced · top field first' : 'Progressive'} · BT.{bp.size && bp.size.h <= 576 ? '601' : '709'}</span>
                  </div>
                ) : (
                  <label className="dvp-f">Quality
                    <div className="dvp-seg">
                      {(['best', 'high', 'medium', 'low', 'bitrate'] as Quality[]).map((k) => (
                        <button key={k} className={s.quality === k ? 'on' : ''} onClick={() => set({ quality: k })}>{k === 'bitrate' ? 'Limit' : k[0].toUpperCase() + k.slice(1)}</button>
                      ))}
                    </div>
                    {s.quality === 'bitrate' && <div className="dvp-wh"><input type="number" min={1} max={400} value={s.videoMbps || 20} onChange={(e) => set({ videoMbps: +e.target.value })} aria-label="Bitrate" /> Mb/s</div>}
                    {['prores', 'dnxhr', 'cfhd', 'ffv1', 'v210', 'utvideo'].includes(s.videoCodec) && <i>Intraframe codec: quality is set by its type, not a bitrate.</i>}
                  </label>
                )}
              </>}
            </div>
          )}

          {tab === 'audio' && (
            <div className="dvp-grid">
              {s.kind === 'audio' && (
                <label className="dvp-f">Format
                  <select value={s.container} onChange={(e) => set({ container: e.target.value })}>{containerChoices('audio').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                </label>
              )}
              <label className="dvp-f">Codec
                <select value={s.audioCodec} disabled={!!bp} onChange={(e) => set({ audioCodec: e.target.value })}>
                  {bp ? <option>{({ ac3: 'Dolby Digital (AC-3)', mp2: 'MPEG-1 Layer II', pcm_s24le: 'Linear PCM 24-bit', pcm_s16le: 'Linear PCM 16-bit' } as any)[s.audioCodec] || s.audioCodec}</option>
                    : aCodecs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label className="dvp-f">Sample rate
                <select value={bp ? 48000 : s.sampleRate || 48000} disabled={!!bp} onChange={(e) => set({ sampleRate: +e.target.value })}>{[44100, 48000, 96000].map((r) => <option key={r} value={r}>{r / 1000} kHz</option>)}</select>
              </label>
              {!bp && !/^pcm|flac|alac/.test(s.audioCodec) && (
                <label className="dvp-f">Bitrate
                  <select value={s.audioBitrate || '256k'} onChange={(e) => set({ audioBitrate: e.target.value })}>{['128k', '192k', '256k', '320k', '384k', '448k', '640k'].map((b) => <option key={b}>{b}</option>)}</select>
                </label>
              )}
              <label className="dvp-f">Channels
                <select value={s.channels || 2} disabled={!!bp} onChange={(e) => set({ channels: +e.target.value })}><option value={2}>Stereo</option><option value={1}>Mono</option></select>
              </label>
            </div>
          )}
        </div>
        <footer className="dvp-foot">
          <div className="dvp-sum">{plan.summary}{plan.transcode ? <span className="dim"> · render + encode</span> : <span className="dim"> · direct render</span>}</div>
          {plan.desktopOnly && web && <div className="dvp-warn">This codec encodes in the Plajah desktop app (the browser codec pack can't make it).</div>}
          <div className="dvp-btns">
            <button className="dvp-btn" disabled={!rangeOk || !p.clips.length} onClick={() => enqueue(false)}>Add to Render Queue</button>
            <button className="dvp-btn primary" disabled={!rangeOk || !p.clips.length || (plan.desktopOnly && web)} onClick={() => enqueue(true)}>Render Now</button>
          </div>
          <div className="dvp-inter">Interchange: <button onClick={p.onExportFcpxml}>FCPXML</button><button onClick={p.onExportEdl}>EDL</button></div>
        </footer>
      </section>

      <section className="dvp-q" aria-label="Render queue">
        <header className="dvp-h">
          <b>Render Queue</b>
          <span className="dim">{q.jobs.length ? `${q.jobs.filter((j) => j.status === 'done').length}/${q.jobs.length} done` : 'empty'}</span>
          <span className="dvp-sp" />
          <label className="dvp-chk sm"><input type="checkbox" checked={renderQueue.autoDownload} onChange={(e) => renderQueue.setAutoDownload(e.target.checked)} /> Auto-save files</label>
          {q.jobs.some((j) => ['done', 'error', 'canceled'].includes(j.status)) && <button className="dvp-btn sm" onClick={() => renderQueue.clearFinished()}>Clear finished</button>}
          {q.running ? <button className="dvp-btn sm danger" onClick={() => renderQueue.stop()}>Stop</button>
            : <button className="dvp-btn sm primary" disabled={!queued} onClick={() => void renderQueue.start()}>Render All{queued ? ` (${queued})` : ''}</button>}
        </header>
        <div className="dvp-scroll">
          {!q.jobs.length && <div className="dvp-empty">Add jobs from any sequence. The queue renders in the background — switch to Edit, Color, another scene or page and keep working; progress stays in the header.</div>}
          {q.jobs.map((j, i) => <JobRow key={j.id} j={j} n={i + 1} onPublish={p.onPublish} />)}
        </div>
        {active[0] && <div className="dvp-live">Rendering “{active[0].sequence}” · {active[0].stage} · {Math.round(active[0].pct * 100)}%{active[0].etaSec ? ` · ${fmtEta(active[0].etaSec)} left` : ''}</div>}
      </section>
    </div>
  );
}

function JobRow({ j, n, onPublish }: { j: RenderJob; n: number; onPublish: (b: Blob, name: string) => void }) {
  const busy = j.status === 'rendering' || j.status === 'encoding';
  return (
    <div className={'dvp-job ' + j.status}>
      <span className="dvp-n">{n}</span>
      <div className="dvp-jmain">
        <div className="dvp-jt"><b>{j.sequence}</b><span>· {j.label}{j.rangeTag !== 'ALL' ? ` · ${j.rangeTag}` : ''}</span></div>
        <div className="dvp-js">{j.plan.summary} · {j.fileName}</div>
        {busy && <div className="dvp-bar"><div style={{ width: `${Math.round(j.pct * 100)}%` }} /></div>}
        {busy && <div className="dvp-js">{j.stage} · {Math.round(j.pct * 100)}%{j.etaSec ? ` · ${fmtEta(j.etaSec)} left` : ''}</div>}
        {j.status === 'error' && <div className="dvp-err">{j.error}</div>}
        {j.status === 'done' && j.result && <div className="dvp-js ok">{j.result.path ? `Saved ${j.result.path}` : `${fmtSize(j.result.sizeBytes)} ready`}</div>}
      </div>
      <span className={'dvp-st ' + j.status}>{j.status === 'rendering' ? 'Rendering' : j.status === 'encoding' ? 'Encoding' : j.status[0].toUpperCase() + j.status.slice(1)}</span>
      <div className="dvp-act">
        {j.status === 'queued' && <><button title="Move up" onClick={() => renderQueue.move(j.id, -1)}>↑</button><button title="Move down" onClick={() => renderQueue.move(j.id, 1)}>↓</button></>}
        {j.status === 'done' && j.result?.url && <a href={j.result.url} download={j.result.name} title="Save the file">Save</a>}
        {j.status === 'done' && j.result?.blob && j.plan.ext === 'mp4' && <button title="Publish to Reello / Taleo / library" onClick={() => onPublish(j.result!.blob!, j.result!.name.replace(/\.[^.]+$/, ''))}>Publish</button>}
        {(j.status === 'error' || j.status === 'canceled') && <button onClick={() => renderQueue.retry(j.id)}>Retry</button>}
        {busy || j.status === 'queued' ? <button title="Cancel" onClick={() => renderQueue.cancel(j.id)}>✕</button> : <button title="Remove" onClick={() => renderQueue.remove(j.id)}>✕</button>}
      </div>
    </div>
  );
}

/** Header chip: visible on every page while the queue has work. */
export function RenderQueueChip({ onOpen }: { onOpen: () => void }) {
  const q = useRenderQueue();
  const live = q.jobs.find((j) => j.status === 'rendering' || j.status === 'encoding');
  const left = q.jobs.filter((j) => j.status === 'queued').length;
  const done = q.jobs.filter((j) => j.status === 'done').length;
  if (!live && !left) return null;
  return (
    <button onClick={onOpen} title="Open the render queue" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 12, border: '1px solid rgba(255,140,0,.45)', background: 'rgba(255,140,0,.12)', color: '#ffcf99', font: '600 11px/1 Inter,system-ui,sans-serif', cursor: 'pointer', letterSpacing: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: live ? '#FF8C00' : '#888', boxShadow: live ? '0 0 8px #FF8C00' : 'none' }} />
      {live ? `Rendering ${done + 1}/${done + 1 + left} · ${Math.round(live.pct * 100)}%${live.etaSec ? ` · ${fmtEta(live.etaSec)}` : ''}` : `${left} queued`}
    </button>
  );
}

const CSS = `
.dvp{display:grid;grid-template-columns:minmax(340px,420px) minmax(0,1fr);gap:10px;height:100%;min-height:0;padding:10px;font:400 12px/1.4 Inter,system-ui,sans-serif;color:#e7e7ea}
.dvp section{display:flex;flex-direction:column;min-height:0;background:#121317;border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden}
.dvp-h{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.07)} .dvp-h b{font:600 13px/1 Inter,system-ui,sans-serif;color:#fff}
.dvp .dim{color:rgba(255,255,255,.45)} .dvp-sp{flex:1}
.dvp-scroll{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
.dvp-f{display:flex;flex-direction:column;gap:5px;font:500 11px/1 Inter,system-ui,sans-serif;color:rgba(255,255,255,.55)}
.dvp-f i{font:400 11px/1.35 Inter,system-ui,sans-serif;font-style:normal;color:rgba(255,255,255,.45)}
.dvp select,.dvp input[type=number],.dvp input:not([type]){height:28px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#e7e7ea;font:500 12px/1 Inter,system-ui,sans-serif;padding:0 8px}
.dvp select:disabled{opacity:.7}
.dvp-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dvp-seg{display:flex;border:1px solid rgba(255,255,255,.1);border-radius:6px;overflow:hidden}
.dvp-seg button{flex:1;height:26px;border:0;background:transparent;color:rgba(255,255,255,.7);font:500 11.5px/1 Inter,system-ui,sans-serif;cursor:pointer}
.dvp-seg button+button{border-left:1px solid rgba(255,255,255,.08)} .dvp-seg button.on{background:rgba(255,140,0,.18);color:#ffcf99} .dvp-seg button:disabled{opacity:.35;cursor:default}
.dvp-tabs{display:flex;gap:2px;border-bottom:1px solid rgba(255,255,255,.08)}
.dvp-tabs button{height:28px;padding:0 14px;border:0;border-bottom:2px solid transparent;background:transparent;color:rgba(255,255,255,.6);font:600 12px/1 Inter,system-ui,sans-serif;cursor:pointer}
.dvp-tabs button.on{color:#fff;border-bottom-color:#FF8C00}
.dvp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.dvp-grid .dvp-chk,.dvp-spec{grid-column:1/-1}
.dvp-chk{display:flex;align-items:center;gap:7px;font:500 12px/1 Inter,system-ui,sans-serif;color:#ddd} .dvp-chk.sm{font-size:11px;color:rgba(255,255,255,.6)}
.dvp-wh{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.5)} .dvp-wh input{width:84px}
.dvp-spec{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:7px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.25);color:#d6cbff;font-size:11.5px}
.dvp-foot{border-top:1px solid rgba(255,255,255,.07);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.dvp-sum{font:600 12px/1.3 Inter,system-ui,sans-serif;color:#fff}
.dvp-warn{font-size:11px;color:#ffc77a}
.dvp-btns{display:flex;gap:8px} .dvp-btns .dvp-btn{flex:1;justify-content:center;height:32px}
.dvp-btn{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:7px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#eee;font:600 12px/1 Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.dvp-btn:hover:not(:disabled){background:rgba(255,255,255,.1)} .dvp-btn:disabled{opacity:.4;cursor:default}
.dvp-btn.primary{background:#FF8C00;border-color:#FF8C00;color:#111} .dvp-btn.primary:hover:not(:disabled){filter:brightness(1.08);background:#FF8C00}
.dvp-btn.danger{color:#ff9a9a} .dvp-btn.sm{height:24px;padding:0 9px;font-size:11px}
.dvp-inter{font-size:11px;color:rgba(255,255,255,.45);display:flex;align-items:center;gap:6px}
.dvp-inter button{height:22px;padding:0 8px;border-radius:5px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#ccc;font:500 11px/1 Inter,system-ui,sans-serif;cursor:pointer}
.dvp-empty{color:rgba(255,255,255,.5);line-height:1.6;padding:8px 2px}
.dvp-job{display:grid;grid-template-columns:22px minmax(0,1fr) auto auto;gap:10px;align-items:start;padding:9px 10px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
.dvp-job.rendering,.dvp-job.encoding{border-color:rgba(255,140,0,.4);background:rgba(255,140,0,.05)}
.dvp-job.done{border-color:rgba(60,190,120,.3)} .dvp-job.error{border-color:rgba(255,90,90,.35)}
.dvp-n{font:600 11px/22px Inter,system-ui,sans-serif;color:rgba(255,255,255,.4);text-align:center}
.dvp-jmain{min-width:0;display:flex;flex-direction:column;gap:4px}
.dvp-jt{display:flex;gap:6px;align-items:baseline;overflow:hidden;white-space:nowrap;text-overflow:ellipsis} .dvp-jt b{font:600 12.5px/1.2 Inter,system-ui,sans-serif;color:#fff} .dvp-jt span{color:rgba(255,255,255,.6)}
.dvp-js{font-size:11px;color:rgba(255,255,255,.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .dvp-js.ok{color:#8fe3b4}
.dvp-err{font-size:11px;color:#ff9a9a}
.dvp-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden} .dvp-bar div{height:100%;background:#FF8C00;transition:width .3s}
.dvp-st{font:600 10.5px/1 Inter,system-ui,sans-serif;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.07);color:#ccc;margin-top:2px}
.dvp-st.rendering,.dvp-st.encoding{background:rgba(255,140,0,.18);color:#ffcf99} .dvp-st.done{background:rgba(60,190,120,.16);color:#8fe3b4} .dvp-st.error{background:rgba(255,80,80,.16);color:#ff9a9a}
.dvp-act{display:flex;gap:4px;margin-top:1px}
.dvp-act button,.dvp-act a{height:22px;min-width:22px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#ddd;font:500 11px/1 Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none}
.dvp-act button:hover,.dvp-act a:hover{background:rgba(255,255,255,.08)}
.dvp-live{padding:8px 12px;border-top:1px solid rgba(255,255,255,.07);font-size:11.5px;color:#ffcf99}
`;
