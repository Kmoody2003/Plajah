// isfLoader — translates ISF (Interactive Shader Format) fragment shader source into
// the Shadertoy-style `mainImage()` convention that ShaderRenderer/ShaderLayer already
// run (see shaderRenderer.ts). ISF is the format VDMX/Resolume use for their shader
// libraries (vidvox/ISF spec, MIT), so a shader authored/downloaded as ISF drops into
// Pixels' existing shader pipeline with zero renderer changes — only translation.
//
// Support scope (v1, deliberately conservative over "supports everything"):
//   - single-pass ISF only (a "PASSES" key marks a multi-pass shader → unsupported)
//   - INPUTS of type float/long/bool/point2D/color/event/audioFFT/audio are handled;
//     `image` inputs (an external image source) are NOT — those shaders are marked
//     unsupported rather than silently rendering wrong, since this pipeline has no
//     per-shader image-binding slot.
//   - only the pipeline's 4 live uniform slots (iParam0..3) exist, so at most the
//     first 4 declared float/long/bool inputs (in file order) are live-tunable via
//     those sliders; every other input (including color/point2D, which need more
//     than one float slot each) is baked to its DEFAULT as a GLSL constant — the
//     shader still renders correctly, it just isn't interactively tunable for that
//     particular input.

export type ISFInputType =
  | 'float' | 'long' | 'bool' | 'point2D' | 'color' | 'event' | 'audio' | 'audioFFT' | 'image';

export interface ISFInput {
  NAME: string;
  TYPE: ISFInputType;
  LABEL?: string;
  DEFAULT?: number | number[] | boolean;
  MIN?: number;
  MAX?: number;
  VALUES?: number[];
  LABELS?: string[];
}

export interface ISFMeta {
  DESCRIPTION?: string;
  CREDIT?: string;
  CATEGORIES?: string[];
  INPUTS?: ISFInput[];
  PASSES?: unknown;
  ISFVSN?: string;
}

export interface ISFParamBinding {
  name: string;
  paramIndex: number;
  type: ISFInputType;
  label: string;
  min?: number;
  max?: number;
}

export interface ParsedISF {
  meta: ISFMeta;
  /** Drop-in `mainImage(out vec4 o, in vec2 C)`-style source, or '' if unsupported. */
  mainImageSrc: string;
  /** Which of the (at most 4) generic param slots map to which named ISF input. */
  paramBindings: ISFParamBinding[];
  supported: boolean;
  unsupportedReason?: string;
}

const MAX_LIVE_PARAMS = 4;

/** Extract the leading `/*{ ...JSON... }*\/` header via brace-depth matching (robust
 *  against nested INPUTS objects; a JSON string value containing literal `{`/`}` is
 *  the one thing that can throw this off — acceptable for hand-authored/curated files). */
function extractHeader(raw: string): { meta: ISFMeta; body: string } | null {
  const src = raw.replace(/^﻿/, '');
  const openIdx = src.indexOf('/*{');
  if (openIdx === -1 || src.slice(0, openIdx).trim().length > 0) return null;
  const jsonStart = openIdx + 2; // at the '{'
  let depth = 0, end = -1;
  for (let i = jsonStart; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  let meta: ISFMeta;
  try { meta = JSON.parse(src.slice(jsonStart, end + 1)); }
  catch { return null; }
  const closeComment = src.indexOf('*/', end);
  const body = closeComment === -1 ? src.slice(end + 1) : src.slice(closeComment + 2);
  return { meta, body };
}

function glslNumber(n: number): string {
  return Number.isFinite(n) ? (Number.isInteger(n) ? `${n}.0` : String(n)) : '0.0';
}

function defaultToGLSL(input: ISFInput): string {
  const d = input.DEFAULT;
  switch (input.TYPE) {
    case 'bool': return d ? 'true' : 'false';
    case 'event': return 'false';
    case 'long': return glslNumber(typeof d === 'number' ? d : (input.VALUES?.[0] ?? 0));
    case 'float': return glslNumber(typeof d === 'number' ? d : 0.5);
    case 'point2D': {
      const a = Array.isArray(d) ? d : [0.5, 0.5];
      return `vec2(${glslNumber(a[0] ?? 0.5)}, ${glslNumber(a[1] ?? 0.5)})`;
    }
    case 'color': {
      const a = Array.isArray(d) ? d : [1, 1, 1, 1];
      return `vec4(${glslNumber(a[0] ?? 1)}, ${glslNumber(a[1] ?? 1)}, ${glslNumber(a[2] ?? 1)}, ${glslNumber(a[3] ?? 1)})`;
    }
    default: return '0.0';
  }
}

/** Word-boundary literal replace (avoids clobbering identifiers that merely contain
 *  the token, e.g. replacing TIME inside "TIMEDELTA" — callers order TIMEDELTA first). */
function replaceWord(src: string, word: string, repl: string): string {
  return src.replace(new RegExp(`\\b${word}\\b`, 'g'), repl);
}

export function parseISF(raw: string, filenameHint?: string): ParsedISF {
  const extracted = extractHeader(raw);
  if (!extracted) {
    return { meta: {}, mainImageSrc: '', paramBindings: [], supported: false, unsupportedReason: 'No ISF JSON header found (file must start with /*{ ... }*/).' };
  }
  const { meta, body } = extracted;
  const inputs = meta.INPUTS ?? [];

  if (meta.PASSES) {
    return { meta, mainImageSrc: '', paramBindings: [], supported: false, unsupportedReason: 'Multi-pass ISF (PASSES) is not supported — this pipeline runs single-pass shaders only.' };
  }
  const imageInput = inputs.find(i => i.TYPE === 'image');
  if (imageInput) {
    return { meta, mainImageSrc: '', paramBindings: [], supported: false, unsupportedReason: `Requires an external image input ("${imageInput.NAME}") — not supported in this pipeline.` };
  }

  const defines: string[] = [
    '#define isf_FragNormCoord (gl_FragCoord.xy/iResolution.xy)',
  ];
  const paramBindings: ISFParamBinding[] = [];
  let liveSlot = 0;

  for (const input of inputs) {
    if (input.TYPE === 'audioFFT' || input.TYPE === 'audio') continue; // handled via body substitution below
    if ((input.TYPE === 'float' || input.TYPE === 'long' || input.TYPE === 'bool') && liveSlot < MAX_LIVE_PARAMS) {
      const idx = liveSlot++;
      defines.push(`#define ${input.NAME} iParam${idx}`);
      paramBindings.push({
        name: input.NAME, paramIndex: idx, type: input.TYPE,
        label: input.LABEL || input.NAME,
        min: input.TYPE === 'float' ? (input.MIN ?? 0) : undefined,
        max: input.TYPE === 'float' ? (input.MAX ?? 1) : undefined,
      });
    } else {
      defines.push(`#define ${input.NAME} ${defaultToGLSL(input)}`);
    }
  }

  let translated = body
    .replace(/^\s*#version[^\n]*\n/gm, '')
    .replace(/^\s*precision\s+\w+\s+float\s*;\s*$/gm, '')
    .replace(/^\s*varying\s+.*$/gm, '');

  // ISF audio/audioFFT inputs are sampled via IMG_NORM_PIXEL(name, vec2(x, y)) / IMG_PIXEL(name, ...)
  // against the shared audio texture already bound at iChannel0 (row 0 = FFT, row 1 =
  // waveform — see AudioTexture / shaderRenderer.ts) — approximate but visually correct
  // for the common "scan a 1D audio image" pattern ISF shaders use.
  for (const input of inputs) {
    if (input.TYPE !== 'audioFFT' && input.TYPE !== 'audio') continue;
    const name = input.NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    translated = translated
      .replace(new RegExp(`IMG_NORM_PIXEL\\s*\\(\\s*${name}\\s*,`, 'g'), 'texture(iChannel0,')
      .replace(new RegExp(`IMG_PIXEL\\s*\\(\\s*${name}\\s*,`, 'g'), 'texture(iChannel0,')
      .replace(new RegExp(`IMG_SIZE\\s*\\(\\s*${name}\\s*\\)`, 'g'), 'vec2(512.0, 2.0)');
  }

  translated = translated
    .replace(/\btexture2D\b/g, 'texture')
    .replace(/\bgl_FragColor\b/g, 'o');
  translated = replaceWord(translated, 'RENDERSIZE', 'iResolution.xy');
  translated = replaceWord(translated, 'TIMEDELTA', 'iTimeDelta');
  translated = replaceWord(translated, 'TIME', 'iTime');
  translated = replaceWord(translated, 'FRAMEINDEX', 'iFrame');
  translated = translated.replace(/\bvoid\s+main\s*\(\s*\)/, 'void mainImage(out vec4 o, in vec2 C)');

  if (!/void\s+mainImage\s*\(/.test(translated)) {
    return { meta, mainImageSrc: '', paramBindings: [], supported: false, unsupportedReason: 'No `void main()` entry point found to translate.' };
  }

  const mainImageSrc = `${defines.join('\n')}\n${translated}`;
  return { meta, mainImageSrc, paramBindings, supported: true };
}
