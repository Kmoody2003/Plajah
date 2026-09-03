// Browser-level GLSL validation for the Plajah material volumes and their
// Fabula transition companions. Run with: npx tsx scripts/validateMaterialShaders.ts
import { chromium } from 'playwright';
import { MATERIAL_SHADER_WORKS } from '../components/plajahPixels/engine/presets/materialShaders';
import { PHASE3_TRANSITIONS, TX_HEADER, TX_MAIN } from '../components/plajahPixels/engine/fx/phase3Transitions';

const materialHeader = `#version 300 es
precision highp float;
out vec4 _frag;
uniform vec3 iResolution;
uniform float iTime, iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
uniform float iBass, iMid, iTreble, iLevel, iParam0, iParam1, iParam2, iParam3, iSanctuary;
`;
const materialMain = `void main(){ vec4 c=vec4(0.,0.,0.,1.); mainImage(c,gl_FragCoord.xy); _frag=c; }`;
const materialVertex = `#version 300 es
layout(location=0) in vec2 p;
void main(){ gl_Position=vec4(p,0.,1.); }`;
const transitionVertex = `#version 300 es
layout(location=0) in vec2 p;
out vec2 vUv;
void main(){ vUv=p*.5+.5; gl_Position=vec4(p,0.,1.); }`;

const transitions = PHASE3_TRANSITIONS.filter(t => ['plasma-iris', 'fluid-shatter', 'tidal-fold', 'note-tunnel'].includes(t.id));
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage();
  const payload = {
    materials: MATERIAL_SHADER_WORKS.map(({ id, src }) => ({ id, src })),
    transitions: transitions.map(({ id, glsl }) => ({ id, glsl })),
    materialHeader, materialMain, materialVertex,
    transitionHeader: TX_HEADER, transitionMain: TX_MAIN, transitionVertex,
  };
  // A source-string evaluation avoids tsx's function-name helper leaking into
  // the isolated browser realm.
  const result = await page.evaluate(`(() => {
    const input = ${JSON.stringify(payload)};
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { renderer: '', errors: ['WebGL2 context unavailable'] };
    const renderer = String(gl.getParameter(gl.RENDERER));
    const errors = [];
    function makeShader(type, source) {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'compile failed');
      return s;
    }
    function compile(label, vertex, fragment) {
      try {
        const vs = makeShader(gl.VERTEX_SHADER, vertex), fs = makeShader(gl.FRAGMENT_SHADER, fragment);
        const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
        gl.deleteProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
      } catch (error) { errors.push(label + ': ' + (error && error.message ? error.message : String(error))); }
    }
    for (const item of input.materials) compile(item.id, input.materialVertex, input.materialHeader + '\\n' + item.src + '\\n' + input.materialMain);
    for (const item of input.transitions) compile(item.id, input.transitionVertex, input.transitionHeader + '\\n' + item.glsl + '\\n' + input.transitionMain);
    return { renderer, errors };
  })()`) as { renderer: string; errors: string[] };
  if (result.errors.length) throw new Error(`GLSL validation failed (${result.renderer}):\n${result.errors.join('\n')}`);
  console.log(`GLSL OK: ${MATERIAL_SHADER_WORKS.length} material shaders + ${transitions.length} transitions (${result.renderer})`);
} finally {
  await browser.close();
}
