// Series VIII Ã‚Â· Sanctuary Light Ã¢â‚¬â€ the Rebellious Hand: texture, gesture, ink,
// brush Ã¢â‚¬â€ the hand-made.
import type { SanctuaryWorkDef } from './prelude';

export const REBEL_WORKS: SanctuaryWorkDef[] = [
  {
    id: 'sanct-living-water',
    name: 'Living Water',
    line: 'Indigo ink blooms and curls through still water, its edges catching a cyan light from above.',
    director: 'Rebellious Hand',
    energy: 'calm',
    lighting: 'Key: soft overhead daylight, cool 6000K with a thin gold rim; water haze deepens to indigo below.',
    use: 'Baptism, prayer, reflection, "Living Water" / Spirit songs.',
    glsl: `
float inkField(vec2 p,float t,out vec2 r){
  vec2 q=vec2(fbm2(p+vec2(0.,t*.5)),fbm2(p+vec2(5.2,1.3)-vec2(t*.35,0.)));
  r=vec2(fbm2(p+1.7*q+vec2(1.7,9.2)+t*.2),fbm2(p+1.7*q+vec2(8.3,2.8)-t*.16));
  return fbm2(p+2.*r);
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.05*motion(), s=swell();
  // overhead key: a soft cone from the surface, fading with depth
  float key=exp(-uv.x*uv.x*1.8)*smoothstep(-.8,.6,uv.y);
  float depth=smoothstep(.6,-.6,uv.y);
  vec3 water=mix(vec3(.012,.040,.080),vec3(.006,.008,.034),depth);
  // light shafts from the surface, wavering
  float shafts=fbm2(vec2(uv.x*3.5+uv.y*.6,t*.6))*smoothstep(-.6,.55,uv.y);
  water+=vec3(.04,.12,.17)*key*(.45+.5*shafts);
  vec3 col=water;
  vec3 cyan=vec3(.22,.82,1.05);
  float calm=1.-.4*exp(-pow((uv.y+.08)/.26,2.));
  // two veils of ink: a far, soft one and a near, defined one
  for(int L=0;L<2;L++){
    float fl=float(L);
    float sc=mix(.75,1.15,fl);
    vec2 p=uv*sc+vec2(fl*3.1,t*(.25+.15*fl)+fl*1.7);
    vec2 r; float d=inkField(p,t*(1.+.3*fl),r);
    float lo=mix(.50,.55,fl), hi=mix(.74,.70,fl);
    float body=smoothstep(lo,hi,d);
    // wisps inside the bloom: finer warped detail
    float wisp=fbm2(p*3.2+r*3.);
    float dens=body*(.55+.6*wisp);
    vec3 ink=mix(vec3(.02,.13,.19),vec3(.05,.035,.16),smoothstep(.62,.85,d));
    ink*=.55+1.1*key;
    // luminous fronts where the bloom meets clear water
    float front=body*(1.-body)*4.;
    front=pow(front,2.)*(.6+.8*wisp);
    float a=mix(.55,.92,fl);
    col=mix(col,ink,clamp(dens,0.,1.)*a);
    vec3 rimC=mix(cyan,vec3(1.,.74,.36),smoothstep(.6,1.,key)*.45*fl); // gold where the sun is strongest
    col+=rimC*front*(.25+.9*key)*mix(.35,1.,fl)*(.85+.3*s)*calm;
  }
  // drifting suspended particles in the light cone
  vec2 g=uv*30.+vec2(t*2.,-t*4.);
  vec2 id=floor(g), f=fract(g)-.5; vec2 rr=h22(id)-.5;
  float mote=smoothstep(.08,.0,length(f-rr*.7))*step(.86,h21(id+7.3));
  col+=vec3(.6,.9,1.)*mote*key*.6;
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-ember-psalm',
    name: 'Ember Psalm',
    line: 'Embers and sparks rise through dark smoke above a bed of coals, the heat painted in brush strokes.',
    director: 'Rebellious Hand',
    energy: 'medium',
    lighting: 'Key: coal bed below frame, 2200K amber-crimson; smoke haze lit from beneath, falling to near-black above.',
    use: 'Worship sets, "Refiner\'s Fire", testimony, evening services.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.12*motion(), s=swell();
  float y01=C.y/iResolution.y;
  vec3 amber=vec3(1.,.46,.12), crimson=vec3(.72,.09,.04), gold=vec3(1.,.74,.32);
  // coal-bed glow from below, breathing slowly across the width
  float bed=exp(-y01*3.)*(.75+.35*fbm2(vec2(uv.x*1.5,t*.3)));
  vec3 col=vec3(.014,.008,.010)+mix(crimson,amber,exp(-y01*7.))*bed*.5;
  // rising smoke: soft billows lit from beneath
  vec2 sp=uv*1.1+vec2(0.,-t*.7);
  vec2 w=vec2(fbm2(sp*.8+vec2(0.,t*.2)),fbm2(sp*.8+vec2(4.1,2.7)));
  float smoke=smoothstep(.32,.9,fbm3(vec3(sp+.9*w,t*.18)));
  float under=smoothstep(.2,.9,fbm3(vec3(sp+.9*w+vec2(0.,-.05),t*.18)))-smoke; // lit underside
  col+=mix(vec3(.045,.024,.020),amber*.30,exp(-y01*1.6))*smoke*(.45+.7*bed);
  col+=amber*max(under,0.)*bed*.8;
  // painterly heat shimmer: broad flow-aligned strokes with bristle texture
  float a=(fbm2(uv*1.1+vec2(0.,-t*.4))-.5)*2.2;
  vec2 rp=rot(a)*uv;
  float stroke=smoothstep(.5,.8,n2(vec2(rp.x*9.,rp.y*1.4-t*1.2)));
  stroke*=.7+.3*n2(vec2(rp.x*70.,rp.y*5.));
  float heat=smoothstep(.62,.0,y01);
  col+=mix(crimson,amber,stroke)*stroke*heat*.38*(.85+.3*s);
  // embers: far sparks, mid sparks, near out-of-focus bokeh
  float calm=1.-.45*exp(-pow((y01-.42)/.22,2.))*(1.-.5*abs(uv.x));
  for(int i=0;i<3;i++){
    float fi=float(i), sc=mix(16.,4.5,fi*.5);
    vec2 g=uv*sc; g.x+=sin(g.y*.5+t*1.4+fi*2.)*.45;
    g.y-=t*sc*mix(.30,.55,fi*.5);
    vec2 id=floor(g), f=fract(g)-.5;
    float rnd=h21(id+fi*17.);
    if(rnd<mix(.6,.82,fi*.5)) continue;
    vec2 pos=(h22(id+fi*3.1)-.5)*.5;
    vec2 dd=(f-pos)*vec2(1.,mix(.5,1.,fi*.5));     // sparks streak, bokeh stays round
    float r=length(dd);
    float life=smoothstep(1.,.0,y01)*(.35+.65*h11(rnd*91.));
    float flick=.8+.2*sin(iTime*1.1+rnd*40.);      // slow, local
    vec3 ec=mix(crimson,gold,h11(rnd*13.));
    if(i<2){
      float core=smoothstep(.07,0.,r), halo=exp(-r*r*40.);
      col+=ec*(core*1.5+halo*.3)*life*flick*calm*(.7+.3*fi);
    } else {
      float disc=smoothstep(.30,.26,r)*(.55+.45*smoothstep(.12,.29,r)); // bright rim like a lens
      col+=ec*disc*.22*life*flick*calm;
    }
  }
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-charcoal-grace',
    name: 'Charcoal Grace',
    line: 'Smoky charcoal gestures drift across toned paper while a single warm light glows through from behind.',
    director: 'Rebellious Hand',
    energy: 'tranquil',
    lighting: 'Key: one warm 3000K lamp behind the paper, upper right, glowing through the fibres; ambient neutral grey, no haze beyond the smudge.',
    use: 'Prayer, confession, lament, scripture reading, quiet reflection.',
    glsl: `
// One charcoal gesture: returns (mark, smudge halo).
vec2 gesture(vec2 uv,float yc,float amp,float fr,float ph,float wd,float x0,float x1,float seed){
  float y=yc+amp*sin(uv.x*fr+ph)+amp*.35*sin(uv.x*fr*2.1+ph*1.6+seed);
  float slope=amp*fr*cos(uv.x*fr+ph);
  float across=(uv.y-y)/sqrt(1.+slope*slope);
  float u=clamp((uv.x-x0)/(x1-x0),0.,1.);
  float taper=smoothstep(0.,.18,u)*smoothstep(1.,.6,u)*(.75+.25*sin(u*4.+seed));
  float w=wd*taper+1e-4;
  float k=across/w;
  // bristle streaks run along the stroke; pressure lifts toward the tail
  float streak=n2(vec2(uv.x*1.4+seed,k*5.))*.65+n2(vec2(uv.x*5.+seed,k*13.))*.35;
  float dry=smoothstep(.12+.5*u*u,.42+.4*u*u,streak);
  float edge=smoothstep(1.,.55,abs(k)+.25*(n2(vec2(uv.x*14.,seed))-.5));
  float mark=edge*dry*step(.001,taper);
  float halo=exp(-k*k*.12)*taper;
  return vec2(mark,halo);
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.04*motion(), s=swell();
  // toned paper: warm grey with long fibres and fine tooth
  float fibre=fbm2(uv*vec2(4.,14.)+3.)*.55+n2(C*.3)*.45;
  float tooth=n2(C*.85);
  vec3 paper=vec3(.085,.075,.066)*(.85+.3*fibre);
  // single warm lamp behind the paper, upper right; it glows through the fibres
  vec2 lp=vec2(.52+.03*sin(t*1.3),.24+.02*cos(t));
  float ld=length((uv-lp)*vec2(1.,1.15));
  float glow=exp(-ld*ld*7.)*(.9+.15*s);
  float corona=exp(-ld*2.6);
  vec3 lamp=vec3(1.,.60,.28);
  vec3 col=paper+lamp*glow*(.45+.65*fibre)*.85+lamp*corona*.10;
  // charcoal gestures, breathing slowly â€” kept above and below the text band
  vec2 g1=gesture(uv,.30+.015*sin(t),.08,2.,1.+t*.5,.085,-.98,.62,1.);
  vec2 g2=gesture(uv,-.38,.05,2.6,4.-t*.4,.06,-.35,1.0,5.);
  vec2 g3=gesture(uv,.40,.06,2.4,2.5+t*.35,.035,-.70,.25,9.);
  vec2 g4=gesture(rot(.35)*uv,-.30,.04,3.,t*.6,.03,-1.0,-.25,13.);
  float ink=max(max(g1.x,g2.x),max(g3.x*.8,g4.x*.7));
  float halo=max(max(g1.y,g2.y),max(g3.y,g4.y));
  // charcoal skips the paper tooth
  ink*=.7+.3*smoothstep(.25,.75,tooth);
  // smoky smudge dragged off the strokes and drifting
  vec2 sp=uv*1.8+vec2(t*.5,t*.15);
  float smoke=fbm2(sp+1.4*vec2(fbm2(sp+t*.3),fbm2(sp+4.)));
  float smudge=smoothstep(.35,.8,smoke)*halo*.9+smoothstep(.55,.85,smoke)*.12;
  vec3 charcoal=vec3(.016,.015,.016);
  col=mix(col,charcoal*1.5,clamp(smudge*.6,0.,1.));
  col=mix(col,charcoal,clamp(ink*.92,0.,1.));
  // where charcoal crosses the light, graphite sheen catches it
  col+=lamp*glow*ink*.06*smoothstep(.4,.9,tooth);
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-pentecost-flame',
    name: 'Pentecost Flame',
    line: 'Soft tongues of flame lick upward, crimson to gold, as sparks rise into a warm sanctuary haze.',
    director: 'Rebellious Hand',
    energy: 'medium',
    lighting: 'Key: the flames themselves, 1900K at the tips to 2600K gold cores; warm haze glows above, frame centre held low.',
    use: 'Pentecost, celebration, Spirit songs, commissioning, confirmation.',
    glsl: `
// Soft tongues of flame along the foot of the frame: returns (intensity, halo).
vec2 tongues(vec2 uv,float t,float seed,float sp){
  float I=0., H=0.;
  float n=fbm2(vec2(uv.x*3.2+seed,uv.y*2.6-t*2.4));
  float nf=fbm2(vec2(uv.x*7.+seed*2.,uv.y*5.-t*3.6));
  for(int i=0;i<7;i++){
    float fi=float(i);
    float x0=(fi-3.)*sp+(h11(fi+seed)-.5)*.08;
    float edgeLift=smoothstep(.1,.85,abs(x0));            // taller toward the edges, low through the centre
    float h=mix(.24,.60,edgeLift)*(.8+.4*h11(fi*7.+seed))*(.92+.08*sin(t*2.+fi*1.7));
    float v=(uv.y+.58)/h;
    if(v<-.2||v>1.4) continue;
    float vv=clamp(v,0.,1.);
    float sway=(n-.5)*.38*vv+sin(vv*3.-t*2.6+fi*1.3)*.04*vv+(nf-.5)*.08*vv;
    float dx=uv.x-x0-sway;
    float w=.13*pow(1.-vv,.75)*smoothstep(-.2,.15,v)*sp/.3+1e-4;
    float shape=smoothstep(w,w*.15,abs(dx));
    shape*=smoothstep(1.05,.55,v+(nf-.5)*.35);            // tips dissolve into the air
    float inner=smoothstep(w*.7,0.,abs(dx));
    I=max(I,shape*(.55+.45*inner)*(1.-.55*vv));
    H+=exp(-dx*dx/(w*w*6.+.002))*smoothstep(1.4,.2,v)*.35;
  }
  return vec2(I,H);
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.18*motion(), s=swell();
  float y01=C.y/iResolution.y;
  vec3 crimson=vec3(.70,.06,.04), orange=vec3(1.,.36,.06), gold=vec3(1.,.66,.24);
  vec3 col=mix(vec3(.030,.010,.010),vec3(.010,.006,.012),y01);
  // warm haze carried above the flames
  col+=orange*.13*exp(-y01*2.4)*(.85+.25*s);
  // back rank (dim, crimson) then front rank (bright, gold cores)
  vec2 B=tongues(uv*1.08+vec2(.15,.03),t*.85,11.,.30);
  col+=mix(crimson*.5,orange*.55,B.x)*smoothstep(0.,.4,B.x)*.6+crimson*B.y*.12;
  vec2 F=tongues(uv,t,3.,.30);
  float I=F.x;
  vec3 fc=mix(crimson,orange,smoothstep(.15,.5,I)); fc=mix(fc,gold,smoothstep(.55,.9,I));
  col=mix(col,fc*(.9+.5*I)*(.92+.15*s),smoothstep(.02,.25,I));
  col+=orange*F.y*.10;                                    // soft halo round the tongues
  // rising sparks
  float calm=1.-.5*exp(-pow((y01-.42)/.22,2.))*(1.-.6*abs(uv.x));
  for(int i=0;i<2;i++){
    float fi=float(i), sc=9.+fi*7.;
    vec2 g=uv*sc; g.x+=sin(g.y*.4+t*2.+fi*3.)*.5;
    g.y-=t*sc*(.5-fi*.12);
    vec2 id=floor(g), f=fract(g)-.5;
    float rnd=h21(id+fi*29.);
    if(rnd<.62) continue;
    vec2 pos=(h22(id+fi*7.)-.5)*.6;
    float r=length((f-pos)*vec2(1.,.6));
    float life=smoothstep(.9,.05,y01);
    float tw=.8+.2*sin(iTime*1.2+rnd*50.);
    col+=mix(orange,gold,rnd)*(smoothstep(.06,0.,r)*1.5+exp(-r*r*60.)*.3)*life*tw*calm*(1.-fi*.3);
  }
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
];
