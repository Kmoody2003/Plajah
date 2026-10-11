// Series VIII · Sanctuary Light — the Classical Mind: order, proportion,
// light through architecture.
import type { SanctuaryWorkDef } from './prelude';

export const CLASSICAL_WORKS: SanctuaryWorkDef[] = [
  {
    id: 'sanct-clerestory',
    name: 'Clerestory',
    line: 'Morning light slants through tall arched windows into a hazy nave; dust drifts in the beams.',
    director: 'Classical Mind',
    energy: 'tranquil',
    lighting: 'Key: high side windows, warm 4300K sun; haze carries five beams; stone falls to deep umber.',
    use: 'Prayer, communion, scripture reading, pre-service.',
    glsl: `
float archMask(vec2 p, vec2 size){ // p relative to window centre; soft rounded-top lancet
  vec2 q=p/size; float body=smoothstep(.52,.44,abs(q.x))*smoothstep(-1.02,-.96,q.y)*smoothstep(.02,-.04,q.y);
  float top=smoothstep(.52,.44,length(q)); return max(body, top*step(0.,q.y));
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.07*motion(), s=swell();
  vec3 sun=vec3(1.,.70,.40)*(1.+.2*chordMaj());
  // cool stone in shadow, warmer near the floor where light bounces (teal/amber contrast)
  vec3 col=mix(vec3(.010,.016,.030),vec3(.040,.034,.040),smoothstep(-.55,.45,uv.y));
  vec2 dir=normalize(vec2(.55,-1.));
  float beams=0., glow=0.;
  for(int i=0;i<4;i++){
    float fi=float(i);
    vec2 wp=vec2(-.78+fi*.36,.40+.02*fi);           // window centres along the clerestory
    vec2 d=uv-wp;
    float along=dot(d,dir), across=dot(d,vec2(-dir.y,dir.x));
    float w=.045+.13*max(along,0.);                  // beam widens as it falls
    float b=smoothstep(w,w*.15,abs(across))*smoothstep(0.,.06,along);
    b*=exp(-along*1.15);                             // scattering falloff
    float haze=fbm2(vec2(across*5.,along*2.-t*1.4)+fi*3.7);
    beams+=b*(.45+.9*haze)*(.8+.4*h11(fi*5.1));
    glow+=.018/(.02+dot(d*vec2(1.,.8),d*vec2(1.,.8)));
    col+=sun*1.6*archMask(d,vec2(.07,.13));          // the bright opening itself
  }
  col+=sun*beams*(.55+.35*s);
  col+=sun*glow*.035*(.9+.2*s);                      // halation round the windows
  // floor: warm pools where the beams land
  float floorY=-.36; float fl=smoothstep(floorY+.02,floorY-.04,uv.y);
  col+=sun*fl*beams*.9;
  col=mix(col,col*vec3(.75,.8,.95),fl*.4);
  // dust motes catch light only inside the beams
  vec2 g=uv*24.+vec2(t*3.,-t*2.);
  vec2 id=floor(g), f=fract(g)-.5; vec2 r=h22(id)-.5;
  float mote=smoothstep(.07,.0,length(f-r*.7))*step(.8,h21(id+3.1));
  col+=vec3(1.,.85,.6)*mote*beams*1.4;
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-rose-window',
    name: 'Rose Window',
    line: 'A twelvefold rose of ruby, cobalt and gold turns imperceptibly in a dark stone wall, its light spilling into haze.',
    director: 'Classical Mind',
    energy: 'calm',
    lighting: 'Key: low sun behind the rose, 5000K through jewel glass; coloured shafts fall through light haze; masonry held to warm umber.',
    use: 'Call to worship, hymns, Advent and festival services, scripture reading.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell(), aa=1.6/iResolution.y;
  vec2 cen=vec2(0.,.17); float R=.30;
  vec2 d=uv-cen; float r=length(d);
  vec3 ruby=vec3(.95,.10,.16), cobalt=vec3(.10,.24,1.), gold=vec3(1.,.66,.18), emer=vec3(.10,.55,.42);
  // ---- stone wall: ashlar courses lit by the window's own glow
  vec2 bq=uv*vec2(4.2,8.); bq.x+=.5*mod(floor(bq.y),2.);
  vec2 bf=fract(bq), bi=floor(bq);
  float mortar=smoothstep(0.,.035,bf.x)*smoothstep(1.,.965,bf.x)*smoothstep(0.,.07,bf.y)*smoothstep(1.,.93,bf.y);
  float stoneN=.55*fbm2(uv*9.+bi)+.45*h21(bi);
  float wl=.05/(.03+max(r-R,0.)*max(r-R,0.)*6.);
  vec3 col=vec3(.060,.046,.040)*(.45+.55*stoneN)*(.45+.55*mortar)*(.35+wl);
  // splayed embrasure ring around the opening
  float emb=smoothstep(R*1.16,R*1.13,r)*smoothstep(R*.99,R*1.01,r);
  col=mix(col,vec3(.13,.09,.075)*(.6+.5*fbm2(d*30.))*(1.4-(r-R)/(R*.16)),emb);
  // ---- tracery in polar sectors (slow rotation)
  float a=atan(d.y,d.x)+t*.018;
  float sec=6.2831853/12.;
  float si=floor(a/sec), sa=mod(a,sec)-.5*sec;
  vec2 p=r*vec2(cos(sa),sin(sa));
  float tr=abs(r-R)-.010;
  tr=min(tr,abs(r-.64*R)-.0045);
  tr=min(tr,abs(r-.27*R)-.005);
  float spoke=max(r*sin(.5*sec-abs(sa))-.0038,.27*R-r);
  tr=min(tr,spoke);
  vec2 pa=vec2(p.x,abs(p.y));
  // outer pointed petal (vesica) along the radius
  float petal=max(length(pa-vec2(.82*R,-.085*R)),length(pa-vec2(.82*R,.085*R)))-.165*R;
  tr=min(tr,abs(petal)-.0035);
  // small cusped foil at the rim between petals
  float foil=length(pa-.915*R*vec2(cos(.5*sec),sin(.5*sec)))-.055*R;
  tr=min(tr,max(abs(foil)-.003,r-R));
  // inner lancet (vesica)
  float lanc=max(length(pa-vec2(.455*R,-.05*R)),length(pa-vec2(.455*R,.05*R)))-.105*R;
  tr=min(tr,abs(lanc)-.003);
  // central rosette
  float ros=length(p-vec2(.15*R,0.))-.08*R;
  tr=min(tr,abs(ros)-.0025);
  tr=min(tr,abs(r-.06*R)-.002);
  // glass colour by zone
  float par=mod(si,2.);
  vec3 g;
  if(r<.27*R){ g=ros<0.?ruby*1.1:gold*1.2; if(r<.06*R) g=vec3(1.,.85,.55)*1.5; }
  else if(r<.64*R){ g=lanc<0.?(par<.5?gold:ruby):cobalt; }
  else { g=foil<0.?gold:(petal<0.?(par<.5?ruby:emer):cobalt); }
  // leaded panes: each piece of antique glass varies in density and hue
  vec2 lp=p*30.; lp.y+=.5*floor(lp.x);
  vec2 pid=floor(lp)+si*31.;
  float came=smoothstep(.05,.0,min(abs(fract(lp.x)-.5),abs(fract(lp.y)-.5))-.45);
  float pane=h21(pid);
  g*=.72+.55*pane;
  g=mix(g,g.zxy*.4+g*.8,.18*step(.82,pane)*step(.5,g.b));   // some cobalt panes drift violet
  float mott=.70+.6*fbm2(uv*30.+si*3.1);
  vec2 sunD=vec2(cos(t*.05+.6),sin(t*.05+.6));
  float sunlit=.78+.32*dot(d/max(r,1e-4),sunD)*smoothstep(0.,R,r);
  float emit=(1.3-.5*r/R)*mott*sunlit*(.9+.25*s)*(1.-.6*came);
  float trM=smoothstep(aa,-aa,tr);
  float inside=smoothstep(R+.01+aa,R+.01-aa,r);
  vec3 glass=g*emit*1.1;
  vec3 stoneT=vec3(.040,.032,.028)+g*.05;     // tracery catches a little bleed
  vec3 win=mix(glass,stoneT,trM);
  col=mix(col,win,inside);
  // ---- bloom / halation round the rose
  vec3 bcol=mix(vec3(.70,.32,.62),vec3(1.,.68,.38),.45);
  float bloom=.10*exp(-max(r-R,0.)*10.)+.010/(.02+r*r*1.8);
  col+=bcol*bloom*(1.-inside*.5)*(.85+.3*s);
  // ---- soft coloured shafts falling into the haze below
  float down=smoothstep(-.1,-.6,d.y/max(r,1e-4));
  float ray=pow(.5+.5*cos(a*12.),5.);
  float haze=fbm2(vec2(a*6.,r*5.-t*.08));
  vec3 rc=par<.5?mix(ruby,gold,.6):cobalt;
  float spill=down*smoothstep(R,R*1.4,r)*exp(-(r-R)*3.2)*haze*haze;
  col+=(rc*.5+bcol*.5)*spill*(.05+.30*ray);
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-vellum-dawn',
    name: 'Vellum Dawn',
    line: 'Sunrise over layered, misted hills painted on vellum, with flecks of gold leaf drifting on the air.',
    director: 'Classical Mind',
    energy: 'tranquil',
    lighting: 'Key: rising sun low right, 3800K peach-gold; dense valley mist and aerial perspective; shadows lilac, never black.',
    use: 'Morning services, Easter sunrise, opening prayer, new-beginnings messages.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell(), aa=1.5/iResolution.y;
  vec2 sp=vec2(.30,.03+.012*sin(t*.07));
  float sd=length((uv-sp)*vec2(1.,1.15));
  // ---- sky: violet zenith -> rose -> peach -> gold at horizon
  float y=uv.y;
  vec3 sky=mix(vec3(.95,.52,.20),vec3(.88,.40,.36),smoothstep(-.02,.16,y));
  sky=mix(sky,vec3(.52,.28,.46),smoothstep(.12,.38,y));
  sky=mix(sky,vec3(.16,.12,.30),smoothstep(.34,.62,y));
  vec3 sunC=vec3(1.,.72,.38);
  sky+=sunC*(.70*exp(-sd*6.)+.28*exp(-sd*1.8))*(.9+.2*s);
  // painted high cloud streaks, lit from beneath
  float cl=fbm2(vec2(uv.x*1.3+t*.008,uv.y*6.5+.3*n2(uv*3.)));
  cl=smoothstep(.50,.78,cl)*smoothstep(.08,.20,y)*smoothstep(.58,.28,y);
  sky=mix(sky,mix(vec3(.92,.46,.52),vec3(1.,.78,.48),exp(-sd*2.2)),cl*.6);
  vec3 col=sky;
  col=mix(col,vec3(1.,.90,.70)*1.25,smoothstep(.050,.044,sd));     // sun disc
  // ---- layered hills, far -> near, each fading to mist at its foot
  for(int i=0;i<5;i++){
    float fi=float(i), dep=fi/4.;
    float base=.005-fi*.078;
    float x=uv.x*(1.1+fi*.35)+t*.0035*(1.+fi*1.5)+fi*7.31;
    float h=base+(.05+.03*fi)*(fbm2(vec2(x*1.25,fi*3.7))-.45)+.012*sin(x*2.1+fi);
    float m=smoothstep(h+aa,h-aa,uv.y);
    vec3 far=vec3(.90,.52,.42);
    vec3 near=vec3(.17,.06,.13);
    vec3 lc=mix(far,near,pow(dep,.75));
    lc+=sunC*.22*exp(-abs(uv.x-sp.x)*2.5)*(1.-dep);                  // sun-side lift
    lc*=1.-.25*smoothstep(h,h-.08,uv.y)*(1.-dep*.5);                  // ridge tops lighter, flanks deeper
    float mistF=smoothstep(h-.02,h-.13,uv.y)*(.5+.5*fbm2(vec2(x*2.-t*.02,uv.y*9.+fi)));
    vec3 mistC=mix(vec3(1.,.70,.52),vec3(.80,.44,.48),dep);
    lc=mix(lc,mistC,mistF*(.80-.40*dep));
    float rim=smoothstep(0.,.003,h-uv.y)*smoothstep(.010,.003,h-uv.y);
    lc+=sunC*rim*.9*exp(-abs(uv.x-sp.x)*2.5)*(1.-.5*dep);
    col=mix(col,lc,m);
  }
  // ---- vellum: soft fibres, mottled tone
  float fib=fbm2(rot(.5)*uv*vec2(55.,22.));
  col*=.95+.06*fib;
  col*=.93+.10*fbm2(uv*2.5+3.);
  // ---- drifting gold leaf (two depths)
  for(int k=0;k<2;k++){
    float fk=float(k), sc=9.+fk*8.;
    vec2 g=uv*sc+vec2(t*(.05+.03*fk),-t*(.07+.04*fk));
    vec2 id=floor(g), f=fract(g)-.5;
    float hh=h21(id+fk*17.);
    if(hh>.80){
      vec2 off=(h22(id)-.5)*.5;
      vec2 q=rot(hh*6.28+t*.15)*(f-off);
      float shape=length(q*vec2(1.,2.2))+.06*n2(q*40.+id);
      float flake=smoothstep(.12-.03*fk,.08-.03*fk,shape);
      float glint=.55+.45*sin(t*.45+hh*40.);
      vec3 leaf=mix(vec3(.85,.52,.16),vec3(1.,.88,.55),glint*smoothstep(.0,.08,q.x+.04));
      col=mix(col,leaf*(.9+.5*glint),flake*(.75+.25*fk));
    }
  }
  o=vec4(sanctFinish(col*.95,C),1.);
}`,
  },
  {
    id: 'sanct-colonnade',
    name: 'Colonnade',
    line: 'A slow dolly between luminous fluted marble columns toward a warm light at the far end.',
    director: 'Classical Mind',
    energy: 'calm',
    lighting: 'Key: warm 3500K glow at the far end of the colonnade; slow-turning side sun casts column shadows; light haze deepens with distance.',
    use: 'Processionals, walk-in, sermon series graphics, reflective worship.',
    glsl: `
float cBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float cMap(vec3 p){
  float fl=p.y+1.;
  vec3 q=p; q.x=abs(q.x)-1.35; q.z=mod(q.z,2.4)-1.2;
  float ang=atan(q.z,q.x);
  float r=.19-.006*smoothstep(.2,.9,cos(ang*20.));
  float shaft=max(length(q.xz)-r,abs(p.y-.45)-1.45);
  float base=cBox(q-vec3(0.,-.93,0.),vec3(.26,.07,.26));
  float cap=cBox(q-vec3(0.,1.93,0.),vec3(.27,.07,.27));
  float beam=max(abs(q.x)-.33,abs(p.y-2.2)-.20);
  return min(min(min(shaft,base),min(cap,beam)),fl);
}
vec3 cNorm(vec3 p){ vec2 e=vec2(.002,0.);
  return normalize(vec3(cMap(p+e.xyy)-cMap(p-e.xyy),cMap(p+e.yxy)-cMap(p-e.yxy),cMap(p+e.yyx)-cMap(p-e.yyx))); }
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell();
  vec3 ro=vec3(.0,.15,t*.28);
  vec3 rd=normalize(vec3(uv.x,uv.y+.05,1.25));
  rd.xz=rot(.04*sin(t*.05))*rd.xz;
  vec3 L=normalize(vec3(0.,.18,1.));                 // key: far end
  float sw=.9*sin(t*.035);
  vec3 Ls=normalize(vec3(.8*cos(sw),.75,.6*sin(sw))); // slow sweeping side sun
  vec3 warm=vec3(1.,.72,.46), cool=vec3(.42,.46,.62);
  float d=0.; float hit=0.;
  for(int i=0;i<110;i++){
    float h=cMap(ro+rd*d);
    if(h<.0008*d){ hit=1.; break; }
    d+=h*.9; if(d>45.) break;
  }
  vec3 bg=mix(vec3(.10,.115,.16),vec3(.30,.26,.28),smoothstep(-.3,.25,rd.y)*.5);
  bg=mix(bg,warm*1.05,pow(max(dot(rd,L),0.),4.));
  vec3 col=bg;
  if(hit>.5){
    vec3 p=ro+rd*d, n=cNorm(p);
    bool isFloor=p.y<-.995;
    vec3 alb;
    if(isFloor){
      vec2 tl=p.xz*vec2(1.,1.); vec2 ti=floor(tl), tf=fract(tl);
      float grout=smoothstep(0.,.02,tf.x)*smoothstep(1.,.98,tf.x)*smoothstep(0.,.02,tf.y)*smoothstep(1.,.98,tf.y);
      alb=mix(vec3(.55,.50,.47),vec3(.70,.66,.62),h21(ti))*(.8+.2*grout);
    } else {
      float v=abs(sin(p.y*2.2+p.x*1.3+6.*fbm3(p*1.6)));
      alb=vec3(.86,.82,.76)*(.9+.1*fbm3(p*6.));
      alb=mix(alb*.7,alb,smoothstep(0.,.12,v));
    }
    // soft shadow from the side sun
    float sh=1., st=.03;
    for(int j=0;j<28;j++){ float hh=cMap(p+n*.01+Ls*st); sh=min(sh,10.*hh/st); st+=clamp(hh,.04,.5); if(st>12.) break; }
    sh=clamp(sh,0.,1.);
    float ao=clamp(.4+.6*cMap(p+n*.25)/.25,0.,1.);
    vec3 li=warm*1.2*max(dot(n,L),0.)+vec3(1.,.86,.7)*1.15*max(dot(n,Ls),0.)*sh+cool*.32*ao*(.6+.4*n.y);
    col=alb*li;
    vec3 rf=reflect(rd,n);
    col+=warm*pow(max(dot(rf,L),0.),isFloor?12.:30.)*(isFloor?.55:.25)*ao;
    float fog=1.-exp(-d*.075);
    col=mix(col,bg,fog);
  }
  // in-scattering: luminous haze toward the far end and in the sun
  col+=warm*(.9*pow(max(dot(rd,L),0.),40.)+.12*pow(max(dot(rd,L),0.),4.))*(.9+.2*s);
  col+=vec3(1.,.85,.7)*.06*pow(max(dot(rd,Ls),0.),3.);
  float hz=fbm2(uv*3.+vec2(t*.03,0.));
  col+=warm*.03*hz;
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
];
