// Series VIII · Sanctuary Light — the World-Eclectic Traveller: sacred
// landscapes and textiles from around the world.
import type { SanctuaryWorkDef } from './prelude';

export const WORLD_WORKS: SanctuaryWorkDef[] = [
  {
    id: 'sanct-desert-night',
    name: 'Desert Night',
    line: 'Judean dunes lie in silhouette beneath a slowly turning Milky Way; moonlight silvers the crests.',
    director: 'World-Eclectic Traveller',
    energy: 'tranquil',
    lighting: 'Key: low moon upper-left, cool 7500K rim on dune crests; fill: faint 2800K afterglow on the far horizon; thin blue ground haze between dune rows.',
    use: 'Evening prayer, Advent and Christmas, silent reflection, Psalms of the night watch.',
    glsl: `
float duneH(float x, float fi){
  float sd=fi*17.3+2., f=1.5+fi*.45;
  float n=n2(vec2(x*f+sd,sd));
  float r=1.-abs(2.*n-1.);                         // ridged: knife-edge crests, soft troughs
  float n2b=n2(vec2(x*f*2.1+sd*1.3,sd+5.));
  float r2=1.-abs(2.*n2b-1.);
  float broad=n2(vec2(x*f*.33+sd*2.,3.+sd));
  return .055*pow(r,1.7)+.018*pow(r2,2.)+.07*broad;
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float px=1.5/iResolution.y;
  float t=iTime*.05*motion(), s=swell();
  float hz=-.10;
  // ---- sky: deep indigo zenith to dusty blue-teal at the horizon
  vec3 col=mix(vec3(.045,.075,.135),vec3(.008,.013,.045),pow(smoothstep(hz,.55,uv.y),.7));
  // ---- sky coordinates turn slowly about a celestial pole below the frame
  vec2 pole=vec2(-.25,-1.7);
  vec2 sp=rot(.06*t)*(uv-pole);
  vec2 nB=normalize(vec2(-.62,1.)), P=vec2(.05,.14)-pole;
  float d=dot(sp-P,nB), al=dot(sp,vec2(nB.y,-nB.x));
  d+=.025*sin(al*2.3+1.);
  float core=exp(-d*d/.010), body=exp(-d*d/.045);
  float cl=fbm2(vec2(d*6.,al*2.6)+3.1);
  float cl2=fbm2(vec2(d*16.,al*9.)+7.7);
  float lane=exp(-pow(d+.012-.05*(fbm2(vec2(al*3.,1.))-.5),2.)/.0010)*smoothstep(.3,.65,cl2);
  float mw=(body*.45+core*.9)*(.3+1.2*cl*cl2*1.6)*(1.-.8*lane);
  mw*=smoothstep(hz-.02,hz+.30,uv.y);
  vec3 mwCol=mix(vec3(.30,.42,.85),vec3(1.,.86,.68),smoothstep(.2,.9,core*cl*1.4));
  col+=mwCol*mw*.38*(1.+.12*s);
  // ---- stars: three layers, denser inside the band, gentle slow twinkle
  float st=0.;
  for(int k=0;k<3;k++){
    float fk=float(k), sc=40.+fk*38.;
    vec2 g=sp*sc+fk*11.7; vec2 id=floor(g), f=fract(g)-.5;
    float h=h21(id+fk*3.3);
    float thr=.91-.16*body;
    if(h>thr){
      vec2 off=(h22(id*1.7+fk)-.5)*.7;
      float r=length(f-off);
      float b=pow(h21(id+9.1),3.)*(1.3-fk*.35)+.08;
      float tw=.88+.12*sin(iTime*(.6+h*.9)+h*40.);   // subtle, slow
      st+=b*tw*(smoothstep(.10+.04*b,.0,r)+.15*exp(-r*12.));
    }
  }
  st*=smoothstep(hz-.01,hz+.15,uv.y);
  col+=vec3(.85,.9,1.)*st;
  // ---- moon upper-left with wide soft halo
  vec2 mp=vec2(-.64,.31); float dm=length(uv-mp);
  vec3 moonC=vec3(.72,.84,1.);
  float disc=smoothstep(.024,.020,dm);
  float mot=.85+.15*fbm2((uv-mp)*60.);
  col=mix(col,vec3(1.,.98,.92)*mot*1.2,disc);
  col+=moonC*(.14*exp(-dm*10.)+.07*exp(-dm*2.8));
  // ---- warm afterglow low on the far horizon, off to the right
  float hg=exp(-max(uv.y-hz,0.)*7.)*exp(-pow((uv.x-.5)/.6,2.));
  col+=vec3(.75,.32,.10)*hg*.42;
  col+=vec3(.10,.14,.22)*exp(-abs(uv.y-hz)*12.)*.6; // horizon haze
  // ---- dunes: four rows, far (hazy, lit by afterglow) to near (deep indigo)
  for(int i=0;i<4;i++){
    float fi=float(i);
    float base=hz+.012-fi*.095;
    float sc=1.+fi*.45;
    float x=uv.x/sc+fi*.37+t*.05*(fi+1.)*.3;          // gentle parallax drift
    float h=base+duneH(x,fi)*sc;
    float slope=(duneH(x+.012,fi)-duneH(x-.012,fi))/.024;
    float m=smoothstep(h+px,h-px,uv.y);
    float depth=fi/3.;
    float below=max(h-uv.y,0.);
    float lit=smoothstep(.05,-.45,slope);              // faces turned toward the moon
    vec3 shade=mix(vec3(.035,.045,.085),vec3(.008,.010,.024),depth);
    vec3 litc=mix(vec3(.11,.13,.21),vec3(.055,.068,.12),depth);
    vec3 sand=mix(shade,litc,lit*exp(-below*(3.+fi*2.)));
    float rim=exp(-below/(.003+.0015*fi))*smoothstep(.2,-.3,slope);
    sand+=moonC*rim*(.42-.06*fi);
    sand+=vec3(.6,.26,.08)*hg*.18*(1.-depth);       // afterglow on far rows
    // ground haze pooled behind this row
    float haze=exp(-max(uv.y-base,0.)*16.)*(1.-m)*.07*(1.-depth*.4);
    col+=vec3(.22,.30,.46)*haze;
    col=mix(col,sand,m);
  }
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-galilee',
    name: 'Galilee',
    line: 'A still lake at dusk: violet sky melting to apricot, layered hills, and the sun laying a shimmering path across the water.',
    director: 'World-Eclectic Traveller',
    energy: 'tranquil',
    lighting: 'Key: setting sun just above the far ridge, 3000K; aerial perspective lifts each hill row toward rose-lilac; lake mirrors the sky with a soft glitter path.',
    use: 'Pre-service, communion, scripture reading (the Gospels by the lake), benediction.',
    glsl: `
float galRidge(float x, float fi){
  float f=1.2+fi*.9;
  return fbm2(vec2(x*f+fi*13.1,fi*7.3));
}
vec3 galSky(vec2 p, vec2 sp, float t, float hz){
  float y=p.y-hz;
  vec3 col=mix(vec3(1.25,.66,.28),vec3(1.05,.50,.40),smoothstep(0.,.12,y));
  col=mix(col,vec3(.62,.34,.60),smoothstep(.07,.28,y));
  col=mix(col,vec3(.30,.20,.52),smoothstep(.22,.45,y));
  col=mix(col,vec3(.10,.08,.26),smoothstep(.40,.70,y));
  float ds=length((p-sp)*vec2(1.,1.2));
  vec3 sunC=vec3(1.,.66,.34);
  col+=sunC*(.55*exp(-ds*11.)+.40*exp(-ds*3.2))*smoothstep(-.02,.05,y+.02);
  col=mix(col,vec3(1.35,1.05,.72),smoothstep(.027,.022,ds));
  // thin high streaks of cloud, lit from beneath near the sun
  float c=fbm2(vec2(p.x*1.1+t*.03,p.y*11.+2.));
  c=smoothstep(.50,.78,c)*smoothstep(.07,.17,y)*smoothstep(.50,.24,y);
  col=mix(col,mix(vec3(.46,.26,.48),vec3(1.2,.62,.42),exp(-ds*2.4)),c*.6);
  return col;
}
vec3 galScene(vec2 p, vec2 sp, float t, float hz, float px){
  vec3 col=galSky(p,sp,t,hz);
  float ds=length(p-sp);
  vec3 sunC=vec3(1.,.62,.34);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float x=p.x+fi*.9;
    float hgt;
    if(i==0)      hgt=.022+.05*galRidge(x,0.)+.012*n2(vec2(x*14.,2.));
    else if(i==1) hgt=.006+.05*galRidge(x,1.)+.10*smoothstep(-.05,-.85,p.x)+.015*n2(vec2(x*10.,5.));
    else          hgt=-.01+.06*galRidge(x,2.)+.22*smoothstep(.45,1.05,p.x)+.06*smoothstep(-.6,-1.0,p.x)+.01*n2(vec2(x*9.,8.));
    float h=hz+hgt;
    vec3 mc=i==0?vec3(.80,.48,.52):(i==1?vec3(.38,.22,.38):vec3(.11,.065,.15));
    mc+=sunC*exp(-ds*3.)*(.30-fi*.12);              // sun-side glow in the haze
    mc+=sunC*exp(-max(h-p.y,0.)*90.)*exp(-ds*3.5)*(.45-fi*.15); // crest catch-light
    mc=mix(mc,mc*.82,smoothstep(0.,.06,h-p.y));      // slopes darken below the crest
    col=mix(col,mc,smoothstep(h+px,h-px,p.y));
  }
  return col;
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float px=1.5/iResolution.y;
  float t=iTime*.12*motion(), s=swell();
  float hz=-.06;
  vec2 sp=vec2(.24,hz+.066-.003*sin(t*.3));
  vec3 sunC=vec3(1.,.68,.38);
  vec3 col;
  if(uv.y>=hz){
    col=galScene(uv,sp,t,hz,px);
  } else {
    float d=hz-uv.y;
    float iz=1./(d+.025);
    vec2 wp=vec2(uv.x*iz*.5,iz*.9);
    float n=fbm2(wp+vec2(t*.15,t*1.1));
    float n2v=n2(wp*vec2(2.2,1.6)-vec2(0.,t*1.6));
    float amp=smoothstep(0.,.08,d);
    float ry=hz+d+(n-.5)*.05*d*amp;
    float ox=(n2v-.5)*.012*amp;
    vec3 refl=galScene(vec2(uv.x+ox,ry),sp,t,hz,px*2.)*vec3(.78,.78,.92);
    vec3 deep=vec3(.04,.04,.10);
    float fres=mix(.92,.50,smoothstep(0.,.42,d));
    col=mix(deep,refl,fres);
    // gentle horizontal ripple sheen
    col*=.92+.12*n2v;
    // sun glitter path: widens toward the viewer
    float w=.010+.20*d;
    float path=exp(-pow((uv.x+ox*2.-sp.x)/w,2.));
    vec2 gc=vec2(uv.x*iz*7.,iz*11.)+vec2(t*.3,-t*2.);
    float gl=pow(n2(gc),9.)+.5*pow(n2(gc*1.9+7.),12.);
    col+=sunC*path*(.20+gl*7.)*(1.+.2*s);
    col+=sunC*exp(-pow((uv.x-sp.x)/.05,2.))*exp(-d*30.)*.35;
  }
  // haze line where lake meets hills
  col+=vec3(1.,.66,.45)*exp(-abs(uv.y-hz)*55.)*.10;
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-kente-light',
    name: 'Kente Light',
    line: 'Woven light: gold, green and red kente strips shimmer as sunlight travels along their threads.',
    director: 'World-Eclectic Traveller',
    energy: 'medium',
    lighting: 'Key: warm 3600K window light raking from upper-left across the cloth; gold silk threads carry travelling glints; shallow focus melts the foreground into bokeh.',
    use: 'Celebration and praise sets, Black History Month, harvest, weddings, offering.',
    glsl: `
vec3 kPal(float i){
  i=mod(i,4.);
  if(i<1.) return vec3(1.,.66,.12);     // gold
  if(i<2.) return vec3(.03,.36,.15);    // green
  if(i<3.) return vec3(.70,.07,.05);    // red
  return vec3(.020,.016,.014);          // black
}
float kLine(float f,float c,float w,float b){ return smoothstep(w+b,w-b,abs(f-c)); }
vec3 kente(vec2 p, float bw, out float metal){
  float W=.30, H=.42;
  float sx=floor(p.x/W), fx=fract(p.x/W);
  float yy=p.y/H+h11(sx*3.7)*3.;
  float by=floor(yy), fy=fract(yy);
  float r=h21(vec2(sx,by)+.5);
  float bx=bw/W+.002, bY=bw/H+.002;
  float ci=floor(h11(sx*1.3)*4.);          // strip colourway
  vec3 A=kPal(ci), B=kPal(ci+1.), K=kPal(3.), G=kPal(0.);
  if(ci>2.5){ A=kPal(1.); B=kPal(2.); }
  vec3 col;
  if(r<.34){
    // warp-faced stripes
    col=A;
    col=mix(col,B,kLine(fx,.5,.14,bx));
    col=mix(col,G,kLine(fx,.5,.035,bx));
    col=mix(col,K,kLine(abs(fx-.5),.27,.018,bx));
    col=mix(col,B,kLine(abs(fx-.5),.40,.03,bx));
  } else if(r<.58){
    // weft bands
    col=K;
    for(int k=0;k<4;k++){ float c=.2+.2*float(k); col=mix(col,(k==1||k==2)?A:G,kLine(fy,c,.045,bY)); }
    col=mix(col,B,kLine(fy,.5,.018,bY));
  } else if(r<.78){
    // checker blocks
    float sc=sin(fx*3.14159*4.)*sin(fy*3.14159*3.);
    col=mix(A,K,smoothstep(-bx*8.-.02,bx*8.+.02,sc));
    col=mix(col,G,kLine(fy,.5,.02,bY));
  } else {
    // nested diamond motif
    vec2 q=vec2(fx-.5,(fy-.5)*H/W);
    float dd=abs(q.x)+abs(q.y);
    float ring=sin(dd*3.14159*7.);
    col=mix(B,G,smoothstep(-.15-bx*6.,.15+bx*6.,ring));
    col=mix(col,K,kLine(dd,.42,.02,bx));
    col=mix(col,A,smoothstep(.36+bx,.36-bx,.0)*0.+kLine(dd,.0,.06,bx));
  }
  // block dividers and strip seams
  col=mix(col,K,kLine(fy,.0,.012,bY)+kLine(fy,1.,.012,bY));
  col=mix(col,G,kLine(fy,.03,.006,bY)+kLine(fy,.97,.006,bY));
  float seam=smoothstep(.0,.03+bx,fx)*smoothstep(1.,.97-bx,fx);
  col*=.55+.45*seam;
  // woven thread texture fades out of focus
  float tex=sin(p.x*620.)*.5+.5, tex2=sin(p.y*560.)*.5+.5;
  float weave=mix(tex,tex2,step(.5,fract(floor(p.x*98.)*.5+floor(p.y*89.)*.5)));
  col*=1.-.22*weave*smoothstep(.006,.0,bw);
  col*=.92+.16*h11(sx*7.1+by*3.3);
  metal=smoothstep(.45,.1,length(col-vec3(1.,.66,.12)));
  return col;
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell();
  // cloth plane tilted away from camera (top recedes), slight roll, slow drift
  float den=1.-.55*uv.y;
  vec2 p=vec2(uv.x,uv.y*1.25)/den;
  p=rot(.32)*p;
  p.y+=t*.018; p.x+=t*.006;
  // gentle drape
  float fold=sin(p.x*2.1+p.y*.8+t*.10)+.5*sin(p.x*4.3-p.y*1.7+t*.07);
  p+=.012*vec2(fold,fold*.5);
  float focus=.20;
  float coc=.0015+.030*pow(abs(uv.y-focus),1.6)/den;
  float metal;
  vec3 cloth=kente(p,coc,metal);
  // key light raking from upper-left, plus drape shading
  vec3 key=vec3(1.,.82,.58);
  float kl=.55+.9*exp(-length(uv-vec2(-.85,.55))*1.1);
  float sh=.80+.20*fold*.5+.10;
  vec3 col=cloth*kl*sh*key*.95;
  // light travelling along the gold threads (warp direction) and a broad sheen sweep
  vec2 pr=rot(-.32)*p;
  float sweep=exp(-pow(sin((p.x*.7+p.y*.5)*1.6-t*.16),2.)*3.);
  float glint=pow(.5+.5*sin(p.y*22.-t*.9+floor(p.x/.03)*1.7),14.);
  col+=key*metal*(sweep*.55+glint*.35*(1.-smoothstep(.0,.02,coc)))*kl*(1.+.25*s);
  // foreground bokeh from out-of-focus gold
  float bok=0.;
  for(int i=0;i<10;i++){
    float fi=float(i);
    vec2 bp=vec2((h11(fi*3.1)-.5)*1.9+.03*sin(t*.07+fi),-.30-.25*h11(fi*7.7)+.02*cos(t*.05+fi*2.));
    float rr=.045+.05*h11(fi*5.3);
    float dd=length(uv-bp);
    bok+=smoothstep(rr,rr*.82,dd)*(.6+.4*smoothstep(rr*.6,rr,dd))*(.4+.6*h11(fi*9.9));
  }
  col+=vec3(1.,.72,.32)*bok*.16*(1.+.2*s);
  // warm haze in the light path, cooler shadow in the far corner
  col+=key*.05*exp(-length(uv-vec2(-.9,.6))*1.5);
  col=mix(col,col*vec3(.75,.8,.95),smoothstep(.0,1.,uv.x-uv.y)*.35);
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-lantern-sea',
    name: 'Lantern Sea',
    line: 'Warm paper lanterns rise slowly from dark water into a deep blue night, mirrored and softly out of focus.',
    director: 'World-Eclectic Traveller',
    energy: 'calm',
    lighting: 'Key: the lanterns themselves, candle-warm 2200–2700K; cool 9000K night ambient; thin haze on the water picks up a warm horizon glow.',
    use: 'Candlelight services, Christmas Eve, memorials and remembrance, prayer for the nations.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float px=1.5/iResolution.y;
  float t=iTime*motion(), s=swell();
  float hz=.0, camH=.10;
  // night sky
  vec3 col=mix(vec3(.030,.055,.120),vec3(.006,.012,.040),smoothstep(hz,.55,uv.y));
  col+=vec3(.20,.10,.05)*exp(-abs(uv.y-hz)*10.)*.35;     // warm haze from the lantern field
  // faint stars
  vec2 g=uv*60.; vec2 id=floor(g); float hs=h21(id);
  col+=vec3(.7,.8,1.)*step(.96,hs)*smoothstep(.08,.0,length(fract(g)-.5-(h22(id)-.5)*.6))*.25*smoothstep(hz+.05,.4,uv.y);
  // distant shore
  float shore=hz+.012+.02*fbm2(vec2(uv.x*3.,1.))*smoothstep(.1,.9,abs(uv.x+.2));
  bool sky=uv.y>shore;
  if(!sky && uv.y>hz) col=vec3(.012,.016,.035);
  // water
  float dw=max(hz-uv.y,0.);
  float wob=0.;
  if(uv.y<hz){
    float iz=1./(dw+.02);
    float n=n2(vec2(uv.x*iz*.8,iz*1.4)+vec2(0.,t*.25));
    wob=(n-.5)*.018*smoothstep(0.,.1,dw);
    col=mix(vec3(.010,.020,.050),vec3(.030,.050,.100),exp(-dw*6.));
    col+=vec3(.25,.13,.06)*exp(-dw*16.)*.25;
    col*=.85+.3*n;
  }
  vec3 lamp=vec3(0.), refl=vec3(0.);
  float focusIZ=1./3.;
  for(int i=0;i<44;i++){
    float fi=float(i);
    float d=mix(.9,8.,pow(h11(fi*1.73),.8));
    float sp=.035*(.7+.6*h11(fi*4.1));
    float h=mod(h11(fi*2.9)*4.+t*sp,4.)+.03;                 // height above water
    float wx=(h11(fi*9.1)-.5)*2.2*d+.08*sin(t*.07+fi);
    vec2 pos=vec2(wx/d,hz+(h-camH)/d);
    float sz=max(.075/d,2.*px);
    float coc=abs(1./d-focusIZ)*.05;
    float fade=smoothstep(.03,.35,h)*smoothstep(4.,3.4,h);
    float flick=.92+.08*sin(t*.9+fi*3.7);                    // slow candle breath
    vec3 lc=mix(vec3(1.,.42,.12),vec3(1.,.70,.32),h11(fi*6.6));
    float bright=fade*flick*(.9+.25*s);
    // lantern body: rounded box, softened by depth of field into bokeh
    vec2 q=(uv-pos)/sz;
    float soft=(coc+px)/sz;
    vec2 bq=abs(q)-vec2(.30,.42)+.12;
    float db=length(max(bq,0.))+min(max(bq.x,bq.y),0.)-.12;
    float body=smoothstep(soft+.04,-soft,db);
    float inner=mix(1.25,.65,smoothstep(-.45,.45,q.y));       // flame glows at the base
    lamp+=lc*bright*(body*inner*(1./(1.+soft*1.5))+.10*exp(-length(q)*1.6));
    // reflection: mirrored below the horizon, stretched and broken by ripples
    if(uv.y<hz){
      vec2 rp=vec2(wx/d,hz+(-h-camH)/d);
      vec2 rq=(vec2(uv.x+wob*(1.+d*.2),uv.y)-rp)/sz;
      rq.y*=.45;
      float rb=exp(-dot(rq,rq)*(2.2/(1.+soft*3.)));
      refl+=lc*bright*rb*.38*exp(-h*.5);
    }
  }
  col+=lamp*(sky||uv.y<hz?1.:.8);
  col+=refl*(.7+.6*n2(vec2(uv.x*40.,uv.y*120.)+vec2(0.,t*.4)));
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
];
