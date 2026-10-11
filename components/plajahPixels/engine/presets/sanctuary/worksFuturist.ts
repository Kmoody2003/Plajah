// Series VIII · Sanctuary Light — the Futurist: light engineering, contemporary
// stage design, LED, laser and volumetrics.
import type { SanctuaryWorkDef } from './prelude';

export const FUTURIST_WORKS: SanctuaryWorkDef[] = [
  {
    id: 'sanct-halo-array',
    name: 'Halo Array',
    line: 'Concentric neon halos hang tilted in the haze above a mirror-black floor, breathing with the worship.',
    director: 'Futurist',
    energy: 'calm',
    lighting: 'Key: the rings themselves, LED neon steered by the chord (cyan to violet); light haze scatters a soft core glow; black glass floor returns a blurred reflection.',
    use: 'Worship sets, pre-service loops, sermon series bumpers.',
    glsl: `
// cyan (0) → azure → violet (1) LED palette; a whisper of rose at the far end
vec3 ringPal(float h){ h=clamp(h,0.,1.);
  return mix(mix(vec3(.18,.78,1.),vec3(.32,.45,1.),smoothstep(0.,.5,h)),vec3(.78,.36,1.),smoothstep(.5,1.,h)); }
const vec3 HC=vec3(0.,.86,6.6);   // halo centre (floor at y=0)
// Light from the halo array seen along a ray; blur > 1 softens it (floor reflection).
vec3 halos(vec3 ro, vec3 rd, float t, float blur, float hue){
  vec3 acc=vec3(0.);
  for(int i=0;i<6;i++){
    float fi=float(i);
    float R=(.55+fi*.38)*(1.+.02*sin(t*1.1-fi*.7));
    float tilt=.30+.045*sin(t*.6+fi*1.3);
    float yaw=.06*sin(t*.45+fi*2.1);
    vec3 n=normalize(vec3(yaw,1.,-tilt));
    float dn=dot(rd,n); dn=abs(dn)<1e-4?1e-4:dn;
    float tt=dot(HC-ro,n)/dn;
    vec3 p=ro+rd*tt-HC;
    float sd=length(p)-R, d=abs(sd);
    float fw=fwidth(sd)*blur+1e-4;
    float rad=.0065*blur;
    float core=smoothstep(rad+fw,max(rad-fw,0.),d)*min(1.,2.*rad/fw+.1);
    float glow=exp(-d*26./blur)*.28+exp(-d*6./blur)*.06;
    float back=mix(.5,1.,smoothstep(.7,-.7,p.z/R)); // far arc sits deeper in haze
    vec3 rc=ringPal(hue+fi*.09-.25);
    acc+=rc*(core*1.6+glow)*back*step(0.,tt)*step(tt,40.)*(.8+.06*fi);
  }
  return acc;
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.18*motion(), s=swell();
  float hue=.25+.45*chordMaj()+.06*sin(t*.3);   // the chord steers cyan → violet
  vec3 ro=vec3(0.,.30,0.);
  vec3 rd=normalize(vec3(uv.x,uv.y-.04,1.45));
  vec3 key=ringPal(hue+.1);
  // deep stage background with haze lifted by the halo
  vec3 col=mix(vec3(.008,.010,.024),vec3(.014,.014,.036),smoothstep(-.1,.5,uv.y));
  float dc=length(cross(rd,HC-ro));
  float haze=.5+.9*fbm3(vec3(rd.xy*4.,t*.35));
  col+=key*(exp(-dc*dc*.45)*.20+exp(-dc*.8)*.05)*haze*(.85+.3*s);
  float br=.85+.25*s+.05*sin(t*.9);
  vec3 sky=halos(ro,rd,t,1.,hue)*br;
  // black glass floor: mirror the camera, add a faint ripple and blur
  float tf=ro.y/max(-rd.y,1e-3);
  vec3 hp=ro+rd*tf;
  vec2 rip=vec2(n2(hp.xz*vec2(2.,.8)+t*.15),n2(hp.xz*vec2(2.,.8)-t*.15+7.))-.5;
  vec3 rr=normalize(vec3(rd.x+rip.x*.004,-rd.y+rip.y*.003,rd.z));
  float fres=.08+.92*pow(1.-abs(rd.y),5.);
  vec3 refl=halos(vec3(ro.x,-ro.y,ro.z),rr,t,1.8,hue)*br;
  float dcr=length(cross(rr,HC-vec3(ro.x,-ro.y,ro.z)));
  refl+=key*exp(-dcr*dcr*.45)*.10*haze;
  float fog=exp(-tf*.05);
  vec3 floorCol=vec3(.005,.007,.014)+refl*mix(.30,.85,fres)*fog;
  float isFloor=smoothstep(.0015,-.0015,rd.y);
  col=mix(col+sky,floorCol+col*.3,isFloor);
  // thin haze line where the floor meets the dark
  col+=key*.06*exp(-abs(rd.y)*45.)*exp(-uv.x*uv.x*2.);
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-light-lattice',
    name: 'Light Lattice',
    line: 'Slim beams fan from a truss overhead and cross slowly through the haze — a modern worship stage at rest.',
    director: 'Futurist',
    energy: 'medium',
    lighting: 'Key: truss-mounted beam fixtures, cool 7000K blue and violet with warm 3800K amber on the wings; dense haze carries every beam; no chases, no strobes.',
    use: 'Up-tempo worship, offering, walk-in and walk-out.',
    glsl: `
float beamL(vec2 uv, vec2 src, float ang, float w0, float spread, float t, float seed){
  vec2 dir=vec2(sin(ang),-cos(ang));
  vec2 d=uv-src; float along=dot(d,dir), ac=dot(d,vec2(-dir.y,dir.x));
  float w=max(w0+spread*max(along,0.),1.1/iResolution.y);
  float core=exp(-pow(ac/w,2.));
  float halo=exp(-abs(ac)/(w*7.+.004));
  float hz=.35+.9*fbm2(vec2(ac*14.,along*3.-t*1.2)+seed);
  return (core+.22*halo)*hz*smoothstep(0.,.03,along)*exp(-along*.85);
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.22*motion(), s=swell();
  vec3 blue=vec3(.20,.42,1.), violet=vec3(.60,.30,1.), amber=vec3(1.,.64,.34);
  // hazy stage volume: cool, brighter near the truss and near the floor bounce
  vec3 col=mix(vec3(.008,.010,.026),vec3(.022,.020,.055),smoothstep(-.2,.45,uv.y));
  float haze=fbm2(uv*vec2(2.,3.)+vec2(t*.3,-t*.15));
  col+=vec3(.045,.045,.11)*haze*smoothstep(-.1,.45,uv.y);
  col+=vec3(.035,.03,.065)*smoothstep(-.2,-.5,uv.y)*(.6+.6*haze);
  vec3 L=vec3(0.);
  // upstage truss: further away, lower in frame, thinner, bluer, deeper in haze
  for(int i=0;i<7;i++){
    float fi=float(i);
    vec2 src=vec2(-.78+fi*.26,.30);
    float sw=.30*sin(t*.5+fi*1.7)*(mod(fi,2.)<.5?1.:-1.);
    for(int k=0;k<2;k++){
      float fk=float(k)-.5;
      L+=mix(blue,violet,.5+fk)*beamL(uv,src,sw+fk*.14,.0010,.005,t,fi*7.+fk)*.22;
    }
    vec2 d=uv-src; L+=blue*exp(-length(d)*40.)*.25;
  }
  // downstage truss: fans of slim beams + a soft wash cone, warm on the wings
  for(int i=0;i<5;i++){
    float fi=float(i);
    vec2 src=vec2(-.72+fi*.36,.425);
    float side=fi-2.;
    float sw=-side*.10+.36*sin(t*.42+fi*2.3+1.)*(mod(fi,2.)<.5?1.:-1.);
    vec3 bc=abs(side)>1.5?amber:(abs(side)>.5?violet:blue*1.1);
    for(int k=0;k<4;k++){
      float fk=float(k)-1.5;
      L+=bc*beamL(uv,src,sw+fk*.10,.0016,.009,t,fi*13.+fk*3.)*.50;
    }
    L+=bc*beamL(uv,src,sw,.02,.22,t*.6,fi*5.)*.07;   // soft wash = volume
    // fixture lens + bloom under the truss
    vec2 d=uv-src;
    L+=bc*(.00035/(dot(d,d)+.00035)*.7+exp(-length(d)*14.)*.22);
  }
  float br=.75+.3*s;
  // hold the lyric band back a touch
  float band=exp(-pow((uv.y+.08)/.26,2.));
  col+=L*br*(1.-.35*band);
  // truss silhouette across the top, rim-lit by its own fixtures
  float px=1./iResolution.y;
  float tr=smoothstep(.435-px,.435+px,uv.y)*smoothstep(.475+px,.475-px,uv.y);
  float tx=fract(uv.x*16.); float ty=(uv.y-.435)/.04;
  float brace=smoothstep(.07,.03,abs(tx-ty))+smoothstep(.07,.03,abs(1.-tx-ty));
  float chord=smoothstep(.12,.0,ty)+smoothstep(.88,1.,ty);
  float solid=clamp(brace+chord,0.,1.);
  col=mix(col,vec3(.010,.010,.018)+vec3(.05,.05,.09)*chord*smoothstep(.15,0.,ty)*br,tr*solid);
  // haze bounce on the stage deck
  col+=(blue*.04+amber*.02)*smoothstep(-.32,-.5,uv.y)*br;
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-glass-horizon',
    name: 'Glass Horizon',
    line: 'An endless black-glass floor runs to a warm horizon; a faint grid dissolves into violet fog.',
    director: 'Futurist',
    energy: 'tranquil',
    lighting: 'Key: a low warm 3400K glow resting on the horizon; cool 9000K blue-violet sky fill; thin ground fog softens the far grid.',
    use: 'Prayer, scripture reading, reflection, pre-service.',
    glsl: `
vec3 ghSky(vec3 rd, float rough, float br){
  vec3 warm=vec3(1.,.58,.32);
  float y=rd.y, x=rd.x/max(rd.z,.1);
  vec3 c=mix(vec3(.11,.06,.20),vec3(.010,.016,.060),smoothstep(0.,.40,abs(y)));
  c+=vec3(.18,.08,.24)*exp(-abs(y)*9./rough)*.5;
  // the thin warm horizon line and the low glow above it
  float hl=exp(-abs(y)*mix(140.,22.,rough-1.)/rough);
  c+=warm*hl*(.65*exp(-x*x*.25)+.12)*br;
  c+=warm*.55*exp(-x*x*2.2-y*y*55./(rough*rough))*br;
  return c;
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell();
  float br=.9+.12*s+.06*sin(t*.75);           // ~8 s breath
  vec3 ro=vec3(0.,.30,0.);
  vec3 rd=normalize(vec3(uv.x,uv.y-.07,1.35));
  vec3 col=ghSky(rd,1.,br);
  // high mist banks drifting across the sky
  col+=vec3(.05,.04,.10)*fbm2(vec2(rd.x*2.-t*.02,rd.y*9.))*smoothstep(.0,.08,rd.y)*smoothstep(.45,.1,rd.y);
  if(rd.y<0.){
    float tf=-ro.y/rd.y;
    vec3 p=ro+rd*tf;
    // glossy reflection: mirror the sky, roughen with distance + gentle ripple
    vec2 rip=vec2(n2(p.xz*vec2(1.5,.6)+t*.05),n2(p.xz*vec2(1.5,.6)-t*.04+5.))-.5;
    vec3 rr=normalize(vec3(rd.x+rip.x*.01,-rd.y,rd.z+rip.y*.01));
    float rough=1.+min(tf*.05,1.4);
    float fres=.05+.95*pow(1.-abs(rd.y),5.);
    vec3 refl=ghSky(rr,rough,br);
    // the warm key stretches into a vertical streak on the glass
    float x=rd.x/rd.z;
    refl+=vec3(1.,.58,.32)*.35*exp(-x*x*30.)*exp(rd.y*7.)*br;
    vec3 fc=vec3(.004,.006,.016)+refl*mix(.4,1.,fres);
    // faint grid fading into fog
    vec2 g=p.xz*vec2(1.6,1.6)+vec2(0.,t*.06);
    vec2 fw=fwidth(g);
    vec2 gd=.5-abs(fract(g)-.5);
    vec2 ln=1.-smoothstep(vec2(0.),fw*1.3,gd);
    float grid=max(ln.x,ln.y)*(1.-smoothstep(.08,.45,max(fw.x,fw.y)));
    float fog=exp(-tf*.09);
    fc+=mix(vec3(.18,.22,.55),vec3(.55,.32,.40),exp(-abs(x)*1.2)*exp(-tf*.03)*.6)*grid*.18*fog;
    // ground fog toward the horizon
    vec3 fogc=vec3(.10,.06,.18)+vec3(1.,.58,.32)*.12*exp(-x*x*.6);
    col=mix(fogc,fc,fog*.85+.15);
    col+=vec3(.05,.04,.10)*fbm2(vec2(p.x*.6-t*.03,tf*.15))*exp(-abs(rd.y)*18.);
  }
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-prism-veil',
    name: 'Prism Veil',
    line: 'Iridescent silk ribbons fold slowly through the dark, splitting soft light into spectra at every turn.',
    director: 'Futurist',
    energy: 'calm',
    lighting: 'Key: one soft cool-white 5600K source high left; thin-film dispersion on the silk folds; faint haze glows behind.',
    use: 'Communion, testimony, ambient worship, sermon backgrounds.',
    glsl: `
vec3 film(float x){ return .5+.5*cos(6.2832*(x+vec3(0.,.33,.67))); }
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.13*motion(), s=swell();
  float px=1./iResolution.y;
  vec2 kp=vec2(-.62,.48);
  vec3 col=vec3(.010,.010,.022)+vec3(.09,.08,.15)*exp(-length(uv-kp)*2.4)*.7;
  col+=vec3(.03,.025,.06)*fbm2(uv*2.5+vec2(t*.4,0.));
  for(int i=0;i<6;i++){
    float fi=float(i), dep=fi/5.;
    float base=(mod(fi,2.)<.5?1.:-1.)*(.40-.035*fi);
    vec2 p=rot((mod(fi,2.)<.5?.18:-.14)+.05*sin(t*.5+fi))*uv;
    float yc=base+.10*sin(p.x*1.5+t*1.1+fi*2.)+.045*sin(p.x*3.3-t*.8+fi*1.3);
    float tw=p.x*(1.7+.25*fi)+t*1.4+fi*1.9+.7*sin(p.x*.9-t*.7+fi);
    float ct=cos(tw), nf=abs(ct);
    float hw=(.030+.035*dep)*(.08+.92*nf);
    float dy=p.y-yc, v=dy/hw;
    float m=smoothstep(hw+px*1.2,hw-px*1.2,abs(dy));
    float bend=sqrt(max(1.-v*v,0.));
    // thin-film colour: shifts fast where the silk turns edge-on (dispersion on folds)
    float th=.9+.35*sin(tw*.5)+.22*v*sign(ct)+(1.-nf)*.9+.12*fi;
    vec3 ir=film(th);
    vec3 lit=normalize(vec3(kp-uv,.6));
    float spec=pow(max(0.,dot(normalize(vec3(sin(tw)*.8,v*.6,nf+.2)),normalize(lit+vec3(0.,0.,1.)))),18.);
    vec3 rc=ir*(.05+.30*bend*(.35+.65*nf)) + vec3(.95,.93,1.)*spec*.55;
    rc+=ir*smoothstep(.35,.05,nf)*.30;                 // glowing edge on the fold
    rc*=mix(.40,1.,dep)*(.85+.3*s);
    float a=m*(.45+.4*(1.-nf));
    col=mix(col,col*.55+rc,a);
  }
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
];
