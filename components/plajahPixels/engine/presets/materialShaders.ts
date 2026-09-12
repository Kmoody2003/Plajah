// Plajah Pixels Material Volumes — production GPU shaders built from the
// approved Plasma Atlas and Glass Harmonics studies. Every source is a normal
// Shadertoy-style mainImage program, so live preview, project playback and
// deterministic export all use the same renderer.

export interface MaterialShaderWork {
  id: string;
  name: string;
  series: 'VI' | 'VII';
  setTitle: 'Living Volumes' | 'Glass Harmonics';
  line: string;
  src: string;
  params: { name: string; def: number }[];
  reacts: [string, string][];
}

const AUDIO = `
#define FFT(X) texture(iChannel0,vec2(X,.25)).r
float note12(float pc){ return texture(iChannel0,vec2((pc+.5)/512.,.25)).a; }
float triad(float root,float third,float fifth){ return (note12(root)+note12(third)+note12(fifth))/3.; }
float seventh(float root,float third,float fifth,float seventhPc){ return (note12(root)+note12(third)+note12(fifth)+note12(seventhPc))*.25; }
float hash31(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float n3(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fb3(vec3 p){ float v=0.,a=.55; for(int i=0;i<3;i++){v+=a*n3(p);p=p*2.03+7.1;a*=.48;}return v; }
mat2 rr(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
vec3 acesM(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
`;

const fluidPalettes = [
  ['vec3(.02,.20,.24)','vec3(.12,.86,.82)','vec3(.88,.62,.96)'],
  ['vec3(.02,.16,.12)','vec3(.16,.92,.55)','vec3(.56,.38,1.)'],
  ['vec3(.16,.06,.20)','vec3(.74,.64,.92)','vec3(1.,.84,.68)'],
  ['vec3(.02,.20,.26)','vec3(.08,.68,.88)','vec3(1.,.48,.74)'],
  ['vec3(.08,.05,.22)','vec3(.54,.32,.94)','vec3(.22,.88,1.)'],
  ['vec3(.01,.08,.22)','vec3(.10,.48,.96)','vec3(.88,.72,.42)'],
  ['vec3(.24,.01,.01)','vec3(1.,.20,.04)','vec3(1.,.88,.24)'],
  ['vec3(.10,.01,.18)','vec3(.78,.06,.62)','vec3(.12,.78,1.)'],
  ['vec3(.10,.04,.20)','vec3(.68,.18,1.)','vec3(.72,1.,.18)'],
  ['vec3(.01,.06,.18)','vec3(.02,.92,.84)','vec3(1.,.05,.48)'],
  ['vec3(.20,.01,.02)','vec3(1.,.12,.04)','vec3(.12,.52,1.)'],
  ['vec3(.01,.10,.22)','vec3(.02,.62,1.)','vec3(.72,.14,1.)'],
];

function fluidSource(mode: number): string {
  const [a,b,c] = fluidPalettes[mode];
  return `${AUDIO}
#define VM ${mode}
vec3 rampM(float x){vec3 a=${a},b=${b},c=${c};x=clamp(x,0.,1.);return x<.5?mix(a,b,x*2.):mix(b,c,x*2.-1.);}
float medium(vec3 p,float t,float music){
  p.xz*=rr(.15*sin(t*.31+p.y)+music*.08); p.xy*=rr(.10*sin(t*.23+p.z));
  vec3 flow=vec3(sin(p.y*1.6+t*.44),sin(p.z*1.45-t*.37),sin(p.x*1.55+t*.29)); p+=flow*(.08+.12*music);
  float f=fb3(p*(1.25+iParam1*1.4)+vec3(0,t*.08,0));
#if VM==0
  return smoothstep(.34,.82,f+.24*sin(p.y*2.2+p.x*1.3));
#elif VM==1
  return smoothstep(.50,.88,f+.30*sin(p.y*2.8+sin(p.x*2.)));
#elif VM==2
  return smoothstep(.28,.78,f)*(1.-smoothstep(.35,1.25,length(p)));
#elif VM==3
  return smoothstep(.38,.82,f+.24*cos(length(p.xz)*7.-p.y*2.));
#elif VM==4
  return smoothstep(.52,.82,f+.34*sin(p.y*7.+p.x*2.+t*.4));
#elif VM==5
  return smoothstep(.32,.74,f)*(1.-smoothstep(.55,1.45,length(p.xz)));
#elif VM==6
  return smoothstep(.38,.76,f+.38*sin(atan(p.z,p.x)*4.+length(p.xz)*6.-t));
#elif VM==7
  return smoothstep(.42,.78,f+.32*sin(atan(p.z,p.x)*3.+p.y*4.+t*.7));
#elif VM==8
  return smoothstep(.50,.84,f+.30*sin(length(p)*10.-t*1.2-music*3.));
#elif VM==9
  return smoothstep(.39,.77,f+.36*sin(atan(p.z,p.x)*5.+p.y*3.-t*.8));
#elif VM==10
  return smoothstep(.31,.71,f)*(1.-smoothstep(.25,1.45,length(p)));
#else
  return smoothstep(.46,.78,f+.42*sin(p.y*4.+p.x*2.5-t*.9));
#endif
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float root=note12(0.),minor=seventh(0.,3.,7.,10.),major=triad(0.,4.,7.); float music=clamp(.34*iLevel+.33*minor+.18*major+.15*iBass,0.,1.);
  vec2 mouse=iMouse.xy/max(iResolution.xy,vec2(1.)); if(iMouse.z<=0.)mouse=vec2(.5);
  float pace=mix(.13,.52,iParam0)*(VM<6?.65:1.35),t=iTime*pace;
  float cam=t*.19+(mouse.x-.5)*.9; vec3 ro=vec3(2.65*sin(cam),.36*sin(t*.27)+(mouse.y-.5)*.55,2.65*cos(cam));
  vec3 ta=vec3(0),fw=normalize(ta-ro),rt=normalize(cross(vec3(0,1,0),fw)),up=cross(fw,rt),rd=normalize(fw+uv.x*rt+uv.y*up);
  float z=.05+hash31(vec3(C,7.1))*.045,trans=1.;vec3 col=vec3(0);vec3 sun=normalize(vec3(-.45,.72,.5));
  for(int i=0;i<44;i++){vec3 p=ro+rd*z;float d=medium(p,t,music);float stepL=.075;float sigma=d*(.55+1.45*iParam2);float absorb=exp(-sigma*stepL);float phase=.32+1.5*pow(max(dot(rd,sun),0.),6.);vec3 tint=rampM(fb3(p*1.1)+music*.24);col+=trans*tint*sigma*phase*stepL;trans*=absorb;z+=stepL;if(z>5.4||trans<.018)break;}
  col+=rampM(.35+root*.3)*(.025/(.14+length(uv)))*(1.-trans);col=acesM(col*(1.15+iParam3*1.8));o=vec4(pow(col,vec3(.86)),1.);
}`;
}

const glassPalettes = [
  'vec3(.04,.12,.16)', 'vec3(.08,.04,.16)', 'vec3(.03,.12,.18)', 'vec3(.14,.04,.06)',
  'vec3(.55,.045,.008)', 'vec3(.16,.03,.25)', 'vec3(.03,.16,.22)', 'vec3(.08,.04,.18)',
  'vec3(.02,.18,.20)', 'vec3(.04,.12,.20)', 'vec3(.12,.03,.18)', 'vec3(.03,.09,.18)'
];

function glassSource(mode: number): string {
  return `${AUDIO}
#define GM ${mode}
float box(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float torus(vec3 p,vec2 r){return length(vec2(length(p.xz)-r.x,p.y))-r.y;}
float octa(vec3 p,float s){p=abs(p);return (p.x+p.y+p.z-s)*.57735027;}
float triPrism(vec3 p){vec3 q=abs(p);return max(q.z-.52,max(q.x*.866025+p.y*.5,-p.y)-.34);}
float shape(vec3 p,float music){
  p.xz*=rr(iTime*.12);p.xy*=rr(iTime*.075);
#if GM==0
  return triPrism(p);
#elif GM==1
  return octa(p,.88);
#elif GM==2
  return length(p/vec3(.72,.92,.32))-.72;
#elif GM==3
  vec3 cell=mod(p+1.,.48)-.24;return max(octa(cell,.23),length(p)-1.05-music*.28);
#elif GM==4
  return length(p)-.68-(.04+.10*music)*sin(p.y*6.+iTime)*sin(p.x*5.-iTime*.7);
#elif GM==5
  return box(p,vec3(.72,.84,.18))-.035;
#elif GM==6
  float a=atan(p.z,p.x);vec3 q=p;q.xz=vec2(length(p.xz)-(.7+.12*sin(a*5.+iTime)),p.y);return octa(q,.25);
#elif GM==7
  vec3 q=p;q.y=mod(q.y+.72,.32)-.16;return max(box(q,vec3(.78,.08,.52)),length(p)-1.05);
#elif GM==8
  float d=9.;for(int i=0;i<4;i++){vec3 q=p;q.x-=(-.54+float(i)*.36);q.y+=.22*sin(q.z*2.+float(i)+iTime*.3);d=min(d,length(q.xz)-.085);}return max(d,abs(p.y)-.82);
#elif GM==9
  vec3 q=mod(p+.9,.30)-.15;return max(box(q,vec3(.115))-.018,length(p)-.92-music*.18);
#elif GM==10
  return length(p)-.72+.035*sin(p.x*14.+iTime)*sin(p.y*12.-iTime*.7);
#else
  return min(torus(p,vec2(.64,.12)),length(p/vec3(.58,.78,.22))-.58);
#endif
}
vec3 env(vec3 d){float h=clamp(d.y*.5+.5,0.,1.);vec3 sky=mix(vec3(.015,.025,.06),vec3(.34,.58,.82),h);float bars=pow(max(0.,sin(atan(d.z,d.x)*6.+d.y*8.)),18.);return sky+bars*vec3(1.2,.72,.34);}
vec3 normalAt(vec3 p,float music){vec2 e=vec2(.002,-.002);return normalize(e.xyy*shape(p+e.xyy,music)+e.yyx*shape(p+e.yyx,music)+e.yxy*shape(p+e.yxy,music)+e.xxx*shape(p+e.xxx,music));}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;float cmin=seventh(0.,3.,7.,10.),cmaj=triad(0.,4.,7.),music=clamp(.4*iLevel+.3*cmin+.2*cmaj+.1*iBass,0.,1.);
  vec2 mouse=iMouse.xy/max(iResolution.xy,vec2(1.));if(iMouse.z<=0.)mouse=vec2(.5);float cam=iTime*mix(.06,.28,iParam0)+(mouse.x-.5)*1.2;
  vec3 ro=vec3(2.65*sin(cam),.28+(mouse.y-.5)*.7,2.65*cos(cam)),fw=normalize(-ro),rt=normalize(cross(vec3(0,1,0),fw)),up=cross(fw,rt),rd=normalize(fw+uv.x*rt+uv.y*up);
  float z=.02,id=-1.;for(int i=0;i<82;i++){float d=shape(ro+rd*z,music);if(abs(d)<.0015*max(1.,z)){id=1.;break;}z+=max(.008,d*.82);if(z>6.)break;}
  vec3 bg=env(rd),col=bg;if(id>0.){vec3 p=ro+rd*z,n=normalAt(p,music),v=-rd;float ndv=max(dot(n,v),0.);float ior=1.44+iParam1*.18;vec3 rR=refract(rd,n,1./(ior+.020)),rG=refract(rd,n,1./ior),rB=refract(rd,n,1./(ior-.018));vec3 refr=vec3(env(rR).r,env(rG).g,env(rB).b);vec3 refl=env(reflect(rd,n));float F=.04+(1.-.04)*pow(1.-ndv,5.);float thick=.32+.9*(1.-ndv);vec3 absorb=exp(-${glassPalettes[mode]}*thick*(1.+iParam2*5.));col=mix(refr*absorb,refl,F);float spec=pow(max(dot(reflect(normalize(vec3(-.5,.8,.4)),n),v),0.),90.);col+=spec*(1.4+note12(7.)*2.)*vec3(1.,.92,.78);
#if GM==4
  col+=vec3(1.8,.22,.015)*music*(.5+.5*fb3(p*4.));
#elif GM==5
  col=mix(col,col.brg,.28+.35*note12(3.));
#elif GM==10
  col+=.45*vec3(note12(0.),note12(4.),note12(7.))*abs(sin((p.x+p.y)*18.));
#endif
  }col=acesM(col*(.8+iParam3*1.7));o=vec4(pow(col,vec3(.86)),1.);
}`;
}

const fluidMeta = [
  ['pearl-tides','Pearl Tides','Slow bioluminescent tidal folds with advected density.'],
  ['aurora-kelp','Aurora Kelp','Silken polar currents rising through a harmonic water column.'],
  ['moonmilk','Moonmilk','Lunar cloud matter suspended in a breathing gravity well.'],
  ['glass-reef','Glass Reef','Refractive coral-scale currents inside a submerged volume.'],
  ['opal-rain','Opal Rain','Weightless chromatic rainfall pulled into soft vortices.'],
  ['celestial-lagoon','Celestial Lagoon','Star-water resonance around a quiet orbiting camera.'],
  ['solar-vortex','Solar Vortex','A coronal plasma cyclone driven by chord density.'],
  ['bass-kraken','Bass Kraken','Helical sub-bass arms inside luminous ink.'],
  ['prism-detonation','Prism Detonation','Harmonic shock shells travelling through spectral fog.'],
  ['neon-maelstrom','Neon Maelstrom','A liquid-light tornado with high-energy note steering.'],
  ['supernova-ink','Supernova Ink','A stellar combustion bloom with musical absorption.'],
  ['quantum-surf','Quantum Surf','Electric breakers folding through impossible 3D water.'],
] as const;

const glassMeta = [
  ['prism-choir','Prism Choir','Crown-glass dispersion with note-weighted spectral output.'],
  ['diamond-resonator','Diamond Resonator','Internal reflection across a rotating crystalline resonator.'],
  ['cathedral-lens','Cathedral Lens','Thick curved glass, caustic highlights and optical breathing.'],
  ['kintsugi-spectrum','Kintsugi Spectrum','A fractured volume that separates and reconstructs on harmony.'],
  ['molten-aria','Molten Aria','Hot deforming glass with emissive temperature response.'],
  ['chromatic-monolith','Chromatic Monolith','Dichroic slab interference controlled by chord colour.'],
  ['ferroglass-orbit','Ferroglass Orbit','Rigid crystal fragments orbiting a summed-note nucleus.'],
  ['crystal-tectonics','Crystal Tectonics','Stacked hard-glass plates colliding under bass pressure.'],
  ['fiberlight-garden','Fiberlight Garden','Bent glass fibres carrying light by total internal reflection.'],
  ['frozen-photon','Frozen Photon','Clear reconstructing voxels trapping environmental light.'],
  ['luminous-stress','Luminous Stress','Photoelastic strain bands inside a solid glass body.'],
  ['refractive-engine','Refractive Engine','A rotating mechanical assembly of lenses and glass rings.'],
] as const;

const params = [
  { name: 'Motion', def: .46 }, { name: 'Structure', def: .52 },
  { name: 'Density / absorption', def: .48 }, { name: 'Exposure', def: .58 },
];

export const MATERIAL_SHADER_WORKS: MaterialShaderWork[] = [
  ...fluidMeta.map((m,i): MaterialShaderWork => ({ id:m[0],name:m[1],series:'VI',setTitle:'Living Volumes',line:m[2],src:fluidSource(i),params:params.map(x=>({...x})),reacts:[['C–B chroma','summed note harmony shapes density and colour'],['BASS','pressure and volume'],['POINTER','touch bends the camera and advected field']] })),
  ...glassMeta.map((m,i): MaterialShaderWork => ({ id:m[0],name:m[1],series:'VII',setTitle:'Glass Harmonics',line:m[2],src:glassSource(i),params:params.map(x=>({...x})),reacts:[['C–B chroma','summed notes drive dispersion, stress and reconstruction'],['BASS','rigid-body impulse'],['POINTER','touch orbits the inspection camera']] })),
];

export const materialShaderSource = (id: string): string | undefined => MATERIAL_SHADER_WORKS.find(w => w.id === id)?.src;
