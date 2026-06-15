// ShaderPanel — the editor UI for the custom GLSL (Shadertoy-style) layer. Paste
// a shader that defines mainImage(), Apply to run it live as the core visual.
// Ships a couple of audio-reactive examples to start from.

import React, { useState } from 'react';
import { Play, Power, Code2, AlertTriangle } from 'lucide-react';

const EXAMPLES: { name: string; src: string }[] = [
  {
    name: 'Spectrum Bars',
    src: `// Audio-reactive spectrum. iChannel0 row 0 = FFT.
void mainImage(out vec4 o, in vec2 fragCoord){
  vec2 uv = fragCoord/iResolution.xy;
  float fft = texture(iChannel0, vec2(uv.x, 0.0)).x;
  float bar = smoothstep(0.0, 0.02, fft - uv.y);
  vec3 col = bar * (0.5 + 0.5*cos(iTime + uv.x*6.0 + vec3(0.0,2.0,4.0)));
  col += iBass*0.18;
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Reactive Plasma',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 u = (C - 0.5*iResolution.xy)/iResolution.y;
  float t = iTime*0.4 + iLevel*2.0;
  float v = sin(u.x*6.0+t) + sin(u.y*6.0+t) + sin((u.x+u.y)*6.0+t);
  v += iTreble*3.0*sin(length(u)*20.0 - t*4.0);
  vec3 col = 0.5 + 0.5*cos(v + vec3(0.0,2.0,4.0) + iTime);
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Bass Tunnel',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 u = (C - 0.5*iResolution.xy)/iResolution.y;
  float a = atan(u.y,u.x), r = length(u);
  float t = iTime*0.6;
  float v = sin(8.0*a + t + iBass*10.0) * 0.5 + 0.5;
  float rings = sin(1.0/r*4.0 - t*2.0 + iMid*8.0)*0.5+0.5;
  vec3 col = mix(vec3(0.1,0.0,0.3), vec3(1.0,0.3,0.8), v*rings);
  col *= smoothstep(0.0, 0.4, r);
  o = vec4(col, 1.0);
}`,
  },
];

interface Props {
  active: boolean;
  error: string | null;
  onApply: (src: string) => void;
  onOff: () => void;
}

const ShaderPanel: React.FC<Props> = ({ active, error, onApply, onOff }) => {
  const [src, setSrc] = useState(EXAMPLES[0].src);

  return (
    <div className="w-[340px] max-w-[92vw] flex flex-col bg-black/75 backdrop-blur-2xl border border-white/10 border-t-0 rounded-b-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <Code2 className="w-3.5 h-3.5 text-cyan-300" />
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Custom GLSL · Shadertoy-style</span>
      </div>

      {/* Examples */}
      <div className="flex gap-1.5 p-2 flex-wrap border-b border-white/10">
        {EXAMPLES.map(ex => (
          <button
            key={ex.name}
            onClick={() => setSrc(ex.src)}
            className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all"
          >
            {ex.name}
          </button>
        ))}
      </div>

      <textarea
        value={src}
        onChange={e => setSrc(e.target.value)}
        spellCheck={false}
        className="w-full h-44 bg-black/40 px-3 py-2 text-[10px] font-mono text-cyan-100/90 outline-none resize-none leading-relaxed scrollbar-none"
        placeholder="void mainImage(out vec4 o, in vec2 fragCoord){ ... }"
      />

      {error && (
        <div className="flex items-start gap-1.5 px-3 py-2 bg-red-500/10 border-t border-red-500/20">
          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[8px] font-mono text-red-300 leading-snug break-words max-h-16 overflow-y-auto">{error}</p>
        </div>
      )}

      <div className="flex gap-2 p-2 border-t border-white/10">
        <button
          onClick={() => onApply(src)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600/40 hover:bg-cyan-600/60 border border-cyan-400/40 text-[10px] font-black uppercase tracking-widest text-white transition-all"
        >
          <Play className="w-3 h-3" /> Apply
        </button>
        <button
          onClick={onOff}
          disabled={!active}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 disabled:opacity-40 transition-all"
        >
          <Power className="w-3 h-3" /> Off
        </button>
      </div>
      <p className="px-3 pb-2 text-[7px] text-white/25 leading-relaxed">
        Uniforms: iResolution · iTime · iTimeDelta · iFrame · iMouse · iChannel0 (row0 FFT, row1 wave) · iBass/iMid/iTreble/iLevel
      </p>
    </div>
  );
};

export default ShaderPanel;
