// Visuals — this album's own stage. Choose the album's default visualizer from the platform
// catalog, give any song its own, and upload custom shaders (Shadertoy-style `mainImage` GLSL,
// or an ISF .fs file, translated to the same form) that only this album carries. Every shader
// previews live here before it ships; the album page plays the artist's visuals first.

import React, { Suspense, useRef, useState } from 'react';
import { Upload, Trash2, Code2, Eye, AlertTriangle } from 'lucide-react';
import AmboTemplateVisualizerPicker from '../../../../scripture/AmboTemplateVisualizerPicker';
import { parseISF } from '../../../../plajahPixels/engine/core/isfLoader';
import { deskOf, deskUid, type CustomShader, type VisualsState } from '../../../../../services/melos/beats/releaseDesk';
import { Panel, Toggle, inputCls, selectCls, btnCls, type BayProps } from './ui';

const ShaderLayer = React.lazy(() => import('../../../../plajahPixels/components/ShaderLayer'));

export const CUSTOM_PREFIX = 'CUSTOM:';

const STARTER = `// Chora album shader — Shadertoy-style. iTime, iResolution, iMouse, iChannel0 and the
// audio uniforms iBass / iMid / iTreble / iLevel (0–1) are bound for you.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float r = length(uv);
  float wave = 0.5 + 0.5 * sin(10.0 * r - iTime * (2.0 + 4.0 * iBass));
  vec3 col = mix(vec3(0.42, 0.0, 0.6), vec3(0.83, 0.0, 0.33), wave);
  fragColor = vec4(col * smoothstep(0.9, 0.2, r), 1.0);
}
`;

export const VisualsBay: React.FC<BayProps> = ({ project, mutate }) => {
  const v: VisualsState = project.desk?.visuals ?? {};
  const shaders = v.customShaders ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(shaders[0]?.id ?? null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (fn: (x: VisualsState) => void) => mutate((p) => { const d = deskOf(p); if (!d.visuals) d.visuals = {}; fn(d.visuals); });
  const patchShader = (id: string, patch: Partial<CustomShader>) => set((x) => { x.customShaders = (x.customShaders ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)); });

  const addShader = (name: string, raw: string) => {
    let source = raw, format: CustomShader['format'] = 'shadertoy';
    if (/^\s*\/\*\s*\{/.test(raw)) {
      const parsed = parseISF(raw, name);
      if (!parsed.supported || !parsed.mainImageSrc) { setErr(`ISF not supported: ${parsed.unsupportedReason ?? 'unknown construct'}`); return; }
      source = parsed.mainImageSrc; format = 'isf';
    } else if (!/void\s+mainImage\s*\(/.test(raw)) {
      setErr('A shader needs `void mainImage(out vec4 fragColor, in vec2 fragCoord)`.'); return;
    }
    const id = deskUid();
    set((x) => { x.customShaders = [...(x.customShaders ?? []), { id, name: name.replace(/\.[^.]+$/, ''), format, source, createdAt: Date.now() }]; });
    setPreview(id); setErr(null);
  };

  /** Visual options for the per-song selects: inherit, the platform pick, or one of the album's shaders. */
  const valueLabel = (val?: string) => !val ? 'Album default' : val.startsWith(CUSTOM_PREFIX) ? `◆ ${shaders.find((s) => `${CUSTOM_PREFIX}${s.id}` === val)?.name ?? 'missing shader'}` : val.replace('SHADER:', '');
  const previewShader = shaders.find((s) => s.id === preview);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Album visualizer" hint="What plays behind the album on Chora. A custom shader of yours can be the default too.">
          {(v.defaultVisual ?? '').startsWith(CUSTOM_PREFIX) ? (
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-[#D0BCFF]">{valueLabel(v.defaultVisual)}</span>
              <button className="text-[10px] text-white/40 hover:text-white" onClick={() => set((x) => { x.defaultVisual = undefined; })}>Change</button>
            </div>
          ) : (
            <AmboTemplateVisualizerPicker value={v.defaultVisual ?? ''} onChange={(val: string) => set((x) => { x.defaultVisual = val || undefined; })} />
          )}
          {shaders.length > 0 && (
            <select className={`${selectCls} mt-2`} value="" onChange={(e) => { if (e.target.value) set((x) => { x.defaultVisual = e.target.value; }); }} aria-label="Use one of your shaders as the default">
              <option value="">…or use one of your shaders</option>
              {shaders.map((s) => <option key={s.id} value={`${CUSTOM_PREFIX}${s.id}`}>{s.name}</option>)}
            </select>
          )}
          <Toggle on={!!v.lockToArtist} onChange={(val) => set((x) => { x.lockToArtist = val; })} label="Lock the album to my visuals" hint="Listeners see your visuals; they can't cycle to platform presets on this album." />
        </Panel>

        <Panel title="Per song">
          <div className="space-y-1.5">
            {project.tracks.map((t, i) => {
              const cur = v.perTrack?.[t.id];
              return (
                <div key={t.id} className="grid grid-cols-[1fr_1.2fr] gap-2 items-center">
                  <span className="text-[11px] text-white/70 truncate"><span className="font-mono text-white/30 mr-1.5">{i + 1}</span>{t.title}</span>
                  <select className={selectCls} value={cur ?? ''} onChange={(e) => set((x) => { const m = { ...(x.perTrack ?? {}) }; if (e.target.value) m[t.id] = e.target.value; else delete m[t.id]; x.perTrack = m; })} aria-label={`Visual for ${t.title}`}>
                    <option value="">Album default</option>
                    {shaders.map((s) => <option key={s.id} value={`${CUSTOM_PREFIX}${s.id}`}>◆ {s.name}</option>)}
                    {cur && !cur.startsWith(CUSTOM_PREFIX) && <option value={cur}>{valueLabel(cur)}</option>}
                    {v.defaultVisual && !v.defaultVisual.startsWith(CUSTOM_PREFIX) && v.defaultVisual !== cur && <option value={v.defaultVisual}>{valueLabel(v.defaultVisual)}</option>}
                  </select>
                </div>
              );
            })}
            {!project.tracks.length && <p className="text-[11px] text-white/35">No songs yet.</p>}
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Your shaders" right={
          <div className="flex gap-1.5">
            <input ref={fileRef} type="file" accept=".glsl,.frag,.fs,.txt,.isf" multiple className="hidden" onChange={async (e) => {
              for (const f of Array.from(e.target.files ?? [])) addShader(f.name, await f.text());
              e.target.value = '';
            }} />
            <button className={btnCls} onClick={() => fileRef.current?.click()}><Upload size={11} /> Upload</button>
            <button className={btnCls} onClick={() => addShader('New shader', STARTER)}><Code2 size={11} /> New</button>
          </div>
        } hint="Shadertoy `mainImage` GLSL or ISF (.fs). ISF is translated on upload (single pass, up to 4 live inputs).">
          {err && <p className="mb-2 text-[10.5px] text-[#ff9a9a] flex items-center gap-1"><AlertTriangle size={11} /> {err}</p>}
          <div className="space-y-1.5">
            {shaders.map((s) => (
              <div key={s.id} className="rounded-[10px] border p-2" style={{ borderColor: preview === s.id ? 'rgba(0,218,243,0.5)' : 'rgba(255,255,255,0.1)' }}>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-center">
                  <input className={inputCls} value={s.name} onChange={(e) => patchShader(s.id, { name: e.target.value })} aria-label="Shader name" />
                  <button onClick={() => setPreview(s.id)} className="w-7 h-7 grid place-items-center text-white/45 hover:text-[#00DAF3]" aria-label={`Preview ${s.name}`}><Eye size={12} /></button>
                  <button onClick={() => setEditing(editing === s.id ? null : s.id)} className="w-7 h-7 grid place-items-center text-white/45 hover:text-white" aria-label={`Edit ${s.name}`}><Code2 size={12} /></button>
                  <button onClick={() => set((x) => {
                    x.customShaders = (x.customShaders ?? []).filter((k) => k.id !== s.id);
                    const ref = `${CUSTOM_PREFIX}${s.id}`;
                    if (x.defaultVisual === ref) x.defaultVisual = undefined;
                    x.perTrack = Object.fromEntries(Object.entries(x.perTrack ?? {}).filter(([, val]) => val !== ref));
                  })} className="w-7 h-7 grid place-items-center text-white/30 hover:text-[#EF4444]" aria-label={`Delete ${s.name}`}><Trash2 size={12} /></button>
                </div>
                <div className="text-[9px] font-mono text-white/30 mt-1">{s.format === 'isf' ? 'ISF → GLSL' : 'GLSL'} · {s.source.length.toLocaleString()} chars</div>
                {editing === s.id && (
                  <textarea
                    className="mt-1.5 w-full min-h-[200px] rounded-[8px] bg-black/50 border border-white/10 p-2 font-mono text-[10.5px] text-[#cfe9ff] outline-none resize-y"
                    spellCheck={false}
                    value={s.source}
                    onChange={(e) => patchShader(s.id, { source: e.target.value })}
                    aria-label={`${s.name} source`}
                  />
                )}
              </div>
            ))}
            {!shaders.length && <p className="text-[11px] text-white/35">No shaders yet — upload one or start from the template.</p>}
          </div>
        </Panel>
        {previewShader && (
          <Panel title={`Preview · ${previewShader.name}`}>
            <div className="relative w-full aspect-video rounded-[10px] overflow-hidden bg-black">
              <Suspense fallback={null}>
                <ShaderLayer key={previewShader.id} source={previewShader.source} startTimeMs={0} fpsCap={30} renderScale={0.75} onError={(m) => setErr(m ? `${previewShader.name}: ${m}` : null)} />
              </Suspense>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};
