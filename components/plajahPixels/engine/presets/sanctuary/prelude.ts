// Series VIII · Sanctuary Light — shared GLSL prelude and work type.
//
// Commissioned for church ministries: calm-to-tranquil, contemporary, cinematic
// backgrounds that sit behind lyrics and scripture. Convened by the Art Director
// Council (Classical Mind, Rebellious Hand, Futurist, World-Eclectic Traveller,
// Baroque Dramatist, Radical Minimalist) with the Lighting Director signing off
// every work against the house lighting rules below.
//
// LIGHTING DIRECTOR — HOUSE RULES (every work must pass)
//   1. No flashes. Nothing may change brightness faster than ~1.5 Hz over more
//      than a quarter of the frame (well under the 3 Hz photosensitivity line).
//      Audio "breathes" the picture; it never strobes it.
//   2. Projection ceiling. Peak luminance stays below ~0.9 after tone mapping,
//      and the text band (centre / lower third) is held lower still, so white
//      lyrics read at the back of the room. iParam3 = "Text-safe" deepens it.
//   3. Lifted blacks. Black level sits a hair above zero (LED walls and
//      projectors crush pure black into blotches). PRELUDE: `sanctFinish`.
//   4. One key light. Every frame has a believable motivating source — a window,
//      a flame, a horizon — and haze to carry it. No flat, sourceless glow.
//   5. Colour temperature is a control. iParam1 = "Warmth" moves white balance
//      from cool daylight (~6500K, 0) through neutral (0.5) to tungsten (~3200K, 1).
//   6. Motion has a speed limit. iParam0 = "Motion"; at 0.5 a tranquil work moves
//      about like breathing (6–10 s cycles), a calm one like a slow dolly.
//
// UNIFORMS (Shadertoy-style, supplied by shaderRenderer / ShaderLayer)
//   iTime, iResolution, iMouse, iChannel0 (512×2 audio: row0 FFT rgb + chroma a)
//   iBass, iMid, iTreble, iLevel (0..1)
//   iParam0 Motion · iParam1 Warmth · iParam2 Light (exposure) · iParam3 Text-safe
//   All four default to 0.5, which must be the intended look.

export type SanctuaryEnergy = 'tranquil' | 'calm' | 'medium';
export type CouncilDirector =
  | 'Classical Mind' | 'Rebellious Hand' | 'Futurist'
  | 'World-Eclectic Traveller' | 'Baroque Dramatist' | 'Radical Minimalist';

export interface SanctuaryWorkDef {
  id: string;
  name: string;
  /** One line for the library card. */
  line: string;
  director: CouncilDirector;
  energy: SanctuaryEnergy;
  /** Lighting Director's note: key source, temperature, haze. */
  lighting: string;
  /** Where it fits in a service. */
  use: string;
  /** GLSL after the prelude: must define mainImage(out vec4, in vec2). */
  glsl: string;
}

export const SANCTUARY_PRELUDE = `
#define FFT(X) texture(iChannel0,vec2(X,.25)).b
float note12(float pc){ return texture(iChannel0,vec2((pc+.5)/512.,.25)).a; }
float chordMaj(){ return (note12(0.)+note12(4.)+note12(7.))/3.; }
float chordMin(){ return (note12(0.)+note12(3.)+note12(7.))/3.; }
// Slow, safe "breath" from the music: never a strobe (rule 1).
float swell(){ return clamp(.45*iLevel+.35*iBass+.20*iMid,0.,1.); }
float motion(){ return mix(.25,1.75,iParam0); }

float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2  h22(vec2 p){ vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); q+=dot(q,q.yzx+33.33); return fract((q.xx+q.yz)*q.zy); }
float h31(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float n3(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm2(vec2 p){ float v=0.,a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*n2(p); p=m*p; a*=.5; } return v; }
float fbm3(vec3 p){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*n3(p); p=p*2.02+vec3(1.7,9.2,3.1); a*=.5; } return v; }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }

// Warmth: white balance from ~6500K (0) to ~3200K (1); 0.5 = neutral (rule 5).
vec3 warmth(vec3 c){ float w=iParam1-.5; return c*vec3(1.+.32*w,1.+.04*w,1.-.42*w); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }

// Final pass for every work: exposure (iParam2), warmth, tone map, text-safe band,
// projection ceiling and lifted blacks (rules 2, 3, 5), soft vignette, fine grain.
vec3 sanctFinish(vec3 col, vec2 C){
  vec2 q=C/iResolution.xy;
  col=warmth(col)*mix(.55,1.6,iParam2);
  col=aces(col);
  col=max(mix(vec3(dot(col,vec3(.299,.587,.114))),col,1.18),0.); // vibrance back after tone map
  // text band: centre + lower third, held down as Text-safe rises
  float band=exp(-pow((q.y-.42)/.24,2.))*(1.-.35*pow(abs(q.x-.5)*2.,2.));
  col*=1.-band*mix(0.,.45,iParam3);
  col*=.9;                                   // projection ceiling
  float v=q.x*q.y*(1.-q.x)*(1.-q.y); col*=mix(.72,1.,pow(clamp(v*16.,0.,1.),.35));
  col+=vec3(.012,.010,.014);                 // lifted blacks
  col+=(h21(C+fract(iTime*.37)*91.)-.5)*.012; // grain
  return pow(clamp(col,0.,1.),vec3(.95));
}
`;

/** Prelude + work body → a Shadertoy-style source. */
export const sanctuarySource = (w: Pick<SanctuaryWorkDef, 'glsl'>) => `${SANCTUARY_PRELUDE}\n${w.glsl}`;

export const SANCTUARY_PARAMS = [
  { name: 'Motion', def: 0.5 },
  { name: 'Warmth', def: 0.5 },
  { name: 'Light', def: 0.5 },
  { name: 'Text-safe', def: 0.5 },
];
